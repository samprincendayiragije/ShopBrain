import React, { useEffect, useRef, useState } from "react";
import { BellOff, Clock, FileSpreadsheet, MessageCircle, Receipt, ShieldCheck, UserCheck } from "lucide-react";
import { prefersReducedMotion } from "./motion";

// Two credibility sections for Home.tsx.
//
//   <LiveStats />     real numbers from GET /api/public/stats (see admin.ts).
//   <TrustSection />  six protections that already exist in the bot, nothing invented.
//
// FIX IN THIS VERSION: the blank section.
//   LiveStats renders nothing until its numbers arrive, so its element did not exist when
//   the old useSeen() ran. The effect only ran once, found no element, and never ran
//   again, so the section appeared but every line stayed at opacity 0 (a blank band).
//   useSeen() now returns a callback ref, so it starts watching the moment the element
//   actually appears.
//
// HONESTY RULES (these protect your credibility, do not remove them)
//   - LiveStats never invents or pads a number. If the API is down, slow, or a
//     number is still small, that tile is hidden. If fewer than two tiles qualify,
//     the whole section is not rendered.
//   - Thresholds are in MIN_SHOW below. Raise or lower them as you grow.
//   - The API returns totals only: no names, no phone numbers, no shop names.

const INK = "#1B2559";
const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;
const EASE = "cubic-bezier(.16,1,.3,1)";

// If the website and the API live on different hosts, set VITE_API_BASE
// (for example https://shop-brain-webhook--ndayiragijesamu.replit.app). Empty = same host.
const API_BASE: string = ((import.meta as any).env?.VITE_API_BASE as string | undefined) ?? "";

// A tile shows only when its value reaches this number.
export const MIN_SHOW = { shops: 5, customers: 50, tracked: 500_000, collected: 100_000, reminders: 100 };

type Lang = "rw" | "en" | "fr";
type Stats = {
  shops: number;
  customers: number;
  tracked: number;
  collected: number;
  reminders: number;
  since: string | null;
  updatedAt: string;
};

const CACHE_KEY = "sb-public-stats";
const CACHE_MS = 10 * 60 * 1000;

async function loadStats(signal: AbortSignal): Promise<Stats | null> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { at: number; body: Stats };
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
    const body: Stats = {
      shops: Number(j.shops) || 0,
      customers: Number(j.customers) || 0,
      tracked: Number(j.tracked) || 0,
      collected: Number(j.collected) || 0,
      reminders: Number(j.reminders) || 0,
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

const fmt = (n: number, lang: Lang) => {
  const s = Math.round(n).toLocaleString("en-US");
  return lang === "fr" ? s.replace(/,/g, "\u202f") : s;
};

const COPY = {
  en: {
    liveTitle: "Real numbers, straight from the system",
    liveSub: "These totals are read from the live Shop Brain database. We do not estimate them or round them up.",
    live: "Live",
    since: "Since",
    updated: "Updated",
    tiles: { shops: "shops use Shop Brain", customers: "customers tracked", tracked: "RWF of debt tracked", collected: "RWF of payments recorded", reminders: "reminders sent" },
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
  },
  rw: {
    liveTitle: "Imibare nyayo, ivuye muri sisitemu",
    liveSub: "Iyi migabane ifatwa muri database ya Shop Brain ikora ubu. Ntitwayikeka cyangwa ngo tuyongere.",
    live: "Ubu",
    since: "Kuva",
    updated: "Byavuguruwe",
    tiles: { shops: "amaduka akoresha Shop Brain", customers: "abakiriya babitswe", tracked: "RWF y'imyenda ikurikiranwa", collected: "RWF y'ubwishyu bwanditswe", reminders: "inyibutsa zoherejwe" },
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
  },
  fr: {
    liveTitle: "De vrais chiffres, tirés directement du système",
    liveSub: "Ces totaux sont lus dans la base de données Shop Brain en direct. Nous ne les estimons pas et ne les arrondissons pas à la hausse.",
    live: "En direct",
    since: "Depuis",
    updated: "Mis à jour",
    tiles: { shops: "commerces utilisent Shop Brain", customers: "clients suivis", tracked: "RWF de dettes suivies", collected: "RWF de paiements enregistrés", reminders: "rappels envoyés" },
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
  },
} as const;

const CSS = `
.tr-r{opacity:0;transform:translateY(22px);transition:opacity .7s ${EASE} var(--d,0ms),transform .8s ${EASE} var(--d,0ms)}
[data-in="1"] .tr-r{opacity:1;transform:none}
.tr-dot{width:.55rem;height:.55rem;border-radius:50%;background:#22c55e;animation:tr-pulse 1.8s ease-out infinite}
@keyframes tr-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.65)}100%{box-shadow:0 0 0 .6rem rgba(34,197,94,0)}}
.tr-tile{position:relative;overflow:hidden;border-radius:1.25rem;padding:1.4rem 1.3rem;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.tr-tile::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:${SUN};transform:scaleX(0);transform-origin:0 50%;transition:transform 1.2s ${EASE} calc(var(--d,0ms) + 300ms)}
[data-in="1"] .tr-tile::after{transform:scaleX(1)}
.tr-card{height:100%;border-radius:1.25rem;border:1px solid hsl(var(--border));background:hsl(var(--card));padding:1.5rem;transition:transform .35s ${EASE},border-color .35s,box-shadow .35s}
@media (hover:hover){.tr-card:hover{transform:translateY(-4px);border-color:rgba(15,122,63,.45);box-shadow:0 18px 40px -22px rgba(27,37,89,.45)}}
.tr-ico{width:3rem;height:3rem;border-radius:.9rem;display:flex;align-items:center;justify-content:center;background:rgba(15,122,63,.12);color:${GREEN}}
@media (prefers-reduced-motion:reduce){.tr-r{opacity:1;transform:none;transition:none}.tr-dot{animation:none}.tr-tile::after{transform:none;transition:none}}
`;

// Sets data-in="1" once, when the element is first on screen.
// Returns a CALLBACK REF (not a useRef), so it also works for sections that mount late,
// like LiveStats, which renders nothing until its data has loaded.
function useSeen<T extends HTMLElement>(threshold = 0.1) {
  const [el, setEl] = useState<T | null>(null);
  useEffect(() => {
    if (!el) return;
    const show = () => {
      el.dataset.in = "1";
    };
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      show();
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          show();
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, threshold]);
  return setEl;
}

// counts up once when it first becomes visible
function Count({ to, lang }: { to: number; lang: Lang }) {
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
        const p = Math.min(1, (now - t0) / 1600);
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
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to]);
  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {fmt(v, lang)}
    </span>
  );
}

