import { Router, type IRouter, type Request, type Response } from "express";
import { sendWhatsAppMessage, sendWhatsAppInteractiveMessage, sendWhatsAppTemplateMessage, markMessageAsRead } from "../lib/whatsapp.js";
import { supabase } from "../lib/supabase.js";
import { runWeeklyCheckin } from "../jobs/weeklyCheckin.js";
import * as features from "../lib/shopFeatures.js";

const router: IRouter = Router();

const VERIFY_TOKEN =
  process.env["WHATSAPP_VERIFY_TOKEN"] ?? "ShopBrain_kigali_2026";

// Optional secret for the daily /jobs/auto-reminders ping. If set, the URL must
// end with ?key=<this value>.
const JOB_SECRET = process.env["JOB_SECRET"];

// Sam's own WhatsApp number (cleaned format, e.g. 250799xxxxxx) — used by the
// week-1 check-in "Yes, I have an issue" button to flag real ShopBrain users
// who need help, without waiting for Sam to notice on his own.
const SAM_PHONE_NUMBER = process.env["SAM_PHONE_NUMBER"];

// A customer can be reminded at most once per this many days (the owner can
// still override a single reminder with "Send Anyway"). REMIND ALL skips
// anyone reminded inside this window.
const REMINDER_COOLDOWN_DAYS = 7;

// A debt older than this many days shows up on the Follow-up list.
const OLD_DEBT_DAYS = 14;

// Max customers shown on the Follow-up list (the rest are summarised).
const FOLLOWUP_MAX = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

interface Session {
  step: string;
  data: Record<string, string>;
}

const sessions: Record<string, Session> = {};

// NOTE: `owners` table needs a new `contact_phone` column (text, nullable) —
// this is the number customers should use to reach the shop owner directly,
// distinct from the WhatsApp Business bot number. Add via Supabase before
// deploying:
//   alter table owners add column contact_phone text;

// NOTE: reminder consent + STOP opt-out needs this SQL run in Supabase
// BEFORE deploying this file:
//   alter table customers add column reminders_consent boolean not null default false;
//   update customers set reminders_consent = true; -- existing customers count as consented
//   create table opt_outs (phone text primary key, created_at timestamptz not null default now());
//   create table owner_notices (id bigint generated always as identity primary key, shop_id text not null, text text not null, created_at timestamptz not null default now());

// NOTE: reminder cooldown, Follow-up list and REPORT need this SQL run in
// Supabase BEFORE deploying this file:
//   alter table customers add column if not exists last_reminded_at timestamptz;
//   alter table customers add column if not exists last_reminder_status text;
//   create table if not exists payments (
//     id bigint generated always as identity primary key,
//     shop_id text not null,
//     customer_id text not null,
//     customer_name text,
//     amount integer not null,
//     created_at timestamptz not null default now()
//   );
//   create index if not exists payments_shop_created_idx on payments (shop_id, created_at);

// NOTE: Undo Last Debt, Today and Quick Amounts need NO new SQL.

// NOTE: stock, sales/profit, expenses, supplier debts, auto-reminders, promise
// dates and the credit limit need shopbrain_migration.sql run in Supabase
// BEFORE deploying this file. Their code lives in ../lib/shopFeatures.ts.

