import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Menu, X, ArrowRight, Shield, Users, MapPin, Mail, Phone, MessageCircle, ClipboardList, Bell, CheckCircle2, LockKeyhole, Instagram, ChevronDown, Check, Sun, Moon } from "lucide-react";

// The bot number — this is what the QR code and Get Started button send
// people to, since that's the actual ShopBrain system.
const WHATSAPP_BUSINESS_NUMBER = "250788669259"; // no + or leading zero, used for wa.me links

// Sam's personal/support line — shown separately (footer/contact) for
// anyone who has questions or gets confused before/after messaging the bot.
//
// ⚠️ CHECK THIS: the old file linked to 250795120043 but *displayed*
// +250 799 627 713 in the contact section and footer. They are different
// numbers. Set the correct one here — the display text is now derived from
// this constant, so the link and the visible number can never drift apart.
const SUPPORT_NUMBER = "250795120043";

const INSTAGRAM_URL = "https://www.instagram.com/shopbrain_kigali";

const CONTACT_EMAIL = "Ndayiragijesamuelprince@gmail.com";
const CONTACT_ADDRESS = "Kigese, Ruyenzi, Southern 0000, Rwanda";
const CONTACT_ADDRESS_SHORT = "Kigese, Ruyenzi, Rwanda";

// Turns "250795120043" into "+250 795 120 043" so the number shown on the
// page is always the number the wa.me link actually opens.
function formatRwandaNumber(digits: string): string {
  const m = digits.match(/^(\d{3})(\d{3})(\d{3})(\d{3})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${digits}`;
}

const SUPPORT_NUMBER_DISPLAY = formatRwandaNumber(SUPPORT_NUMBER);

// ---------------------------------------------------------------------------
// Theme (light / dark)
// ---------------------------------------------------------------------------

type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "shopbrain-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggleTheme };
}

function ThemeToggle({ theme, toggleTheme, isScrolled }: { theme: Theme; toggleTheme: () => void; isScrolled: boolean }) {
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-md border transition-colors ${
        isScrolled
          ? "border-border text-muted-foreground hover:text-primary hover:bg-muted"
          : "border-white/40 text-white/90 hover:text-white hover:bg-white/10 drop-shadow-sm"
      }`}
      data-testid="button-theme-toggle"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

type Lang = "rw" | "en" | "fr";

const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "rw", label: "Kinyarwanda", flag: "🇷🇼" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
];

