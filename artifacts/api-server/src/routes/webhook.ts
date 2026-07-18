import { Router, type IRouter, type Request, type Response } from "express";
import { sendWhatsAppMessage, sendWhatsAppInteractiveMessage, sendWhatsAppTemplateMessage } from "../lib/whatsapp.js";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const VERIFY_TOKEN =
  process.env["WHATSAPP_VERIFY_TOKEN"] ?? "ShopBrain_kigali_2026";

interface Session {
  step: string;
  data: Record<string, string>;
}

const sessions: Record<string, Session> = {};

const T = {
  en: {
    welcome: "👋 Welcome to *ShopBrain*\nWhat would you like to do?",
    addDebt: "➕ Add Debt",
    findCustomer: "🔍 Find Customer",
    changeLanguage: "🌐 Change Language",
    askPhone: "➕ *Add Debt*\n\nWhat is the customer's phone number?\n\ne.g. 0788123456",
    askName: "What is the customer's name?",
    askItem: "What item did they take?",
    askAmount: "How much do they owe? (in Frw)",
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
    markPaidPrompt: "✅ *Mark as Paid*\n\nEnter the customer's phone number:",
    askPartialAmount: "💰 How much is the customer paying?",
    askPartialItem: "📦 What is this payment for?",
    whatToDo: "What would you like to do?",
    existingCustomer: (name: string) => `👤 Existing customer: *${name}*\n\nWhat item did they take?`,
    noHistory: (name: string) => `📋 No transactions found for ${name}.`,
    historyHeader: (name: string) => `📋 *Debt History — ${name}*`,
    totalOwed: (total: number) => `💰 *Total owed: ${total.toLocaleString()} Frw*`,
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
🔍 Find Customer — look up a customer's balance
✅ Mark as Paid — enter their number, then choose Partially or Full Payment
🔔 Send Reminder — remind one customer, or everyone at once
🌐 Change Language — switch Kinyarwanda/English

*Typed shortcuts (optional):*
• TOTAL — see your total outstanding debt
• REMIND ALL — remind every customer who owes you
• REMIND <phone> — remind one specific customer
• @ALL — list every customer you've registered
• MENU — show the quick-action buttons again
• HELP — show this message again`,
    securityTip: `🔒 *Security Tip — Protect your data:*\n\nLock this ShopBrain chat so only you can open it.\n\n*How to do it:*\n1. Long press this chat in your WhatsApp inbox\n2. Tap the lock icon 🔒\n3. It will now require your fingerprint or Face ID to open\n\nYour customer data stays private even if someone picks up your phone.`,
  },
  rw: {
     welcome: "👋 Murakaza neza kuri *ShopBrain*\nUrashaka gukora iki?",
    addDebt: "➕ Ongeraho Umwenda",
    findCustomer: "🔍 Shakisha Umukiriya",
    changeLanguage: "🌐 Guhindura Ururimi",
    askPhone: "➕ *Ongeraho Umwenda*\n\nAndika nimero y'umukiriya?\n\nUrugero: 0788123456",
    askName: "Andika izina ry'umukiriya?",
    askItem: "Igicuruzwa atwaye?",
    askAmount: "Agusigayemo angahe? (muri Frw)",
    invalidPhone: "❌ Nimero si yo. Andika nimero y'umukiriya ikurikira:",
    invalidAmount: "❌ Umubare si wo. Andika umubare urugero 5000",
    debtSaved: (name: string, phone: string, item: string, amount: number, total: number) =>
      `✅ *Umwenda Wabitswe!*\n\n👤 ${name} (${phone})\n📦 Igicuruzwa: ${item}\n💰 Byongewe: ${amount.toLocaleString()} Frw\n📊 Asigayemo: ${total.toLocaleString()} Frw`,
    noCustomer: (phone: string) => `❌ Uyu mukiriya ntago yanditse muri sisteme ${phone}.`,
    noCustomerText: "❌ Uyu mukiriya ntago yanditse muri sisteme.",
    allPaid: (name: string) => `✅ Amadeni yose yabazwe nkayishyuwe kuri *${name}*.`,
    viewHistory: "📋 Reba amadeni",
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
    markPaidPrompt: "✅ *Emeza Kwishyura*\n\nAndika nimero y'umukiriya:",
    askPartialAmount: "💰 Umukiriya ariha angahe?",
    askPartialItem: "📦 Ni iyihe kiguzi cy'iri shyura?",
    whatToDo: "Urashaka gukora iki?",
    existingCustomer: (name: string) => `👤 Umukiriya warahise: *${name}*\n\nIgicuruzwa atwaye?`,
    noHistory: (name: string) => `📋 Nta makuru yabonetse kuri ${name}.`,
    historyHeader: (name: string) => `📋 *Urutonde rw'Amadeni — ${name}*`,
    totalOwed: (total: number) => `💰 *Asigayemo: ${total.toLocaleString()} Frw*`,
    noCustomers: "📋 Nta bakiriya wanditse.",
    allCustomersHeader: (count: number) => `📋 *Abakiriya Bose (${count})*\n\n`,
    allCustomersContinued: "📋 *Bikomeza...*\n\n",
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
🔍 Shakisha Umukiriya — reba amafaranga umukiriya asigayemo
✅ Emeza Kwishyura — andika nimero, hanyuma uhitemo Igice cyangwa Byose
🔔 Kwibutsa — wibutsa umukiriya umwe, cyangwa bose icyarimwe
🌐 Guhindura Ururimi — hindura Ikinyarwanda/Icyongereza

*Amabwiriza wandika (ntibisabwa):*
• TOTAL cyangwa IGITERANYO — reba igiteranyo cy'amadeni yose
• REMIND ALL cyangwa KWIBUTSA BOSE — wibutsa abakiriya bose bafite amadeni
• REMIND <nimero> — wibutsa umukiriya umwe
• @ALL — reba abakiriya bawe bose
• MENU — garuka kuri buto z'ibanze
• HELP — reba ubu butumwa nanone`,
    securityTip: `🔒 *Ubutumwa bw'Umutekano:*\n\nFunga iki gikorwa cya ShopBrain kugira ngo wowe gusa ubashobore kukibona.\n\n*Uko bikorwa:*\n1. Fata iki gikorwa mu rutonde rwa WhatsApp\n2. Kanda ikimenyetso cy'isuri 🔒\n3. Bizasaba igikumwe cyawe cyangwa ubuso bwawe\n\nAmakuru y'abakiriya bawe azaba ari mu mutekano.`,
  },
};

