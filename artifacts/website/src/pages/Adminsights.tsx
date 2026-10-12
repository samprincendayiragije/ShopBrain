import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, TrendingUp, Globe, AlertTriangle, Send } from "lucide-react";
import { MIN_SHOW } from "./Trust";

// Money, reminders and "what the public site shows" for the admin dashboard.
//
// Drop-in for Admin.tsx: it takes the dashboard's own `call` function, uses the
// dashboard's existing theme variables and classes (adm-card, adm-panel, adm-sign,
// adm-brow ...), and never throws. If the backend is the old one (no /admin/overview),
// it shows a small notice instead of breaking the page.
//
// Needs the new routes in server/routes/admin.ts:
//   GET /admin/overview      (password protected)
//   GET /public/stats        (anonymous totals, same numbers the website uses)

type Call = <T = any>(path: string, opts?: { method?: string; body?: unknown }, fallback?: string) => Promise<T>;

type Overview = {
  generatedAt: string;
  kpis: { collected7: number; collected30: number; payments30: number; outstanding: number };
  reminders: { pending: number; sent: number; delivered: number; read: number; failed: number };
  daily: { date: string; amount: number }[];
};
type PublicStats = { shops: number; customers: number; tracked: number; collected: number; reminders: number };

const nf = (n: number) => Math.round(n).toLocaleString();
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useCount(target: number) {
  const [v, setV] = useState(reduced() ? target : 0);
  useEffect(() => {
    if (reduced()) return setV(target);
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Tile({ label, value, suffix, hint, i }: { label: string; value: number; suffix?: string; hint?: string; i: number }) {
  const v = useCount(value);
  return (
    <div className="adm-card adm-spot adm-panel adm-in" style={{ ["--i" as string]: i } as React.CSSProperties}>
      <div style={{ color: "var(--mutfg)", fontSize: 12, fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>
        {nf(v)}
        {suffix && <small style={{ fontSize: 13, fontWeight: 600, color: "var(--mutfg)", marginLeft: 4 }}>{suffix}</small>}
      </div>
      {hint && <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--mutfg)" }}>{hint}</div>}
    </div>
  );
}

const CSS = `
.adx{display:grid;gap:12px;margin-bottom:22px}
.adx-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:12px}
.adx-two{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:12px}
@media (max-width:900px){.adx-two{grid-template-columns:minmax(0,1fr)}}
.adx-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.adx-head h3{margin:0;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px}
.adx-head h3 svg{color:var(--pri)}
.adx-pub{display:grid;gap:8px}
.adx-pubrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:9px 0;border-top:1px dashed var(--bd);font-size:12.5px}
.adx-pubrow:first-child{border-top:0}
.adx-pubrow b{font-variant-numeric:tabular-nums}
.adx-pubrow small{grid-column:1/-1;color:var(--mutfg);font-size:11.5px}
.adx-days{display:flex;gap:7px;margin-top:6px}
.adx-days span{flex:1;text-align:center;font-size:10px;color:var(--mutfg)}
`;

export default function AdminInsights({ call }: { call: Call }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [pub, setPub] = useState<PublicStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (fresh = false) => {
      setBusy(true);
      setErr(null);
      try {
        const [o, p] = await Promise.allSettled([call<any>(`/admin/overview${fresh ? "?fresh=1" : ""}`, undefined, "Failed to load insights."), call<any>("/public/stats", undefined, "Public stats unavailable.")]);
        if (o.status === "fulfilled" && o.value?.ok) setOv(o.value);
        else setErr("Insights need the updated server (GET /admin/overview). Deploy the new admin.ts and refresh.");
        setPub(p.status === "fulfilled" && p.value?.ok ? p.value : null);
      } finally {
        setBusy(false);
      }
    },
    [call]
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (err && !ov) {
    return (
      <div className="adm-err">
        <AlertTriangle size={15} style={{ flex: "none" }} /> <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{err}</span>
        <button className="adm-link" style={{ marginLeft: "auto", flex: "none" }} onClick={() => load(true)}>
          Retry
        </button>
      </div>
    );
  }
  if (!ov) return <div className="adm-card adm-skel" style={{ height: 120, marginBottom: 22 }} />;

  const r = ov.reminders;
  const attempted = r.sent + r.delivered + r.read + r.failed;
  const reached = r.delivered + r.read;
  const rate = attempted ? Math.round((reached / attempted) * 100) : 0;
  const maxDay = Math.max(1, ...ov.daily.map((d) => d.amount));

  const rows: [string, number, number, string][] = pub
    ? [
        ["Shops", pub.shops, MIN_SHOW.shops, "shops using Shop Brain"],
        ["Customers", pub.customers, MIN_SHOW.customers, "customers tracked"],
        ["Debt tracked (Frw)", pub.tracked, MIN_SHOW.tracked, "still owed + paid back"],
        ["Payments recorded (Frw)", pub.collected, MIN_SHOW.collected, "from the payments log"],
        ["Reminders sent", pub.reminders, MIN_SHOW.reminders, "sent, delivered or read"],
      ]
    : [];
  const showing = rows.filter(([, v, min]) => v >= min).length;

  const delivery: [string, number, string][] = [
    ["Sent", r.sent, "#38bdf8"],
    ["Delivered", r.delivered, "var(--ok)"],
    ["Read", r.read, "var(--amber)"],
    ["Failed", r.failed, "var(--bad)"],
    ["Pending", r.pending, "var(--off)"],
  ];
  const totalRem = delivery.reduce((s, [, n]) => s + n, 0);

  return (
    <section className="adx" aria-label="Money and reminders">
      <style>{CSS}</style>
      <div className="adx-head">
        <h3>
          <TrendingUp size={15} /> Money and reminders
        </h3>
        <button className="adm-btn sm" onClick={() => load(true)} disabled={busy}>
          <RefreshCw size={13} className={busy ? "adm-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="adx-tiles">
        <Tile i={0} label="Collected, last 7 days" value={ov.kpis.collected7} suffix="Frw" hint="Payments recorded in Shop Brain" />
        <Tile i={1} label="Collected, last 30 days" value={ov.kpis.collected30} suffix="Frw" hint={`${ov.kpis.payments30} payments`} />
        <Tile i={2} label="Owed right now" value={ov.kpis.outstanding} suffix="Frw" hint="Unpaid debts, all shops" />
        <Tile i={3} label="Reminder delivery" value={rate} suffix="%" hint={`${nf(reached)} of ${nf(attempted)} reached the customer`} />
      </div>

      <div className="adx-two">
        <div className="adm-card adm-spot adm-panel adm-in" style={{ ["--i" as string]: 4 } as React.CSSProperties}>
          <h3>
            <TrendingUp size={15} /> Collected per day, last 14 days
          </h3>
          <div className="adm-sign" style={{ height: 110 }}>
            {ov.daily.map((d, i) => (
              <div key={d.date} title={`${d.date}: ${nf(d.amount)} Frw`}>
                <i style={{ height: `${Math.max(4, (d.amount / maxDay) * 100)}%`, ["--i" as string]: i, opacity: d.amount ? 1 : 0.25 } as React.CSSProperties} />
              </div>
            ))}
          </div>
          <div className="adx-days" aria-hidden>
            {ov.daily.map((d) => (
              <span key={d.date}>{d.date.slice(8)}</span>
            ))}
          </div>
        </div>

        <div className="adm-card adm-spot adm-panel adm-in" style={{ ["--i" as string]: 5 } as React.CSSProperties}>
          <h3>
            <Send size={15} /> Reminder outcomes (latest status)
          </h3>
          <div className="adm-bars">
            {delivery.map(([l, n, c], i) => (
              <div key={l} className="adm-brow" style={{ ["--i" as string]: i } as React.CSSProperties}>
                <span className="n">{l}</span>
                <span className="adm-btrack">
                  <i style={{ width: `${totalRem ? Math.max(n ? 3 : 0, (n / totalRem) * 100) : 0}%`, background: c, ["--i" as string]: i } as React.CSSProperties} />
                </span>
                <b>{nf(n)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="adm-card adm-spot adm-panel adm-in" style={{ ["--i" as string]: 6 } as React.CSSProperties}>
        <h3>
          <Globe size={15} /> What the public website shows
        </h3>
        {!pub ? (
          <p style={{ margin: 0, color: "var(--mutfg)", fontSize: 12.5 }}>The public stats endpoint did not answer, so the website hides its numbers section.</p>
        ) : (
          <>
            <p style={{ margin: "0 0 8px", color: "var(--mutfg)", fontSize: 12.5 }}>
              {showing >= 2 ? `The website is showing ${showing} of ${rows.length} numbers.` : "Fewer than two numbers pass their thresholds, so the whole section is hidden on the website."} Anonymous totals only.
            </p>
            <div className="adx-pub">
              {rows.map(([l, v, min, note]) => {
                const on = v >= min;
                return (
                  <div key={l} className="adx-pubrow">
                    <span>
                      {l} <b>{nf(v)}</b>
                    </span>
                    <span className={`adm-badge ${on ? "ok" : "off"}`}>{on ? "Showing" : `Hidden until ${nf(min)}`}</span>
                    <small>{note}</small>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}