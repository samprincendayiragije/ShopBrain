import React, { useEffect, useRef, useState } from "react";
import { Check, MessageCircle, X } from "lucide-react";
import { prefersReducedMotion } from "./motion";

// Showcase sections for Home.tsx: advantages, notebook-vs-Shop Brain comparison,
// "a day with Shop Brain" timeline, and a money calculator.
//
// Performance rules (the audience is on modest Android phones):
//   - reveals are CSS transitions triggered once by IntersectionObserver
//   - no per-frame JavaScript except the calculator number tween
//   - no WebGL, no canvas, no blur() on large areas
//   - reduced-motion visitors see everything immediately
//
// Every claim below maps to a feature already described in Home.tsx.
// Do NOT add made-up testimonials or "X shops use us" numbers.

const INK = "#1B2559";
const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;
const SPRING = "cubic-bezier(.34,1.56,.64,1)";
const EASE = "cubic-bezier(.16,1,.3,1)";

type Lang = "rw" | "en" | "fr";
type Card = { e: string; t: string; d: string; k: string };
type Stat = { from: number; n: number; l: string };
type Row = { a: string; o: string; n: string };
type Step = { time: string; e: string; t: string; d: string; m: string };
type SC = {
  tag: string;
  title: string;
  sub: string;
  forLabel: string;
  forList: string[];
  stats: Stat[];
  cards: Card[];
  marquee: string[];
  cmpTitle: string;
  cmpSub: string;
  headOld: string;
  headNew: string;
  rows: Row[];
  dayTag: string;
  dayTitle: string;
  daySub: string;
  steps: Step[];
  calcTag: string;
  calcTitle: string;
  calcSub: string;
  debtors: string;
  avg: string;
  rate: string;
  owed: string;
  back: string;
  ofOwed: string;
  note: string;
  cta: string;
};

