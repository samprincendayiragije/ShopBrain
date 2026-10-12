import React, { useEffect, useRef, useState } from "react";
import { subscribe } from "./motion";
import type { Frame } from "./motion";

// "The notebook vs Shop Brain": a pinned scroll story.
//
//   0  THE NOTEBOOK    the debts are written by hand, line by line, as you scroll
//   1  NOBODY KNOWS    a crossed-out line, question marks, a coffee ring, a torn corner
//   2  SHOP BRAIN      the notebook slides away, the phone arrives, the same debts
//                      appear as short WhatsApp messages
//   3  YOUR TOTAL      the total counts up and a paper receipt slides out beside the phone
//
// WHAT CHANGED IN THIS VERSION
//   - A receipt card (chapter 3) that slides out of the phone, so "a receipt for
//     every payment" is shown, not just said.
//   - A green glow behind the phone that breathes with the scroll.
//   - Frozen mode now also cross-fades the receipt, so slow phones see the same story.
//
// WHY THIS ONE IS SAFE ON PCs AND PHONES
//   - No WebGL, no canvas, no images, no video, no filters, no blur, no
//     backdrop-filter. About 90 DOM nodes and four moving layers.
//   - Only transform and opacity move every frame (compositor only). Everything
//     else changes once, when a chapter changes.
//   - It listens to scroll only while the section is within one screen of the
//     viewport. Anywhere else on the page it costs nothing.
//   - No React state in the animation path.
//   - It watches its own frame times. If scrolling is slow it first drops the 3D
//     tilt (lite), then freezes the movement and just cross-fades the chapters.
//   - Reduced motion, Data Saver, 2G, <= 2 GB memory or <= 2 cores: it does not
//     render at all (the notebook section above it already tells the story).
//   - Touch phones and low-end machines start in lite mode (no 3D tilt).
//
// URL switches for testing: ?nb=0 (never), ?nb=1 (always, skip device checks),
// ?nb=lite (always, no 3D tilt).

const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;
const HAND = { fontFamily: "'Caveat', cursive" } as const;

type Lang = "rw" | "en" | "fr";
type Cap = { tag: string; t: string; d: string };
type Copy = {
  caps: Cap[];
  head: string;
  chat: { me: boolean; text: string }[];
  owed: string;
  rc: { h: string; who: string; amt: string; ok: string };
};

