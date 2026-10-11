import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { subscribe } from "./motion";

// The hero IS the 3D scene. Chapter 0 is the usual Shop Brain introduction
// (headline, body, buttons). Scrolling turns the phone and swaps the text through
// three more chapters. Pure CSS 3D: no libraries, no images, no video.
//
// Weak devices, Data Saver, 2G and reduced-motion visitors get `fallback`
// (your current hero, unchanged). If a phone turns out to be slow while
// scrolling, the 3D turning freezes but the chapters keep working, so the page
// layout never jumps.

const GREEN = "#0F7A3F";
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

// full 360° turn between chapter 1 and chapter 2 (352 = -8, 372 = 12, 360 = 0)
const ROT_Y: [number, number][] = [[0, -18], [0.18, 12], [0.4, -8], [0.62, 352], [0.86, 372], [1, 360]];
const ROT_X: [number, number][] = [[0, 6], [0.4, -4], [0.62, 8], [1, 0]];
const ROT_Z: [number, number][] = [[0, 1.5], [0.5, -2], [1, 0]];
const SCALE: [number, number][] = [[0, 0.96], [0.12, 1], [0.88, 1], [1, 0.96]];

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

  useEffect(() => {
    if (mode !== "3d") return;
    const root = sec.current;
    const ph = phone.current;
    if (!root || !ph) return;

    const msgEls = Array.from(root.querySelectorAll<HTMLElement>("[data-msg]"));
    const capEls = Array.from(root.querySelectorAll<HTMLElement>("[data-cap]"));
    const dotEls = Array.from(root.querySelectorAll<HTMLElement>("[data-dot]"));
    const hint = root.querySelector<HTMLElement>("[data-hint]");

    let last = -1;
    let ch = -1;
    let prevT = 0;
    let samples = 0;
    let sum = 0;
    let slow = false;
    let frozen = false;

    return subscribe((f) => {
      // slow-frame check: if scrolling averages under ~25fps, stop the 3D turning
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
        }
        last = p;
        if (!frozen) {
          ph.style.transform = `rotateX(${curve(ROT_X, p).toFixed(2)}deg) rotateY(${curve(ROT_Y, p).toFixed(2)}deg) rotateZ(${curve(ROT_Z, p).toFixed(2)}deg) scale(${curve(SCALE, p).toFixed(3)})`;
          if (glow.current) glow.current.style.transform = `translate(-50%,-50%) scale(${(0.8 + 0.5 * Math.sin(p * Math.PI)).toFixed(3)})`;
        }
        if (nextCh !== ch) {
          ch = nextCh;
          const n = SHOWN[ch];
          msgEls.forEach((el, i) => (el.dataset.on = i < n ? "1" : "0"));
          capEls.forEach((el, i) => (el.dataset.on = i === ch ? "1" : "0"));
          dotEls.forEach((el, i) => (el.dataset.on = i === ch ? "1" : "0"));
          if (hint) hint.dataset.on = ch === 0 ? "1" : "0";
        }
      };
    });
  }, [mode]);

  if (mode === "off") return <>{fallback}</>;

  const caps = CAPS[lang];
  const LAYERS = [-0.4, -0.2, 0, 0.2, 0.4];

  return (
    <section
      ref={sec}
      id="hero"
      data-pinned
      className="relative h-[380dvh] bg-[#EEF1FA] dark:bg-[#0F1530] [--rule:#D3DBF0] dark:[--rule:#222B58]"
      style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 35px, var(--rule) 35px, var(--rule) 36px)" }}
    >
      <style>{SCENE_CSS}</style>
      <div aria-hidden className="absolute inset-y-0 left-3 md:left-14 w-px bg-red-400/40" />

      <div className="sticky top-0 h-[100dvh] overflow-hidden [--w:min(56vw,30dvh)] md:[--w:min(300px,40dvh)]">
        <div className="mx-auto max-w-6xl h-full px-4 md:px-6 pt-20 md:pt-16 grid grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1 md:grid-cols-[1.15fr_0.85fr] gap-3 md:gap-14 items-start md:items-center">
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
              <div className="relative" style={{ perspective: "1100px", width: "var(--w)", height: "calc(var(--w) * 2)" }} aria-hidden>
                <div
                  ref={glow}
                  className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
                  style={{
                    width: "calc(var(--w) * 2.2)",
                    height: "calc(var(--w) * 2.2)",
                    transform: "translate(-50%,-50%)",
                    background: "radial-gradient(circle, rgba(15,122,63,.28), transparent 62%)",
                  }}
                />
                <div
                  ref={phone}
                  className="relative w-full h-full"
                  style={{
                    fontSize: "calc(var(--w) / 19)",
                    transformStyle: "preserve-3d",
                    willChange: "transform",
                    transform: "rotateX(6deg) rotateY(-18deg) rotateZ(1.5deg) scale(.96)",
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