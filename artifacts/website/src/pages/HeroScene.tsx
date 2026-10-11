import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";

// Opening animation (pure CSS, no assets):
//   0.0s  a phone rolls in from the left and settles
//   1.4s  the screen lights up on a home screen
//   1.9s  the chat icon is tapped, the app opens
//   2.6s  the Shop Brain chat appears, two messages pop in
//   3.9s  "Grow with ShopBrain" is written, letter by letter
//   5.9s  the screen closes like an iris and the page opens
// Page animations underneath are held until the iris starts, so visitors see
// the hero play as the page opens. Skipped for reduced-motion visitors.

const INK = "#1B2559";
const GREEN = "#0F7A3F";
const SUN = "#FFC933";
const DISPLAY = { fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" } as const;

const PLAY_MS = 5900; // when the iris starts closing
const EXIT_MS = 900; // iris duration
const REMEMBER = false; // true = play once per browser session, false = every visit
const KEY = "sb-intro-seen";

const SKIP: Record<string, string> = { en: "Skip", rw: "Simbuka", fr: "Passer" };

function shouldPlay() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (REMEMBER) {
    try {
      if (sessionStorage.getItem(KEY)) return false;
    } catch {
      /* ignore */
    }
  }
  return true;
}

const CSS = `
html.sb-intro .sb-rise, html.sb-intro .sb-word, html.sb-intro .sb-pop{animation-play-state:paused !important}

.sbi-root{background:radial-gradient(120% 90% at 50% 40%, #243066 0%, ${INK} 45%, #0F1530 100%)}
.sbi-exit{animation:sbi-iris ${EXIT_MS}ms cubic-bezier(.7,0,.2,1) forwards;pointer-events:none}
@keyframes sbi-iris{from{clip-path:circle(150% at 50% 45%)}to{clip-path:circle(0% at 50% 45%)}}

@keyframes sbi-roll{
  0%{transform:translateX(-120vw) rotate(-560deg)}
  62%{transform:translateX(0) rotate(14deg)}
  80%{transform:translateX(0) rotate(-6deg)}
  100%{transform:translateX(0) rotate(0)}
}
.sbi-roll{animation:sbi-roll 1.4s cubic-bezier(.2,.7,.3,1) both}

@keyframes sbi-fade{to{opacity:1}}
@keyframes sbi-scale{from{transform:translateX(-50%) scale(0)}to{transform:translateX(-50%) scale(1)}}
.sbi-shadow{position:absolute;left:50%;bottom:-1.4em;width:80%;height:1.4em;border-radius:50%;background:rgba(0,0,0,.45);filter:blur(10px);transform:translateX(-50%) scale(0);animation:sbi-scale .5s ease-out 1.1s forwards}
.sbi-glow{position:absolute;left:50%;top:50%;width:150%;height:110%;transform:translate(-50%,-50%);opacity:0;pointer-events:none;background:radial-gradient(circle, rgba(15,122,63,.5), transparent 62%);animation:sbi-fade .8s ease 1.4s forwards}

.sbi-screen{position:relative;width:100%;height:100%;overflow:hidden;border-radius:1.7em;background:#05070d}

.sbi-home{position:absolute;inset:0;z-index:1;opacity:0;background:linear-gradient(160deg,#27366d,#101735);animation:sbi-fade .4s ease 1.4s forwards}
@keyframes sbi-press{0%,100%{transform:scale(1)}50%{transform:scale(.88)}}
.sbi-press{animation:sbi-press .3s ease 1.85s}
@keyframes sbi-tap{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(1.7)}}
.sbi-tap{position:absolute;inset:-.4em;border-radius:1.2em;border:.2em solid rgba(255,255,255,.85);opacity:0;animation:sbi-tap .6s ease-out 1.9s}

.sbi-chat{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;background:#0b141a;opacity:0;animation:sbi-fade .01s linear 2.6s forwards}
@keyframes sbi-pop{from{opacity:0;transform:translateY(.8em) scale(.9)}to{opacity:1;transform:none}}
.sbi-m1{opacity:0;animation:sbi-pop .5s cubic-bezier(.34,1.56,.64,1) 3s forwards}
.sbi-m2{opacity:0;animation:sbi-pop .5s cubic-bezier(.34,1.56,.64,1) 3.4s forwards}

@keyframes sbi-wa{
  0%{clip-path:circle(0% at 37.5% 90%);opacity:1}
  40%{clip-path:circle(150% at 37.5% 90%);opacity:1}
  70%{clip-path:circle(150% at 37.5% 90%);opacity:1}
  100%{clip-path:circle(150% at 37.5% 90%);opacity:0}
}
.sbi-wa{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8em;background:linear-gradient(160deg,#12924d,${GREEN});animation:sbi-wa 1.1s ease 2.15s both}

@keyframes sbi-ch{from{opacity:0;transform:translateY(.5em);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}
.sbi-ch{display:inline-block;opacity:0;animation:sbi-ch .4s cubic-bezier(.16,1,.3,1) forwards}

.sbi-skip{opacity:0;animation:sbi-fade .5s ease 1s forwards}
`;