const T = {
  en: {
    welcome: "👋 Welcome to *ShopBrain*\nWhat would you like to do?",
    addDebt: "➕ Add Debt",
    findCustomer: "🔍 Find Customer",
    changeLanguage: "🌐 Change Language",
    askPhone: "➕ *Add Debt*\n\nWhat is the customer's phone number?\n\ne.g. 0788123456",
    askName: "What is the customer's name?",
    askItem: "What item did they take?",
    askAmount: "How much do they owe? (in Frw)\n\n✍️ Type an amount, or choose one below (optional)",
    invalidPhone: "❌ Invalid number. Please enter a valid phone number:",
    invalidAmount: "❌ Invalid amount. Please enter a number e.g. 5000",
    debtSaved: (name: string, phone: string, item: string, amount: number, total: number) =>
      `✅ *Debt Saved!*\n\n👤 ${name} (${phone})\n📦 Item: ${item}\n💰 Added: ${amount.toLocaleString()} Frw\n📊 Total owed: ${total.toLocaleString()} Frw`,
    noCustomer: (phone: string) => `❌ No customer found for ${phone}.`,
    noCustomerText: "❌ No customer found.",
    allPaid: (name: string) => `✅ All debts marked as paid for *${name}*.`,
    viewHistory: "📋 View History",
    sendReminder: "🔔 Send Reminder",
    markPaidBtn: "✅ Mark as Paid",
    reminderSent: (name: string) => `⏳ Reminder sent to *${name}* — waiting for delivery confirmation...`,
    reminderDelivered: (name: string, phone: string, amount: number) =>
      `✅ Customer *${name}* (${phone}) has received the reminder of *${amount.toLocaleString()} Frw* 🎉`,
    reminderRead: (name: string) => `👀 Customer *${name}* has read the reminder!`,
    reminderSentNotReceived: (name: string, phone: string) =>
      `✅ Reminder sent successfully to *${name}* (${phone}) — not received yet`,
    reminderFailed: (phone: string) => `❌ Reminder not sent — *+${phone}* is not on WhatsApp`,
    reminderFailedGeneric: (name: string, code: number) => `❌ Reminder failed for *${name}* (error code: ${code}) — please try again`,
    noDebts: (name: string) => `✅ ${name} has no outstanding debts. No reminder sent.`,
    findCustomerPrompt: "🔍 *Find Customer*\n\nEnter the customer's phone number:",
    findCustomerPromptSearch: "🔍 *Find Customer*\n\nEnter the customer's phone number or name:",
    findReminderPromptSearch: "🔔 *Send Reminder*\n\nEnter the customer's phone number or name:",
    markPaidPrompt: "✅ *Mark as Paid*\n\nEnter the customer's phone number:",
    askPartialAmount: "💰 How much is the customer paying?",
    askPartialItem: "📦 What is this payment for?",
    whatToDo: "What would you like to do?",
    existingCustomer: (name: string) => `👤 Existing customer: *${name}*\n\nWhat item did they take?`,
    noHistory: (name: string) => `📋 No transactions found for ${name}.`,
    historyHeader: (name: string) => `📋 *Debt History — ${name}*`,
    totalOwed: (total: number) => `💰 *Total owed: ${total.toLocaleString()} Frw*`,
    customerSummary: (name: string, phone: string, lastItem: string, totalOwed: number, lastVisit: string) =>
      `👤 *${name}*\n📞 ${phone}\n📦 Last item: ${lastItem}\n💰 Total owed: ${totalOwed.toLocaleString()} Frw\n📅 Last visit: ${lastVisit}`,
    noCustomers: "📋 You have no registered customers yet.",
    allCustomersHeader: (count: number) => `📋 *All Customers (${count})*\n\n`,
    allCustomersContinued: "📋 *Continued...*\n\n",
    owes: "Owes",
    registered: "Registered",
    cleared: "Cleared ✅",
    partialPaid: (name: string, paid: number, remaining: number, item: string) =>
      `✅ *Partial payment recorded!*\n\n👤 ${name}\n📦 For: ${item}\n💰 Paid: ${paid.toLocaleString()} Frw\n📊 Remaining: ${remaining.toLocaleString()} Frw`,
    fullPaid: (name: string, paid: number) =>
      `✅ *Full payment received!*\n\n👤 ${name}\n💰 Paid: ${paid.toLocaleString()} Frw\n📊 Remaining: 0 Frw`,
    noUnpaid: (name: string) => `✅ ${name} has no outstanding debts.`,
    askShopName: "👋 Welcome to *ShopBrain!*\n\nBefore we start, what is your *shop name*?\n\ne.g. Mama Janet Shop",
    shopNameSaved: (name: string) => `✅ Shop name saved as *${name}*!`,
    shopNameTooShort: "❌ Shop name is too short. Please enter your shop name:",
    selectLanguage: "🌐 Select your language:",
    languageSet: "✅ Language set to English!",
    ownerOnly: "This number is for shop owner use only.",
    somethingWrong: "Sorry, something went wrong. Please try again.",
    interactiveRetry: "❌ Something went wrong. Please try tapping the button again:",
    languageAlreadySetRegistered: "🌐 Language already selected. If you want to change it, use 'Change Language' from the menu.",
    languageAlreadySetUnregistered: "🌐 Language already selected. Please finish registration by entering your shop name first. You can change the language later.",
    reminderInvalidNumber: "❌ Invalid number.\nUsage: REMIND <phone>\ne.g. REMIND 0788123456",
    remindAllSummary: (count: number, total: number) => `✅ Reminders sent to *${count} customers*:\n\n`,
    remindAllTotal: (total: number) => `\n💰 *Total outstanding: ${total.toLocaleString()} Frw*`,
    remindAllNone: "✅ No customers with outstanding debts.",
    totalDebtHeader: "💰 *Total Outstanding Debt*",
    totalDebtCustomerCount: (count: number) => `📊 ${count} customers owe money`,
    totalDebtGrandTotal: (total: number) => `💵 *Grand total: ${total.toLocaleString()} Frw*`,
    totalDebtTopDebtors: "Top debtors:",
    totalDebtNone: "✅ No outstanding debts. All customers have paid!",
    paidHint: "💡 To mark a customer as paid, type:\nPAID 0788123456\nor for partial: PAID 0788123456 2000",
    helpTitle: "📖 *ShopBrain — What I Can Do*",
    helpBody: `Here's everything you can do:

*Using the buttons:*
➕ Add Debt — record a new customer debt
✅ Mark as Paid — enter their number, then choose Partially or Full Payment
📋 Menu — opens the full list of actions:
🔍 Find Customer — look up a customer's balance. On their card: View History, Send Reminder, Mark as Paid, ↩️ Undo Last Debt (removes their latest debt if you made a mistake), ✏️ Edit Customer, 📅 Promise Date (note when they promised to pay)
🔔 Send Reminder — remind one customer, or everyone at once
🚩 Follow-up — customers who need a call or a visit
📋 All Customers — your full customer list
💵 Record Sale — sell from stock, cash or on credit; stock goes down automatically
📦 Stock — add items, restock, see what's running low
💰 Money & Reports — Total Debt, Debt Report, Today, 💹 Profit (today / 7 / 30 days), 🧾 Add Expense
💼 I Owe Suppliers — track what you owe your suppliers and mark it paid
⚙️ Settings — 💳 MoMo & contact number, ⏰ Auto Reminders, 🚧 Credit Limit, 🌐 Language, 🔒 Security

*Typed shortcuts (optional):*
- TOTAL — see your total outstanding debt
- TODAY — what was added and collected today
- FOLLOWUP — customers who need a call or a visit
- REPORT — what's owed now and how much came back
- REMIND ALL — remind every customer who owes you
- REMIND <phone> — remind one specific customer
- @ALL — list every customer you've registered
- MOMO — set up your MTN MoMo payment details for reminders
- MENU — show the quick-action buttons again
- HELP — show this message again`,
    securityTip: `🔒 *Security Tip — Protect your data:*\n\nLock this ShopBrain chat so only you can open it.\n\n*How to do it:*\n1. Long press this chat in your WhatsApp inbox\n2. Tap the lock icon 🔒\n3. It will now require your fingerprint or Face ID to open\n\nYour customer data stays private even if someone picks up your phone.`,
    // --- MoMo setup ---
    momoIntro: "💳 *MoMo Payment Setup*\n\nThis lets your customers see exactly where to send money when they get a reminder.\n\nWhat is your MTN MoMo phone number?\n\ne.g. 0788123456",
    momoInvalidNumber: "❌ Invalid number. Please enter your MoMo phone number:",
    momoAskCode: "Do you have an MTN MoMo Merchant/Business code? (optional)\n\nType it now, or tap Skip if you don't have one.",
    momoAskReceiverName: "What name shows up on MTN when someone sends money to this number/code?\n\n⚠️ This must match exactly what MTN displays — usually your registered ID name.\n\ne.g. NIYONZIMA ALICE",
    momoReceiverTooShort: "❌ Too short. Please enter the exact name that shows on MTN:",
    momoAskNickname: "What do your customers usually call your shop? (so they recognize it even if the MTN name looks different)\n\ne.g. Chez Alice",
    momoSaved: (number: string, name: string) =>
      `✅ *MoMo details saved!*\n\n📱 ${number}\n👤 ${name}\n\nThis will now appear on every payment reminder sent to your customers.`,
    momoSkip: "⏭️ Skip",
    // --- New: bubble 3 (MoMo menu / Total / More) ---
    momoBtn: "💳 MoMo",
    totalBtn: "💰 Total",
    moreBtn: "➕ More",
    momoMenuStart: "💳 Setup/Update MoMo",
    momoMenuContact: "📞 Set Contact Number",
    contactNumberPrompt: "How can customers reach you directly?\n\nEnter a phone number, or tap No Number if you'd rather not share one.",
    contactNumberSaved: "✅ Contact number saved! Customers will now be told how to reach you.",
    contactNumberSkip: "⏭️ No Number",
    allCustomersBtn: "📋 All Customers",
    securityBtn: "🔒 Security",
    // --- Edit Customer ---
    editBtn: "✏️ Edit Customer",
    editIntro: (name: string) => `✏️ *Editing ${name}*\n\nSend the new name, or tap Keep Name to leave it unchanged.`,
    editKeepName: "⏭️ Keep Name",
    editAskPhone: (phone: string) => `Current phone: *${phone}*\n\nSend the new phone number, or tap Keep Phone to leave it unchanged.`,
    editAskPhoneNoNumber: `Current phone: *no number*\n\nSend a phone number, or tap Keep Phone to leave it as no number.`,
    editKeepPhone: "⏭️ Keep Phone",
    editSaved: (name: string, phone: string) => `✅ *Customer updated!*\n\n👤 ${name}\n📞 ${phone}`,
    // --- Reminder consent / STOP opt-out ---
    askConsent: "📋 Did this customer agree to receive WhatsApp reminders about what they owe?\n\nOnly customers who agreed will get reminders.",
    consentYes: "✅ Yes",
    consentNo: "❌ No",
    consentSavedYes: "✅ Saved. This customer can now receive reminders.",
    consentSavedNo: "✅ Saved. No reminders will be sent to this customer.",
    reminderSkippedOptedOut: (name: string) =>
      `🚫 *${name}* asked to stop receiving reminders. Reminder not sent.`,
    reminderSkippedNoConsent: (name: string) =>
      `⚠️ No reminder consent is recorded for *${name}*, so the reminder was not sent.`,
    remindAllSkippedOptOut: (names: string) => `\n\n🚫 Skipped — asked to stop: ${names}`,
    remindAllSkippedNoConsent: (names: string) =>
      `\n\n⚠️ Skipped — no reminder consent recorded: ${names}\n(Tap Find Customer → Send Reminder to record consent.)`,
    remindAllNoneSent: "ℹ️ No reminders were sent.",
    customerOptedOutNotice: (name: string, phone: string) =>
      `🚫 *${name}* (${phone}) replied STOP. ShopBrain will no longer send reminders to this number.`,
    customerOptedInNotice: (name: string, phone: string) =>
      `✅ *${name}* (${phone}) replied START. Reminders to this number are back on.`,
    optedOutLine: "🚫 Opted out of reminders (replied STOP)",
    // --- Name search ---
    multipleCustomersFound: (name: string) => `🔍 Found a few customers matching "${name}". Tap to select:`,
    multipleCustomersFoundReminder: (name: string) => `🔍 Found a few customers matching "${name}". Tap who to remind:`,
    noNameMatch: (name: string) => `❌ No customer found matching "${name}".`,
    optedOutRowLabel: "🚫 Opted out — STOP",
    // --- No-number duplicate name warning ---
    duplicateNameWarning: (name: string, item: string, total: number) =>
      `⚠️ You already have another customer named *${name}* with no phone number (owes ${total.toLocaleString()} Frw, last item: ${item}).\n\nTo avoid mixing them up later, you can add a short label (e.g. "${name} (motorbike)"), or continue if you're sure this is a different person.`,
    dupContinueBtn: "✅ Continue As-Is",
    dupRelabelBtn: "✏️ Add Label",
    askRelabel: "Send the name with a short label added, e.g. \"Jean (motorbike)\":",
    // --- Week-1 check-in flagging ---
    checkinIssueBtn: "❌ Yes, I have an issue",
    checkinConfirmed: "Got it — someone will reach out to help you soon.",
    // --- Reminder cooldown ---
    sendAnywayBtn: "📤 Send Anyway",
    cancelBtn: "✖️ Cancel",
    reminderCooldown: (name: string, daysAgo: number) =>
      `⏱ *${name}* was already reminded ${daysAgo === 0 ? "today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`}. To avoid annoying customers, reminders are limited to once every ${REMINDER_COOLDOWN_DAYS} days.\n\nSend anyway?`,
    remindAllSkippedRecent: (names: string) =>
      `\n\n⏱ Skipped — reminded in the last ${REMINDER_COOLDOWN_DAYS} days: ${names}`,
    // --- Follow-up list ---
    followUpBtn: "🚩 Follow-up",
    followUpHeader: (count: number) => `🚩 *Needs Follow-up (${count})*\n\nThese customers need a call or a visit:\n\n`,
    followUpContinued: "🚩 *Continued...*\n\n",
    followUpMore: (n: number) => `➕ ${n} more not shown. Settle or call the ones above first.`,
    followUpNone: "✅ Nobody needs follow-up right now.",
    reasonNoPhone: "no phone number — can't send reminders",
    reasonOptedOut: "asked to stop reminders — call them",
    reasonNoConsent: "no reminder consent recorded",
    reasonFailed: "last reminder did not deliver",
    reasonOld: (days: number) => `oldest debt is ${days} days old`,
    // --- Report ---
    reportBtn: "📊 Report",
    reportHeader: "📊 *ShopBrain Report*",
    reportOwed: (total: number, count: number) => `💰 Owed now: *${total.toLocaleString()} Frw* (${count} customers)`,
    reportCollected30: (total: number, n: number) => `✅ Collected, last 30 days: *${total.toLocaleString()} Frw* (${n} payments)`,
    reportCollected7: (total: number) => `✅ Collected, last 7 days: *${total.toLocaleString()} Frw*`,
    reportOldest: (days: number) => `🕰 Oldest unpaid debt: ${days} days`,
    reportFollowUp: (n: number) => `🚩 Need follow-up: ${n} — type FOLLOWUP to see them`,
    reportNote: "ℹ️ Collected amounts only count payments recorded in ShopBrain.",
    // --- Undo last debt ---
    undoBtn: "↩️ Undo Last Debt",
    undoYes: "✅ Yes, remove",
    undoConfirm: (name: string, item: string, amount: number, date: string) =>
      `↩️ Remove this debt for *${name}*?\n\n📦 ${item}\n💰 ${amount.toLocaleString()} Frw\n📅 ${date}`,
    undoDone: (name: string, item: string, amount: number, total: number) =>
      `✅ *Debt removed*\n\n👤 ${name}\n📦 ${item} — ${amount.toLocaleString()} Frw\n📊 Total owed now: ${total.toLocaleString()} Frw`,
    undoAlreadyPaid: (name: string) => `ℹ️ The last entry for *${name}* is already paid, so it can't be undone here.`,
    undoNothing: (name: string) => `ℹ️ *${name}* has no entries to undo.`,
    undoGone: "ℹ️ That entry was already removed.",
    // --- Today ---
    todayBtn: "📆 Today",
    todayHeader: "📆 *Today*",
    todayDebts: (total: number, n: number) => `➕ Debts added: *${total.toLocaleString()} Frw* (${n})`,
    todayPayments: (total: number, n: number) => `✅ Payments received: *${total.toLocaleString()} Frw* (${n})`,
    todayOwed: (total: number, count: number) => `💰 Total owed now: *${total.toLocaleString()} Frw* (${count} customers)`,
  },
  rw: {
    welcome: "👋 Murakaza neza kuri *ShopBrain*\nUrashaka gukora iki?",
    addDebt: "➕ Ongeraho Umwenda",
    findCustomer: "🔍 Shakisha Umukiriya",
    changeLanguage: "🌐 Guhindura Ururimi",
    askPhone: "➕ *Ongeraho Umwenda*\n\nAndika nimero y'umukiriya?\n\nUrugero: 0788123456",
    askName: "Andika izina ry'umukiriya?",
    askItem: "Igicuruzwa atwaye?",
    askAmount: "Agusigayemo angahe? (muri Frw)\n\n✍️ Andika cyangwa uhitemo hano hasi (si ngombwa)",
    invalidPhone: "❌ Nimero si yo. Andika nimero y'umukiriya ikurikira:",
    invalidAmount: "❌ Umubare si wo. Andika umubare urugero 5000",
    debtSaved: (name: string, phone: string, item: string, amount: number, total: number) =>
      `✅ *Umwenda Wabitswe!*\n\n👤 ${name} (${phone})\n📦 Igicuruzwa: ${item}\n💰 Byongewe: ${amount.toLocaleString()} Frw\n📊 Asigayemo: ${total.toLocaleString()} Frw`,
    noCustomer: (phone: string) => `❌ Uyu mukiriya ntago yanditse muri sisteme ${phone}.`,
    noCustomerText: "❌ Uyu mukiriya ntago yanditse muri sisteme.",
    allPaid: (name: string) => `✅ Amadeni yose yabazwe nkayishyuwe kuri *${name}*.`,
    viewHistory: "📋 Raporo y'ideni",
    sendReminder: "🔔 kwibutsa",
    markPaidBtn: "✅ Emeza Kwishyura",
    reminderSent: (name: string) => `⏳ Ubutumwa bwoherejwe kuri *${name}* — tegereza ko bakiriye...`,
    reminderDelivered: (name: string, phone: string, amount: number) =>
      `✅ Umukiriya *${name}* (${phone}) yakiriye ubutumwa bw'ishyura rya *${amount.toLocaleString()} Frw* 🎉`,
    reminderRead: (name: string) => `👀 Umukiriya *${name}* yasomye ubutumwa!`,
    reminderSentNotReceived: (name: string, phone: string) =>
      `✅ Ubutumwa bwoherejwe neza kuri *${name}* (${phone}) — ntabwo barakira ubutumwa`,
    reminderFailed: (phone: string) => `❌ Ubutumwa ntabwo bwoherejwe — *+${phone}* ntago bafite WhatsApp`,
    reminderFailedGeneric: (name: string, code: number) => `❌ Ubutumwa bwanze kuri *${name}* (code: ${code}) — gerageza nanone`,
    noDebts: (name: string) => `✅ ${name} ntagomba kwishyura. Nta butumwa bwoherejwe.`,
    findCustomerPrompt: "🔍 *Shakisha Umukiriya*\n\nAndika nimero y'umukiriya:",
    findCustomerPromptSearch: "🔍 *Shakisha Umukiriya*\n\nAndika nimero cyangwa izina ry'umukiriya:",
    findReminderPromptSearch: "🔔 *Kwibutsa*\n\nAndika nimero cyangwa izina ry'umukiriya:",
    markPaidPrompt: "✅ *Emeza Kwishyura*\n\nAndika nimero y'umukiriya:",
    askPartialAmount: "💰 Umukiriya ariha angahe?",
    askPartialItem: "📦 Ni iyihe kiguzi cy'iri shyura?",
    whatToDo: "Urashaka gukora iki?",
    existingCustomer: (name: string) => `👤 Umukiriya warahise: *${name}*\n\nIgicuruzwa atwaye?`,
    noHistory: (name: string) => `📋 Nta makuru yabonetse kuri ${name}.`,
    historyHeader: (name: string) => `📋 *Raporo y'ideni — ${name}*`,
    totalOwed: (total: number) => `💰 *Asigayemo: ${total.toLocaleString()} Frw*`,
    customerSummary: (name: string, phone: string, lastItem: string, totalOwed: number, lastVisit: string) =>
      `👤 *${name}*\n📞 ${phone}\n📦 Igicuruzwa giherutse: ${lastItem}\n💰 Ideni ryose: ${totalOwed.toLocaleString()} Frw\n📅 Aheruka: ${lastVisit}`,
    noCustomers: "📋 Nta bakiriya wanditse.",
    allCustomersHeader: (count: number) => `📋 *Abakiriya Bose (${count})*\n\n`,
    allCustomersContinued: "📋 *Gukomeza...*\n\n",
    owes: "Asigayemo",
    registered: "Yanditse",
    cleared: "Yishyuye ✅",
    partialPaid: (name: string, paid: number, remaining: number, item: string) =>
      `✅ *Igice cy'ishyura cyabitswe!*\n\n👤 ${name}\n📦 Kuri: ${item}\n💰 Yishyuye: ${paid.toLocaleString()} Frw\n📊 Asigayemo: ${remaining.toLocaleString()} Frw`,
    fullPaid: (name: string, paid: number) =>
      `✅ *Yishyuye yose!*\n\n👤 ${name}\n💰 Yishyuye: ${paid.toLocaleString()} Frw\n📊 Asigayemo: 0 Frw`,
    noUnpaid: (name: string) => `✅ ${name} ntagomba kwishyura.`,
    askShopName: "👋 Murakaza neza kuri *ShopBrain!*\n\nAndikisha ubucuruzi bwawe:",
    shopNameSaved: (name: string) => `✅ Kwiyandikisha byakunze — *${name}*!`,
    shopNameTooShort: "❌ Izina rifupi cyane. Andikisha ubucuruzi bwawe:",
    selectLanguage: "🌐 Hitamo ururimi rwawe:",
    languageSet: "✅ Ururimi rwahinduwe kuri Kinyarwanda!",
    ownerOnly: "Iyi nimero ni iy'nyir'iduka gusa.",
    somethingWrong: "Hari ikibazo. Gerageza nanone.",
    interactiveRetry: "❌ Hari ikibazo cyabaye. Ongera ukande buto:",
    languageAlreadySetRegistered: "🌐 Ururimi rwarahisemo. Niba ushaka kurihindura, koresha 'Guhindura Ururimi' kuri menu.",
    languageAlreadySetUnregistered: "🌐 Ururimi rwarahisemo. Ongera wandike izina ry'ubucuruzi bwawe kugira ngo urangize kwiyandikisha. Ushobora guhindura ururimi nyuma.",
    reminderInvalidNumber: "❌ Nimero si yo.\nUkurikira: REMIND <nimero>\nUrugero: REMIND 0788123456",
    remindAllSummary: (count: number, total: number) => `✅ Ubutumwa woherejewe kubakiriya *${count}*:\n\n`,
    remindAllTotal: (total: number) => `\n💰 *Igiteranyo cyamafranga: ${total.toLocaleString()} Frw*`,
    remindAllNone: "✅ Nta bakiriya bafite amadeni.",
    totalDebtHeader: "💰 *Igiteranyo cy'amadeni atarishyurwa*",
    totalDebtCustomerCount: (count: number) => `📊 abakiriya bakurimo amafranga: ${count}`,
    totalDebtGrandTotal: (total: number) => `💵 *Igiteranyo k'ideni ryose: ${total.toLocaleString()} Frw*`,
    totalDebtTopDebtors: "Abafitemo ideni rinini:",
    totalDebtNone: "✅ Nta madeni asigaye. Abakiriya bose barishyuye!",
    paidHint: "💡 Kwishyura umukiriya, andika:\nPAID 0788123456\ncyangwa igice: PAID 0788123456 2000",
    helpTitle: "📖 *ShopBrain — Ibyo Nshobora Gukora*",
    helpBody: `Dore ibyo wakoresha:

*Gukoresha buto:*
➕ Ongeraho Umwenda — andika umwenda mushya
✅ Emeza Kwishyura — andika nimero, hanyuma uhitemo Igice cyangwa Byose
📋 Menu — fungura urutonde rwose rw'ibikorwa:
🔍 Shakisha Umukiriya — reba amafaranga umukiriya asigayemo. Ku makuru ye: Raporo y'ideni, Kwibutsa, Emeza Kwishyura, ↩️ Siba Uheruka (usiba umwenda uheruka niba wibeshye), ✏️ Hindura Umukiriya, 📅 Itariki (andika igihe yasezeranyije kwishyura)
🔔 Kwibutsa — wibutsa umukiriya umwe, cyangwa bose icyarimwe
🚩 Gukurikirana — abakiriya bakeneye guhamagarwa cyangwa gusurwa
📋 Abakiriya Bose — urutonde rw'abakiriya bawe bose
💵 Andika Igurisha — gurisha mu bubiko, cash cyangwa ku mwenda; ububiko bugabanuka bwonyine
📦 Ububiko — ongeramo ibicuruzwa, reba ibigiye gushira
💰 Amafaranga & Raporo — Igiteranyo, Raporo y'Amadeni, Uyu Munsi, 💹 Inyungu (uyu munsi / iminsi 7 / 30), 🧾 Andika Ikiguzi
💼 Amadeni Nkwiye — andika ibyo ugomba abagemura ubyemeze igihe wishyuye
⚙️ Igenamiterere — 💳 MoMo & nimero, ⏰ Kwibutsa Byikora, 🚧 Ikirenga cy'Ideni, 🌐 Ururimi, 🔒 Umutekano

*Amabwiriza wandika (ntibisabwa):*
- TOTAL cyangwa IGITERANYO — reba igiteranyo cy'amadeni yose
- UYU MUNSI cyangwa TODAY — ibyongeweho n'ibyishyuwe uyu munsi
- GUKURIKIRANA — abakiriya bakeneye guhamagarwa cyangwa gusurwa
- RAPORO — amafaranga asigaye n'ayagarutse
- REMIND ALL cyangwa KWIBUTSA BOSE — wibutsa abakiriya bose bafite amadeni
- REMIND <nimero> — wibutsa umukiriya umwe
- @ALL — reba abakiriya bawe bose
- MOMO — shyiraho amakuru ya MTN MoMo azagaragara ku butumwa
- MENU — garuka kuri buto z'ibanze
- HELP — reba ubu butumwa nanone`,
    securityTip: `🔒 *Ubutumwa bw'Umutekano:*\n\nFunga iki gikorwa cya ShopBrain kugira ngo wowe gusa ubashobore kukibona.\n\n*Uko bikorwa:*\n1. Fata iki gikorwa mu rutonde rwa WhatsApp\n2. Kanda ikimenyetso cy'isuri 🔒\n3. Bizasaba igikumwe cyawe cyangwa ubuso bwawe\n\nAmakuru y'abakiriya bawe azaba ari mu mutekano.`,
    // --- MoMo setup ---
    momoIntro: "💳 *Gushyiraho MoMo*\n\nIbi bituma abakiriya babona neza aho koherereza amafaranga igihe babonye ubutumwa bwo kwibutsa.\n\nNimero yawe ya MTN MoMo ni iyihe?\n\nUrugero: 0788123456",
    momoInvalidNumber: "❌ Nimero si yo. Andika nimero yawe ya MoMo:",
    momoAskCode: "Ufite kode ya MTN MoMo Merchant/Business? (Niba ari ngombwa)\n\nYandike hano, cyangwa ukande simbuka niba utayifite.",
    momoAskReceiverName: "Ni irihe zina rigaragara kuri MTN igihe umuntu yohereza kuri iyi nimero/code amafaranga?\n\n⚠️ Iri zina rigomba guhuza neza n'irigaragara kuri MTN.\n\nUrugero: NIYONZIMA ALICE",
    momoReceiverTooShort: "❌ Rifupi cyane. Andika izina nyaryo rigaragara kuri MTN:",
    momoAskNickname: "Abakiriya bazi iduka ryawe kuyahe mazina? (kugira ngo baryumve n'igihe izina rya MTN ryaba ritandukanye)\n\nUrugero: Chez Alice",
    momoSaved: (number: string, name: string) =>
      `✅ *Amakuru ya MoMo yabitswe!*\n\n📱 ${number}\n👤 ${name}\n\nAzagaragara kuri buri butumwa bwo kwibutsa abakiriya bawe.`,
    momoSkip: "⏭️ Simbuka",
    // --- New: bubble 3 (MoMo menu / Total / More) ---
    momoBtn: "💳 MoMo",
    totalBtn: "💰 Igiteranyo",
    moreBtn: "➕ Ibindi",
    momoMenuStart: "💳 Shyiraho MoMo",
    momoMenuContact: "📞 Nimero yo Kuvugana",
    contactNumberPrompt: "Ese abakiriya bazakubona bate?\n\nAndika nimero, cyangwa kanda Nta Nimero niba udashaka gutanga imwe.",
    contactNumberSaved: "✅ Nimero yabitswe! Abakiriya bazamenyeshwa uko bakuvugana.",
    contactNumberSkip: "⏭️ Nta Nimero",
    allCustomersBtn: "📋 Abakiriya Bose",
    securityBtn: "🔒 Umutekano",
    // --- Edit Customer ---
    editBtn: "✏️ Hindura Umukiriya",
    editIntro: (name: string) => `✏️ *Uhindura ${name}*\n\nAndika izina rishya, cyangwa ukande Gumana Izina niba udashaka guhindura.`,
    editKeepName: "⏭️ Gumana Izina",
    editAskPhone: (phone: string) => `Nimero isanzwe: *${phone}*\n\nAndika nimero nshya, cyangwa ukande Gumana Nimero niba udashaka guhindura.`,
    editAskPhoneNoNumber: `Nimero isanzwe: *nta nimero*\n\nAndika nimero, cyangwa ukande Gumana Nimero niba ushaka gukomeza nta nimero.`,
    editKeepPhone: "⏭️ Gumana Nimero",
    editSaved: (name: string, phone: string) => `✅ *Umukiriya yahinduwe!*\n\n👤 ${name}\n📞 ${phone}`,
    // --- Reminder consent / STOP opt-out ---
    askConsent: "📋 Uyu mukiriya yemeye kwakira ubutumwa bwo kwibutsa amadeni kuri WhatsApp?\n\nAbemeye gusa nibo bazabona ubutumwa.",
    consentYes: "✅ Yego",
    consentNo: "❌ Oya",
    consentSavedYes: "✅ Byabitswe. Uyu mukiriya ashobora kwibutswa.",
    consentSavedNo: "✅ Byabitswe. Nta butumwa bwo kwibutsa buzoherezwa kuri uyu mukiriya.",
    reminderSkippedOptedOut: (name: string) =>
      `🚫 *${name}* yasabye guhagarikirwa ubutumwa bwo kwibutsa. Nta butumwa bwoherejwe.`,
    reminderSkippedNoConsent: (name: string) =>
      `⚠️ Nta bwemera bwo kwibutsa bwanditswe kuri *${name}*, ubutumwa ntibwoherejwe.`,
    remindAllSkippedOptOut: (names: string) => `\n\n🚫 Ntibyoherejwe — basabye guhagarikirwa: ${names}`,
    remindAllSkippedNoConsent: (names: string) =>
      `\n\n⚠️ Ntibyoherejwe — nta bwemera bwanditswe: ${names}\n(Kanda Shakisha Umukiriya → Kwibutsa kugira ngo wandike ubwemera.)`,
    remindAllNoneSent: "ℹ️ Nta butumwa bwoherejwe.",
    customerOptedOutNotice: (name: string, phone: string) =>
      `🚫 *${name}* (${phone}) yanditse STOP. ShopBrain ntizongera kohereza ubutumwa bwo kwibutsa kuri iyi nimero.`,
    customerOptedInNotice: (name: string, phone: string) =>
      `✅ *${name}* (${phone}) yanditse START. Ubutumwa bwo kwibutsa kuri iyi nimero buzongera koherezwa.`,
    optedOutLine: "🚫 Yasabye guhagarikirwa ubutumwa bwo kwibutsa (yanditse STOP)",
    // --- Name search ---
    multipleCustomersFound: (name: string) => `🔍 Hari abakiriya benshi bahuye na "${name}". Kanda uhitemo:`,
    multipleCustomersFoundReminder: (name: string) => `🔍 Hari abakiriya benshi bahuye na "${name}". Kanda uwo wibutsa:`,
    noNameMatch: (name: string) => `❌ Nta mukiriya ubonetse witwa "${name}".`,
    optedOutRowLabel: "🚫 Yahagaritse — STOP",
    // --- No-number duplicate name warning ---
    duplicateNameWarning: (name: string, item: string, total: number) =>
      `⚠️ Ufite undi mukiriya witwa *${name}* udafite nimero (asigayemo ${total.toLocaleString()} Frw, igicuruzwa giherutse: ${item}).\n\nKugira ngo utabatanya, wongeraho ikimenyetso gito (urugero: "${name} (moto)"), cyangwa ukomeze niba uzi ko ari umuntu utandukanye.`,
    dupContinueBtn: "✅ Komeza Uko Bimeze",
    dupRelabelBtn: "✏️ Ongeraho Ikimenyetso",
    askRelabel: "Andika izina hamwe n'ikimenyetso gito, urugero \"Jean (moto)\":",
    // --- Week-1 check-in flagging ---
    checkinIssueBtn: "❌ Yego, mfite ikibazo",
    checkinConfirmed: "Byakiriwe — hari uzagufasha vuba.",
    // --- Reminder cooldown ---
    sendAnywayBtn: "📤 Ohereza Nubundi",
    cancelBtn: "✖️ Reka",
    reminderCooldown: (name: string, daysAgo: number) =>
      `⏱ *${name}* yibutswe ${daysAgo === 0 ? "uyu munsi" : `hashize iminsi ${daysAgo}`}. Kugira ngo abakiriya batarakara, kwibutsa bikorwa rimwe mu minsi ${REMINDER_COOLDOWN_DAYS}.\n\nUracyashaka kohereza?`,
    remindAllSkippedRecent: (names: string) =>
      `\n\n⏱ Ntibyoherejwe — bibutswe mu minsi ${REMINDER_COOLDOWN_DAYS} ishize: ${names}`,
    // --- Follow-up list ---
    followUpBtn: "🚩 Gukurikirana",
    followUpHeader: (count: number) => `🚩 *Abakeneye Gukurikiranwa (${count})*\n\nAba bakiriya bakeneye guhamagarwa cyangwa gusurwa:\n\n`,
    followUpContinued: "🚩 *Gukomeza...*\n\n",
    followUpMore: (n: number) => `➕ Hari abandi ${n} batagaragaye hano. Banza ukurikirane abo hejuru.`,
    followUpNone: "✅ Nta muntu ukeneye gukurikiranwa ubu.",
    reasonNoPhone: "nta nimero — ntushobora kumwibutsa",
    reasonOptedOut: "yasabye guhagarikirwa ubutumwa — muhamagare",
    reasonNoConsent: "nta bwemera bwo kwibutsa bwanditswe",
    reasonFailed: "ubutumwa bwa nyuma ntibwagezeyo",
    reasonOld: (days: number) => `ideni rya kera rimaze iminsi ${days}`,
    // --- Report ---
    reportBtn: "📊 Raporo",
    reportHeader: "📊 *Raporo ya ShopBrain*",
    reportOwed: (total: number, count: number) => `💰 Asigayemo ubu: *${total.toLocaleString()} Frw* (abakiriya ${count})`,
    reportCollected30: (total: number, n: number) => `✅ Yishyuwe mu minsi 30 ishize: *${total.toLocaleString()} Frw* (kwishyura ${n})`,
    reportCollected7: (total: number) => `✅ Yishyuwe mu minsi 7 ishize: *${total.toLocaleString()} Frw*`,
    reportOldest: (days: number) => `🕰 Ideni rya kera: iminsi ${days}`,
    reportFollowUp: (n: number) => `🚩 Bakeneye gukurikiranwa: ${n} — andika GUKURIKIRANA ubirebe`,
    reportNote: "ℹ️ Amafaranga yishyuwe abarwa gusa ku kwishyura kwanditswe muri ShopBrain.",
    // --- Undo last debt ---
    undoBtn: "↩️ Siba Uheruka",
    undoYes: "✅ Yego, siba",
    undoConfirm: (name: string, item: string, amount: number, date: string) =>
      `↩️ Ushaka gusiba uyu mwenda wa *${name}*?\n\n📦 ${item}\n💰 ${amount.toLocaleString()} Frw\n📅 ${date}`,
    undoDone: (name: string, item: string, amount: number, total: number) =>
      `✅ *Umwenda wasibwe*\n\n👤 ${name}\n📦 ${item} — ${amount.toLocaleString()} Frw\n📊 Asigayemo ubu: ${total.toLocaleString()} Frw`,
    undoAlreadyPaid: (name: string) => `ℹ️ Umwenda uheruka wa *${name}* waramaze kwishyurwa, ntushobora gusibwa hano.`,
    undoNothing: (name: string) => `ℹ️ *${name}* nta mwenda wo gusiba afite.`,
    undoGone: "ℹ️ Uyu mwenda waramaze gusibwa.",
    // --- Today ---
    todayBtn: "📆 Uyu Munsi",
    todayHeader: "📆 *Uyu Munsi*",
    todayDebts: (total: number, n: number) => `➕ Amadeni yongeweho: *${total.toLocaleString()} Frw* (${n})`,
    todayPayments: (total: number, n: number) => `✅ Yishyuwe: *${total.toLocaleString()} Frw* (${n})`,
    todayOwed: (total: number, count: number) => `💰 Asigayemo ubu: *${total.toLocaleString()} Frw* (abakiriya ${count})`,
  },
};

