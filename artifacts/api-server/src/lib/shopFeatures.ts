// src/lib/shopFeatures.ts
//
// ShopBrain feature pack. Wired into routes/webhook.ts via a handful of small
// hooks (see webhook-edits.md). Run shopbrain_migration.sql in Supabase FIRST.
//
// What lives here:
//   MENUS      sendMainBubble (Add Debt | Mark as Paid | Menu), sendMenuList and
//              its sub-menus (WhatsApp lists allow max 10 rows, so the menu is
//              split into short lists)
//   1  Add stock / restock            stock_add      -> startAddStock + stk_* steps
//   2  My Stock list (low-stock flags) stock_view     -> showStock
//   3  Record Sale (cash or credit)   sell_start     -> sell_* steps, commitSale
//   4  Low-stock alerts               sendLowStockAlert (after every sale)
//   5  Profit report                  profit_btn     -> showProfit
//   6  Expenses                       expense_add    -> exp_* steps
//   7  Auto-reminders                 autoremind_menu + runAutoReminders (daily job)
//   8  Promise-to-pay date            promise_set    -> promise_days step
//   9  Credit limit warning           creditlimit_menu + creditLimitCheck
//   10 Supplier debts ("I owe")       supplier_menu  -> sup_* steps

import { supabase } from "./supabase.js";
import {
  sendWhatsAppMessage,
  sendWhatsAppInteractiveMessage,
  sendWhatsAppTemplateMessage,
} from "./whatsapp.js";

export type Lang = "en" | "rw";
export interface Session {
  step: string;
  data: Record<string, string>;
}

interface OwnerMomoFields {
  momo_number?: string | null;
  momo_code?: string | null;
  momo_receiver_name?: string | null;
  shop_nickname?: string | null;
}

export interface FeatureDeps {
  sessions: Record<string, Session | undefined>;
  cleanPhone: (phone: string) => string;
  /** Sends the main menu bubble (webhook's sendPersistentMenu). */
  sendMenu: (from: string, lang: Lang) => Promise<void>;
  /** Sends the "customer phone number?" prompt of the Add Debt flow. */
  sendAddDebtPhonePrompt: (from: string, lang: Lang) => Promise<void>;
  buildItemizedList: (customerId: string) => Promise<string>;
  buildMomoBlock: (owner: OwnerMomoFields, lang: Lang) => string;
  reminderTemplateName: (lang: Lang) => string;
  metaLanguageCode: (lang: Lang) => string;
  getOptedOutSet: (phones: string[]) => Promise<Set<string>>;
  reminderCooldownDays: number;
}

let D!: FeatureDeps;
export function initShopFeatures(deps: FeatureDeps): void {
  D = deps;
}

/* ------------------------------------------------------------------ */
/* Constants + small helpers                                           */
/* ------------------------------------------------------------------ */

export const AUTO_REMIND_MIN_DEBT_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000; // Africa/Kigali is UTC+2, no DST

function money(n: number): string {
  return `${n.toLocaleString()} Frw`;
}

