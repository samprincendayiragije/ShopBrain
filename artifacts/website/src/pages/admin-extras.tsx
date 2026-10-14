import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, MessageCircle, SkipForward, CheckCircle2, Send, UserX, Filter, StickyNote } from "lucide-react";

// =============================================================================
// Shop Brain admin extras. Drop next to Admin.tsx and import from it.
// No new backend endpoints. No libraries. Animations use transform/opacity
// (plus one tiny @property angle for the glowing border) and switch off for
// prefers-reduced-motion.
//
// Change in this version: the renewal queue now counts only the reminders you
// actually opened (not skipped ones) in its completion message, and the
// confetti only fires when at least one reminder was sent.
// =============================================================================

const DAY = 86400000;
const SENT_KEY = "shopbrain_admin_reminded";
const NOTES_KEY = "shopbrain_admin_notes";

export interface ExOwner {
  phone: string;
  name: string | null;
  language: string | null;
  createdAt: string;
  trialEndsAt: string | null;
  isActive: boolean;
  customerCount: number;
  totalOutstanding: number;
  bucket: string;
  daysLeft: number | null;
}

const digits = (s: string) => s.replace(/\D/g, "");
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const label = (o: { name: string | null; phone: string }) => o.name || o.phone;
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
// CSS: append to your existing sheet:  <style>{ADM_CSS + EXTRAS_CSS}</style>
// ---------------------------------------------------------------------------

export const EXTRAS_CSS = `
@property --ang{syntax:'<angle>';initial-value:0deg;inherits:false}
@keyframes adm-ang{to{--ang:360deg}}

/* 3D tilt on KPI cards (driven by extrasPointerMove) */
.adm-kpi.adm-tilt{transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .18s ease-out,border-color .25s,box-shadow .25s;will-change:transform}
.adm-kpi.adm-tilt:hover{transform:perspective(900px) translateY(-3px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))}

/* animated conic border for panels that need attention */
.adm-glowborder{position:relative}
.adm-glowborder::before{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1px;pointer-events:none;
  background:conic-gradient(from var(--ang),transparent 0 72%,var(--warn),transparent);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;
  animation:adm-ang 4.5s linear infinite}

/* sheen sweep on primary buttons */
.adm-btn.pri{position:relative;overflow:hidden}
.adm-btn.pri::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);transform:translateX(-130%)}
.adm-btn.pri:hover:not(:disabled)::after{transform:translateX(130%);transition:transform .75s var(--ease)}

/* indeterminate top progress bar while refreshing */
.adm-topbar{position:fixed;top:0;left:0;right:0;height:3px;z-index:120;overflow:hidden;opacity:0;transition:opacity .25s;pointer-events:none}
.adm-topbar.on{opacity:1}
.adm-topbar i{position:absolute;top:0;bottom:0;left:0;width:40%;background:linear-gradient(90deg,transparent,var(--pri),transparent);animation:adm-topbar 1.1s var(--ease) infinite}
@keyframes adm-topbar{from{transform:translateX(-100%)}to{transform:translateX(260%)}}

/* funnel + inactive shops */
.adm-duo{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px}
@media (max-width:900px){.adm-duo{grid-template-columns:1fr}}
.adm-fun{display:grid;gap:12px}
.adm-fun .adm-brow{grid-template-columns:minmax(110px,150px) 1fr auto}
.adm-fun .adm-btrack{height:14px;border-radius:7px}
.adm-fun .adm-btrack i{border-radius:7px}
.adm-note{margin:10px 0 0;font-size:11.5px;color:var(--mutfg)}
.adm-idle{display:grid;gap:8px}
.adm-idleitem{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--bd);border-radius:12px;background:var(--mut);animation:adm-rowin .5s var(--ease) both;animation-delay:calc(var(--i,0) * 50ms);transition:transform .3s var(--spring),border-color .2s}
.adm-idleitem:hover{transform:translateX(3px);border-color:color-mix(in srgb,var(--pri) 45%,var(--bd))}
.adm-idleitem .who{flex:1;min-width:0}
.adm-idleitem .who b{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-idleitem .who span{font-size:11.5px;color:var(--mutfg)}

/* health pill */
.adm-health{display:inline-flex;align-items:center;gap:6px;margin-top:5px;font-size:11px;font-weight:700;color:var(--c)}
.adm-health i{display:block;width:34px;height:4px;border-radius:2px;background:var(--mut);overflow:hidden}
.adm-health i b{display:block;height:100%;background:var(--c);transform-origin:0 50%;animation:adm-growx .9s var(--ease) both}

/* renewal queue */
.adm-q{text-align:center}
.adm-q .prog{height:5px;border-radius:3px;background:var(--mut);overflow:hidden;margin:4px 0 18px}
.adm-q .prog i{display:block;height:100%;background:var(--pri);transition:transform .45s var(--ease);transform-origin:0 50%}
.adm-q .cur{animation:adm-qin .5s var(--spring) both}
@keyframes adm-qin{from{opacity:0;transform:translateX(34px) scale(.96)}to{opacity:1;transform:none}}
.adm-q .cur .adm-avatar{width:64px;height:64px;font-size:20px;margin:0 auto 12px;border-radius:18px}
.adm-q .cur h3{margin:0;font-size:18px;font-weight:800}
.adm-q .cur p{margin:4px 0 0;color:var(--mutfg);font-size:13px}
.adm-q .msg{margin:14px 0;padding:12px 14px;border:1px dashed var(--bd);border-radius:12px;background:var(--mut);font-size:12.5px;text-align:left}
.adm-q .done{display:grid;place-items:center;gap:10px;padding:26px 0}
.adm-q .done svg{color:var(--ok);animation:adm-pop .6s var(--spring) both}

/* notes */
.adm-notes textarea{width:100%;min-height:84px;resize:vertical;padding:10px 12px;border:1px solid var(--bd);border-radius:12px;background:var(--bg);color:var(--fg);font:inherit;font-size:13px;transition:border-color .2s,box-shadow .25s}
.adm-notes textarea:focus{outline:0;border-color:var(--pri);box-shadow:0 0 0 4px color-mix(in srgb,var(--pri) 16%,transparent)}

@media (prefers-reduced-motion:reduce){
  .adm-kpi.adm-tilt{transform:none !important}
  .adm-glowborder::before{animation:none}
  .adm-topbar i{animation-duration:.01ms}
}
`;