type Lang = "en" | "rw";

// Sent to any number that isn't a registered shop owner (i.e. debtors
// replying to a reminder). Bilingual because we have no language on file
// for non-owners.
const NON_OWNER_REPLY =
  "This number is for shop owner use only. To stop receiving payment reminders, reply STOP.\n\n" +
  "Iyi nimero ni iy'nyir'iduka gusa. Kugira ngo uhagarikirwe ubutumwa bwo kwibutsa, andika STOP.";

const STOP_CONFIRMATION =
  "✅ You will no longer receive payment reminders from ShopBrain.\n\n" +
  "✅ Ntuzongera kwakira ubutumwa bwo kwibutsa bwa ShopBrain.";

// Words a debtor can send to opt out. Compared after stripping everything
// except letters, so "Stop", "stop!" and " STOP " all match.
const STOP_KEYWORDS = new Set(["STOP", "UNSUBSCRIBE", "GUHAGARIKA"]);

function isStopKeyword(text: string): boolean {
  return STOP_KEYWORDS.has(text.toUpperCase().replace(/[^A-Z]/g, ""));
}

// Words a debtor can send (or the START button sends) to turn reminders back on.
const START_KEYWORDS = new Set(["START", "SUBSCRIBE", "TANGIRA"]);

function isStartKeyword(text: string): boolean {
  return START_KEYWORDS.has(text.toUpperCase().replace(/[^A-Z]/g, ""));
}

// Second bubble after a STOP: how to turn reminders back on, with a START button.
const START_PROMPT =
  "Whenever you want to continue receiving reminders, press *START* below.\n\n" +
  "Niba wifuza gukomeza kwakira ubutumwa bwo kwibutsa, kanda *START* hasi.";

// Bubble after a START: confirms, and shows a STOP button in case they change their mind.
const START_CONFIRMATION_PROMPT =
  "✅ You will receive payment reminders again.\n\nIf you do not want any more reminders, press *STOP* below.\n\n" +
  "✅ Uzongera kwakira ubutumwa bwo kwibutsa.\n\nNiba udashaka kongera kubwakira, kanda *STOP* hasi.";

function cleanPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "250" + cleaned.slice(1);
  }
  return cleaned;
}

// Formats a date/timestamp into a full "DD Mon HH:MM:SS" string in the
// owner's local time, e.g. "26 Aug 14:03:27" — used for the customer
// lookup card's "Last visit" / "Aheruka" field so owners see exactly when
// (not just which day) the last transaction happened.
// Explicitly pinned to Africa/Kigali (UTC+2, no DST) rather than relying on
// whatever timezone the server host happens to run in — Replit/Railway etc.
// commonly default to UTC, which silently shifted displayed times by 2
// hours from what Kigali-based owners actually expect to see.
function formatFullTimestamp(dateInput: string | Date): string {
  const d = new Date(dateInput);
  const datePart = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Kigali" });
  const timePart = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Africa/Kigali" });
  return `${datePart} ${timePart}`;
}

async function isOwner(from: string): Promise<boolean> {
  const { data } = await supabase
    .from("owners")
    .select("phone, is_active")
    .eq("phone", cleanPhone(from))
    .single();
  return !!data && data.is_active !== false;
}

async function getLang(from: string): Promise<Lang> {
  const { data } = await supabase.from("owners").select("language").eq("phone", cleanPhone(from)).single();
  return (data?.language as Lang) ?? "en";
}

// --- STOP opt-out ---
// Opt-outs live in their own table keyed by phone number, so a STOP applies
// across every shop and also blocks the number if another shop adds it later.
// Both checks throw on a database error instead of returning "not opted out"
// — failing open here would mean sending reminders to someone who said STOP.
async function isOptedOut(phone: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("opt_outs")
    .select("phone")
    .eq("phone", cleanPhone(phone))
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function getOptedOutSet(phones: string[]): Promise<Set<string>> {
  const clean = phones.filter(Boolean).map(cleanPhone);
  if (clean.length === 0) return new Set();
  const { data, error } = await supabase.from("opt_outs").select("phone").in("phone", clean);
  if (error) throw error;
  return new Set((data ?? []).map((r: { phone: string }) => r.phone));
}

// Tells every shop that has this number as a customer what the debtor just did.
// If WhatsApp refuses the message (usually because the owner hasn't messaged the
// bot in the last 24h), the notice is saved and delivered the next time the
// owner sends the bot anything.
async function notifyShops(phone: string, event: "stop" | "start", req: Request): Promise<void> {
  try {
    const { data: rows } = await supabase.from("customers").select("name, shop_id").eq("phone", phone);
    for (const row of rows ?? []) {
      const ownerLang = await getLang(row.shop_id);
      const text = event === "stop"
        ? T[ownerLang].customerOptedOutNotice(row.name, phone)
        : T[ownerLang].customerOptedInNotice(row.name, phone);
      try {
        await sendWhatsAppMessage(row.shop_id, text);
      } catch (err) {
        req.log.warn({ err, shop: row.shop_id }, "Owner notice not delivered, saving for later");
        await supabase.from("owner_notices").insert({ shop_id: row.shop_id, text });
      }
    }
  } catch (err) {
    req.log.warn({ err }, "Failed to look up owners to notify");
  }
}

// Sends any notices that couldn't be delivered earlier. Called whenever an
// owner messages the bot, since that reopens the 24h window.
async function deliverPendingNotices(from: string): Promise<void> {
  try {
    const { data: notices } = await supabase
      .from("owner_notices")
      .select("id, text")
      .eq("shop_id", from)
      .order("created_at", { ascending: true });
    for (const n of notices ?? []) {
      await sendWhatsAppMessage(from, n.text);
      await supabase.from("owner_notices").delete().eq("id", n.id);
    }
  } catch (err) {
    console.error("Failed to deliver pending owner notices:", err);
  }
}

async function isKnownDebtor(phone: string): Promise<boolean> {
  if (await isOptedOut(phone)) return true;
  const { data, error } = await supabase.from("customers").select("id").eq("phone", phone).limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function handleDebtorStop(from: string, req: Request): Promise<void> {
  const phone = cleanPhone(from);
  const { error } = await supabase.from("opt_outs").upsert({ phone }, { onConflict: "phone" });
  if (error) throw error;
  await sendWhatsAppMessage(from, STOP_CONFIRMATION);
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: START_PROMPT },
    action: {
      buttons: [{ type: "reply", reply: { id: "debtor_start", title: "START" } }],
    },
  });
  await notifyShops(phone, "stop", req);
}

async function handleDebtorStart(from: string, req: Request): Promise<void> {
  const phone = cleanPhone(from);
  const { error } = await supabase.from("opt_outs").delete().eq("phone", phone);
  if (error) throw error;
  // The debtor has asked for reminders themselves, which counts as consent.
  await supabase.from("customers").update({ reminders_consent: true }).eq("phone", phone);
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: START_CONFIRMATION_PROMPT },
    action: {
      buttons: [{ type: "reply", reply: { id: "debtor_stop", title: "STOP" } }],
    },
  });
  await notifyShops(phone, "start", req);
}

async function handleNonOwnerMessage(from: string, text: string, req: Request): Promise<void> {
  if (isStopKeyword(text)) {
    await handleDebtorStop(from, req);
    return;
  }
  // Only honour a typed START from someone we actually know as a debtor, so a
  // stranger texting "start" just gets the normal owner-only reply.
  if (isStartKeyword(text) && (await isKnownDebtor(cleanPhone(from)))) {
    await handleDebtorStart(from, req);
    return;
  }
  await sendWhatsAppMessage(from, NON_OWNER_REPLY);
}

// Maps owner language to the correct approved WhatsApp template name for
// debt reminders. "debt_reminder" (English) has been Active for a while;
// "debt_reminder_rw" (Kinyarwanda) was just submitted and may still be
// pending Meta's review — sends will fail with a template-not-found error
// until it clears, at which point this needs no further changes.
function reminderTemplateName(lang: Lang): string {
  return lang === "rw" ? "debt_reminder_rw_v2" : "debt_reminder";
}

// Maps our internal Lang to the exact locale code Meta has the template
// registered under. Confirm these against WhatsApp Manager → template details
// before deploying — they must match exactly or sends fail with error 132001.
function metaLanguageCode(lang: Lang): string {
  return lang === "rw" ? "rw_RW" : "en";
}

// Builds the single-string itemized list used as the reminder template's
// {{4}} variable, e.g. "iPhone screen (3,000 Frw), Sugar (2,000 Frw)".
// Pulls every unpaid transaction for the customer, oldest first, so the list
// reads in the order items were actually added.
async function buildItemizedList(customerId: string): Promise<string> {
  const { data: unpaidTx } = await supabase
    .from("transactions")
    .select("item, amount")
    .eq("customer_id", customerId)
    .eq("paid", false)
    .order("date", { ascending: true });

  if (!unpaidTx || unpaidTx.length === 0) return "";

  return unpaidTx
  .map((t: { item: string; amount: number }) => `*${t.item}* (${t.amount.toLocaleString()} Frw)`)
  .join(", ");
}

// Builds the single-string MoMo payment block used as the reminder
// template's {{5}} variable. Returns a language-appropriate "no MoMo on
// file" line if the owner hasn't set up MoMo details yet. Wording depends
// on which reminder template (English or Kinyarwanda) this is feeding —
// pass the same `lang` used to pick reminderTemplateName()/metaLanguageCode().
// (Template body copy/bolding is fixed at Meta approval time — this just
// fills the variable, it can't add its own bold/color formatting.)
function buildMomoBlock(owner: {
  momo_number?: string | null;
  momo_code?: string | null;
  momo_receiver_name?: string | null;
  shop_nickname?: string | null;
}, lang: Lang): string {
  if (lang === "rw") {
    if (!owner.momo_number) {
      return "Nta makuru ya MoMo abitswe.";
    }
    const codeLine = owner.momo_code ? `Kode ya MOMO: ${owner.momo_code}. ` : "";
    const nickname = owner.shop_nickname ? ` (Iyi ni MOMO ya "${owner.shop_nickname}")` : "";
    return `${owner.momo_number}. ${codeLine}Amazina agaragara kuri MOMO: ${owner.momo_receiver_name ?? ""}${nickname}`;
  }

  if (!owner.momo_number) {
    return "No MoMo details on file.";
  }
  const codeLine = owner.momo_code ? `MoMo Code: ${owner.momo_code}. ` : "";
  const nickname = owner.shop_nickname ? ` (This is MoMo for "${owner.shop_nickname}")` : "";
  return `${owner.momo_number}. ${codeLine}Name shown on MoMo: ${owner.momo_receiver_name ?? ""}${nickname}`;
}

