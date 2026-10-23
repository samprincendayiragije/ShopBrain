import React, { useEffect } from "react";
import { Link } from "wouter";
import { COMPANY_NAME, CONTACT_ADDRESS, CONTACT_EMAIL, DISPLAY, SUPPORT_DISPLAY, Shell, useLang, type Lang } from "./site";

type Doc = { title: string; updated: string; back: string; sections: { h: string; p: string[] }[] };

const contactLine: Record<Lang, string> = {
  en: `Contact: ${CONTACT_EMAIL} or WhatsApp ${SUPPORT_DISPLAY}. ${COMPANY_NAME}, ${CONTACT_ADDRESS}.`,
  rw: `Twandikire: ${CONTACT_EMAIL} cyangwa WhatsApp ${SUPPORT_DISPLAY}. ${COMPANY_NAME}, ${CONTACT_ADDRESS}.`,
  fr: `Contact : ${CONTACT_EMAIL} ou WhatsApp ${SUPPORT_DISPLAY}. ${COMPANY_NAME}, ${CONTACT_ADDRESS}.`,
};

// ---------------------------------------------------------------------------
// Privacy Policy
// ---------------------------------------------------------------------------

const privacy: Record<Lang, Doc> = {
  en: {
    title: "Privacy Policy",
    updated: "Last updated: 23 October 2026",
    back: "Back to home",
    sections: [
      { h: "Who we are", p: [`Shop Brain is run by ${COMPANY_NAME}, a company registered in Rwanda. ${contactLine.en}`] },
      {
        h: "What we collect",
        p: [
          "From shop owners: your name, your WhatsApp number and the shop details you give us.",
          "From the records you enter: customer names and phone numbers, items, amounts, payments, promise dates and credit limits.",
          "Photos of notebook pages you send, so Shop Brain can read the debts in them, and the messages you send to the bot.",
        ],
      },
      {
        h: "Your customers",
        p: [
          "We keep the name and number you enter for a customer, whether they agreed to reminders, and what they reply (for example STOP or I've paid).",
          "A customer can reply STOP at any time. After that we do not message them again.",
        ],
      },
      {
        h: "How we use it",
        p: ["To run Shop Brain: save debts and payments, send reminders and receipts to customers who agreed, give you totals and reports, and fix problems."],
      },
      { h: "WhatsApp", p: ["Messages travel through WhatsApp, which is run by Meta. Their terms and privacy policy apply to that part."] },
      {
        h: "Who can see your data",
        p: [
          "Only you and the Shop Brain team (when we help you) can see your shop's records. We do not sell your data.",
          "We use service providers to run Shop Brain, for example for hosting, the database, WhatsApp delivery and reading photos. We share data with others only when the law requires it.",
        ],
      },
      {
        h: "Keeping and deleting data",
        p: [
          "We keep your records while you use Shop Brain. You can ask for a copy (the Excel export), a correction, or deletion of your data at any time by contacting us.",
        ],
      },
      { h: "Changes", p: ["If we change this policy, we will update the date at the top."] },
    ],
  },
  rw: {
    title: "Politiki y'ibanga",
    updated: "Yavuguruwe: 23 Ukwakira 2026",
    back: "Subira ahabanza",
    sections: [
      { h: "Turi bande", p: [`Shop Brain ikorwa na ${COMPANY_NAME}, ikigo cyanditswe mu Rwanda. ${contactLine.rw}`] },
      {
        h: "Amakuru dukusanya",
        p: [
          "Ku bacuruzi: izina ryawe, numero yawe ya WhatsApp n'amakuru y'iduka utubwiye.",
          "Ku byo wandika: amazina n'imibare ya telefone z'abakiriya, ibicuruzwa, amafaranga, ubwishyu, amatariki yo kwishyura n'imipaka y'umwenda.",
          "Amafoto y'impapuro z'ikayi wohereje kugira ngo Shop Brain isome imyenda irimo, n'ubutumwa wohereza kuri roboti.",
        ],
      },
      {
        h: "Abakiriya bawe",
        p: [
          "Tubika izina na numero wanditse ku mukiriya, niba yemeye inyibutsa, n'ibyo asubiza (nka STOP cyangwa I've paid).",
          "Umukiriya ashobora kohereza STOP igihe icyo ari cyo cyose. Nyuma yaho ntitwongera kumwandikira.",
        ],
      },
      {
        h: "Icyo tuyakoresha",
        p: ["Gukora Shop Brain: kubika imyenda n'ubwishyu, kohereza inyibutsa n'inyemezabwishyu ku bakiriya bemeye, kuguha ibiteranyo na raporo, no gukemura ibibazo."],
      },
      { h: "WhatsApp", p: ["Ubutumwa bunyura kuri WhatsApp, iyoborwa na Meta. Amategeko yabo na politiki yabo y'ibanga bireba iyo ngingo."] },
      {
        h: "Ubona amakuru yawe",
        p: [
          "Ni wowe n'itsinda rya Shop Brain (iyo tugufasha) mwenyine mubona amakuru y'iduka ryawe. Ntitugurisha amakuru yawe.",
          "Dukoresha abatanga serivisi badufasha gukora Shop Brain, nko kubika amakuru, kohereza ubutumwa kuri WhatsApp no gusoma amafoto. Dutanga amakuru ku bandi gusa iyo itegeko ribisaba.",
        ],
      },
      {
        h: "Kubika no gusiba amakuru",
        p: ["Tubika amakuru yawe igihe ukoresha Shop Brain. Ushobora igihe cyose kudusaba kopi (Excel), gukosora cyangwa gusiba amakuru yawe ukatwandikira."],
      },
      { h: "Impinduka", p: ["Nituhindura iyi politiki, tuzashyira itariki nshya hejuru."] },
    ],
  },
  fr: {
    title: "Politique de confidentialité",
    updated: "Dernière mise à jour : 23 octobre 2026",
    back: "Retour à l'accueil",
    sections: [
      { h: "Qui sommes-nous", p: [`Shop Brain est exploité par ${COMPANY_NAME}, société enregistrée au Rwanda. ${contactLine.fr}`] },
      {
        h: "Ce que nous collectons",
        p: [
          "Auprès des commerçants : votre nom, votre numéro WhatsApp et les informations sur votre commerce que vous nous donnez.",
          "Dans les données que vous saisissez : noms et numéros de téléphone des clients, articles, montants, paiements, dates promises et limites de crédit.",
          "Les photos de pages de cahier que vous envoyez, pour que Shop Brain lise les dettes qu'elles contiennent, et les messages que vous envoyez au bot.",
        ],
      },
      {
        h: "Vos clients",
        p: [
          "Nous conservons le nom et le numéro que vous saisissez pour un client, s'il a accepté les rappels, et ce qu'il répond (par exemple STOP ou I've paid).",
          "Un client peut répondre STOP à tout moment. Ensuite, nous ne le contactons plus.",
        ],
      },
      {
        h: "Comment nous les utilisons",
        p: ["Pour faire fonctionner Shop Brain : enregistrer dettes et paiements, envoyer rappels et reçus aux clients qui ont accepté, vous donner totaux et rapports, et résoudre les problèmes."],
      },
      { h: "WhatsApp", p: ["Les messages transitent par WhatsApp, exploité par Meta. Leurs conditions et leur politique de confidentialité s'appliquent à cette partie."] },
      {
        h: "Qui peut voir vos données",
        p: [
          "Seuls vous et l'équipe Shop Brain (quand nous vous aidons) pouvez voir les données de votre commerce. Nous ne vendons pas vos données.",
          "Nous faisons appel à des prestataires pour faire fonctionner Shop Brain, par exemple pour l'hébergement, la base de données, l'envoi WhatsApp et la lecture des photos. Nous ne partageons des données avec d'autres que si la loi l'exige.",
        ],
      },
      {
        h: "Conservation et suppression",
        p: ["Nous conservons vos données tant que vous utilisez Shop Brain. Vous pouvez à tout moment demander une copie (l'export Excel), une correction ou la suppression de vos données en nous contactant."],
      },
      { h: "Modifications", p: ["Si nous modifions cette politique, nous mettrons à jour la date en haut de la page."] },
    ],
  },
};

