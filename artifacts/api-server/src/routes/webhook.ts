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

// NOTE: `owners` table needs a new `contact_phone` column (text, nullable) —
// this is the number customers should use to reach the shop owner directly,
// distinct from the WhatsApp Business bot number. Add via Supabase before
// deploying:
//   alter table owners add column contact_phone text;

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
🔍 Find Customer — look up a customer's balance
✅ Mark as Paid — enter their number, then choose Partially or Full Payment
🔔 Send Reminder — remind one customer, or everyone at once
🌐 Change Language — switch Kinyarwanda/English
💳 MoMo — set up payment details, or set the number customers can reach you on
💰 Total — see your total outstanding debt
➕ More — see everything else, including your full customer list

*Typed shortcuts (optional):*
• TOTAL — see your total outstanding debt
• REMIND ALL — remind every customer who owes you
• REMIND <phone> — remind one specific customer
• @ALL — list every customer you've registered
• MOMO — set up your MTN MoMo payment details for reminders
• MENU — show the quick-action buttons again
• HELP — show this message again`,
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
🔍 Shakisha Umukiriya — reba amafaranga umukiriya asigayemo
✅ Emeza Kwishyura — andika nimero, hanyuma uhitemo Igice cyangwa Byose
🔔 Kwibutsa — wibutsa umukiriya umwe, cyangwa bose icyarimwe
🌐 Guhindura Ururimi — hindura Ikinyarwanda/Icyongereza
💳 MoMo — shyiraho amakuru y'ubwishyu, cyangwa shyiraho nimero abakiriya bakuvugana
💰 Igiteranyo — reba igiteranyo cy'amadeni yose
➕ Ibindi — reba ibindi byose, hamwe n'urutonde rw'abakiriya bawe bose

*Amabwiriza wandika (ntibisabwa):*
• TOTAL cyangwa IGITERANYO — reba igiteranyo cy'amadeni yose
• REMIND ALL cyangwa KWIBUTSA BOSE — wibutsa abakiriya bose bafite amadeni
• REMIND <nimero> — wibutsa umukiriya umwe
• @ALL — reba abakiriya bawe bose
• MOMO — shyiraho amakuru ya MTN MoMo azagaragara ku butumwa
• MENU — garuka kuri buto z'ibanze
• HELP — reba ubu butumwa nanone`,
    securityTip: `🔒 *Ubutumwa bw'Umutekano:*\n\nFunga iki gikorwa cya ShopBrain kugira ngo wowe gusa ubashobore kukibona.\n\n*Uko bikorwa:*\n1. Fata iki gikorwa mu rutonde rwa WhatsApp\n2. Kanda ikimenyetso cy'isuri 🔒\n3. Bizasaba igikumwe cyawe cyangwa ubuso bwawe\n\nAmakuru y'abakiriya bawe azaba ari mu mutekano.`,
    // --- MoMo setup ---
    momoIntro: "💳 *Gushyiraho MoMo*\n\nIbi bituma abakiriya babona neza aho koherereza amafaranga igihe babonye ubutumwa bwo kwibutsa.\n\nNimero yawe ya MTN MoMo ni iyihe?\n\nUrugero: 0788123456",
    momoInvalidNumber: "❌ Nimero si yo. Andika nimero yawe ya MoMo:",
    momoAskCode: "Ufite kode ya MTN MoMo Merchant/Business? (Ntibisabwa)\n\nAndike ubu, cyangwa ukande Skip niba udafite.",
    momoAskReceiverName: "Ni irihe zina rigaragara kuri MTN igihe umuntu akoherereza iyi nimero/kode amafaranga?\n\n⚠️ Iri zina rigomba guhuza neza n'irigaragara kuri MTN.\n\nUrugero: NIYONZIMA ALICE",
    momoReceiverTooShort: "❌ Rifupi cyane. Andika izina nyaryo rigaragara kuri MTN:",
    momoAskNickname: "Abakiriya bawe bakunze kwita iki iduka ryawe? (kugira ngo baryumve n'igihe izina rya MTN ryaba ritandukanye)\n\nUrugero: Chez Alice",
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

// Maps owner language to the correct approved WhatsApp template name for
// debt reminders. "debt_reminder" (English) has been Active for a while;
// "debt_reminder_rw" (Kinyarwanda) was just submitted and may still be
// pending Meta's review — sends will fail with a template-not-found error
// until it clears, at which point this needs no further changes.
function reminderTemplateName(lang: Lang): string {
  return lang === "rw" ? "debt_reminder_rw" : "debt_reminder";
}