// --- Name search helpers ---
// Finds customers for this shop whose name contains the given text
// (case-insensitive). Limited to 10 since a WhatsApp list message can only
// show 10 rows.
async function searchCustomersByName(shopId: string, name: string): Promise<Array<{ id: string; name: string; phone: string | null }>> {
  const { data } = await supabase
    .from("customers")
    .select("id, name, phone")
    .eq("shop_id", shopId)
    .ilike("name", `%${name.trim()}%`)
    .limit(10);
  return data ?? [];
}

// Same as above but also pulls unpaid total + last item/visit per match, so
// when two customers share a name (especially two no-number ones) the owner
// has enough to tell them apart from the list alone.
async function searchCustomersWithDetails(
  shopId: string,
  name: string
): Promise<Array<{ id: string; name: string; phone: string | null; total: number; lastItem: string | null; lastDate: string | null }>> {
  const matches = await searchCustomersByName(shopId, name);
  const rows: Array<{ id: string; name: string; phone: string | null; total: number; lastItem: string | null; lastDate: string | null }> = [];
  for (const c of matches) {
    const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", c.id).eq("paid", false);
    const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
    const { data: lastTxArr } = await supabase.from("transactions").select("item, date").eq("customer_id", c.id).order("date", { ascending: false }).limit(1);
    const lastTx = lastTxArr?.[0];
    rows.push({
      id: c.id,
      name: c.name,
      phone: c.phone,
      total,
      lastItem: lastTx?.item ?? null,
      lastDate: lastTx ? formatFullTimestamp(lastTx.date) : null,
    });
  }
  return rows;
}

// Handles the result of a name search: zero matches shows "not found" and
// the menu; exactly one match jumps straight into that customer's record;
// several matches are shown as a WhatsApp list to pick from.
async function sendNameSearchResults(
  from: string,
  lang: Lang,
  rows: Array<{ id: string; name: string; phone: string | null; total: number; lastItem: string | null; lastDate: string | null }>,
  searchedName: string
): Promise<void> {
  if (rows.length === 0) {
    await sendWhatsAppMessage(from, T[lang].noNameMatch(searchedName));
    await sendPersistentMenu(from, lang);
    return;
  }
  if (rows.length === 1) {
    const c = rows[0]!;
    if (c.phone) {
      sessions[from] = { step: "idle", data: { lastPhone: c.phone } };
      await lookupCustomer(from, c.phone, lang);
    } else {
      await sendNoNumberCustomerSummary(from, lang, c.id);
    }
    return;
  }
  await sendWhatsAppMessage(from, T[lang].multipleCustomersFound(searchedName));
  await sendWhatsAppInteractiveMessage(from, {
    type: "list",
    body: { text: T[lang].whatToDo },
    action: {
      button: lang === "rw" ? "Hitamo" : "Select",
      sections: [
        {
          title: lang === "rw" ? "Abakiriya" : "Customers",
          rows: rows.slice(0, 10).map((r) => ({
            id: `namesearch_${r.id}`,
            title: r.name.slice(0, 24),
            description: `${r.total > 0 ? r.total.toLocaleString() + " Frw" : T[lang].cleared}${r.lastItem ? " — " + r.lastItem : ""}${r.lastDate ? " — " + r.lastDate : ""}`.slice(0, 72),
          })),
        },
      ],
    },
  });
}

// Reminder-specific name search: every remindable match becomes a tappable
// list row, INCLUDING customers who opted out (marked with a 🚫 prefix and
// "Opted out — STOP" instead of their amount owed). This is intentional —
// the owner should see every customer matching the name they typed, exactly
// like everywhere else in the app, rather than have some silently vanish.
// Tapping an opted-out row never sends a message: the handler re-checks
// opt-out status and replies with the standard "can't receive reminders"
// message instead of calling sendReminder. No-number customers are dropped
// entirely since there is no way to send them a WhatsApp reminder at all.
async function sendReminderNameSearchResults(
  from: string,
  lang: Lang,
  rows: Array<{ id: string; name: string; phone: string | null; total: number; lastItem: string | null; lastDate: string | null }>,
  searchedName: string
): Promise<void> {
  const withPhone = rows.filter((r) => r.phone);

  if (withPhone.length === 0) {
    await sendWhatsAppMessage(from, T[lang].noNameMatch(searchedName));
    await sendPersistentMenu(from, lang);
    return;
  }

  const optedOutSet = await getOptedOutSet(withPhone.map((r) => r.phone!));

  // A single match still goes through sendReminder directly (which already
  // handles the opted-out / no-consent cases with their own messages), so
  // we only branch into the list UI when there's real ambiguity to resolve.
  if (withPhone.length === 1) {
    await sendReminder(from, withPhone[0]!.phone!, lang);
    return;
  }

  await sendWhatsAppMessage(from, T[lang].multipleCustomersFoundReminder(searchedName));
  await sendWhatsAppInteractiveMessage(from, {
    type: "list",
    body: { text: T[lang].whatToDo },
    action: {
      button: lang === "rw" ? "Hitamo" : "Select",
      sections: [
        {
          title: lang === "rw" ? "Abakiriya" : "Customers",
          rows: withPhone.slice(0, 10).map((r) => {
            const optedOut = optedOutSet.has(cleanPhone(r.phone!));
            return {
              id: `remindsearch_${r.id}`,
              title: `${optedOut ? "🚫 " : ""}${r.name}`.slice(0, 24),
              description: optedOut
                ? `${r.phone} — ${T[lang].optedOutRowLabel}`.slice(0, 72)
                : `${r.phone} — ${r.total > 0 ? r.total.toLocaleString() + " Frw" : T[lang].cleared}`.slice(0, 72),
            };
          }),
        },
      ],
    },
  });
}

// Shows a customer's summary by ID rather than phone — needed for
// no-number customers, since phone-based lookups can't reach them.
// Only the Undo Last Debt button is offered here (it works by customer ID).
// Mark as Paid / Edit / Send Reminder are still phone-keyed everywhere else
// in this file (a known, pre-existing gap for no-number customers), so wiring
// those buttons here would silently fail.
async function sendNoNumberCustomerSummary(from: string, lang: Lang, customerId: string): Promise<void> {
  const { data: customer } = await supabase.from("customers").select("*").eq("id", customerId).eq("shop_id", from).single();
  if (!customer) {
    await sendWhatsAppMessage(from, T[lang].noCustomerText);
    await sendPersistentMenu(from, lang);
    return;
  }
  const { data: transactions } = await supabase.from("transactions").select("*").eq("customer_id", customer.id).order("date", { ascending: false });
  const unpaid = (transactions ?? []).filter((t: { paid: boolean }) => !t.paid);
  const totalOwed = unpaid.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  const lastTx = transactions?.[0];
  const lastDate = lastTx ? formatFullTimestamp(lastTx.date) : "N/A";
  const phoneDisplay = lang === "rw" ? "nta nimero" : "no number";
  await sendWhatsAppMessage(from, T[lang].customerSummary(customer.name, phoneDisplay, lastTx?.item ?? "N/A", totalOwed, lastDate));
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].whatToDo },
    action: {
      buttons: [
        { type: "reply", reply: { id: `undo_last_${customer.id}`, title: T[lang].undoBtn } },
      ],
    },
  });
  await sendPersistentMenu(from, lang);
}

interface WhatsAppMessage {
  id: string;
  from: string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  // Set when the sender taps a quick-reply button on a template message
  // (e.g. the STOP button on a reminder).
  button?: { text?: string; payload?: string };
  type: string;
}

interface WhatsAppStatus {
  id: string;
  status: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

interface WebhookBody {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppMessage[];
        statuses?: WhatsAppStatus[];
      };
    }>;
  }>;
}

router.get("/privacy", (_req: Request, res: Response) => {
  res.send("<html><body><h1>ShopBrain Privacy Policy</h1><p>ShopBrain collects WhatsApp phone numbers and debt records solely to provide debt tracking services to shop owners. Data is stored securely and never shared with third parties. Customers can reply STOP to any reminder at any time to stop receiving messages. Contact: +250 795 120 043</p></body></html>");
});

// Meant to be pinged once a day by an external uptime/cron service (the same
// UptimeRobot setup already pinging /privacy every 5 minutes — just add a
// second monitor here on a 24h interval). Safe to deploy and start pinging
// before the "weekly_checkin" WhatsApp template is approved: each send
// attempt is wrapped in try/catch inside runWeeklyCheckin, so an
// unapproved-template error is logged and skipped rather than crashing
// anything. Once Meta approves the template, sends start succeeding on the
// very next scheduled run — no redeploy needed.
router.get("/jobs/weekly-checkin", async (req: Request, res: Response) => {
  const result = await runWeeklyCheckin();
  req.log.info(result, "Weekly check-in job run complete");
  res.json(result);
});

// Daily auto-reminder job. Ping it once a day (e.g. cron-job.org at 09:00
// Africa/Kigali): https://YOUR-HOST/jobs/auto-reminders?key=YOUR_JOB_SECRET
// It answers straight away and does the sending in the background. Extra
// pings are harmless — nobody is reminded more than once per cooldown.
router.get("/jobs/auto-reminders", (req: Request, res: Response) => {
  if (JOB_SECRET && req.query["key"] !== JOB_SECRET) {
    res.sendStatus(403);
    return;
  }
  features
    .runAutoReminders()
    .then((r) => req.log.info(r, "Auto-reminder job complete"))
    .catch((err) => req.log.error({ err }, "Auto-reminder job failed"));
  res.json({ started: true });
});

router.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    req.log.info("WhatsApp webhook verified");
    res.status(200).send(challenge);
  } else {
    req.log.warn({ token }, "Webhook verification failed — wrong token");
    res.status(403).send("Forbidden");
  }
});

router.post("/webhook", async (req: Request, res: Response) => {
  const body = req.body as WebhookBody;
  if (body.object !== "whatsapp_business_account") {
    res.sendStatus(404);
    return;
  }
  res.sendStatus(200);

  const messages =
    body.entry?.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.messages ?? []) ?? [];
  const statuses =
    body.entry?.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.statuses ?? []) ?? [];

  for (const msg of messages) {
    const from = msg.from;
    // Mark as read + show the typing indicator immediately, before any DB
    // work, so the sender sees feedback right away instead of silence.
    // Best-effort: never let a read-receipt failure block the real reply.
    try {
      await markMessageAsRead(msg.id);
    } catch (err) {
      req.log.warn({ err, from }, "Failed to mark message as read");
    }
    try {
      if (msg.type === "button") {
        const label = msg.button?.payload || msg.button?.text || "";
        if (isStopKeyword(label)) {
          await handleDebtorStop(from, req);
        } else if (isStartKeyword(label)) {
          await handleDebtorStart(from, req);
        }
        continue;
      }
      if (msg.type === "interactive") {
        const replyId =
          msg.interactive?.button_reply?.id ||
          msg.interactive?.list_reply?.id ||
          "";
        if (!replyId) {
          const lang = await getLang(from);
          await sendWhatsAppMessage(from, T[lang].interactiveRetry);
          continue;
        }
        await handleInteractive(from, replyId, req);
        continue;
      }
      if (msg.type === "text" && msg.text?.body) {
        const text = msg.text.body.trim();
        await handleMessage(from, text, req);
      }
    } catch (err) {
      req.log.error({ err, from }, "Failed to handle message");
      const lang = await getLang(from);
      await sendWhatsAppMessage(from, T[lang].somethingWrong);
    }
  }

  for (const status of statuses) {
    try {
      const { data: log } = await supabase.from("reminder_logs").select("*").eq("message_id", status.id).single();
      if (!log) continue;
      const lang = await getLang(log.owner_phone) as Lang;

      // Remember the latest reminder status on the customer, so the Follow-up
      // list can flag reminders that did not deliver.
      if (["sent", "delivered", "read", "failed"].includes(status.status)) {
        await supabase
          .from("customers")
          .update({ last_reminder_status: status.status })
          .eq("phone", log.customer_phone)
          .eq("shop_id", log.owner_phone);
      }

      // Auto-reminders go out when the owner's 24h window is usually closed,
      // so just record the status instead of messaging the owner about each one.
      if (log.is_auto) {
        if (["sent", "delivered", "read", "failed"].includes(status.status)) {
          await supabase.from("reminder_logs").update({ status: status.status }).eq("message_id", status.id);
        }
        continue;
      }

      if (status.status === "sent") {
        await supabase.from("reminder_logs").update({ status: "sent" }).eq("message_id", status.id);
        await sendWhatsAppMessage(log.owner_phone, T[lang].reminderSentNotReceived(log.customer_name, log.customer_phone));
      } else if (status.status === "delivered") {
        await supabase.from("reminder_logs").update({ status: "delivered" }).eq("message_id", status.id);
        await sendWhatsAppMessage(log.owner_phone, T[lang].reminderDelivered(log.customer_name, log.customer_phone, Number(log.amount)));
      } else if (status.status === "read") {
        await supabase.from("reminder_logs").update({ status: "read" }).eq("message_id", status.id);
        await sendWhatsAppMessage(log.owner_phone, T[lang].reminderRead(log.customer_name));
      } else if (status.status === "failed") {
        await supabase.from("reminder_logs").update({ status: "failed" }).eq("message_id", status.id);
        const errorCode = status.errors?.[0]?.code;
        const isNotOnWhatsApp = errorCode === 131026 || errorCode === 470;
        if (isNotOnWhatsApp) {
          await sendWhatsAppMessage(log.owner_phone, T[lang].reminderFailed(log.customer_phone));
        } else {
          await sendWhatsAppMessage(log.owner_phone, T[lang].reminderFailedGeneric(log.customer_name, errorCode ?? 0));
        }
      }
    } catch (err) {
      req.log.error({ err, statusId: status.id }, "Failed to handle status update");
    }
  }
});

async function getOrAskShopName(from: string, lang: Lang): Promise<string | null> {
  const { data: owner } = await supabase.from("owners").select("name, language").eq("phone", cleanPhone(from)).single();
  if (owner?.name) return owner.name;
  if (!owner?.language) {
    sessions[from] = { step: "setup_language", data: {} };
    await sendOnboardingLanguagePicker(from);
    return null;
  }
  sessions[from] = { step: "setup_shop_name", data: {} };
  await sendWhatsAppMessage(from, T[owner.language as Lang].askShopName);
  return null;
}

async function sendOnboardingLanguagePicker(from: string): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: "👋 Welcome to *ShopBrain* / Murakaza neza kuri *ShopBrain*\n\nSelect language / Hitamo ururimi:" },
    action: {
      buttons: [
        { type: "reply", reply: { id: "onboard_lang_en", title: "English" } },
        { type: "reply", reply: { id: "onboard_lang_rw", title: "Ikinyarwanda" } },
      ],
    },
  });
}

// The main menu is now ONE bubble: Add Debt | Mark as Paid | Menu.
// "Menu" opens a list of every other action (see sendMenuList in
// ../lib/shopFeatures.ts). `firstBubbleText` lets callers use a greeting on
// first registration vs. a plain "what would you like to do" on later visits.
async function sendMenuButtons(from: string, lang: Lang, firstBubbleText: string): Promise<void> {
  await features.sendMainBubble(from, lang, firstBubbleText);
}

// Right after registration, the owner sees the SAME menu as every later visit.
async function sendFirstTimeMenu(from: string, lang: Lang): Promise<void> {
  await sendMenuButtons(from, lang, T[lang].welcome);
}

async function sendHelp(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppMessage(from, `${T[lang].helpTitle}\n\n${T[lang].helpBody}`);
  await sendPersistentMenu(from, lang);
}

async function sendPersistentMenu(from: string, lang: Lang): Promise<void> {
  await sendMenuButtons(from, lang, T[lang].whatToDo);
}

async function sendMomoMenu(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].whatToDo },
    action: {
      buttons: [
        { type: "reply", reply: { id: "momo_start", title: T[lang].momoMenuStart } },
        { type: "reply", reply: { id: "set_contact_number", title: T[lang].momoMenuContact } },
      ],
    },
  });
}

async function sendReminderChoice(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].whatToDo },
    action: {
      buttons: [
        { type: "reply", reply: { id: "reminder_specific", title: lang === "rw" ? "📱 Nimero Runaka" : "📱 Specific Number" } },
        { type: "reply", reply: { id: "reminder_all_choice", title: lang === "rw" ? "🔔 Kwibutsa Bose" : "🔔 Remind All" } },
      ],
    },
  });
}

async function sendMarkPaidChoice(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].whatToDo },
    action: {
      buttons: [
        { type: "reply", reply: { id: "mark_paid_partial", title: lang === "rw" ? "➗ Igice" : "➗ Partially" } },
        { type: "reply", reply: { id: "mark_paid_full", title: lang === "rw" ? "✅ Byose" : "✅ Full Payment" } },
      ],
    },
  });
}

async function sendLanguagePicker(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].selectLanguage },
    action: {
      buttons: [
        { type: "reply", reply: { id: "lang_rw", title: "Ikinyarwanda" } },
        { type: "reply", reply: { id: "lang_en", title: "Icyongereza" } },
      ],
    },
  });
}

// The "customer's phone number?" prompt of the Add Debt flow. Used by the
// Add Debt button and by credit sales from stock.
async function sendAddPhonePrompt(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].askPhone },
    action: {
      buttons: [
        { type: "reply", reply: { id: "phone_skip", title: lang === "rw" ? "Nta Nimero" : "No Number" } },
      ],
    },
  });
}

