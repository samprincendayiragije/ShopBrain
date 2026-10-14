import React, { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, Check } from "lucide-react";

// Standalone legal pages. Reads the same language and theme settings as Home.tsx
// (localStorage keys "shopbrain-lang" and "shopbrain-theme"), so the visitor's
// choice follows them from the homepage to /privacy.

type Lang = "rw" | "en" | "fr";
type Section = { id: string; h: string; p?: string[]; ul?: string[] };
type Doc = { title: string; updated: string; intro: string; sections: Section[] };

const INK = "#1B2559";
const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;
const LANG_KEY = "shopbrain-lang";
const THEME_KEY = "shopbrain-theme";
const EMAIL = "Ndayiragijesamuelprince@gmail.com";

const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "rw", label: "Kinyarwanda", flag: "🇷🇼" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
];

const UI: Record<Lang, { home: string; contents: string; updated: string; notice: string }> = {
  rw: {
    home: "Subira kuri Shop Brain",
    contents: "Ibikubiyemo",
    updated: "Byavuguruwe",
    notice: "Iyi nyandiko iracyahindurwa mu Kinyarwanda. Kugeza ubu irerekanwa mu Cyongereza, ari cyo gifite agaciro.",
  },
  en: { home: "Back to Shop Brain", contents: "Contents", updated: "Last updated", notice: "" },
  fr: {
    home: "Retour à Shop Brain",
    contents: "Sommaire",
    updated: "Dernière mise à jour",
    notice: "Ce document est en cours de traduction en français. En attendant, il s'affiche en anglais, qui fait foi.",
  },
};

// ---------------------------------------------------------------------------
// Content. Add rw / fr entries here as the translations are finished.
// ---------------------------------------------------------------------------

