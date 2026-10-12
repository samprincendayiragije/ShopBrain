import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { subscribe } from "./motion";

// The hero IS the 3D scene. Chapter 0 is the usual Shop Brain introduction
// (headline, body, buttons). Scrolling turns the phone a full 360 degrees and swaps
// the text through three more chapters. Pure CSS 3D: no libraries, no images, no video.
//
// WHAT CHANGED IN THIS VERSION (props are identical, so Home.tsx needs no change)
//   - Four proof chips orbit the phone at different depths ("+2,000 RWF", "Reminder
//     sent", "Jean paid", "Receipt sent"). They drift with the scroll and pop in one
//     chapter at a time, so the story is visible even before you read the text.
//   - A bigger, floatier phone turn with a gentle lift, plus a light sweep across the screen.
//   - The ledger-paper background scrolls past at a different speed (parallax).
//   - A vertical progress rail on desktop.
//
// Weak devices, Data Saver, 2G and reduced-motion visitors get `fallback`
// (your classic hero, unchanged). If a phone turns out to be slow while
// scrolling, the 3D motion freezes but the chapters keep working, so the page
// layout never jumps. Only transform and opacity move every frame.

const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;

type Lang = "rw" | "en" | "fr";
type Msg = { from: string; text: string };

const CAPS: Record<Lang, { t: string; d: string }[]> = {
  en: [
    { t: "One message, one debt", d: "Name, item, amount. Shop Brain confirms before it saves." },
    { t: "Reminders go out for you", d: "Only to customers who agreed, and never after STOP." },
    { t: "Paid. Receipt sent.", d: "Your balance updates and the customer gets proof." },
  ],
  rw: [
    { t: "Ubutumwa bumwe, umwenda umwe", d: "Izina, igicuruzwa, amafaranga. Shop Brain irabyemeza mbere yo kubika." },
    { t: "Inyibutsa zijya ku bwawe", d: "Ku bemeye gusa, kandi nta na rimwe nyuma ya STOP." },
    { t: "Yishyuye. Inyemezabwishyu yoherejwe.", d: "Konti yawe ivugururwa, umukiriya agahabwa gihamya." },
  ],
  fr: [
    { t: "Un message, une dette", d: "Nom, article, montant. Shop Brain confirme avant d'enregistrer." },
    { t: "Les rappels partent seuls", d: "Seulement aux clients qui ont accepté, jamais après STOP." },
    { t: "Payé. Reçu envoyé.", d: "Votre solde se met à jour et le client a sa preuve." },
  ],
};

// proof chips: [text, side, top (em), depth (em), phase]
const CHIPS: Record<Lang, string[]> = {
  en: ["💰 +2,000 RWF", "🔔 Reminder sent", "✅ Jean paid", "🧾 Receipt sent"],
  rw: ["💰 +2,000 RWF", "🔔 Inyibutsa yoherejwe", "✅ Jean yishyuye", "🧾 Inyemezabwishyu"],
  fr: ["💰 +2 000 RWF", "🔔 Rappel envoyé", "✅ Jean a payé", "🧾 Reçu envoyé"],
};
const CHIP_POS: { side: "l" | "r"; top: number; z: number; ph: number }[] = [
  { side: "l", top: 7, z: 5, ph: 0 },
  { side: "r", top: 15, z: 8, ph: 1.6 },
  { side: "l", top: 25, z: 3, ph: 3.1 },
  { side: "r", top: 33, z: 7, ph: 4.7 },
];

// chat bubbles visible per chapter (chapter 0 = introduction)
const SHOWN = [1, 3, 4, 5];

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const sm = (t: number) => t * t * (3 - 2 * t);

function curve(keys: [number, number][], p: number) {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [p1, v1] = keys[i];
    if (p <= p1) {
      const [p0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * sm((p - p0) / (p1 - p0));
    }
  }
  return keys[keys.length - 1][1];
}

