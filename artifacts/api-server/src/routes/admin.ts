import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"];

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

// Constant-time password compare (a plain !== leaks timing information).
function safeEqual(a: string | undefined, b: string): boolean {
  if (typeof a !== "string") return false;
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

// Simple in-memory brake on wrong passwords: 8 failures per IP per 15 minutes.
// (Enough to stop guessing; restarts reset it, which is fine for a single server.)
const FAIL_LIMIT = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const fails = new Map<string, { n: number; resetAt: number }>();

function isBlocked(ip: string): boolean {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() > f.resetAt) {
    fails.delete(ip);
    return false;
  }
  return f.n >= FAIL_LIMIT;
}
function noteFail(ip: string): void {
  const f = fails.get(ip);
  if (!f || Date.now() > f.resetAt) fails.set(ip, { n: 1, resetAt: Date.now() + FAIL_WINDOW_MS });
  else f.n++;
}

// Every /admin/* route below (except /admin/verify) requires this header,
// set to the same ADMIN_PASSWORD. The frontend keeps the password in
// sessionStorage after login and sends it on every admin API call.
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ ok: false, message: "ADMIN_PASSWORD not configured on server." });
    return;
  }
  const ip = req.ip ?? "unknown";
  if (isBlocked(ip)) {
    res.status(429).json({ ok: false, message: "Too many attempts. Try again in a few minutes." });
    return;
  }
  if (!safeEqual(req.header("x-admin-password"), ADMIN_PASSWORD)) {
    noteFail(ip);
    res.status(401).json({ ok: false, message: "Unauthorized." });
    return;
  }
  next();
}

router.post("/admin/verify", (req: Request, res: Response) => {
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ ok: false, message: "ADMIN_PASSWORD not configured on server." });
    return;
  }
  const ip = req.ip ?? "unknown";
  if (isBlocked(ip)) {
    res.status(429).json({ ok: false, message: "Too many attempts. Try again in a few minutes." });
    return;
  }
  const { password } = req.body as { password?: string };
  if (!safeEqual(password, ADMIN_PASSWORD)) {
    noteFail(ip);
    res.status(401).json({ ok: false, message: "Invalid password." });
    return;
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000; // UTC+2, no daylight saving
const kigaliDay = (ts: number) => new Date(ts + KIGALI_OFFSET_MS).toISOString().slice(0, 10);

// Reads every row of a table in pages of 1000 (Supabase returns at most 1000 per request).
async function fetchAll<T = any>(table: string, cols: string, apply?: (q: any) => any, orderBy = "id"): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 500; page++) {
    const from = page * 1000;
    let q: any = supabase.from(table).select(cols).order(orderBy, { ascending: true }).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function countRows(table: string, apply?: (q: any) => any): Promise<number> {
  let q: any = supabase.from(table).select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

// Owners who finished onboarding and have not been switched off.
// (is_active can be null on old rows, so null counts as active.)
const activeOwnersFilter = (q: any) => q.not("name", "is", null).or("is_active.is.null,is_active.eq.true");

// ---------------------------------------------------------------------------
// PUBLIC: totals for the marketing site (no names, no phones, nothing personal)
// GET /api/public/stats
// ---------------------------------------------------------------------------

let publicCache: { at: number; body: Record<string, unknown> } | null = null;
const PUBLIC_CACHE_MS = 5 * 60 * 1000;

router.get("/public/stats", async (_req: Request, res: Response) => {
  // Open to any website because it only returns anonymous totals.
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "public, max-age=300");

  if (publicCache && Date.now() - publicCache.at < PUBLIC_CACHE_MS) {
    res.json(publicCache.body);
    return;
  }

  try {
    const now = Date.now();
    const since30 = new Date(now - 30 * DAY_MS).toISOString();

    const [ownerRows, custRows, payments, unpaid, tx30, rSent, rDelivered, rRead, rFailed] = await Promise.all([
      fetchAll<{ phone: string; name: string | null; created_at: string; is_active: boolean | null }>("owners", "phone, name, created_at, is_active", undefined, "phone"),
      fetchAll<{ id: string; shop_id: string }>("customers", "id, shop_id"),
      fetchAll<{ amount: number; created_at: string; shop_id: string }>("payments", "amount, created_at, shop_id"),
      fetchAll<{ amount: number }>("transactions", "amount", (q) => q.eq("paid", false)),
      fetchAll<{ customer_id: string }>("transactions", "customer_id", (q) => q.gte("date", since30)),
      countRows("reminder_logs", (q) => q.eq("status", "sent")),
      countRows("reminder_logs", (q) => q.eq("status", "delivered")),
      countRows("reminder_logs", (q) => q.eq("status", "read")),
      countRows("reminder_logs", (q) => q.eq("status", "failed")),
    ]);

    // shops that finished onboarding and are not switched off
    const liveShops = ownerRows.filter((o) => o.name && o.is_active !== false);
    const liveSet = new Set(liveShops.map((o) => o.phone));
    const shops30 = liveShops.filter((o) => now - new Date(o.created_at).getTime() <= 30 * DAY_MS).length;
    const since = liveShops.reduce<string | null>((m, o) => (!m || o.created_at < m ? o.created_at : m), null);

    // money
    let collected = 0, collected30 = 0;
    const dayMap = new Map<string, number>();
    for (let i = 13; i >= 0; i--) dayMap.set(kigaliDay(now - i * DAY_MS), 0);
    const activeSet = new Set<string>();
    for (const p of payments) {
      const amt = Number(p.amount) || 0;
      const ts = new Date(p.created_at).getTime();
      collected += amt;
      if (now - ts <= 30 * DAY_MS) {
        collected30 += amt;
        if (liveSet.has(p.shop_id)) activeSet.add(p.shop_id);
      }
      const key = kigaliDay(ts);
      if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + amt);
    }
    const outstanding = unpaid.reduce((s, t) => s + (Number(t.amount) || 0), 0);

    // a shop is "active" if it recorded a debt or a payment in the last 30 days
    const shopOf = new Map(custRows.map((c) => [c.id, c.shop_id]));
    for (const t of tx30) {
      const shop = shopOf.get(t.customer_id);
      if (shop && liveSet.has(shop)) activeSet.add(shop);
    }

    // reminders
    const attempted = rSent + rDelivered + rRead + rFailed;
    const reached = rDelivered + rRead;

    const body = {
      ok: true,
      shops: liveShops.length,
      shops30,
      activeShops: activeSet.size,
      customers: custRows.length,
      // Debt tracked = what is still owed + what has been paid back. Slightly conservative:
      // payments recorded before the payments table existed are not counted.
      tracked: outstanding + collected,
      collected,
      collected30,
      daily: [...dayMap.values()],
      reminders: rSent + rDelivered + rRead,
      // only published once there is a meaningful sample
      deliveryRate: attempted >= 20 ? Math.round((reached / attempted) * 100) : null,
      since,
      updatedAt: new Date(now).toISOString(),
    };
    publicCache = { at: now, body };
    res.json(body);
  } catch (err) {
    console.error("public stats failed:", err);
    // Serve the last good numbers if we have them, otherwise let the site hide the section.
    if (publicCache) res.json(publicCache.body);
    else res.status(503).json({ ok: false });
  }
});

