// BATCH 1: morning digest + rule-based alerts. No AI involved.
// Both go to the admin's WhatsApp (SAM_PHONE_NUMBER). Free-text WhatsApp messages only
// reach a number that messaged the bot in the last 24h, so message the bot once a day
// (same limitation as the existing flagged-issue notice).

import { supabase } from "./supabase.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import { logActivity } from "./guard.js";

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const HOUR = 3600_000;
const DAY = 24 * HOUR;

async function count(table: string, f: (q: any) => any): Promise<number> {
  const { count, error } = await f(supabase.from(table).select("*", { count: "exact", head: true }));
  if (error) console.error(`[digest] count ${table} failed:`, error.message);
  return count ?? 0;
}

/** PostgREST returns at most 1000 rows per request, so page through. */
async function ownerCounts(sinceIso: string, untilIso?: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let from = 0; from < 20_000; from += 1000) {
    let q = supabase.from("reminder_logs").select("owner_phone").gte("created_at", sinceIso).neq("status", "failed");
    if (untilIso) q = q.lt("created_at", untilIso);
    const { data, error } = await q.range(from, from + 999);
    if (error) { console.error("[digest] owner counts failed:", error.message); break; }
    for (const r of data ?? []) out[r.owner_phone] = (out[r.owner_phone] ?? 0) + 1;
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function buildDigest(): Promise<string> {
  const d = ago(DAY);
  const soon = new Date(Date.now() + 3 * DAY).toISOString();
  const [added, sent, delivered, read, failed, blocked, stops, errors, expiring, openFlags] = await Promise.all([
    count("owners", q => q.gte("created_at", d)),
    count("reminder_logs", q => q.gte("created_at", d).neq("status", "failed")),
    count("reminder_logs", q => q.gte("created_at", d).in("status", ["delivered", "read"])),
    count("reminder_logs", q => q.gte("created_at", d).eq("status", "read")),
    count("reminder_logs", q => q.gte("created_at", d).eq("status", "failed")),
    count("activity_log", q => q.gte("at", d).in("action", ["reminder_blocked_customer_cap", "reminder_blocked_owner_cap"])),
    count("opt_outs", q => q.gte("created_at", d)),
    count("activity_log", q => q.gte("at", d).eq("action", "error")),
    count("owners", q => q.neq("is_active", false).gte("trial_ends_at", new Date().toISOString()).lte("trial_ends_at", soon)),
    count("phone_flags", q => q.eq("resolved", false)),
  ]);
  const per = await ownerCounts(d);
  const heavy = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([o, n]) => `${o}: ${n}`).join(", ") || "none";
  return [
    "ShopBrain morning digest (last 24h)",
    `New owners: ${added}`,
    `Reminders: ${sent} (delivered ${delivered}, read ${read}) | failed: ${failed} | blocked: ${blocked}`,
    `STOP replies: ${stops}`,
    `Busiest owners: ${heavy}`,
    `Trials ending within 3 days: ${expiring}`,
    `Open flagged numbers: ${openFlags}`,
    `Errors logged: ${errors}`,
  ].join("\n");
}

async function alertOnce(text: string): Promise<void> {
  const dup = await count("activity_log", q => q.eq("action", "alert").eq("target", text).gte("at", ago(3 * HOUR)));
  if (dup) return;
  await logActivity("alert", { target: text });
  await sendAdmin("ALERT: " + text);
}

export async function sendAdmin(text: string): Promise<void> {
  const to = process.env["SAM_PHONE_NUMBER"];
  if (!to) { console.warn("[digest] SAM_PHONE_NUMBER not set, not sending:", text.split("\n")[0]); return; }
  try { await sendWhatsAppMessage(to, text); }
  catch (err) { console.error("[digest] admin message failed:", err); }
}

/** Runs every ~15 min. Repeats of the same alert are suppressed for 3 hours. */
export async function runAlertRules(): Promise<void> {
  const h = ago(HOUR);

  const total = await count("reminder_logs", q => q.gte("created_at", h));
  const failed = await count("reminder_logs", q => q.gte("created_at", h).eq("status", "failed"));
  if (total >= 10 && failed / total > 0.2)
    await alertOnce(`Failure spike: ${failed} of ${total} reminders failed in the last hour.`);

  const stops = await count("opt_outs", q => q.gte("created_at", h));
  if (stops >= 5) await alertOnce(`STOP spike: ${stops} STOP replies in the last hour.`);

  const today = await ownerCounts(ago(DAY));
  const week = await ownerCounts(ago(8 * DAY), ago(DAY));
  for (const [o, n] of Object.entries(today)) {
    const avg = (week[o] ?? 0) / 7;
    if (n >= 30 && n > Math.max(avg * 3, 10))
      await alertOnce(`Owner ${o} sent ${n} reminders in 24h (usual about ${avg.toFixed(0)}).`);
  }

  const { data: flags } = await supabase.from("phone_flags").select("phone, reason").eq("resolved", false).gte("flagged_at", ago(20 * 60_000));
  for (const f of flags ?? []) await alertOnce(`Number flagged: ${f.phone} (${f.reason}).`);
}

/** Sends the digest once per Kigali day, from 07:00. Survives restarts: the send is recorded in activity_log. */
export async function runDigestIfDue(): Promise<void> {
  const kigali = new Date(Date.now() + 2 * HOUR);
  if (kigali.getUTCHours() < 7) return;
  const dayStart = new Date(Date.UTC(kigali.getUTCFullYear(), kigali.getUTCMonth(), kigali.getUTCDate()) - 2 * HOUR).toISOString();
  if (await count("activity_log", q => q.eq("action", "digest_sent").gte("at", dayStart))) return;
  await logActivity("digest_sent");
  await sendAdmin(await buildDigest());
}
