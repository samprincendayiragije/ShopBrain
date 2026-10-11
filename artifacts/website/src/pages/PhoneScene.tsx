import React, { useEffect, useRef, useState } from "react";
import { subscribe } from "./motion";

// Full-screen pinned section: a 3D phone that turns as you scroll.
// Pure CSS 3D (no three.js, no images, no video): ~0 KB of libraries.
// On weak devices the section renders nothing, so the page is exactly the
// current design. Detection happens at load and again at runtime (slow frames).

const INK = "#1B2559";
const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;

type Lang = "rw" | "en" | "fr";
type Msg = { from: string; text: string };

const CAPS: Record<Lang, { t: string; d: string }[]> = {
  en: [
    { t: "Text the bot", d: "Open WhatsApp and message Shop Brain. No app, no login." },
    { t: "One message, one debt", d: "Name, item, amount. Shop Brain confirms before it saves." },
    { t: "Reminders go out for you", d: "Only to customers who agreed, and never after STOP." },
    { t: "Paid. Receipt sent.", d: "Your balance updates and the customer gets proof." },
  ],
  rw: [
    { t: "Andikira roboti", d: "Fungura WhatsApp wandikire Shop Brain. Nta porogaramu, nta kwiyandikisha." },
    { t: "Ubutumwa bumwe, umwenda umwe", d: "Izina, igicuruzwa, amafaranga. Shop Brain irabyemeza mbere yo kubika." },
    { t: "Inyibutsa zijya ku bwawe", d: "Ku bemeye gusa, kandi nta na rimwe nyuma ya STOP." },
    { t: "Yishyuye. Inyemezabwishyu yoherejwe.", d: "Konti yawe ivugururwa, umukiriya agahabwa gihamya." },
  ],
  fr: [
    { t: "Écrivez au bot", d: "Ouvrez WhatsApp et écrivez à Shop Brain. Pas d'appli, pas de connexion." },
    { t: "Un message, une dette", d: "Nom, article, montant. Shop Brain confirme avant d'enregistrer." },
    { t: "Les rappels partent seuls", d: "Seulement aux clients qui ont accepté, jamais après STOP." },
    { t: "Payé. Reçu envoyé.", d: "Votre solde se met à jour et le client a sa preuve." },
  ],
};

// how many chat bubbles are visible in each chapter (chat has 5 messages)
const SHOWN = [1, 3, 4, 5];

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const sm = (t: number) => t * t * (3 - 2 * t);

// piecewise smoothstep through keyframes: the phone eases to a rest at each key
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

