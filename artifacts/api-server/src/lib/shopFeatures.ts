// src/lib/shopFeatures.ts
//
// ShopBrain feature pack, part 1. Wired into routes/webhook.ts (see the
// "features." lines there). Run shopbrain_migration.sql in Supabase FIRST.
//
// Part 2 is shopExtras.ts (auto-reminders, customer buttons, receipts,
// scoreboard, export, no-number fix). Parsing of "type everything in one
// message" lives in shopParsing.ts.
//
// What lives HERE:
//   MENUS      sendMainBubble (Add Debt | Mark as Paid | Menu) and sendMenuList
//              with its sub-menus (a WhatsApp list holds at most 10 rows, so the
//              menu is split into short lists)
//   STOCK      add / restock / list, Record Sale (cash or credit), low-stock
//              alerts, profit report, expenses   <- explained step by step below
//   ONE MESSAGE  typed shortcuts for Add Debt, Mark as Paid, MoMo, Stock, Sale,
//              Expense, Supplier debt and Edit Customer, each with a confirm step
//   OTHER      promise-to-pay date, credit limit, supplier debts

import { supabase } from "./supabase.js";
import { sendWhatsAppMessage, sendWhatsAppInteractiveMessage } from "./whatsapp.js";
import {
  isPhoneLike,
  parseAmountToken,
  parseCustomerEdit,
  parseDebtMessage,
  parseExpenseMessage,
  parseMomoMessage,
  parsePaidMessage,
  parseSaleMessage,
  parseStockMessage,
  parseSupplierMessage,
  type ParsedDebt,
  type ParsedMomo,
  type ParsedStock,
} from "./shopParsing.js";
import { xstrings } from "./shopExtras.js";

export type Lang = "en" | "rw";
export interface Session {
  step: string;
  data: Record<string, string>;
}

/** Everything this module needs from webhook.ts. Passed in once at start-up. */
export interface FeatureDeps {
  sessions: Record<string, Session | undefined>;
  cleanPhone: (phone: string) => string;
  /** Sends the main menu bubble (webhook's sendPersistentMenu). */
  sendMenu: (from: string, lang: Lang) => Promise<void>;
  /** Sends the "customer's phone number?" prompt of the Add Debt flow (credit sales use it). */
  sendAddDebtPhonePrompt: (from: string, lang: Lang) => Promise<void>;
  /** Saves a debt from session data (phone, name, item, consent) - webhook's finishAddDebt. */
  finishAddDebt: (from: string, lang: Lang, amount: number) => Promise<void>;
  /** Records a partial (or full) payment for a customer. */
  applyPartialPayment: (
    from: string,
    customer: { id: string; name: string; phone: string },
    amount: number,
    lang: Lang,
    item: string,
  ) => Promise<void>;
  /** Marks every unpaid debt of a customer as paid. */
  markAllPaid: (from: string, lang: Lang, customer: { id: string; name: string }) => Promise<void>;
  /** Saves the edited customer held in the session (webhook's saveEditedCustomer). */
  saveEditedCustomer: (from: string, lang: Lang) => Promise<void>;
}

let D!: FeatureDeps;
export function initShopFeatures(deps: FeatureDeps): void {
  D = deps;
}


/* ------------------------------------------------------------------ */
/* Constants + small helpers                                           */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;
const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000; // Africa/Kigali is UTC+2, no DST

function money(n: number): string {
  return `${n.toLocaleString()} Frw`;
}

