import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

// All animation lives here. Design, colours and copy stay in Home.tsx.
// Everything is GPU-friendly (transform / opacity / clip-path), rAF-driven where
// it follows the pointer or scroll, and switched off for prefers-reduced-motion.

const GREEN = "#0F7A3F";
const EASE = "cubic-bezier(.16,1,.3,1)"; // expo-out: fast start, long soft landing

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

export const CSS = `
@keyframes sb-rise{from{opacity:0;transform:translateY(26px);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}
.sb-rise{animation:sb-rise .9s ${EASE} both}

@keyframes sb-word{from{opacity:0;transform:translateY(112%) rotate(5deg);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}
.sb-wordmask{display:inline-block;overflow:hidden;vertical-align:top;padding:.08em .04em .16em;margin:-.08em -.04em -.16em}
.sb-word{display:inline-block;transform-origin:0 100%;animation:sb-word 1.05s ${EASE} both}

@keyframes sb-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-10px) rotate(-1.2deg)}}
.sb-float{animation:sb-float 6s ease-in-out infinite}

@keyframes sb-dot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.sb-dot{animation:sb-dot 1.1s infinite}

@keyframes sb-ring{0%{box-shadow:0 0 0 0 rgba(15,122,63,.55)}100%{box-shadow:0 0 0 20px rgba(15,122,63,0)}}
.sb-ring{animation:sb-ring 2.4s ease-out infinite}

@keyframes sb-pop{0%{opacity:0;transform:translateY(16px) scale(.72)}55%{opacity:1}100%{opacity:1;transform:none}}
.sb-pop{animation:sb-pop .6s cubic-bezier(.2,1.4,.3,1) both}

.sb-reveal{opacity:0;transform:translateY(38px);filter:blur(6px);transition:opacity .9s ${EASE},transform .9s ${EASE},filter .9s ${EASE}}
.sb-in{opacity:1;transform:none;filter:none}

/* handwriting: each notebook line is "written" left to right */
@keyframes sb-write{from{clip-path:inset(-10% 100% -10% 0)}to{clip-path:inset(-10% 0 -10% 0)}}
.sb-write{clip-path:inset(-10% 100% -10% 0)}
[data-seen].is-seen .sb-write{animation:sb-write .95s cubic-bezier(.6,.05,.3,1) both;animation-delay:calc(var(--i,0) * .5s)}
[data-seen] .sb-write:nth-child(2){--i:1}
[data-seen] .sb-write:nth-child(3){--i:2}
[data-seen] .sb-write:nth-child(4){--i:3.2}

/* highlighter pen drawing across the text */
.sb-mark{background:linear-gradient(#FFC933,#FFC933) no-repeat 0 0/0% 100%;transition:background-size 1.1s ${EASE} .3s;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.sb-mark.is-seen{background-size:100% 100%}

/* cursor-following glow on cards */
.sb-spot{position:relative}
.sb-spot::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .45s ease;background:radial-gradient(420px circle at var(--mx,50%) var(--my,50%),rgba(255,201,51,.16),transparent 60%)}
.sb-spot:hover::after{opacity:1}

/* buttons: light sweep + magnetic pull (pull is done in JS via the translate property) */
@keyframes sb-shine{0%,68%{transform:translateX(-160%) skewX(-20deg)}100%{transform:translateX(420%) skewX(-20deg)}}
.sb-shine{overflow:hidden;isolation:isolate;will-change:translate}
.sb-shine:not(.fixed){position:relative}
.sb-shine::after{content:"";position:absolute;top:-20%;bottom:-20%;left:0;width:38%;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent);animation:sb-shine 5.5s ease-in-out infinite}

@media (prefers-reduced-motion:reduce){
  .sb-rise,.sb-float,.sb-dot,.sb-ring,.sb-pop,.sb-word,.sb-shine::after{animation:none}
  .sb-reveal{opacity:1;transform:none;filter:none;transition:none}
  .sb-write{clip-path:none}
  [data-seen].is-seen .sb-write{animation:none}
  .sb-mark{background-size:100% 100%;transition:none}
}
`;

// ---------------------------------------------------------------------------
// Hooks and small components
// ---------------------------------------------------------------------------

export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, seen };
}

