import { Router, type IRouter, type Request, type Response } from "express";
import { supabase } from "../lib/supabase.js";
import crypto from "node:crypto";

const router: IRouter = Router();

const ADMIN_PASSWORD = "ShopBrain2026";
const SESSION_COOKIE = "shopbrain_session";
const sessions = new Set<string>();

function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : undefined;
}

function isAuthenticated(req: Request): boolean {
  const token = getCookie(req, SESSION_COOKIE);
  return !!token && sessions.has(token);
}

function loginPage(error = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShopBrain Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 10px; padding: 2rem; width: 100%; max-width: 360px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    h1 { font-size: 1.4rem; margin-bottom: 1.5rem; color: #1a1a1a; }
    input { width: 100%; padding: 0.65rem 0.8rem; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; margin-bottom: 1rem; }
    button { width: 100%; padding: 0.7rem; background: #25D366; color: #fff; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; font-weight: 600; }
    button:hover { background: #1ebe5d; }
    .error { color: #e53e3e; font-size: 0.9rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🧠 ShopBrain Admin</h1>
    ${error ? `<p class="error">${error}</p>` : ""}
    <form method="POST" action="/api/admin/login">
      <input type="password" name="password" placeholder="Password" required autofocus />
      <button type="submit">Login</button>
    </form>
  </div>
</body>
</html>`;
}

interface Owner {
  phone: string;
  name: string | null;
  created_at: string;
}

function adminPage(owners: Owner[], message = ""): string {
  const rows = owners.length === 0
    ? `<tr><td colspan="3" style="text-align:center;color:#888;padding:1.5rem;">No owners yet.</td></tr>`
    : owners.map((o) => `
      <tr>
        <td>${o.phone}</td>
        <td>${o.name ?? "—"}</td>
        <td>
          <form method="POST" action="/api/admin/remove" style="margin:0;" onsubmit="return confirm('Remove ${o.phone}?')">
            <input type="hidden" name="phone" value="${o.phone}" />
            <button type="submit" class="remove-btn">Remove</button>
          </form>
        </td>
      </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShopBrain Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; padding: 2rem 1rem; }
    .container { max-width: 700px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #1a1a1a; }
    .card { background: #fff; border-radius: 10px; padding: 1.5rem; box-shadow: 0 2px 12px rgba(0,0,0,0.08); margin-bottom: 1.5rem; }
    h2 { font-size: 1.1rem; margin-bottom: 1rem; color: #333; }
    .form-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    input[type="text"] { flex: 1; min-width: 140px; padding: 0.6rem 0.8rem; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95rem; }
    button[type="submit"] { padding: 0.6rem 1.2rem; background: #25D366; color: #fff; border: none; border-radius: 6px; font-size: 0.95rem; cursor: pointer; font-weight: 600; white-space: nowrap; }
    button[type="submit"]:hover { background: #1ebe5d; }
    .remove-btn { padding: 0.35rem 0.8rem; background: #fff; color: #e53e3e; border: 1px solid #e53e3e; border-radius: 5px; font-size: 0.85rem; cursor: pointer; }
    .remove-btn:hover { background: #e53e3e; color: #fff; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 0.5rem 0.75rem; font-size: 0.8rem; text-transform: uppercase; color: #888; border-bottom: 2px solid #eee; }
    td { padding: 0.7rem 0.75rem; border-bottom: 1px solid #f0f0f0; font-size: 0.95rem; }
    .msg { background: #e6ffed; border: 1px solid #25D366; color: #276749; padding: 0.6rem 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; }
    .logout { float: right; font-size: 0.85rem; color: #888; text-decoration: none; margin-top: 0.2rem; }
    .logout:hover { color: #e53e3e; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧠 ShopBrain Admin <a class="logout" href="/api/admin/logout">Logout</a></h1>
    ${message ? `<div class="msg">${message}</div>` : ""}
    <div class="card">
      <h2>Add Owner</h2>
      <form method="POST" action="/api/admin/add">
        <div class="form-row">
          <input type="text" name="phone" placeholder="Phone (e.g. 250795120043)" required />
          <input type="text" name="name" placeholder="Name (optional)" />
          <button type="submit">Add</button>
        </div>
      </form>
    </div>
    <div class="card">
      <h2>Current Owners (${owners.length})</h2>
      <table>
        <thead>
          <tr><th>Phone</th><th>Name</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

router.get("/admin", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) {
    res.send(loginPage());
    return;
  }
  const { data: owners } = await supabase
    .from("owners")
    .select("phone, name, created_at")
    .order("created_at", { ascending: false });
  res.send(adminPage(owners ?? []));
});

router.get("/admin/logout", (req: Request, res: Response) => {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  res.redirect("/api/admin");
});

router.post("/admin/login", (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString("hex");
    sessions.add(token);
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=86400`,
    );
    res.redirect("/api/admin");
  } else {
    res.send(loginPage("Wrong password. Try again."));
  }
});

router.post("/admin/add", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) {
    res.redirect("/api/admin");
    return;
  }
  const { phone, name } = req.body as { phone?: string; name?: string };
  await supabase
    .from("owners")
    .insert({ phone: phone?.trim(), name: name?.trim() || null });
  res.redirect("/api/admin");
});

router.post("/admin/remove", async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) {
    res.redirect("/api/admin");
    return;
  }
  const { phone } = req.body as { phone?: string };
  await supabase.from("owners").delete().eq("phone", phone?.trim());
  res.redirect("/api/admin");
});

export default router;
