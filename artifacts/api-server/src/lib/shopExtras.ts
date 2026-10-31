// src/lib/shopExtras.ts
//
// Second part of the ShopBrain feature pack (the first part is shopFeatures.ts).
// Run shopbrain_migration.sql in Supabase FIRST.
//
//   AUTO-REMINDERS    requestAutoRemindOn / runAutoReminders / notifyAutoStatus
//                     5-minute countdown with a Cancel button, then short live
//                     status lines for the owner (sent / delivered / read / not sent)
//   NO-NUMBER FIX     sendNoNumberWarning / startAddNumber / showFixNumbers
//   CUSTOMER BUTTONS  handleCustomerMessage / handleCustomerAction
//                     (My Balance, How to Pay, I've Paid, Stop Reminders)
//   RECEIPTS          sendPaymentReceipt
//   SCOREBOARD        showRecovered / runWeeklyRecovery ("ShopBrain recovered X for you")
//   EXPORT            exportBackup (CSV file sent on WhatsApp)
//   REMINDER SENDING  buildReminderPayload (which template + variables to use)

import {
  BUTTON_WORDS,
  REMINDER_INCLUDES_PAYMENT_DETAILS,
  TEMPLATE_NAMES,
  labelHasWord,
} from "./templateSettings.js";
import { supabase } from "./supabase.js";
import {
  sendWhatsAppMessage,
  sendWhatsAppInteractiveMessage,
  sendWhatsAppTemplateMessage,
} from "./whatsapp.js";
import { sendWhatsAppDocument, WhatsAppNotConfiguredError } from "./whatsappDocument.js";
import { reserveReminder, logActivity } from "./guard.js";
import { sendExportSummary, sendExportFile, exportCancelledText } from "./exportDocx.js";

export type Lang = "en" | "rw";
export interface Session {
  step: string;
  data: Record<string, string>;
}

export interface OwnerMomoFields {
  momo_number?: string | null;
  momo_code?: string | null;
  momo_receiver_name?: string | null;
  shop_nickname?: string | null;
}

/** Everything these modules need from webhook.ts. Passed in once at start-up. */
export interface FeatureDeps {
  sessions: Record<string, Session | undefined>;
  cleanPhone: (phone: string) => string;
  /** Sends the main menu bubble (webhook's sendPersistentMenu). */
  sendMenu: (from: string, lang: Lang) => Promise<void>;
  /** Sends the "customer's phone number?" prompt of the Add Debt flow (credit sales use it). */
  sendAddDebtPhonePrompt: (from: string, lang: Lang) => Promise<void>;
  buildItemizedList: (customerId: string) => Promise<string>;
  buildMomoBlock: (owner: OwnerMomoFields, lang: Lang) => string;
  reminderTemplateName: (lang: Lang) => string;
  metaLanguageCode: (lang: Lang) => string;
  getOptedOutSet: (phones: string[]) => Promise<Set<string>>;
  isOptedOut: (phone: string) => Promise<boolean>;
  getLang: (ownerPhone: string) => Promise<Lang>;
  /** Asks "did this customer agree to reminders?" (Yes/No buttons). */
  askConsent: (from: string, lang: Lang) => Promise<void>;
  /** Starts the Mark as Paid flow for a customer phone. */
  startMarkPaid: (from: string, phone: string, lang: Lang) => Promise<void>;
  reminderCooldownDays: number;
}

let D!: FeatureDeps;
export function initExtras(deps: FeatureDeps): void {
  D = deps;
}

/* ------------------------------------------------------------------ */
/* Constants + small helpers                                           */
/* ------------------------------------------------------------------ */

export const AUTO_REMIND_MIN_DEBT_DAYS = 3; // daily runs only remind debts at least this old
const AUTO_FIRST_RUN_DELAY_MS = 5 * 60 * 1000; // wait 5 minutes after the owner turns it on
const AUTO_INDIVIDUAL_LIMIT = 10; // up to this many customers get one status line each
const AUTO_SUMMARY_DELAY_MS = 10 * 60 * 1000; // big runs: one summary this long after sending
const DAILY_WINDOW_START_HOUR = 9; // daily runs only happen between 09:00 and 18:00 Kigali time
const DAILY_WINDOW_END_HOUR = 18;
const RECOVERY_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000; // Africa/Kigali is UTC+2, no daylight saving

function money(n: number): string {
  return `${n.toLocaleString()} Frw`;
}

/** Today's date in Kigali as YYYY-MM-DD. */
export function kigaliToday(): string {
  return new Date(Date.now() + KIGALI_OFFSET_MS).toISOString().slice(0, 10);
}

function kigaliHour(): number {
  return new Date(Date.now() + KIGALI_OFFSET_MS).getUTCHours();
}

/** Monday 00:00 (Kigali time) of the current week, or of N weeks ago. */
export function mondayStartKigali(weeksBack: number): Date {
  const shifted = new Date(Date.now() + KIGALI_OFFSET_MS);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  shifted.setUTCHours(0, 0, 0, 0);
  const mondayShifted = shifted.getTime() - daysSinceMonday * DAY_MS - weeksBack * 7 * DAY_MS;
  return new Date(mondayShifted - KIGALI_OFFSET_MS);
}

function formatRange(startInclusive: Date, endExclusive: Date): string {
  const opts = { day: "numeric", month: "short", timeZone: "Africa/Kigali" } as const;
  const a = startInclusive.toLocaleDateString("en-GB", opts);
  const b = new Date(endExclusive.getTime() - 1).toLocaleDateString("en-GB", opts);
  return `${a} – ${b}`;
}

function menuSoon(from: string, lang: Lang): void {
  setTimeout(() => {
    D.sendMenu(from, lang).catch((err) => console.error("Failed to send menu:", err));
  }, 1000);
}

/** Reads every row of a query, 1000 at a time (PostgREST's default page cap). */
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

/** Splits a long id list so a query URL never gets too long. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Saves a text for the owner to see the next time they open the bot (their 24h window was closed). */
async function queueNotice(ownerPhone: string, text: string): Promise<void> {
  const { error } = await supabase.from("owner_notices").insert({ shop_id: ownerPhone, text });
  if (error) console.error("Failed to queue owner notice:", error);
}

/**
 * Sends a short line to the owner. WhatsApp only lets us message someone freely
 * while their last message to us is under 24 hours old. When that window is
 * closed the send fails; important lines (problems) are then saved and shown
 * the next time the owner opens the bot, the rest are dropped on purpose
 * (a "delivered" line from yesterday is just noise).
 */
async function sendLine(
  ownerPhone: string,
  text: string,
  opts: { queueIfFails?: boolean; button?: { id: string; title: string } } = {},
): Promise<void> {
  try {
    if (opts.button) {
      await sendWhatsAppInteractiveMessage(ownerPhone, {
        type: "button",
        body: { text },
        action: { buttons: [{ type: "reply", reply: { id: opts.button.id, title: opts.button.title } }] },
      });
    } else {
      await sendWhatsAppMessage(ownerPhone, text);
    }
  } catch {
    if (opts.queueIfFails) await queueNotice(ownerPhone, text);
  }
}

/* ------------------------------------------------------------------ */
/* Strings (English + Kinyarwanda). Please proofread the Kinyarwanda.  */
/* ------------------------------------------------------------------ */

