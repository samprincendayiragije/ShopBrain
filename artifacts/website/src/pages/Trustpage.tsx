import React from "react";
import { Check, MessageCircle } from "lucide-react";
import { BOT_LINK, DISPLAY, GREEN, INK, PageHeader, SUN, SUPPORT_LINK, Shell, ctaClass, usePageMeta, useLang, type Lang } from "./site";

// The /trust page: everything a careful shop owner (or their customer) wants to know,
// stated only as facts the bot already enforces.
// If you change the bot (for example how long you keep data), change this page in the same commit.

type Copy = {
  title: string;
  sub: string;
  storeTitle: string;
  store: { who: string; what: string }[];
  gateTitle: string;
  gateSub: string;
  gates: string[];
  ctrlTitle: string;
  custTitle: string;
  cust: string[];
  ownTitle: string;
  own: string[];
  privacy: string;
  ctaTitle: string;
  ctaBody: string;
  cta: string;
  chat: string;
};

const en: Copy = {
  title: "How Shop Brain protects your shop and your customers",
  sub: "No marketing language here. This page describes what the bot does today, in plain words.",
  storeTitle: "What Shop Brain stores",
  store: [
    { who: "About you", what: "Your WhatsApp number, shop name and language. If you set them up: your MoMo number, MoMo code, the name shown on MoMo, and a contact number." },
    { who: "About your customers", what: "Each customer's name, an optional phone number, what they took, what they owe, each payment, whether they agreed to reminders, and when they were last reminded." },
    { who: "About reminders", what: "Whether each reminder was sent, delivered, read or failed. This is what powers your follow-up list." },
    { who: "About STOP requests", what: "Only the phone number that replied STOP, so no shop can message it again." },
  ],
  gateTitle: "Five checks before any reminder leaves",
  gateSub: "Every reminder passes these in order. If one fails, nothing is sent and you are told why.",
  gates: [
    "The customer has a phone number on file.",
    "They have not replied STOP.",
    "They agreed to receive reminders.",
    "They owe something right now.",
    "They have not been reminded in the last 7 days (you can override a single reminder yourself).",
  ],
  ctrlTitle: "Who controls what",
  custTitle: "Your customers can",
  cust: ["Reply STOP at any time to end reminders, and START to turn them back on.", "Tap My Balance to see what they owe.", "Tap How to Pay to see how to pay you.", "Tap I've paid on a reminder. Nothing changes until you confirm it."],
  ownTitle: "You can",
  own: ["Undo the last debt and edit any customer.", "Set a credit limit and get warned before a debt passes it.", "Turn auto-reminders on or off. They only run between 09:00 and 18:00.", "Export every debt to an Excel file whenever you want.", "Lock the Shop Brain chat with your fingerprint or Face ID in WhatsApp."],
  privacy: "Only you can see your shop's records, and we never sell or share them.",
  ctaTitle: "Questions about your data?",
  ctaBody: "Message our team and a person will answer.",
  cta: "Message support",
  chat: "Chat with Shop Brain",
};

