import { Router, type IRouter, type Request, type Response } from "express";
import { sendWhatsAppMessage, sendWhatsAppInteractiveMessage } from "../lib/whatsapp.js";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const VERIFY_TOKEN =
  process.env["WHATSAPP_VERIFY_TOKEN"] ?? "ShopBrain_kigali_2026";

const OWNER_NUMBERS = ["250795120043", "250784949198", "250789128345"];

interface Session {
  step: string;
  data: Record<string, string>;
}

const sessions: Record<string, Session> = {};

function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function isOwner(from: string): boolean {
  return OWNER_NUMBERS.includes(cleanPhone(from));
}

interface WhatsAppMessage {
  from: string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
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
    const from = msg.from;

    try {
      if (msg.type === "interactive") {
        const replyId =
          msg.interactive?.button_reply?.id ||
          msg.interactive?.list_reply?.id ||
          "";
        await handleInteractive(from, replyId, req);
        continue;
      }

      if (msg.type === "text" && msg.text?.body) {
        const text = msg.text.body.trim();
        await handleMessage(from, text, req);
      }
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

async function sendMainMenu(from: string): Promise<void> {
  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: {
      text: "👋 Welcome to *ShopBrain*\nWhat would you like to do?",
    },
    action: {
      buttons: [
        { type: "reply", reply: { id: "add_debt", title: "➕ Add Debt" } },
        { type: "reply", reply: { id: "find_customer", title: "🔍 Find Customer" } },
        { type: "reply", reply: { id: "mark_paid", title: "✅ Mark as Paid" } },
      ],
    },
  });

  await sendWhatsAppMessage(from, SECURITY_TIP);
}

async function handleInteractive(
  from: string,
  replyId: string,
  req: Request
): Promise<void> {
  if (!isOwner(from)) {
    await sendWhatsAppMessage(from, "This number is for shop owner use only.");
    return;
  }

  if (replyId === "add_debt") {
    sessions[from] = { step: "add_phone", data: {} };
    await sendWhatsAppMessage(from, "➕ *Add Debt*\n\nWhat is the customer's phone number?\n\ne.g. 0788123456");
    return;
  }

  if (replyId === "find_customer") {
    sessions[from] = { step: "find_phone", data: {} };
    await sendWhatsAppMessage(from, "🔍 *Find Customer*\n\nEnter the customer's phone number:");
    return;
  }

  if (replyId === "mark_paid") {
    sessions[from] = { step: "paid_phone", data: {} };
    await sendWhatsAppMessage(from, "✅ *Mark as Paid*\n\nEnter the customer's phone number:\n\nTo mark ALL debts paid, just send the number.\nTo mark a specific amount paid, send: <number> <amount>\ne.g. 0788123456 2000");
    return;
  }

  if (replyId === "view_history") {
    const phone = sessions[from]?.data["lastPhone"];
    if (phone) {
      await showDebtHistory(from, phone);
    }
    return;
  }

  if (replyId === "send_reminder") {
    const phone = sessions[from]?.data["lastPhone"];
    if (phone) {
      await sendReminder(from, phone);
    }
    return;
  }
}

async function handleMessage(
  from: string,
  text: string,
  req: Request
): Promise<void> {
  if (!isOwner(from)) {
    await sendWhatsAppMessage(from, "This number is for shop owner use only.");
    return;
  }

  const upper = text.toUpperCase();

  // Always show menu on these keywords — clear any active session
  if (["HI", "HELLO", "MENU", "HELP", "START"].includes(upper)) {
    sessions[from] = undefined as any;
    await sendMainMenu(from);
    return;
  }

  // @all command — BEFORE session check so it always works
  if (upper === "@ALL") {
    await showAllCustomers(from);
    return;
  }

  // REMIND command — BEFORE session check so it always works
  if (upper.startsWith("REMIND ")) {
    const parts = text.split(" ");
    const phone = cleanPhone(parts[1] ?? "");
    if (phone.length < 9) {
      await sendWhatsAppMessage(from, "❌ Invalid number.\nUsage: REMIND <phone>\ne.g. REMIND 0788123456");
      return;
    }
    await sendReminder(from, phone);
    return;
  }

  // Handle active session (conversational flow)
  const session = sessions[from];

  if (session) {
    await handleSession(from, text, session, req);
    return;
  }

  // Legacy ADD command
  if (upper.startsWith("ADD ")) {
    await handleLegacyAdd(from, text);
    return;
  }

  // Legacy PAID command
  if (upper.startsWith("PAID ")) {
    await handleLegacyPaid(from, text);
    return;
  }

  // Plain phone number lookup
  const possiblePhone = cleanPhone(text);
  if (possiblePhone.length >= 9) {
    await lookupCustomer(from, possiblePhone);
    return;
  }

  await sendMainMenu(from);
}

