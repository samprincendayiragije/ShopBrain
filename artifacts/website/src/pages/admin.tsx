import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  LockKeyhole, ArrowLeft, Loader2, RefreshCw, MessageCircle, CheckCircle2, AlertTriangle, XCircle, Clock, Pencil, Trash2, Ban,
  PlayCircle, X, UserPlus, Users, Check, Search, Download, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Copy, Activity,
  LayoutGrid, List, Eye, EyeOff, Command, Zap, Bell, Inbox, TrendingUp, Calendar, Send,
} from "lucide-react";
import { EXTRAS_CSS, extrasPointerMove, burst, RefreshBar, FunnelPanel, InactivePanel, RenewalQueue, NotesBox, HealthPill } from "./admin-extras";

// =============================================================================
// Shop Brain admin dashboard
//
// Backend contract (unchanged, nothing new is required from your server):
//   POST   /admin/verify                    GET   /admin/owners        POST /admin/owners
//   PATCH  /admin/owners/:phone             DELETE /admin/owners/:phone
//   POST   /admin/owners/:phone/extend      POST  .../activate | .../deactivate
//   GET    /admin/owners/:phone/customers   PATCH /admin/customers/:id
//
// Everything below is built on those endpoints: search, filters, sorting,
// pagination, bulk actions, CSV export, charts, an owner drawer, an attention
// list, renewal messages, undo, a command palette (Ctrl/Cmd+K), live refresh,
// an activity log and idle sign-out. Extras (admin-extras.tsx): activation
// funnel, inactive-shop nudges, renewal queue, private notes, health pill,
// tilt/confetti/progress animations. All animation is CSS or WAAPI
// (transform/opacity), and it switches off for reduced motion.
// =============================================================================

const ADMIN_API_BASE = import.meta.env.VITE_ADMIN_API_URL as string | undefined;
const SESSION_KEY = "shopbrain_admin_password";
const PREFS_KEY = "shopbrain_admin_prefs";
const LOG_KEY = "shopbrain_admin_activity";
const IDLE_MS = 30 * 60 * 1000;
const DAY = 86400000;
const WEEK = 7 * DAY;

type OwnerStatus = "no_trial" | "active" | "expiring" | "expired";
type Bucket = OwnerStatus | "deactivated";

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
interface EOwner extends Owner {
  bucket: Bucket;
  daysLeft: number | null;
  elapsed: number | null; // 0..1 share of the access period already used
}
interface Customer {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string;
  totalOwed: number;
}
type ToastItem = { id: number; kind: "success" | "error" | "info"; title: string; desc?: string; ttl: number; action?: { label: string; run: () => void } };
type ActivityItem = { id: number; at: number; text: string; ok: boolean };
type SortKey = "default" | "name" | "created" | "expiry" | "customers" | "outstanding";
type Prefs = { density: "comfy" | "compact"; view: "table" | "cards"; pageSize: number; auto: boolean };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const enc = encodeURIComponent;
const prefersReduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const money = (n: number) => `${n.toLocaleString()} Frw`;
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const digits = (s: string) => s.replace(/\D/g, "");
const tail9 = (s: string) => digits(s).slice(-9);
const label = (o: { name: string | null; phone: string }) => o.name || o.phone;

