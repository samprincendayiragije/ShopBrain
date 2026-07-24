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
    .select("phone, name, language, trial_ends_at, created_at")
    .order("created_at", { ascending: false });

  if (error || !owners) {
    res.status(500).json({ ok: false, message: "Failed to load owners." });
    return;
  }

  const results = await Promise.all(
    owners.map(async (owner: { phone: string; name: string | null; language: string | null; trial_ends_at: string | null; created_at: string }) => {
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
        customerCount: customerIds.length,
        totalOutstanding,
      };
    })
  );

  res.json({ ok: true, owners: results });
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

export default router;