// ---------------------------------------------------------------------------
// ADMIN: dashboard overview
// GET /api/admin/overview
// ---------------------------------------------------------------------------

let overviewCache: { at: number; body: Record<string, unknown> } | null = null;
const OVERVIEW_CACHE_MS = 60 * 1000;

router.get("/admin/overview", requireAdmin, async (req: Request, res: Response) => {
  if (req.query["fresh"] !== "1" && overviewCache && Date.now() - overviewCache.at < OVERVIEW_CACHE_MS) {
    res.json(overviewCache.body);
    return;
  }
  try {
    const now = Date.now();
    const since30 = new Date(now - 30 * DAY_MS).toISOString();

    const [owners, customers, unpaid, payments30, tx30, pending, sent, delivered, read, failed] = await Promise.all([
      fetchAll<{ phone: string; name: string | null; created_at: string; trial_ends_at: string | null; is_active: boolean | null }>(
        "owners",
        "phone, name, created_at, trial_ends_at, is_active",
        undefined,
        "phone"
      ),
      fetchAll<{ id: string; shop_id: string }>("customers", "id, shop_id"),
      fetchAll<{ customer_id: string; amount: number }>("transactions", "customer_id, amount", (q) => q.eq("paid", false)),
      fetchAll<{ amount: number; created_at: string; shop_id: string }>("payments", "amount, created_at, shop_id", (q) => q.gte("created_at", since30)),
      fetchAll<{ customer_id: string }>("transactions", "customer_id", (q) => q.gte("date", since30)),
      countRows("reminder_logs", (q) => q.eq("status", "pending")),
      countRows("reminder_logs", (q) => q.eq("status", "sent")),
      countRows("reminder_logs", (q) => q.eq("status", "delivered")),
      countRows("reminder_logs", (q) => q.eq("status", "read")),
      countRows("reminder_logs", (q) => q.eq("status", "failed")),
    ]);

    // owner status counts
    let activeOwners = 0, expiring = 0, expired = 0;
    for (const o of owners) {
      if (o.is_active === false) continue;
      activeOwners++;
      if (!o.trial_ends_at) continue;
      const days = (new Date(o.trial_ends_at).getTime() - now) / DAY_MS;
      if (days < 0) expired++;
      else if (days <= 5) expiring++;
    }

    // outstanding per shop
    const shopOfCustomer = new Map<string, string>();
    const customersPerShop = new Map<string, number>();
    for (const c of customers) {
      shopOfCustomer.set(c.id, c.shop_id);
      customersPerShop.set(c.shop_id, (customersPerShop.get(c.shop_id) ?? 0) + 1);
    }
    const outstandingPerShop = new Map<string, number>();
    let outstanding = 0;
    for (const t of unpaid) {
      const shop = shopOfCustomer.get(t.customer_id);
      const amt = Number(t.amount) || 0;
      outstanding += amt;
      if (shop) outstandingPerShop.set(shop, (outstandingPerShop.get(shop) ?? 0) + amt);
    }
    const nameOf = new Map(owners.map((o) => [o.phone, o.name]));
    const topShops = [...outstandingPerShop.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([phone, amount]) => ({ phone, name: nameOf.get(phone) ?? phone, outstanding: amount, customers: customersPerShop.get(phone) ?? 0 }));

    // collected per day, last 14 days (Kigali dates)
    const daily: { date: string; amount: number }[] = [];
    const dailyMap = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = kigaliDay(now - i * DAY_MS);
      dailyMap.set(d, 0);
      daily.push({ date: d, amount: 0 });
    }
    let collected7 = 0, collected30 = 0;
    for (const p of payments30) {
      const ts = new Date(p.created_at).getTime();
      const amt = Number(p.amount) || 0;
      collected30 += amt;
      if (ts >= now - 7 * DAY_MS) collected7 += amt;
      const key = kigaliDay(ts);
      if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) ?? 0) + amt);
    }
    for (const d of daily) d.amount = dailyMap.get(d.date) ?? 0;

    // new shops per week, last 8 weeks
    const weekly: { week: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = now - (i + 1) * 7 * DAY_MS;
      const end = now - i * 7 * DAY_MS;
      const count = owners.filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t > start && t <= end;
      }).length;
      weekly.push({ week: kigaliDay(end), count });
    }

    // growth and activity (30 days)
    const liveOwnerSet = new Set(owners.filter((o) => o.name && o.is_active !== false).map((o) => o.phone));
    const newShops30 = owners.filter((o) => now - new Date(o.created_at).getTime() <= 30 * DAY_MS).length;
    const activeSet = new Set<string>();
    for (const p of payments30) if (liveOwnerSet.has(p.shop_id)) activeSet.add(p.shop_id);
    for (const t of tx30) {
      const shop = shopOfCustomer.get(t.customer_id);
      if (shop && liveOwnerSet.has(shop)) activeSet.add(shop);
    }

    const body = {
      ok: true,
      generatedAt: new Date(now).toISOString(),
      kpis: {
        owners: owners.length,
        activeOwners,
        trialExpiring: expiring,
        trialExpired: expired,
        customers: customers.length,
        outstanding,
        collected7,
        collected30,
        payments30: payments30.length,
        newShops30,
        activeShops30: activeSet.size,
        debts30: tx30.length,
      },
      reminders: { pending, sent, delivered, read, failed },
      daily,
      weekly,
      topShops,
    };
    overviewCache = { at: now, body };
    res.json(body);
  } catch (err) {
    console.error("admin overview failed:", err);
    res.status(500).json({ ok: false, message: "Failed to build overview." });
  }
});

