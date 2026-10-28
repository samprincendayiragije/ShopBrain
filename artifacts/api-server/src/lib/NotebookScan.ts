import { supabase } from "./supabase.js";
import {
  sendWhatsAppMessage,
  sendWhatsAppInteractiveMessage,
  downloadWhatsAppMedia,
} from "./whatsapp.js";

// "Scan notebook": the owner sends a photo of a page of their paper debt
// notebook. We read it, show the list, and only save after they confirm.
//
// Needs one new Replit secret:  GEMINI_API_KEY  (free key from aistudio.google.com)
// Optional secret:              GEMINI_MODEL  (defaults to gemini-flash-latest)
// No new SQL needed.

type Lang = "en" | "rw";

interface ScanRow {
  name: string;
  item: string;
  amount: number;
  phone: string | null;
}

interface PendingScan {
  rows: ScanRow[];
  skipped: number;
  createdAt: number;
}

const GEMINI_API_KEY = process.env["GEMINI_API_KEY"];
const GEMINI_MODEL = process.env["GEMINI_MODEL"] ?? "gemini-flash-latest";

const PENDING_TTL_MS = 30 * 60 * 1000; // a scan waits 30 minutes for the owner to confirm
const DAILY_LIMIT = 10; // photos per owner per day (protects your API bill)
const MAX_ROWS = 60;

// Held in memory, same as `sessions` in webhook.ts: a server restart clears them
// and the owner just sends the photo again.
const pending = new Map<string, PendingScan>();
const usage = new Map<string, { day: string; count: number }>();

let deps: { sendMenu: (from: string, lang: Lang) => Promise<void> } | null = null;

export function initNotebookScan(d: { sendMenu: (from: string, lang: Lang) => Promise<void> }): void {
  deps = d;
}

const T = {
  en: {
    reading: "📷 Reading your notebook page... one moment.",
    notConfigured: "Notebook scan is not set up yet.",
    limit: "You've reached today's notebook scan limit. Please try again tomorrow.",
    noRows: "❌ I couldn't find any debts in that photo. Try again: one page at a time, good light, hold the phone steady.",
    fail: "❌ I couldn't read that photo. Please try again with a clearer picture.",
    busy: "⏳ The reader is busy right now. Please try again in a minute.",
    header: (count: number, total: number) =>
      `📒 *Notebook scan*\n\nI found *${count} debts*, total *${total.toLocaleString()} Frw*.\n\nCheck them before saving:\n\n`,
    skipped: (n: number) => `\n\n⚠️ ${n} line(s) were too unclear and were skipped.`,
    footer: "\n\nFix a line: *EDIT 2 Jean, sugar, 3000*\nRemove a line: *REMOVE 2*",
    ask: "Save these debts?",
    saveBtn: "✅ Save All",
    cancelBtn: "✖️ Cancel",
    saved: (count: number, total: number) =>
      `✅ *Saved ${count} debts* (${total.toLocaleString()} Frw).\n\nNote: these customers have no reminder consent yet, so they won't get reminders until you confirm they agreed.`,
    saveFailed: "❌ Something went wrong while saving. Nothing was confirmed, please send the photo again.",
    cancelled: "Cancelled. Nothing was saved.",
    expired: "⏱ That scan expired. Please send the photo again.",
    badEdit: "❌ Format: *EDIT 2 Jean, sugar, 3000* (line number, name, item, amount)",
    badRemove: "❌ Format: *REMOVE 2*",
    removed: (n: number) => `🗑 Line ${n} removed.`,
    emptyAfter: "Nothing left to save. Scan cancelled.",
  },
  rw: {
    reading: "📷 Ndi gusoma urupapuro rw'ikayi... tegereza gato.",
    notConfigured: "Iki gikorwa cyo gusoma ikayi ntikiratangira.",
    limit: "Wagejeje ku mubare w'amafoto yemewe uyu munsi. Ongera ejo.",
    noRows: "❌ Nta madeni mbonye kuri iyi foto. Ongera ugerageze: urupapuro rumwe, urumuri ruhagije, ufate telefone neza.",
    fail: "❌ Ntibyakunze gusoma iyi foto. Ongera ugerageze ifoto isobanutse.",
    busy: "⏳ Sisitemu irahuze ubu. Ongera ugerageze nyuma y'umunota.",
    header: (count: number, total: number) =>
      `📒 *Gusoma ikayi*\n\nNabonye *amadeni ${count}*, igiteranyo *${total.toLocaleString()} Frw*.\n\nYarebe mbere yo kubika:\n\n`,
    skipped: (n: number) => `\n\n⚠️ Imirongo ${n} ntisomeka neza, yasimbutswe.`,
    footer: "\n\nGukosora umurongo: *EDIT 2 Jean, isukari, 3000*\nGusiba umurongo: *REMOVE 2*",
    ask: "Mbike aya madeni?",
    saveBtn: "✅ Bika Yose",
    cancelBtn: "✖️ Reka",
    saved: (count: number, total: number) =>
      `✅ *Amadeni ${count} yabitswe* (${total.toLocaleString()} Frw).\n\nIcyitonderwa: aba bakiriya nta cyemezo cyo kwibutswa baragira, ntibazibutswa kugeza wemeje ko babyemeye.`,
    saveFailed: "❌ Habayeho ikibazo mu kubika. Ntacyabitswe, ongera wohereze ifoto.",
    cancelled: "Byarekewe. Nta kintu cyabitswe.",
    expired: "⏱ Iyi foto yararenze igihe. Ongera wohereze ifoto.",
    badEdit: "❌ Uburyo: *EDIT 2 Jean, isukari, 3000* (umurongo, izina, igicuruzwa, amafaranga)",
    badRemove: "❌ Uburyo: *REMOVE 2*",
    removed: (n: number) => `🗑 Umurongo ${n} wasibwe.`,
    emptyAfter: "Nta kintu gisigaye cyo kubika. Byarekewe.",
  },
};

