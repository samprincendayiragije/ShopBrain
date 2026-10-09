// src/lib/shopParsing.ts
//
// "Type everything in one message" helpers.
//
// Shop owners should not have to answer 5 questions in a row. These small
// functions read one typed message such as
//     0788123456 Jean sugar 2000
// and split it into its parts. They are PURE functions (no database, no
// WhatsApp), so they are easy to test and safe to reuse everywhere.
//
// Rules shared by all of them:
//   * "2k" means 2,000 and "2.5k" means 2,500
//   * "2,000" (comma between thousands) is read as 2000, not as two parts
//   * if the message contains a comma, commas separate the parts, so names
//     and items may have several words:  Mama Janet, sugar, 2000
//   * if there is no comma, spaces separate the parts
//   * when a message cannot be read, the functions return null and the bot
//     falls back to asking one question at a time, so nobody gets stuck

/** Turns "2000", "2,000", "2k" or "2.5k" into a number. Returns null if it is not an amount. */
export function parseAmountToken(token: string, allowZero = false): number | null {
  const t = token.trim().toLowerCase();
  const k = /^(\d+(?:[.,]\d+)?)\s*k$/.exec(t);
  let n: number | null = null;
  if (k) {
    n = Math.round(parseFloat((k[1] ?? "").replace(",", ".")) * 1000);
  } else if (/^\d[\d,.]*$/.test(t)) {
    n = parseInt(t.replace(/\D/g, ""), 10);
  }
  if (n === null || !Number.isFinite(n)) return null;
  if (n === 0 && !allowZero) return null;
  return n < 0 ? null : n;
}

/** "2,000" -> "2000" so the comma is not mistaken for a separator between parts. */
function normalizeThousands(text: string): string {
  return text.replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
}

/** True when the text looks like a phone number (9-13 digits, may have + - ( ) and spaces). */
export function isPhoneLike(text: string): boolean {
  const t = text.trim();
  if (!/^\+?[\d\s\-()]+$/.test(t)) return false;
  const digits = t.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 13;
}

function splitParts(raw: string): { parts: string[]; commaMode: boolean } {
  const text = normalizeThousands(raw.trim());
  if (text.includes(",")) {
    return { parts: text.split(",").map((p) => p.trim()).filter(Boolean), commaMode: true };
  }
  return { parts: text.split(/\s+/).filter(Boolean), commaMode: false };
}

/* ------------------------------------------------------------------ */
/* Add Debt:  0788123456 Jean sugar 2000   |   Jean sugar 2000         */
/* ------------------------------------------------------------------ */

export interface ParsedDebt {
  phone: string | null; // raw digits as typed, or null when the customer has no number
  name: string;
  item: string;
  amount: number;
}

/** Returns null unless name, item and amount are all present. */
export function parseDebtMessage(text: string): ParsedDebt | null {
  const { parts, commaMode } = splitParts(text);
  if (parts.length === 0) return null;

  let phone: string | null = null;
  const phoneIdx = parts.findIndex((p) => isPhoneLike(p));
  if (phoneIdx !== -1) {
    phone = (parts[phoneIdx] ?? "").trim();
    parts.splice(phoneIdx, 1);
  }

  const last = parts[parts.length - 1];
  const amount = last === undefined ? null : parseAmountToken(last);
  if (amount === null) return null;
  parts.pop();

  if (parts.length < 2) return null; // need a name AND an item
  const name = (parts[0] ?? "").trim();
  const item = parts.slice(1).join(commaMode ? ", " : " ").trim();
  if (!name || !item) return null;
  return { phone, name, item, amount };
}

/* ------------------------------------------------------------------ */
/* Mark as Paid:  0788123456  |  0788123456 2000  |  Jean 2000         */
/* ------------------------------------------------------------------ */

export interface ParsedPaid {
  phone: string | null;
  name: string | null;
  amount: number | null; // null = no amount typed (means: paid in full)
}

export function parsePaidMessage(text: string): ParsedPaid | null {
  const tokens = normalizeThousands(text.trim()).replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  let phone: string | null = null;
  const phoneIdx = tokens.findIndex((t) => isPhoneLike(t));
  if (phoneIdx !== -1) {
    phone = tokens[phoneIdx] ?? null;
    tokens.splice(phoneIdx, 1);
  }

  let amount: number | null = null;
  const last = tokens[tokens.length - 1];
  if (last !== undefined) {
    const a = parseAmountToken(last);
    if (a !== null) {
      amount = a;
      tokens.pop();
    }
  }

  const name = tokens.join(" ").trim() || null;
  if (!phone && !name) return null;
  return { phone, name, amount };
}