// ---------------------------------------------------------------------------
// ADMIN: existing routes (unchanged unless noted)
// ---------------------------------------------------------------------------

// GET /api/admin/owners
// Returns every shop owner with computed stats: customer count and total
// outstanding debt across their customers, plus trial/access status.
router.get("/admin/owners", requireAdmin, async (_req: Request, res: Response) => {
  const { data: owners, error } = await supabase
    .from("owners")
    .select("phone, name, language, trial_ends_at, created_at, is_active")
    .order("created_at", { ascending: false });

  if (error || !owners) {
    res.status(500).json({ ok: false, message: "Failed to load owners." });
    return;
  }

  const results = await Promise.all(
    owners.map(async (owner: { phone: string; name: string | null; language: string | null; trial_ends_at: string | null; created_at: string; is_active: boolean }) => {
      const { data: customers } = await supabase
        .from("customers")
        .select("id")
        .eq("shop_id", owner.phone);

      const customerIds = (customers ?? []).map((c: { id: string }) => c.id);

      let totalOutstanding = 0;
      if (customerIds.length > 0) {
        const { data: unpaidTx } = await supabase
          .from("transactions")
          .select("amount, customer_id")
          .in("customer_id", customerIds)
          .eq("paid", false);
        totalOutstanding = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
      }

      const trialEndsAt = owner.trial_ends_at;
      const now = new Date();
      let status: "no_trial" | "active" | "expiring" | "expired" = "no_trial";
      if (trialEndsAt) {
        const end = new Date(trialEndsAt);
        const daysLeft = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysLeft < 0) status = "expired";
        else if (daysLeft <= 5) status = "expiring";
        else status = "active";
      }

      return {
        phone: owner.phone,
        name: owner.name,
        language: owner.language,
        createdAt: owner.created_at,
        trialEndsAt,
        status,
        isActive: owner.is_active,
        customerCount: customerIds.length,
        totalOutstanding,
      };
    })
  );

  res.json({ ok: true, owners: results });
});

