import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { LockKeyhole, ArrowLeft, Loader2 } from "lucide-react";

// Point this at the endpoint on your ShopBrain backend that checks the
// submitted password/phone against the Supabase `owners` table and
// returns { ok: true, token } on success. Set VITE_ADMIN_API_URL in your
// .env (e.g. https://your-shopbrain-app.repl.co/api/admin/verify).
const ADMIN_VERIFY_ENDPOINT = import.meta.env.VITE_ADMIN_API_URL as string | undefined;
const SESSION_KEY = "shopbrain_admin_token";

export default function Admin() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) setToken(stored);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ADMIN_VERIFY_ENDPOINT) {
      setError(
        "Admin API endpoint isn't configured yet. Set VITE_ADMIN_API_URL to your backend's owner-verification route."
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(ADMIN_VERIFY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Invalid password.");
      }

      const data = await res.json();
      if (!data?.ok || !data?.token) {
        throw new Error("Unexpected response from admin server.");
      }

      sessionStorage.setItem(SESSION_KEY, data.token);
      setToken(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setToken(null);
    setPassword("");
  };

  if (token) {
    return (
      <div className="min-h-[100dvh] bg-background px-4 md:px-6 py-10">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold font-display">Shop Brain Admin</h1>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors border border-border rounded-md px-3 py-1.5"
              data-testid="button-admin-logout"
            >
              Log out
            </button>
          </div>
          <div className="bg-card border border-border rounded-2xl p-8 text-muted-foreground">
            <p>
              You're verified as an owner. This is a placeholder dashboard —
              wire this area up to whatever admin views/actions ShopBrain
              needs next (shop list, trial status, manual billing, etc.),
              using the same token/backend for any further requests.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 md:px-6 py-10">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
        >
          <ArrowLeft size={16} /> Back to site
        </Link>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-6">
            <LockKeyhole size={22} />
          </div>
          <h1 className="text-xl font-bold font-display mb-1">Admin Access</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Enter the owner password to continue.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <input
                type="password"
                id="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                placeholder="••••••••"
                data-testid="input-admin-password"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" data-testid="text-admin-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-md font-bold hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-60"
              data-testid="button-admin-login"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? "Checking..." : "Log In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