async function handleSession(
  from: string,
  text: string,
  session: Session,
  req: Request
): Promise<void> {

  // ─── ADD DEBT FLOW ───
  if (session.step === "add_phone") {
    const phone = cleanPhone(text);
    if (phone.length < 9) {
      await sendWhatsAppMessage(from, "❌ Invalid number. Please enter a valid phone number:");
      return;
    }
    session.data["phone"] = phone;
    session.step = "add_name";

    const { data: existing } = await supabase
      .from("customers")
      .select("name")
      .eq("phone", phone)
      .eq("shop_id", from)
      .single();

    if (existing) {
      await sendWhatsAppMessage(from, `👤 Existing customer: *${existing.name}*\n\nWhat item did they take?`);
      session.data["name"] = existing.name;
      session.step = "add_item";
    } else {
      await sendWhatsAppMessage(from, "What is the customer's name?");
    }
    return;
  }

  if (session.step === "add_name") {
    session.data["name"] = text;
    session.step = "add_item";
    await sendWhatsAppMessage(from, "What item did they take?");
    return;
  }

  if (session.step === "add_item") {
    session.data["item"] = text;
    session.step = "add_amount";
    await sendWhatsAppMessage(from, "How much do they owe? (in Frw)");
    return;
  }

  if (session.step === "add_amount") {
    const amount = parseInt(text.replace(/\D/g, ""), 10);
    if (isNaN(amount) || amount <= 0) {
      await sendWhatsAppMessage(from, "❌ Invalid amount. Please enter a number e.g. 5000");
      return;
    }

    const { phone, name, item } = session.data as Record<string, string>;
    sessions[from] = undefined as any;

    let { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .eq("shop_id", from)
      .single();

    if (!customer) {
      const { data: newCustomer, error } = await supabase
        .from("customers")
        .insert({ phone, name, shop_id: from })
        .select()
        .single();

      if (error || !newCustomer) {
        await sendWhatsAppMessage(from, "❌ Failed to add customer. Try again.");
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
      await sendWhatsAppMessage(from, "❌ Failed to save transaction. Try again.");
      return;
    }

    const { data: unpaidTx } = await supabase
      .from("transactions")
      .select("amount")
      .eq("customer_id", customer.id)
      .eq("paid", false);

    const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

    await sendWhatsAppMessage(
      from,
      `✅ *Debt Saved!*\n\n👤 ${customer.name} (${phone})\n📦 Item: ${item}\n💰 Added: ${amount.toLocaleString()} Frw\n📊 Total owed: ${total.toLocaleString()} Frw`
    );

    setTimeout(async () => { await sendMainMenu(from); }, 1000);
    return;
  }

  // ─── FIND CUSTOMER FLOW ───
  if (session.step === "find_phone") {
    const phone = cleanPhone(text);
    sessions[from] = { step: "idle", data: { lastPhone: phone } };
    await lookupCustomer(from, phone);
    return;
  }

  // ─── MARK PAID FLOW ───
  if (session.step === "paid_phone") {
    const parts = text.trim().split(" ");
    const phone = cleanPhone(parts[0] ?? "");
    const partialAmount = parts[1] ? parseInt(parts[1].replace(/\D/g, ""), 10) : null;

    sessions[from] = undefined as any;

    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("phone", phone)
      .eq("shop_id", from)
      .single();

    if (!customer) {
      await sendWhatsAppMessage(from, `❌ No customer found for ${text}.`);
      await sendMainMenu(from);
      return;
    }

    if (partialAmount && !isNaN(partialAmount)) {
      await applyPartialPayment(from, customer, partialAmount);
    } else {
      await supabase
        .from("transactions")
        .update({ paid: true })
        .eq("customer_id", customer.id)
        .eq("paid", false);

      await sendWhatsAppMessage(from, `✅ All debts marked as paid for *${customer.name}*.`);
    }

    setTimeout(async () => { await sendMainMenu(from); }, 1000);
    return;
  }
}

async function sendReminder(from: string, phone: string): Promise<void> {
  const { data: owner } = await supabase
    .from("owners")
    .select("name")
    .eq("phone", cleanPhone(from))
    .single();

  const shopName = owner?.name ?? `Shop (${from.slice(-4)})`;

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("phone", phone)
    .eq("shop_id", from)
    .single();

  if (!customer) {
    await sendWhatsAppMessage(from, `❌ No customer found for ${phone}.`);
    return;
  }

  const { data: unpaidTx } = await supabase
    .from("transactions")
    .select("amount")
    .eq("customer_id", customer.id)
    .eq("paid", false);

  const total = (unpaidTx ?? []).reduce(
    (sum: number, t: { amount: number }) => sum + t.amount,
    0
  );

  if (total === 0) {
    await sendWhatsAppMessage(from, `✅ ${customer.name} has no outstanding debts. No reminder sent.`);
    return;
  }

  const reminderMessage =
    `👋 Muraho *${customer.name}*,\n\n` +
    `*${shopName}* bakwibutsa ko ufite umwenda wa *${total.toLocaleString()} Frw*.\n` +
    `Nyamuneka gerageza kwishyura igihe cyose bishoboka.\n\n` +
    `---\n\n` +
    `Hello *${customer.name}*,\n\n` +
    `This is a friendly reminder from *${shopName}* that you have an outstanding balance of *${total.toLocaleString()} Frw*.\n` +
    `Please settle this at your earliest convenience.\n\n` +
    `Thank you! 🙏`;

  await sendWhatsAppMessage(phone, reminderMessage);

  await sendWhatsAppMessage(
    from,
    `✅ *Reminder sent!*\n\n👤 ${customer.name}\n📞 ${phone}\n💰 Amount: ${total.toLocaleString()} Frw`
  );

  setTimeout(async () => { await sendMainMenu(from); }, 1000);
}

async function applyPartialPayment(
  from: string,
  customer: { id: string; name: string; phone: string },
  paymentAmount: number
): Promise<void> {
  const { data: unpaidTx } = await supabase
    .from("transactions")
    .select("*")
    .eq("customer_id", customer.id)
    .eq("paid", false)
    .order("date", { ascending: true });

  if (!unpaidTx || unpaidTx.length === 0) {
    await sendWhatsAppMessage(from, `✅ ${customer.name} has no outstanding debts.`);
    return;
  }

  const totalBefore = unpaidTx.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

  if (paymentAmount >= totalBefore) {
    await supabase
      .from("transactions")
      .update({ paid: true })
      .eq("customer_id", customer.id)
      .eq("paid", false);

    await sendWhatsAppMessage(
      from,
      `✅ *Full payment received!*\n\n👤 ${customer.name}\n💰 Paid: ${paymentAmount.toLocaleString()} Frw\n📊 Remaining: 0 Frw`
    );
    return;
  }

  let remaining = paymentAmount;
  for (const tx of unpaidTx) {
    if (remaining <= 0) break;
    if (remaining >= tx.amount) {
      await supabase.from("transactions").update({ paid: true }).eq("id", tx.id);
      remaining -= tx.amount;
    } else {
      await supabase.from("transactions").update({ amount: tx.amount - remaining }).eq("id", tx.id);
      remaining = 0;
    }
  }

  const totalAfter = totalBefore - paymentAmount;

  await sendWhatsAppMessage(
    from,
    `✅ *Partial payment recorded!*\n\n👤 ${customer.name}\n💰 Paid: ${paymentAmount.toLocaleString()} Frw\n📊 Remaining: ${totalAfter.toLocaleString()} Frw`
  );
}

async function lookupCustomer(from: string, phone: string): Promise<void> {
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("phone", phone)
    .eq("shop_id", from)
    .single();

  if (!customer) {
    await sendWhatsAppMessage(from, `❌ No record found for ${phone}.`);
    await sendMainMenu(from);
    return;
  }

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .eq("customer_id", customer.id)
    .order("date", { ascending: false });

  const unpaid = (transactions ?? []).filter((t: { paid: boolean }) => !t.paid);
  const totalOwed = unpaid.reduce(
    (sum: number, t: { amount: number }) => sum + t.amount,
    0
  );
  const lastTx = transactions?.[0];
  const lastDate = lastTx
    ? new Date(lastTx.date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : "N/A";

  sessions[from] = { step: "idle", data: { lastPhone: phone } };

  await sendWhatsAppMessage(
    from,
    `👤 *${customer.name}*\n📞 ${phone}\n📦 Last item: ${lastTx?.item ?? "N/A"}\n💰 Total owed: ${totalOwed.toLocaleString()} Frw\n📅 Last visit: ${lastDate}`
  );

  await sendWhatsAppInteractiveMessage(from, {
    type: "button",
    body: {
      text: "What would you like to do?",
    },
    action: {
      buttons: [
        { type: "reply", reply: { id: "view_history", title: "📋 View History" } },
        { type: "reply", reply: { id: "send_reminder", title: "🔔 Send Reminder" } },
        { type: "reply", reply: { id: "mark_paid", title: "✅ Mark as Paid" } },
      ],
    },
  });
}

async function showDebtHistory(from: string, phone: string): Promise<void> {
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("phone", phone)
    .eq("shop_id", from)
    .single();

  if (!customer) {
    await sendWhatsAppMessage(from, "❌ Customer not found.");
    return;
  }

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .eq("customer_id", customer.id)
    .order("date", { ascending: false });

  if (!transactions || transactions.length === 0) {
    await sendWhatsAppMessage(from, `📋 No transactions found for ${customer.name}.`);
    await sendMainMenu(from);
    return;
  }

  const lines = transactions.map((t: { item: string; amount: number; paid: boolean; date: string }) => {
    const date = new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const status = t.paid ? "✅ Paid" : "❌ Unpaid";
    return `• ${t.item} — ${t.amount.toLocaleString()} Frw — ${date} — ${status}`;
  });

  const unpaid = transactions.filter((t: { paid: boolean }) => !t.paid);
  const total = unpaid.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

  await sendWhatsAppMessage(
    from,
    `📋 *Debt History — ${customer.name}*\n\n${lines.join("\n")}\n\n💰 *Total owed: ${total.toLocaleString()} Frw*`
  );

  setTimeout(async () => { await sendMainMenu(from); }, 1000);
}

async function showAllCustomers(from: string): Promise<void> {
  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq("shop_id", from)
    .order("created_at", { ascending: true });

  if (!customers || customers.length === 0) {
    await sendWhatsAppMessage(from, "📋 You have no registered customers yet.");
    await sendMainMenu(from);
    return;
  }

  const lines: string[] = [];

  for (const customer of customers) {
    const { data: unpaidTx } = await supabase
      .from("transactions")
      .select("amount")
      .eq("customer_id", customer.id)
      .eq("paid", false);

    const total = (unpaidTx ?? []).reduce(
      (sum: number, t: { amount: number }) => sum + t.amount,
      0
    );

    const date = new Date(customer.created_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });

    const debtStatus = total > 0 ? `${total.toLocaleString()} Frw` : "Cleared ✅";
    lines.push(`👤 *${customer.name}*\n📞 ${customer.phone}\n💰 Owes: ${debtStatus}\n📅 Registered: ${date}`);
  }

  const chunkSize = 5;
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);
    const header = i === 0
      ? `📋 *All Customers (${customers.length})*\n\n`
      : `📋 *Continued...*\n\n`;
    await sendWhatsAppMessage(from, header + chunk.join("\n\n"));
  }

  setTimeout(async () => { await sendMainMenu(from); }, 1000);
}

