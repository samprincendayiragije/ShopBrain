import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"];

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

  // Simple session token — good enough for a single-admin tool.
  const token = Buffer.from(`admin:${Date.now()}`).toString("base64");
  res.json({ ok: true, token });
});

export default router;