const SYSTEM_PROMPT = `You read photos of handwritten debt notebooks kept by small shop owners in Rwanda. The writing may be Kinyarwanda, English or French.

Extract every debt line: who owes, what they took, how much.

Return ONLY a JSON object, no prose and no markdown, in exactly this shape:
{"rows":[{"name":"Jean","item":"sugar","amount":2000,"phone":null}],"skipped":0}

Rules:
- amount is an integer in Rwandan francs (Frw). "2k" = 2000, "1.5k" = 1500, "2,000" = 2000.
- phone is the phone number if written next to the line, otherwise null.
- If there is no item written, use "Notebook".
- Write names and items as they appear. Do not translate or correct them.
- Skip lines that are crossed out or marked as paid.
- Ignore page totals, dates used as headings, and anything that is not a single customer's debt.
- If a line is too unclear to read with confidence, do NOT guess: skip it and add 1 to "skipped".
- If the image is not a debt notebook, return {"rows":[],"skipped":0}.`;

// --- helpers ---

function phoneOrNull(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("0")) d = "250" + d.slice(1);
  return d.length === 12 && d.startsWith("250") ? d : null;
}

function parseAmount(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[\s,]/g, "");
  const k = s.match(/^(\d+(?:\.\d+)?)k$/);
  const n = k ? Math.round(parseFloat(k[1] as string) * 1000) : /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
  return Number.isFinite(n) && n > 0 && n < 100_000_000 ? n : null;
}

function normalizeRow(r: unknown): ScanRow | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const name = String(o["name"] ?? "").trim().slice(0, 60);
  const item = String(o["item"] ?? "").trim().slice(0, 60) || "Notebook";
  const amount = Math.round(Number(o["amount"]));
  if (!name || !Number.isFinite(amount) || amount <= 0 || amount >= 100_000_000) return null;
  return { name, item, amount, phone: phoneOrNull(o["phone"]) };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function underDailyLimit(from: string): boolean {
  const u = usage.get(from);
  if (!u || u.day !== today()) {
    usage.set(from, { day: today(), count: 1 });
    return true;
  }
  if (u.count >= DAILY_LIMIT) return false;
  u.count++;
  return true;
}

function getPending(from: string): PendingScan | null {
  const p = pending.get(from);
  if (!p) return null;
  if (Date.now() - p.createdAt > PENDING_TTL_MS) {
    pending.delete(from);
    return null;
  }
  return p;
}

