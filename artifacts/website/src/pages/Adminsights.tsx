import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, Copy, Check, MessageCircle, Lock, Unlock, Globe, TrendingUp } from "lucide-react";
import { MIN_SHOW } from "./Trust";

// ADMIN COMMAND CENTER
//
// Put it at the TOP of the dashboard, right under the header and the error banner:
//
//   {owners.length > 0 && <AdminInsights call={call} />}
//
// It reuses the dashboard's own theme variables and classes, and every panel carries
// data-roll, so the dashboard's existing 3D scroll "drum" (useRoll) rolls it too.
//
// What it shows (all from GET /admin/overview and GET /public/stats):
//   1. A big animated "debt tracked" number with a 14-day collections area chart.
//   2. Four 3D tiles: collected 7 and 30 days, active shops, reminder delivery.
//   3. Growth: new shops, debts logged, share of shops active.
//   4. The reminder pipeline: sent, delivered, read, with drop-off between each step.
//   5. THE CREDIBILITY CENTER: marketing sentences generated from your real numbers.
//      A sentence unlocks only when the number passes the same threshold the website uses
//      (MIN_SHOW in Trust.tsx), so you can never paste a claim you cannot back up.
//
// It never throws. If the server is the old one, it shows a short notice with Retry.

type Call = <T = any>(path: string, opts?: { method?: string; body?: unknown }, fallback?: string) => Promise<T>;

type Overview = {
  generatedAt: string;
  kpis: { collected7: number; collected30: number; payments30: number; outstanding: number; newShops30?: number; activeShops30?: number; debts30?: number; activeOwners?: number; owners?: number };
  reminders: { pending: number; sent: number; delivered: number; read: number; failed: number };
  daily: { date: string; amount: number }[];
};
type PublicStats = { shops: number; shops30: number; activeShops: number; customers: number; tracked: number; collected: number; collected30: number; reminders: number; deliveryRate: number | null };

const nf = (n: number) => Math.round(n).toLocaleString();
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useCount(target: number, ms = 1400) {
  const [v, setV] = useState(reduced() ? target : 0);
  useEffect(() => {
    if (reduced()) return setV(target);
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

// Callback ref: the panels below only exist after the data has loaded, so the observer must
// start when each element attaches, not when this component first mounts.
function useSeen<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    if (!el) return;
    if (reduced() || typeof IntersectionObserver === "undefined") {
      el.dataset.in = "1";
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.dataset.in = "1";
        io.disconnect();
      }
    }, { threshold: 0.15 });
    io.observe(el);
  }, []);
}

function tilt(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType === "touch" || reduced()) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--ry", `${(((e.clientX - r.left) / r.width - 0.5) * 10).toFixed(2)}deg`);
  el.style.setProperty("--rx", `${(-((e.clientY - r.top) / r.height - 0.5) * 10).toFixed(2)}deg`);
}
const untilt = (e: React.PointerEvent<HTMLElement>) => {
  e.currentTarget.style.setProperty("--rx", "0deg");
  e.currentTarget.style.setProperty("--ry", "0deg");
};

