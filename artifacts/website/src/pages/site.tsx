import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Check, ChevronDown, Instagram, Menu, MessageCircle, Moon, Sun, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Config. Change contact details and the price here, nowhere else.
// ---------------------------------------------------------------------------

// The bot. Every "Chat on WhatsApp" button opens this.
export const WHATSAPP_BUSINESS_NUMBER = "250788669259"; // digits only
// Your support line, shown in Contact and the footer.
// CHECK: the bot's Help message may use a different number. Pick one and use it everywhere.
export const SUPPORT_NUMBER = "250799627713";

export const CONTACT_EMAIL = "Ndayiragijesamuelprince@gmail.com";
export const CONTACT_ADDRESS = "Kigese, Ruyenzi, Southern 0000, Rwanda";
export const INSTAGRAM_URL = "https://www.instagram.com/shopbrain_kigali";
export const COMPANY_NAME = "Shop Brain Ltd";
export const FOUNDER_NAME = "Samuel Prince Ndayiragije"; // shown on the About page. Set to "" to hide it.

// Monthly price in RWF. Leave as null to show "a small monthly fee".
// Set a number (for example 3000) and every page shows "3,000 RWF per month" automatically.
export const MONTHLY_PRICE_RWF: number | null = null;

export const BOT_LINK = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}`;
export const SUPPORT_LINK = `https://wa.me/${SUPPORT_NUMBER}`;

