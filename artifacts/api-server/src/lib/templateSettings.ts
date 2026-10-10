// src/lib/templateSettings.ts
//
// THE ONE FILE YOU EDIT for WhatsApp templates. No secrets, no environment
// variables: just change the words between the quotes, save, and restart.
//
// whatsapp.ts treats this file as the authority: whatever language code or
// variable count the rest of the code passes in, a template listed here is
// sent with the language code and variable count written here.
//
// 1) TEMPLATE_NAMES: the exact name of each approved template, copied from
//    WhatsApp Manager (lowercase letters, numbers and underscores).
// 2) TEMPLATE_LANGUAGE_CODES: the language each template is REGISTERED in on
//    Meta. WhatsApp only delivers a template when the language code sent
//    matches the one it was registered with, even if the words inside are in
//    another language. Check the "Language" column in WhatsApp Manager.
// 3) TEMPLATE_MAX_PARAMS: how many {{variables}} each template takes.
// 4) The switch below says whether your reminder templates still contain the
//    payment details.
// 5) BUTTON_WORDS: the words written on the buttons of your reminder
//    templates. The bot recognises a tap by these words (capital letters,
//    spaces and apostrophes don't matter, and it is enough that the button
//    text CONTAINS the word).

export type TemplateKind = "reminder" | "receipt" | "weekly";
export type TemplateLang = "en" | "rw";

/**
 * The approved templates, matched to WhatsApp Manager (checked 9 Oct 2026).
 *
 * reminder: debt_reminder (English) and debt_reminder_rw_v2 (Kinyarwanda).
 *           Both exist and are Active. They include the buttons.
 *
 * receipt:  sent to the customer after a payment.
 *           en = "receipts"  (English text, registered as English)
 *           rw = "receipt"   (Kinyarwanda text, but REGISTERED AS ENGLISH on Meta)
 *           NOTE: the two receipt templates do not have the same {{n}} layout
 *           (receipts has the date at {{5}}, receipt has it at {{4}}), so the
 *           variables must be built per language.
 *
 * weekly:   the Monday "ShopBrain recovered X for you" message to the owner.
 *           en = "updates"  (English)
 *           rw = "raporo"   (Kinyarwanda)
 *           Variables: {{1}} shop name, {{2}} amount recovered,
 *                      {{3}} date range, {{4}} total still owed
 *           Check that "updates" uses the same {{1}}-{{4}} order as "raporo".
 */
export const TEMPLATE_NAMES: Record<TemplateKind, Record<TemplateLang, string>> = {
  reminder: { en: "debt_reminder", rw: "debt_reminder_rw_v2" },
  receipt: { en: "receipts", rw: "receipt" },
  weekly: { en: "updates", rw: "raporo" },
};

/**
 * The language code each template is registered under on Meta.
 *   English        -> "en"
 *   Kinyarwanda    -> "rw_RW"   (confirmed 10 Oct 2026: Meta found
 *                                debt_reminder_rw_v2 under this code)
 *   English (US)   -> "en_US"
 *
 * Note receipt.rw is "en": the text is Kinyarwanda but Meta has it filed as
 * English, so it must be sent with the English code.
 */
export const TEMPLATE_LANGUAGE_CODES: Record<TemplateKind, Record<TemplateLang, string>> = {
  reminder: { en: "en", rw: "rw_RW" },
  receipt: { en: "en", rw: "en" },
  weekly: { en: "en", rw: "rw_RW" },
};

/**
 * How many {{variables}} each template takes. whatsapp.ts cuts the list down to
 * this length before sending, because Meta rejects the WHOLE message (error
 * 132000) when the count is off. null = send exactly what the code gives.
 *
 * reminder: both take 5 ({{1}} customer, {{2}} shop, {{3}} total owed,
 *           {{4}} items, {{5}} contact number). Confirmed in the logs on
 *           10 Oct 2026: the Kinyarwanda one was being sent a 6th (the contact
 *           number repeated) and Meta refused it, so no reminder went out.
 *           (English 5 is assumed. If it is wrong, whatsapp.ts reads the real
 *           number from Meta's error, adjusts, and logs it.)
 *
 * receipt / weekly: not confirmed yet. Fill in the numbers once you have
 *           checked the template texts in WhatsApp Manager.
 */
export const TEMPLATE_MAX_PARAMS: Record<TemplateKind, Record<TemplateLang, number | null>> = {
  reminder: { en: 5, rw: 5 },
  receipt: { en: null, rw: null },
  weekly: { en: null, rw: null },
};

/** The template name to send for a kind and language. */
export function templateName(kind: TemplateKind, lang: TemplateLang): string {
  return TEMPLATE_NAMES[kind][lang];
}

/** The language code to send for a kind and language. */
export function templateLanguageCode(kind: TemplateKind, lang: TemplateLang): string {
  return TEMPLATE_LANGUAGE_CODES[kind][lang];
}

/** Which kind and language a template name belongs to (null if it isn't listed above). */
export function findTemplate(name: string): { kind: TemplateKind; lang: TemplateLang } | null {
  const langs: TemplateLang[] = ["en", "rw"];
  for (const kind of Object.keys(TEMPLATE_NAMES) as TemplateKind[]) {
    for (const lang of langs) {
      if (TEMPLATE_NAMES[kind][lang] === name) return { kind, lang };
    }
  }
  return null;
}

/**
 * Does your reminder template still have the payment details (MoMo number and
 * name) written inside it?
 *   false = the payment details are NOT in the message; the customer taps the
 *           "How to Pay" button to see them. (This is how your templates are now.)
 *   true  = the old kind, with the payment details inside the message.
 *
 * Reminder variables when this is false: see TEMPLATE_MAX_PARAMS above (5).
 * shopExtras.ts may build a longer list for Kinyarwanda; whatsapp.ts cuts it
 * to the length written in TEMPLATE_MAX_PARAMS.
 */
export const REMINDER_INCLUDES_PAYMENT_DETAILS = { en: false, rw: false };

/**
 * The words on your reminder buttons (any language). When a customer taps a
 * button, the bot checks whether the button text contains one of these words.
 * Use lowercase letters only. Add a word here if you ever rename a button.
 */
export const BUTTON_WORDS = {
  // "I've paid" button: English "paid", Kinyarwanda "yishyuwe" / "nishyuye"
  paid: ["paid", "yishyuwe", "nishyuye"],
  // "How to pay" button: English "pay", Kinyarwanda "kwishyura" / "nishyura"
  pay: ["pay", "kwishyura", "nishyura"],
  // "Stop reminders" button: English "stop", Kinyarwanda "hagarika"
  stop: ["stop", "hagarika", "unsubscribe"],
  // "My balance" button: English "balance", Kinyarwanda "ideni"
  balance: ["balance", "ideni"],
};

/** Lowercase, letters only: "I've PAID!" becomes "ivepaid". */
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z]/g, "");
}

/** True when the button text contains any of the words. */
export function labelHasWord(label: string, words: string[]): boolean {
  const n = normalizeLabel(label);
  return n.length > 0 && words.some((w) => n.includes(normalizeLabel(w)));
}