// ---------------------------------------------------------------------------
// Terms of Use
// ---------------------------------------------------------------------------

const terms: Record<Lang, Doc> = {
  en: {
    title: "Terms of Use",
    updated: "Last updated: 23 October 2026",
    back: "Back to home",
    sections: [
      { h: "Using Shop Brain", p: ["Shop Brain is a WhatsApp tool to record customer debts and send payment reminders. By messaging the bot you agree to these terms."] },
      { h: "Your records", p: ["You are responsible for what you enter. Check each debt before you confirm it."] },
      {
        h: "Reminders and consent",
        p: [
          "Only turn on reminders for a customer who agreed to be messaged. Customers can reply STOP at any time.",
          "Do not use Shop Brain to send spam, threats or anything unlawful.",
        ],
      },
      { h: "Free month and fees", p: ["The first month is free. After that a monthly fee applies. We will tell you the price before you pay anything."] },
      { h: "Your data", p: ["Your records belong to you and you can export them at any time. Our Privacy Policy explains how we handle data."] },
      {
        h: "Availability",
        p: ["We work to keep Shop Brain running, but we cannot promise it will always be available. It depends on WhatsApp and other services. Keep your own backup, for example the Excel export."],
      },
      {
        h: "Limits",
        p: [
          "Shop Brain helps you track debts and remind customers. It does not collect money for you, and we cannot promise that customers will pay.",
          "As far as the law allows, we are not responsible for losses caused by wrong entries, delays or outages.",
        ],
      },
      { h: "Ending", p: ["You can stop using Shop Brain at any time. We may suspend an account that breaks these terms."] },
      { h: "Law and contact", p: [`These terms follow the laws of Rwanda. ${contactLine.en}`] },
    ],
  },
  rw: {
    title: "Amabwiriza yo gukoresha",
    updated: "Yavuguruwe: 23 Ukwakira 2026",
    back: "Subira ahabanza",
    sections: [
      { h: "Gukoresha Shop Brain", p: ["Shop Brain ni igikoresho cya WhatsApp cyo kwandika imyenda y'abakiriya no kohereza inyibutsa yo kwishyura. Iyo wandikiye roboti, wemeye aya mabwiriza."] },
      { h: "Ibyo wandika", p: ["Ni wowe ushinzwe ibyo wandika. Suzuma buri mwenda mbere yo kuwemeza."] },
      {
        h: "Inyibutsa n'ukwemera",
        p: [
          "Fungura inyibutsa ku mukiriya wemeye kwandikirwa gusa. Abakiriya bashobora kohereza STOP igihe icyo ari cyo cyose.",
          "Ntukoreshe Shop Brain wohereza ubutumwa bwo kurakaza, iterabwoba cyangwa ikindi kinyuranyije n'amategeko.",
        ],
      },
      { h: "Ukwezi k'ubuntu n'igiciro", p: ["Ukwezi kwa mbere ni ubuntu. Nyuma haba amafaranga y'ukwezi. Tuzakubwira igiciro mbere yuko wishyura icyo ari cyo cyose."] },
      { h: "Amakuru yawe", p: ["Amakuru yawe ni ayawe, kandi ushobora kuyasohora igihe cyose. Politiki yacu y'ibanga isobanura uko tuyitaho."] },
      {
        h: "Kuboneka kwa serivisi",
        p: ["Dukora ngo Shop Brain ikomeze gukora, ariko ntidushobora kwizeza ko izaboneka buri gihe. Ishingiye kuri WhatsApp n'izindi serivisi. Bika kopi yawe, nka dosiye ya Excel."],
      },
      {
        h: "Aho bigarukira",
        p: [
          "Shop Brain igufasha gukurikirana imyenda no kwibutsa abakiriya. Ntikwakusanyiriza amafaranga, kandi ntidushobora kwizeza ko abakiriya bazishyura.",
          "Uko itegeko ribyemera, ntitubazwa igihombo giturutse ku byanditswe nabi, ku gutinda cyangwa ku kudakora kwa serivisi.",
        ],
      },
      { h: "Guhagarika", p: ["Ushobora guhagarika gukoresha Shop Brain igihe icyo ari cyo cyose. Dushobora guhagarika konti irenga kuri aya mabwiriza."] },
      { h: "Amategeko n'itumanaho", p: [`Aya mabwiriza akurikiza amategeko y'u Rwanda. ${contactLine.rw}`] },
    ],
  },
  fr: {
    title: "Conditions d'utilisation",
    updated: "Dernière mise à jour : 23 octobre 2026",
    back: "Retour à l'accueil",
    sections: [
      { h: "Utiliser Shop Brain", p: ["Shop Brain est un outil WhatsApp pour noter les dettes des clients et envoyer des rappels de paiement. En écrivant au bot, vous acceptez ces conditions."] },
      { h: "Vos données saisies", p: ["Vous êtes responsable de ce que vous saisissez. Vérifiez chaque dette avant de la confirmer."] },
      {
        h: "Rappels et consentement",
        p: [
          "N'activez les rappels que pour un client qui a accepté d'être contacté. Un client peut répondre STOP à tout moment.",
          "N'utilisez pas Shop Brain pour envoyer du spam, des menaces ou quoi que ce soit d'illégal.",
        ],
      },
      { h: "Mois gratuit et tarif", p: ["Le premier mois est gratuit. Ensuite, un abonnement mensuel s'applique. Nous vous indiquerons le prix avant tout paiement."] },
      { h: "Vos données", p: ["Vos données vous appartiennent et vous pouvez les exporter à tout moment. Notre politique de confidentialité explique comment nous les traitons."] },
      {
        h: "Disponibilité",
        p: ["Nous faisons notre possible pour que Shop Brain fonctionne, mais nous ne pouvons pas promettre qu'il sera toujours disponible. Il dépend de WhatsApp et d'autres services. Gardez votre propre sauvegarde, par exemple l'export Excel."],
      },
      {
        h: "Limites",
        p: [
          "Shop Brain vous aide à suivre les dettes et à relancer les clients. Il n'encaisse pas d'argent pour vous, et nous ne pouvons pas promettre que les clients paieront.",
          "Dans les limites permises par la loi, nous ne sommes pas responsables des pertes causées par des saisies erronées, des retards ou des pannes.",
        ],
      },
      { h: "Fin d'utilisation", p: ["Vous pouvez arrêter d'utiliser Shop Brain à tout moment. Nous pouvons suspendre un compte qui enfreint ces conditions."] },
      { h: "Droit applicable et contact", p: [`Ces conditions suivent les lois du Rwanda. ${contactLine.fr}`] },
    ],
  },
};

// ---------------------------------------------------------------------------
// Page layout
// ---------------------------------------------------------------------------

function LegalPage({ docs }: { docs: Record<Lang, Doc> }) {
  const [lang, setLang] = useLang();
  const d = docs[lang];

  useEffect(() => {
    document.title = `${d.title} · Shop Brain`;
    window.scrollTo(0, 0);
  }, [d.title]);

  return (
    <Shell lang={lang} setLang={setLang} showNav={false}>
      <article className="container mx-auto max-w-3xl px-4 md:px-6 py-12 md:py-16">
        <Link href="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
          ← {d.back}
        </Link>
        <h1 className="mt-6 text-4xl md:text-5xl font-extrabold tracking-tight" style={DISPLAY}>
          {d.title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{d.updated}</p>

        <div className="mt-10 space-y-9">
          {d.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-xl font-bold mb-2" style={DISPLAY}>
                {s.h}
              </h2>
              <div className="space-y-3">
                {s.p.map((para) => (
                  <p key={para} className="leading-relaxed text-foreground/80">
                    {para}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </Shell>
  );
}

export function Privacy() {
  return <LegalPage docs={privacy} />;
}

export function Terms() {
  return <LegalPage docs={terms} />;
}