// Yes/No question asking whether a customer agreed to get WhatsApp reminders.
// Used in three places: when adding a brand-new customer (session step
// "add_consent"), when a customer's phone number is changed or created via
// the legacy ADD command, and when an owner tries to remind someone with no
// consent recorded (both use session step "consent_existing").
async function askConsent(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].askConsent },
    action: {
      buttons: [
        { type: "reply", reply: { id: "consent_yes", title: T[lang].consentYes } },
        { type: "reply", reply: { id: "consent_no", title: T[lang].consentNo } },
      ],
    },
  });
}

// --- MoMo setup flow ---
async function startMomoSetup(from: string, lang: Lang): Promise<void> {
  sessions[from] = { step: "momo_number", data: {} };
  await sendWhatsAppMessage(from, T[lang].momoIntro);
}

async function askMomoCode(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].momoAskCode },
    action: {
      buttons: [
        { type: "reply", reply: { id: "momo_code_skip", title: T[lang].momoSkip } },
      ],
    },
  });
}

async function askMomoNickname(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].momoAskNickname },
    action: {
      buttons: [
        { type: "reply", reply: { id: "momo_nickname_skip", title: T[lang].momoSkip } },
      ],
    },
  });
}

async function saveMomoDetails(from: string, lang: Lang): Promise<void> {
  const session = sessions[from];
  if (!session) return;
  const { momo_number, momo_code, momo_receiver_name, shop_nickname } = session.data;
  sessions[from] = undefined as any;

  await supabase
    .from("owners")
    .update({
      momo_number: momo_number ?? null,
      momo_code: momo_code || null,
      momo_receiver_name: momo_receiver_name ?? null,
      shop_nickname: shop_nickname || null,
    })
    .eq("phone", cleanPhone(from));

  await sendWhatsAppMessage(from, T[lang].momoSaved(momo_number ?? "", momo_receiver_name ?? ""));
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

// --- Set Contact Number flow ---
async function startContactNumberSetup(from: string, lang: Lang): Promise<void> {
  sessions[from] = { step: "contact_number", data: {} };
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].contactNumberPrompt },
    action: {
      buttons: [
        { type: "reply", reply: { id: "contact_number_skip", title: T[lang].contactNumberSkip } },
      ],
    },
  });
}

async function saveContactNumber(from: string, lang: Lang, contactPhone: string | null): Promise<void> {
  sessions[from] = undefined as any;
  await supabase
    .from("owners")
    .update({ contact_phone: contactPhone })
    .eq("phone", cleanPhone(from));
  await sendWhatsAppMessage(from, T[lang].contactNumberSaved);
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

// Shared by the "paid_phone" typed-number flow and the Mark as Paid button
// shortcut (when a customer is already known from context, e.g. Find
// Customer lookup) — looks up the customer, checks they have an unpaid
// balance, then shows the Partial/Full Payment choice.
async function startMarkPaidForPhone(from: string, phone: string, lang: Lang): Promise<void> {
  const { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
  if (!customer) {
    sessions[from] = undefined as any;
    await sendWhatsAppMessage(from, T[lang].noCustomer(phone));
    await sendPersistentMenu(from, lang);
    return;
  }
  const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
  const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  if (total === 0) {
    sessions[from] = undefined as any;
    await sendWhatsAppMessage(from, T[lang].noUnpaid(customer.name));
    await sendPersistentMenu(from, lang);
    return;
  }
  sessions[from] = { step: "idle", data: { markPaidPhone: phone } };
  await sendMarkPaidChoice(from, lang);
}

// --- Edit Customer flow ---
// Since WhatsApp has no way to prefill the text input, we show the current
// value and ask the owner to either type a replacement or tap a "Keep"
// button to leave it unchanged. Two steps: name, then phone.
async function startEditCustomer(from: string, phone: string, lang: Lang): Promise<void> {
  const { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
  if (!customer) {
    await sendWhatsAppMessage(from, T[lang].noCustomer(phone));
    await sendPersistentMenu(from, lang);
    return;
  }
  sessions[from] = { step: "edit_name", data: { editCustomerId: customer.id, editOriginalPhone: phone, editName: customer.name, editPhone: phone } };
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].editIntro(customer.name) },
    action: {
      buttons: [
        { type: "reply", reply: { id: "edit_keep_name", title: T[lang].editKeepName } },
      ],
    },
  });
}

async function askEditPhone(from: string, lang: Lang): Promise<void> {
  const session = sessions[from];
  if (!session) return;
  const currentPhone = session.data["editPhone"];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: currentPhone ? T[lang].editAskPhone(currentPhone) : T[lang].editAskPhoneNoNumber },
    action: {
      buttons: [
        { type: "reply", reply: { id: "edit_keep_phone", title: T[lang].editKeepPhone } },
      ],
    },
  });
}

