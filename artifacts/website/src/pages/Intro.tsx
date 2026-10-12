import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";

// Cinematic opening, about 4 seconds, pure CSS 3D, no images, no libraries.
//
//   0.1s  a ledger page flips up into view (real 3D page-turn)
//   0.5s  three debts are handwritten, one after another
//   1.5s  every line is struck out and three PAID stamps slam down
//   1.6s  a burst of gold coins fires out of the page
//   2.0s  the page folds away like a book cover
//   2.1s  the Shop Brain mark spins in on its axis, the name types in
//   2.8s  the promise line and three proof pills arrive
//   3.6s  the screen closes like an iris and the page opens
//
// Only transform and opacity animate (plus one clip-path reveal on three short
// lines of text). No blur, no filters, no per-frame JavaScript.
// Plays on EVERY visit by default, with a Skip button. Set REMEMBER = true to
// play once per browser session instead. ?intro=0 turns it off, ?intro=1 forces it.
// Reduced-motion visitors never see it.

const INK = "#1B2559";
const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;
const HAND = { fontFamily: "'Caveat', cursive" } as const;

const PLAY_MS = 3600; // when the iris starts closing
const EXIT_MS = 750; // iris duration
const REMEMBER = false;
const KEY = "sb-intro-seen";

const SKIP: Record<string, string> = { en: "Skip", rw: "Simbuka", fr: "Passer" };
const PAID: Record<string, string> = { en: "PAID", rw: "YISHYUYE", fr: "PAYÉ" };
const TAG: Record<string, string> = {
  en: "Know who owes you. Get paid sooner.",
  rw: "Menya abakubereyemo. Wishyurwe vuba.",
  fr: "Sachez qui vous doit. Soyez payé plus vite.",
};
const PILLS: Record<string, string[]> = {
  en: ["On WhatsApp", "No app to install", "First month free"],
  rw: ["Kuri WhatsApp", "Nta porogaramu", "Ukwezi kwa mbere ni ubuntu"],
  fr: ["Sur WhatsApp", "Aucune appli", "Premier mois gratuit"],
};
const DEBTS = ["Jean · 5,000 RWF", "Mama K · 12,000 RWF", "Eric · 3,500 RWF"];

function shouldPlay() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    const f = new URLSearchParams(window.location.search).get("intro");
    if (f === "0") return false;
    if (f === "1") return true;
    if (REMEMBER && sessionStorage.getItem(KEY)) return false;
  } catch {
    /* storage can be blocked: just play */
  }
  return true;
}

// 20 gold coins, flight paths worked out once
const COINS = Array.from({ length: 20 }).map((_, i) => {
  const a = (i / 20) * Math.PI * 2 + (i % 2) * 0.25;
  const r = 7 + (i % 4) * 2.4;
  return {
    x: `${(Math.cos(a) * r).toFixed(2)}em`,
    y: `${(Math.sin(a) * r * 0.8 + 3).toFixed(2)}em`,
    spin: `${720 + (i % 3) * 360}deg`,
    d: `${(i % 5) * 18}ms`,
    big: i % 4 === 0,
  };
});

