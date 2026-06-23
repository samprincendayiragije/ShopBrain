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
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${body}`);
  }
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