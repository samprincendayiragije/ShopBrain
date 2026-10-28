import React from "react";
import { Link } from "wouter";
import { Bell, Check, ClipboardList, MessageCircle, Receipt } from "lucide-react";
import { BOT_LINK, CtaBand, DISPLAY, GREEN, INK, SUN, Shell, afterLine, common, ctaClass, usePageMeta, useLang, type Lang } from "./site";

type Copy = {
  hero: { title: string; body: string; note: string; more: string };
  chat: { from: "me" | "bot"; text: string }[];
  facts: string[];
  whatTitle: string;
  what: { title: string; desc: string }[];
  allFeatures: string;
  stepsTitle: string;
  steps: { title: string; desc: string }[];
  trustTitle: string;
  trust: string[];
  trustLink: string;
  priceTitle: string;
  priceLink: string;
};

const en: Copy = {
  hero: {
    title: "Know who owes you. Get paid sooner.",
    body: "Shop Brain keeps your customers' debts in WhatsApp. Record a debt in one message, remind customers politely, and see your total any time.",
    note: "No app to install. First month free.",
    more: "See features",
  },
  chat: [
    { from: "me", text: "0788123456 Jean sugar 2000" },
    { from: "bot", text: "Jean · sugar · 2,000 RWF. Save? ✅" },
    { from: "bot", text: "✅ Saved. Jean owes 2,000 RWF." },
    { from: "bot", text: "🔔 Reminder to Jean read." },
    { from: "bot", text: "💰 Jean paid 2,000 RWF." },
  ],
  facts: ["No app to install", "Works inside WhatsApp", "Reminders only with consent", "A receipt for every payment", "Export to Excel"],
  whatTitle: "What Shop Brain does",
  what: [
    { title: "Record debts", desc: "One message with the number, name, item and amount. Or send a photo of a page from your notebook." },
    { title: "Remind customers", desc: "Polite reminders go to customers who agreed to receive them. A reply of STOP is always respected." },
    { title: "Get paid, with proof", desc: "Mark part or full payments. Customers get a receipt, and you see your total owed at any time." },
  ],
  allFeatures: "All features",
  stepsTitle: "How it works",
  steps: [
    { title: "Message Shop Brain", desc: "Open WhatsApp and message Shop Brain like any contact. No install, no login." },
    { title: "Add a debt", desc: "Send the name, item and amount. Shop Brain confirms before it saves." },
    { title: "Get paid", desc: "Shop Brain reminds customers who agreed to reminders. When they pay, mark it paid and they get a receipt." },
  ],
  trustTitle: "Built to respect your customers",
  trust: ["Nothing is saved without your confirmation.", "Reminders only go to customers who agreed.", "Your records are yours, and you can export them."],
  trustLink: "How we protect your data",
  priceTitle: "Pricing",
  priceLink: "See pricing",
};