const CSS = `
html.sb-intro .sb-rise, html.sb-intro .sb-word, html.sb-intro .sb-pop{animation-play-state:paused !important}

.sbi-root{background:radial-gradient(120% 90% at 50% 40%, #2a3a7a 0%, ${INK} 42%, #0a0f26 100%)}
.sbi-exit{animation:sbi-iris ${EXIT_MS}ms cubic-bezier(.7,0,.2,1) forwards;pointer-events:none}
@keyframes sbi-iris{from{clip-path:circle(150% at 50% 48%)}to{clip-path:circle(0% at 50% 48%)}}

/* drifting ledger lines in the background */
.sbi-lines{position:absolute;left:0;right:0;top:-72px;bottom:0;pointer-events:none;opacity:.5;
  background:repeating-linear-gradient(to bottom,transparent 0,transparent 35px,rgba(120,140,220,.14) 35px,rgba(120,140,220,.14) 36px);animation:sbi-drift 3.6s linear forwards}
@keyframes sbi-drift{to{transform:translateY(72px)}}
.sbi-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(70% 60% at 50% 50%,transparent 40%,rgba(0,0,0,.55) 100%)}

.sbi-stage{display:grid;place-items:center;font-size:clamp(13px,3.8vw,21px);perspective:1300px}
.sbi-stage > *{grid-area:1/1}

.sbi-glow{width:34em;height:34em;border-radius:50%;opacity:0;pointer-events:none;background:radial-gradient(circle,rgba(18,146,77,.55),rgba(255,201,51,.12) 45%,transparent 66%);animation:sbi-fade .9s ease 1.8s forwards}
@keyframes sbi-fade{to{opacity:1}}

/* the ledger page: flips up in 3D, then folds away like a cover */
.sbi-fold{transform-origin:0 50%;transform-style:preserve-3d;animation:sbi-foldaway .55s cubic-bezier(.6,0,.9,.4) 2s forwards}
@keyframes sbi-foldaway{to{opacity:0;transform:rotateY(-105deg) translateX(-2em)}}
.sbi-card{position:relative;width:22em;max-width:90vw;padding:.7em 1.2em .7em 3.2em;border-radius:.5em;background-color:#FBF7E8;color:${INK};
  background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(3.1em - 1px),#CDD6EE calc(3.1em - 1px),#CDD6EE 3.1em);
  box-shadow:0 2.4em 5em rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.4) inset;transform-origin:50% 100%;animation:sbi-flip .85s cubic-bezier(.16,1,.3,1) .1s both}
@keyframes sbi-flip{from{opacity:0;transform:translateY(3em) rotateX(-78deg) scale(.9)}to{opacity:1;transform:none}}
.sbi-card::before{content:"";position:absolute;left:2.4em;top:0;bottom:0;width:1px;background:rgba(239,68,68,.45)}
.sbi-row{position:relative;height:3.1em;display:flex;align-items:center}
.sbi-w{display:inline-block;position:relative;font-size:2.15em;line-height:1;white-space:nowrap;animation:sbi-wr .5s cubic-bezier(.4,0,.2,1) both}
.sbi-w1{animation-delay:.55s}.sbi-w2{animation-delay:.9s}.sbi-w3{animation-delay:1.25s}
@keyframes sbi-wr{from{clip-path:inset(-20% 100% -20% 0)}to{clip-path:inset(-20% 0 -20% 0)}}
.sbi-strike{position:absolute;left:-.1em;right:-.1em;top:54%;height:.14em;border-radius:.1em;background:#dc2626;transform-origin:0 50%;transform:scaleX(0);animation:sbi-str .25s ease-out both}
.sbi-s1{animation-delay:1.6s}.sbi-s2{animation-delay:1.68s}.sbi-s3{animation-delay:1.76s}
@keyframes sbi-str{to{transform:scaleX(1)}}

.sbi-stamp{position:absolute;right:.7em;padding:.1em .5em;border:.2em solid ${GREEN};border-radius:.4em;color:${GREEN};font-weight:800;font-size:1.25em;letter-spacing:.08em;background:rgba(251,247,232,.92);opacity:0;animation:sbi-stamp .32s cubic-bezier(.34,1.56,.64,1) both}
.sbi-st1{top:.9em;animation-delay:1.7s}.sbi-st2{top:4em;animation-delay:1.8s}.sbi-st3{top:7.1em;animation-delay:1.9s}
@keyframes sbi-stamp{from{opacity:0;transform:scale(2.6) rotate(-22deg)}to{opacity:1;transform:scale(1) rotate(-8deg)}}

/* coins: each flips on its own axis while it flies */
.sbi-coin{position:absolute;left:50%;top:42%;width:1.1em;height:1.1em;margin:-.55em 0 0 -.55em;border-radius:50%;opacity:0;pointer-events:none;
  background:radial-gradient(circle at 35% 30%,#fff3b0,${SUN} 45%,#d99a00 100%);box-shadow:inset 0 0 0 .12em rgba(160,100,0,.55);animation:sbi-coin 1.1s cubic-bezier(.2,.8,.3,1) forwards;animation-delay:calc(1.75s + var(--d))}
.sbi-coin.big{width:1.6em;height:1.6em;margin:-.8em 0 0 -.8em}
@keyframes sbi-coin{0%{opacity:1;transform:translate3d(0,0,0) rotateY(0) scale(.6)}25%{opacity:1}100%{opacity:0;transform:translate3d(var(--x),var(--y),0) rotateY(var(--spin)) scale(1)}}

/* the brand */
.sbi-brand{display:flex;flex-direction:column;align-items:center;gap:1em;text-align:center;color:#fff;padding:0 1em}
.sbi-mark{width:6.4em;height:6.4em;border-radius:1.8em;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(160deg,#16a85a,${GREEN});
  box-shadow:0 1.4em 3em rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.25),0 0 0 .5em rgba(255,255,255,.06);opacity:0;animation:sbi-mark .9s cubic-bezier(.34,1.3,.64,1) 2.1s forwards}
@keyframes sbi-mark{from{opacity:0;transform:rotateY(-540deg) scale(.3)}to{opacity:1;transform:none}}
.sbi-name{font-size:3.7em;font-weight:800;letter-spacing:-.025em;line-height:1;white-space:nowrap}
.sbi-ch{display:inline-block;opacity:0;animation:sbi-ch .45s cubic-bezier(.16,1,.3,1) forwards}
@keyframes sbi-ch{from{opacity:0;transform:translateY(.6em) rotateX(-70deg)}to{opacity:1;transform:none}}
.sbi-bar{width:9em;height:.26em;border-radius:.2em;background:${SUN};transform:scaleX(0);animation:sbi-str .6s cubic-bezier(.16,1,.3,1) 2.65s forwards}
.sbi-tag{margin:0;font-size:1.3em;max-width:22em;color:rgba(255,255,255,.85);opacity:0;animation:sbi-up .6s ease 2.8s forwards}
@keyframes sbi-up{from{opacity:0;transform:translateY(.7em)}to{opacity:1;transform:none}}
.sbi-pills{display:flex;flex-wrap:wrap;gap:.5em;justify-content:center}
.sbi-pill{padding:.35em .9em;border-radius:999px;font-size:.85em;font-weight:700;color:#fff;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);opacity:0;animation:sbi-up .5s cubic-bezier(.34,1.56,.64,1) both}
.sbi-pill:nth-child(1){animation-delay:3s}.sbi-pill:nth-child(2){animation-delay:3.1s}.sbi-pill:nth-child(3){animation-delay:3.2s}

/* the timing rail */
.sbi-rail{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.08)}
.sbi-rail i{display:block;height:100%;background:${SUN};transform-origin:0 50%;transform:scaleX(0);animation:sbi-str ${PLAY_MS}ms linear forwards}

.sbi-skip{opacity:0;animation:sbi-fade .5s ease .5s forwards}
@media (prefers-reduced-motion:reduce){.sbi-root *{animation-duration:.01s !important;animation-delay:0s !important}}
`;