function parseNum(text: string): number {
  const n = parseInt(text.replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? NaN : n;
}

/** Escapes % _ \ so user text can be used safely inside ilike(). */
function escLike(text: string): string {
  return text.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Kigali calendar date as YYYY-MM-DD, optionally N days ahead. */
export function kigaliDate(daysAhead = 0): string {
  return new Date(Date.now() + KIGALI_OFFSET_MS + daysAhead * DAY_MS).toISOString().slice(0, 10);
}

function startOfTodayKigali(): Date {
  const shifted = new Date(Date.now() + KIGALI_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - KIGALI_OFFSET_MS);
}

function prettyDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function g(data: Record<string, string>, key: string): string {
  return data[key] ?? "";
}

function clearSession(from: string): void {
  D.sessions[from] = undefined;
}

function menuSoon(from: string, lang: Lang): void {
  setTimeout(() => {
    D.sendMenu(from, lang).catch((err) => console.error("Failed to send menu:", err));
  }, 1000);
}

/** Reads every row of a query, 1000 at a time (PostgREST's default page cap). */
async function fetchAll<T>(
  build: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await build(start, start + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

interface StockItem {
  id: string;
  shop_id: string;
  name: string;
  qty: number;
  cost_price: number;
  sell_price: number;
  low_threshold: number;
}

/* ------------------------------------------------------------------ */
/* Strings (English + Kinyarwanda). Please proofread the Kinyarwanda.  */
/* ------------------------------------------------------------------ */

const en = {
  whatToDo: "What would you like to do?",
  listButton: "Select",
  cancelBtn: "✖️ Cancel",
  skipNote: "⏭️ No Note",
  nameInvalid: "❌ Please enter a name (max 60 characters):",
  invalidAmount: "❌ Please enter a valid amount e.g. 5000",
  pcs: "pcs",

  // main bubble + menus
  addDebtBtn: "➕ Add Debt",
  markPaidBtn: "✅ Mark as Paid",
  menuBtn: "📋 Menu",
  menuListButton: "Open Menu",
  secCustomers: "Customers",
  secShop: "Sell & Stock",
  secMoney: "Money",
  secMore: "More",
  rowFind: "🔍 Find Customer",
  rowRemind: "🔔 Send Reminder",
  rowFollow: "🚩 Follow-up",
  rowAll: "📋 All Customers",
  rowSell: "💵 Record Sale",
  rowStock: "📦 Stock",
  rowMoney: "💰 Money & Reports",
  rowSuppliers: "💼 I Owe Suppliers",
  rowSettings: "⚙️ Settings",
  rowHelp: "❓ Help",
  moneyTotal: "💰 Total Debt",
  moneyReport: "📊 Debt Report",
  moneyToday: "📆 Today",
  moneyProfit: "💹 Profit",
  moneyExpense: "🧾 Add Expense",
  setMomo: "💳 MoMo & Contact",
  setAuto: "⏰ Auto Reminders",
  setLimit: "🚧 Credit Limit",
  setLang: "🌐 Language",
  setSecurity: "🔒 Security",
  stockViewBtn: "📋 My Stock",
  stockAddBtn: "➕ Add Stock",
  supAddBtn: "➕ New Debt",
  supListBtn: "📋 View / Pay",

  // stock
  stkAskName: "📦 *Add Stock*\n\nItem name? (e.g. Sugar 1kg)",
  stkAskCost: (name: string) => `Buying price of *${name}* (per piece, Frw)?\n\nIf you don't know, type 0.`,
  stkAskPrice: "Selling price (per piece, Frw)?",
  stkAskQty: "How many pieces do you have now?",
  stkSaved: (name: string, qty: number, cost: number, price: number) =>
    `✅ *Stock saved*\n\n📦 ${name}\n🔢 ${qty} pcs\n💵 Buy: ${money(cost)} · Sell: ${money(price)}`,
  stkExists: (name: string, qty: number) =>
    `📦 *${name}* is already in stock (${qty} pcs).\n\nHow many pieces are you adding?`,
  stkRestocked: (name: string, added: number, qty: number) =>
    `✅ *${name}* restocked: +${added}. Now ${qty} pcs.`,
  stkChangePricesQ: "Change the prices too?",
  stkKeepBtn: "👍 Keep Prices",
  stkChangeBtn: "✏️ Change Prices",
  stkPricesSaved: (name: string) => `✅ Prices updated for *${name}*.`,
  stkInvalid: "❌ Please enter a number e.g. 10",
  stkEmpty: "📦 No stock yet. Tap Menu → Stock → Add Stock to start.",
  stkHeader: (count: number) => `📦 *My Stock (${count})*\n\n`,
  stkLine: (name: string, qty: number, price: number, low: boolean) =>
    `${low ? "⚠️" : "•"} *${name}* — ${qty} pcs — ${money(price)}`,
  stkLowNote: "\n⚠️ = running low",

  // sell
  sellAskItem: "💵 *Record Sale*\n\nType the item name (or part of it):",
  sellNoStock: "📦 You have no stock items yet. Add stock first.",
  sellNoMatch: (q: string) => `❌ No stock item matching "${q}". Try again:`,
  sellPick: (q: string) => `🔍 Several items match "${q}". Tap one:`,
  sellOut: (name: string) => `🚫 *${name}* is out of stock. Type another item:`,
  sellAskQty: (name: string, qty: number, price: number) =>
    `*${name}* — ${qty} in stock — ${money(price)} each\n\nHow many are being sold?`,
  sellNotEnough: (name: string, left: number) => `❌ Only ${left} of *${name}* left. Enter a smaller number:`,
  sellConfirm: (name: string, qty: number, price: number, total: number) =>
    `🧾 *${name}* × ${qty}\n💵 ${money(price)} each = *${money(total)}*\n\nHow did they pay?`,
  sellCashBtn: "💵 Paid Cash",
  sellCreditBtn: "📒 On Credit",
  sellPriceBtn: "✏️ Change Price",
  sellAskPrice: "New price per piece (Frw)?",
  sellDone: (name: string, qty: number, total: number, profit: string, left: number) =>
    `✅ *Sale recorded*\n\n📦 ${name} × ${qty}\n💵 ${money(total)}\n📈 Profit: ${profit}\n📦 Left: ${left}`,
  creditStockNote: (name: string, left: number, profit: string) =>
    `📦 Stock updated: ${left} of ${name} left · Profit: ${profit}`,
  stockNotUpdated: "⚠️ The debt was saved, but stock could not be updated (not enough left?). Check My Stock.",
  lowStock: (name: string, left: number) =>
    left <= 0 ? `🚫 *${name}* is now OUT of stock!` : `⚠️ Low stock: only ${left} of *${name}* left.`,

  // profit
  profitPick: "💹 *Profit* — which period?",
  periodToday: "Today",
  period7: "Last 7 days",
  period30: "Last 30 days",
  btnToday: "Today",
  btn7: "7 Days",
  btn30: "30 Days",
  profitHeader: (label: string) => `💹 *Profit — ${label}*`,
  profitBody: (sales: number, revenue: number, cost: number, gross: number, expenses: number, net: number) =>
    `🛒 Sales: ${sales} (${money(revenue)})\n📦 Cost of goods: ${money(cost)}\n📈 Gross profit: ${money(gross)}\n🧾 Expenses: ${money(expenses)}\n💰 *Net profit: ${money(net)}*`,
  profitTop: "🏆 Top items by profit:",
  profitNone: "No sales or expenses recorded for this period.",
  profitNote: "ℹ️ Credit sales count as profit when sold, even before the customer pays.",

  // expenses
  expAskAmount: "🧾 *Add Expense*\n\nHow much did you spend? (Frw)",
  expAskNote: "What was it for? (e.g. transport, rent)",
  expSaved: (amount: number, note: string | null, todayTotal: number) =>
    `✅ *Expense saved*\n\n💸 ${money(amount)}${note ? `\n📝 ${note}` : ""}\n📆 Today's expenses: ${money(todayTotal)}`,

  // auto reminders
  arStatus: (on: boolean, minDays: number, cooldown: number) =>
    `⏰ *Auto Reminders: ${on ? "ON ✅" : "OFF"}*\n\nWhen ON, ShopBrain reminds customers who have owed you for ${minDays}+ days, at most once every ${cooldown} days.\n\nOnly customers who agreed to reminders (and haven't replied STOP) are reminded. Customers with a promise date are left alone until it passes.`,
  arOnBtn: "✅ Turn On",
  arOffBtn: "⛔ Turn Off",
  arNowOn: "✅ Auto reminders are ON.",
  arNowOff: "⛔ Auto reminders are OFF.",
  arOwnerSummary: (sent: number, total: number, failed: number) =>
    `⏰ *Auto reminders sent*\n\n${sent} customers reminded · ${money(total)} outstanding${failed ? `\n❌ ${failed} failed` : ""}`,

  // promise date
  promiseBtn: "📅 Promise Date",
  promiseAsk: (name: string) =>
    `📅 When did *${name}* promise to pay?\n\nTap a button, or type the number of days (0 to clear).`,
  promise1: "Tomorrow",
  promise3: "In 3 days",
  promise7: "In 7 days",
  promiseSaved: (name: string, date: string) =>
    `✅ *${name}* promised to pay by *${date}*.\n\nNo auto-reminders before then. If they miss it, they'll show in Follow-up.`,
  promiseCleared: (name: string) => `✅ Promise date cleared for *${name}*.`,
  promiseInvalid: "❌ Enter days as a number, e.g. 3 (or 0 to clear):",
  promiseLine: (date: string) => `📅 Promised to pay by: ${date}`,
  reasonPromise: (date: string) => `missed promise date (${date})`,

  // credit limit
  clWithLimit: (limit: number) =>
    `🚧 *Credit limit: ${money(limit)}*\n\nShopBrain warns you when a customer's debt would go above this.\n\nType a new limit, or tap No Limit.`,
  clNoLimit:
    "🚧 *Credit limit: none*\n\nSet the most a customer can owe you. ShopBrain warns you before adding a debt that goes above it.\n\nType an amount (Frw):",
  clNoneBtn: "⏭️ No Limit",
  clSaved: (limit: number) => `✅ Credit limit set to ${money(limit)}.`,
  clCleared: "✅ Credit limit removed.",
  clWarn: (name: string, newTotal: number, limit: number) =>
    `🚧 *${name}* would owe *${money(newTotal)}*, above your limit of ${money(limit)}.\n\nAdd this debt anyway?`,
  clContinueBtn: "✅ Add Anyway",
  clCancelBtn: "✖️ Cancel",
  clCancelled: "✖️ Debt not added.",

  // suppliers
  supAskName: "💼 *New Supplier Debt*\n\nWho do you owe? (supplier name)",
  supAskAmount: (name: string) => `How much do you owe *${name}*? (Frw)`,
  supAskNote: "Any note? (e.g. 20 bags of rice)",
  supSaved: (name: string, amount: number, total: number) =>
    `✅ *Saved*\n\n💼 ${name}\n💰 ${money(amount)}\n📊 Total you owe suppliers: ${money(total)}`,
  supNone: "✅ You don't owe any supplier right now.",
  supHeader: (count: number, total: number) =>
    `💼 *You owe suppliers ${money(total)}* (${count} entries)\n\nTap one to mark it as paid:`,
  supMore: (n: number) => `➕ ${n} more not shown. Settle the ones above first.`,
  supConfirm: (name: string, amount: number, note: string | null) =>
    `Mark as paid?\n\n💼 ${name}\n💰 ${money(amount)}${note ? `\n📝 ${note}` : ""}`,
  supPayBtn: "✅ Paid in Full",
  supPaid: (name: string, amount: number) => `✅ *${name}* — ${money(amount)} marked as paid.`,
  supGone: "ℹ️ That entry was already paid or removed.",
};

const rw: typeof en = {
  whatToDo: "Urashaka gukora iki?",
  listButton: "Hitamo",
  cancelBtn: "✖️ Reka",
  skipNote: "⏭️ Nta Cyo",
  nameInvalid: "❌ Andika izina (ntirirenze inyuguti 60):",
  invalidAmount: "❌ Andika umubare wemewe urugero 5000",
  pcs: "ibice",

  addDebtBtn: "➕ Ongeraho Umwenda",
  markPaidBtn: "✅ Emeza Kwishyura",
  menuBtn: "📋 Menu",
  menuListButton: "Fungura Menu",
  secCustomers: "Abakiriya",
  secShop: "Igurisha & Ububiko",
  secMoney: "Amafaranga",
  secMore: "Ibindi",
  rowFind: "🔍 Shakisha Umukiriya",
  rowRemind: "🔔 Kwibutsa",
  rowFollow: "🚩 Gukurikirana",
  rowAll: "📋 Abakiriya Bose",
  rowSell: "💵 Andika Igurisha",
  rowStock: "📦 Ububiko",
  rowMoney: "💰 Amafaranga & Raporo",
  rowSuppliers: "💼 Amadeni Nkwiye",
  rowSettings: "⚙️ Igenamiterere",
  rowHelp: "❓ Ubufasha",
  moneyTotal: "💰 Igiteranyo",
  moneyReport: "📊 Raporo y'Amadeni",
  moneyToday: "📆 Uyu Munsi",
  moneyProfit: "💹 Inyungu",
  moneyExpense: "🧾 Andika Ikiguzi",
  setMomo: "💳 MoMo & Nimero",
  setAuto: "⏰ Kwibutsa Byikora",
  setLimit: "🚧 Ikirenga cy'Ideni",
  setLang: "🌐 Ururimi",
  setSecurity: "🔒 Umutekano",
  stockViewBtn: "📋 Ububiko Bwanjye",
  stockAddBtn: "➕ Ongeramo Ibintu",
  supAddBtn: "➕ Umwenda Mushya",
  supListBtn: "📋 Reba / Ishyura",

  stkAskName: "📦 *Ongeramo Ibicuruzwa*\n\nIzina ry'igicuruzwa? (urugero: Isukari 1kg)",
  stkAskCost: (name: string) => `Igiciro ugurishaho *${name}* ugura (kimwe, Frw)?\n\nNiba utakizi, andika 0.`,
  stkAskPrice: "Igiciro ugurishaho (kimwe, Frw)?",
  stkAskQty: "Ufite ibice bingahe ubu?",
  stkSaved: (name: string, qty: number, cost: number, price: number) =>
    `✅ *Ibicuruzwa byabitswe*\n\n📦 ${name}\n🔢 ${qty}\n💵 Kugura: ${money(cost)} · Kugurisha: ${money(price)}`,
  stkExists: (name: string, qty: number) =>
    `📦 *${name}* isanzwe mu bubiko (${qty}).\n\nUrongeramo ibice bingahe?`,
  stkRestocked: (name: string, added: number, qty: number) =>
    `✅ *${name}* byongeweho: +${added}. Ubu hari ${qty}.`,
  stkChangePricesQ: "Wahindura n'ibiciro?",
  stkKeepBtn: "👍 Komeza Ibiciro",
  stkChangeBtn: "✏️ Hindura Ibiciro",
  stkPricesSaved: (name: string) => `✅ Ibiciro bya *${name}* byahinduwe.`,
  stkInvalid: "❌ Andika umubare urugero 10",
  stkEmpty: "📦 Nta bicuruzwa mu bubiko. Kanda Menu → Ububiko → Ongeramo Ibintu.",
  stkHeader: (count: number) => `📦 *Ububiko Bwanjye (${count})*\n\n`,
  stkLine: (name: string, qty: number, price: number, low: boolean) =>
    `${low ? "⚠️" : "•"} *${name}* — ${qty} — ${money(price)}`,
  stkLowNote: "\n⚠️ = bigiye gushira",

  sellAskItem: "💵 *Andika Igurisha*\n\nAndika izina ry'igicuruzwa (cyangwa igice cyaryo):",
  sellNoStock: "📦 Nta bicuruzwa mu bubiko. Banza ubyongere.",
  sellNoMatch: (q: string) => `❌ Nta gicuruzwa gihuye na "${q}". Ongera ugerageze:`,
  sellPick: (q: string) => `🔍 Hari ibicuruzwa byinshi bihuye na "${q}". Kanda kimwe:`,
  sellOut: (name: string) => `🚫 *${name}* cyashize mu bubiko. Andika ikindi gicuruzwa:`,
  sellAskQty: (name: string, qty: number, price: number) =>
    `*${name}* — hasigaye ${qty} — ${money(price)} kimwe\n\nUragurisha bingahe?`,
  sellNotEnough: (name: string, left: number) => `❌ Hasigaye ${left} gusa bya *${name}*. Andika umubare muto:`,
  sellConfirm: (name: string, qty: number, price: number, total: number) =>
    `🧾 *${name}* × ${qty}\n💵 ${money(price)} kimwe = *${money(total)}*\n\nYishyuye ate?`,
  sellCashBtn: "💵 Yishyuye Cash",
  sellCreditBtn: "📒 Ku Mwenda",
  sellPriceBtn: "✏️ Hindura Igiciro",
  sellAskPrice: "Igiciro gishya cya kimwe (Frw)?",
  sellDone: (name: string, qty: number, total: number, profit: string, left: number) =>
    `✅ *Igurisha ryabitswe*\n\n📦 ${name} × ${qty}\n💵 ${money(total)}\n📈 Inyungu: ${profit}\n📦 Hasigaye: ${left}`,
  creditStockNote: (name: string, left: number, profit: string) =>
    `📦 Ububiko bwahinduwe: hasigaye ${left} bya ${name} · Inyungu: ${profit}`,
  stockNotUpdated: "⚠️ Umwenda wabitswe, ariko ububiko ntibwahinduwe (hasigaye bidahagije?). Reba Ububiko Bwanjye.",
  lowStock: (name: string, left: number) =>
    left <= 0 ? `🚫 *${name}* cyashize mu bubiko!` : `⚠️ Bigiye gushira: hasigaye ${left} bya *${name}*.`,

  profitPick: "💹 *Inyungu* — mu gihe kingana iki?",
  periodToday: "Uyu munsi",
  period7: "Iminsi 7 ishize",
  period30: "Iminsi 30 ishize",
  btnToday: "Uyu Munsi",
  btn7: "Iminsi 7",
  btn30: "Iminsi 30",
  profitHeader: (label: string) => `💹 *Inyungu — ${label}*`,
  profitBody: (sales: number, revenue: number, cost: number, gross: number, expenses: number, net: number) =>
    `🛒 Igurisha: ${sales} (${money(revenue)})\n📦 Igiciro cy'ibicuruzwa: ${money(cost)}\n📈 Inyungu y'ibanze: ${money(gross)}\n🧾 Ibiguzi: ${money(expenses)}\n💰 *Inyungu nyayo: ${money(net)}*`,
  profitTop: "🏆 Ibyunguka cyane:",
  profitNone: "Nta gurisha cyangwa ikiguzi cyanditswe muri iki gihe.",
  profitNote: "ℹ️ Igurisha ku mwenda ribarwa nk'inyungu igihe ryabaye, n'iyo umukiriya atarishyura.",

  expAskAmount: "🧾 *Andika Ikiguzi*\n\nWakoresheje angahe? (Frw)",
  expAskNote: "Byari bigenewe iki? (urugero: transport, inzu)",
  expSaved: (amount: number, note: string | null, todayTotal: number) =>
    `✅ *Ikiguzi cyabitswe*\n\n💸 ${money(amount)}${note ? `\n📝 ${note}` : ""}\n📆 Ibiguzi by'uyu munsi: ${money(todayTotal)}`,

  arStatus: (on: boolean, minDays: number, cooldown: number) =>
    `⏰ *Kwibutsa Byikora: ${on ? "BIRIKORA ✅" : "BIHAGARITSWE"}*\n\nIyo bikora, ShopBrain yibutsa abakiriya bamaze iminsi ${minDays}+ bagufitiye ideni, rimwe mu minsi ${cooldown} cyane.\n\nHibutswa gusa abemeye kwibutswa (kandi batanditse STOP). Abahaye itariki yo kwishyura ntibibutswa itarashira.`,
  arOnBtn: "✅ Fungura",
  arOffBtn: "⛔ Hagarika",
  arNowOn: "✅ Kwibutsa byikora birakora.",
  arNowOff: "⛔ Kwibutsa byikora byahagaritswe.",
  arOwnerSummary: (sent: number, total: number, failed: number) =>
    `⏰ *Ubutumwa bwoherejwe bwikora*\n\nAbakiriya ${sent} bibutswe · ${money(total)} asigaye${failed ? `\n❌ ${failed} byanze` : ""}`,

  promiseBtn: "📅 Itariki",
  promiseAsk: (name: string) =>
    `📅 *${name}* yasezeranyije kwishyura ryari?\n\nKanda buto, cyangwa wandike umubare w'iminsi (0 ni ugusiba).`,
  promise1: "Ejo",
  promise3: "Nyuma y'iminsi 3",
  promise7: "Nyuma y'iminsi 7",
  promiseSaved: (name: string, date: string) =>
    `✅ *${name}* yasezeranyije kwishyura bitarenze *${date}*.\n\nNta kwibutsa kwikora mbere yaho. Nasiba, azagaragara muri Gukurikirana.`,
  promiseCleared: (name: string) => `✅ Itariki yo kwishyura yasibwe kuri *${name}*.`,
  promiseInvalid: "❌ Andika umubare w'iminsi, urugero 3 (cyangwa 0 gusiba):",
  promiseLine: (date: string) => `📅 Yasezeranyije kwishyura: ${date}`,
  reasonPromise: (date: string) => `yarenze itariki yasezeranyije (${date})`,

  clWithLimit: (limit: number) =>
    `🚧 *Ikirenga cy'ideni: ${money(limit)}*\n\nShopBrain iraguburira iyo umwenda w'umukiriya wajya hejuru y'iki kigero.\n\nAndika ikigero gishya, cyangwa ukande Nta Kigero.`,
  clNoLimit:
    "🚧 *Ikirenga cy'ideni: nta kigero*\n\nShyiraho amafaranga menshi umukiriya yemerewe kukugomba. ShopBrain izakuburira mbere yo kongeraho umwenda urenze icyo kigero.\n\nAndika umubare (Frw):",
  clNoneBtn: "⏭️ Nta Kigero",
  clSaved: (limit: number) => `✅ Ikirenga cy'ideni cyashyizweho: ${money(limit)}.`,
  clCleared: "✅ Ikirenga cy'ideni cyakuweho.",
  clWarn: (name: string, newTotal: number, limit: number) =>
    `🚧 *${name}* yagomba *${money(newTotal)}*, arenze ikigero cyawe cya ${money(limit)}.\n\nUracyashaka kongeraho uyu mwenda?`,
  clContinueBtn: "✅ Ongeraho Nubundi",
  clCancelBtn: "✖️ Reka",
  clCancelled: "✖️ Umwenda ntiwongeweho.",

  supAskName: "💼 *Umwenda Mushya w'Uwangemurira*\n\nUgomba nde? (izina ry'uwagemuye)",
  supAskAmount: (name: string) => `Ugomba *${name}* angahe? (Frw)`,
  supAskNote: "Hari icyo wandika? (urugero: imifuka 20 y'umuceri)",
  supSaved: (name: string, amount: number, total: number) =>
    `✅ *Byabitswe*\n\n💼 ${name}\n💰 ${money(amount)}\n📊 Ugomba abagemura bose: ${money(total)}`,
  supNone: "✅ Nta mwenda ugomba abagemura ubu.",
  supHeader: (count: number, total: number) =>
    `💼 *Ugomba abagemura ${money(total)}* (${count})\n\nKanda umwe wemeze ko wishyuwe:`,
  supMore: (n: number) => `➕ Hari ${n} bindi bitagaragaye. Banza wishyure ibyo hejuru.`,
  supConfirm: (name: string, amount: number, note: string | null) =>
    `Wemeze ko wishyuwe?\n\n💼 ${name}\n💰 ${money(amount)}${note ? `\n📝 ${note}` : ""}`,
  supPayBtn: "✅ Yishyuwe Yose",
  supPaid: (name: string, amount: number) => `✅ *${name}* — ${money(amount)} byemejwe ko byishyuwe.`,
  supGone: "ℹ️ Uyu mwenda waramaze kwishyurwa cyangwa gusibwa.",
};

export const strings: Record<Lang, typeof en> = { en, rw };

/** Used by the webhook's follow-up list + customer card. */
export function promiseLine(lang: Lang, dateStr: string): string {
  return strings[lang].promiseLine(prettyDate(dateStr));
}
export function reasonPromise(lang: Lang, dateStr: string): string {
  return strings[lang].reasonPromise(prettyDate(dateStr));
}

/* ------------------------------------------------------------------ */
/* Menus                                                               */
/* ------------------------------------------------------------------ */

/** The new main menu: one bubble, three buttons. */
export async function sendMainBubble(from: string, lang: Lang, bodyText: string): Promise<void> {
  const s = strings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: bodyText },
    action: {
      buttons: [
        { type: "reply", reply: { id: "add_debt", title: s.addDebtBtn } },
        { type: "reply", reply: { id: "mark_paid_menu", title: s.markPaidBtn } },
        { type: "reply", reply: { id: "menu_list", title: s.menuBtn } },
      ],
    },
  });
}

// WhatsApp list messages hold at most 10 rows in total, so the full menu has
// exactly 10 rows and the rest sit one level down (Stock, Money, Suppliers,
// Settings).
export async function sendMenuList(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "list",
    body: { text: s.whatToDo },
    action: {
      button: s.menuListButton,
      sections: [
        {
          title: s.secCustomers,
          rows: [
            { id: "find_customer", title: s.rowFind },
            { id: "send_reminder_menu", title: s.rowRemind },
            { id: "followup_btn", title: s.rowFollow },
            { id: "view_all_customers", title: s.rowAll },
          ],
        },
        {
          title: s.secShop,
          rows: [
            { id: "sell_start", title: s.rowSell },
            { id: "stock_menu", title: s.rowStock },
          ],
        },
        {
          title: s.secMoney,
          rows: [
            { id: "money_menu", title: s.rowMoney },
            { id: "supplier_menu", title: s.rowSuppliers },
          ],
        },
        {
          title: s.secMore,
          rows: [
            { id: "settings_menu", title: s.rowSettings },
            { id: "help_btn", title: s.rowHelp },
          ],
        },
      ],
    },
  });
}