// Human-readable registration timestamp including the exact hour, e.g.
// "3 Sept 2026, 14:32" so customers added on the same day can be told apart.
function formatCustomerTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function relDays(d: number | null) {
  if (d === null) return "no date";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function initials(name: string | null, phone: string) {
  const w = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (w.length) return (w[0][0] + (w[1]?.[0] ?? "")).toUpperCase();
  return digits(phone).slice(-2) || "?";
}
function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

const waLink = (phone: string, text?: string) => `https://wa.me/${digits(phone)}${text ? `?text=${enc(text)}` : ""}`;

function renewalMessage(o: EOwner) {
  const n = o.name ? ` ${o.name}` : "";
  const date = fmtDate(o.trialEndsAt);
  const ended = o.daysLeft !== null && o.daysLeft < 0;
  if (o.language === "rw")
    return ended
      ? `Muraho${n}, uburenganzira bwawe kuri Shop Brain bwarangiye ku wa ${date}. Twandikire tubwongere.`
      : `Muraho${n}, uburenganzira bwawe kuri Shop Brain buzarangira ku wa ${date}. Twandikire tubwongere.`;
  return ended
    ? `Hello${n}, your Shop Brain access ended on ${date}. Reply here and we will extend it for you.`
    : `Hello${n}, your Shop Brain access ends on ${date}. Reply here and we will extend it for you.`;
}

const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  // stop spreadsheet formula injection from user-typed names
  if (/^[=@]/.test(s) || (/^[+\-]/.test(s) && !/^[+\-]\d[\d\s-]*$/.test(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  const text = "\ufeff" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const stamp = () => new Date().toISOString().slice(0, 10);

function errMsg(e: unknown, fallback = "Something went wrong.") {
  if (e instanceof TypeError) return "Network error. Check your connection and try again.";
  return e instanceof Error && e.message ? e.message : fallback;
}

const BUCKETS: { key: Bucket; label: string; color: string }[] = [
  { key: "active", label: "Active", color: "var(--ok)" },
  { key: "expiring", label: "Expiring soon", color: "#f59e0b" },
  { key: "expired", label: "Expired", color: "var(--bad)" },
  { key: "deactivated", label: "Deactivated", color: "var(--off)" },
  { key: "no_trial", label: "No trial set", color: "#a78bfa" },
];

function loadPrefs(): Prefs {
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  const base: Prefs = { density: "comfy", view: narrow ? "cards" : "table", pageSize: 10, auto: false };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return base;
  }
}
function loadLog(): ActivityItem[] {
  try {
    return JSON.parse(sessionStorage.getItem(LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Small hooks
// ---------------------------------------------------------------------------

function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(prefersReduced() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (prefersReduced()) {
      setV(target);
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const val = a + (target - a) * (1 - Math.pow(1 - p, 3));
      from.current = val;
      setV(val);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return Math.round(v);
}

// Escape closes only the top-most layer (palette over drawer over page).
const escStack: number[] = [];
let escId = 0;
function useEscape(onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    const id = ++escId;
    escStack.push(id);
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && escStack[escStack.length - 1] === id) cb.current();
    };
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("keydown", h);
      const i = escStack.indexOf(id);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, []);
}

let lockCount = 0;
function useScrollLock() {
  useEffect(() => {
    if (lockCount++ === 0) document.body.style.overflow = "hidden";
    return () => {
      if (--lockCount === 0) document.body.style.overflow = "";
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Styles (self-contained; colours come from your theme tokens)
// ---------------------------------------------------------------------------

const ADM_CSS = `
.adm-root{--bg:hsl(var(--background,0 0% 100%));--fg:hsl(var(--foreground,222 47% 11%));--card:hsl(var(--card,0 0% 100%));--bd:hsl(var(--border,214 32% 91%));--mut:hsl(var(--muted,210 40% 96%));--mutfg:hsl(var(--muted-foreground,215 16% 40%));--pri:hsl(var(--primary,150 70% 28%));--prifg:hsl(var(--primary-foreground,0 0% 100%));
  --ok:#059669;--warn:#b45309;--bad:#dc2626;--off:#64748b;--viol:#7c3aed;
  --ease:cubic-bezier(.16,1,.3,1);--spring:cubic-bezier(.34,1.56,.64,1);
  position:relative;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--fg);font-size:14px;line-height:1.45}
.dark .adm-root{--ok:#34d399;--warn:#fbbf24;--bad:#f87171;--off:#94a3b8;--viol:#a78bfa}
.adm-root *,.adm-root *::before,.adm-root *::after{box-sizing:border-box}
.adm-root button{font:inherit;color:inherit;cursor:pointer}
.adm-root button:disabled{cursor:not-allowed}
.adm-root :focus-visible{outline:2px solid var(--pri);outline-offset:2px}

.adm-aurora{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden}
.adm-aurora::before,.adm-aurora::after{content:"";position:absolute;width:60vmax;height:60vmax;border-radius:50%;animation:adm-drift 30s ease-in-out infinite alternate}
.adm-aurora::before{top:-26vmax;right:-16vmax;background:radial-gradient(circle,color-mix(in srgb,var(--pri) 20%,transparent),transparent 62%)}
.adm-aurora::after{bottom:-32vmax;left:-22vmax;background:radial-gradient(circle,rgba(255,201,51,.12),transparent 62%);animation-duration:38s;animation-direction:alternate-reverse}
@keyframes adm-drift{to{transform:translate3d(-7vmax,5vmax,0) scale(1.12)}}
@media (max-width:760px){.adm-aurora{display:none}}

.adm-wrap{position:relative;z-index:1;max-width:1280px;margin:0 auto;padding:28px 20px 120px}
@keyframes adm-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.adm-in{animation:adm-in .65s var(--ease) both;animation-delay:calc(var(--i,0) * 55ms)}

/* header */
.adm-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.adm-title{margin:0;font-size:28px;font-weight:800;letter-spacing:-.02em;background:linear-gradient(100deg,var(--fg) 30%,var(--pri));-webkit-background-clip:text;background-clip:text;color:transparent}
.adm-sub{margin:4px 0 0;color:var(--mutfg);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.adm-live{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--mutfg)}
.adm-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);position:relative}
.adm-dot::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--ok);animation:adm-pulse 2s ease-out infinite}
.adm-dot.off{background:var(--off)}.adm-dot.off::after{display:none}
@keyframes adm-pulse{from{transform:scale(1);opacity:.55}to{transform:scale(3);opacity:0}}
.adm-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}

.adm-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:36px;padding:0 13px;border:1px solid var(--bd);border-radius:10px;background:var(--card);font-size:13px;font-weight:600;white-space:nowrap;transition:transform .2s var(--spring),background .2s,border-color .2s,box-shadow .2s}
.adm-btn:hover:not(:disabled){background:var(--mut);transform:translateY(-1px)}
.adm-btn:active:not(:disabled){transform:scale(.97)}
.adm-btn:disabled{opacity:.55}
.adm-btn.pri{background:var(--pri);border-color:var(--pri);color:var(--prifg)}
.adm-btn.pri:hover:not(:disabled){background:var(--pri);filter:brightness(1.1);box-shadow:0 8px 22px -8px var(--pri)}
.adm-btn.danger{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 40%,var(--bd))}
.adm-btn.danger:hover:not(:disabled){background:color-mix(in srgb,var(--bad) 10%,transparent)}
.adm-btn.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,var(--bd))}
.adm-btn.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,var(--bd))}
.adm-btn.sm{height:30px;padding:0 10px;font-size:12px;border-radius:8px}
.adm-btn.icon{width:30px;padding:0}
.adm-btn.ghost{background:transparent;border-color:transparent}
.adm-kbd{font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:3px 5px;border:1px solid var(--bd);border-radius:5px;color:var(--mutfg);background:var(--mut)}
.adm-spin{animation:adm-spin .8s linear infinite}
@keyframes adm-spin{to{transform:rotate(360deg)}}
.adm-ringsvg{width:16px;height:16px;transform:rotate(-90deg)}
.adm-ringsvg circle{fill:none;stroke-width:3}
.adm-ringsvg .bg{stroke:var(--bd)}.adm-ringsvg .fg{stroke:var(--pri);stroke-dasharray:44;animation:adm-ring linear infinite}
@keyframes adm-ring{from{stroke-dashoffset:44}to{stroke-dashoffset:0}}

/* cards + spotlight */
.adm-card{position:relative;background:var(--card);border:1px solid var(--bd);border-radius:16px}
.adm-spot::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .4s;background:radial-gradient(360px circle at var(--mx,50%) var(--my,50%),color-mix(in srgb,var(--pri) 14%,transparent),transparent 60%)}
.adm-spot:hover::after{opacity:1}

.adm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:14px}
.adm-kpi{padding:16px 16px 14px;text-align:left;overflow:hidden;transition:transform .35s var(--spring),border-color .25s,box-shadow .25s}
.adm-kpi:hover{transform:translateY(-3px);box-shadow:0 14px 30px -18px rgba(0,0,0,.35)}
.adm-kpi.is-on{border-color:var(--pri);box-shadow:0 0 0 1px var(--pri)}
.adm-kpi .top{display:flex;align-items:center;justify-content:space-between;color:var(--mutfg);font-size:12px;font-weight:600}
.adm-kpi .ico{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--c,var(--pri)) 14%,transparent);color:var(--c,var(--pri));transition:transform .4s var(--spring)}
.adm-kpi:hover .ico{transform:rotate(-8deg) scale(1.12)}
.adm-kpi .val{margin-top:10px;font-size:26px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.adm-kpi .val small{font-size:13px;font-weight:600;color:var(--mutfg);margin-left:4px}
.adm-kpi .hint{margin-top:2px;font-size:11.5px;color:var(--mutfg)}

.adm-grid2{display:grid;grid-template-columns:1.1fr 1.4fr 1fr;gap:12px;margin-bottom:22px}
@media (max-width:1100px){.adm-grid2{grid-template-columns:1fr 1fr}}
@media (max-width:760px){.adm-grid2{grid-template-columns:1fr}}
.adm-panel{padding:16px 18px;overflow:hidden}
.adm-panel h3{margin:0 0 12px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px}
.adm-panel h3 svg{color:var(--pri)}
.adm-donutwrap{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.adm-donut{width:132px;height:132px;flex:none}
.adm-seg{fill:none;stroke-linecap:butt;cursor:pointer;transform-origin:60px 60px;animation:adm-seg 1.1s var(--ease) both;animation-delay:calc(var(--i,0) * 90ms);transition:stroke-width .25s}
@keyframes adm-seg{from{stroke-dasharray:0 var(--C)}}
.adm-donut text{text-anchor:middle;fill:var(--fg);font-weight:800}
.adm-legend{display:grid;gap:5px;flex:1;min-width:130px}
.adm-legend button{display:flex;align-items:center;gap:8px;border:0;background:transparent;padding:3px 6px;border-radius:7px;text-align:left;font-size:12.5px;transition:background .2s}
.adm-legend button:hover,.adm-legend button.on{background:var(--mut)}
.adm-legend i{width:9px;height:9px;border-radius:3px;flex:none}
.adm-legend b{margin-left:auto;font-variant-numeric:tabular-nums}
.adm-bars{display:grid;gap:9px}
.adm-brow{display:grid;grid-template-columns:minmax(70px,120px) 1fr auto;align-items:center;gap:10px;border:0;background:transparent;padding:2px 0;text-align:left;font-size:12.5px}
.adm-brow span.n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-brow:hover span.n{color:var(--pri)}
.adm-btrack{height:9px;border-radius:5px;background:var(--mut);overflow:hidden}
.adm-btrack i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--pri),color-mix(in srgb,var(--pri) 55%,#facc15));transform-origin:0 50%;animation:adm-growx .9s var(--ease) both;animation-delay:calc(var(--i,0) * 70ms + 200ms)}
@keyframes adm-growx{from{transform:scaleX(0)}}
.adm-brow b{font-variant-numeric:tabular-nums;font-size:12px}
.adm-sign{display:flex;align-items:flex-end;gap:7px;height:96px}
.adm-sign div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px;height:100%}
.adm-sign i{display:block;width:100%;min-height:3px;border-radius:5px 5px 2px 2px;background:linear-gradient(0deg,var(--pri),color-mix(in srgb,var(--pri) 50%,#a7f3d0));transform-origin:50% 100%;animation:adm-growy .8s var(--ease) both;animation-delay:calc(var(--i,0) * 60ms + 250ms)}
@keyframes adm-growy{from{transform:scaleY(0)}}
.adm-sign small{font-size:10px;color:var(--mutfg)}
.adm-sign span{font-size:10.5px;font-weight:700;font-variant-numeric:tabular-nums}
.adm-trend{font-size:12px;color:var(--mutfg);margin:8px 0 0}
.adm-trend b{color:var(--ok)}

/* attention */
.adm-attn{margin-bottom:22px;padding:16px 18px}
.adm-attn h3{margin:0 0 12px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px}
.adm-attn h3 svg{color:var(--warn);animation:adm-ring-bell 3s ease-in-out infinite;transform-origin:50% 0}
@keyframes adm-ring-bell{0%,88%,100%{transform:rotate(0)}91%{transform:rotate(14deg)}94%{transform:rotate(-12deg)}97%{transform:rotate(8deg)}}
.adm-attnlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px}
.adm-attnitem{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--bd);border-radius:12px;background:var(--mut);transition:transform .3s var(--spring),border-color .2s}
.adm-attnitem:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--warn) 50%,var(--bd))}
.adm-attnitem .who{min-width:0;flex:1}
.adm-attnitem .who b{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-attnitem .who span{font-size:11.5px}
.adm-allclear{display:flex;align-items:center;gap:10px;color:var(--mutfg)}
.adm-allclear svg{color:var(--ok)}
.adm-allclear path{stroke-dasharray:30;animation:adm-draw .9s .3s var(--ease) both}
@keyframes adm-draw{from{stroke-dashoffset:30}to{stroke-dashoffset:0}}

/* toolbar */
.adm-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.adm-search{position:relative;flex:1;min-width:220px;max-width:380px}
.adm-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--mutfg);pointer-events:none}
.adm-search input{width:100%;height:38px;padding:0 64px 0 36px;border:1px solid var(--bd);border-radius:11px;background:var(--card);color:var(--fg);font:inherit;transition:border-color .2s,box-shadow .25s}
.adm-search input:focus{outline:0;border-color:var(--pri);box-shadow:0 0 0 4px color-mix(in srgb,var(--pri) 16%,transparent)}
.adm-search .r{position:absolute;right:8px;top:50%;transform:translateY(-50%);display:flex;gap:4px;align-items:center}
.adm-chips{display:flex;gap:6px;flex-wrap:wrap}
.adm-chip{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;border:1px solid var(--bd);border-radius:999px;background:var(--card);font-size:12.5px;font-weight:600;transition:all .25s var(--ease)}
.adm-chip:hover{border-color:color-mix(in srgb,var(--pri) 50%,var(--bd))}
.adm-chip.on{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.adm-chip em{font-style:normal;font-size:11px;opacity:.65;font-variant-numeric:tabular-nums}
.adm-select{height:36px;padding:0 28px 0 11px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--fg);font:inherit;font-size:13px;font-weight:600}
.adm-segbtn{display:inline-flex;padding:3px;border:1px solid var(--bd);border-radius:11px;background:var(--card);gap:2px}
.adm-segbtn button{display:grid;place-items:center;width:30px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--mutfg);transition:all .25s var(--ease)}
.adm-segbtn button.on{background:var(--fg);color:var(--bg)}
.adm-meta{margin:0 0 10px;color:var(--mutfg);font-size:12.5px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.adm-meta b{color:var(--fg);font-variant-numeric:tabular-nums}
.adm-link{border:0;background:transparent;color:var(--pri);font-weight:600;padding:0;text-decoration:underline;text-underline-offset:3px}

/* table */
.adm-tablewrap{overflow-x:auto;border-radius:16px}
.adm-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
.adm-table th{position:relative;text-align:left;padding:11px 14px;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--mutfg);background:color-mix(in srgb,var(--mut) 70%,transparent);border-bottom:1px solid var(--bd);white-space:nowrap;user-select:none}
.adm-table th.s{cursor:pointer}.adm-table th.s:hover{color:var(--fg)}
.adm-table th svg{vertical-align:-2px;margin-left:3px;transition:transform .3s var(--spring)}
.adm-table th svg.up{transform:rotate(180deg)}
.adm-table td{padding:13px 14px;border-bottom:1px solid var(--bd);vertical-align:middle}
.adm-table.compact td{padding:7px 14px}
.adm-table tr:last-child td{border-bottom:0}
.adm-tr{animation:adm-rowin .5s var(--ease) both;animation-delay:calc(var(--i,0) * 28ms);transition:background .2s}
@keyframes adm-rowin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.adm-tr:hover{background:color-mix(in srgb,var(--mut) 55%,transparent)}
.adm-tr.sel{background:color-mix(in srgb,var(--pri) 8%,transparent)}
.adm-tr.flash td{animation:adm-flash 1.6s ease-out}
@keyframes adm-flash{0%{background:color-mix(in srgb,var(--pri) 28%,transparent)}100%{background:transparent}}
.adm-tr.busy{opacity:.55;pointer-events:none}
.adm-check{width:16px;height:16px;accent-color:var(--pri);cursor:pointer}
.adm-shop{display:flex;align-items:center;gap:11px;min-width:190px}
.adm-avatar{width:36px;height:36px;border-radius:11px;flex:none;display:grid;place-items:center;font-size:12.5px;font-weight:800;color:#fff;background:linear-gradient(145deg,hsl(var(--h) 70% 48%),hsl(calc(var(--h) + 40) 70% 38%));transition:transform .35s var(--spring)}
.adm-tr:hover .adm-avatar,.adm-ocard:hover .adm-avatar{transform:rotate(-6deg) scale(1.08)}
.adm-shop .t{min-width:0}
.adm-namebtn{border:0;background:transparent;padding:0;font-weight:700;font-size:13.5px;text-align:left;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.adm-namebtn:hover{color:var(--pri);text-decoration:underline;text-underline-offset:3px}
.adm-shop small{display:block;color:var(--mutfg);font-size:11.5px}
.adm-phone{display:inline-flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums;color:var(--mutfg)}
.adm-copy{border:0;background:transparent;padding:3px;border-radius:6px;color:var(--mutfg);opacity:0;transition:opacity .2s,color .2s}
.adm-tr:hover .adm-copy,.adm-copy:focus-visible,.adm-copy.done,.adm-ocard .adm-copy{opacity:1}
.adm-copy.done{color:var(--ok)}
.adm-badge{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;white-space:nowrap}
.adm-badge.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}
.adm-badge.warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 16%,transparent)}
.adm-badge.bad{color:var(--bad);background:color-mix(in srgb,var(--bad) 13%,transparent)}
.adm-badge.off{color:var(--off);background:color-mix(in srgb,var(--off) 16%,transparent)}
.adm-badge.mut{color:var(--viol);background:color-mix(in srgb,var(--viol) 13%,transparent)}
.adm-until{display:grid;gap:5px;min-width:112px}
.adm-until small{color:var(--mutfg);font-size:11.5px}
.adm-meter{height:5px;border-radius:3px;background:var(--mut);overflow:hidden}
.adm-meter i{display:block;height:100%;border-radius:3px;background:var(--c,var(--ok));transform-origin:0 50%;animation:adm-growx .9s var(--ease) both;animation-delay:.2s}
.adm-num{font-variant-numeric:tabular-nums;font-weight:700}
.adm-out{display:grid;gap:5px;min-width:100px}
.adm-actions{display:flex;align-items:center;gap:6px;justify-content:flex-end}
.adm-split{display:inline-flex}
.adm-split .adm-btn:first-child{border-radius:8px 0 0 8px}
.adm-split .adm-btn:last-child{border-radius:0 8px 8px 0;border-left-color:color-mix(in srgb,var(--prifg) 30%,transparent);padding:0 6px}
.adm-linkbtn{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--pri);font-weight:700;padding:4px 6px;border-radius:7px}
.adm-linkbtn:hover:not(:disabled){background:color-mix(in srgb,var(--pri) 10%,transparent)}
.adm-linkbtn:disabled{color:var(--mutfg)}
.adm-lang{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:5px;background:var(--mut);font-size:10px;font-weight:700;text-transform:uppercase;color:var(--mutfg)}

/* cards view */
.adm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.adm-ocard{padding:16px;display:grid;gap:12px;animation:adm-rowin .55s var(--ease) both;animation-delay:calc(var(--i,0) * 40ms);transition:transform .35s var(--spring),border-color .2s,box-shadow .3s}
.adm-ocard:hover{transform:translateY(-3px);box-shadow:0 16px 34px -20px rgba(0,0,0,.4)}
.adm-ocard.sel{border-color:var(--pri)}
.adm-ocard .row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.adm-ocard .stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 0;border-top:1px dashed var(--bd);border-bottom:1px dashed var(--bd)}
.adm-ocard .stats small{display:block;color:var(--mutfg);font-size:11px}

/* pager */
.adm-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 4px 0;color:var(--mutfg);font-size:12.5px}
.adm-pages{display:flex;gap:4px;align-items:center}
.adm-pages button{min-width:32px;height:32px;padding:0 8px;border:1px solid var(--bd);border-radius:9px;background:var(--card);font-weight:600;transition:all .2s var(--ease)}
.adm-pages button.on{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.adm-pages button:disabled{opacity:.4}

/* bulk bar */
.adm-bulk{position:fixed;left:50%;bottom:22px;z-index:40;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 24px);padding:10px 12px;border-radius:16px;background:var(--fg);color:var(--bg);box-shadow:0 24px 60px -16px rgba(0,0,0,.55);animation:adm-bulkin .5s var(--spring) both}
@keyframes adm-bulkin{from{opacity:0;transform:translate(-50%,30px) scale(.94)}to{opacity:1;transform:translate(-50%,0)}}
.adm-bulk .adm-btn{background:transparent;color:var(--bg);border-color:color-mix(in srgb,var(--bg) 30%,transparent)}
.adm-bulk .adm-btn:hover:not(:disabled){background:color-mix(in srgb,var(--bg) 16%,transparent)}
.adm-bulk b{font-variant-numeric:tabular-nums;padding:0 8px}
.adm-bulkprog{position:absolute;left:12px;right:12px;bottom:0;height:3px;border-radius:2px;overflow:hidden;background:color-mix(in srgb,var(--bg) 25%,transparent)}
.adm-bulkprog i{display:block;height:100%;background:var(--bg);transition:width .3s var(--ease)}

/* menu */
.adm-menu{position:fixed;z-index:80;min-width:196px;padding:6px;border:1px solid var(--bd);border-radius:12px;background:var(--card);box-shadow:0 22px 50px -14px rgba(0,0,0,.45);animation:adm-pop .22s var(--spring) both;transform-origin:top right}
@keyframes adm-pop{from{opacity:0;transform:scale(.92) translateY(-4px)}to{opacity:1;transform:none}}
.adm-menu button{display:flex;align-items:center;gap:9px;width:100%;height:36px;padding:0 10px;border:0;border-radius:8px;background:transparent;font-size:13px;font-weight:600;text-align:left}
.adm-menu button:hover:not(:disabled){background:var(--mut)}
.adm-menu button.danger{color:var(--bad)}
.adm-menu button:disabled{opacity:.45}
.adm-menu hr{border:0;border-top:1px solid var(--bd);margin:5px 4px}

/* overlays */
.adm-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,12,28,.5);animation:adm-fade .25s ease both}
@keyframes adm-fade{from{opacity:0}to{opacity:1}}
.adm-modal{width:100%;max-height:calc(100dvh - 32px);overflow:auto;padding:22px;border:1px solid var(--bd);border-radius:20px;background:var(--card);box-shadow:0 40px 90px -24px rgba(0,0,0,.6);animation:adm-modal .45s var(--spring) both}
@keyframes adm-modal{from{opacity:0;transform:translateY(24px) scale(.94)}to{opacity:1;transform:none}}
.adm-mh{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.adm-mh h2{margin:0;font-size:18px;font-weight:800}
.adm-field{display:grid;gap:6px;margin-bottom:14px}
.adm-field label{font-size:12.5px;font-weight:700}
.adm-field label small{font-weight:500;color:var(--mutfg)}
.adm-field .help{font-size:11.5px;color:var(--mutfg)}
.adm-field .err{font-size:11.5px;color:var(--bad)}
.adm-input{width:100%;height:40px;padding:0 12px;border:1px solid var(--bd);border-radius:10px;background:var(--bg);color:var(--fg);font:inherit;transition:border-color .2s,box-shadow .25s}
.adm-input:focus{outline:0;border-color:var(--pri);box-shadow:0 0 0 4px color-mix(in srgb,var(--pri) 16%,transparent)}
.adm-input.bad{border-color:var(--bad)}
.adm-input.sm{height:34px;font-size:13px}
.adm-mf{display:flex;gap:10px;margin-top:18px}
.adm-mf .adm-btn{flex:1;height:40px}
.adm-shake{animation:adm-shake .45s}
@keyframes adm-shake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}
.adm-quick{display:flex;gap:6px;flex-wrap:wrap}
.adm-warnbox{display:flex;gap:10px;padding:10px 12px;border-radius:10px;font-size:12.5px;background:color-mix(in srgb,var(--warn) 13%,transparent);color:var(--warn);margin-bottom:12px}
.adm-dangerbox{padding:12px;border-radius:12px;background:color-mix(in srgb,var(--bad) 10%,transparent);color:var(--fg);font-size:12.5px;margin-bottom:14px;border:1px solid color-mix(in srgb,var(--bad) 35%,transparent)}

/* drawer */
.adm-drawerov{position:fixed;inset:0;z-index:60;background:rgba(8,12,28,.45);animation:adm-fade .25s both}
.adm-drawer{position:fixed;top:0;right:0;bottom:0;width:min(580px,100vw);z-index:61;display:flex;flex-direction:column;background:var(--card);border-left:1px solid var(--bd);box-shadow:-30px 0 80px -30px rgba(0,0,0,.55);animation:adm-slide .5s var(--ease) both}
@keyframes adm-slide{from{transform:translateX(100%)}to{transform:none}}
.adm-dh{display:flex;align-items:center;gap:14px;padding:18px 20px;border-bottom:1px solid var(--bd)}
.adm-dh .t{flex:1;min-width:0}
.adm-dh h2{margin:0;font-size:17px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-dh .avatar{width:46px;height:46px;font-size:15px}
.adm-tabs{display:flex;gap:4px;padding:10px 20px 0;border-bottom:1px solid var(--bd);position:relative}
.adm-tabs button{position:relative;border:0;background:transparent;padding:9px 12px 12px;font-weight:700;font-size:13px;color:var(--mutfg)}
.adm-tabs button.on{color:var(--fg)}
.adm-tabs button.on::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:3px;border-radius:3px 3px 0 0;background:var(--pri);animation:adm-growx .35s var(--ease)}
.adm-db{flex:1;overflow:auto;padding:18px 20px 28px}
.adm-db > *{animation:adm-in .5s var(--ease) both;animation-delay:calc(var(--i,0) * 50ms)}
.adm-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
.adm-stat{padding:12px;border:1px solid var(--bd);border-radius:12px;background:var(--mut)}
.adm-stat small{display:block;color:var(--mutfg);font-size:11px;font-weight:600}
.adm-stat b{font-size:17px;font-variant-numeric:tabular-nums}
.adm-timeline{padding:14px;border:1px solid var(--bd);border-radius:14px;margin-bottom:16px}
.adm-track{position:relative;height:8px;border-radius:5px;background:var(--mut);margin:14px 0 10px}
.adm-track i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:var(--c,var(--ok));transform-origin:0 50%;animation:adm-growx 1.1s var(--ease) .15s both}
.adm-track u{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--card);border:3px solid var(--c,var(--ok));animation:adm-in .6s var(--spring) .9s both}
.adm-tl{display:flex;justify-content:space-between;font-size:11.5px;color:var(--mutfg)}
.adm-sec{margin:0 0 8px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--mutfg)}
.adm-cust{display:grid;gap:8px}
.adm-crow{padding:11px 12px;border:1px solid var(--bd);border-radius:12px;animation:adm-rowin .45s var(--ease) both;animation-delay:calc(var(--i,0) * 30ms);transition:border-color .2s,transform .25s var(--spring)}
.adm-crow:hover{border-color:color-mix(in srgb,var(--pri) 45%,var(--bd));transform:translateX(2px)}
.adm-crow .l{display:flex;align-items:center;justify-content:space-between;gap:12px}
.adm-crow p{margin:0}.adm-crow .m{color:var(--mutfg);font-size:11.5px}
.adm-nonum{color:var(--warn)}

/* toasts */
.adm-toasts{position:fixed;right:16px;bottom:16px;z-index:100;display:grid;gap:10px;width:min(380px,calc(100vw - 32px))}
.adm-toast{position:relative;display:flex;align-items:flex-start;gap:10px;padding:12px 12px 14px;border:1px solid var(--bd);border-radius:14px;background:var(--card);box-shadow:0 20px 44px -16px rgba(0,0,0,.5);overflow:hidden;animation:adm-toast .5s var(--spring) both}
@keyframes adm-toast{from{opacity:0;transform:translateX(40px) scale(.95)}to{opacity:1;transform:none}}
.adm-toast .ic{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#fff}
.adm-t-success .ic{background:var(--ok)}.adm-t-error .ic{background:var(--bad)}.adm-t-info .ic{background:var(--pri)}
.adm-toast b{display:block;font-size:13px}.adm-toast p{margin:2px 0 0;font-size:12px;color:var(--mutfg)}
.adm-toast .g{flex:1;min-width:0}
.adm-toastbar{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--c,var(--pri));transform-origin:0 50%;animation:adm-bar linear forwards}
.adm-toast:hover .adm-toastbar{animation-play-state:paused}
.adm-t-success{--c:var(--ok)}.adm-t-error{--c:var(--bad)}
@keyframes adm-bar{to{transform:scaleX(0)}}

/* palette */
.adm-palov{align-items:flex-start;padding-top:12vh}
.adm-pal{width:min(600px,100%);overflow:hidden;border:1px solid var(--bd);border-radius:18px;background:var(--card);box-shadow:0 40px 90px -24px rgba(0,0,0,.65);animation:adm-modal .35s var(--spring) both}
.adm-pal input{width:100%;height:54px;padding:0 18px;border:0;border-bottom:1px solid var(--bd);background:transparent;color:var(--fg);font:inherit;font-size:15px}
.adm-pal input:focus{outline:0}
.adm-pal ul{list-style:none;margin:0;padding:6px;max-height:340px;overflow:auto}
.adm-pal li button{display:flex;align-items:center;gap:11px;width:100%;height:42px;padding:0 12px;border:0;border-radius:10px;background:transparent;text-align:left;font-weight:600}
.adm-pal li button.on{background:var(--mut)}
.adm-pal li small{margin-left:auto;color:var(--mutfg);font-weight:500}
.adm-pal .grp{padding:8px 12px 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--mutfg)}
.adm-pal .empty{padding:26px;text-align:center;color:var(--mutfg)}

/* activity */
.adm-log{display:grid;gap:0}
.adm-log div{display:flex;gap:12px;padding:11px 0;border-bottom:1px dashed var(--bd);animation:adm-rowin .4s var(--ease) both;animation-delay:calc(var(--i,0) * 25ms)}
.adm-log i{flex:none;width:9px;height:9px;margin-top:5px;border-radius:50%;background:var(--ok)}
.adm-log i.bad{background:var(--bad)}
.adm-log small{display:block;color:var(--mutfg);font-size:11.5px}

/* skeleton + empty */
.adm-skel{border-radius:10px;background:linear-gradient(100deg,var(--mut) 30%,color-mix(in srgb,var(--bd) 70%,var(--mut)) 50%,var(--mut) 70%);background-size:220% 100%;animation:adm-shimmer 1.4s linear infinite}
@keyframes adm-shimmer{from{background-position:120% 0}to{background-position:-120% 0}}
.adm-empty{display:grid;place-items:center;gap:10px;padding:56px 16px;text-align:center;color:var(--mutfg)}
.adm-empty svg{color:var(--pri);animation:adm-float 4s ease-in-out infinite}
@keyframes adm-float{50%{transform:translateY(-8px)}}
.adm-err{margin-bottom:14px;padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--bad) 11%,transparent);color:var(--bad);font-size:13px;display:flex;align-items:center;gap:10px;animation:adm-in .4s var(--ease)}

/* login */
.adm-login{position:relative;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--bg);color:var(--fg);overflow:hidden}
.adm-lcard{position:relative;z-index:1;width:100%;max-width:392px;padding:32px;border:1px solid var(--bd);border-radius:24px;background:var(--card);box-shadow:0 40px 90px -30px rgba(0,0,0,.5);animation:adm-modal .7s var(--spring) both}
.adm-lock{position:relative;width:54px;height:54px;margin-bottom:20px;border-radius:16px;display:grid;place-items:center;background:color-mix(in srgb,var(--pri) 14%,transparent);color:var(--pri)}
.adm-lock::after{content:"";position:absolute;inset:0;border-radius:16px;border:2px solid var(--pri);animation:adm-pulse 2.4s ease-out infinite}
.adm-lcard h1{margin:0 0 4px;font-size:22px;font-weight:800}
.adm-lcard .adm-pw{position:relative}
.adm-lcard .adm-pw button{position:absolute;right:6px;top:5px;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--mutfg)}
.adm-notice{margin-bottom:14px;padding:10px 12px;border-radius:10px;font-size:12.5px;background:color-mix(in srgb,var(--warn) 13%,transparent);color:var(--warn)}
.adm-back{display:inline-flex;align-items:center;gap:8px;margin-bottom:18px;color:var(--mutfg);font-size:13px;text-decoration:none;transition:color .2s,transform .25s var(--spring)}
.adm-back:hover{color:var(--pri);transform:translateX(-3px)}

@media (max-width:760px){.adm-wrap{padding:18px 12px 120px}.adm-title{font-size:23px}.adm-tools .hide-sm{display:none}}
@media (prefers-reduced-motion:reduce){
  .adm-root *,.adm-root *::before,.adm-root *::after{animation-duration:.01ms !important;animation-delay:0ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}
  .adm-toastbar{animation-duration:var(--ttl) !important;animation-iteration-count:1 !important}
  .adm-aurora{display:none}
}
`;

// ---------------------------------------------------------------------------
// Reusable UI pieces
// ---------------------------------------------------------------------------

function StatusBadge({ bucket }: { bucket: Bucket }) {
  const map: Record<Bucket, { label: string; cls: string; icon: React.ReactNode }> = {
    active: { label: "Active", cls: "ok", icon: <CheckCircle2 size={13} /> },
    expiring: { label: "Expiring soon", cls: "warn", icon: <Clock size={13} /> },
    expired: { label: "Expired", cls: "bad", icon: <XCircle size={13} /> },
    no_trial: { label: "No trial set", cls: "mut", icon: <AlertTriangle size={13} /> },
    deactivated: { label: "Deactivated", cls: "off", icon: <Ban size={13} /> },
  };
  const m = map[bucket];
  return (
    <span className={`adm-badge ${m.cls}`}>
      {m.icon} {m.label}
    </span>
  );
}

const bucketColor = (b: Bucket) => (b === "active" ? "var(--ok)" : b === "expiring" ? "#f59e0b" : b === "expired" ? "var(--bad)" : b === "deactivated" ? "var(--off)" : "#a78bfa");

function Avatar({ o, className = "" }: { o: { name: string | null; phone: string }; className?: string }) {
  return (
    <span className={`adm-avatar ${className}`} style={{ ["--h" as string]: hue(o.phone) } as React.CSSProperties} aria-hidden>
      {initials(o.name, o.phone)}
    </span>
  );
}

type MenuItem = { key: string; label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; testid?: string } | "sep";

// A popover menu positioned with `fixed`, so a scrolling table can never clip it.
function Menu({ trigger, items, aria, className = "adm-btn sm icon", testid }: { trigger: React.ReactNode; items: MenuItem[]; aria: string; className?: string; testid?: string }) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.(".adm-menu") && !btn.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        btn.current?.focus();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos, close]);

  const toggle = () => {
    if (pos) return close();
    const r = btn.current!.getBoundingClientRect();
    const h = items.length * 38 + 16;
    const up = r.bottom + h > window.innerHeight && r.top > h;
    setPos({ right: Math.max(8, window.innerWidth - r.right), ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
  };

  return (
    <>
      <button ref={btn} type="button" className={className} aria-haspopup="menu" aria-expanded={!!pos} aria-label={aria} onClick={toggle} data-testid={testid}>
        {trigger}
      </button>
      {pos && (
        <div className="adm-menu" role="menu" style={pos}>
          {items.map((it, i) =>
            it === "sep" ? (
              <hr key={`s${i}`} />
            ) : (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                className={it.danger ? "danger" : ""}
                disabled={it.disabled}
                data-testid={it.testid}
                onClick={() => {
                  close();
                  it.onClick();
                }}
              >
                {it.icon} {it.label}
              </button>
            )
          )}
        </div>
      )}
    </>
  );
}

function Modal({ children, onClose, width = 420 }: { children: React.ReactNode; onClose: () => void; width?: number }) {
  useEscape(onClose);
  useScrollLock();
  return (
    <div
      className="adm-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="adm-modal" role="dialog" aria-modal="true" style={{ maxWidth: width }}>
        {children}
      </div>
    </div>
  );
}

function Toasts({ items, dismiss }: { items: ToastItem[]; dismiss: (id: number) => void }) {
  return (
    <div className="adm-toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`adm-toast adm-t-${t.kind}`} role="status">
          <span className="ic">{t.kind === "error" ? <X size={14} /> : t.kind === "info" ? <Zap size={13} /> : <Check size={14} />}</span>
          <div className="g">
            <b>{t.title}</b>
            {t.desc && <p>{t.desc}</p>}
          </div>
          {t.action && (
            <button
              className="adm-linkbtn"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="adm-btn sm icon ghost" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <X size={14} />
          </button>
          <i className="adm-toastbar" style={{ animationDuration: `${t.ttl}ms`, ["--ttl" as string]: `${t.ttl}ms` } as React.CSSProperties} onAnimationEnd={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}

function LastUpdated({ at, refreshing, auto }: { at: number | null; refreshing: boolean; auto: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="adm-live" title={auto ? "Refreshing automatically every 30 seconds" : "Auto-refresh is off"}>
      <span className={`adm-dot ${auto ? "" : "off"}`} />
      {refreshing ? "Updating…" : at ? `Updated ${ago(Date.now() - at)}` : "Not loaded yet"}
      {auto && (
        <svg className="adm-ringsvg" viewBox="0 0 16 16" aria-hidden>
          <circle className="bg" cx="8" cy="8" r="7" />
          <circle key={at ?? 0} className="fg" cx="8" cy="8" r="7" style={{ animationDuration: "30s" }} />
        </svg>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Insight widgets
// ---------------------------------------------------------------------------

function Kpi({ i, label: text, value, suffix, hint, icon, color, on, onClick }: { i: number; label: string; value: number; suffix?: string; hint?: string; icon: React.ReactNode; color?: string; on?: boolean; onClick?: () => void }) {
  const v = useCountUp(value);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`adm-card adm-spot adm-kpi adm-tilt adm-in ${on ? "is-on" : ""}`}
      style={{ ["--i" as string]: i, ["--c" as string]: color } as React.CSSProperties}
      onClick={onClick}
      type={onClick ? "button" : undefined}
    >
      <div className="top">
        <span>{text}</span>
        <span className="ico">{icon}</span>
      </div>
      <div className="val">
        {v.toLocaleString()}
        {suffix && <small>{suffix}</small>}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </Tag>
  );
}

function Donut({ counts, total, filter, onPick }: { counts: Record<Bucket, number>; total: number; filter: Bucket | "all"; onPick: (b: Bucket) => void }) {
  const R = 44;
  const C = 2 * Math.PI * R;
  const [hover, setHover] = useState<Bucket | null>(null);
  const shown = hover ? BUCKETS.find((b) => b.key === hover)! : null;
  let acc = 0;
  const segs = BUCKETS.map((b, i) => {
    const len = total ? (counts[b.key] / total) * C : 0;
    const seg = { b, i, len, off: acc };
    acc += len;
    return seg;
  });
  const center = useCountUp(shown ? counts[shown.key] : total);
  return (
    <div className="adm-donutwrap">
      <svg className="adm-donut" viewBox="0 0 120 120" role="img" aria-label="Shops by status">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--mut)" strokeWidth="12" />
        <g transform="rotate(-90 60 60)">
          {segs.map(({ b, i, len, off }) =>
            len > 0 ? (
              <circle
                key={b.key}
                className="adm-seg"
                cx="60"
                cy="60"
                r={R}
                stroke={b.color}
                strokeWidth={hover === b.key || filter === b.key ? 16 : 12}
                strokeDasharray={`${Math.max(0, len - (total > counts[b.key] ? 2 : 0))} ${C}`}
                strokeDashoffset={-off}
                style={{ ["--C" as string]: C, ["--i" as string]: i } as React.CSSProperties}
                onMouseEnter={() => setHover(b.key)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onPick(b.key)}
              />
            ) : null
          )}
        </g>
        <text x="60" y="61" fontSize="22">
          {center}
        </text>
        <text x="60" y="76" fontSize="8" style={{ fontWeight: 600, fill: "var(--mutfg)" }}>
          {shown ? shown.label : "shops"}
        </text>
      </svg>
      <div className="adm-legend">
        {BUCKETS.map((b) => (
          <button key={b.key} className={filter === b.key || hover === b.key ? "on" : ""} onMouseEnter={() => setHover(b.key)} onMouseLeave={() => setHover(null)} onClick={() => onPick(b.key)}>
            <i style={{ background: b.color }} />
            {b.label}
            <b>{counts[b.key]}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface RowHandlers {
  onSel: (phone: string) => void;
  onOpen: (phone: string, tab: "overview" | "customers") => void;
  onExtend: (o: EOwner, days: number) => void;
  onEdit: (o: EOwner) => void;
  onToggle: (o: EOwner) => void;
  onRemove: (o: EOwner) => void;
  onCopy: (text: string) => void;
}

function ownerMenu(o: EOwner, h: RowHandlers): MenuItem[] {
  return [
    { key: "open", label: "Open details", icon: <Eye size={14} />, onClick: () => h.onOpen(o.phone, "overview") },
    { key: "cust", label: "View customers", icon: <Users size={14} />, onClick: () => h.onOpen(o.phone, "customers"), disabled: o.customerCount === 0 },
    { key: "copy", label: "Copy phone number", icon: <Copy size={14} />, onClick: () => h.onCopy(o.phone) },
    "sep",
    { key: "toggle", label: o.isActive ? "Deactivate" : "Activate", icon: o.isActive ? <Ban size={14} /> : <PlayCircle size={14} />, onClick: () => h.onToggle(o), testid: `button-toggle-active-${o.phone}` },
    { key: "remove", label: "Remove…", icon: <Trash2 size={14} />, danger: true, onClick: () => h.onRemove(o), testid: `button-remove-${o.phone}` },
  ];
}

function extendMenu(o: EOwner, h: RowHandlers): MenuItem[] {
  return [7, 14, 60, 90].map((d) => ({ key: `d${d}`, label: `Add ${d} days`, icon: <Calendar size={14} />, onClick: () => h.onExtend(o, d) })).concat([
    { key: "custom", label: "Custom…", icon: <Pencil size={14} />, onClick: () => h.onOpen(o.phone, "overview") },
  ]);
}

function PhoneCell({ phone, onCopy }: { phone: string; onCopy: (t: string) => void }) {
  const [done, setDone] = useState(false);
  return (
    <span className="adm-phone">
      {phone}
      <button
        type="button"
        className={`adm-copy ${done ? "done" : ""}`}
        aria-label={`Copy ${phone}`}
        onClick={() => {
          onCopy(phone);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }}
      >
        {done ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </span>
  );
}

const OwnerRow = React.memo(function OwnerRow({ o, i, selected, busy, flash, maxOut, h }: { o: EOwner; i: number; selected: boolean; busy: boolean; flash: boolean; maxOut: number; h: RowHandlers }) {
  const color = bucketColor(o.bucket);
  return (
    <tr className={`adm-tr ${selected ? "sel" : ""} ${busy ? "busy" : ""} ${flash ? "flash" : ""}`} style={{ ["--i" as string]: Math.min(i, 14) } as React.CSSProperties} data-testid={`row-owner-${o.phone}`}>
      <td>
        <input type="checkbox" className="adm-check" checked={selected} onChange={() => h.onSel(o.phone)} aria-label={`Select ${label(o)}`} />
      </td>
      <td>
        <div className="adm-shop">
          <Avatar o={o} />
          <div className="t">
            <button className="adm-namebtn" onClick={() => h.onOpen(o.phone, "overview")} title="Open details">
              {o.name ?? "—"}
            </button>
            <small>
              Joined {fmtDate(o.createdAt)}
              {o.language && <span className="adm-lang">{o.language}</span>}
            </small>
          </div>
        </div>
      </td>
      <td>
        <PhoneCell phone={o.phone} onCopy={h.onCopy} />
      </td>
      <td>
        <StatusBadge bucket={o.bucket} />
        <div>
          <HealthPill o={o} />
        </div>
      </td>
      <td>
        <div className="adm-until">
          <span>{fmtDate(o.trialEndsAt)}</span>
          {o.daysLeft !== null && <small>{relDays(o.daysLeft)}</small>}
          {o.elapsed !== null && (
            <div className="adm-meter" aria-hidden>
              <i style={{ width: `${Math.max(4, o.elapsed * 100)}%`, ["--c" as string]: color } as React.CSSProperties} />
            </div>
          )}
        </div>
      </td>
      <td>
        <button className="adm-linkbtn" onClick={() => h.onOpen(o.phone, "customers")} disabled={o.customerCount === 0} data-testid={`button-view-customers-${o.phone}`}>
          <Users size={13} /> {o.customerCount}
        </button>
      </td>
      <td>
        <div className="adm-out">
          <span className="adm-num">{money(o.totalOutstanding)}</span>
          {maxOut > 0 && (
            <div className="adm-meter" aria-hidden>
              <i style={{ width: `${Math.max(o.totalOutstanding ? 4 : 0, (o.totalOutstanding / maxOut) * 100)}%`, ["--c" as string]: "var(--pri)" } as React.CSSProperties} />
            </div>
          )}
        </div>
      </td>
      <td>
        <div className="adm-actions">
          <span className="adm-split">
            <button className="adm-btn sm pri" onClick={() => h.onExtend(o, 30)} disabled={busy} data-testid={`button-extend-${o.phone}`}>
              {busy ? <Loader2 size={13} className="adm-spin" /> : "+30 days"}
            </button>
            <Menu aria="More extension options" className="adm-btn sm pri" trigger={<ChevronDown size={13} />} items={extendMenu(o, h)} />
          </span>
          <a className="adm-btn sm icon" href={waLink(o.phone, renewalMessage(o))} target="_blank" rel="noopener noreferrer" title="Message on WhatsApp with a renewal note" aria-label="Message on WhatsApp" data-testid={`link-whatsapp-${o.phone}`}>
            <MessageCircle size={14} />
          </a>
          <button className="adm-btn sm icon" onClick={() => h.onEdit(o)} disabled={busy} aria-label="Edit" title="Edit" data-testid={`button-edit-${o.phone}`}>
            <Pencil size={14} />
          </button>
          <Menu aria="More actions" trigger={<MoreHorizontal size={15} />} items={ownerMenu(o, h)} />
        </div>
      </td>
    </tr>
  );
});

const OwnerCard = React.memo(function OwnerCard({ o, i, selected, busy, flash, maxOut, h }: { o: EOwner; i: number; selected: boolean; busy: boolean; flash: boolean; maxOut: number; h: RowHandlers }) {
  const color = bucketColor(o.bucket);
  return (
    <div className={`adm-card adm-spot adm-ocard ${selected ? "sel" : ""} ${flash ? "adm-flashcard" : ""}`} style={{ ["--i" as string]: Math.min(i, 12) } as React.CSSProperties} data-testid={`row-owner-${o.phone}`} aria-busy={busy}>
      <div className="row">
        <div className="adm-shop">
          <Avatar o={o} />
          <div className="t">
            <button className="adm-namebtn" onClick={() => h.onOpen(o.phone, "overview")}>
              {o.name ?? "—"}
            </button>
            <PhoneCell phone={o.phone} onCopy={h.onCopy} />
          </div>
        </div>
        <input type="checkbox" className="adm-check" checked={selected} onChange={() => h.onSel(o.phone)} aria-label={`Select ${label(o)}`} />
      </div>
      <div className="row">
        <StatusBadge bucket={o.bucket} />
        <small style={{ color: "var(--mutfg)" }}>{o.trialEndsAt ? `${fmtDate(o.trialEndsAt)} · ${relDays(o.daysLeft)}` : "No date"}</small>
      </div>
      {o.elapsed !== null && (
        <div className="adm-meter" aria-hidden>
          <i style={{ width: `${Math.max(4, o.elapsed * 100)}%`, ["--c" as string]: color } as React.CSSProperties} />
        </div>
      )}
      <div className="stats">
        <div>
          <small>Customers</small>
          <button className="adm-linkbtn" style={{ padding: 0 }} onClick={() => h.onOpen(o.phone, "customers")} disabled={o.customerCount === 0}>
            <Users size={13} /> {o.customerCount}
          </button>
        </div>
        <div>
          <small>Outstanding</small>
          <span className="adm-num">{money(o.totalOutstanding)}</span>
          {maxOut > 0 && (
            <div className="adm-meter" style={{ marginTop: 5 }} aria-hidden>
              <i style={{ width: `${Math.max(o.totalOutstanding ? 4 : 0, (o.totalOutstanding / maxOut) * 100)}%`, ["--c" as string]: "var(--pri)" } as React.CSSProperties} />
            </div>
          )}
        </div>
      </div>
      <div className="adm-actions" style={{ justifyContent: "flex-start" }}>
        <button className="adm-btn sm pri" onClick={() => h.onExtend(o, 30)} disabled={busy}>
          {busy ? <Loader2 size={13} className="adm-spin" /> : "+30 days"}
        </button>
        <a className="adm-btn sm icon" href={waLink(o.phone, renewalMessage(o))} target="_blank" rel="noopener noreferrer" aria-label="Message on WhatsApp">
          <MessageCircle size={14} />
        </a>
        <button className="adm-btn sm icon" onClick={() => h.onEdit(o)} aria-label="Edit">
          <Pencil size={14} />
        </button>
        <span style={{ marginLeft: "auto" }}>
          <Menu aria="More actions" trigger={<MoreHorizontal size={15} />} items={ownerMenu(o, h)} />
        </span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function EditOwnerModal({ owner, others, saving, onCancel, onSave }: { owner: Owner; others: Owner[]; saving: boolean; onCancel: () => void; onSave: (u: { name?: string; language?: string; newPhone?: string }) => void }) {
  const [name, setName] = useState(owner.name ?? "");
  const [language, setLanguage] = useState(owner.language ?? "en");
  const [phone, setPhone] = useState(owner.phone);
  const changed = phone !== owner.phone;
  const clash = changed && others.some((o) => o.phone !== owner.phone && tail9(o.phone) === tail9(phone));
  const tooShort = changed && digits(phone).length < 8;
  return (
    <Modal onClose={onCancel} width={400}>
      <div className="adm-mh">
        <h2>Edit Shop</h2>
        <button onClick={onCancel} className="adm-btn sm icon ghost" aria-label="Close" data-testid="button-close-edit-modal">
          <X size={18} />
        </button>
      </div>
      <div className="adm-field">
        <label>Shop Name</label>
        <input className="adm-input" type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus data-testid="input-edit-name" />
      </div>
      <div className="adm-field">
        <label>Language</label>
        <select className="adm-input" value={language} onChange={(e) => setLanguage(e.target.value)} data-testid="select-edit-language">
          <option value="en">English</option>
          <option value="rw">Kinyarwanda</option>
        </select>
      </div>
      <div className="adm-field">
        <label>Phone Number</label>
        <input className={`adm-input ${clash || tooShort ? "bad" : ""}`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-edit-phone" />
        {clash && <span className="err">Another shop already uses this number.</span>}
        {tooShort && <span className="err">That number looks too short.</span>}
        <span className="help">Changing this updates the owner's ID everywhere (their customers and reminder logs move with it).</span>
      </div>
      <div className="adm-mf">
        <button onClick={onCancel} className="adm-btn" data-testid="button-cancel-edit">
          Cancel
        </button>
        <button onClick={() => onSave({ name, language, newPhone: changed ? phone : undefined })} disabled={saving || clash || tooShort} className="adm-btn pri" data-testid="button-save-edit">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </Modal>
  );
}

// Only the phone is required. Name, language and trial length are optional: the
// owner fills in what is missing the first time they text the bot.
function AddOwnerModal({ owners, saving, onCancel, onSave }: { owners: Owner[]; saving: boolean; onCancel: () => void; onSave: (d: { phone: string; name: string; language: string; trialDays: number }) => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("");
  const [trialDays, setTrialDays] = useState<number | "">("");
  const dup = phone.trim() ? owners.find((o) => tail9(o.phone) === tail9(phone) && digits(phone).length >= 8) : undefined;
  const tooShort = phone.trim().length > 0 && digits(phone).length < 8;
  return (
    <Modal onClose={onCancel} width={420}>
      <div className="adm-mh">
        <h2>Add New Owner</h2>
        <button onClick={onCancel} className="adm-btn sm icon ghost" aria-label="Close" data-testid="button-close-add-modal">
          <X size={18} />
        </button>
      </div>
      <div className="adm-field">
        <label>
          Phone Number <span style={{ color: "var(--bad)" }}>*</span>
        </label>
        <input className={`adm-input ${dup || tooShort ? "bad" : ""}`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0788123456" autoFocus data-testid="input-add-phone" />
        {dup && <span className="err">Already registered as {label(dup)}.</span>}
        {tooShort && <span className="err">That number looks too short.</span>}
      </div>
      <div className="adm-field">
        <label>
          Shop Name <small>(optional)</small>
        </label>
        <input className="adm-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave blank — they can set this on WhatsApp" data-testid="input-add-name" />
      </div>
      <div className="adm-field">
        <label>
          Language <small>(optional)</small>
        </label>
        <select className="adm-input" value={language} onChange={(e) => setLanguage(e.target.value)} data-testid="select-add-language">
          <option value="">Ask them on WhatsApp</option>
          <option value="en">English</option>
          <option value="rw">Kinyarwanda</option>
        </select>
      </div>
      <div className="adm-field">
        <label>
          Trial Length (days) <small>(optional, defaults to 30)</small>
        </label>
        <input className="adm-input" type="number" min={1} value={trialDays} onChange={(e) => setTrialDays(e.target.value === "" ? "" : Number(e.target.value))} placeholder="30" data-testid="input-add-trial-days" />
        <div className="adm-quick">
          {[7, 14, 30, 60, 90].map((d) => (
            <button key={d} type="button" className={`adm-chip ${trialDays === d ? "on" : ""}`} onClick={() => setTrialDays(d)}>
              {d} days
            </button>
          ))}
        </div>
      </div>
      <div className="adm-mf">
        <button onClick={onCancel} className="adm-btn" data-testid="button-cancel-add">
          Cancel
        </button>
        <button onClick={() => onSave({ phone, name, language, trialDays: trialDays === "" ? 30 : trialDays })} disabled={saving || !phone.trim() || !!dup || tooShort} className="adm-btn pri" data-testid="button-save-add">
          {saving ? "Creating..." : "Create"}
        </button>
      </div>
    </Modal>
  );
}

// Removing a shop is permanent, so the admin has to type its number to confirm.
function ConfirmRemoveModal({ owner, busy, onCancel, onConfirm }: { owner: Owner; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState("");
  const [shake, setShake] = useState(0);
  const ok = typed.trim() === owner.phone;
  const go = () => (ok ? onConfirm() : setShake((n) => n + 1));
  return (
    <Modal onClose={onCancel} width={440}>
      <div className="adm-mh">
        <h2>Remove {label(owner)}?</h2>
        <button onClick={onCancel} className="adm-btn sm icon ghost" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="adm-dangerbox">
        This cannot be undone. Their customer records remain, but the owner login will no longer work.
        {owner.customerCount > 0 && (
          <>
            {" "}
            <b>
              {owner.customerCount} customer{owner.customerCount === 1 ? "" : "s"}, {money(owner.totalOutstanding)} outstanding.
            </b>
          </>
        )}
      </div>
      <div className="adm-field">
        <label>
          Type <b>{owner.phone}</b> to confirm
        </label>
        <input
          key={shake}
          className={`adm-input ${shake ? "adm-shake bad" : ""}`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          autoFocus
          data-testid="input-confirm-remove"
        />
      </div>
      <div className="adm-mf">
        <button onClick={onCancel} className="adm-btn">
          Cancel
        </button>
        <button onClick={go} disabled={busy} className="adm-btn danger" data-testid="button-confirm-remove" style={ok ? { background: "var(--bad)", color: "#fff", borderColor: "var(--bad)" } : undefined}>
          {busy ? "Removing..." : "Remove permanently"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Owner drawer: overview + customers
// ---------------------------------------------------------------------------

function OwnerDrawer({
  owner, tab, setTab, call, busy, onClose, onExtend, onEdit, onToggle, onRemove, onCopy, log,
}: {
  owner: EOwner;
  tab: "overview" | "customers";
  setTab: (t: "overview" | "customers") => void;
  call: <T = any>(path: string, opts?: { method?: string; body?: unknown }, fallback?: string) => Promise<T>;
  busy: boolean;
  onClose: () => void;
  onExtend: (o: EOwner, days: number) => void;
  onEdit: (o: EOwner) => void;
  onToggle: (o: EOwner) => void;
  onRemove: (o: EOwner) => void;
  onCopy: (t: string) => void;
  log: (text: string, ok?: boolean) => void;
}) {
  useEscape(onClose);
  useScrollLock();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "owes" | "cleared" | "nonumber">("all");
  const [sort, setSort] = useState<"owed" | "newest" | "name">("owed");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [days, setDays] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await call<{ customers?: Customer[] }>(`/admin/owners/${enc(owner.phone)}/customers`, undefined, "Failed to load customers.");
      setCustomers(data?.customers ?? []);
    } catch (e) {
      setError(errMsg(e, "Failed to load customers."));
      setCustomers((c) => c ?? []);
    }
  }, [call, owner.phone]);
  useEffect(() => {
    load();
  }, [load, owner.customerCount]);

  const list = useMemo(() => {
    let l = customers ?? [];
    const s = q.trim().toLowerCase();
    if (s) l = l.filter((c) => c.name.toLowerCase().includes(s) || (c.phone ?? "").includes(s));
    if (filter === "owes") l = l.filter((c) => c.totalOwed > 0);
    if (filter === "cleared") l = l.filter((c) => c.totalOwed <= 0);
    if (filter === "nonumber") l = l.filter((c) => !c.phone);
    return [...l].sort((a, b) => (sort === "owed" ? b.totalOwed - a.totalOwed : sort === "name" ? a.name.localeCompare(b.name) : Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  }, [customers, q, filter, sort]);

  const owing = (customers ?? []).filter((c) => c.totalOwed > 0).length;
  const noNum = (customers ?? []).filter((c) => !c.phone).length;
  const avg = owing ? Math.round((customers ?? []).reduce((s, c) => s + Math.max(0, c.totalOwed), 0) / owing) : 0;
  const color = bucketColor(owner.bucket);

  const saveCustomer = async (id: string) => {
    setSavingId(id);
    try {
      await call(`/admin/customers/${enc(id)}`, { method: "PATCH", body: { name: editName, phone: editPhone.trim() ? editPhone : null } }, "Failed to save customer.");
      log(`Edited customer "${editName}" of ${label(owner)}`);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(errMsg(e, "Failed to save customer."));
    } finally {
      setSavingId(null);
    }
  };

  const exportCustomers = () =>
    downloadCsv(`${label(owner).replace(/[^\w-]+/g, "_")}-customers-${stamp()}.csv`, ["Name", "Phone", "Owed (Frw)", "Registered"], (customers ?? []).map((c) => [c.name, c.phone ?? "", c.totalOwed, formatCustomerTimestamp(c.createdAt)]));

  const FILTERS: { k: typeof filter; l: string }[] = [
    { k: "all", l: "All" },
    { k: "owes", l: "Owes" },
    { k: "cleared", l: "Cleared" },
    { k: "nonumber", l: "No number" },
  ];

  return (
    <>
      <div className="adm-drawerov" onMouseDown={onClose} />
      <aside className="adm-drawer" role="dialog" aria-modal="true" aria-label={`${label(owner)} details`}>
        <div className="adm-dh">
          <Avatar o={owner} className="avatar" />
          <div className="t">
            <h2>{owner.name ?? "Unnamed shop"}</h2>
            <PhoneCell phone={owner.phone} onCopy={onCopy} />
          </div>
          <StatusBadge bucket={owner.bucket} />
          <button className="adm-btn sm icon ghost" onClick={onClose} aria-label="Close" data-testid="button-close-customers-modal">
            <X size={18} />
          </button>
        </div>
        <div className="adm-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}>
            Overview
          </button>
          <button role="tab" aria-selected={tab === "customers"} className={tab === "customers" ? "on" : ""} onClick={() => setTab("customers")}>
            Customers ({owner.customerCount})
          </button>
        </div>

        {tab === "overview" ? (
          <div className="adm-db" key="ov">
            <div className="adm-stats" style={{ ["--i" as string]: 0 } as React.CSSProperties}>
              <div className="adm-stat">
                <small>Customers</small>
                <b>{owner.customerCount}</b>
              </div>
              <div className="adm-stat">
                <small>Outstanding</small>
                <b>{money(owner.totalOutstanding)}</b>
              </div>
              <div className="adm-stat">
                <small>Avg per debtor</small>
                <b>{customers ? money(avg) : "…"}</b>
              </div>
            </div>

            <div className="adm-timeline" style={{ ["--i" as string]: 1, ["--c" as string]: color } as React.CSSProperties}>
              <p className="adm-sec">Access period</p>
              {owner.elapsed !== null ? (
                <div className="adm-track">
                  <i style={{ width: `${owner.elapsed * 100}%` }} />
                  <u style={{ left: `${owner.elapsed * 100}%` }} />
                </div>
              ) : (
                <p style={{ color: "var(--mutfg)", margin: "10px 0" }}>No trial dates are set for this shop.</p>
              )}
              <div className="adm-tl">
                <span>Joined {fmtDate(owner.createdAt)}</span>
                <span>
                  {fmtDate(owner.trialEndsAt)} · {relDays(owner.daysLeft)}
                </span>
              </div>
            </div>

            <div style={{ ["--i" as string]: 2 } as React.CSSProperties}>
              <p className="adm-sec">Extend access</p>
              <div className="adm-quick" style={{ marginBottom: 16 }}>
                {[7, 30, 90].map((d) => (
                  <button key={d} className="adm-btn sm pri" disabled={busy} onClick={() => onExtend(owner, d)}>
                    +{d} days
                  </button>
                ))}
                <input className="adm-input sm" style={{ width: 96 }} type="number" min={1} value={days} placeholder="days" onChange={(e) => setDays(e.target.value)} aria-label="Custom days" />
                <button
                  className="adm-btn sm"
                  disabled={busy || !(Number(days) > 0)}
                  onClick={() => {
                    onExtend(owner, Math.floor(Number(days)));
                    setDays("");
                  }}
                >
                  Apply
                </button>
              </div>
            </div>

            <div style={{ ["--i" as string]: 3 } as React.CSSProperties}>
              <p className="adm-sec">Manage</p>
              <div className="adm-quick">
                <a className="adm-btn sm" href={waLink(owner.phone, renewalMessage(owner))} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={13} /> Renewal message
                </a>
                <a className="adm-btn sm" href={waLink(owner.phone)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={13} /> Open chat
                </a>
                <button className="adm-btn sm" onClick={() => onEdit(owner)}>
                  <Pencil size={13} /> Edit
                </button>
                <button className={`adm-btn sm ${owner.isActive ? "warn" : "ok"}`} onClick={() => onToggle(owner)} disabled={busy}>
                  {owner.isActive ? <Ban size={13} /> : <PlayCircle size={13} />} {owner.isActive ? "Deactivate" : "Activate"}
                </button>
                <button className="adm-btn sm danger" onClick={() => onRemove(owner)}>
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            </div>

            <div style={{ ["--i" as string]: 4 } as React.CSSProperties}>
              <NotesBox phone={owner.phone} />
            </div>

            {customers && customers.length > 0 && (
              <div style={{ marginTop: 20, ["--i" as string]: 5 } as React.CSSProperties}>
                <p className="adm-sec">Top debtors</p>
                <div className="adm-bars">
                  {[...customers]
                    .filter((c) => c.totalOwed > 0)
                    .sort((a, b) => b.totalOwed - a.totalOwed)
                    .slice(0, 5)
                    .map((c, i, arr) => (
                      <div key={c.id} className="adm-brow" style={{ ["--i" as string]: i } as React.CSSProperties}>
                        <span className="n">{c.name}</span>
                        <span className="adm-btrack">
                          <i style={{ width: `${(c.totalOwed / arr[0].totalOwed) * 100}%`, ["--i" as string]: i } as React.CSSProperties} />
                        </span>
                        <b>{money(c.totalOwed)}</b>
                      </div>
                    ))}
                </div>
                {noNum > 0 && (
                  <p className="adm-warnbox" style={{ marginTop: 14 }}>
                    <AlertTriangle size={15} /> {noNum} customer{noNum === 1 ? " has" : "s have"} no phone number, so reminders cannot reach them.
                    <button className="adm-link" style={{ marginLeft: "auto" }} onClick={() => { setFilter("nonumber"); setTab("customers"); }}>
                      Review
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="adm-db" key="cu">
            {error && (
              <div className="adm-err" data-testid="text-customers-error">
                <AlertTriangle size={15} /> {error}
              </div>
            )}
            <div className="adm-toolbar" style={{ marginBottom: 10 }}>
              <div className="adm-search" style={{ maxWidth: "none" }}>
                <Search size={15} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" aria-label="Search customers" style={{ paddingRight: 12 }} />
              </div>
              <select className="adm-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort customers">
                <option value="owed">Most owed</option>
                <option value="newest">Newest</option>
                <option value="name">Name A–Z</option>
              </select>
              <button className="adm-btn sm" onClick={exportCustomers} disabled={!customers?.length}>
                <Download size={13} /> CSV
              </button>
            </div>
            <div className="adm-chips" style={{ marginBottom: 12 }}>
              {FILTERS.map((f) => (
                <button key={f.k} className={`adm-chip ${filter === f.k ? "on" : ""}`} onClick={() => setFilter(f.k)}>
                  {f.l}
                  <em>{f.k === "all" ? customers?.length ?? 0 : f.k === "owes" ? owing : f.k === "cleared" ? (customers?.length ?? 0) - owing : noNum}</em>
                </button>
              ))}
            </div>
            {customers === null ? (
              <div className="adm-cust">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="adm-skel" style={{ height: 62 }} />
                ))}
              </div>
            ) : list.length === 0 ? (
              <div className="adm-empty">
                <Inbox size={34} />
                <span>{customers.length === 0 ? "No customers registered yet." : "No customers match."}</span>
              </div>
            ) : (
              <div className="adm-cust">
                {list.map((c, i) => (
                  <div key={c.id} className="adm-crow" style={{ ["--i" as string]: Math.min(i, 14) } as React.CSSProperties} data-testid={`row-customer-${c.id}`}>
                    {editingId === c.id ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <input className="adm-input sm" value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="Name" data-testid={`input-customer-name-${c.id}`} autoFocus />
                        <input className="adm-input sm" type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="No number" aria-label="Phone" data-testid={`input-customer-phone-${c.id}`} />
                        <div className="adm-quick">
                          <button className="adm-btn sm" onClick={() => setEditingId(null)} data-testid={`button-cancel-customer-edit-${c.id}`}>
                            Cancel
                          </button>
                          <button className="adm-btn sm pri" onClick={() => saveCustomer(c.id)} disabled={savingId === c.id || !editName.trim()} data-testid={`button-save-customer-${c.id}`}>
                            <Check size={12} /> {savingId === c.id ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="l">
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
                          <p className={`m ${c.phone ? "" : "adm-nonum"}`}>{c.phone ?? "No number"}</p>
                          <p className="m">Registered {formatCustomerTimestamp(c.createdAt)}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                          <span className="adm-num" style={{ whiteSpace: "nowrap", color: c.totalOwed > 0 ? undefined : "var(--ok)" }}>
                            {c.totalOwed > 0 ? money(c.totalOwed) : "Cleared"}
                          </span>
                          {c.phone && (
                            <a className="adm-btn sm icon" href={waLink(c.phone)} target="_blank" rel="noopener noreferrer" aria-label={`Message ${c.name}`}>
                              <MessageCircle size={13} />
                            </a>
                          )}
                          <button
                            className="adm-btn sm icon"
                            aria-label={`Edit ${c.name}`}
                            data-testid={`button-edit-customer-${c.id}`}
                            onClick={() => {
                              setEditingId(c.id);
                              setEditName(c.name);
                              setEditPhone(c.phone ?? "");
                            }}
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Command palette (Ctrl/Cmd + K)
// ---------------------------------------------------------------------------

type PaletteAction = { id: string; label: string; hint?: string; icon: React.ReactNode; run: () => void };

function Palette({ owners, actions, onOpenOwner, onClose }: { owners: EOwner[]; actions: PaletteAction[]; onOpenOwner: (phone: string) => void; onClose: () => void }) {
  useEscape(onClose);
  useScrollLock();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const acts = actions.filter((a) => !s || a.label.toLowerCase().includes(s));
    const os = s ? owners.filter((o) => (o.name ?? "").toLowerCase().includes(s) || o.phone.includes(s)).slice(0, 6) : [];
    return [
      ...os.map((o) => ({ kind: "owner" as const, id: o.phone, label: label(o), hint: o.phone, icon: <Avatar o={o} className="adm-mini" />, run: () => onOpenOwner(o.phone) })),
      ...acts.map((a) => ({ kind: "action" as const, ...a })),
    ];
  }, [q, owners, actions, onOpenOwner]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(".on")?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const choose = (i: number) => {
    const r = rows[i];
    if (!r) return;
    onClose();
    r.run();
  };

  return (
    <div
      className="adm-overlay adm-palov"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="adm-pal" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          autoFocus
          value={q}
          placeholder="Search shops or type a command…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(rows.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(idx);
            }
          }}
          data-testid="input-palette"
        />
        {rows.length === 0 ? (
          <div className="empty">Nothing matches “{q}”.</div>
        ) : (
          <ul ref={listRef} role="listbox">
            {rows.map((r, i) => (
              <li key={`${r.kind}-${r.id}`}>
                <button className={i === idx ? "on" : ""} onMouseEnter={() => setIdx(i)} onClick={() => choose(i)}>
                  {r.icon}
                  {r.label}
                  {r.hint && <small>{r.hint}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Pager({ page, pages, total, size, setPage, setSize, from, to }: { page: number; pages: number; total: number; size: number; setPage: (p: number) => void; setSize: (n: number) => void; from: number; to: number }) {
  const nums: number[] = [];
  for (let p = Math.max(0, page - 2); p <= Math.min(pages - 1, page + 2); p++) nums.push(p);
  return (
    <div className="adm-pager">
      <span>
        Showing <b>{total ? from : 0}–{to}</b> of <b>{total}</b>
      </span>
      <div className="adm-pages">
        <button disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={14} />
        </button>
        {nums.map((p) => (
          <button key={p} className={p === page ? "on" : ""} onClick={() => setPage(p)} aria-label={`Page ${p + 1}`} aria-current={p === page}>
            {p + 1}
          </button>
        ))}
        <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">
          <ChevronRight size={14} />
        </button>
      </div>
      <select className="adm-select" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Rows per page">
        {[10, 25, 50, 100].map((n) => (
          <option key={n} value={n}>
            {n} per page
          </option>
        ))}
      </select>
    </div>
  );
}

function OwnersDashboard({ password, onLogout }: { password: string; onLogout: (reason?: string) => void }) {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<Record<string, boolean>>({});

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Bucket | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "default", dir: 1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ label: string; done: number; total: number } | null>(null);

  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Owner | null>(null);
  const [drawer, setDrawer] = useState<{ phone: string; tab: "overview" | "customers" } | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [palette, setPalette] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>(loadLog);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const toastSeq = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* private mode */
    }
  }, [prefs]);

  // ---- toasts and activity log
  const push = useCallback((t: Omit<ToastItem, "id" | "ttl"> & { ttl?: number }) => {
    const id = ++toastSeq.current;
    setToasts((x) => [...x.slice(-3), { ttl: t.action ? 7000 : 4500, ...t, id }]);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((x) => x.filter((t) => t.id !== id)), []);
  const log = useCallback((text: string, ok = true) => {
    setActivity((a) => {
      const next = [{ id: Date.now() + Math.random(), at: Date.now(), text, ok }, ...a].slice(0, 60);
      try {
        sessionStorage.setItem(LOG_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const copy = useCallback(
    (text: string) => {
      navigator.clipboard?.writeText(text).then(
        () => push({ kind: "success", title: "Copied", desc: text, ttl: 1800 }),
        () => push({ kind: "error", title: "Could not copy" })
      );
    },
    [push]
  );

  // ---- API
  const call = useCallback(
    async <T = any,>(path: string, opts: { method?: string; body?: unknown } = {}, fallback = "Request failed."): Promise<T> => {
      if (!ADMIN_API_BASE) throw new Error("Admin API endpoint isn't configured. Set VITE_ADMIN_API_URL.");
      const headers: Record<string, string> = { "x-admin-password": password };
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(`${ADMIN_API_BASE}${path}`, { method: opts.method ?? "GET", headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
      if (res.status === 401) {
        onLogout("Your session is no longer valid. Please log in again.");
        throw new Error("Unauthorized");
      }
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.message || fallback);
      }
      return (await res.json().catch(() => null)) as T;
    },
    [password, onLogout]
  );

  const fetchOwners = useCallback(
    async (silent = false) => {
      if (!ADMIN_API_BASE) {
        setError("Admin API endpoint isn't configured. Set VITE_ADMIN_API_URL.");
        setLoading(false);
        return;
      }
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await call<{ owners?: Owner[] }>("/admin/owners", undefined, "Failed to load owners.");
        setOwners(data?.owners ?? []);
        setLastFetched(Date.now());
      } catch (e) {
        setError(errMsg(e, "Failed to load owners."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [call]
  );
  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

  const markFlash = useCallback((phones: string[]) => {
    setFlash((f) => Object.fromEntries([...Object.entries(f), ...phones.map((p) => [p, true])]));
    setTimeout(() => setFlash((f) => Object.fromEntries(Object.entries(f).filter(([k]) => !phones.includes(k)))), 1800);
  }, []);
  const withBusy = useCallback(async (phones: string[], fn: () => Promise<void>) => {
    setBusy((b) => ({ ...b, ...Object.fromEntries(phones.map((p) => [p, true])) }));
    try {
      await fn();
    } finally {
      setBusy((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !phones.includes(k))));
    }
  }, []);

  // ---- derived data
  const now = useMemo(() => Date.now(), [owners]); // eslint-disable-line react-hooks/exhaustive-deps
  const enriched = useMemo<EOwner[]>(
    () =>
      owners.map((o) => {
        const end = o.trialEndsAt ? Date.parse(o.trialEndsAt) : NaN;
        const start = Date.parse(o.createdAt);
        return {
          ...o,
          bucket: (o.isActive ? o.status : "deactivated") as Bucket,
          daysLeft: Number.isNaN(end) ? null : Math.ceil((end - now) / DAY),
          elapsed: !Number.isNaN(end) && !Number.isNaN(start) && end > start ? clamp((now - start) / (end - start), 0, 1) : null,
        };
      }),
    [owners, now]
  );
  const byPhone = useMemo(() => new Map(enriched.map((o) => [o.phone, o])), [enriched]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { active: 0, expiring: 0, expired: 0, no_trial: 0, deactivated: 0 };
    enriched.forEach((o) => c[o.bucket]++);
    return c;
  }, [enriched]);
  const totalOutstandingAll = useMemo(() => owners.reduce((s, o) => s + o.totalOutstanding, 0), [owners]);
  const totalCustomers = useMemo(() => owners.reduce((s, o) => s + o.customerCount, 0), [owners]);
  const maxOut = useMemo(() => enriched.reduce((m, o) => Math.max(m, o.totalOutstanding), 0), [enriched]);

  const weeks = useMemo(() => {
    const w = new Array(8).fill(0) as number[];
    enriched.forEach((o) => {
      const age = Math.floor((now - Date.parse(o.createdAt)) / WEEK);
      if (age >= 0 && age < 8) w[7 - age]++;
    });
    return w;
  }, [enriched, now]);
  const topDebt = useMemo(() => [...enriched].filter((o) => o.totalOutstanding > 0).sort((a, b) => b.totalOutstanding - a.totalOutstanding).slice(0, 7), [enriched]);
  const attention = useMemo(
    () => enriched.filter((o) => o.isActive && o.daysLeft !== null && o.daysLeft <= 7 && o.daysLeft >= -14).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)).slice(0, 6),
    [enriched]
  );
  const renewalList = useMemo(
    () => enriched.filter((o) => o.isActive && o.daysLeft !== null && o.daysLeft <= 7 && o.daysLeft >= -30).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
    [enriched]
  );

  const visible = useMemo(() => {
    let list = enriched;
    if (statusFilter !== "all") list = list.filter((o) => o.bucket === statusFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      const dq = digits(q);
      list = list.filter((o) => (o.name ?? "").toLowerCase().includes(q) || (dq && o.phone.includes(dq)) || (o.language ?? "").toLowerCase() === q);
    }
    if (sort.key === "default") return list;
    const val = (o: EOwner): number | string => {
      switch (sort.key) {
        case "name": return (o.name ?? "\uffff").toLowerCase();
        case "created": return Date.parse(o.createdAt) || 0;
        case "expiry": return o.daysLeft ?? Number.POSITIVE_INFINITY;
        case "customers": return o.customerCount;
        default: return o.totalOutstanding;
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [enriched, statusFilter, query, sort]);

  const pages = Math.max(1, Math.ceil(visible.length / prefs.pageSize));
  useEffect(() => setPage(0), [statusFilter, query, sort, prefs.pageSize]);
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);
  const pageRows = useMemo(() => visible.slice(page * prefs.pageSize, (page + 1) * prefs.pageSize), [visible, page, prefs.pageSize]);

  // drop selections that no longer exist after a refresh
  useEffect(() => {
    setSelected((s) => {
      const next = new Set([...s].filter((p) => byPhone.has(p)));
      return next.size === s.size ? s : next;
    });
  }, [byPhone]);

  // ---- actions (same endpoints as before)
  const extend = useCallback(
    async (o: EOwner, days: number) => {
      await withBusy([o.phone], async () => {
        try {
          await call(`/admin/owners/${enc(o.phone)}/extend`, { method: "POST", body: { days } }, "Failed to update owner.");
          push({ kind: "success", title: `+${days} days for ${label(o)}`, desc: "Access extended." });
          burst(window.innerWidth / 2, 120);
          log(`Extended ${label(o)} by ${days} days`);
          markFlash([o.phone]);
          await fetchOwners(true);
        } catch (e) {
          if ((e as Error).message !== "Unauthorized") push({ kind: "error", title: "Could not extend access", desc: errMsg(e) });
          log(`Failed to extend ${label(o)}`, false);
        }
      });
    },
    [call, push, log, markFlash, fetchOwners, withBusy]
  );

  const setActive = useCallback(
    async (o: EOwner, active: boolean, undo = false) => {
      await withBusy([o.phone], async () => {
        try {
          await call(`/admin/owners/${enc(o.phone)}/${active ? "activate" : "deactivate"}`, { method: "POST" }, "Failed to update owner.");
          log(`${active ? "Activated" : "Deactivated"} ${label(o)}${undo ? " (undo)" : ""}`);
          push({
            kind: "success",
            title: `${label(o)} ${active ? "activated" : "deactivated"}`,
            action: undo ? undefined : { label: "Undo", run: () => void setActive(o, !active, true) },
          });
          markFlash([o.phone]);
          await fetchOwners(true);
        } catch (e) {
          if ((e as Error).message !== "Unauthorized") push({ kind: "error", title: "Could not update owner", desc: errMsg(e) });
          log(`Failed to ${active ? "activate" : "deactivate"} ${label(o)}`, false);
        }
      });
    },
    [call, push, log, markFlash, fetchOwners, withBusy]
  );

  const saveEdit = useCallback(
    async (phone: string, updates: { name?: string; language?: string; newPhone?: string }) => {
      await withBusy([phone], async () => {
        try {
          await call(`/admin/owners/${enc(phone)}`, { method: "PATCH", body: updates }, "Failed to save changes.");
          setEditingOwner(null);
          if (updates.newPhone) setDrawer((d) => (d && d.phone === phone ? { ...d, phone: updates.newPhone! } : d));
          push({ kind: "success", title: "Changes saved" });
          log(`Edited ${updates.name || phone}`);
          markFlash([updates.newPhone ?? phone]);
          await fetchOwners(true);
        } catch (e) {
          if ((e as Error).message !== "Unauthorized") push({ kind: "error", title: "Could not save", desc: errMsg(e) });
        }
      });
    },
    [call, push, log, markFlash, fetchOwners, withBusy]
  );

  const removeOwner = useCallback(
    async (o: Owner) => {
      await withBusy([o.phone], async () => {
        try {
          await call(`/admin/owners/${enc(o.phone)}`, { method: "DELETE" }, "Failed to remove owner.");
          setRemoving(null);
          setDrawer((d) => (d && d.phone === o.phone ? null : d));
          push({ kind: "success", title: `${label(o)} removed` });
          log(`Removed ${label(o)}`);
          await fetchOwners(true);
        } catch (e) {
          if ((e as Error).message !== "Unauthorized") push({ kind: "error", title: "Could not remove owner", desc: errMsg(e) });
          log(`Failed to remove ${label(o)}`, false);
        }
      });
    },
    [call, push, log, fetchOwners, withBusy]
  );

  const createOwner = async (data: { phone: string; name: string; language: string; trialDays: number }) => {
    setCreating(true);
    setError(null);
    try {
      await call("/admin/owners", { method: "POST", body: data }, "Failed to create owner.");
      setShowAddModal(false);
      push({ kind: "success", title: "Owner created", desc: data.name || data.phone });
      log(`Created ${data.name || data.phone} (${data.trialDays} days)`);
      markFlash([data.phone]);
      await fetchOwners(true);
    } catch (e) {
      if ((e as Error).message !== "Unauthorized") setError(errMsg(e, "Failed to create owner."));
    } finally {
      setCreating(false);
    }
  };

  const runBulk = async (title: string, phones: string[], fn: (o: EOwner) => Promise<void>) => {
    const targets = phones.map((p) => byPhone.get(p)).filter(Boolean) as EOwner[];
    if (!targets.length) return;
    setBulk({ label: title, done: 0, total: targets.length });
    let ok = 0;
    for (let i = 0; i < targets.length; i++) {
      try {
        await fn(targets[i]);
        ok++;
      } catch (e) {
        if ((e as Error).message === "Unauthorized") break;
      }
      setBulk({ label: title, done: i + 1, total: targets.length });
    }
    setBulk(null);
    markFlash(targets.map((t) => t.phone));
    const failed = targets.length - ok;
    push({ kind: failed ? "error" : "success", title: `${title}: ${ok} of ${targets.length} done`, desc: failed ? `${failed} failed. Check the activity log.` : undefined });
    log(`${title} for ${ok}/${targets.length} shops`, failed === 0);
    setSelected(new Set());
    await fetchOwners(true);
  };

  // ---- handlers for rows (stable identities so rows can be memoised)
  const handlers = useMemo<RowHandlers>(
    () => ({
      onSel: (phone) =>
        setSelected((s) => {
          const n = new Set(s);
          n.has(phone) ? n.delete(phone) : n.add(phone);
          return n;
        }),
      onOpen: (phone, tab) => setDrawer({ phone, tab }),
      onExtend: (o, d) => void extend(o, d),
      onEdit: (o) => setEditingOwner(o),
      onToggle: (o) => void setActive(o, !o.isActive),
      onRemove: (o) => setRemoving(o),
      onCopy: copy,
    }),
    [extend, setActive, copy]
  );

  const exportOwners = (list: EOwner[], name: string) =>
    downloadCsv(`${name}-${stamp()}.csv`, ["Shop", "Phone", "Language", "Status", "Access until", "Days left", "Customers", "Outstanding (Frw)", "Joined"], list.map((o) => [o.name ?? "", o.phone, o.language ?? "", BUCKETS.find((b) => b.key === o.bucket)!.label, o.trialEndsAt ? fmtDate(o.trialEndsAt) : "", o.daysLeft ?? "", o.customerCount, o.totalOutstanding, fmtDate(o.createdAt)]));

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" || key === "expiry" ? 1 : -1 }));

  // ---- keyboard shortcuts, auto refresh, idle sign-out
  const overlayOpen = !!(showAddModal || editingOwner || removing || drawer || showActivity || palette || queueOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || overlayOpen) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n") {
        e.preventDefault();
        setShowAddModal(true);
      } else if (e.key === "r") {
        void fetchOwners(true);
      } else if (e.key === "Escape") {
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen, fetchOwners]);

  useEffect(() => {
    if (!prefs.auto) return;
    const id = setInterval(() => {
      if (!document.hidden && !overlayOpen) void fetchOwners(true);
    }, 30000);
    return () => clearInterval(id);
  }, [prefs.auto, overlayOpen, fetchOwners]);

  useEffect(() => {
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const evs = ["pointerdown", "keydown", "scroll", "pointermove"] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const id = setInterval(() => {
      if (Date.now() - last > IDLE_MS) onLogout("You were signed out after 30 minutes of inactivity.");
    }, 30000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(id);
    };
  }, [onLogout]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    extrasPointerMove(e);
    const el = (e.target as Element).closest?.(".adm-spot") as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, []);

  // ---- derived UI bits
  const drawerOwner = drawer ? byPhone.get(drawer.phone) ?? null : null;
  const allOnPage = pageRows.length > 0 && pageRows.every((o) => selected.has(o.phone));
  const selectedList = useMemo(() => [...selected].map((p) => byPhone.get(p)).filter(Boolean) as EOwner[], [selected, byPhone]);
  const filtersActive = statusFilter !== "all" || query.trim() !== "";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };
  const pickBucket = (b: Bucket) => setStatusFilter((cur) => (cur === b ? "all" : b));

  const paletteActions = useMemo<PaletteAction[]>(
    () => [
      { id: "add", label: "Add owner", hint: "N", icon: <UserPlus size={16} />, run: () => setShowAddModal(true) },
      { id: "refresh", label: "Refresh data", hint: "R", icon: <RefreshCw size={16} />, run: () => void fetchOwners(true) },
      { id: "queue", label: "Open renewal queue", icon: <Send size={16} />, run: () => setQueueOpen(true) },
      { id: "csv", label: "Export all shops to CSV", icon: <Download size={16} />, run: () => exportOwners(enriched, "shopbrain-owners") },
      { id: "f-all", label: "Show all shops", icon: <Users size={16} />, run: () => setStatusFilter("all") },
      { id: "f-exp", label: "Show expiring soon", icon: <Clock size={16} />, run: () => setStatusFilter("expiring") },
      { id: "f-expd", label: "Show expired", icon: <XCircle size={16} />, run: () => setStatusFilter("expired") },
      { id: "f-act", label: "Show active", icon: <CheckCircle2 size={16} />, run: () => setStatusFilter("active") },
      { id: "view", label: prefs.view === "table" ? "Switch to card view" : "Switch to table view", icon: prefs.view === "table" ? <LayoutGrid size={16} /> : <List size={16} />, run: () => setPrefs((p) => ({ ...p, view: p.view === "table" ? "cards" : "table" })) },
      { id: "auto", label: prefs.auto ? "Turn auto-refresh off" : "Turn auto-refresh on", icon: <Zap size={16} />, run: () => setPrefs((p) => ({ ...p, auto: !p.auto })) },
      { id: "log", label: "Open activity log", icon: <Activity size={16} />, run: () => setShowActivity(true) },
      { id: "out", label: "Log out", icon: <LockKeyhole size={16} />, run: () => onLogout() },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs.view, prefs.auto, enriched, fetchOwners, onLogout]
  );

  const chips: { k: Bucket | "all"; l: string; n: number }[] = [
    { k: "all", l: "All", n: owners.length },
    ...BUCKETS.map((b) => ({ k: b.key as Bucket | "all", l: b.label, n: counts[b.key] })),
  ];
  const thisWeek = weeks[7], lastWeek = weeks[6];

  return (
    <div className="adm-root" onPointerMove={onPointerMove}>
      <style>{ADM_CSS + EXTRAS_CSS}</style>
      <div className="adm-aurora" aria-hidden />
      <RefreshBar active={loading || refreshing} />
      <div className="adm-wrap">
        {/* header */}
        <div className="adm-head adm-in">
          <div>
            <h1 className="adm-title">Shop Brain Admin</h1>
            <p className="adm-sub">
              {owners.length} registered shop{owners.length === 1 ? "" : "s"}
              <LastUpdated at={lastFetched} refreshing={refreshing} auto={prefs.auto} />
            </p>
          </div>
          <div className="adm-tools">
            <button onClick={() => setPalette(true)} className="adm-btn hide-sm" title="Command palette">
              <Command size={14} /> Search anything <span className="adm-kbd">⌘K</span>
            </button>
            <button onClick={() => setShowAddModal(true)} className="adm-btn pri" data-testid="button-add-owner">
              <UserPlus size={14} /> Add Owner
            </button>
            <button onClick={() => setQueueOpen(true)} className="adm-btn" title="Step through renewal reminders">
              <Send size={14} /> Renewals {renewalList.length > 0 && <b>{renewalList.length}</b>}
            </button>
            <button onClick={() => setPrefs((p) => ({ ...p, auto: !p.auto }))} className={`adm-btn ${prefs.auto ? "ok" : ""}`} aria-pressed={prefs.auto} title="Refresh every 30 seconds">
              <Zap size={14} /> Live
            </button>
            <button onClick={() => fetchOwners(true)} disabled={loading || refreshing} className="adm-btn" data-testid="button-refresh">
              <RefreshCw size={14} className={loading || refreshing ? "adm-spin" : ""} /> Refresh
            </button>
            <button onClick={() => setShowActivity(true)} className="adm-btn hide-sm" title="Activity log">
              <Activity size={14} /> {activity.length > 0 && <b>{activity.length}</b>}
            </button>
            <button onClick={() => onLogout()} className="adm-btn" data-testid="button-admin-logout">
              Log out
            </button>
          </div>
        </div>

        {error && (
          <div className="adm-err" data-testid="text-dashboard-error">
            <AlertTriangle size={16} /> {error}
            <button className="adm-link" style={{ marginLeft: "auto" }} onClick={() => fetchOwners()}>
              Retry
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="adm-kpis">
          {loading && owners.length === 0 ? (
            [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="adm-card adm-skel" style={{ height: 108 }} />)
          ) : (
            <>
              <Kpi i={0} label="Total shops" value={owners.length} icon={<Users size={15} />} hint={`${thisWeek} new this week`} />
              <Kpi i={1} label="Active" value={counts.active} icon={<CheckCircle2 size={15} />} color="var(--ok)" on={statusFilter === "active"} onClick={() => pickBucket("active")} hint="Click to filter" />
              <Kpi i={2} label="Expiring soon" value={counts.expiring} icon={<Clock size={15} />} color="#f59e0b" on={statusFilter === "expiring"} onClick={() => pickBucket("expiring")} hint="Needs a renewal" />
              <Kpi i={3} label="Expired" value={counts.expired} icon={<XCircle size={15} />} color="var(--bad)" on={statusFilter === "expired"} onClick={() => pickBucket("expired")} hint="Access has ended" />
              <Kpi i={4} label="Customers (all shops)" value={totalCustomers} icon={<TrendingUp size={15} />} hint={owners.length ? `${(totalCustomers / owners.length).toFixed(1)} per shop` : undefined} />
              <Kpi i={5} label="Total outstanding" value={totalOutstandingAll} suffix="Frw" icon={<Zap size={15} />} color="#a78bfa" hint="Owed to shops" />
            </>
          )}
        </div>

        {/* insights */}
        {owners.length > 0 && (
          <div className="adm-grid2">
            <div className="adm-card adm-spot adm-panel adm-in" style={{ ["--i" as string]: 6 } as React.CSSProperties}>
              <h3>
                <Activity size={15} /> Shops by status
              </h3>
              <Donut counts={counts} total={owners.length} filter={statusFilter} onPick={pickBucket} />
            </div>
            <div className="adm-card adm-spot adm-panel adm-in" style={{ ["--i" as string]: 7 } as React.CSSProperties}>
              <h3>
                <TrendingUp size={15} /> Biggest outstanding balances
              </h3>
              {topDebt.length === 0 ? (
                <p style={{ color: "var(--mutfg)" }}>No outstanding balances.</p>
              ) : (
                <div className="adm-bars">
                  {topDebt.map((o, i) => (
                    <button key={o.phone} className="adm-brow" onClick={() => setDrawer({ phone: o.phone, tab: "overview" })} style={{ ["--i" as string]: i } as React.CSSProperties}>
                      <span className="n">{label(o)}</span>
                      <span className="adm-btrack">
                        <i style={{ width: `${(o.totalOutstanding / topDebt[0].totalOutstanding) * 100}%`, ["--i" as string]: i } as React.CSSProperties} />
                      </span>
                      <b>{money(o.totalOutstanding)}</b>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="adm-card adm-spot adm-panel adm-in" style={{ ["--i" as string]: 8 } as React.CSSProperties}>
              <h3>
                <UserPlus size={15} /> New shops, last 8 weeks
              </h3>
              <div className="adm-sign">
                {weeks.map((n, i) => (
                  <div key={i} title={`${n} new shop${n === 1 ? "" : "s"}`}>
                    <span>{n || ""}</span>
                    <i style={{ height: `${Math.max(4, (n / Math.max(1, ...weeks)) * 100)}%`, ["--i" as string]: i, opacity: n ? 1 : 0.25 } as React.CSSProperties} />
                  </div>
                ))}
              </div>
              <p className="adm-trend">
                {thisWeek} this week vs {lastWeek} last week {thisWeek > lastWeek && <b>▲</b>}
              </p>
            </div>
          </div>
        )}

        {/* needs attention */}
        {owners.length > 0 && (
          <div className={`adm-card adm-attn adm-in ${attention.length > 0 ? "adm-glowborder" : ""}`} style={{ ["--i" as string]: 9 } as React.CSSProperties}>
            <h3>
              <Bell size={15} /> Needs attention <small style={{ color: "var(--mutfg)", fontWeight: 500 }}>expiring within 7 days, or ended in the last 14</small>
            </h3>
            {attention.length === 0 ? (
              <div className="adm-allclear">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" strokeWidth="2" />
                  <path d="M7 12.5l3.2 3.2L17 9" />
                </svg>
                All clear. Nobody needs a renewal right now.
              </div>
            ) : (
              <div className="adm-attnlist">
                {attention.map((o) => (
                  <div key={o.phone} className="adm-attnitem">
                    <Avatar o={o} />
                    <div className="who">
                      <b>{label(o)}</b>
                      <span style={{ color: (o.daysLeft ?? 0) < 0 ? "var(--bad)" : "var(--warn)" }}>{(o.daysLeft ?? 0) < 0 ? `Ended ${relDays(o.daysLeft)}` : `Ends ${relDays(o.daysLeft)}`}</span>
                    </div>
                    <button className="adm-btn sm pri" disabled={!!busy[o.phone]} onClick={() => extend(o, 30)}>
                      {busy[o.phone] ? <Loader2 size={13} className="adm-spin" /> : "+30d"}
                    </button>
                    <a className="adm-btn sm icon" href={waLink(o.phone, renewalMessage(o))} target="_blank" rel="noopener noreferrer" aria-label={`Remind ${label(o)} on WhatsApp`}>
                      <MessageCircle size={13} />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* activation funnel + inactive shops */}
        {owners.length > 0 && (
          <div className="adm-duo">
            <FunnelPanel owners={enriched} />
            <InactivePanel owners={enriched} waLink={waLink} />
          </div>
        )}

        {/* toolbar */}
        <div className="adm-toolbar adm-in" style={{ ["--i" as string]: 10 } as React.CSSProperties}>
          <div className="adm-search">
            <Search size={15} />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone" aria-label="Search shops" data-testid="input-search" />
            <div className="r">
              {query ? (
                <button className="adm-btn sm icon ghost" onClick={() => setQuery("")} aria-label="Clear search" style={{ width: 24, height: 24 }}>
                  <X size={13} />
                </button>
              ) : (
                <span className="adm-kbd">/</span>
              )}
            </div>
          </div>
          <select className="adm-select" value={sort.key} onChange={(e) => setSort({ key: e.target.value as SortKey, dir: e.target.value === "name" || e.target.value === "expiry" || e.target.value === "default" ? 1 : -1 })} aria-label="Sort shops">
            <option value="default">Sort: default</option>
            <option value="name">Name A–Z</option>
            <option value="created">Newest first</option>
            <option value="expiry">Expires soonest</option>
            <option value="customers">Most customers</option>
            <option value="outstanding">Highest outstanding</option>
          </select>
          <div className="adm-segbtn" role="group" aria-label="View">
            <button className={prefs.view === "table" ? "on" : ""} onClick={() => setPrefs((p) => ({ ...p, view: "table" }))} aria-label="Table view" title="Table view">
              <List size={15} />
            </button>
            <button className={prefs.view === "cards" ? "on" : ""} onClick={() => setPrefs((p) => ({ ...p, view: "cards" }))} aria-label="Card view" title="Card view">
              <LayoutGrid size={15} />
            </button>
          </div>
          {prefs.view === "table" && (
            <button className="adm-btn hide-sm" onClick={() => setPrefs((p) => ({ ...p, density: p.density === "comfy" ? "compact" : "comfy" }))} title="Row density">
              {prefs.density === "comfy" ? "Comfortable" : "Compact"}
            </button>
          )}
          <button className="adm-btn" onClick={() => exportOwners(visible, "shopbrain-owners")} disabled={!visible.length} title="Export the rows currently shown">
            <Download size={14} /> CSV
          </button>
        </div>
        <div className="adm-chips adm-in" style={{ marginBottom: 12, ["--i" as string]: 11 } as React.CSSProperties} role="group" aria-label="Filter by status">
          {chips.map((c) => (
            <button key={c.k} className={`adm-chip ${statusFilter === c.k ? "on" : ""}`} onClick={() => setStatusFilter(c.k)}>
              {c.l} <em>{c.n}</em>
            </button>
          ))}
        </div>
        <p className="adm-meta">
          <span>
            <b>{visible.length}</b> of {owners.length} shops
          </span>
          {filtersActive && (
            <button className="adm-link" onClick={clearFilters}>
              Clear filters
            </button>
          )}
          {selected.size > 0 && (
            <span>
              · <b>{selected.size}</b> selected
            </span>
          )}
        </p>

        {/* list */}
        {loading && owners.length === 0 ? (
          <div className="adm-card" style={{ padding: 14, display: "grid", gap: 10 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="adm-skel" style={{ height: 52, animationDelay: `${i * 90}ms` }} />
            ))}
          </div>
        ) : owners.length === 0 ? (
          <div className="adm-card adm-empty">
            <Users size={44} />
            <b style={{ color: "var(--fg)", fontSize: 16 }}>No shop owners registered yet.</b>
            <span>Add your first owner to start a trial.</span>
            <button className="adm-btn pri" onClick={() => setShowAddModal(true)}>
              <UserPlus size={14} /> Add Owner
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="adm-card adm-empty">
            <Search size={40} />
            <b style={{ color: "var(--fg)", fontSize: 16 }}>No shops match.</b>
            <span>Try a different search or clear the filters.</span>
            <button className="adm-btn" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : prefs.view === "table" ? (
          <div className="adm-card" style={{ overflow: "hidden" }}>
            <div className="adm-tablewrap">
              <table className={`adm-table ${prefs.density}`}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        className="adm-check"
                        checked={allOnPage}
                        onChange={() =>
                          setSelected((s) => {
                            const n = new Set(s);
                            pageRows.forEach((o) => (allOnPage ? n.delete(o.phone) : n.add(o.phone)));
                            return n;
                          })
                        }
                        aria-label="Select all on this page"
                      />
                    </th>
                    {([
                      ["Shop", "name"], ["Phone", null], ["Status", null], ["Access until", "expiry"], ["Customers", "customers"], ["Outstanding", "outstanding"], ["Actions", null],
                    ] as [string, SortKey | null][]).map(([t, k]) => (
                      <th key={t} className={k ? "s" : ""} onClick={k ? () => toggleSort(k) : undefined} style={t === "Actions" ? { textAlign: "right" } : undefined}>
                        {t}
                        {k && sort.key === k && <ChevronDown size={12} className={sort.dir === 1 ? "up" : ""} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((o, i) => (
                    <OwnerRow key={o.phone} o={o} i={i} selected={selected.has(o.phone)} busy={!!busy[o.phone]} flash={!!flash[o.phone]} maxOut={maxOut} h={handlers} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="adm-cards">
            {pageRows.map((o, i) => (
              <OwnerCard key={o.phone} o={o} i={i} selected={selected.has(o.phone)} busy={!!busy[o.phone]} flash={!!flash[o.phone]} maxOut={maxOut} h={handlers} />
            ))}
          </div>
        )}

        {visible.length > 0 && (
          <Pager page={page} pages={pages} total={visible.length} size={prefs.pageSize} setPage={setPage} setSize={(n) => setPrefs((p) => ({ ...p, pageSize: n }))} from={page * prefs.pageSize + 1} to={Math.min(visible.length, (page + 1) * prefs.pageSize)} />
        )}
      </div>

      {/* bulk bar */}
      {selected.size > 0 && (
        <div className="adm-bulk" role="toolbar" aria-label="Bulk actions">
          <b>{selected.size} selected</b>
          {selected.size < visible.length && !bulk && (
            <button className="adm-btn sm" onClick={() => setSelected(new Set(visible.map((o) => o.phone)))}>
              Select all {visible.length}
            </button>
          )}
          {[7, 30, 90].map((d) => (
            <button key={d} className="adm-btn sm" disabled={!!bulk} onClick={() => runBulk(`+${d} days`, [...selected], (o) => call(`/admin/owners/${enc(o.phone)}/extend`, { method: "POST", body: { days: d } }, "Failed to update owner."))}>
              +{d}d
            </button>
          ))}
          <button className="adm-btn sm" disabled={!!bulk} onClick={() => runBulk("Activate", [...selected].filter((p) => !byPhone.get(p)?.isActive), (o) => call(`/admin/owners/${enc(o.phone)}/activate`, { method: "POST" }, "Failed to update owner."))}>
            <PlayCircle size={13} /> Activate
          </button>
          <button className="adm-btn sm" disabled={!!bulk} onClick={() => runBulk("Deactivate", [...selected].filter((p) => byPhone.get(p)?.isActive), (o) => call(`/admin/owners/${enc(o.phone)}/deactivate`, { method: "POST" }, "Failed to update owner."))}>
            <Ban size={13} /> Deactivate
          </button>
          <button className="adm-btn sm" onClick={() => exportOwners(selectedList, "shopbrain-selected")}>
            <Download size={13} /> CSV
          </button>
          <button className="adm-btn sm icon" onClick={() => setSelected(new Set())} aria-label="Clear selection" disabled={!!bulk}>
            <X size={14} />
          </button>
          {bulk && (
            <div className="adm-bulkprog" aria-label={`${bulk.label} ${bulk.done} of ${bulk.total}`}>
              <i style={{ width: `${(bulk.done / bulk.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {/* overlays */}
      {drawer && drawerOwner && (
        <OwnerDrawer
          owner={drawerOwner}
          tab={drawer.tab}
          setTab={(tab) => setDrawer((d) => (d ? { ...d, tab } : d))}
          call={call}
          busy={!!busy[drawerOwner.phone]}
          onClose={() => setDrawer(null)}
          onExtend={(o, d) => void extend(o, d)}
          onEdit={(o) => setEditingOwner(o)}
          onToggle={(o) => void setActive(o, !o.isActive)}
          onRemove={(o) => setRemoving(o)}
          onCopy={copy}
          log={log}
        />
      )}
      {editingOwner && <EditOwnerModal owner={editingOwner} others={owners} saving={!!busy[editingOwner.phone]} onCancel={() => setEditingOwner(null)} onSave={(u) => saveEdit(editingOwner.phone, u)} />}
      {showAddModal && <AddOwnerModal owners={owners} saving={creating} onCancel={() => setShowAddModal(false)} onSave={createOwner} />}
      {removing && <ConfirmRemoveModal owner={removing} busy={!!busy[removing.phone]} onCancel={() => setRemoving(null)} onConfirm={() => removeOwner(removing)} />}
      {queueOpen && <RenewalQueue owners={renewalList} getMessage={(o) => renewalMessage(o as EOwner)} link={waLink} onClose={() => setQueueOpen(false)} />}
      {showActivity && (
        <Modal onClose={() => setShowActivity(false)} width={480}>
          <div className="adm-mh">
            <h2>Activity log</h2>
            <button onClick={() => setShowActivity(false)} className="adm-btn sm icon ghost" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <p style={{ margin: "-6px 0 10px", color: "var(--mutfg)", fontSize: 12 }}>Actions taken in this browser session. Cleared when you close the tab.</p>
          {activity.length === 0 ? (
            <div className="adm-empty" style={{ padding: 30 }}>
              <Activity size={30} />
              Nothing yet.
            </div>
          ) : (
            <div className="adm-log">
              {activity.map((a, i) => (
                <div key={a.id} style={{ ["--i" as string]: Math.min(i, 12) } as React.CSSProperties}>
                  <i className={a.ok ? "" : "bad"} />
                  <span>
                    {a.text}
                    <small>{new Date(a.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
      {palette && <Palette owners={enriched} actions={paletteActions} onOpenOwner={(phone) => setDrawer({ phone, tab: "overview" })} onClose={() => setPalette(false)} />}
      <Toasts items={toasts} dismiss={dismiss} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login gate (same /admin/verify call as before)
// ---------------------------------------------------------------------------

export default function Admin() {
  const [password, setPassword] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) setPassword(stored);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setNotice(null);

    if (!ADMIN_API_BASE) {
      setLoginError("Admin API endpoint isn't configured. Set VITE_ADMIN_API_URL.");
      setShake((n) => n + 1);
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
      setLoginError(errMsg(err, "Login failed."));
      setShake((n) => n + 1);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = useCallback((reason?: string) => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LOG_KEY);
    setPassword(null);
    setPasswordInput("");
    setNotice(typeof reason === "string" ? reason : null);
  }, []);

  if (!password) {
    return (
      <div className="adm-root adm-login">
        <style>{ADM_CSS + EXTRAS_CSS}</style>
        <div className="adm-aurora" aria-hidden />
        <div style={{ width: "100%", maxWidth: 392, position: "relative", zIndex: 1 }}>
          <Link href="/" className="adm-back">
            <ArrowLeft size={16} /> Back to site
          </Link>
          <div className="adm-lcard">
            <div className="adm-lock">
              <LockKeyhole size={24} />
            </div>
            <h1>Admin Access</h1>
            <p style={{ margin: "0 0 20px", color: "var(--mutfg)", fontSize: 13.5 }}>Enter the owner password to continue.</p>

            {notice && <div className="adm-notice">{notice}</div>}

            <form onSubmit={handleLogin}>
              <div className="adm-field">
                <label htmlFor="password">Password</label>
                <div className="adm-pw">
                  <input
                    key={shake}
                    className={`adm-input ${shake ? "adm-shake" : ""}`}
                    type={showPw ? "text" : "password"}
                    id="password"
                    required
                    autoFocus
                    autoComplete="current-password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    data-testid="input-admin-password"
                  />
                  <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {loginError && (
                <p className="err" style={{ margin: "-4px 0 12px", fontSize: 13, color: "var(--bad)" }} data-testid="text-admin-error">
                  {loginError}
                </p>
              )}

              <button type="submit" disabled={loggingIn} className="adm-btn pri" style={{ width: "100%", height: 42 }} data-testid="button-admin-login">
                {loggingIn ? <Loader2 size={16} className="adm-spin" /> : null}
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