// Legacy ADD command
async function handleLegacyAdd(from: string, text: string): Promise<void> {
  const parts = text.split(" ");
  if (parts.length < 5) {
    await sendWhatsAppMessage(
      from,
      "Format: ADD <phone> <name> <item> <amount>\ne.g. ADD 0788123456 Jean iPhone11screen 5000"
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

  let { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("phone", phone)
    .eq("shop_id", from)
    .single();

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

  const { data: unpaidTx } = await supabase
    .from("transactions")
    .select("amount")
    .eq("customer_id", customer.id)
    .eq("paid", false);

  const total = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

  await sendWhatsAppMessage(
    from,
    `✅ Saved: ${name} (${phone})\nItem: ${item}\nAdded: ${amount.toLocaleString()} Frw\nTotal owed: ${total.toLocaleString()} Frw`
  );
}

// Legacy PAID command
async function handleLegacyPaid(from: string, text: string): Promise<void> {
  const parts = text.split(" ");
  const phone = cleanPhone(parts[1] ?? "");
  const partialAmount = parts[2] ? parseInt(parts[2].replace(/\D/g, ""), 10) : null;

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

  if (partialAmount && !isNaN(partialAmount)) {
    await applyPartialPayment(from, customer, partialAmount);
  } else {
    await supabase
      .from("transactions")
      .update({ paid: true })
      .eq("customer_id", customer.id)
      .eq("paid", false);

    await sendWhatsAppMessage(from, `✅ Marked all debts paid for *${customer.name}*.`);
  }
}

export default router;