// BATCH 3 (DRAFT, NOT WIRED INTO webhook.ts): employees.
// Staff can add debts, look up customers and record payments. Owner only: bulk reminders,
// export, totals, settings, edit/delete, managing staff, viewing the log.
//
// Why it is not wired yet: webhook.ts, shopFeatures.ts and shopExtras.ts use the sender's
// phone (`from`) as BOTH the shop id (customers.shop_id) and the address to reply to.
// For staff those two differ, so every handler needs a (shopId, replyTo) split first.
// Entry point would be resolveActor(from) at the top of handleMessage / handleInteractive,
// replacing isOwner(). Requires migrations/003_staff.sql and batch 1 (activity log).

import { supabase } from "./supabase.js";
import { logActivity } from "./guard.js";

export type Role = "owner" | "staff";
export type Actor = { ownerPhone: string; role: Role; phone: string };

export const STAFF_ALLOWED = new Set(["add_debt", "lookup_customer", "record_payment"]);
export const OWNER_ONLY = new Set([
  "bulk_reminders", "export", "totals", "settings", "edit", "delete", "manage_staff", "view_log",
]);

export const can = (role: Role, action: string): boolean => role === "owner" || STAFF_ALLOWED.has(action);

const digits = (p: string) => String(p).replace(/\D/g, "");

/** Who is messaging? Null when the number is neither an active owner nor active staff. */
export async function resolveActor(from: string): Promise<Actor | null> {
  const phone = digits(from);
  const { data: owner } = await supabase.from("owners").select("phone, is_active").eq("phone", phone).maybeSingle();
  if (owner && owner.is_active !== false) return { ownerPhone: phone, role: "owner", phone };
  const { data: s } = await supabase.from("staff").select("owner_phone").eq("phone", phone).eq("active", true).maybeSingle();
  if (!s) return null;
  // A staff member only works while their owner is active.
  const { data: o } = await supabase.from("owners").select("is_active").eq("phone", s.owner_phone).maybeSingle();
  return o && o.is_active !== false ? { ownerPhone: s.owner_phone, role: "staff", phone } : null;
}

export async function addStaff(actor: Actor, phone: string, name?: string): Promise<void> {
  if (actor.role !== "owner") throw new Error("owner only");
  const { error } = await supabase.from("staff").upsert(
    { owner_phone: actor.ownerPhone, phone: digits(phone), name, active: true, deactivated_at: null },
    { onConflict: "owner_phone,phone" },
  );
  if (error) throw error;
  void logActivity("staff_added", { ownerPhone: actor.ownerPhone, actor: actor.phone, target: digits(phone) });
}

export async function deactivateStaff(actor: Actor, phone: string): Promise<void> {
  if (actor.role !== "owner") throw new Error("owner only");
  const { error } = await supabase.from("staff")
    .update({ active: false, deactivated_at: new Date().toISOString() })
    .eq("owner_phone", actor.ownerPhone).eq("phone", digits(phone));
  if (error) throw error;
  void logActivity("staff_deactivated", { ownerPhone: actor.ownerPhone, actor: actor.phone, target: digits(phone) });
}

/** "Who did what and when" for the owner, as WhatsApp text (Kigali time). */
export async function staffLogText(actor: Actor, limit = 15): Promise<string> {
  if (actor.role !== "owner") return "Owner only.";
  const [{ data }, { data: staff }] = await Promise.all([
    supabase.from("activity_log").select("at, actor_phone, action, target")
      .eq("owner_phone", actor.ownerPhone).order("at", { ascending: false }).limit(limit),
    supabase.from("staff").select("phone, name").eq("owner_phone", actor.ownerPhone),
  ]);
  const names = new Map<string, string>((staff ?? []).map((s) => [s.phone as string, (s.name as string) || (s.phone as string)]));
  return (data ?? []).map((r) => {
    const when = new Date(r.at as string).toLocaleString("en-GB", {
      timeZone: "Africa/Kigali", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
    const who = r.actor_phone === actor.phone ? "You" : names.get(r.actor_phone as string) ?? (r.actor_phone as string) ?? "System";
    return `${when} - ${who}: ${String(r.action).replace(/_/g, " ")}${r.target ? ` (${r.target})` : ""}`;
  }).join("\n") || "No activity yet.";
}