// full 360° turn between chapter 1 and chapter 2 (352 = -8, 378 = 18, 360 = 0)
const ROT_Y: [number, number][] = [[0, -24], [0.18, 18], [0.4, -14], [0.62, 352], [0.86, 378], [1, 360]];
const ROT_X: [number, number][] = [[0, 8], [0.4, -6], [0.62, 10], [1, 0]];
const ROT_Z: [number, number][] = [[0, 2], [0.5, -3], [1, 0]];
const SCALE: [number, number][] = [[0, 0.96], [0.12, 1], [0.5, 1.06], [0.88, 1.02], [1, 0.97]];

function isWeakDevice() {
  if (typeof window === "undefined") return true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  const n = navigator as any;
  const c = n.connection;
  if (c?.saveData) return true;
  if (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return true;
  if (typeof n.deviceMemory === "number" && n.deviceMemory <= 2) return true;
  if (typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency <= 2) return true;
  return false;
}

const SCENE_CSS = `
.sb3d-msg{opacity:0;transform:translateY(.8em) scale(.92);transition:opacity .45s ease,transform .6s cubic-bezier(.34,1.56,.64,1)}
.sb3d-msg[data-on="1"]{opacity:1;transform:none}
.sb3d-cap{opacity:0;transform:translateY(18px);transition:opacity .5s ease,transform .7s cubic-bezier(.16,1,.3,1);pointer-events:none}
.sb3d-cap[data-on="1"]{opacity:1;transform:none;pointer-events:auto}
.sb3d-dot{height:4px;width:22px;border-radius:2px;background:rgba(127,127,127,.35);transition:background .3s,width .4s cubic-bezier(.16,1,.3,1)}
.sb3d-dot[data-on="1"]{background:${GREEN};width:44px}
@keyframes sb3d-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
.sb3d-hint{opacity:0;transition:opacity .4s ease;pointer-events:none}
.sb3d-hint[data-on="1"]{opacity:.55}
.sb3d-hint svg{animation:sb3d-bob 1.6s ease-in-out infinite}

/* ledger paper that scrolls at its own speed */
.sb3d-paper{position:absolute;left:0;right:0;top:-40px;bottom:-40px;pointer-events:none;
  background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 35px,var(--rule) 35px,var(--rule) 36px)}

/* orbit chips: the outer layer moves every frame, the inner layer pops in and out */
.sb3d-chip{position:absolute;pointer-events:none;will-change:transform}
.sb3d-chip > span{display:inline-flex;align-items:center;gap:.4em;white-space:nowrap;padding:.55em 1em;border-radius:999px;font-weight:700;font-size:1.15em;color:#fff;background:linear-gradient(160deg,#12924d,${GREEN});
  box-shadow:0 .9em 1.8em rgba(15,122,63,.35),inset 0 0 0 1px rgba(255,255,255,.25);opacity:0;transform:scale(.4) translateY(1em);transition:opacity .45s ease,transform .7s cubic-bezier(.34,1.56,.64,1)}
.sb3d-chip[data-on="1"] > span{opacity:1;transform:none}

/* light sweep across the screen */
.sb3d-sweep{position:absolute;top:0;bottom:0;left:0;width:55%;pointer-events:none;background:linear-gradient(105deg,transparent,rgba(255,255,255,.14),transparent);transform:translateX(-120%)}

/* progress rail (desktop) */
.sb3d-rail{position:absolute;right:14px;top:50%;height:11rem;width:3px;margin-top:-5.5rem;border-radius:2px;background:rgba(127,127,127,.25);overflow:hidden}
.sb3d-rail i{display:block;height:100%;background:${GREEN};transform-origin:50% 0;transform:scaleY(0)}
`;

export default function HeroScene({
  lang,
  msgs,
  intro,
  badge,
  outro,
  fallback,
}: {
  lang: Lang;
  msgs: Msg[];
  intro: React.ReactNode; // the usual headline, body, buttons and note
  badge?: React.ReactNode; // floating "recovered" card
  outro?: React.ReactNode; // e.g. a WhatsApp button shown in the last chapter
  fallback: React.ReactNode; // your current hero section
}) {
  const [mode] = useState<"3d" | "off">(() => (isWeakDevice() ? "off" : "3d"));
  const sec = useRef<HTMLElement | null>(null);
  const phone = useRef<HTMLDivElement | null>(null);
  const glow = useRef<HTMLDivElement | null>(null);
  const paper = useRef<HTMLDivElement | null>(null);
  const sweep = useRef<HTMLDivElement | null>(null);
  const rail = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (mode !== "3d") return;
    const root = sec.current;
    const ph = phone.current;
    if (!root || !ph) return;

    const msgEls = Array.from(root.querySelectorAll<HTMLElement>("[data-msg]"));
    const capEls = Array.from(root.querySelectorAll<HTMLElement>("[data-cap]"));
    const dotEls = Array.from(root.querySelectorAll<HTMLElement>("[data-dot]"));
    const chipEls = Array.from(root.querySelectorAll<HTMLElement>("[data-chip]"));
    const hint = root.querySelector<HTMLElement>("[data-hint]");

    let last = -1;
    let ch = -1;
    let prevT = 0;
    let samples = 0;
    let sum = 0;
    let slow = false;
    let frozen = false;

    const unsub = subscribe((f) => {
      // slow-frame check: if scrolling averages under ~25fps, stop the 3D motion
      const now = performance.now();
      if (prevT) {
        const d = now - prevT;
        if (d < 100) {
          sum += d;
          samples++;
        }
      }
      prevT = now;
      if (samples >= 45) {
        if (sum / samples > 40) slow = true;
        samples = 0;
        sum = 0;
      }

      const r = root.getBoundingClientRect();
      const top = r.top + (f.y - f.sy);
      const p = clamp(-top / Math.max(1, r.height - f.vh), 0, 1);
      const nextCh = Math.min(3, Math.floor(p * 4));
      if (Math.abs(p - last) < 0.0003 && nextCh === ch && (!slow || frozen)) return;

      return () => {
        if (slow && !frozen) {
          frozen = true;
          ph.style.transform = "none";
          ph.style.willChange = "auto";
          chipEls.forEach((el) => (el.style.transform = ""));
          if (paper.current) paper.current.style.transform = "";
          if (sweep.current) sweep.current.style.transform = "";
        }
        last = p;
        if (!frozen) {
          const lift = Math.sin(p * Math.PI * 2) * -1.2;
          ph.style.transform = `translate3d(0,${lift.toFixed(2)}em,0) rotateX(${curve(ROT_X, p).toFixed(2)}deg) rotateY(${curve(ROT_Y, p).toFixed(2)}deg) rotateZ(${curve(ROT_Z, p).toFixed(2)}deg) scale(${curve(SCALE, p).toFixed(3)})`;
          if (glow.current) glow.current.style.transform = `translate(-50%,-50%) scale(${(0.8 + 0.6 * Math.sin(p * Math.PI)).toFixed(3)})`;
          if (paper.current) paper.current.style.transform = `translate3d(0,${(-(p * 1080) % 36).toFixed(1)}px,0)`;
          if (sweep.current) sweep.current.style.transform = `translateX(${(-120 + ((p * 4) % 1) * 360).toFixed(1)}%)`;
          if (rail.current) rail.current.style.transform = `scaleY(${p.toFixed(4)})`;
          chipEls.forEach((el, i) => {
            const c = CHIP_POS[i];
            const dy = Math.sin(p * Math.PI * 5 + c.ph) * 1.1;
            const dx = Math.cos(p * Math.PI * 3 + c.ph) * 0.8 * (c.side === "l" ? -1 : 1);
            el.style.transform = `translate3d(${dx.toFixed(2)}em,${(dy + p * 3 * (i % 2 ? -1 : 1)).toFixed(2)}em,${c.z}em)`;
          });
        }
        if (nextCh !== ch) {
          ch = nextCh;
          const n = SHOWN[ch];
          msgEls.forEach((el, i) => (el.dataset.on = i < n ? "1" : "0"));
          capEls.forEach((el, i) => (el.dataset.on = i === ch ? "1" : "0"));
          dotEls.forEach((el, i) => (el.dataset.on = i === ch ? "1" : "0"));
          chipEls.forEach((el, i) => (el.dataset.on = i <= ch ? "1" : "0"));
          if (hint) hint.dataset.on = ch === 0 ? "1" : "0";
        }
      };
    });
    return unsub;
  }, [mode]);

  if (mode === "off") return <>{fallback}</>;

  const caps = CAPS[lang];
  const chips = CHIPS[lang];
  const LAYERS = [-0.4, -0.2, 0, 0.2, 0.4];

  return (
    <section
      ref={sec}
      id="hero"
      data-pinned
      className="relative h-[400dvh] bg-[#EEF1FA] dark:bg-[#0F1530] [--rule:#D3DBF0] dark:[--rule:#222B58]"
    >
      <style>{SCENE_CSS}</style>

      <div className="sticky top-0 h-[100dvh] overflow-hidden [--w:min(58vw,31dvh)] md:[--w:min(330px,43dvh)]">
        <div ref={paper} className="sb3d-paper" aria-hidden />
        <div aria-hidden className="absolute inset-y-0 left-3 md:left-14 w-px bg-red-400/40" />
        <div className="hidden md:block sb3d-rail" aria-hidden>
          <i ref={rail as React.RefObject<HTMLElement>} />
        </div>

        <div className="relative mx-auto max-w-6xl h-full px-4 md:px-6 pt-20 md:pt-16 grid grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1 md:grid-cols-[1.15fr_0.85fr] gap-3 md:gap-14 items-start md:items-center">
          {/* text: introduction first, then one caption per chapter */}
          <div className="md:pl-10">
            <div className="grid">
              <div data-cap data-on="1" className="sb3d-cap" style={{ gridArea: "1 / 1" }}>
                {intro}
              </div>
              {caps.map((c, i) => (
                <div key={i} data-cap data-on="0" className="sb3d-cap" style={{ gridArea: "1 / 1" }}>
                  <p className="text-sm font-bold tracking-widest mb-2" style={{ color: GREEN }}>
                    0{i + 1} / 0{caps.length}
                  </p>
                  <p role="heading" aria-level={2} className="text-3xl md:text-5xl font-extrabold leading-tight tracking-tight mb-3" style={DISPLAY}>
                    {c.t}
                  </p>
                  <p className="text-base md:text-xl text-foreground/75 leading-relaxed max-w-md">{c.d}</p>
                  {i === caps.length - 1 && outro}
                </div>
              ))}
            </div>
            <div className="hidden md:flex gap-2 mt-8" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} data-dot data-on={i === 0 ? "1" : "0"} className="sb3d-dot" />
              ))}
            </div>
          </div>

          {/* phone: top-aligned on mobile (bottom gets cropped), centred on desktop */}
          <div className="h-full">
            <div className="sb-rise relative h-full flex items-start md:items-center justify-center" style={{ animationDelay: "350ms" }}>
              <div className="relative [--cx:5.5em] md:[--cx:9.5em]" style={{ perspective: "1100px", width: "var(--w)", height: "calc(var(--w) * 2)" }} aria-hidden>
                <div
                  ref={glow}
                  className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
                  style={{
                    width: "calc(var(--w) * 2.4)",
                    height: "calc(var(--w) * 2.4)",
                    transform: "translate(-50%,-50%)",
                    background: "radial-gradient(circle, rgba(15,122,63,.32), rgba(255,201,51,.08) 45%, transparent 64%)",
                  }}
                />

                {/* orbiting proof chips */}
                <div className="absolute inset-0 pointer-events-none" style={{ fontSize: "calc(var(--w) / 19)", transformStyle: "preserve-3d" }}>
                  {chips.map((text, i) => {
                    const c = CHIP_POS[i];
                    return (
                      <div
                        key={i}
                        data-chip
                        data-on={i === 0 ? "1" : "0"}
                        className="sb3d-chip"
                        style={{ top: `${c.top}em`, ...(c.side === "l" ? { left: "calc(var(--cx) * -1)" } : { right: "calc(var(--cx) * -1)" }) }}
                      >
                        <span>{text}</span>
                      </div>
                    );
                  })}
                </div>

                <div
                  ref={phone}
                  className="relative w-full h-full"
                  style={{
                    fontSize: "calc(var(--w) / 19)",
                    transformStyle: "preserve-3d",
                    willChange: "transform",
                    transform: "rotateX(8deg) rotateY(-24deg) rotateZ(2deg) scale(.96)",
                  }}
                >
                  {/* body thickness: stacked rounded slabs */}
                  {LAYERS.map((z) => (
                    <div key={z} className="absolute inset-0" style={{ transform: `translateZ(${z}em)`, borderRadius: "2.2em", background: "#0b1020", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }} />
                  ))}

                  {/* back */}
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ transform: "rotateY(180deg) translateZ(0.5em)", backfaceVisibility: "hidden", borderRadius: "2.2em", background: `linear-gradient(160deg, ${GREEN}, #0b3d22)` }}
                  >
                    <span className="font-extrabold text-white/90" style={{ ...DISPLAY, fontSize: "2.4em" }}>
                      SB
                    </span>
                    <span className="absolute rounded-full bg-black/40" style={{ top: "1.2em", left: "1.2em", width: "3.4em", height: "3.4em" }} />
                  </div>

                  {/* front */}
                  <div className="absolute inset-0" style={{ transform: "translateZ(0.5em)", backfaceVisibility: "hidden", borderRadius: "2.2em", background: "#0b1020", padding: "0.55em" }}>
                    <div className="relative w-full h-full overflow-hidden flex flex-col bg-[#0b141a] text-white" style={{ borderRadius: "1.7em" }}>
                      <div className="flex items-center bg-[#1f2c34]" style={{ gap: "0.7em", padding: "1.6em 1em 0.8em" }}>
                        <div className="rounded-full flex items-center justify-center font-bold" style={{ width: "2.4em", height: "2.4em", fontSize: "0.9em", background: GREEN }}>
                          SB
                        </div>
                        <div className="leading-tight">
                          <div className="font-semibold" style={{ fontSize: "0.95em" }}>Shop Brain</div>
                          <div className="text-white/60" style={{ fontSize: "0.7em" }}>online</div>
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col justify-start" style={{ gap: "0.5em", padding: "0.9em 0.8em" }}>
                        {msgs.map((m, i) => (
                          <div
                            key={i}
                            data-msg
                            data-on={i < SHOWN[0] ? "1" : "0"}
                            className={`sb3d-msg leading-snug ${m.from === "me" ? "self-end bg-[#005c4b]" : "self-start bg-[#202c33]"}`}
                            style={{ maxWidth: "85%", padding: "0.5em 0.75em", fontSize: "0.92em", borderRadius: "0.8em", transformOrigin: m.from === "me" ? "bottom right" : "bottom left" }}
                          >
                            {m.text}
                            {m.from === "me" && <span className="ml-2 text-sky-300" style={{ fontSize: "0.75em" }}>✓✓</span>}
                          </div>
                        ))}
                      </div>
                      <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black" style={{ top: "0.6em", width: "5em", height: "1.1em" }} />
                      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(115deg, rgba(255,255,255,.08), transparent 35%)" }} />
                      <div ref={sweep} className="sb3d-sweep" />
                    </div>
                  </div>
                </div>
              </div>
              {badge && <div className="absolute z-10 left-0 bottom-[14%] md:bottom-[12%]">{badge}</div>}
            </div>
          </div>
        </div>

        <div data-hint data-on="1" className="sb3d-hint absolute bottom-3 left-1/2 -translate-x-1/2 text-foreground" aria-hidden>
          <ChevronDown size={26} />
        </div>
      </div>
    </section>
  );
}