async function sendMoneyMenu(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "list",
    body: { text: s.whatToDo },
    action: {
      button: s.listButton,
      sections: [
        {
          title: s.secMoney,
          rows: [
            { id: "show_total", title: s.moneyTotal },
            { id: "report_btn", title: s.moneyReport },
            { id: "today_btn", title: s.moneyToday },
            { id: "profit_btn", title: s.moneyProfit },
            { id: "expense_add", title: s.moneyExpense },
          ],
        },
      ],
    },
  });
}

async function sendSettingsMenu(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "list",
    body: { text: s.whatToDo },
    action: {
      button: s.listButton,
      sections: [
        {
          title: s.rowSettings.slice(0, 24),
          rows: [
            { id: "momo_menu", title: s.setMomo },
            { id: "autoremind_menu", title: s.setAuto },
            { id: "creditlimit_menu", title: s.setLimit },
            { id: "change_language", title: s.setLang },
            { id: "security_info", title: s.setSecurity },
          ],
        },
      ],
    },
  });
}

async function sendStockMenu(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: s.whatToDo },
    action: {
      buttons: [
        { type: "reply", reply: { id: "stock_view", title: s.stockViewBtn } },
        { type: "reply", reply: { id: "stock_add", title: s.stockAddBtn } },
      ],
    },
  });
}