const COPY: Record<Lang, Copy> = {
  en: {
    head: "Debts",
    owed: "Total owed",
    rc: { h: "Receipt", who: "Eric", amt: "3,500 RWF", ok: "Paid ✓" },
    caps: [
      { tag: "THE NOTEBOOK", t: "Written once. Lost for good.", d: "Pages tear, names smudge, and the amount is a guess." },
      { tag: "NOBODY KNOWS", t: "Nobody remembers who paid", d: "Customers forget, you chase, and the time you spend chasing is time you are not selling." },
      { tag: "SHOP BRAIN", t: "Same debts, now in WhatsApp", d: "One short message each. Shop Brain confirms before it saves, so nothing is a guess." },
      { tag: "YOUR TOTAL", t: "Your total, any time", d: "17,000 RWF owed, who to call, and a receipt for every payment." },
    ],
    chat: [
      { me: true, text: "Jean 5000" },
      { me: false, text: "✅ Jean · 5,000 RWF" },
      { me: true, text: "Mama K 12000" },
      { me: false, text: "✅ Mama K · 12,000 RWF" },
      { me: false, text: "💰 Eric paid 3,500 RWF. Receipt sent." },
      { me: false, text: "You are owed 17,000 RWF by 2 customers." },
    ],
  },
  rw: {
    head: "Imyenda",
    owed: "Igiteranyo",
    rc: { h: "Inyemezabwishyu", who: "Eric", amt: "3,500 RWF", ok: "Yishyuye ✓" },
    caps: [
      { tag: "IGATABO", t: "Wandika rimwe, rirazimira", d: "Impapuro zirashwanyuka, amazina arasibangana, amafaranga ukayakeka." },
      { tag: "NTA WUZI", t: "Nta wibuka uwishyuye", d: "Abakiriya baribagirwa, ukabakurikirana, umwanya wari gucuruza ugatakara." },
      { tag: "SHOP BRAIN", t: "Imyenda imwe, ubu kuri WhatsApp", d: "Ubutumwa bugufi kuri buri mwenda. Shop Brain irabyemeza mbere yo kubika, nta gukeka." },
      { tag: "IGITERANYO", t: "Igiteranyo cyawe, igihe cyose", d: "17,000 RWF abereyemo, abo guhamagara, n'inyemezabwishyu kuri buri bwishyu." },
    ],
    chat: [
      { me: true, text: "Jean 5000" },
      { me: false, text: "✅ Jean · 5,000 RWF" },
      { me: true, text: "Mama K 12000" },
      { me: false, text: "✅ Mama K · 12,000 RWF" },
      { me: false, text: "💰 Eric yishyuye 3,500 RWF. Inyemezabwishyu yoherejwe." },
      { me: false, text: "Abakubereyemo bose: 17,000 RWF (abakiriya 2)." },
    ],
  },
  fr: {
    head: "Dettes",
    owed: "Total dû",
    rc: { h: "Reçu", who: "Eric", amt: "3 500 RWF", ok: "Payé ✓" },
    caps: [
      { tag: "LE CAHIER", t: "Écrit une fois, perdu pour toujours", d: "Les pages se déchirent, les noms s'effacent et le montant est une devinette." },
      { tag: "PERSONNE NE SAIT", t: "Personne ne sait qui a payé", d: "Les clients oublient, vous relancez, et ce temps-là n'est pas du temps passé à vendre." },
      { tag: "SHOP BRAIN", t: "Les mêmes dettes, dans WhatsApp", d: "Un court message chacune. Shop Brain confirme avant d'enregistrer, rien n'est deviné." },
      { tag: "VOTRE TOTAL", t: "Votre total, à tout moment", d: "17 000 RWF dus, qui appeler, et un reçu pour chaque paiement." },
    ],
    chat: [
      { me: true, text: "Jean 5000" },
      { me: false, text: "✅ Jean · 5 000 RWF" },
      { me: true, text: "Mama K 12000" },
      { me: false, text: "✅ Mama K · 12 000 RWF" },
      { me: false, text: "💰 Eric a payé 3 500 RWF. Reçu envoyé." },
      { me: false, text: "On vous doit 17 000 RWF (2 clients)." },
    ],
  },
};

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const ease = (p: number) => 1 - Math.pow(1 - p, 2.4);
const TOTAL = 17000;

// ---- device checks
function flag() {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("nb");
  } catch {
    return null;
  }
}

function isWeakDevice() {
  if (typeof window === "undefined") return true;
  const f = flag();
  if (f === "0") return true;
  if (f === "1" || f === "lite") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  if (n.connection?.saveData) return true;
  if (/2g/.test(n.connection?.effectiveType ?? "")) return true;
  if (typeof n.deviceMemory === "number" && n.deviceMemory <= 2) return true;
  if (typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency <= 2) return true;
  return false;
}

function startsLite() {
  if (typeof window === "undefined") return true;
  const f = flag();
  if (f === "lite") return true;
  if (f === "1") return false;
  const n = navigator as Navigator & { deviceMemory?: number };
  const touch = !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const modest = (typeof n.deviceMemory === "number" && n.deviceMemory <= 4) || (typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency <= 4);
  return touch || modest;
}

