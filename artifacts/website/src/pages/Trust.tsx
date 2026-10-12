import React, { useCallback, useEffect, useRef, useState } from "react";
import { BellOff, Clock, FileSpreadsheet, MessageCircle, Receipt, ShieldCheck, UserCheck, Languages, Smartphone, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { prefersReducedMotion } from "./motion";

// Credibility sections for the marketing site.
//
//   <FactStrip />     always visible: five verified product facts right under the hero.
//   <LiveProof />     real numbers from GET /api/public/stats, drawn big, with a chart and 3D tiles.
//   <TrustSection />  six protections that already run in the bot, nothing invented.
//   usePublicStats()  the shared data hook (also used by TrustPage.tsx).
//
// HONESTY RULES (these protect your credibility, do not remove them)
//   - Numbers are never invented, padded or rounded up. If the API is down or slow,
//     LiveProof renders nothing at all.
//   - A tile appears only when its value reaches MIN_SHOW. The defaults are LOW so the
//     section is visible from your first shops; raise them as you grow, so every tile
//     on screen is one you are proud of.
//   - The API returns anonymous totals only: no names, no phone numbers, no shop names.

const INK = "#1B2559";
const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;
const EASE = "cubic-bezier(.16,1,.3,1)";

// If the website and the API live on different hosts, set VITE_API_BASE
// (for example https://shop-brain-webhook--ndayiragijesamu.replit.app). Empty = same host.
const API_BASE: string = ((import.meta as any).env?.VITE_API_BASE as string | undefined) ?? "";

export const MIN_SHOW = { shops: 1, customers: 10, tracked: 50_000, collected: 20_000, reminders: 10, activeShops: 1, shops30: 1 };

type Lang = "rw" | "en" | "fr";
export type PublicStats = {
  shops: number;
  shops30: number;
  activeShops: number;
  customers: number;
  tracked: number;
  collected: number;
  collected30: number;
  reminders: number;
  deliveryRate: number | null;
  daily: number[];
  since: string | null;
  updatedAt: string;
};

const CACHE_KEY = "sb-public-stats-v2";
const CACHE_MS = 10 * 60 * 1000;
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);

async function loadStats(signal: AbortSignal): Promise<PublicStats | null> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { at: number; body: PublicStats };
      if (Date.now() - c.at < CACHE_MS) return c.body;
    }
  } catch {
    /* storage can be blocked */
  }
  try {
    const res = await fetch(`${API_BASE}/api/public/stats`, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || j.ok !== true) return null;
    const body: PublicStats = {
      shops: num(j.shops),
      shops30: num(j.shops30),
      activeShops: num(j.activeShops),
      customers: num(j.customers),
      tracked: num(j.tracked),
      collected: num(j.collected),
      collected30: num(j.collected30),
      reminders: num(j.reminders),
      deliveryRate: typeof j.deliveryRate === "number" ? j.deliveryRate : null,
      daily: Array.isArray(j.daily) ? j.daily.map(num) : [],
      since: typeof j.since === "string" ? j.since : null,
      updatedAt: typeof j.updatedAt === "string" ? j.updatedAt : new Date().toISOString(),
    };
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), body }));
    } catch {
      /* ignore */
    }
    return body;
  } catch {
    return null;
  }
}

export function usePublicStats() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 6000);
    loadStats(ctrl.signal).then((s) => {
      window.clearTimeout(timer);
      if (s) setStats(s);
    });
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, []);
  return stats;
}

const fmt = (n: number, lang: Lang) => {
  const s = Math.round(n).toLocaleString("en-US");
  return lang === "fr" ? s.replace(/,/g, "\u202f") : s;
};
const loc = (lang: Lang) => (lang === "rw" ? "en-GB" : lang);