const copy: Record<Lang, {
  nav: { about: string; how: string; getStarted: string; contact: string; privacy: string; admin: string };
  hero: { title: string; body: string; cta: string; learnMore: string };
  getStarted: { eyebrow: string; title: string; body: string; scanTitle: string; scanBody: string };
  about: { eyebrow: string; title: string; body: string };
  steps: { title: string; desc: string }[];
  contact: { eyebrow: string; title: string; body: string; questions: string; questionsNote: string; email: string; address: string };
  form: { title: string; body: string; name: string; namePh: string; phone: string; phonePh: string; type: string; message: string; messagePh: string; submit: string };
  businessTypes: string[];
  privacy: { title: string };
  footer: { tagline: string; explore: string; contactHeading: string; builtIn: string };
}> = {
  rw: {
    nav: { about: "Ibiranga", how: "Uko Bikora", getStarted: "Tangira", contact: "Twandikire", privacy: "Ibanga", admin: "Ubuyobozi" },
    hero: {
      title: "Genzura imyenda y'abakiriya ukoresheje WhatsApp.",
      body: "Shop Brain ikora ibikoresho by'ubucuruzi binyuze mu butumwa, bifasha abanyabucuruzi bato n'abadafite gahunda igenga kugenzura imyenda, kohereza inyibutsa z'ubwishyu, no gucunga umubano n'abakiriya — byose biboneka kuri WhatsApp.",
      cta: "Tangira",
      learnMore: "Menya Byinshi",
    },
    getStarted: {
      eyebrow: "Tangira",
      title: "Koresha kode uganire, cyangwa umenye byinshi.",
      body: "Nta porogaramu ukeneye gushyiramo. Hitamo kimwe hepfo utangire mu masegonda make.",
      scanTitle: "Koresha kode uganire na Shop Brain",
      scanBody: "Ifungura ikiganiro cya WhatsApp n'itsinda ryacu ako kanya.",
    },
    about: {
      eyebrow: "Ibyerekeye Shop Brain",
      title: "Igikoresho gifatika ku bucuruzi nyabwo.",
      body: "Shop Brain ni igikoresho cyo kugenzura imyenda binyuze kuri WhatsApp, cyakorewe abanyabucuruzi bato. Turazi ko gucunga ubucuruzi bisaba umwanya, ni yo mpamvu twakoze igisubizo cyinjira mu mikorere yawe ya buri munsi. Gikora mu Cyongereza no mu Kinyarwanda.",
    },
    steps: [
      { title: "Andikira Roboti", desc: "Ohereza ubutumwa kuri Shop Brain kuri WhatsApp nk'uko wandikira undi muntu — nta gushyiramo, nta kwiyandikisha." },
      { title: "Ongeraho Umwenda", desc: "Andika icyo umukiriya abereyemo mu masegonda make, uri mu kiganiro." },
      { title: "Roboti Yohereza Inyibutsa", desc: "Shop Brain ikurikirana ku bwayo, mu Cyongereza cyangwa mu Kinyarwanda." },
      { title: "Umukiriya Yishyura", desc: "Shyira ko umwenda wishyuwe, konti yawe ihite ivugurura." },
    ],
    contact: {
      eyebrow: "Twandikire",
      title: "Turi hano kugira ngo dufashe ubucuruzi bwawe gukura.",
      body: "Niba ufite ibibazo ku miterere ya Shop Brain mu iduka ryawe, cyangwa ukeneye ubufasha kuri konti yawe, itsinda ryacu riteguye kugufasha.",
      questions: "Ibibazo? Twandikire ako kanya",
      questionsNote: "Kubufasha n'ibibazo — ntabwo ari roboti ya ShopBrain ubwayo.",
      email: "Imeyili",
      address: "Aderesi",
    },
    form: {
      title: "Saba Kwinjira",
      body: "Ohereza amakuru yawe, hazafungura ikiganiro kuri WhatsApp cyuzuyemo icyo usaba.",
      name: "Amazina Yombi",
      namePh: "Amazina yawe",
      phone: "Numero ya Telefone",
      phonePh: "Numero yawe ya WhatsApp",
      type: "Ubwoko bw'Ubucuruzi",
      message: "Ubutumwa (si ngombwa)",
      messagePh: "Ikindi wifuza kutumenyesha?",
      submit: "Ohereza kuri WhatsApp",
    },
    businessTypes: ["Iduka / Uduka", "Salon / Umucuzi", "Imyenda", "Farumasi", "Resitora / Bar", "Ikindi"],
    privacy: { title: "Politiki y'Ibanga" },
    footer: {
      tagline: "Igikoresho cyo kugenzura imyenda kuri WhatsApp, cyakorewe abanyabucuruzi bato mu Rwanda. Nta porogaramu — andika gusa utangire.",
      explore: "Reba",
      contactHeading: "Twandikire",
      builtIn: "Byakozwe i Kigali 🇷🇼",
    },
  },
  en: {
    nav: { about: "About", how: "How it Works", getStarted: "Get Started", contact: "Contact", privacy: "Privacy", admin: "Admin" },
    hero: {
      title: "Manage customer debts through WhatsApp.",
      body: "Shop Brain builds messaging-based business management tools that help small and informal shop owners in Rwanda track debts, send payment reminders, and manage customer relationships — accessible directly through WhatsApp.",
      cta: "Get Started",
      learnMore: "Learn More",
    },
    getStarted: {
      eyebrow: "Get Started",
      title: "Scan to chat, or scan to learn more.",
      body: "No app to install. Choose one below to get going in seconds.",
      scanTitle: "Scan to chat with Shop Brain",
      scanBody: "Opens a WhatsApp chat with our team directly.",
    },
    about: {
      eyebrow: "About Shop Brain",
      title: "A practical tool for real businesses.",
      body: "Shop Brain is a WhatsApp-based debt tracking tool designed specifically for small shop owners. We understand that running a business is demanding, so we built a solution that fits seamlessly into your daily routine. It works in both English and Kinyarwanda.",
    },
    steps: [
      { title: "Text the Bot", desc: "Message Shop Brain on WhatsApp like you would any contact — no install, no login." },
      { title: "Add Customer Debt", desc: "Record what a customer owes in seconds, right inside the chat." },
      { title: "Bot Sends Reminder", desc: "Shop Brain follows up automatically, in English or Kinyarwanda." },
      { title: "Customer Pays", desc: "Mark the debt as paid and your balance updates instantly." },
    ],
    contact: {
      eyebrow: "Get in Touch",
      title: "We're here to help you grow.",
      body: "Whether you have questions about setting up Shop Brain for your store, or need support with your account, our team is ready to assist you.",
      questions: "Questions? Message us directly",
      questionsNote: "For support and questions — not the ShopBrain bot itself.",
      email: "Email",
      address: "Address",
    },
    form: {
      title: "Request Access",
      body: "Submit your details and we'll open a WhatsApp chat pre-filled with your request.",
      name: "Full Name",
      namePh: "Your name",
      phone: "Phone Number",
      phonePh: "Your WhatsApp number",
      type: "Business Type",
      message: "Message (optional)",
      messagePh: "Anything else we should know?",
      submit: "Send via WhatsApp",
    },
    businessTypes: ["Grocery / Shop", "Salon / Barber", "Boutique / Clothing", "Pharmacy", "Restaurant / Bar", "Other"],
    privacy: { title: "Privacy Policy" },
    footer: {
      tagline: "A WhatsApp-based debt tracking tool built for small shop owners in Rwanda. No app to install — just message and go.",
      explore: "Explore",
      contactHeading: "Contact",
      builtIn: "Built in Kigali 🇷🇼",
    },
  },
  fr: {
    nav: { about: "À propos", how: "Comment ça marche", getStarted: "Commencer", contact: "Contact", privacy: "Confidentialité", admin: "Admin" },
    hero: {
      title: "Gérez les dettes de vos clients via WhatsApp.",
      body: "Shop Brain conçoit des outils de gestion par messagerie qui aident les petits commerçants et boutiques informelles du Rwanda à suivre les dettes, envoyer des rappels de paiement et gérer la relation client — le tout directement sur WhatsApp.",
      cta: "Commencer",
      learnMore: "En savoir plus",
    },
    getStarted: {
      eyebrow: "Commencer",
      title: "Scannez pour discuter, ou pour en savoir plus.",
      body: "Aucune application à installer. Choisissez une option ci-dessous pour démarrer en quelques secondes.",
      scanTitle: "Scannez pour discuter avec Shop Brain",
      scanBody: "Ouvre directement une conversation WhatsApp avec notre équipe.",
    },
    about: {
      eyebrow: "À propos de Shop Brain",
      title: "Un outil pratique pour de vrais commerces.",
      body: "Shop Brain est un outil de suivi des dettes basé sur WhatsApp, conçu spécifiquement pour les petits commerçants. Nous savons que gérer un commerce demande du temps, c'est pourquoi nous avons conçu une solution qui s'intègre à votre routine quotidienne. Disponible en anglais et en kinyarwanda.",
    },
    steps: [
      { title: "Écrivez au bot", desc: "Envoyez un message à Shop Brain sur WhatsApp comme à n'importe quel contact — aucune installation, aucune connexion." },
      { title: "Ajoutez une dette", desc: "Enregistrez ce qu'un client vous doit en quelques secondes, directement dans la conversation." },
      { title: "Le bot envoie un rappel", desc: "Shop Brain relance automatiquement, en anglais ou en kinyarwanda." },
      { title: "Le client paie", desc: "Marquez la dette comme payée et votre solde se met à jour instantanément." },
    ],
    contact: {
      eyebrow: "Contactez-nous",
      title: "Nous sommes là pour vous aider à grandir.",
      body: "Que vous ayez des questions sur la mise en place de Shop Brain pour votre commerce, ou besoin d'assistance pour votre compte, notre équipe est prête à vous aider.",
      questions: "Des questions ? Écrivez-nous directement",
      questionsNote: "Pour le support et les questions — pas le bot ShopBrain lui-même.",
      email: "E-mail",
      address: "Adresse",
    },
    form: {
      title: "Demander l'accès",
      body: "Envoyez vos informations et nous ouvrirons une discussion WhatsApp pré-remplie avec votre demande.",
      name: "Nom complet",
      namePh: "Votre nom",
      phone: "Numéro de téléphone",
      phonePh: "Votre numéro WhatsApp",
      type: "Type de commerce",
      message: "Message (facultatif)",
      messagePh: "Autre chose à nous signaler ?",
      submit: "Envoyer via WhatsApp",
    },
    businessTypes: ["Épicerie / Boutique", "Salon / Coiffeur", "Boutique de vêtements", "Pharmacie", "Restaurant / Bar", "Autre"],
    privacy: { title: "Politique de confidentialité" },
    footer: {
      tagline: "Un outil de suivi des dettes basé sur WhatsApp, conçu pour les petits commerçants du Rwanda. Aucune application — écrivez et c'est parti.",
      explore: "Explorer",
      contactHeading: "Contact",
      builtIn: "Conçu à Kigali 🇷🇼",
    },
  },
};