// GET /api/admin/owners/:phone/customers
// Returns every customer for one shop, with a per-transaction-derived
// outstanding total and the customer's registration timestamp (full
// date+time, not just the day) so the admin can see exactly when someone
// was added. Also used as the data source for the Edit Customer flow.
router.get("/admin/owners/:phone/customers", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;

  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, phone, created_at")
    .eq("shop_id", phone)
    .order("created_at", { ascending: false });

  if (error || !customers) {
    res.status(500).json({ ok: false, message: "Failed to load customers." });
    return;
  }

  const results = await Promise.all(
    customers.map(async (customer: { id: string; name: string; phone: string | null; created_at: string }) => {
      const { data: unpaidTx } = await supabase
        .from("transactions")
        .select("amount")
        .eq("customer_id", customer.id)
        .eq("paid", false);
      const totalOwed = (unpaidTx ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        createdAt: customer.created_at,
        totalOwed,
      };
    })
  );

  res.json({ ok: true, customers: results });
});

// PATCH /api/admin/customers/:id
// body: { name?: string, phone?: string | null } — lets the admin edit a
// customer's name or phone directly (e.g. fixing a typo, or attaching a
// number to a customer who was originally registered with "No Number").
router.patch("/admin/customers/:id", requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, phone } = req.body as { name?: string; phone?: string | null };

  const updates: Record<string, string | null> = {};
  if (typeof name === "string" && name.trim().length > 0) updates["name"] = name.trim();
  if (phone !== undefined) {
    updates["phone"] = phone && phone.trim() ? phone.replace(/\D/g, "").replace(/^0/, "250") : null;
  }

  if (Object.keys(updates).length === 0) {
    res.json({ ok: true });
    return;
  }

  const { error } = await supabase.from("customers").update(updates).eq("id", id);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to update customer." });
    return;
  }

  res.json({ ok: true });
});

// POST /api/admin/owners/:phone/extend
// body: { days: number } — pushes trial_ends_at forward. Used for both
// "extend trial" and "mark paid" (mark paid just extends by 30 by default).
router.post("/admin/owners/:phone/extend", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const days = Number((req.body as { days?: number }).days) || 30;

  const { data: owner } = await supabase.from("owners").select("trial_ends_at").eq("phone", phone).single();
  if (!owner) {
    res.status(404).json({ ok: false, message: "Owner not found." });
    return;
  }

  const base = owner.trial_ends_at && new Date(owner.trial_ends_at) > new Date()
    ? new Date(owner.trial_ends_at)
    : new Date();
  base.setDate(base.getDate() + days);

  const { error } = await supabase.from("owners").update({ trial_ends_at: base.toISOString() }).eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to update owner." });
    return;
  }

  overviewCache = null;
  res.json({ ok: true, trialEndsAt: base.toISOString() });
});