const COPY = {
  en: {
    live: "Live from the system",
    since: "Since",
    updated: "Updated",
    liveTitle: "Real shops. Real money. Counted, not estimated.",
    liveSub: "These totals are read from the live Shop Brain database every few minutes. No names, no phone numbers, nothing rounded up.",
    bigLabel: "RWF of customer debt tracked in Shop Brain",
    chartTitle: "Payments recorded, last 14 days",
    chartNote: "RWF per day",
    tiles: { shops: "shops on Shop Brain", customers: "customers tracked", collected30: "RWF of payments recorded, last 30 days", reminders: "polite reminders sent", activeShops: "shops active this month", shops30: "new shops in the last 30 days" },
    delivery: "of reminders reach the customer's WhatsApp",
    privacy: "How we protect your data",
    facts: ["No app to install", "Kinyarwanda, English, Français", "Reminders only with consent", "A receipt for every payment", "Your records export to Excel"],
    trustTitle: "Built to protect your shop and your customers",
    trustSub: "Every protection below is already running in the bot today.",
    cards: [
      { t: "Nothing saves without your yes", d: "Shop Brain shows what it understood and waits for you to confirm. A typo never becomes a debt." },
      { t: "Customers agree first", d: "Reminders only go to customers who agreed to receive them. No consent on record, no message." },
      { t: "STOP works everywhere", d: "One reply of STOP ends reminders from every shop on Shop Brain, and you are told right away." },
      { t: "Gentle by design", d: "At most one reminder per customer every 7 days, and auto-reminders only run between 09:00 and 18:00." },
      { t: "Receipts and proof", d: "Every payment gets a receipt. When a customer taps I've paid, nothing changes until you confirm." },
      { t: "Your records stay yours", d: "Only you see your shop's records. Export all of them to Excel whenever you want." },
    ],
    cta: "See it on WhatsApp",
    more: "Read the full trust page",
  },
  rw: {
    live: "Ubu, biva muri sisitemu",
    since: "Kuva",
    updated: "Byavuguruwe",
    liveTitle: "Amaduka nyayo. Amafaranga nyayo. Yabazwe, ntiyakekwe.",
    liveSub: "Iyi migabane ifatwa muri database ya Shop Brain ikora ubu buri minota mike. Nta mazina, nta nimero za telefone, nta kongerwaho.",
    bigLabel: "RWF y'imyenda y'abakiriya ikurikiranwa muri Shop Brain",
    chartTitle: "Ubwishyu bwanditswe, iminsi 14 ishize",
    chartNote: "RWF ku munsi",
    tiles: { shops: "amaduka kuri Shop Brain", customers: "abakiriya babitswe", collected30: "RWF y'ubwishyu bwanditswe, iminsi 30", reminders: "inyibutsa zoherejwe", activeShops: "amaduka akora uku kwezi", shops30: "amaduka mashya mu minsi 30" },
    delivery: "by'inyibutsa bigera kuri WhatsApp y'umukiriya",
    privacy: "Uko turinda amakuru yawe",
    facts: ["Nta porogaramu ushyiramo", "Ikinyarwanda, Icyongereza, Igifaransa", "Inyibutsa ku bemeye gusa", "Inyemezabwishyu kuri buri bwishyu", "Amakuru yawe ajya muri Excel"],
    trustTitle: "Yubakiwe kurinda iduka ryawe n'abakiriya bawe",
    trustSub: "Ibi byose bisanzwe bikora muri roboti uyu munsi.",
    cards: [
      { t: "Nta kibikwa utabyemeje", d: "Shop Brain igaragaza icyo yumvise ikategereza ko wemeza. Ikosa ry'inyandiko ntirihinduka umwenda." },
      { t: "Abakiriya bemera mbere", d: "Inyibutsa zijya gusa ku bakiriya bemeye kuzibona. Nta bwemera bwanditswe, nta butumwa." },
      { t: "STOP ikora hose", d: "Gusubiza STOP rimwe bihagarika inyibutsa z'amaduka yose ari kuri Shop Brain, kandi ubimenyeshwa ako kanya." },
      { t: "Ntibibangamira", d: "Inyibutsa imwe gusa kuri buri mukiriya mu minsi 7, kandi izikora ubwazo zikora hagati ya 09:00 na 18:00." },
      { t: "Inyemezabwishyu na gihamya", d: "Buri bwishyu buhabwa inyemezabwishyu. Umukiriya akanze I've paid, nta kihinduka utaremeza." },
      { t: "Amakuru yawe ni ayawe", d: "Ni wowe wenyine ubona amakuru y'iduka ryawe. Yohereze yose muri Excel igihe cyose ushaka." },
    ],
    cta: "Reba kuri WhatsApp",
    more: "Soma urupapuro rwose rw'icyizere",
  },
  fr: {
    live: "En direct du système",
    since: "Depuis",
    updated: "Mis à jour",
    liveTitle: "De vrais commerces. De l'argent réel. Compté, pas estimé.",
    liveSub: "Ces totaux sont lus dans la base Shop Brain en direct, toutes les quelques minutes. Aucun nom, aucun numéro, rien d'arrondi à la hausse.",
    bigLabel: "RWF de dettes clients suivies dans Shop Brain",
    chartTitle: "Paiements enregistrés, 14 derniers jours",
    chartNote: "RWF par jour",
    tiles: { shops: "commerces sur Shop Brain", customers: "clients suivis", collected30: "RWF de paiements enregistrés, 30 jours", reminders: "rappels envoyés", activeShops: "commerces actifs ce mois-ci", shops30: "nouveaux commerces en 30 jours" },
    delivery: "des rappels arrivent sur le WhatsApp du client",
    privacy: "Comment nous protégeons vos données",
    facts: ["Aucune appli à installer", "Kinyarwanda, anglais, français", "Rappels avec consentement", "Un reçu pour chaque paiement", "Export Excel de vos données"],
    trustTitle: "Conçu pour protéger votre commerce et vos clients",
    trustSub: "Chaque protection ci-dessous fonctionne déjà dans le bot aujourd'hui.",
    cards: [
      { t: "Rien n'est enregistré sans votre accord", d: "Shop Brain montre ce qu'il a compris et attend votre confirmation. Une faute de frappe ne devient jamais une dette." },
      { t: "Le client accepte d'abord", d: "Les rappels ne partent qu'aux clients qui ont accepté de les recevoir. Pas de consentement noté, pas de message." },
      { t: "STOP marche partout", d: "Une réponse STOP met fin aux rappels de tous les commerces sur Shop Brain, et vous êtes prévenu aussitôt." },
      { t: "Doux par conception", d: "Un rappel par client tous les 7 jours au plus, et les rappels automatiques ne tournent qu'entre 09h00 et 18h00." },
      { t: "Reçus et preuves", d: "Chaque paiement donne lieu à un reçu. Quand un client touche I've paid, rien ne change avant votre confirmation." },
      { t: "Vos données restent à vous", d: "Vous seul voyez les données de votre commerce. Exportez-les toutes vers Excel quand vous voulez." },
    ],
    cta: "Voir sur WhatsApp",
    more: "Lire la page confiance complète",
  },
} as const;

