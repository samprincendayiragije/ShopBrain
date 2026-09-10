import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"];

// Every /admin/* route below (except /admin/verify) requires this header,
// set to the same ADMIN_PASSWORD. The frontend keeps the password in
// sessionStorage after login and sends it on every admin API call.
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ ok: false, message: "ADMIN_PASSWORD not configured on server." });
    return;
  }
  const supplied = req.header("x-admin-password");
  if (supplied !== ADMIN_PASSWORD) {
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
  const { password } = req.body as { password?: string };
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, message: "Invalid password." });
    return;
  }
  res.json({ ok: true });
});

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

  res.json({ ok: true, phone: cleanedPhone });
});

// PATCH /api/admin/owners/:phone
// body: { name?: string, language?: "en" | "rw", newPhone?: string } — edits
// an owner's info. newPhone renames the owner's phone/ID and cascades that
// change to every table that stores it as a string reference (customers,
// reminder_logs) so the shop's existing data stays linked correctly.
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
      // customers.shop_id and reminder_logs.owner_phone, so all three need
      // updating together for the shop's data to stay attached.
      const { error: ownerErr } = await supabase.from("owners").update({ phone: cleanedNewPhone }).eq("phone", phone);
      if (ownerErr) {
        res.status(500).json({ ok: false, message: "Failed to update phone number." });
        return;
      }
      await supabase.from("customers").update({ shop_id: cleanedNewPhone }).eq("shop_id", phone);
      await supabase.from("reminder_logs").update({ owner_phone: cleanedNewPhone }).eq("owner_phone", phone);
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

  res.json({ ok: true });
});

// POST /api/admin/owners/:phone/deactivate
// Blocks the owner from using ShopBrain (isOwner() must check is_active too — see note below).
router.post("/admin/owners/:phone/deactivate", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { error } = await supabase.from("owners").update({ is_active: false }).eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to deactivate owner." });
    return;
  }
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
  res.json({ ok: true });
});

export default router;import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"];

// Every /admin/* route below (except /admin/verify) requires this header,
// set to the same ADMIN_PASSWORD. The frontend keeps the password in
// sessionStorage after login and sends it on every admin API call.
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ ok: false, message: "ADMIN_PASSWORD not configured on server." });
    return;
  }
  const supplied = req.header("x-admin-password");
  if (supplied !== ADMIN_PASSWORD) {
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
  const { password } = req.body as { password?: string };
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, message: "Invalid password." });
    return;
  }
  res.json({ ok: true });
});

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

  res.json({ ok: true, phone: cleanedPhone });
});

// PATCH /api/admin/owners/:phone
// body: { name?: string, language?: "en" | "rw", newPhone?: string } — edits
// an owner's info. newPhone renames the owner's phone/ID and cascades that
// change to every table that stores it as a string reference (customers,
// reminder_logs) so the shop's existing data stays linked correctly.
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
      // customers.shop_id and reminder_logs.owner_phone, so all three need
      // updating together for the shop's data to stay attached.
      const { error: ownerErr } = await supabase.from("owners").update({ phone: cleanedNewPhone }).eq("phone", phone);
      if (ownerErr) {
        res.status(500).json({ ok: false, message: "Failed to update phone number." });
        return;
      }
      await supabase.from("customers").update({ shop_id: cleanedNewPhone }).eq("shop_id", phone);
      await supabase.from("reminder_logs").update({ owner_phone: cleanedNewPhone }).eq("owner_phone", phone);
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

  res.json({ ok: true });
});

// POST /api/admin/owners/:phone/deactivate
// Blocks the owner from using ShopBrain (isOwner() must check is_active too — see note below).
router.post("/admin/owners/:phone/deactivate", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { error } = await supabase.from("owners").update({ is_active: false }).eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to deactivate owner." });
    return;
  }
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
  res.json({ ok: true });
});

export default router;import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"];

// Every /admin/* route below (except /admin/verify) requires this header,
// set to the same ADMIN_PASSWORD. The frontend keeps the password in
// sessionStorage after login and sends it on every admin API call.
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ ok: false, message: "ADMIN_PASSWORD not configured on server." });
    return;
  }
  const supplied = req.header("x-admin-password");
  if (supplied !== ADMIN_PASSWORD) {
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
  const { password } = req.body as { password?: string };
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, message: "Invalid password." });
    return;
  }
  res.json({ ok: true });
});

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

  res.json({ ok: true, phone: cleanedPhone });
});

// PATCH /api/admin/owners/:phone
// body: { name?: string, language?: "en" | "rw", newPhone?: string } — edits
// an owner's info. newPhone renames the owner's phone/ID and cascades that
// change to every table that stores it as a string reference (customers,
// reminder_logs) so the shop's existing data stays linked correctly.
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
      // customers.shop_id and reminder_logs.owner_phone, so all three need
      // updating together for the shop's data to stay attached.
      const { error: ownerErr } = await supabase.from("owners").update({ phone: cleanedNewPhone }).eq("phone", phone);
      if (ownerErr) {
        res.status(500).json({ ok: false, message: "Failed to update phone number." });
        return;
      }
      await supabase.from("customers").update({ shop_id: cleanedNewPhone }).eq("shop_id", phone);
      await supabase.from("reminder_logs").update({ owner_phone: cleanedNewPhone }).eq("owner_phone", phone);
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

  res.json({ ok: true });
});