function formatRwandaNumber(digits: string): string {
  const m = digits.match(/^(\d{3})(\d{3})(\d{3})(\d{3})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${digits}`;
}
export const SUPPORT_DISPLAY = formatRwandaNumber(SUPPORT_NUMBER);

// Brand colours
export const INK = "#1B2559"; // ledger-pen indigo
export const GREEN = "#0F7A3F"; // WhatsApp-family green, dark enough for white text
export const SUN = "#FFC933"; // yellow from the Rwandan flag

export const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;

// ---------------------------------------------------------------------------
// Storage (never throws, even in private mode)
// ---------------------------------------------------------------------------

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Theme and language
// ---------------------------------------------------------------------------

type Theme = "light" | "dark";
const THEME_KEY = "shopbrain-theme";

function getInitialTheme(): Theme {
  const stored = readStore(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    writeStore(THEME_KEY, theme);
  }, [theme]);
  return { theme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

export type Lang = "rw" | "en" | "fr";
const LANG_KEY = "shopbrain-lang";

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "rw", label: "Kinyarwanda", flag: "🇷🇼" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
];

export function useLang() {
  const [lang, setLang] = useState<Lang>(() => {
    const s = readStore(LANG_KEY);
    return s === "rw" || s === "en" || s === "fr" ? s : "rw";
  });
  useEffect(() => {
    writeStore(LANG_KEY, lang);
    document.documentElement.lang = lang; // keeps screen readers and browser translation correct
  }, [lang]);
  return [lang, setLang] as const;
}

// Sets the browser tab title and description, and starts each page at the top.
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [title, description]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
}

// ---------------------------------------------------------------------------
// Copy shared by every page (header, footer, price line, closing call to action)
// ---------------------------------------------------------------------------

export const common: Record<
  Lang,
  {
    nav: { home: string; features: string; pricing: string; about: string; contact: string; trust: string };
    footer: { product: string; company: string; reach: string };
    cta: string;
    privacy: string;
    terms: string;
    tagline: string;
    builtIn: string;
    registered: string;
    language: string;
    toLight: string;
    toDark: string;
    menu: string;
    close: string;
    freeMonth: string;
    after: string;
    afterPrice: string;
    ready: string;
    readyBody: string;
  }
> = {
  en: {
    nav: { home: "Home", features: "Features", pricing: "Pricing", about: "About", contact: "Contact", trust: "Trust and data" },
    footer: { product: "Product", company: "Company", reach: "Reach us" },
    cta: "Chat on WhatsApp",
    privacy: "Privacy Policy",
    terms: "Terms of Use",
    tagline: "A WhatsApp tool for small shop owners in Rwanda. No app to install. Just message and go.",
    builtIn: "Built in Kigali 🇷🇼",
    registered: "Registered in Rwanda.",
    language: "Select language",
    toLight: "Switch to light mode",
    toDark: "Switch to dark mode",
    menu: "Open menu",
    close: "Close menu",
    freeMonth: "1 month free",
    after: "After that, a small monthly fee.",
    afterPrice: "After that, {price} RWF per month.",
    ready: "Ready to try it?",
    readyBody: "Message Shop Brain on WhatsApp. Starting takes about a minute.",
  },
  rw: {
    nav: { home: "Ahabanza", features: "Ibikorwa", pricing: "Igiciro", about: "Abo turi bo", contact: "Twandikire", trust: "Icyizere n'amakuru" },
    footer: { product: "Igikoresho", company: "Ikigo", reach: "Tuvugishe" },
    cta: "Tangira kuri WhatsApp",
    privacy: "Politiki y'ibanga",
    terms: "Amabwiriza yo gukoresha",
    tagline: "Igikoresho cya WhatsApp cyakorewe abacuruzi bato mu Rwanda. Nta porogaramu. Andika gusa utangire.",
    builtIn: "Byakorewe i Kigali 🇷🇼",
    registered: "Cyanditswe mu Rwanda.",
    language: "Hitamo ururimi",
    toLight: "Hindukira ku rumuri",
    toDark: "Hindukira ku mwijima",
    menu: "Fungura menu",
    close: "Funga menu",
    freeMonth: "Ukwezi 1 k'ubuntu",
    after: "Nyuma, wishyura amafaranga make buri kwezi.",
    afterPrice: "Nyuma, wishyura {price} RWF buri kwezi.",
    ready: "Witeguye kugerageza?",
    readyBody: "Andikira Shop Brain kuri WhatsApp. Gutangira bifata nk'umunota umwe.",
  },
  fr: {
    nav: { home: "Accueil", features: "Fonctionnalités", pricing: "Tarif", about: "À propos", contact: "Contact", trust: "Confiance et données" },
    footer: { product: "Produit", company: "Société", reach: "Nous joindre" },
    cta: "Discuter sur WhatsApp",
    privacy: "Politique de confidentialité",
    terms: "Conditions d'utilisation",
    tagline: "Un outil WhatsApp pour les petits commerçants du Rwanda. Aucune application à installer. Écrivez et c'est parti.",
    builtIn: "Conçu à Kigali 🇷🇼",
    registered: "Société enregistrée au Rwanda.",
    language: "Choisir la langue",
    toLight: "Passer en mode clair",
    toDark: "Passer en mode sombre",
    menu: "Ouvrir le menu",
    close: "Fermer le menu",
    freeMonth: "1 mois gratuit",
    after: "Ensuite, un petit abonnement mensuel.",
    afterPrice: "Ensuite, {price} RWF par mois.",
    ready: "Prêt à essayer ?",
    readyBody: "Écrivez à Shop Brain sur WhatsApp. Démarrer prend environ une minute.",
  },
};

export function afterLine(lang: Lang): string {
  const c = common[lang];
  return MONTHLY_PRICE_RWF !== null ? c.afterPrice.replace("{price}", MONTHLY_PRICE_RWF.toLocaleString("en-US")) : c.after;
}

// ---------------------------------------------------------------------------
// Small pieces used by several pages
// ---------------------------------------------------------------------------

export const ctaClass =
  "inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-semibold text-white text-lg hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

export function PageHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <section className="px-4 md:px-6 py-14 md:py-20 border-b border-border bg-muted/40">
      <div className="container mx-auto max-w-5xl">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight max-w-3xl" style={DISPLAY}>
          {title}
        </h1>
        <p className="mt-4 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">{intro}</p>
      </div>
    </section>
  );
}

export function CtaBand({ lang }: { lang: Lang }) {
  const c = common[lang];
  return (
    <section className="px-4 md:px-6 py-16 text-white" style={{ background: INK }}>
      <div className="container mx-auto max-w-3xl text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3" style={DISPLAY}>
          {c.ready}
        </h2>
        <p className="text-lg text-white/75 mb-8">{c.readyBody}</p>
        <a href={`${BOT_LINK}?text=Hi`} target="_blank" rel="noopener noreferrer" className={ctaClass} style={{ background: GREEN }}>
          <MessageCircle size={20} /> {c.cta}
        </a>
      </div>
    </section>
  );
}

function ThemeToggle({ theme, toggleTheme, lang }: { theme: Theme; toggleTheme: () => void; lang: Lang }) {
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? common[lang].toLight : common[lang].toDark}
      className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function LanguageSelector({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = LANGUAGES.find((l) => l.code === lang)!;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-sm font-medium px-2.5 h-9 rounded-md border border-border hover:bg-muted"
        aria-label={common[lang].language}
        aria-expanded={open}
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-background border border-border rounded-md shadow-lg overflow-hidden z-50">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted text-left"
            >
              <span className="text-base leading-none">{l.flag}</span>
              <span className="flex-1">{l.label}</span>
              {l.code === lang && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell: header, footer. Every page is wrapped in this.
// (showNav is accepted so older pages like Legal.tsx keep working. It is ignored.)
// ---------------------------------------------------------------------------

export function Shell({
  lang,
  setLang,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  showNav?: boolean;
  children: React.ReactNode;
}) {
  const { theme, toggleTheme } = useTheme();
  const [loc] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const c = common[lang];

  useEffect(() => {
    setMenuOpen(false);
  }, [loc]);

  // Load the display font once, at runtime, so no CSS or HTML file has to change.
  useEffect(() => {
    if (document.getElementById("shopbrain-fonts")) return;
    const link = document.createElement("link");
    link.id = "shopbrain-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  const navLinks = [
    { name: c.nav.home, href: "/" },
    { name: c.nav.features, href: "/features" },
    { name: c.nav.pricing, href: "/pricing" },
    { name: c.nav.about, href: "/about" },
    { name: c.nav.contact, href: "/contact" },
  ];
  const isActive = (href: string) => (href === "/" ? loc === "/" : loc === href || loc.startsWith(href + "/"));

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <header className="fixed top-0 w-full z-50 bg-background border-b border-border">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="text-2xl font-extrabold tracking-tight" style={DISPLAY}>
            Shop Brain
          </Link>

          <nav className="hidden md:flex items-center gap-7" aria-label="Main">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={`text-sm font-medium py-1 border-b-2 ${
                  isActive(l.href) ? "text-foreground border-foreground" : "text-muted-foreground border-transparent hover:text-foreground"
                }`}
              >
                {l.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} lang={lang} />
            <LanguageSelector lang={lang} setLang={setLang} />
            <a
              href={`${BOT_LINK}?text=Hi`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-semibold text-white hover:brightness-110"
              style={{ background: GREEN }}
            >
              <MessageCircle size={16} /> {c.cta}
            </a>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? c.close : c.menu}
              aria-expanded={menuOpen}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md border border-border hover:bg-muted"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="md:hidden border-t border-border bg-background px-4 py-3" aria-label="Mobile">
            <ul>
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={isActive(l.href) ? "page" : undefined}
                    className={`block py-3 text-base font-medium border-b border-border ${isActive(l.href) ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
            <a
              href={`${BOT_LINK}?text=Hi`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 mb-1 w-full inline-flex items-center justify-center gap-2 h-11 rounded-full font-semibold text-white"
              style={{ background: GREEN }}
            >
              <MessageCircle size={18} /> {c.cta}
            </a>
          </nav>
        )}
      </header>

      <main className="flex-1 pt-16">{children}</main>

      <footer className="text-white pt-14 pb-8 px-4 md:px-6" style={{ background: "#0F1530" }}>
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.3fr] pb-10 border-b border-white/10">
            <div>
              <div className="text-2xl font-extrabold tracking-tight mb-3" style={DISPLAY}>
                Shop Brain
              </div>
              <p className="text-white/60 leading-relaxed max-w-sm mb-5">{c.tagline}</p>
              <div className="flex items-center gap-3">
                <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
                  <Instagram size={18} />
                </a>
                <a href={SUPPORT_LINK} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp support" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
                  <MessageCircle size={18} />
                </a>
              </div>
            </div>

            <div>
              <h3 className="font-bold mb-3">{c.footer.product}</h3>
              <ul className="space-y-2.5 text-white/70">
                <li>
                  <Link href="/features" className="hover:text-white">
                    {c.nav.features}
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-white">
                    {c.nav.pricing}
                  </Link>
                </li>
                <li>
                  <Link href="/trust" className="hover:text-white">
                    {c.nav.trust}
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-3">{c.footer.company}</h3>
              <ul className="space-y-2.5 text-white/70">
                <li>
                  <Link href="/about" className="hover:text-white">
                    {c.nav.about}
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-white">
                    {c.nav.contact}
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-white">
                    {c.privacy}
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-white">
                    {c.terms}
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold mb-3">{c.footer.reach}</h3>
              <ul className="space-y-2.5 text-white/70">
                <li>
                  <a href={SUPPORT_LINK} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                    {SUPPORT_DISPLAY}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white break-all">
                    {CONTACT_EMAIL}
                  </a>
                </li>
                <li className="text-white/60">{CONTACT_ADDRESS}</li>
              </ul>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-white/50 text-sm">
            <p>
              © {new Date().getFullYear()} {COMPANY_NAME}. {c.registered}
            </p>
            <p>{c.builtIn}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}