// Maps our internal Lang to the exact locale code Meta has the template
// registered under. Confirm these against WhatsApp Manager → template details
// before deploying — they must match exactly or sends fail with error 132001.
function metaLanguageCode(lang: Lang): string {
  return lang === "rw" ? "rw" : "en";
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
    .map((t: { item: string; amount: number }) => `${t.item} (${t.amount.toLocaleString()} Frw)`)
    .join(", ");
}

// Builds the single-string MoMo payment block used as the reminder
// template's {{5}} variable. Returns "" if the owner hasn't set up MoMo
// details yet, so the template's MoMo section variable is simply blank
// (template body copy/bolding is fixed at Meta approval time — this just
// fills the variable, it can't add its own bold/color formatting).
function buildMomoBlock(owner: {
  momo_number?: string | null;
  momo_code?: string | null;
  momo_receiver_name?: string | null;
  shop_nickname?: string | null;
}): string {
  if (!owner.momo_number) {
    return "No MoMo details on file.";
  }

  const codeLine = owner.momo_code ? `MoMo Code: ${owner.momo_code}. ` : "";
  const nickname = owner.shop_nickname ? ` (This is MoMo for "${owner.shop_nickname}")` : "";

  return `${owner.momo_number}. ${codeLine}Name shown on MoMo: ${owner.momo_receiver_name ?? ""}${nickname}`;
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

// Shared 3-bubble button layout, in the agreed order:
// Add Debt, Mark as Paid, Find Customer | Send Reminder, MoMo, Total |
// Security, Change Language, More.
// `firstBubbleText` lets callers use a greeting on first registration vs.
// a plain "what would you like to do" on every later visit.
async function sendMenuButtons(from: string, lang: Lang, firstBubbleText: string): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: firstBubbleText },
    action: {
      buttons: [
        { type: "reply", reply: { id: "add_debt", title: T[lang].addDebt } },
        { type: "reply", reply: { id: "mark_paid", title: T[lang].markPaidBtn } },
        { type: "reply", reply: { id: "find_customer", title: T[lang].findCustomer } },
      ],
    },
  });
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: "\u200B" },
    action: {
      buttons: [
        { type: "reply", reply: { id: "send_reminder_menu", title: T[lang].sendReminder } },
        { type: "reply", reply: { id: "momo_menu", title: T[lang].momoBtn } },
        { type: "reply", reply: { id: "show_total", title: T[lang].totalBtn } },
      ],
    },
  });
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: "\u200B" },
    action: {
      buttons: [
        { type: "reply", reply: { id: "security_info", title: T[lang].securityBtn } },
        { type: "reply", reply: { id: "change_language", title: T[lang].changeLanguage } },
        { type: "reply", reply: { id: "more_menu", title: T[lang].moreBtn } },
      ],
    },
  });
}

// Right after registration, the owner now sees the SAME full menu as every
// later visit — no separate stripped-down first-time bubble, and no more
// auto-sent security tip (that now only fires when the owner taps Security).
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