const PRIVACY_EN: Doc = {
  title: "Privacy Policy",
  updated: "9 October 2026",
  intro:
    "This policy explains what personal information Shop Brain collects, why, who sees it, how long we keep it, and how you can control it. It is written for shop owners who use Shop Brain and for customers of those shops who receive messages from Shop Brain on a shop's behalf. Shop Brain is operated by Shop Brain Ltd, Kigali, Rwanda.",
  sections: [
    {
      id: "what",
      h: "What Shop Brain is",
      p: [
        "Shop Brain is a record-keeping tool for small shops. A shop owner chats with Shop Brain on WhatsApp to record what customers owe, record payments, and send those customers balance reminders and receipts.",
        "Shop Brain is not a lender, a bank or a debt collection agency. We do not lend money, buy or sell debts, or collect money for anyone, and we never hold or move money. Customers pay the shop directly, for example by MTN MoMo, and the shop owner records it. We only contact a shop's own customers, about that shop's own records.",
      ],
    },
    {
      id: "collect",
      h: "What we collect",
      ul: [
        "Shop owners: WhatsApp number, name, shop name, language, settings, and the payment details the owner chooses to show customers, such as a MoMo number.",
        "Customers (entered by the owner): name, phone number if provided, items bought on credit, amounts owed and paid, dates, an optional promise-to-pay date and credit limit, whether the owner confirmed the customer agreed to reminders, and whether the customer replied STOP.",
        "Suppliers (entered by the owner): supplier name and the amount owed.",
        "From customers directly: their WhatsApp number and the buttons or messages they send to Shop Brain, such as My Balance, How to Pay, I've paid and Stop.",
        "Message information: delivery and read status, and timestamps.",
        "We do not collect bank card numbers, MoMo PINs or passwords, or the contents of anyone's other WhatsApp chats.",
      ],
    },
    {
      id: "use",
      h: "How we use it",
      ul: [
        "To record debts and payments and show owners their balances, lists and totals.",
        "To send reminders, receipts, balance replies and summary messages to owners and customers.",
        "To tell an owner when a customer says they have paid, so the owner can confirm.",
        "To build the owner's follow-up list and export the owner's own records on request.",
        "To keep the service secure, prevent abuse, fix problems and meet legal obligations.",
        "We do not sell personal information, use it for advertising, share one shop's records with another shop, or use it to rate anyone's creditworthiness.",
      ],
    },
    {
      id: "reminders",
      h: "Reminders, consent and how to stop",
      ul: [
        "Shop Brain sends reminders only to customers whose number the shop owner entered and for whom the owner confirmed the customer agreed to receive reminders.",
        "Every reminder includes a way to stop. A customer can tap Stop or reply STOP at any time. We then stop all reminders to that number, from every shop, and keep a record of the request so the number is not messaged again.",
        "Reminders are limited in frequency.",
        "We keep a record of the date and source of each consent confirmation and each stop request.",
      ],
    },
    {
      id: "sharing",
      h: "WhatsApp, Meta and our providers",
      p: [
        "Shop Brain sends and receives messages through the WhatsApp Business Platform provided by Meta. Meta processes those messages under its own terms and privacy policy, which we do not control.",
        "We share information only with providers that help us run Shop Brain: Meta (WhatsApp) to deliver messages, and our database and hosting providers (Supabase and Replit) to store and run the service. Their servers may be outside Rwanda, and we handle this in line with Rwanda's Law No. 058/2021 on the protection of personal data and privacy. We may disclose information if the law requires it. A customer's balance is shown only to that customer's WhatsApp number, and an owner sees only their own shop's records.",
      ],
    },
    {
      id: "keep",
      h: "How long we keep it",
      ul: [
        "Shop and customer records are kept while the owner's account is active.",
        "If an owner closes their account or asks us to delete data, we delete their records within 30 days, except what we must keep by law.",
        "We keep a minimal record of stop requests and consent confirmations so we can keep honouring them.",
      ],
    },
    {
      id: "rights",
      h: "Your rights and deleting your data",
      p: [
        "Under Rwanda's data protection law you can ask us to tell you what we hold about you, correct it, delete it, or stop contacting you. Shop owners can correct and export their own records inside Shop Brain. Customers can tap Stop at any time.",
        `To ask for deletion, message us on WhatsApp with the words "Delete my data" or email ${EMAIL}. Include the phone number involved and, if you are a customer, the shop's name. We confirm who you are, then reply within 30 days. If you are not satisfied, you may complain to Rwanda's National Cyber Security Authority.`,
      ],
    },
    {
      id: "security",
      h: "Security",
      p: [
        "We use reasonable technical and organisational measures, including encrypted connections (HTTPS), restricted access to our database and password-protected admin access. If a breach affects personal information, we notify the people affected and the authorities as the law requires.",
      ],
    },
    {
      id: "children",
      h: "Children",
      p: [
        "Shop Brain is for business owners aged 18 and over. We do not knowingly collect information from children. If you believe a child's information was recorded, contact us and we will remove it.",
      ],
    },
    {
      id: "changes",
      h: "Changes to this policy",
      p: ["When we make an important change, we update the date above and tell shop owners on WhatsApp."],
    },
    {
      id: "contact",
      h: "Contact",
      p: [`Shop Brain Ltd, Kigese, Ruyenzi, Southern 0000, Rwanda. Email: ${EMAIL}. WhatsApp support: +250 799 627 713.`],
    },
  ],
};

const DOCS: Record<"privacy", Partial<Record<Lang, Doc>>> = { privacy: { en: PRIVACY_EN } };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const CSS = `
html{scroll-behavior:smooth}
@keyframes lg-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.lg-rise{animation:lg-rise .6s cubic-bezier(.2,.7,.2,1) both}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.lg-rise{animation:none}}
`;

function readLang(): Lang {
  if (typeof window === "undefined") return "rw";
  const s = window.localStorage.getItem(LANG_KEY);
  return s === "rw" || s === "en" || s === "fr" ? s : "rw";
}