/** "2000", "2,000" and "2k" all give a number; anything else gives NaN. */
function parseNum(text: string): number {
  const shorthand = parseAmountToken(text.trim(), true); // understands 2k = 2000
  if (shorthand !== null) return shorthand;
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
  tapButtons: "👆 Please tap one of the buttons above.",
  stockHeldOff: "📦 Stock isn't available yet. We'll tell you when it's ready.",
  secDebts: "Debts",
  momoHint: "❌ I couldn't read that.\n\nExample: `0788123456, NIYONZIMA ALICE, Chez Alice`\nOr send just the number.",
  stkHint: "❌ I couldn't read that.\n\nExample: `Sugar 1kg, 800, 1000, 20`\n(name, buying price, selling price, how many)\nOr send just the item name.",
  supHint: "❌ I couldn't read that.\n\nExample: `Kigali Rice, 50000, 20 bags`\n(supplier, amount, note)\nOr send just the supplier's name.",
  cancelledGeneric: "✖️ Cancelled, nothing was saved.",
  saveBtn: "✅ Save",
  noCustomerFound: (q: string) => `❌ No customer found matching "${q}".`,
  menuTitle: "📋 *Menu*",
  titleMoney: "💰 *Money & Reports*",
  titleSettings: "⚙️ *Settings*",
  titleStock: "📦 *Stock*",
  titleSuppliers: "💼 *I Owe Suppliers*",
  moneyRecovered: "🏆 Recovered",
  moneyExport: "📤 Export",
  stockConfirm: (name: string, cost: number, price: number, qty: number, existingQty: number | null) =>
    existingQty === null
      ? `📦 *Save this item?*\n\n${name}\n💵 Buy ${money(cost)} · Sell ${money(price)}\n🔢 ${qty} pcs`
      : `📦 *${name}* is already in stock (${existingQty} pcs).\n\nAdd ${qty} more (→ ${existingQty + qty}) and set Buy ${money(cost)} · Sell ${money(price)}?`,
  expenseConfirm: (amount: number, note: string | null) =>
    `🧾 *Save this expense?*\n\n💸 ${money(amount)}${note ? `\n📝 ${note}` : ""}`,
  supplierConfirm: (supplier: string, amount: number, note: string | null) =>
    `💼 *Save this supplier debt?*\n\n${supplier}\n💰 ${money(amount)}${note ? `\n📝 ${note}` : ""}`,
  momoConfirm: (number: string, receiver: string, nickname: string, code: string) =>
    `💳 *Save MoMo details?*\n\n📱 ${number}${code ? `\n🔑 ${code}` : ""}\n👤 ${receiver}${nickname ? `\n🏪 ${nickname}` : ""}`,
  momoSaved: (number: string, name: string) =>
    `✅ *MoMo details saved!*\n\n📱 ${number}\n👤 ${name}\n\nCustomers see these when they ask how to pay.`,

  // main bubble + menus
  addDebtBtn: "➕ Add Debt",
  markPaidBtn: "✅ Mark as Paid",
  menuBtn: "📋 Menu",
  menuListButton: "Menu",
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
  stkAskName: "📦 *Add Stock*\n\nType it all in one message:\n\n`Sugar 1kg, 800, 1000, 20`\n(name, buying price, selling price, how many)\n\nOr send just the item name and I\'ll ask the rest.",
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
  sellAskItem: "💵 *Record Sale*\n\nType the item and how many:\n\n`sugar 2`\n\nOr send just the item name and I\'ll ask how many.",
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
  expAskAmount: "🧾 *Add Expense*\n\nType the amount and what it was for:\n\n`2000 transport`\n\nOr send just the amount.",
  expAskNote: "What was it for? (e.g. transport, rent)",
  expSaved: (amount: number, note: string | null, todayTotal: number) =>
    `✅ *Expense saved*\n\n💸 ${money(amount)}${note ? `\n📝 ${note}` : ""}\n📆 Today's expenses: ${money(todayTotal)}`,

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
  supAskName: "💼 *New Supplier Debt*\n\nType it all in one message:\n\n`Kigali Rice, 50000, 20 bags`\n(supplier, amount, note)\n\nOr send just the supplier\'s name and I\'ll ask the rest.",
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
  tapButtons: "👆 Kanda imwe muri buto zo hejuru.",
  stockHeldOff: "📦 Ububiko ntiburaboneka ubu. Tuzakumenyesha ubwo buzaba bwiteguye.",
  secDebts: "Amadeni",
  momoHint: "❌ Ntabwo nabisomye.\n\nUrugero: `0788123456, NIYONZIMA ALICE, Chez Alice`\nCyangwa ohereza nimero gusa.",
  stkHint: "❌ Ntabwo nabisomye.\n\nUrugero: `Isukari 1kg, 800, 1000, 20`\n(izina, igiciro ugura, igiciro ugurisha, ingano)\nCyangwa ohereza izina gusa.",
  supHint: "❌ Ntabwo nabisomye.\n\nUrugero: `Kigali Rice, 50000, imifuka 20`\n(uwagemuye, umubare, icyo wanditse)\nCyangwa ohereza izina gusa.",
  cancelledGeneric: "✖️ Byahagaritswe, nta cyabitswe.",
  saveBtn: "✅ Bika",
  noCustomerFound: (q: string) => `❌ Nta mukiriya ubonetse witwa "${q}".`,
  menuTitle: "📋 *Menu*",
  titleMoney: "💰 *Amafaranga & Raporo*",
  titleSettings: "⚙️ *Igenamiterere*",
  titleStock: "📦 *Ububiko*",
  titleSuppliers: "💼 *Amadeni Nkwiye*",
  moneyRecovered: "🏆 Byagarutse",
  moneyExport: "📤 Kohereza Kopi",
  stockConfirm: (name: string, cost: number, price: number, qty: number, existingQty: number | null) =>
    existingQty === null
      ? `📦 *Ubike iki gicuruzwa?*\n\n${name}\n💵 Kugura ${money(cost)} · Kugurisha ${money(price)}\n🔢 ${qty}`
      : `📦 *${name}* isanzwe mu bubiko (${existingQty}).\n\nWongeremo ${qty} (→ ${existingQty + qty}) ushyireho Kugura ${money(cost)} · Kugurisha ${money(price)}?`,
  expenseConfirm: (amount: number, note: string | null) =>
    `🧾 *Ubike iki kiguzi?*\n\n💸 ${money(amount)}${note ? `\n📝 ${note}` : ""}`,
  supplierConfirm: (supplier: string, amount: number, note: string | null) =>
    `💼 *Ubike uyu mwenda w'uwagemuye?*\n\n${supplier}\n💰 ${money(amount)}${note ? `\n📝 ${note}` : ""}`,
  momoConfirm: (number: string, receiver: string, nickname: string, code: string) =>
    `💳 *Ubike amakuru ya MoMo?*\n\n📱 ${number}${code ? `\n🔑 ${code}` : ""}\n👤 ${receiver}${nickname ? `\n🏪 ${nickname}` : ""}`,
  momoSaved: (number: string, name: string) =>
    `✅ *Amakuru ya MoMo yabitswe!*\n\n📱 ${number}\n👤 ${name}\n\nAbakiriya bayabona igihe babajije uko bishyura.`,

  addDebtBtn: "➕ Ongeraho Umwenda",
  markPaidBtn: "✅ Emeza Kwishyura",
  menuBtn: "📋 Menu",
  menuListButton: "Menu",
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

  stkAskName: "📦 *Ongeramo Ibicuruzwa*\n\nAndika byose mu butumwa bumwe:\n\n`Isukari 1kg, 800, 1000, 20`\n(izina, igiciro ugura, igiciro ugurisha, ingano)\n\nCyangwa ohereza izina gusa, nzakubaza ibindi.",
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

  sellAskItem: "💵 *Andika Igurisha*\n\nAndika igicuruzwa n\'ingano:\n\n`isukari 2`\n\nCyangwa ohereza izina gusa, nzakubaza ingano.",
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

  expAskAmount: "🧾 *Andika Ikiguzi*\n\nAndika umubare n\'icyo wakoreshejwe:\n\n`2000 transport`\n\nCyangwa ohereza umubare gusa.",
  expAskNote: "Byari bigenewe iki? (urugero: transport, inzu)",
  expSaved: (amount: number, note: string | null, todayTotal: number) =>
    `✅ *Ikiguzi cyabitswe*\n\n💸 ${money(amount)}${note ? `\n📝 ${note}` : ""}\n📆 Ibiguzi by'uyu munsi: ${money(todayTotal)}`,

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

  supAskName: "💼 *Umwenda Mushya w\'Uwangemurira*\n\nAndika byose mu butumwa bumwe:\n\n`Kigali Rice, 50000, imifuka 20`\n(uwagemuye, umubare, icyo wanditse)\n\nCyangwa ohereza izina gusa, nzakubaza ibindi.",
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
/* Stock on/off switch                                                  */
/* ------------------------------------------------------------------ */

/**
 * Stock management is HELD OFF for now. While this is false:
 *   - Record Sale, Stock, Profit and Add Expense are not in any menu,
 *   - old buttons for them (still sitting in earlier chats) answer "not available yet",
 *   - credit sales from stock and low-stock alerts can't happen,
 *   - only debt tracking is shown.
 * The stock code below is all still here. To bring it back, set the environment
 * variable STOCK_FEATURES=on and restart: the menus return to the layout that
 * has the Shop section (Record Sale + Stock) and Money has Profit + Add Expense.
 */
export function stockEnabled(): boolean {
  return process.env["STOCK_FEATURES"] === "on";
}

/** Buttons and typed answers that belong to the held-off stock / profit / expense features. */
function isStockId(id: string): boolean {
  return /^(stock_|stk|sell|profit_|expense_add$|exp_note_skip$|expok_)/.test(id);
}

/* ------------------------------------------------------------------ */
/* Menus                                                               */
/* ------------------------------------------------------------------ */

/**
 * The main menu.
 *  - Stock held off (now): the FIRST bubble is the menu itself. It is one list message
 *    with a "Menu" button, and Add Debt and Mark as Paid are the first rows. Tapping
 *    Menu opens the options straight away: no second bubble, no question.
 *  - Stock on: the older bubble with three buttons (Add Debt | Mark as Paid | Menu).
 */
export async function sendMainBubble(from: string, lang: Lang, bodyText: string): Promise<void> {
  const s = strings[lang];
  if (!stockEnabled()) {
    await sendDebtMenuList(from, lang, bodyText);
    return;
  }
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

// "Menu" opens this list straight away. The text above it is just the word
// "Menu", not a question. (WhatsApp keeps a list folded until the person taps
// its button, so that one tap can't be removed, but no question is asked.)
//
// WhatsApp lists hold at most 10 rows in total, so the full menu has exactly
// 10 rows and the rest sit one level down (Stock, Money, Suppliers, Settings).
export async function sendMenuList(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  if (!stockEnabled()) {
    await sendDebtMenuList(from, lang, s.menuTitle);
    return;
  }
  await sendWhatsAppInteractiveMessage(from, {
    type: "list",
    body: { text: s.menuTitle },
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

/**
 * The debt-tracking menu: exactly 10 rows, which is the most WhatsApp allows in one list.
 * Money & Reports and Settings open a short list of their own.
 */
async function sendDebtMenuList(from: string, lang: Lang, bodyText: string): Promise<void> {
  const s = strings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "list",
    body: { text: bodyText },
    action: {
      button: s.menuListButton,
      sections: [
        {
          title: s.secDebts,
          rows: [
            { id: "add_debt", title: s.addDebtBtn },
            { id: "mark_paid_menu", title: s.markPaidBtn },
            { id: "find_customer", title: s.rowFind },
            { id: "send_reminder_menu", title: s.rowRemind },
          ],
        },
        {
          title: s.secCustomers,
          rows: [
            { id: "followup_btn", title: s.rowFollow },
            { id: "view_all_customers", title: s.rowAll },
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
    body: { text: s.titleMoney },
    action: {
      button: s.listButton,
      sections: [
        {
          title: s.secMoney,
          rows: [
            { id: "show_total", title: s.moneyTotal },
            { id: "report_btn", title: s.moneyReport },
            { id: "today_btn", title: s.moneyToday },
            // Profit works out of stock sales, and Add Expense only feeds Profit: held off with stock.
            ...(stockEnabled()
              ? [
                  { id: "profit_btn", title: s.moneyProfit },
                  { id: "expense_add", title: s.moneyExpense },
                ]
              : []),
            { id: "recovered_btn", title: s.moneyRecovered },
            { id: "export_btn", title: s.moneyExport },
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
    body: { text: s.titleSettings },
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
    body: { text: s.titleStock },
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
    body: { text: s.titleSuppliers },
    action: {
      buttons: [
        { type: "reply", reply: { id: "supplier_add", title: s.supAddBtn } },
        { type: "reply", reply: { id: "supplier_list", title: s.supListBtn } },
      ],
    },
  });
}


/* ------------------------------------------------------------------ */
/* STOCK MANAGEMENT  (adding stock, restocking, the stock list)         */
/* ------------------------------------------------------------------ */
//
// HOW STOCK WORKS  (read this first if you are new to this code)
//
//   * Every product a shop sells is ONE ROW in the Supabase table "stock_items":
//        name, qty (how many are left), cost_price (what the shop pays for one),
//        sell_price (what the shop sells one for) and low_threshold
//        (the "running low" level; we start it at 3).
//   * Every row has a shop_id. That is the owner's WhatsApp number, so one shop
//     never sees another shop's products. Every query below filters on it.
//   * Every sale is ONE ROW in the table "sales": what was sold, how many, the
//     money received (revenue) and what those pieces cost the shop (cost).
//     Profit is simply revenue minus cost, so the Profit report can be worked
//     out later from this table.
//   * Selling something REMOVES pieces from qty, and when qty falls to the
//     low_threshold the owner gets a "running low" warning.
//
// The pieces, in the order an owner meets them:
//   1. startAddStock / askStockConfirm / saveStockConfirmed   add or restock an item
//   2. showStock                                              see everything in stock
//   3. startSale / chooseSellItem / showSellConfirm           pick an item and a quantity
//   4. sellByCash / sellOnCredit / completeCreditSale         finish the sale
//   5. deductStock / commitSale / sendLowStockAlert           the part that touches the numbers

/** Starts "Add Stock". The owner types everything in one message, e.g.  Sugar 1kg, 800, 1000, 20 */
async function startAddStock(from: string, lang: Lang): Promise<void> {
  D.sessions[from] = { step: "stk_name", data: {} };
  await sendWhatsAppMessage(from, strings[lang].stkAskName);
}

/** Looks for a product of THIS shop with exactly this name (capital letters don't matter). */
async function findStockByName(shopId: string, name: string): Promise<StockItem | null> {
  const { data } = await supabase
    .from("stock_items")
    .select("*")
    .eq("shop_id", shopId)
    .ilike("name", escLike(name))
    .limit(1)
    .maybeSingle();
  return (data as StockItem | null) ?? null;
}

/**
 * Shows what we understood from the owner's message and asks "Save?".
 * If the product already exists, this becomes a RESTOCK: the typed quantity is
 * added on top of what is already there and the prices are updated.
 */
async function askStockConfirm(from: string, lang: Lang, parsed: ParsedStock): Promise<void> {
  const s = strings[lang];
  const existing = await findStockByName(from, parsed.name);
  D.sessions[from] = {
    step: "stk_confirm",
    data: {
      name: existing?.name ?? parsed.name,
      cost: String(parsed.cost),
      price: String(parsed.price),
      qty: String(parsed.qty),
      existingId: existing ? String(existing.id) : "",
    },
  };
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: s.stockConfirm(existing?.name ?? parsed.name, parsed.cost, parsed.price, parsed.qty, existing ? existing.qty : null) },
    action: {
      buttons: [
        { type: "reply", reply: { id: "stkok_yes", title: s.saveBtn } },
        { type: "reply", reply: { id: "stkok_no", title: s.cancelBtn } },
      ],
    },
  });
}

/** The owner tapped "Save": create the product, or add the pieces to the existing one. */
async function saveStockConfirmed(from: string, lang: Lang): Promise<void> {
  const session = D.sessions[from];
  if (!session || session.step !== "stk_confirm") return; // an old button tap, ignore
  const s = strings[lang];
  const d = session.data;
  const name = g(d, "name");
  const cost = Number(g(d, "cost"));
  const price = Number(g(d, "price"));
  const qty = Number(g(d, "qty"));
  const existingId = g(d, "existingId");
  clearSession(from);

  if (existingId) {
    // RESTOCK: read the current number again (it may have changed since the question), then add.
    const { data } = await supabase.from("stock_items").select("*").eq("id", existingId).eq("shop_id", from).maybeSingle();
    const item = data as StockItem | null;
    if (item) {
      const newQty = item.qty + qty;
      await supabase
        .from("stock_items")
        .update({ qty: newQty, cost_price: cost, sell_price: price })
        .eq("id", existingId)
        .eq("shop_id", from);
      await sendWhatsAppMessage(from, s.stkRestocked(item.name, qty, newQty));
      menuSoon(from, lang);
      return;
    }
  }

  // NEW PRODUCT: one new row in stock_items.
  const { error } = await supabase
    .from("stock_items")
    .insert({ shop_id: from, name, qty, cost_price: cost, sell_price: price });
  if (error) {
    console.error("Failed to save stock item:", error);
    await sendWhatsAppMessage(from, "❌ Something went wrong. Please try again.");
    return;
  }
  await sendWhatsAppMessage(from, s.stkSaved(name, qty, cost, price));
  menuSoon(from, lang);
}

/** "My Stock": lists every product with how many are left. A ⚠️ marks the ones running low. */
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
  // "Running low" means qty is at or below the product's low_threshold.
  const lines = items.map((i) => s.stkLine(i.name, i.qty, i.sell_price, i.qty <= i.low_threshold));
  // WhatsApp messages have a length limit, so a long list is sent in pieces of 20 lines.
  const piece = 20;
  for (let i = 0; i < lines.length; i += piece) {
    const head = i === 0 ? s.stkHeader(items.length) : "";
    const isLast = i + piece >= lines.length;
    await sendWhatsAppMessage(from, head + lines.slice(i, i + piece).join("\n") + (isLast ? s.stkLowNote : ""));
  }
  menuSoon(from, lang);
}

/**
 * After a restock typed step by step (the older, slower way), asks if the prices changed too.
 * The one-message way (name, buy, sell, quantity) already includes the prices.
 */
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
/* STOCK MANAGEMENT  (selling from stock, low-stock alerts)             */
/* ------------------------------------------------------------------ */

/**
 * Takes `qty` pieces out of stock.
 *
 * Why the loop? Imagine two sales of the same product happening at the same
 * moment. Both would read "10 left" and both would write "9 left", so one
 * sale would be lost. To prevent that, the update only succeeds if qty is STILL
 * the number we just read (the .eq("qty", item.qty) line). If someone else
 * changed it first, nothing is updated, so we read again and retry (up to 3 times).
 */
async function deductStock(
  shopId: string,
  stockId: string,
  qty: number,
): Promise<{ ok: boolean; left: number; item?: StockItem }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await supabase.from("stock_items").select("*").eq("id", stockId).eq("shop_id", shopId).maybeSingle();
    const item = data as StockItem | null;
    if (!item) return { ok: false, left: 0 };
    if (item.qty < qty) return { ok: false, left: item.qty, item }; // not enough pieces left
    const { data: updated, error } = await supabase
      .from("stock_items")
      .update({ qty: item.qty - qty })
      .eq("id", stockId)
      .eq("shop_id", shopId)
      .eq("qty", item.qty) // only if nobody changed qty in the meantime
      .select();
    if (error) throw error;
    if (updated && updated.length > 0) return { ok: true, left: item.qty - qty, item };
  }
  return { ok: false, left: 0 };
}

/**
 * Records one sale: removes the pieces from stock AND writes a row in "sales".
 *   revenue = the money the shop receives (or is owed, for a credit sale)
 *   cost    = what those pieces cost the shop (cost_price x qty)
 *   profit  = revenue - cost  (returned so we can show it to the owner)
 */
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

/** Warns the owner when a product is running low (or finished) after a sale. */
async function sendLowStockAlert(from: string, lang: Lang, item: StockItem, left: number): Promise<void> {
  if (left <= item.low_threshold) {
    await sendWhatsAppMessage(from, strings[lang].lowStock(item.name, left));
  }
}

/** "Record Sale": the owner types the product and how many, e.g.  sugar 2 */
async function startSale(from: string, lang: Lang): Promise<void> {
  const s = strings[lang];
  const { count } = await supabase.from("stock_items").select("id", { count: "exact", head: true }).eq("shop_id", from);
  if (!count) {
    // Nothing in stock yet, so there is nothing to sell: send them to Add Stock.
    await sendWhatsAppMessage(from, s.sellNoStock);
    await sendStockMenu(from, lang);
    return;
  }
  D.sessions[from] = { step: "sell_item", data: {} };
  await sendWhatsAppMessage(from, s.sellAskItem);
}

/**
 * The product is chosen. If the owner already typed a quantity (sugar 2) we go
 * straight to "how did they pay?"; otherwise we ask how many.
 * We remember the price, the cost and how many are left in the session, so the
 * next steps don't have to look them up again.
 */
async function chooseSellItem(from: string, lang: Lang, item: StockItem, wantedQty: number | null): Promise<void> {
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
  if (wantedQty !== null) {
    await applySellQty(from, lang, wantedQty);
    return;
  }
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

/** Shows the total (price x quantity) and asks how the customer paid. */
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

/** Checks the quantity (a real number, and not more than what is in stock), then moves on. */
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

/** "Paid Cash": take the pieces out of stock, log the sale, show the profit, warn if low. */
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
    // Someone sold the last pieces a moment ago: tell the owner how many are really left.
    await sendWhatsAppMessage(from, s.sellNotEnough(name, r.left));
    menuSoon(from, lang);
    return;
  }
  await sendWhatsAppMessage(from, s.sellDone(name, qty, qty * price, money(r.profit), r.left));
  await sendLowStockAlert(from, lang, r.item, r.left);
  menuSoon(from, lang);
}

/**
 * "On Credit": the customer will pay later, so this is also a DEBT.
 * We hand over to the normal Add Debt flow with the item and amount already
 * filled in (so the owner only has to give the customer). The stock is taken
 * out afterwards, by completeCreditSale(), once the debt has really been saved.
 */
async function sellOnCredit(from: string, lang: Lang): Promise<void> {
  const session = D.sessions[from];
  if (!session || session.step !== "sell_confirm") return;
  const d = session.data;
  const qty = Number(g(d, "qty"));
  const price = Number(g(d, "price"));
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

/**
 * Called by the webhook right after a credit sale's debt has been saved.
 * Now we take the pieces out of stock and write the row in "sales" (marked on_credit).
 */
export async function completeCreditSale(
  from: string,
  lang: Lang,
  p: { stockId: string; qty: number; revenue: number; customerName: string },
): Promise<void> {
  const s = strings[lang];
  const r = await commitSale(from, p.stockId, p.qty, p.revenue, true, p.customerName);
  if (!r.ok || !r.item) {
    // The debt IS saved; only the stock could not be reduced (for example it ran out).
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
/* ONE-MESSAGE FLOWS ("type everything together")                      */
/* ------------------------------------------------------------------ */
//
// Shop owners should not have to answer five questions in a row. Each flow
// below accepts ONE typed message, shows what it understood and asks for a tap
// before saving anything (so a wrong guess can never be saved by accident).
// If a message can't be understood, or only part of it was typed, the bot
// falls back to the older question-by-question way, so nobody gets stuck.
// The reading of the messages itself lives in shopParsing.ts.

async function unpaidTotalOf(customerId: string): Promise<number> {
  const { data } = await supabase.from("transactions").select("amount").eq("customer_id", customerId).eq("paid", false);
  return ((data ?? []) as { amount: number }[]).reduce((sum, t) => sum + t.amount, 0);
}

/* ---------------- Add Debt:  0788123456 Jean sugar 2000 ---------------- */

/** The "Add Debt" button: one prompt that explains the one-message way. */
export async function startAddDebt(from: string, lang: Lang): Promise<void> {
  D.sessions[from] = { step: "add_phone", data: {} };
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: xstrings[lang].addDebtPrompt },
    action: {
      buttons: [{ type: "reply", reply: { id: "phone_skip", title: lang === "rw" ? "Nta Nimero" : "No Number" } }],
    },
  });
}

/** Shows "Add this debt?" with the right buttons for this customer. */
async function askDebtConfirm(from: string, lang: Lang, session: Session, parsed: ParsedDebt): Promise<void> {
  const x = xstrings[lang];
  const phone = parsed.phone ? D.cleanPhone(parsed.phone) : null;

  // A known number means a known customer: use the name we already have for them.
  let name = parsed.name;
  let known = false;
  if (phone) {
    const { data } = await supabase.from("customers").select("name").eq("phone", phone).eq("shop_id", from).maybeSingle();
    if (data) {
      name = data.name;
      known = true;
    }
  }
  // Two different people without a number but with the same name are easy to mix up: warn.
  let dupName = false;
  if (!phone) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", from)
      .is("phone", null)
      .ilike("name", escLike(name))
      .limit(1)
      .maybeSingle();
    dupName = !!data;
  }
  const isNew = !known && !!phone;

  session.step = "add_confirm";
  session.data["phone"] = phone ?? "";
  session.data["name"] = name;
  session.data["item"] = parsed.item;
  session.data["amount"] = String(parsed.amount);

  const buttons =
    isNew
      ? [
          { type: "reply", reply: { id: "addok_remind", title: x.debtSaveRemindersBtn } },
          { type: "reply", reply: { id: "addok_only", title: x.debtSaveOnlyBtn } },
          { type: "reply", reply: { id: "addok_cancel", title: x.cancelBtn } },
        ]
      : [
          { type: "reply", reply: { id: "addok_save", title: x.debtSaveBtn } },
          { type: "reply", reply: { id: "addok_cancel", title: x.cancelBtn } },
        ];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: x.debtConfirmBody(name, phone, parsed.item, parsed.amount, isNew, dupName) },
    action: { buttons },
  });
}

