import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";

// Opening animation, about 3.8 seconds, pure CSS, no images.
// It tells the whole product story in one gesture:
//
//   0.1s  a ledger page rises in (the notebook every shop owner knows)
//   0.3s  two debts are handwritten, one after the other
//   1.3s  both are struck through and a green PAID stamp lands with a small burst
//   1.8s  the page lifts away and the Shop Brain mark pops in
//   2.0s  the name is typed in, then the promise line fades in
//   3.1s  the screen closes like an iris and the page opens
//
// Only transform and opacity animate (plus one clip-path reveal on two short
// lines of text). No blur, no filters, no JavaScript per frame.
// Plays once per browser session, so returning visitors go straight to the page.
// Page animations underneath are held until the iris starts.
// Skipped for reduced-motion visitors. Add ?intro=1 to the URL to force it.

const INK = "#1B2559";
const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;
const HAND = { fontFamily: "'Caveat', cursive" } as const;

const PLAY_MS = 3100; // when the iris starts closing
const EXIT_MS = 700; // iris duration
const REMEMBER = true; // true = once per browser session, false = every visit
const KEY = "sb-intro-seen";

const SKIP: Record<string, string> = { en: "Skip", rw: "Simbuka", fr: "Passer" };
const PAID: Record<string, string> = { en: "PAID", rw: "YISHYUYE", fr: "PAYÉ" };
const TAG: Record<string, string> = {
  en: "Know who owes you.",
  rw: "Menya abakubereyemo.",
  fr: "Sachez qui vous doit.",
};

function shouldPlay() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    if (new URLSearchParams(window.location.search).get("intro") === "1") return true;
    if (REMEMBER && sessionStorage.getItem(KEY)) return false;
  } catch {
    /* storage can be blocked: just play */
  }
  return true;
}

// 14 confetti pieces, positions worked out once
const BURST = Array.from({ length: 14 }).map((_, i) => {
  const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
  const r = 5.5 + (i % 3) * 1.6;
  return {
    x: `${(Math.cos(a) * r).toFixed(2)}em`,
    y: `${(Math.sin(a) * r).toFixed(2)}em`,
    rot: `${(i * 67) % 360}deg`,
    c: i % 3 === 0 ? SUN : i % 3 === 1 ? GREEN : "#ffffff",
  };
});