// WhatsApp text messages cap at 4096 characters, so long lists are split by line.
function splitMessage(text: string, max = 3500): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur.length + line.length + 1 > max && cur) {
      parts.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line;
  }
  if (cur) parts.push(cur);
  return parts;
}

// --- reading the photo ---

async function readNotebook(base64: string, mediaType: string): Promise<{ rows: ScanRow[]; skipped: number }> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: mediaType, data: base64 } },
                { text: "Extract the debts from this notebook page." },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
          },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as {
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error(`Gemini returned no answer (blockReason: ${data.promptFeedback?.blockReason ?? "none"})`);
    }
    const text = (candidate.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error(`No JSON in model reply: ${text.slice(0, 200)}`);

    const parsed = JSON.parse(text.slice(start, end + 1)) as { rows?: unknown[]; skipped?: unknown };
    const rows: ScanRow[] = [];
    let skipped = Number(parsed.skipped) || 0;
    for (const r of parsed.rows ?? []) {
      const n = normalizeRow(r);
      if (n) rows.push(n);
      else skipped++;
    }
    return { rows: rows.slice(0, MAX_ROWS), skipped };
  } finally {
    clearTimeout(timer);
  }
}

// --- showing the list ---

async function showPending(from: string, lang: Lang): Promise<void> {
  const p = getPending(from);
  if (!p) return;
  const t = T[lang];
  const total = p.rows.reduce((s, r) => s + r.amount, 0);
  const lines = p.rows.map(
    (r, i) => `${i + 1}. ${r.name} — ${r.item} — ${r.amount.toLocaleString()} Frw${r.phone ? ` — ${r.phone}` : ""}`
  );
  const text =
    t.header(p.rows.length, total) + lines.join("\n") + (p.skipped > 0 ? t.skipped(p.skipped) : "") + t.footer;
  for (const part of splitMessage(text)) {
    await sendWhatsAppMessage(from, part);
  }
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: t.ask },
    action: {
      buttons: [
        { type: "reply", reply: { id: "scan_save", title: t.saveBtn } },
        { type: "reply", reply: { id: "scan_cancel", title: t.cancelBtn } },
      ],
    },
  });
}

// --- saving ---