const en = {
  cancelBtn: "✖️ Cancel",

  // ---- Add Debt / Mark as Paid / MoMo: one-message prompts ----
  addDebtPrompt:
    "➕ *Add Debt*\n\nType everything in one message:\n\n`0788123456 Jean sugar 2000`\n\nNo phone number?\n`Jean sugar 2000`\n\nTwo-word name? Use commas:\n`Mama Janet, sugar, 2000`\n\nOr send just the phone number and I'll ask the rest.",
  addDebtHint:
    "❌ I couldn't read that.\n\nExample: `0788123456 Jean sugar 2000`\nOr send just the phone number.",
  debtConfirmBody: (name: string, phone: string | null, item: string, amount: number, isNew: boolean, dupName: boolean) =>
    `➕ *Add this debt?*\n\n👤 ${name}${phone ? ` (${phone})` : " — no number"}\n📦 ${item}\n💰 ${money(amount)}` +
    (dupName ? `\n\n⚠️ You already have another no-number customer called *${name}*. Cancel and add a label like "${name} (moto)" if they are different people.` : "") +
    (isNew && phone ? "\n\nTap *Save + reminders* if this customer agreed to get WhatsApp reminders." : ""),
  debtSaveRemindersBtn: "✅ Save + reminders",
  debtSaveOnlyBtn: "💾 Save only",
  debtSaveBtn: "✅ Save",
  debtCancelled: "✖️ Debt not added.",

  markPaidPromptQuick:
    "✅ *Mark as Paid*\n\nType the customer's phone or name. Add an amount if they paid only part.\n\n`0788123456`\n`0788123456 2000`\n`Jean 2000`",
  payPick: (name: string) => `🔍 Several customers match "${name}". Tap one:`,
  payConfirmFull: (name: string, owed: number) => `✅ Mark *${name}*'s debt of *${money(owed)}* as fully paid?`,
  payConfirmPart: (name: string, paid: number, owed: number) =>
    `💰 Record a payment of *${money(paid)}* from *${name}*?\n\nOwes ${money(owed)} → ${money(owed - paid)} left.`,
  payYesBtn: "✅ Yes",
  payCancelled: "✖️ Nothing recorded.",
  payNoDebt: (name: string) => `✅ *${name}* has no debt to pay.`,
  payGeneric: "Payment",

  momoQuick:
    "💳 *MoMo Setup*\n\nType it all in one message:\n\n`0788123456, NIYONZIMA ALICE, Chez Alice`\n(number, the name MTN shows, what customers call your shop)\n\nWith a merchant code:\n`0788123456, 123456, NIYONZIMA ALICE, Chez Alice`\n\nOr send just the number and I'll ask the rest.",

  // ---- no-number fix ----
  noNumberWarning: (name: string) =>
    `⚠️ *${name}* has no phone number, so I can't send a reminder.\n\nAdd a number to remind them.`,
  addNumberBtn: "✏️ Add Number",
  addNumberPrompt: (name: string) => `📞 What is *${name}*'s phone number?\n\ne.g. 0788123456`,
  addNumberInvalid: "❌ That doesn't look like a phone number. Try again, e.g. 0788123456:",
  addNumberTaken: (other: string) => `⚠️ That number already belongs to *${other}*. Send a different number:`,
  addNumberSaved: (name: string, phone: string) => `✅ Number saved for *${name}*: ${phone}`,
  fixNumbersBtn: "✏️ Fix Numbers",
  fixNumbersAsk: (n: number) => `📵 ${n} customers who owe you have no number, so they can't be reminded.`,
  fixNumbersPick: "Tap a customer to add their number:",
  fixNumbersNone: "✅ Everyone who owes you has a phone number.",
  fixNumbersSection: "No-number customers",
  selectBtn: "Select",

  // ---- auto reminders ----
  arStatus: (on: boolean, minDays: number, cooldown: number, pendingMin: number | null) =>
    `⏰ *Auto Reminders: ${on ? "ON ✅" : "OFF"}*\n\n` +
    (pendingMin !== null ? `Starting in about ${pendingMin} min. Tap Cancel to stop it.\n\n` : "") +
    `When ON, ShopBrain reminds customers who owe you, at most once every ${cooldown} days. New debts wait ${minDays} days first.\n\nOnly customers who agreed to reminders (and haven't replied STOP) are reminded.`,
  arOnBtn: "✅ Turn On",
  arOffBtn: "⛔ Turn Off",
  arCancelBtn: "❌ Cancel",
  arOffYes: "✅ Yes, turn off",
  arOffNo: "↩️ Keep On",
  arCountdown: (n: number, skipped: string) =>
    `⏰ *Auto reminders ON*\n\nReminders go out in 5 minutes to *${n} customers*.${skipped ? `\n${skipped}` : ""}\n\nTap Cancel to stop.`,
  arNobody:
    "⏰ *Auto reminders ON ✅*\n\nNobody needs a reminder right now. ShopBrain will remind customers automatically when their debt is a few days old.",
  arCancelled: "✖️ Cancelled. Auto reminders stay OFF and nothing was sent.",
  arTooLate: "ℹ️ Too late to cancel, the reminders are already going out. You can turn auto reminders off from Settings.",
  arOffAsk: "Turn off auto reminders? Customers will stop being reminded automatically.",
  arNowOff: "⛔ Auto reminders are OFF.",
  arKeptOn: "👍 Auto reminders stay ON.",
  arDefaultOn:
    "⏰ *Auto reminders are ON.* ShopBrain will remind customers who owe you. Change it any time: Menu → Settings → Auto Reminders.",
  skippedSummary: (parts: string) => `Skipped: ${parts}`,
  reasonLabel: {
    no_number: "no number",
    disabled: "reminders disabled",
    no_consent: "no reminder consent",
    promise: "promised a date",
    recent: "reminded recently",
    too_new: "debt too new",
  } as Record<string, string>,
  // short live status lines for the owner
  stSent: (n: string) => `✅ Reminder to ${n} sent`,
  stDelivered: (n: string) => `📬 Reminder to ${n} delivered`,
  stRead: (n: string) => `👀 Reminder to ${n} read`,
  stFailed: (n: string) => `❌ Reminder to ${n} not sent — failed`,
  stNotOnWa: (n: string) => `❌ Reminder to ${n} not sent — not on WhatsApp`,
  stSkip: (n: string, why: string) => `❌ Reminder to ${n} not sent — ${why}`,
  stPromise: (n: string, date: string) => `⏱ Reminder to ${n} not sent — promised to pay by ${date}`,
  grpSent: (n: number) => `✅ Reminders sent to ${n} customers`,
  grpNotSent: (why: string, n: number, names: string) => `❌ Not sent — ${why} (${n}): ${names}`,
  grpSummary: (delivered: number, read: number, failed: number, total: number) =>
    `📊 Reminders update: 📬 ${delivered} delivered · 👀 ${read} read · ❌ ${failed} failed (of ${total})`,
  dailySummary: (sent: number, failed: number) =>
    `⏰ Auto reminders today: ${sent} sent${failed ? ` · ${failed} failed` : ""}`,

  // ---- customer side ----
  custMenuBody: "👋 Hello! This is *ShopBrain*, the debt assistant used by the shops you buy from.\n\nWhat would you like?",
  custBtnBalance: "💰 My Balance",
  custBtnPay: "💳 How to Pay",
  custBtnStop: "🛑 Stop Reminders",
  custBtnPaid: "✅ I've Paid",
  custBalanceLine: (shop: string, total: number, itemized: string) =>
    `🏪 *${shop}*\n💰 You owe *${money(total)}*${itemized ? `\n📦 ${itemized}` : ""}`,
  custNoDebt: "🎉 You don't owe anything right now. Thank you!",
  custPayLine: (shop: string, details: string) => `🏪 *${shop}*\n💳 ${details}`,
  custNoPayDetails: (contact: string) => `No payment details saved yet. Please contact the shop on ${contact}.`,
  custAlreadyPaid: "Already paid?",
  custPaidThanks: (shops: string) => `✅ Thank you! I've told ${shops}. They will confirm your payment.`,
  claimBody: (name: string) => `💬 *${name}* says they've paid. Record it?`,
  claimYesBtn: "✅ Record Payment",
  claimNoBtn: "Not yet",
  claimNoAck: "👍 OK, nothing recorded.",
  claimQueued: (name: string) => `💬 ${name} says they've paid. Open Mark as Paid to record it.`,

  // ---- scoreboard + weekly push ----
  recLast: (amount: number, range: string) => `🏆 *ShopBrain recovered ${money(amount)} for you* last week (${range})`,
  recThis: (amount: number) => `📅 This week so far: ${money(amount)}`,
  recNote: "ℹ️ Counts payments made within 7 days after a reminder.",
  recNothing: "No payments after reminders yet. Send some reminders and check back soon.",
  weeklyText: (shop: string, amount: number, range: string, owed: number) =>
    `🏆 Hello ${shop}, ShopBrain recovered *${money(amount)}* for you this week (${range}) 🎉\nThis counts payments made within 7 days after a reminder.\nStill owed: ${money(owed)}`,

  // ---- export ----
  exportEmpty: "📤 You have no customers to export yet.",
  exportCaption: (n: number, date: string) => `📤 ShopBrain backup — ${n} entries (${date})`,
  exportNotConfigured: "⚠️ Export isn't set up yet. Please contact ShopBrain support.",
  exportFailed: "❌ Couldn't send the backup file. Please try again in a moment.",
};