export default function Intro({ lang, onDone }: { lang: string; onDone: () => void }) {
  const [phase, setPhase] = useState<"play" | "exit" | "gone">(() => (shouldPlay() ? "play" : "gone"));
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

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

  let idx = 0;
  const words = ["Grow", "with", "ShopBrain"];
  const title = words.map((w, wi) => (
    <React.Fragment key={wi}>
      <span className="inline-block whitespace-nowrap" style={wi === 2 ? { color: SUN } : undefined}>
        {w.split("").map((c) => {
          const i = idx++;
          return (
            <span key={i} className="sbi-ch" style={{ animationDelay: `${3900 + i * 60}ms` }}>
              {c}
            </span>
          );
        })}
      </span>
      {wi < 2 ? " " : null}
    </React.Fragment>
  ));

  const dock = [0, 1, 2, 3];

  return (
    <div
      className={`sbi-root fixed inset-0 z-[100] overflow-hidden flex flex-col items-center justify-center ${phase === "exit" ? "sbi-exit" : ""}`}
      style={{ ["--w" as any]: "min(46vw, 25dvh, 220px)" }}
    >
      <style>{CSS}</style>

      <button
        onClick={() => setPhase("exit")}
        className="sbi-skip absolute top-4 right-4 z-10 px-4 py-2 rounded-full text-sm font-semibold text-white/80 border border-white/25 hover:bg-white/10 transition-colors"
      >
        {SKIP[lang] ?? SKIP.en}
      </button>

      <div className="relative" style={{ width: "var(--w)", height: "calc(var(--w) * 2)" }}>
        <div className="sbi-glow" />
        <div className="sbi-roll w-full h-full">
          <div
            className="relative w-full h-full"
            style={{ fontSize: "calc(var(--w) / 19)", borderRadius: "2.2em", background: "#0b1020", padding: "0.55em", boxShadow: "0 2em 4em rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.1)" }}
          >
            <div className="sbi-screen">
              {/* home screen */}
              <div className="sbi-home">
                <div className="absolute left-0 right-0 text-center text-white/80 font-semibold" style={{ top: "1.4em", fontSize: "0.9em" }}>
                  9:41
                </div>
                <div className="absolute left-0 right-0 grid grid-cols-4" style={{ top: "4em", padding: "0 0.9em", gap: "1.1em 0.4em" }}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="mx-auto" style={{ width: "2.8em", height: "2.8em", borderRadius: "0.8em", background: ["#7c8cc8", "#c89a7c", "#7cc8a3", "#c87c9b"][i % 4], opacity: 0.45 }} />
                  ))}
                </div>
                <div className="absolute left-0 right-0 flex justify-around" style={{ bottom: "1.2em" }}>
                  {dock.map((i) =>
                    i === 1 ? (
                      <div key={i} className="relative sbi-press" style={{ width: "3.2em", height: "3.2em" }}>
                        <div className="w-full h-full flex items-center justify-center text-white" style={{ borderRadius: "0.9em", background: `linear-gradient(160deg,#12924d,${GREEN})` }}>
                          <MessageCircle size="1.9em" strokeWidth={2.4} />
                        </div>
                        <span className="sbi-tap" />
                      </div>
                    ) : (
                      <div key={i} style={{ width: "3.2em", height: "3.2em", borderRadius: "0.9em", background: "rgba(255,255,255,.28)" }} />
                    )
                  )}
                </div>
              </div>

              {/* chat */}
              <div className="sbi-chat text-white">
                <div className="flex items-center bg-[#1f2c34]" style={{ gap: "0.7em", padding: "1.6em 1em 0.8em" }}>
                  <div className="rounded-full flex items-center justify-center font-bold" style={{ width: "2.4em", height: "2.4em", fontSize: "0.9em", background: GREEN }}>
                    SB
                  </div>
                  <div className="leading-tight">
                    <div className="font-semibold" style={{ fontSize: "0.95em" }}>Shop Brain</div>
                    <div className="text-white/60" style={{ fontSize: "0.7em" }}>online</div>
                  </div>
                </div>
                <div className="flex-1 flex flex-col" style={{ gap: "0.5em", padding: "0.9em 0.8em" }}>
                  <div className="sbi-m1 self-end bg-[#005c4b]" style={{ padding: "0.5em 0.75em", fontSize: "0.95em", borderRadius: "0.8em", transformOrigin: "bottom right" }}>
                    Hi 👋 <span className="ml-1 text-sky-300" style={{ fontSize: "0.75em" }}>✓✓</span>
                  </div>
                  <div className="sbi-m2 self-start bg-[#202c33]" style={{ maxWidth: "85%", padding: "0.5em 0.75em", fontSize: "0.92em", borderRadius: "0.8em", transformOrigin: "bottom left" }}>
                    Welcome to Shop Brain ✅
                  </div>
                </div>
              </div>

              {/* app opening splash, grows out of the tapped icon */}
              <div className="sbi-wa text-white">
                <div className="rounded-full flex items-center justify-center" style={{ width: "6em", height: "6em", border: "0.25em solid rgba(255,255,255,.9)" }}>
                  <MessageCircle size="3.2em" strokeWidth={2.2} />
                </div>
                <span className="font-semibold" style={{ fontSize: "1em" }}>Shop Brain</span>
              </div>

              <div className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black" style={{ top: "0.6em", width: "5em", height: "1.1em", zIndex: 4 }} />
            </div>
          </div>
        </div>
        <div className="sbi-shadow" />
      </div>

      <p className="mt-8 md:mt-10 px-4 text-center text-3xl md:text-5xl font-extrabold tracking-tight text-white" style={DISPLAY}>
        {title}
      </p>
    </div>
  );
}