import React, { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { LockKeyhole, ArrowLeft, Loader2, RefreshCw, MessageCircle, CheckCircle2, AlertTriangle, XCircle, Clock, Pencil, Trash2, Ban, PlayCircle, X, UserPlus } from "lucide-react";

// Point this at your ShopBrain webhook backend, e.g.
// https://shop-brain-webhook--ndayiragijesamu.replit.app/api
const ADMIN_API_BASE = import.meta.env.VITE_ADMIN_API_URL as string | undefined;
const SESSION_KEY = "shopbrain_admin_password";

type OwnerStatus = "no_trial" | "active" | "expiring" | "expired";

interface Owner {
  phone: string;
  name: string | null;
  language: string | null;
  createdAt: string;
  trialEndsAt: string | null;
  status: OwnerStatus;
  isActive: boolean;
  customerCount: number;
  totalOutstanding: number;
}

function statusBadge(status: OwnerStatus, isActive: boolean) {
  if (!isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">
        <Ban size={14} /> Deactivated
      </span>
    );
  }
  const map: Record<OwnerStatus, { label: string; className: string; icon: React.ReactNode }> = {
    active: { label: "Active", className: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 size={14} /> },
    expiring: { label: "Expiring soon", className: "bg-amber-100 text-amber-700", icon: <Clock size={14} /> },
    expired: { label: "Expired", className: "bg-red-100 text-red-700", icon: <XCircle size={14} /> },
    no_trial: { label: "No trial set", className: "bg-muted text-muted-foreground", icon: <AlertTriangle size={14} /> },
  };
  const { label, className, icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${className}`}>
      {icon} {label}
    </span>
  );
}

export default function Admin() {
  const [password, setPassword] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) setPassword(stored);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!ADMIN_API_BASE) {
      setLoginError("Admin API endpoint isn't configured. Set VITE_ADMIN_API_URL.");
      return;
    }

    setLoggingIn(true);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/admin/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Invalid password.");
      }
      sessionStorage.setItem(SESSION_KEY, passwordInput);
      setPassword(passwordInput);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setPassword(null);
    setPasswordInput("");
  };

  if (!password) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 md:px-6 py-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6">
            <ArrowLeft size={16} /> Back to site
          </Link>

          <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-6">
              <LockKeyhole size={22} />
            </div>
            <h1 className="text-xl font-bold font-display mb-1">Admin Access</h1>
            <p className="text-sm text-muted-foreground mb-6">Enter the owner password to continue.</p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">Password</label>
                <input
                  type="password"
                  id="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                  placeholder="••••••••"
                  data-testid="input-admin-password"
                />
              </div>

              {loginError && (
                <p className="text-sm text-destructive" data-testid="text-admin-error">{loginError}</p>
              )}

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-md font-bold hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-60"
                data-testid="button-admin-login"
              >
                {loggingIn ? <Loader2 size={18} className="animate-spin" /> : null}
                {loggingIn ? "Checking..." : "Log In"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return <OwnersDashboard password={password} onLogout={handleLogout} />;
}

function OwnersDashboard({ password, onLogout }: { password: string; onLogout: () => void }) {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningPhone, setActioningPhone] = useState<string | null>(null);
  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchOwners = useCallback(async () => {
    if (!ADMIN_API_BASE) {
      setError("Admin API endpoint isn't configured. Set VITE_ADMIN_API_URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/admin/owners`, {
        headers: { "x-admin-password": password },
      });
      if (!res.ok) throw new Error("Failed to load owners.");
      const data = await res.json();
      setOwners(data.owners ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load owners.");
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

  const extend = async (phone: string, days: number) => {
    if (!ADMIN_API_BASE) return;
    setActioningPhone(phone);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/admin/owners/${encodeURIComponent(phone)}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ days }),
      });
      if (!res.ok) throw new Error("Failed to update owner.");
      await fetchOwners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActioningPhone(null);
    }
  };

  const saveEdit = async (phone: string, updates: { name?: string; language?: string; newPhone?: string }) => {
    if (!ADMIN_API_BASE) return;
    setActioningPhone(phone);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/admin/owners/${encodeURIComponent(phone)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save changes.");
      setEditingOwner(null);
      await fetchOwners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActioningPhone(null);
    }
  };

  const toggleActive = async (owner: Owner) => {
    if (!ADMIN_API_BASE) return;
    const endpoint = owner.isActive ? "deactivate" : "activate";
    setActioningPhone(owner.phone);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/admin/owners/${encodeURIComponent(owner.phone)}/${endpoint}`, {
        method: "POST",
        headers: { "x-admin-password": password },
      });
      if (!res.ok) throw new Error("Failed to update owner.");
      await fetchOwners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActioningPhone(null);
    }
  };

  const removeOwner = async (owner: Owner) => {
    if (!ADMIN_API_BASE) return;
    const confirmed = window.confirm(
      `Remove ${owner.name ?? owner.phone} permanently? This cannot be undone. Their customer records will remain but the owner login will no longer work.`
    );
    if (!confirmed) return;

    setActioningPhone(owner.phone);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/admin/owners/${encodeURIComponent(owner.phone)}`, {
        method: "DELETE",
        headers: { "x-admin-password": password },
      });
      if (!res.ok) throw new Error("Failed to remove owner.");
      await fetchOwners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActioningPhone(null);
    }
  };

  const createOwner = async (data: { phone: string; name: string; language: string; trialDays: number }) => {
    if (!ADMIN_API_BASE) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/admin/owners`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to create owner.");
      }
      setShowAddModal(false);
      await fetchOwners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create owner.");
    } finally {
      setCreating(false);
    }
  };

  const activeCount = owners.filter((o) => o.status === "active").length;
  const expiringCount = owners.filter((o) => o.status === "expiring").length;
  const expiredCount = owners.filter((o) => o.status === "expired").length;
  const totalOutstandingAll = owners.reduce((sum, o) => sum + o.totalOutstanding, 0);

  return (
    <div className="min-h-[100dvh] bg-background px-4 md:px-6 py-10">
      <div className="container mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-display">Shop Brain Admin</h1>
            <p className="text-sm text-muted-foreground mt-1">{owners.length} registered shop{owners.length === 1 ? "" : "s"}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-md px-3 py-2"
              data-testid="button-add-owner"
            >
              <UserPlus size={14} /> Add Owner
            </button>
            <button
              onClick={fetchOwners}
              disabled={loading}
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors border border-border rounded-md px-3 py-2 disabled:opacity-60"
              data-testid="button-refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              onClick={onLogout}
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors border border-border rounded-md px-3 py-2"
              data-testid="button-admin-logout"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs text-muted-foreground mb-1">Active</p>
            <p className="text-2xl font-bold font-display text-emerald-600">{activeCount}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs text-muted-foreground mb-1">Expiring soon</p>
            <p className="text-2xl font-bold font-display text-amber-600">{expiringCount}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs text-muted-foreground mb-1">Expired</p>
            <p className="text-2xl font-bold font-display text-red-600">{expiredCount}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs text-muted-foreground mb-1">Total outstanding (all shops)</p>
            <p className="text-2xl font-bold font-display">{totalOutstandingAll.toLocaleString()} Frw</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-700 text-sm" data-testid="text-dashboard-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="animate-spin mr-2" size={20} /> Loading owners...
          </div>
        ) : owners.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No shop owners registered yet.</div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="px-5 py-3 font-medium text-muted-foreground">Shop</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Phone</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Access until</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Customers</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Outstanding</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((owner) => (
                  <tr key={owner.phone} className="border-b border-border last:border-0 hover:bg-muted/30" data-testid={`row-owner-${owner.phone}`}>
                    <td className="px-5 py-4 font-medium">{owner.name ?? "—"}</td>
                    <td className="px-5 py-4 text-muted-foreground">{owner.phone}</td>
                    <td className="px-5 py-4">{statusBadge(owner.status, owner.isActive)}</td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {owner.trialEndsAt ? new Date(owner.trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-5 py-4">{owner.customerCount}</td>
                    <td className="px-5 py-4">{owner.totalOutstanding.toLocaleString()} Frw</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => extend(owner.phone, 30)}
                          disabled={actioningPhone === owner.phone}
                          className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-60"
                          data-testid={`button-extend-${owner.phone}`}
                        >
                          {actioningPhone === owner.phone ? "..." : "+30 days"}
                        </button>
                        <a
                          href={`https://wa.me/${owner.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium border border-border px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
                          data-testid={`link-whatsapp-${owner.phone}`}
                        >
                          <MessageCircle size={12} /> Message
                        </a>
                        <button
                          onClick={() => setEditingOwner(owner)}
                          disabled={actioningPhone === owner.phone}
                          className="inline-flex items-center gap-1 text-xs font-medium border border-border px-3 py-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-60"
                          data-testid={`button-edit-${owner.phone}`}
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          onClick={() => toggleActive(owner)}
                          disabled={actioningPhone === owner.phone}
                          className={`inline-flex items-center gap-1 text-xs font-medium border px-3 py-1.5 rounded-md transition-colors disabled:opacity-60 ${
                            owner.isActive
                              ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                              : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          }`}
                          data-testid={`button-toggle-active-${owner.phone}`}
                        >
                          {owner.isActive ? <Ban size={12} /> : <PlayCircle size={12} />}
                          {owner.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => removeOwner(owner)}
                          disabled={actioningPhone === owner.phone}
                          className="inline-flex items-center gap-1 text-xs font-medium border border-red-300 text-red-700 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors disabled:opacity-60"
                          data-testid={`button-remove-${owner.phone}`}
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingOwner && (
        <EditOwnerModal
          owner={editingOwner}
          saving={actioningPhone === editingOwner.phone}
          onCancel={() => setEditingOwner(null)}
          onSave={(updates) => saveEdit(editingOwner.phone, updates)}
        />
      )}

      {showAddModal && (
        <AddOwnerModal
          saving={creating}
          onCancel={() => setShowAddModal(false)}
          onSave={createOwner}
        />
      )}
    </div>
  );
}