async function sendSupplierMenu(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: s.whatToDo },
    action: {
      buttons: [
        { type: "reply", reply: { id: "supplier_add", title: s.supAddBtn } },
        { type: "reply", reply: { id: "supplier_list", title: s.supListBtn } },
      ],
    },
  });
}

/* ------------------------------------------------------------------ */
/* 1 + 2. Stock: add / restock / list                                  */
/* ------------------------------------------------------------------ */

async function startAddStock(from: string, lang: Lang): Promise<void> {
  D.sessions[from] = { step: "stk_name", data: {} };
  await sendWhatsAppMessage(from, strings[lang].stkAskName);
}

async function showStock(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  const items = await fetchAll<StockItem>((a, b) =>
    supabase.from("stock_items").select("*").eq("shop_id", from).order("name", { ascending: true }).range(a, b),
  );
  if (items.length === 0) {
    await sendWhatsAppMessage(from, s.stkEmpty);
    menuSoon(from, lang);
    return;
  }
  const lines = items.map((i) => s.stkLine(i.name, i.qty, i.sell_price, i.qty <= i.low_threshold));
  const chunk = 20;
  for (let i = 0; i < lines.length; i += chunk) {
    const head = i === 0 ? s.stkHeader(items.length) : "";
    const isLast = i + chunk >= lines.length;
    await sendWhatsAppMessage(from, head + lines.slice(i, i + chunk).join("\n") + (isLast ? s.stkLowNote : ""));
  }
  menuSoon(from, lang);
}

async function sendChangePricesQuestion(from: string, lang: Lang, text: string): Promise<void> {
  const s = strings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: `${text}\n\n${s.stkChangePricesQ}` },
    action: {
      buttons: [
        { type: "reply", reply: { id: "stk_keep", title: s.stkKeepBtn } },
        { type: "reply", reply: { id: "stk_change", title: s.stkChangeBtn } },
      ],
    },
  });
}

/* ------------------------------------------------------------------ */
/* 3 + 4. Record sale (cash / credit) + low-stock alerts               */
/* ------------------------------------------------------------------ */

async function deductStock(
  shopId: string,
  stockId: string,
  qty: number,
): Promise<{ ok: boolean; left: number; item?: StockItem }> {
  // Optimistic lock on qty so two quick sales can't both read the same stock.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await supabase.from("stock_items").select("*").eq("id", stockId).eq("shop_id", shopId).maybeSingle();
    const item = data as StockItem | null;
    if (!item) return { ok: false, left: 0 };
    if (item.qty < qty) return { ok: false, left: item.qty, item };
    const { data: updated, error } = await supabase
      .from("stock_items")
      .update({ qty: item.qty - qty })
      .eq("id", stockId)
      .eq("shop_id", shopId)
      .eq("qty", item.qty)
      .select();
    if (error) throw error;
    if (updated && updated.length > 0) return { ok: true, left: item.qty - qty, item };
  }
  return { ok: false, left: 0 };
}

async function commitSale(
  shopId: string,
  stockId: string,
  qty: number,
  revenue: number,
  onCredit: boolean,
  customerName: string | null,
): Promise<{ ok: boolean; left: number; profit: number; item?: StockItem }> {
  const res = await deductStock(shopId, stockId, qty);
  if (!res.ok || !res.item) return { ok: false, left: res.left, profit: 0 };
  const cost = res.item.cost_price * qty;
  const { error } = await supabase.from("sales").insert({
    shop_id: shopId,
    item_name: res.item.name,
    qty,
    revenue,
    cost,
    on_credit: onCredit,
    customer_name: customerName,
  });
  if (error) console.error("Failed to log sale:", error);
  return { ok: true, left: res.left, profit: revenue - cost, item: res.item };
}

async function sendLowStockAlert(from: string, lang: Lang, item: StockItem, left: number): Promise<void> {
  if (left <= item.low_threshold) {
    await sendWhatsAppMessage(from, strings[lang].lowStock(item.name, left));
  }
}