const rw: Copy = {
  hero: {
    title: "Menya abakubereyemo umwenda. Wishyurwe vuba.",
    body: "Shop Brain ibika imyenda y'abakiriya bawe kuri WhatsApp. Andika umwenda mu butumwa bumwe, ibutsa abakiriya mu bworoherane, kandi urebe igiteranyo cyawe igihe cyose.",
    note: "Nta porogaramu bisaba. Ukwezi kwa mbere ni ubuntu.",
    more: "Reba ibikorwa",
  },
  chat: [
    { from: "me", text: "0788123456 Jean isukari 2000" },
    { from: "bot", text: "Jean · isukari · 2,000 RWF. Mbike? ✅" },
    { from: "bot", text: "✅ Byabitswe. Jean abereyemo 2,000 RWF." },
    { from: "bot", text: "🔔 Jean yasomye inyibutsa." },
    { from: "bot", text: "💰 Jean yishyuye 2,000 RWF." },
  ],
  facts: ["Nta porogaramu ushyiramo", "Bikorera muri WhatsApp", "Inyibutsa ku bemeye gusa", "Inyemezabwishyu kuri buri bwishyu", "Kohereza muri Excel"],
  whatTitle: "Ibyo Shop Brain ikora",
  what: [
    { title: "Andika imyenda", desc: "Ubutumwa bumwe burimo numero, izina, igicuruzwa n'amafaranga. Cyangwa wohereze ifoto y'urupapuro rw'ikayi yawe." },
    { title: "Ibutsa abakiriya", desc: "Inyibutsa zoroheje zijya ku bakiriya bemeye kuzibona. STOP irubahirizwa buri gihe." },
    { title: "Wishyurwe, ufite gihamya", desc: "Andika ubwishyu bw'igice cyangwa bwose. Abakiriya bahabwa inyemezabwishyu, kandi ubona igiteranyo igihe cyose." },
  ],
  allFeatures: "Ibikorwa byose",
  stepsTitle: "Uko bikora",
  steps: [
    { title: "Andikira Shop Brain", desc: "Fungura WhatsApp wandikire Shop Brain nk'uko wandikira undi muntu. Nta porogaramu, nta kwinjira." },
    { title: "Ongeraho umwenda", desc: "Ohereza izina, igicuruzwa n'amafaranga. Shop Brain irabyemeza mbere yo kubika." },
    { title: "Wishyurwe", desc: "Shop Brain yibutsa abakiriya bemeye inyibutsa. Iyo bishyuye, wandika ko yishyuye, umukiriya agahabwa inyemezabwishyu." },
  ],
  trustTitle: "Yubakiwe kubaha abakiriya bawe",
  trust: ["Nta kibikwa utabyemeje.", "Inyibutsa zijya ku bemeye gusa.", "Amakuru ni ayawe, kandi ushobora kuyohereza muri Excel."],
  trustLink: "Uko turinda amakuru yawe",
  priceTitle: "Igiciro",
  priceLink: "Reba igiciro",
};

const fr: Copy = {
  hero: {
    title: "Sachez qui vous doit de l'argent. Soyez payé plus vite.",
    body: "Shop Brain garde les dettes de vos clients dans WhatsApp. Notez une dette en un message, relancez vos clients poliment et consultez votre total à tout moment.",
    note: "Aucune application à installer. Premier mois gratuit.",
    more: "Voir les fonctionnalités",
  },
  chat: [
    { from: "me", text: "0788123456 Jean sucre 2000" },
    { from: "bot", text: "Jean · sucre · 2 000 RWF. Enregistrer ? ✅" },
    { from: "bot", text: "✅ Enregistré. Jean doit 2 000 RWF." },
    { from: "bot", text: "🔔 Rappel lu par Jean." },
    { from: "bot", text: "💰 Jean a payé 2 000 RWF." },
  ],
  facts: ["Aucune application à installer", "Tout dans WhatsApp", "Rappels avec consentement", "Un reçu pour chaque paiement", "Export Excel"],
  whatTitle: "Ce que fait Shop Brain",
  what: [
    { title: "Enregistrer les dettes", desc: "Un message avec le numéro, le nom, l'article et le montant. Ou envoyez la photo d'une page de votre cahier." },
    { title: "Relancer les clients", desc: "Des rappels polis partent vers les clients qui ont accepté de les recevoir. STOP est toujours respecté." },
    { title: "Être payé, preuve à l'appui", desc: "Notez les paiements partiels ou complets. Vos clients reçoivent un reçu et vous voyez votre total à tout moment." },
  ],
  allFeatures: "Toutes les fonctionnalités",
  stepsTitle: "Comment ça marche",
  steps: [
    { title: "Écrivez à Shop Brain", desc: "Ouvrez WhatsApp et écrivez à Shop Brain comme à n'importe quel contact. Aucune installation, aucune connexion." },
    { title: "Ajoutez une dette", desc: "Envoyez le nom, l'article et le montant. Shop Brain confirme avant d'enregistrer." },
    { title: "Soyez payé", desc: "Shop Brain relance les clients qui ont accepté les rappels. Quand ils paient, marquez la dette comme payée et ils reçoivent un reçu." },
  ],
  trustTitle: "Conçu pour respecter vos clients",
  trust: ["Rien n'est enregistré sans votre confirmation.", "Les rappels ne partent qu'aux clients qui ont accepté.", "Vos données vous appartiennent et vous pouvez les exporter."],
  trustLink: "Comment nous protégeons vos données",
  priceTitle: "Tarif",
  priceLink: "Voir les tarifs",
};

const copy: Record<Lang, Copy> = { rw, en, fr };
const ICONS = [ClipboardList, Bell, Receipt];