async function findOrCreateCustomer(
  shopId: string,
  row: ScanRow,
  cache: Map<string, string>
): Promise<string> {
  const key = row.phone ? `p:${row.phone}` : `n:${row.name.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let existing: { id: string } | null = null;
  if (row.phone) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", row.phone)
      .eq("shop_id", shopId)
      .maybeSingle();
    existing = data;
  } else {
    // Same name with no phone = same customer. Different people with the same name
    // can get merged, so the owner can split them later with Edit Customer.
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .is("phone", null)
      .ilike("name", escapeLike(row.name))
      .limit(1)
      .maybeSingle();
    existing = data;
  }

  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  // Imported customers have NOT agreed to reminders: consent stays false.
  const { data: created, error } = await supabase
    .from("customers")
    .insert({ phone: row.phone, name: row.name, shop_id: shopId, reminders_consent: false })
    .select("id")
    .single();
  if (error || !created) throw error ?? new Error("Customer insert failed");
  cache.set(key, created.id);
  return created.id;
}

async function savePending(from: string, lang: Lang): Promise<void> {
  const t = T[lang];
  const p = getPending(from);
  if (!p) {
    await sendWhatsAppMessage(from, t.expired);
    return;
  }
  try {
    const cache = new Map<string, string>();
    const txRows: Array<{ customer_id: string; item: string; amount: number; paid: boolean }> = [];
    for (const r of p.rows) {
      const customerId = await findOrCreateCustomer(from, r, cache);
      txRows.push({ customer_id: customerId, item: r.item, amount: r.amount, paid: false });
    }
    const { error } = await supabase.from("transactions").insert(txRows);
    if (error) throw error;

    const total = p.rows.reduce((s, r) => s + r.amount, 0);
    pending.delete(from);
    await sendWhatsAppMessage(from, t.saved(p.rows.length, total));
    setTimeout(() => {
      void deps?.sendMenu(from, lang);
    }, 1000);
  } catch (err) {
    console.error("Notebook scan save failed:", err);
    await sendWhatsAppMessage(from, t.saveFailed);
  }
}

// --- entry points used by webhook.ts ---

// An image message from an owner.
export async function handleNotebookPhoto(from: string, mediaId: string, lang: Lang): Promise<void> {
  const t = T[lang];
  if (!GEMINI_API_KEY) {
    await sendWhatsAppMessage(from, t.notConfigured);
    return;
  }
  if (!underDailyLimit(from)) {
    await sendWhatsAppMessage(from, t.limit);
    return;
  }
  await sendWhatsAppMessage(from, t.reading);
  try {
    const { base64, mimeType } = await downloadWhatsAppMedia(mediaId);
    const result = await readNotebook(base64, mimeType);
    if (result.rows.length === 0) {
      await sendWhatsAppMessage(from, t.noRows);
      return;
    }
    pending.set(from, { rows: result.rows, skipped: result.skipped, createdAt: Date.now() });
    await showPending(from, lang);
  } catch (err) {
    console.error("Notebook scan failed:", err);
    const busy = err instanceof Error && /Gemini API 429/.test(err.message);
    await sendWhatsAppMessage(from, busy ? t.busy : t.fail);
  }
}

// Save All / Cancel buttons. Returns true when it handled the tap.
export async function handleInteractive(from: string, replyId: string, lang: Lang): Promise<boolean> {
  if (replyId === "scan_save") {
    await savePending(from, lang);
    return true;
  }
  if (replyId === "scan_cancel") {
    pending.delete(from);
    await sendWhatsAppMessage(from, T[lang].cancelled);
    setTimeout(() => {
      void deps?.sendMenu(from, lang);
    }, 1000);
    return true;
  }
  return false;
}

// Typed commands while a scan is waiting: SAVE, CANCEL, REMOVE n, EDIT n name, item, amount.
// Returns false (and does nothing) when there is no waiting scan or the text isn't one of these.
export async function handleScanText(from: string, text: string, lang: Lang): Promise<boolean> {
  const p = getPending(from);
  if (!p) return false;
  const t = T[lang];
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();

  if (upper === "SAVE") {
    await savePending(from, lang);
    return true;
  }
  if (upper === "CANCEL") {
    return handleInteractive(from, "scan_cancel", lang);
  }

  if (upper.startsWith("REMOVE")) {
    const m = trimmed.match(/^remove\s+(\d+)$/i);
    const n = m ? parseInt(m[1] as string, 10) : NaN;
    if (!m || n < 1 || n > p.rows.length) {
      await sendWhatsAppMessage(from, t.badRemove);
      return true;
    }
    p.rows.splice(n - 1, 1);
    if (p.rows.length === 0) {
      pending.delete(from);
      await sendWhatsAppMessage(from, t.emptyAfter);
      return true;
    }
    await sendWhatsAppMessage(from, t.removed(n));
    await showPending(from, lang);
    return true;
  }

  if (upper.startsWith("EDIT")) {
    const m = trimmed.match(/^edit\s+(\d+)\s+(.+)$/i);
    const n = m ? parseInt(m[1] as string, 10) : NaN;
    if (!m || n < 1 || n > p.rows.length) {
      await sendWhatsAppMessage(from, t.badEdit);
      return true;
    }
    const rest = (m[2] as string).trim();
    let name = "";
    let item = "Notebook";
    let amount: number | null = null;

    if (rest.includes(",")) {
      // "Mama Janet, sugar, 3000" (or just "Mama Janet, 3000")
      const parts = rest.split(",").map((s) => s.trim());
      amount = parseAmount(parts[parts.length - 1] ?? "");
      name = parts[0] ?? "";
      if (parts.length >= 3) item = parts.slice(1, -1).join(", ") || "Notebook";
    } else {
      // "Jean sugar 3000": the name is one word
      const parts = rest.split(/\s+/);
      amount = parseAmount(parts[parts.length - 1] ?? "");
      name = parts[0] ?? "";
      if (parts.length >= 3) item = parts.slice(1, -1).join(" ");
    }

    // name === rest means only one word was given (no amount after it)
    if (!name || amount === null || name === rest) {
      await sendWhatsAppMessage(from, t.badEdit);
      return true;
    }
    const old = p.rows[n - 1] as ScanRow;
    p.rows[n - 1] = { name: name.slice(0, 60), item: item.slice(0, 60), amount, phone: old.phone };
    await showPending(from, lang);
    return true;
  }

  return false;
}