type Lang = "en" | "rw";

function cleanPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "250" + cleaned.slice(1);
  }
  return cleaned;
}

// isOwner now checks the Supabase `owners` table instead of a hardcoded array.
// To add a new owner: insert a row in `owners` with just `phone` set (leave `name`
// blank — the bot fills it in automatically the first time they text "HI").
// To remove an owner: delete their row. No redeploy needed either way.
async function isOwner(from: string): Promise<boolean> {
  const { data } = await supabase
    .from("owners")
    .select("phone")
    .eq("phone", cleanPhone(from))
    .single();
  return !!data;
}

// Default language is English ("en"). Kinyarwanda is opt-in via the language picker.
async function getLang(from: string): Promise<Lang> {
  const { data } = await supabase.from("owners").select("language").eq("phone", cleanPhone(from)).single();
  return (data?.language as Lang) ?? "en";
}

interface WhatsAppMessage {
  from: string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
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
  res.send("<html><body><h1>ShopBrain Privacy Policy</h1><p>ShopBrain collects WhatsApp phone numbers and debt records solely to provide debt tracking services to shop owners. Data is stored securely and never shared with third parties. Contact: +250 795 120 043</p></body></html>");
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
    try {
      if (msg.type === "interactive") {
        const replyId = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || "";
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

// CHANGED: now checks owner.language too. If the owner has never picked a
// language, we send the bilingual onboarding language picker FIRST, before
// ever asking for the shop name. Once language is set, shop name prompt is
// sent in the correct language.
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

// NEW: shown ONLY once, to a brand-new owner row (phone exists in `owners` but
// `language` is not yet set). Bilingual text since we don't know their
// preference yet — this always comes before the shop name question.
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

// Shown ONLY in two situations: right after a shop owner finishes signup
// (setting their shop name), and whenever they type "MENU". One button bubble
// (Add Debt, Change Language, Help) followed by the security tip.
async function sendFirstTimeMenu(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].welcome },
    action: {
      buttons: [
        { type: "reply", reply: { id: "add_debt", title: T[lang].addDebt } },
        { type: "reply", reply: { id: "change_language", title: T[lang].changeLanguage } },
        { type: "reply", reply: { id: "help_btn", title: "❓ Help" } },
      ],
    },
  });
  await sendWhatsAppMessage(from, T[lang].securityTip);
}