async function chooseSellItem(from: string, lang: Lang, item: StockItem): Promise<void> {
  const s = strings[lang];
  if (item.qty <= 0) {
    await sendWhatsAppMessage(from, s.sellOut(item.name));
    return;
  }
  D.sessions[from] = {
    step: "sell_qty",
    data: {
      stockId: String(item.id),
      name: item.name,
      price: String(item.sell_price),
      avail: String(item.qty),
    },
  };
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: s.sellAskQty(item.name, item.qty, item.sell_price) },
    action: {
      buttons: [
        { type: "reply", reply: { id: "sellqty_1", title: "1" } },
        { type: "reply", reply: { id: "sellqty_2", title: "2" } },
        { type: "reply", reply: { id: "sellqty_5", title: "5" } },
      ],
    },
  });
}

async function showSellConfirm(from: string, lang: Lang): Promise<void> {
  const session = D.sessions[from];
  if (!session) return;
  const s = strings[lang];
  const qty = Number(g(session.data, "qty"));
  const price = Number(g(session.data, "price"));
  session.step = "sell_confirm";
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: s.sellConfirm(g(session.data, "name"), qty, price, qty * price) },
    action: {
      buttons: [
        { type: "reply", reply: { id: "sell_cash", title: s.sellCashBtn } },
        { type: "reply", reply: { id: "sell_credit", title: s.sellCreditBtn } },
        { type: "reply", reply: { id: "sell_price", title: s.sellPriceBtn } },
      ],
    },
  });
}

async function applySellQty(from: string, lang: Lang, qty: number): Promise<void> {
  const session = D.sessions[from];
  if (!session || session.step !== "sell_qty") return;
  const s = strings[lang];
  const avail = Number(g(session.data, "avail"));
  if (!Number.isFinite(qty) || qty <= 0) {
    await sendWhatsAppMessage(from, s.stkInvalid);
    return;
  }
  if (qty > avail) {
    await sendWhatsAppMessage(from, s.sellNotEnough(g(session.data, "name"), avail));
    return;
  }
  session.data["qty"] = String(qty);
  await showSellConfirm(from, lang);
}

async function sellByCash(from: string, lang: Lang): Promise<void> {
  const session = D.sessions[from];
  if (!session || session.step !== "sell_confirm") return;
  const s = strings[lang];
  const d = session.data;
  const qty = Number(g(d, "qty"));
  const price = Number(g(d, "price"));
  const name = g(d, "name");
  clearSession(from);

  const r = await commitSale(from, g(d, "stockId"), qty, qty * price, false, null);
  if (!r.ok || !r.item) {
    await sendWhatsAppMessage(from, s.sellNotEnough(name, r.left));
    menuSoon(from, lang);
    return;
  }
  await sendWhatsAppMessage(from, s.sellDone(name, qty, qty * price, money(r.profit), r.left));
  await sendLowStockAlert(from, lang, r.item, r.left);
  menuSoon(from, lang);
}

async function sellOnCredit(from: string, lang: Lang): Promise<void> {
  const session = D.sessions[from];
  if (!session || session.step !== "sell_confirm") return;
  const d = session.data;
  const qty = Number(g(d, "qty"));
  const price = Number(g(d, "price"));
  // Hand over to the normal Add Debt flow with item + amount pre-filled; the
  // webhook calls completeCreditSale() once the debt is saved.
  D.sessions[from] = {
    step: "add_phone",
    data: {
      presetItem: `${g(d, "name")} × ${qty}`,
      presetAmount: String(qty * price),
      stockId: g(d, "stockId"),
      stockQty: String(qty),
    },
  };
  await D.sendAddDebtPhonePrompt(from, lang);
}

/** Called by the webhook after a credit sale's debt row has been saved. */
export async function completeCreditSale(
  from: string,
  lang: Lang,
  p: { stockId: string; qty: number; revenue: number; customerName: string },
): Promise<void> {
  const s = strings[lang];
  const r = await commitSale(from, p.stockId, p.qty, p.revenue, true, p.customerName);
  if (!r.ok || !r.item) {
    await sendWhatsAppMessage(from, s.stockNotUpdated);
    return;
  }
  await sendWhatsAppMessage(from, s.creditStockNote(r.item.name, r.left, money(r.profit)));
  await sendLowStockAlert(from, lang, r.item, r.left);
}

/* ------------------------------------------------------------------ */
/* 5. Profit report                                                    */
/* ------------------------------------------------------------------ */

async function sendProfitPicker(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: s.profitPick },
    action: {
      buttons: [
        { type: "reply", reply: { id: "profit_today", title: s.btnToday } },
        { type: "reply", reply: { id: "profit_7", title: s.btn7 } },
        { type: "reply", reply: { id: "profit_30", title: s.btn30 } },
      ],
    },
  });
}

async function showProfit(from: string, lang: Lang, period: "today" | "7" | "30"): Promise<void> {
  const s = strings[lang];
  const since = (
    period === "today" ? startOfTodayKigali() : new Date(Date.now() - Number(period) * DAY_MS)
  ).toISOString();
  const label = period === "today" ? s.periodToday : period === "7" ? s.period7 : s.period30;

  const sales = await fetchAll<{ item_name: string; qty: number; revenue: number; cost: number }>((a, b) =>
    supabase
      .from("sales")
      .select("item_name, qty, revenue, cost")
      .eq("shop_id", from)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(a, b),
  );
  const expenses = await fetchAll<{ amount: number }>((a, b) =>
    supabase
      .from("expenses")
      .select("amount")
      .eq("shop_id", from)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(a, b),
  );

  if (sales.length === 0 && expenses.length === 0) {
    await sendWhatsAppMessage(from, `${s.profitHeader(label)}\n\n${s.profitNone}`);
    menuSoon(from, lang);
    return;
  }

  let revenue = 0;
  let cost = 0;
  const perItem = new Map<string, { qty: number; profit: number }>();
  for (const row of sales) {
    revenue += row.revenue;
    cost += row.cost;
    const cur = perItem.get(row.item_name) ?? { qty: 0, profit: 0 };
    cur.qty += row.qty;
    cur.profit += row.revenue - row.cost;
    perItem.set(row.item_name, cur);
  }
  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const gross = revenue - cost;

  const top = [...perItem.entries()]
    .sort((x, y) => y[1].profit - x[1].profit)
    .slice(0, 3)
    .map(([name, v]) => `• ${name} — ${v.qty} ${s.pcs} — ${money(v.profit)}`);

  const parts = [
    s.profitHeader(label),
    "",
    s.profitBody(sales.length, revenue, cost, gross, expenseTotal, gross - expenseTotal),
  ];
  if (top.length > 0) parts.push("", s.profitTop, ...top);
  parts.push("", s.profitNote);

  await sendWhatsAppMessage(from, parts.join("\n"));
  menuSoon(from, lang);
}

/* ------------------------------------------------------------------ */
/* 6. Expenses                                                         */
/* ------------------------------------------------------------------ */

async function saveExpense(from: string, lang: Lang, note: string | null): Promise<void> {
  const session = D.sessions[from];
  if (!session) return;
  const amount = Number(g(session.data, "amount"));
  clearSession(from);

  const { error } = await supabase.from("expenses").insert({ shop_id: from, amount, note });
  if (error) {
    console.error("Failed to save expense:", error);
    await sendWhatsAppMessage(from, "❌ Something went wrong. Please try again.");
    return;
  }
  const { data } = await supabase
    .from("expenses")
    .select("amount")
    .eq("shop_id", from)
    .gte("created_at", startOfTodayKigali().toISOString());
  const todayTotal = ((data ?? []) as { amount: number }[]).reduce((sum, e) => sum + e.amount, 0);
  await sendWhatsAppMessage(from, strings[lang].expSaved(amount, note, todayTotal));
  menuSoon(from, lang);
}

/* ------------------------------------------------------------------ */
/* 7. Auto-reminders (toggle + daily job)                              */
/* ------------------------------------------------------------------ */

async function showAutoRemindMenu(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  const { data } = await supabase.from("owners").select("auto_remind").eq("phone", D.cleanPhone(from)).single();
  const on = !!data?.auto_remind;
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: s.arStatus(on, AUTO_REMIND_MIN_DEBT_DAYS, D.reminderCooldownDays) },
    action: {
      buttons: [
        on
          ? { type: "reply", reply: { id: "autoremind_off", title: s.arOffBtn } }
          : { type: "reply", reply: { id: "autoremind_on", title: s.arOnBtn } },
      ],
    },
  });
}

async function setAutoRemind(from: string, lang: Lang, on: boolean): Promise<void> {
  await supabase.from("owners").update({ auto_remind: on }).eq("phone", D.cleanPhone(from));
  await sendWhatsAppMessage(from, on ? strings[lang].arNowOn : strings[lang].arNowOff);
  menuSoon(from, lang);
}

