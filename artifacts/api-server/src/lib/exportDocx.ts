// BATCH 2: Word export, replacing the CSV backup button.
// Flow: owner taps Export -> sendExportSummary() shows totals with Send / Cancel buttons
//       owner taps Send   -> sendExportFile()    sends the Word document.
// Only unpaid debts are listed (one row per customer). Needs the `docx` package.

import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel,
  WidthType, ShadingType, AlignmentType,
} from "docx";
import { supabase } from "./supabase.js";
import { sendWhatsAppMessage, sendWhatsAppInteractiveMessage } from "./whatsapp.js";
import { sendWhatsAppDocument, WhatsAppNotConfiguredError } from "./whatsappDocument.js";
import { logActivity } from "./guard.js";

type Lang = "en" | "rw";
type Row = { name: string; phone: string; owed: number; oldest: string; entries: number };

const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const frw = (n: number) => `${Math.round(n).toLocaleString("en-US")} Frw`;
const today = () => new Date(Date.now() + KIGALI_OFFSET_MS).toISOString().slice(0, 10);

const S = {
  en: {
    title: (shop: string) => `${shop}: debt list`,
    sub: (n: number, total: string, date: string) => `Exported ${date}. ${n} customers owe ${total}.`,
    head: ["#", "Customer", "Phone", "Owed", "Oldest debt", "Entries"],
    total: "TOTAL",
    summary: (n: number, total: string, top: string) =>
      `📤 Export summary\nCustomers owing: ${n}\nTotal owed: ${total}\n\nBiggest debts:\n${top}\n\nSend the full Word file?`,
    send: "Send", cancel: "Cancel",
    caption: (n: number, date: string) => `📤 ShopBrain debt list: ${n} customers (${date})`,
    empty: "📤 Nobody owes you anything right now, so there is nothing to export.",
    cancelled: "Okay, cancelled.",
    notConfigured: "⚠️ Export isn't set up yet. Please contact ShopBrain support.",
    failed: "❌ Couldn't send the file. Please try again in a moment.",
  },
  rw: {
    title: (shop: string) => `${shop}: urutonde rw'amadeni`,
    sub: (n: number, total: string, date: string) => `Byoherejwe ${date}. Abakiriya ${n} barabereyemo ${total}.`,
    head: ["#", "Umukiriya", "Telefone", "Umwenda", "Umwenda wa kera", "Ibyanditswe"],
    total: "AMAFARANGA YOSE",
    summary: (n: number, total: string, top: string) =>
      `📤 Incamake y'amadeni\nAbakiriya bafite umwenda: ${n}\nAmafaranga yose: ${total}\n\nAmadeni manini:\n${top}\n\nNohereze dosiye yuzuye ya Word?`,
    send: "Ohereza", cancel: "Hagarika",
    caption: (n: number, date: string) => `📤 Urutonde rw'amadeni rwa ShopBrain: abakiriya ${n} (${date})`,
    empty: "📤 Nta muntu ukubereyemo umwenda ubu, nta cyo kohereza.",
    cancelled: "Sawa, byahagaritswe.",
    notConfigured: "⚠️ Kohereza ntibirashyirwaho. Nyabuneka vugana n'ubufasha bwa ShopBrain.",
    failed: "❌ Ntibyakunze kohereza dosiye. Ongera ugerageze nyuma y'akanya.",
  },
} as const;
// Kinyarwanda is a first draft: have a speaker check it before release.

/** PostgREST returns at most 1000 rows per request. */
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

/** One row per customer who still owes money, biggest debt first. */
async function loadRows(shopId: string): Promise<Row[]> {
  const customers = await fetchAll<{ id: string; name: string; phone: string | null }>((a, b) =>
    supabase.from("customers").select("id, name, phone").eq("shop_id", shopId).order("id").range(a, b),
  );
  const by = new Map<string, Row>(
    customers.map((c) => [String(c.id), { name: c.name, phone: c.phone ?? "", owed: 0, oldest: "", entries: 0 }]),
  );
  const ids = customers.map((c) => c.id);
  for (let i = 0; i < ids.length; i += 150) {
    const group = ids.slice(i, i + 150);
    const tx = await fetchAll<{ customer_id: string; amount: number; date: string | null }>((a, b) =>
      supabase.from("transactions").select("customer_id, amount, date").in("customer_id", group).eq("paid", false).order("id").range(a, b),
    );
    for (const t of tx) {
      const r = by.get(String(t.customer_id));
      if (!r) continue;
      r.owed += Number(t.amount) || 0;
      r.entries++;
      const day = t.date ? new Date(new Date(t.date).getTime() + KIGALI_OFFSET_MS).toISOString().slice(0, 10) : "";
      if (day && (!r.oldest || day < r.oldest)) r.oldest = day;
    }
  }
  return [...by.values()].filter((r) => r.owed > 0).sort((a, b) => b.owed - a.owed);
}