// POST /api/admin/owners
// body: { phone: string, name?: string, language?: "en" | "rw", trialDays?: number }
// Manually creates a new ShopBrain owner (e.g. onboarding a shop yourself
// instead of them going through the WhatsApp welcome flow). Phone is the
// only required field — name/language/trial default sensibly, and can be
// left for the owner to fill in themselves via the normal WhatsApp
// onboarding flow (askShopName / language picker) the first time they text
// the bot, since getOrAskShopName() already handles a missing name/language.
router.post("/admin/owners", requireAdmin, async (req: Request, res: Response) => {
  const { phone, name, language, trialDays } = req.body as {
    phone?: string;
    name?: string;
    language?: string;
    trialDays?: number;
  };

  if (!phone || !phone.trim()) {
    res.status(400).json({ ok: false, message: "Phone number is required." });
    return;
  }

  const cleanedPhone = phone.replace(/\D/g, "").replace(/^0/, "250");
  const lang = language === "rw" || language === "en" ? language : null;
  const days = Number(trialDays) || 30;

  const { data: existing } = await supabase.from("owners").select("phone").eq("phone", cleanedPhone).single();
  if (existing) {
    res.status(409).json({ ok: false, message: "An owner with this phone number already exists." });
    return;
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + days);

  const { error } = await supabase.from("owners").insert({
    phone: cleanedPhone,
    name: name && name.trim() ? name.trim() : null,
    language: lang,
    trial_ends_at: trialEndsAt.toISOString(),
    is_active: true,
  });

  if (error) {
    res.status(500).json({ ok: false, message: "Failed to create owner." });
    return;
  }

  overviewCache = null;
  res.json({ ok: true, phone: cleanedPhone });
});

// PATCH /api/admin/owners/:phone
// body: { name?: string, language?: "en" | "rw", newPhone?: string } — edits
// an owner's info. newPhone renames the owner's phone/ID and cascades that
// change to every table that stores it as a string reference (customers,
// reminder_logs, and now payments) so the shop's existing data stays linked.
router.patch("/admin/owners/:phone", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { name, language, newPhone } = req.body as { name?: string; language?: string; newPhone?: string };

  if (newPhone && newPhone.trim()) {
    const cleanedNewPhone = newPhone.replace(/\D/g, "").replace(/^0/, "250");
    if (cleanedNewPhone !== phone) {
      const { data: existing } = await supabase.from("owners").select("phone").eq("phone", cleanedNewPhone).single();
      if (existing) {
        res.status(409).json({ ok: false, message: "Another owner already uses that phone number." });
        return;
      }

      // Cascade: owners.phone is referenced as a plain string in
      // customers.shop_id, reminder_logs.owner_phone and payments.shop_id,
      // so all of them need updating together for the shop's data to stay attached.
      // NOTE: if other tables (stock, sales, expenses, supplier debts, owner_notices)
      // also store the shop phone, add them here too.
      const { error: ownerErr } = await supabase.from("owners").update({ phone: cleanedNewPhone }).eq("phone", phone);
      if (ownerErr) {
        res.status(500).json({ ok: false, message: "Failed to update phone number." });
        return;
      }
      await supabase.from("customers").update({ shop_id: cleanedNewPhone }).eq("shop_id", phone);
      await supabase.from("reminder_logs").update({ owner_phone: cleanedNewPhone }).eq("owner_phone", phone);
      await supabase.from("payments").update({ shop_id: cleanedNewPhone }).eq("shop_id", phone);
      await supabase.from("owner_notices").update({ shop_id: cleanedNewPhone }).eq("shop_id", phone);
    }
  }

  const currentPhone = newPhone ? newPhone.replace(/\D/g, "").replace(/^0/, "250") : phone;

  const updates: Record<string, string> = {};
  if (typeof name === "string" && name.trim().length > 0) updates["name"] = name.trim();
  if (language === "en" || language === "rw") updates["language"] = language;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("owners").update(updates).eq("phone", currentPhone);
    if (error) {
      res.status(500).json({ ok: false, message: "Failed to update owner." });
      return;
    }
  }

  overviewCache = null;
  res.json({ ok: true });
});

// POST /api/admin/owners/:phone/deactivate
// Blocks the owner from using ShopBrain (isOwner() checks is_active too).
router.post("/admin/owners/:phone/deactivate", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { error } = await supabase.from("owners").update({ is_active: false }).eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to deactivate owner." });
    return;
  }
  overviewCache = null;
  publicCache = null;
  res.json({ ok: true });
});

// POST /api/admin/owners/:phone/activate
router.post("/admin/owners/:phone/activate", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { error } = await supabase.from("owners").update({ is_active: true }).eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to activate owner." });
    return;
  }
  overviewCache = null;
  publicCache = null;
  res.json({ ok: true });
});

// DELETE /api/admin/owners/:phone
// Permanently removes the owner row. Their customers/transactions are left
// in place (still tied to shop_id = phone) unless you also want a cascade —
// ask if you want this to wipe customer data too.
router.delete("/admin/owners/:phone", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { error } = await supabase.from("owners").delete().eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to remove owner." });
    return;
  }
  overviewCache = null;
  publicCache = null;
  res.json({ ok: true });
});

export default router;