/* ---------------- Mark as Paid:  0788123456 2000  |  Jean ---------------- */

export async function startMarkPaid(from: string, lang: Lang): Promise<void> {
  D.sessions[from] = { step: "paid_phone", data: {} };
  await sendWhatsAppMessage(from, xstrings[lang].markPaidPromptQuick);
}

/** Shows "Mark paid?" for one customer. An empty amount means the full debt. */
async function askPayConfirm(
  from: string,
  lang: Lang,
  customer: { id: string; name: string; phone: string | null },
  amount: number | null,
): Promise<void> {
  const x = xstrings[lang];
  const owed = await unpaidTotalOf(String(customer.id));
  if (owed <= 0) {
    clearSession(from);
    await sendWhatsAppMessage(from, x.payNoDebt(customer.name));
    menuSoon(from, lang);
    return;
  }
  const full = amount === null || amount >= owed; // typing more than they owe counts as paying it all
  D.sessions[from] = {
    step: "pay_confirm",
    data: {
      customerId: String(customer.id),
      name: customer.name,
      phone: customer.phone ?? "",
      amount: full ? "" : String(amount),
    },
  };
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: full ? x.payConfirmFull(customer.name, owed) : x.payConfirmPart(customer.name, amount ?? 0, owed) },
    action: {
      buttons: [
        { type: "reply", reply: { id: "payyes", title: x.payYesBtn } },
        { type: "reply", reply: { id: "paycancel", title: x.cancelBtn } },
      ],
    },
  });
}

