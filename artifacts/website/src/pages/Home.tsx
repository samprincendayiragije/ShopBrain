import React, { useEffect, useRef, useState } from "react";
import { CSS, Reveal, CountUp, PhoneChat, Tilt, ScrollLine, SplitHeading, useMotion } from "./motion";
import PhoneScene from "./PhoneScene";
import { Menu, X, MessageCircle, Mail, Phone, MapPin, Instagram, ChevronDown, Check, Sun, Moon, Plus, Minus } from "lucide-react";

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

// Emoji icon per feature card (same order as the groups in the copy below)
const FEATURE_ICONS: Record<string, string[]> = {
  record: ["➕", "↩️", "💰", "🚦", "📅"],
  see: ["🔍", "📊", "📞", "🎉", "📥", "🚚"],
  remind: ["🔔", "🤖", "📵"],
  customers: ["💬", "✅", "🧾"],
};

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

type Feature = { title: string; desc: string; how: string[]; ex?: [string, string][] };
type Group = { id: string; label: string; blurb: string; items: Feature[] };

// ----- English feature groups -----
const enGroups: Group[] = [
  {
    id: "record",
    label: "Record",
    blurb: "Write debts and payments the way you would text a friend.",
    items: [
      {
        title: "Add a debt in one message",
        desc: "Type the number, name, item and amount. Shop Brain confirms before it saves.",
        how: [
          "Send: phone number, name, item, amount.",
          "No number? Leave it out and send name, item, amount.",
          "Shop Brain shows what it understood. Confirm and it is saved.",
          "For a new customer, it also asks if they agreed to reminders.",
        ],
        ex: [["me", "0788123456 Jean sugar 2000"], ["bot", "Jean · sugar · 2,000 RWF. Save? ✅"]],
      },
      {
        title: "Fix mistakes",
        desc: "Undo the last debt, edit a customer, and get warned about look-alike names.",
        how: [
          "Typed the wrong amount? Undo the last debt.",
          "Edit a customer's name or number any time.",
          "Two customers with the same name and no number? Shop Brain warns you so you do not mix them up.",
        ],
      },
      {
        title: "Mark as paid",
        desc: "Full or part payments, in one short message.",
        how: [
          "Send the customer's name and the amount paid, for example Jean 2000.",
          "Shop Brain takes it off the debt and shows the new balance.",
          "The customer gets a receipt.",
        ],
        ex: [["me", "Jean 2000"], ["bot", "✅ Jean paid 2,000 RWF. Balance: 0."]],
      },
      {
        title: "Credit limit",
        desc: "Set a limit for a customer and get warned before a debt goes over it.",
        how: [
          "Set a credit limit for a customer.",
          "When a new debt would pass the limit, Shop Brain warns you before saving.",
          "You decide with the facts in front of you.",
        ],
      },
      {
        title: "Promise date",
        desc: "Note the day a customer promised to pay.",
        how: [
          "Add the promised date to the customer's debt.",
          "Shop Brain keeps it for you.",
          "If the date passes and the debt is still open, the customer shows up in your follow-up list.",
        ],
      },
    ],
  },
  {
    id: "see",
    label: "See",
    blurb: "Know where your money is in a few seconds.",
    items: [
      {
        title: "Find a customer",
        desc: "Search by number or name to see their balance and history.",
        how: ["Send a name or a phone number.", "Shop Brain shows what they owe, plus every debt and payment."],
      },
      {
        title: "Lists and totals",
        desc: "All customers, total debt, a debt report, and today's activity.",
        how: [
          "Ask for all customers to see the full list.",
          "Ask for the total to see how much you are owed.",
          "Ask for the report or for today to get a summary.",
        ],
        ex: [["me", "TOTAL"], ["bot", "You are owed 48,500 RWF by 7 customers."]],
      },
      {
        title: "Follow-up list",
        desc: "Who to call or visit, and why.",
        how: [
          "Open the follow-up list.",
          "A customer appears when they have no number, replied STOP, a reminder failed to deliver, the debt is over 14 days old, or a promise date was missed.",
          "Call them or pass by their shop.",
        ],
      },
      {
        title: "Recovered",
        desc: "See how much Shop Brain helped you get back.",
        how: ["Ask for recovered any time.", "Every Monday, Shop Brain sends it to you by itself."],
        ex: [["bot", "ShopBrain recovered 12,000 RWF for you."]],
      },
      {
        title: "Export to Excel",
        desc: "All your debts in a file that opens in Excel.",
        how: ["Ask for the export.", "Shop Brain sends you a file.", "Open it in Excel to print, back up, or share with your accountant."],
      },
      {
        title: "Suppliers",
        desc: "A list of what you owe your suppliers.",
        how: ["Open the suppliers list.", "See who you owe and how much, next to what customers owe you."],
      },
    ],
  },
  {
    id: "remind",
    label: "Remind",
    blurb: "Get paid without nagging your customers.",
    items: [
      {
        title: "Manual reminders",
        desc: "Remind one customer or everyone, safely.",
        how: [
          "Choose one customer, or everyone who owes.",
          "Only customers who agreed to reminders get one.",
          "Nobody is messaged after replying STOP.",
          "A customer gets at most one reminder every 7 days.",
        ],
      },
      {
        title: "Auto-reminders",
        desc: "Switch it on once and Shop Brain follows up for you.",
        how: [
          "New owners start with it on. Existing owners turn it on themselves.",
          "Turning it on starts a 5-minute countdown. Tap Cancel before it ends if you change your mind.",
          "The first run reminds everyone who owes.",
          "After that, it checks every day between 09:00 and 18:00 and reminds debts that are 3 days old or more.",
          "You get short lines such as “Reminder to Jean read” or “not sent, no number”.",
        ],
      },
      {
        title: "No-number warning",
        desc: "If a customer has no number, you find out right away, with a button to fix it.",
        how: [
          "Shop Brain tells you the reminder could not be sent.",
          "Tap Add Number in the same message bubble.",
          "Send the number and the customer can be reached next time.",
        ],
      },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    blurb: "Your customers get a simple experience too.",
    items: [
      {
        title: "A simple menu",
        desc: "A customer who messages the bot sees three buttons.",
        how: ["My Balance shows what they owe.", "How to Pay shows how to pay you.", "Stop turns reminders off."],
      },
      {
        title: "Buttons on reminders",
        desc: "Reminders come with buttons, including I've paid.",
        how: [
          "The customer gets the reminder on WhatsApp.",
          "If they already paid, they tap I've paid.",
          "You get a ping to confirm. The debt only changes after you do.",
        ],
      },
      {
        title: "Receipts",
        desc: "Every payment gets a receipt.",
        how: ["You record a payment.", "The customer receives a receipt on WhatsApp.", "You both have proof."],
      },
    ],
  },
];

// ----- Kinyarwanda feature groups -----
const rwGroups: Group[] = [
  {
    id: "record",
    label: "Andika",
    blurb: "Andika imyenda n'ubwishyu nk'uko wandikira inshuti.",
    items: [
      {
        title: "Ongeraho umwenda mu butumwa bumwe",
        desc: "Andika numero, izina, igicuruzwa n'amafaranga. Shop Brain irabisubiramo mbere yo kubika.",
        how: [
          "Ohereza: numero ya telefone, izina, igicuruzwa, amafaranga.",
          "Nta numero? Yireke, wohereze izina, igicuruzwa, amafaranga.",
          "Shop Brain igaragaza icyo yumvise. Wemeje, ihita ibika.",
          "Ku mukiriya mushya, ibaza kandi niba yemeye inyibutsa.",
        ],
        ex: [["me", "0788123456 Jean isukari 2000"], ["bot", "Jean · isukari · 2,000 RWF. Mbike? ✅"]],
      },
      {
        title: "Gukosora amakosa",
        desc: "Kuraho umwenda wa nyuma, hindura umukiriya, kandi uburirwe iyo amazina asa.",
        how: [
          "Wanditse amafaranga atari yo? Kuraho umwenda wa nyuma.",
          "Hindura izina cyangwa numero y'umukiriya igihe icyo ari cyo cyose.",
          "Abakiriya babiri bafite izina rimwe kandi nta numero? Shop Brain iraguha umuburo ngo utabavanga.",
        ],
      },
      {
        title: "Kwandika ko yishyuye",
        desc: "Ubwishyu bwuzuye cyangwa bw'igice, mu butumwa bugufi.",
        how: [
          "Ohereza izina ry'umukiriya n'amafaranga yishyuye, nka Jean 2000.",
          "Shop Brain iyakura ku mwenda ikakwereka asigaye.",
          "Umukiriya ahabwa inyemezabwishyu.",
        ],
        ex: [["me", "Jean 2000"], ["bot", "✅ Jean yishyuye 2,000 RWF. Asigaye: 0."]],
      },
      {
        title: "Umupaka w'umwenda",
        desc: "Shyiraho umupaka ku mukiriya, uburirwe mbere yuko umwenda uwurenga.",
        how: [
          "Shyiraho umupaka w'umwenda ku mukiriya.",
          "Umwenda mushya warenza umupaka, Shop Brain iraguhwiturira mbere yo kubika.",
          "Ufata icyemezo uzi ukuri.",
        ],
      },
      {
        title: "Itariki yo kwishyura",
        desc: "Andika umunsi umukiriya yasezeranyije kwishyura.",
        how: [
          "Ongeraho itariki yasezeranyije ku mwenda we.",
          "Shop Brain irayibika.",
          "Iyo itariki ihise umwenda ugihari, umukiriya agaragara ku rutonde rwo gukurikirana.",
        ],
      },
    ],
  },
  {
    id: "see",
    label: "Reba",
    blurb: "Menya amafaranga yawe aho ari mu masegonda make.",
    items: [
      {
        title: "Shaka umukiriya",
        desc: "Shakisha ukoresheje numero cyangwa izina, ubone umwenda n'amateka ye.",
        how: ["Ohereza izina cyangwa numero ya telefone.", "Shop Brain igaragaza icyo abereyemo, n'imyenda n'ubwishyu bwose."],
      },
      {
        title: "Inyandiko n'ibiteranyo",
        desc: "Abakiriya bose, igiteranyo, raporo n'ibyabaye uyu munsi.",
        how: [
          "Saba abakiriya bose urebe urutonde rwuzuye.",
          "Saba igiteranyo urebe icyo ubereyemo.",
          "Saba raporo cyangwa uyu munsi ubone incamake.",
        ],
        ex: [["me", "IGITERANYO"], ["bot", "Abakubereyemo bose: 48,500 RWF (abakiriya 7)."]],
      },
      {
        title: "Urutonde rwo gukurikirana",
        desc: "Abo guhamagara cyangwa gusura, n'impamvu.",
        how: [
          "Fungura urutonde rwo gukurikirana.",
          "Umukiriya agaragaramo iyo nta numero afite, yohereje STOP, inyibutsa itagiye, umwenda umaze iminsi irenga 14, cyangwa itariki yasezeranyije yarenze.",
          "Muhamagare cyangwa umusure mu iduka.",
        ],
      },
      {
        title: "Ibyagarujwe",
        desc: "Reba amafaranga Shop Brain yagufashije kugarura.",
        how: ["Saba ibyagarujwe igihe cyose.", "Buri wa mbere, Shop Brain irabikohereza ubwayo."],
        ex: [["bot", "Shop Brain yagarurije 12,000 RWF."]],
      },
      {
        title: "Kohereza muri Excel",
        desc: "Imyenda yose muri dosiye ifungurwa na Excel.",
        how: ["Saba ko byoherezwa.", "Shop Brain iguha dosiye.", "Yifungurire muri Excel uyisohore, uyibike, cyangwa uyihe umucungamari."],
      },
      {
        title: "Abatanga ibicuruzwa",
        desc: "Urutonde rw'ibyo ubereyemo abagutangira ibicuruzwa.",
        how: ["Fungura urutonde rw'abatanga ibicuruzwa.", "Reba abo ubereyemo n'amafaranga, iruhande rw'ayo abakiriya bakubereyemo."],
      },
    ],
  },
  {
    id: "remind",
    label: "Inyibutsa",
    blurb: "Wishyurwe utarushye abakiriya.",
    items: [
      {
        title: "Inyibutsa wohereza ubwawe",
        desc: "Ibutsa umukiriya umwe cyangwa bose, mu mutekano.",
        how: [
          "Hitamo umukiriya umwe, cyangwa bose babereyemo.",
          "Inyibutsa igera gusa ku bemeye kuzibona.",
          "Nta butumwa bwoherezwa nyuma ya STOP.",
          "Umukiriya ahabwa inyibutsa imwe gusa mu minsi 7.",
        ],
      },
      {
        title: "Inyibutsa zikora ubwazo",
        desc: "Zifungure rimwe, Shop Brain ikurikirane ku bwawe.",
        how: [
          "Ba nyir'iduka bashya batangirana na zo zifunguye. Abasanzwe barazifungura ubwabo.",
          "Kuzifungura bitangiza kubara iminota 5. Kanda Cancel mbere yuko irangira niba wisubiyeho.",
          "Inshuro ya mbere ibutsa abantu bose babereyemo.",
          "Nyuma, igenzura buri munsi hagati ya 09:00 na 18:00, ikibutsa imyenda imaze iminsi 3 cyangwa irenga.",
          "Uhabwa imirongo mito nka “Jean yasomye inyibutsa” cyangwa “ntiyoherejwe, nta numero”.",
        ],
      },
      {
        title: "Umuburo wo kubura numero",
        desc: "Umukiriya nta numero afite? Ubimenyeshwa ako kanya, hamwe n'akabuto ko kubikosora.",
        how: [
          "Shop Brain ikubwira ko inyibutsa itashoboye kujya.",
          "Kanda Add Number mu butumwa bumwe.",
          "Ohereza numero, umukiriya azagerwaho ubutaha.",
        ],
      },
    ],
  },
  {
    id: "customers",
    label: "Abakiriya",
    blurb: "Abakiriya bawe na bo babona byoroshye.",
    items: [
      {
        title: "Menu yoroshye",
        desc: "Umukiriya wandikiye roboti abona utubuto dutatu.",
        how: ["My Balance imwereka icyo abereyemo.", "How to Pay imwereka uko akwishyura.", "Stop ihagarika inyibutsa."],
      },
      {
        title: "Utubuto ku nyibutsa",
        desc: "Inyibutsa ziza zifite utubuto, harimo I've paid.",
        how: [
          "Umukiriya ahabwa inyibutsa kuri WhatsApp.",
          "Niba yamaze kwishyura, akanda I've paid.",
          "Uhabwa ubutumwa wemeza. Umwenda uhinduka ari uko wemeje.",
        ],
      },
      {
        title: "Inyemezabwishyu",
        desc: "Buri bwishyu buhabwa inyemezabwishyu.",
        how: ["Wandika ubwishyu.", "Umukiriya ahabwa inyemezabwishyu kuri WhatsApp.", "Mwembi mugira gihamya."],
      },
    ],
  },
];

// ----- French feature groups -----
const frGroups: Group[] = [
  {
    id: "record",
    label: "Enregistrer",
    blurb: "Notez dettes et paiements comme vous écririez à un ami.",
    items: [
      {
        title: "Ajouter une dette en un message",
        desc: "Tapez le numéro, le nom, l'article et le montant. Shop Brain confirme avant d'enregistrer.",
        how: [
          "Envoyez : numéro, nom, article, montant.",
          "Pas de numéro ? Omettez-le et envoyez nom, article, montant.",
          "Shop Brain montre ce qu'il a compris. Confirmez et c'est enregistré.",
          "Pour un nouveau client, il demande aussi s'il accepte les rappels.",
        ],
        ex: [["me", "0788123456 Jean sucre 2000"], ["bot", "Jean · sucre · 2 000 RWF. Enregistrer ? ✅"]],
      },
      {
        title: "Corriger ses erreurs",
        desc: "Annulez la dernière dette, modifiez un client, et soyez prévenu en cas de noms identiques.",
        how: [
          "Mauvais montant ? Annulez la dernière dette.",
          "Modifiez le nom ou le numéro d'un client à tout moment.",
          "Deux clients du même nom sans numéro ? Shop Brain vous avertit pour éviter la confusion.",
        ],
      },
      {
        title: "Marquer comme payé",
        desc: "Paiement total ou partiel, en un court message.",
        how: [
          "Envoyez le nom du client et le montant payé, par exemple Jean 2000.",
          "Shop Brain le déduit de la dette et affiche le nouveau solde.",
          "Le client reçoit un reçu.",
        ],
        ex: [["me", "Jean 2000"], ["bot", "✅ Jean a payé 2 000 RWF. Solde : 0."]],
      },
      {
        title: "Limite de crédit",
        desc: "Fixez une limite pour un client et soyez prévenu avant de la dépasser.",
        how: [
          "Fixez une limite de crédit pour un client.",
          "Si une nouvelle dette la dépasse, Shop Brain vous prévient avant d'enregistrer.",
          "Vous décidez en connaissance de cause.",
        ],
      },
      {
        title: "Date de promesse",
        desc: "Notez le jour où un client a promis de payer.",
        how: [
          "Ajoutez la date promise à la dette du client.",
          "Shop Brain la garde pour vous.",
          "Si la date passe et que la dette reste ouverte, le client apparaît dans votre liste de relance.",
        ],
      },
    ],
  },
  {
    id: "see",
    label: "Consulter",
    blurb: "Sachez où est votre argent en quelques secondes.",
    items: [
      {
        title: "Trouver un client",
        desc: "Cherchez par numéro ou par nom : solde et historique.",
        how: ["Envoyez un nom ou un numéro.", "Shop Brain affiche ce qu'il doit, avec chaque dette et chaque paiement."],
      },
      {
        title: "Listes et totaux",
        desc: "Tous les clients, dette totale, rapport et activité du jour.",
        how: [
          "Demandez tous les clients pour la liste complète.",
          "Demandez le total pour savoir combien on vous doit.",
          "Demandez le rapport ou aujourd'hui pour un résumé.",
        ],
        ex: [["me", "TOTAL"], ["bot", "On vous doit 48 500 RWF (7 clients)."]],
      },
      {
        title: "Liste de relance",
        desc: "Qui appeler ou visiter, et pourquoi.",
        how: [
          "Ouvrez la liste de relance.",
          "Un client y figure s'il n'a pas de numéro, a répondu STOP, si un rappel n'a pas été livré, si sa dette a plus de 14 jours ou si sa date promise est dépassée.",
          "Appelez-le ou passez le voir.",
        ],
      },
      {
        title: "Récupéré",
        desc: "Voyez combien Shop Brain vous a aidé à récupérer.",
        how: ["Demandez « récupéré » à tout moment.", "Chaque lundi, Shop Brain vous l'envoie tout seul."],
        ex: [["bot", "Shop Brain a récupéré 12 000 RWF pour vous."]],
      },
      {
        title: "Export Excel",
        desc: "Toutes vos dettes dans un fichier qui s'ouvre dans Excel.",
        how: ["Demandez l'export.", "Shop Brain vous envoie un fichier.", "Ouvrez-le dans Excel pour imprimer, sauvegarder ou partager avec votre comptable."],
      },
      {
        title: "Fournisseurs",
        desc: "La liste de ce que vous devez à vos fournisseurs.",
        how: ["Ouvrez la liste des fournisseurs.", "Voyez qui vous devez payer et combien, à côté de ce que vos clients vous doivent."],
      },
    ],
  },
  {
    id: "remind",
    label: "Rappels",
    blurb: "Soyez payé sans harceler vos clients.",
    items: [
      {
        title: "Rappels manuels",
        desc: "Relancez un client ou tout le monde, en toute sécurité.",
        how: [
          "Choisissez un client, ou tous ceux qui doivent.",
          "Seuls les clients ayant accepté les rappels en reçoivent un.",
          "Personne n'est contacté après avoir répondu STOP.",
          "Un client reçoit au plus un rappel tous les 7 jours.",
        ],
      },
      {
        title: "Rappels automatiques",
        desc: "Activez-les une fois et Shop Brain relance pour vous.",
        how: [
          "Les nouveaux propriétaires démarrent avec l'option activée. Les autres l'activent eux-mêmes.",
          "L'activer lance un compte à rebours de 5 minutes. Touchez Cancel avant la fin si vous changez d'avis.",
          "Le premier passage relance tous ceux qui doivent.",
          "Ensuite, vérification chaque jour entre 09h00 et 18h00 : les dettes de 3 jours ou plus sont relancées.",
          "Vous recevez de courtes lignes comme « rappel lu par Jean » ou « non envoyé, pas de numéro ».",
        ],
      },
      {
        title: "Alerte numéro manquant",
        desc: "Un client sans numéro ? Vous le savez tout de suite, avec un bouton pour corriger.",
        how: [
          "Shop Brain vous dit que le rappel n'a pas pu partir.",
          "Touchez Add Number dans la même bulle de message.",
          "Envoyez le numéro : le client sera joignable la prochaine fois.",
        ],
      },
    ],
  },
  {
    id: "customers",
    label: "Clients",
    blurb: "Vos clients ont aussi une expérience simple.",
    items: [
      {
        title: "Un menu simple",
        desc: "Un client qui écrit au bot voit trois boutons.",
        how: ["My Balance montre ce qu'il doit.", "How to Pay lui montre comment vous payer.", "Stop coupe les rappels."],
      },
      {
        title: "Boutons dans les rappels",
        desc: "Les rappels arrivent avec des boutons, dont I've paid.",
        how: [
          "Le client reçoit le rappel sur WhatsApp.",
          "S'il a déjà payé, il touche I've paid.",
          "Vous recevez une alerte pour confirmer. La dette ne change qu'après votre confirmation.",
        ],
      },
      {
        title: "Reçus",
        desc: "Chaque paiement donne lieu à un reçu.",
        how: ["Vous enregistrez un paiement.", "Le client reçoit un reçu sur WhatsApp.", "Vous avez tous les deux une preuve."],
      },
    ],
  },
];

const en = {
  nav: { how: "How it works", features: "Features", pricing: "Pricing", faq: "FAQ", contact: "Contact", privacy: "Privacy" },
  hero: {
    title: "Know who owes you. Get paid sooner.",
    body: "Shop Brain keeps your customers' debts in WhatsApp. Add a debt in seconds, send reminders with one message, and see your total any time.",
    cta: "Chat on WhatsApp",
    more: "See how it works",
    note: "No app to install. First month free.",
    badge: "Recovered this week",
  },
  chat: {
    msgs: [
      { from: "me", text: "0788123456 Jean sugar 2000" },
      { from: "bot", text: "Jean · sugar · 2,000 RWF. Save? ✅" },
      { from: "bot", text: "✅ Saved. Jean owes 2,000 RWF." },
      { from: "bot", text: "🔔 Reminder to Jean read." },
      { from: "bot", text: "💰 Jean paid 2,000 RWF. Shop Brain recovered it for you." },
    ],
  },
  problem: {
    title: "Still keeping debts in a notebook?",
    body: "Pages get lost. Customers forget. Chasing them takes time you would rather spend selling.",
    notebook: ["Jean – 5,000", "Mama K – 12,000 (?)", "Eric – paid? no…"],
    notebookNote: "Who paid? Who didn't?",
    afterTitle: "With Shop Brain",
    after: [
      "Every debt saved, including part payments",
      "Reminders sent for you, only to customers who agreed",
      "A follow-up list that tells you who to call today",
      "Your total owed, in one message",
    ],
  },
  how: { title: "Four steps, all inside WhatsApp" },
  steps: [
    { title: "Text the bot", desc: "Message Shop Brain on WhatsApp like any contact. No install, no login." },
    { title: "Add a customer's debt", desc: "Send the name, item and amount in one message. Shop Brain confirms before it saves." },
    { title: "Shop Brain reminds them", desc: "Remind one customer or everyone, or switch on auto-reminders and let it follow up for you." },
    { title: "The customer pays", desc: "Mark the debt as paid, in full or in part. Your balance updates and the customer gets a receipt." },
  ],
  features: {
    title: "Everything Shop Brain does",
    sub: "Pick a topic, then tap any card to see exactly how it works.",
    how: "How it works",
    example: "Example",
    show: "Tap to see how",
    hide: "Tap to close",
    soonTitle: "Coming soon",
    soonTag: "Soon",
    soon: ["Voice notes", "Photo import of your notebook", "Edit or delete any debt", "Staff access"],
  },
  groups: enGroups,
  pricing: {
    title: "Simple pricing",
    big: "1 month free",
    after: "After that, a small monthly fee.",
    features: [
      "Track each customer's debt, with part payments",
      "Remind one customer or everyone, or let auto-reminders do it",
      "See your total owed, a follow-up list and receipts",
      "Works in English and Kinyarwanda",
    ],
    cta: "Start your free month",
  },
  faq: {
    title: "Questions shop owners ask",
    items: [
      { q: "Do I need to install an app?", a: "No. Shop Brain works inside WhatsApp, the app you already use." },
      { q: "Is my customers' data safe?", a: "Only you can see your shop's records. We never sell or share them." },
      { q: "Does it work in Kinyarwanda?", a: "Yes. The bot and the reminders work in Kinyarwanda and English." },
      { q: "Can my customers stop the reminders?", a: "Yes. Customers can reply STOP at any time, and they are never messaged again. Reminders also only go to customers who agreed to them." },
      { q: "What if I type something wrong?", a: "Shop Brain asks you to confirm before it saves a debt. You can also undo the last debt or edit a customer." },
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
  nav: { how: "Uko bikora", features: "Ibyo ikora", pricing: "Igiciro", faq: "Ibibazo", contact: "Twandikire", privacy: "Ibanga" },
  hero: {
    title: "Menya abakubereyemo imyenda. Wishyurwe vuba.",
    body: "Shop Brain ibika imyenda y'abakiriya bawe kuri WhatsApp. Andika umwenda mu masegonda, ohereza inyibutsa n'ubutumwa bumwe, kandi urebe igiteranyo cyose igihe cyose.",
    cta: "Tangira kuri WhatsApp",
    more: "Reba uko bikora",
    note: "Nta porogaramu ushyiramo. Ukwezi kwa mbere ni ubuntu.",
    badge: "Byagarujwe iki cyumweru",
  },
  chat: {
    msgs: [
      { from: "me", text: "0788123456 Jean isukari 2000" },
      { from: "bot", text: "Jean · isukari · 2,000 RWF. Mbike? ✅" },
      { from: "bot", text: "✅ Byanditswe. Jean abereyemo 2,000 RWF." },
      { from: "bot", text: "🔔 Jean yasomye inyibutsa." },
      { from: "bot", text: "💰 Jean yishyuye 2,000 RWF. Shop Brain yayagarurije." },
    ],
  },
  problem: {
    title: "Aracyandika imyenda mu gatabo?",
    body: "Impapuro zirazimira. Abakiriya baribagirwa. Kubakurikirana bigutwara umwanya wari gucuruza.",
    notebook: ["Jean – 5,000", "Mama K – 12,000 (?)", "Eric – yishyuye? oya…"],
    notebookNote: "Ni nde wishyuye? Ni nde utarishyura?",
    afterTitle: "Hamwe na Shop Brain",
    after: [
      "Buri mwenda urabitswe, harimo ubwishyu bw'igice",
      "Inyibutsa zoherezwa ku bwawe, ku bakiriya bemeye gusa",
      "Urutonde rukubwira abo guhamagara uyu munsi",
      "Igiteranyo cyawe mu butumwa bumwe",
    ],
  },
  how: { title: "Intambwe enye, byose kuri WhatsApp" },
  steps: [
    { title: "Andikira roboti", desc: "Ohereza ubutumwa kuri Shop Brain kuri WhatsApp nk'uko wandikira undi muntu. Nta gushyiramo, nta kwiyandikisha." },
    { title: "Ongeraho umwenda", desc: "Ohereza izina, igicuruzwa n'amafaranga mu butumwa bumwe. Shop Brain irabyemeza mbere yo kubika." },
    { title: "Shop Brain irabibutsa", desc: "Ibutsa umukiriya umwe cyangwa bose, cyangwa ufungure inyibutsa zikora ubwazo zikurikirane ku bwawe." },
    { title: "Umukiriya yishyura", desc: "Andika ko yishyuye, byose cyangwa igice. Konti yawe ivugururwa, umukiriya agahabwa inyemezabwishyu." },
  ],
  features: {
    title: "Ibyo Shop Brain ikora byose",
    sub: "Hitamo ingingo, hanyuma ukande ikarita ubone uko ikora neza.",
    how: "Uko ikora",
    example: "Urugero",
    show: "Kanda urebe uko bikorwa",
    hide: "Kanda ufunge",
    soonTitle: "Bizaza vuba",
    soonTag: "Vuba",
    soon: ["Ubutumwa bw'amajwi", "Gufotora igitabo ukakinjiza", "Guhindura cyangwa gusiba umwenda uwo ari wo wose", "Abakozi bakoresha konti"],
  },
  groups: rwGroups,
  pricing: {
    title: "Igiciro cyoroshye",
    big: "Ukwezi 1 k'ubuntu",
    after: "Nyuma, wishyura amafaranga make buri kwezi.",
    features: [
      "Bika umwenda wa buri mukiriya, n'ubwishyu bw'igice",
      "Ibutsa umukiriya umwe cyangwa bose, cyangwa inyibutsa zikore ubwazo",
      "Reba igiteranyo, urutonde rwo gukurikirana n'inyemezabwishyu",
      "Bikora mu Kinyarwanda no mu Cyongereza",
    ],
    cta: "Tangira ukwezi k'ubuntu",
  },
  faq: {
    title: "Ibibazo abacuruzi bakunze kubaza",
    items: [
      { q: "Ngomba gushyiramo porogaramu?", a: "Oya. Shop Brain ikorera muri WhatsApp, porogaramu usanzwe ukoresha." },
      { q: "Amakuru y'abakiriya banjye afite umutekano?", a: "Ni wowe wenyine ubona amakuru y'iduka ryawe. Ntitwigera tuyagurisha cyangwa ngo tuyahe abandi." },
      { q: "Ikora mu Kinyarwanda?", a: "Yego. Roboti n'inyibutsa bikora mu Kinyarwanda no mu Cyongereza." },
      { q: "Abakiriya bashobora guhagarika inyibutsa?", a: "Yego. Umukiriya ashobora kohereza STOP igihe icyo ari cyo cyose, ntiyongere kwandikirwa. Inyibutsa kandi zijya gusa ku bakiriya bazemeye." },
      { q: "Nandikiye nabi bimeze bite?", a: "Shop Brain igusaba kwemeza mbere yo kubika umwenda. Ushobora no gukuraho umwenda wa nyuma cyangwa guhindura amakuru y'umukiriya." },
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
  nav: { how: "Comment ça marche", features: "Fonctionnalités", pricing: "Tarif", faq: "FAQ", contact: "Contact", privacy: "Confidentialité" },
  hero: {
    title: "Sachez qui vous doit de l'argent. Soyez payé plus vite.",
    body: "Shop Brain garde les dettes de vos clients dans WhatsApp. Ajoutez une dette en quelques secondes, envoyez des rappels en un message et consultez votre total à tout moment.",
    cta: "Discuter sur WhatsApp",
    more: "Voir comment ça marche",
    note: "Aucune application à installer. Premier mois gratuit.",
    badge: "Récupéré cette semaine",
  },
  chat: {
    msgs: [
      { from: "me", text: "0788123456 Jean sucre 2000" },
      { from: "bot", text: "Jean · sucre · 2 000 RWF. Enregistrer ? ✅" },
      { from: "bot", text: "✅ Enregistré. Jean doit 2 000 RWF." },
      { from: "bot", text: "🔔 Rappel lu par Jean." },
      { from: "bot", text: "💰 Jean a payé 2 000 RWF. Shop Brain les a récupérés pour vous." },
    ],
  },
  problem: {
    title: "Vous notez encore les dettes dans un cahier ?",
    body: "Les pages se perdent. Les clients oublient. Les relancer vous prend du temps que vous préféreriez passer à vendre.",
    notebook: ["Jean – 5 000", "Mama K – 12 000 (?)", "Eric – payé ? non…"],
    notebookNote: "Qui a payé ? Qui n'a pas payé ?",
    afterTitle: "Avec Shop Brain",
    after: [
      "Chaque dette est enregistrée, paiements partiels compris",
      "Des rappels envoyés pour vous, seulement aux clients qui ont accepté",
      "Une liste de relance qui dit qui appeler aujourd'hui",
      "Votre total dû, en un seul message",
    ],
  },
  how: { title: "Quatre étapes, tout dans WhatsApp" },
  steps: [
    { title: "Écrivez au bot", desc: "Envoyez un message à Shop Brain sur WhatsApp comme à n'importe quel contact. Aucune installation, aucune connexion." },
    { title: "Ajoutez une dette", desc: "Envoyez le nom, l'article et le montant en un message. Shop Brain confirme avant d'enregistrer." },
    { title: "Shop Brain relance", desc: "Relancez un client ou tout le monde, ou activez les rappels automatiques et laissez-le relancer pour vous." },
    { title: "Le client paie", desc: "Marquez la dette comme payée, en totalité ou en partie. Votre solde se met à jour et le client reçoit un reçu." },
  ],
  features: {
    title: "Tout ce que fait Shop Brain",
    sub: "Choisissez un thème, puis touchez une carte pour voir comment ça marche.",
    how: "Comment ça marche",
    example: "Exemple",
    show: "Touchez pour voir comment",
    hide: "Touchez pour fermer",
    soonTitle: "Bientôt",
    soonTag: "Bientôt",
    soon: ["Notes vocales", "Import de votre cahier par photo", "Modifier ou supprimer n'importe quelle dette", "Accès pour le personnel"],
  },
  groups: frGroups,
  pricing: {
    title: "Un tarif simple",
    big: "1 mois gratuit",
    after: "Ensuite, un petit abonnement mensuel.",
    features: [
      "Suivez la dette de chaque client, avec paiements partiels",
      "Relancez un client ou tout le monde, ou laissez les rappels automatiques faire",
      "Consultez votre total dû, une liste de relance et des reçus",
      "Disponible en anglais et en kinyarwanda",
    ],
    cta: "Commencer le mois gratuit",
  },
  faq: {
    title: "Les questions des commerçants",
    items: [
      { q: "Dois-je installer une application ?", a: "Non. Shop Brain fonctionne dans WhatsApp, l'application que vous utilisez déjà." },
      { q: "Les données de mes clients sont-elles en sécurité ?", a: "Vous seul voyez les données de votre commerce. Nous ne les vendons ni ne les partageons jamais." },
      { q: "Est-ce disponible en kinyarwanda ?", a: "Oui. Le bot et les rappels fonctionnent en kinyarwanda et en anglais." },
      { q: "Mes clients peuvent-ils arrêter les rappels ?", a: "Oui. Un client peut répondre STOP à tout moment et ne sera plus jamais contacté. Les rappels ne partent d'ailleurs qu'aux clients qui les ont acceptés." },
      { q: "Et si je me trompe en écrivant ?", a: "Shop Brain vous demande de confirmer avant d'enregistrer une dette. Vous pouvez aussi annuler la dernière dette ou modifier un client." },
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
        <div className="absolute right-0 mt-2 w-44 bg-background border border-border rounded-md shadow-lg overflow-hidden z-50 sb-pop" style={{ transformOrigin: "top right" }}>
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
            <div
              className="grid"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", opacity: isOpen ? 1 : 0, transition: "grid-template-rows .45s cubic-bezier(.2,.7,.2,1), opacity .35s" }}
              aria-hidden={!isOpen}
            >
              <div className="overflow-hidden">
                <p className="pb-5 pr-10 text-muted-foreground leading-relaxed">{it.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Feature explorer: tabs for the four areas, and every card opens smoothly to
// show the steps (and a small chat example) for that feature.
function FeatureExplorer({ t }: { t: Copy }) {
  const [group, setGroup] = useState(0);
  const [openId, setOpenId] = useState<string | null>("record-0");
  const g = t.groups[group];
  const icons = FEATURE_ICONS[g.id] ?? [];

  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-2 mb-3">
        {t.groups.map((grp, i) => {
          const active = i === group;
          return (
            <button
              key={grp.id}
              role="tab"
              aria-selected={active}
              onClick={() => setGroup(i)}
              className={`px-5 py-2.5 rounded-full text-sm font-semibold border transition-all duration-300 ${
                active ? "bg-foreground text-background border-foreground shadow-md" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
              }`}
              style={DISPLAY}
            >
              {grp.label}
              <span className={`ml-2 text-xs ${active ? "opacity-70" : "opacity-60"}`}>{grp.items.length}</span>
            </button>
          );
        })}
      </div>

      <p key={g.id + "-blurb"} className="sb-rise text-lg text-muted-foreground mb-6 max-w-xl">
        {g.blurb}
      </p>

      <div key={g.id} className="grid md:grid-cols-2 gap-4 items-start">
        {g.items.map((f, i) => {
          const id = `${g.id}-${i}`;
          const isOpen = openId === id;
          return (
            <div
              key={id}
              className={`sb-rise sb-spot rounded-2xl border bg-card overflow-hidden transition-[border-color,box-shadow] duration-300 ${
                isOpen ? "border-foreground/30 shadow-lg" : "border-border hover:border-foreground/25"
              }`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <button
                onClick={() => setOpenId(isOpen ? null : id)}
                aria-expanded={isOpen}
                aria-controls={`panel-${id}`}
                className="w-full flex items-start gap-4 p-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                <span
                  className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-2xl transition-all duration-300"
                  style={{ background: isOpen ? SUN : "hsl(var(--muted))", transform: isOpen ? "rotate(-6deg) scale(1.05)" : "none" }}
                  aria-hidden
                >
                  {icons[i]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-lg font-bold leading-snug" style={DISPLAY}>
                    {f.title}
                  </span>
                  <span className="block text-muted-foreground leading-relaxed mt-1">{f.desc}</span>
                  <span className="block text-sm font-semibold mt-2" style={{ color: GREEN }}>
                    {isOpen ? t.features.hide : t.features.show}
                  </span>
                </span>
                <ChevronDown size={20} className="mt-1 shrink-0 text-muted-foreground transition-transform duration-500" style={{ transform: isOpen ? "rotate(180deg)" : "none" }} />
              </button>

              <div
                id={`panel-${id}`}
                role="region"
                aria-hidden={!isOpen}
                className="grid"
                style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", opacity: isOpen ? 1 : 0, transition: "grid-template-rows .5s cubic-bezier(.2,.7,.2,1), opacity .4s ease" }}
              >
                <div className="overflow-hidden">
                  <div className="px-5 pb-5 pt-4 border-t border-border/70">
                    <h4 className="font-bold mb-3" style={DISPLAY}>
                      {t.features.how}
                    </h4>
                    <ol className="space-y-3">
                      {f.how.map((step, si) => (
                        <li
                          key={si}
                          className="flex items-start gap-3"
                          style={{
                            opacity: isOpen ? 1 : 0,
                            transform: isOpen ? "none" : "translateX(-10px)",
                            transition: "opacity .45s ease, transform .45s cubic-bezier(.2,.7,.2,1)",
                            transitionDelay: isOpen ? `${180 + si * 90}ms` : "0ms",
                          }}
                        >
                          <span className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-extrabold mt-0.5" style={{ background: INK, color: "white" }}>
                            {si + 1}
                          </span>
                          <span className="leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>

                    {f.ex && (
                      <div className="mt-5 rounded-xl bg-[#0b141a] p-3 space-y-2">
                        <p className="text-[11px] font-semibold text-white/50 px-1">{t.features.example}</p>
                        {f.ex.map(([from, text], ei) => (
                          <div
                            key={ei}
                            className={`max-w-[88%] px-3 py-2 rounded-xl text-[13px] leading-snug text-white ${
                              from === "me" ? "ml-auto bg-[#005c4b] rounded-tr-sm" : "mr-auto bg-[#202c33] rounded-tl-sm"
                            }`}
                            style={{
                              opacity: isOpen ? 1 : 0,
                              transform: isOpen ? "none" : "translateY(8px) scale(.96)",
                              transition: "opacity .4s ease, transform .4s cubic-bezier(.2,.9,.3,1.2)",
                              transitionDelay: isOpen ? `${350 + f.how.length * 90 + ei * 350}ms` : "0ms",
                            }}
                          >
                            {text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 rounded-2xl border-2 border-dashed border-border p-5">
        <p className="font-bold mb-3" style={DISPLAY}>
          {t.features.soonTitle}
        </p>
        <ul className="flex flex-wrap gap-2">
          {t.features.soon.map((s) => (
            <li key={s} className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: SUN, color: INK }}>
                {t.features.soonTag}
              </span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [showSticky, setShowSticky] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lang, setLang] = useState<Lang>(() => {
    const s = typeof window !== "undefined" ? window.localStorage.getItem("shopbrain-lang") : null;
    return s === "rw" || s === "en" || s === "fr" ? s : "rw";
  });
  const { theme, toggleTheme } = useTheme();
  const t = copy[lang];
  useMotion();

  useEffect(() => {
    window.localStorage.setItem("shopbrain-lang", lang);
    document.documentElement.lang = lang; // keeps screen readers and browser translation correct
  }, [lang]);

  const botLink = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}`;
  const supportLink = `https://wa.me/${SUPPORT_NUMBER}`;

  const navLinks = [
    { name: t.nav.how, href: "#how-it-works" },
    { name: t.nav.features, href: "#features" },
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
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      const show = y > 500;
      setShowSticky((s) => (s === show ? s : show));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
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
    "sb-shine inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-semibold text-white text-lg shadow-lg shadow-black/10 hover:brightness-110 active:scale-[0.98] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <style>{CSS}</style>

      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <a href="#hero" onClick={(e) => scrollToSection(e, "#hero")} className="text-2xl font-extrabold tracking-tight" style={DISPLAY}>
            Shop Brain
          </a>

          <nav className="hidden md:flex items-center gap-6">
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
        <div aria-hidden ref={barRef} className="absolute bottom-0 left-0 h-[3px] w-full origin-left" style={{ background: SUN, transform: "scaleX(0)", willChange: "transform" }} />
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-background pt-20 px-4 md:hidden">
          <nav className="flex flex-col gap-2 p-4">
            {navLinks.map((l, i) => (
              <a
                key={l.href}
                href={l.href}
                onClick={(e) => scrollToSection(e, l.href)}
                className="sb-rise text-xl font-semibold py-3 border-b border-border/60"
                style={{ ...DISPLAY, animationDelay: `${i * 50}ms` }}
              >
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
              <h1 key={lang} className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight max-w-2xl" style={DISPLAY}>
                <SplitHeading text={t.hero.title} />
              </h1>
              <p className="sb-rise text-lg md:text-xl text-foreground/75 leading-relaxed max-w-xl" style={{ animationDelay: "450ms" }}>
                {t.hero.body}
              </p>
              <div className="sb-rise flex flex-wrap items-center gap-4 pt-2" style={{ animationDelay: "600ms" }}>
                <a href={`${botLink}?text=Hi`} target="_blank" rel="noopener noreferrer" className={`${ctaClass} sb-ring`} style={{ background: GREEN }} data-testid="link-hero-whatsapp">
                  <MessageCircle size={20} /> {t.hero.cta}
                </a>
                <a href="#how-it-works" onClick={(e) => scrollToSection(e, "#how-it-works")} className="px-5 py-3.5 rounded-full font-semibold border-2 border-foreground/20 hover:border-foreground/50 transition-colors">
                  {t.hero.more}
                </a>
              </div>
              <p className="sb-rise text-sm text-foreground/60" style={{ animationDelay: "700ms" }}>
                {t.hero.note}
              </p>
            </div>

            <div className="relative">
              <Tilt>
                <PhoneChat msgs={t.chat.msgs} />
              </Tilt>
              <div className="sb-float absolute -bottom-5 left-0 sm:-left-6 rounded-2xl border border-border bg-card px-4 py-3 shadow-xl flex items-center gap-3">
                <span className="text-2xl" aria-hidden>
                  🎉
                </span>
                <div className="leading-tight">
                  <div className="text-xs text-muted-foreground">{t.hero.badge}</div>
                  <div className="text-lg font-extrabold" style={DISPLAY}>
                    <CountUp to={48500} /> RWF
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem: notebook vs Shop Brain */}
        <section className="py-20 md:py-28 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl grid md:grid-cols-2 gap-14 items-center">
            <div
              data-seen className="relative rounded-md bg-[#FBF7E8] dark:bg-[#1B2140] border border-border shadow-md -rotate-1 px-8 py-7 [--rule:#CDD6EE] dark:[--rule:#2C3566]"
              style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 43px, var(--rule) 43px, var(--rule) 44px)" }}
            >
              {t.problem.notebook.map((line, i) => (
                <p key={line} className={`sb-write text-3xl leading-[44px] text-[#1B2559] dark:text-white/90 ${i === 2 ? "line-through decoration-2 opacity-60" : ""}`} style={HAND}>
                  {line}
                </p>
              ))}
              <p className="sb-write text-3xl leading-[44px] text-red-600 dark:text-red-400 mt-2" style={HAND}>
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

        {/* How it works: a real sequence, so numbered and revealed in order */}
        <section id="how-it-works" className="py-20 md:py-28 px-4 md:px-6 bg-muted/50 border-y border-border">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-12" style={DISPLAY}>
              {t.how.title}
            </h2>
            <ol className="relative">
              <ScrollLine />
              {t.steps.map((s, i) => (
                <Reveal as="li" delay={i * 90} key={s.title} className="relative pl-16 pb-10 last:pb-0">
                  <span className="absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-lg" style={{ background: SUN, color: INK, ...DISPLAY }}>
                    {i + 1}
                  </span>
                  <h3 className="text-xl font-bold mb-1" style={DISPLAY}>
                    {s.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed max-w-xl">{s.desc}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>
        <PhoneScene lang={lang} msgs={t.chat.msgs} /> 
        {/* Features: tabs + cards that open to explain each one */}
        <section id="features" className="py-20 md:py-28 px-4 md:px-6">
          <div className="container mx-auto max-w-6xl">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3" style={DISPLAY}>
              {t.features.title}
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-xl">{t.features.sub}</p>
            <FeatureExplorer t={t} />
          </div>
        </section>

        {/* Pricing: one ticket, not a grid of cards */}
        <section id="pricing" className="pb-20 md:pb-28 px-4 md:px-6">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-10" style={DISPLAY}>
              {t.pricing.title}
            </h2>
            <div className="grid md:grid-cols-[1fr_1.1fr] rounded-2xl overflow-hidden border border-border shadow-sm">
              <div className="p-8 md:p-10 flex flex-col justify-center" style={{ background: INK, color: "white" }}>
                <p className="text-4xl md:text-5xl font-extrabold leading-tight" style={DISPLAY}>
                  <span data-seen className="sb-mark px-1 -mx-1 rounded" style={{ color: INK }}>
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
      </main>

      {/* Mobile-only sticky button, appears once the hero has scrolled away */}
      {showSticky && (
        <a
          href={botLink}
          target="_blank"
          rel="noopener noreferrer"
          className={`${ctaClass} sb-rise fixed bottom-4 inset-x-4 z-40 md:hidden`}
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
                {navLinks.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      onClick={(e) => scrollToSection(e, l.href)}
                      className="text-white/70 hover:text-white transition-colors"
                    >
                      {l.name}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="/privacy" className="text-white/70 hover:text-white transition-colors">
                    {t.nav.privacy}
                  </a>
                </li>
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