const rw: typeof en = {
  cancelBtn: "✖️ Reka",

  addDebtPrompt:
    "➕ *Ongeraho Umwenda*\n\nAndika byose mu butumwa bumwe:\n\n`0788123456 Jean isukari 2000`\n\nNiba nta nimero?\n`Jean isukari 2000`\n\nIzina rifite amagambo abiri?:\n`Mama Janet, isukari, 2000`\n\nCyangwa ohereza nimero gusa, ndakubaza ibindi.",
  addDebtHint:
    "❌ Ntabwo nabisomye.\n\nUrugero: `0788123456 Jean isukari 2000`\nCyangwa ohereza nimero gusa.",
  debtConfirmBody: (name: string, phone: string | null, item: string, amount: number, isNew: boolean, dupName: boolean) =>
    `➕ *Ongeraho uyu mwenda?*\n\n👤 ${name}${phone ? ` (${phone})` : " — nta nimero"}\n📦 ${item}\n💰 ${money(amount)}` +
    (dupName ? `\n\n⚠️ Ufite undi mukiriya utagira nimero witwa *${name}*. Reka, wongereho ikimenyetso nka "${name} (moto)" niba ari abantu batandukanye.` : "") +
    (isNew && phone ? "\n\nKanda *Bika + kwibutsa* niba uyu mukiriya yemeye kwakira ubutumwa bwo kwibutsa kuri WhatsApp." : ""),
  debtSaveRemindersBtn: "✅ Bika + kwibutsa",
  debtSaveOnlyBtn: "💾 Bika gusa",
  debtSaveBtn: "✅ Bika",
  debtCancelled: "✖️ Umwenda ntiwongeweho.",

  markPaidPromptQuick:
    "✅ *Emeza Kwishyura*\n\nAndika nimero cyangwa izina ry'umukiriya. Ongeraho umubare niba yishyuye igice.\n\n`0788123456`\n`0788123456 2000`\n`Jean 2000`",
  payPick: (name: string) => `🔍 Hari abakiriya benshi bahuye na "${name}". Kanda umwe:`,
  payConfirmFull: (name: string, owed: number) => `✅ Emeza ko ideni rya *${name}* rya *${money(owed)}* ryishyuwe ryose?`,
  payConfirmPart: (name: string, paid: number, owed: number) =>
    `💰 Andika ko *${name}* yishyuye *${money(paid)}*?\n\nAgomba ${money(owed)} → hasigaye ${money(owed - paid)}.`,
  payYesBtn: "✅ Yego",
  payCancelled: "✖️ Nta cyanditswe.",
  payNoDebt: (name: string) => `✅ *${name}* nta deni afite.`,
  payGeneric: "Kwishyura",

  momoQuick:
    "💳 *Gushyiraho MoMo*\n\nAndika byose mu butumwa bumwe:\n\n`0788123456, NIYONZIMA ALICE, Chez Alice`\n(nimero, izina rigaragara kuri MTN, uko abakiriya bita iduka ryawe)\n\nHamwe na kode ya merchant:\n`0788123456, 123456, NIYONZIMA ALICE, Chez Alice`\n\nCyangwa ohereza nimero gusa, nzakubaza ibindi.",

  noNumberWarning: (name: string) =>
    `⚠️ *${name}* nta nimero afite, ntabwo nshobora kumwibutsa.\n\nShyiraho nimero kugira ngo mumwibutse.`,
  addNumberBtn: "✏️ Shyiraho Nimero",
  addNumberPrompt: (name: string) => `📞 Nimero ya *${name}* ni iyihe?\n\nUrugero: 0788123456`,
  addNumberInvalid: "❌ Ibyo ntibisa na nimero ya telefone. Ongera ugerageze, urugero 0788123456:",
  addNumberTaken: (other: string) => `⚠️ Iyo nimero isanzwe ari iya *${other}*. Ohereza indi nimero:`,
  addNumberSaved: (name: string, phone: string) => `✅ Nimero ya *${name}* yabitswe: ${phone}`,
  fixNumbersBtn: "✏️ Shyiraho Nimero",
  fixNumbersAsk: (n: number) => `📵 Abakiriya ${n} bagufitiye ideni nta nimero bafite, ntibashobora kwibutswa.`,
  fixNumbersPick: "Kanda umukiriya ushyireho nimero ye:",
  fixNumbersNone: "✅ Abakugomba bose bafite nimero.",
  fixNumbersSection: "Abatagira nimero",
  selectBtn: "Hitamo",

  arStatus: (on: boolean, minDays: number, cooldown: number, pendingMin: number | null) =>
    `⏰ *Kwibutsa Byikora: ${on ? "BIRIKORA ✅" : "BIHAGARITSWE"}*\n\n` +
    (pendingMin !== null ? `Bizatangira nyuma y'iminota ${pendingMin}. Kanda Reka kugira ngo ubihagarike.\n\n` : "") +
    `Iyo bikora, ShopBrain yibutsa abakiriya bakugomba, rimwe mu minsi ${cooldown} cyane. Umwenda mushya utegereza iminsi ${minDays}.\n\nHibutswa gusa abemeye kwibutswa (kandi batanditse STOP).`,
  arOnBtn: "✅ Fungura",
  arOffBtn: "⛔ Hagarika",
  arCancelBtn: "❌ Reka",
  arOffYes: "✅ Yego, hagarika",
  arOffNo: "↩️ Komeza",
  arCountdown: (n: number, skipped: string) =>
    `⏰ *Kwibutsa byikora birakora*\n\nUbutumwa buzoherezwa nyuma y'iminota 5 ku bakiriya *${n}*.${skipped ? `\n${skipped}` : ""}\n\nKanda Reka kugira ngo uhagarike.`,
  arNobody:
    "⏰ *Kwibutsa byikora birakora ✅*\n\nNta muntu ukeneye kwibutswa ubu. ShopBrain izibutsa abakiriya yonyine umwenda wabo umaze iminsi mike.",
  arCancelled: "✖️ Byahagaritswe. Kwibutsa byikora bikomeje kuba bihagaze kandi nta butumwa bwoherejwe.",
  arTooLate: "ℹ️ Ntibigishoboka guhagarika, ubutumwa bwaratangiye koherezwa. Ushobora guhagarika kwibutsa byikora muri Igenamiterere.",
  arOffAsk: "Uhagarike kwibutsa byikora? Abakiriya ntibazongera kwibutswa bwikora.",
  arNowOff: "⛔ Kwibutsa byikora byahagaritswe.",
  arKeptOn: "👍 Kwibutsa byikora bikomeje gukora.",
  arDefaultOn:
    "⏰ *Kwibutsa byikora birakora.* ShopBrain izibutsa abakiriya bakugomba. Ubihindure igihe cyose: Menu → Igenamiterere → Kwibutsa Byikora.",
  skippedSummary: (parts: string) => `Ntibibutswa: ${parts}`,
  reasonLabel: {
    no_number: "nta nimero",
    disabled: "basabye guhagarikirwa",
    no_consent: "nta bwemera",
    promise: "bahaye itariki",
    recent: "bibutswe vuba",
    too_new: "umwenda mushya",
  } as Record<string, string>,
  stSent: (n: string) => `✅ Ubutumwa bwoherejwe kuri ${n}`,
  stDelivered: (n: string) => `📬 Ubutumwa bwageze kuri ${n}`,
  stRead: (n: string) => `👀 ${n} yasomye ubutumwa`,
  stFailed: (n: string) => `❌ Ubutumwa ntibwoherejwe kuri ${n} — byanze`,
  stNotOnWa: (n: string) => `❌ Ubutumwa ntibwoherejwe kuri ${n} — nta WhatsApp afite`,
  stSkip: (n: string, why: string) => `❌ Ubutumwa ntibwoherejwe kuri ${n} — ${why}`,
  stPromise: (n: string, date: string) => `⏱ Ubutumwa ntibwoherejwe kuri ${n} — yasezeranyije kwishyura bitarenze ${date}`,
  grpSent: (n: number) => `✅ Ubutumwa bwoherejwe ku bakiriya ${n}`,
  grpNotSent: (why: string, n: number, names: string) => `❌ Ntibyoherejwe — ${why} (${n}): ${names}`,
  grpSummary: (delivered: number, read: number, failed: number, total: number) =>
    `📊 Uko byagenze: 📬 ${delivered} byageze · 👀 ${read} byasomwe · ❌ ${failed} byanze (kuri ${total})`,
  dailySummary: (sent: number, failed: number) =>
    `⏰ Kwibutsa byikora uyu munsi: ${sent} byoherejwe${failed ? ` · ${failed} byanze` : ""}`,

  custMenuBody: "👋 Muraho! Iyi ni *ShopBrain*, ifasha amaduka mugurira gucunga amafaranga atarishyurwa n'abakiriya.\n\nMushaka iki?",
  custBtnBalance: "💰 Ideni Ryanjye",
  custBtnPay: "💳 Uko Nishyura",
  custBtnStop: "🛑 Hagarika",
  custBtnPaid: "✅ Nishyuye",
  custBalanceLine: (shop: string, total: number, itemized: string) =>
    `🏪 *${shop}*\n💰 Mugomba *${money(total)}*${itemized ? `\n📦 ${itemized}` : ""}`,
  custNoDebt: "🎉 Nta deni mufite ubu. Murakoze!",
  custPayLine: (shop: string, details: string) => `🏪 *${shop}*\n💳 ${details}`,
  custNoPayDetails: (contact: string) => `Nta makuru yo kwishyura arabitswa. Mwandikire iduka kuri ${contact}.`,
  custAlreadyPaid: "Mwamaze kwishyura?",
  custPaidThanks: (shops: string) => `✅ Murakoze! Namenyesheje ${shops}. Barabyemeza.`,
  claimBody: (name: string) => `💬 *${name}* avuga ko yishyuye. Ubyandike?`,
  claimYesBtn: "✅ Andika Kwishyura",
  claimNoBtn: "Ntabwo",
  claimNoAck: "👍 Sawa, nta cyanditswe.",
  claimQueued: (name: string) => `💬 ${name} avuga ko yishyuye. Fungura Emeza Kwishyura ubyandike.`,

  recLast: (amount: number, range: string) => `🏆 *ShopBrain yagukuriye ${money(amount)}* mu cyumweru gishize (${range})`,
  recThis: (amount: number) => `📅 Iki cyumweru kugeza ubu: ${money(amount)}`,
  recNote: "ℹ️ Habarwa amafaranga yishyuwe mu minsi 7 nyuma yo kwibutswa.",
  recNothing: "Nta kwishyura kuraboneka nyuma yo kwibutsa. Ohereza ubutumwa bwo kwibutsa ugaruke vuba.",
  weeklyText: (shop: string, amount: number, range: string, owed: number) =>
    `🏆 Muraho ${shop}, ShopBrain yagukuriye *${money(amount)}* muri iki cyumweru (${range}) 🎉\nHabarwa amafaranga yishyuwe mu minsi 7 nyuma yo kwibutswa.\nAsigaye: ${money(owed)}`,

  exportEmpty: "📤 Nta bakiriya ufite bo kohereza ubu.",
  exportCaption: (n: number, date: string) => `📤 Kopi ya ShopBrain — ${n} (${date})`,
  exportNotConfigured: "⚠️ Kohereza kopi ntibirashyirwaho. Nyabuneka vugana n'ubufasha bwa ShopBrain.",
  exportFailed: "❌ Ntibyakunze kohereza dosiye. Ongera ugerageze nyuma y'akanya.",
};