async function findCustomersForPayment(
  from: string,
  p: { phone: string | null; name: string | null },
): Promise<{ id: string; name: string; phone: string | null }[]> {
  if (p.phone) {
    const { data } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("shop_id", from)
      .eq("phone", D.cleanPhone(p.phone))
      .limit(1);
    return (data ?? []) as { id: string; name: string; phone: string | null }[];
  }
  const { data } = await supabase
    .from("customers")
    .select("id, name, phone")
    .eq("shop_id", from)
    .ilike("name", `%${escLike(p.name ?? "")}%`)
    .limit(10);
  return (data ?? []) as { id: string; name: string; phone: string | null }[];
}

/* ---------------- MoMo:  0788123456, NIYONZIMA ALICE, Chez Alice ---------------- */

export async function startMomo(from: string, lang: Lang): Promise<void> {
  D.sessions[from] = { step: "momo_number", data: {} };
  await sendWhatsAppMessage(from, xstrings[lang].momoQuick);
}

async function askMomoConfirm(from: string, lang: Lang, session: Session, m: ParsedMomo): Promise<void> {
  const s = strings[lang];
  session.step = "momo_confirm";
  session.data["m_number"] = D.cleanPhone(m.number);
  session.data["m_code"] = m.code;
  session.data["m_name"] = m.receiverName.toUpperCase();
  session.data["m_nick"] = m.nickname;
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: s.momoConfirm(session.data["m_number"], session.data["m_name"], m.nickname, m.code) },
    action: {
      buttons: [
        { type: "reply", reply: { id: "momoyes", title: s.saveBtn } },
        { type: "reply", reply: { id: "momono", title: s.cancelBtn } },
      ],
    },
  });
}