export const TRUST_COPY = COPY;

const CSS = `
.tr-r{opacity:0;transform:translateY(26px);transition:opacity .8s ${EASE} var(--d,0ms),transform .9s ${EASE} var(--d,0ms)}
[data-in="1"] .tr-r{opacity:1;transform:none}
.tr-dot{display:inline-block;width:.6rem;height:.6rem;border-radius:50%;background:#22c55e;animation:tr-pulse 1.8s ease-out infinite}
@keyframes tr-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.65)}100%{box-shadow:0 0 0 .7rem rgba(34,197,94,0)}}
.tr-paper{position:absolute;inset:0;pointer-events:none;opacity:.55;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 35px,rgba(120,140,220,.12) 35px,rgba(120,140,220,.12) 36px)}
.tr-tilt{transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .18s ease-out,box-shadow .3s;will-change:transform}
.tr-tile{position:relative;overflow:hidden;height:100%;border-radius:1.25rem;padding:1.4rem 1.3rem;background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.04));box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 24px 50px -28px rgba(0,0,0,.7)}
.tr-tile::before{content:"";position:absolute;left:-30%;top:-60%;width:60%;height:220%;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent);transform:translateX(-160%) skewX(-18deg)}
@media (hover:hover){.tr-tile:hover::before{transition:transform 1s ease;transform:translateX(420%) skewX(-18deg)}}
.tr-tile::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:${SUN};transform:scaleX(0);transform-origin:0 50%;transition:transform 1.3s ${EASE} calc(var(--d,0ms) + 300ms)}
[data-in="1"] .tr-tile::after{transform:scaleX(1)}
.tr-bars{display:flex;align-items:flex-end;gap:.4rem;height:9rem}
.tr-bars div{flex:1;min-width:0;height:100%;display:flex;align-items:flex-end}
.tr-bars i{display:block;width:100%;border-radius:.4rem .4rem .15rem .15rem;background:linear-gradient(0deg,#e0a800,${SUN});min-height:3px;transform:scaleY(0);transform-origin:50% 100%;transition:transform 1s ${EASE} var(--d,0ms)}
[data-in="1"] .tr-bars i{transform:scaleY(1)}
.tr-ring circle{fill:none;stroke-width:9;stroke-linecap:round}
.tr-ring .bg{stroke:rgba(255,255,255,.14)}
.tr-ring .fg{stroke:${SUN};stroke-dasharray:264;stroke-dashoffset:264;transition:stroke-dashoffset 1.6s ${EASE} .4s}
[data-in="1"] .tr-ring .fg{stroke-dashoffset:var(--off)}
.tr-fact{display:inline-flex;align-items:center;gap:.6rem;padding:.7rem 1.1rem;border-radius:999px;font-weight:700;font-size:.95rem;white-space:nowrap;border:1px solid hsl(var(--border));background:hsl(var(--card));transition:transform .35s ${EASE},border-color .3s}
@media (hover:hover){.tr-fact:hover{transform:translateY(-3px);border-color:rgba(15,122,63,.5)}}
.tr-card{height:100%;border-radius:1.25rem;border:1px solid hsl(var(--border));background:hsl(var(--card));padding:1.5rem;transition:transform .35s ${EASE},border-color .35s,box-shadow .35s}
@media (hover:hover){.tr-card:hover{transform:translateY(-5px);border-color:rgba(15,122,63,.45);box-shadow:0 20px 44px -22px rgba(27,37,89,.5)}}
.tr-ico{width:3rem;height:3rem;border-radius:.9rem;display:flex;align-items:center;justify-content:center;background:rgba(15,122,63,.12);color:${GREEN};transition:transform .45s cubic-bezier(.34,1.56,.64,1)}
.tr-card:hover .tr-ico{transform:rotate(-8deg) scale(1.12)}
@media (prefers-reduced-motion:reduce){.tr-r{opacity:1;transform:none;transition:none}.tr-dot{animation:none}.tr-tile::after{transform:none;transition:none}.tr-bars i{transform:none;transition:none}.tr-ring .fg{stroke-dashoffset:var(--off);transition:none}.tr-tilt{transform:none !important}}
`;