function LegalPage({ doc }: { doc: "privacy" }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const [menu, setMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState("");

  const setLang = (l: Lang) => {
    setLangState(l);
    window.localStorage.setItem(LANG_KEY, l);
    setMenu(false);
  };

  const translated = DOCS[doc][lang];
  const d = translated ?? (DOCS[doc].en as Doc);
  const ui = UI[lang];

  // Same theme the visitor picked on the homepage.
  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    const dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  useEffect(() => {
    document.title = `${d.title} | Shop Brain`;
    window.scrollTo(0, 0);
    if (document.getElementById("shopbrain-fonts")) return;
    const link = document.createElement("link");
    link.id = "shopbrain-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Caveat:wght@600&display=swap";
    document.head.appendChild(link);
  }, [d.title]);

  // Reading progress and the section currently on screen.
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-20% 0px -70% 0px" });
    d.sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [d]);

  const current = LANGS.find((l) => l.code === lang)!;

  const toc = (
    <ol className="space-y-1">
      {d.sections.map((s, i) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className={`flex gap-3 rounded-md px-3 py-1.5 text-sm transition-colors ${active === s.id ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <span className="w-5 shrink-0 tabular-nums opacity-60">{i + 1}</span>
            {s.h}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <style>{CSS}</style>

      <header className="fixed top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft size={16} /> {ui.home}
          </a>
          <div className="relative">
            <button
              onClick={() => setMenu((o) => !o)}
              aria-expanded={menu}
              aria-label="Select language"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <span className="text-base leading-none">{current.flag}</span>
              <span className="hidden sm:inline">{current.label}</span>
              <ChevronDown size={14} className={`transition-transform ${menu ? "rotate-180" : ""}`} />
            </button>
            {menu && (
              <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-md border border-border bg-background shadow-lg">
                {LANGS.map((l) => (
                  <button key={l.code} onClick={() => setLang(l.code)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-muted">
                    <span className="text-base leading-none">{l.flag}</span>
                    <span className="flex-1">{l.label}</span>
                    {l.code === lang && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div aria-hidden className="absolute bottom-0 left-0 h-[3px]" style={{ width: `${progress}%`, background: SUN, transition: "width .1s linear" }} />
      </header>

      {/* Title block: the one animated moment on the page */}
      <section className="border-b border-border bg-[#EEF1FA] px-4 pb-14 pt-28 dark:bg-[#0F1530] md:px-6 md:pb-16 md:pt-36">
        <div className="container mx-auto max-w-5xl">
          <h1 className="lg-rise max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl" style={DISPLAY}>
            {d.title}
          </h1>
          <p className="lg-rise mt-5 text-sm text-foreground/60" style={{ animationDelay: "150ms" }}>
            {ui.updated}: {d.updated}
          </p>
          <p className="lg-rise mt-6 max-w-2xl text-lg leading-relaxed text-foreground/75" style={{ animationDelay: "250ms" }}>
            {d.intro}
          </p>
          {!translated && ui.notice && (
            <p className="lg-rise mt-6 max-w-2xl rounded-lg border border-border bg-card px-4 py-3 text-sm" style={{ animationDelay: "350ms", borderLeft: `4px solid ${SUN}` }}>
              {ui.notice}
            </p>
          )}
        </div>
      </section>

      <main className="container mx-auto grid max-w-5xl gap-12 px-4 py-14 md:px-6 lg:grid-cols-[230px_1fr]">
        <aside>
          <details className="rounded-lg border border-border bg-card p-3 lg:hidden">
            <summary className="cursor-pointer font-semibold" style={DISPLAY}>
              {ui.contents}
            </summary>
            <div className="mt-3">{toc}</div>
          </details>
          <nav aria-label={ui.contents} className="sticky top-24 hidden lg:block">
            <p className="mb-3 px-3 font-bold" style={DISPLAY}>
              {ui.contents}
            </p>
            {toc}
          </nav>
        </aside>

        <article className="max-w-2xl">
          {d.sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-border pb-10 pt-8 first:border-t-0 first:pt-0">
              <h2 className="mb-4 flex items-baseline gap-3 text-2xl font-bold tracking-tight" style={{ ...DISPLAY, color: undefined }}>
                <span className="tabular-nums" style={{ color: GREEN }}>
                  {i + 1}
                </span>
                {s.h}
              </h2>
              {s.p?.map((t) => (
                <p key={t} className="mb-4 text-[17px] leading-[1.75] text-foreground/85">
                  {t}
                </p>
              ))}
              {s.ul && (
                <ul className="space-y-3">
                  {s.ul.map((t) => (
                    <li key={t} className="flex gap-3 text-[17px] leading-[1.75] text-foreground/85">
                      <span aria-hidden className="mt-[0.8em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: INK }} />
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
      </main>

      <footer className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground md:px-6">
        © {new Date().getFullYear()} Shop Brain Ltd. Registered in Rwanda.
      </footer>
    </div>
  );
}

export function PrivacyPage() {
  return <LegalPage doc="privacy" />;
}

export default PrivacyPage;