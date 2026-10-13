import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import {
  LockKeyhole, ArrowLeft, Loader2, RefreshCw, MessageCircle, CheckCircle2, AlertTriangle, XCircle, Clock, Pencil, Trash2, Ban,
  PlayCircle, X, UserPlus, Users, Check, Search, Download, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, MoreHorizontal, Copy, Activity,
  LayoutGrid, List, Eye, EyeOff, Command, Zap, Bell, Inbox, TrendingUp, Calendar, Send, Sun, Moon,
  Star, Tag, Printer, Keyboard, Settings, ArrowUp, Upload, WifiOff, FileText, Bookmark, Layers, HelpCircle, Filter,
} from "lucide-react";
import { EXTRAS_CSS, extrasPointerMove, burst, RefreshBar, FunnelPanel, InactivePanel, RenewalQueue, NotesBox, HealthPill } from "./admin-extras";

// =============================================================================
// Shop Brain admin dashboard (admin.tsx)
//
// Backend contract (unchanged, nothing new is required from your server):
//   POST /admin/verify | GET,POST /admin/owners | PATCH,DELETE /admin/owners/:phone
//   POST /admin/owners/:phone/extend | .../activate | .../deactivate
//   GET /admin/owners/:phone/customers | PATCH /admin/customers/:id
//
// This version
//   PERFORMANCE  - scroll effects no longer read layout or write CSS variables on the page root
//                  (positions are measured once, then only transforms are written, only for cards near the screen)
//                - count-up numbers update the DOM directly instead of re-rendering React every frame
//                - typing in search no longer re-renders the analytics panels (memoised sections + deferred search)
//                - pointer glow and card tilt are throttled and use cached sizes; idle cards carry no 3D transform
//                - lighter shadows, no backdrop blur, a static background, no `transition: all`
//   NEW          - animated 3D intro with a live-data loader and a door-opening exit (once per sign-in)
//                - "Business snapshot": a panel whose two doors swing open as you scroll, revealing details
//                - static 3D pieces: spinning cube mark, floating isometric layer stack, 3D spotlight ring
//   TIDIER       - fewer header buttons (the rest live in the "More" menu), filters tucked into a Filters panel,
//                  essential insights shown by default with a "Show all insights" switch
//   KEPT         - everything from the previous version (search syntax, pins, tags, views, templates, import, exports...)
// =============================================================================

const ADMIN_API_BASE = import.meta.env.VITE_ADMIN_API_URL as string | undefined;
const SESSION_KEY = "shopbrain_admin_password";
const PREFS_KEY = "shopbrain_admin_prefs_v3";
const THEME_KEY = "shopbrain_admin_theme";
const LOG_KEY = "shopbrain_admin_activity";
const INTRO_KEY = "shopbrain_admin_intro_seen";
const PINS_KEY = "shopbrain_admin_pins";
const TAGS_KEY = "shopbrain_admin_tags";
const VIEWS_KEY = "shopbrain_admin_views";
const TPL_KEY = "shopbrain_admin_templates";
const HIST_KEY = "shopbrain_admin_search_history";
const IDLE_MS = 30 * 60 * 1000;
const DAY = 86400000;
const WEEK = 7 * DAY;
const TABLE_MIN_WIDTH = "(min-width: 1240px)";

type Theme = "light" | "dark";
type OwnerStatus = "no_trial" | "active" | "expiring" | "expired";
type Bucket = OwnerStatus | "deactivated";
type DrawerTab = "overview" | "customers" | "activity";

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
type ActivityItem = { id: number; at: number; text: string; ok: boolean; phone?: string };
type SortKey = "default" | "name" | "created" | "expiry" | "customers" | "outstanding";
type Accent = "emerald" | "blue" | "violet" | "amber" | "rose";
type Prefs = {
  density: "comfy" | "compact"; view: "table" | "cards"; pageSize: number; auto: boolean; refreshSec: number;
  layout: "grid" | "rail" | "wall"; accent: Accent; radius: "soft" | "sharp" | "round"; calm: boolean; roll: "off" | "soft" | "strong";
  hidden: string[]; collapsed: string[]; cols: string[]; pinFirst: boolean; paging: "pages" | "more"; intro: boolean;
};
type SavedView = { id: string; name: string; query: string; status: Bucket | "all"; sort: { key: SortKey; dir: 1 | -1 } };
type Tpl = { id: string; name: string; en: string; rw: string; enEnded?: string; rwEnded?: string };

// the extra analytics are tucked away by default so the page stays calm; "Show all insights" reveals them
const ESSENTIAL_HIDDEN = ["calendar", "histogram", "people", "quality"];
const DEFAULT_PREFS: Prefs = {
  density: "comfy", view: "cards", pageSize: 10, auto: false, refreshSec: 30, layout: "grid", accent: "emerald", radius: "soft",
  calm: false, roll: "soft", hidden: ESSENTIAL_HIDDEN, collapsed: [], cols: [], pinFirst: true, paging: "pages", intro: true,
};

const PANELS: { id: string; label: string }[] = [
  { id: "snapshot", label: "Scroll snapshot" }, { id: "quick", label: "Quick stats" }, { id: "donut", label: "Shops by status" },
  { id: "debt", label: "Biggest balances" }, { id: "growth", label: "New shops" }, { id: "spotlight", label: "3D spotlight" },
  { id: "forecast", label: "Renewal forecast" }, { id: "calendar", label: "Expiry calendar" }, { id: "histogram", label: "Balance spread" },
  { id: "people", label: "Languages & leaderboard" }, { id: "quality", label: "Data quality" }, { id: "attention", label: "Needs attention" },
  { id: "funnel", label: "Funnel & inactive shops" },
];
const COLS: [string, string][] = [["phone", "Phone"], ["status", "Status"], ["until", "Access until"], ["customers", "Customers"], ["outstanding", "Outstanding"]];
const ACCENTS: [Accent, string][] = [["emerald", "#047857"], ["blue", "#2563eb"], ["violet", "#7c3aed"], ["amber", "#d97706"], ["rose", "#e11d48"]];
const TAG_SUGGESTIONS = ["VIP", "Follow up", "Slow payer", "Partner", "Trial"];

const DEFAULT_TPLS: Tpl[] = [
  {
    id: "renew", name: "Renewal",
    en: "Hello {name}, your Shop Brain access ends on {date}. Reply here and we will extend it for you.",
    rw: "Muraho {name}, uburenganzira bwawe kuri Shop Brain buzarangira ku wa {date}. Twandikire tubwongere.",
    enEnded: "Hello {name}, your Shop Brain access ended on {date}. Reply here and we will extend it for you.",
    rwEnded: "Muraho {name}, uburenganzira bwawe kuri Shop Brain bwarangiye ku wa {date}. Twandikire tubwongere.",
  },
  { id: "welcome", name: "Welcome", en: "Welcome to Shop Brain, {name}! Send a message here to record your first debt.", rw: "Murakaza neza kuri Shop Brain, {name}! Mwandikire hano mwandike umwenda wa mbere." },
  { id: "checkin", name: "Check-in", en: "Hello {name}, how is Shop Brain working for you? Tell us if you need any help.", rw: "Muraho {name}, Shop Brain irabafasha ite? Nimukenera ubufasha, mutwandikire." },
  { id: "thanks", name: "Thank you", en: "Thank you for using Shop Brain, {name}!", rw: "Murakoze gukoresha Shop Brain, {name}!" },
];
let ACTIVE_TPLS: Tpl[] = DEFAULT_TPLS;

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

// Message templates: {name} {date} {days} are filled in. The "renew" template also has "ended" wording.
function fillTpl(t: Tpl, o: EOwner): string {
  const ended = o.daysLeft !== null && o.daysLeft < 0;
  const rw = o.language === "rw";
  const raw = ended && (rw ? t.rwEnded : t.enEnded) ? (rw ? t.rwEnded! : t.enEnded!) : rw ? t.rw : t.en;
  return raw
    .replace(/ ?\{name\}/g, o.name ? ` ${o.name}`.replace(/^ /, raw.includes(" {name}") ? " " : "") : "")
    .replace(/\{date\}/g, fmtDate(o.trialEndsAt))
    .replace(/\{days\}/g, o.daysLeft === null ? "" : String(Math.abs(o.daysLeft)));
}
const renewalMessage = (o: EOwner) => fillTpl(ACTIVE_TPLS.find((t) => t.id === "renew") ?? DEFAULT_TPLS[0], o);
const debtMsg = (c: Customer, shop: string, rw: boolean) =>
  rw ? `Muraho ${c.name}, turabibutsa ko mufitiye ${shop} ${money(c.totalOwed)}. Murakoze.` : `Hello ${c.name}, a friendly reminder that you owe ${shop} ${money(c.totalOwed)}. Thank you.`;

const csvCell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  // stop spreadsheet formula injection from user-typed names
  if (/^[=@]/.test(s) || (/^[+\-]/.test(s) && !/^[+\-]\d[\d\s-]*$/.test(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  downloadText(name, "\ufeff" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}
const stamp = () => new Date().toISOString().slice(0, 10);

function errMsg(e: unknown, fallback = "Something went wrong.") {
  if (e instanceof TypeError) return "Network error. Check your connection and try again.";
  return e instanceof Error && e.message ? e.message : fallback;
}

const BUCKETS: { key: Bucket; label: string; color: string }[] = [
  { key: "active", label: "Active", color: "var(--ok)" },
  { key: "expiring", label: "Expiring soon", color: "var(--amber)" },
  { key: "expired", label: "Expired", color: "var(--bad)" },
  { key: "deactivated", label: "Deactivated", color: "var(--off)" },
  { key: "no_trial", label: "No trial set", color: "var(--viol)" },
];

function loadLog(): ActivityItem[] {
  try {
    return JSON.parse(sessionStorage.getItem(LOG_KEY) || "[]");
  } catch {
    return [];
  }
}
function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* private mode */
  }
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) return "dark";
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// ---- smart search: "status:expired lang:rw tag:vip owes>50k customers<3 days<=7 joined:30 is:pinned maria"
type Cmp = { f: "owes" | "customers" | "days"; op: string; n: number };
interface Parsed { text: string; status?: Bucket; lang?: string; tags: string[]; cmps: Cmp[]; joined?: number; is: string[]; tokens: string[] }
const STATUS_ALIAS: Record<string, Bucket> = { active: "active", expiring: "expiring", expired: "expired", deactivated: "deactivated", off: "deactivated", notrial: "no_trial", no_trial: "no_trial" };
const cmp = (a: number, op: string, b: number) => (op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : op === ">=" ? a >= b : a === b);

function parseQuery(raw: string): Parsed {
  const p: Parsed = { text: "", tags: [], cmps: [], is: [], tokens: [] };
  const rest: string[] = [];
  for (const t of raw.trim().split(/\s+/).filter(Boolean)) {
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^status:(\w+)$/i)) && STATUS_ALIAS[m[1].toLowerCase()]) p.status = STATUS_ALIAS[m[1].toLowerCase()];
    else if ((m = t.match(/^lang:(\w+)$/i))) p.lang = m[1].toLowerCase();
    else if ((m = t.match(/^tag:(.+)$/i))) p.tags.push(m[1].toLowerCase());
    else if ((m = t.match(/^(owes|customers|days)(<=|>=|<|>|:|=)(-?\d+(?:\.\d+)?)(k?)$/i)))
      p.cmps.push({ f: m[1].toLowerCase() as Cmp["f"], op: m[2] === ":" ? "=" : m[2], n: parseFloat(m[3]) * (m[4] ? 1000 : 1) });
    else if ((m = t.match(/^joined:(\d+)d?$/i))) p.joined = Number(m[1]);
    else if ((m = t.match(/^is:(\w+)$/i))) p.is.push(m[1].toLowerCase());
    else {
      rest.push(t);
      continue;
    }
    p.tokens.push(t);
  }
  p.text = rest.join(" ");
  return p;
}
const qTokens = (q: string) => q.split(/\s+/).filter(Boolean);
const hasToken = (q: string, tok: string) => qTokens(q).some((t) => t.toLowerCase() === tok.toLowerCase());
// toggles a token in the query; with `prefix`, other tokens of the same kind (lang:, joined:) are replaced
function toggleToken(q: string, tok: string, prefix?: string) {
  const had = hasToken(q, tok);
  let ts = qTokens(q).filter((t) => t.toLowerCase() !== tok.toLowerCase());
  if (prefix) ts = ts.filter((t) => !t.toLowerCase().startsWith(prefix));
  return (had ? ts : [...ts, tok]).join(" ");
}

// ---------------------------------------------------------------------------
// Contexts and hooks
// ---------------------------------------------------------------------------

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });
const useTheme = () => useContext(ThemeCtx);

// state that is saved in localStorage (objects are merged with their defaults)
function useLocal<T>(key: string, init: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      if (s) {
        const j = JSON.parse(s);
        return init && typeof init === "object" && !Array.isArray(init) ? ({ ...init, ...j } as T) : (j as T);
      }
    } catch {
      /* ignore */
    }
    return init;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  }, [key, v]);
  return [v, setV];
}

function useMedia(query: string) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setM(mq.matches);
    h();
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, [query]);
  return m;
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