async function langAndShop(shopId: string): Promise<{ shop: string }> {
  const { data } = await supabase.from("owners").select("name").eq("phone", shopId).maybeSingle();
  return { shop: data?.name ?? "My shop" };
}

const line = { style: "single" as const, size: 4, color: "BBBBBB" };
const borders = { top: line, bottom: line, left: line, right: line };
const cell = (text: string, w: number, o: { bold?: boolean; fill?: string; right?: boolean } = {}) =>
  new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({ text, bold: o.bold, font: "Arial", size: 20 })],
    })],
  });

export async function buildExportDocx(shopId: string, lang: Lang): Promise<{ buffer: Buffer; customers: number }> {
  const t = S[lang];
  const [rows, { shop }] = await Promise.all([loadRows(shopId), langAndShop(shopId)]);
  const total = rows.reduce((s, r) => s + r.owed, 0);
  const w = [500, 2700, 1900, 1800, 1500, 960]; // sums to the 9360 DXA of an A4 page with 2 cm margins
  const rightCols = new Set([3]);
  const table = new Table({
    width: { size: w.reduce((a, b) => a + b), type: WidthType.DXA },
    columnWidths: w,
    rows: [
      new TableRow({ tableHeader: true, children: t.head.map((h, i) => cell(h, w[i]!, { bold: true, fill: "E8EEF4", right: rightCols.has(i) })) }),
      ...rows.map((r, i) => new TableRow({
        children: [String(i + 1), r.name, r.phone, frw(r.owed), r.oldest, String(r.entries)]
          .map((v, c) => cell(v, w[c]!, { right: rightCols.has(c) })),
      })),
      new TableRow({
        children: ["", t.total, "", frw(total), "", ""]
          .map((v, c) => cell(v, w[c]!, { bold: c === 1 || c === 3, fill: "F4F4F4", right: rightCols.has(c) })),
      }),
    ],
  });
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t.title(shop), font: "Arial" })] }),
        new Paragraph({ children: [new TextRun({ text: t.sub(rows.length, frw(total), today()), font: "Arial", size: 20 })] }),
        new Paragraph({ children: [] }),
        table,
      ],
    }],
  });
  return { buffer: await Packer.toBuffer(doc), customers: rows.length };
}

/** Step 1: chat summary with Send / Cancel buttons. Returns false when nobody owes anything. */
export async function sendExportSummary(from: string, lang: Lang): Promise<boolean> {
  const t = S[lang];
  const rows = await loadRows(from);
  if (rows.length === 0) {
    await sendWhatsAppMessage(from, t.empty);
    return false;
  }
  const total = rows.reduce((s, r) => s + r.owed, 0);
  const top = rows.slice(0, 3).map((r, i) => `${i + 1}. ${r.name}: ${frw(r.owed)}`).join("\n");
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: t.summary(rows.length, frw(total), top) },
    action: {
      buttons: [
        { type: "reply", reply: { id: "export_send", title: t.send } },
        { type: "reply", reply: { id: "export_cancel", title: t.cancel } },
      ],
    },
  });
  void logActivity("export_requested", { ownerPhone: from, actor: from });
  return true;
}

/** Step 2: build and send the Word file. */
export async function sendExportFile(from: string, lang: Lang): Promise<void> {
  const t = S[lang];
  try {
    const { buffer, customers } = await buildExportDocx(from, lang);
    if (customers === 0) { await sendWhatsAppMessage(from, t.empty); return; }
    const d = today();
    await sendWhatsAppDocument(from, buffer, `ShopBrain-debts-${d}.docx`, t.caption(customers, d), DOCX_MIME);
    void logActivity("export_sent", { ownerPhone: from, actor: from, meta: { customers } });
  } catch (err) {
    if (err instanceof WhatsAppNotConfiguredError) {
      console.error("Export needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the environment.");
      await sendWhatsAppMessage(from, t.notConfigured);
    } else {
      console.error("Word export failed:", err);
      await sendWhatsAppMessage(from, t.failed);
    }
  }
}

export const exportCancelledText = (lang: Lang) => S[lang].cancelled;
