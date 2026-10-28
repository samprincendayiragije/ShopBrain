import React from "react";
import { CtaBand, DISPLAY, PageHeader, Shell, usePageMeta, useLang, type Lang } from "./site";

type Group = { title: string; items: { t: string; d: string }[] };
type Copy = { title: string; intro: string; groups: Group[] };

const en: Copy = {
  title: "Shop Brain features",
  intro: "What Shop Brain does today, all inside WhatsApp. The bot works in Kinyarwanda and English.",
  groups: [
    {
      title: "Record debts",
      items: [
        { t: "One-message entry", d: "Send the number, name, item and amount in one message. The number is optional. Shop Brain confirms before it saves." },
        { t: "Photo of your notebook", d: "Send a photo of a page from your paper notebook. Shop Brain reads the debts and registers them after you confirm." },
        { t: "Fix mistakes easily", d: "Undo the last debt, edit a customer, and get a warning if a name already exists." },
      ],
    },
    {
      title: "Remind customers",
      items: [
        { t: "One customer or everyone", d: "Remind a single customer or everyone who owes, using approved WhatsApp templates that list the items and the total. You are told when a reminder is sent, delivered, read or failed." },
        { t: "Automatic reminders", d: "Turn on auto-reminders and debts that are 3 days old or more are reminded between 09:00 and 18:00. Turn them off any time." },
        { t: "Always polite", d: "Only customers who agreed get reminders, at most one every 7 days. A reply of STOP ends them." },
      ],
    },
    {
      title: "Get paid",
      items: [
        { t: "Part and full payments", d: "Mark a debt paid in full or in part. Payments are applied to the oldest debt first." },
        { t: "Buttons for your customers", d: "Customers can tap My Balance, How to Pay, I've paid or Stop. When they tap I've paid, nothing changes until you confirm." },
        { t: "Receipts", d: "Every payment sends the customer a receipt showing what they paid and what remains." },
      ],
    },
    {
      title: "Stay in control",
      items: [
        { t: "Totals and reports", d: "See the total owed, your top debtors, a debt report and today's activity." },
        { t: "Follow-up list", d: "See who has no number, replied STOP, had a failed reminder, is over 14 days late or missed a promise date." },
        { t: "Credit limits and promise dates", d: "Set a credit limit for each customer and a date by which they promised to pay." },
        { t: "Weekly summary and Excel export", d: "Every Monday you get a summary of what was recovered. Export all your records to a file that opens in Excel at any time." },
      ],
    },
  ],
};

const rw: Copy = {
  title: "Ibikorwa bya Shop Brain",
  intro: "Ibyo Shop Brain ikora uyu munsi, byose muri WhatsApp. Roboti ikora mu Kinyarwanda no mu Cyongereza.",
  groups: [
    {
      title: "Andika imyenda",
      items: [
        { t: "Ubutumwa bumwe", d: "Ohereza numero, izina, igicuruzwa n'amafaranga mu butumwa bumwe. Numero si ngombwa. Shop Brain irabyemeza mbere yo kubika." },
        { t: "Ifoto y'ikayi yawe", d: "Ohereza ifoto y'urupapuro rw'ikayi yawe. Shop Brain isoma imyenda ikayandika umaze kwemeza." },
        { t: "Gukosora amakosa", d: "Kuraho umwenda wa nyuma, hindura umukiriya, kandi uburirwa iyo izina risanzwe rihari." },
      ],
    },
    {
      title: "Ibutsa abakiriya",
      items: [
        { t: "Umukiriya umwe cyangwa bose", d: "Ibutsa umukiriya umwe cyangwa bose babereyemo, ukoresheje inyandiko za WhatsApp zemewe zigaragaza ibicuruzwa n'igiteranyo. Umenyeshwa iyo inyibutsa yoherejwe, yagezeyo, yasomwe cyangwa yanze." },
        { t: "Inyibutsa zikora ubwazo", d: "Fungura inyibutsa zikora ubwazo, imyenda imaze iminsi 3 cyangwa irenga ikibutswa hagati ya 09:00 na 18:00. Wazifunga igihe cyose." },
        { t: "Zihora zoroheje", d: "Abemeye gusa ni bo bohererezwa, inyibutsa imwe gusa mu minsi 7. Gusubiza STOP birazihagarika." },
      ],
    },
    {
      title: "Wishyurwe",
      items: [
        { t: "Ubwishyu bw'igice cyangwa bwose", d: "Andika umwenda wishyuwe wose cyangwa igice. Ubwishyu butangira ku mwenda wa kera." },
        { t: "Utubuto tw'abakiriya", d: "Abakiriya bashobora gukanda My Balance, How to Pay, I've paid cyangwa Stop. Iyo bakanze I've paid, nta kihinduka utaremeza." },
        { t: "Inyemezabwishyu", d: "Buri bwishyu bwohereza umukiriya inyemezabwishyu igaragaza ibyo yishyuye n'ibisigaye." },
      ],
    },
    {
      title: "Komeza ugenzure",
      items: [
        { t: "Ibiteranyo na raporo", d: "Reba igiteranyo, abakubereyemo cyane, raporo y'imyenda n'iby'uyu munsi." },
        { t: "Urutonde rwo gukurikirana", d: "Reba abatagira numero, abohereje STOP, inyibutsa zanze, abarengeje iminsi 14, n'abarenze itariki bijeje." },
        { t: "Umupaka n'amatariki", d: "Shyiraho umupaka w'umwenda kuri buri mukiriya n'itariki bijeje kwishyuriraho." },
        { t: "Raporo y'icyumweru na Excel", d: "Buri wa mbere ubona raporo y'ibyagarujwe. Ohereza amakuru yose muri dosiye ifungurwa na Excel igihe cyose." },
      ],
    },
  ],
};

