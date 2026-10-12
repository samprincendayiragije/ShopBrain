import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, MessageCircle, Lock } from "lucide-react";
import { LiveProof } from "./Trust";
import { useDrum } from "./drum";

// The /trust page: everything a careful shop owner (or their customer) wants to know,
// stated only as facts the bot already enforces. Register it in your router, for example
// with wouter:   <Route path="/trust" component={TrustPage} />
//
// Every statement below is taken from how the bot actually behaves today. If you change the
// bot (for example how long you keep data), change this page in the same commit.

const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const INK = "#1B2559";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;
const WHATSAPP_BUSINESS_NUMBER = "250788669259";
const SUPPORT_NUMBER = "250799627713"; // keep identical to Home.tsx

type Lang = "rw" | "en" | "fr";

const COPY = {
  en: {
    back: "Back to Shop Brain",
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
  },
  rw: {
    back: "Subira kuri Shop Brain",
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
  },
  fr: {
    back: "Retour à Shop Brain",
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
  },
} as const;

const LANGS: { code: Lang; label: string }[] = [
  { code: "rw", label: "Kinyarwanda" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];

const CSS = `
.tp-r{opacity:0;transform:translateY(24px);animation:tp-in .8s cubic-bezier(.16,1,.3,1) forwards;animation-delay:var(--d,0ms)}
@keyframes tp-in{to{opacity:1;transform:none}}
.tp-gate{position:relative;display:flex;gap:1rem;align-items:flex-start;padding:1rem 1.1rem;border-radius:1rem;border:1px solid hsl(var(--border));background:hsl(var(--card))}
.tp-n{flex:none;width:2.4rem;height:2.4rem;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;background:${SUN};color:${INK}}
@media (prefers-reduced-motion:reduce){.tp-r{opacity:1;transform:none;animation:none}}
`;

export default function TrustPage() {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const s = window.localStorage.getItem("shopbrain-lang");
      return s === "rw" || s === "en" || s === "fr" ? s : "en";
    } catch {
      return "en";
    }
  });
  useDrum();
  const c = COPY[lang];

  useEffect(() => {
    try {
      window.localStorage.setItem("shopbrain-lang", lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang;
    document.title = `Shop Brain · ${c.title}`;
    window.scrollTo(0, 0);
  }, [lang, c.title]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <style>{CSS}</style>
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto max-w-5xl px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} /> {c.back}
          </Link>
          <div className="flex gap-1" role="group" aria-label="Language">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
                className={`px-3 h-9 rounded-md text-sm font-semibold border transition-colors ${lang === l.code ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main>
        <section className="px-4 md:px-6 pt-16 md:pt-24 pb-12">
          <div className="container mx-auto max-w-4xl">
            <span className="tp-r inline-flex items-center gap-2 text-sm font-bold px-3 py-1 rounded-full" style={{ background: SUN, color: INK }}>
              <Lock size={14} /> Shop Brain
            </span>
            <h1 className="tp-r text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mt-5 mb-4" style={{ ...DISPLAY, ["--d" as any]: "80ms" }}>
              {c.title}
            </h1>
            <p className="tp-r text-lg md:text-xl text-muted-foreground max-w-2xl" style={{ ["--d" as any]: "160ms" }}>
              {c.sub}
            </p>
          </div>
        </section>

        <LiveProof lang={lang} />

        <section className="px-4 md:px-6 py-20">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-8" style={DISPLAY}>{c.storeTitle}</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {c.store.map((s) => (
                <div key={s.who} data-drum>
                  <div className="h-full rounded-2xl border border-border bg-card p-6">
                    <h3 className="font-bold text-lg mb-2" style={{ ...DISPLAY, color: GREEN }}>{s.who}</h3>
                    <p className="text-muted-foreground leading-relaxed">{s.what}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 font-semibold">{c.privacy}</p>
          </div>
        </section>

        <section className="px-4 md:px-6 py-20 bg-muted/50 border-y border-border">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3" style={DISPLAY}>{c.gateTitle}</h2>
            <p className="text-lg text-muted-foreground mb-8">{c.gateSub}</p>
            <ol className="space-y-3">
              {c.gates.map((g, i) => (
                <li key={g} data-drum>
                  <div className="tp-gate">
                    <span className="tp-n">{i + 1}</span>
                    <span className="leading-relaxed pt-1.5">{g}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 md:px-6 py-20">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-8" style={DISPLAY}>{c.ctrlTitle}</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                { t: c.custTitle, items: c.cust },
                { t: c.ownTitle, items: c.own },
              ].map((col) => (
                <div key={col.t} data-drum>
                  <div className="h-full rounded-2xl border border-border bg-card p-6">
                    <h3 className="font-bold text-xl mb-4" style={DISPLAY}>{col.t}</h3>
                    <ul className="space-y-3">
                      {col.items.map((it) => (
                        <li key={it} className="flex items-start gap-3">
                          <span className="mt-1 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-white" style={{ background: GREEN }}>
                            <Check size={12} strokeWidth={3} />
                          </span>
                          <span className="leading-relaxed">{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 md:px-6 py-20 text-white" style={{ background: INK }}>
          <div className="container mx-auto max-w-3xl text-center">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3" style={DISPLAY}>{c.ctaTitle}</h2>
            <p className="text-lg text-white/75 mb-8">{c.ctaBody}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <a href={`https://wa.me/${SUPPORT_NUMBER}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-semibold text-white text-lg hover:brightness-110 transition" style={{ background: GREEN }}>
                <MessageCircle size={20} /> {c.cta}
              </a>
              <a href={`https://wa.me/${WHATSAPP_BUSINESS_NUMBER}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-semibold text-lg border-2 border-white/30 hover:bg-white/10 transition">
                {c.chat}
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}