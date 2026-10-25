import React from "react";
import { Check, MessageCircle, Minus, Plus } from "lucide-react";
import { BOT_LINK, CtaBand, DISPLAY, GREEN, INK, PageHeader, Shell, afterLine, common, ctaClass, usePageMeta, useLang, type Lang } from "./site";

type Copy = {
  title: string;
  intro: string;
  features: string[];
  forTitle: string;
  forList: string[];
  faqTitle: string;
  faq: { q: string; a: string }[];
};

const en: Copy = {
  title: "Pricing",
  intro: "One simple plan for small shops. Start with a free month.",
  features: [
    "Every customer's debt, with part payments",
    "Reminders to one customer or everyone",
    "Your total owed, a follow-up list and receipts",
    "Notebook photo import and Excel export",
  ],
  forTitle: "Who it is for",
  forList: ["Groceries and small shops", "Salons and barbers", "Boutiques", "Any small business that sells on credit"],
  faqTitle: "Questions shop owners ask",
  faq: [
    { q: "Do I need to install an app?", a: "No. Shop Brain works inside WhatsApp, the app you already use." },
    { q: "How do I pay after the free month?", a: "Before it ends, we message you with the price and how to pay. Nothing is charged automatically." },
    { q: "Is my customers' data safe?", a: "Only you and the Shop Brain team (when we help you) can see your shop's records. We never sell them." },
    { q: "Can my customers stop the reminders?", a: "Yes. A customer can reply STOP at any time and is never messaged again." },
    { q: "What if I type something wrong?", a: "Shop Brain asks you to confirm before it saves a debt. You can also undo the last debt or edit a customer." },
    { q: "Can I take my records with me?", a: "Yes. Ask for the export and Shop Brain sends you a file that opens in Excel." },
  ],
};

const rw: Copy = {
  title: "Igiciro",
  intro: "Igiciro kimwe cyoroshye ku maduka mato. Tangirana n'ukwezi k'ubuntu.",
  features: [
    "Umwenda wa buri mukiriya, n'ubwishyu bw'igice",
    "Inyibutsa ku mukiriya umwe cyangwa bose",
    "Igiteranyo, urutonde rwo gukurikirana n'inyemezabwishyu",
    "Kwinjiza ifoto y'ikayi no kohereza muri Excel",
  ],
  forTitle: "Bigenewe bande",
  forList: ["Amaduka mato", "Salon n'abacuzi", "Amaduka y'imyenda", "Ubucuruzi ubwo ari bwo bwose bucuruza ku mwenda"],
  faqTitle: "Ibibazo abacuruzi bakunda kubaza",
  faq: [
    { q: "Ngomba gushyiramo porogaramu?", a: "Oya. Shop Brain ikorera muri WhatsApp, porogaramu usanzwe ukoresha." },
    { q: "Nishyura nte nyuma y'ukwezi k'ubuntu?", a: "Mbere yuko rurangira, tukwandikira tukubwira igiciro n'uko wishyura. Nta mafaranga yakwa ku buryo bwikora." },
    { q: "Amakuru y'abakiriya banjye afite umutekano?", a: "Ni wowe n'itsinda rya Shop Brain (iyo tugufasha) mwenyine mubona amakuru y'iduka ryawe. Ntitwigera tuyagurisha." },
    { q: "Abakiriya bashobora guhagarika inyibutsa?", a: "Yego. Umukiriya ashobora kohereza STOP igihe icyo ari cyo cyose, ntiyongere kwandikirwa." },
    { q: "Nandikiye nabi bimeze bite?", a: "Shop Brain igusaba kwemeza mbere yo kubika umwenda. Ushobora no gukuraho umwenda wa nyuma cyangwa guhindura amakuru y'umukiriya." },
    { q: "Nshobora kujyana amakuru yanjye?", a: "Yego. Saba ko byoherezwa, Shop Brain iguhe dosiye ifungurwa na Excel." },
  ],
};

