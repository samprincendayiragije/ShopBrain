import React from "react";
import { Link } from "wouter";
import {
  COMPANY_NAME,
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  CtaBand,
  DISPLAY,
  FOUNDER_NAME,
  PageHeader,
  SUPPORT_DISPLAY,
  SUPPORT_LINK,
  Shell,
  usePageMeta,
  useLang,
  type Lang,
} from "./site";

type Copy = {
  title: string;
  intro: string;
  whoTitle: string;
  who: string;
  whyTitle: string;
  why: string;
  principlesTitle: string;
  principles: { title: string; desc: string }[];
  detailsTitle: string;
  labels: { company: string; registration: string; registrationValue: string; founder: string; address: string; email: string; whatsapp: string };
  contact: string;
};

const en: Copy = {
  title: "About Shop Brain",
  intro: "Shop Brain helps small shop owners in Rwanda keep track of customer debts and get paid, without installing anything.",
  whoTitle: "Who we are",
  who: `Shop Brain is run by ${COMPANY_NAME}, a company registered in Rwanda and built in Kigali. We make one thing: a WhatsApp tool for recording customer debts, reminding customers politely and keeping proof of payments.`,
  whyTitle: "Why we built it",
  why: "Many shops in Kigali sell on credit and keep the record in a notebook. Debts get forgotten, pages get lost, and asking a customer to pay can be awkward. Shop Brain moves that record into WhatsApp, which shop owners already use every day, so there is nothing new to learn or install.",
  principlesTitle: "How we work",
  principles: [
    { title: "Simple", desc: "If it needs a manual, we got it wrong. Everything happens in a WhatsApp chat." },
    { title: "Respectful", desc: "Customers agree before they get reminders, and STOP always works." },
    { title: "Yours", desc: "Your records belong to you. Export them to Excel whenever you want." },
  ],
  detailsTitle: "Company details",
  labels: { company: "Company", registration: "Registration", registrationValue: "Registered in Rwanda", founder: "Founder", address: "Address", email: "Email", whatsapp: "WhatsApp support" },
  contact: "Contact us",
};

const rw: Copy = {
  title: "Ibya Shop Brain",
  intro: "Shop Brain ifasha abacuruzi bato mu Rwanda gukurikirana imyenda y'abakiriya no kwishyurwa, nta kintu bashyiramo.",
  whoTitle: "Turi bande",
  who: `Shop Brain ikorwa na ${COMPANY_NAME}, ikigo cyanditswe mu Rwanda kandi cyubakiwe i Kigali. Dukora ikintu kimwe: igikoresho cya WhatsApp cyo kwandika imyenda y'abakiriya, kubibutsa mu bworoherane no kubika gihamya y'ubwishyu.`,
  whyTitle: "Impamvu twayubatse",
  why: "Amaduka menshi y'i Kigali acuruza ku mwenda kandi akabika inyandiko mu gatabo. Imyenda iribagirana, impapuro zirazimira, kandi gusaba umukiriya kwishyura bishobora kugora. Shop Brain ishyira iyo nyandiko muri WhatsApp, abacuruzi basanzwe bakoresha buri munsi, bityo nta kintu gishya cyo kwiga cyangwa gushyiramo.",
  principlesTitle: "Uko dukora",
  principles: [
    { title: "Byoroshye", desc: "Iyo bikeneye igitabo cy'amabwiriza, twakosheje. Byose bikorerwa mu kiganiro cya WhatsApp." },
    { title: "Kubaha", desc: "Abakiriya bemera mbere yo kubona inyibutsa, kandi STOP ihora ikora." },
    { title: "Ni ibyawe", desc: "Amakuru yawe ni ayawe. Ushobora kuyohereza muri Excel igihe cyose." },
  ],
  detailsTitle: "Amakuru y'ikigo",
  labels: { company: "Ikigo", registration: "Kwiyandikisha", registrationValue: "Cyanditswe mu Rwanda", founder: "Uwashinze", address: "Aderesi", email: "Imeyili", whatsapp: "Ubufasha kuri WhatsApp" },
  contact: "Twandikire",
};

