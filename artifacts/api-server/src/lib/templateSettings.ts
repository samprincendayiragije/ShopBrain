// src/lib/templateSettings.ts
//
// THE ONE FILE YOU EDIT for WhatsApp templates. No secrets, no environment
// variables: just change the words between the quotes, save, and restart.
//
// 1) TEMPLATE_NAMES: the exact name of each approved template, copied from
//    WhatsApp Manager (lowercase letters, numbers and underscores).
// 2) TEMPLATE_LANGUAGE_CODES: the language each template is REGISTERED in on
//    Meta. WhatsApp only delivers a template when the language code sent
//    matches the one it was registered with, even if the words inside are in
//    another language. Check the "Language" column in WhatsApp Manager.
//    (whatsapp.ts also retries once with the sibling code if Meta answers
//    error 132001, and logs which code worked, so a wrong guess here shows up
//    in the logs instead of silently killing every message.)
// 3) The switch below says whether your reminder templates still contain the
//    payment details.
// 4) BUTTON_WORDS: the words written on the buttons of your reminder
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
 *           The old names payment_receipt / payment_receipt_rw do not exist in
 *           WhatsApp Manager, so every receipt using them failed.
 *           NOTE: the two receipt templates do not have the same {{n}} layout
 *           (receipts has the date at {{5}}, receipt has it at {{4}}), so the
 *           params array must be built per language.
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
 *   Kinyarwanda    -> "rw_RW"   (Meta's code for Kinyarwanda; webhook.ts has
 *                                always used this one for the reminder)
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

/** The template name to send for a kind and language. */
export function templateName(kind: TemplateKind, lang: TemplateLang): string {
  return TEMPLATE_NAMES[kind][lang];
}

/** The language code to send for a kind and language. Use this in the template
 *  payload instead of writing "en" or "rw" by hand. */
export function templateLanguageCode(kind: TemplateKind, lang: TemplateLang): string {
  return TEMPLATE_LANGUAGE_CODES[kind][lang];
}

/**
 * Does your reminder template still have the payment details (MoMo number and
 * name) written inside it?
 *   false = the payment details are NOT in the message; the customer taps the
 *           "How to Pay" button to see them. (This is how your templates are now.)
 *   true  = the old kind, with the payment details inside the message.
 *
 * Reminder variables when this is false:
 *   English:      {{1}} customer, {{2}} shop, {{3}} total owed, {{4}} items, {{5}} contact number
 *   Kinyarwanda:  the same, with the contact number repeated as {{6}}
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