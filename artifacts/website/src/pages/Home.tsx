import React, { useEffect, useState } from "react";
import { Building2, Check, Instagram, Mail, MapPin, MessageCircle, Phone, Plus, Minus } from "lucide-react";
import {
  BOT_LINK,
  COMPANY_NAME,
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  DISPLAY,
  GREEN,
  INK,
  INSTAGRAM_URL,
  MONTHLY_PRICE_RWF,
  SUN,
  SUPPORT_DISPLAY,
  SUPPORT_LINK,
  Shell,
  common,
  ctaClass,
  useLang,
  type Lang,
} from "./site";

// ---------------------------------------------------------------------------
// Copy (one object per language)
// ---------------------------------------------------------------------------

type Copy = {
  hero: { title: string; body: string; note: string };
  chat: { from: "me" | "bot"; text: string }[];
  stepsTitle: string;
  steps: { title: string; desc: string }[];
  pricing: { title: string; big: string; after: string; afterPrice: string; features: string[] };
  faqTitle: string;
  faq: { q: string; a: string }[];
  contact: { title: string; body: string; support: string; supportNote: string; email: string; address: string; company: string; companyValue: string };
};

const en: Copy = {
  hero: {
    title: "Know who owes you. Get paid sooner.",
    body: "Shop Brain keeps your customers' debts in WhatsApp. Add a debt in seconds, remind customers with one message, and see your total any time.",
    note: "No app to install. First month free.",
  },
  chat: [
    { from: "me", text: "0788123456 Jean sugar 2000" },
    { from: "bot", text: "Jean · sugar · 2,000 RWF. Save? ✅" },
    { from: "bot", text: "✅ Saved. Jean owes 2,000 RWF." },
    { from: "bot", text: "🔔 Reminder to Jean read." },
    { from: "bot", text: "💰 Jean paid 2,000 RWF." },
  ],
  stepsTitle: "Three steps, all inside WhatsApp",
  steps: [
    { title: "Text the bot", desc: "Message Shop Brain on WhatsApp like any contact. No install, no login." },
    { title: "Add a debt", desc: "Send the name, item and amount in one message. Shop Brain confirms before it saves." },
    { title: "Get paid", desc: "Shop Brain reminds customers who agreed to reminders. When they pay, mark it paid and they get a receipt." },
  ],
  pricing: {
    title: "Simple pricing",
    big: "1 month free",
    after: "After that, a small monthly fee.",
    afterPrice: "After that, {price} RWF per month.",
    features: [
      "Every customer's debt, with part payments",
      "Reminders to one customer or everyone",
      "Your total owed, a follow-up list and receipts",
      "Works in Kinyarwanda, English and French",
    ],
  },
  faqTitle: "Questions shop owners ask",
  faq: [
    { q: "Do I need to install an app?", a: "No. Shop Brain works inside WhatsApp, the app you already use." },
    { q: "Is my customers' data safe?", a: "Only you and the Shop Brain team (when we help you) can see your shop's records. We never sell them." },
    { q: "Can my customers stop the reminders?", a: "Yes. A customer can reply STOP at any time and is never messaged again." },
    { q: "What if I type something wrong?", a: "Shop Brain asks you to confirm before it saves a debt. You can also undo the last debt or edit a customer." },
    { q: "Can I take my records with me?", a: "Yes. Ask for the export and Shop Brain sends you a file that opens in Excel." },
  ],
  contact: {
    title: "Talk to us",
    body: "Questions about setting up Shop Brain for your shop, or help with your account? Message our team.",
    support: "WhatsApp support",
    supportNote: "For help and questions. To use Shop Brain itself, tap Chat on WhatsApp.",
    email: "Email",
    address: "Address",
    company: "Company",
    companyValue: `${COMPANY_NAME}, registered in Rwanda`,
  },
};

