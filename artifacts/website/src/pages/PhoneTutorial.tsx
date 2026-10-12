import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Pause, Play, RotateCcw } from "lucide-react";

// A phone that plays a short tutorial on its own: four scenes, each typing out a real
// WhatsApp conversation. It is NOT scroll based. It starts when the section is on screen,
// pauses when it leaves, and visitors can pause, replay, or jump to any scene.
// Reduced-motion visitors see each scene fully written out, with no autoplay.

type Lang = "rw" | "en" | "fr";
type Msg = { from: "me" | "bot"; text: string; btn?: string[] };
type Scene = { t: string; d: string; msgs: Msg[] };
type Copy = { title: string; sub: string; play: string; pause: string; replay: string; cta: string; typing: string; scenes: Scene[] };

const INK = "#1B2559";
const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;

const T: Record<Lang, Copy> = {
  en: {
    title: "Watch how it works",
    sub: "Four short scenes, all inside WhatsApp. Tap any scene to jump to it.",
    play: "Play", pause: "Pause", replay: "Replay", cta: "Try it on WhatsApp", typing: "Shop Brain is typing",
    scenes: [
      { t: "Add a debt", d: "Send one line. Shop Brain checks it with you before it saves, and asks if a new customer agreed to reminders.", msgs: [
        { from: "me", text: "0788123456 Jean sugar 2000" },
        { from: "bot", text: "Jean · sugar · 2,000 RWF. Confirm?" },
        { from: "me", text: "Confirm" },
        { from: "bot", text: "✅ Saved. Jean owes 2,000 RWF." },
        { from: "bot", text: "New customer: did Jean agree to reminders?" } ] },
      { t: "Reminders go out for you", d: "Switch on auto-reminders. A 5-minute countdown lets you cancel, then Shop Brain follows up every day.", msgs: [
        { from: "bot", text: "Auto-reminders start in 5:00", btn: ["Cancel"] },
        { from: "bot", text: "🔔 Reminder to Jean read." },
        { from: "bot", text: "⚠️ Reminder to Mama K not sent, no number.", btn: ["Add Number"] } ] },
      { t: "The customer pays", d: "A customer taps I've paid and you get a ping to confirm. They receive a receipt.", msgs: [
        { from: "bot", text: "Jean says: I've paid 2,000 RWF. Confirm?" },
        { from: "me", text: "Jean 2000" },
        { from: "bot", text: "✅ Jean paid 2,000 RWF. Balance: 0." },
        { from: "bot", text: "🧾 Receipt sent to Jean." } ] },
      { t: "See your money", d: "Your total, who to call today, and how much Shop Brain recovered for you.", msgs: [
        { from: "me", text: "TOTAL" },
        { from: "bot", text: "You are owed 48,500 RWF by 7 customers." },
        { from: "bot", text: "📞 Follow-up: Eric (14+ days), Mama K (no number)." },
        { from: "bot", text: "💰 ShopBrain recovered 12,000 RWF for you." } ] },
    ],
  },
  rw: {
    title: "Reba uko bikora",
    sub: "Amashusho ane magufi, byose kuri WhatsApp. Kanda ishusho iyo ari yo yose ujyeyo.",
    play: "Tangira", pause: "Hagarika", replay: "Subiramo", cta: "Gerageza kuri WhatsApp", typing: "Shop Brain iri kwandika",
    scenes: [
      { t: "Ongeraho umwenda", d: "Ohereza umurongo umwe. Shop Brain iragenzura nawe mbere yo kubika, ikabaza niba umukiriya mushya yemeye inyibutsa.", msgs: [
        { from: "me", text: "0788123456 Jean isukari 2000" },
        { from: "bot", text: "Jean · isukari · 2,000 RWF. Wemeza?" },
        { from: "me", text: "Emeza" },
        { from: "bot", text: "✅ Byanditswe. Jean abereyemo 2,000 RWF." },
        { from: "bot", text: "Umukiriya mushya: Jean yemeye kwibutswa?" } ] },
      { t: "Inyibutsa zijya ku bwawe", d: "Fungura inyibutsa zikora ubwazo. Hatangira kubara iminota 5 ushobora guhagarika, hanyuma Shop Brain igakurikirana buri munsi.", msgs: [
        { from: "bot", text: "Inyibutsa zitangira mu minota 5:00", btn: ["Cancel"] },
        { from: "bot", text: "🔔 Jean yasomye inyibutsa." },
        { from: "bot", text: "⚠️ Mama K ntiyoherejwe, nta numero.", btn: ["Add Number"] } ] },
      { t: "Umukiriya yishyura", d: "Umukiriya akanda I've paid, ukabona ubutumwa wemeza. Ahabwa inyemezabwishyu.", msgs: [
        { from: "bot", text: "Jean avuga ati: I've paid 2,000 RWF. Wemeza?" },
        { from: "me", text: "Jean 2000" },
        { from: "bot", text: "✅ Jean yishyuye 2,000 RWF. Asigaye: 0." },
        { from: "bot", text: "🧾 Inyemezabwishyu yoherejwe kuri Jean." } ] },
      { t: "Reba amafaranga yawe", d: "Igiteranyo cyawe, abo guhamagara uyu munsi, n'amafaranga Shop Brain yagukoreye kugarura.", msgs: [
        { from: "me", text: "IGITERANYO" },
        { from: "bot", text: "Abakubereyemo bose: 48,500 RWF (abakiriya 7)." },
        { from: "bot", text: "📞 Gukurikirana: Eric (iminsi 14+), Mama K (nta numero)." },
        { from: "bot", text: "💰 Shop Brain yagarurije 12,000 RWF." } ] },
    ],
  },
  fr: {
    title: "Voyez comment ça marche",
    sub: "Quatre courtes scènes, tout dans WhatsApp. Touchez une scène pour y aller.",
    play: "Lecture", pause: "Pause", replay: "Rejouer", cta: "Essayer sur WhatsApp", typing: "Shop Brain écrit",
    scenes: [
      { t: "Ajouter une dette", d: "Envoyez une ligne. Shop Brain vérifie avec vous avant d'enregistrer, et demande si un nouveau client accepte les rappels.", msgs: [
        { from: "me", text: "0788123456 Jean sucre 2000" },
        { from: "bot", text: "Jean · sucre · 2 000 RWF. Confirmer ?" },
        { from: "me", text: "Confirmer" },
        { from: "bot", text: "✅ Enregistré. Jean doit 2 000 RWF." },
        { from: "bot", text: "Nouveau client : Jean accepte-t-il les rappels ?" } ] },
      { t: "Les rappels partent seuls", d: "Activez les rappels automatiques. Un compte à rebours de 5 minutes permet d'annuler, puis Shop Brain relance chaque jour.", msgs: [
        { from: "bot", text: "Rappels automatiques dans 5:00", btn: ["Cancel"] },
        { from: "bot", text: "🔔 Rappel lu par Jean." },
        { from: "bot", text: "⚠️ Rappel pour Mama K non envoyé, pas de numéro.", btn: ["Add Number"] } ] },
      { t: "Le client paie", d: "Un client touche I've paid et vous recevez une alerte pour confirmer. Il reçoit un reçu.", msgs: [
        { from: "bot", text: "Jean dit : I've paid 2 000 RWF. Confirmer ?" },
        { from: "me", text: "Jean 2000" },
        { from: "bot", text: "✅ Jean a payé 2 000 RWF. Solde : 0." },
        { from: "bot", text: "🧾 Reçu envoyé à Jean." } ] },
      { t: "Voir votre argent", d: "Votre total, qui appeler aujourd'hui, et combien Shop Brain a récupéré pour vous.", msgs: [
        { from: "me", text: "TOTAL" },
        { from: "bot", text: "On vous doit 48 500 RWF (7 clients)." },
        { from: "bot", text: "📞 Relance : Eric (14 j+), Mama K (pas de numéro)." },
        { from: "bot", text: "💰 Shop Brain a récupéré 12 000 RWF pour vous." } ] },
    ],
  },
};