export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: React.ReactNode; delay?: number; className?: string; as?: React.ElementType }) {
  const { ref, seen } = useInView<HTMLElement>(0.25);
  return (
    <Tag ref={ref} className={`sb-reveal ${seen ? "sb-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

// Number counts up with an expo ease, and lands with a small pulse.
export function CountUp({ to, duration = 2200 }: { to: number; duration?: number }) {
  const { ref, seen } = useInView<HTMLSpanElement>(0.4);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (prefersReducedMotion()) {
      setV(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setV(Math.round(to * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p))));
      if (p < 1) raf = requestAnimationFrame(step);
      else ref.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 500, easing: EASE });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration, ref]);
  return (
    <span ref={ref} style={{ display: "inline-block", fontVariantNumeric: "tabular-nums" }}>
      {v.toLocaleString("en-US")}
    </span>
  );
}

// Headline: every word rises out of its own mask, with a slight rotation and blur.
export function SplitHeading({ text, step = 75, delay = 80 }: { text: string; step?: number; delay?: number }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <React.Fragment key={i}>
          <span className="sb-wordmask">
            <span className="sb-word" style={{ animationDelay: `${delay + i * step}ms` }}>
              {w}
            </span>
          </span>{" "}
        </React.Fragment>
      ))}
    </>
  );
}

// 3D tilt that follows the pointer, with a soft light glare. Eased with rAF.
export function Tilt({ children, className = "", max = 8 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const glare = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0, hover = false;
    const loop = () => {
      raf = 0;
      cx += (tx - cx) * 0.1;
      cy += (ty - cy) * 0.1;
      el.style.transform = `perspective(900px) rotateX(${cy.toFixed(2)}deg) rotateY(${cx.toFixed(2)}deg)`;
      if (glare.current) glare.current.style.opacity = hover ? "1" : "0";
      if (hover || Math.abs(tx - cx) > 0.02 || Math.abs(ty - cy) > 0.02) raf = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = clamp((e.clientX - r.left) / r.width, 0, 1);
      const py = clamp((e.clientY - r.top) / r.height, 0, 1);
      tx = (px - 0.5) * max * 2;
      ty = -(py - 0.5) * max * 2;
      hover = true;
      glare.current?.style.setProperty("--gx", `${px * 100}%`);
      glare.current?.style.setProperty("--gy", `${py * 100}%`);
      kick();
    };
    const leave = () => {
      tx = ty = 0;
      hover = false;
      kick();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [max]);

  return (
    <div ref={ref} className={className} style={{ transformStyle: "preserve-3d", willChange: "transform" }}>
      <div className="sb-rise relative" style={{ animationDelay: "350ms" }}>
        {children}
        <div
          ref={glare}
          aria-hidden
          className="absolute inset-0 pointer-events-none rounded-[2.5rem]"
          style={{ opacity: 0, transition: "opacity .4s ease", background: "radial-gradient(circle at var(--gx,50%) var(--gy,50%), rgba(255,255,255,.14), transparent 55%)" }}
        />
      </div>
    </div>
  );
}

// The timeline line in "how it works" draws itself as you scroll.
export function ScrollLine() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const fill = el.firstElementChild as HTMLElement;
    const dot = el.lastElementChild as HTMLElement;
    const reduce = prefersReducedMotion();
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = host.getBoundingClientRect();
      const p = reduce ? 1 : clamp((window.innerHeight * 0.65 - r.top) / r.height, 0, 1);
      fill.style.transform = `scaleY(${p})`;
      dot.style.top = `${p * 100}%`;
      dot.style.opacity = !reduce && p > 0 && p < 1 ? "1" : "0";
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div ref={ref} aria-hidden className="absolute left-5 top-3 bottom-3 w-0.5 bg-border">
      <div className="absolute inset-0 origin-top" style={{ background: GREEN, transform: "scaleY(0)" }} />
      <div className="absolute left-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full" style={{ top: 0, opacity: 0, background: GREEN, boxShadow: "0 0 0 6px rgba(15,122,63,.18)", transition: "opacity .3s" }} />
    </div>
  );
}

// Page-wide behaviours, wired by class / attribute so Home.tsx barely changes:
//   [data-seen]  gets .is-seen when scrolled into view (drives .sb-write, .sb-mark)
//   .sb-spot     cursor glow on cards
//   .sb-shine    magnetic pull toward the cursor
export function useMotion() {
  useEffect(() => {
    const reduce = prefersReducedMotion();

    const seen = Array.from(document.querySelectorAll<HTMLElement>("[data-seen]"));
    let io: IntersectionObserver | undefined;
    if (reduce || typeof IntersectionObserver === "undefined") {
      seen.forEach((e) => e.classList.add("is-seen"));
    } else {
      io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("is-seen");
              io!.unobserve(e.target);
            }
          }),
        { threshold: 0.35 }
      );
      seen.forEach((e) => io!.observe(e));
    }

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let cur: HTMLElement | null = null;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;

    const tick = () => {
      raf = 0;
      if (!cur) return;
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      const settled = Math.abs(tx - cx) < 0.05 && Math.abs(ty - cy) < 0.05;
      if (settled && tx === 0 && ty === 0) {
        cur.style.translate = "";
        cur = null;
        cx = cy = 0;
        return;
      }
      cur.style.translate = `${cx.toFixed(2)}px ${cy.toFixed(2)}px`;
      if (!settled) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      const spot = el?.closest<HTMLElement>(".sb-spot");
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty("--mx", `${e.clientX - r.left}px`);
        spot.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      if (!fine || reduce) return;
      const m = el?.closest<HTMLElement>(".sb-shine") ?? null;
      if (m) {
        if (cur && cur !== m) {
          cur.style.translate = "";
          cx = cy = 0;
        }
        cur = m;
        const r = m.getBoundingClientRect();
        tx = clamp((e.clientX - (r.left + r.width / 2 - cx)) * 0.3, -14, 14);
        ty = clamp((e.clientY - (r.top + r.height / 2 - cy)) * 0.3, -9, 9);
        kick();
      } else if (cur) {
        tx = ty = 0;
        kick();
      }
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      io?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Hero phone: same chat as before, but messages spring in and the ones already
// on screen glide up smoothly (FLIP) instead of jumping.
// ---------------------------------------------------------------------------

export function PhoneChat({ msgs }: { msgs: { from: string; text: string }[] }) {
  const [shown, setShown] = useState(0);
  const list = useRef<HTMLDivElement | null>(null);
  const tops = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(msgs.length);
      return;
    }
    setShown(0);
    let n = 0;
    let id: ReturnType<typeof setTimeout>;
    const next = () => {
      if (n >= msgs.length) {
        id = setTimeout(() => {
          n = 0;
          setShown(0);
          next();
        }, 4000);
        return;
      }
      id = setTimeout(() => {
        n += 1;
        setShown(n);
        next();
      }, n === 0 ? 700 : 1600);
    };
    next();
    return () => clearTimeout(id);
  }, [msgs]);

  const typing = shown < msgs.length && msgs[shown].from === "bot";

  useLayoutEffect(() => {
    const host = list.current;
    if (!host) return;
    const next = new Map<string, number>();
    host.querySelectorAll<HTMLElement>("[data-k]").forEach((el) => {
      const k = el.dataset.k as string;
      const top = el.getBoundingClientRect().top;
      next.set(k, top);
      const was = tops.current.get(k);
      if (was !== undefined && Math.abs(was - top) > 1 && !prefersReducedMotion()) {
        el.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: 650, easing: EASE });
      }
    });
    tops.current = next;
  }, [shown, typing]);

  return (
    <div className="mx-auto w-full max-w-[290px] rounded-[2.5rem] border-[10px] border-[#0b1020] bg-[#0b1020] shadow-2xl rotate-1">
      <div className="rounded-[1.8rem] overflow-hidden bg-[#0b141a]">
        <div className="flex items-center gap-3 px-4 py-3 bg-[#1f2c34] text-white">
          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: GREEN }}>
            SB
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Shop Brain</div>
            <div className="text-[11px] text-white/60">{typing ? "typing…" : "online"}</div>
          </div>
        </div>
        <div ref={list} className="h-[400px] px-3 py-4 flex flex-col justify-end gap-2 overflow-hidden" aria-label="Example WhatsApp conversation">
          {msgs.slice(0, shown).map((m, i) => (
            <div
              key={i}
              data-k={`m${i}`}
              className={`sb-pop max-w-[85%] px-3 py-2 rounded-xl text-[13px] leading-snug text-white ${
                m.from === "me" ? "self-end bg-[#005c4b] rounded-tr-sm" : "self-start bg-[#202c33] rounded-tl-sm"
              }`}
              style={{ transformOrigin: m.from === "me" ? "bottom right" : "bottom left" }}
            >
              {m.text}
              {m.from === "me" && <span className="ml-2 text-[10px] text-sky-300">✓✓</span>}
            </div>
          ))}
          {typing && (
            <div data-k="typing" className="sb-pop self-start bg-[#202c33] rounded-xl rounded-tl-sm px-3 py-3 flex gap-1" style={{ transformOrigin: "bottom left" }} aria-hidden>
              {[0, 1, 2].map((d) => (
                <span key={d} className="sb-dot w-1.5 h-1.5 rounded-full bg-white/70" style={{ animationDelay: `${d * 160}ms` }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}