// ---- styles (self-contained: no Tailwind classes, so nothing can go missing)
const CSS = `
.sbn-root{position:relative;height:320vh;height:320dvh;color:#fff;background:radial-gradient(120% 90% at 70% 40%,#243066 0%,#1B2559 45%,#0F1530 100%)}
@media (max-width:767px){.sbn-root{height:300vh;height:300dvh}}
.sbn-stage{position:sticky;top:0;height:100vh;height:100dvh;overflow:hidden;contain:layout paint}
.sbn-grid{max-width:72rem;height:100%;margin:0 auto;padding:5rem 1rem 1rem;display:grid;grid-template-rows:auto minmax(0,1fr);gap:.5rem;align-items:start}
@media (min-width:768px){.sbn-grid{grid-template-rows:none;grid-template-columns:1.05fr .95fr;gap:3rem;padding:4rem 1.5rem 1rem;align-items:center}}

/* captions */
.sbn-caps{display:grid}
.sbn-cap{grid-area:1/1;opacity:0;transform:translateY(18px);transition:opacity .5s ease,transform .7s cubic-bezier(.16,1,.3,1);pointer-events:none}
.sbn-cap[data-on="1"]{opacity:1;transform:none;pointer-events:auto}
.sbn-tag{margin:0;font-size:.8rem;font-weight:700;letter-spacing:.18em;color:${SUN}}
.sbn-title{margin:.4rem 0 .75rem;font-size:clamp(1.7rem,4.2vw,3rem);font-weight:800;line-height:1.1;letter-spacing:-.01em}
.sbn-desc{margin:0;max-width:28rem;font-size:clamp(1rem,1.6vw,1.2rem);line-height:1.55;color:rgba(255,255,255,.76)}
.sbn-dots{display:none}
@media (min-width:768px){.sbn-dots{display:flex;gap:.5rem;margin-top:2rem}}
.sbn-dot{height:4px;width:22px;border-radius:2px;background:rgba(255,255,255,.25);transition:background .3s,width .4s cubic-bezier(.16,1,.3,1)}
.sbn-dot[data-on="1"]{background:${SUN};width:44px}

/* object area. Everything inside is sized in em, so one font-size scales the scene */
.sbn-objwrap{display:flex;align-items:center;justify-content:center;height:100%;min-height:0}
.sbn-obj{position:relative;width:22em;height:26em;font-size:clamp(10px,min(4.2vw,2.7vh),19px);font-size:clamp(10px,min(4.2vw,2.7dvh),19px);perspective:1200px}
.sbn-root[data-lite="1"] .sbn-obj{perspective:none}

/* glow behind the phone */
.sbn-glow{position:absolute;left:50%;top:50%;width:30em;height:30em;margin:-15em 0 0 -15em;border-radius:50%;pointer-events:none;opacity:0;background:radial-gradient(circle,rgba(18,146,77,.38),transparent 62%)}

/* notebook */
.sbn-nbw{position:absolute;left:50%;top:50%;width:19em;height:24em;margin:-12em 0 0 -9.5em;opacity:0}
.sbn-nbshadow{position:absolute;left:6%;right:0;bottom:-3%;height:9%;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,.55),transparent 70%)}
.sbn-card{position:absolute;inset:0;border-radius:.45em;background-color:#FBF7E8;color:#1B2559;
  background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 3.1em,#CDD6EE 3.1em,#CDD6EE 3.2em);background-position:0 4em;
  clip-path:polygon(0 0,100% 0,100% calc(100% - var(--c,0em)),calc(100% - var(--c,0em)) 100%,0 100%)}
.sbn-spiral{position:absolute;left:.6em;top:0;bottom:0;width:1.6em;background:radial-gradient(circle at 50% 50%,#0F1530 0 .32em,#9aa3c4 .36em .5em,transparent .55em) 0 0/1.6em 2.2em repeat-y}
.sbn-margin{position:absolute;left:3.6em;top:0;bottom:0;width:1px;background:rgba(239,68,68,.45)}
.sbn-page{position:absolute;left:4.4em;right:1em;top:0}
.sbn-head{height:4em;display:flex;align-items:flex-end;padding-bottom:.3em;font-size:2.3em;line-height:1;opacity:.75}
.sbn-head span{border-bottom:.08em solid #1B2559}
.sbn-row{position:relative;min-height:3.2em;display:flex;align-items:flex-end;padding-bottom:.28em}
.sbn-hww{position:relative;display:inline-block}
.sbn-hw{display:block;font-size:2.1em;line-height:1;white-space:nowrap;clip-path:inset(-20% calc((1 - var(--w,0)) * 100%) -20% 0)}
.sbn-hw.sbn-red{color:#dc2626;font-size:1.65em;line-height:1.15;white-space:normal}
.sbn-strike{position:absolute;left:-.1em;right:-.1em;top:52%;height:.16em;border-radius:.1em;background:#dc2626;transform-origin:0 50%;transform:scaleX(0)}
.sbn-q{position:absolute;right:-.1em;top:.1em;width:1.7em;height:1.7em;display:flex;align-items:center;justify-content:center;border:.14em solid #dc2626;border-radius:50%;color:#dc2626;font-weight:700;font-size:1.2em;transform:scale(0) rotate(-20deg);transition:transform .45s cubic-bezier(.34,1.56,.64,1)}
.sbn-q[data-on="1"]{transform:scale(1) rotate(6deg)}
.sbn-stain{position:absolute;right:1.4em;top:8.8em;width:6.5em;height:6.5em;border-radius:50%;border:.45em solid rgba(120,72,30,.3);background:radial-gradient(circle,rgba(120,72,30,.12),rgba(120,72,30,.04) 62%,transparent 64%);opacity:0;transform:rotate(-12deg)}
.sbn-torn{position:absolute;right:0;bottom:0;width:5.5em;height:5.5em;background:linear-gradient(135deg,#e9e1c4,#cfc59f);clip-path:polygon(100% 0,100% 100%,0 100%);transform-origin:100% 100%}

/* phone */
.sbn-phw{position:absolute;left:50%;top:50%;width:11.5em;height:23em;margin:-11.5em 0 0 -5.75em;opacity:0;visibility:hidden}
.sbn-phone{box-sizing:border-box;width:100%;height:100%;padding:.5em;border-radius:2.1em;background:#0b1020;box-shadow:0 1.6em 3em rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.1)}
.sbn-phscreen{position:relative;height:100%;display:flex;flex-direction:column;overflow:hidden;border-radius:1.65em;background:#0b141a}
.sbn-phhead{display:flex;align-items:center;gap:.6em;padding:1.5em .9em .7em;background:#1f2c34}
.sbn-av{width:2.1em;height:2.1em;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${GREEN};font-size:.8em;font-weight:700}
.sbn-phhead b{display:block;font-size:.85em;font-weight:600;line-height:1.2}
.sbn-phhead small{display:block;font-size:.62em;color:rgba(255,255,255,.6)}
.sbn-chat{flex:1;display:flex;flex-direction:column;gap:.45em;padding:.8em .7em;min-height:0}
.sbn-b{max-width:88%;padding:.45em .7em;font-size:.8em;line-height:1.35;border-radius:.8em;opacity:0;transform:translateY(.8em) scale(.92);transition:opacity .4s ease,transform .55s cubic-bezier(.34,1.56,.64,1)}
.sbn-b[data-on="1"]{opacity:1;transform:none}
.sbn-b i{margin-left:.5em;font-style:normal;font-size:.75em;color:#7dd3fc}
.sbn-me{align-self:flex-end;background:#005c4b;transform-origin:100% 100%}
.sbn-bot{align-self:flex-start;background:#202c33;transform-origin:0 100%}
.sbn-total{margin:.5em .6em .7em;padding:.55em .8em;display:flex;align-items:center;justify-content:space-between;gap:.5em;border-radius:.9em;background:linear-gradient(160deg,#12924d,${GREEN});font-size:.8em;opacity:0;transform:translateY(1em);transition:opacity .4s ease,transform .6s cubic-bezier(.34,1.56,.64,1)}
.sbn-total[data-on="1"]{opacity:1;transform:none}
.sbn-total span{opacity:.85}
.sbn-total b{font-variant-numeric:tabular-nums}
.sbn-notch{position:absolute;left:50%;top:.55em;width:4.2em;height:.95em;margin-left:-2.1em;border-radius:1em;background:#000}

/* the receipt that slides out in chapter 3 */
.sbn-rc{position:absolute;right:-1.4em;bottom:3.2em;width:8.6em;padding:.8em .9em 1.1em;border-radius:.4em;background:#FBF7E8;color:#1B2559;box-shadow:0 1em 2em rgba(0,0,0,.4);opacity:0;visibility:hidden;
  clip-path:polygon(0 0,100% 0,100% calc(100% - .5em),92% 100%,84% calc(100% - .5em),76% 100%,68% calc(100% - .5em),60% 100%,52% calc(100% - .5em),44% 100%,36% calc(100% - .5em),28% 100%,20% calc(100% - .5em),12% 100%,4% calc(100% - .5em),0 100%)}
.sbn-rc h5{margin:0 0 .5em;font-size:.72em;font-weight:800;letter-spacing:.04em;opacity:.7}
.sbn-rc p{margin:0;font-size:1.5em;line-height:1.1}
.sbn-rc strong{display:block;margin-top:.25em;font-size:.95em;font-variant-numeric:tabular-nums}
.sbn-rc em{display:inline-block;margin-top:.5em;padding:.1em .5em;border-radius:.3em;background:${GREEN};color:#fff;font-style:normal;font-size:.72em;font-weight:700}

.sbn-bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:${SUN};transform-origin:0 50%;transform:scaleX(0)}

/* frozen mode (a very slow device): no movement, just cross-fade the objects by chapter */
.sbn-root[data-frozen="1"] .sbn-nbw,.sbn-root[data-frozen="1"] .sbn-phw,.sbn-root[data-frozen="1"] .sbn-rc{transition:opacity .5s ease;visibility:visible}
.sbn-root[data-frozen="1"] .sbn-nbw{opacity:1}
.sbn-root[data-frozen="1"] .sbn-phw{opacity:0}
.sbn-root[data-frozen="1"] .sbn-rc{opacity:0}
.sbn-root[data-frozen="1"][data-ch="2"] .sbn-nbw,.sbn-root[data-frozen="1"][data-ch="3"] .sbn-nbw{opacity:0}
.sbn-root[data-frozen="1"][data-ch="2"] .sbn-phw,.sbn-root[data-frozen="1"][data-ch="3"] .sbn-phw{opacity:1}
.sbn-root[data-frozen="1"][data-ch="3"] .sbn-rc{opacity:1}
`;