// ---------------------------------------------------------------------------
// Reveal-on-scroll helper
// ---------------------------------------------------------------------------

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Language selector
// ---------------------------------------------------------------------------

function LanguageSelector({ lang, setLang, isScrolled }: { lang: Lang; setLang: (l: Lang) => void; isScrolled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = LANGUAGES.find((l) => l.code === lang)!;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
          isScrolled
            ? "border-border hover:bg-muted"
            : "border-white/40 text-white/90 hover:text-white hover:bg-white/10 drop-shadow-sm"
        }`}
        aria-label="Select language"
        data-testid="button-language-selector"
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
              data-testid={`option-language-${l.code}`}
            >
              <span className="text-base leading-none">{l.flag}</span>
              <span className="flex-1">{l.label}</span>
              {l.code === lang && <Check size={14} className="text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full-bleed hero background
// ---------------------------------------------------------------------------

// Background photos for the hero.
//
// These live in website/public/images/, which Vite copies to the site root
// as-is. Files in public/ are NOT modules — importing them (the old
// `import heroImage1 from "@assets/images/shop-hero.jpg"` lines) fails the
// build because the path resolves to nothing. Reference them by URL instead,
// exactly like the QR code below does.
//
// To add a photo: drop the file in website/public/images/ and add its
// filename to this array.
const HERO_IMAGE_FILES = ["shop-hero.jpg", "shop-hero-2.jpg", "shop-hero-3.jpg"];
const HERO_IMAGES = HERO_IMAGE_FILES.map((f) => `${import.meta.env.BASE_URL}images/${f}`);
const HERO_IMAGE_DURATION_MS = 5000;

// Crossfading full-bleed background used behind the hero's text. Renders as
// a stack of absolutely-positioned divs with a CSS background-image (same
// technique as a standard full-bleed hero), each fading in/out in turn.
function HeroBackground() {
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || HERO_IMAGES.length <= 1) return;
    const id = setInterval(() => {
      setImgIdx((i) => (i + 1) % HERO_IMAGES.length);
    }, HERO_IMAGE_DURATION_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {HERO_IMAGES.map((src, idx) => (
        <div
          key={src}
          aria-hidden={idx !== imgIdx}
          className={`absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${idx === imgIdx ? "opacity-100" : "opacity-0"}`}
          style={{ backgroundImage: `url('${src}')` }}
        />
      ))}
      {/* Dark overlay for text contrast, sits above the photos but below content.
          Using z-0 (not -z-10): the hero <section> below has no z-index of its
          own, so a negative z-index here escapes past it and renders behind
          the page's opaque background instead of behind just the hero text —
          that's what was causing the white-on-white "blank" hero. */}
      <div className="absolute inset-0 z-0 bg-gray-950/70" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("rw");
  const { theme, toggleTheme } = useTheme();

  const t = copy[lang];

  const navLinks = [
    { name: t.nav.about, href: "#about" },
    { name: t.nav.how, href: "#how-it-works" },
    { name: t.nav.getStarted, href: "#get-started" },
    { name: t.nav.contact, href: "#contact" },
    { name: t.nav.privacy, href: "#privacy" },
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const element = document.querySelector(href);
    if (element) {
      const top = element.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background font-sans text-foreground">
      {/* Header */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${isScrolled ? "bg-background/95 backdrop-blur-md shadow-sm py-3" : "bg-transparent py-5"}`}>
        <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
          <a href="#hero" onClick={(e) => scrollToSection(e, "#hero")} className="text-2xl font-bold font-display tracking-tight text-primary">
            Shop Brain
          </a>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => scrollToSection(e, link.href)}
                className={`text-sm font-medium transition-colors ${
                  isScrolled
                    ? "text-muted-foreground hover:text-primary"
                    : "text-white/90 hover:text-white drop-shadow-sm"
                }`}
              >
                {link.name}
              </a>
            ))}
            <Link
              href="/admin"
              className={`inline-flex items-center gap-1.5 text-sm font-medium rounded-md px-3 py-1.5 border transition-colors ${
                isScrolled
                  ? "text-muted-foreground hover:text-primary border-border"
                  : "text-white/90 hover:text-white border-white/40 drop-shadow-sm"
              }`}
              data-testid="link-admin"
            >
              <LockKeyhole size={14} /> {t.nav.admin}
            </Link>
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} isScrolled={isScrolled} />
            <LanguageSelector lang={lang} setLang={setLang} isScrolled={isScrolled} />
          </nav>

          {/* Mobile: theme toggle + language selector + menu toggle */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} isScrolled={isScrolled} />
            <LanguageSelector lang={lang} setLang={setLang} isScrolled={isScrolled} />
            <button
              className={isScrolled ? "p-2 text-foreground" : "p-2 text-white drop-shadow-sm"}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-background pt-20 px-4 md:hidden">
          <nav className="flex flex-col gap-6 p-4">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => scrollToSection(e, link.href)}
                className="text-lg font-medium text-foreground py-2 border-b border-border/50"
              >
                {link.name}
              </a>
            ))}
            <Link
              href="/admin"
              className="flex items-center gap-2 text-lg font-medium text-foreground py-2 border-b border-border/50"
            >
              <LockKeyhole size={18} /> {t.nav.admin}
            </Link>
          </nav>
        </div>
      )}

      <main className="flex-1">
        {/* Hero Section — full-bleed background photo, text overlaid on top */}
        <section id="hero" className="relative w-full min-h-screen flex items-center overflow-hidden bg-gray-950">
          <HeroBackground />

          <div className="relative z-10 w-full pt-28 md:pt-16 pb-16 px-4 md:px-6">
            <div className="container mx-auto max-w-6xl space-y-8 animate-in slide-in-from-bottom-8 duration-700 fade-in">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-[1.1] text-white max-w-3xl">
                {t.hero.title}
              </h1>
              <p className="text-lg md:text-xl text-white/90 leading-relaxed max-w-2xl">
                {t.hero.body}
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-4">
                <a
                  href="#get-started"
                  onClick={(e) => scrollToSection(e, "#get-started")}
                  className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:bg-primary/90 transition-colors shadow-sm"
                >
                  {t.hero.cta} <ArrowRight size={18} />
                </a>
                <a
                  href="#about"
                  onClick={(e) => scrollToSection(e, "#about")}
                  className="inline-flex items-center justify-center px-6 py-3 rounded-md font-medium text-white hover:bg-white/10 transition-colors border border-white/30"
                >
                  {t.hero.learnMore}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Get Started / QR Section */}
        <section id="get-started" className="py-20 md:py-28 bg-card px-4 md:px-6 border-y border-border">
          <div className="container mx-auto max-w-5xl">
            <Reveal className="max-w-2xl mx-auto text-center mb-12">
              <h2 className="text-sm font-bold tracking-wider text-primary uppercase mb-3">{t.getStarted.eyebrow}</h2>
              <h3 className="text-3xl md:text-4xl font-display font-bold mb-4">{t.getStarted.title}</h3>
              <p className="text-lg text-muted-foreground leading-relaxed">{t.getStarted.body}</p>
            </Reveal>

            <Reveal className="max-w-sm mx-auto" delay={150}>
              {/* WhatsApp QR */}
              <div className="bg-background rounded-2xl border border-border shadow-sm p-6 flex flex-col items-center text-center">
                <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-xl overflow-hidden border border-border mb-5 bg-white">
                  <img
                    src={`${import.meta.env.BASE_URL}images/qr-whatsapp.png`}
                    alt="QR code to chat with Shop Brain on WhatsApp"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex items-center gap-2 text-primary font-bold mb-2">
                  <MessageCircle size={20} />
                  <span>{t.getStarted.scanTitle}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">{t.getStarted.scanBody}</p>
                <a
                  href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline break-all"
                  data-testid="link-whatsapp-fallback"
                >
                  wa.me/{WHATSAPP_BUSINESS_NUMBER}
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* About / How it Works Section */}
        <section id="about" className="py-20 md:py-32 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl">
            <Reveal className="max-w-3xl mb-16">
              <h2 className="text-sm font-bold tracking-wider text-primary uppercase mb-3">{t.about.eyebrow}</h2>
              <h3 className="text-3xl md:text-4xl font-display font-bold mb-6">{t.about.title}</h3>
              <p className="text-lg text-muted-foreground leading-relaxed">{t.about.body}</p>
            </Reveal>

            <div id="how-it-works" className="mt-12">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {t.steps.map((item, idx) => {
                  const icons = [MessageCircle, ClipboardList, Bell, CheckCircle2];
                  const Icon = icons[idx];
                  return (
                    <Reveal key={item.title} delay={idx * 120}>
                      <div className="relative bg-card p-6 rounded-xl border border-border shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 h-full">
                        <span className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shadow-sm">
                          {idx + 1}
                        </span>
                        <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-5">
                          <Icon size={22} />
                        </div>
                        <h4 className="text-lg font-bold mb-2 font-display">{item.title}</h4>
                        <p className="text-muted-foreground leading-relaxed text-sm">{item.desc}</p>
                        {idx < 3 && (
                          <ArrowRight className="hidden lg:block absolute top-1/2 -right-4 -translate-y-1/2 text-border" size={20} />
                        )}
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section id="contact" className="py-20 md:py-32 bg-card px-4 md:px-6 border-y border-border">
          <div className="container mx-auto max-w-6xl grid md:grid-cols-2 gap-16 items-center">
            <Reveal>
              <h2 className="text-sm font-bold tracking-wider text-primary uppercase mb-3">{t.contact.eyebrow}</h2>
              <h3 className="text-3xl md:text-4xl font-display font-bold mb-6">{t.contact.title}</h3>
              <p className="text-lg text-muted-foreground leading-relaxed mb-10">{t.contact.body}</p>

              <div className="space-y-8">
                <div className="flex items-start gap-4">
                  <div className="mt-1 bg-primary/10 p-3 rounded-lg text-primary">
                    <Phone size={24} />
                  </div>
                  <div>
                    <h5 className="font-bold text-lg">{t.contact.questions}</h5>
                    <a
                      href={`https://wa.me/${SUPPORT_NUMBER}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-muted-foreground hover:text-primary transition-colors mt-1 text-lg"
                      data-testid="link-contact-whatsapp"
                    >
                      {SUPPORT_NUMBER_DISPLAY}
                    </a>
                    <p className="text-sm text-muted-foreground mt-1">{t.contact.questionsNote}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="mt-1 bg-primary/10 p-3 rounded-lg text-primary">
                    <Mail size={24} />
                  </div>
                  <div>
                    <h5 className="font-bold text-lg">{t.contact.email}</h5>
                    <a
                      href={`mailto:${CONTACT_EMAIL}`}
                      className="block text-muted-foreground hover:text-primary transition-colors mt-1 text-lg break-all"
                    >
                      {CONTACT_EMAIL}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="mt-1 bg-primary/10 p-3 rounded-lg text-primary">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <h5 className="font-bold text-lg">{t.contact.address}</h5>
                    <p className="text-muted-foreground mt-1 text-lg">{CONTACT_ADDRESS}</p>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={150} className="bg-background p-8 md:p-10 rounded-2xl border border-border shadow-xl">
              <h4 className="text-xl font-bold font-display mb-1">{t.form.title}</h4>
              <p className="text-sm text-muted-foreground mb-6">{t.form.body}</p>
              <RequestAccessForm t={t.form} businessTypes={t.businessTypes} />
            </Reveal>
          </div>
        </section>

        {/* Privacy Policy */}
        <section id="privacy" className="py-20 bg-muted px-4 md:px-6">
          <Reveal className="container mx-auto max-w-4xl bg-card p-8 md:p-12 rounded-2xl border border-border shadow-sm">
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-8 text-foreground flex items-center gap-3">
              <Shield className="text-primary" /> {t.privacy.title}
            </h2>
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p>Shop Brain Ltd collects WhatsApp phone numbers and customer debt records on behalf of shop owners.</p>
              <p>All data is stored securely and is only accessible to the authorised shop owner.</p>
              <p>Shop Brain Ltd does not sell, share, or transfer customer data to any third party.</p>
              <p>Data is retained as long as the shop owner uses the service.</p>
              <p>WhatsApp messages sent to Shop Brain are processed to extract commands (e.g. ADD, PAID, customer lookup) and are not stored beyond what is needed to fulfil the request.</p>
              <div className="mt-8 p-6 bg-background rounded-xl border border-border">
                <p className="font-medium text-foreground mb-2">For data deletion requests, contact:</p>
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline font-medium text-lg break-all">{CONTACT_EMAIL}</a>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Footer — hardcoded pitch-black regardless of light/dark theme,
          rather than bg-foreground/text-background, since those CSS
          variables don't reliably resolve to black/white on this site. */}
      <footer className="bg-black text-white pt-16 pb-8 px-4 md:px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-white/10">
            {/* Brand */}
            <div className="lg:col-span-2">
              <div className="text-2xl font-bold font-display tracking-tight text-white mb-3">
                Shop Brain
              </div>
              <p className="text-white/60 leading-relaxed max-w-sm mb-6">{t.footer.tagline}</p>
              <div className="flex items-center gap-3">
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Shop Brain on Instagram"
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-primary hover:scale-110 transition-all duration-300"
                  data-testid="link-instagram"
                >
                  <Instagram size={18} />
                </a>
                <a
                  href={`https://wa.me/${SUPPORT_NUMBER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Message Shop Brain support on WhatsApp"
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-primary hover:scale-110 transition-all duration-300"
                  data-testid="link-footer-whatsapp"
                >
                  <MessageCircle size={18} />
                </a>
              </div>
            </div>

            {/* Quick links */}
            <div>
              <h6 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4">{t.footer.explore}</h6>
              <ul className="space-y-3">
                {navLinks.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      onClick={(e) => scrollToSection(e, link.href)}
                      className="text-white/70 hover:text-white transition-colors"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h6 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4">{t.footer.contactHeading}</h6>
              <ul className="space-y-3 text-white/70">
                <li>
                  <a href={`https://wa.me/${SUPPORT_NUMBER}`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors break-all">
                    {SUPPORT_NUMBER_DISPLAY}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white transition-colors break-all">
                    {CONTACT_EMAIL}
                  </a>
                </li>
                <li className="text-white/60">{CONTACT_ADDRESS_SHORT}</li>
              </ul>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-white/50 text-sm">
              © {new Date().getFullYear()} Shop Brain Ltd — Registered in Rwanda.
            </p>
            <p className="text-white/50 text-sm">{t.footer.builtIn}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function RequestAccessForm({ t, businessTypes }: { t: typeof copy["en"]["form"]; businessTypes: string[] }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessType, setBusinessType] = useState(businessTypes[0]);
  const [message, setMessage] = useState("");

  // Business types are translated, so the selected value becomes stale when
  // the visitor switches language mid-form. Reset to the first option of the
  // new list so we never submit a label from the previous language.
  useEffect(() => {
    setBusinessType(businessTypes[0]);
  }, [businessTypes]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const text = [
      "Hi Shop Brain, I'd like to request access.",
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Business type: ${businessType}`,
      message ? `Message: ${message}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const url = `https://wa.me/${SUPPORT_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">{t.name}</label>
        <input
          type="text"
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
          placeholder={t.namePh}
          data-testid="input-request-name"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="phone" className="text-sm font-medium">{t.phone}</label>
        <input
          type="tel"
          id="phone"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
          placeholder={t.phonePh}
          data-testid="input-request-phone"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="business-type" className="text-sm font-medium">{t.type}</label>
        <select
          id="business-type"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
          data-testid="select-request-business-type"
        >
          {businessTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="message" className="text-sm font-medium">{t.message}</label>
        <textarea
          id="message"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow resize-none"
          placeholder={t.messagePh}
          data-testid="input-request-message"
        ></textarea>
      </div>
      <button
        type="submit"
        className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-md font-bold text-lg hover:bg-primary/90 transition-colors shadow-sm"
        data-testid="button-request-access"
      >
        <MessageCircle size={20} /> {t.submit}
      </button>
    </form>
  );
}