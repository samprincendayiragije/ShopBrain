import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Check, ChevronDown, Instagram, MessageCircle, Moon, Sun } from "lucide-react";

// ---------------------------------------------------------------------------
// Config. Change contact details and the price here, nowhere else.
// ---------------------------------------------------------------------------

// The bot. Every "Chat on WhatsApp" button opens this.
export const WHATSAPP_BUSINESS_NUMBER = "250788669259"; // digits only
// Your support line, shown in Contact and the footer.
// CHECK: the bot's Help message uses a different number (+250 795 120 043). Pick one and use it everywhere.
export const SUPPORT_NUMBER = "250799627713";

export const CONTACT_EMAIL = "Ndayiragijesamuelprince@gmail.com";
export const CONTACT_ADDRESS = "Kigese, Ruyenzi, Southern 0000, Rwanda";
export const INSTAGRAM_URL = "https://www.instagram.com/shopbrain_kigali";
export const COMPANY_NAME = "Shop Brain Ltd";

// Monthly price in RWF. Leave as null to show "a small monthly fee".
// Set a number (for example 3000) and the page shows "3,000 RWF / month" automatically.
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

// ---------------------------------------------------------------------------
// Copy shared by every page (header, footer)
// ---------------------------------------------------------------------------

export const common: Record<
  Lang,
  {
    nav: { how: string; price: string; faq: string; contact: string };
    cta: string;
    privacy: string;
    terms: string;
    tagline: string;
    builtIn: string;
    registered: string;
    language: string;
    toLight: string;
    toDark: string;
  }
> = {
  en: {
    nav: { how: "How it works", price: "Price", faq: "FAQ", contact: "Contact" },
    cta: "Chat on WhatsApp",
    privacy: "Privacy Policy",
    terms: "Terms of Use",
    tagline: "A WhatsApp tool for small shop owners in Rwanda. No app to install. Just message and go.",
    builtIn: "Built in Kigali 🇷🇼",
    registered: "Registered in Rwanda.",
    language: "Select language",
    toLight: "Switch to light mode",
    toDark: "Switch to dark mode",
  },
  rw: {
    nav: { how: "Uko bikora", price: "Igiciro", faq: "Ibibazo", contact: "Twandikire" },
    cta: "Tangira kuri WhatsApp",
    privacy: "Politiki y'ibanga",
    terms: "Amabwiriza yo gukoresha",
    tagline: "Igikoresho cya WhatsApp cyakorewe abacuruzi bato mu Rwanda. Nta porogaramu. Andika gusa utangire.",
    builtIn: "Byakorewe i Kigali 🇷🇼",
    registered: "Cyanditswe mu Rwanda.",
    language: "Hitamo ururimi",
    toLight: "Hindukira ku rumuri",
    toDark: "Hindukira ku mwijima",
  },
  fr: {
    nav: { how: "Comment ça marche", price: "Tarif", faq: "FAQ", contact: "Contact" },
    cta: "Discuter sur WhatsApp",
    privacy: "Politique de confidentialité",
    terms: "Conditions d'utilisation",
    tagline: "Un outil WhatsApp pour les petits commerçants du Rwanda. Aucune application à installer. Écrivez et c'est parti.",
    builtIn: "Conçu à Kigali 🇷🇼",
    registered: "Société enregistrée au Rwanda.",
    language: "Choisir la langue",
    toLight: "Passer en mode clair",
    toDark: "Passer en mode sombre",
  },
};

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export const ctaClass =
  "inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-semibold text-white text-lg shadow-lg shadow-black/10 hover:brightness-110 active:scale-[0.98] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

function ThemeToggle({ theme, toggleTheme, lang }: { theme: Theme; toggleTheme: () => void; lang: Lang }) {
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? common[lang].toLight : common[lang].toDark}
      className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
        className="inline-flex items-center gap-1.5 text-sm font-medium px-2.5 h-9 rounded-md border border-border hover:bg-muted transition-colors"
        aria-label={common[lang].language}
        aria-expanded={open}
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
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
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted transition-colors text-left"
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
// Shell: base styles, header, footer. Every page is wrapped in this.
// showNav = true on the home page (in-page links), false on legal pages.
// ---------------------------------------------------------------------------

const BASE_CSS = `
html{scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

export function Shell({
  lang,
  setLang,
  showNav,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  showNav: boolean;
  children: React.ReactNode;
}) {
  const { theme, toggleTheme } = useTheme();
  const c = common[lang];

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
    { name: c.nav.how, href: "#how" },
    { name: c.nav.price, href: "#price" },
    { name: c.nav.faq, href: "#faq" },
    { name: c.nav.contact, href: "#contact" },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <style>{BASE_CSS}</style>

      <header className="fixed top-0 w-full z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="text-2xl font-extrabold tracking-tight" style={DISPLAY}>
            Shop Brain
          </Link>

          {showNav && (
            <nav className="hidden md:flex items-center gap-6">
              {navLinks.map((l) => (
                <a key={l.href} href={l.href} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  {l.name}
                </a>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} lang={lang} />
            <LanguageSelector lang={lang} setLang={setLang} />
            <a
              href={`${BOT_LINK}?text=Hi`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-semibold text-white hover:brightness-110 transition"
              style={{ background: GREEN }}
            >
              <MessageCircle size={16} /> {c.cta}
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-16">{children}</main>

      <footer className="text-white pt-14 pb-8 px-4 md:px-6" style={{ background: "#0F1530" }}>
        <div className="container mx-auto max-w-5xl">
          <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr] pb-10 border-b border-white/10">
            <div>
              <div className="text-2xl font-extrabold tracking-tight mb-3" style={DISPLAY}>
                Shop Brain
              </div>
              <p className="text-white/60 leading-relaxed max-w-sm mb-5">{c.tagline}</p>
              <div className="flex items-center gap-3">
                <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                  <Instagram size={18} />
                </a>
                <a href={SUPPORT_LINK} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp support" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                  <MessageCircle size={18} />
                </a>
              </div>
            </div>

            <ul className="space-y-3">
              <li>
                <Link href="/privacy" className="text-white/70 hover:text-white transition-colors">
                  {c.privacy}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-white/70 hover:text-white transition-colors">
                  {c.terms}
                </Link>
              </li>
            </ul>

            <ul className="space-y-3 text-white/70">
              <li>
                <a href={SUPPORT_LINK} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                  {SUPPORT_DISPLAY}
                </a>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white transition-colors break-all">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li className="text-white/60">{CONTACT_ADDRESS}</li>
            </ul>
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