async function saveEditedCustomer(from: string, lang: Lang): Promise<void> {
  const session = sessions[from];
  if (!session) return;
  const { editCustomerId, editOriginalPhone, editName, editPhone } = session.data;
  sessions[from] = undefined as any;

  // Consent was given for the OLD number, so a changed number needs a fresh
  // answer. Reset it here and ask again after saving.
  const phoneChanged = (editPhone || null) !== (editOriginalPhone || null);

  const updates: Record<string, string | boolean | null> = {};
  if (editName) updates["name"] = editName;
  updates["phone"] = editPhone ? editPhone : null;
  if (phoneChanged) updates["reminders_consent"] = false;

  await supabase.from("customers").update(updates).eq("id", editCustomerId);

  await sendWhatsAppMessage(from, T[lang].editSaved(editName ?? "", editPhone || (lang === "rw" ? "nta nimero" : "no number")));

  if (phoneChanged && editPhone) {
    sessions[from] = { step: "consent_existing", data: { consentCustomerId: editCustomerId ?? "" } };
    await askConsent(from, lang);
    return;
  }
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

async function handleInteractive(from: string, replyId: string, req: Request): Promise<void> {
  // START / STOP buttons sent to debtors — handled for anyone, owner or not.
  if (replyId === "debtor_stop") {
    await handleDebtorStop(from, req);
    return;
  }
  if (replyId === "debtor_start") {
    await handleDebtorStart(from, req);
    return;
  }

  // Week-1 check-in "Yes, I have an issue" button — handled for any real
  // owner regardless of session state. Flags Sam directly via WhatsApp with
  // shop + phone context, so he knows it's a genuine ShopBrain user and not
  // a stranger, without needing to be actively checking in on people.
  if (replyId === "checkin_issue") {
    const ownerPhone = cleanPhone(from);
    const { data: owner } = await supabase.from("owners").select("name, language").eq("phone", ownerPhone).single();
    const ownerLang = (owner?.language as Lang) ?? "en";
    const shopName = owner?.name ?? `Shop (${from.slice(-4)})`;

    if (SAM_PHONE_NUMBER) {
      try {
        await sendWhatsAppMessage(
          SAM_PHONE_NUMBER,
          `⚠️ ShopBrain issue flagged\n\nShop: ${shopName}\nOwner phone: ${ownerPhone}\n\nThey tapped "Yes" on their check-in — this is a real ShopBrain user, not a stranger.`
        );
      } catch (err) {
        console.error("Failed to notify Sam of flagged issue:", err);
      }
    }

    await sendWhatsAppMessage(from, T[ownerLang].checkinConfirmed);
    return;
  }

  if (!(await isOwner(from))) {
    await sendWhatsAppMessage(from, NON_OWNER_REPLY);
    return;
  }

  // FIX: lang must be declared before any branch below uses it.
  const lang = await getLang(from);
  await deliverPendingNotices(from);

  // Menus, stock, sales, profit, expenses, suppliers, auto-reminders,
  // promise dates and credit limit all live in ../lib/shopFeatures.ts.
  if (await features.handleInteractive(from, replyId, lang)) return;

  // Main-menu "Mark as Paid": always ask for the customer, never reuse a
  // stale lookup from earlier in the chat.
  if (replyId === "mark_paid_menu") {
    sessions[from] = { step: "paid_phone", data: {} };
    await sendWhatsAppMessage(from, T[lang].markPaidPrompt);
    return;
  }

  // Credit-limit warning buttons (the warning is sent from finishAddDebt).
  if (replyId === "limit_continue") {
    const s = sessions[from];
    if (s?.step !== "limit_confirm") return; // stale button tap, ignore
    s.data["limitOk"] = "1";
    await finishAddDebt(from, lang, parseInt(s.data["pendingAmount"] ?? "0", 10));
    return;
  }
  if (replyId === "limit_cancel") {
    if (sessions[from]?.step !== "limit_confirm") return; // stale button tap, ignore
    sessions[from] = undefined as any;
    await sendWhatsAppMessage(from, features.strings[lang].clCancelled);
    await sendPersistentMenu(from, lang);
    return;
  }

  // A row picked from a name-search list message.
  if (replyId.startsWith("namesearch_")) {
    const customerId = replyId.slice("namesearch_".length);
    const { data: customer } = await supabase.from("customers").select("id, phone").eq("id", customerId).eq("shop_id", from).single();
    if (!customer) {
      await sendWhatsAppMessage(from, T[lang].noCustomerText);
      await sendPersistentMenu(from, lang);
      return;
    }
    if (customer.phone) {
      sessions[from] = { step: "idle", data: { lastPhone: customer.phone } };
      await lookupCustomer(from, customer.phone, lang);
    } else {
      await sendNoNumberCustomerSummary(from, lang, customer.id);
    }
    return;
  }

  // A row picked from a reminder-specific name-search list. Always
  // re-checks opt-out status right before sending — never trusts the label
  // shown in the list, since the opt-out state could theoretically change
  // between listing and tapping.
  if (replyId.startsWith("remindsearch_")) {
    const customerId = replyId.slice("remindsearch_".length);
    const { data: customer } = await supabase.from("customers").select("id, name, phone").eq("id", customerId).eq("shop_id", from).single();
    if (!customer?.phone) {
      await sendWhatsAppMessage(from, T[lang].noCustomerText);
      await sendPersistentMenu(from, lang);
      return;
    }
    if (await isOptedOut(customer.phone)) {
      await sendWhatsAppMessage(from, T[lang].reminderSkippedOptedOut(customer.name));
      await sendPersistentMenu(from, lang);
      return;
    }
    await sendReminder(from, customer.phone, lang);
    return;
  }

  // "Send Anyway" after the reminder cooldown warning. sendReminder still
  // re-checks opt-out and consent; only the cooldown is bypassed.
  if (replyId.startsWith("remindforce_")) {
    const customerId = replyId.slice("remindforce_".length);
    const { data: customer } = await supabase.from("customers").select("id, phone").eq("id", customerId).eq("shop_id", from).single();
    if (!customer?.phone) {
      await sendWhatsAppMessage(from, T[lang].noCustomerText);
      await sendPersistentMenu(from, lang);
      return;
    }
    await sendReminder(from, customer.phone, lang, true);
    return;
  }

  if (replyId === "remind_cancel") {
    await sendPersistentMenu(from, lang);
    return;
  }

  if (replyId === "today_btn") {
    await showToday(from, lang);
    return;
  }

  // Quick-amount button during Add Debt.
  if (replyId.startsWith("amt_")) {
    if (sessions[from]?.step !== "add_amount") return; // stale button tap, ignore
    const amount = parseInt(replyId.slice("amt_".length), 10);
    if (isNaN(amount) || amount <= 0) return;
    await finishAddDebt(from, lang, amount);
    return;
  }

  if (replyId.startsWith("undo_last_")) {
    await sendUndoConfirm(from, lang, replyId.slice("undo_last_".length));
    return;
  }

  if (replyId.startsWith("undo_yes_")) {
    await undoDebt(from, lang, replyId.slice("undo_yes_".length));
    return;
  }

  if (replyId === "followup_btn") {
    await showFollowUp(from, lang);
    return;
  }

  if (replyId === "report_btn") {
    await showReport(from, lang);
    return;
  }

  if (replyId === "add_debt") {
    sessions[from] = { step: "add_phone", data: {} };
    await sendAddPhonePrompt(from, lang);
    return;
  }

  if (replyId === "phone_skip") {
    if (sessions[from]?.step !== "add_phone") return; // stale button tap, ignore
    sessions[from]!.data["phone"] = ""; // empty = no phone
    sessions[from]!.step = "add_name";
    await sendWhatsAppMessage(from, T[lang].askName);
    return;
  }

  if (replyId === "consent_yes" || replyId === "consent_no") {
    const step = sessions[from]?.step;
    const granted = replyId === "consent_yes";
    if (step === "add_consent") {
      // New customer being added: remember the answer, then continue to name.
      sessions[from]!.data["consent"] = granted ? "yes" : "no";
      sessions[from]!.step = "add_name";
      await sendWhatsAppMessage(from, T[lang].askName);
      return;
    }
    if (step === "consent_existing") {
      // Customer already exists: save the answer straight to their record.
      const customerId = sessions[from]!.data["consentCustomerId"];
      sessions[from] = undefined as any;
      await supabase.from("customers").update({ reminders_consent: granted }).eq("id", customerId).eq("shop_id", from);
      await sendWhatsAppMessage(from, granted ? T[lang].consentSavedYes : T[lang].consentSavedNo);
      setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
      return;
    }
    return; // stale button tap, ignore
  }

  // --- No-number duplicate-name warning buttons ---
  if (replyId === "dup_continue") {
    if (sessions[from]?.step !== "add_name_dup_check") return; // stale button tap, ignore
    sessions[from]!.data["name"] = sessions[from]!.data["pendingName"] ?? "";
    await continueAfterName(from, lang, sessions[from]!);
    return;
  }

  if (replyId === "dup_relabel") {
    if (sessions[from]?.step !== "add_name_dup_check") return; // stale button tap, ignore
    await sendWhatsAppMessage(from, T[lang].askRelabel);
    // Stays on add_name_dup_check — the next typed message becomes the final name.
    return;
  }

  if (replyId === "momo_code_skip") {
    if (sessions[from]?.step !== "momo_code") return; // stale button tap, ignore
    sessions[from]!.data["momo_code"] = "";
    sessions[from]!.step = "momo_name";
    await sendWhatsAppMessage(from, T[lang].momoAskReceiverName);
    return;
  }

  if (replyId === "momo_nickname_skip") {
    if (sessions[from]?.step !== "momo_nickname") return; // stale button tap, ignore
    sessions[from]!.data["shop_nickname"] = "";
    await saveMomoDetails(from, lang);
    return;
  }

  if (replyId === "momo_menu") {
    await sendMomoMenu(from, lang);
    return;
  }

  if (replyId === "momo_start") {
    await startMomoSetup(from, lang);
    return;
  }

  if (replyId === "set_contact_number") {
    await startContactNumberSetup(from, lang);
    return;
  }

  if (replyId === "contact_number_skip") {
    if (sessions[from]?.step !== "contact_number") return; // stale button tap, ignore
    await saveContactNumber(from, lang, null);
    return;
  }

  if (replyId === "security_info") {
    // Sends the tip alone — no menu resend. Nothing else goes out until the
    // owner sends another message or taps another button.
    await sendWhatsAppMessage(from, T[lang].securityTip);
    return;
  }

  if (replyId === "onboard_lang_en" || replyId === "onboard_lang_rw") {
    const chosenLang: Lang = replyId === "onboard_lang_rw" ? "rw" : "en";
    const { data: owner } = await supabase.from("owners").select("name, language").eq("phone", cleanPhone(from)).single();

    if (owner?.language && owner?.name) {
      const currentLang = owner.language as Lang;
      await sendWhatsAppMessage(from, T[currentLang].languageAlreadySetRegistered);
      await sendPersistentMenu(from, currentLang);
      return;
    }

    if (owner?.language && !owner?.name) {
      const currentLang = owner.language as Lang;
      await sendWhatsAppMessage(from, T[currentLang].languageAlreadySetUnregistered);
      sessions[from] = { step: "setup_shop_name", data: {} };
      await sendWhatsAppMessage(from, T[currentLang].askShopName);
      return;
    }

    await supabase.from("owners").update({ language: chosenLang }).eq("phone", cleanPhone(from));
    sessions[from] = { step: "setup_shop_name", data: {} };
    await sendWhatsAppMessage(from, T[chosenLang].askShopName);
    return;
  }

  if (replyId === "find_customer") {
    sessions[from] = { step: "find_phone", data: {} };
    await sendWhatsAppMessage(from, T[lang].findCustomerPromptSearch);
    return;
  }
  if (replyId === "change_language") {
    await sendLanguagePicker(from, lang);
    return;
  }
  if (replyId === "help_btn") {
    await sendHelp(from, lang);
    return;
  }
  if (replyId === "lang_rw") {
    await supabase.from("owners").update({ language: "rw" }).eq("phone", cleanPhone(from));
    sessions[from] = undefined as any;
    await sendWhatsAppMessage(from, T["rw"].languageSet);
    setTimeout(async () => { await sendPersistentMenu(from, "rw"); }, 500);
    return;
  }
  if (replyId === "lang_en") {
    await supabase.from("owners").update({ language: "en" }).eq("phone", cleanPhone(from));
    sessions[from] = undefined as any;
    await sendWhatsAppMessage(from, T["en"].languageSet);
    setTimeout(async () => { await sendPersistentMenu(from, "en"); }, 500);
    return;
  }
  if (replyId === "view_history") {
    const phone = sessions[from]?.data["lastPhone"];
    if (phone) await showDebtHistory(from, phone, lang);
    return;
  }
  if (replyId === "send_reminder") {
    const phone = sessions[from]?.data["lastPhone"];
    if (phone) await sendReminder(from, phone, lang);
    return;
  }
  if (replyId === "send_reminder_menu") {
    await sendReminderChoice(from, lang);
    return;
  }
  if (replyId === "reminder_specific") {
    sessions[from] = { step: "reminder_phone", data: {} };
    await sendWhatsAppMessage(from, T[lang].findReminderPromptSearch);
    return;
  }
  if (replyId === "reminder_all_choice") {
    await sendReminderAll(from, lang, req);
    return;
  }
  if (replyId === "mark_paid") {
    // If tapped from a customer lookup card (Find Customer, etc.), the
    // phone is already known — skip straight to Partial/Full Payment for
    // that customer instead of asking again. Only prompt for a number when
    // Mark as Paid is tapped with no customer already in context.
    const knownPhone = sessions[from]?.data["lastPhone"];
    if (knownPhone) {
      await startMarkPaidForPhone(from, knownPhone, lang);
      return;
    }
    sessions[from] = { step: "paid_phone", data: {} };
    await sendWhatsAppMessage(from, T[lang].markPaidPrompt);
    return;
  }
  if (replyId === "mark_paid_partial") {
    const phone = sessions[from]?.data["markPaidPhone"];
    sessions[from] = { step: "partial_amount", data: { markPaidPhone: phone ?? "" } };
    await sendWhatsAppMessage(from, T[lang].askPartialAmount);
    return;
  }
  if (replyId === "mark_paid_full") {
    const phone = sessions[from]?.data["markPaidPhone"];
    if (!phone) return;
    const { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
    if (!customer) {
      await sendWhatsAppMessage(from, T[lang].noCustomer(phone));
      await sendPersistentMenu(from, lang);
      return;
    }
    sessions[from] = undefined as any;
    // Work out what is being cleared BEFORE marking paid, so the Report can
    // count it as money collected.
    const owedBefore = await getUnpaidTotal(customer.id);
    await supabase.from("transactions").update({ paid: true }).eq("customer_id", customer.id).eq("paid", false);
    await recordPayment(from, customer.id, customer.name, owedBefore);
    await sendWhatsAppMessage(from, T[lang].allPaid(customer.name));
    await sendPersistentMenu(from, lang);
    return;
  }
  if (replyId === "show_total") {
    await showTotalDebt(from, lang);
    return;
  }
  if (replyId === "remind_all_btn") {
    await sendReminderAll(from, lang, req);
    return;
  }
  if (replyId === "view_all_customers") {
    await showAllCustomers(from, lang);
    return;
  }
  if (replyId === "edit_customer") {
    const phone = sessions[from]?.data["lastPhone"];
    if (phone) await startEditCustomer(from, phone, lang);
    return;
  }
  if (replyId === "edit_keep_name") {
    if (sessions[from]?.step !== "edit_name") return; // stale button tap, ignore
    sessions[from]!.step = "edit_phone";
    await askEditPhone(from, lang);
    return;
  }
  if (replyId === "edit_keep_phone") {
    if (sessions[from]?.step !== "edit_phone") return; // stale button tap, ignore
    await saveEditedCustomer(from, lang);
    return;
  }
}

async function handleMessage(from: string, text: string, req: Request): Promise<void> {
  if (!(await isOwner(from))) {
    // Not a shop owner — most likely a debtor replying to a reminder.
    // Honour STOP; otherwise tell them this number is owner-only.
    await handleNonOwnerMessage(from, text, req);
    return;
  }

  const lang = await getLang(from);
  await deliverPendingNotices(from);
  const session = sessions[from];

  if (session?.step === "setup_shop_name") {
    const shopName = text.trim();
    if (shopName.length < 2) {
      await sendWhatsAppMessage(from, T[lang].shopNameTooShort);
      return;
    }
    const { data: existing } = await supabase.from("owners").select("id, trial_ends_at").eq("phone", cleanPhone(from)).single();
    if (existing) {
      const updateData: Record<string, string> = { name: shopName };
      if (!existing.trial_ends_at) {
        const trialEndsAt = new Date();
        trialEndsAt.setMonth(trialEndsAt.getMonth() + 1);
        updateData["trial_ends_at"] = trialEndsAt.toISOString();
      }
      await supabase.from("owners").update(updateData).eq("phone", cleanPhone(from));
    } else {
      const trialEndsAt = new Date();
      trialEndsAt.setMonth(trialEndsAt.getMonth() + 1);
      await supabase.from("owners").insert({
        phone: cleanPhone(from),
        name: shopName,
        language: "en",
        trial_ends_at: trialEndsAt.toISOString(),
      });
    }
    sessions[from] = undefined as any;
    await sendWhatsAppMessage(from, T[lang].shopNameSaved(shopName));
    setTimeout(async () => { await sendFirstTimeMenu(from, lang); }, 500);
    return;
  }

  const upper = text.toUpperCase();

  if (upper === "HELP") {
    sessions[from] = undefined as any;
    const shopName = await getOrAskShopName(from, lang);
    if (!shopName) return;
    await sendHelp(from, lang);
    return;
  }

  if (["HI", "HELLO", "MENU", "START"].includes(upper)) {
    sessions[from] = undefined as any;
    const shopName = await getOrAskShopName(from, lang);
    if (!shopName) return;
    await sendFirstTimeMenu(from, lang);
    return;
  }

  if (upper === "@ALL") {
    await showAllCustomers(from, lang);
    return;
  }

  if (upper === "TOTAL" || upper === "IGITERANYO") {
    await showTotalDebt(from, lang);
    return;
  }

  if (["FOLLOWUP", "FOLLOW-UP", "FOLLOW UP", "GUKURIKIRANA"].includes(upper)) {
    await showFollowUp(from, lang);
    return;
  }

  if (upper === "REPORT" || upper === "RAPORO") {
    await showReport(from, lang);
    return;
  }

  if (upper === "TODAY" || upper === "UYU MUNSI") {
    await showToday(from, lang);
    return;
  }

  if (upper === "MOMO") {
    await startMomoSetup(from, lang);
    return;
  }

  if (upper === "REMIND ALL" || upper === "KWIBUTSA BOSE") {
    await sendReminderAll(from, lang, req);
    return;
  }

  if (upper.startsWith("REMIND ")) {
    const parts = text.split(" ");
    const phone = cleanPhone(parts[1] ?? "");
    if (phone.length < 9) {
      await sendWhatsAppMessage(from, T[lang].reminderInvalidNumber);
      return;
    }
    await sendReminder(from, phone, lang);
    return;
  }

  if (session) {
    // Stock, sales, expenses, suppliers, promise date and credit-limit
    // answers are handled by ../lib/shopFeatures.ts first.
    if (await features.handleSession(from, text, session, lang)) return;
    await handleSession(from, text, session, lang, req);
    return;
  }

  if (upper.startsWith("ADD ")) {
    await handleLegacyAdd(from, text, lang);
    return;
  }

  if (upper.startsWith("PAID ")) {
    await handleLegacyPaid(from, text, lang);
    return;
  }

  // Only treat this as a phone-lookup attempt if the ORIGINAL text looks
  // like a phone number (digits/spaces/+/- only, reasonable length) — not
  // just "has 9+ digits somewhere," which was matching random pasted text
  // (receipts, MoMo SMS forwards, long numeric IDs) and echoing a huge
  // garbled digit string back via noCustomer().
  const looksLikePhone = /^[\d\s+\-()]{7,15}$/.test(text.trim());
  const possiblePhone = cleanPhone(text);
  if (looksLikePhone && possiblePhone.length >= 9 && possiblePhone.length <= 12) {
    await lookupCustomer(from, possiblePhone, lang);
    return;
  }

  // Not a phone number and not a known command — for an already-registered
  // owner, try it as a name search before falling back to onboarding/menu.
  const { data: ownerCheck } = await supabase.from("owners").select("name").eq("phone", cleanPhone(from)).single();
  if (ownerCheck?.name) {
    const rows = await searchCustomersWithDetails(from, text.trim());
    await sendNameSearchResults(from, lang, rows, text.trim());
    return;
  }

  const shopName = await getOrAskShopName(from, lang);
  if (!shopName) return;
  await sendPersistentMenu(from, lang);
}

// After the customer is known: a credit sale from stock already has the item
// and amount, so it is saved straight away; a normal Add Debt asks for the item.
async function continueAfterName(from: string, lang: Lang, session: Session): Promise<void> {
  const presetAmount = session.data["presetAmount"];
  if (presetAmount) {
    session.data["item"] = session.data["presetItem"] ?? "";
    await finishAddDebt(from, lang, parseInt(presetAmount, 10));
    return;
  }
  session.step = "add_item";
  await sendWhatsAppMessage(from, T[lang].askItem);
}

async function handleSession(from: string, text: string, session: Session, lang: Lang, req: Request): Promise<void> {
  if (session.step === "add_phone") {
    const phone = cleanPhone(text);
    if (phone.length < 9) {
      await sendWhatsAppMessage(from, T[lang].invalidPhone);
      return;
    }
    session.data["phone"] = phone;
    const { data: existing } = await supabase.from("customers").select("name").eq("phone", phone).eq("shop_id", from).single();
    if (existing) {
      // Known customer: their consent status is already on file, so don't ask again.
      session.data["name"] = existing.name;
      if (session.data["presetAmount"]) {
        await continueAfterName(from, lang, session);
      } else {
        session.step = "add_item";
        await sendWhatsAppMessage(from, T[lang].existingCustomer(existing.name));
      }
    } else {
      // New customer: ask about reminder consent before collecting the name.
      session.step = "add_consent";
      await askConsent(from, lang);
    }
    return;
  }
  if (session.step === "add_consent" || session.step === "consent_existing") {
    // Owner typed something instead of tapping Yes/No — ask again.
    await askConsent(from, lang);
    return;
  }
  if (session.step === "add_name") {
    const typedName = text.trim();
    const phoneValue = session.data["phone"]; // "" means "No Number" was chosen

    if (!phoneValue) {
      // No-number customer: warn if another no-number customer already has
      // this exact name, so the owner doesn't end up with two indistinguishable "Jean"s.
      const { data: dup } = await supabase
        .from("customers")
        .select("id, name")
        .eq("shop_id", from)
        .is("phone", null)
        .ilike("name", typedName)
        .limit(1)
        .maybeSingle();
      if (dup) {
        const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", dup.id).eq("paid", false);
        const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
        const { data: lastTxArr } = await supabase.from("transactions").select("item").eq("customer_id", dup.id).order("date", { ascending: false }).limit(1);
        const lastItem = lastTxArr?.[0]?.item ?? (lang === "rw" ? "nta kiguzi" : "no items yet");
        session.data["pendingName"] = typedName;
        session.step = "add_name_dup_check";
        await sendWhatsAppInteractiveMessage(from, {
          type: "button",
          body: { text: T[lang].duplicateNameWarning(typedName, lastItem, total) },
          action: {
            buttons: [
              { type: "reply", reply: { id: "dup_continue", title: T[lang].dupContinueBtn } },
              { type: "reply", reply: { id: "dup_relabel", title: T[lang].dupRelabelBtn } },
            ],
          },
        });
        return;
      }
    }

    session.data["name"] = typedName;
    await continueAfterName(from, lang, session);
    return;
  }
  if (session.step === "add_name_dup_check") {
    // Owner typed a name directly instead of tapping a button — treat it as
    // the final (presumably relabeled) name and move on.
    session.data["name"] = text.trim();
    await continueAfterName(from, lang, session);
    return;
  }
  if (session.step === "add_item") {
    session.data["item"] = text;
    session.step = "add_amount";
    await sendAmountPrompt(from, lang);
    return;
  }
  if (session.step === "add_amount") {
    const amount = parseInt(text.replace(/\D/g, ""), 10);
    if (isNaN(amount) || amount <= 0) {
      await sendWhatsAppMessage(from, T[lang].invalidAmount);
      return;
    }
    await finishAddDebt(from, lang, amount);
    return;
  }
  if (session.step === "find_phone") {
    const trimmed = text.trim();
    const looksLikePhone = /^[\d\s+\-()]{7,15}$/.test(trimmed);
    if (looksLikePhone) {
      const phone = cleanPhone(trimmed);
      sessions[from] = { step: "idle", data: { lastPhone: phone } };
      await lookupCustomer(from, phone, lang);
    } else {
      sessions[from] = undefined as any;
      const rows = await searchCustomersWithDetails(from, trimmed);
      await sendNameSearchResults(from, lang, rows, trimmed);
    }
    return;
  }
  if (session.step === "paid_phone") {
    const phone = cleanPhone(text);
    await startMarkPaidForPhone(from, phone, lang);
    return;
  }
  if (session.step === "partial_amount") {
    const amount = parseInt(text.replace(/\D/g, ""), 10);
    if (isNaN(amount) || amount <= 0) {
      await sendWhatsAppMessage(from, T[lang].invalidAmount);
      return;
    }
    session.data["partialAmount"] = String(amount);
    session.step = "partial_item";
    await sendWhatsAppMessage(from, T[lang].askPartialItem);
    return;
  }
  if (session.step === "partial_item") {
    const item = text.trim();
    const phone = session.data["markPaidPhone"];
    const amount = parseInt(session.data["partialAmount"] ?? "0", 10);
    sessions[from] = undefined as any;
    const { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
    if (!customer) {
      await sendWhatsAppMessage(from, T[lang].noCustomer(phone ?? ""));
      await sendPersistentMenu(from, lang);
      return;
    }
    await applyPartialPayment(from, customer, amount, lang, item);
    setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
    return;
  }
  if (session.step === "reminder_phone") {
    const trimmed = text.trim();
    const looksLikePhone = /^[\d\s+\-()]{7,15}$/.test(trimmed);
    sessions[from] = undefined as any;
    if (looksLikePhone) {
      await sendReminder(from, cleanPhone(trimmed), lang);
    } else {
      const rows = await searchCustomersWithDetails(from, trimmed);
      await sendReminderNameSearchResults(from, lang, rows, trimmed);
    }
    return;
  }
  // --- MoMo setup steps ---
  if (session.step === "momo_number") {
    const number = cleanPhone(text);
    if (number.length < 9) {
      await sendWhatsAppMessage(from, T[lang].momoInvalidNumber);
      return;
    }
    session.data["momo_number"] = number;
    session.step = "momo_code";
    await askMomoCode(from, lang);
    return;
  }
  if (session.step === "momo_code") {
    session.data["momo_code"] = text.trim();
    session.step = "momo_name";
    await sendWhatsAppMessage(from, T[lang].momoAskReceiverName);
    return;
  }
  if (session.step === "momo_name") {
    const receiverName = text.trim();
    if (receiverName.length < 2) {
      await sendWhatsAppMessage(from, T[lang].momoReceiverTooShort);
      return;
    }
    session.data["momo_receiver_name"] = receiverName.toUpperCase();
    session.step = "momo_nickname";
    await askMomoNickname(from, lang);
    return;
  }
  if (session.step === "momo_nickname") {
    session.data["shop_nickname"] = text.trim();
    await saveMomoDetails(from, lang);
    return;
  }
  // --- Set Contact Number step ---
  if (session.step === "contact_number") {
    const number = cleanPhone(text);
    if (number.length < 9) {
      await sendWhatsAppMessage(from, T[lang].invalidPhone);
      return;
    }
    await saveContactNumber(from, lang, number);
    return;
  }
  // --- Edit Customer steps ---
  if (session.step === "edit_name") {
    const newName = text.trim();
    if (newName.length < 1) {
      await sendWhatsAppMessage(from, T[lang].shopNameTooShort);
      return;
    }
    session.data["editName"] = newName;
    session.step = "edit_phone";
    await askEditPhone(from, lang);
    return;
  }
  if (session.step === "edit_phone") {
    const newPhone = cleanPhone(text);
    if (newPhone.length < 9) {
      await sendWhatsAppMessage(from, T[lang].invalidPhone);
      return;
    }
    session.data["editPhone"] = newPhone;
    await saveEditedCustomer(from, lang);
    return;
  }
}

// `force` skips the cooldown check only (used by the "Send Anyway" button).
// Opt-out and consent are ALWAYS checked, even when forced.
async function sendReminder(from: string, phone: string, lang: Lang, force = false): Promise<void> {
  const { data: owner } = await supabase
    .from("owners")
    .select("name, language, momo_number, momo_code, momo_receiver_name, shop_nickname, contact_phone")
    .eq("phone", cleanPhone(from))
    .single();
  const shopName = owner?.name ?? `Shop (${from.slice(-4)})`;
  // Reminders go out in the shop OWNER's chosen language (already used as a
  // proxy for the customer base's language), independent of whatever `lang`
  // the current webhook request happens to carry.
  const reminderLang: Lang = (owner?.language as Lang) ?? "en";
  // Falls back to the owner's own WhatsApp bot number if they haven't set a
  // separate contact_phone via the Set Contact Number flow yet — the
  // template's 6th variable is never left blank.
  const contactPhone = owner?.contact_phone || cleanPhone(from);

  const { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
  if (!customer) {
    await sendWhatsAppMessage(from, T[lang].noCustomer(phone));
    return;
  }

  // Never remind someone who replied STOP.
  if (await isOptedOut(phone)) {
    await sendWhatsAppMessage(from, T[lang].reminderSkippedOptedOut(customer.name));
    setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
    return;
  }

  // No consent on record: don't send, but let the owner record it right here.
  if (!customer.reminders_consent) {
    await sendWhatsAppMessage(from, T[lang].reminderSkippedNoConsent(customer.name));
    sessions[from] = { step: "consent_existing", data: { consentCustomerId: customer.id } };
    await askConsent(from, lang);
    return;
  }

  const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
  const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  if (total === 0) {
    await sendWhatsAppMessage(from, T[lang].noDebts(customer.name));
    return;
  }

  // Cooldown: one reminder per customer per REMINDER_COOLDOWN_DAYS. The owner
  // can override a single reminder with "Send Anyway".
  if (!force && customer.last_reminded_at) {
    const sinceMs = Date.now() - new Date(customer.last_reminded_at).getTime();
    if (sinceMs < REMINDER_COOLDOWN_DAYS * DAY_MS) {
      const daysAgo = Math.floor(sinceMs / DAY_MS);
      await sendWhatsAppInteractiveMessage(from, {
        type: "button",
        body: { text: T[lang].reminderCooldown(customer.name, daysAgo) },
        action: {
          buttons: [
            { type: "reply", reply: { id: `remindforce_${customer.id}`, title: T[lang].sendAnywayBtn } },
            { type: "reply", reply: { id: "remind_cancel", title: T[lang].cancelBtn } },
          ],
        },
      });
      return;
    }
  }

  const itemizedList = await buildItemizedList(customer.id);

  const momoBlock = buildMomoBlock(owner ?? {}, reminderLang);

  const { data: insertedLog } = await supabase.from("reminder_logs").insert({
    message_id: `pending_${from}_${Date.now()}`,
    owner_phone: cleanPhone(from),
    customer_name: customer.name,
    customer_phone: phone,
    amount: total,
    status: "pending",
  }).select().single();

  // Uses the approved debt reminder template (English or Kinyarwanda,
  // depending on the owner's language). English (debt_reminder) has 6
  // variables. Kinyarwanda (debt_reminder_rw_v2) has 7 — {{6}} and {{7}}
  // are both the contact number, repeated, because the template editor
  // rejected reusing {{6}} twice in the body.
  const reminderVars = reminderLang === "rw"
    ? [customer.name, shopName, total.toLocaleString(), itemizedList, momoBlock, contactPhone, contactPhone]
    : [customer.name, shopName, total.toLocaleString(), itemizedList, momoBlock, contactPhone];
  const messageId = await sendWhatsAppTemplateMessage(
    phone,
    reminderTemplateName(reminderLang),
    metaLanguageCode(reminderLang),
    reminderVars,
  );

  // Start the cooldown clock and reset the delivery status for the Follow-up list.
  await supabase
    .from("customers")
    .update({ last_reminded_at: new Date().toISOString(), last_reminder_status: "pending" })
    .eq("id", customer.id);

  if (insertedLog) {
    const { error } = await supabase.from("reminder_logs").update({ message_id: messageId }).eq("id", insertedLog.id);
    if (error) console.error("Failed to update reminder_logs message_id:", error);
  } else {
    await supabase.from("reminder_logs").insert({
      message_id: messageId,
      owner_phone: cleanPhone(from),
      customer_name: customer.name,
      customer_phone: phone,
      amount: total,
      status: "pending",
    });
  }

  await sendWhatsAppMessage(from, T[lang].reminderSent(customer.name));
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

// --- Payment log (feeds the REPORT) ---
// transactions only store a paid flag and the remaining amount, so a payment
// leaves no trace there. This table keeps one row per payment so the report
// can say how much came back. Failures are logged but never block the
// payment itself.
async function recordPayment(shopId: string, customerId: string, customerName: string, amount: number): Promise<void> {
  if (!amount || amount <= 0) return;
  const { error } = await supabase.from("payments").insert({
    shop_id: shopId,
    customer_id: String(customerId),
    customer_name: customerName,
    amount,
  });
  if (error) console.error("Failed to record payment:", error);

  // Debt fully cleared: forget any "promised to pay by" date.
  if ((await getUnpaidTotal(customerId)) === 0) {
    await supabase.from("customers").update({ promise_date: null }).eq("id", customerId);
  }
}

async function getUnpaidTotal(customerId: string): Promise<number> {
  const { data } = await supabase.from("transactions").select("amount").eq("customer_id", customerId).eq("paid", false);
  return (data ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
}

// --- Quick amounts ---
const DEFAULT_QUICK_AMOUNTS = [500, 1000, 2000];

// Amounts the owner uses at least twice (in their last 200 entries) take the
// button slots, most frequent first. Remaining slots fall back to the defaults.
async function getQuickAmounts(shopId: string): Promise<number[]> {
  try {
    const { data: custs } = await supabase.from("customers").select("id").eq("shop_id", shopId);
    const ids = (custs ?? []).map((c: { id: string }) => c.id);
    if (ids.length === 0) return DEFAULT_QUICK_AMOUNTS;

    const { data: txs } = await supabase
      .from("transactions")
      .select("amount")
      .in("customer_id", ids)
      .order("date", { ascending: false })
      .limit(200);

    const stats = new Map<number, { count: number; firstSeen: number }>();
    (txs ?? []).forEach((t: { amount: number }, i: number) => {
      const s = stats.get(t.amount);
      if (s) s.count++;
      else stats.set(t.amount, { count: 1, firstSeen: i });
    });

    const result = [...stats.entries()]
      .filter(([, s]) => s.count >= 2)
      .sort((a, b) => b[1].count - a[1].count || a[1].firstSeen - b[1].firstSeen)
      .map(([amount]) => amount)
      .slice(0, 3);

    for (const d of DEFAULT_QUICK_AMOUNTS) {
      if (result.length >= 3) break;
      if (!result.includes(d)) result.push(d);
    }
    return result.sort((a, b) => a - b);
  } catch (err) {
    console.error("Failed to load quick amounts:", err);
    return DEFAULT_QUICK_AMOUNTS;
  }
}

async function sendAmountPrompt(from: string, lang: Lang): Promise<void> {
  const amounts = await getQuickAmounts(from);
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].askAmount },
    action: {
      buttons: amounts.map((a) => ({
        type: "reply",
        reply: { id: `amt_${a}`, title: `${a.toLocaleString()} Frw` },
      })),
    },
  });
}

// Shared by the typed amount, the quick-amount buttons and credit sales from stock.
async function finishAddDebt(from: string, lang: Lang, amount: number): Promise<void> {
  const session = sessions[from];
  if (!session) return;
  const { phone, name, item } = session.data as Record<string, string>;
  const consentGiven = session.data["consent"] === "yes";
  // phone may be "" (customer chose "No Number") — store null in that case
  const phoneValue: string | null = phone ? phone : null;

  // Credit limit: warn before saving a debt that pushes this customer over
  // the owner's limit. "Add Anyway" comes back here with limitOk set.
  if (!session.data["limitOk"]) {
    const check = await features.creditLimitCheck(from, phoneValue, amount);
    if (check) {
      session.data["pendingAmount"] = String(amount);
      session.step = "limit_confirm";
      await features.sendCreditLimitWarning(from, lang, name ?? "", check);
      return;
    }
  }
  // Set when this debt is a credit sale from stock.
  const stockId = session.data["stockId"];
  const stockQty = parseInt(session.data["stockQty"] ?? "0", 10);

  sessions[from] = undefined as any;

  let customer: any = null;
  if (phoneValue) {
    const { data: existingCustomer } = await supabase.from("customers").select("*").eq("phone", phoneValue).eq("shop_id", from).single();
    customer = existingCustomer;
  }
  if (!customer) {
    const { data: newCustomer, error } = await supabase.from("customers").insert({ phone: phoneValue, name, shop_id: from, reminders_consent: consentGiven }).select().single();
    if (error || !newCustomer) {
      await sendWhatsAppMessage(from, T[lang].somethingWrong);
      return;
    }
    customer = newCustomer;
  }
  const { error: txError } = await supabase.from("transactions").insert({ customer_id: customer.id, item, amount, paid: false });
  if (txError) {
    await sendWhatsAppMessage(from, T[lang].somethingWrong);
    return;
  }
  const total = await getUnpaidTotal(customer.id);
  await sendWhatsAppMessage(from, T[lang].debtSaved(customer.name, phoneValue || (lang === "rw" ? "nta nimero" : "no number"), item ?? "", amount, total));

  // Credit sale from stock: take the pieces out of stock and log the profit.
  if (stockId && stockQty > 0) {
    await features.completeCreditSale(from, lang, {
      stockId,
      qty: stockQty,
      revenue: amount,
      customerName: customer.name,
    });
  }

  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

// --- Undo last debt ---
async function sendUndoConfirm(from: string, lang: Lang, customerId: string): Promise<void> {
  const { data: customer } = await supabase.from("customers").select("id, name").eq("id", customerId).eq("shop_id", from).single();
  if (!customer) {
    await sendWhatsAppMessage(from, T[lang].noCustomerText);
    await sendPersistentMenu(from, lang);
    return;
  }
  const { data: lastArr } = await supabase
    .from("transactions")
    .select("id, item, amount, paid, date")
    .eq("customer_id", customer.id)
    .order("date", { ascending: false })
    .limit(1);
  const last = lastArr?.[0];
  if (!last) {
    await sendWhatsAppMessage(from, T[lang].undoNothing(customer.name));
    await sendPersistentMenu(from, lang);
    return;
  }
  if (last.paid) {
    await sendWhatsAppMessage(from, T[lang].undoAlreadyPaid(customer.name));
    await sendPersistentMenu(from, lang);
    return;
  }
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].undoConfirm(customer.name, last.item, last.amount, formatFullTimestamp(last.date)) },
    action: {
      buttons: [
        { type: "reply", reply: { id: `undo_yes_${last.id}`, title: T[lang].undoYes } },
        { type: "reply", reply: { id: "remind_cancel", title: T[lang].cancelBtn } },
      ],
    },
  });
}