async function notifyOwner(ownerPhone: string, text: string): Promise<void> {
  // The 24h window is usually closed when the job runs, so fall back to the
  // owner_notices table; the webhook delivers it the next time they message.
  try {
    await sendWhatsAppMessage(ownerPhone, text);
  } catch {
    await supabase.from("owner_notices").insert({ shop_id: ownerPhone, text });
  }
}

// Same variable layout as sendReminder / sendReminderAll in webhook.ts.
function reminderVars(
  lang: Lang,
  customerName: string,
  shopName: string,
  total: number,
  itemized: string,
  momoBlock: string,
  contactPhone: string,
): string[] {
  return lang === "rw"
    ? [customerName, shopName, total.toLocaleString(), itemized, momoBlock, contactPhone, contactPhone]
    : [customerName, shopName, total.toLocaleString(), itemized, momoBlock, contactPhone];
}

interface AutoOwner extends OwnerMomoFields {
  phone: string;
  name: string | null;
  language: string | null;
  contact_phone: string | null;
  is_active: boolean | null;
}

interface AutoCustomer {
  id: string;
  name: string;
  phone: string | null;
  reminders_consent: boolean | null;
  last_reminded_at: string | null;
  promise_date: string | null;
}

let autoRunning = false;

async function autoRemindOwner(owner: AutoOwner): Promise<{ sent: number; failed: number }> {
  const shopId = owner.phone;
  const lang: Lang = owner.language === "rw" ? "rw" : "en";
  const shopName = owner.name ?? `Shop (${shopId.slice(-4)})`;
  const contactPhone = owner.contact_phone || shopId;
  const momoBlock = D.buildMomoBlock(owner, lang);
  const today = kigaliDate();

  const { data: custRows } = await supabase.from("customers").select("*").eq("shop_id", shopId);
  const customers = (custRows ?? []) as AutoCustomer[];
  if (customers.length === 0) return { sent: 0, failed: 0 };

  // Unpaid totals + oldest debt per customer (chunked to keep URLs short).
  const agg = new Map<string, { total: number; oldest: number }>();
  const ids = customers.map((c) => c.id);
  for (let i = 0; i < ids.length; i += 150) {
    const { data: tx } = await supabase
      .from("transactions")
      .select("customer_id, amount, date")
      .in("customer_id", ids.slice(i, i + 150))
      .eq("paid", false);
    for (const t of (tx ?? []) as { customer_id: string; amount: number; date: string }[]) {
      const ts = new Date(t.date).getTime();
      const cur = agg.get(t.customer_id) ?? { total: 0, oldest: ts };
      cur.total += t.amount;
      if (ts < cur.oldest) cur.oldest = ts;
      agg.set(t.customer_id, cur);
    }
  }

  const optedOut = await D.getOptedOutSet(customers.map((c) => c.phone ?? ""));
  const cooldownMs = D.reminderCooldownDays * DAY_MS;

  let sent = 0;
  let failed = 0;
  let sentTotal = 0;

  for (const c of customers) {
    if (!c.phone || optedOut.has(c.phone) || !c.reminders_consent) continue;
    const a = agg.get(c.id);
    if (!a || a.total <= 0) continue;
    if (Date.now() - a.oldest < AUTO_REMIND_MIN_DEBT_DAYS * DAY_MS) continue;
    if (c.last_reminded_at && Date.now() - new Date(c.last_reminded_at).getTime() < cooldownMs) continue;
    if (c.promise_date && c.promise_date >= today) continue; // they promised a date; wait for it to pass

    const itemized = await D.buildItemizedList(c.id);
    const { data: logRow } = await supabase
      .from("reminder_logs")
      .insert({
        message_id: `pending_${c.phone}_${Date.now()}`,
        owner_phone: shopId,
        customer_name: c.name,
        customer_phone: c.phone,
        amount: a.total,
        status: "pending",
        is_auto: true,
      })
      .select()
      .single();

    try {
      const messageId = await sendWhatsAppTemplateMessage(
        c.phone,
        D.reminderTemplateName(lang),
        D.metaLanguageCode(lang),
        reminderVars(lang, c.name, shopName, a.total, itemized, momoBlock, contactPhone),
      );
      if (logRow) await supabase.from("reminder_logs").update({ message_id: messageId }).eq("id", logRow.id);
      await supabase
        .from("customers")
        .update({ last_reminded_at: new Date().toISOString(), last_reminder_status: "pending" })
        .eq("id", c.id);
      sent++;
      sentTotal += a.total;
    } catch (err) {
      console.error("Auto reminder failed:", { shopId, customer: c.phone, err });
      if (logRow) await supabase.from("reminder_logs").update({ status: "failed" }).eq("id", logRow.id);
      failed++;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (sent > 0 || failed > 0) {
    await notifyOwner(shopId, strings[lang].arOwnerSummary(sent, sentTotal, failed));
  }
  return { sent, failed };
}

/** Daily job. Called by GET /jobs/auto-reminders (see webhook-edits.md). */
export async function runAutoReminders(): Promise<{ owners: number; sent: number; failed: number; skipped?: boolean }> {
  if (autoRunning) return { owners: 0, sent: 0, failed: 0, skipped: true };
  autoRunning = true;
  try {
    const { data } = await supabase
      .from("owners")
      .select("phone, name, language, momo_number, momo_code, momo_receiver_name, shop_nickname, contact_phone, is_active")
      .eq("auto_remind", true);
    const owners = ((data ?? []) as AutoOwner[]).filter((o) => o.is_active !== false);
    let sent = 0;
    let failed = 0;
    for (const o of owners) {
      try {
        const r = await autoRemindOwner(o);
        sent += r.sent;
        failed += r.failed;
      } catch (err) {
        console.error("Auto reminders failed for owner:", { owner: o.phone, err });
      }
    }
    return { owners: owners.length, sent, failed };
  } finally {
    autoRunning = false;
  }
}

/* ------------------------------------------------------------------ */
/* 8. Promise-to-pay date                                              */
/* ------------------------------------------------------------------ */

async function startPromise(from: string, lang: Lang): Promise<void> {
  const phone = D.sessions[from]?.data["lastPhone"];
  if (!phone) return;
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name")
    .eq("phone", phone)
    .eq("shop_id", from)
    .single();
  if (!customer) return;
  const s = strings[lang];
  D.sessions[from] = { step: "promise_days", data: { customerId: String(customer.id), customerName: customer.name } };
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: s.promiseAsk(customer.name) },
    action: {
      buttons: [
        { type: "reply", reply: { id: "promise_1", title: s.promise1 } },
        { type: "reply", reply: { id: "promise_3", title: s.promise3 } },
        { type: "reply", reply: { id: "promise_7", title: s.promise7 } },
      ],
    },
  });
}

async function savePromise(from: string, lang: Lang, days: number): Promise<void> {
  const session = D.sessions[from];
  if (!session || session.step !== "promise_days") return;
  const s = strings[lang];
  const customerId = g(session.data, "customerId");
  const name = g(session.data, "customerName");
  clearSession(from);

  if (days === 0) {
    await supabase.from("customers").update({ promise_date: null }).eq("id", customerId).eq("shop_id", from);
    await sendWhatsAppMessage(from, s.promiseCleared(name));
  } else {
    const date = kigaliDate(days);
    await supabase.from("customers").update({ promise_date: date }).eq("id", customerId).eq("shop_id", from);
    await sendWhatsAppMessage(from, s.promiseSaved(name, prettyDate(date)));
  }
  menuSoon(from, lang);
}

/* ------------------------------------------------------------------ */
/* 9. Credit limit                                                     */
/* ------------------------------------------------------------------ */

async function startCreditLimit(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  const { data } = await supabase.from("owners").select("credit_limit").eq("phone", D.cleanPhone(from)).single();
  const limit = data?.credit_limit as number | null | undefined;
  D.sessions[from] = { step: "limit_amount", data: {} };
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: limit ? s.clWithLimit(limit) : s.clNoLimit },
    action: { buttons: [{ type: "reply", reply: { id: "cl_none", title: s.clNoneBtn } }] },
  });
}

async function saveCreditLimit(from: string, lang: Lang, limit: number | null): Promise<void> {
  clearSession(from);
  await supabase.from("owners").update({ credit_limit: limit }).eq("phone", D.cleanPhone(from));
  await sendWhatsAppMessage(from, limit ? strings[lang].clSaved(limit) : strings[lang].clCleared);
  menuSoon(from, lang);
}

export interface CreditLimitCheck {
  newTotal: number;
  limit: number;
}

/**
 * Returns details when adding `amount` would push this customer over the
 * owner's credit limit, otherwise null. No-number customers can't be matched
 * to earlier debts, so only the single debt is compared.
 */