/* ---------------- the typed-message router for these flows ---------------- */

/**
 * Runs before the older question-by-question handlers. Returns true when it
 * dealt with the message, false to let the older handler take over.
 */
async function quickSession(from: string, value: string, session: Session, lang: Lang): Promise<boolean> {
  const s = strings[lang];
  const x = xstrings[lang];
  const d = session.data;

  switch (session.step) {
    case "add_phone":
    case "add_name": {
      if (d["presetAmount"]) return false; // a credit sale from stock: only the customer is missing
      const parsed = parseDebtMessage(value);
      if (parsed) {
        await askDebtConfirm(from, lang, session, parsed);
        return true;
      }
      if (session.step === "add_phone" && !isPhoneLike(value)) {
        await sendWhatsAppMessage(from, x.addDebtHint);
        return true;
      }
      return false; // just a phone number (or a name): continue the older way
    }

    case "paid_phone": {
      const p = parsePaidMessage(value);
      if (!p) return false;
      const rows = await findCustomersForPayment(from, p);
      if (rows.length === 0) {
        await sendWhatsAppMessage(from, s.noCustomerFound(p.phone ?? p.name ?? value));
        return true;
      }
      if (rows.length > 1) {
        d["payAmount"] = p.amount === null ? "" : String(p.amount);
        await sendWhatsAppMessage(from, x.payPick(p.name ?? value));
        await sendWhatsAppInteractiveMessage(from, {
          type: "list",
          body: { text: s.menuTitle },
          action: {
            button: s.listButton,
            sections: [
              {
                title: s.secCustomers,
                rows: rows.map((r) => ({
                  id: `paypick_${r.id}`,
                  title: r.name.slice(0, 24),
                  description: (r.phone ?? (lang === "rw" ? "nta nimero" : "no number")).slice(0, 72),
                })),
              },
            ],
          },
        });
        return true;
      }
      const only = rows[0];
      if (only) await askPayConfirm(from, lang, only, p.amount);
      return true;
    }

    case "momo_number": {
      const m = parseMomoMessage(value);
      if (m) {
        await askMomoConfirm(from, lang, session, m);
        return true;
      }
      if (value.includes(",")) {
        await sendWhatsAppMessage(from, s.momoHint);
        return true;
      }
      return false; // just the number: continue the older way
    }

    case "edit_name": {
      // "Jean, 0788123456" (or just a number) changes name and number in one go.
      const e = parseCustomerEdit(value);
      if (e.phone && D.cleanPhone(e.phone).length >= 9) {
        if (e.name) d["editName"] = e.name;
        d["editPhone"] = D.cleanPhone(e.phone);
        await D.saveEditedCustomer(from, lang);
        return true;
      }
      return false;
    }

    // ---- stock: Sugar 1kg, 800, 1000, 20 ----
    case "stk_name": {
      const parsed = parseStockMessage(value);
      if (parsed) {
        await askStockConfirm(from, lang, parsed);
        return true;
      }
      if (value.includes(",") || /\d$/.test(value)) {
        await sendWhatsAppMessage(from, s.stkHint);
        return true;
      }
      return false; // just the item name: continue the older way
    }

    // ---- sale: sugar 2 ----
    case "sell_item": {
      const parsed = parseSaleMessage(value);
      const { data } = await supabase
        .from("stock_items")
        .select("*")
        .eq("shop_id", from)
        .ilike("name", `%${escLike(parsed.query)}%`)
        .order("name", { ascending: true })
        .limit(10);
      const items = (data ?? []) as StockItem[];
      if (items.length === 0) {
        await sendWhatsAppMessage(from, s.sellNoMatch(parsed.query));
        return true;
      }
      const exact = items.find((i) => i.name.toLowerCase() === parsed.query.toLowerCase());
      const single = exact ?? (items.length === 1 ? items[0] : undefined);
      if (single) {
        await chooseSellItem(from, lang, single, parsed.qty);
        return true;
      }
      // Several products match: remember the quantity the owner typed and let them pick.
      d["preQty"] = parsed.qty === null ? "" : String(parsed.qty);
      await sendWhatsAppMessage(from, s.sellPick(parsed.query));
      await sendWhatsAppInteractiveMessage(from, {
        type: "list",
        body: { text: s.menuTitle },
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

    // ---- expense: 2000 transport ----
    case "exp_amount": {
      const e = parseExpenseMessage(value);
      if (e && e.note) {
        session.step = "exp_confirm";
        d["amount"] = String(e.amount);
        d["note"] = e.note;
        await sendWhatsAppInteractiveMessage(from, {
          type: "button",
          body: { text: s.expenseConfirm(e.amount, e.note) },
          action: {
            buttons: [
              { type: "reply", reply: { id: "expok_yes", title: s.saveBtn } },
              { type: "reply", reply: { id: "expok_no", title: s.cancelBtn } },
            ],
          },
        });
        return true;
      }
      return false; // only an amount: continue the older way (it asks for a note)
    }

    // ---- supplier debt: Kigali Rice, 50000, 20 bags ----
    case "sup_name": {
      const sp = parseSupplierMessage(value);
      if (sp) {
        session.step = "sup_confirm";
        d["supplier"] = sp.supplier;
        d["amount"] = String(sp.amount);
        d["note"] = sp.note ?? "";
        await sendWhatsAppInteractiveMessage(from, {
          type: "button",
          body: { text: s.supplierConfirm(sp.supplier, sp.amount, sp.note) },
          action: {
            buttons: [
              { type: "reply", reply: { id: "supok_yes", title: s.saveBtn } },
              { type: "reply", reply: { id: "supok_no", title: s.cancelBtn } },
            ],
          },
        });
        return true;
      }
      if (value.includes(",")) {
        await sendWhatsAppMessage(from, s.supHint);
        return true;
      }
      return false; // just the supplier's name: continue the older way
    }
  }

  // The owner typed instead of tapping a confirm button: remind them to tap.
  if (
    ["add_confirm", "pay_confirm", "momo_confirm", "stk_confirm", "exp_confirm", "sup_confirm"].includes(session.step)
  ) {
    await sendWhatsAppMessage(from, s.tapButtons);
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Router: button / list taps                                          */
/* ------------------------------------------------------------------ */

/** Returns true when the tap belonged to this module. */
export async function handleInteractive(from: string, id: string, lang: Lang): Promise<boolean> {
  const s = strings[lang];
  const x = xstrings[lang];
  // Stock is held off: an old button from an earlier chat must not start any stock flow.
  if (!stockEnabled() && isStockId(id)) {
    await sendWhatsAppMessage(from, s.stockHeldOff);
    await D.sendMenu(from, lang);
    return true;
  }
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

    // ---- Add Debt confirm ----
    case "addok_remind":
    case "addok_only":
    case "addok_save": {
      const sess = D.sessions[from];
      if (!sess || sess.step !== "add_confirm") return true; // an old button tap
      if (id === "addok_remind") sess.data["consent"] = "yes"; // "this customer agreed to reminders"
      else if (id === "addok_only") sess.data["consent"] = "no";
      sess.step = "add_amount";
      await D.finishAddDebt(from, lang, Number(g(sess.data, "amount")));
      return true;
    }
    case "addok_cancel":
      clearSession(from);
      await sendWhatsAppMessage(from, x.debtCancelled);
      menuSoon(from, lang);
      return true;

    // ---- Mark as Paid confirm ----
    case "payyes": {
      const sess = D.sessions[from];
      if (!sess || sess.step !== "pay_confirm") return true; // an old button tap
      const customerId = g(sess.data, "customerId");
      const name = g(sess.data, "name");
      const phone = g(sess.data, "phone");
      const amount = g(sess.data, "amount");
      clearSession(from);
      if (amount) {
        await D.applyPartialPayment(from, { id: customerId, name, phone }, Number(amount), lang, x.payGeneric);
      } else {
        await D.markAllPaid(from, lang, { id: customerId, name });
      }
      menuSoon(from, lang);
      return true;
    }
    case "paycancel":
      clearSession(from);
      await sendWhatsAppMessage(from, x.payCancelled);
      menuSoon(from, lang);
      return true;

    // ---- MoMo confirm ----
    case "momoyes": {
      const sess = D.sessions[from];
      if (!sess || sess.step !== "momo_confirm") return true; // an old button tap
      const d = sess.data;
      clearSession(from);
      await supabase
        .from("owners")
        .update({
          momo_number: g(d, "m_number"),
          momo_code: g(d, "m_code") || null,
          momo_receiver_name: g(d, "m_name"),
          shop_nickname: g(d, "m_nick") || null,
        })
        .eq("phone", D.cleanPhone(from));
      await sendWhatsAppMessage(from, s.momoSaved(g(d, "m_number"), g(d, "m_name")));
      menuSoon(from, lang);
      return true;
    }
    case "momono":
      clearSession(from);
      await sendWhatsAppMessage(from, s.cancelledGeneric);
      menuSoon(from, lang);
      return true;

    // ---- stock ----
    case "stock_view":
      await showStock(from, lang);
      return true;
    case "stock_add":
      await startAddStock(from, lang);
      return true;
    case "stkok_yes":
      await saveStockConfirmed(from, lang);
      return true;
    case "stkok_no":
      clearSession(from);
      await sendWhatsAppMessage(from, s.cancelledGeneric);
      menuSoon(from, lang);
      return true;
    case "stk_keep":
      if (D.sessions[from]?.step !== "stk_prices") return true; // an old button tap
      clearSession(from);
      menuSoon(from, lang);
      return true;
    case "stk_change": {
      const sess = D.sessions[from];
      if (!sess || sess.step !== "stk_prices") return true; // an old button tap
      sess.step = "stk_new_cost";
      await sendWhatsAppMessage(from, s.stkAskCost(g(sess.data, "name")));
      return true;
    }

    // ---- selling from stock ----
    case "sell_start":
      await startSale(from, lang);
      return true;
    case "sell_cash":
      await sellByCash(from, lang);
      return true;
    case "sell_credit":
      await sellOnCredit(from, lang);
      return true;
    case "sell_price": {
      const sess = D.sessions[from];
      if (!sess || sess.step !== "sell_confirm") return true; // an old button tap
      sess.step = "sell_price_input";
      await sendWhatsAppMessage(from, s.sellAskPrice);
      return true;
    }

    // ---- profit + expenses ----
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
      if (D.sessions[from]?.step !== "exp_note") return true; // an old button tap
      await saveExpense(from, lang, null);
      return true;
    case "expok_yes": {
      const sess = D.sessions[from];
      if (!sess || sess.step !== "exp_confirm") return true; // an old button tap
      await saveExpense(from, lang, g(sess.data, "note") || null);
      return true;
    }
    case "expok_no":
      clearSession(from);
      await sendWhatsAppMessage(from, s.cancelledGeneric);
      menuSoon(from, lang);
      return true;

    // ---- promise date ----
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

    // ---- credit limit ----
    case "creditlimit_menu":
      await startCreditLimit(from, lang);
      return true;
    case "cl_none":
      if (D.sessions[from]?.step !== "limit_amount") return true; // an old button tap
      await saveCreditLimit(from, lang, null);
      return true;

    // ---- suppliers ----
    case "supplier_add":
      await startSupplierAdd(from, lang);
      return true;
    case "supplier_list":
      await showSupplierList(from, lang);
      return true;
    case "sup_note_skip":
      if (D.sessions[from]?.step !== "sup_note") return true; // an old button tap
      await saveSupplierDebt(from, lang, null);
      return true;
    case "supok_yes": {
      const sess = D.sessions[from];
      if (!sess || sess.step !== "sup_confirm") return true; // an old button tap
      await saveSupplierDebt(from, lang, g(sess.data, "note") || null);
      return true;
    }
    case "supok_no":
      clearSession(from);
      await sendWhatsAppMessage(from, s.cancelledGeneric);
      menuSoon(from, lang);
      return true;
  }

  if (id.startsWith("sellpick_")) {
    // The owner picked one product from the list. Use the quantity they typed earlier, if any.
    const typedQty = D.sessions[from]?.data["preQty"];
    const stockId = id.slice("sellpick_".length);
    const { data } = await supabase.from("stock_items").select("*").eq("id", stockId).eq("shop_id", from).maybeSingle();
    if (data) await chooseSellItem(from, lang, data as StockItem, typedQty ? Number(typedQty) : null);
    return true;
  }
  if (id.startsWith("sellqty_")) {
    await applySellQty(from, lang, parseInt(id.slice("sellqty_".length), 10));
    return true;
  }
  if (id.startsWith("paypick_")) {
    // The owner picked one customer from the list of matching names.
    const amountText = D.sessions[from]?.data["payAmount"];
    const { data } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("id", id.slice("paypick_".length))
      .eq("shop_id", from)
      .maybeSingle();
    if (data) {
      await askPayConfirm(from, lang, data as { id: string; name: string; phone: string | null }, amountText ? Number(amountText) : null);
    }
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

/**
 * Returns true when the typed text was consumed by one of this module's flows.
 * The one-message shortcuts run first; anything they don't understand falls
 * through to the older question-by-question steps below.
 */
export async function handleSession(from: string, text: string, session: Session, lang: Lang): Promise<boolean> {
  // A stock / expense conversation left open from before stock was held off: close it.
  if (!stockEnabled() && /^(stk|sell|exp_|expok)/.test(session.step)) {
    clearSession(from);
    await sendWhatsAppMessage(from, strings[lang].stockHeldOff);
    await D.sendMenu(from, lang);
    return true;
  }
  if (await quickSession(from, text.trim(), session, lang)) return true;
  return olderSession(from, text, session, lang);
}

/** The older question-by-question steps (still used when only part of a message was typed). */

async function olderSession(from: string, text: string, session: Session, lang: Lang): Promise<boolean> {
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