async function undoDebt(from: string, lang: Lang, txId: string): Promise<void> {
  const { data: tx } = await supabase.from("transactions").select("id, item, amount, paid, customer_id").eq("id", txId).maybeSingle();
  if (!tx) {
    // Already deleted (e.g. the button was tapped twice).
    await sendWhatsAppMessage(from, T[lang].undoGone);
    await sendPersistentMenu(from, lang);
    return;
  }
  // The entry must belong to a customer of THIS shop.
  const { data: customer } = await supabase.from("customers").select("id, name").eq("id", tx.customer_id).eq("shop_id", from).single();
  if (!customer) {
    await sendWhatsAppMessage(from, T[lang].noCustomerText);
    await sendPersistentMenu(from, lang);
    return;
  }
  if (tx.paid) {
    await sendWhatsAppMessage(from, T[lang].undoAlreadyPaid(customer.name));
    await sendPersistentMenu(from, lang);
    return;
  }
  const { error } = await supabase.from("transactions").delete().eq("id", tx.id);
  if (error) {
    await sendWhatsAppMessage(from, T[lang].somethingWrong);
    return;
  }
  const total = await getUnpaidTotal(customer.id);
  await sendWhatsAppMessage(from, T[lang].undoDone(customer.name, tx.item, tx.amount, total));
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

// --- Today ---
// Kigali is UTC+2 with no DST, so "today" starts at 22:00 UTC the day before.
const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000;
function startOfTodayKigali(): Date {
  const shifted = new Date(Date.now() + KIGALI_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - KIGALI_OFFSET_MS);
}

async function showToday(from: string, lang: Lang): Promise<void> {
  const startIso = startOfTodayKigali().toISOString();

  const { data: custs } = await supabase.from("customers").select("id").eq("shop_id", from);
  const ids = (custs ?? []).map((c: { id: string }) => c.id);
  if (ids.length === 0) {
    await sendWhatsAppMessage(from, T[lang].noCustomers);
    await sendPersistentMenu(from, lang);
    return;
  }

  const { data: addedTx } = await supabase.from("transactions").select("amount").in("customer_id", ids).gte("date", startIso);
  const { data: paidToday, error } = await supabase.from("payments").select("amount").eq("shop_id", from).gte("created_at", startIso);
  if (error) console.error("Failed to load today's payments:", error);
  const { debtors } = await analyzeDebtors(from);

  const added = (addedTx ?? []).reduce((s: number, t: { amount: number }) => s + t.amount, 0);
  const paid = (paidToday ?? []).reduce((s: number, p: { amount: number }) => s + p.amount, 0);
  const owedNow = debtors.reduce((s, d) => s + d.total, 0);

  const t = T[lang];
  await sendWhatsAppMessage(
    from,
    [
      t.todayHeader,
      "",
      t.todayDebts(added, (addedTx ?? []).length),
      t.todayPayments(paid, (paidToday ?? []).length),
      t.todayOwed(owedNow, debtors.length),
    ].join("\n")
  );
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

async function applyPartialPayment(from: string, customer: { id: string; name: string; phone: string }, paymentAmount: number, lang: Lang, item: string): Promise<void> {
  const { data: unpaidTx } = await supabase.from("transactions").select("*").eq("customer_id", customer.id).eq("paid", false).order("date", { ascending: true });
  if (!unpaidTx || unpaidTx.length === 0) {
    await sendWhatsAppMessage(from, T[lang].noUnpaid(customer.name));
    return;
  }
  const totalBefore = unpaidTx.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  if (paymentAmount >= totalBefore) {
    await supabase.from("transactions").update({ paid: true }).eq("customer_id", customer.id).eq("paid", false);
    // Count only what was actually owed, even if the owner typed a bigger number.
    await recordPayment(from, customer.id, customer.name, totalBefore);
    await sendWhatsAppMessage(from, T[lang].fullPaid(customer.name, paymentAmount));
    return;
  }
  let remaining = paymentAmount;
  for (const tx of unpaidTx) {
    if (remaining <= 0) break;
    if (remaining >= tx.amount) {
      await supabase.from("transactions").update({ paid: true }).eq("id", tx.id);
      remaining -= tx.amount;
    } else {
      await supabase.from("transactions").update({ amount: tx.amount - remaining }).eq("id", tx.id);
      remaining = 0;
    }
  }
  await recordPayment(from, customer.id, customer.name, paymentAmount);
  const totalAfter = totalBefore - paymentAmount;
  await sendWhatsAppMessage(from, T[lang].partialPaid(customer.name, paymentAmount, totalAfter, item));
}

async function lookupCustomer(from: string, phone: string, lang: Lang): Promise<void> {
  const { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
  if (!customer) {
    await sendWhatsAppMessage(from, T[lang].noCustomer(phone));
    await sendPersistentMenu(from, lang);
    return;
  }
  const { data: transactions } = await supabase.from("transactions").select("*").eq("customer_id", customer.id).order("date", { ascending: false });
  const unpaid = (transactions ?? []).filter((t: { paid: boolean }) => !t.paid);
  const totalOwed = unpaid.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  const lastTx = transactions?.[0];
  // FIX: now includes hour/minute/second, not just the date, so owners can
  // see exactly when the last visit happened, not just which day.
  const lastDate = lastTx ? formatFullTimestamp(lastTx.date) : "N/A";
  sessions[from] = { step: "idle", data: { lastPhone: phone } };
  let summaryText = T[lang].customerSummary(customer.name, phone, lastTx?.item ?? "N/A", totalOwed, lastDate);
  if (await isOptedOut(phone)) summaryText += `\n${T[lang].optedOutLine}`;
  if (customer.promise_date) summaryText += `\n${features.promiseLine(lang, customer.promise_date)}`;
  await sendWhatsAppMessage(from, summaryText);
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].whatToDo },
    action: {
      buttons: [
        { type: "reply", reply: { id: "view_history", title: T[lang].viewHistory } },
        { type: "reply", reply: { id: "send_reminder", title: T[lang].sendReminder } },
        { type: "reply", reply: { id: "mark_paid", title: T[lang].markPaidBtn } },
      ],
    },
  });
  // Sent as a second bubble since a single WhatsApp button message caps out
  // at 3 buttons and the row above is already full. Undo Last Debt sits just
  // above Edit Customer; Promise Date lets the owner note when they promised to pay.
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: "\u200B" },
    action: {
      buttons: [
        { type: "reply", reply: { id: `undo_last_${customer.id}`, title: T[lang].undoBtn } },
        { type: "reply", reply: { id: "edit_customer", title: T[lang].editBtn } },
        { type: "reply", reply: { id: "promise_set", title: features.strings[lang].promiseBtn } },
      ],
    },
  });
}

