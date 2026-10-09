// src/lib/templateSettings.ts
//
// THE ONE FILE YOU EDIT for WhatsApp templates. No secrets, no environment
// variables: just change the words between the quotes, save, and restart.
//
// 1) TEMPLATE_NAMES: the exact name of each approved template, copied from
//    WhatsApp Manager (lowercase letters, numbers and underscores).
// 2) The two switches below it say whether your reminder templates still
//    contain the payment details.
// 3) BUTTON_WORDS: the words written on the buttons of your reminder
//    templates. The bot recognises a tap by these words (capital letters,
//    spaces and apostrophes don't matter, and it is enough that the button
//    text CONTAINS the word).

/**
 * The approved templates. Each one needs an English version (en) and a
 * Kinyarwanda version (rw).
 */
export const TEMPLATE_NAMES = {
  // The reminder sent to customers. These are your EXISTING reminder templates
  // after you edited them to add the buttons, so the names did not change.
  reminder: { en: "debt_reminder", rw: "debt_reminder_rw_v2" },

  // "You paid X, remaining Y" sent to the customer after a payment.
  // Variables: {{1}} customer name, {{2}} shop name, {{3}} amount paid, {{4}} amount remaining
  receipt: { en: "payment_receipt", rw: "payment_receipt_rw" },

  // The Monday "ShopBrain recovered X for you" message, sent to the owner.
  // Variables: {{1}} shop name, {{2}} amount recovered, {{3}} date range, {{4}} total still owed
  weekly: { en: "weekly_recovery", rw: "weekly_recovery_rw" },
};

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
  // "I've paid" button: English "paid", Kinyarwanda "yishyuwe"
  paid: ["paid", "yishyuwe", "nishyuye"],
  // "How to pay" button: English "want to pay", Kinyarwanda "kwishyura"
  pay: ["pay", "kwishyura", "nishyura"],
  // "Stop reminders" button: English "stop", Kinyarwanda "hagarika"
  stop: ["stop", "hagarika", "unsubscribe"],
  // "My balance" button (only if you ever add one)
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