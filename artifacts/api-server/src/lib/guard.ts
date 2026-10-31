// BATCH 1: protection and monitoring.
//
//   - one activity log (logActivity)
//   - trial caps on customers and on reminders per day (owners on a trial only)
//   - at most 2 reminders per customer phone per day across ALL shops; the third is
//     blocked and the number is flagged for the admin dashboard
//
// Every reminder (single, "send to everyone", auto) must go through reserveReminder().
// The kill switch already exists: owners.is_active (admin Deactivate / Activate).
//
// Requires migrations/001_batch1_protection.sql.

import { supabase } from "./supabase.js";

type Lang = "en" | "rw";

/** Max reminders one customer phone can get per Kigali day, from all shops together. */
export const CUSTOMER_MAX_REMINDERS_PER_DAY = 2;

// Trial defaults. Override per owner with owners.max_customers / owners.max_reminders_per_day,
// or for everyone with these env vars. Owners whose trial is over (or unset) are NOT capped
// unless they have an explicit per-owner limit.
const TRIAL_MAX_CUSTOMERS = Number(process.env["TRIAL_MAX_CUSTOMERS"] ?? 30);
const TRIAL_MAX_REMINDERS_PER_DAY = Number(process.env["TRIAL_MAX_REMINDERS_PER_DAY"] ?? 20);

const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000; // UTC+2, no daylight saving

/** ISO timestamp of 00:00 today in Kigali. */
export function kigaliDayStartIso(): string {
  const shifted = new Date(Date.now() + KIGALI_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - KIGALI_OFFSET_MS).toISOString();
}

const digits = (p: string | null | undefined) => String(p ?? "").replace(/\D/g, "");

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

/** One place for every notable action. Never throws and never blocks the caller's flow. */
export async function logActivity(
  action: string,
  o: { ownerPhone?: string; actor?: string; target?: string; meta?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const { error } = await supabase.from("activity_log").insert({
      action,
      owner_phone: o.ownerPhone ? digits(o.ownerPhone) : null,
      actor_phone: o.actor ?? null,
      target: o.target ?? null,
      meta: o.meta ?? {},
    });
    if (error) console.error("[activity_log] insert failed:", error.message);
  } catch (err) {
    console.error("[activity_log] insert threw:", err);
  }
}

/* ------------------------------------------------------------------ */
/* Trial limits                                                        */
/* ------------------------------------------------------------------ */

type Limits = { maxCustomers: number | null; maxRemindersPerDay: number | null };

async function getLimits(ownerPhone: string): Promise<Limits> {
  const { data, error } = await supabase
    .from("owners")
    .select("trial_ends_at, max_customers, max_reminders_per_day")
    .eq("phone", digits(ownerPhone))
    .maybeSingle();
  if (error || !data) {
    // Columns missing (migration not run yet) or lookup failed: do not block anyone.
    if (error) console.error("[guard] limits lookup failed:", error.message);
    return { maxCustomers: null, maxRemindersPerDay: null };
  }
  const onTrial = !!data.trial_ends_at && new Date(data.trial_ends_at).getTime() > Date.now();
  return {
    maxCustomers: data.max_customers ?? (onTrial ? TRIAL_MAX_CUSTOMERS : null),
    maxRemindersPerDay: data.max_reminders_per_day ?? (onTrial ? TRIAL_MAX_REMINDERS_PER_DAY : null),
  };
}

/** Check BEFORE inserting a customer. `extra` = how many are about to be added (photo import). */
export async function canAddCustomers(
  ownerPhone: string,
  extra = 1,
): Promise<{ ok: true } | { ok: false; limit: number; remaining: number }> {
  const { maxCustomers } = await getLimits(ownerPhone);
  if (maxCustomers === null) return { ok: true };
  const { count, error } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", ownerPhone);
  if (error) {
    console.error("[guard] customer count failed:", error.message);
    return { ok: true };
  }
  const have = count ?? 0;
  if (have + extra <= maxCustomers) return { ok: true };
  return { ok: false, limit: maxCustomers, remaining: Math.max(0, maxCustomers - have) };
}

/* ------------------------------------------------------------------ */
/* Reminder chokepoint                                                 */
/* ------------------------------------------------------------------ */

