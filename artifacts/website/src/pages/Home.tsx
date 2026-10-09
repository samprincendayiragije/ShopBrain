import React, { useEffect, useState } from "react";
import { Menu, X, MessageCircle, Mail, Phone, MapPin, Instagram, ChevronDown, Check, Sun, Moon, Plus, Minus, Shield } from "lucide-react";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// The bot. QR code, hero button and sticky button all open this chat.
const WHATSAPP_BUSINESS_NUMBER = "250788669259"; // digits only, no + or leading zero

// Sam's support line. Shown in contact/footer and used by the request form.
// ⚠️ CHECK THIS NUMBER (the old file linked and displayed two different ones).
const SUPPORT_NUMBER = "250799627713";

const INSTAGRAM_URL = "https://www.instagram.com/shopbrain_kigali";
const CONTACT_EMAIL = "Ndayiragijesamuelprince@gmail.com"; // tip: a hello@yourdomain address looks more trustworthy
const CONTACT_ADDRESS = "Kigese, Ruyenzi, Southern 0000, Rwanda";
const CONTACT_ADDRESS_SHORT = "Kigese, Ruyenzi, Rwanda";

function formatRwandaNumber(digits: string): string {
  const m = digits.match(/^(\d{3})(\d{3})(\d{3})(\d{3})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${digits}`;
}
const SUPPORT_NUMBER_DISPLAY = formatRwandaNumber(SUPPORT_NUMBER);

// Brand colours (kept inline so no CSS file needs to change)
const INK = "#1B2559"; // ledger-pen indigo
const GREEN = "#0F7A3F"; // WhatsApp-family green, dark enough for white text
const SUN = "#FFC933"; // yellow from the Rwandan flag, used as a highlighter

const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;
const HAND = { fontFamily: "'Caveat', cursive" } as const;

// ---------------------------------------------------------------------------
// Theme
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
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);
  return { theme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

type Lang = "rw" | "en" | "fr";

const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "rw", label: "Kinyarwanda", flag: "🇷🇼" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
];

const en = {
  nav: { how: "How it works", pricing: "Pricing", faq: "FAQ", contact: "Contact", privacy: "Privacy" },
  hero: {
    title: "Know who owes you. Get paid sooner.",
    body: "Shop Brain keeps your customers' debts in WhatsApp. Add a debt in seconds, send reminders with one message, and see your total any time.",
    cta: "Chat on WhatsApp",
    more: "See how it works",
    note: "No app to install. First month free.",
  },
  chat: {
    msgs: [
      { from: "me", text: "ADD Jean 5000" },
      { from: "bot", text: "✅ Saved. Jean owes 5,000 RWF." },
      { from: "me", text: "TOTAL" },
      { from: "bot", text: "You are owed 48,500 RWF by 7 customers." },
      { from: "bot", text: "🔔 Reminder sent to Jean." },
    ],
  },
  problem: {
    title: "Still keeping debts in a notebook?",
    body: "Pages get lost. Customers forget. Chasing them takes time you would rather spend selling.",
    notebook: ["Jean – 5,000", "Mama K – 12,000 (?)", "Eric – paid? no…"],
    notebookNote: "Who paid? Who didn't?",
    afterTitle: "With Shop Brain",
    after: ["Every debt saved, including part payments", "Reminders sent for you, in Kinyarwanda or English", "Your total owed, in one message"],
  },
  how: { title: "Four steps, all inside WhatsApp" },
  steps: [
    { title: "Text the bot", desc: "Message Shop Brain on WhatsApp like any contact. No install, no login." },
    { title: "Add a customer's debt", desc: "Record what a customer owes in seconds, right inside the chat." },
    { title: "The bot sends a reminder", desc: "Shop Brain follows up for you, in English or Kinyarwanda." },
    { title: "The customer pays", desc: "Mark the debt as paid and your balance updates instantly." },
  ],
  pricing: {
    title: "Simple pricing",
    big: "1 month free",
    after: "After that, a small monthly fee.",
    features: ["Track each customer's debt, with part payments", "Remind one customer or everyone at once", "See your total owed any time", "Works in English and Kinyarwanda"],
    cta: "Start your free month",
  },
  faq: {
    title: "Questions shop owners ask",
    items: [
      { q: "Do I need to install an app?", a: "No. Shop Brain works inside WhatsApp, the app you already use." },
      { q: "Is my customers' data safe?", a: "Only you can see your shop's records. We never sell or share them." },
      { q: "Does it work in Kinyarwanda?", a: "Yes. The bot and the reminders work in Kinyarwanda and English." },
      { q: "Can my customers stop the reminders?", a: "Yes. Customers can opt out of reminders at any time." },
    ],
  },
  cta: { title: "Ready to stop chasing debts?", body: "Send one message and you are set up.", qr: "On a computer? Scan with your phone." },
  contact: {
    title: "Need a hand?",
    body: "Questions about setting up Shop Brain for your shop, or help with your account? Our team is ready.",
    support: "Message our support team",
    supportNote: "For support and questions, not the Shop Brain bot itself.",
    email: "Email",
    address: "Address",
  },
  form: {
    title: "Get help setting up",
    body: "Tell us about your shop and we'll message you on WhatsApp.",
    name: "Full name",
    namePh: "Your name",
    phone: "Phone number",
    phonePh: "Your WhatsApp number",
    type: "Business type",
    message: "Message (optional)",
    messagePh: "Anything else we should know?",
    submit: "Send via WhatsApp",
  },
  businessTypes: ["Grocery / Shop", "Salon / Barber", "Boutique / Clothing", "Pharmacy", "Restaurant / Bar", "Other"],
  sticky: "Chat on WhatsApp",
  privacy: { title: "Privacy Policy" },
  footer: {
    tagline: "A WhatsApp-based debt tracking tool built for small shop owners in Rwanda. No app to install, just message and go.",
    explore: "Explore",
    contactHeading: "Contact",
    builtIn: "Built in Kigali 🇷🇼",
  },
};
type Copy = typeof en;

const rw: Copy = {
  nav: { how: "Uko bikora", pricing: "Igiciro", faq: "Ibibazo", contact: "Twandikire", privacy: "Ibanga" },
  hero: {
    title: "Menya abakubereyemo imyenda. Wishyurwe vuba.",
    body: "Shop Brain ibika imyenda y'abakiriya bawe kuri WhatsApp. Andika umwenda mu masegonda, ohereza inyibutsa n'ubutumwa bumwe, kandi urebe igiteranyo cyose igihe cyose.",
    cta: "Tangira kuri WhatsApp",
    more: "Reba uko bikora",
    note: "Nta porogaramu ushyiramo. Ukwezi kwa mbere ni ubuntu.",
  },
  chat: {
    msgs: [
      { from: "me", text: "ADD Jean 5000" },
      { from: "bot", text: "✅ Byanditswe. Jean abereyemo 5,000 RWF." },
      { from: "me", text: "IGITERANYO" },
      { from: "bot", text: "Abakubereyemo bose: 48,500 RWF (abakiriya 7)." },
      { from: "bot", text: "🔔 Inyibutsa yoherejwe kuri Jean." },
    ],
  },
  problem: {
    title: "Aracyandika imyenda mu gatabo?",
    body: "Impapuro zirazimira. Abakiriya baribagirwa. Kubakurikirana bigutwara umwanya wari gucuruza.",
    notebook: ["Jean – 5,000", "Mama K – 12,000 (?)", "Eric – yishyuye? oya…"],
    notebookNote: "Ni nde wishyuye? Ni nde utarishyura?",
    afterTitle: "Hamwe na Shop Brain",
    after: ["Buri mwenda urabitswe, harimo ubwishyu bw'igice", "Inyibutsa zoherezwa ku bwawe, mu Kinyarwanda cyangwa mu Cyongereza", "Igiteranyo cyawe mu butumwa bumwe"],
  },
  how: { title: "Intambwe enye, byose kuri WhatsApp" },
  steps: [
    { title: "Andikira roboti", desc: "Ohereza ubutumwa kuri Shop Brain kuri WhatsApp nk'uko wandikira undi muntu. Nta gushyiramo, nta kwiyandikisha." },
    { title: "Ongeraho umwenda", desc: "Andika icyo umukiriya abereyemo mu masegonda make, uri mu kiganiro." },
    { title: "Roboti yohereza inyibutsa", desc: "Shop Brain ikurikirana ku bwayo, mu Cyongereza cyangwa mu Kinyarwanda." },
    { title: "Umukiriya yishyura", desc: "Shyira ko umwenda wishyuwe, konti yawe ihite ivugururwa." },
  ],
  pricing: {
    title: "Igiciro cyoroshye",
    big: "Ukwezi 1 k'ubuntu",
    after: "Nyuma, wishyura amafaranga make buri kwezi.",
    features: ["Bika umwenda wa buri mukiriya, n'ubwishyu bw'igice", "Ohereza inyibutsa ku mukiriya umwe cyangwa kuri bose", "Reba igiteranyo igihe cyose", "Bikora mu Kinyarwanda no mu Cyongereza"],
    cta: "Tangira ukwezi k'ubuntu",
  },
  faq: {
    title: "Ibibazo abacuruzi bakunze kubaza",
    items: [
      { q: "Ngomba gushyiramo porogaramu?", a: "Oya. Shop Brain ikorera muri WhatsApp, porogaramu usanzwe ukoresha." },
      { q: "Amakuru y'abakiriya banjye afite umutekano?", a: "Ni wowe wenyine ubona amakuru y'iduka ryawe. Ntitwigera tuyagurisha cyangwa ngo tuyahe abandi." },
      { q: "Ikora mu Kinyarwanda?", a: "Yego. Roboti n'inyibutsa bikora mu Kinyarwanda no mu Cyongereza." },
      { q: "Abakiriya bashobora guhagarika inyibutsa?", a: "Yego. Umukiriya ashobora kuzihagarika igihe icyo ari cyo cyose." },
    ],
  },
  cta: { title: "Witeguye kureka gukurikirana imyenda?", body: "Ohereza ubutumwa bumwe, uhite utangira.", qr: "Uri kuri mudasobwa? Sikana kode na telefone yawe." },
  contact: {
    title: "Ukeneye ubufasha?",
    body: "Ufite ibibazo ku gutangira gukoresha Shop Brain mu iduka ryawe, cyangwa ukeneye ubufasha kuri konti yawe? Itsinda ryacu riteguye.",
    support: "Ohereza ubutumwa ku itsinda ry'ubufasha",
    supportNote: "Ni ubufasha n'ibibazo, ntabwo ari roboti ya Shop Brain ubwayo.",
    email: "Imeyili",
    address: "Aderesi",
  },
  form: {
    title: "Dufashe gutangira",
    body: "Tubwire iby'iduka ryawe, tuzakwandikira kuri WhatsApp.",
    name: "Amazina yombi",
    namePh: "Amazina yawe",
    phone: "Numero ya telefone",
    phonePh: "Numero yawe ya WhatsApp",
    type: "Ubwoko bw'ubucuruzi",
    message: "Ubutumwa (si ngombwa)",
    messagePh: "Ikindi wifuza kutumenyesha?",
    submit: "Ohereza kuri WhatsApp",
  },
  businessTypes: ["Iduka / Uduka", "Salon / Umucuzi", "Imyenda", "Farumasi", "Resitora / Bar", "Ikindi"],
  sticky: "Tangira kuri WhatsApp",
  privacy: { title: "Politiki y'Ibanga" },
  footer: {
    tagline: "Igikoresho cyo kugenzura imyenda kuri WhatsApp, cyakorewe abanyabucuruzi bato mu Rwanda. Nta porogaramu, andika gusa utangire.",
    explore: "Reba",
    contactHeading: "Twandikire",
    builtIn: "Byakozwe i Kigali 🇷🇼",
  },
};

const fr: Copy = {
  nav: { how: "Comment ça marche", pricing: "Tarif", faq: "FAQ", contact: "Contact", privacy: "Confidentialité" },
  hero: {
    title: "Sachez qui vous doit de l'argent. Soyez payé plus vite.",
    body: "Shop Brain garde les dettes de vos clients dans WhatsApp. Ajoutez une dette en quelques secondes, envoyez des rappels en un message et consultez votre total à tout moment.",
    cta: "Discuter sur WhatsApp",
    more: "Voir comment ça marche",
    note: "Aucune application à installer. Premier mois gratuit.",
  },
  chat: {
    msgs: [
      { from: "me", text: "ADD Jean 5000" },
      { from: "bot", text: "✅ Enregistré. Jean doit 5 000 RWF." },
      { from: "me", text: "TOTAL" },
      { from: "bot", text: "On vous doit 48 500 RWF (7 clients)." },
      { from: "bot", text: "🔔 Rappel envoyé à Jean." },
    ],
  },
  problem: {
    title: "Vous notez encore les dettes dans un cahier ?",
    body: "Les pages se perdent. Les clients oublient. Les relancer vous prend du temps que vous préféreriez passer à vendre.",
    notebook: ["Jean – 5 000", "Mama K – 12 000 (?)", "Eric – payé ? non…"],
    notebookNote: "Qui a payé ? Qui n'a pas payé ?",
    afterTitle: "Avec Shop Brain",
    after: ["Chaque dette est enregistrée, paiements partiels compris", "Des rappels envoyés pour vous, en kinyarwanda ou en anglais", "Votre total dû, en un seul message"],
  },
  how: { title: "Quatre étapes, tout dans WhatsApp" },
  steps: [
    { title: "Écrivez au bot", desc: "Envoyez un message à Shop Brain sur WhatsApp comme à n'importe quel contact. Aucune installation, aucune connexion." },
    { title: "Ajoutez une dette", desc: "Enregistrez ce qu'un client vous doit en quelques secondes, directement dans la conversation." },
    { title: "Le bot envoie un rappel", desc: "Shop Brain relance pour vous, en anglais ou en kinyarwanda." },
    { title: "Le client paie", desc: "Marquez la dette comme payée et votre solde se met à jour instantanément." },
  ],
  pricing: {
    title: "Un tarif simple",
    big: "1 mois gratuit",
    after: "Ensuite, un petit abonnement mensuel.",
    features: ["Suivez la dette de chaque client, avec paiements partiels", "Relancez un client ou tout le monde d'un coup", "Consultez votre total dû à tout moment", "Disponible en anglais et en kinyarwanda"],
    cta: "Commencer le mois gratuit",
  },
  faq: {
    title: "Les questions des commerçants",
    items: [
      { q: "Dois-je installer une application ?", a: "Non. Shop Brain fonctionne dans WhatsApp, l'application que vous utilisez déjà." },
      { q: "Les données de mes clients sont-elles en sécurité ?", a: "Vous seul voyez les données de votre commerce. Nous ne les vendons ni ne les partageons jamais." },
      { q: "Est-ce disponible en kinyarwanda ?", a: "Oui. Le bot et les rappels fonctionnent en kinyarwanda et en anglais." },
      { q: "Mes clients peuvent-ils arrêter les rappels ?", a: "Oui. Les clients peuvent se désinscrire des rappels à tout moment." },
    ],
  },
  cta: { title: "Prêt à arrêter de courir après les dettes ?", body: "Envoyez un message et c'est parti.", qr: "Sur ordinateur ? Scannez avec votre téléphone." },
  contact: {
    title: "Besoin d'aide ?",
    body: "Des questions sur la mise en place de Shop Brain pour votre commerce, ou besoin d'aide pour votre compte ? Notre équipe est prête.",
    support: "Écrire au support",
    supportNote: "Pour le support et les questions, pas le bot Shop Brain lui-même.",
    email: "E-mail",
    address: "Adresse",
  },
  form: {
    title: "Se faire aider pour démarrer",
    body: "Parlez-nous de votre commerce et nous vous écrirons sur WhatsApp.",
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
  sticky: "Discuter sur WhatsApp",
  privacy: { title: "Politique de confidentialité" },
  footer: {
    tagline: "Un outil de suivi des dettes basé sur WhatsApp, conçu pour les petits commerçants du Rwanda. Aucune application, écrivez et c'est parti.",
    explore: "Explorer",
    contactHeading: "Contact",
    builtIn: "Conçu à Kigali 🇷🇼",
  },
};

const copy: Record<Lang, Copy> = { rw, en, fr };

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function ThemeToggle({ theme, toggleTheme }: { theme: Theme; toggleTheme: () => void }) {
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      data-testid="button-theme-toggle"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function LanguageSelector({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
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
        className="inline-flex items-center gap-1.5 text-sm font-medium px-2.5 h-9 rounded-md border border-border hover:bg-muted transition-colors"
        aria-label="Select language"
        aria-expanded={open}
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
              {l.code === lang && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The one animated moment on the page: a WhatsApp chat that plays through
// the product's real flow, then loops. Pure HTML/CSS, no images.
function PhoneChat({ msgs }: { msgs: { from: string; text: string }[] }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(msgs.length);
      return;
    }
    setShown(0);
    let tick = 0;
    const id = setInterval(() => {
      tick = tick > msgs.length + 2 ? 0 : tick + 1;
      setShown(Math.min(tick, msgs.length));
    }, 1300);
    return () => clearInterval(id);
  }, [msgs]);

  return (
    <div className="mx-auto w-full max-w-[290px] rounded-[2.5rem] border-[10px] border-[#0b1020] bg-[#0b1020] shadow-2xl rotate-1">
      <div className="rounded-[1.8rem] overflow-hidden bg-[#0b141a]">
        <div className="flex items-center gap-3 px-4 py-3 bg-[#1f2c34] text-white">
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: GREEN }}>
            SB
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Shop Brain</div>
            <div className="text-[11px] text-white/60">online</div>
          </div>
        </div>
        <div className="h-[400px] px-3 py-4 flex flex-col justify-end gap-2" aria-label="Example WhatsApp conversation">
          {msgs.slice(0, shown).map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] px-3 py-2 rounded-xl text-[13px] leading-snug text-white animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                m.from === "me" ? "self-end bg-[#005c4b] rounded-tr-sm" : "self-start bg-[#202c33] rounded-tl-sm"
              }`}
            >
              {m.text}
              {m.from === "me" && <span className="ml-2 text-[10px] text-sky-300">✓✓</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.q}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 py-5 text-left text-lg font-semibold"
              style={DISPLAY}
            >
              {it.q}
              {isOpen ? <Minus size={18} className="shrink-0" /> : <Plus size={18} className="shrink-0" />}
            </button>
            {isOpen && <p className="pb-5 pr-10 text-muted-foreground leading-relaxed animate-in fade-in duration-200">{it.a}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [scrollY, setScrollY] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("rw");
  const { theme, toggleTheme } = useTheme();
  const t = copy[lang];

  const botLink = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}`;
  const supportLink = `https://wa.me/${SUPPORT_NUMBER}`;

  const navLinks = [
    { name: t.nav.how, href: "#how-it-works" },
    { name: t.nav.pricing, href: "#pricing" },
    { name: t.nav.faq, href: "#faq" },
    { name: t.nav.contact, href: "#contact" },
  ];

  // Load the two fonts at runtime so no CSS/HTML file has to change.
  useEffect(() => {
    if (document.getElementById("shopbrain-fonts")) return;
    const link = document.createElement("link");
    link.id = "shopbrain-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Caveat:wght@600&display=swap";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const element = document.querySelector(href);
    if (element) {
      const top = element.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: "smooth" });
    }
    setMobileMenuOpen(false);
  };

  const ctaClass =
    "inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-semibold text-white text-lg shadow-lg shadow-black/10 hover:brightness-110 active:scale-[0.98] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <a href="#hero" onClick={(e) => scrollToSection(e, "#hero")} className="text-2xl font-extrabold tracking-tight" style={DISPLAY}>
            Shop Brain
          </a>

          <nav className="hidden md:flex items-center gap-7">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} onClick={(e) => scrollToSection(e, l.href)} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                {l.name}
              </a>
            ))}
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            <LanguageSelector lang={lang} setLang={setLang} />
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            <LanguageSelector lang={lang} setLang={setLang} />
            <button className="p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-background pt-20 px-4 md:hidden">
          <nav className="flex flex-col gap-2 p-4">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} onClick={(e) => scrollToSection(e, l.href)} className="text-xl font-semibold py-3 border-b border-border/60" style={DISPLAY}>
                {l.name}
              </a>
            ))}
          </nav>
        </div>
      )}

      <main className="flex-1">
        {/* Hero: ledger paper, with the product playing next to the headline */}
        <section
          id="hero"
          className="relative overflow-hidden pt-28 pb-20 md:pt-36 md:pb-28 px-4 md:px-6 bg-[#EEF1FA] dark:bg-[#0F1530] [--rule:#D3DBF0] dark:[--rule:#222B58]"
          style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 35px, var(--rule) 35px, var(--rule) 36px)" }}
        >
          <div aria-hidden className="absolute inset-y-0 left-3 md:left-14 w-px bg-red-400/40" />
          <div className="container mx-auto max-w-6xl grid lg:grid-cols-[1.15fr_0.85fr] gap-14 items-center relative">
            <div className="space-y-7 md:pl-10">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight max-w-2xl" style={DISPLAY}>
                {t.hero.title}
              </h1>
              <p className="text-lg md:text-xl text-foreground/75 leading-relaxed max-w-xl">{t.hero.body}</p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <a href={`${botLink}?text=Hi`} target="_blank" rel="noopener noreferrer" className={ctaClass} style={{ background: GREEN }} data-testid="link-hero-whatsapp">
                  <MessageCircle size={20} /> {t.hero.cta}
                </a>
                <a href="#how-it-works" onClick={(e) => scrollToSection(e, "#how-it-works")} className="px-5 py-3.5 rounded-full font-semibold border-2 border-foreground/20 hover:border-foreground/50 transition-colors">
                  {t.hero.more}
                </a>
              </div>
              <p className="text-sm text-foreground/60">{t.hero.note}</p>
            </div>
            <PhoneChat msgs={t.chat.msgs} />
          </div>
        </section>

        {/* Problem: notebook vs Shop Brain */}
        <section className="py-20 md:py-28 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl grid md:grid-cols-2 gap-14 items-center">
            <div
              className="relative rounded-md bg-[#FBF7E8] dark:bg-[#1B2140] border border-border shadow-md -rotate-1 px-8 py-7 [--rule:#CDD6EE] dark:[--rule:#2C3566]"
              style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 43px, var(--rule) 43px, var(--rule) 44px)" }}
            >
              {t.problem.notebook.map((line, i) => (
                <p key={line} className={`text-3xl leading-[44px] text-[#1B2559] dark:text-white/90 ${i === 2 ? "line-through decoration-2 opacity-60" : ""}`} style={HAND}>
                  {line}
                </p>
              ))}
              <p className="text-3xl leading-[44px] text-red-600 dark:text-red-400 mt-2" style={HAND}>
                {t.problem.notebookNote}
              </p>
            </div>

            <div>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4" style={DISPLAY}>
                {t.problem.title}
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg">{t.problem.body}</p>
              <h3 className="text-xl font-bold mb-4" style={DISPLAY}>
                {t.problem.afterTitle}
              </h3>
              <ul className="space-y-3">
                {t.problem.after.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-lg">
                    <span className="mt-1 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-white" style={{ background: GREEN }}>
                      <Check size={14} strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* How it works: a real sequence, so numbered */}
        <section id="how-it-works" className="py-20 md:py-28 px-4 md:px-6 bg-muted/50 border-y border-border">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-12" style={DISPLAY}>
              {t.how.title}
            </h2>
            <ol className="relative">
              <div aria-hidden className="absolute left-5 top-3 bottom-3 w-0.5 bg-border" />
              {t.steps.map((s, i) => (
                <li key={s.title} className="relative pl-16 pb-10 last:pb-0">
                  <span className="absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-lg" style={{ background: SUN, color: INK, ...DISPLAY }}>
                    {i + 1}
                  </span>
                  <h3 className="text-xl font-bold mb-1" style={DISPLAY}>
                    {s.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed max-w-xl">{s.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing: one ticket, not a grid of cards */}
        <section id="pricing" className="py-20 md:py-28 px-4 md:px-6">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-10" style={DISPLAY}>
              {t.pricing.title}
            </h2>
            <div className="grid md:grid-cols-[1fr_1.1fr] rounded-2xl overflow-hidden border border-border shadow-sm">
              <div className="p-8 md:p-10 flex flex-col justify-center" style={{ background: INK, color: "white" }}>
                <p className="text-4xl md:text-5xl font-extrabold leading-tight" style={DISPLAY}>
                  <span className="px-1 -mx-1 rounded" style={{ background: SUN, color: INK }}>
                    {t.pricing.big}
                  </span>
                </p>
                <p className="mt-4 text-white/75 text-lg">{t.pricing.after}</p>
              </div>
              <div className="p-8 md:p-10 bg-card">
                <ul className="space-y-3 mb-8">
                  {t.pricing.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <Check size={20} className="mt-0.5 shrink-0" style={{ color: GREEN }} strokeWidth={3} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a href={botLink} target="_blank" rel="noopener noreferrer" className={`${ctaClass} w-full`} style={{ background: GREEN }}>
                  <MessageCircle size={20} /> {t.pricing.cta}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="pb-20 md:pb-28 px-4 md:px-6">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-8" style={DISPLAY}>
              {t.faq.title}
            </h2>
            <Faq key={lang} items={t.faq.items} />
          </div>
        </section>

        {/* Get started: button everywhere, QR only where it can be scanned */}
        <section id="get-started" className="py-20 md:py-24 px-4 md:px-6 text-white" style={{ background: INK }}>
          <div className="container mx-auto max-w-5xl flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="max-w-xl text-center md:text-left">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3" style={DISPLAY}>
                {t.cta.title}
              </h2>
              <p className="text-lg text-white/75 mb-7">{t.cta.body}</p>
              <a href={botLink} target="_blank" rel="noopener noreferrer" className={ctaClass} style={{ background: GREEN }} data-testid="link-whatsapp-fallback">
                <MessageCircle size={20} /> {t.hero.cta}
              </a>
            </div>
            <figure className="hidden md:flex flex-col items-center gap-3 text-center">
              <div className="w-44 h-44 rounded-2xl bg-white p-2">
                <img
                  src={`${import.meta.env.BASE_URL}images/qr-whatsapp.png`}
                  alt="QR code to chat with Shop Brain on WhatsApp"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const fig = e.currentTarget.closest("figure");
                    if (fig) (fig as HTMLElement).style.display = "none";
                  }}
                />
              </div>
              <figcaption className="text-sm text-white/70 max-w-[11rem]">{t.cta.qr}</figcaption>
            </figure>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="py-20 md:py-28 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl grid md:grid-cols-2 gap-14 items-start">
            <div>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4" style={DISPLAY}>
                {t.contact.title}
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed mb-10 max-w-lg">{t.contact.body}</p>
              <div className="space-y-7">
                <div className="flex items-start gap-4">
                  <Phone size={22} className="mt-1 shrink-0" style={{ color: GREEN }} />
                  <div>
                    <h3 className="font-bold text-lg">{t.contact.support}</h3>
                    <a href={supportLink} target="_blank" rel="noopener noreferrer" className="text-lg text-muted-foreground hover:text-foreground transition-colors" data-testid="link-contact-whatsapp">
                      {SUPPORT_NUMBER_DISPLAY}
                    </a>
                    <p className="text-sm text-muted-foreground mt-1">{t.contact.supportNote}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Mail size={22} className="mt-1 shrink-0" style={{ color: GREEN }} />
                  <div>
                    <h3 className="font-bold text-lg">{t.contact.email}</h3>
                    <a href={`mailto:${CONTACT_EMAIL}`} className="text-lg text-muted-foreground hover:text-foreground transition-colors break-all">
                      {CONTACT_EMAIL}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <MapPin size={22} className="mt-1 shrink-0" style={{ color: GREEN }} />
                  <div>
                    <h3 className="font-bold text-lg">{t.contact.address}</h3>
                    <p className="text-lg text-muted-foreground">{CONTACT_ADDRESS}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card p-8 md:p-10 rounded-2xl border border-border shadow-lg">
              <h3 className="text-xl font-bold mb-1" style={DISPLAY}>
                {t.form.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">{t.form.body}</p>
              <SupportForm t={t.form} businessTypes={t.businessTypes} supportNumber={SUPPORT_NUMBER} />
            </div>
          </div>
        </section>

        {/* Privacy: collapsed so it stays on the page without dominating it */}
        <section id="privacy" className="pb-16 px-4 md:px-6">
          <details className="container mx-auto max-w-3xl rounded-xl border border-border bg-card px-6 py-4 group">
            <summary className="cursor-pointer list-none flex items-center gap-3 font-bold text-lg" style={DISPLAY}>
              <Shield size={20} style={{ color: GREEN }} /> {t.privacy.title}
              <ChevronDown size={18} className="ml-auto transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-5 space-y-4 text-muted-foreground leading-relaxed">
              <p>Shop Brain Ltd collects WhatsApp phone numbers and customer debt records on behalf of shop owners.</p>
              <p>All data is stored securely and is only accessible to the authorised shop owner.</p>
              <p>Shop Brain Ltd does not sell, share, or transfer customer data to any third party.</p>
              <p>Data is retained as long as the shop owner uses the service.</p>
              <p>WhatsApp messages sent to Shop Brain are processed to extract commands (e.g. ADD, PAID, customer lookup) and are not stored beyond what is needed to fulfil the request.</p>
              <div className="p-5 bg-background rounded-lg border border-border">
                <p className="font-medium text-foreground mb-1">For data deletion requests, contact:</p>
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline break-all">
                  {CONTACT_EMAIL}
                </a>
              </div>
            </div>
          </details>
        </section>
      </main>

      {/* Mobile-only sticky button, appears once the hero has scrolled away */}
      {scrollY > 500 && (
        <a
          href={botLink}
          target="_blank"
          rel="noopener noreferrer"
          className={`${ctaClass} fixed bottom-4 inset-x-4 z-40 md:hidden animate-in fade-in slide-in-from-bottom-4 duration-300`}
          style={{ background: GREEN }}
          data-testid="link-sticky-whatsapp"
        >
          <MessageCircle size={20} /> {t.sticky}
        </a>
      )}

      {/* Footer */}
      <footer className="text-white pt-16 pb-8 px-4 md:px-6" style={{ background: "#0F1530" }}>
        <div className="container mx-auto max-w-6xl">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-white/10">
            <div className="lg:col-span-2">
              <div className="text-2xl font-extrabold tracking-tight mb-3" style={DISPLAY}>
                Shop Brain
              </div>
              <p className="text-white/60 leading-relaxed max-w-sm mb-6">{t.footer.tagline}</p>
              <div className="flex items-center gap-3">
                <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Shop Brain on Instagram" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" data-testid="link-instagram">
                  <Instagram size={18} />
                </a>
                <a href={supportLink} target="_blank" rel="noopener noreferrer" aria-label="Message Shop Brain support on WhatsApp" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" data-testid="link-footer-whatsapp">
                  <MessageCircle size={18} />
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-white/90 mb-4" style={DISPLAY}>
                {t.footer.explore}
              </h4>
              <ul className="space-y-3">
                {[...navLinks, { name: t.nav.privacy, href: "#privacy" }].map((l) => (
                  <li key={l.href}>
                    <a href={l.href} onClick={(e) => scrollToSection(e, l.href)} className="text-white/70 hover:text-white transition-colors">
                      {l.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white/90 mb-4" style={DISPLAY}>
                {t.footer.contactHeading}
              </h4>
              <ul className="space-y-3 text-white/70">
                <li>
                  <a href={supportLink} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors break-all">
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

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-white/50 text-sm">
            <p>© {new Date().getFullYear()} Shop Brain Ltd. Registered in Rwanda.</p>
            <p>{t.footer.builtIn}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Support form (opens a WhatsApp chat with the support line, pre-filled)
// ---------------------------------------------------------------------------

function SupportForm({ t, businessTypes, supportNumber }: { t: Copy["form"]; businessTypes: string[]; supportNumber: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessType, setBusinessType] = useState(businessTypes[0]);
  const [message, setMessage] = useState("");

  // Labels are translated, so reset when the language changes.
  useEffect(() => {
    setBusinessType(businessTypes[0]);
  }, [businessTypes]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = [
      "Hi Shop Brain, I'd like help getting set up.",
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Business type: ${businessType}`,
      message ? `Message: ${message}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/${supportNumber}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const field =
    "w-full px-4 py-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-[#0F7A3F]/50 transition-shadow";

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">{t.name}</label>
        <input type="text" id="name" required value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder={t.namePh} data-testid="input-request-name" />
      </div>
      <div className="space-y-2">
        <label htmlFor="phone" className="text-sm font-medium">{t.phone}</label>
        <input type="tel" id="phone" required value={phone} onChange={(e) => setPhone(e.target.value)} className={field} placeholder={t.phonePh} data-testid="input-request-phone" />
      </div>
      <div className="space-y-2">
        <label htmlFor="business-type" className="text-sm font-medium">{t.type}</label>
        <select id="business-type" value={businessType} onChange={(e) => setBusinessType(e.target.value)} className={field} data-testid="select-request-business-type">
          {businessTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="message" className="text-sm font-medium">{t.message}</label>
        <textarea id="message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className={`${field} resize-none`} placeholder={t.messagePh} data-testid="input-request-message" />
      </div>
      <button
        type="submit"
        className="w-full inline-flex items-center justify-center gap-2 text-white py-3.5 rounded-full font-semibold text-lg hover:brightness-110 transition"
        style={{ background: GREEN }}
        data-testid="button-request-access"
      >
        <MessageCircle size={20} /> {t.submit}
      </button>
    </form>
  );
}