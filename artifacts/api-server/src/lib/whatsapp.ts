import {
  templateName,
  templateLanguageCode,
  type TemplateKind,
  type TemplateLang,
} from "./templateSettings";

const PHONE_NUMBER_ID = process.env["WHATSAPP_PHONE_NUMBER_ID"];
const ACCESS_TOKEN = process.env["WHATSAPP_ACCESS_TOKEN"];
if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
  throw new Error(
    "WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are required",
  );
}
export async function sendWhatsAppMessage(
  to: string,
  text: string,
): Promise<string> {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${body}`);
  }
  const data = await res.json() as { messages: Array<{ id: string }> };
  return data.messages[0].id;
}
export async function sendWhatsAppInteractiveMessage(
  to: string,
  interactive: object,
): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${body}`);
  }
}

/**
 * Marks an incoming message as read (blue checkmarks) and shows the
 * "typing..." indicator to the sender while the bot works on its reply.
 * `messageId` is the WhatsApp message id of the incoming message (msg.id
 * from the webhook payload) — NOT the reply we're about to send.
 *
 * Fire-and-forget by design: callers should not await-block their reply on
 * this, and a failure here should never stop the bot from actually
 * responding. Swallow errors internally rather than throwing.
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
  try {
    const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      }),
    });
  } catch {
    // Never let a failed read-receipt/typing-indicator call block or crash
    // message handling — this is a UX nicety, not a critical path.
  }
}

/**
 * Meta rejects a template variable (error 132018 / 132000) when it:
 *   - contains a new line or tab
 *   - contains 4 or more spaces in a row
 *   - is empty
 *   - is longer than 1024 characters
 * Every template param goes through this, so callers don't have to care.
 *   "sugar 2000\nbread 500"  ->  "sugar 2000 | bread 500"
 */
function cleanTemplateParam(value: unknown): string {
  let s = String(value ?? "")
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\t/g, " ").trim())
    .filter((line) => line.length > 0)
    .join(" | ");
  s = s.replace(/ {2,}/g, " ").trim();
  if (s.length > 1000) s = s.slice(0, 997) + "...";
  return s.length > 0 ? s : "-";
}

/**
 * Meta error 132001 = "template does not exist in this language". It is the
 * error you get when the language code we send ("rw") is not the code the
 * template is registered under ("rw_RW"), or the other way round. Nothing is
 * sent when this happens, so it is safe to retry once with the other code.
 */
const ALTERNATE_LANGUAGE_CODE: Record<string, string> = {
  rw: "rw_RW",
  rw_RW: "rw",
  en: "en_US",
  en_US: "en",
};

/** Remembers which language code actually worked, so later sends skip the failed try. */
const workingLanguageCode = new Map<string, string>();

interface TemplateAttempt {
  ok: boolean;
  status: number;
  body: string;
  metaCode?: number;
  messageId?: string;
}

/** One raw call to Meta. Never throws on an HTTP error, it reports it. */
async function postTemplate(
  to: string,
  name: string,
  languageCode: string,
  params: string[],
): Promise<TemplateAttempt> {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

  const template: {
    name: string;
    language: { code: string };
    components?: object[];
  } = {
    name,
    language: { code: languageCode },
  };
  if (params.length > 0) {
    template.components = [
      {
        type: "body",
        parameters: params.map((p) => ({
          type: "text",
          text: cleanTemplateParam(p),
        })),
      },
    ];
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template,
    }),
  });

  const body = await res.text();

  if (!res.ok) {
    let metaCode: number | undefined;
    try {
      metaCode = (JSON.parse(body) as { error?: { code?: number } }).error?.code;
    } catch {
      // body wasn't JSON, leave metaCode undefined
    }
    return { ok: false, status: res.status, body, metaCode };
  }

  let messageId: string | undefined;
  try {
    messageId = (JSON.parse(body) as { messages?: Array<{ id: string }> }).messages?.[0]?.id;
  } catch {
    // fall through
  }
  if (!messageId) {
    return { ok: false, status: res.status, body: `No message id in response: ${body}` };
  }
  return { ok: true, status: res.status, body, messageId };
}

/**
 * Sends a pre-approved WhatsApp message template.
 * Required for messaging customers outside the 24h customer service window
 * (i.e. anyone who hasn't messaged the bot recently, or ever).
 *
 * `params` are inserted in order into the {{1}}, {{2}}, {{3}}... placeholders
 * in the template body, as configured in WhatsApp Manager. The number of
 * params MUST equal the number of placeholders in that template, or Meta
 * rejects it with error 132000.
 *
 * Quick-reply buttons (I've paid / My balance / How to pay / Stop) are part of
 * the approved template itself and need nothing extra here.
 *
 * `languageCode` should match the language the template is registered under
 * in WhatsApp Manager. If Meta answers 132001 (wrong language code), this
 * retries once with the sibling code (rw <-> rw_RW, en <-> en_US) and
 * remembers whichever one worked.
 *
 * Returns the WhatsApp message id (wamid). The sent / delivered / read
 * status callbacks that arrive on the webhook carry this same id, so store it
 * against the reminder when you log it.
 */
export async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  params: string[],
): Promise<string> {
  const cacheKey = `${templateName}|${languageCode}`;
  const firstCode = workingLanguageCode.get(cacheKey) ?? languageCode;

  let attempt = await postTemplate(to, templateName, firstCode, params);
  let usedCode = firstCode;

  if (!attempt.ok && attempt.metaCode === 132001) {
    const alt = ALTERNATE_LANGUAGE_CODE[firstCode];
    if (alt) {
      console.warn(
        `[template] "${templateName}" has no "${firstCode}" version (132001). Retrying with "${alt}".`,
      );
      const retry = await postTemplate(to, templateName, alt, params);
      // If the retry also says 132001, the first error is the more useful one to report.
      if (retry.ok || retry.metaCode !== 132001) {
        attempt = retry;
        usedCode = alt;
        if (retry.ok) {
          workingLanguageCode.set(cacheKey, alt);
          console.warn(
            `[template] "${templateName}" worked with language code "${alt}". Set that code in templateSettings.ts so it is right from the first try.`,
          );
        }
      }
    }
  }

  if (!attempt.ok) {
    // Logged here too, in case a caller swallows the thrown error. The Meta
    // error code in this line (132000, 132001, 132018, 131042, 131047...)
    // tells you exactly what is wrong.
    console.error(
      `[template] "${templateName}" (${usedCode}) to ${to} failed, ${attempt.status}, ${params.length} params: ${attempt.body}`,
    );
    throw new Error(
      `WhatsApp template "${templateName}" (${usedCode}) failed, ${attempt.status}: ${attempt.body}`,
    );
  }

  return attempt.messageId as string;
}

/**
 * Sends a template by kind ("reminder" | "receipt" | "weekly") and language
 * ("en" | "rw"). The template name AND its language code both come from
 * templateSettings.ts, so changing a template only ever means editing that file.
 *
 * Example: sendWhatsAppTemplateByKind(phone, "receipt", "rw", [a, b, c, d])
 */
export async function sendWhatsAppTemplateByKind(
  to: string,
  kind: TemplateKind,
  lang: TemplateLang,
  params: string[],
): Promise<string> {
  return sendWhatsAppTemplateMessage(
    to,
    templateName(kind, lang),
    templateLanguageCode(kind, lang),
    params,
  );
}