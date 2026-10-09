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
 * Sends a pre-approved WhatsApp message template.
 * Required for messaging customers outside the 24h customer service window
 * (i.e. anyone who hasn't messaged the bot recently, or ever).
 *
 * `params` are inserted in order into the {{1}}, {{2}}, {{3}}... placeholders
 * in the template body, as configured in WhatsApp Manager.
 *
 * `languageCode` MUST match the language the template is registered under in
 * WhatsApp Manager ("en", "rw", "en_US"...), otherwise Meta rejects it with
 * error 132001. Prefer sendWhatsAppTemplateByKind below, which looks the name
 * and code up in templateSettings.ts so they can never drift apart.
 */
export async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  params: string[],
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
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: params.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `WhatsApp template "${templateName}" (${languageCode}) failed, ${res.status}: ${body}`,
    );
  }
  const data = await res.json() as { messages: Array<{ id: string }> };
  return data.messages[0].id;
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