// Sets data-in="1" once, when the element is first on screen.
// It is a CALLBACK ref on purpose: LiveProof renders nothing until its data has loaded, so the
// element appears AFTER mount. A callback ref starts watching the moment the element exists.
// (A normal useRef + useEffect would run too early, find nothing, and leave the section invisible.)
function useSeen<T extends HTMLElement>(threshold = 0.12) {
  return useCallback(
    (el: T | null) => {
      if (!el) return;
      if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
        el.dataset.in = "1";
        return;
      }
      const io = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting) {
            el.dataset.in = "1";
            io.disconnect();
          }
        },
        { threshold }
      );
      io.observe(el);
    },
    [threshold]
  );
}

// counts up once when it first becomes visible
export function Count({ to, lang, ms = 1800 }: { to: number; lang: Lang; ms?: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      if (prefersReducedMotion()) {
        setV(to);
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    if (typeof IntersectionObserver === "undefined") {
      run();
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, ms]);
  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {fmt(v, lang)}
    </span>
  );
}

// pointer-driven 3D tilt (mouse only)
function tilt(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType === "touch" || prefersReducedMotion()) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--ry", `${(((e.clientX - r.left) / r.width - 0.5) * 12).toFixed(2)}deg`);
  el.style.setProperty("--rx", `${(-((e.clientY - r.top) / r.height - 0.5) * 12).toFixed(2)}deg`);
}
const untilt = (e: React.PointerEvent<HTMLElement>) => {
  e.currentTarget.style.setProperty("--rx", "0deg");
  e.currentTarget.style.setProperty("--ry", "0deg");
};

// ---------------------------------------------------------------------------
// FactStrip: always visible, nothing to load
// ---------------------------------------------------------------------------

const FACT_ICONS = [Smartphone, Languages, UserCheck, Receipt, FileSpreadsheet];

