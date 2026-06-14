import { Router, type IRouter, type Request, type Response } from "express";
import { openai } from "../lib/openai.js";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";

const router: IRouter = Router();

const VERIFY_TOKEN =
  process.env["WHATSAPP_VERIFY_TOKEN"] ?? "ShopBrain_kigali_2026";

const SYSTEM_PROMPT = `You are ShopBrain, a helpful WhatsApp shopping assistant. 
You help customers with product inquiries, order status questions, pricing, and general shopping support.
Be concise, friendly, and professional. Keep replies under 300 characters when possible.
If you don't know something specific (like a real order number or live inventory), say so honestly and offer to connect them with a human agent.
Do not use markdown formatting — plain text only, since this is WhatsApp.`;

const MAIN_MENU = `Welcome to ShopBrain! 🛍️

Reply with a number:
1 - Browse products
2 - Track my order
3 - Pricing & deals
4 - Contact support
5 - Ask anything else`;

const MENU_RESPONSES: Record<string, string> = {
  "1": "🛍️ Our product catalogue is available at our website. What type of product are you looking for? I can help answer questions about it.",
  "2": "📦 To track your order, please share your order number (e.g. ORD-12345) and I'll look into it for you.",
  "3": "💰 We offer competitive pricing and frequent deals. Ask me about a specific product and I'll share current pricing.",
  "4": "🙋 Our support team is available Mon–Fri, 8am–6pm EAT. You can also email support@shopbrain.com or reply here and I'll help.",
};

interface WhatsAppMessage {
  from: string;
  text?: { body: string };
  type: string;
}

interface WebhookBody {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppMessage[];
      };
    }>;
  }>;
}

router.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    req.log.info("WhatsApp webhook verified");
    res.status(200).send(challenge);
  } else {
    req.log.warn({ token }, "Webhook verification failed — wrong token");
    res.status(403).send("Forbidden");
  }
});

router.post("/webhook", async (req: Request, res: Response) => {
  const body = req.body as WebhookBody;

  if (body.object !== "whatsapp_business_account") {
    res.sendStatus(404);
    return;
  }

  res.sendStatus(200);

  const messages =
    body.entry
      ?.flatMap((e) => e.changes ?? [])
      .flatMap((c) => c.value?.messages ?? []) ?? [];

  for (const msg of messages) {
    if (msg.type !== "text" || !msg.text?.body) continue;

    const from = msg.from;
    const text = msg.text.body.trim();

    try {
      await handleMessage(from, text, req);
    } catch (err) {
      req.log.error({ err, from }, "Failed to handle message");
    }
  }
});

async function handleMessage(
  from: string,
  text: string,
  req: Request,
): Promise<void> {
  const lower = text.toLowerCase();

  if (["hi", "hello", "hey", "start", "menu", "0"].includes(lower)) {
    await sendWhatsAppMessage(from, MAIN_MENU);
    return;
  }

  if (MENU_RESPONSES[text]) {
    await sendWhatsAppMessage(from, MENU_RESPONSES[text]!);
    return;
  }

  req.log.info({ from, text }, "Sending AI reply");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
  });

  const reply =
    completion.choices[0]?.message?.content?.trim() ??
    "Sorry, I couldn't process your message. Please try again or type 'menu' to see options.";

  await sendWhatsAppMessage(from, reply);
}

export default router;