// Sends the HELP explanation text, then falls through to the standard
// persistent menu (Help is one of the regular actions, not the first-time UI).
async function sendHelp(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppMessage(from, `${T[lang].helpTitle}\n\n${T[lang].helpBody}`);
  await sendPersistentMenu(from, lang);
}

// The menu shown after EVERY action (add debt, find customer, mark as paid,
// send reminder, etc.) — two button bubbles since WhatsApp caps reply-buttons
// at 3 per message (a hard Meta API limit), so 6 options need 2 bubbles.
async function sendPersistentMenu(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].whatToDo },
    action: {
      buttons: [
        { type: "reply", reply: { id: "add_debt", title: T[lang].addDebt } },
        { type: "reply", reply: { id: "find_customer", title: T[lang].findCustomer } },
        { type: "reply", reply: { id: "mark_paid", title: T[lang].markPaidBtn } },
      ],
    },
  });
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: "\u200B" },
    action: {
      buttons: [
        { type: "reply", reply: { id: "change_language", title: T[lang].changeLanguage } },
        { type: "reply", reply: { id: "send_reminder_menu", title: T[lang].sendReminder } },
        { type: "reply", reply: { id: "help_btn", title: "❓ Help" } },
      ],
    },
  });
}

// Sub-menu shown when "Send Reminder" is pressed from the persistent menu —
// lets the owner choose one specific customer or everyone at once.
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

// Sub-menu shown after a phone number is entered for "Mark as Paid" — lets the
// owner choose a partial payment (tracked with amount + item) or a full payment.
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

// WhatsApp reply-buttons are capped at 3 per message (Meta API hard limit) —
// this fits comfortably since it's just 2 language options.
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

