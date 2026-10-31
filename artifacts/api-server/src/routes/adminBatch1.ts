// BATCH 1: admin endpoints for flags, the activity log and the digest.
// The pause / resume kill switch already exists (POST /admin/owners/:phone/deactivate and /activate).
import { Router, type IRouter, type Request, type Response } from "express";
import { supabase } from "../lib/supabase.js";
import { logActivity } from "../lib/guard.js";
import { buildDigest } from "../lib/digest.js";
import { requireAdmin } from "./admin.js";

const router: IRouter = Router();

// GET /api/admin/flags : numbers that hit the daily reminder limit and are not resolved yet
router.get("/admin/flags", requireAdmin, async (_req: Request, res: Response) => {
  const { data, error } = await supabase.from("phone_flags").select("*").eq("resolved", false).order("flagged_at", { ascending: false });
  if (error) { res.status(500).json({ ok: false, message: "Failed to load flags." }); return; }
  res.json(data ?? []);
});

// POST /api/admin/flags/:phone/resolve
router.post("/admin/flags/:phone/resolve", requireAdmin, async (req: Request, res: Response) => {
  const phone = String(req.params["phone"]);
  const { error } = await supabase.from("phone_flags").update({ resolved: true }).eq("phone", phone);
  if (error) { res.status(500).json({ ok: false, message: "Failed to resolve flag." }); return; }
  void logActivity("flag_resolved", { target: phone, actor: "admin" });
  res.json({ ok: true });
});

// GET /api/admin/activity?owner=<phone>&action=<name>&limit=100
router.get("/admin/activity", requireAdmin, async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query["limit"] ?? 100) || 100, 1), 500);
  let q = supabase.from("activity_log").select("*").order("at", { ascending: false }).limit(limit);
  if (req.query["owner"]) q = q.eq("owner_phone", String(req.query["owner"]).replace(/\D/g, ""));
  if (req.query["action"]) q = q.eq("action", String(req.query["action"]));
  const { data, error } = await q;
  if (error) { res.status(500).json({ ok: false, message: "Failed to load activity." }); return; }
  res.json(data ?? []);
});

// GET /api/admin/digest : the same text the morning digest sends, on demand
router.get("/admin/digest", requireAdmin, async (_req: Request, res: Response) => {
  res.type("text").send(await buildDigest());
});

export default router;