export const xstrings: Record<Lang, typeof en> = { en, rw };

/* ------------------------------------------------------------------ */
/* Which reminder template + variables to use                          */
/* ------------------------------------------------------------------ */

export interface ReminderPayload {
  templateName: string;
  languageCode: string;
  vars: string[];
}

/**
 * Picks the reminder template and fills its variables. Names and layout come from
 * templateSettings.ts.
 *
 *  Payment details NOT in the message (they sit behind the "How to Pay" button):
 *     English     {{1}} customer, {{2}} shop, {{3}} total, {{4}} items, {{5}} contact
 *     Kinyarwanda same, with the contact number repeated as {{6}}
 *  Payment details inside the message (the older kind of template):
 *     English     {{1}} customer, {{2}} shop, {{3}} total, {{4}} items, {{5}} payment details, {{6}} contact
 *     Kinyarwanda same, with the contact number repeated as {{7}}
 */
export function buildReminderPayload(
  lang: Lang,
  p: {
    customerName: string;
    shopName: string;
    total: number;
    itemized: string;
    contactPhone: string;
    owner: OwnerMomoFields;
  },
): ReminderPayload {
  const totalText = p.total.toLocaleString();
  const templateName = TEMPLATE_NAMES.reminder[lang];
  if (REMINDER_INCLUDES_PAYMENT_DETAILS[lang]) {
    const momoBlock = D.buildMomoBlock(p.owner, lang);
    const vars =
      lang === "rw"
        ? [p.customerName, p.shopName, totalText, p.itemized, momoBlock, p.contactPhone, p.contactPhone]
        : [p.customerName, p.shopName, totalText, p.itemized, momoBlock, p.contactPhone];
    return { templateName, languageCode: D.metaLanguageCode(lang), vars };
  }
  const vars =
    lang === "rw"
      ? [p.customerName, p.shopName, totalText, p.itemized, p.contactPhone, p.contactPhone]
      : [p.customerName, p.shopName, totalText, p.itemized, p.contactPhone];
  return { templateName, languageCode: D.metaLanguageCode(lang), vars };
}

/* ------------------------------------------------------------------ */
/* No-number warning + "Add Number"                                    */
/* ------------------------------------------------------------------ */

/** One bubble: the warning AND the button to fix it. */
export async function sendNoNumberWarning(from: string, lang: Lang, customerId: string, name: string): Promise<void> {
  const x = xstrings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: x.noNumberWarning(name) },
    action: {
      buttons: [
        { type: "reply", reply: { id: `addnum_${customerId}`, title: x.addNumberBtn } },
        { type: "reply", reply: { id: "flow_cancel", title: x.cancelBtn } },
      ],
    },
  });
}

async function startAddNumber(from: string, lang: Lang, customerId: string): Promise<void> {
  const { data } = await supabase.from("customers").select("id, name").eq("id", customerId).eq("shop_id", from).maybeSingle();
  if (!data) return;
  D.sessions[from] = { step: "addnum_phone", data: { customerId: String(data.id), customerName: data.name } };
  await sendWhatsAppMessage(from, xstrings[lang].addNumberPrompt(data.name));
}

async function saveAddedNumber(from: string, lang: Lang, session: Session, text: string): Promise<void> {
  const x = xstrings[lang];
  const digits = text.replace(/\D/g, "");
  if (!/^\+?[\d\s\-()]+$/.test(text.trim()) || digits.length < 9 || digits.length > 13) {
    await sendWhatsAppMessage(from, x.addNumberInvalid);
    return;
  }
  const phone = D.cleanPhone(text);
  const customerId = session.data["customerId"] ?? "";
  const name = session.data["customerName"] ?? "";

  const { data: taken } = await supabase
    .from("customers")
    .select("id, name")
    .eq("shop_id", from)
    .eq("phone", phone)
    .neq("id", customerId)
    .limit(1)
    .maybeSingle();
  if (taken) {
    await sendWhatsAppMessage(from, x.addNumberTaken(taken.name));
    return;
  }

  // A new number means a fresh consent question (consent was never given for it).
  await supabase.from("customers").update({ phone, reminders_consent: false }).eq("id", customerId).eq("shop_id", from);
  D.sessions[from] = { step: "consent_existing", data: { consentCustomerId: customerId } };
  await sendWhatsAppMessage(from, x.addNumberSaved(name, phone));
  await D.askConsent(from, lang);
}

/** Lists customers who owe money but have no number, so the owner can add them one by one. */
async function showFixNumbers(from: string, lang: Lang): Promise<void> {
  const x = xstrings[lang];
  const { data } = await supabase.from("customers").select("id, name").eq("shop_id", from).is("phone", null);
  const customers = (data ?? []) as { id: string; name: string }[];
  const owing: { id: string; name: string; total: number }[] = [];
  for (const group of chunk(customers, 150)) {
    const { data: tx } = await supabase
      .from("transactions")
      .select("customer_id, amount")
      .in("customer_id", group.map((c) => c.id))
      .eq("paid", false);
    const totals = new Map<string, number>();
    for (const t of (tx ?? []) as { customer_id: string; amount: number }[]) {
      totals.set(String(t.customer_id), (totals.get(String(t.customer_id)) ?? 0) + t.amount);
    }
    for (const c of group) {
      const total = totals.get(String(c.id)) ?? 0;
      if (total > 0) owing.push({ id: c.id, name: c.name, total });
    }
  }
  if (owing.length === 0) {
    await sendWhatsAppMessage(from, x.fixNumbersNone);
    menuSoon(from, lang);
    return;
  }
  await sendWhatsAppInteractiveMessage(from, {
    type: "list",
    body: { text: x.fixNumbersPick },
    action: {
      button: x.selectBtn,
      sections: [
        {
          title: x.fixNumbersSection.slice(0, 24),
          rows: owing.slice(0, 10).map((c) => ({
            id: `addnum_${c.id}`,
            title: `📵 ${c.name}`.slice(0, 24),
            description: money(c.total).slice(0, 72),
          })),
        },
      ],
    },
  });
}

/** After Remind All: one bubble with the count and a button to fix the numbers. */
export async function sendFixNumbersPrompt(from: string, lang: Lang, count: number): Promise<void> {
  const x = xstrings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: x.fixNumbersAsk(count) },
    action: { buttons: [{ type: "reply", reply: { id: "fixnums", title: x.fixNumbersBtn } }] },
  });
}

/* ------------------------------------------------------------------ */
/* Auto-reminders                                                      */
/* ------------------------------------------------------------------ */

interface OwnerRow extends OwnerMomoFields {
  phone: string;
  name: string | null;
  language: string | null;
  contact_phone: string | null;
  is_active: boolean | null;
  auto_remind: boolean | null;
  auto_remind_start_at: string | null;
  auto_remind_last_run: string | null;
}

interface CustRow {
  id: string;
  name: string;
  phone: string | null;
  reminders_consent: boolean | null;
  last_reminded_at: string | null;
  promise_date: string | null;
}

interface DebtAgg {
  total: number;
  oldest: number;
}

type SkipReason = "no_number" | "disabled" | "no_consent" | "promise" | "recent" | "too_new";
type Verdict = { kind: "ignore" } | { kind: "send" } | { kind: "skip"; reason: SkipReason };

type RunMode = "first" | "daily";

/**
 * Decides what happens to one customer in an auto-reminder run.
 *   first  = the run 5 minutes after the owner turns it on: everyone who owes
 *   daily  = the normal daily run: also waits until the debt is 3+ days old
 * Exported so it can be tested without a database.
 */
export function classifyForAuto(
  c: { phone: string | null; reminders_consent: boolean | null; last_reminded_at: string | null; promise_date: string | null },
  agg: DebtAgg | undefined,
  optedOut: Set<string>,
  mode: RunMode,
  nowMs: number,
  today: string,
  cooldownMs: number,
): Verdict {
  if (!agg || agg.total <= 0) return { kind: "ignore" };
  if (!c.phone) return { kind: "skip", reason: "no_number" };
  if (optedOut.has(c.phone)) return { kind: "skip", reason: "disabled" };
  if (!c.reminders_consent) return { kind: "skip", reason: "no_consent" };
  if (c.promise_date && c.promise_date >= today) return { kind: "skip", reason: "promise" };
  if (c.last_reminded_at && nowMs - new Date(c.last_reminded_at).getTime() < cooldownMs) {
    return { kind: "skip", reason: "recent" };
  }
  if (mode === "daily" && nowMs - agg.oldest < AUTO_REMIND_MIN_DEBT_DAYS * DAY_MS) {
    return { kind: "skip", reason: "too_new" };
  }
  return { kind: "send" };
}