// One scroll loop for the whole page, built to stay cheap:
//  - element positions are measured only on mount / resize / layout change, never while scrolling
//  - while scrolling it only writes transforms, and only for elements near the screen
//  - it never writes CSS variables on a shared ancestor (that would restyle the whole tree each frame)
// It drives: scroll progress bar, background parallax, the "rolling" cards (data-roll) and the opening doors (data-open).
function useScrollFx(dep: string, mode: "off" | "soft" | "strong", calm: boolean) {
  useEffect(() => {
    const animate = !calm && !prefersReduced();
    const progEl = document.querySelector<HTMLElement>(".adm-prog");
    const auroraEl = document.querySelector<HTMLElement>(".adm-aurora");
    type RollItem = { el: HTMLElement; mid: number; on: boolean };
    type OpenItem = { el: HTMLElement; top: number; span: number; last: number };
    let rolls: RollItem[] = [];
    let opens: OpenItem[] = [];
    let vh = window.innerHeight, docMax = 1, raf = 0, mraf = 0;
    const strong = mode === "strong";

    const reset = (r: RollItem) => {
      r.el.style.transform = "";
      r.el.style.opacity = "";
      r.el.style.willChange = "";
      r.on = false;
    };
    const run = () => {
      raf = 0;
      const y = window.scrollY;
      if (progEl) progEl.style.transform = `scaleX(${Math.min(1, y / docMax).toFixed(4)})`;
      if (!animate) return;
      if (auroraEl) auroraEl.style.transform = `translate3d(0,${(-y * 0.08).toFixed(1)}px,0)`;
      for (const o of opens) {
        const p = clamp((y + 64 - o.top) / o.span, 0, 1);
        if (p !== o.last && (Math.abs(p - o.last) > 0.002 || p === 0 || p === 1)) {
          o.el.style.setProperty("--open", p.toFixed(3));
          o.last = p;
        }
      }
      if (mode === "off") return;
      const maxTilt = (window.innerWidth < 760 ? 0.65 : 1) * (strong ? 34 : 20);
      const depth = strong ? 100 : 50;
      for (const r of rolls) {
        const d = (r.mid - y - vh / 2) / (vh * 0.62);
        const a = Math.abs(d);
        const e = Math.min(1, Math.max(0, a - 0.38) / 0.62);
        if (a > 1.7 || e < 0.02) {
          if (r.on) reset(r);
          continue;
        }
        const s = d < 0 ? -1 : 1;
        r.el.style.willChange = "transform, opacity";
        r.el.style.transform = `perspective(1100px) rotateX(${(-s * e * maxTilt).toFixed(1)}deg) translate3d(0,0,${(-e * depth).toFixed(0)}px) scale(${(1 - e * 0.05).toFixed(3)})`;
        r.el.style.opacity = (1 - e * e * 0.5).toFixed(2);
        r.on = true;
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    const measure = () => {
      mraf = 0;
      const y = window.scrollY;
      vh = window.innerHeight;
      docMax = Math.max(1, document.documentElement.scrollHeight - vh);
      rolls = Array.from(document.querySelectorAll<HTMLElement>("[data-roll]")).map((el) => {
        const r = el.getBoundingClientRect();
        return { el, mid: r.top + r.height / 2 + y, on: el.style.transform !== "" };
      });
      opens = Array.from(document.querySelectorAll<HTMLElement>("[data-open]")).map((el) => {
        const r = el.getBoundingClientRect();
        const stage = el.firstElementChild as HTMLElement | null;
        return { el, top: r.top + y, span: Math.max(1, r.height - (stage ? stage.offsetHeight : vh)), last: -1 };
      });
      schedule();
    };
    const scheduleMeasure = () => {
      if (!mraf) mraf = requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    const wrap = document.querySelector(".adm-wrap");
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleMeasure) : null;
    if (wrap) ro?.observe(wrap);
    const t1 = setTimeout(scheduleMeasure, 60);
    const t2 = setTimeout(scheduleMeasure, 800);
    measure();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", scheduleMeasure);
      ro?.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      if (raf) cancelAnimationFrame(raf);
      if (mraf) cancelAnimationFrame(mraf);
      rolls.forEach(reset);
      opens.forEach((o) => o.el.style.removeProperty("--open"));
      if (auroraEl) auroraEl.style.transform = "";
    };
  }, [dep, mode, calm]);
}

// glow that follows the mouse over cards. One listener, throttled to a frame, sizes cached per hovered card.
function usePointerFx(rootRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let el: HTMLElement | null = null, rect: DOMRect | null = null, raf = 0, lx = 0, ly = 0, lastT = 0;
    const apply = () => {
      raf = 0;
      if (el && rect) {
        el.style.setProperty("--mx", `${(lx - rect.left).toFixed(0)}px`);
        el.style.setProperty("--my", `${(ly - rect.top).toFixed(0)}px`);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const t = e.target as Element;
      const s = (t.closest?.(".adm-spot") as HTMLElement | null) ?? null;
      if (s !== el) {
        el = s;
        rect = s ? s.getBoundingClientRect() : null;
      }
      lx = e.clientX;
      ly = e.clientY;
      if (el && !raf) raf = requestAnimationFrame(apply);
      if (t.closest?.(".adm-tilt") && e.timeStamp - lastT > 24) {
        lastT = e.timeStamp;
        extrasPointerMove(e as unknown as React.PointerEvent);
      }
    };
    const drop = () => {
      el = null;
      rect = null;
    };
    root.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", drop, { passive: true });
    return () => {
      root.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", drop);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [rootRef]);
}

// number that counts up by writing text straight into the DOM (no React re-render per frame)
function CountUp({ value, ms = 800 }: { value: number; ms?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const from = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced()) {
      el.textContent = value.toLocaleString();
      from.current = value;
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const v = a + (value - a) * (1 - Math.pow(1 - p, 3));
      from.current = v;
      el.textContent = Math.round(v).toLocaleString();
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span ref={ref}>0</span>;
}

function Roll({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`adm-roll ${className}`} data-roll>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (self-contained: light and dark palettes live here, nothing is read from your site theme)
// ---------------------------------------------------------------------------

const ADM_CSS = `
.adm-root,.adm-pt{
  --bg:#eaeff6;--fg:#0f172a;--card:#ffffff;--bd:#d0d8e4;--mut:#f0f3f8;--mutfg:#516074;
  --pri:#047857;--prifg:#ffffff;--rad:16px;
  --ok:#047857;--warn:#b45309;--amber:#d97706;--bad:#dc2626;--off:#64748b;--viol:#7c3aed;
  --shadow:0 1px 2px rgba(15,23,42,.07),0 6px 14px -10px rgba(15,23,42,.22);
  --ease:cubic-bezier(.16,1,.3,1);--spring:cubic-bezier(.34,1.4,.64,1);
  color-scheme:light}
.adm-root[data-theme="dark"],.adm-pt[data-theme="dark"]{
  --bg:#0a0f1d;--fg:#e8edf7;--card:#131a2c;--bd:#2b3752;--mut:#1a2338;--mutfg:#9fadc7;
  --pri:#34d399;--prifg:#052e1f;
  --ok:#34d399;--warn:#fbbf24;--amber:#fbbf24;--bad:#f87171;--off:#94a3b8;--viol:#a78bfa;
  --shadow:0 1px 2px rgba(0,0,0,.5),0 8px 18px -12px rgba(0,0,0,.85);
  color-scheme:dark}
.adm-root[data-accent="blue"],.adm-pt[data-accent="blue"]{--pri:#2563eb}
.adm-root[data-accent="violet"],.adm-pt[data-accent="violet"]{--pri:#7c3aed}
.adm-root[data-accent="amber"],.adm-pt[data-accent="amber"]{--pri:#b45309}
.adm-root[data-accent="rose"],.adm-pt[data-accent="rose"]{--pri:#e11d48}
.adm-root[data-theme="dark"][data-accent="blue"],.adm-pt[data-theme="dark"][data-accent="blue"]{--pri:#60a5fa;--prifg:#07142e}
.adm-root[data-theme="dark"][data-accent="violet"],.adm-pt[data-theme="dark"][data-accent="violet"]{--pri:#a78bfa;--prifg:#1d0b3d}
.adm-root[data-theme="dark"][data-accent="amber"],.adm-pt[data-theme="dark"][data-accent="amber"]{--pri:#fbbf24;--prifg:#2b1a02}
.adm-root[data-theme="dark"][data-accent="rose"],.adm-pt[data-theme="dark"][data-accent="rose"]{--pri:#fb7185;--prifg:#3b0a16}
.adm-root[data-rad="sharp"]{--rad:6px}.adm-root[data-rad="round"]{--rad:24px}
.adm-pt{display:contents;color:var(--fg);font-size:14px;line-height:1.45}
.adm-root{position:relative;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--fg);font-size:14px;line-height:1.45;overflow-x:clip}
.adm-root *,.adm-root *::before,.adm-root *::after,.adm-pt *,.adm-pt *::before,.adm-pt *::after{box-sizing:border-box}
.adm-root button,.adm-pt button{font:inherit;color:inherit;cursor:pointer}
.adm-root button:disabled,.adm-pt button:disabled{cursor:not-allowed}
.adm-root :focus-visible,.adm-pt :focus-visible{outline:2px solid var(--pri);outline-offset:2px}
.adm-root[data-intro] *{animation-play-state:paused !important}
.adm-root[data-calm] *:not(.adm-toastbar),.adm-root[data-calm] *::before,.adm-root[data-calm] *::after{animation:none !important;transition:none !important}
.adm-root[data-calm] .adm-aurora{display:none}
.adm-root[data-calm] .adm-roll,.adm-root[data-calm] .adm-ocard{transform:none !important;opacity:1 !important}

/* static background (only its transform changes, on scroll) */
.adm-aurora{position:fixed;inset:-20vh 0;pointer-events:none;z-index:0;will-change:transform;
  background:radial-gradient(55vmax 55vmax at 105% 0%,color-mix(in srgb,var(--pri) 15%,transparent),transparent 60%),radial-gradient(50vmax 50vmax at -10% 105%,rgba(255,201,51,.09),transparent 60%)}
@media (max-width:760px){.adm-aurora{display:none}}
.adm-prog{position:fixed;top:0;left:0;right:0;height:3px;z-index:36;background:linear-gradient(90deg,var(--pri),color-mix(in srgb,var(--pri) 50%,#facc15));transform-origin:0 50%;transform:scaleX(0);pointer-events:none}

.adm-wrap{position:relative;z-index:1;max-width:1280px;margin:0 auto;padding:24px 20px 120px;min-width:0}
@keyframes adm-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes adm-fadein{from{opacity:0}to{opacity:1}}
.adm-in{animation:adm-in .55s var(--ease) both;animation-delay:calc(var(--i,0) * 40ms)}
[id^="sec-"]{scroll-margin-top:64px}
.adm-sh{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:22px 0 10px}
.adm-sh h2{margin:0;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--mutfg)}

/* rolling cards */
.adm-roll{min-width:0;transform-origin:50% 50%}
.adm-kpis>.adm-roll>*,.adm-grid>.adm-roll>*,.adm-cards>.adm-roll>*,.adm-duo>.adm-roll>*{height:100%}
.adm-roll>.adm-kpi{width:100%;display:block}
.adm-grid>.adm-roll.wide{grid-column:1/-1}

/* header */
.adm-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.adm-brand{display:flex;align-items:center;gap:14px;min-width:0}
.adm-title{margin:0;font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--fg);background:linear-gradient(100deg,var(--fg) 35%,var(--pri));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.adm-sub{margin:2px 0 0;color:var(--mutfg);display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px}
.adm-live{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--mutfg)}
.adm-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);position:relative}
.adm-dot::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--ok);animation:adm-pulse 2s ease-out infinite}
.adm-dot.off{background:var(--off)}.adm-dot.off::after{display:none}
@keyframes adm-pulse{from{transform:scale(1);opacity:.55}to{transform:scale(3);opacity:0}}
.adm-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.adm-offline{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 14px;border-radius:12px;background:color-mix(in srgb,var(--warn) 16%,var(--card));border:1px solid color-mix(in srgb,var(--warn) 40%,transparent);color:var(--warn);font-weight:600;font-size:13px}

/* sticky section nav + back to top */
.adm-nav{position:sticky;top:0;z-index:30;display:flex;gap:6px;align-items:center;margin:0 -6px 14px;padding:8px 6px;overflow-x:auto;scrollbar-width:none;background:color-mix(in srgb,var(--bg) 92%,transparent)}
.adm-nav::-webkit-scrollbar{display:none}
.adm-nav button{flex:none;height:32px;padding:0 13px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--mutfg);font-size:12.5px;font-weight:700;transition:background-color .2s,color .2s}
.adm-nav button:hover{color:var(--fg);background:var(--mut)}
.adm-nav button.on{background:var(--fg);color:var(--bg)}
.adm-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:35;width:44px;height:44px;border-radius:50%;border:1px solid var(--bd);background:var(--card);color:var(--fg);display:grid;place-items:center;box-shadow:0 10px 22px -10px rgba(0,0,0,.5);animation:adm-in .35s var(--spring) both}
.adm-fab:hover{border-color:var(--pri);color:var(--pri)}

/* buttons: one size scale (38 / 32) and one look, for <button> and <a> alike */
.adm-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 14px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--fg);font-size:13px;font-weight:600;line-height:1;white-space:nowrap;text-decoration:none;transition:transform .18s var(--ease),background-color .18s,border-color .18s,box-shadow .18s,filter .18s}
.adm-btn:hover:not(:disabled){background:var(--mut);border-color:color-mix(in srgb,var(--fg) 22%,var(--bd))}
.adm-btn:active:not(:disabled){transform:scale(.97)}
.adm-btn:disabled{opacity:.55}
.adm-btn.pri{background:var(--pri);border-color:var(--pri);color:var(--prifg)}
.adm-btn.pri:hover:not(:disabled){background:var(--pri);border-color:var(--pri);filter:brightness(1.1)}
.adm-btn.danger{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 45%,var(--bd))}
.adm-btn.danger:hover:not(:disabled){background:color-mix(in srgb,var(--bad) 10%,var(--card))}
.adm-btn.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,var(--bd))}
.adm-btn.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 45%,var(--bd))}
.adm-btn.sm{height:32px;padding:0 11px;font-size:12px;border-radius:9px}
.adm-btn.icon{width:32px;padding:0}
.adm-btn.sq{width:38px;padding:0}
.adm-btn.ghost{background:transparent;border-color:transparent}
.adm-btn b{font-variant-numeric:tabular-nums}
.adm-star{color:var(--mutfg)}.adm-star.on{color:var(--amber)}
.adm-kbd{font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:3px 5px;border:1px solid var(--bd);border-radius:5px;color:var(--mutfg);background:var(--mut)}
@media (hover:none){.adm-kbd{display:none}}
.adm-spin{animation:adm-spin .8s linear infinite}
@keyframes adm-spin{to{transform:rotate(360deg)}}
.adm-ringsvg{width:16px;height:16px;transform:rotate(-90deg)}
.adm-ringsvg circle{fill:none;stroke-width:3}
.adm-ringsvg .bg{stroke:var(--bd)}.adm-ringsvg .fg{stroke:var(--pri);stroke-dasharray:44;animation:adm-ring linear infinite}
@keyframes adm-ring{from{stroke-dashoffset:44}to{stroke-dashoffset:0}}
.adm-themebtn svg{transition:transform .4s var(--spring)}
.adm-themebtn:hover svg{transform:rotate(25deg) scale(1.12)}

/* cards */
.adm-card{position:relative;background:var(--card);border:1px solid var(--bd);border-radius:var(--rad);box-shadow:var(--shadow)}
.adm-spot::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .3s;background:radial-gradient(320px circle at var(--mx,50%) var(--my,50%),color-mix(in srgb,var(--pri) 12%,transparent),transparent 60%)}
.adm-spot:hover::after{opacity:1}

.adm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:12px;margin-bottom:6px}
.adm-kpi{padding:16px 16px 14px;text-align:left;overflow:hidden;color:var(--fg);transition:transform .25s var(--ease),border-color .2s,box-shadow .2s}
.adm-kpi:hover{transform:translateY(-3px)}
.adm-kpi.is-on{border-color:var(--pri);box-shadow:0 0 0 1px var(--pri),var(--shadow)}
.adm-kpi .top{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--mutfg);font-size:12px;font-weight:600}
.adm-kpi .ico{width:28px;height:28px;flex:none;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--c,var(--pri)) 15%,transparent);color:var(--c,var(--pri))}
.adm-kpi .val{margin-top:10px;font-size:26px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.adm-kpi .val small{font-size:13px;font-weight:600;color:var(--mutfg);margin-left:4px}
.adm-kpi .hint{margin-top:2px;font-size:11.5px;color:var(--mutfg)}
.adm-spark{display:block;width:100%;height:26px;margin-top:8px;color:var(--c,var(--pri))}
.adm-spark path.l{fill:none;stroke:currentColor;stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round}
.adm-spark path.a{fill:currentColor;opacity:.13}

.adm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px;margin-bottom:8px}
.adm-duo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:8px}
.adm-panel{padding:16px 18px;overflow:hidden;min-width:0}
.adm-panel h3{margin:0 0 12px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px}
.adm-panel h3>.ico{display:inline-flex;color:var(--pri);flex:none}
.adm-panel h3 .adm-collapse{margin-left:auto;flex:none;width:26px;height:26px}
.adm-collapse svg{transition:transform .25s var(--ease)}
.adm-collapsed h3{margin-bottom:0}.adm-collapsed .adm-collapse svg{transform:rotate(180deg)}.adm-collapsed .adm-pbody{display:none}
.adm-donutwrap{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.adm-donut{width:132px;height:132px;flex:none}
.adm-seg{fill:none;stroke-linecap:butt;cursor:pointer;transform-origin:60px 60px;animation:adm-seg 1s var(--ease) both;animation-delay:calc(var(--i,0) * 70ms);transition:stroke-width .2s}
@keyframes adm-seg{from{stroke-dasharray:0 var(--C)}}
.adm-donut text{text-anchor:middle;fill:var(--fg);font-weight:800}
.adm-legend{display:grid;gap:5px;flex:1;min-width:130px}
.adm-legend button{display:flex;align-items:center;gap:8px;border:0;background:transparent;padding:4px 6px;border-radius:7px;text-align:left;font-size:12.5px;color:var(--fg);transition:background-color .15s}
.adm-legend button:hover,.adm-legend button.on{background:var(--mut)}
.adm-legend i{width:9px;height:9px;border-radius:3px;flex:none}
.adm-legend b{margin-left:auto;font-variant-numeric:tabular-nums}
.adm-bars{display:grid;gap:9px}
.adm-brow{display:grid;grid-template-columns:minmax(70px,120px) 1fr auto;align-items:center;gap:10px;width:100%;border:0;background:transparent;padding:2px 0;text-align:left;font-size:12.5px;color:var(--fg)}
.adm-brow span.n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-brow:hover span.n{color:var(--pri)}
.adm-btrack{height:9px;border-radius:5px;background:var(--mut);box-shadow:inset 0 0 0 1px var(--bd);overflow:hidden}
.adm-btrack i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--pri),color-mix(in srgb,var(--pri) 55%,#facc15));transform-origin:0 50%;animation:adm-growx .8s var(--ease) both;animation-delay:calc(var(--i,0) * 60ms + 150ms)}
@keyframes adm-growx{from{transform:scaleX(0)}}
.adm-brow b{font-variant-numeric:tabular-nums;font-size:12px;white-space:nowrap}
.adm-sign{display:flex;align-items:flex-end;gap:6px;height:104px}
.adm-sign>*{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;height:100%;border:0;background:transparent;padding:0}
.adm-sign i{display:block;width:100%;min-height:3px;border-radius:5px 5px 2px 2px;background:linear-gradient(0deg,var(--pri),color-mix(in srgb,var(--pri) 50%,#a7f3d0));transform-origin:50% 100%;animation:adm-growy .7s var(--ease) both;animation-delay:calc(var(--i,0) * 50ms + 200ms)}
.adm-sign i.bad{background:linear-gradient(0deg,var(--bad),color-mix(in srgb,var(--bad) 55%,#fecaca))}
@keyframes adm-growy{from{transform:scaleY(0)}}
.adm-sign span{font-size:10.5px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--fg)}
.adm-sign small{font-size:9.5px;color:var(--mutfg)}
.adm-sign button:hover i{filter:brightness(1.15)}
.adm-trend{font-size:12px;color:var(--mutfg);margin:8px 0 0}
.adm-trend b{color:var(--ok)}
.adm-qs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr));gap:10px}
.adm-qs div{padding:10px 12px;border:1px solid var(--bd);border-radius:12px;background:var(--mut)}
.adm-qs small{display:block;color:var(--mutfg);font-size:11px;font-weight:600}
.adm-qs b{font-size:17px;font-variant-numeric:tabular-nums}

/* heat calendar */
.adm-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
.adm-cal em{font-style:normal;text-align:center;font-size:10px;color:var(--mutfg);font-weight:700}
.adm-cal button{aspect-ratio:1;min-height:30px;border:1px solid var(--bd);border-radius:8px;background:color-mix(in srgb,var(--pri) calc(var(--h,0) * 22%),var(--mut));color:var(--fg);font-size:10.5px;font-weight:700;display:grid;place-items:center;line-height:1;transition:transform .15s var(--ease)}
.adm-cal button:hover{transform:scale(1.1);border-color:var(--pri)}
.adm-cal button.today{outline:2px solid var(--pri);outline-offset:1px}
.adm-cal button.empty{visibility:hidden}
.adm-cal button small{display:block;font-size:9px;color:var(--mutfg);margin-top:2px}
.adm-qrow{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed var(--bd);font-size:12.5px}
.adm-qrow:last-child{border-bottom:0}
.adm-qrow b{margin-left:auto;font-variant-numeric:tabular-nums}

/* 3D spotlight ring (static 3D) */
.adm-ring{height:210px;perspective:900px;display:grid;place-items:center}
.adm-ringin{position:relative;width:190px;height:158px;transform-style:preserve-3d;transition:transform .9s var(--ease)}
.adm-ringcard{position:absolute;inset:0;padding:14px;border:1px solid var(--bd);border-radius:calc(var(--rad) - 2px);background:var(--card);box-shadow:var(--shadow);backface-visibility:hidden;-webkit-backface-visibility:hidden;display:grid;gap:8px;align-content:center;justify-items:start;transition:opacity .5s}
.adm-ringcard b{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.adm-ringctl{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:6px}
.adm-dots{display:flex;gap:5px}.adm-dots i{width:7px;height:7px;border-radius:50%;background:var(--bd);transition:width .25s,background-color .25s}.adm-dots i.on{background:var(--pri);width:18px;border-radius:4px}

/* 3D cube mark (static 3D, spins by itself) */
.adm-cubewrap{display:inline-block;width:var(--s);height:var(--s);perspective:600px;flex:none}
.adm-cube{display:block;position:relative;width:100%;height:100%;transform-style:preserve-3d;animation:adm-cube 16s linear infinite}
.adm-cubewrap.mini .adm-cube{animation-duration:11s}
.adm-cube i{position:absolute;inset:0;display:grid;place-items:center;color:var(--pri);border:1px solid color-mix(in srgb,var(--pri) 55%,transparent);border-radius:calc(var(--s) * .14);background:linear-gradient(145deg,color-mix(in srgb,var(--pri) 32%,var(--card)),color-mix(in srgb,var(--pri) 8%,var(--card)))}
.adm-cube i:nth-child(1){transform:translateZ(calc(var(--s) / 2))}
.adm-cube i:nth-child(2){transform:rotateY(180deg) translateZ(calc(var(--s) / 2))}
.adm-cube i:nth-child(3){transform:rotateY(90deg) translateZ(calc(var(--s) / 2))}
.adm-cube i:nth-child(4){transform:rotateY(-90deg) translateZ(calc(var(--s) / 2))}
.adm-cube i:nth-child(5){transform:rotateX(90deg) translateZ(calc(var(--s) / 2))}
.adm-cube i:nth-child(6){transform:rotateX(-90deg) translateZ(calc(var(--s) / 2))}
@keyframes adm-cube{from{transform:rotateX(-22deg) rotateY(0)}to{transform:rotateX(-22deg) rotateY(360deg)}}

/* intro */
.adm-intro{position:fixed;inset:0;z-index:200;perspective:1800px;overflow:hidden;color:var(--fg);animation:adm-fadein .35s ease both}
.adm-idoor{position:absolute;top:0;bottom:0;width:50.3%;background:radial-gradient(120vmax 90vmax at var(--ox) 42%,color-mix(in srgb,var(--pri) 20%,var(--bg)),var(--bg) 62%);transition:transform 1s var(--ease);box-shadow:0 0 60px rgba(0,0,0,.25)}
.adm-idoor.l{left:0;--ox:100%;transform-origin:0 50%}
.adm-idoor.r{right:0;--ox:0%;transform-origin:100% 50%}
.adm-intro.out .adm-idoor.l{transform:rotateY(-104deg)}
.adm-intro.out .adm-idoor.r{transform:rotateY(104deg)}
.adm-iface{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:16px;text-align:center;padding:24px}
.adm-intro.out .adm-iface{opacity:0;transform:scale(1.1);transition:opacity .4s,transform .6s var(--ease)}
.adm-stage3d{position:relative;width:260px;height:190px;display:grid;place-items:center}
.adm-orbit{position:absolute;left:50%;top:50%;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--pri) 45%,transparent);animation:adm-orb 9s linear infinite}
.adm-orbit.a{width:210px;height:210px;--t:70deg}
.adm-orbit.b{width:160px;height:160px;--t:62deg;animation-duration:6s;animation-direction:reverse;border-style:dashed}
@keyframes adm-orb{from{transform:perspective(700px) translate(-50%,-50%) rotateX(var(--t)) rotateZ(0)}to{transform:perspective(700px) translate(-50%,-50%) rotateX(var(--t)) rotateZ(360deg)}}
.adm-ititle{margin:0;font-size:clamp(34px,7vw,56px);font-weight:800;letter-spacing:-.03em;perspective:600px}
.adm-letter{display:inline-block;opacity:0;transform:translateY(22px) rotateX(-80deg);animation:adm-letter .8s var(--ease) forwards;animation-delay:calc(var(--d) * 45ms + 450ms)}
@keyframes adm-letter{to{opacity:1;transform:none}}
.adm-isub{margin:0;color:var(--mutfg);font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:12px;opacity:0;animation:adm-fadein .6s ease 1.1s forwards}
.adm-iprog{width:min(260px,70vw);height:4px;border-radius:2px;background:var(--bd);overflow:hidden}
.adm-iprog i{display:block;height:100%;background:linear-gradient(90deg,var(--pri),color-mix(in srgb,var(--pri) 50%,#facc15));transform-origin:0 50%;transition:transform 1.8s var(--ease)}
.adm-istats{display:flex;gap:26px;flex-wrap:wrap;justify-content:center;min-height:42px;opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s var(--ease)}
.adm-istats.on{opacity:1;transform:none}
.adm-istats div{display:grid;gap:2px}.adm-istats b{font-size:20px;font-variant-numeric:tabular-nums}.adm-istats small{color:var(--mutfg);font-size:11px;font-weight:600}
.adm-ienter{min-width:210px;height:44px;opacity:0;animation:adm-fadein .5s ease 1.3s forwards}
.adm-iskip{position:absolute;top:14px;right:14px}

/* business snapshot: two doors swing open as you scroll (--open goes 0 to 1) */
.adm-open{--open:0;position:relative;height:190vh;margin:6px 0 4px}
.adm-stage{position:sticky;top:64px;height:min(540px,calc(100vh - 88px));perspective:1500px}
.adm-back{position:absolute;inset:0;padding:22px;border:1px solid var(--bd);border-radius:var(--rad);background:var(--card);box-shadow:var(--shadow);overflow:hidden;opacity:calc(.25 + var(--open) * .75);transform:scale(calc(.93 + var(--open) * .07))}
.adm-door{position:absolute;top:0;bottom:0;width:50%;display:flex;align-items:center;padding:0 clamp(14px,3vw,40px);border:1px solid var(--bd);background:linear-gradient(160deg,color-mix(in srgb,var(--pri) 26%,var(--card)),var(--card) 72%);box-shadow:var(--shadow);opacity:calc(1.15 - var(--open));backface-visibility:hidden;will-change:transform}
.adm-door span{font-size:clamp(26px,5vw,52px);font-weight:800;letter-spacing:-.03em;line-height:1}
.adm-door.l{left:0;justify-content:flex-end;border-radius:var(--rad) 0 0 var(--rad);transform-origin:0 50%;transform:rotateY(calc(var(--open) * -112deg))}
.adm-door.r{right:0;justify-content:flex-start;border-radius:0 var(--rad) var(--rad) 0;transform-origin:100% 50%;transform:rotateY(calc(var(--open) * 112deg))}
.adm-hint{position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:12px;font-weight:700;color:var(--mutfg);opacity:calc(1 - var(--open) * 4);pointer-events:none}
.adm-snap{display:grid;grid-template-columns:1.15fr 1fr 170px;gap:20px;height:100%}
.adm-snap h4{margin:0 0 10px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--mutfg)}
.adm-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start}
.adm-tile{padding:14px;border:1px solid var(--bd);border-radius:14px;background:var(--mut)}
.adm-tile small{display:block;color:var(--mutfg);font-size:11px;font-weight:600}
.adm-tile b{display:block;margin-top:4px;font-size:22px;font-variant-numeric:tabular-nums;letter-spacing:-.02em;overflow-wrap:anywhere}
.adm-lists{display:grid;gap:16px;align-content:start;min-width:0}
.adm-li{display:flex;align-items:center;gap:10px;width:100%;padding:8px 0;border:0;border-bottom:1px dashed var(--bd);background:transparent;text-align:left;font-size:13px;color:var(--fg)}
.adm-li:last-child{border-bottom:0}
.adm-li span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.adm-li small{color:var(--mutfg);font-weight:600;white-space:nowrap}
.adm-li:hover span{color:var(--pri)}
/* floating isometric layers (static 3D) */
.adm-iso{perspective:900px;display:grid;place-items:center}
.adm-isoin{position:relative;width:118px;height:118px;transform-style:preserve-3d;transform:rotateX(58deg) rotateZ(-38deg);animation:adm-iso 6s ease-in-out infinite}
.adm-isoin i{position:absolute;inset:0;display:grid;place-items:center;color:var(--pri);border-radius:18px;border:1px solid color-mix(in srgb,var(--pri) 50%,transparent);background:color-mix(in srgb,var(--pri) 16%,var(--card))}
.adm-isoin i:nth-child(1){transform:translateZ(0)}
.adm-isoin i:nth-child(2){transform:translateZ(34px);opacity:.88}
.adm-isoin i:nth-child(3){transform:translateZ(68px);opacity:.75}
@keyframes adm-iso{0%,100%{transform:rotateX(58deg) rotateZ(-38deg) translateZ(0)}50%{transform:rotateX(58deg) rotateZ(-30deg) translateZ(16px)}}

/* attention */
.adm-attn{margin-bottom:8px;padding:16px 18px}
.adm-attn h3{margin:0 0 12px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.adm-attn h3 svg{color:var(--warn)}
.adm-attnlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr));gap:10px}
.adm-attnitem{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--bd);border-radius:12px;background:var(--mut);transition:transform .2s var(--ease),border-color .2s}
.adm-attnitem:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--warn) 55%,var(--bd))}
.adm-attnitem .who{min-width:0;flex:1}
.adm-attnitem .who b{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-attnitem .who span{font-size:11.5px}
.adm-allclear{display:flex;align-items:center;gap:10px;color:var(--mutfg)}
.adm-allclear svg{color:var(--ok);flex:none}

/* toolbar + filters */
.adm-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.adm-search{position:relative;flex:1 1 240px;min-width:0;max-width:420px}
.adm-search>svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--mutfg);pointer-events:none}
.adm-search input{width:100%;height:38px;padding:0 64px 0 36px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--fg);font:inherit;transition:border-color .2s,box-shadow .2s}
.adm-search input::placeholder{color:var(--mutfg)}
.adm-search input:focus{outline:0;border-color:var(--pri);box-shadow:0 0 0 4px color-mix(in srgb,var(--pri) 18%,transparent)}
.adm-search .r{position:absolute;right:8px;top:50%;transform:translateY(-50%);display:flex;gap:4px;align-items:center}
.adm-hist{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:40;padding:6px;border:1px solid var(--bd);border-radius:12px;background:var(--card);box-shadow:0 18px 40px -14px rgba(0,0,0,.45)}
.adm-hist p{margin:4px 8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--mutfg);display:flex;justify-content:space-between}
.adm-hist button{display:flex;align-items:center;gap:8px;width:100%;height:34px;padding:0 10px;border:0;border-radius:8px;background:transparent;font-size:13px;text-align:left}
.adm-hist button:hover{background:var(--mut)}
.adm-filters{padding:14px 16px;margin-bottom:12px;display:grid;gap:10px}
.adm-chips{display:flex;gap:6px;flex-wrap:wrap}
.adm-chip{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;border:1px solid var(--bd);border-radius:999px;background:var(--card);color:var(--fg);font-size:12.5px;font-weight:600;transition:background-color .18s,color .18s,border-color .18s}
.adm-chip:hover{border-color:color-mix(in srgb,var(--pri) 55%,var(--bd))}
.adm-chip.on{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.adm-chip.tok{background:color-mix(in srgb,var(--pri) 14%,var(--card));border-color:color-mix(in srgb,var(--pri) 45%,var(--bd));font-family:ui-monospace,Menlo,monospace;font-size:12px;height:28px;padding:0 6px 0 10px}
.adm-chip.sw{padding:0;width:34px;justify-content:center;border-width:2px}
.adm-chip em{font-style:normal;font-size:11px;opacity:.7;font-variant-numeric:tabular-nums}
.adm-chip.sm2{height:26px;padding:0 10px;font-size:11.5px}
.adm-select{height:38px;padding:0 28px 0 11px;border:1px solid var(--bd);border-radius:10px;background:var(--card);color:var(--fg);font:inherit;font-size:13px;font-weight:600;max-width:100%}
.adm-segbtn{display:inline-flex;padding:3px;border:1px solid var(--bd);border-radius:11px;background:var(--card);gap:2px}
.adm-segbtn button{display:grid;place-items:center;width:32px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--mutfg);transition:background-color .18s,color .18s}
.adm-segbtn button.on{background:var(--fg);color:var(--bg)}
.adm-meta{margin:0 0 10px;color:var(--mutfg);font-size:12.5px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.adm-meta b{color:var(--fg);font-variant-numeric:tabular-nums}
.adm-link{border:0;background:transparent;color:var(--pri);font-weight:600;padding:0;text-decoration:underline;text-underline-offset:3px}
.adm-mark{background:color-mix(in srgb,var(--amber) 38%,transparent);color:inherit;border-radius:3px;padding:0 1px}
.adm-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:3px}
.adm-tag{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;background:color-mix(in srgb,var(--viol) 14%,transparent);color:var(--viol);border:0}
button.adm-tag:hover{filter:brightness(1.15)}

/* table (wide screens only; smaller screens use cards) */
.adm-tablewrap{overflow-x:auto;border-radius:var(--rad)}
.adm-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
.adm-table th{position:relative;text-align:left;padding:11px 12px;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--mutfg);background:var(--mut);border-bottom:1px solid var(--bd);white-space:nowrap;user-select:none}
.adm-table th.s{cursor:pointer}.adm-table th.s:hover{color:var(--fg)}
.adm-table th svg{vertical-align:-2px;margin-left:3px;transition:transform .25s var(--ease)}
.adm-table th svg.up{transform:rotate(180deg)}
.adm-table td{padding:12px;border-bottom:1px solid var(--bd);vertical-align:middle}
.adm-table.compact td{padding:7px 12px}
.adm-table tr:last-child td{border-bottom:0}
.adm-tr{animation:adm-rowin .45s var(--ease) both;animation-delay:calc(var(--i,0) * 24ms);transition:background-color .15s}
@keyframes adm-rowin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.adm-tr:hover{background:var(--mut)}
.adm-tr.sel{background:color-mix(in srgb,var(--pri) 9%,var(--card))}
.adm-tr.cur td:first-child{box-shadow:inset 3px 0 0 var(--pri)}
.adm-tr.flash td{animation:adm-flash 1.4s ease-out}
@keyframes adm-flash{0%{background:color-mix(in srgb,var(--pri) 30%,transparent)}100%{background:transparent}}
.adm-tr.busy{opacity:.55;pointer-events:none}
.adm-check{width:16px;height:16px;accent-color:var(--pri);cursor:pointer}
.adm-shop{display:flex;align-items:center;gap:11px;min-width:0}
.adm-table .adm-shop{min-width:170px}
.adm-avatar{width:36px;height:36px;border-radius:11px;flex:none;display:grid;place-items:center;font-size:12.5px;font-weight:800;color:#fff;background:linear-gradient(145deg,hsl(var(--h) 70% 44%),hsl(calc(var(--h) + 40) 70% 34%))}
.adm-avatar.adm-mini{width:26px;height:26px;border-radius:8px;font-size:10px}
.adm-shop .t{min-width:0}
.adm-namebtn{border:0;background:transparent;padding:0;font-weight:700;font-size:13.5px;text-align:left;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;color:var(--fg)}
.adm-table .adm-namebtn{max-width:190px}
.adm-namebtn:hover{color:var(--pri);text-decoration:underline;text-underline-offset:3px}
.adm-shop small{display:block;color:var(--mutfg);font-size:11.5px}
.adm-phone{display:inline-flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums;color:var(--mutfg);max-width:100%}
.adm-copy{border:0;background:transparent;padding:3px;border-radius:6px;color:var(--mutfg);opacity:0;transition:opacity .15s,color .15s}
.adm-tr:hover .adm-copy,.adm-copy:focus-visible,.adm-copy.done,.adm-ocard .adm-copy,.adm-dh .adm-copy{opacity:1}
.adm-copy.done{color:var(--ok)}
.adm-badge{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;white-space:nowrap}
.adm-badge.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 15%,transparent)}
.adm-badge.warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 17%,transparent)}
.adm-badge.bad{color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}
.adm-badge.off{color:var(--off);background:color-mix(in srgb,var(--off) 17%,transparent)}
.adm-badge.mut{color:var(--viol);background:color-mix(in srgb,var(--viol) 14%,transparent)}
.adm-until{display:grid;gap:5px;min-width:112px}
.adm-until small{color:var(--mutfg);font-size:11.5px}
.adm-meter{height:5px;border-radius:3px;background:var(--mut);box-shadow:inset 0 0 0 1px var(--bd);overflow:hidden}
.adm-meter i{display:block;height:100%;border-radius:3px;background:var(--c,var(--ok));transform-origin:0 50%;animation:adm-growx .8s var(--ease) both;animation-delay:.15s}
.adm-num{font-variant-numeric:tabular-nums;font-weight:700}
.adm-out{display:grid;gap:5px;min-width:100px}
.adm-actions{display:flex;align-items:center;gap:6px;justify-content:flex-end}
.adm-split{display:inline-flex}
.adm-split .adm-btn:first-child{border-radius:9px 0 0 9px}
.adm-split .adm-btn:last-child{border-radius:0 9px 9px 0;border-left-color:color-mix(in srgb,var(--prifg) 30%,transparent);padding:0 7px}
.adm-linkbtn{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--pri);font-weight:700;padding:4px 6px;border-radius:7px;text-decoration:none}
.adm-linkbtn:hover:not(:disabled){background:color-mix(in srgb,var(--pri) 11%,transparent)}
.adm-linkbtn:disabled{color:var(--mutfg)}
.adm-lang{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:5px;background:var(--mut);border:1px solid var(--bd);font-size:10px;font-weight:700;text-transform:uppercase;color:var(--mutfg)}

/* cards view: grid / rail / wall. Idle cards carry no 3D transform; the tilt is applied on hover from script */
.adm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,310px),1fr));gap:14px}
.adm-cards.lay-rail{grid-template-columns:minmax(0,1fr);max-width:780px;margin-inline:auto}
.adm-cards.lay-wall{grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:10px}
.adm-ocard{padding:16px;display:grid;gap:12px;min-width:0;animation:adm-fadein .45s var(--ease) both;animation-delay:calc(var(--i,0) * 35ms);transition:transform .22s var(--ease),border-color .2s,box-shadow .25s}
.adm-ocard.sel{border-color:var(--pri);box-shadow:0 0 0 1px var(--pri),var(--shadow)}
.adm-ocard.cur{outline:2px solid var(--pri);outline-offset:2px}
.adm-ocard.adm-flashcard{border-color:var(--pri);box-shadow:0 0 0 3px color-mix(in srgb,var(--pri) 35%,transparent),var(--shadow)}
.adm-ocard .row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;flex-wrap:wrap}
.adm-ocard .row .adm-shop{flex:1 1 150px}
.adm-ocard .stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 0;border-top:1px dashed var(--bd);border-bottom:1px dashed var(--bd)}
.adm-ocard .stats small{display:block;color:var(--mutfg);font-size:11px}
.adm-ocard .adm-actions{flex-wrap:wrap;justify-content:flex-start}
.adm-ocard .info{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;color:var(--mutfg);font-size:11.5px}
.lay-wall .adm-ocard{padding:12px;gap:8px}
.lay-wall .adm-ocard .info,.lay-wall .adm-ocard .adm-meter,.lay-wall .adm-ocard .stats small{display:none}
.lay-wall .adm-ocard .stats{padding:6px 0}
.lay-rail .adm-ocard .stats{grid-template-columns:repeat(3,1fr)}

/* pager */
.adm-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:14px 4px 0;color:var(--mutfg);font-size:12.5px}
.adm-pages{display:flex;gap:4px;align-items:center}
.adm-pages button{min-width:34px;height:34px;padding:0 8px;border:1px solid var(--bd);border-radius:9px;background:var(--card);color:var(--fg);font-weight:600;transition:background-color .15s,color .15s}
.adm-pages button.on{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.adm-pages button:disabled{opacity:.4}
.adm-more{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0 0;color:var(--mutfg);font-size:12.5px}

/* bulk bar */
.adm-bulk{position:fixed;left:50%;bottom:calc(22px + env(safe-area-inset-bottom,0px));z-index:40;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;width:max-content;max-width:calc(100vw - 24px);padding:10px 12px 12px;border-radius:16px;background:var(--fg);color:var(--bg);box-shadow:0 18px 44px -14px rgba(0,0,0,.55);transform:translateX(-50%);animation:adm-bulkin .4s var(--spring) both}
@keyframes adm-bulkin{from{opacity:0;transform:translate(-50%,26px) scale(.95)}to{opacity:1;transform:translate(-50%,0)}}
.adm-bulk .adm-btn{background:transparent;color:var(--bg);border-color:color-mix(in srgb,var(--bg) 32%,transparent)}
.adm-bulk .adm-btn:hover:not(:disabled){background:color-mix(in srgb,var(--bg) 18%,transparent);border-color:color-mix(in srgb,var(--bg) 45%,transparent)}
.adm-bulk b{font-variant-numeric:tabular-nums;padding:0 8px}
.adm-bulkprog{position:absolute;left:12px;right:12px;bottom:0;height:3px;border-radius:2px;overflow:hidden;background:color-mix(in srgb,var(--bg) 25%,transparent)}
.adm-bulkprog i{display:block;height:100%;background:var(--bg);transition:width .3s var(--ease)}

/* menu (rendered in a portal on <body>, so it always opens at the button) */
.adm-menu{position:fixed;z-index:120;width:208px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 24px);overflow:auto;padding:6px;border:1px solid var(--bd);border-radius:12px;background:var(--card);color:var(--fg);box-shadow:0 18px 40px -14px rgba(0,0,0,.5);animation:adm-pop .18s var(--ease) both;transform-origin:top right}
@keyframes adm-pop{from{opacity:0;transform:scale(.94) translateY(-4px)}to{opacity:1;transform:none}}
.adm-menu button{display:flex;align-items:center;gap:9px;width:100%;height:36px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--fg);font-size:13px;font-weight:600;text-align:left}
.adm-menu button:hover:not(:disabled){background:var(--mut)}
.adm-menu button.danger{color:var(--bad)}
.adm-menu button:disabled{opacity:.45}
.adm-menu hr{border:0;border-top:1px solid var(--bd);margin:5px 4px}

/* overlays: intro 200 > toasts 130 > menu 120 > palette 90 > modals 70 > drawer 51 > page */
.adm-overlay{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,12,28,.55);animation:adm-fade .2s ease both}
@keyframes adm-fade{from{opacity:0}to{opacity:1}}
.adm-modal{width:100%;max-height:calc(100dvh - 32px);overflow:auto;padding:22px;border:1px solid var(--bd);border-radius:20px;background:var(--card);color:var(--fg);box-shadow:0 30px 70px -24px rgba(0,0,0,.6);animation:adm-modal .35s var(--ease) both}
@keyframes adm-modal{from{opacity:0;transform:translateY(20px) scale(.96)}to{opacity:1;transform:none}}
.adm-mh{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}
.adm-mh h2{margin:0;font-size:18px;font-weight:800;min-width:0;overflow-wrap:anywhere}
.adm-field{display:grid;gap:6px;margin-bottom:14px}
.adm-field label{font-size:12.5px;font-weight:700}
.adm-field label small{font-weight:500;color:var(--mutfg)}
.adm-field .help{font-size:11.5px;color:var(--mutfg)}
.adm-field .err{font-size:11.5px;color:var(--bad)}
.adm-input{width:100%;height:40px;padding:0 12px;border:1px solid var(--bd);border-radius:10px;background:var(--bg);color:var(--fg);font:inherit;transition:border-color .2s,box-shadow .2s}
.adm-input::placeholder{color:var(--mutfg)}
.adm-input:focus{outline:0;border-color:var(--pri);box-shadow:0 0 0 4px color-mix(in srgb,var(--pri) 18%,transparent)}
.adm-input.bad{border-color:var(--bad)}
.adm-input.sm{height:34px;font-size:13px}
.adm-ta{height:auto;min-height:88px;padding:10px 12px;line-height:1.45;resize:vertical}
.adm-mf{display:flex;gap:10px;margin-top:18px}
.adm-mf .adm-btn{flex:1;height:42px}
.adm-shake{animation:adm-shake .45s}
@keyframes adm-shake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}
.adm-quick{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.adm-warnbox{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;font-size:12.5px;background:color-mix(in srgb,var(--warn) 14%,transparent);color:var(--warn);margin-bottom:12px}
.adm-dangerbox{padding:12px;border-radius:12px;background:color-mix(in srgb,var(--bad) 10%,transparent);color:var(--fg);font-size:12.5px;margin-bottom:14px;border:1px solid color-mix(in srgb,var(--bad) 38%,transparent)}
.adm-setgrp{padding:12px 0;border-bottom:1px dashed var(--bd)}.adm-setgrp:last-of-type{border-bottom:0}
.adm-setgrp>p{margin:0 0 8px;font-size:12.5px;font-weight:700}
.adm-kbdrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed var(--bd);font-size:13px}
.adm-code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:var(--mut);border:1px solid var(--bd);border-radius:6px;padding:1px 6px}
.adm-tpl{padding:12px;border:1px solid var(--bd);border-radius:12px;margin-bottom:10px;background:var(--mut)}

/* drawer */
.adm-drawerov{position:fixed;inset:0;z-index:50;background:rgba(8,12,28,.5);animation:adm-fade .2s both}
.adm-drawer{position:fixed;top:0;right:0;bottom:0;width:min(580px,100vw);z-index:51;display:flex;flex-direction:column;background:var(--card);color:var(--fg);border-left:1px solid var(--bd);box-shadow:-24px 0 60px -30px rgba(0,0,0,.55);animation:adm-slide .4s var(--ease) both}
@keyframes adm-slide{from{transform:translateX(100%)}to{transform:none}}
.adm-dh{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--bd)}
.adm-dh .t{flex:1;min-width:0}
.adm-dh h2{margin:0;font-size:17px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-dh .avatar{width:46px;height:46px;font-size:15px}
.adm-dnav{display:flex;align-items:center;gap:4px;padding:8px 18px 0;color:var(--mutfg);font-size:12px}
.adm-tabs{display:flex;gap:4px;padding:6px 18px 0;border-bottom:1px solid var(--bd);position:relative;overflow:hidden}
.adm-tabs button{position:relative;border:0;background:transparent;padding:9px 12px 12px;font-weight:700;font-size:13px;color:var(--mutfg)}
.adm-tabs button.on{color:var(--fg)}
.adm-tabs button.on::after{content:"";position:absolute;left:10px;right:10px;bottom:-1px;height:3px;border-radius:3px 3px 0 0;background:var(--pri);animation:adm-growx .3s var(--ease)}
.adm-db{flex:1;overflow:auto;overflow-x:hidden;padding:18px 18px 28px;min-width:0}
.adm-db > *{animation:adm-in .4s var(--ease) both;animation-delay:calc(var(--i,0) * 40ms)}
.adm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,110px),1fr));gap:10px;margin-bottom:16px}
.adm-stat{padding:12px;border:1px solid var(--bd);border-radius:12px;background:var(--mut);min-width:0}
.adm-stat small{display:block;color:var(--mutfg);font-size:11px;font-weight:600}
.adm-stat b{font-size:16px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.adm-timeline{padding:14px;border:1px solid var(--bd);border-radius:14px;margin-bottom:16px;background:var(--card)}
.adm-track{position:relative;height:8px;border-radius:5px;background:var(--mut);box-shadow:inset 0 0 0 1px var(--bd);margin:14px 0 10px}
.adm-track i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:var(--c,var(--ok));transform-origin:0 50%;animation:adm-growx 1s var(--ease) .1s both}
.adm-track u{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--card);border:3px solid var(--c,var(--ok));animation:adm-in .5s var(--spring) .8s both}
.adm-tl{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--mutfg)}
.adm-sec{margin:0 0 8px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--mutfg)}
.adm-cust{display:grid;gap:8px}
.adm-crow{padding:11px 12px;border:1px solid var(--bd);border-radius:12px;background:var(--card);animation:adm-rowin .4s var(--ease) both;animation-delay:calc(var(--i,0) * 25ms);transition:border-color .2s,transform .2s var(--ease)}
.adm-crow:hover{border-color:color-mix(in srgb,var(--pri) 50%,var(--bd));transform:translateX(2px)}
.adm-crow .l{display:flex;align-items:center;justify-content:space-between;gap:10px 12px;flex-wrap:wrap}
.adm-crow p{margin:0}.adm-crow .m{color:var(--mutfg);font-size:11.5px}
.adm-nonum{color:var(--warn)}

/* toasts */
.adm-toasts{position:fixed;right:16px;bottom:16px;z-index:130;display:grid;gap:10px;width:min(380px,calc(100vw - 32px))}
.adm-toast{position:relative;display:flex;align-items:flex-start;gap:10px;padding:12px 12px 14px;border:1px solid var(--bd);border-radius:14px;background:var(--card);color:var(--fg);box-shadow:0 16px 36px -16px rgba(0,0,0,.5);overflow:hidden;animation:adm-toast .4s var(--ease) both}
@keyframes adm-toast{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}
.adm-toast .ic{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:var(--prifg)}
.adm-t-success .ic{background:var(--ok)}.adm-t-error .ic{background:#dc2626;color:#fff}.adm-t-info .ic{background:var(--pri)}
.adm-toast b{display:block;font-size:13px;overflow-wrap:anywhere}.adm-toast p{margin:2px 0 0;font-size:12px;color:var(--mutfg);overflow-wrap:anywhere}
.adm-toast .g{flex:1;min-width:0}
.adm-toastbar{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--c,var(--pri));transform-origin:0 50%;animation:adm-bar linear forwards}
.adm-toast:hover .adm-toastbar{animation-play-state:paused}
.adm-t-success{--c:var(--ok)}.adm-t-error{--c:var(--bad)}
@keyframes adm-bar{to{transform:scaleX(0)}}

/* palette */
.adm-overlay.adm-palov{align-items:flex-start;padding-top:12vh;z-index:90}
.adm-pal{width:min(600px,100%);overflow:hidden;border:1px solid var(--bd);border-radius:18px;background:var(--card);color:var(--fg);box-shadow:0 30px 70px -24px rgba(0,0,0,.65);animation:adm-modal .3s var(--ease) both}
.adm-pal input{width:100%;height:54px;padding:0 18px;border:0;border-bottom:1px solid var(--bd);background:transparent;color:var(--fg);font:inherit;font-size:15px}
.adm-pal input::placeholder{color:var(--mutfg)}
.adm-pal input:focus{outline:0}
.adm-pal ul{list-style:none;margin:0;padding:6px;max-height:min(340px,55dvh);overflow:auto}
.adm-pal li button{display:flex;align-items:center;gap:11px;width:100%;height:42px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:var(--fg);text-align:left;font-weight:600}
.adm-pal li button.on{background:var(--mut)}
.adm-pal li small{margin-left:auto;color:var(--mutfg);font-weight:500}
.adm-pal .empty{padding:26px;text-align:center;color:var(--mutfg)}

/* activity */
.adm-log{display:grid;gap:0}
.adm-log div{display:flex;gap:12px;padding:11px 0;border-bottom:1px dashed var(--bd);animation:adm-rowin .35s var(--ease) both;animation-delay:calc(var(--i,0) * 20ms)}
.adm-log i{flex:none;width:9px;height:9px;margin-top:5px;border-radius:50%;background:var(--ok)}
.adm-log i.bad{background:var(--bad)}
.adm-log small{display:block;color:var(--mutfg);font-size:11.5px}
.adm-log span{min-width:0;overflow-wrap:anywhere}

/* skeleton + empty */
.adm-skel{border-radius:10px;background:linear-gradient(100deg,var(--mut) 30%,color-mix(in srgb,var(--bd) 70%,var(--mut)) 50%,var(--mut) 70%);background-size:220% 100%;animation:adm-shimmer 1.4s linear infinite}
@keyframes adm-shimmer{from{background-position:120% 0}to{background-position:-120% 0}}
.adm-empty{display:grid;place-items:center;gap:10px;padding:56px 16px;text-align:center;color:var(--mutfg)}
.adm-empty svg{color:var(--pri)}
.adm-err{margin-bottom:14px;padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--bad) 12%,var(--card));border:1px solid color-mix(in srgb,var(--bad) 35%,transparent);color:var(--bad);font-size:13px;display:flex;align-items:center;gap:10px;animation:adm-in .35s var(--ease)}

/* login */
.adm-login{position:relative;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--bg);color:var(--fg);overflow:hidden}
.adm-logintheme{position:fixed;top:14px;right:14px;z-index:5}
.adm-lcard{position:relative;z-index:1;width:100%;max-width:392px;padding:32px;border:1px solid var(--bd);border-radius:24px;background:var(--card);box-shadow:0 30px 70px -30px rgba(0,0,0,.5);animation:adm-modal .6s var(--ease) both}
.adm-lock{position:relative;width:54px;height:54px;margin-bottom:20px;border-radius:16px;display:grid;place-items:center;background:color-mix(in srgb,var(--pri) 14%,transparent);color:var(--pri)}
.adm-lock::after{content:"";position:absolute;inset:0;border-radius:16px;border:2px solid var(--pri);animation:adm-pulse 2.4s ease-out infinite}
.adm-lcard h1{margin:0 0 4px;font-size:22px;font-weight:800}
.adm-lcard .adm-pw{position:relative}
.adm-lcard .adm-pw .adm-input{padding-right:44px}
.adm-lcard .adm-pw button{position:absolute;right:6px;top:5px;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--mutfg)}
.adm-notice{margin-bottom:14px;padding:10px 12px;border-radius:10px;font-size:12.5px;background:color-mix(in srgb,var(--warn) 14%,transparent);color:var(--warn)}
.adm-back-link{display:inline-flex;align-items:center;gap:8px;margin-bottom:18px;color:var(--mutfg);font-size:13px;text-decoration:none;transition:color .2s,transform .2s var(--ease)}
.adm-back-link:hover{color:var(--pri);transform:translateX(-3px)}

/* tablet and phone */
@media (max-width:1000px){.adm-snap{grid-template-columns:1.1fr 1fr}.adm-iso{display:none}}
@media (max-width:900px){.adm-duo{grid-template-columns:minmax(0,1fr)}}
@media (max-width:760px){
  .adm-wrap{padding:14px 12px 130px}
  .adm-title{font-size:22px}
  .adm-head{align-items:stretch}
  .adm-tools{width:100%}
  .adm-tools .adm-btn:not(.sq){flex:1 1 calc(50% - 8px)}
  .adm-search{flex:1 1 100%;max-width:none}
  .adm-toolbar .adm-select{flex:1 1 140px}
  .adm-toasts{top:12px;bottom:auto;right:12px;left:12px;width:auto}
  .adm-bulk{bottom:calc(12px + env(safe-area-inset-bottom,0px))}
  .adm-fab{bottom:calc(96px + env(safe-area-inset-bottom,0px))}
  .adm-modal{padding:18px;border-radius:18px}
  .adm-lcard{padding:24px}
  .adm-overlay.adm-palov{padding-top:8vh}
  .adm-pager{justify-content:center}
  .adm-attn,.adm-panel{padding:14px}
  .adm-nav{margin:0 -12px 12px;padding:8px 12px}
  .adm-open{height:170vh}
  .adm-snap{grid-template-columns:1fr;gap:14px;overflow:auto}
  .adm-lists .adm-lst2{display:none}
  .adm-door{align-items:center}
  .adm-door.l{top:0;bottom:50%;left:0;right:0;width:auto;justify-content:center;border-radius:var(--rad) var(--rad) 0 0;transform-origin:50% 0;transform:rotateX(calc(var(--open) * 112deg))}
  .adm-door.r{top:50%;bottom:0;left:0;right:0;width:auto;justify-content:center;border-radius:0 0 var(--rad) var(--rad);transform-origin:50% 100%;transform:rotateX(calc(var(--open) * -112deg))}
}
@media (max-width:480px){
  .adm-dh{flex-wrap:wrap}
  .adm-dh .t{flex:1 1 140px}
  .adm-db{padding:14px 12px 24px}
  .adm-tabs{padding:6px 12px 0}
  .adm-dnav{padding:8px 12px 0}
  .adm-mf{flex-direction:column-reverse}
  .adm-kpi .val{font-size:22px}
}
/* calm mode and reduced motion: the doors are shown already open */
.adm-root[data-calm] .adm-open{--open:1;height:auto}
.adm-root[data-calm] .adm-stage{position:relative;height:auto}
.adm-root[data-calm] .adm-door,.adm-root[data-calm] .adm-hint{display:none}
.adm-root[data-calm] .adm-back{position:relative;opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){
  .adm-root *,.adm-root *::before,.adm-root *::after,.adm-pt *,.adm-pt *::before,.adm-pt *::after{animation-duration:.01ms !important;animation-delay:0ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}
  .adm-toastbar{animation-duration:var(--ttl) !important;animation-iteration-count:1 !important}
  .adm-aurora{display:none}
  .adm-roll,.adm-ocard{transform:none !important;opacity:1 !important}
  .adm-open{--open:1;height:auto}
  .adm-stage{position:relative;height:auto}
  .adm-door,.adm-hint{display:none}
  .adm-back{position:relative;opacity:1;transform:none}
}
@media print{
  .adm-aurora,.adm-tools,.adm-nav,.adm-bulk,.adm-toasts,.adm-fab,.adm-prog,.adm-toolbar,.adm-chips,.adm-pager,.adm-more,.adm-actions,.adm-offline,.adm-filters{display:none !important}
  .adm-root{background:#fff;color:#000}
  .adm-roll,.adm-ocard{transform:none !important;opacity:1 !important}
  .adm-card{box-shadow:none}
  .adm-open{--open:1;height:auto}.adm-stage{position:relative;height:auto}.adm-door,.adm-hint{display:none}.adm-back{position:relative;opacity:1;transform:none}
}
`;

// Applied after EXTRAS_CSS so the extras panels also fit small screens and both themes.
const FIX_CSS = `
.adm-duo>.adm-roll{min-width:0}
.adm-duo>.adm-roll>*{min-width:0;max-width:100%}
.adm-duo{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:900px){.adm-duo{grid-template-columns:minmax(0,1fr)}}
.adm-root img,.adm-root svg{max-width:100%}
`;

// ---------------------------------------------------------------------------
// Small UI pieces
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

const bucketColor = (b: Bucket) => (b === "active" ? "var(--ok)" : b === "expiring" ? "var(--amber)" : b === "expired" ? "var(--bad)" : b === "deactivated" ? "var(--off)" : "var(--viol)");

function Avatar({ o, className = "" }: { o: { name: string | null; phone: string }; className?: string }) {
  return (
    <span className={`adm-avatar ${className}`} style={{ ["--h" as string]: hue(o.phone) } as React.CSSProperties} aria-hidden>
      {initials(o.name, o.phone)}
    </span>
  );
}

// highlights the part of a text that matches the search
function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="adm-mark">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), span = Math.max(1, max - min);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${26 - ((v - min) / span) * 22 - 2}`);
  return (
    <svg className="adm-spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden>
      <path className="a" d={`M0,26 L${pts.join(" L")} L100,26 Z`} />
      <path className="l" d={`M${pts.join(" L")}`} />
    </svg>
  );
}

// spinning 3D cube (pure CSS, compositor-only)
function Cube({ size = 84, mini = false }: { size?: number; mini?: boolean }) {
  const icons = [Users, TrendingUp, Bell, MessageCircle, Zap, Layers];
  return (
    <span className={`adm-cubewrap ${mini ? "mini" : ""}`} style={{ ["--s" as string]: `${size}px` } as React.CSSProperties} aria-hidden>
      <span className="adm-cube">
        {icons.map((Ic, i) => (
          <i key={i}>
            <Ic size={Math.round(size * 0.42)} />
          </i>
        ))}
      </span>
    </span>
  );
}

type MenuItem = { key: string; label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; testid?: string } | "sep";

// A popover menu. It is rendered through a portal on <body> and positioned with
// `fixed` coordinates, so no scrolling table, hovered card or 3D-transformed parent
// can clip it or shift it away from the button.
function Menu({ trigger, items, aria, className = "adm-btn sm icon", testid }: { trigger: React.ReactNode; items: MenuItem[]; aria: string; className?: string; testid?: string }) {
  const { theme } = useTheme();
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
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
    const w = Math.min(208, window.innerWidth - 16);
    const h = Math.min(items.length * 38 + 16, window.innerHeight - 24);
    const up = r.bottom + h > window.innerHeight && r.top > h;
    const left = clamp(r.right - w, 8, Math.max(8, window.innerWidth - w - 8));
    setPos({ left, ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
  };

  return (
    <>
      <button ref={btn} type="button" className={className} aria-haspopup="menu" aria-expanded={!!pos} aria-label={aria} onClick={toggle} data-testid={testid}>
        {trigger}
      </button>
      {pos &&
        createPortal(
          <div className="adm-pt" data-theme={theme}>
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
          </div>,
          document.body
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
const ModalHead = ({ title, onClose }: { title: string; onClose: () => void }) => (
  <div className="adm-mh">
    <h2>{title}</h2>
    <button onClick={onClose} className="adm-btn sm icon ghost" aria-label="Close">
      <X size={18} />
    </button>
  </div>
);

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

function LastUpdated({ at, refreshing, auto, sec }: { at: number | null; refreshing: boolean; auto: boolean; sec: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="adm-live" title={auto ? `Refreshing automatically every ${sec} seconds` : "Auto-refresh is off"}>
      <span className={`adm-dot ${auto ? "" : "off"}`} />
      {refreshing ? "Updating…" : at ? `Updated ${ago(Date.now() - at)}` : "Not loaded yet"}
      {auto && (
        <svg className="adm-ringsvg" viewBox="0 0 16 16" aria-hidden>
          <circle className="bg" cx="8" cy="8" r="7" />
          <circle key={at ?? 0} className="fg" cx="8" cy="8" r="7" style={{ animationDuration: `${sec}s` }} />
        </svg>
      )}
    </span>
  );
}

function ThemeToggle({ className = "adm-btn sq adm-themebtn" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const next = dark ? "light" : "dark";
  // Sun and moon sit on top of each other and spin / shrink through one another when the theme changes.
  const icon: React.CSSProperties = { position: "absolute", inset: 0, transition: "transform .6s cubic-bezier(.34,1.56,.64,1), opacity .35s ease" };
  return (
    <button type="button" className={className} onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} data-testid="button-theme-toggle">
      <span style={{ position: "relative", display: "block", width: 16, height: 16 }}>
        <Sun size={16} style={{ ...icon, opacity: dark ? 1 : 0, transform: dark ? "rotate(0deg) scale(1)" : "rotate(-140deg) scale(0.2)" }} />
        <Moon size={16} style={{ ...icon, opacity: dark ? 0 : 1, transform: dark ? "rotate(140deg) scale(0.2)" : "rotate(0deg) scale(1)" }} />
      </span>
    </button>
  );
}

// sticky section nav with scroll-spy (reads positions only on animation frames, bails out when nothing changed)
function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  useEffect(() => {
    let raf = 0;
    const run = () => {
      raf = 0;
      let cur = items[0]?.id ?? "";
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= 130) cur = it.id;
      }
      setActive(cur);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    window.addEventListener("scroll", on, { passive: true });
    on();
    return () => {
      window.removeEventListener("scroll", on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items]);
  return (
    <nav className="adm-nav" aria-label="Sections">
      {items.map((it) => (
        <button key={it.id} className={active === it.id ? "on" : ""} onClick={() => document.getElementById(it.id)?.scrollIntoView({ behavior: prefersReduced() ? "auto" : "smooth", block: "start" })}>
          {it.label}
        </button>
      ))}
    </nav>
  );
}

function ScrollTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 700);
    window.addEventListener("scroll", on, { passive: true });
    on();
    return () => window.removeEventListener("scroll", on);
  }, []);
  if (!show) return null;
  return (
    <button className="adm-fab" aria-label="Back to top" title="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: prefersReduced() ? "auto" : "smooth" })}>
      <ArrowUp size={18} />
    </button>
  );
}

function Seg<T extends string | number | boolean>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="adm-quick">
      {options.map((o) => (
        <button key={String(o.v)} type="button" className={`adm-chip ${o.v === value ? "on" : ""}`} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intro: 3D cube, orbit rings, live numbers, and doors that swing open into the dashboard
// ---------------------------------------------------------------------------

function Intro({ ready, stats, accent, onEnter }: { ready: boolean; stats: { shops: number; customers: number; outstanding: number }; accent: Accent; onEnter: () => void }) {
  const { theme } = useTheme();
  const [minDone, setMinDone] = useState(false);
  const [out, setOut] = useState(false);
  const [pct, setPct] = useState(0.06);
  const done = useRef(false);
  useScrollLock();

  useEffect(() => {
    const a = setTimeout(() => setPct(0.88), 40);
    const b = setTimeout(() => setMinDone(true), 2300);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const ok = ready && minDone;
  useEffect(() => {
    if (ok) setPct(1);
  }, [ok]);

  const go = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setOut(true);
    setTimeout(onEnter, 1000);
  }, [onEnter]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (ok && (e.key === "Enter" || e.key === " "))) {
        e.preventDefault();
        go();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [ok, go]);

  return createPortal(
    <div className="adm-pt" data-theme={theme} data-accent={accent}>
      <div className={`adm-intro ${out ? "out" : ""}`} role="dialog" aria-label="Welcome to Shop Brain">
        <div className="adm-idoor l" />
        <div className="adm-idoor r" />
        <div className="adm-iface">
          <div className="adm-stage3d">
            <span className="adm-orbit a" />
            <span className="adm-orbit b" />
            <Cube size={84} />
          </div>
          <h1 className="adm-ititle" aria-label="Shop Brain">
            {"Shop Brain".split("").map((c, i) => (
              <span key={i} className="adm-letter" style={{ ["--d" as string]: i } as React.CSSProperties} aria-hidden>
                {c === " " ? "\u00A0" : c}
              </span>
            ))}
          </h1>
          <p className="adm-isub">Admin dashboard</p>
          <div className="adm-iprog">
            <i style={{ transform: `scaleX(${pct})` }} />
          </div>
          <div className={`adm-istats ${ready ? "on" : ""}`}>
            <div>
              <b>{ready ? <CountUp value={stats.shops} /> : "–"}</b>
              <small>shops</small>
            </div>
            <div>
              <b>{ready ? <CountUp value={stats.customers} /> : "–"}</b>
              <small>customers</small>
            </div>
            <div>
              <b>{ready ? <CountUp value={stats.outstanding} /> : "–"}</b>
              <small>Frw outstanding</small>
            </div>
          </div>
          <button className="adm-btn pri adm-ienter" disabled={!ok} onClick={go}>
            {ok ? "Enter dashboard" : "Loading your shops…"} <ChevronRight size={16} />
          </button>
        </div>
        <button className="adm-btn sm ghost adm-iskip" onClick={go}>
          Skip
        </button>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Business snapshot: the two doors open as you scroll through this section
// ---------------------------------------------------------------------------

interface SnapData { outstanding: number; activeRate: number; avgCust: string; renewals: number; expired: number; topDebt: EOwner[]; next: EOwner[] }

const Snapshot = React.memo(function Snapshot({ s, onOpen }: { s: SnapData; onOpen: (phone: string, tab: DrawerTab) => void }) {
  return (
    <section className="adm-open" data-open id="sec-snapshot" aria-label="Business snapshot">
      <div className="adm-stage">
        <div className="adm-back">
          <div className="adm-snap">
            <div>
              <h4>At a glance</h4>
              <div className="adm-tiles">
                <div className="adm-tile"><small>Outstanding</small><b>{money(s.outstanding)}</b></div>
                <div className="adm-tile"><small>Active rate</small><b>{s.activeRate}%</b></div>
                <div className="adm-tile"><small>Need renewal</small><b>{s.renewals}</b></div>
                <div className="adm-tile"><small>Customers / shop</small><b>{s.avgCust}</b></div>
              </div>
            </div>
            <div className="adm-lists">
              <div>
                <h4>Biggest balances</h4>
                {s.topDebt.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--mutfg)" }}>No balances yet.</p>
                ) : (
                  s.topDebt.map((o) => (
                    <button key={o.phone} className="adm-li" onClick={() => onOpen(o.phone, "overview")}>
                      <span>{label(o)}</span>
                      <small>{money(o.totalOutstanding)}</small>
                    </button>
                  ))
                )}
              </div>
              <div className="adm-lst2">
                <h4>Next to expire</h4>
                {s.next.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--mutfg)" }}>Nothing expiring soon.</p>
                ) : (
                  s.next.map((o) => (
                    <button key={o.phone} className="adm-li" onClick={() => onOpen(o.phone, "overview")}>
                      <span>{label(o)}</span>
                      <small>{relDays(o.daysLeft)}</small>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="adm-iso" aria-hidden>
              <div className="adm-isoin">
                <i><Users size={26} /></i>
                <i><TrendingUp size={26} /></i>
                <i><Zap size={26} /></i>
              </div>
            </div>
          </div>
        </div>
        <div className="adm-door l" aria-hidden>
          <span>Business</span>
        </div>
        <div className="adm-door r" aria-hidden>
          <span>snapshot</span>
        </div>
        <div className="adm-hint" aria-hidden>Scroll to open</div>
      </div>
    </section>
  );
});

// ---------------------------------------------------------------------------
// Insight widgets
// ---------------------------------------------------------------------------

function Kpi({ i, label: text, value, suffix, hint, icon, color, on, onClick, spark }: { i: number; label: string; value: number; suffix?: string; hint?: string; icon: React.ReactNode; color?: string; on?: boolean; onClick?: () => void; spark?: number[] }) {
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
        <CountUp value={value} />
        {suffix && <small>{suffix}</small>}
      </div>
      {hint && <div className="hint">{hint}</div>}
      {spark && <Spark data={spark} />}
    </Tag>
  );
}

const KpiRow = React.memo(function KpiRow({ loading, counts, total, customers, outstanding, weeks, cumulative, filter, onPick }: { loading: boolean; counts: Record<Bucket, number>; total: number; customers: number; outstanding: number; weeks: number[]; cumulative: number[]; filter: Bucket | "all"; onPick: (b: Bucket) => void }) {
  const thisWeek = weeks[7];
  return (
    <div className="adm-kpis" id="sec-overview">
      {loading && total === 0 ? (
        [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="adm-card adm-skel" style={{ height: 108 }} />)
      ) : (
        <>
          <Roll><Kpi i={0} label="Total shops" value={total} icon={<Users size={15} />} hint={`${thisWeek} new this week`} spark={cumulative} /></Roll>
          <Roll><Kpi i={1} label="Active" value={counts.active} icon={<CheckCircle2 size={15} />} color="var(--ok)" on={filter === "active"} onClick={() => onPick("active")} hint="Click to filter" /></Roll>
          <Roll><Kpi i={2} label="Expiring soon" value={counts.expiring} icon={<Clock size={15} />} color="var(--amber)" on={filter === "expiring"} onClick={() => onPick("expiring")} hint="Needs a renewal" /></Roll>
          <Roll><Kpi i={3} label="Expired" value={counts.expired} icon={<XCircle size={15} />} color="var(--bad)" on={filter === "expired"} onClick={() => onPick("expired")} hint="Access has ended" /></Roll>
          <Roll><Kpi i={4} label="Customers (all shops)" value={customers} icon={<TrendingUp size={15} />} hint={total ? `${(customers / total).toFixed(1)} per shop` : undefined} /></Roll>
          <Roll><Kpi i={5} label="Total outstanding" value={outstanding} suffix="Frw" icon={<Zap size={15} />} color="var(--viol)" hint="Owed to shops" /></Roll>
          <Roll><Kpi i={6} label="New shops, 8 weeks" value={weeks.reduce((s, x) => s + x, 0)} icon={<UserPlus size={15} />} color="var(--ok)" hint={`${thisWeek} this week`} spark={weeks} /></Roll>
        </>
      )}
    </div>
  );
});

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
          {shown ? counts[shown.key] : total}
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

// 3D ring of the top shops that slowly rotates; hover pauses it
function Ring({ owners, still, onOpen }: { owners: EOwner[]; still: boolean; onOpen: (phone: string, tab: DrawerTab) => void }) {
  const n = owners.length;
  const [turn, setTurn] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (still || hold || n < 2 || prefersReduced()) return;
    const id = setInterval(() => setTurn((t) => t + 1), 4200);
    return () => clearInterval(id);
  }, [still, hold, n]);
  if (!n) return <p style={{ color: "var(--mutfg)", margin: 0 }}>No shops yet.</p>;
  const step = 360 / n;
  const R = n < 2 ? 0 : Math.max(120, Math.round(95 / Math.tan(Math.PI / n)));
  const active = ((turn % n) + n) % n;
  return (
    <div onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
      <div className="adm-ring">
        <div className="adm-ringin" style={{ transform: `translateZ(${-R}px) rotateY(${-turn * step}deg)` }}>
          {owners.map((o, i) => (
            <div key={o.phone} className="adm-ringcard" style={{ transform: `rotateY(${i * step}deg) translateZ(${R}px)`, opacity: i === active ? 1 : 0.5 }} aria-hidden={i !== active}>
              <Avatar o={o} />
              <b>{label(o)}</b>
              <StatusBadge bucket={o.bucket} />
              <span className="adm-num">{money(o.totalOutstanding)}</span>
              <button className="adm-btn sm" tabIndex={i === active ? 0 : -1} onClick={() => onOpen(o.phone, "overview")}>
                <Eye size={13} /> Open
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="adm-ringctl">
        <button className="adm-btn sm icon" aria-label="Previous shop" onClick={() => setTurn((t) => t - 1)}>
          <ChevronLeft size={14} />
        </button>
        <div className="adm-dots">
          {owners.map((o, i) => (
            <i key={o.phone} className={i === active ? "on" : ""} />
          ))}
        </div>
        <button className="adm-btn sm icon" aria-label="Next shop" onClick={() => setTurn((t) => t + 1)}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// all analytics panels live in one memoised component, so typing in the search box never re-renders them
interface InsightData {
  total: number; counts: Record<Bucket, number>; weeks: number[]; topDebt: EOwner[]; spot: EOwner[]; topCust: EOwner[];
  forecast: { w: number[]; overdue: number }; calendar: number[]; spread: { l: string; q: string; n: number }[];
  langs: { rw: number; en: number; none: number }; quality: { label: string; q: string; n: number }[];
  quick: { avgCust: string; avgOut: number; activeRate: number; owingRate: number; avgDays: number };
}

const Insights = React.memo(function Insights({ d, hidden, collapsed, filter, still, onToggle, onPick, onApply, onOpen }: { d: InsightData; hidden: string[]; collapsed: string[]; filter: Bucket | "all"; still: boolean; onToggle: (id: string) => void; onPick: (b: Bucket) => void; onApply: (q: string) => void; onOpen: (phone: string, tab: DrawerTab) => void }) {
  const shown = (id: string) => !hidden.includes(id);
  const thisWeek = d.weeks[7], lastWeek = d.weeks[6];
  const dayLabel = (n: number) => new Date(Date.now() + n * DAY).getDate();
  const weekdayOffset = (new Date().getDay() + 6) % 7;
  const panel = (id: string, title: string, icon: React.ReactNode, body: React.ReactNode, i: number, cls = "") => {
    if (!shown(id)) return null;
    const col = collapsed.includes(id);
    return (
      <Roll key={id} className={cls}>
        <div className={`adm-card adm-spot adm-panel adm-in ${col ? "adm-collapsed" : ""}`} style={{ ["--i" as string]: Math.min(i, 8) } as React.CSSProperties}>
          <h3>
            <span className="ico">{icon}</span> {title}
            <button className="adm-btn sm icon ghost adm-collapse" onClick={() => onToggle(id)} aria-label={col ? `Expand ${title}` : `Collapse ${title}`} aria-expanded={!col}>
              <ChevronUp size={14} />
            </button>
          </h3>
          <div className="adm-pbody">{body}</div>
        </div>
      </Roll>
    );
  };
  const fmax = Math.max(1, d.forecast.overdue, ...d.forecast.w);

  return (
    <div className="adm-grid">
      {panel(
        "quick", "Quick stats", <Activity size={15} />,
        <div className="adm-qs">
          <div><small>Customers per shop</small><b>{d.quick.avgCust}</b></div>
          <div><small>Outstanding per shop</small><b>{money(d.quick.avgOut)}</b></div>
          <div><small>Active rate</small><b>{d.quick.activeRate}%</b></div>
          <div><small>Shops with debts</small><b>{d.quick.owingRate}%</b></div>
          <div><small>Avg days left (active)</small><b>{d.quick.avgDays}</b></div>
        </div>,
        0, "wide"
      )}
      {panel("donut", "Shops by status", <Activity size={15} />, <Donut counts={d.counts} total={d.total} filter={filter} onPick={onPick} />, 1)}
      {panel(
        "debt", "Biggest outstanding balances", <TrendingUp size={15} />,
        d.topDebt.length === 0 ? (
          <p style={{ color: "var(--mutfg)", margin: 0 }}>No outstanding balances.</p>
        ) : (
          <div className="adm-bars">
            {d.topDebt.map((o, i) => (
              <button key={o.phone} className="adm-brow" onClick={() => onOpen(o.phone, "overview")} style={{ ["--i" as string]: i } as React.CSSProperties}>
                <span className="n">{label(o)}</span>
                <span className="adm-btrack">
                  <i style={{ width: `${(o.totalOutstanding / d.topDebt[0].totalOutstanding) * 100}%`, ["--i" as string]: i } as React.CSSProperties} />
                </span>
                <b>{money(o.totalOutstanding)}</b>
              </button>
            ))}
          </div>
        ),
        2
      )}
      {panel(
        "growth", "New shops, last 8 weeks", <UserPlus size={15} />,
        <>
          <div className="adm-sign">
            {d.weeks.map((n, i) => (
              <div key={i} title={`${n} new shop${n === 1 ? "" : "s"}`}>
                <span>{n || ""}</span>
                <i style={{ height: `${Math.max(4, (n / Math.max(1, ...d.weeks)) * 100)}%`, ["--i" as string]: i, opacity: n ? 1 : 0.25 } as React.CSSProperties} />
              </div>
            ))}
          </div>
          <p className="adm-trend">
            {thisWeek} this week vs {lastWeek} last week {thisWeek > lastWeek && <b>▲</b>}
          </p>
        </>,
        3
      )}
      {panel("spotlight", "3D spotlight: top shops", <Layers size={15} />, <Ring owners={d.spot} still={still} onOpen={onOpen} />, 4)}
      {panel(
        "forecast", "Renewal forecast", <TrendingUp size={15} />,
        <>
          <div className="adm-sign">
            <button onClick={() => onApply("days<0 is:active")} title={`${d.forecast.overdue} already ended`}>
              <span>{d.forecast.overdue || ""}</span>
              <i className="bad" style={{ height: `${Math.max(4, (d.forecast.overdue / fmax) * 100)}%`, opacity: d.forecast.overdue ? 1 : 0.25 }} />
              <small>Late</small>
            </button>
            {d.forecast.w.map((n, i) => (
              <button key={i} onClick={() => onApply(`days>=${i * 7} days<=${i * 7 + 6} is:active`)} title={`${n} ending in week ${i + 1}`}>
                <span>{n || ""}</span>
                <i style={{ height: `${Math.max(4, (n / fmax) * 100)}%`, ["--i" as string]: i, opacity: n ? 1 : 0.25 } as React.CSSProperties} />
                <small>W{i + 1}</small>
              </button>
            ))}
          </div>
          <p className="adm-trend">Active shops by the week their access ends. Click a bar to list them.</p>
        </>,
        5
      )}
      {panel(
        "calendar", "Expiry calendar, next 28 days", <Calendar size={15} />,
        <div className="adm-cal">
          {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => (
            <em key={i}>{x}</em>
          ))}
          {Array.from({ length: weekdayOffset }).map((_, i) => (
            <button key={`e${i}`} className="empty" tabIndex={-1} aria-hidden />
          ))}
          {d.calendar.map((n, i) => (
            <button key={i} className={i === 0 ? "today" : ""} style={{ ["--h" as string]: Math.min(4, n) } as React.CSSProperties} title={`${n} shop${n === 1 ? "" : "s"} ending ${relDays(i)}`} onClick={() => onApply(`days:${i} is:active`)}>
              <span>
                {dayLabel(i)}
                {n > 0 && <small>{n}</small>}
              </span>
            </button>
          ))}
        </div>,
        6
      )}
      {panel(
        "histogram", "Balance spread", <TrendingUp size={15} />,
        <div className="adm-bars">
          {d.spread.map((b, i) => (
            <button key={b.l} className="adm-brow" onClick={() => onApply(b.q)} style={{ ["--i" as string]: i } as React.CSSProperties}>
              <span className="n">{b.l}</span>
              <span className="adm-btrack">
                <i style={{ width: `${(b.n / Math.max(1, ...d.spread.map((x) => x.n))) * 100}%`, ["--i" as string]: i } as React.CSSProperties} />
              </span>
              <b>{b.n}</b>
            </button>
          ))}
        </div>,
        7
      )}
      {panel(
        "people", "Languages & leaderboard", <Users size={15} />,
        <>
          <div className="adm-bars" style={{ marginBottom: 14 }}>
            {([["Kinyarwanda", d.langs.rw, "lang:rw"], ["English", d.langs.en, "lang:en"], ["Not set", d.langs.none, "lang:none"]] as [string, number, string][]).map(([l, n, q], i) => (
              <button key={l} className="adm-brow" onClick={() => onApply(q)} style={{ ["--i" as string]: i } as React.CSSProperties}>
                <span className="n">{l}</span>
                <span className="adm-btrack">
                  <i style={{ width: `${(n / Math.max(1, d.total)) * 100}%`, ["--i" as string]: i } as React.CSSProperties} />
                </span>
                <b>{n}</b>
              </button>
            ))}
          </div>
          <p className="adm-sec">Most customers</p>
          {d.topCust.length === 0 ? (
            <p style={{ color: "var(--mutfg)", margin: 0 }}>No customers yet.</p>
          ) : (
            <div className="adm-bars">
              {d.topCust.map((o, i) => (
                <button key={o.phone} className="adm-brow" onClick={() => onOpen(o.phone, "customers")} style={{ ["--i" as string]: i } as React.CSSProperties}>
                  <span className="n">{label(o)}</span>
                  <span className="adm-btrack">
                    <i style={{ width: `${(o.customerCount / d.topCust[0].customerCount) * 100}%`, ["--i" as string]: i } as React.CSSProperties} />
                  </span>
                  <b>{o.customerCount}</b>
                </button>
              ))}
            </div>
          )}
        </>,
        8
      )}
      {panel(
        "quality", "Data quality", <CheckCircle2 size={15} />,
        d.quality.every((x) => x.n === 0) ? (
          <div className="adm-allclear">
            <CheckCircle2 size={20} /> Everything looks clean.
          </div>
        ) : (
          <div>
            {d.quality.map((x) => (
              <div key={x.q} className="adm-qrow">
                <span>{x.label}</span>
                <b>{x.n}</b>
                <button className="adm-btn sm" disabled={x.n === 0} onClick={() => onApply(x.q)}>
                  Show
                </button>
              </div>
            ))}
          </div>
        ),
        8
      )}
    </div>
  );
});

const AttentionPanel = React.memo(function AttentionPanel({ list, busy, onExtend }: { list: EOwner[]; busy: Record<string, boolean>; onExtend: (o: EOwner, d: number) => void }) {
  return (
    <Roll>
      <div id="sec-attention" className="adm-card adm-attn adm-in">
        <h3>
          <Bell size={15} /> Needs attention <small style={{ color: "var(--mutfg)", fontWeight: 500 }}>expiring within 7 days, or ended in the last 14</small>
        </h3>
        {list.length === 0 ? (
          <div className="adm-allclear">
            <CheckCircle2 size={22} />
            All clear. Nobody needs a renewal right now.
          </div>
        ) : (
          <div className="adm-attnlist">
            {list.map((o) => (
              <div key={o.phone} className="adm-attnitem">
                <Avatar o={o} />
                <div className="who">
                  <b>{label(o)}</b>
                  <span style={{ color: (o.daysLeft ?? 0) < 0 ? "var(--bad)" : "var(--warn)" }}>{(o.daysLeft ?? 0) < 0 ? `Ended ${relDays(o.daysLeft)}` : `Ends ${relDays(o.daysLeft)}`}</span>
                </div>
                <button className="adm-btn sm pri" disabled={!!busy[o.phone]} onClick={() => onExtend(o, 30)}>
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
    </Roll>
  );
});

const FunnelRow = React.memo(function FunnelRow({ owners }: { owners: EOwner[] }) {
  return (
    <div className="adm-duo">
      <Roll>
        <FunnelPanel owners={owners} />
      </Roll>
      <Roll>
        <InactivePanel owners={owners} waLink={waLink} />
      </Roll>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface RowHandlers {
  onSel: (phone: string) => void;
  onOpen: (phone: string, tab: DrawerTab) => void;
  onExtend: (o: EOwner, days: number) => void;
  onEdit: (o: EOwner) => void;
  onToggle: (o: EOwner) => void;
  onRemove: (o: EOwner) => void;
  onCopy: (text: string) => void;
  onPin: (phone: string) => void;
  onTag: (tag: string) => void;
}

function ownerMenu(o: EOwner, h: RowHandlers, pinned: boolean): MenuItem[] {
  return [
    { key: "open", label: "Open details", icon: <Eye size={14} />, onClick: () => h.onOpen(o.phone, "overview") },
    { key: "cust", label: "View customers", icon: <Users size={14} />, onClick: () => h.onOpen(o.phone, "customers"), disabled: o.customerCount === 0 },
    { key: "pin", label: pinned ? "Unpin shop" : "Pin shop", icon: <Star size={14} />, onClick: () => h.onPin(o.phone) },
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

function PhoneCell({ phone, onCopy, hq = "" }: { phone: string; onCopy: (t: string) => void; hq?: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="adm-phone">
      <Hl text={phone} q={hq} />
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

const PinBtn = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
  <button type="button" className={`adm-btn sm icon ghost adm-star ${on ? "on" : ""}`} onClick={onClick} aria-pressed={on} aria-label={on ? "Unpin" : "Pin"} title={on ? "Unpin" : "Pin to top"}>
    <Star size={15} fill={on ? "currentColor" : "none"} />
  </button>
);

const TagList = ({ tags, onTag }: { tags: string[]; onTag: (t: string) => void }) =>
  tags.length ? (
    <div className="adm-tags">
      {tags.slice(0, 3).map((t) => (
        <button key={t} type="button" className="adm-tag" onClick={() => onTag(t)} title={`Filter by ${t}`}>
          {t}
        </button>
      ))}
      {tags.length > 3 && <span className="adm-tag">+{tags.length - 3}</span>}
    </div>
  ) : null;

interface RowProps { o: EOwner; i: number; selected: boolean; busy: boolean; flash: boolean; cur: boolean; pinned: boolean; tags: string[]; maxOut: number; hq: string; h: RowHandlers }

const OwnerRow = React.memo(function OwnerRow({ o, i, selected, busy, flash, cur, pinned, tags, maxOut, hq, hide, h }: RowProps & { hide: string[] }) {
  const color = bucketColor(o.bucket);
  const show = (c: string) => !hide.includes(c);
  return (
    <tr className={`adm-tr ${selected ? "sel" : ""} ${busy ? "busy" : ""} ${flash ? "flash" : ""} ${cur ? "cur" : ""}`} style={{ ["--i" as string]: Math.min(i, 10) } as React.CSSProperties} data-testid={`row-owner-${o.phone}`} data-phone={o.phone}>
      <td>
        <input type="checkbox" className="adm-check" checked={selected} onChange={() => h.onSel(o.phone)} aria-label={`Select ${label(o)}`} />
      </td>
      <td>
        <div className="adm-shop">
          <PinBtn on={pinned} onClick={() => h.onPin(o.phone)} />
          <Avatar o={o} />
          <div className="t">
            <button className="adm-namebtn" onClick={() => h.onOpen(o.phone, "overview")} title="Open details">
              {o.name ? <Hl text={o.name} q={hq} /> : "—"}
            </button>
            <small>
              Joined {fmtDate(o.createdAt)}
              {o.language && <span className="adm-lang">{o.language}</span>}
            </small>
            <TagList tags={tags} onTag={h.onTag} />
          </div>
        </div>
      </td>
      {show("phone") && (
        <td>
          <PhoneCell phone={o.phone} onCopy={h.onCopy} hq={hq} />
        </td>
      )}
      {show("status") && (
        <td>
          <StatusBadge bucket={o.bucket} />
          <div>
            <HealthPill o={o} />
          </div>
        </td>
      )}
      {show("until") && (
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
      )}
      {show("customers") && (
        <td>
          <button className="adm-linkbtn" onClick={() => h.onOpen(o.phone, "customers")} disabled={o.customerCount === 0} data-testid={`button-view-customers-${o.phone}`}>
            <Users size={13} /> {o.customerCount}
          </button>
        </td>
      )}
      {show("outstanding") && (
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
      )}
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
          <Menu aria="More actions" trigger={<MoreHorizontal size={15} />} items={ownerMenu(o, h, pinned)} />
        </div>
      </td>
    </tr>
  );
});

const OwnerCard = React.memo(function OwnerCard({ o, i, selected, busy, flash, cur, pinned, tags, maxOut, hq, h }: RowProps) {
  const color = bucketColor(o.bucket);
  const ref = useRef<HTMLDivElement | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const raf = useRef(0);
  const pt = useRef({ x: 0, y: 0 });
  // mouse tilt: sizes are cached on enter, updates are limited to one per frame, and it is only a transform write
  const onEnter = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && ref.current) rect.current = ref.current.getBoundingClientRect();
  };
  const apply = () => {
    raf.current = 0;
    const r = rect.current, el = ref.current;
    if (!r || !el) return;
    const x = (pt.current.x - r.left) / r.width - 0.5;
    const y = (pt.current.y - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-3px)`;
  };
  const onMove = (e: React.PointerEvent) => {
    if (!rect.current) return;
    pt.current = { x: e.clientX, y: e.clientY };
    if (!raf.current) raf.current = requestAnimationFrame(apply);
  };
  const onLeave = () => {
    rect.current = null;
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <div
      ref={ref}
      onPointerEnter={onEnter}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`adm-card adm-spot adm-ocard ${selected ? "sel" : ""} ${flash ? "adm-flashcard" : ""} ${cur ? "cur" : ""}`}
      style={{ ["--i" as string]: Math.min(i, 8) } as React.CSSProperties}
      data-testid={`row-owner-${o.phone}`}
      data-phone={o.phone}
      aria-busy={busy}
    >
      <div className="row">
        <div className="adm-shop">
          <Avatar o={o} />
          <div className="t">
            <button className="adm-namebtn" onClick={() => h.onOpen(o.phone, "overview")}>
              {o.name ? <Hl text={o.name} q={hq} /> : "—"}
            </button>
            <PhoneCell phone={o.phone} onCopy={h.onCopy} hq={hq} />
          </div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          <PinBtn on={pinned} onClick={() => h.onPin(o.phone)} />
          <input type="checkbox" className="adm-check" checked={selected} onChange={() => h.onSel(o.phone)} aria-label={`Select ${label(o)}`} />
        </span>
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
      <div className="info">
        <span>Joined {fmtDate(o.createdAt)}</span>
        {o.language && (
          <span className="adm-lang" style={{ margin: 0 }}>
            {o.language}
          </span>
        )}
      </div>
      <TagList tags={tags} onTag={h.onTag} />
      <div className="adm-actions">
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
          <Menu aria="More actions" trigger={<MoreHorizontal size={15} />} items={ownerMenu(o, h, pinned)} />
        </span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Search box (own focus state, so focusing it never re-renders the whole dashboard)
// ---------------------------------------------------------------------------

const SearchBox = React.memo(function SearchBox({ value, onChange, hist, onRemember, onClearHist, inputRef }: { value: string; onChange: (v: string) => void; hist: string[]; onRemember: (q: string) => void; onClearHist: () => void; inputRef: React.RefObject<HTMLInputElement> }) {
  const [focus, setFocus] = useState(false);
  return (
    <div className="adm-search">
      <Search size={15} />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          onRemember(value);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="Search name, phone, tag… or status:expired owes>50k"
        aria-label="Search shops"
        data-testid="input-search"
      />
      <div className="r">
        {value ? (
          <button className="adm-btn sm icon ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange("")} aria-label="Clear search" style={{ width: 24, height: 24 }}>
            <X size={13} />
          </button>
        ) : (
          <span className="adm-kbd">/</span>
        )}
      </div>
      {focus && !value && hist.length > 0 && (
        <div className="adm-hist">
          <p>
            Recent searches
            <button className="adm-link" style={{ height: "auto", width: "auto", padding: 0, fontSize: 11 }} onMouseDown={(e) => e.preventDefault()} onClick={onClearHist}>
              Clear
            </button>
          </p>
          {hist.map((h) => (
            <button key={h} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(h)}>
              <Search size={13} /> {h}
            </button>
          ))}
        </div>
      )}
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
function AddOwnerModal({ owners, saving, onCancel, onSave }: { owners: Owner[]; saving: boolean; onCancel: () => void; onSave: (d: { phone: string; name: string; language: string; trialDays: number }, another: boolean) => Promise<boolean> }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("");
  const [trialDays, setTrialDays] = useState<number | "">("");
  const [another, setAnother] = useState(false);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const dup = phone.trim() ? owners.find((o) => tail9(o.phone) === tail9(phone) && digits(phone).length >= 8) : undefined;
  const tooShort = phone.trim().length > 0 && digits(phone).length < 8;
  const submit = async () => {
    const ok = await onSave({ phone, name, language, trialDays: trialDays === "" ? 30 : trialDays }, another);
    if (ok && another) {
      setPhone("");
      setName("");
      phoneRef.current?.focus();
    }
  };
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
        <input ref={phoneRef} className={`adm-input ${dup || tooShort ? "bad" : ""}`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0788123456" autoFocus data-testid="input-add-phone" />
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
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
        <input type="checkbox" className="adm-check" checked={another} onChange={(e) => setAnother(e.target.checked)} /> Keep this window open to add another
      </label>
      <div className="adm-mf">
        <button onClick={onCancel} className="adm-btn" data-testid="button-cancel-add">
          Cancel
        </button>
        <button onClick={submit} disabled={saving || !phone.trim() || !!dup || tooShort} className="adm-btn pri" data-testid="button-save-add">
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
      <ModalHead title={`Remove ${label(owner)}?`} onClose={onCancel} />
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

function PromptModal({ title, placeholder, cta, onSubmit, onClose }: { title: string; placeholder: string; cta: string; onSubmit: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState("");
  const go = () => v.trim() && onSubmit(v.trim());
  return (
    <Modal onClose={onClose} width={380}>
      <ModalHead title={title} onClose={onClose} />
      <input className="adm-input" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder={placeholder} autoFocus />
      <div className="adm-mf">
        <button className="adm-btn" onClick={onClose}>
          Cancel
        </button>
        <button className="adm-btn pri" disabled={!v.trim()} onClick={go}>
          {cta}
        </button>
      </div>
    </Modal>
  );
}

function SettingsModal({ prefs, upd, onReset, onClose }: { prefs: Prefs; upd: (p: Partial<Prefs>) => void; onReset: () => void; onClose: () => void }) {
  const { theme, toggle } = useTheme();
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <Modal onClose={onClose} width={520}>
      <ModalHead title="Appearance & behaviour" onClose={onClose} />
      <div className="adm-setgrp">
        <p>Theme</p>
        <Seg value={theme} options={[{ v: "light", l: "Light" }, { v: "dark", l: "Dark" }]} onChange={(v) => v !== theme && toggle()} />
      </div>
      <div className="adm-setgrp">
        <p>Accent colour</p>
        <div className="adm-quick">
          {ACCENTS.map(([k, c]) => (
            <button key={k} type="button" className={`adm-chip sw ${prefs.accent === k ? "on" : ""}`} style={{ background: c, borderColor: prefs.accent === k ? "var(--fg)" : c }} aria-label={k} onClick={() => upd({ accent: k })}>
              {prefs.accent === k && <Check size={14} color="#fff" />}
            </button>
          ))}
        </div>
      </div>
      <div className="adm-setgrp">
        <p>Corners</p>
        <Seg value={prefs.radius} options={[{ v: "sharp", l: "Sharp" }, { v: "soft", l: "Soft" }, { v: "round", l: "Round" }]} onChange={(v) => upd({ radius: v })} />
      </div>
      <div className="adm-setgrp">
        <p>Motion</p>
        <Seg value={prefs.roll} options={[{ v: "off", l: "3D scroll off" }, { v: "soft", l: "Soft" }, { v: "strong", l: "Strong" }]} onChange={(v) => upd({ roll: v })} />
        <div style={{ marginTop: 8 }}>
          <Seg value={prefs.calm} options={[{ v: false, l: "Animations on" }, { v: true, l: "Calm mode (no motion)" }]} onChange={(v) => upd({ calm: v })} />
        </div>
        <div style={{ marginTop: 8 }}>
          <Seg value={prefs.intro} options={[{ v: true, l: "Show intro after sign-in" }, { v: false, l: "Skip intro" }]} onChange={(v) => upd({ intro: v })} />
        </div>
      </div>
      <div className="adm-setgrp">
        <p>Shop list layout (cards)</p>
        <Seg value={prefs.layout} options={[{ v: "grid", l: "Grid" }, { v: "rail", l: "Rail" }, { v: "wall", l: "Wall" }]} onChange={(v) => upd({ layout: v })} />
        <div style={{ marginTop: 8 }}>
          <Seg value={prefs.paging} options={[{ v: "pages", l: "Pages" }, { v: "more", l: "Load more" }]} onChange={(v) => upd({ paging: v })} />
        </div>
        <div style={{ marginTop: 8 }}>
          <Seg value={prefs.pinFirst} options={[{ v: true, l: "Pinned shops first" }, { v: false, l: "Normal order" }]} onChange={(v) => upd({ pinFirst: v })} />
        </div>
      </div>
      <div className="adm-setgrp">
        <p>Auto-refresh</p>
        <Seg
          value={prefs.auto ? prefs.refreshSec : 0}
          options={[{ v: 0, l: "Off" }, { v: 15, l: "15 s" }, { v: 30, l: "30 s" }, { v: 60, l: "60 s" }]}
          onChange={(v) => (v === 0 ? upd({ auto: false }) : upd({ auto: true, refreshSec: v }))}
        />
      </div>
      <div className="adm-setgrp">
        <p>Table columns (wide screens)</p>
        <div className="adm-quick">
          {COLS.map(([id, l]) => (
            <button key={id} type="button" className={`adm-chip ${prefs.cols.includes(id) ? "" : "on"}`} onClick={() => upd({ cols: flip(prefs.cols, id) })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="adm-setgrp">
        <p>Dashboard panels</p>
        <div className="adm-quick" style={{ marginBottom: 8 }}>
          <button className="adm-btn sm" onClick={() => upd({ hidden: ESSENTIAL_HIDDEN })}>
            Essentials
          </button>
          <button className="adm-btn sm" onClick={() => upd({ hidden: [] })}>
            Everything
          </button>
          <button className="adm-btn sm" onClick={() => upd({ hidden: PANELS.map((p) => p.id).filter((id) => id !== "attention") })}>
            Focus on the list
          </button>
        </div>
        <div className="adm-quick">
          {PANELS.map((p) => (
            <button key={p.id} type="button" className={`adm-chip ${prefs.hidden.includes(p.id) ? "" : "on"}`} onClick={() => upd({ hidden: flip(prefs.hidden, p.id) })}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="adm-mf">
        <button className="adm-btn" onClick={onReset}>
          Reset all
        </button>
        <button className="adm-btn pri" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function ViewsModal({ views, setViews, current, onApply, onClose }: { views: SavedView[]; setViews: (v: SavedView[]) => void; current: Omit<SavedView, "id" | "name">; onApply: (v: SavedView) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const save = () => {
    if (!name.trim()) return;
    setViews([...views, { id: String(Date.now()), name: name.trim(), ...current }]);
    setName("");
  };
  return (
    <Modal onClose={onClose} width={460}>
      <ModalHead title="Saved views" onClose={onClose} />
      <p style={{ margin: "-6px 0 12px", color: "var(--mutfg)", fontSize: 12.5 }}>
        Saves the current search, status filter and sort: <span className="adm-code">{current.query || "no search"}</span> · {current.status} · {current.sort.key}
      </p>
      <div className="adm-quick" style={{ marginBottom: 14, flexWrap: "nowrap" }}>
        <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Name this view, e.g. Expiring Kinyarwanda shops" />
        <button className="adm-btn pri" onClick={save} disabled={!name.trim()}>
          Save
        </button>
      </div>
      {views.length === 0 ? (
        <div className="adm-empty" style={{ padding: 24 }}>
          <Bookmark size={28} />
          No saved views yet.
        </div>
      ) : (
        views.map((v) => (
          <div key={v.id} className="adm-qrow">
            <Bookmark size={14} />
            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
              <b style={{ marginLeft: 0 }}>{v.name}</b>
              <small style={{ display: "block", color: "var(--mutfg)" }}>{v.query || "no search"} · {v.status}</small>
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="adm-btn sm" onClick={() => onApply(v)}>
                Apply
              </button>
              <button className="adm-btn sm icon danger" aria-label="Delete view" onClick={() => setViews(views.filter((x) => x.id !== v.id))}>
                <Trash2 size={13} />
              </button>
            </span>
          </div>
        ))
      )}
    </Modal>
  );
}

function TemplatesModal({ tpls, setTpls, onClose }: { tpls: Tpl[]; setTpls: (t: Tpl[]) => void; onClose: () => void }) {
  const patch = (id: string, p: Partial<Tpl>) => setTpls(tpls.map((t) => (t.id === id ? { ...t, ...p } : t)));
  return (
    <Modal onClose={onClose} width={620}>
      <ModalHead title="Message templates" onClose={onClose} />
      <p style={{ margin: "-6px 0 12px", color: "var(--mutfg)", fontSize: 12.5 }}>
        Use <span className="adm-code">{"{name}"}</span> <span className="adm-code">{"{date}"}</span> <span className="adm-code">{"{days}"}</span>. The Kinyarwanda text is used for shops whose language is rw.
      </p>
      {tpls.map((t) => (
        <div key={t.id} className="adm-tpl">
          <div className="adm-quick" style={{ flexWrap: "nowrap", marginBottom: 8 }}>
            <input className="adm-input sm" value={t.name} onChange={(e) => patch(t.id, { name: e.target.value })} aria-label="Template name" />
            {t.id !== "renew" && (
              <button className="adm-btn sm icon danger" aria-label="Delete template" onClick={() => setTpls(tpls.filter((x) => x.id !== t.id))}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <div className="adm-field" style={{ marginBottom: 8 }}>
            <label>English</label>
            <textarea className="adm-input adm-ta" value={t.en} onChange={(e) => patch(t.id, { en: e.target.value })} />
          </div>
          <div className="adm-field" style={{ marginBottom: t.enEnded !== undefined ? 8 : 0 }}>
            <label>Kinyarwanda</label>
            <textarea className="adm-input adm-ta" value={t.rw} onChange={(e) => patch(t.id, { rw: e.target.value })} />
          </div>
          {t.enEnded !== undefined && (
            <>
              <div className="adm-field" style={{ marginBottom: 8 }}>
                <label>English, if access already ended</label>
                <textarea className="adm-input adm-ta" value={t.enEnded} onChange={(e) => patch(t.id, { enEnded: e.target.value })} />
              </div>
              <div className="adm-field" style={{ marginBottom: 0 }}>
                <label>Kinyarwanda, if access already ended</label>
                <textarea className="adm-input adm-ta" value={t.rwEnded ?? ""} onChange={(e) => patch(t.id, { rwEnded: e.target.value })} />
              </div>
            </>
          )}
        </div>
      ))}
      <div className="adm-mf">
        <button className="adm-btn" onClick={() => setTpls([...tpls, { id: `t${Date.now()}`, name: "New template", en: "Hello {name}, ", rw: "Muraho {name}, " }])}>
          Add template
        </button>
        <button className="adm-btn" onClick={() => setTpls(DEFAULT_TPLS)}>
          Reset defaults
        </button>
        <button className="adm-btn pri" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function parseImport(text: string, owners: Owner[]) {
  const seen = new Set(owners.map((o) => tail9(o.phone)));
  const rows: { phone: string; name: string; language: string }[] = [];
  let dup = 0, bad = 0;
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const [phone = "", name = "", lang = ""] = line.split(/[,;\t]/).map((s) => s.trim());
    if (digits(phone).length < 8) return void bad++;
    if (seen.has(tail9(phone))) return void dup++;
    seen.add(tail9(phone));
    rows.push({ phone, name, language: /^(rw|kin)/i.test(lang) ? "rw" : /^(en|eng)/i.test(lang) ? "en" : "" });
  });
  return { rows, dup, bad };
}

function ImportModal({ owners, call, onDone, onClose }: { owners: Owner[]; call: <T = any>(path: string, opts?: { method?: string; body?: unknown }, fallback?: string) => Promise<T>; onDone: (ok: number, failed: number) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [days, setDays] = useState(30);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const parsed = useMemo(() => parseImport(text, owners), [text, owners]);
  const run = async () => {
    let ok = 0, failed = 0;
    setProg({ done: 0, total: parsed.rows.length });
    for (let i = 0; i < parsed.rows.length; i++) {
      try {
        await call("/admin/owners", { method: "POST", body: { ...parsed.rows[i], trialDays: days } }, "Failed to create owner.");
        ok++;
      } catch (e) {
        if ((e as Error).message === "Unauthorized") break;
        failed++;
      }
      setProg({ done: i + 1, total: parsed.rows.length });
    }
    onDone(ok, failed);
  };
  return (
    <Modal onClose={prog ? () => {} : onClose} width={500}>
      <ModalHead title="Import owners" onClose={onClose} />
      <div className="adm-field">
        <label>
          One owner per line <small>phone, name, language (rw or en) — only the phone is required</small>
        </label>
        <textarea className="adm-input adm-ta" style={{ minHeight: 150, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={"0788123456, Mama Kamana, rw\n0722000111"} autoFocus />
      </div>
      <div className="adm-field">
        <label>Trial length for all of them</label>
        <Seg value={days} options={[7, 14, 30, 60, 90].map((d) => ({ v: d, l: `${d} days` }))} onChange={setDays} />
      </div>
      <p style={{ color: "var(--mutfg)", fontSize: 12.5, margin: "0 0 4px" }}>
        <b style={{ color: "var(--fg)" }}>{parsed.rows.length}</b> ready to add · {parsed.dup} already registered or repeated · {parsed.bad} unreadable
      </p>
      {prog && (
        <div className="adm-meter" style={{ marginTop: 10 }}>
          <i style={{ width: `${(prog.done / Math.max(1, prog.total)) * 100}%`, animation: "none", ["--c" as string]: "var(--pri)" } as React.CSSProperties} />
        </div>
      )}
      <div className="adm-mf">
        <button className="adm-btn" onClick={onClose} disabled={!!prog}>
          Cancel
        </button>
        <button className="adm-btn pri" onClick={run} disabled={!!prog || parsed.rows.length === 0}>
          {prog ? `Adding ${prog.done}/${prog.total}…` : `Add ${parsed.rows.length} owner${parsed.rows.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </Modal>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const keys: [string, string][] = [["⌘/Ctrl K", "Command palette"], ["/", "Focus search"], ["n", "Add owner"], ["r", "Refresh"], ["j / k", "Next / previous shop"], ["Enter", "Open highlighted shop"], ["x", "Select highlighted shop"], ["p", "Pin highlighted shop"], ["e", "+30 days for highlighted shop"], ["t", "Toggle theme"], ["d", "Daily digest"], ["← / →", "Previous / next shop inside the drawer"], ["?", "This help"], ["Esc", "Close or clear selection"]];
  const syn: [string, string][] = [["status:expired", "expired, expiring, active, deactivated, notrial"], ["lang:rw", "language (rw, en, none)"], ["tag:vip", "shops with a tag"], ["owes>50k", "outstanding, also < >= <= :"], ["customers<3", "number of customers"], ["days<=7", "days until access ends (negative = already ended)"], ["joined:30", "joined in the last 30 days"], ["is:pinned", "pinned, noname, nolang, dupe, nocust, owing"]];
  return (
    <Modal onClose={onClose} width={560}>
      <ModalHead title="Shortcuts & search tips" onClose={onClose} />
      <p className="adm-sec">Keyboard</p>
      {keys.map(([k, d]) => (
        <div key={k} className="adm-kbdrow">
          <span>{d}</span>
          <span className="adm-kbd">{k}</span>
        </div>
      ))}
      <p className="adm-sec" style={{ marginTop: 16 }}>Search syntax (mix freely, plus plain words)</p>
      {syn.map(([k, d]) => (
        <div key={k} className="adm-kbdrow">
          <span className="adm-code">{k}</span>
          <span style={{ color: "var(--mutfg)", textAlign: "right", fontSize: 12.5 }}>{d}</span>
        </div>
      ))}
    </Modal>
  );
}

function DigestModal({ text, onCopy, onClose }: { text: string; onCopy: (t: string) => void; onClose: () => void }) {
  return (
    <Modal onClose={onClose} width={500}>
      <ModalHead title="Daily digest" onClose={onClose} />
      <textarea className="adm-input adm-ta" style={{ minHeight: 260, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5 }} value={text} readOnly />
      <div className="adm-mf">
        <button className="adm-btn" onClick={() => onCopy(text)}>
          <Copy size={14} /> Copy
        </button>
        <a className="adm-btn pri" href={`https://wa.me/?text=${enc(text)}`} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={14} /> Share on WhatsApp
        </a>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Owner drawer: overview + customers + activity
// ---------------------------------------------------------------------------

function TagEditor({ tags, all, onAdd, onRemove }: { tags: string[]; all: string[]; onAdd: (t: string) => void; onRemove: (t: string) => void }) {
  const [v, setV] = useState("");
  const add = (t: string) => {
    const x = t.trim();
    if (x && !tags.some((y) => y.toLowerCase() === x.toLowerCase())) onAdd(x);
    setV("");
  };
  const sugg = [...new Set([...all, ...TAG_SUGGESTIONS])].filter((t) => !tags.includes(t)).slice(0, 6);
  return (
    <div>
      <div className="adm-quick" style={{ marginBottom: 8 }}>
        {tags.length === 0 && <span style={{ color: "var(--mutfg)", fontSize: 12.5 }}>No tags yet.</span>}
        {tags.map((t) => (
          <button key={t} className="adm-tag" style={{ padding: "4px 9px", fontSize: 11.5 }} onClick={() => onRemove(t)} title="Remove tag">
            {t} <X size={11} />
          </button>
        ))}
      </div>
      <div className="adm-quick" style={{ flexWrap: "nowrap" }}>
        <input className="adm-input sm" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add(v)} placeholder="Add a tag" aria-label="Add a tag" />
        <button className="adm-btn sm" onClick={() => add(v)} disabled={!v.trim()}>
          Add
        </button>
      </div>
      <div className="adm-quick" style={{ marginTop: 8 }}>
        {sugg.map((t) => (
          <button key={t} className="adm-chip sm2" onClick={() => add(t)}>
            + {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({ owner, tpls, onCopy }: { owner: EOwner; tpls: Tpl[]; onCopy: (t: string) => void }) {
  const [id, setId] = useState(tpls[0]?.id ?? "");
  const tpl = tpls.find((t) => t.id === id) ?? tpls[0];
  const auto = useMemo(() => (tpl ? fillTpl(tpl, owner) : ""), [tpl, owner]);
  const [text, setText] = useState(auto);
  useEffect(() => setText(auto), [auto]);
  if (!tpl) return null;
  return (
    <div>
      <select className="adm-select" style={{ width: "100%", marginBottom: 8 }} value={tpl.id} onChange={(e) => setId(e.target.value)} aria-label="Message template">
        {tpls.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <textarea className="adm-input adm-ta" value={text} onChange={(e) => setText(e.target.value)} aria-label="Message text" />
      <div className="adm-quick" style={{ marginTop: 8 }}>
        <a className="adm-btn sm pri" href={waLink(owner.phone, text)} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={13} /> Send on WhatsApp
        </a>
        <button className="adm-btn sm" onClick={() => onCopy(text)}>
          <Copy size={13} /> Copy
        </button>
        <button className="adm-btn sm ghost" onClick={() => setText(auto)} disabled={text === auto}>
          Reset
        </button>
      </div>
    </div>
  );
}

function OwnerDrawer({
  owner, tab, setTab, call, busy, onClose, onExtend, onEdit, onToggle, onRemove, onCopy, log, tags, allTags, onAddTag, onRemoveTag, tpls, activity, navLabel, onNav,
}: {
  owner: EOwner;
  tab: DrawerTab;
  setTab: (t: DrawerTab) => void;
  call: <T = any>(path: string, opts?: { method?: string; body?: unknown }, fallback?: string) => Promise<T>;
  busy: boolean;
  onClose: () => void;
  onExtend: (o: EOwner, days: number) => void;
  onEdit: (o: EOwner) => void;
  onToggle: (o: EOwner) => void;
  onRemove: (o: EOwner) => void;
  onCopy: (t: string) => void;
  log: (text: string, ok?: boolean, phone?: string) => void;
  tags: string[];
  allTags: string[];
  onAddTag: (t: string) => void;
  onRemoveTag: (t: string) => void;
  tpls: Tpl[];
  activity: ActivityItem[];
  navLabel: string;
  onNav: (dir: 1 | -1) => void;
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

  // previous / next shop with the arrow keys (not while typing or while a dialog is open)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector(".adm-overlay")) return;
      if (e.key === "ArrowRight") onNav(1);
      else if (e.key === "ArrowLeft") onNav(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onNav]);

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
    setCustomers(null);
  }, [owner.phone]);
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
  const rw = owner.language === "rw";
  const mine = activity.filter((a) => a.phone === owner.phone);

  const saveCustomer = async (id: string) => {
    setSavingId(id);
    try {
      await call(`/admin/customers/${enc(id)}`, { method: "PATCH", body: { name: editName, phone: editPhone.trim() ? editPhone : null } }, "Failed to save customer.");
      log(`Edited customer "${editName}" of ${label(owner)}`, true, owner.phone);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(errMsg(e, "Failed to save customer."));
    } finally {
      setSavingId(null);
    }
  };

  const exportCustomers = (onlyOwing = false) =>
    downloadCsv(
      `${label(owner).replace(/[^\w-]+/g, "_")}-${onlyOwing ? "debtors" : "customers"}-${stamp()}.csv`,
      ["Name", "Phone", "Owed (Frw)", "Registered"],
      (customers ?? []).filter((c) => !onlyOwing || c.totalOwed > 0).map((c) => [c.name, c.phone ?? "", c.totalOwed, formatCustomerTimestamp(c.createdAt)])
    );

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
        <div className="adm-dnav">
          <button className="adm-btn sm icon ghost" onClick={() => onNav(-1)} aria-label="Previous shop">
            <ChevronLeft size={15} />
          </button>
          <span>{navLabel}</span>
          <button className="adm-btn sm icon ghost" onClick={() => onNav(1)} aria-label="Next shop">
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="adm-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}>
            Overview
          </button>
          <button role="tab" aria-selected={tab === "customers"} className={tab === "customers" ? "on" : ""} onClick={() => setTab("customers")}>
            Customers ({owner.customerCount})
          </button>
          <button role="tab" aria-selected={tab === "activity"} className={tab === "activity" ? "on" : ""} onClick={() => setTab("activity")}>
            Activity ({mine.length})
          </button>
        </div>

        {tab === "overview" ? (
          <div className="adm-db" key={`ov-${owner.phone}`}>
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

            <div style={{ marginBottom: 16, ["--i" as string]: 3 } as React.CSSProperties}>
              <p className="adm-sec">Message</p>
              <Composer owner={owner} tpls={tpls} onCopy={onCopy} />
            </div>

            <div style={{ marginBottom: 16, ["--i" as string]: 4 } as React.CSSProperties}>
              <p className="adm-sec">Tags</p>
              <TagEditor tags={tags} all={allTags} onAdd={onAddTag} onRemove={onRemoveTag} />
            </div>

            <div style={{ ["--i" as string]: 5 } as React.CSSProperties}>
              <p className="adm-sec">Manage</p>
              <div className="adm-quick">
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

            <div style={{ marginTop: 16, ["--i" as string]: 6 } as React.CSSProperties}>
              <NotesBox phone={owner.phone} />
            </div>

            {customers && customers.length > 0 && (
              <div style={{ marginTop: 20, ["--i" as string]: 7 } as React.CSSProperties}>
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
                    <AlertTriangle size={15} style={{ flex: "none" }} />
                    <span>
                      {noNum} customer{noNum === 1 ? " has" : "s have"} no phone number, so reminders cannot reach them.
                    </span>
                    <button className="adm-link" style={{ marginLeft: "auto", flex: "none" }} onClick={() => { setFilter("nonumber"); setTab("customers"); }}>
                      Review
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>
        ) : tab === "customers" ? (
          <div className="adm-db" key={`cu-${owner.phone}`}>
            {error && (
              <div className="adm-err" data-testid="text-customers-error">
                <AlertTriangle size={15} /> {error}
              </div>
            )}
            <div className="adm-toolbar" style={{ marginBottom: 10 }}>
              <div className="adm-search" style={{ maxWidth: "none", flex: "1 1 100%" }}>
                <Search size={15} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" aria-label="Search customers" style={{ paddingRight: 12 }} />
              </div>
              <select className="adm-select" style={{ flex: "1 1 140px" }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort customers">
                <option value="owed">Most owed</option>
                <option value="newest">Newest</option>
                <option value="name">Name A–Z</option>
              </select>
              <Menu
                aria="Customer tools"
                className="adm-btn"
                trigger={<><Download size={13} /> Tools</>}
                items={[
                  { key: "csv", label: "Export all (CSV)", icon: <Download size={14} />, onClick: () => exportCustomers(false), disabled: !customers?.length },
                  { key: "owing", label: "Export debtors only", icon: <Download size={14} />, onClick: () => exportCustomers(true), disabled: !owing },
                  { key: "nums", label: "Copy phone numbers", icon: <Copy size={14} />, onClick: () => onCopy((customers ?? []).filter((c) => c.phone).map((c) => c.phone).join("\n")), disabled: !customers?.some((c) => c.phone) },
                ]}
              />
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
                  <div key={c.id} className="adm-crow" style={{ ["--i" as string]: Math.min(i, 10) } as React.CSSProperties} data-testid={`row-customer-${c.id}`}>
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
                        <div style={{ minWidth: 0, flex: "1 1 150px" }}>
                          <p style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
                          <p className={`m ${c.phone ? "" : "adm-nonum"}`}>{c.phone ?? "No number"}</p>
                          <p className="m">Registered {formatCustomerTimestamp(c.createdAt)}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                          <span className="adm-num" style={{ whiteSpace: "nowrap", color: c.totalOwed > 0 ? undefined : "var(--ok)" }}>
                            {c.totalOwed > 0 ? money(c.totalOwed) : "Cleared"}
                          </span>
                          {c.phone && (
                            <a className="adm-btn sm icon" href={waLink(c.phone, c.totalOwed > 0 ? debtMsg(c, label(owner), rw) : undefined)} target="_blank" rel="noopener noreferrer" aria-label={c.totalOwed > 0 ? `Remind ${c.name} about the debt` : `Message ${c.name}`} title={c.totalOwed > 0 ? "Send a debt reminder on WhatsApp" : "Open chat"}>
                              {c.totalOwed > 0 ? <Bell size={13} /> : <MessageCircle size={13} />}
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
        ) : (
          <div className="adm-db" key={`ac-${owner.phone}`}>
            {mine.length === 0 ? (
              <div className="adm-empty">
                <Activity size={32} />
                No actions on this shop in this session yet.
              </div>
            ) : (
              <div className="adm-log">
                {mine.map((a, i) => (
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

function Palette({ owners, tags, actions, onOpenOwner, onClose }: { owners: EOwner[]; tags: Record<string, string[]>; actions: PaletteAction[]; onOpenOwner: (phone: string) => void; onClose: () => void }) {
  useEscape(onClose);
  useScrollLock();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const acts = actions.filter((a) => !s || a.label.toLowerCase().includes(s));
    const os = s ? owners.filter((o) => (o.name ?? "").toLowerCase().includes(s) || o.phone.includes(s) || (tags[o.phone] ?? []).some((t) => t.toLowerCase().includes(s))).slice(0, 6) : [];
    return [
      ...os.map((o) => ({ kind: "owner" as const, id: o.phone, label: label(o), hint: o.phone, icon: <Avatar o={o} className="adm-mini" />, run: () => onOpenOwner(o.phone) })),
      ...acts.map((a) => ({ kind: "action" as const, ...a })),
    ];
  }, [q, owners, actions, onOpenOwner, tags]);

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
          placeholder="Search shops, tags or type a command…"
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

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function OwnersDashboard({ password, onLogout }: { password: string; onLogout: (reason?: string) => void }) {
  const { theme, toggle: toggleTheme } = useTheme();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<Record<string, boolean>>({});

  const [prefs, setPrefs] = useLocal<Prefs>(PREFS_KEY, DEFAULT_PREFS);
  const [pins, setPins] = useLocal<string[]>(PINS_KEY, []);
  const [tags, setTags] = useLocal<Record<string, string[]>>(TAGS_KEY, {});
  const [views, setViews] = useLocal<SavedView[]>(VIEWS_KEY, []);
  const [tpls, setTpls] = useLocal<Tpl[]>(TPL_KEY, DEFAULT_TPLS);
  const [hist, setHist] = useLocal<string[]>(HIST_KEY, []);
  ACTIVE_TPLS = tpls;
  const upd = useCallback((p: Partial<Prefs>) => setPrefs((x) => ({ ...x, ...p })), [setPrefs]);

  const [intro, setIntro] = useState(() => {
    try {
      return prefs.intro && !sessionStorage.getItem(INTRO_KEY) && !prefersReduced();
    } catch {
      return false;
    }
  });
  const enterDash = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* ignore */
    }
    setIntro(false);
  }, []);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState<Bucket | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "default", dir: 1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ label: string; done: number; total: number } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Owner | null>(null);
  const [drawer, setDrawer] = useState<{ phone: string; tab: DrawerTab } | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [palette, setPalette] = useState(false);
  const [queue, setQueue] = useState<{ owners: EOwner[]; tplId: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showViews, setShowViews] = useState(false);
  const [showTpls, setShowTpls] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [tagPrompt, setTagPrompt] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>(loadLog);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const toastSeq = useRef(0);
  const lastActive = useRef(Date.now());
  const warned = useRef(false);

  // The table needs a wide screen. Everywhere else the list is shown as cards, so nothing scrolls sideways.
  const wide = useMedia(TABLE_MIN_WIDTH);
  const view: "table" | "cards" = wide ? prefs.view : "cards";
  const hidden = prefs.hidden;
  const isShown = (id: string) => !hidden.includes(id);

  usePointerFx(rootRef);

  // ---- toasts and activity log
  const push = useCallback((t: Omit<ToastItem, "id" | "ttl"> & { ttl?: number }) => {
    const id = ++toastSeq.current;
    setToasts((x) => [...x.slice(-3), { ttl: t.action ? 7000 : 4500, ...t, id }]);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((x) => x.filter((t) => t.id !== id)), []);
  const log = useCallback((text: string, ok = true, phone?: string) => {
    setActivity((a) => {
      const next = [{ id: Date.now() + Math.random(), at: Date.now(), text, ok, phone }, ...a].slice(0, 80);
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
        () => push({ kind: "success", title: "Copied", desc: text.length > 80 ? `${text.slice(0, 80)}…` : text, ttl: 1800 }),
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

  // ---- pins, tags, search history
  const pinSet = useMemo(() => new Set(pins), [pins]);
  const togglePin = useCallback((phone: string) => setPins((p) => (p.includes(phone) ? p.filter((x) => x !== phone) : [...p, phone])), [setPins]);
  const addTag = useCallback(
    (phones: string[], tag: string) =>
      setTags((t) => {
        const n = { ...t };
        phones.forEach((p) => {
          const cur = n[p] ?? [];
          if (!cur.some((x) => x.toLowerCase() === tag.toLowerCase())) n[p] = [...cur, tag];
        });
        return n;
      }),
    [setTags]
  );
  const removeTag = useCallback(
    (phone: string, tag: string) =>
      setTags((t) => {
        const n = { ...t, [phone]: (t[phone] ?? []).filter((x) => x !== tag) };
        if (!n[phone].length) delete n[phone];
        return n;
      }),
    [setTags]
  );
  const allTags = useMemo(() => [...new Set(Object.values(tags).flat())].sort((a, b) => a.localeCompare(b)), [tags]);
  const remember = useCallback((q: string) => {
    const v = q.trim();
    if (v) setHist((h) => [v, ...h.filter((x) => x !== v)].slice(0, 6));
  }, [setHist]);
  const clearHist = useCallback(() => setHist([]), [setHist]);

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
  const dupes = useMemo(() => {
    const m = new Map<string, string[]>();
    enriched.forEach((o) => m.set(tail9(o.phone), [...(m.get(tail9(o.phone)) ?? []), o.phone]));
    return new Set([...m.values()].filter((v) => v.length > 1).flat());
  }, [enriched]);

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
  const cumulative = useMemo(() => weeks.map((_, i) => owners.length - weeks.slice(i + 1).reduce((s, x) => s + x, 0)), [weeks, owners.length]);
  const topDebt = useMemo(() => [...enriched].filter((o) => o.totalOutstanding > 0).sort((a, b) => b.totalOutstanding - a.totalOutstanding).slice(0, 7), [enriched]);
  const attention = useMemo(
    () => enriched.filter((o) => o.isActive && o.daysLeft !== null && o.daysLeft <= 7 && o.daysLeft >= -14).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)).slice(0, 6),
    [enriched]
  );
  const renewalList = useMemo(
    () => enriched.filter((o) => o.isActive && o.daysLeft !== null && o.daysLeft <= 7 && o.daysLeft >= -30).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
    [enriched]
  );

  // everything the analytics panels need, built once per data refresh
  const insights = useMemo<InsightData>(() => {
    const n = Math.max(1, owners.length);
    const fw = new Array(8).fill(0) as number[];
    let overdue = 0;
    const cal = new Array(28).fill(0) as number[];
    const langs = { rw: 0, en: 0, none: 0 };
    const spread = [
      { l: "No balance", q: "owes:0", n: 0, t: (v: number) => v === 0 },
      { l: "Up to 10k", q: "owes>0 owes<=10k", n: 0, t: (v: number) => v > 0 && v <= 10000 },
      { l: "10k – 50k", q: "owes>10k owes<=50k", n: 0, t: (v: number) => v > 10000 && v <= 50000 },
      { l: "50k – 200k", q: "owes>50k owes<=200k", n: 0, t: (v: number) => v > 50000 && v <= 200000 },
      { l: "Over 200k", q: "owes>200k", n: 0, t: (v: number) => v > 200000 },
    ];
    let noName = 0, noLang = 0, noCust = 0, owing = 0, dateSum = 0, dateN = 0;
    enriched.forEach((o) => {
      if (o.isActive && o.daysLeft !== null) {
        if (o.daysLeft < 0) overdue++;
        else {
          if (Math.floor(o.daysLeft / 7) < 8) fw[Math.floor(o.daysLeft / 7)]++;
          if (o.daysLeft < 28) cal[o.daysLeft]++;
          dateSum += o.daysLeft;
          dateN++;
        }
      }
      o.language === "rw" ? langs.rw++ : o.language === "en" ? langs.en++ : langs.none++;
      spread.forEach((x) => x.t(o.totalOutstanding) && x.n++);
      if (!o.name) noName++;
      if (!o.language) noLang++;
      if (o.customerCount === 0) noCust++;
      if (o.totalOutstanding > 0) owing++;
    });
    return {
      total: owners.length, counts, weeks, topDebt,
      spot: [...enriched].sort((a, b) => b.totalOutstanding - a.totalOutstanding || b.customerCount - a.customerCount).slice(0, 6),
      topCust: [...enriched].filter((o) => o.customerCount > 0).sort((a, b) => b.customerCount - a.customerCount).slice(0, 5),
      forecast: { w: fw, overdue }, calendar: cal, spread: spread.map(({ l, q, n: c }) => ({ l, q, n: c })), langs,
      quality: [
        { label: "Missing a shop name", q: "is:noname", n: noName },
        { label: "No language chosen", q: "is:nolang", n: noLang },
        { label: "No trial date set", q: "status:notrial", n: counts.no_trial },
        { label: "Duplicate phone numbers", q: "is:dupe", n: dupes.size },
        { label: "No customers yet", q: "is:nocust", n: noCust },
      ],
      quick: { avgCust: (totalCustomers / n).toFixed(1), avgOut: Math.round(totalOutstandingAll / n), activeRate: Math.round((counts.active / n) * 100), owingRate: Math.round((owing / n) * 100), avgDays: dateN ? Math.round(dateSum / dateN) : 0 },
    };
  }, [owners.length, enriched, counts, weeks, topDebt, dupes, totalCustomers, totalOutstandingAll]);

  const snap = useMemo<SnapData>(
    () => ({
      outstanding: totalOutstandingAll,
      activeRate: insights.quick.activeRate,
      avgCust: insights.quick.avgCust,
      renewals: attention.length,
      expired: counts.expired,
      topDebt: topDebt.slice(0, 3),
      next: enriched.filter((o) => o.isActive && o.daysLeft !== null && o.daysLeft >= 0).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)).slice(0, 3),
    }),
    [totalOutstandingAll, insights, attention.length, counts.expired, topDebt, enriched]
  );

  // ---- search + filters (the list uses the deferred query, so typing never stutters)
  const parsedLive = useMemo(() => parseQuery(query), [query]);
  const parsed = useMemo(() => parseQuery(deferredQuery), [deferredQuery]);
  const hq = parsed.text.trim();

  const visible = useMemo(() => {
    let list = enriched;
    if (statusFilter !== "all") list = list.filter((o) => o.bucket === statusFilter);
    const p = parsed;
    if (p.status) list = list.filter((o) => o.bucket === p.status);
    if (p.lang) list = list.filter((o) => (o.language ?? "none") === p.lang);
    if (p.tags.length) list = list.filter((o) => p.tags.every((t) => (tags[o.phone] ?? []).some((x) => x.toLowerCase() === t)));
    p.cmps.forEach((c) => {
      list = list.filter((o) => {
        const v = c.f === "owes" ? o.totalOutstanding : c.f === "customers" ? o.customerCount : o.daysLeft;
        return v !== null && cmp(v, c.op, c.n);
      });
    });
    if (p.joined) list = list.filter((o) => Date.now() - Date.parse(o.createdAt) <= p.joined! * DAY);
    p.is.forEach((f) => {
      list = list.filter((o) =>
        f === "pinned" ? pinSet.has(o.phone) : f === "noname" ? !o.name : f === "nolang" ? !o.language : f === "dupe" ? dupes.has(o.phone) : f === "nocust" ? o.customerCount === 0 : f === "owing" ? o.totalOutstanding > 0 : f === "active" ? o.isActive : true
      );
    });
    const q = p.text.trim().toLowerCase();
    if (q) {
      const dq = digits(q);
      list = list.filter((o) => (o.name ?? "").toLowerCase().includes(q) || (dq && o.phone.includes(dq)) || (o.language ?? "").toLowerCase() === q || (tags[o.phone] ?? []).some((t) => t.toLowerCase().includes(q)));
    }
    if (sort.key !== "default") {
      const val = (o: EOwner): number | string => {
        switch (sort.key) {
          case "name": return (o.name ?? "\uffff").toLowerCase();
          case "created": return Date.parse(o.createdAt) || 0;
          case "expiry": return o.daysLeft ?? Number.POSITIVE_INFINITY;
          case "customers": return o.customerCount;
          default: return o.totalOutstanding;
        }
      };
      list = [...list].sort((a, b) => {
        const x = val(a), y = val(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
    }
    if (prefs.pinFirst && pins.length) list = [...list.filter((o) => pinSet.has(o.phone)), ...list.filter((o) => !pinSet.has(o.phone))];
    return list;
  }, [enriched, statusFilter, parsed, sort, tags, pinSet, pins.length, dupes, prefs.pinFirst]);

  const pages = Math.max(1, Math.ceil(visible.length / prefs.pageSize));
  const [moreN, setMoreN] = useState(prefs.pageSize);
  useEffect(() => setPage(0), [statusFilter, deferredQuery, sort, prefs.pageSize]);
  useEffect(() => setMoreN(prefs.pageSize), [statusFilter, deferredQuery, sort, prefs.pageSize, prefs.paging]);
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);
  const pageRows = useMemo(() => (prefs.paging === "more" ? visible.slice(0, moreN) : visible.slice(page * prefs.pageSize, (page + 1) * prefs.pageSize)), [visible, page, prefs.pageSize, prefs.paging, moreN]);

  // one scroll loop: progress bar, parallax, rolling cards and the opening doors
  useScrollFx(`${owners.length}|${pageRows.length}|${view}|${prefs.layout}|${statusFilter}|${page}|${loading ? 1 : 0}|${attention.length}|${hidden.join(",")}|${prefs.collapsed.join(",")}|${intro ? 1 : 0}`, prefs.roll, prefs.calm);

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
          if (!prefs.calm) burst(window.innerWidth / 2, 120);
          log(`Extended ${label(o)} by ${days} days`, true, o.phone);
          markFlash([o.phone]);
          await fetchOwners(true);
        } catch (e) {
          if ((e as Error).message !== "Unauthorized") push({ kind: "error", title: "Could not extend access", desc: errMsg(e) });
          log(`Failed to extend ${label(o)}`, false, o.phone);
        }
      });
    },
    [call, push, log, markFlash, fetchOwners, withBusy, prefs.calm]
  );

  const setActive = useCallback(
    async (o: EOwner, active: boolean, undo = false) => {
      await withBusy([o.phone], async () => {
        try {
          await call(`/admin/owners/${enc(o.phone)}/${active ? "activate" : "deactivate"}`, { method: "POST" }, "Failed to update owner.");
          log(`${active ? "Activated" : "Deactivated"} ${label(o)}${undo ? " (undo)" : ""}`, true, o.phone);
          push({
            kind: "success",
            title: `${label(o)} ${active ? "activated" : "deactivated"}`,
            action: undo ? undefined : { label: "Undo", run: () => void setActive(o, !active, true) },
          });
          markFlash([o.phone]);
          await fetchOwners(true);
        } catch (e) {
          if ((e as Error).message !== "Unauthorized") push({ kind: "error", title: "Could not update owner", desc: errMsg(e) });
          log(`Failed to ${active ? "activate" : "deactivate"} ${label(o)}`, false, o.phone);
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
          if (updates.newPhone) {
            setDrawer((d) => (d && d.phone === phone ? { ...d, phone: updates.newPhone! } : d));
            setPins((p) => p.map((x) => (x === phone ? updates.newPhone! : x)));
            setTags((t) => {
              if (!t[phone]) return t;
              const n = { ...t, [updates.newPhone!]: t[phone] };
              delete n[phone];
              return n;
            });
          }
          push({ kind: "success", title: "Changes saved" });
          log(`Edited ${updates.name || phone}`, true, updates.newPhone ?? phone);
          markFlash([updates.newPhone ?? phone]);
          await fetchOwners(true);
        } catch (e) {
          if ((e as Error).message !== "Unauthorized") push({ kind: "error", title: "Could not save", desc: errMsg(e) });
        }
      });
    },
    [call, push, log, markFlash, fetchOwners, withBusy, setPins, setTags]
  );

  const removeOwner = useCallback(
    async (o: Owner) => {
      await withBusy([o.phone], async () => {
        try {
          await call(`/admin/owners/${enc(o.phone)}`, { method: "DELETE" }, "Failed to remove owner.");
          setRemoving(null);
          setDrawer((d) => (d && d.phone === o.phone ? null : d));
          push({ kind: "success", title: `${label(o)} removed` });
          log(`Removed ${label(o)}`, true, o.phone);
          await fetchOwners(true);
        } catch (e) {
          if ((e as Error).message !== "Unauthorized") push({ kind: "error", title: "Could not remove owner", desc: errMsg(e) });
          log(`Failed to remove ${label(o)}`, false, o.phone);
        }
      });
    },
    [call, push, log, fetchOwners, withBusy]
  );

  const createOwner = async (data: { phone: string; name: string; language: string; trialDays: number }, another: boolean): Promise<boolean> => {
    setCreating(true);
    setError(null);
    try {
      await call("/admin/owners", { method: "POST", body: data }, "Failed to create owner.");
      if (!another) setShowAddModal(false);
      push({ kind: "success", title: "Owner created", desc: data.name || data.phone });
      log(`Created ${data.name || data.phone} (${data.trialDays} days)`, true, data.phone);
      markFlash([data.phone]);
      await fetchOwners(true);
      return true;
    } catch (e) {
      if ((e as Error).message !== "Unauthorized") push({ kind: "error", title: "Could not create owner", desc: errMsg(e) });
      return false;
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

  // ---- stable callbacks for the memoised sections
  const goShops = useCallback(() => document.getElementById("sec-shops")?.scrollIntoView({ behavior: prefersReduced() ? "auto" : "smooth", block: "start" }), []);
  const applyQuery = useCallback((q: string) => {
    setQuery(q);
    setStatusFilter("all");
    goShops();
  }, [goShops]);
  const openOwner = useCallback((phone: string, tab: DrawerTab) => setDrawer({ phone, tab }), []);
  const pickBucket = useCallback((b: Bucket) => setStatusFilter((cur) => (cur === b ? "all" : b)), []);
  const togglePanel = useCallback((id: string) => setPrefs((p) => ({ ...p, collapsed: p.collapsed.includes(id) ? p.collapsed.filter((x) => x !== id) : [...p.collapsed, id] })), [setPrefs]);
  const toggleMore = useCallback(() => setPrefs((p) => ({ ...p, hidden: ESSENTIAL_HIDDEN.some((id) => p.hidden.includes(id)) ? [] : ESSENTIAL_HIDDEN })), [setPrefs]);
  const toggleTok = (tok: string, prefix?: string) => setQuery((q) => toggleToken(q, tok, prefix));
  const removeToken = (tok: string) => setQuery((q) => qTokens(q).filter((t) => t !== tok).join(" "));

  // ---- handlers for rows (stable identities so rows can be memoised)
  const handlers = useMemo<RowHandlers>(
    () => ({
      onSel: (phone) =>
        setSelected((s) => {
          const n = new Set(s);
          n.has(phone) ? n.delete(phone) : n.add(phone);
          return n;
        }),
      onOpen: openOwner,
      onExtend: (o, d) => void extend(o, d),
      onEdit: (o) => setEditingOwner(o),
      onToggle: (o) => void setActive(o, !o.isActive),
      onRemove: (o) => setRemoving(o),
      onCopy: copy,
      onPin: togglePin,
      onTag: (t) => setQuery((q) => (hasToken(q, `tag:${t}`) ? q : [...qTokens(q), `tag:${t}`].join(" "))),
    }),
    // tpls is a dependency so rows rebuild their WhatsApp links after a template edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extend, setActive, copy, togglePin, openOwner, tpls]
  );

  // ---- exports
  const exportHeader = ["Shop", "Phone", "Language", "Status", "Access until", "Days left", "Customers", "Outstanding (Frw)", "Joined", "Tags"];
  const exportRow = (o: EOwner) => [o.name ?? "", o.phone, o.language ?? "", BUCKETS.find((b) => b.key === o.bucket)!.label, o.trialEndsAt ? fmtDate(o.trialEndsAt) : "", o.daysLeft ?? "", o.customerCount, o.totalOutstanding, fmtDate(o.createdAt), (tags[o.phone] ?? []).join("; ")];
  const exportOwners = (list: EOwner[], name: string) => downloadCsv(`${name}-${stamp()}.csv`, exportHeader, list.map(exportRow));
  const exportJson = (list: EOwner[], name: string) =>
    downloadText(`${name}-${stamp()}.json`, JSON.stringify(list.map((o) => ({ ...o, tags: tags[o.phone] ?? [], pinned: pinSet.has(o.phone) })), null, 2), "application/json");
  const copyTable = (list: EOwner[]) => copy([exportHeader, ...list.map(exportRow)].map((r) => r.join("\t")).join("\n"));

  const buildDigest = () => {
    const d = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const lines = [
      `Shop Brain daily digest, ${d}`,
      "",
      `Shops: ${owners.length} (${counts.active} active, ${counts.expiring} expiring soon, ${counts.expired} expired, ${counts.deactivated} deactivated, ${counts.no_trial} without a trial date)`,
      `Customers: ${totalCustomers.toLocaleString()} · Outstanding: ${money(totalOutstandingAll)}`,
      `New shops this week: ${weeks[7]} (last week ${weeks[6]})`,
      "",
      attention.length ? "Needs attention:" : "Nobody needs a renewal right now.",
      ...attention.map((o) => `• ${label(o)}: ${(o.daysLeft ?? 0) < 0 ? "ended" : "ends"} ${relDays(o.daysLeft)}`),
    ];
    if (topDebt.length) lines.push("", "Biggest balances:", ...topDebt.slice(0, 3).map((o) => `• ${label(o)}: ${money(o.totalOutstanding)}`));
    return lines.join("\n");
  };

  // ---- keyboard shortcuts, auto refresh, idle sign-out, tab title, online status
  const overlayOpen = !!(intro || showAddModal || editingOwner || removing || drawer || showActivity || palette || queue || showSettings || showViews || showTpls || showImport || showHelp || digest !== null || tagPrompt);
  const cursorIdx = cursor ? pageRows.findIndex((o) => o.phone === cursor) : -1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!intro) setPalette((p) => !p);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || overlayOpen) return;
      const cur = cursor ? byPhone.get(cursor) : undefined;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "?") setShowHelp(true);
      else if (e.key === "n") {
        e.preventDefault();
        setShowAddModal(true);
      } else if (e.key === "r") void fetchOwners(true);
      else if (e.key === "t") toggleTheme();
      else if (e.key === "d") setDigest(buildDigest());
      else if (e.key === "j" || e.key === "k") {
        if (!pageRows.length) return;
        const next = clamp((cursorIdx < 0 ? (e.key === "j" ? -1 : pageRows.length) : cursorIdx) + (e.key === "j" ? 1 : -1), 0, pageRows.length - 1);
        setCursor(pageRows[next].phone);
        requestAnimationFrame(() => document.querySelector(`[data-phone="${pageRows[next].phone}"]`)?.scrollIntoView({ block: "center", behavior: prefersReduced() ? "auto" : "smooth" }));
      } else if (cur && e.key === "Enter") setDrawer({ phone: cur.phone, tab: "overview" });
      else if (cur && e.key === "x") handlers.onSel(cur.phone);
      else if (cur && e.key === "p") togglePin(cur.phone);
      else if (cur && e.key === "e") void extend(cur, 30);
      else if (e.key === "Escape") setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayOpen, intro, fetchOwners, cursor, cursorIdx, pageRows, byPhone, toggleTheme, handlers, togglePin, extend, owners, counts, attention, topDebt, weeks]);

  useEffect(() => {
    if (!prefs.auto) return;
    const id = setInterval(() => {
      if (!document.hidden && !overlayOpen && navigator.onLine) void fetchOwners(true);
    }, prefs.refreshSec * 1000);
    return () => clearInterval(id);
  }, [prefs.auto, prefs.refreshSec, overlayOpen, fetchOwners]);

  useEffect(() => {
    const bump = () => {
      lastActive.current = Date.now();
      warned.current = false;
    };
    const evs = ["pointerdown", "keydown", "scroll", "pointermove"] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const id = setInterval(() => {
      const idle = Date.now() - lastActive.current;
      if (idle > IDLE_MS) onLogout("You were signed out after 30 minutes of inactivity.");
      else if (idle > IDLE_MS - 120000 && !warned.current) {
        warned.current = true;
        push({ kind: "info", title: "Still there?", desc: "You will be signed out in 2 minutes.", ttl: 20000, action: { label: "Stay signed in", run: bump } });
      }
    }, 15000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(id);
    };
  }, [onLogout, push]);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = `${attention.length ? `(${attention.length}) ` : ""}Shop Brain Admin`;
    return () => {
      document.title = prev;
    };
  }, [attention.length]);

  // ---- derived UI bits
  const drawerOwner = drawer ? byPhone.get(drawer.phone) ?? null : null;
  const drawerIdx = drawer ? visible.findIndex((o) => o.phone === drawer.phone) : -1;
  const navDrawer = useCallback(
    (dir: 1 | -1) => {
      if (!visible.length) return;
      setDrawer((d) => {
        if (!d) return d;
        const i = visible.findIndex((o) => o.phone === d.phone);
        const next = visible[(i + dir + visible.length) % visible.length];
        return next ? { ...d, phone: next.phone } : d;
      });
    },
    [visible]
  );
  const allOnPage = pageRows.length > 0 && pageRows.every((o) => selected.has(o.phone));
  const selectedList = useMemo(() => [...selected].map((p) => byPhone.get(p)).filter(Boolean) as EOwner[], [selected, byPhone]);
  const filtersActive = statusFilter !== "all" || query.trim() !== "";
  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };
  const currentView = { query, status: statusFilter, sort };
  const applyView = (v: SavedView) => {
    setQuery(v.query);
    setStatusFilter(v.status);
    setSort(v.sort);
    setShowViews(false);
    goShops();
  };
  const replayIntro = () => {
    try {
      sessionStorage.removeItem(INTRO_KEY);
    } catch {
      /* ignore */
    }
    setIntro(true);
  };

  const paletteActions = useMemo<PaletteAction[]>(
    () => [
      { id: "add", label: "Add owner", hint: "N", icon: <UserPlus size={16} />, run: () => setShowAddModal(true) },
      { id: "refresh", label: "Refresh data", hint: "R", icon: <RefreshCw size={16} />, run: () => void fetchOwners(true) },
      { id: "queue", label: "Open renewal queue", icon: <Send size={16} />, run: () => setQueue({ owners: renewalList, tplId: "renew" }) },
      { id: "digest", label: "Daily digest", hint: "D", icon: <FileText size={16} />, run: () => setDigest(buildDigest()) },
      { id: "import", label: "Import owners from a list", icon: <Upload size={16} />, run: () => setShowImport(true) },
      { id: "tpls", label: "Edit message templates", icon: <FileText size={16} />, run: () => setShowTpls(true) },
      { id: "views", label: "Saved views", icon: <Bookmark size={16} />, run: () => setShowViews(true) },
      { id: "settings", label: "Appearance & behaviour", icon: <Settings size={16} />, run: () => setShowSettings(true) },
      { id: "help", label: "Shortcuts & search tips", hint: "?", icon: <HelpCircle size={16} />, run: () => setShowHelp(true) },
      { id: "intro", label: "Replay the intro", icon: <Layers size={16} />, run: replayIntro },
      { id: "csv", label: "Export all shops to CSV", icon: <Download size={16} />, run: () => exportOwners(enriched, "shopbrain-owners") },
      { id: "json", label: "Export all shops to JSON", icon: <Download size={16} />, run: () => exportJson(enriched, "shopbrain-owners") },
      { id: "print", label: "Print this page", icon: <Printer size={16} />, run: () => window.print() },
      { id: "theme", label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme", hint: "T", icon: theme === "dark" ? <Sun size={16} /> : <Moon size={16} />, run: toggleTheme },
      { id: "f-all", label: "Show all shops", icon: <Users size={16} />, run: () => clearFilters() },
      { id: "f-exp", label: "Show expiring soon", icon: <Clock size={16} />, run: () => setStatusFilter("expiring") },
      { id: "f-expd", label: "Show expired", icon: <XCircle size={16} />, run: () => setStatusFilter("expired") },
      { id: "f-act", label: "Show active", icon: <CheckCircle2 size={16} />, run: () => setStatusFilter("active") },
      { id: "f-pin", label: "Show pinned shops", icon: <Star size={16} />, run: () => applyQuery("is:pinned") },
      { id: "lay-grid", label: "Card layout: grid", icon: <LayoutGrid size={16} />, run: () => upd({ layout: "grid", view: "cards" }) },
      { id: "lay-rail", label: "Card layout: rail", icon: <List size={16} />, run: () => upd({ layout: "rail", view: "cards" }) },
      { id: "lay-wall", label: "Card layout: wall", icon: <Layers size={16} />, run: () => upd({ layout: "wall", view: "cards" }) },
      { id: "view", label: prefs.view === "table" ? "Switch to card view" : "Switch to table view", icon: prefs.view === "table" ? <LayoutGrid size={16} /> : <List size={16} />, run: () => upd({ view: prefs.view === "table" ? "cards" : "table" }) },
      { id: "calm", label: prefs.calm ? "Turn calm mode off" : "Turn calm mode on (no motion)", icon: <Zap size={16} />, run: () => upd({ calm: !prefs.calm }) },
      { id: "auto", label: prefs.auto ? "Turn auto-refresh off" : "Turn auto-refresh on", icon: <Zap size={16} />, run: () => upd({ auto: !prefs.auto }) },
      { id: "log", label: "Open activity log", icon: <Activity size={16} />, run: () => setShowActivity(true) },
      { id: "out", label: "Log out", icon: <LockKeyhole size={16} />, run: () => onLogout() },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs.view, prefs.auto, prefs.calm, enriched, fetchOwners, onLogout, theme, toggleTheme, renewalList, upd, tags, pins, owners, counts, attention, topDebt, weeks, applyQuery]
  );

  const chips: { k: Bucket | "all"; l: string; n: number }[] = [
    { k: "all", l: "All", n: owners.length },
    ...BUCKETS.map((b) => ({ k: b.key as Bucket | "all", l: b.label, n: counts[b.key] })),
  ];
  const quickChips: { l: string; tok: string; prefix?: string }[] = [
    { l: "Pinned", tok: "is:pinned" },
    { l: "Owes money", tok: "is:owing" },
    { l: "No customers", tok: "is:nocust" },
    { l: "Duplicates", tok: "is:dupe" },
    { l: "Kinyarwanda", tok: "lang:rw", prefix: "lang:" },
    { l: "English", tok: "lang:en", prefix: "lang:" },
    { l: "Joined 7d", tok: "joined:7", prefix: "joined:" },
    { l: "Joined 30d", tok: "joined:30", prefix: "joined:" },
    { l: "Ends within 7d", tok: "days<=7" },
  ];
  const hide = prefs.cols;
  const anyInsight = ["quick", "donut", "debt", "growth", "spotlight", "forecast", "calendar", "histogram", "people", "quality"].some(isShown);
  const moreOpen = ESSENTIAL_HIDDEN.every((id) => !hidden.includes(id));
  const navItems = useMemo(
    () => [
      { id: "sec-overview", label: "Overview" },
      ...(isShown("snapshot") ? [{ id: "sec-snapshot", label: "Snapshot" }] : []),
      ...(anyInsight ? [{ id: "sec-insights", label: "Insights" }] : []),
      ...(isShown("attention") ? [{ id: "sec-attention", label: "Attention" }] : []),
      { id: "sec-shops", label: `Shops (${visible.length})` },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hidden, anyInsight, visible.length]
  );

  return (
    <div ref={rootRef} className="adm-root" data-theme={theme} data-accent={prefs.accent} data-rad={prefs.radius} data-calm={prefs.calm ? "1" : undefined} data-intro={intro ? "1" : undefined}>
      <style>{ADM_CSS + EXTRAS_CSS + FIX_CSS}</style>
      <div className="adm-aurora" aria-hidden />
      <div className="adm-prog" aria-hidden />
      <RefreshBar active={loading || refreshing} />
      <div className="adm-wrap">
        {!online && (
          <div className="adm-offline" role="alert">
            <WifiOff size={16} /> You are offline. Changes will not save until the connection is back.
          </div>
        )}

        {/* header */}
        <div className="adm-head adm-in">
          <div className="adm-brand">
            <Cube size={34} mini />
            <div>
              <h1 className="adm-title">Shop Brain Admin</h1>
              <p className="adm-sub">
                {owners.length} registered shop{owners.length === 1 ? "" : "s"}
                <LastUpdated at={lastFetched} refreshing={refreshing} auto={prefs.auto} sec={prefs.refreshSec} />
              </p>
            </div>
          </div>
          <div className="adm-tools">
            <button onClick={() => setPalette(true)} className="adm-btn" title="Command palette">
              <Command size={14} /> Search <span className="adm-kbd">⌘K</span>
            </button>
            <button onClick={() => setShowAddModal(true)} className="adm-btn pri" data-testid="button-add-owner">
              <UserPlus size={14} /> Add Owner
            </button>
            <button onClick={() => setQueue({ owners: renewalList, tplId: "renew" })} className="adm-btn" title="Step through renewal reminders">
              <Send size={14} /> Renewals {renewalList.length > 0 && <b>{renewalList.length}</b>}
            </button>
            <button onClick={() => fetchOwners(true)} disabled={loading || refreshing} className="adm-btn sq" aria-label="Refresh" title="Refresh (R)" data-testid="button-refresh">
              <RefreshCw size={15} className={loading || refreshing ? "adm-spin" : ""} />
            </button>
            <Menu
              aria="More"
              className="adm-btn sq"
              trigger={<MoreHorizontal size={16} />}
              items={[
                { key: "live", label: prefs.auto ? "Turn live refresh off" : "Turn live refresh on", icon: <Zap size={14} />, onClick: () => upd({ auto: !prefs.auto }) },
                { key: "digest", label: "Daily digest", icon: <FileText size={14} />, onClick: () => setDigest(buildDigest()) },
                { key: "views", label: "Saved views", icon: <Bookmark size={14} />, onClick: () => setShowViews(true) },
                { key: "tpls", label: "Message templates", icon: <FileText size={14} />, onClick: () => setShowTpls(true) },
                { key: "import", label: "Import owners", icon: <Upload size={14} />, onClick: () => setShowImport(true) },
                { key: "act", label: `Activity log${activity.length ? ` (${activity.length})` : ""}`, icon: <Activity size={14} />, onClick: () => setShowActivity(true) },
                "sep",
                { key: "settings", label: "Appearance & behaviour", icon: <Settings size={14} />, onClick: () => setShowSettings(true) },
                { key: "help", label: "Shortcuts & tips", icon: <Keyboard size={14} />, onClick: () => setShowHelp(true) },
                { key: "print", label: "Print", icon: <Printer size={14} />, onClick: () => window.print() },
                "sep",
                { key: "out", label: "Log out", icon: <LockKeyhole size={14} />, onClick: () => onLogout(), testid: "button-admin-logout" },
              ]}
            />
            <ThemeToggle />
          </div>
        </div>

        <SectionNav items={navItems} />

        {error && (
          <div className="adm-err" data-testid="text-dashboard-error">
            <AlertTriangle size={16} style={{ flex: "none" }} /> <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{error}</span>
            <button className="adm-link" style={{ marginLeft: "auto", flex: "none" }} onClick={() => fetchOwners()}>
              Retry
            </button>
          </div>
        )}

        <KpiRow loading={loading} counts={counts} total={owners.length} customers={totalCustomers} outstanding={totalOutstandingAll} weeks={weeks} cumulative={cumulative} filter={statusFilter} onPick={pickBucket} />

        {owners.length > 0 && isShown("snapshot") && <Snapshot s={snap} onOpen={openOwner} />}

        {owners.length > 0 && anyInsight && (
          <>
            <div className="adm-sh" id="sec-insights">
              <h2>Insights</h2>
              <button className="adm-btn sm" onClick={toggleMore}>
                {moreOpen ? "Show fewer" : "Show all insights"}
              </button>
            </div>
            <Insights d={insights} hidden={hidden} collapsed={prefs.collapsed} filter={statusFilter} still={prefs.calm} onToggle={togglePanel} onPick={pickBucket} onApply={applyQuery} onOpen={openOwner} />
          </>
        )}

        {owners.length > 0 && isShown("attention") && <AttentionPanel list={attention} busy={busy} onExtend={extend} />}
        {owners.length > 0 && isShown("funnel") && <FunnelRow owners={enriched} />}

        {/* shops */}
        <div className="adm-sh" id="sec-shops">
          <h2>Shops</h2>
        </div>
        <div className="adm-toolbar">
          <SearchBox value={query} onChange={setQuery} hist={hist} onRemember={remember} onClearHist={clearHist} inputRef={searchRef} />
          <select className="adm-select" value={sort.key} onChange={(e) => setSort({ key: e.target.value as SortKey, dir: e.target.value === "name" || e.target.value === "expiry" || e.target.value === "default" ? 1 : -1 })} aria-label="Sort shops">
            <option value="default">Sort: default</option>
            <option value="name">Name A–Z</option>
            <option value="created">Newest first</option>
            <option value="expiry">Expires soonest</option>
            <option value="customers">Most customers</option>
            <option value="outstanding">Highest outstanding</option>
          </select>
          {wide && (
            <div className="adm-segbtn" role="group" aria-label="View">
              <button className={prefs.view === "table" ? "on" : ""} onClick={() => upd({ view: "table" })} aria-label="Table view" title="Table view">
                <List size={15} />
              </button>
              <button className={prefs.view === "cards" ? "on" : ""} onClick={() => upd({ view: "cards" })} aria-label="Card view" title="Card view">
                <LayoutGrid size={15} />
              </button>
            </div>
          )}
          {view === "cards" && (
            <div className="adm-segbtn" role="group" aria-label="Card layout">
              {([["grid", LayoutGrid, "Grid"], ["rail", List, "Rail"], ["wall", Layers, "Wall"]] as const).map(([k, Ic, t]) => (
                <button key={k} className={prefs.layout === k ? "on" : ""} onClick={() => upd({ layout: k })} aria-label={`${t} layout`} title={`${t} layout`}>
                  <Ic size={15} />
                </button>
              ))}
            </div>
          )}
          {wide && view === "table" && (
            <button className="adm-btn" onClick={() => upd({ density: prefs.density === "comfy" ? "compact" : "comfy" })} title="Row density">
              {prefs.density === "comfy" ? "Comfortable" : "Compact"}
            </button>
          )}
          <button className={`adm-btn ${showFilters ? "ok" : ""}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <Filter size={14} /> Filters {parsedLive.tokens.length > 0 && <b>{parsedLive.tokens.length}</b>}
          </button>
          <Menu
            aria="Export"
            className="adm-btn"
            trigger={<><Download size={14} /> Export</>}
            items={[
              { key: "csv", label: "CSV (rows shown)", icon: <Download size={14} />, onClick: () => exportOwners(visible, "shopbrain-owners"), disabled: !visible.length },
              { key: "json", label: "JSON (rows shown)", icon: <Download size={14} />, onClick: () => exportJson(visible, "shopbrain-owners"), disabled: !visible.length },
              { key: "tsv", label: "Copy as table", icon: <Copy size={14} />, onClick: () => copyTable(visible), disabled: !visible.length },
              "sep",
              { key: "print", label: "Print", icon: <Printer size={14} />, onClick: () => window.print() },
            ]}
          />
        </div>

        {showFilters && (
          <div className="adm-card adm-filters">
            <div className="adm-chips" role="group" aria-label="Quick filters">
              {quickChips.map((c) => (
                <button key={c.tok} className={`adm-chip sm2 ${hasToken(query, c.tok) ? "on" : ""}`} onClick={() => toggleTok(c.tok, c.prefix)}>
                  {c.l}
                </button>
              ))}
              {allTags.slice(0, 8).map((t) => (
                <button key={t} className={`adm-chip sm2 ${hasToken(query, `tag:${t}`) ? "on" : ""}`} onClick={() => toggleTok(`tag:${t}`)}>
                  <Tag size={11} /> {t}
                </button>
              ))}
            </div>
            <div className="adm-quick">
              <Menu
                aria="Saved views"
                className="adm-btn sm"
                trigger={<><Bookmark size={13} /> Views</>}
                items={[
                  ...views.slice(0, 6).map((v) => ({ key: v.id, label: v.name, icon: <Bookmark size={14} />, onClick: () => applyView(v) })),
                  ...(views.length ? (["sep"] as const) : []),
                  { key: "manage", label: "Save or manage views…", icon: <Settings size={14} />, onClick: () => setShowViews(true) },
                ]}
              />
              <button className="adm-link" onClick={() => setShowHelp(true)}>
                Search syntax
              </button>
            </div>
          </div>
        )}

        <div className="adm-chips" style={{ marginBottom: 10 }} role="group" aria-label="Filter by status">
          {chips.map((c) => (
            <button key={c.k} className={`adm-chip ${statusFilter === c.k ? "on" : ""}`} onClick={() => setStatusFilter(c.k)}>
              {c.l} <em>{c.n}</em>
            </button>
          ))}
        </div>
        {parsedLive.tokens.length > 0 && (
          <div className="adm-chips" style={{ marginBottom: 10 }} aria-label="Active search filters">
            {parsedLive.tokens.map((t) => (
              <span key={t} className="adm-chip tok">
                {t}
                <button className="adm-btn sm icon ghost" style={{ width: 22, height: 22 }} onClick={() => removeToken(t)} aria-label={`Remove ${t}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
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
            <span>Add your first owner to start a trial, or import a list.</span>
            <div className="adm-quick" style={{ justifyContent: "center" }}>
              <button className="adm-btn pri" onClick={() => setShowAddModal(true)}>
                <UserPlus size={14} /> Add Owner
              </button>
              <button className="adm-btn" onClick={() => setShowImport(true)}>
                <Upload size={14} /> Import
              </button>
            </div>
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
        ) : view === "table" ? (
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
                      ["Shop", "name", "shop"], ["Phone", null, "phone"], ["Status", null, "status"], ["Access until", "expiry", "until"], ["Customers", "customers", "customers"], ["Outstanding", "outstanding", "outstanding"], ["Actions", null, "actions"],
                    ] as [string, SortKey | null, string][])
                      .filter(([, , id]) => !hide.includes(id))
                      .map(([t, k]) => (
                        <th key={t} className={k ? "s" : ""} onClick={k ? () => toggleSort(k) : undefined} style={t === "Actions" ? { textAlign: "right" } : undefined}>
                          {t}
                          {k && sort.key === k && <ChevronDown size={12} className={sort.dir === 1 ? "up" : ""} />}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((o, i) => (
                    <OwnerRow key={o.phone} o={o} i={i} selected={selected.has(o.phone)} busy={!!busy[o.phone]} flash={!!flash[o.phone]} cur={cursor === o.phone} pinned={pinSet.has(o.phone)} tags={tags[o.phone] ?? EMPTY} maxOut={maxOut} hq={hq} hide={hide} h={handlers} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className={`adm-cards lay-${prefs.layout}`}>
            {pageRows.map((o, i) => (
              <Roll key={o.phone}>
                <OwnerCard o={o} i={i} selected={selected.has(o.phone)} busy={!!busy[o.phone]} flash={!!flash[o.phone]} cur={cursor === o.phone} pinned={pinSet.has(o.phone)} tags={tags[o.phone] ?? EMPTY} maxOut={maxOut} hq={hq} h={handlers} />
              </Roll>
            ))}
          </div>
        )}

        {visible.length > 0 &&
          (prefs.paging === "pages" ? (
            <Pager page={page} pages={pages} total={visible.length} size={prefs.pageSize} setPage={setPage} setSize={(n) => upd({ pageSize: n })} from={page * prefs.pageSize + 1} to={Math.min(visible.length, (page + 1) * prefs.pageSize)} />
          ) : (
            <div className="adm-more">
              <span>
                Showing <b style={{ color: "var(--fg)" }}>{pageRows.length}</b> of <b style={{ color: "var(--fg)" }}>{visible.length}</b>
              </span>
              {pageRows.length < visible.length && (
                <button className="adm-btn" onClick={() => setMoreN((n) => n + prefs.pageSize)}>
                  <ChevronDown size={14} /> Load {Math.min(prefs.pageSize, visible.length - pageRows.length)} more
                </button>
              )}
            </div>
          ))}
      </div>

      <ScrollTop />

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
          <Menu
            aria="Message selected shops"
            className="adm-btn sm"
            trigger={<><Send size={13} /> Message</>}
            items={tpls.map((t) => ({ key: t.id, label: t.name, icon: <MessageCircle size={14} />, onClick: () => setQueue({ owners: selectedList, tplId: t.id }) }))}
          />
          <Menu
            aria="More bulk actions"
            className="adm-btn sm"
            trigger={<><MoreHorizontal size={13} /> More</>}
            items={[
              { key: "pin", label: "Pin selected", icon: <Star size={14} />, onClick: () => setPins((p) => [...new Set([...p, ...selected])]) },
              { key: "unpin", label: "Unpin selected", icon: <Star size={14} />, onClick: () => setPins((p) => p.filter((x) => !selected.has(x))) },
              { key: "tag", label: "Add tag…", icon: <Tag size={14} />, onClick: () => setTagPrompt(true) },
              { key: "nums", label: "Copy phone numbers", icon: <Copy size={14} />, onClick: () => copy(selectedList.map((o) => o.phone).join("\n")) },
              { key: "csv", label: "Export CSV", icon: <Download size={14} />, onClick: () => exportOwners(selectedList, "shopbrain-selected") },
              { key: "json", label: "Export JSON", icon: <Download size={14} />, onClick: () => exportJson(selectedList, "shopbrain-selected") },
            ]}
          />
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
          tags={tags[drawerOwner.phone] ?? EMPTY}
          allTags={allTags}
          onAddTag={(t) => addTag([drawerOwner.phone], t)}
          onRemoveTag={(t) => removeTag(drawerOwner.phone, t)}
          tpls={tpls}
          activity={activity}
          navLabel={drawerIdx >= 0 ? `${drawerIdx + 1} of ${visible.length} shown` : "Not in the current list"}
          onNav={navDrawer}
        />
      )}
      {editingOwner && <EditOwnerModal owner={editingOwner} others={owners} saving={!!busy[editingOwner.phone]} onCancel={() => setEditingOwner(null)} onSave={(u) => saveEdit(editingOwner.phone, u)} />}
      {showAddModal && <AddOwnerModal owners={owners} saving={creating} onCancel={() => setShowAddModal(false)} onSave={createOwner} />}
      {removing && <ConfirmRemoveModal owner={removing} busy={!!busy[removing.phone]} onCancel={() => setRemoving(null)} onConfirm={() => removeOwner(removing)} />}
      {queue && <RenewalQueue owners={queue.owners} getMessage={(o) => { const t = tpls.find((x) => x.id === queue.tplId) ?? tpls[0]; return t ? fillTpl(t, o as EOwner) : renewalMessage(o as EOwner); }} link={waLink} onClose={() => setQueue(null)} />}
      {showSettings && <SettingsModal prefs={prefs} upd={upd} onReset={() => setPrefs(DEFAULT_PREFS)} onClose={() => setShowSettings(false)} />}
      {showViews && <ViewsModal views={views} setViews={setViews} current={currentView} onApply={applyView} onClose={() => setShowViews(false)} />}
      {showTpls && <TemplatesModal tpls={tpls} setTpls={setTpls} onClose={() => setShowTpls(false)} />}
      {showImport && (
        <ImportModal
          owners={owners}
          call={call}
          onClose={() => setShowImport(false)}
          onDone={(ok, failed) => {
            setShowImport(false);
            push({ kind: failed ? "error" : "success", title: `Imported ${ok} owner${ok === 1 ? "" : "s"}`, desc: failed ? `${failed} failed.` : undefined });
            log(`Imported ${ok} owners (${failed} failed)`, failed === 0);
            void fetchOwners(true);
          }}
        />
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {digest !== null && <DigestModal text={digest} onCopy={copy} onClose={() => setDigest(null)} />}
      {tagPrompt && (
        <PromptModal
          title={`Add a tag to ${selected.size} shop${selected.size === 1 ? "" : "s"}`}
          placeholder="e.g. VIP"
          cta="Add tag"
          onClose={() => setTagPrompt(false)}
          onSubmit={(t) => {
            addTag([...selected], t);
            log(`Tagged ${selected.size} shops "${t}"`);
            setTagPrompt(false);
            setSelected(new Set());
          }}
        />
      )}
      {showActivity && (
        <Modal onClose={() => setShowActivity(false)} width={480}>
          <ModalHead title="Activity log" onClose={() => setShowActivity(false)} />
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
      {palette && <Palette owners={enriched} tags={tags} actions={paletteActions} onOpenOwner={(phone) => setDrawer({ phone, tab: "overview" })} onClose={() => setPalette(false)} />}
      <Toasts items={toasts} dismiss={dismiss} />

      {intro && <Intro ready={!loading} stats={{ shops: owners.length, customers: totalCustomers, outstanding: totalOutstandingAll }} accent={prefs.accent} onEnter={enterDash} />}
    </div>
  );

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" || key === "expiry" ? 1 : -1 }));
  }
}
const EMPTY: string[] = [];

// ---------------------------------------------------------------------------
// Login gate (same /admin/verify call as before) + theme provider
// ---------------------------------------------------------------------------

export default function Admin() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [password, setPassword] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);
  const themeValue = useMemo(() => ({ theme, toggle: toggleTheme }), [theme, toggleTheme]);

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
      sessionStorage.removeItem(INTRO_KEY); // a fresh sign-in plays the intro
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
    sessionStorage.removeItem(INTRO_KEY);
    setPassword(null);
    setPasswordInput("");
    setNotice(typeof reason === "string" ? reason : null);
  }, []);

  if (!password) {
    return (
      <ThemeCtx.Provider value={themeValue}>
        <div className="adm-root adm-login" data-theme={theme}>
          <style>{ADM_CSS + EXTRAS_CSS + FIX_CSS}</style>
          <div className="adm-logintheme">
            <ThemeToggle />
          </div>
          <div style={{ width: "100%", maxWidth: 392, position: "relative", zIndex: 1 }}>
            <Link href="/" className="adm-back-link">
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
      </ThemeCtx.Provider>
    );
  }

  return (
    <ThemeCtx.Provider value={themeValue}>
      <OwnersDashboard password={password} onLogout={handleLogout} />
    </ThemeCtx.Provider>
  );
}