const fr: Copy = {
  title: "Tarif",
  intro: "Une formule simple pour les petits commerces. Commencez par un mois gratuit.",
  features: [
    "La dette de chaque client, avec paiements partiels",
    "Rappels à un client ou à tout le monde",
    "Votre total dû, une liste de relance et des reçus",
    "Import de photo de cahier et export Excel",
  ],
  forTitle: "Pour qui",
  forList: ["Épiceries et petites boutiques", "Salons et coiffeurs", "Boutiques de vêtements", "Tout petit commerce qui vend à crédit"],
  faqTitle: "Les questions des commerçants",
  faq: [
    { q: "Dois-je installer une application ?", a: "Non. Shop Brain fonctionne dans WhatsApp, l'application que vous utilisez déjà." },
    { q: "Comment payer après le mois gratuit ?", a: "Avant la fin, nous vous écrivons avec le tarif et la façon de payer. Rien n'est prélevé automatiquement." },
    { q: "Les données de mes clients sont-elles en sécurité ?", a: "Seuls vous et l'équipe Shop Brain (quand nous vous aidons) voyez les données de votre commerce. Nous ne les vendons jamais." },
    { q: "Mes clients peuvent-ils arrêter les rappels ?", a: "Oui. Un client peut répondre STOP à tout moment et ne sera plus jamais contacté." },
    { q: "Et si je me trompe en écrivant ?", a: "Shop Brain vous demande de confirmer avant d'enregistrer une dette. Vous pouvez aussi annuler la dernière dette ou modifier un client." },
    { q: "Puis-je emporter mes données ?", a: "Oui. Demandez l'export et Shop Brain vous envoie un fichier qui s'ouvre dans Excel." },
  ],
};

const copy: Record<Lang, Copy> = { rw, en, fr };

export default function Pricing() {
  const [lang, setLang] = useLang();
  const t = copy[lang];
  const c = common[lang];
  usePageMeta(`${t.title} · Shop Brain`, t.intro);

  return (
    <Shell lang={lang} setLang={setLang}>
      <PageHeader title={t.title} intro={t.intro} />

      <section className="px-4 md:px-6 py-14 md:py-20">
        <div className="container mx-auto max-w-4xl">
          <div className="grid md:grid-cols-[1fr_1.1fr] rounded-2xl overflow-hidden border border-border">
            <div className="p-8 md:p-10 flex flex-col justify-center text-white" style={{ background: INK }}>
              <p className="text-4xl md:text-5xl font-extrabold leading-tight" style={DISPLAY}>
                {c.freeMonth}
              </p>
              <p className="mt-4 text-white/75 text-lg">{afterLine(lang)}</p>
            </div>
            <div className="p-8 md:p-10 bg-card">
              <ul className="space-y-3 mb-8">
                {t.features.map((f) => (
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

          <div className="mt-14">
            <h2 className="text-2xl font-extrabold tracking-tight mb-4" style={DISPLAY}>
              {t.forTitle}
            </h2>
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
              {t.forList.map((x) => (
                <li key={x} className="flex items-start gap-3">
                  <Check size={18} className="mt-1 shrink-0" style={{ color: GREEN }} strokeWidth={3} />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 pb-16 md:pb-24">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-3xl font-extrabold tracking-tight mb-6" style={DISPLAY}>
            {t.faqTitle}
          </h2>
          <div className="divide-y divide-border border-y border-border">
            {t.faq.map((it) => (
              <details key={it.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-semibold [&::-webkit-details-marker]:hidden" style={DISPLAY}>
                  {it.q}
                  <Plus size={18} className="shrink-0 group-open:hidden" />
                  <Minus size={18} className="shrink-0 hidden group-open:block" />
                </summary>
                <p className="pb-5 pr-10 text-muted-foreground leading-relaxed">{it.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CtaBand lang={lang} />
    </Shell>
  );
}