import React, { useState } from "react";
import { Building2, Instagram, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import {
  BOT_LINK,
  COMPANY_NAME,
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  DISPLAY,
  GREEN,
  INSTAGRAM_URL,
  INK,
  PageHeader,
  SUPPORT_DISPLAY,
  SUPPORT_LINK,
  Shell,
  common,
  ctaClass,
  usePageMeta,
  useLang,
  type Lang,
} from "./site";

type Copy = {
  title: string;
  intro: string;
  support: string;
  supportNote: string;
  email: string;
  address: string;
  company: string;
  companyValue: string;
  formTitle: string;
  name: string;
  phone: string;
  message: string;
  send: string;
  formNote: string;
  greeting: string;
  iAm: string;
  startTitle: string;
  startBody: string;
};

const en: Copy = {
  title: "Contact us",
  intro: "Questions about setting up Shop Brain for your shop, or help with your account? Message our team and a person will answer.",
  support: "WhatsApp support",
  supportNote: "For help and questions. To use Shop Brain itself, message the bot.",
  email: "Email",
  address: "Address",
  company: "Company",
  companyValue: `${COMPANY_NAME}, registered in Rwanda`,
  formTitle: "Send us a message",
  name: "Your name",
  phone: "Your phone number",
  message: "Your message",
  send: "Send on WhatsApp",
  formNote: "This opens WhatsApp with your message ready to send.",
  greeting: "Hello Shop Brain,",
  iAm: "I am",
  startTitle: "Want to start using Shop Brain?",
  startBody: "Message the bot on WhatsApp. The first month is free.",
};

const rw: Copy = {
  title: "Twandikire",
  intro: "Ufite ibibazo ku gutangira gukoresha Shop Brain mu iduka ryawe, cyangwa ukeneye ubufasha kuri konti yawe? Andikira itsinda ryacu, umuntu azagusubiza.",
  support: "Ubufasha kuri WhatsApp",
  supportNote: "Ku bufasha no ku bibazo. Gukoresha Shop Brain ubwayo, andikira roboti.",
  email: "Imeyili",
  address: "Aderesi",
  company: "Ikigo",
  companyValue: `${COMPANY_NAME}, cyanditswe mu Rwanda`,
  formTitle: "Twoherereze ubutumwa",
  name: "Izina ryawe",
  phone: "Nimero yawe ya telefone",
  message: "Ubutumwa bwawe",
  send: "Ohereza kuri WhatsApp",
  formNote: "Ibi bifungura WhatsApp ubutumwa bwawe bwiteguye koherezwa.",
  greeting: "Muraho Shop Brain,",
  iAm: "Nitwa",
  startTitle: "Urashaka gutangira gukoresha Shop Brain?",
  startBody: "Andikira roboti kuri WhatsApp. Ukwezi kwa mbere ni ubuntu.",
};

const fr: Copy = {
  title: "Contact",
  intro: "Des questions sur la mise en place de Shop Brain pour votre commerce, ou besoin d'aide pour votre compte ? Écrivez à notre équipe, une personne vous répondra.",
  support: "Support WhatsApp",
  supportNote: "Pour l'aide et les questions. Pour utiliser Shop Brain lui-même, écrivez au bot.",
  email: "E-mail",
  address: "Adresse",
  company: "Société",
  companyValue: `${COMPANY_NAME}, enregistrée au Rwanda`,
  formTitle: "Envoyez-nous un message",
  name: "Votre nom",
  phone: "Votre numéro de téléphone",
  message: "Votre message",
  send: "Envoyer sur WhatsApp",
  formNote: "Cela ouvre WhatsApp avec votre message prêt à envoyer.",
  greeting: "Bonjour Shop Brain,",
  iAm: "Je m'appelle",
  startTitle: "Envie de commencer avec Shop Brain ?",
  startBody: "Écrivez au bot sur WhatsApp. Le premier mois est gratuit.",
};

const copy: Record<Lang, Copy> = { rw, en, fr };

const field = "w-full rounded-md border border-border bg-background px-3 py-2.5 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1";

export default function Contact() {
  const [lang, setLang] = useLang();
  const t = copy[lang];
  const c = common[lang];
  usePageMeta(`${t.title} · Shop Brain`, t.intro);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = `${t.greeting} ${name.trim() ? `${t.iAm} ${name.trim()}. ` : ""}${message.trim()}${phone.trim() ? ` (${phone.trim()})` : ""}`;
    window.open(`${SUPPORT_LINK}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const row = "flex items-start gap-4";
  const icon = { color: INK } as const;

  return (
    <Shell lang={lang} setLang={setLang}>
      <PageHeader title={t.title} intro={t.intro} />

      <section className="px-4 md:px-6 py-14 md:py-20">
        <div className="container mx-auto max-w-5xl grid md:grid-cols-2 gap-12 md:gap-16">
          <div className="space-y-7">
            <div className={row}>
              <Phone size={22} className="mt-1 shrink-0" style={icon} />
              <div>
                <h2 className="font-bold text-lg" style={DISPLAY}>
                  {t.support}
                </h2>
                <a href={SUPPORT_LINK} target="_blank" rel="noopener noreferrer" className="text-lg underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground">
                  {SUPPORT_DISPLAY}
                </a>
                <p className="text-sm text-muted-foreground mt-1">{t.supportNote}</p>
              </div>
            </div>
            <div className={row}>
              <Mail size={22} className="mt-1 shrink-0" style={icon} />
              <div>
                <h2 className="font-bold text-lg" style={DISPLAY}>
                  {t.email}
                </h2>
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-lg underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground break-all">
                  {CONTACT_EMAIL}
                </a>
              </div>
            </div>
            <div className={row}>
              <MapPin size={22} className="mt-1 shrink-0" style={icon} />
              <div>
                <h2 className="font-bold text-lg" style={DISPLAY}>
                  {t.address}
                </h2>
                <p className="text-lg">{CONTACT_ADDRESS}</p>
              </div>
            </div>
            <div className={row}>
              <Building2 size={22} className="mt-1 shrink-0" style={icon} />
              <div>
                <h2 className="font-bold text-lg" style={DISPLAY}>
                  {t.company}
                </h2>
                <p className="text-lg">{t.companyValue}</p>
              </div>
            </div>
            <div className={row}>
              <Instagram size={22} className="mt-1 shrink-0" style={icon} />
              <div>
                <h2 className="font-bold text-lg" style={DISPLAY}>
                  Instagram
                </h2>
                <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="text-lg underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground">
                  @shopbrain_kigali
                </a>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-extrabold tracking-tight mb-5" style={DISPLAY}>
              {t.formTitle}
            </h2>
            <form onSubmit={send} className="space-y-4">
              <div>
                <label htmlFor="c-name" className="block font-semibold mb-1.5">
                  {t.name}
                </label>
                <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={field} />
              </div>
              <div>
                <label htmlFor="c-phone" className="block font-semibold mb-1.5">
                  {t.phone}
                </label>
                <input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" className={field} />
              </div>
              <div>
                <label htmlFor="c-msg" className="block font-semibold mb-1.5">
                  {t.message}
                </label>
                <textarea id="c-msg" value={message} onChange={(e) => setMessage(e.target.value)} required rows={5} className={field} />
              </div>
              <button type="submit" className={`${ctaClass} w-full`} style={{ background: GREEN }}>
                <MessageCircle size={20} /> {t.send}
              </button>
              <p className="text-sm text-muted-foreground">{t.formNote}</p>
            </form>
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-14 text-white" style={{ background: INK }}>
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-3" style={DISPLAY}>
            {t.startTitle}
          </h2>
          <p className="text-lg text-white/75 mb-7">{t.startBody}</p>
          <a href={`${BOT_LINK}?text=Hi`} target="_blank" rel="noopener noreferrer" className={ctaClass} style={{ background: GREEN }}>
            <MessageCircle size={20} /> {c.cta}
          </a>
        </div>
      </section>
    </Shell>
  );
}