export async function creditLimitCheck(
  shopId: string,
  phone: string | null,
  amount: number,
): Promise<CreditLimitCheck | null> {
  const { data: owner } = await supabase.from("owners").select("credit_limit").eq("phone", D.cleanPhone(shopId)).single();
  const limit = owner?.credit_limit as number | null | undefined;
  if (!limit) return null;

  let existing = 0;
  if (phone) {
    const { data: customer } = await supabase.from("customers").select("id").eq("phone", phone).eq("shop_id", shopId).maybeSingle();
    if (customer) {
      const { data: tx } = await supabase.from("transactions").select("amount").eq("customer_id", customer.id).eq("paid", false);
      existing = ((tx ?? []) as { amount: number }[]).reduce((sum, t) => sum + t.amount, 0);
    }
  }
  const newTotal = existing + amount;
  return newTotal > limit ? { newTotal, limit } : null;
}

export async function sendCreditLimitWarning(
  from: string,
  lang: Lang,
  customerName: string,
  check: CreditLimitCheck,
): Promise<void> {
  const s = strings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: s.clWarn(customerName, check.newTotal, check.limit) },
    action: {
      buttons: [
        { type: "reply", reply: { id: "limit_continue", title: s.clContinueBtn } },
        { type: "reply", reply: { id: "limit_cancel", title: s.clCancelBtn } },
      ],
    },
  });
}

/* ------------------------------------------------------------------ */
/* 10. Supplier debts ("I owe")                                        */
/* ------------------------------------------------------------------ */

async function startSupplierAdd(from: string, lang: Lang): Promise<void> {
  D.sessions[from] = { step: "sup_name", data: {} };
  await sendWhatsAppMessage(from, strings[lang].supAskName);
}

async function saveSupplierDebt(from: string, lang: Lang, note: string | null): Promise<void> {
  const session = D.sessions[from];
  if (!session) return;
  const supplier = g(session.data, "supplier");
  const amount = Number(g(session.data, "amount"));
  clearSession(from);

  const { error } = await supabase.from("supplier_debts").insert({ shop_id: from, supplier, amount, note });
  if (error) {
    console.error("Failed to save supplier debt:", error);
    await sendWhatsAppMessage(from, "❌ Something went wrong. Please try again.");
    return;
  }
  const { data } = await supabase.from("supplier_debts").select("amount").eq("shop_id", from).eq("paid", false);
  const total = ((data ?? []) as { amount: number }[]).reduce((sum, r) => sum + r.amount, 0);
  await sendWhatsAppMessage(from, strings[lang].supSaved(supplier, amount, total));
  menuSoon(from, lang);
}

async function showSupplierList(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  const rows = await fetchAll<{ id: string; supplier: string; amount: number; note: string | null }>((a, b) =>
    supabase
      .from("supplier_debts")
      .select("id, supplier, amount, note")
      .eq("shop_id", from)
      .eq("paid", false)
      .order("created_at", { ascending: true })
      .range(a, b),
  );
  if (rows.length === 0) {
    await sendWhatsAppMessage(from, s.supNone);
    menuSoon(from, lang);
    return;
  }
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  await sendWhatsAppInteractiveMessage(from, {
    type: "list",
    body: { text: s.supHeader(rows.length, total) },
    action: {
      button: s.listButton,
      sections: [
        {
          title: s.rowSuppliers.slice(0, 24),
          rows: rows.slice(0, 10).map((r) => ({
            id: `suprow_${r.id}`,
            title: r.supplier.slice(0, 24),
            description: `${money(r.amount)}${r.note ? ` — ${r.note}` : ""}`.slice(0, 72),
          })),
        },
      ],
    },
  });
  if (rows.length > 10) await sendWhatsAppMessage(from, s.supMore(rows.length - 10));
}

async function confirmSupplierPaid(from: string, lang: Lang, id: string): Promise<void> {
  const s = strings[lang];
  const { data } = await supabase
    .from("supplier_debts")
    .select("id, supplier, amount, note")
    .eq("id", id)
    .eq("shop_id", from)
    .eq("paid", false)
    .maybeSingle();
  if (!data) {
    await sendWhatsAppMessage(from, s.supGone);
    menuSoon(from, lang);
    return;
  }
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: s.supConfirm(data.supplier, data.amount, data.note ?? null) },
    action: {
      buttons: [
        { type: "reply", reply: { id: `suppay_${data.id}`, title: s.supPayBtn } },
        { type: "reply", reply: { id: "flow_cancel", title: s.cancelBtn } },
      ],
    },
  });
}

async function markSupplierPaid(from: string, lang: Lang, id: string): Promise<void> {
  const s = strings[lang];
  const { data } = await supabase
    .from("supplier_debts")
    .update({ paid: true, paid_at: new Date().toISOString() })
    .eq("id", id)
    .eq("shop_id", from)
    .eq("paid", false)
    .select();
  const row = (data ?? [])[0] as { supplier: string; amount: number } | undefined;
  await sendWhatsAppMessage(from, row ? s.supPaid(row.supplier, row.amount) : s.supGone);
  menuSoon(from, lang);
}

/* ------------------------------------------------------------------ */
/* Router: button / list taps                                          */
/* ------------------------------------------------------------------ */