const COPY: Record<Lang, SC> = {
  en: {
    tag: "WHY SHOP BRAIN",
    title: "Everything a shop owner needs to get paid on time",
    sub: "Built around how shops in Kigali really sell on credit, not around how software usually works.",
    forLabel: "Built for",
    forList: ["🛒 Groceries & shops", "💇 Salons & barbers", "👗 Boutiques", "💊 Pharmacies", "🍽️ Restaurants & bars"],
    stats: [
      { from: 12, n: 0, l: "apps to install" },
      { from: 9, n: 1, l: "message to record a debt" },
      { from: 0, n: 7, l: "days minimum between reminders" },
      { from: 0, n: 5, l: "minutes to cancel auto-reminders" },
    ],
    cards: [
      { e: "⚡", t: "Record a debt in seconds", d: "One WhatsApp message: number, name, item, amount. Shop Brain confirms before it saves.", k: "No app. No login." },
      { e: "🔔", t: "Reminders without the awkward talk", d: "Polite reminders go out for you, only to customers who agreed to receive them.", k: "Auto 09:00–18:00" },
      { e: "📋", t: "Know who to call today", d: "The follow-up list shows who has no number, replied STOP, missed a reminder, is over 14 days late or broke a promise date.", k: "Follow-up list" },
      { e: "💰", t: "Your total in one message", d: "Total owed, a debt report and what Shop Brain recovered, sent to you every Monday.", k: "Weekly recovered" },
      { e: "🧾", t: "Proof for both sides", d: "Every payment gets a receipt. When a customer taps I've paid, the debt only changes after you confirm.", k: "Receipts" },
      { e: "🛡️", t: "Private, and respectful to customers", d: "Only you see your shop's records. STOP turns reminders off, and a customer gets at most one every 7 days.", k: "STOP respected" },
    ],
    marquee: ["No app to install", "Works inside WhatsApp", "Kinyarwanda and English", "Receipts for every payment", "Credit limits", "Promise dates", "Export to Excel", "First month free"],
    cmpTitle: "Notebook vs Shop Brain",
    cmpSub: "Same debts. Very different Mondays.",
    headOld: "Paper notebook",
    headNew: "Shop Brain",
    rows: [
      { a: "Finding a customer's debt", o: "Flip pages and hope", n: "Send a name, see the balance" },
      { a: "Part payments", o: "Cross out, rewrite, guess", n: "Subtracted, new balance shown" },
      { a: "Reminding customers", o: "You chase them in person", n: "Reminders sent for you" },
      { a: "Who to call today", o: "You try to remember", n: "A follow-up list tells you" },
      { a: "Proof of payment", o: "None", n: "Receipt on WhatsApp" },
      { a: "If the notebook is lost", o: "Everything is gone", n: "Saved. Export to Excel any time" },
    ],
    dayTag: "A DAY WITH SHOP BRAIN",
    dayTitle: "You sell. Shop Brain keeps the books and does the chasing.",
    daySub: "Here is what a normal day looks like once it is set up.",
    steps: [
      { time: "08:30", e: "☀️", t: "Open the shop, log yesterday's debts", d: "One message per debt. Shop Brain confirms before it saves.", m: "0788123456 Jean sugar 2000" },
      { time: "09:00", e: "🔔", t: "Auto-reminders start checking", d: "Between 09:00 and 18:00, debts 3 days old or more get a reminder, only for customers who agreed.", m: "🔔 Reminder to Jean read." },
      { time: "13:00", e: "✅", t: "A customer taps I've paid", d: "You get a ping to confirm. The debt only changes after you do.", m: "✅ Jean paid 2,000 RWF. Balance: 0." },
      { time: "17:30", e: "📞", t: "See who to call", d: "Open the follow-up list, then ask for your total.", m: "You are owed 48,500 RWF by 7 customers." },
      { time: "Monday", e: "🎉", t: "Your recovered summary", d: "Every Monday, Shop Brain sends it to you by itself.", m: "ShopBrain recovered 12,000 RWF for you." },
    ],
    calcTag: "DO THE MATH",
    calcTitle: "What could steady reminders be worth to you?",
    calcSub: "Move the sliders to match your own shop. This is your estimate, not a promise.",
    debtors: "Customers who owe you",
    avg: "Average debt (RWF)",
    rate: "Extra you collect with steady reminders",
    owed: "Owed to you right now",
    back: "Extra you could collect",
    ofOwed: "of what you are owed",
    note: "Illustration only. Real results depend on your customers.",
    cta: "Start your free month",
  },
  rw: {
    tag: "IMPAMVU YA SHOP BRAIN",
    title: "Ibyo nyir'iduka yose akeneye ngo yishyurwe ku gihe",
    sub: "Yubatswe ku buryo amaduka y'i Kigali acuruza ku mwenda koko, si ku buryo porogaramu zisanzwe zikora.",
    forLabel: "Byakorewe",
    forList: ["🛒 Amaduka", "💇 Salon n'abacuzi", "👗 Imyenda", "💊 Farumasi", "🍽️ Resitora na bar"],
    stats: [
      { from: 12, n: 0, l: "porogaramu ushyiramo" },
      { from: 9, n: 1, l: "ubutumwa bwandika umwenda" },
      { from: 0, n: 7, l: "iminsi nibura hagati y'inyibutsa" },
      { from: 0, n: 5, l: "iminota yo guhagarika inyibutsa zikora" },
    ],
    cards: [
      { e: "⚡", t: "Andika umwenda mu masegonda", d: "Ubutumwa bumwe kuri WhatsApp: numero, izina, igicuruzwa, amafaranga. Shop Brain irabyemeza mbere yo kubika.", k: "Nta porogaramu. Nta kwiyandikisha." },
      { e: "🔔", t: "Inyibutsa zitagusaba kuvuga", d: "Inyibutsa zoroheje zoherezwa ku bwawe, ku bakiriya bemeye kuzibona gusa.", k: "Zikora 09:00–18:00" },
      { e: "📋", t: "Menya abo guhamagara uyu munsi", d: "Urutonde rukwereka abatagira numero, abohereje STOP, inyibutsa zitagiye, imyenda irengeje iminsi 14, n'amatariki yarenze.", k: "Urutonde rwo gukurikirana" },
      { e: "💰", t: "Reba igiteranyo mu butumwa bumwe", d: "Igiteranyo, raporo y'imyenda n'ibyo Shop Brain yagaruje, bikoherezwa buri wa mbere.", k: "Ibyagarujwe buri cyumweru" },
      { e: "🧾", t: "Gihamya ku mpande zombi", d: "Buri bwishyu buhabwa inyemezabwishyu. Umukiriya ukanze I've paid, umwenda uhinduka ari uko wemeje.", k: "Inyemezabwishyu" },
      { e: "🛡️", t: "Ibanga n'icyubahiro ku bakiriya", d: "Ni wowe wenyine ubona amakuru y'iduka ryawe. STOP ihagarika inyibutsa, kandi umukiriya ahabwa imwe gusa mu minsi 7.", k: "STOP irubahirizwa" },
    ],
    marquee: ["Nta porogaramu ushyiramo", "Bikorera muri WhatsApp", "Ikinyarwanda n'Icyongereza", "Inyemezabwishyu kuri buri bwishyu", "Umupaka w'umwenda", "Itariki yo kwishyura", "Kohereza muri Excel", "Ukwezi kwa mbere ni ubuntu"],
    cmpTitle: "Igatabo vs Shop Brain",
    cmpSub: "Imyenda imwe. Ku wa mbere hatandukanye cyane.",
    headOld: "Igatabo cy'impapuro",
    headNew: "Shop Brain",
    rows: [
      { a: "Gushaka umwenda w'umukiriya", o: "Guhindura impapuro wizeye", n: "Ohereza izina, ubone umwenda" },
      { a: "Ubwishyu bw'igice", o: "Gusiba, kongera kwandika, gukeka", n: "Bukurwa ku mwenda, hakagaragara asigaye" },
      { a: "Kwibutsa abakiriya", o: "Ubakurikirana ubwawe", n: "Inyibutsa zoherezwa ku bwawe" },
      { a: "Abo guhamagara uyu munsi", o: "Wibuka wenyine", n: "Urutonde rukubwira" },
      { a: "Gihamya y'ubwishyu", o: "Nta yo", n: "Inyemezabwishyu kuri WhatsApp" },
      { a: "Igatabo cyazimiye", o: "Byose byagiye", n: "Byabitswe. Byohereze muri Excel igihe cyose" },
    ],
    dayTag: "UMUNSI UMWE NA SHOP BRAIN",
    dayTitle: "Wowe ucuruza. Shop Brain ibika imyenda ikanakurikirana.",
    daySub: "Dore uko umunsi usanzwe ubaye umaze gutangira.",
    steps: [
      { time: "08:30", e: "☀️", t: "Fungura iduka, wandike imyenda ya jana", d: "Ubutumwa bumwe kuri buri mwenda. Shop Brain irabyemeza mbere yo kubika.", m: "0788123456 Jean isukari 2000" },
      { time: "09:00", e: "🔔", t: "Inyibutsa zikora ubwazo", d: "Hagati ya 09:00 na 18:00, imyenda imaze iminsi 3 cyangwa irenga irabutswa, ku bemeye gusa.", m: "🔔 Jean yasomye inyibutsa." },
      { time: "13:00", e: "✅", t: "Umukiriya akanda I've paid", d: "Uhabwa ubutumwa wemeza. Umwenda uhinduka ari uko wemeje.", m: "✅ Jean yishyuye 2,000 RWF. Asigaye: 0." },
      { time: "17:30", e: "📞", t: "Reba abo guhamagara", d: "Fungura urutonde rwo gukurikirana, hanyuma usabe igiteranyo.", m: "Abakubereyemo bose: 48,500 RWF (abakiriya 7)." },
      { time: "Ku wa mbere", e: "🎉", t: "Raporo y'ibyagarujwe", d: "Buri wa mbere, Shop Brain irayikohereza ubwayo.", m: "Shop Brain yagarurije 12,000 RWF." },
    ],
    calcTag: "BARA",
    calcTitle: "Inyibutsa zihoraho zakumarira iki?",
    calcSub: "Hindura utubuto ukurikije iduka ryawe. Ni uko ubitekereza, si isezerano.",
    debtors: "Abakiriya bakubereyemo",
    avg: "Umwenda wa buri mukiriya (RWF)",
    rate: "Ayo wakwishyurwa arenga ku nyibutsa zihoraho",
    owed: "Ayo abakiriya bakubereyemo ubu",
    back: "Ayo wakwishyurwa arenga",
    ofOwed: "by'ayo ubereyemo",
    note: "Ni urugero gusa. Ibisubizo nyabyo biterwa n'abakiriya bawe.",
    cta: "Tangira ukwezi k'ubuntu",
  },
  fr: {
    tag: "POURQUOI SHOP BRAIN",
    title: "Tout ce qu'il faut à un commerçant pour être payé à temps",
    sub: "Pensé pour la vente à crédit telle qu'elle se pratique vraiment à Kigali, pas pour les logiciels habituels.",
    forLabel: "Conçu pour",
    forList: ["🛒 Épiceries et boutiques", "💇 Salons et coiffeurs", "👗 Boutiques de vêtements", "💊 Pharmacies", "🍽️ Restaurants et bars"],
    stats: [
      { from: 12, n: 0, l: "application à installer" },
      { from: 9, n: 1, l: "message pour noter une dette" },
      { from: 0, n: 7, l: "jours minimum entre deux rappels" },
      { from: 0, n: 5, l: "minutes pour annuler les rappels auto" },
    ],
    cards: [
      { e: "⚡", t: "Enregistrez une dette en quelques secondes", d: "Un message WhatsApp : numéro, nom, article, montant. Shop Brain confirme avant d'enregistrer.", k: "Ni appli, ni compte." },
      { e: "🔔", t: "Des rappels sans la gêne", d: "Des rappels polis partent pour vous, uniquement vers les clients qui ont accepté de les recevoir.", k: "Auto de 09h à 18h" },
      { e: "📋", t: "Sachez qui appeler aujourd'hui", d: "La liste de relance montre qui n'a pas de numéro, a répondu STOP, n'a pas reçu son rappel, a plus de 14 jours de retard ou une date dépassée.", k: "Liste de relance" },
      { e: "💰", t: "Votre total en un message", d: "Total dû, rapport des dettes et ce que Shop Brain a récupéré, envoyé chaque lundi.", k: "Récupéré chaque semaine" },
      { e: "🧾", t: "Une preuve pour les deux côtés", d: "Chaque paiement donne lieu à un reçu. Quand un client touche I've paid, la dette ne change qu'après votre confirmation.", k: "Reçus" },
      { e: "🛡️", t: "Privé, et respectueux des clients", d: "Vous seul voyez les données de votre commerce. STOP coupe les rappels, et un client en reçoit un seul tous les 7 jours au plus.", k: "STOP respecté" },
    ],
    marquee: ["Aucune application à installer", "Tout dans WhatsApp", "Kinyarwanda et anglais", "Un reçu pour chaque paiement", "Limites de crédit", "Dates de promesse", "Export Excel", "Premier mois gratuit"],
    cmpTitle: "Cahier ou Shop Brain",
    cmpSub: "Les mêmes dettes. Des lundis très différents.",
    headOld: "Cahier papier",
    headNew: "Shop Brain",
    rows: [
      { a: "Retrouver la dette d'un client", o: "Feuilleter en espérant", n: "Envoyez un nom, voyez le solde" },
      { a: "Paiements partiels", o: "Barrer, réécrire, deviner", n: "Déduits, nouveau solde affiché" },
      { a: "Relancer les clients", o: "Vous courez après eux", n: "Les rappels partent pour vous" },
      { a: "Qui appeler aujourd'hui", o: "Vous essayez de vous rappeler", n: "Une liste vous le dit" },
      { a: "Preuve de paiement", o: "Aucune", n: "Reçu sur WhatsApp" },
      { a: "Cahier perdu", o: "Tout est perdu", n: "Sauvegardé. Export Excel à tout moment" },
    ],
    dayTag: "UNE JOURNÉE AVEC SHOP BRAIN",
    dayTitle: "Vous vendez. Shop Brain tient les comptes et relance.",
    daySub: "Voici à quoi ressemble une journée normale une fois en place.",
    steps: [
      { time: "08:30", e: "☀️", t: "Ouvrez la boutique, notez les dettes d'hier", d: "Un message par dette. Shop Brain confirme avant d'enregistrer.", m: "0788123456 Jean sucre 2000" },
      { time: "09:00", e: "🔔", t: "Les rappels automatiques démarrent", d: "Entre 09h00 et 18h00, les dettes de 3 jours ou plus sont relancées, seulement pour les clients qui ont accepté.", m: "🔔 Rappel lu par Jean." },
      { time: "13:00", e: "✅", t: "Un client touche I've paid", d: "Vous recevez une alerte pour confirmer. La dette ne change qu'après vous.", m: "✅ Jean a payé 2 000 RWF. Solde : 0." },
      { time: "17:30", e: "📞", t: "Voyez qui appeler", d: "Ouvrez la liste de relance, puis demandez le total.", m: "On vous doit 48 500 RWF (7 clients)." },
      { time: "Lundi", e: "🎉", t: "Le récapitulatif récupéré", d: "Chaque lundi, Shop Brain vous l'envoie tout seul.", m: "Shop Brain a récupéré 12 000 RWF pour vous." },
    ],
    calcTag: "FAITES LE CALCUL",
    calcTitle: "Que pourraient valoir des rappels réguliers pour vous ?",
    calcSub: "Réglez les curseurs pour votre commerce. C'est votre estimation, pas une promesse.",
    debtors: "Clients qui vous doivent",
    avg: "Dette moyenne (RWF)",
    rate: "Encaissement supplémentaire grâce aux rappels",
    owed: "On vous doit en ce moment",
    back: "À encaisser en plus",
    ofOwed: "de ce qu'on vous doit",
    note: "Simple illustration. Les résultats réels dépendent de vos clients.",
    cta: "Commencer le mois gratuit",
  },
};

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS = `
.adv-blob{position:absolute;width:38rem;height:38rem;border-radius:50%;pointer-events:none}
.adv-blob-a{top:-10rem;left:-14rem;background:radial-gradient(circle,rgba(15,122,63,.16),transparent 65%);animation:adv-drift 16s ease-in-out infinite}
.adv-blob-b{bottom:-12rem;right:-14rem;background:radial-gradient(circle,rgba(255,201,51,.2),transparent 65%);animation:adv-drift 19s ease-in-out infinite reverse}
@keyframes adv-drift{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(40px,30px,0) scale(1.12)}}

/* reveal: any .adv-r inside an element that has data-in="1" (set once by IntersectionObserver) */
.adv-r{opacity:0;transform:translate(var(--tx,0),30px) scale(.97);filter:blur(6px);transition:opacity .8s ${EASE} var(--d,0ms),transform .9s ${EASE} var(--d,0ms),filter .7s ease var(--d,0ms)}
@media (min-width:768px){.adv-l{--tx:-52px}.adv-rt{--tx:52px}}
[data-in="1"] .adv-r{opacity:1;transform:none;filter:none}

.adv-tag{display:inline-flex;align-items:center;gap:.55rem;padding:.4rem .9rem;border-radius:9999px;font-size:.75rem;font-weight:800;letter-spacing:.16em;color:${INK};background:${SUN}}
.adv-pulse{width:.55rem;height:.55rem;border-radius:50%;background:${GREEN};animation:adv-pulse 1.8s ease-out infinite}
@keyframes adv-pulse{0%{box-shadow:0 0 0 0 rgba(15,122,63,.6)}100%{box-shadow:0 0 0 .6rem rgba(15,122,63,0)}}

.adv-chip{display:inline-block;padding:.45rem .9rem;border-radius:9999px;font-size:.875rem;font-weight:600;border:1px solid hsl(var(--border));background:hsl(var(--card));opacity:0;transform:scale(.6) translateY(10px);transition:opacity .5s ease var(--d,0ms),transform .7s ${SPRING} var(--d,0ms)}
[data-in="1"] .adv-chip{opacity:1;transform:none}

.adv-card{position:relative;overflow:hidden;height:100%;border-radius:1.25rem;border:1px solid hsl(var(--border));background:hsl(var(--card));padding:1.5rem;transition:transform .35s ${EASE},box-shadow .35s ease,border-color .35s ease}
.adv-card:hover{transform:translateY(-6px) rotate(-.4deg);border-color:rgba(15,122,63,.45);box-shadow:0 22px 48px -20px rgba(27,37,89,.4)}
.adv-card::after{content:"";position:absolute;top:-30%;bottom:-30%;left:0;width:38%;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,201,51,.24),transparent);transform:translateX(-200%) skewX(-18deg)}
.adv-card:hover::after{transition:transform .9s ease;transform:translateX(430%) skewX(-18deg)}
.adv-ico{width:3.25rem;height:3.25rem;border-radius:1rem;display:flex;align-items:center;justify-content:center;font-size:1.75rem;background:hsl(var(--muted));transition:background .3s,transform .4s ${SPRING}}
.adv-card:hover .adv-ico{background:${SUN};transform:rotate(-8deg) scale(1.1)}
[data-in="1"] .adv-ico span{display:inline-block;animation:adv-bob 3.4s ease-in-out infinite;animation-delay:var(--d,0ms)}
@keyframes adv-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.adv-k{display:inline-block;margin-top:1rem;padding:.25rem .7rem;border-radius:9999px;font-size:.72rem;font-weight:800;letter-spacing:.04em;color:${INK};background:rgba(255,201,51,.45)}

.adv-stat{transition:transform .35s ${EASE},box-shadow .35s}
.adv-stat:hover{transform:translateY(-4px);box-shadow:0 16px 36px -18px rgba(15,122,63,.55)}

/* ticker */
.adv-mq{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.adv-mq-track{display:flex;width:max-content;animation:adv-mq 40s linear infinite}
.adv-mq:hover .adv-mq-track{animation-play-state:paused}
@keyframes adv-mq{to{transform:translateX(-50%)}}

/* comparison */
.adv-strike{position:relative;display:inline-block}
.adv-strike::after{content:"";position:absolute;left:-2px;right:-2px;top:56%;height:2px;border-radius:2px;background:#dc2626;transform:scaleX(0);transform-origin:0 50%;transition:transform .8s ${EASE} calc(var(--d,0ms) + 500ms)}
[data-in="1"] .adv-strike::after{transform:scaleX(1)}
.adv-x{width:1.5rem;height:1.5rem;border-radius:9999px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#dc2626;background:rgba(220,38,38,.12)}
[data-in="1"] .adv-x{animation:adv-shake .6s ease both;animation-delay:calc(var(--d,0ms) + 350ms)}
@keyframes adv-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px) rotate(-10deg)}40%{transform:translateX(4px) rotate(10deg)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
.adv-tick{width:1.5rem;height:1.5rem;border-radius:9999px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;transform:scale(0) rotate(-60deg);transition:transform .6s ${SPRING} calc(var(--d,0ms) + 450ms)}
[data-in="1"] .adv-tick{transform:none}

/* day timeline */
.adv-line{transform:scaleY(0);transform-origin:50% 0;transition:transform 2.6s cubic-bezier(.4,0,.2,1)}
[data-in="1"] .adv-line{transform:scaleY(1)}
.adv-badge{width:2.5rem;height:2.5rem;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-size:1.15rem;background:${SUN};transform:scale(0);transition:transform .7s ${SPRING} .15s}
[data-in="1"] .adv-badge{transform:scale(1);animation:adv-ring 2.2s ease-out .8s 1}
@keyframes adv-ring{0%{box-shadow:0 0 0 0 rgba(255,201,51,.7)}100%{box-shadow:0 0 0 1rem rgba(255,201,51,0)}}
.adv-bub{opacity:0;transform:scale(.8) translateY(10px);transform-origin:0 0;transition:opacity .5s ease .55s,transform .7s ${SPRING} .55s}
[data-in="1"] .adv-bub{opacity:1;transform:none}

/* calculator */
.adv-bar{height:1rem;border-radius:9999px;overflow:hidden;background:rgba(255,255,255,.16)}
.adv-bar > i{display:block;height:100%;border-radius:9999px;background:linear-gradient(90deg,${SUN},#ffe08a);transition:width .6s ${EASE}}
.adv-range{width:100%;height:.5rem;cursor:pointer}

@media (prefers-reduced-motion:reduce){
  .adv-blob,.adv-pulse,.adv-mq-track,.adv-ico span,.adv-x,.adv-badge{animation:none !important}
  .adv-r,.adv-chip,.adv-bub{opacity:1;transform:none;filter:none;transition:none}
  .adv-line{transform:none;transition:none}
  .adv-tick,.adv-badge{transform:none;transition:none}
  .adv-strike::after{transform:scaleX(1);transition:none}
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const d = (ms: number) => ({ ["--d" as any]: `${ms}ms` } as React.CSSProperties);

const fmt = (n: number, lang: Lang) => {
  const s = Math.round(n).toLocaleString("en-US");
  return lang === "fr" ? s.replace(/,/g, "\u202f") : s;
};

// Sets data-in="1" once when the element scrolls into view. Children with .adv-r
// (or .adv-chip etc.) then transition in. The attribute is set on the DOM node
// directly, so React re-renders (language switch) never reset it.
function Seen({
  as: Tag = "div",
  className = "",
  style,
  threshold = 0.12,
  children,
}: {
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
  threshold?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      el.dataset.in = "1";
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.dataset.in = "1";
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -4% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  );
}

// Counts from `from` to `to` once, when it first becomes visible.
function Num({ from = 0, to }: { from?: number; to: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [v, setV] = useState(from);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      if (prefersReducedMotion()) {
        setV(to);
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 1500);
        const e = 1 - Math.pow(1 - p, 3);
        setV(Math.round(from + (to - from) * e));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    if (typeof IntersectionObserver === "undefined") {
      run();
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [from, to]);
  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {v}
    </span>
  );
}

// Smoothly follows a changing number (used by the calculator).
function useTween(target: number) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (prefersReducedMotion()) {
      cur.current = target;
      setV(target);
      return;
    }
    const from = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 550);
      const e = 1 - Math.pow(1 - p, 3);
      const val = from + (target - from) * e;
      cur.current = val;
      setV(val);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

const ctaClass =
  "sb-shine inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-semibold text-white text-lg shadow-lg shadow-black/10 hover:brightness-110 active:scale-[0.98] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

// ---------------------------------------------------------------------------
// 1. Advantages: stats, benefit cards, ticker, notebook comparison
// ---------------------------------------------------------------------------

export function WhyShopBrain({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const track = [...c.marquee, ...c.marquee];

  return (
    <section id="advantages" className="relative overflow-hidden py-20 md:py-28 px-4 md:px-6">
      <style>{CSS}</style>
      <div aria-hidden className="adv-blob adv-blob-a" />
      <div aria-hidden className="adv-blob adv-blob-b" />

      <div className="container mx-auto max-w-6xl relative">
        {/* header */}
        <Seen className="mb-12 max-w-3xl">
          <span className="adv-r adv-tag" style={d(0)}>
            <i className="adv-pulse" />
            {c.tag}
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mt-5 mb-4" style={DISPLAY}>
            {c.title}
          </h2>
          <p className="adv-r text-lg md:text-xl text-muted-foreground leading-relaxed" style={d(150)}>
            {c.sub}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-7">
            <span className="adv-r text-sm font-semibold text-muted-foreground mr-1" style={d(250)}>
              {c.forLabel}
            </span>
            {c.forList.map((f, i) => (
              <span key={f} className="adv-chip" style={d(320 + i * 80)}>
                {f}
              </span>
            ))}
          </div>
        </Seen>

        {/* real product facts, counted up */}
        <Seen className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-14">
          {c.stats.map((s, i) => (
            <div key={s.l} className="adv-r" style={d(i * 110)}>
              <div className="adv-stat rounded-2xl border border-border bg-card p-5 h-full">
                <div className="text-4xl md:text-5xl font-extrabold leading-none" style={{ ...DISPLAY, color: GREEN }}>
                  <Num from={s.from} to={s.n} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground leading-snug">{s.l}</p>
              </div>
            </div>
          ))}
        </Seen>

        {/* benefit cards */}
        <Seen className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5" threshold={0.06}>
          {c.cards.map((card, i) => (
            <div key={card.t} className="adv-r" style={d((i % 3) * 120 + Math.floor(i / 3) * 80)}>
              <div className="adv-card">
                <div className="adv-ico" style={d(i * 260)} aria-hidden>
                  <span>{card.e}</span>
                </div>
                <h3 className="text-xl font-bold leading-snug mt-5 mb-2" style={DISPLAY}>
                  {card.t}
                </h3>
                <p className="text-muted-foreground leading-relaxed">{card.d}</p>
                <span className="adv-k">{card.k}</span>
              </div>
            </div>
          ))}
        </Seen>

        {/* ticker */}
        <div className="adv-mq -mx-4 md:-mx-6 my-16 py-4 text-white" style={{ background: INK }} aria-hidden>
          <div className="adv-mq-track">
            {track.map((m, i) => (
              <span key={i} className="shrink-0 flex items-center gap-6 pr-6 text-base md:text-lg font-bold whitespace-nowrap" style={DISPLAY}>
                {m}
                <span style={{ color: SUN }}>✦</span>
              </span>
            ))}
          </div>
        </div>

        {/* notebook vs Shop Brain */}
        <Seen threshold={0.08}>
          <div className="adv-r mb-8 max-w-2xl">
            <h3 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-2" style={DISPLAY}>
              {c.cmpTitle}
            </h3>
            <p className="text-lg text-muted-foreground">{c.cmpSub}</p>
          </div>
          <div className="rounded-3xl border border-border overflow-hidden bg-card shadow-sm">
            <div className="hidden md:grid grid-cols-[1.1fr_1fr_1fr] text-sm font-bold">
              <div className="p-4" />
              <div className="p-4 text-muted-foreground">📓 {c.headOld}</div>
              <div className="p-4 text-white" style={{ background: GREEN }}>
                💬 {c.headNew}
              </div>
            </div>
            {c.rows.map((r, i) => (
              <div key={r.a} className="adv-r md:grid md:grid-cols-[1.1fr_1fr_1fr] border-t border-border" style={d(i * 120)}>
                <div className="px-4 pt-4 md:py-5 font-bold" style={DISPLAY}>
                  {r.a}
                </div>
                <div className="px-4 py-2 md:py-5 flex items-start gap-3 text-muted-foreground">
                  <span className="adv-x">
                    <X size={14} strokeWidth={3} />
                  </span>
                  <span className="adv-strike">{r.o}</span>
                </div>
                <div className="px-4 pb-4 pt-2 md:py-5 flex items-start gap-3 font-medium" style={{ background: "rgba(15,122,63,.09)" }}>
                  <span className="adv-tick" style={{ background: GREEN }}>
                    <Check size={14} strokeWidth={3} />
                  </span>
                  <span>{r.n}</span>
                </div>
              </div>
            ))}
          </div>
        </Seen>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 2. A day with Shop Brain
// ---------------------------------------------------------------------------

export function DayTimeline({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <section id="day" className="py-20 md:py-28 px-4 md:px-6 bg-muted/50 border-y border-border overflow-hidden">
      <div className="container mx-auto max-w-4xl">
        <Seen className="max-w-2xl mb-14">
          <span className="adv-r adv-tag" style={d(0)}>
            <i className="adv-pulse" />
            {c.dayTag}
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-5 mb-3" style={DISPLAY}>
            {c.dayTitle}
          </h2>
          <p className="adv-r text-lg text-muted-foreground" style={d(150)}>
            {c.daySub}
          </p>
        </Seen>

        <Seen as="ol" className="relative" threshold={0.05}>
          <div aria-hidden className="absolute left-5 md:left-1/2 top-2 bottom-2 w-0.5 -ml-px bg-border">
            <div className="adv-line absolute inset-0" style={{ background: `linear-gradient(${GREEN}, ${SUN})` }} />
          </div>
          {c.steps.map((s, i) => {
            const even = i % 2 === 0;
            return (
              <Seen
                as="li"
                key={s.t}
                threshold={0.2}
                className={`relative pl-16 md:pl-0 pb-10 last:pb-0 md:w-1/2 flex flex-col ${
                  even ? "md:pr-14 md:items-end md:text-right" : "md:ml-auto md:pl-14 md:items-start"
                }`}
              >
                <span aria-hidden className={`adv-badge absolute top-0 left-0 ${even ? "md:left-auto md:-right-5" : "md:-left-5"}`}>
                  {s.e}
                </span>
                <div className={`adv-r ${even ? "adv-l" : "adv-rt"}`} style={d(100)}>
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-extrabold tracking-wider" style={{ background: INK, color: "white" }}>
                    {s.time}
                  </span>
                  <h3 className="text-xl font-bold mt-3 mb-1" style={DISPLAY}>
                    {s.t}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed max-w-sm">{s.d}</p>
                  <div
                    className={`adv-bub mt-3 inline-block max-w-full px-3 py-2 text-[13px] leading-snug text-white text-left rounded-xl ${even ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                    style={{ background: i === 0 ? "#005c4b" : "#202c33", transformOrigin: even ? "100% 0" : "0 0" }}
                  >
                    {s.m}
                  </div>
                </div>
              </Seen>
            );
          })}
        </Seen>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3. Money calculator (the visitor sets every number; nothing here is a claim)