type Props = { lang: Lang; msgs?: unknown; notebook: string[]; note: string };

export default function PhoneScene({ lang, notebook, note }: Props) {
  const [on] = useState(() => !isWeakDevice());
  const liteStart = useRef(startsLite());
  const sec = useRef<HTMLElement | null>(null);
  const nbw = useRef<HTMLDivElement | null>(null);
  const phw = useRef<HTMLDivElement | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  const cnt = useRef<HTMLSpanElement | null>(null);
  const rcp = useRef<HTMLDivElement | null>(null);
  const glw = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!on) return;
    const root = sec.current, nb = nbw.current, ph = phw.current, br = bar.current, ct = cnt.current, rc = rcp.current, gl = glw.current;
    if (!root || !nb || !ph || !br || !ct || !rc || !gl || !ct.firstChild) return;
    const txt = ct.firstChild as Text; // updated through .data, so no DOM nodes are added or removed

    const q = <T extends HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));
    const capEls = q("[data-cap]");
    const dotEls = q("[data-dot]");
    const bubEls = q("[data-b]");
    const qEls = q("[data-q]");
    const hwEls = q("[data-hw]");
    const total = root.querySelector<HTMLElement>("[data-total]");
    const strike = root.querySelector<HTMLElement>("[data-strike]");
    const stain = root.querySelector<HTMLElement>("[data-stain]");
    const torn = root.querySelector<HTMLElement>("[data-torn]");
    const fmt = (n: number) => {
      const s = n.toLocaleString("en-US");
      return lang === "fr" ? s.replace(/,/g, "\u202f") : s;
    };

    let lite = liteStart.current;
    let frozen = false, needClear = false, dirty = true;
    let lastP = -1, lastQ = -1, ch = -1, nB = -1, qOn = -1, totOn = -1, cLast = -1, lk = -1, ls = -1, lt = -1;
    let nbHidden = false, phHidden = true, rcHidden = true;
    const lw = [-1, -1, -1, -1];
    let prevT = 0, samples = 0, sum = 0;

    const write = (p: number, qa: number) => {
      lastP = p;
      lastQ = qa;
      dirty = false;
      const en = ease(clamp((qa - 0.2) / 0.8, 0, 1)); // notebook arrives while the section scrolls in
      const e1 = ease(clamp((p - 0.46) / 0.14, 0, 1)); // notebook leaves
      const e2 = ease(clamp((p - 0.48) / 0.14, 0, 1)); // phone arrives
      const e3 = ease(clamp((p - 0.8) / 0.12, 0, 1)); // receipt slides out

      if (needClear) {
        needClear = false;
        for (const el of [nb, ph, rc, gl]) {
          el.style.transform = "";
          el.style.opacity = "";
          el.style.visibility = "";
        }
        br.style.transform = "";
      }

      if (!frozen) {
        const tilt = lite ? "" : `rotateX(${(4 + 8 * (1 - en)).toFixed(1)}deg) rotateY(${(-4 - 12 * (1 - en) - 20 * e1).toFixed(1)}deg) `;
        nb.style.transform = `translate3d(${(-13 * e1).toFixed(2)}em,${((1 - en) * 5).toFixed(2)}em,0) ${tilt}rotate(${(-9 * e1).toFixed(1)}deg) scale(${(0.9 + 0.1 * en - 0.12 * e1).toFixed(3)})`;
        nb.style.opacity = (Math.min(1, en * 1.6) * (1 - e1)).toFixed(3);
        const nbH = e1 >= 1;
        if (nbH !== nbHidden) {
          nbHidden = nbH;
          nb.style.visibility = nbH ? "hidden" : "";
        }

        const sway = lite ? 0 : 6 * Math.sin(clamp((p - 0.62) / 0.38, 0, 1) * Math.PI);
        const phTilt = lite ? "" : `rotateY(${((1 - e2) * 38 + sway).toFixed(1)}deg) `;
        ph.style.transform = `translate3d(${((1 - e2) * 12).toFixed(2)}em,${((1 - e2) * 2).toFixed(2)}em,0) ${phTilt}rotate(${((1 - e2) * 7).toFixed(1)}deg) scale(${(0.88 + 0.12 * e2).toFixed(3)})`;
        ph.style.opacity = e2.toFixed(3);
        const phH = e2 <= 0;
        if (phH !== phHidden) {
          phHidden = phH;
          ph.style.visibility = phH ? "hidden" : "visible";
        }

        // receipt: slides out from behind the phone, settles with a small tilt
        rc.style.transform = `translate3d(${(-5 * (1 - e3)).toFixed(2)}em,${(2.5 * (1 - e3)).toFixed(2)}em,0) rotate(${(-12 * (1 - e3) + 5 * e3).toFixed(1)}deg) scale(${(0.8 + 0.2 * e3).toFixed(3)})`;
        rc.style.opacity = e3.toFixed(3);
        const rcH = e3 <= 0;
        if (rcH !== rcHidden) {
          rcHidden = rcH;
          rc.style.visibility = rcH ? "hidden" : "visible";
        }

        // glow breathes with the phone
        gl.style.opacity = (e2 * 0.9).toFixed(3);
        gl.style.transform = `scale(${(0.7 + 0.45 * e2 + 0.1 * Math.sin(p * Math.PI * 3)).toFixed(3)})`;

        br.style.transform = `scaleX(${p.toFixed(4)})`;
      }

      // handwriting, one line after another
      for (let i = 0; i < 4; i++) {
        const w = Math.round(clamp((p - (0.012 + i * 0.062)) / 0.055, 0, 1) * 50) / 50;
        if (w !== lw[i]) {
          lw[i] = w;
          hwEls[i]?.style.setProperty("--w", String(w));
        }
      }

      // the mess: strike-through, coffee ring, torn corner, question marks
      const k = Math.round(clamp((p - 0.27) / 0.04, 0, 1) * 50) / 50;
      if (strike && k !== lk) {
        lk = k;
        strike.style.transform = `scaleX(${k})`;
      }
      const s = Math.round(clamp((p - 0.3) / 0.1, 0, 1) * 50) / 50;
      if (stain && s !== ls) {
        ls = s;
        stain.style.opacity = (s * 0.9).toFixed(2);
      }
      const t = Math.round(clamp((p - 0.3) / 0.16, 0, 1) * 50) / 50;
      if (torn && t !== lt) {
        lt = t;
        const te = ease(t);
        torn.style.transform = `translate(${(te * 7).toFixed(2)}em,${(te * 12).toFixed(2)}em) rotate(${(te * 38).toFixed(1)}deg)`;
        torn.style.opacity = (1 - clamp((t - 0.6) / 0.4, 0, 1)).toFixed(2);
        nb.style.setProperty("--c", `${(5.5 * te).toFixed(2)}em`);
      }
      const qo = p > 0.28 ? 1 : 0;
      if (qo !== qOn) {
        qOn = qo;
        qEls.forEach((el) => (el.dataset.on = String(qo)));
      }

      // chapters
      const nextCh = p < 0.25 ? 0 : p < 0.5 ? 1 : p < 0.78 ? 2 : 3;
      if (nextCh !== ch) {
        ch = nextCh;
        root.dataset.ch = String(ch);
        capEls.forEach((el, i) => (el.dataset.on = i === ch ? "1" : "0"));
        dotEls.forEach((el, i) => (el.dataset.on = i === ch ? "1" : "0"));
      }

      // chat bubbles, one after another
      const n = clamp(Math.floor((p - 0.56) / 0.055) + 1, 0, bubEls.length);
      if (n !== nB) {
        nB = n;
        bubEls.forEach((el, i) => (el.dataset.on = i < n ? "1" : "0"));
      }

      // total
      const to = p > 0.78 ? 1 : 0;
      if (total && to !== totOn) {
        totOn = to;
        total.dataset.on = String(to);
      }
      const cv = Math.round((TOTAL * ease(clamp((p - 0.78) / 0.14, 0, 1))) / 100) * 100;
      if (cv !== cLast) {
        cLast = cv;
        txt.data = fmt(cv);
      }
    };

    const tick = (f: Frame) => {
      try {
        // slow-frame check: lite first, then frozen
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
          if (sum / samples > 40) {
            if (!lite) {
              lite = true;
              root.dataset.lite = "1";
              dirty = true;
            } else if (!frozen) {
              frozen = true;
              needClear = true;
              root.dataset.frozen = "1";
              dirty = true;
            }
          }
          samples = 0;
          sum = 0;
        }

        const r = root.getBoundingClientRect();
        const top = r.top + (f.y - f.sy);
        const p = clamp(-top / Math.max(1, r.height - f.vh), 0, 1);
        const qa = clamp((f.vh - top) / f.vh, 0, 1);
        if (!dirty && Math.abs(p - lastP) < 0.0004 && Math.abs(qa - lastQ) < 0.001) return;
        return () => {
          try {
            write(p, qa);
          } catch {
            /* never let this scene take the page down */
          }
        };
      } catch {
        return;
      }
    };

    // only listen to scroll while the section is within a screen of the viewport
    let unsub: (() => void) | null = null;
    const start = () => {
      if (!unsub) {
        dirty = true;
        unsub = subscribe(tick);
      }
    };
    const stop = () => {
      unsub?.();
      unsub = null;
    };
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") start();
    else {
      io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { rootMargin: "120% 0px 120% 0px" });
      io.observe(root);
    }
    return () => {
      io?.disconnect();
      stop();
    };
  }, [on, lang]);

  if (!on) return null;

  const c = COPY[lang];
  const lines = notebook.slice(0, 3);

  return (
    <section ref={sec} id="why" className="sbn-root" data-lite={liteStart.current ? "1" : "0"}>
      <style>{CSS}</style>
      <div className="sbn-stage">
        <div className="sbn-grid">
          <div>
            <div className="sbn-caps">
              {c.caps.map((cap, i) => (
                <div key={i} data-cap data-on={i === 0 ? "1" : "0"} className="sbn-cap">
                  <p className="sbn-tag">
                    0{i + 1} / 0{c.caps.length} · {cap.tag}
                  </p>
                  <p role="heading" aria-level={2} className="sbn-title" style={DISPLAY}>
                    {cap.t}
                  </p>
                  <p className="sbn-desc">{cap.d}</p>
                </div>
              ))}
            </div>
            <div className="sbn-dots" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} data-dot data-on={i === 0 ? "1" : "0"} className="sbn-dot" />
              ))}
            </div>
          </div>

          <div className="sbn-objwrap" aria-hidden>
            <div className="sbn-obj">
              <div ref={glw} className="sbn-glow" />

              {/* the notebook */}
              <div ref={nbw} className="sbn-nbw">
                <div className="sbn-nbshadow" />
                <div className="sbn-card">
                  <div className="sbn-spiral" />
                  <div className="sbn-margin" />
                  <div data-stain className="sbn-stain" />
                  <div className="sbn-page">
                    <div className="sbn-head" style={HAND}>
                      <span>{c.head}</span>
                    </div>
                    {lines.map((line, i) => (
                      <div key={i} className="sbn-row">
                        <span className="sbn-hww">
                          <span data-hw className="sbn-hw" style={{ ...HAND, color: "#1B2559", opacity: i === 2 ? 0.8 : 1 }}>
                            {line}
                          </span>
                          {i === 2 && <span data-strike className="sbn-strike" />}
                        </span>
                        {i < 2 && (
                          <span data-q className="sbn-q" style={HAND}>
                            ?
                          </span>
                        )}
                      </div>
                    ))}
                    <div className="sbn-row">
                      <span data-hw className="sbn-hw sbn-red" style={HAND}>
                        {note}
                      </span>
                    </div>
                  </div>
                </div>
                <div data-torn className="sbn-torn" />
              </div>

              {/* the phone */}
              <div ref={phw} className="sbn-phw">
                <div className="sbn-phone">
                  <div className="sbn-phscreen">
                    <div className="sbn-phhead">
                      <div className="sbn-av">SB</div>
                      <div>
                        <b>Shop Brain</b>
                        <small>online</small>
                      </div>
                    </div>
                    <div className="sbn-chat">
                      {c.chat.map((m, i) => (
                        <div key={i} data-b data-on="0" className={`sbn-b ${m.me ? "sbn-me" : "sbn-bot"}`}>
                          {m.text}
                          {m.me && <i>✓✓</i>}
                        </div>
                      ))}
                    </div>
                    <div data-total data-on="0" className="sbn-total">
                      <span>{c.owed}</span>
                      <b>
                        <span ref={cnt}>0</span> RWF
                      </b>
                    </div>
                    <div className="sbn-notch" />
                  </div>
                </div>
              </div>

              {/* the receipt */}
              <div ref={rcp} className="sbn-rc">
                <h5>{c.rc.h}</h5>
                <p style={HAND}>{c.rc.who}</p>
                <strong>{c.rc.amt}</strong>
                <em>{c.rc.ok}</em>
              </div>
            </div>
          </div>
        </div>
        <div ref={bar} className="sbn-bar" aria-hidden />
      </div>
    </section>
  );
}