async function handleInteractive(from: string, replyId: string, req: Request): Promise<void> {
  if (!(await isOwner(from))) {
    const lang = await getLang(from);
    await sendWhatsAppMessage(from, T[lang].ownerOnly);
    return;
  }
  const lang = await getLang(from);

  // NEW: handles the onboarding language picker buttons. Saves the chosen
  // language to Supabase, then immediately asks for the shop name in that
  // same language (not English, not the default) — this is the very first
  // step for a brand-new owner row.
  if (replyId === "onboard_lang_en" || replyId === "onboard_lang_rw") {
    const chosenLang: Lang = replyId === "onboard_lang_rw" ? "rw" : "en";
    await supabase.from("owners").update({ language: chosenLang }).eq("phone", cleanPhone(from));
    sessions[from] = { step: "setup_shop_name", data: {} };
    await sendWhatsAppMessage(from, T[chosenLang].askShopName);
    return;
  }

  if (replyId === "add_debt") {
    sessions[from] = { step: "add_phone", data: {} };
    await sendWhatsAppMessage(from, T[lang].askPhone);
    return;
  }
  if (replyId === "find_customer") {
    sessions[from] = { step: "find_phone", data: {} };
    await sendWhatsAppMessage(from, T[lang].findCustomerPrompt);
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
    // Contextual — shown right after "Find Customer" already resolved a phone
    // number, so it goes straight to that customer instead of re-asking.
    const phone = sessions[from]?.data["lastPhone"];
    if (phone) await sendReminder(from, phone, lang);
    return;
  }
  if (replyId === "send_reminder_menu") {
    // Top-level "Send Reminder" from the persistent menu — we don't yet know
    // which customer, so offer the Specific Number / Remind All choice.
    await sendReminderChoice(from, lang);
    return;
  }
  if (replyId === "reminder_specific") {
    sessions[from] = { step: "reminder_phone", data: {} };
    await sendWhatsAppMessage(from, T[lang].findCustomerPrompt);
    return;
  }
  if (replyId === "reminder_all_choice") {
    await sendReminderAll(from, lang);
    return;
  }
  if (replyId === "mark_paid") {
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
    await supabase.from("transactions").update({ paid: true }).eq("customer_id", customer.id).eq("paid", false);
    await sendWhatsAppMessage(from, T[lang].allPaid(customer.name));
    await sendPersistentMenu(from, lang);
    return;
  }
  if (replyId === "show_total") {
    await showTotalDebt(from, lang);
    return;
  }
  if (replyId === "remind_all_btn") {
    await sendReminderAll(from, lang);
    return;
  }
  if (replyId === "view_all_customers") {
    await showAllCustomers(from, lang);
    return;
  }
}