async function showDebtHistory(from: string, phone: string, lang: Lang): Promise<void> {
  const { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
  if (!customer) {
    await sendWhatsAppMessage(from, T[lang].noCustomerText);
    return;
  }
  const { data: transactions } = await supabase.from("transactions").select("*").eq("customer_id", customer.id).order("date", { ascending: false });
  if (!transactions || transactions.length === 0) {
    await sendWhatsAppMessage(from, T[lang].noHistory(customer.name));
    await sendPersistentMenu(from, lang);
    return;
  }
  const lines = transactions.map((t: { item: string; amount: number; paid: boolean; date: string }) => {
    const d = new Date(t.date);
    const datePart = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Kigali" });
    const timePart = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Kigali" });
    const status = t.paid ? "✅ Paid" : "❌ Unpaid";
    return `• ${t.item} — ${t.amount.toLocaleString()} Frw — ${datePart} ${timePart} — ${status}`;
  });
  const unpaid = transactions.filter((t: { paid: boolean }) => !t.paid);
  const total = unpaid.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  await sendWhatsAppMessage(from, `${T[lang].historyHeader(customer.name)}\n\n${lines.join("\n")}\n\n${T[lang].totalOwed(total)}`);
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

async function showAllCustomers(from: string, lang: Lang): Promise<void> {
  const { data: customers } = await supabase.from("customers").select("*").eq("shop_id", from).order("created_at", { ascending: true });
  if (!customers || customers.length === 0) {
    await sendWhatsAppMessage(from, T[lang].noCustomers);
    await sendPersistentMenu(from, lang);
    return;
  }
  const lines: string[] = [];
  for (const customer of customers) {
    const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
    const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
    const date = new Date(customer.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const debtStatus = total > 0 ? `${total.toLocaleString()} Frw` : T[lang].cleared;
    lines.push(`👤 *${customer.name}*\n📞 ${customer.phone ?? (lang === "rw" ? "nta nimero" : "no number")}\n💰 ${T[lang].owes}: ${debtStatus}\n📅 ${T[lang].registered}: ${date}`);
  }
  const chunkSize = 5;
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);
    const header = i === 0 ? T[lang].allCustomersHeader(customers.length) : T[lang].allCustomersContinued;
    await sendWhatsAppMessage(from, header + chunk.join("\n\n"));
  }
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

async function sendReminderAll(from: string, lang: Lang, req: Request): Promise<void> {
  const { data: owner } = await supabase
    .from("owners")
    .select("name, language, momo_number, momo_code, momo_receiver_name, shop_nickname, contact_phone")
    .eq("phone", cleanPhone(from))
    .single();
  const shopName = owner?.name ?? `Shop (${from.slice(-4)})`;
  const reminderLang: Lang = (owner?.language as Lang) ?? "en";
  const contactPhone = owner?.contact_phone || cleanPhone(from);

  const momoBlock = buildMomoBlock(owner ?? {}, reminderLang);

  const { data: customers } = await supabase.from("customers").select("*").eq("shop_id", from);

  if (!customers || customers.length === 0) {
    await sendWhatsAppMessage(from, T[lang].noCustomers);
    return;
  }

  // One query up front for everyone who has replied STOP among this shop's
  // customers, instead of one lookup per customer.
  const optedOut = await getOptedOutSet(customers.map((c: { phone: string | null }) => c.phone ?? ""));

  const lines: string[] = [];
  const skippedOptedOut: string[] = [];
  const skippedNoConsent: string[] = [];
  const skippedRecent: string[] = [];
  let grandTotal = 0;
  let sentCount = 0;
  let failedCount = 0;

  for (const customer of customers) {
    // FIX: skip customers with no phone — nothing to send a WhatsApp reminder to.
    if (!customer.phone) continue;

    const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
    const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
    if (total === 0) continue;

    // Only customers who owe money get reported as skipped, so the owner
    // isn't told about people who had nothing to be reminded of anyway.
    if (optedOut.has(customer.phone)) {
      skippedOptedOut.push(customer.name);
      continue;
    }
    if (!customer.reminders_consent) {
      skippedNoConsent.push(customer.name);
      continue;
    }
    // Cooldown: skip anyone reminded within the last REMINDER_COOLDOWN_DAYS.
    if (customer.last_reminded_at && Date.now() - new Date(customer.last_reminded_at).getTime() < REMINDER_COOLDOWN_DAYS * DAY_MS) {
      skippedRecent.push(customer.name);
      continue;
    }

    const itemizedList = await buildItemizedList(customer.id);

    const { data: insertedLog } = await supabase.from("reminder_logs").insert({
      message_id: `pending_${customer.phone}_${Date.now()}`,
      owner_phone: cleanPhone(from),
      customer_name: customer.name,
      customer_phone: customer.phone,
      amount: total,
      status: "pending",
    }).select().single();

    try {
      // Same template-based send as sendReminder — required since bulk reminders
      // almost always go to customers outside the 24h free-form messaging window.
      // English (debt_reminder) has 6 variables; Kinyarwanda (debt_reminder_rw_v2)
      // has 7 — {{6}} and {{7}} are both the contact number, repeated.
      const bulkReminderVars = reminderLang === "rw"
        ? [customer.name, shopName, total.toLocaleString(), itemizedList, momoBlock, contactPhone, contactPhone]
        : [customer.name, shopName, total.toLocaleString(), itemizedList, momoBlock, contactPhone];
      const messageId = await sendWhatsAppTemplateMessage(
        customer.phone,
        reminderTemplateName(reminderLang),
        metaLanguageCode(reminderLang),
        bulkReminderVars,
      );
      if (insertedLog) {
        await supabase.from("reminder_logs").update({ message_id: messageId }).eq("id", insertedLog.id);
      }
      // Start the cooldown clock and reset the delivery status for the Follow-up list.
      await supabase
        .from("customers")
        .update({ last_reminded_at: new Date().toISOString(), last_reminder_status: "pending" })
        .eq("id", customer.id);
      lines.push(`👤 ${customer.name} — ${total.toLocaleString()} Frw`);
      grandTotal += total;
      sentCount++;
    } catch (err) {
      req.log.error({ err, customerPhone: customer.phone }, "Bulk reminder send failed");
      lines.push(`❌ ${customer.name} — failed`);
      failedCount++;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const skippedNote =
    (skippedOptedOut.length > 0 ? T[lang].remindAllSkippedOptOut(skippedOptedOut.join(", ")) : "") +
    (skippedNoConsent.length > 0 ? T[lang].remindAllSkippedNoConsent(skippedNoConsent.join(", ")) : "") +
    (skippedRecent.length > 0 ? T[lang].remindAllSkippedRecent(skippedRecent.join(", ")) : "");

  if (sentCount === 0 && failedCount > 0) {
    // FIX: distinguish "nothing to send" from "sends failed" — previously
    // both cases showed remindAllNone ("No customers with outstanding
    // debts"), which was misleading when debts existed but every send threw.
    await sendWhatsAppMessage(from, (lang === "rw"
      ? "❌ Ubutumwa ntabwo bwoherejwe — hari ikibazo. Reba raporo cyangwa gerageza nanone."
      : "❌ Reminders failed to send — please check your template/setup and try again.") + skippedNote);
    return;
  }

  if (sentCount === 0) {
    if (skippedNote) {
      // Debts exist, but everyone was skipped for opt-out / missing consent / cooldown.
      await sendWhatsAppMessage(from, T[lang].remindAllNoneSent + skippedNote);
      setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
      return;
    }
    await sendWhatsAppMessage(from, T[lang].remindAllNone);
    return;
  }

  const summary = T[lang].remindAllSummary(sentCount, grandTotal) + lines.join("\n") + T[lang].remindAllTotal(grandTotal) + skippedNote;
  await sendWhatsAppMessage(from, summary);
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

async function showTotalDebt(from: string, lang: Lang): Promise<void> {
  const { data: customers } = await supabase.from("customers").select("*").eq("shop_id", from);

  if (!customers || customers.length === 0) {
    await sendWhatsAppMessage(from, T[lang].noCustomers);
    return;
  }

  const debtors: { name: string; total: number }[] = [];
  let grandTotal = 0;

  for (const customer of customers) {
    // NOTE: total-debt summary intentionally includes no-phone customers —
    // only reminder sending should skip them, not the debt totals.
    const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
    const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
    if (total > 0) {
      debtors.push({ name: customer.name, total });
      grandTotal += total;
    }
  }

  if (debtors.length === 0) {
    await sendWhatsAppMessage(from, T[lang].totalDebtNone);
    return;
  }

  debtors.sort((a, b) => b.total - a.total);
  const topDebtors = debtors.slice(0, 5);
  const debtorLines = topDebtors.map(d => `👤 ${d.name} — ${d.total.toLocaleString()} Frw`).join("\n");

  const message =
    `${T[lang].totalDebtHeader}\n` +
    `${T[lang].totalDebtCustomerCount(debtors.length)}\n` +
    `${T[lang].totalDebtGrandTotal(grandTotal)}\n\n` +
    `${T[lang].totalDebtTopDebtors}\n${debtorLines}`;

  await sendWhatsAppMessage(from, message);
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

// --- Follow-up list + Report ---
type FollowUpReason = "no_phone" | "opted_out" | "no_consent" | "failed" | "old" | "promise_missed";

interface DebtorInfo {
  id: string;
  name: string;
  phone: string | null;
  total: number;
  oldestDays: number;
  reasons: FollowUpReason[];
  promiseDate: string | null;
}

function reasonText(lang: Lang, reason: FollowUpReason, oldestDays: number, promiseDate: string | null): string {
  const t = T[lang];
  switch (reason) {
    case "no_phone": return t.reasonNoPhone;
    case "opted_out": return t.reasonOptedOut;
    case "no_consent": return t.reasonNoConsent;
    case "failed": return t.reasonFailed;
    case "old": return t.reasonOld(oldestDays);
    case "promise_missed": return promiseDate ? features.reasonPromise(lang, promiseDate) : "";
  }
}

// Loads every customer of a shop who currently owes money, with the reasons
// (if any) the owner should follow up personally. Two queries total for
// customers + transactions, instead of one per customer.
async function analyzeDebtors(shopId: string): Promise<{ debtors: DebtorInfo[]; customerCount: number }> {
  const { data: customers } = await supabase.from("customers").select("*").eq("shop_id", shopId);
  if (!customers || customers.length === 0) return { debtors: [], customerCount: 0 };

  const ids = customers.map((c: { id: string }) => c.id);
  const { data: unpaidTx } = await supabase
    .from("transactions")
    .select("customer_id, amount, date")
    .in("customer_id", ids)
    .eq("paid", false);

  const byCustomer = new Map<string, { total: number; oldest: number }>();
  for (const tx of unpaidTx ?? []) {
    const ts = new Date(tx.date).getTime();
    const cur = byCustomer.get(tx.customer_id) ?? { total: 0, oldest: ts };
    cur.total += tx.amount;
    if (ts < cur.oldest) cur.oldest = ts;
    byCustomer.set(tx.customer_id, cur);
  }

  const optedOut = await getOptedOutSet(customers.map((c: { phone: string | null }) => c.phone ?? ""));
  const today = features.kigaliDate();

  const debtors: DebtorInfo[] = [];
  for (const c of customers) {
    const agg = byCustomer.get(c.id);
    if (!agg || agg.total <= 0) continue;
    const oldestDays = Math.floor((Date.now() - agg.oldest) / DAY_MS);
    const reasons: FollowUpReason[] = [];
    if (!c.phone) reasons.push("no_phone");
    else if (optedOut.has(c.phone)) reasons.push("opted_out");
    else if (!c.reminders_consent) reasons.push("no_consent");
    if (c.phone && c.last_reminder_status === "failed") reasons.push("failed");
    if (oldestDays >= OLD_DEBT_DAYS) reasons.push("old");
    // They promised a date and it has passed without payment.
    if (c.promise_date && c.promise_date < today) reasons.push("promise_missed");
    debtors.push({
      id: c.id,
      name: c.name,
      phone: c.phone ?? null,
      total: agg.total,
      oldestDays,
      reasons,
      promiseDate: c.promise_date ?? null,
    });
  }
  return { debtors, customerCount: customers.length };
}

async function showFollowUp(from: string, lang: Lang): Promise<void> {
  const { debtors, customerCount } = await analyzeDebtors(from);
  if (customerCount === 0) {
    await sendWhatsAppMessage(from, T[lang].noCustomers);
    await sendPersistentMenu(from, lang);
    return;
  }

  const flagged = debtors
    .filter((d) => d.reasons.length > 0)
    .sort((a, b) => b.oldestDays - a.oldestDays);

  if (flagged.length === 0) {
    await sendWhatsAppMessage(from, T[lang].followUpNone);
    setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
    return;
  }

  const shown = flagged.slice(0, FOLLOWUP_MAX);
  const lines = shown.map((d) =>
    `👤 *${d.name}* — ${d.total.toLocaleString()} Frw\n📞 ${d.phone ?? (lang === "rw" ? "nta nimero" : "no number")}\n⚠️ ${d.reasons.map((r) => reasonText(lang, r, d.oldestDays, d.promiseDate)).join("; ")}`
  );

  const chunkSize = 5;
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);
    const header = i === 0 ? T[lang].followUpHeader(flagged.length) : T[lang].followUpContinued;
    await sendWhatsAppMessage(from, header + chunk.join("\n\n"));
  }
  if (flagged.length > shown.length) {
    await sendWhatsAppMessage(from, T[lang].followUpMore(flagged.length - shown.length));
  }
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

async function showReport(from: string, lang: Lang): Promise<void> {
  const { debtors, customerCount } = await analyzeDebtors(from);
  if (customerCount === 0) {
    await sendWhatsAppMessage(from, T[lang].noCustomers);
    await sendPersistentMenu(from, lang);
    return;
  }

  const owedNow = debtors.reduce((sum, d) => sum + d.total, 0);
  const oldestDays = debtors.reduce((max, d) => Math.max(max, d.oldestDays), 0);
  const followUpCount = debtors.filter((d) => d.reasons.length > 0).length;

  const since30 = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const { data: payments, error } = await supabase
    .from("payments")
    .select("amount, created_at")
    .eq("shop_id", from)
    .gte("created_at", since30);
  if (error) console.error("Failed to load payments for report:", error);

  const cut7 = Date.now() - 7 * DAY_MS;
  let collected30 = 0;
  let count30 = 0;
  let collected7 = 0;
  for (const p of payments ?? []) {
    collected30 += p.amount;
    count30++;
    if (new Date(p.created_at).getTime() >= cut7) collected7 += p.amount;
  }

  const t = T[lang];
  const lines: string[] = [
    t.reportHeader,
    "",
    t.reportOwed(owedNow, debtors.length),
    t.reportCollected30(collected30, count30),
    t.reportCollected7(collected7),
  ];
  if (debtors.length > 0) lines.push(t.reportOldest(oldestDays));
  if (followUpCount > 0) lines.push(t.reportFollowUp(followUpCount));
  lines.push("", t.reportNote);

  await sendWhatsAppMessage(from, lines.join("\n"));
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

async function handleLegacyAdd(from: string, text: string, lang: Lang): Promise<void> {
  const parts = text.split(" ");
  if (parts.length < 5) {
    await sendWhatsAppMessage(from, "Format: ADD <phone> <name> <item> <amount>\ne.g. ADD 0788123456 Jean iPhone11screen 5000");
    return;
  }
  const phone = cleanPhone(parts[1]!);
  const name = parts[2]!;
  const item = parts[3]!;
  const amount = parseInt(parts[4]!, 10);
  if (isNaN(amount)) {
    await sendWhatsAppMessage(from, T[lang].invalidAmount);
    return;
  }
  let isNewCustomer = false;
  let { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
  if (!customer) {
    // New customers start with no reminder consent; we ask right after saving.
    const { data: newCustomer, error } = await supabase.from("customers").insert({ phone, name, shop_id: from, reminders_consent: false }).select().single();
    if (error || !newCustomer) {
      await sendWhatsAppMessage(from, T[lang].somethingWrong);
      return;
    }
    customer = newCustomer;
    isNewCustomer = true;
  }
  const { error: txError } = await supabase.from("transactions").insert({ customer_id: customer.id, item, amount, paid: false });
  if (txError) {
    await sendWhatsAppMessage(from, T[lang].somethingWrong);
    return;
  }
  const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
  const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  await sendWhatsAppMessage(from, T[lang].debtSaved(name, phone, item, amount, total));

  if (isNewCustomer) {
    sessions[from] = { step: "consent_existing", data: { consentCustomerId: customer.id } };
    await askConsent(from, lang);
  }
}

async function handleLegacyPaid(from: string, text: string, lang: Lang): Promise<void> {
  const parts = text.split(" ");
  const phone = cleanPhone(parts[1] ?? "");
  const partialAmount = parts[2] ? parseInt(parts[2].replace(/\D/g, ""), 10) : null;
  const { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
  if (!customer) {
    await sendWhatsAppMessage(from, T[lang].noCustomer(phone));
    return;
  }
  if (partialAmount && !isNaN(partialAmount)) {
    await applyPartialPayment(from, customer, partialAmount, lang, lang === "rw" ? "Ntabwo byaranzwe" : "Not specified");
  } else {
    const owedBefore = await getUnpaidTotal(customer.id);
    await supabase.from("transactions").update({ paid: true }).eq("customer_id", customer.id).eq("paid", false);
    await recordPayment(from, customer.id, customer.name, owedBefore);
    await sendWhatsAppMessage(from, T[lang].allPaid(customer.name));
  }
}

// Connect the feature module (menus, stock, sales, profit, expenses, supplier
// debts, auto-reminders, promise dates, credit limit) to this file's helpers.
features.initShopFeatures({
  sessions,
  cleanPhone,
  sendMenu: sendPersistentMenu,
  sendAddDebtPhonePrompt: sendAddPhonePrompt,
  buildItemizedList,
  buildMomoBlock,
  reminderTemplateName,
  metaLanguageCode,
  getOptedOutSet,
  reminderCooldownDays: REMINDER_COOLDOWN_DAYS,
});

export default router;