const ROT_Y: [number, number][] = [[0, -32], [0.14, 14], [0.4, -10], [0.62, 350], [0.86, 372], [1, 360]];
const ROT_X: [number, number][] = [[0, 12], [0.4, -4], [0.62, 8], [1, 0]];
const ROT_Z: [number, number][] = [[0, 3], [0.5, -2], [1, 0]];
const SCALE: [number, number][] = [[0, 0.86], [0.14, 1], [0.86, 1], [1, 0.94]];

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
.sb3d-dot{height:4px;width:22px;border-radius:2px;background:rgba(255,255,255,.2);transition:background .3s,width .4s cubic-bezier(.16,1,.3,1)}
.sb3d-dot[data-on="1"]{background:${SUN};width:44px}
`;

export default function PhoneScene({ lang, msgs }: { lang: Lang; msgs: Msg[] }) {
  const [mode, setMode] = useState<"3d" | "off">(() => (isWeakDevice() ? "off" : "3d"));
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

    let last = -1;
    let ch = -1;
    let prevT = 0;
    let samples = 0;
    let sum = 0;
    let slow = false;

    const unsub = subscribe((f) => {
      // runtime fallback: if scroll frames are consistently slow, drop the scene
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
      const top = r.top + (f.y - f.sy); // smoothed scroll, same trick as the other effects
      const p = clamp(-top / Math.max(1, r.height - f.vh), 0, 1);
      const nextCh = Math.min(3, Math.floor(p * 4));
      if (!slow && Math.abs(p - last) < 0.0003 && nextCh === ch) return;

      return () => {
        if (slow) {
          setMode("off");
          return;
        }
        last = p;
        ph.style.transform = `rotateX(${curve(ROT_X, p).toFixed(2)}deg) rotateY(${curve(ROT_Y, p).toFixed(2)}deg) rotateZ(${curve(ROT_Z, p).toFixed(2)}deg) scale(${curve(SCALE, p).toFixed(3)})`;
        if (glow.current) glow.current.style.transform = `translate(-50%,-50%) scale(${(0.8 + 0.5 * Math.sin(p * Math.PI)).toFixed(3)})`;
        if (nextCh !== ch) {
          ch = nextCh;
          const n = SHOWN[ch];
          msgEls.forEach((el, i) => (el.dataset.on = i < n ? "1" : "0"));
          capEls.forEach((el, i) => (el.dataset.on = i === ch ? "1" : "0"));
          dotEls.forEach((el, i) => (el.dataset.on = i === ch ? "1" : "0"));
        }
      };
    });
    return unsub;
  }, [mode]);

  if (mode === "off") return null;

  const caps = CAPS[lang];
  const LAYERS = [-0.4, -0.2, 0, 0.2, 0.4];

  return (
    <section ref={sec} id="scene" className="relative h-[420dvh] text-white" style={{ background: INK }}>
      <style>{SCENE_CSS}</style>
      <div className="sticky top-0 h-[100dvh] overflow-hidden" style={{ ["--w" as any]: "min(260px, 36dvh, 62vw)" }}>
        <div className="container mx-auto max-w-6xl h-full px-4 md:px-6 pt-20 pb-6 md:py-0 grid grid-rows-[1fr_auto] md:grid-rows-1 md:grid-cols-2 gap-4 md:gap-10 items-center">
          {/* captions */}
          <div className="order-2 md:order-1 text-center md:text-left">
            <div className="grid">
              {caps.map((c, i) => (
                <div key={i} data-cap data-on={i === 0 ? "1" : "0"} className="sb3d-cap" style={{ gridArea: "1 / 1" }}>
                  <p className="text-sm font-bold tracking-widest mb-2" style={{ color: SUN }}>
                    0{i + 1} / 04
                  </p>
                  <h3 className="text-3xl md:text-5xl font-extrabold leading-tight tracking-tight mb-3" style={DISPLAY}>
                    {c.t}
                  </h3>
                  <p className="text-base md:text-xl text-white/75 leading-relaxed max-w-md mx-auto md:mx-0">{c.d}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-6 justify-center md:justify-start" aria-hidden>
              {caps.map((_, i) => (
                <span key={i} data-dot data-on={i === 0 ? "1" : "0"} className="sb3d-dot" />
              ))}
            </div>
          </div>

          {/* phone */}
          <div className="order-1 md:order-2 relative flex items-center justify-center h-full" style={{ perspective: "1100px" }} aria-hidden>
            <div
              ref={glow}
              className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
              style={{
                width: "calc(var(--w) * 2.2)",
                height: "calc(var(--w) * 2.2)",
                transform: "translate(-50%,-50%)",
                background: "radial-gradient(circle, rgba(15,122,63,.45), transparent 62%)",
              }}
            />
            <div
              ref={phone}
              className="relative"
              style={{
                width: "var(--w)",
                height: "calc(var(--w) * 2)",
                fontSize: "calc(var(--w) / 19)",
                transformStyle: "preserve-3d",
                willChange: "transform",
                transform: "rotateX(12deg) rotateY(-32deg) rotateZ(3deg) scale(.86)",
              }}
            >
              {/* body thickness: stacked rounded slabs */}
              {LAYERS.map((z) => (
                <div key={z} className="absolute inset-0" style={{ transform: `translateZ(${z}em)`, borderRadius: "2.2em", background: "#0b1020", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }} />
              ))}

              {/* back */}
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: "rotateY(180deg) translateZ(0.5em)",
                  backfaceVisibility: "hidden",
                  borderRadius: "2.2em",
                  background: `linear-gradient(160deg, ${GREEN}, #0b3d22)`,
                }}
              >
                <span className="font-extrabold text-white/90" style={{ ...DISPLAY, fontSize: "2.4em" }}>
                  SB
                </span>
                <span className="absolute rounded-full bg-black/40" style={{ top: "1.2em", left: "1.2em", width: "3.4em", height: "3.4em" }} />
              </div>

              {/* front */}
              <div className="absolute inset-0" style={{ transform: "translateZ(0.5em)", backfaceVisibility: "hidden", borderRadius: "2.2em", background: "#0b1020", padding: "0.55em" }}>
                <div className="relative w-full h-full overflow-hidden flex flex-col bg-[#0b141a]" style={{ borderRadius: "1.7em" }}>
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
                        className={`sb3d-msg leading-snug text-white ${m.from === "me" ? "self-end bg-[#005c4b]" : "self-start bg-[#202c33]"}`}
                        style={{ maxWidth: "85%", padding: "0.5em 0.75em", fontSize: "0.92em", borderRadius: "0.8em", transformOrigin: m.from === "me" ? "bottom right" : "bottom left" }}
                      >
                        {m.text}
                        {m.from === "me" && <span className="ml-2 text-sky-300" style={{ fontSize: "0.75em" }}>✓✓</span>}
                      </div>
                    ))}
                  </div>
                  {/* notch */}
                  <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black" style={{ top: "0.6em", width: "5em", height: "1.1em" }} />
                  {/* sheen */}
                  <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(115deg, rgba(255,255,255,.08), transparent 35%)" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}