// POST /api/admin/owners/:phone/deactivate
// Blocks the owner from using ShopBrain (isOwner() must check is_active too — see note below).
router.post("/admin/owners/:phone/deactivate", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { error } = await supabase.from("owners").update({ is_active: false }).eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to deactivate owner." });
    return;
  }
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
  res.json({ ok: true });
});

export default router;import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"];

// Every /admin/* route below (except /admin/verify) requires this header,
// set to the same ADMIN_PASSWORD. The frontend keeps the password in
// sessionStorage after login and sends it on every admin API call.
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ ok: false, message: "ADMIN_PASSWORD not configured on server." });
    return;
  }
  const supplied = req.header("x-admin-password");
  if (supplied !== ADMIN_PASSWORD) {
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
  const { password } = req.body as { password?: string };
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, message: "Invalid password." });
    return;
  }
  res.json({ ok: true });
});

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

  res.json({ ok: true, phone: cleanedPhone });
});

// PATCH /api/admin/owners/:phone
// body: { name?: string, language?: "en" | "rw", newPhone?: string } — edits
// an owner's info. newPhone renames the owner's phone/ID and cascades that
// change to every table that stores it as a string reference (customers,
// reminder_logs) so the shop's existing data stays linked correctly.
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
      // customers.shop_id and reminder_logs.owner_phone, so all three need
      // updating together for the shop's data to stay attached.
      const { error: ownerErr } = await supabase.from("owners").update({ phone: cleanedNewPhone }).eq("phone", phone);
      if (ownerErr) {
        res.status(500).json({ ok: false, message: "Failed to update phone number." });
        return;
      }
      await supabase.from("customers").update({ shop_id: cleanedNewPhone }).eq("shop_id", phone);
      await supabase.from("reminder_logs").update({ owner_phone: cleanedNewPhone }).eq("owner_phone", phone);
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

  res.json({ ok: true });
});

// POST /api/admin/owners/:phone/deactivate
// Blocks the owner from using ShopBrain (isOwner() must check is_active too — see note below).
router.post("/admin/owners/:phone/deactivate", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { error } = await supabase.from("owners").update({ is_active: false }).eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to deactivate owner." });
    return;
  }
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
  res.json({ ok: true });
});

export default router;import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"];

// Every /admin/* route below (except /admin/verify) requires this header,
// set to the same ADMIN_PASSWORD. The frontend keeps the password in
// sessionStorage after login and sends it on every admin API call.
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ ok: false, message: "ADMIN_PASSWORD not configured on server." });
    return;
  }
  const supplied = req.header("x-admin-password");
  if (supplied !== ADMIN_PASSWORD) {
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
  const { password } = req.body as { password?: string };
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, message: "Invalid password." });
    return;
  }
  res.json({ ok: true });
});

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

  res.json({ ok: true, phone: cleanedPhone });
});

// PATCH /api/admin/owners/:phone
// body: { name?: string, language?: "en" | "rw", newPhone?: string } — edits
// an owner's info. newPhone renames the owner's phone/ID and cascades that
// change to every table that stores it as a string reference (customers,
// reminder_logs) so the shop's existing data stays linked correctly.
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
      // customers.shop_id and reminder_logs.owner_phone, so all three need
      // updating together for the shop's data to stay attached.
      const { error: ownerErr } = await supabase.from("owners").update({ phone: cleanedNewPhone }).eq("phone", phone);
      if (ownerErr) {
        res.status(500).json({ ok: false, message: "Failed to update phone number." });
        return;
      }
      await supabase.from("customers").update({ shop_id: cleanedNewPhone }).eq("shop_id", phone);
      await supabase.from("reminder_logs").update({ owner_phone: cleanedNewPhone }).eq("owner_phone", phone);
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

  res.json({ ok: true });
});

// POST /api/admin/owners/:phone/deactivate
// Blocks the owner from using ShopBrain (isOwner() must check is_active too — see note below).
router.post("/admin/owners/:phone/deactivate", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { error } = await supabase.from("owners").update({ is_active: false }).eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to deactivate owner." });
    return;
  }
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
  res.json({ ok: true });
});

export default router;import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"];

// Every /admin/* route below (except /admin/verify) requires this header,
// set to the same ADMIN_PASSWORD. The frontend keeps the password in
// sessionStorage after login and sends it on every admin API call.
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ ok: false, message: "ADMIN_PASSWORD not configured on server." });
    return;
  }
  const supplied = req.header("x-admin-password");
  if (supplied !== ADMIN_PASSWORD) {
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
  const { password } = req.body as { password?: string };
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, message: "Invalid password." });
    return;
  }
  res.json({ ok: true });
});

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

  res.json({ ok: true, phone: cleanedPhone });
});