// ---------------------------------------------------------------------------

export function MoneyCalculator({ lang, botLink }: { lang: Lang; botLink: string }) {
  const c = COPY[lang];
  const [debtors, setDebtors] = useState(12);
  const [avg, setAvg] = useState(5000);
  const [rate, setRate] = useState(10);

  const owed = debtors * avg;
  const extra = (owed * rate) / 100;
  const owedShown = useTween(owed);
  const extraShown = useTween(extra);

  return (
    <section id="calculator" className="py-20 md:py-28 px-4 md:px-6">
      <div className="container mx-auto max-w-5xl">
        <Seen className="max-w-2xl mb-10">
          <span className="adv-r adv-tag" style={d(0)}>
            <i className="adv-pulse" />
            {c.calcTag}
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-5 mb-3" style={DISPLAY}>
            {c.calcTitle}
          </h2>
          <p className="adv-r text-lg text-muted-foreground" style={d(150)}>
            {c.calcSub}
          </p>
        </Seen>

        <Seen>
          <div className="adv-r grid md:grid-cols-[1.05fr_1fr] rounded-3xl overflow-hidden border border-border shadow-xl" style={d(100)}>
            {/* inputs */}
            <div className="p-7 md:p-10 bg-card space-y-8">
              <div>
                <div className="flex items-baseline justify-between gap-4 mb-3">
                  <label htmlFor="calc-debtors" className="font-semibold">
                    {c.debtors}
                  </label>
                  <span className="text-2xl font-extrabold" style={{ ...DISPLAY, color: GREEN }}>
                    {debtors}
                  </span>
                </div>
                <input id="calc-debtors" type="range" min={1} max={100} step={1} value={debtors} onChange={(e) => setDebtors(Number(e.target.value))} className="adv-range" style={{ accentColor: GREEN }} />
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-4 mb-3">
                  <label htmlFor="calc-avg" className="font-semibold">
                    {c.avg}
                  </label>
                  <span className="text-2xl font-extrabold" style={{ ...DISPLAY, color: GREEN }}>
                    {fmt(avg, lang)}
                  </span>
                </div>
                <input id="calc-avg" type="range" min={500} max={100000} step={500} value={avg} onChange={(e) => setAvg(Number(e.target.value))} className="adv-range" style={{ accentColor: GREEN }} />
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-4 mb-3">
                  <label htmlFor="calc-rate" className="font-semibold">
                    {c.rate}
                  </label>
                  <span className="text-2xl font-extrabold" style={{ ...DISPLAY, color: GREEN }}>
                    {rate}%
                  </span>
                </div>
                <input id="calc-rate" type="range" min={0} max={50} step={1} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="adv-range" style={{ accentColor: GREEN }} />
              </div>
            </div>

            {/* result */}
            <div className="relative p-7 md:p-10 text-white overflow-hidden" style={{ background: `radial-gradient(120% 90% at 80% 10%, #243066 0%, ${INK} 55%, #0F1530 100%)` }}>
              <div aria-hidden className="adv-blob adv-blob-b" style={{ width: "22rem", height: "22rem", right: "-8rem", bottom: "-10rem" }} />
              <div className="relative" aria-live="polite">
                <p className="text-sm font-semibold text-white/70">{c.owed}</p>
                <p className="text-4xl md:text-5xl font-extrabold mt-1 mb-6" style={{ ...DISPLAY, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(owedShown, lang)} <span className="text-xl text-white/60">RWF</span>
                </p>

                <div className="adv-bar" aria-hidden>
                  <i style={{ width: `${rate}%` }} />
                </div>
                <p className="text-xs text-white/60 mt-2 mb-6">
                  {rate}% {c.ofOwed}
                </p>

                <p className="text-sm font-semibold text-white/70">{c.back}</p>
                <p className="text-4xl md:text-5xl font-extrabold mt-1" style={{ ...DISPLAY, color: SUN, fontVariantNumeric: "tabular-nums" }}>
                  +{fmt(extraShown, lang)} <span className="text-xl" style={{ color: "rgba(255,201,51,.7)" }}>RWF</span>
                </p>
                <p className="text-xs text-white/55 mt-4 mb-7 max-w-xs">{c.note}</p>

                <a href={botLink} target="_blank" rel="noopener noreferrer" className={ctaClass} style={{ background: GREEN }}>
                  <MessageCircle size={20} /> {c.cta}
                </a>
              </div>
            </div>
          </div>
        </Seen>
      </div>
    </section>
  );
}