/** Returns true when the tap belonged to this module. */
export async function handleInteractive(from: string, id: string, lang: Lang): Promise<boolean> {
  const s = strings[lang];
  switch (id) {
    case "menu_list":
    case "more_menu": // old "More" buttons still sitting in earlier chats
      await sendMenuList(from, lang);
      return true;
    case "money_menu":
      await sendMoneyMenu(from, lang);
      return true;
    case "settings_menu":
      await sendSettingsMenu(from, lang);
      return true;
    case "stock_menu":
      await sendStockMenu(from, lang);
      return true;
    case "supplier_menu":
      await sendSupplierMenu(from, lang);
      return true;
    case "flow_cancel":
      clearSession(from);
      await D.sendMenu(from, lang);
      return true;

    // stock
    case "stock_view":
      await showStock(from, lang);
      return true;
    case "stock_add":
      await startAddStock(from, lang);
      return true;
    case "stk_keep":
      if (D.sessions[from]?.step !== "stk_prices") return true; // stale tap
      clearSession(from);
      menuSoon(from, lang);
      return true;
    case "stk_change": {
      const sess = D.sessions[from];
      if (!sess || sess.step !== "stk_prices") return true; // stale tap
      sess.step = "stk_new_cost";
      await sendWhatsAppMessage(from, s.stkAskCost(g(sess.data, "name")));
      return true;
    }

    // sell
    case "sell_start": {
      const { count } = await supabase.from("stock_items").select("id", { count: "exact", head: true }).eq("shop_id", from);
      if (!count) {
        await sendWhatsAppMessage(from, s.sellNoStock);
        await sendStockMenu(from, lang);
        return true;
      }
      D.sessions[from] = { step: "sell_item", data: {} };
      await sendWhatsAppMessage(from, s.sellAskItem);
      return true;
    }
    case "sell_cash":
      await sellByCash(from, lang);
      return true;
    case "sell_credit":
      await sellOnCredit(from, lang);
      return true;
    case "sell_price": {
      const sess = D.sessions[from];
      if (!sess || sess.step !== "sell_confirm") return true; // stale tap
      sess.step = "sell_price_input";
      await sendWhatsAppMessage(from, s.sellAskPrice);
      return true;
    }

    // profit + expenses
    case "profit_btn":
      await sendProfitPicker(from, lang);
      return true;
    case "profit_today":
      await showProfit(from, lang, "today");
      return true;
    case "profit_7":
      await showProfit(from, lang, "7");
      return true;
    case "profit_30":
      await showProfit(from, lang, "30");
      return true;
    case "expense_add":
      D.sessions[from] = { step: "exp_amount", data: {} };
      await sendWhatsAppMessage(from, s.expAskAmount);
      return true;
    case "exp_note_skip":
      if (D.sessions[from]?.step !== "exp_note") return true; // stale tap
      await saveExpense(from, lang, null);
      return true;

    // auto reminders
    case "autoremind_menu":
      await showAutoRemindMenu(from, lang);
      return true;
    case "autoremind_on":
      await setAutoRemind(from, lang, true);
      return true;
    case "autoremind_off":
      await setAutoRemind(from, lang, false);
      return true;

    // promise date
    case "promise_set":
      await startPromise(from, lang);
      return true;
    case "promise_1":
      await savePromise(from, lang, 1);
      return true;
    case "promise_3":
      await savePromise(from, lang, 3);
      return true;
    case "promise_7":
      await savePromise(from, lang, 7);
      return true;

    // credit limit
    case "creditlimit_menu":
      await startCreditLimit(from, lang);
      return true;
    case "cl_none":
      if (D.sessions[from]?.step !== "limit_amount") return true; // stale tap
      await saveCreditLimit(from, lang, null);
      return true;

    // suppliers
    case "supplier_add":
      await startSupplierAdd(from, lang);
      return true;
    case "supplier_list":
      await showSupplierList(from, lang);
      return true;
    case "sup_note_skip":
      if (D.sessions[from]?.step !== "sup_note") return true; // stale tap
      await saveSupplierDebt(from, lang, null);
      return true;
  }

  if (id.startsWith("sellpick_")) {
    const stockId = id.slice("sellpick_".length);
    const { data } = await supabase.from("stock_items").select("*").eq("id", stockId).eq("shop_id", from).maybeSingle();
    if (data) await chooseSellItem(from, lang, data as StockItem);
    return true;
  }
  if (id.startsWith("sellqty_")) {
    await applySellQty(from, lang, parseInt(id.slice("sellqty_".length), 10));
    return true;
  }
  if (id.startsWith("suprow_")) {
    await confirmSupplierPaid(from, lang, id.slice("suprow_".length));
    return true;
  }
  if (id.startsWith("suppay_")) {
    await markSupplierPaid(from, lang, id.slice("suppay_".length));
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Router: typed answers inside this module's flows                    */
/* ------------------------------------------------------------------ */

/** Returns true when the typed text was consumed by one of this module's flows. */
export async function handleSession(from: string, text: string, session: Session, lang: Lang): Promise<boolean> {
  const s = strings[lang];
  const value = text.trim();
  const d = session.data;

  switch (session.step) {
    // ---- add stock / restock ----
    case "stk_name": {
      if (value.length < 1 || value.length > 60) {
        await sendWhatsAppMessage(from, s.nameInvalid);
        return true;
      }
      const { data } = await supabase
        .from("stock_items")
        .select("*")
        .eq("shop_id", from)
        .ilike("name", escLike(value))
        .limit(1)
        .maybeSingle();
      const existing = data as StockItem | null;
      if (existing) {
        D.sessions[from] = { step: "stk_restock_qty", data: { stockId: String(existing.id), name: existing.name } };
        await sendWhatsAppMessage(from, s.stkExists(existing.name, existing.qty));
      } else {
        d["name"] = value;
        session.step = "stk_cost";
        await sendWhatsAppMessage(from, s.stkAskCost(value));
      }
      return true;
    }
    case "stk_cost":
    case "stk_new_cost": {
      const n = parseNum(value);
      if (Number.isNaN(n)) {
        await sendWhatsAppMessage(from, s.invalidAmount);
        return true;
      }
      d["cost"] = String(n);
      session.step = session.step === "stk_cost" ? "stk_price" : "stk_new_price";
      await sendWhatsAppMessage(from, s.stkAskPrice);
      return true;
    }
    case "stk_price": {
      const n = parseNum(value);
      if (Number.isNaN(n) || n <= 0) {
        await sendWhatsAppMessage(from, s.invalidAmount);
        return true;
      }
      d["price"] = String(n);
      session.step = "stk_qty";
      await sendWhatsAppMessage(from, s.stkAskQty);
      return true;
    }
    case "stk_qty": {
      const n = parseNum(value);
      if (Number.isNaN(n)) {
        await sendWhatsAppMessage(from, s.stkInvalid);
        return true;
      }
      const name = g(d, "name");
      const cost = Number(g(d, "cost"));
      const price = Number(g(d, "price"));
      clearSession(from);
      const { error } = await supabase
        .from("stock_items")
        .insert({ shop_id: from, name, qty: n, cost_price: cost, sell_price: price });
      if (error) {
        console.error("Failed to save stock item:", error);
        await sendWhatsAppMessage(from, "❌ Something went wrong. Please try again.");
        return true;
      }
      await sendWhatsAppMessage(from, s.stkSaved(name, n, cost, price));
      menuSoon(from, lang);
      return true;
    }
    case "stk_restock_qty": {
      const n = parseNum(value);
      if (Number.isNaN(n) || n <= 0) {
        await sendWhatsAppMessage(from, s.stkInvalid);
        return true;
      }
      const stockId = g(d, "stockId");
      const { data } = await supabase.from("stock_items").select("*").eq("id", stockId).eq("shop_id", from).maybeSingle();
      const item = data as StockItem | null;
      if (!item) {
        clearSession(from);
        await sendWhatsAppMessage(from, s.supGone);
        return true;
      }
      const newQty = item.qty + n;
      await supabase.from("stock_items").update({ qty: newQty }).eq("id", stockId).eq("shop_id", from);
      session.step = "stk_prices";
      await sendChangePricesQuestion(from, lang, s.stkRestocked(item.name, n, newQty));
      return true;
    }
    case "stk_new_price": {
      const n = parseNum(value);
      if (Number.isNaN(n) || n <= 0) {
        await sendWhatsAppMessage(from, s.invalidAmount);
        return true;
      }
      const stockId = g(d, "stockId");
      const name = g(d, "name");
      const cost = Number(g(d, "cost"));
      clearSession(from);
      await supabase.from("stock_items").update({ cost_price: cost, sell_price: n }).eq("id", stockId).eq("shop_id", from);
      await sendWhatsAppMessage(from, s.stkPricesSaved(name));
      menuSoon(from, lang);
      return true;
    }

    // ---- record sale ----
    case "sell_item": {
      const { data } = await supabase
        .from("stock_items")
        .select("*")
        .eq("shop_id", from)
        .ilike("name", `%${escLike(value)}%`)
        .order("name", { ascending: true })
        .limit(10);
      const items = (data ?? []) as StockItem[];
      if (items.length === 0) {
        await sendWhatsAppMessage(from, s.sellNoMatch(value));
        return true;
      }
      const exact = items.find((i) => i.name.toLowerCase() === value.toLowerCase());
      if (items.length === 1 || exact) {
        await chooseSellItem(from, lang, (exact ?? items[0]) as StockItem);
        return true;
      }
      await sendWhatsAppMessage(from, s.sellPick(value));
      await sendWhatsAppInteractiveMessage(from, {
        type: "list",
        body: { text: s.whatToDo },
        action: {
          button: s.listButton,
          sections: [
            {
              title: s.rowStock.slice(0, 24),
              rows: items.map((i) => ({
                id: `sellpick_${i.id}`,
                title: i.name.slice(0, 24),
                description: `${i.qty} ${s.pcs} — ${money(i.sell_price)}`.slice(0, 72),
              })),
            },
          ],
        },
      });
      return true;
    }
    case "sell_qty": {
      await applySellQty(from, lang, parseNum(value));
      return true;
    }
    case "sell_price_input": {
      const n = parseNum(value);
      if (Number.isNaN(n) || n <= 0) {
        await sendWhatsAppMessage(from, s.invalidAmount);
        return true;
      }
      d["price"] = String(n);
      await showSellConfirm(from, lang);
      return true;
    }

    // ---- expenses ----
    case "exp_amount": {
      const n = parseNum(value);
      if (Number.isNaN(n) || n <= 0) {
        await sendWhatsAppMessage(from, s.invalidAmount);
        return true;
      }
      d["amount"] = String(n);
      session.step = "exp_note";
      await sendWhatsAppInteractiveMessage(from, {
        type: "button",
        body: { text: s.expAskNote },
        action: { buttons: [{ type: "reply", reply: { id: "exp_note_skip", title: s.skipNote } }] },
      });
      return true;
    }
    case "exp_note": {
      await saveExpense(from, lang, value.slice(0, 100) || null);
      return true;
    }

    // ---- promise date ----
    case "promise_days": {
      const n = parseNum(value);
      if (Number.isNaN(n) || n > 90) {
        await sendWhatsAppMessage(from, s.promiseInvalid);
        return true;
      }
      await savePromise(from, lang, n);
      return true;
    }

    // ---- credit limit ----
    case "limit_amount": {
      const n = parseNum(value);
      if (Number.isNaN(n) || n <= 0) {
        await sendWhatsAppMessage(from, s.invalidAmount);
        return true;
      }
      await saveCreditLimit(from, lang, n);
      return true;
    }

    // ---- supplier debts ----
    case "sup_name": {
      if (value.length < 1 || value.length > 60) {
        await sendWhatsAppMessage(from, s.nameInvalid);
        return true;
      }
      d["supplier"] = value;
      session.step = "sup_amount";
      await sendWhatsAppMessage(from, s.supAskAmount(value));
      return true;
    }
    case "sup_amount": {
      const n = parseNum(value);
      if (Number.isNaN(n) || n <= 0) {
        await sendWhatsAppMessage(from, s.invalidAmount);
        return true;
      }
      d["amount"] = String(n);
      session.step = "sup_note";
      await sendWhatsAppInteractiveMessage(from, {
        type: "button",
        body: { text: s.supAskNote },
        action: { buttons: [{ type: "reply", reply: { id: "sup_note_skip", title: s.skipNote } }] },
      });
      return true;
    }
    case "sup_note": {
      await saveSupplierDebt(from, lang, value.slice(0, 100) || null);
      return true;
    }
  }
  return false;
}