export default function Intro({ lang, onDone }: { lang: string; onDone: () => void }) {
  const [phase, setPhase] = useState<"play" | "exit" | "gone">(() => (shouldPlay() ? "play" : "gone"));
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // load the two fonts right away so the handwriting is ready on the first frame
  useEffect(() => {
    if (phase === "gone" || document.getElementById("shopbrain-fonts")) return;
    const link = document.createElement("link");
    link.id = "shopbrain-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Caveat:wght@600&display=swap";
    document.head.appendChild(link);
  }, [phase]);

  // hold the page's own entrance animations and the scroll until the intro ends
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (phase === "play") {
      root.classList.add("sb-intro");
      root.style.overflow = "hidden";
    } else if (phase === "exit") {
      root.classList.remove("sb-intro");
    } else {
      root.classList.remove("sb-intro");
      root.style.overflow = "";
    }
  }, [phase]);

  useEffect(
    () => () => {
      document.documentElement.classList.remove("sb-intro");
      document.documentElement.style.overflow = "";
    },
    []
  );

  useEffect(() => {
    if (phase === "gone") {
      doneRef.current();
      return;
    }
    if (phase !== "play") return;
    const t = window.setTimeout(() => setPhase("exit"), PLAY_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "exit") return;
    doneRef.current(); // the hero starts playing as the iris opens
    if (REMEMBER) {
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }
    }
    const t = window.setTimeout(() => setPhase("gone"), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;

  const name = "Shop Brain";
  const pills = PILLS[lang] ?? PILLS.en;

  return (
    <div className={`sbi-root fixed inset-0 z-[100] overflow-hidden flex items-center justify-center ${phase === "exit" ? "sbi-exit" : ""}`} role="presentation">
      <style>{CSS}</style>
      <div className="sbi-lines" aria-hidden />
      <div className="sbi-vig" aria-hidden />

      <button
        onClick={() => setPhase("exit")}
        className="sbi-skip absolute top-4 right-4 z-10 px-4 py-2 rounded-full text-sm font-semibold text-white/80 border border-white/25 hover:bg-white/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        {SKIP[lang] ?? SKIP.en}
      </button>

      <div className="sbi-stage" aria-hidden>
        <div className="sbi-glow" />

        <div className="sbi-fold">
          <div className="sbi-card">
            {DEBTS.map((d, i) => (
              <div key={d} className="sbi-row">
                <span className={`sbi-w sbi-w${i + 1}`} style={HAND}>
                  {d}
                  <i className={`sbi-strike sbi-s${i + 1}`} />
                </span>
              </div>
            ))}
            {[1, 2, 3].map((n) => (
              <div key={n} className={`sbi-stamp sbi-st${n}`} style={DISPLAY}>
                {PAID[lang] ?? PAID.en}
              </div>
            ))}
          </div>
        </div>

        {COINS.map((c, i) => (
          <i key={i} className={`sbi-coin ${c.big ? "big" : ""}`} style={{ ["--x" as any]: c.x, ["--y" as any]: c.y, ["--spin" as any]: c.spin, ["--d" as any]: c.d }} />
        ))}

        <div className="sbi-brand">
          <div className="sbi-mark">
            <MessageCircle size="3.4em" strokeWidth={2.3} />
          </div>
          <div className="sbi-name" style={DISPLAY}>
            {name.split("").map((c, i) => (
              <span key={i} className="sbi-ch" style={{ animationDelay: `${2250 + i * 50}ms` }}>
                {c === " " ? "\u00a0" : c}
              </span>
            ))}
          </div>
          <div className="sbi-bar" />
          <p className="sbi-tag">{TAG[lang] ?? TAG.en}</p>
          <div className="sbi-pills">
            {pills.map((p) => (
              <span key={p} className="sbi-pill">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="sbi-rail" aria-hidden>
        <i />
      </div>
    </div>
  );
}