const CSS = `
.adx{display:grid;gap:14px;margin-bottom:26px}
.adx-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.adx-top h2{margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:10px}
.adx-live{width:9px;height:9px;border-radius:50%;background:var(--ok);position:relative;display:inline-block}
.adx-live::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--ok);animation:adm-pulse 2s ease-out infinite}
.adx-card{position:relative;overflow:hidden;border-radius:18px;border:1px solid var(--bd);background:var(--card);box-shadow:var(--shadow);padding:20px}
.adx-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:22px;align-items:center;background:
  radial-gradient(90% 120% at 0% 0%,color-mix(in srgb,var(--pri) 22%,transparent),transparent 60%),var(--card)}
@media (max-width:860px){.adx-hero{grid-template-columns:minmax(0,1fr)}}
.adx-lab{font-size:12.5px;font-weight:700;color:var(--mutfg);letter-spacing:.02em}
.adx-giant{margin-top:6px;font-weight:800;line-height:1;letter-spacing:-.035em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;font-size:clamp(2.4rem,7vw,4.6rem);
  background:linear-gradient(100deg,var(--fg),var(--pri));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.adx-giant small{font-size:.3em;letter-spacing:0;margin-left:.35em;-webkit-text-fill-color:var(--mutfg);color:var(--mutfg)}
.adx-sub{margin:10px 0 0;color:var(--mutfg);font-size:13px;max-width:34ch}
.adx-chartwrap{position:relative}
.adx-svg{display:block;width:100%;height:150px;clip-path:inset(0 100% 0 0);transition:clip-path 1.6s cubic-bezier(.16,1,.3,1) .2s}
[data-in="1"] .adx-svg{clip-path:inset(0 0 0 0)}
.adx-days{display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--mutfg)}
.adx-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px}
.adx-tilt{transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .18s ease-out;will-change:transform;height:100%}
.adx-tile{height:100%;padding:18px}
.adx-big{margin-top:8px;font-size:clamp(1.5rem,3.4vw,2.1rem);font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.adx-big small{font-size:.45em;font-weight:700;color:var(--mutfg);margin-left:4px}
.adx-hint{margin-top:3px;font-size:11.5px;color:var(--mutfg)}
.adx-bar{height:6px;border-radius:3px;background:var(--mut);box-shadow:inset 0 0 0 1px var(--bd);overflow:hidden;margin-top:10px}
.adx-bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,var(--pri),color-mix(in srgb,var(--pri) 50%,#facc15));transform:scaleX(0);transform-origin:0 50%;transition:transform 1.2s cubic-bezier(.16,1,.3,1) .3s;width:var(--w)}
[data-in="1"] .adx-bar i{transform:scaleX(1)}
.adx-pipe{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-top:14px}
.adx-stage{position:relative;padding:16px 18px 16px 26px;background:color-mix(in srgb,var(--pri) var(--a),var(--mut));clip-path:polygon(0 0,calc(100% - 16px) 0,100% 50%,calc(100% - 16px) 100%,0 100%,16px 50%);margin-left:-8px;opacity:0;transform:translateX(-14px);transition:opacity .7s ease var(--d),transform .8s cubic-bezier(.16,1,.3,1) var(--d)}
[data-in="1"] .adx-stage{opacity:1;transform:none}
.adx-stage:first-child{margin-left:0;clip-path:polygon(0 0,calc(100% - 16px) 0,100% 50%,calc(100% - 16px) 100%,0 100%)}
.adx-stage b{display:block;font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
.adx-stage span{font-size:12px;color:var(--mutfg)}
@media (max-width:640px){.adx-pipe{grid-template-columns:minmax(0,1fr)}.adx-stage,.adx-stage:first-child{clip-path:none;margin:0 0 6px;border-radius:12px}}
.adx-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.adx-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid var(--bd);background:var(--mut)}
.adx-claims{display:grid;gap:10px;margin-top:14px}
.adx-claim{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--bd);border-radius:14px;background:var(--mut);transition:transform .3s cubic-bezier(.34,1.56,.64,1),border-color .2s;opacity:0;transform:translateY(16px)}
[data-in="1"] .adx-claim{opacity:1;transform:none;transition:opacity .6s ease var(--d),transform .7s cubic-bezier(.34,1.56,.64,1) var(--d),border-color .2s}
.adx-claim.on{border-color:color-mix(in srgb,var(--ok) 45%,var(--bd));background:color-mix(in srgb,var(--ok) 8%,var(--card))}
.adx-claim.off{opacity:.62}
.adx-claim .ic{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--c)}
.adx-claim p{margin:0;font-size:13.5px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}
.adx-claim small{display:block;margin-top:2px;font-size:11.5px;font-weight:500;color:var(--mutfg)}
.adx-acts{display:flex;gap:6px}
@media (max-width:640px){.adx-claim{grid-template-columns:auto minmax(0,1fr)}.adx-acts{grid-column:1/-1}}
@media (prefers-reduced-motion:reduce){.adx-svg{clip-path:none;transition:none}.adx-bar i{transform:none;transition:none}.adx-stage,.adx-claim{opacity:1;transform:none;transition:none}.adx-tilt{transform:none !important}}
`;