async function loadDebtors(shopId: string): Promise<{ customers: CustRow[]; agg: Map<string, DebtAgg> }> {
  const { data } = await supabase.from("customers").select("*").eq("shop_id", shopId);
  const customers = (data ?? []) as CustRow[];
  const agg = new Map<string, DebtAgg>();
  for (const group of chunk(customers.map((c) => c.id), 150)) {
    const { data: tx } = await supabase
      .from("transactions")
      .select("customer_id, amount, date")
      .in("customer_id", group)
      .eq("paid", false);
    for (const t of (tx ?? []) as { customer_id: string; amount: number; date: string }[]) {
      const id = String(t.customer_id);
      const ts = new Date(t.date).getTime();
      const cur = agg.get(id) ?? { total: 0, oldest: ts };
      cur.total += t.amount;
      if (ts < cur.oldest) cur.oldest = ts;
      agg.set(id, cur);
    }
  }
  return { customers, agg };
}

async function getOwnerRow(shopId: string): Promise<OwnerRow | null> {
  const { data } = await supabase.from("owners").select("*").eq("phone", D.cleanPhone(shopId)).maybeSingle();
  return (data as OwnerRow | null) ?? null;
}

/** Counts who would be reminded / skipped, without sending anything (for the countdown message). */
async function previewAutoRun(shopId: string): Promise<{ send: number; skipped: Map<SkipReason, number> }> {
  const { customers, agg } = await loadDebtors(shopId);
  const optedOut = await D.getOptedOutSet(customers.map((c) => c.phone ?? ""));
  const today = kigaliToday();
  const cooldownMs = D.reminderCooldownDays * DAY_MS;
  let send = 0;
  const skipped = new Map<SkipReason, number>();
  for (const c of customers) {
    const v = classifyForAuto(c, agg.get(String(c.id)), optedOut, "first", Date.now(), today, cooldownMs);
    if (v.kind === "send") send++;
    else if (v.kind === "skip") skipped.set(v.reason, (skipped.get(v.reason) ?? 0) + 1);
  }
  return { send, skipped };
}

const autoTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function showAutoRemindMenu(from: string, lang: Lang): Promise<void> {
  const x = xstrings[lang];
  const owner = await getOwnerRow(from);
  const on = !!owner?.auto_remind;
  let pendingMin: number | null = null;
  if (on && owner?.auto_remind_start_at) {
    pendingMin = Math.max(1, Math.ceil((new Date(owner.auto_remind_start_at).getTime() - Date.now()) / 60000));
  }
  const button =
    pendingMin !== null
      ? { id: "autoremind_cancel", title: x.arCancelBtn }
      : on
        ? { id: "autoremind_off", title: x.arOffBtn }
        : { id: "autoremind_on", title: x.arOnBtn };
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: x.arStatus(on, AUTO_REMIND_MIN_DEBT_DAYS, D.reminderCooldownDays, pendingMin) },
    action: { buttons: [{ type: "reply", reply: button }] },
  });
}

/** Owner taps "Turn On": tell them what will happen, wait 5 minutes, let them cancel. */
async function requestAutoRemindOn(from: string, lang: Lang): Promise<void> {
  const x = xstrings[lang];
  const shopId = D.cleanPhone(from);
  const owner = await getOwnerRow(shopId);
  if (owner?.auto_remind_start_at) {
    await showAutoRemindMenu(from, lang); // a countdown is already running
    return;
  }

  const preview = await previewAutoRun(from);
  if (preview.send === 0) {
    await supabase.from("owners").update({ auto_remind: true, auto_remind_start_at: null }).eq("phone", shopId);
    await sendWhatsAppMessage(from, x.arNobody);
    menuSoon(from, lang);
    return;
  }

  const startAt = new Date(Date.now() + AUTO_FIRST_RUN_DELAY_MS).toISOString();
  await supabase.from("owners").update({ auto_remind: true, auto_remind_start_at: startAt }).eq("phone", shopId);

  const skippedText = [...preview.skipped.entries()].map(([r, n]) => `${n} ${x.reasonLabel[r] ?? r}`).join(", ");
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: x.arCountdown(preview.send, skippedText ? x.skippedSummary(skippedText) : "") },
    action: { buttons: [{ type: "reply", reply: { id: "autoremind_cancel", title: x.arCancelBtn } }] },
  });
  scheduleFirstRun(shopId);
}

/** Starts the in-memory timer. The daily job is the backup if the server restarts in the meantime. */
function scheduleFirstRun(shopId: string): void {
  const old = autoTimers.get(shopId);
  if (old) clearTimeout(old);
  autoTimers.set(
    shopId,
    setTimeout(() => {
      autoTimers.delete(shopId);
      claimAndRunFirst(shopId).catch((err) => console.error("First auto-reminder run failed:", err));
    }, AUTO_FIRST_RUN_DELAY_MS + 2000),
  );
}

async function cancelAutoRemind(from: string, lang: Lang): Promise<void> {
  const x = xstrings[lang];
  const shopId = D.cleanPhone(from);
  const timer = autoTimers.get(shopId);
  if (timer) clearTimeout(timer);
  autoTimers.delete(shopId);
  // Only cancels if the countdown is still pending; if the run already started, it is too late.
  const { data } = await supabase
    .from("owners")
    .update({ auto_remind: false, auto_remind_start_at: null })
    .eq("phone", shopId)
    .not("auto_remind_start_at", "is", null)
    .select("phone");
  await sendWhatsAppMessage(from, data && data.length > 0 ? x.arCancelled : x.arTooLate);
  menuSoon(from, lang);
}

async function askAutoRemindOff(from: string, lang: Lang): Promise<void> {
  const x = xstrings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: x.arOffAsk },
    action: {
      buttons: [
        { type: "reply", reply: { id: "autoremind_off_yes", title: x.arOffYes } },
        { type: "reply", reply: { id: "autoremind_off_no", title: x.arOffNo } },
      ],
    },
  });
}

async function turnAutoRemindOff(from: string, lang: Lang): Promise<void> {
  await supabase.from("owners").update({ auto_remind: false, auto_remind_start_at: null }).eq("phone", D.cleanPhone(from));
  await sendWhatsAppMessage(from, xstrings[lang].arNowOff);
  menuSoon(from, lang);
}

/** New owners get auto-reminders ON by default. Called once when they finish registering. */
export async function enableAutoRemindForNewOwner(from: string, lang: Lang): Promise<void> {
  await supabase.from("owners").update({ auto_remind: true }).eq("phone", D.cleanPhone(from));
  await sendWhatsAppMessage(from, xstrings[lang].arDefaultOn);
}

/**
 * Claims the pending first run (so the timer and the backup job can never both run it),
 * then sends the reminders. Claiming = clearing auto_remind_start_at in ONE database
 * update that only succeeds for whoever gets there first.
 */
async function claimAndRunFirst(shopId: string): Promise<boolean> {
  const { data } = await supabase
    .from("owners")
    .update({ auto_remind_start_at: null })
    .eq("phone", shopId)
    .eq("auto_remind", true)
    .not("auto_remind_start_at", "is", null)
    .lte("auto_remind_start_at", new Date().toISOString())
    .select("*");
  const owner = ((data ?? []) as OwnerRow[])[0];
  if (!owner) return false; // cancelled, or someone else already claimed it
  await runAutoRemindersFor(owner, "first");
  return true;
}