async function sendMoreMenu(from: string, lang: Lang): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: T[lang].whatToDo },
    action: {
      buttons: [
        { type: "reply", reply: { id: "view_all_customers", title: T[lang].allCustomersBtn } },
        { type: "reply", reply: { id: "help_btn", title: "❓ Help" } },
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

async function handleInteractive(from: string, replyId: string, req: Request): Promise<void> {
  if (!(await isOwner(from))) {
    const langCheck = await getLang(from);
    await sendWhatsAppMessage(from, T[langCheck].ownerOnly);
    return;
  }

  // FIX: lang must be declared before any branch below uses it.
  const lang = await getLang(from);

  if (replyId === "add_debt") {
    sessions[from] = { step: "add_phone", data: {} };
    await sendWhatsAppInteractiveMessage(from, {
      type: "button",
      body: { text: T[lang].askPhone },
      action: {
        buttons: [
          { type: "reply", reply: { id: "phone_skip", title: lang === "rw" ? "Nta Nimero" : "No Number" } },
        ],
      },
    });
    return;
  }

  if (replyId === "phone_skip") {
    if (sessions[from]?.step !== "add_phone") return; // stale button tap, ignore
    sessions[from]!.data["phone"] = ""; // empty = no phone
    sessions[from]!.step = "add_name";
    await sendWhatsAppMessage(from, T[lang].askName);
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

  if (replyId === "more_menu") {
    await sendMoreMenu(from, lang);
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
    await sendWhatsAppMessage(from, T[lang].findCustomerPrompt);
    return;
  }
  if (replyId === "reminder_all_choice") {
    await sendReminderAll(from, lang, req);
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
    await sendReminderAll(from, lang, req);
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
    // phone may be "" (customer chose "No Number") — store null in that case
    const phoneValue: string | null = phone ? phone : null;

    sessions[from] = undefined as any;

    let customer: any = null;
    if (phoneValue) {
      const { data: existingCustomer } = await supabase.from("customers").select("*").eq("phone", phoneValue).eq("shop_id", from).single();
      customer = existingCustomer;
    }
    if (!customer) {
      // FIX: was inserting a literal `phoneValue` column instead of setting `phone`.
      const { data: newCustomer, error } = await supabase.from("customers").insert({ phone: phoneValue, name, shop_id: from }).select().single();
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
    await sendWhatsAppMessage(from, T[lang].debtSaved(customer.name, phoneValue || (lang === "rw" ? "nta nimero" : "no number"), item, amount, total));
    setTimeout(async () => { await sendPersistentMenu(from, lang); }, 1000);
    return;
  }
  if (session.step === "find_phone") {
    const phone = cleanPhone(text);
    sessions[from] = { step: "idle", data: { lastPhone: phone } };
    await lookupCustomer(from, phone, lang);
    return;
  }
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
    const phone = cleanPhone(text);
    sessions[from] = undefined as any;
    await sendReminder(from, phone, lang);
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
}


async function sendReminder(from: string, phone: string, lang: Lang): Promise<void> {
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
  const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
  const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
  if (total === 0) {
    await sendWhatsAppMessage(from, T[lang].noDebts(customer.name));
    return;
  }

  const itemizedList = await buildItemizedList(customer.id);

  const momoBlock = buildMomoBlock(owner ?? {});

  const { data: insertedLog } = await supabase.from("reminder_logs").insert({
    message_id: `pending_${from}_${Date.now()}`,
    owner_phone: cleanPhone(from),
    customer_name: customer.name,
    customer_phone: phone,
    amount: total,
    status: "pending",
  }).select().single();

  // Uses the approved debt reminder template (English or Kinyarwanda,
  // depending on the owner's language). Template currently has 4 variables:
  // name, shop, itemized list, total. (MoMo block re-added once template
  // {{5}} is approved — see MOMO TEMP DISABLE note above.)
  const messageId = await sendWhatsAppTemplateMessage(
    phone,
    reminderTemplateName(reminderLang),
    metaLanguageCode(reminderLang),
    [customer.name, shopName, total.toLocaleString(), itemizedList, momoBlock, contactPhone],
  );

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

  const momoBlock = buildMomoBlock(owner ?? {});

  const { data: customers } = await supabase.from("customers").select("*").eq("shop_id", from);

  if (!customers || customers.length === 0) {
    await sendWhatsAppMessage(from, T[lang].noCustomers);
    return;
  }

  const lines: string[] = [];
  let grandTotal = 0;
  let sentCount = 0;
  let failedCount = 0;

  for (const customer of customers) {
    // FIX: skip customers with no phone — nothing to send a WhatsApp reminder to.
    if (!customer.phone) continue;

    const { data: unpaidTx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
    const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
    if (total === 0) continue;

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
      // Template + language now match the owner's chosen language. (MoMo block
      // temporarily not sent — see MOMO TEMP DISABLE note above.)
      const messageId = await sendWhatsAppTemplateMessage(
        customer.phone,
        reminderTemplateName(reminderLang),
        metaLanguageCode(reminderLang),
        [customer.name, shopName, total.toLocaleString(), itemizedList, momoBlock, contactPhone],
      );
      if (insertedLog) {
        await supabase.from("reminder_logs").update({ message_id: messageId }).eq("id", insertedLog.id);
      }
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

  if (sentCount === 0 && failedCount > 0) {
    // FIX: distinguish "nothing to send" from "sends failed" — previously
    // both cases showed remindAllNone ("No customers with outstanding
    // debts"), which was misleading when debts existed but every send threw.
    await sendWhatsAppMessage(from, lang === "rw"
      ? "❌ Ubutumwa ntabwo bwoherejwe — hari ikibazo. Reba raporo cyangwa gerageza nanone."
      : "❌ Reminders failed to send — please check your template/setup and try again.");
    return;
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
    await applyPartialPayment(from, customer, partialAmount, lang, lang === "rw" ? "Ntabwo byaranzwe" : "Not specified");
  } else {
    await supabase.from("transactions").update({ paid: true }).eq("customer_id", customer.id).eq("paid", false);
    await sendWhatsAppMessage(from, T[lang].allPaid(customer.name));
  }
}

export default router;