// PATCH /api/admin/owners/:phone
// body: { name?: string, language?: "en" | "rw", newPhone?: string } — edits
// an owner's info. newPhone renames the owner's phone/ID and cascades that
// change to every table that stores it as a string reference (customers,
// reminder_logs) so the shop's existing data stays linked correctly.
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
      // customers.shop_id and reminder_logs.owner_phone, so all three need
      // updating together for the shop's data to stay attached.
      const { error: ownerErr } = await supabase.from("owners").update({ phone: cleanedNewPhone }).eq("phone", phone);
      if (ownerErr) {
        res.status(500).json({ ok: false, message: "Failed to update phone number." });
        return;
      }
      await supabase.from("customers").update({ shop_id: cleanedNewPhone }).eq("shop_id", phone);
      await supabase.from("reminder_logs").update({ owner_phone: cleanedNewPhone }).eq("owner_phone", phone);
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

  res.json({ ok: true });
});

// POST /api/admin/owners/:phone/deactivate
// Blocks the owner from using ShopBrain (isOwner() must check is_active too — see note below).
router.post("/admin/owners/:phone/deactivate", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { error } = await supabase.from("owners").update({ is_active: false }).eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to deactivate owner." });
    return;
  }
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
  res.json({ ok: true });
});

export default router;import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"];

// Every /admin/* route below (except /admin/verify) requires this header,
// set to the same ADMIN_PASSWORD. The frontend keeps the password in
// sessionStorage after login and sends it on every admin API call.
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ ok: false, message: "ADMIN_PASSWORD not configured on server." });
    return;
  }
  const supplied = req.header("x-admin-password");
  if (supplied !== ADMIN_PASSWORD) {
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
  const { password } = req.body as { password?: string };
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, message: "Invalid password." });
    return;
  }
  res.json({ ok: true });
});

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

  res.json({ ok: true, phone: cleanedPhone });
});

// PATCH /api/admin/owners/:phone
// body: { name?: string, language?: "en" | "rw", newPhone?: string } — edits
// an owner's info. newPhone renames the owner's phone/ID and cascades that
// change to every table that stores it as a string reference (customers,
// reminder_logs) so the shop's existing data stays linked correctly.
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
      // customers.shop_id and reminder_logs.owner_phone, so all three need
      // updating together for the shop's data to stay attached.
      const { error: ownerErr } = await supabase.from("owners").update({ phone: cleanedNewPhone }).eq("phone", phone);
      if (ownerErr) {
        res.status(500).json({ ok: false, message: "Failed to update phone number." });
        return;
      }
      await supabase.from("customers").update({ shop_id: cleanedNewPhone }).eq("shop_id", phone);
      await supabase.from("reminder_logs").update({ owner_phone: cleanedNewPhone }).eq("owner_phone", phone);
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

  res.json({ ok: true });
});

// POST /api/admin/owners/:phone/deactivate
// Blocks the owner from using ShopBrain (isOwner() must check is_active too — see note below).
router.post("/admin/owners/:phone/deactivate", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { error } = await supabase.from("owners").update({ is_active: false }).eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to deactivate owner." });
    return;
  }
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
  res.json({ ok: true });
});

export default router;import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { supabase } from "../lib/supabase.js";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"];

// Every /admin/* route below (except /admin/verify) requires this header,
// set to the same ADMIN_PASSWORD. The frontend keeps the password in
// sessionStorage after login and sends it on every admin API call.
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_PASSWORD) {
    res.status(500).json({ ok: false, message: "ADMIN_PASSWORD not configured on server." });
    return;
  }
  const supplied = req.header("x-admin-password");
  if (supplied !== ADMIN_PASSWORD) {
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
  const { password } = req.body as { password?: string };
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ ok: false, message: "Invalid password." });
    return;
  }
  res.json({ ok: true });
});

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

  res.json({ ok: true, phone: cleanedPhone });
});

// PATCH /api/admin/owners/:phone
// body: { name?: string, language?: "en" | "rw", newPhone?: string } — edits
// an owner's info. newPhone renames the owner's phone/ID and cascades that
// change to every table that stores it as a string reference (customers,
// reminder_logs) so the shop's existing data stays linked correctly.
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
      // customers.shop_id and reminder_logs.owner_phone, so all three need
      // updating together for the shop's data to stay attached.
      const { error: ownerErr } = await supabase.from("owners").update({ phone: cleanedNewPhone }).eq("phone", phone);
      if (ownerErr) {
        res.status(500).json({ ok: false, message: "Failed to update phone number." });
        return;
      }
      await supabase.from("customers").update({ shop_id: cleanedNewPhone }).eq("shop_id", phone);
      await supabase.from("reminder_logs").update({ owner_phone: cleanedNewPhone }).eq("owner_phone", phone);
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

  res.json({ ok: true });
});

// POST /api/admin/owners/:phone/deactivate
// Blocks the owner from using ShopBrain (isOwner() must check is_active too — see note below).
router.post("/admin/owners/:phone/deactivate", requireAdmin, async (req: Request, res: Response) => {
  const { phone } = req.params;
  const { error } = await supabase.from("owners").update({ is_active: false }).eq("phone", phone);
  if (error) {
    res.status(500).json({ ok: false, message: "Failed to deactivate owner." });
    return;
  }
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
  res.json({ ok: true });
});

export default router;