/** Sends the reminders for one owner and tells them how it went (short lines). */
async function runAutoRemindersFor(owner: OwnerRow, mode: RunMode): Promise<{ sent: number; failed: number }> {
  const shopId = owner.phone;
  const lang: Lang = owner.language === "rw" ? "rw" : "en";
  const x = xstrings[lang];
  const shopName = owner.name ?? `Shop (${shopId.slice(-4)})`;
  const contactPhone = owner.contact_phone || shopId;
  const today = kigaliToday();
  const nowMs = Date.now();
  const cooldownMs = D.reminderCooldownDays * DAY_MS;

  const { customers, agg } = await loadDebtors(shopId);
  const optedOut = await D.getOptedOutSet(customers.map((c) => c.phone ?? ""));

  const toSend: CustRow[] = [];
  const skipped: { c: CustRow; reason: SkipReason }[] = [];
  for (const c of customers) {
    const v = classifyForAuto(c, agg.get(String(c.id)), optedOut, mode, nowMs, today, cooldownMs);
    if (v.kind === "send") toSend.push(c);
    else if (v.kind === "skip") skipped.push({ c, reason: v.reason });
  }

  // Few customers: one status line each. Many: grouped lines + one summary later.
  const quiet = toSend.length > AUTO_INDIVIDUAL_LIMIT;

  // "Not sent" lines are only shown for the first run (the owner just asked for it).
  // Daily runs stay quiet about skips, otherwise the same lines would repeat every day.
  if (mode === "first") await sendSkipLines(shopId, lang, skipped);

  const runStart = new Date().toISOString();
  let sent = 0;
  let failed = 0;
  for (const c of toSend) {
    const total = agg.get(String(c.id))?.total ?? 0;
    const itemized = await D.buildItemizedList(c.id);
    // BATCH 1: owner daily cap + max 2 reminders per customer per day across all shops.
    const reservation = await reserveReminder({
      ownerPhone: shopId,
      customerName: c.name,
      customerPhone: c.phone ?? "",
      amount: total,
      isAuto: true,
      quiet,
    });
    if (!reservation.ok) {
      console.warn("Auto reminder blocked:", { shopId, customer: c.phone, reason: reservation.reason });
      // Owner cap reached: stop for today. The rest are picked up by tomorrow's run.
      if (reservation.reason === "owner_daily_cap") break;
      continue;
    }
    const logRow = reservation.log;
    try {
      const payload = buildReminderPayload(lang, {
        customerName: c.name,
        shopName,
        total,
        itemized,
        contactPhone,
        owner,
      });
      const messageId = await sendWhatsAppTemplateMessage(c.phone ?? "", payload.templateName, payload.languageCode, payload.vars);
      if (logRow) await supabase.from("reminder_logs").update({ message_id: messageId }).eq("id", logRow.id);
      await supabase
        .from("customers")
        .update({ last_reminded_at: new Date().toISOString(), last_reminder_status: "pending" })
        .eq("id", c.id);
      void logActivity("reminder_sent", { ownerPhone: shopId, actor: "auto", target: c.phone ?? "" });
      sent++;
    } catch (err) {
      console.error("Auto reminder failed:", { shopId, customer: c.phone, err });
      if (logRow) await supabase.from("reminder_logs").update({ status: "failed" }).eq("id", logRow.id);
      failed++;
      if (!quiet) await sendLine(shopId, x.stFailed(c.name), { queueIfFails: true });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await supabase.from("owners").update({ auto_remind_last_run: today }).eq("phone", shopId);

  if (quiet) {
    await sendLine(shopId, x.grpSent(sent), { queueIfFails: true });
    setTimeout(() => {
      sendBigRunSummary(shopId, lang, runStart, sent).catch((err) => console.error("Auto summary failed:", err));
    }, AUTO_SUMMARY_DELAY_MS);
  } else if (mode === "daily" && (sent > 0 || failed > 0)) {
    // One short line for the day; saved for later if the owner's chat window is closed.
    await sendLine(shopId, x.dailySummary(sent, failed), { queueIfFails: true });
  }
  return { sent, failed };
}

/** The "not sent" lines for a first run: one per customer, or grouped by reason if there are many. */
async function sendSkipLines(shopId: string, lang: Lang, skipped: { c: CustRow; reason: SkipReason }[]): Promise<void> {
  const x = xstrings[lang];
  const visible = skipped.filter((s) => s.reason !== "too_new");
  if (visible.length === 0) return;

  if (visible.length <= AUTO_INDIVIDUAL_LIMIT) {
    for (const { c, reason } of visible) {
      if (reason === "promise") {
        await sendLine(shopId, x.stPromise(c.name, c.promise_date ?? ""));
      } else if (reason === "no_number") {
        // The warning and the Add Number button in the same bubble.
        await sendLine(shopId, x.stSkip(c.name, x.reasonLabel["no_number"] ?? ""), {
          button: { id: `addnum_${c.id}`, title: x.addNumberBtn },
        });
      } else {
        await sendLine(shopId, x.stSkip(c.name, x.reasonLabel[reason] ?? reason));
      }
    }
    return;
  }

  const byReason = new Map<SkipReason, string[]>();
  for (const { c, reason } of visible) byReason.set(reason, [...(byReason.get(reason) ?? []), c.name]);
  for (const [reason, names] of byReason) {
    const shown = names.slice(0, 8).join(", ") + (names.length > 8 ? ` +${names.length - 8}` : "");
    const text = x.grpNotSent(x.reasonLabel[reason] ?? reason, names.length, shown);
    await sendLine(shopId, text, reason === "no_number" ? { button: { id: "fixnums", title: x.fixNumbersBtn } } : {});
  }
}

async function sendBigRunSummary(shopId: string, lang: Lang, sinceIso: string, total: number): Promise<void> {
  const { data } = await supabase
    .from("reminder_logs")
    .select("status")
    .eq("owner_phone", shopId)
    .eq("is_auto", true)
    .gte("created_at", sinceIso);
  const rows = (data ?? []) as { status: string }[];
  const read = rows.filter((r) => r.status === "read").length;
  const delivered = rows.filter((r) => r.status === "delivered").length + read; // read messages were delivered too
  const failed = rows.filter((r) => r.status === "failed").length;
  await sendLine(shopId, xstrings[lang].grpSummary(delivered, read, failed, total), { queueIfFails: true });
}

/**
 * Called by the webhook for every delivery update of an auto reminder
 * (sent / delivered / read / failed). Sends one short line to the owner.
 * Problems are saved for later if the owner's chat window is closed;
 * routine updates are dropped in that case.
 */
export async function notifyAutoStatus(
  log: { owner_phone: string; customer_name: string },
  status: string,
  errorCode: number | undefined,
): Promise<void> {
  const lang = await D.getLang(log.owner_phone);
  const x = xstrings[lang];
  const name = log.customer_name;
  if (status === "sent") await sendLine(log.owner_phone, x.stSent(name));
  else if (status === "delivered") await sendLine(log.owner_phone, x.stDelivered(name));
  else if (status === "read") await sendLine(log.owner_phone, x.stRead(name));
  else if (status === "failed") {
    const notOnWa = errorCode === 131026 || errorCode === 470;
    await sendLine(log.owner_phone, notOnWa ? x.stNotOnWa(name) : x.stFailed(name), { queueIfFails: true });
  }
}

/**
 * The scheduled job. Ping it every few minutes (or at least once a day at ~09:00 Kigali):
 *   - a countdown that is due (backup for the in-memory timer) -> first run
 *   - otherwise, once per day between 09:00 and 18:00 Kigali time -> daily run
 */
export async function runAutoReminders(): Promise<{ owners: number; first: number; daily: number; sent: number; failed: number; skipped?: boolean }> {
  if (autoJobRunning) return { owners: 0, first: 0, daily: 0, sent: 0, failed: 0, skipped: true };
  autoJobRunning = true;
  try {
    const { data } = await supabase.from("owners").select("*").eq("auto_remind", true);
    const owners = ((data ?? []) as OwnerRow[]).filter((o) => o.is_active !== false);
    const today = kigaliToday();
    const hour = kigaliHour();
    const inWindow = hour >= DAILY_WINDOW_START_HOUR && hour < DAILY_WINDOW_END_HOUR;
    let first = 0;
    let daily = 0;
    let sent = 0;
    let failed = 0;

    for (const o of owners) {
      try {
        if (o.auto_remind_start_at) {
          // A countdown is running: only act when it is due (the timer normally handles it).
          if (new Date(o.auto_remind_start_at).getTime() <= Date.now() && (await claimAndRunFirst(o.phone))) first++;
          continue;
        }
        if (!inWindow || o.auto_remind_last_run === today) continue;
        // Claim today's run so a second ping can't run it again.
        const { data: claimed } = await supabase
          .from("owners")
          .update({ auto_remind_last_run: today })
          .eq("phone", o.phone)
          .or(`auto_remind_last_run.is.null,auto_remind_last_run.lt.${today}`)
          .select("*");
        const row = ((claimed ?? []) as OwnerRow[])[0];
        if (!row) continue;
        const r = await runAutoRemindersFor(row, "daily");
        daily++;
        sent += r.sent;
        failed += r.failed;
      } catch (err) {
        console.error("Auto reminders failed for owner:", { owner: o.phone, err });
      }
    }
    return { owners: owners.length, first, daily, sent, failed };
  } finally {
    autoJobRunning = false;
  }
}
let autoJobRunning = false;

/* ------------------------------------------------------------------ */
/* Customer side: buttons instead of typing                            */
/* ------------------------------------------------------------------ */

export type CustomerAction = "balance" | "pay" | "paid";

/**
 * Turns a tapped template button's text into an action. The words that count as
 * "paid", "pay" and "balance" are listed in templateSettings.ts (BUTTON_WORDS), so
 * whatever you wrote on your buttons works, in English or Kinyarwanda.
 */
export function classifyCustomerButton(label: string): CustomerAction | null {
  if (labelHasWord(label, BUTTON_WORDS.stop)) return null; // STOP is handled separately
  if (labelHasWord(label, BUTTON_WORDS.paid)) return "paid";
  if (labelHasWord(label, BUTTON_WORDS.pay)) return "pay";
  if (labelHasWord(label, BUTTON_WORDS.balance)) return "balance";
  return null;
}

/** True when a tapped button is the "stop reminders" button (English "stop", Kinyarwanda "hagarika"). */
export function isStopButton(label: string): boolean {
  return labelHasWord(label, BUTTON_WORDS.stop);
}

interface Target {
  shopId: string;
  customerId: string;
  customerName: string;
  shopName: string;
  lang: Lang;
  owner: OwnerRow;
  total: number;
  itemized: string;
}

/**
 * Finds the shop(s) a customer owes. When the customer tapped a button on a specific
 * reminder, WhatsApp tells us which message it was (contextId), so we answer only
 * for that shop. Otherwise we answer for every shop that has them as a customer.
 */
async function customerTargets(phone: string, contextId: string | null): Promise<Target[]> {
  let onlyShop: string | null = null;
  if (contextId) {
    const { data: log } = await supabase.from("reminder_logs").select("owner_phone").eq("message_id", contextId).maybeSingle();
    onlyShop = (log?.owner_phone as string | undefined) ?? null;
  }
  const { data } = await supabase.from("customers").select("id, name, shop_id").eq("phone", phone);
  let rows = (data ?? []) as { id: string; name: string; shop_id: string }[];
  if (onlyShop && rows.some((r) => D.cleanPhone(r.shop_id) === D.cleanPhone(onlyShop))) {
    rows = rows.filter((r) => D.cleanPhone(r.shop_id) === D.cleanPhone(onlyShop));
  }
  const targets: Target[] = [];
  for (const r of rows) {
    const owner = await getOwnerRow(r.shop_id);
    if (!owner) continue;
    const { data: tx } = await supabase.from("transactions").select("amount").eq("customer_id", r.id).eq("paid", false);
    const total = ((tx ?? []) as { amount: number }[]).reduce((s, t) => s + t.amount, 0);
    targets.push({
      shopId: r.shop_id,
      customerId: String(r.id),
      customerName: r.name,
      shopName: owner.name ?? "Shop",
      lang: owner.language === "rw" ? "rw" : "en",
      owner,
      total,
      itemized: total > 0 ? await D.buildItemizedList(r.id) : "",
    });
  }
  return targets;
}

function payDetails(t: Target): string {
  if (t.owner.momo_number) return D.buildMomoBlock(t.owner, t.lang);
  return xstrings[t.lang].custNoPayDetails(t.owner.contact_phone || t.owner.phone);
}

/** A known customer messaged the bot: show them three buttons instead of making them type. */
export async function handleCustomerMessage(from: string): Promise<boolean> {
  const phone = D.cleanPhone(from);
  const { data } = await supabase.from("customers").select("shop_id").eq("phone", phone).limit(1);
  const first = ((data ?? []) as { shop_id: string }[])[0];
  if (!first) return false;
  const owner = await getOwnerRow(first.shop_id);
  const lang: Lang = owner?.language === "rw" ? "rw" : "en";
  const x = xstrings[lang];
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: x.custMenuBody },
    action: {
      buttons: [
        { type: "reply", reply: { id: "cb_balance", title: x.custBtnBalance } },
        { type: "reply", reply: { id: "cb_pay", title: x.custBtnPay } },
        { type: "reply", reply: { id: "debtor_stop", title: x.custBtnStop } },
      ],
    },
  });
  return true;
}