async function handleMessage(from: string, text: string, req: Request): Promise<void> {
  if (!(await isOwner(from))) {
    const lang = await getLang(from);
    await sendWhatsAppMessage(from, T[lang].ownerOnly);
    return;
  }

  const lang = await getLang(from);
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
      // New signups get a 1-month free trial starting today, defaulting to English.
      // NOTE: in practice this branch should rarely fire now, since isOwner()
      // requires a pre-existing row and the language picker runs first — kept
      // as a safety fallback.
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

  // HELP is its own command — sends the explanation, then the standard
  // persistent menu (Help is a regular action, not the first-time UI).
  if (upper === "HELP") {
    sessions[from] = undefined as any;
    const shopName = await getOrAskShopName(from, lang);
    if (!shopName) return;
    await sendHelp(from, lang);
    return;
  }

  // MENU (and general greetings) show the first-time-style UI: one button
  // bubble (Add Debt, Change Language, Help) + the security tip.
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

  if (upper === "REMIND ALL" || upper === "KWIBUTSA BOSE") {
    await sendReminderAll(from, lang);
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

  const possiblePhone = cleanPhone(text);
  if (possiblePhone.length >= 9) {
    await lookupCustomer(from, possiblePhone, lang);
    return;
  }

  const shopName = await getOrAskShopName(from, lang);
  if (!shopName) return;
  await sendPersistentMenu(from, lang);
}

async function handleSession(from: string, text: string, session: Session, lang: Lang, req: Request): Promise<void> {
  if (session.step === "add_phone") {
    const phone = cleanPhone(text);
    if (phone.length < 9) {
      await sendWhatsAppMessage(from, T[lang].invalidPhone);
      return;
    }
    session.data["phone"] = phone;
    session.step = "add_name";
    const { data: existing } = await supabase.from("customers").select("name").eq("phone", phone).eq("shop_id", from).single();
    if (existing) {
      await sendWhatsAppMessage(from, T[lang].existingCustomer(existing.name));
      session.data["name"] = existing.name;
      session.step = "add_item";
    } else {
      await sendWhatsAppMessage(from, T[lang].askName);
    }
    return;
  }
  if (session.step === "add_name") {
    session.data["name"] = text;
    session.step = "add_item";
    await sendWhatsAppMessage(from, T[lang].askItem);
    return;
  }
  if (session.step === "add_item") {
    session.data["item"] = text;
    session.step = "add_amount";
    await sendWhatsAppMessage(from, T[lang].askAmount);
    return;
  }
  if (session.step === "add_amount") {
    const amount = parseInt(text.replace(/\D/g, ""), 10);
    if (isNaN(amount) || amount <= 0) {
      await sendWhatsAppMessage(from, T[lang].invalidAmount);
      return;
    }
    const { phone, name, item } = session.data as Record<string, string>;
    sessions[from] = undefined as any;
    let { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
    if (!customer) {
      const { data: newCustomer, error } = await supabase.from("customers").insert({ phone, name, shop_id: from }).select().single();
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
    const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
    const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
    await sendWhatsAppMessage(from, T[lang].debtSaved(customer.name, phone, item, amount, total));
    setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
    return;
  }
  if (session.step === "find_phone") {
    const phone = cleanPhone(text);
    sessions[from] = { step: "idle", data: { lastPhone: phone } };
    await lookupCustomer(from, phone, lang);
    return;
  }
  // Entry point for "Mark as Paid": just ask for the phone number. Once we find
  // the customer, we no longer process an amount inline — instead we hand off
  // to the Partially/Full Payment button choice (sendMarkPaidChoice).
  if (session.step === "paid_phone") {
    const phone = cleanPhone(text);
    const { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
    if (!customer) {
      sessions[from] = undefined as any;
      await sendWhatsAppMessage(from, T[lang].noCustomer(text));
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
    return;
  }
  // Step 1 of "Partially": ask how much is being paid.
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
  // Step 2 of "Partially": ask what item this payment is for, then apply it.
  // Asked as a separate question from the amount (not combined into one prompt)
  // so the owner can keep a clear record of what each payment was actually for.
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
  // Entry point for "Send Reminder" → "Specific Number": ask for the phone
  // number, then send that one customer their reminder directly.
  if (session.step === "reminder_phone") {
    const phone = cleanPhone(text);
    sessions[from] = undefined as any;
    await sendReminder(from, phone, lang);
    return;
  }
}


async function sendReminder(from: string, phone: string, lang: Lang): Promise<void> {
  const { data: owner } = await supabase.from("owners").select("name").eq("phone", cleanPhone(from)).single();
  const shopName = owner?.name ?? `Shop (${from.slice(-4)})`;
  const { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
  if (!customer) {
    await sendWhatsAppMessage(from, T[lang].noCustomer(phone));
    return;
  }
  const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
  const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  if (total === 0) {
    await sendWhatsAppMessage(from, T[lang].noDebts(customer.name));
    return;
  }

  // Reserve the reminder_logs row BEFORE sending, using a temporary placeholder ID
  const { data: insertedLog } = await supabase.from("reminder_logs").insert({
    message_id: `pending_${from}_${Date.now()}`,
    owner_phone: cleanPhone(from),
    customer_name: customer.name,
    customer_phone: phone,
    amount: total,
    status: "pending",
  }).select().single();

  // Uses the approved "debt_reminder" template instead of free-form text, since
  // customers have not necessarily messaged the bot within the last 24h (or ever) —
  // free-form text to them would fail with error 131047 outside that window.
  const messageId = await sendWhatsAppTemplateMessage(
    phone,
    "debt_reminder",
    "en",
    [customer.name, shopName, total.toLocaleString()],
  );

  // Now update the placeholder row with the real message_id from Meta
  if (insertedLog) {
    const { error } = await supabase.from("reminder_logs").update({ message_id: messageId }).eq("id", insertedLog.id);
    if (error) console.error("Failed to update reminder_logs message_id:", error);
  } else {
    // fallback in case the reserve insert failed for some reason
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

async function applyPartialPayment(from: string, customer: { id: string; name: string; phone: string }, paymentAmount: number, lang: Lang, item: string): Promise<void> {
  const { data: unpaidTx } = await supabase.from("transactions").select("*").eq("customer_id", customer.id).eq("paid", false).order("date", { ascending: true });
  if (!unpaidTx || unpaidTx.length === 0) {
    await sendWhatsAppMessage(from, T[lang].noUnpaid(customer.name));
    return;
  }
  const totalBefore = unpaidTx.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  if (paymentAmount >= totalBefore) {
    await supabase.from("transactions").update({ paid: true }).eq("customer_id", customer.id).eq("paid", false);
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
  const lastDate = lastTx ? new Date(lastTx.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "N/A";
  sessions[from] = { step: "idle", data: { lastPhone: phone } };
  await sendWhatsAppMessage(from, `👤 *${customer.name}*\n📞 ${phone}\n📦 Last item: ${lastTx?.item ?? "N/A"}\n💰 Total owed: ${totalOwed.toLocaleString()} Frw\n📅 Last visit: ${lastDate}`);
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
    const date = new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const status = t.paid ? "✅ Paid" : "❌ Unpaid";
    return `• ${t.item} — ${t.amount.toLocaleString()} Frw — ${date} — ${status}`;
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
    lines.push(`👤 *${customer.name}*\n📞 ${customer.phone}\n💰 ${T[lang].owes}: ${debtStatus}\n📅 ${T[lang].registered}: ${date}`);
  }
  const chunkSize = 5;
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);
    const header = i === 0 ? T[lang].allCustomersHeader(customers.length) : T[lang].allCustomersContinued;
    await sendWhatsAppMessage(from, header + chunk.join("\n\n"));
  }
  setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
}

async function sendReminderAll(from: string, lang: Lang): Promise<void> {
  const { data: owner } = await supabase.from("owners").select("name").eq("phone", cleanPhone(from)).single();
  const shopName = owner?.name ?? `Shop (${from.slice(-4)})`;

  const { data: customers } = await supabase.from("customers").select("*").eq("shop_id", from);

  if (!customers || customers.length === 0) {
    await sendWhatsAppMessage(from, T[lang].noCustomers);
    return;
  }

  const lines: string[] = [];
  let grandTotal = 0;
  let sentCount = 0;

  for (const customer of customers) {
    const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
    const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
    if (total === 0) continue;

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
      const messageId = await sendWhatsAppTemplateMessage(
        customer.phone,
        "debt_reminder",
        "en",
        [customer.name, shopName, total.toLocaleString()],
      );
      if (insertedLog) {
        await supabase.from("reminder_logs").update({ message_id: messageId }).eq("id", insertedLog.id);
      }
      lines.push(`👤 ${customer.name} — ${total.toLocaleString()} Frw`);
      grandTotal += total;
      sentCount++;
    } catch (err) {
      lines.push(`❌ ${customer.name} — failed`);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (sentCount === 0) {
    await sendWhatsAppMessage(from, T[lang].remindAllNone);
    return;
  }

  const summary = T[lang].remindAllSummary(sentCount, grandTotal) + lines.join("\n") + T[lang].remindAllTotal(grandTotal);
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
  let { data: customer } = await supabase.from("customers").select("*").eq("phone", phone).eq("shop_id", from).single();
  if (!customer) {
    const { data: newCustomer, error } = await supabase.from("customers").insert({ phone, name, shop_id: from }).select().single();
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
  const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
  const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  await sendWhatsAppMessage(from, T[lang].debtSaved(name, phone, item, amount, total));
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
    // Legacy typed shortcut (PAID <phone> <amount>) doesn't collect an item
    // description like the button-driven flow does — labeled generically here.
    await applyPartialPayment(from, customer, partialAmount, lang, lang === "rw" ? "Ntabwo byaranzwe" : "Not specified");
  } else {
    await supabase.from("transactions").update({ paid: true }).eq("customer_id", customer.id).eq("paid", false);
    await sendWhatsAppMessage(from, T[lang].allPaid(customer.name));
  }
}

export default router;