const rw: Copy = {
  title: "Uko Shop Brain irinda iduka ryawe n'abakiriya bawe",
  sub: "Nta magambo yo kwamamaza hano. Uru rupapuro rusobanura ibyo roboti ikora uyu munsi, mu magambo yoroshye.",
  storeTitle: "Ibyo Shop Brain ibika",
  store: [
    { who: "Kuri wowe", what: "Nimero yawe ya WhatsApp, izina ry'iduka n'ururimi. Iyo ubishyizeho: nimero ya MoMo, kode ya MoMo, izina rigaragara kuri MoMo, na nimero yo kuvugana." },
    { who: "Ku bakiriya bawe", what: "Izina ry'umukiriya, nimero ya telefone (si ngombwa), icyo yatwaye, icyo abereyemo, buri bwishyu, niba yemeye inyibutsa, n'igihe aheruka kwibutswa." },
    { who: "Ku nyibutsa", what: "Niba buri nyibutsa yoherejwe, yagezeyo, yasomwe cyangwa yanze. Ibi nibyo bikora urutonde rwo gukurikirana." },
    { who: "Ku basabye STOP", what: "Nimero yanditse STOP gusa, kugira ngo nta duka ryongera kuyandikira." },
  ],
  gateTitle: "Igenzura eshanu mbere yuko inyibutsa ijya",
  gateSub: "Buri nyibutsa inyura muri ibi bikurikiranye. Iyo kimwe kinaniwe, nta kintu cyoherezwa, kandi ubwirwa impamvu.",
  gates: [
    "Umukiriya afite nimero ya telefone.",
    "Ntiyanditse STOP.",
    "Yemeye kwakira inyibutsa.",
    "Hari icyo abereyemo ubu.",
    "Ntiyibutswe mu minsi 7 ishize (ushobora gukuraho iyi nzitizi ku nyibutsa imwe).",
  ],
  ctrlTitle: "Ni nde ugenzura iki",
  custTitle: "Abakiriya bawe bashobora",
  cust: ["Gusubiza STOP igihe icyo ari cyo cyose bagahagarika inyibutsa, na START bakazisubizaho.", "Gukanda My Balance bakareba icyo babereyemo.", "Gukanda How to Pay bakareba uko bakwishyura.", "Gukanda I've paid ku nyibutsa. Nta kihinduka utaremeza."],
  ownTitle: "Wowe ushobora",
  own: ["Gukuraho umwenda wa nyuma no guhindura umukiriya uwo ari we wese.", "Gushyiraho umupaka w'umwenda, ukaburirwa mbere yo kuwurenga.", "Gufungura cyangwa gufunga inyibutsa zikora ubwazo. Zikora hagati ya 09:00 na 18:00 gusa.", "Kohereza imyenda yose muri Excel igihe cyose ushaka.", "Gufunga ikiganiro cya Shop Brain n'igikumwe cyangwa Face ID muri WhatsApp."],
  privacy: "Ni wowe wenyine ubona amakuru y'iduka ryawe, kandi ntitwigera tuyagurisha cyangwa ngo tuyahe abandi.",
  ctaTitle: "Ufite ibibazo ku makuru yawe?",
  ctaBody: "Ohereza ubutumwa ku itsinda ryacu, umuntu azagusubiza.",
  cta: "Andikira ubufasha",
  chat: "Tangira kuri Shop Brain",
};

const fr: Copy = {
  title: "Comment Shop Brain protège votre commerce et vos clients",
  sub: "Pas de langage marketing ici. Cette page décrit ce que fait le bot aujourd'hui, en mots simples.",
  storeTitle: "Ce que Shop Brain enregistre",
  store: [
    { who: "Sur vous", what: "Votre numéro WhatsApp, le nom du commerce et la langue. Si vous les configurez : votre numéro MoMo, votre code MoMo, le nom affiché sur MoMo et un numéro de contact." },
    { who: "Sur vos clients", what: "Le nom de chaque client, un numéro facultatif, ce qu'il a pris, ce qu'il doit, chaque paiement, s'il a accepté les rappels et la date du dernier rappel." },
    { who: "Sur les rappels", what: "Si chaque rappel a été envoyé, livré, lu ou a échoué. C'est ce qui alimente votre liste de relance." },
    { who: "Sur les demandes STOP", what: "Uniquement le numéro qui a répondu STOP, pour qu'aucun commerce ne puisse plus le contacter." },
  ],
  gateTitle: "Cinq vérifications avant l'envoi d'un rappel",
  gateSub: "Chaque rappel les passe dans l'ordre. Si l'une échoue, rien n'est envoyé et vous savez pourquoi.",
  gates: [
    "Le client a un numéro de téléphone enregistré.",
    "Il n'a pas répondu STOP.",
    "Il a accepté de recevoir des rappels.",
    "Il doit quelque chose en ce moment.",
    "Il n'a pas été relancé ces 7 derniers jours (vous pouvez passer outre pour un seul rappel).",
  ],
  ctrlTitle: "Qui contrôle quoi",
  custTitle: "Vos clients peuvent",
  cust: ["Répondre STOP à tout moment pour arrêter les rappels, et START pour les rétablir.", "Toucher My Balance pour voir ce qu'ils doivent.", "Toucher How to Pay pour voir comment vous payer.", "Toucher I've paid sur un rappel. Rien ne change avant votre confirmation."],
  ownTitle: "Vous pouvez",
  own: ["Annuler la dernière dette et modifier n'importe quel client.", "Fixer une limite de crédit et être prévenu avant de la dépasser.", "Activer ou couper les rappels automatiques. Ils ne tournent qu'entre 09h00 et 18h00.", "Exporter toutes les dettes vers Excel quand vous voulez.", "Verrouiller la conversation Shop Brain avec votre empreinte ou Face ID dans WhatsApp."],
  privacy: "Vous seul voyez les données de votre commerce, et nous ne les vendons ni ne les partageons jamais.",
  ctaTitle: "Des questions sur vos données ?",
  ctaBody: "Écrivez à notre équipe, une personne vous répondra.",
  cta: "Écrire au support",
  chat: "Discuter avec Shop Brain",
};