const claimSeen = new Map<string, number>();

/** What happens when a customer taps My Balance / How to Pay / I've Paid. */
export async function handleCustomerAction(from: string, action: CustomerAction, contextId: string | null): Promise<void> {
  const phone = D.cleanPhone(from);
  const targets = await customerTargets(phone, contextId);
  if (targets.length === 0) return;
  const lang = targets[0]?.lang ?? "en";
  const x = xstrings[lang];
  const owing = targets.filter((t) => t.total > 0);

  if (action === "balance") {
    if (owing.length === 0) {
      await sendWhatsAppMessage(from, x.custNoDebt);
      return;
    }
    await sendWhatsAppMessage(from, owing.map((t) => x.custBalanceLine(t.shopName, t.total, t.itemized)).join("\n\n"));
    await sendCustomerFollowUp(from, lang, ["pay", "paid"]);
    return;
  }

  if (action === "pay") {
    if (owing.length === 0) {
      await sendWhatsAppMessage(from, x.custNoDebt);
      return;
    }
    await sendWhatsAppMessage(from, owing.map((t) => x.custPayLine(t.shopName, payDetails(t))).join("\n\n"));
    await sendCustomerFollowUp(from, lang, ["paid"]);
    return;
  }

  // action === "paid": tell the owner(s) so they can confirm and record it.
  if (owing.length === 0) {
    await sendWhatsAppMessage(from, x.custNoDebt);
    return;
  }
  const told: string[] = [];
  for (const t of owing) {
    told.push(t.shopName);
    const key = `${t.shopId}|${t.customerId}`;
    const last = claimSeen.get(key) ?? 0;
    if (Date.now() - last < 60 * 60 * 1000) continue; // already told them within the hour
    claimSeen.set(key, Date.now());
    await notifyPaidClaim(t);
  }
  await sendWhatsAppMessage(from, x.custPaidThanks(told.join(", ")));
}

async function sendCustomerFollowUp(from: string, lang: Lang, which: ("pay" | "paid")[]): Promise<void> {
  const x = xstrings[lang];
  const buttons = which.map((w) =>
    w === "pay"
      ? { type: "reply", reply: { id: "cb_pay", title: x.custBtnPay } }
      : { type: "reply", reply: { id: "cb_paid", title: x.custBtnPaid } },
  );
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: { text: x.custAlreadyPaid },
    action: { buttons },
  });
}

async function notifyPaidClaim(t: Target): Promise<void> {
  const x = xstrings[t.lang];
  try {
    await sendWhatsAppInteractiveMessage(t.shopId, {
      type: "button",
      body: { text: x.claimBody(t.customerName) },
      action: {
        buttons: [
          { type: "reply", reply: { id: `claimyes_${t.customerId}`, title: x.claimYesBtn } },
          { type: "reply", reply: { id: `claimno_${t.customerId}`, title: x.claimNoBtn } },
        ],
      },
    });
  } catch {
    // The owner's chat window is closed: save a plain note for the next time they open the bot.
    await queueNotice(t.shopId, x.claimQueued(t.customerName));
  }
}

/* ------------------------------------------------------------------ */
/* Payment receipts                                                    */
/* ------------------------------------------------------------------ */

/**
 * Sends the customer a receipt after a payment is recorded.
 * Needs a Meta template (names in templateSettings.ts,
 * defaults payment_receipt / payment_receipt_rw) with 4 variables:
 *   {{1}} customer name, {{2}} shop name, {{3}} amount paid, {{4}} amount still owed
 * Only sent to customers who have a number, agreed to reminders and did not reply STOP.
 * Never throws: a failed receipt must not break recording the payment.
 */