const fr: Copy = {
  title: "À propos de Shop Brain",
  intro: "Shop Brain aide les petits commerçants du Rwanda à suivre les dettes de leurs clients et à être payés, sans rien installer.",
  whoTitle: "Qui sommes-nous",
  who: `Shop Brain est exploité par ${COMPANY_NAME}, société enregistrée au Rwanda et conçue à Kigali. Nous faisons une seule chose : un outil WhatsApp pour noter les dettes des clients, les relancer poliment et garder une preuve des paiements.`,
  whyTitle: "Pourquoi nous l'avons créé",
  why: "Beaucoup de commerces de Kigali vendent à crédit et tiennent leurs comptes dans un cahier. Les dettes s'oublient, les pages se perdent, et demander à un client de payer peut être gênant. Shop Brain met ce registre dans WhatsApp, que les commerçants utilisent déjà chaque jour : rien de nouveau à apprendre ni à installer.",
  principlesTitle: "Notre façon de travailler",
  principles: [
    { title: "Simple", desc: "S'il faut un mode d'emploi, nous avons échoué. Tout se passe dans une conversation WhatsApp." },
    { title: "Respectueux", desc: "Les clients acceptent avant de recevoir des rappels, et STOP fonctionne toujours." },
    { title: "À vous", desc: "Vos données vous appartiennent. Exportez-les vers Excel quand vous voulez." },
  ],
  detailsTitle: "Informations sur la société",
  labels: { company: "Société", registration: "Immatriculation", registrationValue: "Enregistrée au Rwanda", founder: "Fondateur", address: "Adresse", email: "E-mail", whatsapp: "Support WhatsApp" },
  contact: "Nous contacter",
};

const copy: Record<Lang, Copy> = { rw, en, fr };

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid md:grid-cols-[1fr_2fr] gap-4 md:gap-12 py-10 border-t border-border first:border-t-0">
      <h2 className="text-2xl font-extrabold tracking-tight" style={DISPLAY}>
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

export default function About() {
  const [lang, setLang] = useLang();
  const t = copy[lang];
  usePageMeta(`${t.title} · Shop Brain`, t.intro);

  const rows: [string, React.ReactNode][] = [
    [t.labels.company, COMPANY_NAME],
    [t.labels.registration, t.labels.registrationValue],
    ...(FOUNDER_NAME ? ([[t.labels.founder, FOUNDER_NAME]] as [string, React.ReactNode][]) : []),
    [t.labels.address, CONTACT_ADDRESS],
    [
      t.labels.email,
      <a key="mail" href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 break-all">
        {CONTACT_EMAIL}
      </a>,
    ],
    [
      t.labels.whatsapp,
      <a key="wa" href={SUPPORT_LINK} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
        {SUPPORT_DISPLAY}
      </a>,
    ],
  ];

  return (
    <Shell lang={lang} setLang={setLang}>
      <PageHeader title={t.title} intro={t.intro} />

      <div className="px-4 md:px-6 py-6 md:py-10">
        <div className="container mx-auto max-w-5xl">
          <Block title={t.whoTitle}>
            <p className="text-lg leading-relaxed text-foreground/85 max-w-2xl">{t.who}</p>
          </Block>

          <Block title={t.whyTitle}>
            <p className="text-lg leading-relaxed text-foreground/85 max-w-2xl">{t.why}</p>
          </Block>

          <Block title={t.principlesTitle}>
            <dl className="space-y-5 max-w-2xl">
              {t.principles.map((p) => (
                <div key={p.title}>
                  <dt className="font-bold text-lg" style={DISPLAY}>
                    {p.title}
                  </dt>
                  <dd className="text-muted-foreground leading-relaxed">{p.desc}</dd>
                </div>
              ))}
            </dl>
          </Block>

          <Block title={t.detailsTitle}>
            <dl className="max-w-2xl divide-y divide-border border-y border-border">
              {rows.map(([k, v]) => (
                <div key={k} className="grid sm:grid-cols-[10rem_1fr] gap-1 sm:gap-6 py-3">
                  <dt className="font-semibold text-muted-foreground">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6">
              <Link href="/contact" className="font-semibold underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground">
                {t.contact}
              </Link>
            </p>
          </Block>
        </div>
      </div>

      <CtaBand lang={lang} />
    </Shell>
  );
}