import { sendWhatsAppTemplateMessage } from "../lib/whatsapp.js";
import { supabase } from "../lib/supabase.js";

type Lang = "en" | "rw";

// Maps owner language to the exact locale code Meta has the check-in
// template registered under. Confirm these against WhatsApp Manager →
// template details before relying on this — they must match exactly or
// sends fail with error 132001, same gotcha as the debt reminder templates.
function checkinLanguageCode(lang: Lang): string {
  return lang === "rw" ? "rw_RW" : "en";
}

// Runs the recurring check-in for every owner who:
//   - is fully registered (has a shop name)
//   - has never received a check-in (last_checkin_sent_at is null), OR
//     last received one 14+ days ago
// Unlike a one-time onboarding message, this repeats indefinitely — every
// owner gets it roughly twice a month for as long as they're using
// ShopBrain, since real problems can come up at any point, not just in
// week 1. Twice a month (rather than weekly) keeps the volume of outbound
// template sends lower, which matters both for Meta's quality-rating
// scrutiny of repeated automated sends and for not being naggy to owners.
//
// `last_checkin_sent_at` is updated after every attempt (success or
// failure) so a broken send (e.g. template not yet approved, or a WhatsApp
// API error) never causes the same owner to be re-attempted every single
// day until it works — it just tries again on the normal cadence, same as
// everyone else.
//
// Call this once a day from wherever the app's scheduler lives (a cron
// route hit by an external pinger, a setInterval in index.ts, etc.) — this
// file has no scheduling of its own, it's just the job body. Running it
// daily and gating on "14+ days since last send" (rather than running it
// biweekly and gating on nothing) means a missed day never permanently
// skips anyone — the check just catches them a day or two late instead.
export async function runWeeklyCheckin(): Promise<{ sent: number; failed: number }> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const { data: owners, error } = await supabase
    .from("owners")
    .select("phone, name, language, last_checkin_sent_at")
    .not("name", "is", null) // only fully-registered owners (shop name set)
    .or(`last_checkin_sent_at.is.null,last_checkin_sent_at.lte.${fourteenDaysAgo.toISOString()}`);

  if (error) {
    console.error("Failed to fetch owners for check-in:", error);
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const owner of owners ?? []) {
    const lang = (owner.language as Lang) ?? "en";
    try {
      await sendWhatsAppTemplateMessage(
        owner.phone,
        "weekly_checkin",
        checkinLanguageCode(lang),
        [owner.name], // {{1}} owner/shop name
      );
      sent++;
    } catch (err) {
      console.error(`Check-in failed for ${owner.phone}:`, err);
      failed++;
    }

    // Reset the clock either way — see comment above on why a failed send
    // shouldn't cause daily retries against the same owner.
    await supabase.from("owners").update({ last_checkin_sent_at: new Date().toISOString() }).eq("phone", owner.phone);

    // Small delay between sends, same pattern as bulk reminders, to avoid
    // hammering the WhatsApp API in a tight loop.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { sent, failed };
}