function Tile({ label, value, suffix, hint, bar, i }: { label: string; value: number; suffix?: string; hint?: string; bar?: number; i: number }) {
  const v = useCount(value);
  const ref = useSeen<HTMLDivElement>();
  return (
    <div ref={ref} className="adm-roll" data-roll style={{ ["--i" as string]: i } as React.CSSProperties}>
      <div className="adx-tilt" onPointerMove={tilt} onPointerLeave={untilt}>
        <div className="adx-card adx-tile adm-spot adm-in" style={{ ["--i" as string]: i } as React.CSSProperties}>
          <div className="adx-lab">{label}</div>
          <div className="adx-big">
            {nf(v)}
            {suffix && <small>{suffix}</small>}
          </div>
          {hint && <div className="adx-hint">{hint}</div>}
          {bar !== undefined && (
            <div className="adx-bar" aria-hidden>
              <i style={{ ["--w" as string]: `${Math.max(3, Math.min(100, bar))}%` } as React.CSSProperties} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminInsights({ call }: { call: Call }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [pub, setPub] = useState<PublicStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const heroRef = useSeen<HTMLDivElement>();
  const pipeRef = useSeen<HTMLDivElement>();
  const claimRef = useSeen<HTMLDivElement>();

  const load = useCallback(
    async (fresh = false) => {
      setBusy(true);
      setErr(null);
      try {
        const [o, p] = await Promise.allSettled([call<any>(`/admin/overview${fresh ? "?fresh=1" : ""}`, undefined, "Failed to load insights."), call<any>("/public/stats", undefined, "Public stats unavailable.")]);
        if (o.status === "fulfilled" && o.value?.ok) setOv(o.value);
        else setErr("The Command Center needs the updated server (GET /admin/overview). Deploy the new admin.ts, then refresh.");
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

  const tracked = useCount(pub?.tracked ?? ov?.kpis.outstanding ?? 0, 2000);

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
  if (!ov) return <div className="adm-card adm-skel" style={{ height: 220, marginBottom: 26 }} />;

  const k = ov.kpis;
  const r = ov.reminders;
  const attempted = r.sent + r.delivered + r.read + r.failed;
  const reached = r.delivered + r.read;
  const rate = attempted ? Math.round((reached / attempted) * 100) : 0;
  const delivered = r.delivered + r.read; // "delivered" counts everything that got there, read included
  const sentAll = r.sent + r.delivered + r.read;
  const maxDay = Math.max(1, ...ov.daily.map((d) => d.amount));
  const hasMoney = ov.daily.some((d) => d.amount > 0);
  const totalShops = k.activeOwners ?? pub?.shops ?? 0;
  const active = k.activeShops30 ?? pub?.activeShops ?? 0;
  const activePct = totalShops ? Math.round((active / totalShops) * 100) : 0;

  // area chart geometry
  const n = ov.daily.length;
  const pts = ov.daily.map((d, i) => [(i * 100) / Math.max(1, n - 1), 36 - (d.amount / maxDay) * 32] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L100 40 L0 40 Z`;

  // credibility claims, generated only from real numbers
  const rows = pub
    ? [
        { k: "shops", ok: pub.shops >= MIN_SHOW.shops, text: `${nf(pub.shops)} shop${pub.shops === 1 ? "" : "s"} in Rwanda use Shop Brain to track customer debts on WhatsApp.`, need: `Unlocks at ${nf(MIN_SHOW.shops)} shops` },
        { k: "tracked", ok: pub.tracked >= MIN_SHOW.tracked, text: `${nf(pub.tracked)} RWF of customer debt tracked in Shop Brain.`, need: `Unlocks at ${nf(MIN_SHOW.tracked)} RWF` },
        { k: "collected30", ok: pub.collected30 >= MIN_SHOW.collected, text: `${nf(pub.collected30)} RWF in customer payments recorded in the last 30 days.`, need: `Unlocks at ${nf(MIN_SHOW.collected)} RWF` },
        { k: "reminders", ok: pub.reminders >= MIN_SHOW.reminders, text: `${nf(pub.reminders)} polite WhatsApp reminders sent, only to customers who agreed.`, need: `Unlocks at ${nf(MIN_SHOW.reminders)} reminders` },
        { k: "delivery", ok: pub.deliveryRate !== null, text: `${pub.deliveryRate ?? 0}% of reminders reach the customer's WhatsApp.`, need: "Unlocks after 20 reminders have been attempted" },
        { k: "active", ok: pub.shops > 0 && pub.activeShops >= MIN_SHOW.activeShops, text: `${nf(pub.activeShops)} of ${nf(pub.shops)} shops recorded activity in the last 30 days.`, need: `Unlocks at ${nf(MIN_SHOW.activeShops)} active shop` },
      ]
    : [];
  const unlocked = rows.filter((x) => x.ok).length;

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1600);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };

  return (
    <section className="adx" aria-label="Command center">
      <style>{CSS}</style>

      <div className="adx-top">
        <h2>
          <i className="adx-live" /> Command Center
        </h2>
        <button className="adm-btn sm" onClick={() => load(true)} disabled={busy}>
          <RefreshCw size={13} className={busy ? "adm-spin" : ""} /> Refresh
        </button>
      </div>

      {/* 1. money hero */}
      <div ref={heroRef} className="adm-roll" data-roll>
        <div className="adx-card adx-hero adm-in">
          <div>
            <div className="adx-lab">Customer debt tracked in Shop Brain</div>
            <div className="adx-giant">
              {nf(tracked)}
              <small>RWF</small>
            </div>
            <p className="adx-sub">Still owed plus paid back. This is the number the website shows once it passes its threshold.</p>
            <div className="adx-chips">
              <span className="adx-chip">
                <TrendingUp size={13} /> {nf(k.collected30)} RWF collected in 30 days
              </span>
              <span className="adx-chip">{k.payments30} payments</span>
            </div>
          </div>
          <div className="adx-chartwrap">
            <div className="adx-lab" style={{ marginBottom: 8 }}>
              Money recorded per day, last 14 days
            </div>
            {hasMoney ? (
              <>
                <svg className="adx-svg" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Collections, last 14 days">
                  <defs>
                    <linearGradient id="adxfill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--pri)" stopOpacity=".5" />
                      <stop offset="100%" stopColor="var(--pri)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={area} fill="url(#adxfill)" />
                  <path d={line} fill="none" stroke="var(--pri)" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
                <div className="adx-days" aria-hidden>
                  {ov.daily.filter((_, i) => i % 2 === 0).map((d) => (
                    <span key={d.date}>{d.date.slice(5)}</span>
                  ))}
                </div>
              </>
            ) : (
              <p className="adx-hint">No payments recorded in the last 14 days yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* 2. tiles */}
      <div className="adx-tiles">
        <Tile i={0} label="Collected, last 7 days" value={k.collected7} suffix="RWF" hint="Payments recorded in Shop Brain" />
        <Tile i={1} label="Collected, last 30 days" value={k.collected30} suffix="RWF" hint={`${k.payments30} payments`} />
        <Tile i={2} label="Active shops (30 days)" value={active} hint={`${activePct}% of ${nf(totalShops)} shops recorded a debt or payment`} bar={activePct} />
        <Tile i={3} label="Reminder delivery" value={rate} suffix="%" hint={`${nf(reached)} of ${nf(attempted)} reached the customer`} bar={rate} />
      </div>

      {/* 3. growth */}
      <div className="adx-tiles">
        <Tile i={4} label="New shops, last 30 days" value={k.newShops30 ?? pub?.shops30 ?? 0} hint="Signed up and named their shop" />
        <Tile i={5} label="Debts logged, last 30 days" value={k.debts30 ?? 0} hint="Entries added across all shops" />
        <Tile i={6} label="Owed right now" value={k.outstanding} suffix="RWF" hint="Unpaid debts, all shops" />
      </div>

      {/* 4. pipeline */}
      <div ref={pipeRef} className="adm-roll" data-roll>
        <div className="adx-card adm-in">
          <div className="adx-lab">Reminder pipeline (latest status of every reminder)</div>
          <div className="adx-pipe">
            {[
              { l: "Sent to WhatsApp", n: sentAll, a: "26%", d: "0ms", sub: "" },
              { l: "Delivered to the phone", n: delivered, a: "42%", d: "160ms", sub: sentAll ? `${Math.round((delivered / sentAll) * 100)}% of sent` : "" },
              { l: "Read by the customer", n: r.read, a: "62%", d: "320ms", sub: delivered ? `${Math.round((r.read / delivered) * 100)}% of delivered` : "" },
            ].map((s) => (
              <div key={s.l} className="adx-stage" style={{ ["--a" as string]: s.a, ["--d" as string]: s.d } as React.CSSProperties}>
                <b>{nf(s.n)}</b>
                <span>{s.l}</span>
                {s.sub && <span style={{ display: "block", fontWeight: 700 }}>{s.sub}</span>}
              </div>
            ))}
          </div>
          <div className="adx-chips">
            <span className="adx-chip" style={{ color: r.failed ? "var(--bad)" : undefined }}>{nf(r.failed)} failed</span>
            <span className="adx-chip">{nf(r.pending)} pending</span>
          </div>
        </div>
      </div>

      {/* 5. credibility center */}
      <div ref={claimRef} className="adm-roll" data-roll>
        <div className="adx-card adm-in">
          <div className="adx-top">
            <div>
              <div className="adx-lab" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Globe size={14} /> CREDIBILITY CENTER
              </div>
              <p className="adx-sub" style={{ maxWidth: "62ch", marginTop: 6 }}>
                Sentences you can safely paste into WhatsApp, Instagram, pitches and the website. Each one is written from your live numbers and unlocks only when the number passes the same threshold the website uses. {unlocked} of {rows.length} unlocked.
              </p>
            </div>
          </div>
          {!pub ? (
            <p className="adx-hint" style={{ marginTop: 12 }}>
              The public stats endpoint did not answer, so the website hides its numbers section and no claims can be generated.
            </p>
          ) : (
            <div className="adx-claims">
              {rows.map((c, i) => (
                <div key={c.k} className={`adx-claim ${c.ok ? "on" : "off"}`} style={{ ["--d" as string]: `${i * 90}ms` } as React.CSSProperties}>
                  <span className="ic" style={{ ["--c" as string]: c.ok ? "var(--ok)" : "var(--off)" } as React.CSSProperties}>
                    {c.ok ? <Unlock size={16} /> : <Lock size={16} />}
                  </span>
                  <p>
                    {c.text}
                    <small>{c.ok ? "Verified against the live database" : c.need}</small>
                  </p>
                  <div className="adx-acts">
                    <button className="adm-btn sm" disabled={!c.ok} onClick={() => copy(c.k, c.text)}>
                      {copied === c.k ? <Check size={13} /> : <Copy size={13} />} {copied === c.k ? "Copied" : "Copy"}
                    </button>
                    <a
                      className="adm-btn sm icon"
                      aria-disabled={!c.ok}
                      style={c.ok ? undefined : { pointerEvents: "none", opacity: 0.45 }}
                      href={`https://wa.me/?text=${encodeURIComponent(c.text)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Share on WhatsApp"
                      title="Share on WhatsApp"
                    >
                      <MessageCircle size={14} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="adx-hint" style={{ marginTop: 14 }}>
            Rule of thumb: raise MIN_SHOW in Trust.tsx as you grow, so the website and these sentences only ever show numbers you are proud of. Never edit a number by hand.
          </p>
        </div>
      </div>
    </section>
  );
}