const CSS = `
@keyframes pt-pop{from{opacity:0;transform:translateY(.8em) scale(.9)}to{opacity:1;transform:none}}
@keyframes pt-dots{0%,80%,100%{opacity:.25}40%{opacity:1}}
@keyframes pt-tap{0%{box-shadow:0 0 0 0 rgba(255,201,51,.9)}100%{box-shadow:0 0 0 .8em rgba(255,201,51,0)}}
@keyframes pt-float{0%,100%{transform:perspective(1000px) rotateY(-9deg) rotateX(3deg) translateY(0)}50%{transform:perspective(1000px) rotateY(9deg) rotateX(-2deg) translateY(-12px)}}
@keyframes pt-prog{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.pt-pop{animation:pt-pop .45s cubic-bezier(.34,1.56,.64,1) both}
.pt-float{animation:pt-float 9s ease-in-out infinite}
.pt-btn{display:inline-block;margin:.5em .4em 0 0;padding:.3em .9em;border-radius:999px;font-weight:700;font-size:.85em;color:#fff;background:#005c4b;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25);animation:pt-tap 1.2s ease-out .8s infinite}
.pt-dot{display:inline-block;width:.45em;height:.45em;margin:0 .15em;border-radius:50%;background:#fff;animation:pt-dots 1.1s infinite}
@media (prefers-reduced-motion:reduce){.pt-pop,.pt-float,.pt-btn,.pt-dot{animation:none}}
`;