/* ------------------------------------------------------------------ */
/* MoMo:  0788123456, NIYONZIMA ALICE, Chez Alice                      */
/*        0788123456, 123456, NIYONZIMA ALICE, Chez Alice  (merchant code) */
/* ------------------------------------------------------------------ */

export interface ParsedMomo {
  number: string;
  code: string;
  receiverName: string;
  nickname: string;
}

export function parseMomoMessage(text: string): ParsedMomo | null {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const number = parts.shift() ?? "";
  if (!isPhoneLike(number)) return null;

  let code = "";
  if (/^\d{3,12}$/.test(parts[0] ?? "")) code = parts.shift() ?? "";

  const receiverName = (parts.shift() ?? "").trim();
  if (receiverName.length < 2) return null;
  const nickname = parts.join(", ").trim();
  return { number, code, receiverName, nickname };
}

/* ------------------------------------------------------------------ */
/* Stock:  Sugar 1kg, 800, 1000, 20   (name, buy price, sell price, quantity) */
/* ------------------------------------------------------------------ */

export interface ParsedStock {
  name: string;
  cost: number; // what the shop pays for one piece (0 allowed when unknown)
  price: number; // what the shop sells one piece for
  qty: number; // how many pieces
}

export function parseStockMessage(text: string): ParsedStock | null {
  const { parts, commaMode } = splitParts(text);
  if (parts.length < 4) return null;
  const tail = parts.slice(-3);
  const cost = parseAmountToken(tail[0] ?? "", true);
  const price = parseAmountToken(tail[1] ?? "");
  const qty = parseAmountToken(tail[2] ?? "", true);
  if (cost === null || price === null || qty === null) return null;
  const name = parts.slice(0, -3).join(commaMode ? ", " : " ").trim();
  if (!name || name.length > 60) return null;
  return { name, cost, price, qty };
}

/* ------------------------------------------------------------------ */
/* Sale:  sugar 2   (item name, then how many)                         */
/* ------------------------------------------------------------------ */

export interface ParsedSale {
  query: string;
  qty: number | null; // null = quantity was not typed
}

export function parseSaleMessage(text: string): ParsedSale {
  const trimmed = text.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  if (tokens.length >= 2 && last !== undefined && /^\d{1,4}$/.test(last)) {
    const qty = parseInt(last, 10);
    if (qty > 0) return { query: tokens.slice(0, -1).join(" "), qty };
  }
  return { query: trimmed, qty: null };
}

/* ------------------------------------------------------------------ */
/* Expense:  2000 transport                                            */
/* ------------------------------------------------------------------ */

export interface ParsedExpense {
  amount: number;
  note: string | null;
}

export function parseExpenseMessage(text: string): ParsedExpense | null {
  const tokens = normalizeThousands(text.trim()).split(/\s+/).filter(Boolean);
  const first = tokens[0];
  if (first === undefined) return null;
  const amount = parseAmountToken(first);
  if (amount === null) return null;
  const note = tokens.slice(1).join(" ").trim();
  return { amount, note: note ? note.slice(0, 100) : null };
}

/* ------------------------------------------------------------------ */
/* Supplier debt:  Kigali Rice, 50000, 20 bags                         */
/* ------------------------------------------------------------------ */

export interface ParsedSupplier {
  supplier: string;
  amount: number;
  note: string | null;
}

export function parseSupplierMessage(text: string): ParsedSupplier | null {
  const { parts, commaMode } = splitParts(text);
  if (!commaMode || parts.length < 2) return null;
  const supplier = (parts[0] ?? "").trim();
  const amount = parseAmountToken(parts[1] ?? "");
  if (!supplier || supplier.length > 60 || amount === null) return null;
  const note = parts.slice(2).join(", ").trim();
  return { supplier, amount, note: note ? note.slice(0, 100) : null };
}

/* ------------------------------------------------------------------ */
/* Edit customer:  Jean, 0788123456   |   0788123456   |   Jean         */
/* ------------------------------------------------------------------ */

export interface ParsedCustomerEdit {
  name: string | null;
  phone: string | null;
}

export function parseCustomerEdit(text: string): ParsedCustomerEdit {
  const trimmed = text.trim();
  if (isPhoneLike(trimmed)) return { name: null, phone: trimmed };
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && isPhoneLike(parts[parts.length - 1] ?? "")) {
    return { name: parts.slice(0, -1).join(", "), phone: parts[parts.length - 1] ?? null };
  }
  return { name: trimmed || null, phone: null };
}