const copy: Record<Lang, Copy> = { rw, en, fr };

export default function TrustPage() {
  const [lang, setLang] = useLang();
  const t = copy[lang];
  usePageMeta(`${t.title} · Shop Brain`, t.sub);

  return (
    <Shell lang={lang} setLang={setLang}>
      <PageHeader title={t.title} intro={t.sub} />

      <section className="px-4 md:px-6 py-14 md:py-20">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-extrabold tracking-tight mb-8" style={DISPLAY}>
            {t.storeTitle}
          </h2>
          <dl className="divide-y divide-border border-y border-border">
            {t.store.map((s) => (
              <div key={s.who} className="grid md:grid-cols-[14rem_1fr] gap-1 md:gap-8 py-4">
                <dt className="font-bold" style={{ ...DISPLAY, color: GREEN }}>
                  {s.who}
                </dt>
                <dd className="text-muted-foreground leading-relaxed">{s.what}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 font-semibold">{t.privacy}</p>
        </div>
      </section>

      <section className="px-4 md:px-6 py-14 md:py-20 bg-muted/40 border-y border-border">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-3xl font-extrabold tracking-tight mb-3" style={DISPLAY}>
            {t.gateTitle}
          </h2>
          <p className="text-lg text-muted-foreground mb-8">{t.gateSub}</p>
          <ol className="space-y-3">
            {t.gates.map((g, i) => (
              <li key={g} className="flex gap-4 items-start rounded-xl border border-border bg-card px-4 py-3">
                <span className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-extrabold" style={{ background: SUN, color: INK }}>
                  {i + 1}
                </span>
                <span className="leading-relaxed pt-1.5">{g}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 md:px-6 py-14 md:py-20">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-extrabold tracking-tight mb-8" style={DISPLAY}>
            {t.ctrlTitle}
          </h2>
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-10">
            {[
              { h: t.custTitle, items: t.cust },
              { h: t.ownTitle, items: t.own },
            ].map((col) => (
              <div key={col.h}>
                <h3 className="font-bold text-xl mb-4" style={DISPLAY}>
                  {col.h}
                </h3>
                <ul className="space-y-3">
                  {col.items.map((it) => (
                    <li key={it} className="flex items-start gap-3">
                      <Check size={18} className="mt-1 shrink-0" style={{ color: GREEN }} strokeWidth={3} />
                      <span className="leading-relaxed">{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 text-white" style={{ background: INK }}>
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight mb-3" style={DISPLAY}>
            {t.ctaTitle}
          </h2>
          <p className="text-lg text-white/75 mb-8">{t.ctaBody}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href={SUPPORT_LINK} target="_blank" rel="noopener noreferrer" className={ctaClass} style={{ background: GREEN }}>
              <MessageCircle size={20} /> {t.cta}
            </a>
            <a href={`${BOT_LINK}?text=Hi`} target="_blank" rel="noopener noreferrer" className={`${ctaClass} border-2 border-white/30 hover:bg-white/10`}>
              {t.chat}
            </a>
          </div>
        </div>
      </section>
    </Shell>
  );
}