export default function PhoneTutorial({ lang, botLink }: { lang: Lang; botLink: string }) {
  const t = T[lang];
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [st, setSt] = useState({ s: 0, n: 0 });
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLElement | null>(null);
  const scene = t.scenes[st.s];
  const len = scene.msgs.length;
  const n = reduced ? len : st.n;

  // run only while the section is on screen
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return setVisible(true);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // type the next bubble, or move to the next scene after a pause
  useEffect(() => {
    if (reduced || !visible || !playing) return;
    const id = window.setTimeout(
      () => setSt((p) => (p.n < len ? { ...p, n: p.n + 1 } : { s: (p.s + 1) % t.scenes.length, n: 0 })),
      st.n === 0 ? 800 : st.n < len ? 1350 : 3000
    );
    return () => window.clearTimeout(id);
  }, [st, visible, playing, reduced, len, t.scenes.length]);

  const typing = !reduced && visible && playing && n < len && scene.msgs[n].from === "bot";
  const sceneSecs = (len * 1.35 + 3.8).toFixed(1);

  return (
    <section ref={root} id="tutorial" className="py-20 md:py-28 px-4 md:px-6 bg-muted/50 border-y border-border overflow-hidden">
      <style>{CSS}</style>
      <div className="container mx-auto max-w-6xl">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3" style={DISPLAY}>{t.title}</h2>
        <p className="text-lg text-muted-foreground mb-10 max-w-xl">{t.sub}</p>

        <div className="grid md:grid-cols-[1fr_auto] gap-12 md:gap-20 items-center">
          <div>
            <ol className="space-y-3">
              {t.scenes.map((sc, i) => {
                const active = i === st.s;
                return (
                  <li key={sc.t}>
                    <button
                      onClick={() => setSt({ s: i, n: 0 })}
                      aria-current={active}
                      className={`w-full text-left rounded-2xl border p-4 transition-all duration-500 ${active ? "bg-card border-foreground/30 shadow-lg" : "border-border hover:border-foreground/30"}`}
                    >
                      <span className="flex items-center gap-3">
                        <span className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-extrabold transition-colors duration-300" style={{ background: active ? SUN : "hsl(var(--muted))", color: active ? INK : undefined, ...DISPLAY }}>
                          {i + 1}
                        </span>
                        <span className="text-lg font-bold" style={DISPLAY}>{sc.t}</span>
                      </span>
                      <span className="grid transition-[grid-template-rows,opacity] duration-500" style={{ gridTemplateRows: active ? "1fr" : "0fr", opacity: active ? 1 : 0 }}>
                        <span className="overflow-hidden block">
                          <span className="block pt-3 text-muted-foreground leading-relaxed">{sc.d}</span>
                          <span className="block mt-3 h-1 rounded bg-muted overflow-hidden">
                            {active && !reduced && (
                              <span key={st.s} className="block h-full origin-left" style={{ background: GREEN, animation: `pt-prog ${sceneSecs}s linear forwards`, animationPlayState: playing && visible ? "running" : "paused" }} />
                            )}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="flex flex-wrap items-center gap-3 mt-6">
              {!reduced && (
                <button onClick={() => setPlaying((p) => !p)} className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-sm font-semibold hover:bg-muted transition-colors">
                  {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? t.pause : t.play}
                </button>
              )}
              <button onClick={() => { setSt({ s: 0, n: 0 }); setPlaying(true); }} className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-sm font-semibold hover:bg-muted transition-colors">
                <RotateCcw size={15} /> {t.replay}
              </button>
              <a href={botLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-sm font-semibold text-white hover:brightness-110 transition" style={{ background: GREEN }}>
                <MessageCircle size={16} /> {t.cta}
              </a>
            </div>
          </div>

          <div className="relative mx-auto" aria-label={scene.t}>
            <div aria-hidden className="absolute left-1/2 top-1/2 w-[26rem] h-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(15,122,63,.28), transparent 62%)" }} />
            <div className="pt-float relative w-[17.5rem] rounded-[2.5rem] border-[10px] border-[#0b1020] bg-[#0b1020] shadow-2xl">
              <div className="rounded-[1.8rem] overflow-hidden bg-[#0b141a] text-white">
                <div className="flex items-center gap-3 px-4 py-3 bg-[#1f2c34]">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: GREEN }}>SB</div>
                  <div className="leading-tight">
                    <div className="text-sm font-semibold">Shop Brain</div>
                    <div className="text-[11px] text-white/60">online</div>
                  </div>
                </div>
                <div className="h-[25rem] px-3 py-4 flex flex-col justify-end gap-2 overflow-hidden" role="log" aria-live="polite">
                  {scene.msgs.slice(0, n).map((m, i) => (
                    <div key={`${st.s}-${i}`} className={`pt-pop max-w-[88%] px-3 py-2 rounded-xl text-[13px] leading-snug ${m.from === "me" ? "self-end bg-[#005c4b] rounded-tr-sm" : "self-start bg-[#202c33] rounded-tl-sm"}`}>
                      {m.text}
                      {m.from === "me" && <span className="ml-2 text-[10px] text-sky-300">✓✓</span>}
                      {m.btn && <span className="block">{m.btn.map((b) => <span key={b} className="pt-btn">{b}</span>)}</span>}
                    </div>
                  ))}
                  {typing && (
                    <div className="pt-pop self-start px-3 py-2.5 rounded-xl rounded-tl-sm bg-[#202c33]" role="status" aria-label={t.typing}>
                      <i className="pt-dot" /><i className="pt-dot" style={{ animationDelay: ".18s" }} /><i className="pt-dot" style={{ animationDelay: ".36s" }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}