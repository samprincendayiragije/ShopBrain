import { Router, type IRouter, type Request, type Response } from "express";
import { sendWhatsAppMessage } from "../lib/whatsapp.js";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const VERIFY_TOKEN =
  process.env["WHATSAPP_VERIFY_TOKEN"] ?? "ShopBrain_kigali_2026";

const OWNER_NUMBERS = [
  "250793197687",
  "250790581431",
  "250786260484",
  "250795120043",
];

function isOwner(phone: string): boolean {
  const clean = phone.replace(/\D/g, "");
  return OWNER_NUMBERS.some((n) => clean.endsWith(n.slice(-10)));
}

function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

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
      await sendWhatsAppMessage(
        from,
        "Sorry, something went wrong. Please try again."
      );
    }
  }
});

const SECURITY_TIP = `🔒 *Security Tip — Protect your data:*

Lock this ShopBrain chat so only you can open it.

*How to do it:*
1. Long press this chat in your WhatsApp inbox
2. Tap the lock icon 🔒
3. It will now require your fingerprint or Face ID to open

Your customer data stays private even if someone picks up your phone.`;

async function handleMessage(
  from: string,
  text: string,
  req: Request,
): Promise<void> {
  req.log.info({ from_raw: from, from_cleaned: cleanPhone(from) }, "handleMessage called");

  // Only the owner can talk to ShopBrain
  if (!isOwner(from)) {
    await sendWhatsAppMessage(
      from,
      "This number is for shop owner use only.",
    );
    return;
  }

  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();

  // HELP / MENU
  if (["HI", "HELLO", "MENU", "HELP"].includes(upper)) {
    await sendWhatsAppMessage(
      from,
      `ShopBrain commands:

📱 Send a phone number (e.g. 0788123456) — get customer info

➕ ADD <phone> <name> <item> <amount>
e.g. ADD 0788123456 Jean iPhone11screen 5000

✅ PAID <phone> — mark customer as fully paid`,
    );

    await sendWhatsAppMessage(from, SECURITY_TIP);
    return;
  }

  // ADD command
  if (upper.startsWith("ADD ")) {
    const parts = trimmed.split(" ");
    if (parts.length < 5) {
      await sendWhatsAppMessage(
        from,
        "Format: ADD <phone> <name> <item> <amount>\ne.g. ADD 0788123456 Jean iPhone11screen 5000",
      );
      return;
    }

    const phone = cleanPhone(parts[1]!);
    const name = parts[2]!;
    const item = parts[3]!;
    const amount = parseInt(parts[4]!, 10);

    if (isNaN(amount)) {
      await sendWhatsAppMessage(from, "Amount must be a number.");
      return;
    }

    // Find or create customer
    let { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .eq("shop_id", from)
      .single();

    // Track whether this is a brand new customer
    const isNewCustomer = !customer;

    if (!customer) {
      const { data: newCustomer, error } = await supabase
        .from("customers")
        .insert({ phone, name, shop_id: from })
        .select()
        .single();

      if (error || !newCustomer) {
        await sendWhatsAppMessage(from, "Failed to add customer. Try again.");
        return;
      }
      customer = newCustomer;
    }

    const { error: txError } = await supabase.from("transactions").insert({
      customer_id: customer.id,
      item,
      amount,
      paid: false,
    });

    if (txError) {
      await sendWhatsAppMessage(from, "Failed to save transaction. Try again.");
      return;
    }

    await sendWhatsAppMessage(
      from,
      `✅ Saved: ${name} (${phone})\nItem: ${item}\nOwes: ${amount.toLocaleString()} Frw`,
    );

    // Send security tip only the very first time the owner adds any customer
    if (isNewCustomer) {
      const { count } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", from);

      if (count === 1) {
        await sendWhatsAppMessage(from, SECURITY_TIP);
      }
    }

    return;
  }

  // PAID command
  if (upper.startsWith("PAID ")) {
    const parts = trimmed.split(" ");
    const phone = cleanPhone(parts[1] ?? "");

    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .eq("shop_id", from)
      .single();

    if (!customer) {
      await sendWhatsAppMessage(from, "Customer not found.");
      return;
    }

    await supabase
      .from("transactions")
      .update({ paid: true })
      .eq("customer_id", customer.id)
      .eq("paid", false);

    await sendWhatsAppMessage(from, `✅ Marked all debts paid for ${customer.name}.`);
    return;
  }

  // Plain phone number lookup
  const possiblePhone = cleanPhone(trimmed);
  if (possiblePhone.length >= 9) {
    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", possiblePhone)
      .eq("shop_id", from)
      .single();

    if (!customer) {
      await sendWhatsAppMessage(
        from,
        `No record found for ${trimmed}.\nUse: ADD ${trimmed} <name> <item> <amount>`,
      );
      return;
    }

    const { data: transactions } = await supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", customer.id)
      .order("date", { ascending: false });

    const unpaid = (transactions ?? []).filter(
      (t: { paid: boolean }) => !t.paid,
    );
    const totalOwed = unpaid.reduce(
      (sum: number, t: { amount: number }) => sum + t.amount,
      0,
    );
    const lastTx = transactions?.[0];

    const lastDate = lastTx
      ? new Date(lastTx.date).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })
      : "N/A";

    await sendWhatsAppMessage(
      from,
      `👤 ${customer.name}\n📦 Last item: ${lastTx?.item ?? "N/A"}\n💰 Owes: ${totalOwed.toLocaleString()} Frw\n📅 Last visit: ${lastDate}`,
    );
    return;
  }

  await sendWhatsAppMessage(
    from,
    "Send a phone number to look up a customer, or type MENU for commands.",
  );
}

export default router;