export type ReminderLogRow = { id: string | number; [k: string]: unknown };

export type Reservation =
  | { ok: true; log: ReminderLogRow | null }
  | { ok: false; reason: "owner_daily_cap"; limit: number }
  | { ok: false; reason: "customer_daily_cap" };

/**
 * Replaces the plain `reminder_logs.insert({... status: "pending"})` that sits in front of
 * every reminder send. Enforces the owner's daily cap and the 2-per-customer-per-day cap
 * atomically, and returns the new 'pending' reminder_logs row to use exactly as before.
 *
 * If the database function is missing (migration not run) it logs an error and falls back
 * to the old plain insert, so a missed migration never stops reminders.
 */
export async function reserveReminder(a: {
  ownerPhone: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  isAuto?: boolean;
  quiet?: boolean;
}): Promise<Reservation> {
  const ownerPhone = digits(a.ownerPhone);

  const { maxRemindersPerDay } = await getLimits(ownerPhone);
  if (maxRemindersPerDay !== null) {
    const { count } = await supabase
      .from("reminder_logs")
      .select("id", { count: "exact", head: true })
      .eq("owner_phone", ownerPhone)
      .gte("created_at", kigaliDayStartIso())
      .neq("status", "failed");
    if ((count ?? 0) >= maxRemindersPerDay) {
      await logActivity("reminder_blocked_owner_cap", { ownerPhone, target: digits(a.customerPhone) });
      return { ok: false, reason: "owner_daily_cap", limit: maxRemindersPerDay };
    }
  }

  const { data, error } = await supabase.rpc("reserve_reminder_log", {
    p_owner_phone: ownerPhone,
    p_customer_name: a.customerName,
    p_customer_phone: a.customerPhone,
    p_amount: a.amount,
    p_is_auto: a.isAuto ?? false,
    p_quiet: a.quiet ?? false,
    p_max_per_day: CUSTOMER_MAX_REMINDERS_PER_DAY,
  });

  if (error) {
    console.error("[guard] reserve_reminder_log failed, using plain insert (run migration 001):", error.message);
    const { data: row } = await supabase
      .from("reminder_logs")
      .insert({
        message_id: `pending_${digits(a.customerPhone)}_${Date.now()}`,
        owner_phone: ownerPhone,
        customer_name: a.customerName,
        customer_phone: a.customerPhone,
        amount: a.amount,
        status: "pending",
        ...(a.isAuto ? { is_auto: true, quiet: a.quiet ?? false } : {}),
      })
      .select()
      .single();
    return { ok: true, log: (row as ReminderLogRow | null) ?? null };
  }

  if (data === null || data === undefined) return { ok: false, reason: "customer_daily_cap" };
  return { ok: true, log: data as ReminderLogRow };
}

/* ------------------------------------------------------------------ */
/* Owner-facing messages                                               */
/* ------------------------------------------------------------------ */
// Kinyarwanda lines are a first draft: have a Kinyarwanda speaker check them before release.

export function customerLimitMessage(lang: Lang, limit: number): string {
  return lang === "rw"
    ? `Ugeze ku mubare ntarengwa w'abakiriya mu gihe cy'igerageza (${limit}). Hamagara ShopBrain kugira ngo wongere.`
    : `You have reached the trial limit of ${limit} customers. Contact ShopBrain to add more.`;
}

export function reminderBlockedMessage(
  lang: Lang,
  r: Extract<Reservation, { ok: false }>,
  customerName: string,
): string {
  if (r.reason === "owner_daily_cap") {
    return lang === "rw"
      ? `Wageze ku mubare ntarengwa w'ubutumwa bwo kwibutsa bwa none (${r.limit}). Ongera ugerageze ejo.`
      : `You have reached today's limit of ${r.limit} reminders. Please try again tomorrow.`;
  }
  return lang === "rw"
    ? `${customerName} yamaze kubona ubutumwa ${CUSTOMER_MAX_REMINDERS_PER_DAY} bwo kwibutsa uyu munsi. Kugira ngo turinde abakiriya, ShopBrain ntishobora kohereza ubundi kugeza ejo.`
    : `${customerName} already received ${CUSTOMER_MAX_REMINDERS_PER_DAY} reminders today. To protect customers, ShopBrain can't send another until tomorrow.`;
}