const rw: Copy = {
  hero: {
    title: "Menya abakubereyemo umwenda. Wishyurwe vuba.",
    body: "Shop Brain ibika imyenda y'abakiriya bawe kuri WhatsApp. Andika umwenda mu masegonda, ibutsa abakiriya mu butumwa bumwe, kandi urebe igiteranyo cyawe igihe cyose.",
    note: "Nta porogaramu bisaba. Ukwezi kwa mbere ni ubuntu.",
  },
  chat: [
    { from: "me", text: "0788123456 Jean isukari 2000" },
    { from: "bot", text: "Jean · isukari · 2,000 RWF. Mbike? ✅" },
    { from: "bot", text: "✅ Byabitswe. Jean abereyemo 2,000 RWF." },
    { from: "bot", text: "🔔 Jean yasomye inyibutsa." },
    { from: "bot", text: "💰 Jean yishyuye 2,000 RWF." },
  ],
  stepsTitle: "Intambwe eshatu, byose kuri WhatsApp",
  steps: [
    { title: "Andikira roboti", desc: "Ohereza ubutumwa kuri Shop Brain kuri WhatsApp nk'uko wandikira undi muntu. Nta porogaramu, nta kwinjira." },
    { title: "Ongeraho umwenda", desc: "Ohereza izina, igicuruzwa n'amafaranga mu butumwa bumwe. Shop Brain irabyemeza mbere yo kubika." },
    { title: "Wishyurwe", desc: "Shop Brain yibutsa abakiriya bemeye inyibutsa. Iyo bishyuye, wandika ko yishyuye, umukiriya agahabwa inyemezabwishyu." },
  ],
  pricing: {
    title: "Igiciro cyoroshye",
    big: "Ukwezi 1 k'ubuntu",
    after: "Nyuma, wishyura amafaranga make buri kwezi.",
    afterPrice: "Nyuma, wishyura {price} RWF buri kwezi.",
    features: [
      "Umwenda wa buri mukiriya, n'ubwishyu bw'igice",
      "Inyibutsa ku mukiriya umwe cyangwa bose",
      "Igiteranyo, urutonde rwo gukurikirana n'inyemezabwishyu",
      "Bikora mu Kinyarwanda, mu Cyongereza no mu Gifaransa",
    ],
  },
  faqTitle: "Ibibazo abacuruzi bakunda kubaza",
  faq: [
    { q: "Ngomba gushyiramo porogaramu?", a: "Oya. Shop Brain ikorera muri WhatsApp, porogaramu usanzwe ukoresha." },
    { q: "Amakuru y'abakiriya banjye afite umutekano?", a: "Ni wowe n'itsinda rya Shop Brain (iyo tugufasha) mwenyine mubona amakuru y'iduka ryawe. Ntitwigera tuyagurisha." },
    { q: "Abakiriya bashobora guhagarika inyibutsa?", a: "Yego. Umukiriya ashobora kohereza STOP igihe icyo ari cyo cyose, ntiyongere kwandikirwa." },
    { q: "Nandikiye nabi bimeze bite?", a: "Shop Brain igusaba kwemeza mbere yo kubika umwenda. Ushobora no gukuraho umwenda wa nyuma cyangwa guhindura amakuru y'umukiriya." },
    { q: "Nshobora kujyana amakuru yanjye?", a: "Yego. Saba ko byoherezwa, Shop Brain iguhe dosiye ifungurwa na Excel." },
  ],
  contact: {
    title: "Twandikire",
    body: "Ufite ibibazo ku gutangira gukoresha Shop Brain mu iduka ryawe, cyangwa ukeneye ubufasha kuri konti yawe? Andikira itsinda ryacu.",
    support: "Ubufasha kuri WhatsApp",
    supportNote: "Ku bufasha no ku bibazo. Gukoresha Shop Brain ubwayo, kanda Tangira kuri WhatsApp.",
    email: "Imeyili",
    address: "Aderesi",
    company: "Ikigo",
    companyValue: `${COMPANY_NAME}, cyanditswe mu Rwanda`,
  },
};