const fr: Copy = {
  title: "Fonctionnalités de Shop Brain",
  intro: "Ce que Shop Brain fait aujourd'hui, le tout dans WhatsApp. Le bot fonctionne en kinyarwanda et en anglais.",
  groups: [
    {
      title: "Enregistrer les dettes",
      items: [
        { t: "Un seul message", d: "Envoyez le numéro, le nom, l'article et le montant en un message. Le numéro est facultatif. Shop Brain confirme avant d'enregistrer." },
        { t: "La photo de votre cahier", d: "Envoyez la photo d'une page de votre cahier papier. Shop Brain lit les dettes et les enregistre après votre confirmation." },
        { t: "Corriger facilement", d: "Annulez la dernière dette, modifiez un client et soyez averti si un nom existe déjà." },
      ],
    },
    {
      title: "Relancer les clients",
      items: [
        { t: "Un client ou tous", d: "Relancez un client ou tous ceux qui doivent, avec des modèles WhatsApp approuvés qui listent les articles et le total. Vous savez quand un rappel est envoyé, livré, lu ou échoué." },
        { t: "Rappels automatiques", d: "Activez les rappels automatiques : les dettes de 3 jours ou plus sont relancées entre 09h00 et 18h00. Désactivez-les à tout moment." },
        { t: "Toujours poli", d: "Seuls les clients qui ont accepté reçoivent des rappels, un tous les 7 jours au plus. Une réponse STOP les arrête." },
      ],
    },
    {
      title: "Être payé",
      items: [
        { t: "Paiements partiels ou complets", d: "Marquez une dette payée en totalité ou en partie. Les paiements s'appliquent d'abord à la plus ancienne dette." },
        { t: "Des boutons pour vos clients", d: "Vos clients peuvent toucher My Balance, How to Pay, I've paid ou Stop. Quand ils touchent I've paid, rien ne change avant votre confirmation." },
        { t: "Reçus", d: "Chaque paiement envoie au client un reçu avec ce qu'il a payé et ce qui reste." },
      ],
    },
    {
      title: "Garder le contrôle",
      items: [
        { t: "Totaux et rapports", d: "Voyez le total dû, vos principaux débiteurs, un rapport des dettes et l'activité du jour." },
        { t: "Liste de relance", d: "Voyez qui n'a pas de numéro, a répondu STOP, a eu un rappel échoué, a plus de 14 jours de retard ou une date de promesse dépassée." },
        { t: "Limites et dates promises", d: "Fixez une limite de crédit par client et une date de paiement promise." },
        { t: "Récapitulatif hebdomadaire et Excel", d: "Chaque lundi, recevez un récapitulatif de ce qui a été récupéré. Exportez toutes vos données vers un fichier lisible dans Excel à tout moment." },
      ],
    },
  ],
};

const copy: Record<Lang, Copy> = { rw, en, fr };

export default function Features() {
  const [lang, setLang] = useLang();
  const t = copy[lang];
  usePageMeta(`${t.title} · Shop Brain`, t.intro);

  return (
    <Shell lang={lang} setLang={setLang}>
      <PageHeader title={t.title} intro={t.intro} />

      <div className="px-4 md:px-6 py-6 md:py-10">
        <div className="container mx-auto max-w-5xl">
          {t.groups.map((g) => (
            <section key={g.title} className="grid md:grid-cols-[1fr_2fr] gap-4 md:gap-12 py-10 border-t border-border first:border-t-0">
              <h2 className="text-2xl font-extrabold tracking-tight" style={DISPLAY}>
                {g.title}
              </h2>
              <dl className="space-y-6 max-w-2xl">
                {g.items.map((it) => (
                  <div key={it.t}>
                    <dt className="font-bold text-lg" style={DISPLAY}>
                      {it.t}
                    </dt>
                    <dd className="mt-1 text-muted-foreground leading-relaxed">{it.d}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>

      <CtaBand lang={lang} />
    </Shell>
  );
}