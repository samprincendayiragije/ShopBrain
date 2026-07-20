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
 * Sends a pre-approved WhatsApp message template.
 * Required for messaging customers outside the 24h customer service window
 * (i.e. anyone who hasn't messaged the bot recently, or ever).
 *
 * `params` are inserted in order into the {{1}}, {{2}}, {{3}}... placeholders
 * in the template body, as configured in WhatsApp Manager.
 *
 * Example: sendWhatsAppTemplateMessage(phone, "debt_reminder", "en_US", [customerName, shopName, amount])
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
    throw new Error(`WhatsApp API error ${res.status}: ${body}`);
  }
  const data = await res.json() as { messages: Array<{ id: string }> };
  return data.messages[0].id;
}