const fr: Copy = {
  hero: {
    title: "Sachez qui vous doit de l'argent. Soyez payé plus vite.",
    body: "Shop Brain garde les dettes de vos clients dans WhatsApp. Ajoutez une dette en quelques secondes, relancez vos clients en un message et consultez votre total à tout moment.",
    note: "Aucune application à installer. Premier mois gratuit.",
  },
  chat: [
    { from: "me", text: "0788123456 Jean sucre 2000" },
    { from: "bot", text: "Jean · sucre · 2 000 RWF. Enregistrer ? ✅" },
    { from: "bot", text: "✅ Enregistré. Jean doit 2 000 RWF." },
    { from: "bot", text: "🔔 Rappel lu par Jean." },
    { from: "bot", text: "💰 Jean a payé 2 000 RWF." },
  ],
  stepsTitle: "Trois étapes, tout dans WhatsApp",
  steps: [
    { title: "Écrivez au bot", desc: "Envoyez un message à Shop Brain sur WhatsApp comme à n'importe quel contact. Aucune installation, aucune connexion." },
    { title: "Ajoutez une dette", desc: "Envoyez le nom, l'article et le montant en un message. Shop Brain confirme avant d'enregistrer." },
    { title: "Soyez payé", desc: "Shop Brain relance les clients qui ont accepté les rappels. Quand ils paient, marquez la dette comme payée et ils reçoivent un reçu." },
  ],
  pricing: {
    title: "Un tarif simple",
    big: "1 mois gratuit",
    after: "Ensuite, un petit abonnement mensuel.",
    afterPrice: "Ensuite, {price} RWF par mois.",
    features: [
      "La dette de chaque client, avec paiements partiels",
      "Rappels à un client ou à tout le monde",
      "Votre total dû, une liste de relance et des reçus",
      "Disponible en kinyarwanda, anglais et français",
    ],
  },
  faqTitle: "Les questions des commerçants",
  faq: [
    { q: "Dois-je installer une application ?", a: "Non. Shop Brain fonctionne dans WhatsApp, l'application que vous utilisez déjà." },
    { q: "Les données de mes clients sont-elles en sécurité ?", a: "Seuls vous et l'équipe Shop Brain (quand nous vous aidons) voyez les données de votre commerce. Nous ne les vendons jamais." },
    { q: "Mes clients peuvent-ils arrêter les rappels ?", a: "Oui. Un client peut répondre STOP à tout moment et ne sera plus jamais contacté." },
    { q: "Et si je me trompe en écrivant ?", a: "Shop Brain vous demande de confirmer avant d'enregistrer une dette. Vous pouvez aussi annuler la dernière dette ou modifier un client." },
    { q: "Puis-je emporter mes données ?", a: "Oui. Demandez l'export et Shop Brain vous envoie un fichier qui s'ouvre dans Excel." },
  ],
  contact: {
    title: "Parlez-nous",
    body: "Des questions sur la mise en place de Shop Brain pour votre commerce, ou besoin d'aide pour votre compte ? Écrivez à notre équipe.",
    support: "Support WhatsApp",
    supportNote: "Pour l'aide et les questions. Pour utiliser Shop Brain lui-même, touchez Discuter sur WhatsApp.",
    email: "E-mail",
    address: "Adresse",
    company: "Société",
    companyValue: `${COMPANY_NAME}, enregistrée au Rwanda`,
  },
};