export async function sendPaymentReceipt(shopId: string, customerId: string, paid: number): Promise<boolean> {
  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, phone, reminders_consent")
      .eq("id", customerId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (!customer?.phone || !customer.reminders_consent) return false;
    if (await D.isOptedOut(customer.phone)) return false;

    const owner = await getOwnerRow(shopId);
    if (!owner) return false;
    const lang: Lang = owner.language === "rw" ? "rw" : "en";
    const { data: tx } = await supabase.from("transactions").select("amount").eq("customer_id", customerId).eq("paid", false);
    const remaining = ((tx ?? []) as { amount: number }[]).reduce((s, t) => s + t.amount, 0);

    const templateName =
      lang === "rw"
        ? TEMPLATE_NAMES.receipt.rw
        : TEMPLATE_NAMES.receipt.en;
    await sendWhatsAppTemplateMessage(customer.phone, templateName, D.metaLanguageCode(lang), [
      customer.name,
      owner.name ?? "Shop",
      paid.toLocaleString(),
      remaining.toLocaleString(),
    ]);
    return true;
  } catch (err) {
    console.error("Payment receipt not sent:", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* "ShopBrain recovered X for you" scoreboard                          */
/* ------------------------------------------------------------------ */

/**
 * Counts payments that were made within 7 days AFTER a reminder to the same customer.
 * This is "paid after being reminded", not proof that the reminder caused the payment,
 * so the messages describe it exactly that way. Pure function: easy to test.
 */
export function countRecovered(
  payments: { phone: string | null; amount: number; at: number }[],
  reminders: { phone: string; at: number }[],
  windowMs = RECOVERY_WINDOW_DAYS * DAY_MS,
): { amount: number; count: number } {
  const byPhone = new Map<string, number[]>();
  for (const r of reminders) byPhone.set(r.phone, [...(byPhone.get(r.phone) ?? []), r.at]);
  let amount = 0;
  let count = 0;
  for (const p of payments) {
    if (!p.phone) continue;
    const times = byPhone.get(p.phone);
    if (times?.some((t) => t <= p.at && p.at <= t + windowMs)) {
      amount += p.amount;
      count++;
    }
  }
  return { amount, count };
}

async function computeRecovered(
  shopId: string,
  start: Date,
  endExclusive: Date,
): Promise<{ amount: number; count: number; totalPayments: number; remindersSent: number }> {
  const payRows = await fetchAll<{ customer_id: string; amount: number; created_at: string }>((a, b) =>
    supabase
      .from("payments")
      .select("customer_id, amount, created_at")
      .eq("shop_id", shopId)
      .gte("created_at", start.toISOString())
      .lt("created_at", endExclusive.toISOString())
      .order("created_at", { ascending: true })
      .range(a, b),
  );
  const phoneById = new Map<string, string | null>();
  for (const group of chunk([...new Set(payRows.map((p) => String(p.customer_id)))], 150)) {
    const { data } = await supabase.from("customers").select("id, phone").in("id", group);
    for (const c of (data ?? []) as { id: string; phone: string | null }[]) phoneById.set(String(c.id), c.phone);
  }
  // Reminders from up to 7 days before the period still count for payments inside it.
  const remRows = await fetchAll<{ customer_phone: string; created_at: string }>((a, b) =>
    supabase
      .from("reminder_logs")
      .select("customer_phone, created_at")
      .eq("owner_phone", D.cleanPhone(shopId))
      .neq("status", "failed")
      .gte("created_at", new Date(start.getTime() - RECOVERY_WINDOW_DAYS * DAY_MS).toISOString())
      .lt("created_at", endExclusive.toISOString())
      .order("created_at", { ascending: true })
      .range(a, b),
  );
  const result = countRecovered(
    payRows.map((p) => ({ phone: phoneById.get(String(p.customer_id)) ?? null, amount: p.amount, at: new Date(p.created_at).getTime() })),
    remRows.map((r) => ({ phone: r.customer_phone, at: new Date(r.created_at).getTime() })),
  );
  const remindersSent = remRows.filter((r) => new Date(r.created_at) >= start).length;
  return { ...result, totalPayments: payRows.length, remindersSent };
}

/** The on-demand scoreboard (Menu → Money & Reports → ShopBrain Recovered). */
export async function showRecovered(from: string, lang: Lang): Promise<void> {
  const x = xstrings[lang];
  const thisMonday = mondayStartKigali(0);
  const lastMonday = mondayStartKigali(1);
  const last = await computeRecovered(from, lastMonday, thisMonday);
  const now = await computeRecovered(from, thisMonday, new Date(Date.now() + 1000));

  const lines: string[] = [];
  if (last.amount > 0) {
    lines.push(x.recLast(last.amount, formatRange(lastMonday, thisMonday)));
    lines.push(x.recThis(now.amount));
  } else if (now.amount > 0) {
    lines.push(x.recThis(now.amount));
  } else {
    lines.push(x.recNothing);
  }
  if (last.amount > 0 || now.amount > 0) lines.push("", x.recNote);
  await sendWhatsAppMessage(from, lines.join("\n"));
  menuSoon(from, lang);
}

async function totalOwed(shopId: string): Promise<number> {
  const { customers, agg } = await loadDebtors(shopId);
  return customers.reduce((sum, c) => sum + (agg.get(String(c.id))?.total ?? 0), 0);
}

/**
 * Every Monday morning: sends each owner last week's number (Monday to Monday),
 * whenever they registered. Needs a Meta template (name in templateSettings.ts)
 * with 4 variables:
 *   {{1}} shop name, {{2}} amount recovered, {{3}} date range, {{4}} total still owed
 * If the template isn't approved yet (or the send fails) the same text is saved and
 * shown the next time the owner opens the bot.
 * A shop with no reminders and no payments that week is skipped.
 */
export async function runWeeklyRecovery(): Promise<{ owners: number; sent: number; queued: number; skipped: number }> {
  const thisMonday = mondayStartKigali(0);
  const lastMonday = mondayStartKigali(1);
  const weekStart = new Date(lastMonday.getTime() + KIGALI_OFFSET_MS).toISOString().slice(0, 10);
  const range = formatRange(lastMonday, thisMonday);

  const { data } = await supabase.from("owners").select("*").not("name", "is", null);
  const owners = ((data ?? []) as OwnerRow[]).filter((o) => o.is_active !== false);
  let sent = 0;
  let queued = 0;
  let skipped = 0;

  for (const o of owners) {
    try {
      // Claim this week for this owner. A duplicate ping hits the primary key and is skipped.
      const { error } = await supabase.from("weekly_recovery_log").insert({ owner_phone: o.phone, week_start: weekStart });
      if (error) {
        skipped++;
        continue;
      }
      const week = await computeRecovered(o.phone, lastMonday, thisMonday);
      if (week.remindersSent === 0 && week.totalPayments === 0) {
        skipped++;
        continue;
      }
      const lang: Lang = o.language === "rw" ? "rw" : "en";
      const owed = await totalOwed(o.phone);
      const shop = o.name ?? "Shop";
      const templateName =
        lang === "rw"
          ? TEMPLATE_NAMES.weekly.rw
          : TEMPLATE_NAMES.weekly.en;
      try {
        await sendWhatsAppTemplateMessage(o.phone, templateName, D.metaLanguageCode(lang), [
          shop,
          week.amount.toLocaleString(),
          range,
          owed.toLocaleString(),
        ]);
        sent++;
      } catch {
        await queueNotice(o.phone, xstrings[lang].weeklyText(shop, week.amount, range, owed));
        queued++;
      }
    } catch (err) {
      console.error("Weekly recovery failed for owner:", { owner: o.phone, err });
    }
  }
  return { owners: owners.length, sent, queued, skipped };
}

/* ------------------------------------------------------------------ */
/* Backup / export                                                     */
/* ------------------------------------------------------------------ */

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** Sends the owner a CSV file (opens in Excel) with every customer and every debt entry. */
export async function exportBackup(from: string, lang: Lang): Promise<void> {
  const x = xstrings[lang];
  const customers = await fetchAll<{ id: string; name: string; phone: string | null }>((a, b) =>
    supabase.from("customers").select("id, name, phone").eq("shop_id", from).order("name", { ascending: true }).range(a, b),
  );
  if (customers.length === 0) {
    await sendWhatsAppMessage(from, x.exportEmpty);
    menuSoon(from, lang);
    return;
  }
  const byId = new Map(customers.map((c) => [String(c.id), c]));
  const rows: string[] = [["Customer", "Phone", "Item", "Amount (Frw)", "Status", "Date"].map(csvCell).join(",")];
  let entries = 0;
  for (const group of chunk(customers.map((c) => c.id), 150)) {
    const tx = await fetchAll<{ customer_id: string; item: string; amount: number; paid: boolean; date: string }>((a, b) =>
      supabase
        .from("transactions")
        .select("customer_id, item, amount, paid, date")
        .in("customer_id", group)
        .order("date", { ascending: true })
        .range(a, b),
    );
    for (const t of tx) {
      const c = byId.get(String(t.customer_id));
      const date = new Date(t.date).toLocaleString("en-GB", { timeZone: "Africa/Kigali", hour12: false });
      rows.push(
        [c?.name ?? "", c?.phone ?? "", t.item, t.amount, t.paid ? "Paid" : "Unpaid", date].map(csvCell).join(","),
      );
      entries++;
    }
  }
  const today = kigaliToday();
  try {
    // The leading \uFEFF makes Excel read Kinyarwanda/French letters correctly.
    await sendWhatsAppDocument(from, `\uFEFF${rows.join("\n")}`, `ShopBrain-backup-${today}.csv`, x.exportCaption(entries, today));
  } catch (err) {
    if (err instanceof WhatsAppNotConfiguredError) {
      console.error(
        "Export needs WHATSAPP_ACCESS_TOKEN (or WHATSAPP_TOKEN / META_ACCESS_TOKEN) and WHATSAPP_PHONE_NUMBER_ID (or PHONE_NUMBER_ID) in your environment.",
      );
      await sendWhatsAppMessage(from, x.exportNotConfigured);
    } else {
      console.error("Backup export failed:", err);
      await sendWhatsAppMessage(from, x.exportFailed);
    }
  }
  menuSoon(from, lang);
}

/* ------------------------------------------------------------------ */
/* Routers: button taps and typed answers handled by this module       */
/* ------------------------------------------------------------------ */

/** Returns true when the tap belonged to this module. */
export async function handleInteractive(from: string, id: string, lang: Lang): Promise<boolean> {
  switch (id) {
    case "autoremind_menu":
      await showAutoRemindMenu(from, lang);
      return true;
    case "autoremind_on":
      await requestAutoRemindOn(from, lang);
      return true;
    case "autoremind_cancel":
      await cancelAutoRemind(from, lang);
      return true;
    case "autoremind_off":
      await askAutoRemindOff(from, lang);
      return true;
    case "autoremind_off_yes":
      await turnAutoRemindOff(from, lang);
      return true;
    case "autoremind_off_no":
      await sendWhatsAppMessage(from, xstrings[lang].arKeptOn);
      menuSoon(from, lang);
      return true;
    case "fixnums":
      await showFixNumbers(from, lang);
      return true;
    case "recovered_btn":
      await showRecovered(from, lang);
      return true;
    case "export_btn":
      // BATCH 2: Word export. Summary first, file only after the owner taps Send.
      if (!(await sendExportSummary(from, lang))) menuSoon(from, lang);
      return true;
    case "export_send":
      await sendExportFile(from, lang);
      menuSoon(from, lang);
      return true;
    case "export_cancel":
      await sendWhatsAppMessage(from, exportCancelledText(lang));
      menuSoon(from, lang);
      return true;
  }

  if (id.startsWith("addnum_")) {
    await startAddNumber(from, lang, id.slice("addnum_".length));
    return true;
  }
  if (id.startsWith("claimyes_")) {
    const { data } = await supabase
      .from("customers")
      .select("phone")
      .eq("id", id.slice("claimyes_".length))
      .eq("shop_id", from)
      .maybeSingle();
    if (data?.phone) await D.startMarkPaid(from, data.phone, lang);
    return true;
  }
  if (id.startsWith("claimno_")) {
    await sendWhatsAppMessage(from, xstrings[lang].claimNoAck);
    menuSoon(from, lang);
    return true;
  }
  return false;
}

/** Returns true when the typed text was consumed by one of this module's flows. */
export async function handleSession(from: string, text: string, session: Session, lang: Lang): Promise<boolean> {
  if (session.step === "addnum_phone") {
    await saveAddedNumber(from, lang, session, text);
    return true;
  }
  return false;
}