const CSS = `
html.sb-intro .sb-rise, html.sb-intro .sb-word, html.sb-intro .sb-pop{animation-play-state:paused !important}

.sbi-root{background:radial-gradient(120% 90% at 50% 40%, #243066 0%, ${INK} 45%, #0F1530 100%)}
.sbi-exit{animation:sbi-iris ${EXIT_MS}ms cubic-bezier(.7,0,.2,1) forwards;pointer-events:none}
@keyframes sbi-iris{from{clip-path:circle(150% at 50% 48%)}to{clip-path:circle(0% at 50% 48%)}}

.sbi-stage{display:grid;place-items:center;font-size:clamp(13px,3.6vw,19px)}
.sbi-stage > *{grid-area:1/1}

.sbi-glow{width:30em;height:30em;border-radius:50%;opacity:0;pointer-events:none;background:radial-gradient(circle,rgba(15,122,63,.45),transparent 62%);animation:sbi-glow 1.2s ease 1.7s forwards}
@keyframes sbi-glow{to{opacity:1}}

/* the ledger page */
.sbi-cardwrap{animation:sbi-out .45s cubic-bezier(.5,0,.8,.4) 1.8s forwards}
@keyframes sbi-out{to{opacity:0;transform:translateY(-1.6em) scale(.9)}}
.sbi-card{position:relative;width:21em;max-width:88vw;padding:.5em 1.2em .5em 3.2em;border-radius:.5em;background-color:#FBF7E8;color:${INK};
  background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(3.1em - 1px),#CDD6EE calc(3.1em - 1px),#CDD6EE 3.1em);
  box-shadow:0 2em 4em rgba(0,0,0,.45);animation:sbi-up .7s cubic-bezier(.16,1,.3,1) .1s both}
@keyframes sbi-up{from{opacity:0;transform:translateY(2.6em) scale(.94) rotate(-2deg)}to{opacity:1;transform:none}}
.sbi-card::before{content:"";position:absolute;left:2.4em;top:0;bottom:0;width:1px;background:rgba(239,68,68,.45)}
.sbi-row{position:relative;height:3.1em;display:flex;align-items:center}
.sbi-w{display:inline-block;position:relative;font-size:2.1em;line-height:1;white-space:nowrap;animation:sbi-wr .55s cubic-bezier(.4,0,.2,1) both}
.sbi-w1{animation-delay:.35s}
.sbi-w2{animation-delay:.8s}
@keyframes sbi-wr{from{clip-path:inset(-20% 100% -20% 0)}to{clip-path:inset(-20% 0 -20% 0)}}
.sbi-strike{position:absolute;left:-.1em;right:-.1em;top:54%;height:.14em;border-radius:.1em;background:#dc2626;transform-origin:0 50%;transform:scaleX(0);animation:sbi-str .3s ease-out both}
.sbi-s1{animation-delay:1.2s}
.sbi-s2{animation-delay:1.32s}
@keyframes sbi-str{to{transform:scaleX(1)}}

.sbi-stamp{position:absolute;right:.9em;top:1.6em;padding:.15em .6em;border:.2em solid ${GREEN};border-radius:.4em;color:${GREEN};font-weight:800;font-size:1.6em;letter-spacing:.08em;background:rgba(251,247,232,.9);opacity:0;animation:sbi-stamp .38s cubic-bezier(.34,1.56,.64,1) 1.4s forwards}
@keyframes sbi-stamp{from{opacity:0;transform:scale(2.4) rotate(-20deg)}to{opacity:1;transform:scale(1) rotate(-8deg)}}
.sbi-pc{position:absolute;right:3.2em;top:3.2em;width:.7em;height:.7em;border-radius:.15em;opacity:0;animation:sbi-pc .8s cubic-bezier(.2,.8,.3,1) 1.5s forwards}
@keyframes sbi-pc{0%{opacity:1;transform:translate(0,0) rotate(0) scale(1)}100%{opacity:0;transform:translate(var(--x),var(--y)) rotate(var(--r)) scale(.4)}}

/* the brand */
.sbi-brand{display:flex;flex-direction:column;align-items:center;gap:1.1em;text-align:center;color:#fff}
.sbi-mark{width:5.4em;height:5.4em;border-radius:1.5em;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(160deg,#12924d,${GREEN});box-shadow:0 1.2em 2.6em rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,255,255,.2);opacity:0;animation:sbi-mark .6s cubic-bezier(.34,1.56,.64,1) 1.85s forwards}
@keyframes sbi-mark{from{opacity:0;transform:scale(.3) rotate(-25deg)}to{opacity:1;transform:none}}
.sbi-name{font-size:3.4em;font-weight:800;letter-spacing:-.02em;line-height:1;white-space:nowrap}
.sbi-ch{display:inline-block;opacity:0;animation:sbi-ch .4s cubic-bezier(.16,1,.3,1) forwards}
@keyframes sbi-ch{from{opacity:0;transform:translateY(.55em)}to{opacity:1;transform:none}}
.sbi-tag{margin:0;font-size:1.35em;color:rgba(255,255,255,.8);opacity:0;animation:sbi-tag .6s ease 2.45s forwards}
@keyframes sbi-tag{from{opacity:0;transform:translateY(.6em)}to{opacity:1;transform:none}}
.sbi-bar{width:7em;height:.22em;border-radius:.2em;background:${SUN};transform:scaleX(0);animation:sbi-str .5s cubic-bezier(.16,1,.3,1) 2.35s forwards}

.sbi-skip{opacity:0;animation:sbi-glow .5s ease .6s forwards}
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

  return (
    <div
      className={`sbi-root fixed inset-0 z-[100] overflow-hidden flex items-center justify-center ${phase === "exit" ? "sbi-exit" : ""}`}
      role="presentation"
    >
      <style>{CSS}</style>

      <button
        onClick={() => setPhase("exit")}
        className="sbi-skip absolute top-4 right-4 z-10 px-4 py-2 rounded-full text-sm font-semibold text-white/80 border border-white/25 hover:bg-white/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        {SKIP[lang] ?? SKIP.en}
      </button>

      <div className="sbi-stage" aria-hidden>
        <div className="sbi-glow" />

        <div className="sbi-cardwrap">
          <div className="sbi-card">
            <div className="sbi-row">
              <span className="sbi-w sbi-w1" style={HAND}>
                Jean · 5,000 RWF
                <i className="sbi-strike sbi-s1" />
              </span>
            </div>
            <div className="sbi-row">
              <span className="sbi-w sbi-w2" style={HAND}>
                Mama K · 12,000 RWF
                <i className="sbi-strike sbi-s2" />
              </span>
            </div>
            <div className="sbi-stamp" style={DISPLAY}>
              {PAID[lang] ?? PAID.en}
            </div>
            {BURST.map((b, i) => (
              <i key={i} className="sbi-pc" style={{ background: b.c, ["--x" as any]: b.x, ["--y" as any]: b.y, ["--r" as any]: b.rot }} />
            ))}
          </div>
        </div>

        <div className="sbi-brand">
          <div className="sbi-mark">
            <MessageCircle size="2.9em" strokeWidth={2.3} />
          </div>
          <div className="sbi-name" style={DISPLAY}>
            {name.split("").map((c, i) => (
              <span key={i} className="sbi-ch" style={{ animationDelay: `${2000 + i * 45}ms` }}>
                {c === " " ? "\u00a0" : c}
              </span>
            ))}
          </div>
          <div className="sbi-bar" />
          <p className="sbi-tag">{TAG[lang] ?? TAG.en}</p>
        </div>
      </div>
    </div>
  );
}