function ChatMock({ msgs }: { msgs: Copy["chat"] }) {
  return (
    <div className="mx-auto w-full max-w-sm rounded-[2rem] border-[6px] border-[#1d2733] bg-[#0b141a] shadow-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] text-white">
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold" style={{ background: GREEN }}>
          SB
        </span>
        <div className="leading-tight">
          <div className="font-semibold text-sm">Shop Brain</div>
          <div className="text-[11px] text-white/60">WhatsApp</div>
        </div>
      </div>
      <div className="p-3 space-y-2 min-h-[20rem]">
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

export default function Home() {
  const [lang, setLang] = useLang();
  const t = copy[lang];
  const c = common[lang];
  usePageMeta(`Shop Brain · ${t.hero.title}`, t.hero.body);

  return (
    <Shell lang={lang} setLang={setLang}>
      {/* Hero */}
      <section className="px-4 md:px-6 py-14 md:py-24 bg-[#EEF1FA] dark:bg-[#0F1530]">
        <div className="container mx-auto max-w-6xl grid lg:grid-cols-[1.15fr_0.85fr] gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight max-w-2xl" style={DISPLAY}>
              {t.hero.title}
            </h1>
            <p className="text-lg md:text-xl text-foreground/75 leading-relaxed max-w-xl">{t.hero.body}</p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a href={`${BOT_LINK}?text=Hi`} target="_blank" rel="noopener noreferrer" className={ctaClass} style={{ background: GREEN }}>
                <MessageCircle size={20} /> {c.cta}
              </a>
              <Link href="/features" className="inline-flex items-center justify-center px-7 py-3.5 rounded-full font-semibold text-lg border border-foreground/30 hover:bg-foreground/5">
                {t.hero.more}
              </Link>
            </div>
            <p className="text-sm text-foreground/60">{t.hero.note}</p>
          </div>
          <ChatMock msgs={t.chat} />
        </div>
      </section>

      {/* Facts */}
      <section className="px-4 md:px-6 py-5 border-b border-border">
        <ul className="container mx-auto max-w-6xl flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm font-semibold text-foreground/80">
          {t.facts.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check size={16} style={{ color: GREEN }} strokeWidth={3} />
              {f}
            </li>
          ))}
        </ul>
      </section>

      {/* What it does */}
      <section className="px-4 md:px-6 py-16 md:py-24">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-10" style={DISPLAY}>
            {t.whatTitle}
          </h2>
          <div className="grid md:grid-cols-3 gap-x-10 gap-y-8">
            {t.what.map((w, i) => {
              const Icon = ICONS[i];
              return (
                <div key={w.title} className="border-t-2 pt-5" style={{ borderColor: INK }}>
                  <Icon size={26} style={{ color: GREEN }} />
                  <h3 className="text-xl font-bold mt-3 mb-2" style={DISPLAY}>
                    {w.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">{w.desc}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-10">
            <Link href="/features" className="font-semibold underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground">
              {t.allFeatures}
            </Link>
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 md:px-6 py-16 md:py-24 bg-muted/40 border-y border-border">
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

      {/* Trust and pricing */}
      <section className="px-4 md:px-6 py-16 md:py-24">
        <div className="container mx-auto max-w-6xl grid md:grid-cols-2 gap-12">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight mb-5" style={DISPLAY}>
              {t.trustTitle}
            </h2>
            <ul className="space-y-3 mb-6">
              {t.trust.map((x) => (
                <li key={x} className="flex items-start gap-3">
                  <Check size={20} className="mt-0.5 shrink-0" style={{ color: GREEN }} strokeWidth={3} />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
            <Link href="/trust" className="font-semibold underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground">
              {t.trustLink}
            </Link>
          </div>
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight mb-5" style={DISPLAY}>
              {t.priceTitle}
            </h2>
            <div className="rounded-2xl p-8 text-white" style={{ background: INK }}>
              <p className="text-4xl font-extrabold leading-tight" style={DISPLAY}>
                {c.freeMonth}
              </p>
              <p className="mt-3 text-white/75 text-lg">{afterLine(lang)}</p>
            </div>
            <p className="mt-6">
              <Link href="/pricing" className="font-semibold underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground">
                {t.priceLink}
              </Link>
            </p>
          </div>
        </div>
      </section>

      <CtaBand lang={lang} />
    </Shell>
  );
}