const copy: Record<Lang, Copy> = { rw, en, fr };

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function ChatMock({ msgs }: { msgs: Copy["chat"] }) {
  return (
    <div className="mx-auto w-full max-w-sm rounded-[2rem] border-[6px] border-[#1d2733] bg-[#0b141a] shadow-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] text-white">
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold" style={{ background: GREEN }}>
          SB
        </span>
        <div className="leading-tight">
          <div className="font-semibold text-sm">Shop Brain</div>
          <div className="text-[11px] text-white/60">WhatsApp</div>
        </div>
      </div>
      <div className="p-3 space-y-2 min-h-[22rem]">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] px-3 py-2 rounded-xl text-[13px] leading-snug text-white ${
              m.from === "me" ? "ml-auto bg-[#005c4b] rounded-tr-sm" : "mr-auto bg-[#202c33] rounded-tl-sm"
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((it, i) => (
        <details key={it.q} className="group" open={i === 0}>
          <summary
            className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-semibold [&::-webkit-details-marker]:hidden"
            style={DISPLAY}
          >
            {it.q}
            <Plus size={18} className="shrink-0 group-open:hidden" />
            <Minus size={18} className="shrink-0 hidden group-open:block" />
          </summary>
          <p className="pb-5 pr-10 text-muted-foreground leading-relaxed">{it.a}</p>
        </details>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [lang, setLang] = useLang();
  const [showSticky, setShowSticky] = useState(false);
  const t = copy[lang];
  const c = common[lang];

  // Page title and description follow the language.
  useEffect(() => {
    document.title = `Shop Brain · ${t.hero.title}`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = t.hero.body;
  }, [t]);

  // Structured data so Google understands what Shop Brain is. No ratings, no fake claims.
  useEffect(() => {
    if (document.getElementById("shopbrain-jsonld")) return;
    const s = document.createElement("script");
    s.id = "shopbrain-jsonld";
    s.type = "application/ld+json";
    s.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Shop Brain",
      applicationCategory: "BusinessApplication",
      operatingSystem: "WhatsApp",
      description: en.hero.body,
      areaServed: "RW",
      offers: { "@type": "Offer", price: "0", priceCurrency: "RWF", description: "First month free" },
    });
    document.head.appendChild(s);
  }, []);

  // Mobile sticky button appears once the hero has scrolled away.
  useEffect(() => {
    const onScroll = () => setShowSticky(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const afterLine = MONTHLY_PRICE_RWF !== null ? t.pricing.afterPrice.replace("{price}", MONTHLY_PRICE_RWF.toLocaleString("en-US")) : t.pricing.after;
  const section = { scrollMarginTop: 72 } as const;

  return (
    <Shell lang={lang} setLang={setLang} showNav>
      {/* Hero: ruled notebook page, with the chat as the proof */}
      <section
        className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 px-4 md:px-6 bg-[#EEF1FA] dark:bg-[#0F1530] [--rule:#D3DBF0] dark:[--rule:#222B58]"
        style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 35px, var(--rule) 35px, var(--rule) 36px)" }}
      >
        <div aria-hidden className="absolute inset-y-0 left-3 md:left-14 w-px bg-red-400/40" />
        <div className="container mx-auto max-w-6xl grid lg:grid-cols-[1.15fr_0.85fr] gap-12 items-center relative">
          <div className="space-y-6 md:pl-10">
            <h1 className="text-[2rem] sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight max-w-2xl" style={DISPLAY}>
              {t.hero.title}
            </h1>
            <p className="text-lg md:text-xl text-foreground/75 leading-relaxed max-w-xl">{t.hero.body}</p>
            <div className="pt-1">
              <a href={`${BOT_LINK}?text=Hi`} target="_blank" rel="noopener noreferrer" className={ctaClass} style={{ background: GREEN }}>
                <MessageCircle size={20} /> {c.cta}
              </a>
            </div>
            <p className="text-sm text-foreground/60">{t.hero.note}</p>
          </div>
          <ChatMock msgs={t.chat} />
        </div>
      </section>

      {/* How it works: a real sequence, so numbered */}
      <section id="how" style={section} className="py-20 md:py-24 px-4 md:px-6">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-10" style={DISPLAY}>
            {t.stepsTitle}
          </h2>
          <ol className="space-y-8">
            {t.steps.map((s, i) => (
              <li key={s.title} className="flex items-start gap-5">
                <span className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-extrabold text-lg" style={{ background: SUN, color: INK, ...DISPLAY }}>
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-xl font-bold mb-1" style={DISPLAY}>
                    {s.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed max-w-xl">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Price */}
      <section id="price" style={section} className="pb-20 md:pb-24 px-4 md:px-6">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-8" style={DISPLAY}>
            {t.pricing.title}
          </h2>
          <div className="grid md:grid-cols-[1fr_1.1fr] rounded-2xl overflow-hidden border border-border">
            <div className="p-8 md:p-10 flex flex-col justify-center" style={{ background: INK, color: "white" }}>
              <p className="text-4xl md:text-5xl font-extrabold leading-tight" style={DISPLAY}>
                {t.pricing.big}
              </p>
              <p className="mt-4 text-white/75 text-lg">{afterLine}</p>
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
              <a href={`${BOT_LINK}?text=Hi`} target="_blank" rel="noopener noreferrer" className={`${ctaClass} w-full`} style={{ background: GREEN }}>
                <MessageCircle size={20} /> {c.cta}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={section} className="pb-20 md:pb-24 px-4 md:px-6">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-8" style={DISPLAY}>
            {t.faqTitle}
          </h2>
          <Faq key={lang} items={t.faq} />
        </div>
      </section>

      {/* Contact: who we are, in plain sight */}
      <section id="contact" style={section} className="pb-20 md:pb-24 px-4 md:px-6">
        <div className="container mx-auto max-w-5xl text-white">
          <ContactBlock t={t.contact} />
        </div>
      </section>

      {showSticky && (
        <a
          href={BOT_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className={`${ctaClass} fixed bottom-4 inset-x-4 z-40 sm:hidden`}
          style={{ background: GREEN }}
        >
          <MessageCircle size={20} /> {c.cta}
        </a>
      )}
    </Shell>
  );
}

function ContactBlock({ t }: { t: Copy["contact"] }) {
  const row = "flex items-start gap-4";
  return (
    <div className="rounded-2xl p-8 md:p-12 grid md:grid-cols-[1fr_1.1fr] gap-10" style={{ background: INK }}>
      <div>
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4" style={DISPLAY}>
          {t.title}
        </h2>
        <p className="text-lg text-white/75 leading-relaxed max-w-md">{t.body}</p>
      </div>
      <div className="space-y-6">
        <div className={row}>
          <Phone size={22} className="mt-1 shrink-0" style={{ color: SUN }} />
          <div>
            <h3 className="font-bold text-lg">{t.support}</h3>
            <a href={SUPPORT_LINK} target="_blank" rel="noopener noreferrer" className="text-lg text-white/80 hover:text-white transition-colors">
              {SUPPORT_DISPLAY}
            </a>
            <p className="text-sm text-white/60 mt-1">{t.supportNote}</p>
          </div>
        </div>
        <div className={row}>
          <Mail size={22} className="mt-1 shrink-0" style={{ color: SUN }} />
          <div>
            <h3 className="font-bold text-lg">{t.email}</h3>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-lg text-white/80 hover:text-white transition-colors break-all">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
        <div className={row}>
          <MapPin size={22} className="mt-1 shrink-0" style={{ color: SUN }} />
          <div>
            <h3 className="font-bold text-lg">{t.address}</h3>
            <p className="text-lg text-white/80">{CONTACT_ADDRESS}</p>
          </div>
        </div>
        <div className={row}>
          <Building2 size={22} className="mt-1 shrink-0" style={{ color: SUN }} />
          <div>
            <h3 className="font-bold text-lg">{t.company}</h3>
            <p className="text-lg text-white/80">{t.companyValue}</p>
          </div>
        </div>
        <div className={row}>
          <Instagram size={22} className="mt-1 shrink-0" style={{ color: SUN }} />
          <div>
            <h3 className="font-bold text-lg">Instagram</h3>
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="text-lg text-white/80 hover:text-white transition-colors">
              @shopbrain_kigali
            </a>
          </div>
        </div>
      </div>
    </div>
  );

}