// ---------------------------------------------------------------------------

export function LiveStats({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const [stats, setStats] = useState<Stats | null>(null);
  const seen = useSeen<HTMLElement>(0.1);

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

  if (!stats) return null;

  const tiles = (
    [
      { k: "shops", v: stats.shops, min: MIN_SHOW.shops, rwf: false },
      { k: "customers", v: stats.customers, min: MIN_SHOW.customers, rwf: false },
      { k: "tracked", v: stats.tracked, min: MIN_SHOW.tracked, rwf: true },
      { k: "collected", v: stats.collected, min: MIN_SHOW.collected, rwf: true },
      { k: "reminders", v: stats.reminders, min: MIN_SHOW.reminders, rwf: false },
    ] as const
  ).filter((t) => t.v >= t.min);

  if (tiles.length < 2) return null; // not enough to be impressive yet: say nothing rather than something small

  let sinceText = "";
  let updatedText = "";
  try {
    if (stats.since) sinceText = new Date(stats.since).toLocaleDateString(lang === "rw" ? "en-GB" : lang, { month: "long", year: "numeric", timeZone: "Africa/Kigali" });
    updatedText = new Date(stats.updatedAt).toLocaleTimeString(lang === "rw" ? "en-GB" : lang, { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kigali" });
  } catch {
    /* ignore formatting problems */
  }

  return (
    <section ref={seen} id="numbers" className="relative overflow-hidden py-16 md:py-24 px-4 md:px-6 text-white" style={{ background: `radial-gradient(120% 90% at 20% 0%, #243066 0%, ${INK} 50%, #0F1530 100%)` }}>
      <style>{CSS}</style>
      <div className="container mx-auto max-w-6xl relative">
        <div className="tr-r flex items-center gap-2 text-sm font-semibold text-white/80 mb-4" style={{ ["--d" as any]: "0ms" }}>
          <i className="tr-dot" />
          {c.live}
          {sinceText && <span className="text-white/50 font-normal">· {c.since} {sinceText}</span>}
        </div>
        <h2 className="tr-r text-3xl md:text-5xl font-extrabold tracking-tight max-w-3xl mb-3" style={{ ...DISPLAY, ["--d" as any]: "80ms" }}>
          {c.liveTitle}
        </h2>
        <p className="tr-r text-lg text-white/70 max-w-2xl mb-10" style={{ ["--d" as any]: "160ms" }}>
          {c.liveSub}
        </p>

        <div className={`grid gap-3 md:gap-4 grid-cols-2 ${tiles.length >= 4 ? "lg:grid-cols-4" : tiles.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {tiles.map((t, i) => (
            <div key={t.k} className="tr-r" style={{ ["--d" as any]: `${240 + i * 110}ms` }}>
              <div className="tr-tile h-full" style={{ ["--d" as any]: `${240 + i * 110}ms` }}>
                <div className="text-3xl md:text-4xl font-extrabold leading-none break-words" style={{ ...DISPLAY, color: SUN }}>
                  <Count to={t.v} lang={lang} />
                </div>
                <p className="mt-3 text-sm md:text-base text-white/75 leading-snug">{c.tiles[t.k]}</p>
              </div>
            </div>
          ))}
        </div>
        {updatedText && (
          <p className="tr-r mt-5 text-xs text-white/45" style={{ ["--d" as any]: "800ms" }}>
            {c.updated} {updatedText}
          </p>
        )}
      </div>
    </section>
  );
}

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
                <div className="tr-card">
                  <span className="tr-ico" aria-hidden>
                    <Icon size={24} />
                  </span>
                  <h3 className="text-xl font-bold leading-snug mt-5 mb-2" style={DISPLAY}>
                    {card.t}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">{card.d}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="tr-r mt-10" style={{ ["--d" as any]: "600ms" }}>
          <a
            href={botLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-semibold text-white text-lg shadow-lg shadow-black/10 hover:brightness-110 active:scale-[0.98] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: GREEN }}
          >
            <MessageCircle size={20} /> {c.cta}
          </a>
        </div>
      </div>
    </section>
  );
}