// ---------------------------------------------------------------------------
// Pointer-driven 3D tilt. Call inside your existing onPointerMove.
// ---------------------------------------------------------------------------

let lastTilt: HTMLElement | null = null;
const resetTilt = (el: HTMLElement) => {
  el.style.setProperty("--rx", "0deg");
  el.style.setProperty("--ry", "0deg");
};
export function extrasPointerMove(e: React.PointerEvent) {
  if (reduced() || e.pointerType === "touch") return;
  const el = (e.target as Element).closest?.(".adm-tilt") as HTMLElement | null;
  if (lastTilt && lastTilt !== el) resetTilt(lastTilt);
  if (!el) {
    lastTilt = null;
    return;
  }
  const r = el.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width - 0.5;
  const py = (e.clientY - r.top) / r.height - 0.5;
  el.style.setProperty("--ry", `${(px * 9).toFixed(2)}deg`);
  el.style.setProperty("--rx", `${(-py * 9).toFixed(2)}deg`);
  lastTilt = el;
}

// ---------------------------------------------------------------------------
// Confetti burst (Web Animations API, self-cleaning)
// ---------------------------------------------------------------------------

export function burst(x: number, y: number, n = 22) {
  if (reduced() || typeof document === "undefined") return;
  const colors = ["#34d399", "#fbbf24", "#a78bfa", "#60a5fa", "#f87171"];
  for (let i = 0; i < n; i++) {
    const el = document.createElement("i");
    const s = 5 + Math.random() * 5;
    Object.assign(el.style, {
      position: "fixed", left: `${x}px`, top: `${y}px`, width: `${s}px`, height: `${s * 1.4}px`, borderRadius: "2px",
      background: colors[i % colors.length], zIndex: "200", pointerEvents: "none",
    });
    document.body.appendChild(el);
    const a = Math.random() * Math.PI * 2;
    const d = 70 + Math.random() * 110;
    const anim = el.animate(
      [
        { transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 60}px) rotate(${Math.random() * 720}deg) scale(.4)`, opacity: 0 },
      ],
      { duration: 800 + Math.random() * 500, easing: "cubic-bezier(.16,1,.3,1)" }
    );
    anim.onfinish = () => el.remove();
  }
}

// ---------------------------------------------------------------------------
// Top progress bar. Render once inside .adm-root.
// ---------------------------------------------------------------------------

export function RefreshBar({ active }: { active: boolean }) {
  return (
    <div className={`adm-topbar ${active ? "on" : ""}`} aria-hidden>
      <i />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health score. A heuristic, not science: tune the numbers once you have data.
// ---------------------------------------------------------------------------

export function health(o: ExOwner): { score: number; label: string; color: string } {
  if (!o.isActive) return { score: 0, label: "Off", color: "var(--off)" };
  let s = 50;
  if (o.customerCount >= 10) s += 30;
  else if (o.customerCount >= 3) s += 18;
  else if (o.customerCount >= 1) s += 8;
  else s -= 20;
  if (o.totalOutstanding > 0) s += 10;
  const age = (Date.now() - Date.parse(o.createdAt)) / DAY;
  if (o.customerCount === 0 && age > 7) s -= 15;
  if (o.daysLeft !== null) {
    if (o.daysLeft < 0) s -= 30;
    else if (o.daysLeft <= 7) s -= 10;
  }
  s = clamp(Math.round(s), 0, 100);
  return s >= 70 ? { score: s, label: "Healthy", color: "var(--ok)" } : s >= 40 ? { score: s, label: "Watch", color: "var(--warn)" } : { score: s, label: "At risk", color: "var(--bad)" };
}

export function HealthPill({ o }: { o: ExOwner }) {
  const h = health(o);
  return (
    <span className="adm-health" style={{ ["--c" as string]: h.color } as React.CSSProperties} title={`Health ${h.score}/100 (customers, balances, access)`}>
      <i>
        <b style={{ width: `${Math.max(6, h.score)}%` }} />
      </i>
      {h.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Activation funnel: the number that actually tells you if the product works.
// ---------------------------------------------------------------------------

export function FunnelPanel({ owners }: { owners: ExOwner[] }) {
  const total = owners.length;
  const steps = [
    { l: "Signed up", n: total },
    { l: "Added a customer", n: owners.filter((o) => o.customerCount >= 1).length },
    { l: "Added 5+ customers", n: owners.filter((o) => o.customerCount >= 5).length },
    { l: "Still has access", n: owners.filter((o) => o.isActive && o.bucket !== "expired").length },
  ];
  return (
    <div className="adm-card adm-spot adm-panel adm-in" style={{ ["--i" as string]: 9 } as React.CSSProperties}>
      <h3>
        <Filter size={15} /> Activation funnel
      </h3>
      <div className="adm-fun">
        {steps.map((s, i) => (
          <div key={s.l} className="adm-brow" style={{ ["--i" as string]: i } as React.CSSProperties}>
            <span className="n">{s.l}</span>
            <span className="adm-btrack">
              <i style={{ width: `${total ? Math.max(s.n ? 3 : 0, (s.n / total) * 100) : 0}%`, ["--i" as string]: i } as React.CSSProperties} />
            </span>
            <b>
              {s.n} · {total ? Math.round((s.n / total) * 100) : 0}%
            </b>
          </div>
        ))}
      </div>
      <p className="adm-note">If "Added a customer" is low, shops sign up but never use it. Fix onboarding before chasing more signups.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inactive shops: active access, joined 3+ days ago, zero customers.
// ---------------------------------------------------------------------------

function nudge(o: ExOwner) {
  const n = o.name ? ` ${o.name}` : "";
  return o.language === "rw"
    ? `Muraho${n}, mwabashije gutangira gukoresha Shop Brain? Nimutwandikira hano tubafashe kwandika abakiriya bawe ba mbere.`
    : `Hello${n}, how is Shop Brain going? Reply here and I'll help you add your first customers in two minutes.`;
}

export function InactivePanel({ owners, waLink }: { owners: ExOwner[]; waLink: (phone: string, text?: string) => string }) {
  const list = useMemo(
    () => owners.filter((o) => o.isActive && o.customerCount === 0 && Date.now() - Date.parse(o.createdAt) > 3 * DAY).slice(0, 6),
    [owners]
  );
  return (
    <div className="adm-card adm-spot adm-panel adm-in" style={{ ["--i" as string]: 10 } as React.CSSProperties}>
      <h3>
        <UserX size={15} /> Signed up, never used it
      </h3>
      {list.length === 0 ? (
        <p style={{ color: "var(--mutfg)", margin: 0 }}>Every active shop has added at least one customer.</p>
      ) : (
        <div className="adm-idle">
          {list.map((o, i) => (
            <div key={o.phone} className="adm-idleitem" style={{ ["--i" as string]: i } as React.CSSProperties}>
              <div className="who">
                <b>{label(o)}</b>
                <span>Joined {Math.floor((Date.now() - Date.parse(o.createdAt)) / DAY)} days ago, 0 customers</span>
              </div>
              <a className="adm-btn sm" href={waLink(o.phone, nudge(o))} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={13} /> Nudge
              </a>
            </div>
          ))}
        </div>
      )}
      <p className="adm-note">A personal WhatsApp message to these shops beats any new dashboard feature.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Renewal queue: steps through owners who need a reminder, one WhatsApp at a
// time. Remembers who you already messaged today (this browser only).
// This is manual sending via wa.me, not automation.
// ---------------------------------------------------------------------------

function loadSent(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) || "{}");
  } catch {
    return {};
  }
}

export function RenewalQueue({
  owners, getMessage, link, onClose,
}: {
  owners: ExOwner[];
  getMessage: (o: ExOwner) => string;
  link: (phone: string, text?: string) => string;
  onClose: () => void;
}) {
  const [sent, setSent] = useState(loadSent);
  const [queue] = useState(() => owners.filter((o) => !(sent[o.phone] && Date.now() - sent[o.phone] < DAY)));
  const [idx, setIdx] = useState(0);
  const [sentN, setSentN] = useState(0); // reminders opened in THIS session (skips are not counted)
  const cur = queue[idx];
  const done = idx >= queue.length;
  const burstDone = useRef(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    if (done && queue.length > 0 && sentN > 0 && !burstDone.current) {
      burstDone.current = true;
      burst(window.innerWidth / 2, window.innerHeight / 2.4, 36);
    }
  }, [done, queue.length, sentN]);

  const mark = (phone: string) => {
    setSentN((n) => n + 1);
    const next = { ...sent, [phone]: Date.now() };
    setSent(next);
    try {
      localStorage.setItem(SENT_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    setTimeout(() => setIdx((i) => i + 1), 350);
  };

  return (
    <div className="adm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="adm-modal adm-q" role="dialog" aria-modal="true" style={{ maxWidth: 440 }}>
        <div className="adm-mh">
          <h2>Renewal queue</h2>
          <button className="adm-btn sm icon ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {queue.length === 0 ? (
          <div className="done">
            <CheckCircle2 size={44} />
            <b>Everyone due has already been messaged today.</b>
          </div>
        ) : done ? (
          <div className="done">
            <CheckCircle2 size={48} />
            <b>
              {sentN === 0
                ? "Queue finished. No reminders were sent."
                : `Queue cleared. ${sentN} reminder${sentN === 1 ? "" : "s"} sent.`}
            </b>
            <button className="adm-btn pri" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="prog" aria-label={`${idx} of ${queue.length}`}>
              <i style={{ transform: `scaleX(${idx / queue.length})` }} />
            </div>
            <div className="cur" key={cur.phone}>
              <span className="adm-avatar" style={{ ["--h" as string]: [...cur.phone].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0) } as React.CSSProperties}>
                {(label(cur)[0] || "?").toUpperCase()}
              </span>
              <h3>{label(cur)}</h3>
              <p>
                {cur.daysLeft !== null && cur.daysLeft < 0 ? `Ended ${-cur.daysLeft} day${cur.daysLeft === -1 ? "" : "s"} ago` : `Ends in ${cur.daysLeft ?? "?"} day${cur.daysLeft === 1 ? "" : "s"}`} · {cur.customerCount} customers
              </p>
              <div className="msg">{getMessage(cur)}</div>
              <div className="adm-mf" style={{ marginTop: 0 }}>
                <button className="adm-btn" onClick={() => setIdx((i) => i + 1)}>
                  <SkipForward size={14} /> Skip
                </button>
                <a className="adm-btn pri" href={link(cur.phone, getMessage(cur))} target="_blank" rel="noopener noreferrer" onClick={() => mark(cur.phone)}>
                  <Send size={14} /> Open WhatsApp
                </a>
              </div>
              <p style={{ marginTop: 10, fontSize: 11.5 }}>{idx + 1} of {queue.length}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Private notes per shop. Stored in THIS browser's localStorage only, so they
// are not synced across devices and not visible to anyone else.
// ---------------------------------------------------------------------------

export function NotesBox({ phone }: { phone: string }) {
  const read = () => {
    try {
      return (JSON.parse(localStorage.getItem(NOTES_KEY) || "{}") as Record<string, string>)[phone] ?? "";
    } catch {
      return "";
    }
  };
  const [text, setText] = useState(read);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    setText(read());
    setSaved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);
  useEffect(() => {
    if (saved) return;
    const id = setTimeout(() => {
      try {
        const all = JSON.parse(localStorage.getItem(NOTES_KEY) || "{}") as Record<string, string>;
        if (text.trim()) all[phone] = text;
        else delete all[phone];
        localStorage.setItem(NOTES_KEY, JSON.stringify(all));
      } catch {
        /* ignore */
      }
      setSaved(true);
    }, 500);
    return () => clearTimeout(id);
  }, [text, saved, phone]);
  return (
    <div className="adm-notes" style={{ marginTop: 20 }}>
      <p className="adm-sec">
        <StickyNote size={12} style={{ verticalAlign: -1 }} /> Private notes <small style={{ fontWeight: 500, textTransform: "none" }}>{saved ? "saved on this device" : "saving…"}</small>
      </p>
      <textarea
        value={text}
        placeholder="Promised discount, said call after Friday, owes me feedback…"
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
      />
    </div>
  );
}