function EditOwnerModal({
  owner,
  saving,
  onCancel,
  onSave,
}: {
  owner: Owner;
  saving: boolean;
  onCancel: () => void;
  onSave: (updates: { name?: string; language?: string; newPhone?: string }) => void;
}) {
  const [name, setName] = useState(owner.name ?? "");
  const [language, setLanguage] = useState(owner.language ?? "en");
  const [phone, setPhone] = useState(owner.phone);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-display">Edit Shop</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" data-testid="button-close-edit-modal">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Shop Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              data-testid="input-edit-name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              data-testid="select-edit-language"
            >
              <option value="en">English</option>
              <option value="rw">Kinyarwanda</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              data-testid="input-edit-phone"
            />
            <p className="text-xs text-muted-foreground">
              Changing this updates the owner's ID everywhere (their customers and reminder logs move with it).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 border border-border py-2.5 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            data-testid="button-cancel-edit"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ name, language, newPhone: phone !== owner.phone ? phone : undefined })}
            disabled={saving}
            className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
            data-testid="button-save-edit"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddOwnerModal({
  saving,
  onCancel,
  onSave,
}: {
  saving: boolean;
  onCancel: () => void;
  onSave: (data: { phone: string; name: string; language: string; trialDays: number }) => void;
}) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [trialDays, setTrialDays] = useState(30);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-display">Add New Owner</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" data-testid="button-close-add-modal">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0788123456"
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              data-testid="input-add-phone"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Shop Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mama Janet Shop"
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              data-testid="input-add-name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              data-testid="select-add-language"
            >
              <option value="en">English</option>
              <option value="rw">Kinyarwanda</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Trial Length (days)</label>
            <input
              type="number"
              min={1}
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
              data-testid="input-add-trial-days"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 border border-border py-2.5 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            data-testid="button-cancel-add"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ phone, name, language, trialDays })}
            disabled={saving || !phone.trim() || !name.trim()}
            className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
            data-testid="button-save-add"
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}