export function FactStrip({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const seen = useSeen<HTMLElement>(0.2);
  return (
    <section ref={seen} aria-label="Shop Brain at a glance" className="relative px-4 md:px-6 py-6 border-y border-border bg-muted/40">
      <style>{CSS}</style>
      <ul className="container mx-auto max-w-6xl flex flex-wrap justify-center gap-2.5 md:gap-3">
        {c.facts.map((f, i) => {
          const Icon = FACT_ICONS[i];
          return (
            <li key={f} className="tr-r" style={{ ["--d" as any]: `${i * 90}ms` }}>
              <span className="tr-fact">
                <Icon size={18} style={{ color: GREEN }} />
                {f}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// LiveProof: the big, visible, honest numbers band
// ---------------------------------------------------------------------------

export function LiveProof({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const stats = usePublicStats();
  const seen = useSeen<HTMLElement>(0.1);
  if (!stats) return null;

  const tiles = (
    [
      { k: "shops", v: stats.shops, min: MIN_SHOW.shops },
      { k: "activeShops", v: stats.activeShops, min: MIN_SHOW.activeShops },
      { k: "customers", v: stats.customers, min: MIN_SHOW.customers },
      { k: "collected30", v: stats.collected30, min: MIN_SHOW.collected },
      { k: "reminders", v: stats.reminders, min: MIN_SHOW.reminders },
      { k: "shops30", v: stats.shops30, min: MIN_SHOW.shops30 },
    ] as const
  ).filter((t) => t.v >= t.min);

  const showBig = stats.tracked >= MIN_SHOW.tracked;
  if (!showBig && tiles.length === 0) return null; // nothing worth showing yet: say nothing rather than something small

  const dailyMax = Math.max(1, ...stats.daily);
  const showChart = stats.daily.length > 1 && stats.daily.some((n) => n > 0);

  let sinceText = "";
  let updatedText = "";
  try {
    if (stats.since) sinceText = new Date(stats.since).toLocaleDateString(loc(lang), { month: "long", year: "numeric", timeZone: "Africa/Kigali" });
    updatedText = new Date(stats.updatedAt).toLocaleTimeString(loc(lang), { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kigali" });
  } catch {
    /* ignore formatting problems */
  }

  const rate = stats.deliveryRate;
  const off = rate === null ? 264 : 264 - (264 * Math.min(100, rate)) / 100;

  return (
    <section ref={seen} id="numbers" className="relative overflow-hidden py-20 md:py-28 px-4 md:px-6 text-white" style={{ background: `radial-gradient(120% 90% at 20% 0%, #2a3a7a 0%, ${INK} 48%, #0a0f26 100%)` }}>
      <style>{CSS}</style>
      <div className="tr-paper" aria-hidden />
      <div className="container mx-auto max-w-6xl relative">
        <div className="tr-r flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-white/85 mb-5">
          <span className="tr-dot" />
          {c.live}
          {sinceText && <span className="text-white/50 font-normal">· {c.since} {sinceText}</span>}
          {updatedText && <span className="text-white/40 font-normal">· {c.updated} {updatedText}</span>}
        </div>
        <h2 className="tr-r text-3xl md:text-6xl font-extrabold tracking-tight max-w-4xl mb-4 leading-[1.05]" style={{ ...DISPLAY, ["--d" as any]: "80ms" }}>
          {c.liveTitle}
        </h2>
        <p className="tr-r text-lg md:text-xl text-white/70 max-w-2xl mb-12" style={{ ["--d" as any]: "160ms" }}>
          {c.liveSub}
        </p>

        {showBig && (
          <div className="tr-r mb-10" style={{ ["--d" as any]: "240ms" }}>
            <div className="font-extrabold leading-none break-words" style={{ ...DISPLAY, color: SUN, fontSize: "clamp(2.8rem,10vw,7.5rem)", letterSpacing: "-.03em" }}>
              <Count to={stats.tracked} lang={lang} ms={2200} /> <span className="text-white/60" style={{ fontSize: ".35em", letterSpacing: 0 }}>RWF</span>
            </div>
            <p className="mt-3 text-lg md:text-xl text-white/80">{c.bigLabel}</p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] items-stretch">
          {/* tiles */}
          {tiles.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              {tiles.map((t, i) => (
                <div key={t.k} className="tr-r" style={{ ["--d" as any]: `${300 + i * 90}ms` }}>
                  <div className="tr-tilt h-full" onPointerMove={tilt} onPointerLeave={untilt}>
                    <div className="tr-tile" style={{ ["--d" as any]: `${300 + i * 90}ms` }}>
                      <div className="font-extrabold leading-none break-words" style={{ ...DISPLAY, color: SUN, fontSize: "clamp(1.8rem,4.5vw,2.8rem)" }}>
                        <Count to={t.v} lang={lang} />
                      </div>
                      <p className="mt-3 text-sm md:text-base text-white/75 leading-snug">{c.tiles[t.k]}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* chart + delivery ring */}
          {(showChart || rate !== null) && (
            <div className="tr-r" style={{ ["--d" as any]: "500ms" }}>
              <div className="tr-tilt h-full" onPointerMove={tilt} onPointerLeave={untilt}>
                <div className="tr-tile" style={{ ["--d" as any]: "500ms" }}>
                  {showChart && (
                    <>
                      <p className="font-bold text-white/90 mb-1" style={DISPLAY}>{c.chartTitle}</p>
                      <p className="text-xs text-white/50 mb-4">{c.chartNote}</p>
                      <div className="tr-bars" aria-hidden>
                        {stats.daily.map((n, i) => (
                          <div key={i} title={`${fmt(n, lang)} RWF`}>
                            <i style={{ height: `${Math.max(3, (n / dailyMax) * 100)}%`, opacity: n ? 1 : 0.25, ["--d" as any]: `${600 + i * 55}ms` }} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {rate !== null && (
                    <div className={`flex items-center gap-4 ${showChart ? "mt-6 pt-5 border-t border-white/10" : ""}`}>
                      <svg className="tr-ring shrink-0" width="84" height="84" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", ["--off" as any]: off }} aria-hidden>
                        <circle className="bg" cx="50" cy="50" r="42" />
                        <circle className="fg" cx="50" cy="50" r="42" />
                      </svg>
                      <p className="text-white/80 leading-snug">
                        <b className="text-3xl font-extrabold" style={{ ...DISPLAY, color: SUN }}>
                          {rate}%
                        </b>
                        <span className="block text-sm md:text-base">{c.delivery}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="tr-r mt-8" style={{ ["--d" as any]: "800ms" }}>
          <Link href="/trust" className="inline-flex items-center gap-2 font-semibold text-white/85 hover:text-white underline underline-offset-4 decoration-white/30">
            {c.privacy} <ArrowRight size={16} />
          </Link>
        </p>
      </div>
    </section>
  );
}

// kept so older imports keep working
export const LiveStats = LiveProof;

// ---------------------------------------------------------------------------
// TrustSection
// ---------------------------------------------------------------------------

const ICONS = [UserCheck, ShieldCheck, BellOff, Clock, Receipt, FileSpreadsheet];

export function TrustSection({ lang, botLink }: { lang: Lang; botLink: string }) {
  const c = COPY[lang];
  const seen = useSeen<HTMLElement>(0.08);
  return (
    <section ref={seen} id="trust" className="py-20 md:py-28 px-4 md:px-6">
      <style>{CSS}</style>
      <div className="container mx-auto max-w-6xl">
        <h2 className="tr-r text-3xl md:text-5xl font-extrabold tracking-tight max-w-3xl mb-3" style={{ ...DISPLAY, ["--d" as any]: "0ms" }}>
          {c.trustTitle}
        </h2>
        <p className="tr-r text-lg text-muted-foreground max-w-2xl mb-10" style={{ ["--d" as any]: "100ms" }}>
          {c.trustSub}
        </p>
        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {c.cards.map((card, i) => {
            const Icon = ICONS[i];
            return (
              <li key={card.t} className="tr-r" style={{ ["--d" as any]: `${160 + (i % 3) * 100 + Math.floor(i / 3) * 80}ms` }}>
                <div data-drum className="h-full">
                  <div className="tr-card">
                    <span className="tr-ico" aria-hidden>
                      <Icon size={24} />
                    </span>
                    <h3 className="text-xl font-bold leading-snug mt-5 mb-2" style={DISPLAY}>
                      {card.t}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">{card.d}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="tr-r mt-10 flex flex-wrap items-center gap-4" style={{ ["--d" as any]: "600ms" }}>
          <a
            href={botLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-semibold text-white text-lg shadow-lg shadow-black/10 hover:brightness-110 active:scale-[0.98] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: GREEN }}
          >
            <MessageCircle size={20} /> {c.cta}
          </a>
          <Link href="/trust" className="inline-flex items-center gap-2 font-semibold underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground">
            {c.more} <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}