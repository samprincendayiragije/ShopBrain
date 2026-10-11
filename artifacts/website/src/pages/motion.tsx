import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

// v3. All animation lives here. Home.tsx needs NO changes: same exports, same
// class names, same colours. Only motion is added.
//
// What is new in v3 (everything is scroll-linked and reverses when you scroll up):
//   1. One shared scroll engine: a single rAF loop with smoothed scroll (inertia)
//      and scroll velocity. It sleeps when the page is still.
//   2. Hero exit: the headline and phone recede in depth as you scroll away, and
//      the phone tips back in 3D.
//   3. Section headings: ink wipe + de-blur that is scrubbed by scroll.
//   4. Notebook: the handwriting is written line by line as you scroll, and the
//      highlighter on the pricing card is drawn by scroll.
//   5. How it works: the timeline has a comet dot that stretches with scroll
//      speed, and each step slides in, staggered, as the line reaches it.
//   6. Feature cards rise with a depth lag (right column trails the left).
//   7. Pricing ticket: both halves slide together and lock in.
//   8. QR code spins and scales in. Check lists tick in one by one.
//   9. Fast scrolling gives the card grids a very slight velocity skew.
//  10. The hero phone is a real 3D phone (raw WebGL, no library). It turns with
//      your scroll, leans with scroll speed and follows the pointer. On weak
//      devices, data saver, reduced motion, no WebGL or a low frame rate it falls
//      back to the original DOM phone by itself.
// Everything respects prefers-reduced-motion and pauses when off-screen.

const GREEN = "#0F7A3F";
const EASE = "cubic-bezier(.16,1,.3,1)"; // expo-out
const SPRING = "cubic-bezier(.34,1.56,.64,1)"; // soft overshoot

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const isFine = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const ease = (p: number) => 1 - Math.pow(1 - p, 2.4);
const setProp = (el: HTMLElement, prop: string, val: string) => {
  if (val) el.style.setProperty(prop, val);
  else el.style.removeProperty(prop);
};

// ---------------------------------------------------------------------------
// Scroll engine
// One scroll listener and one rAF loop for the whole page. Every subscriber
// reads layout first and returns a write function, so all reads happen before
// all writes (no layout thrashing). The loop stops when scroll has settled.
// ---------------------------------------------------------------------------

export type Frame = { y: number; sy: number; vel: number; vh: number; max: number };
export type Tick = (f: Frame) => void | (() => void);

const ticks = new Set<Tick>();
let rafId = 0;
let lastT = 0;
let sy = 0; // smoothed scroll position (lags behind the real one)
let lastY = 0;
let vel = 0; // scroll velocity, px per 60fps frame, smoothed
let quietUntil = 0;

const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
const snapshot = (): Frame => ({ y: window.scrollY, sy, vel, vh: window.innerHeight, max: maxScroll() });

function frame(now: number) {
  rafId = 0;
  const y = window.scrollY;
  const dt = clamp(now - lastT, 1, 50);
  lastT = now;
  sy += (y - sy) * (1 - Math.exp(-dt / 85));
  if (Math.abs(y - sy) < 0.05) sy = y;
  vel += (((y - lastY) / dt) * 16.67 - vel) * (1 - Math.exp(-dt / 110));
  if (Math.abs(vel) < 0.02) vel = 0;
  lastY = y;

  const f: Frame = { y, sy, vel, vh: window.innerHeight, max: maxScroll() };
  const writes: (() => void)[] = [];
  ticks.forEach((t) => {
    const w = t(f);
    if (w) writes.push(w);
  });
  for (let i = 0; i < writes.length; i++) writes[i]();

  if (sy !== y || vel !== 0 || now < quietUntil) rafId = requestAnimationFrame(frame);
}

export function wake() {
  quietUntil = performance.now() + 240;
  if (!rafId && ticks.size) {
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }
}

export function subscribe(t: Tick) {
  if (!ticks.size) {
    sy = lastY = window.scrollY;
    vel = 0;
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
  }
  ticks.add(t);
  const w = t(snapshot()); // paint the first state immediately, no flash
  if (w) w();
  wake();
  return () => {
    ticks.delete(t);
    if (!ticks.size) {
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

// 0 -> 1 as an element's top travels from `start` to `end` (fractions of the
// viewport height). If the element can never scroll far enough (it sits near
// the end of the page) the range shrinks, so it always finishes.
function progress(top: number, f: Frame, start: number, end: number) {
  const sL = f.vh * start;
  const reach = top - (f.max - f.y); // where this element ends up at the very bottom
  const eL = Math.max(f.vh * end, reach + 2);
  if (sL - eL < 24) return top <= sL ? 1 : 0;
  return clamp((sL - top) / (sL - eL), 0, 1);
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

export const CSS = `
@keyframes sb-rise{from{opacity:0;transform:translateY(28px);filter:blur(10px)}to{opacity:1;transform:none;filter:none}}
.sb-rise{animation:sb-rise 1s ${EASE} both}

@keyframes sb-word{from{opacity:0;transform:translateY(118%) rotate(6deg);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}
.sb-wordmask{display:inline-block;overflow:hidden;vertical-align:top;padding:.08em .04em .16em;margin:-.08em -.04em -.16em}
.sb-word{display:inline-block;transform-origin:0 100%;animation:sb-word 1.1s ${EASE} both}

@keyframes sb-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-11px) rotate(-1.4deg)}}
.sb-float{animation:sb-float 6s ease-in-out infinite;animation-play-state:var(--ps,running)}

@keyframes sb-dot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.sb-dot{animation:sb-dot 1.1s infinite}

@keyframes sb-ring{0%{box-shadow:0 0 0 0 rgba(15,122,63,.55)}100%{box-shadow:0 0 0 22px rgba(15,122,63,0)}}
.sb-ring{animation:sb-ring 2.4s ease-out infinite;animation-play-state:var(--ps,running)}

@keyframes sb-pop{0%{opacity:0;transform:translateY(18px) scale(.7)}55%{opacity:1}100%{opacity:1;transform:none}}
.sb-pop{animation:sb-pop .65s ${SPRING} both}

/* how-it-works steps: the number badge and the text slide in, staggered, driven by --p (set from JS) */
.sb-rv{--p:0}
.sb-rv>*{--q:clamp(0,calc(var(--p) * 1.7 - var(--k,0) * .22),1);opacity:var(--q);translate:calc((1 - var(--q)) * 36px) 0;filter:blur(calc((1 - var(--q)) * 8px))}
.sb-rv>*:nth-child(2){--k:1}
.sb-rv>*:nth-child(3){--k:2}
.sb-rv>*:nth-child(4){--k:3}
.sb-rv.is-done>*{filter:none}

/* section headings: ink wipe, left to right, scrubbed by scroll (--p is set from JS, translate too) */
.sb-h2{--p:0;opacity:clamp(0,calc(var(--p) * 2.2),1);filter:blur(calc((1 - var(--p)) * 10px));-webkit-mask-image:linear-gradient(90deg,#000 42%,transparent 58%);mask-image:linear-gradient(90deg,#000 42%,transparent 58%);-webkit-mask-size:260% 100%;mask-size:260% 100%;-webkit-mask-position:calc((1 - var(--p)) * 100%) 0;mask-position:calc((1 - var(--p)) * 100%) 0}
.sb-h2.is-done{filter:none;-webkit-mask-image:none;mask-image:none}

/* handwriting: each line is written in turn as the notebook scrolls into view */
.sb-write{clip-path:inset(-10% calc((1 - clamp(0,calc(var(--p,0) * 4.4 - var(--i,0)),1)) * 100%) -10% 0)}
[data-seen] .sb-write:nth-child(2){--i:1}
[data-seen] .sb-write:nth-child(3){--i:2}
[data-seen] .sb-write:nth-child(4){--i:3.2}
[data-seen].is-done .sb-write{clip-path:none}

/* highlighter pen: drawn by scroll */
.sb-mark{background-image:linear-gradient(#FFC933,#FFC933);background-repeat:no-repeat;background-position:0 0;background-size:calc(clamp(0,calc((var(--p,0) - .15) * 2),1) * 100%) 100%;-webkit-box-decoration-break:clone;box-decoration-break:clone}

/* cursor glow on cards */
.sb-spot{position:relative}
.sb-spot::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .45s ease;background:radial-gradient(420px circle at var(--mx,50%) var(--my,50%),rgba(255,201,51,.16),transparent 60%)}
.sb-spot:hover::after{opacity:1}

/* buttons: light sweep + magnetic pull (JS drives the translate property) */
@keyframes sb-shine{0%,68%{transform:translateX(-160%) skewX(-20deg)}100%{transform:translateX(420%) skewX(-20deg)}}
.sb-shine{overflow:hidden;isolation:isolate;will-change:translate}
.sb-shine:not(.fixed){position:relative}
.sb-shine::after{content:"";position:absolute;top:-20%;bottom:-20%;left:0;width:38%;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent);animation:sb-shine 5.5s ease-in-out infinite;animation-play-state:var(--ps,running)}

/* how-it-works: each number lights up as the line reaches it */
.sb-tl > li > span:first-child{transition:transform .8s ${SPRING},box-shadow .8s ease}
.sb-tl > li[data-on="1"] > span:first-child{transform:scale(1.14);box-shadow:0 0 0 8px rgba(255,201,51,.32)}

@media (prefers-reduced-motion:reduce){
  .sb-rise,.sb-float,.sb-dot,.sb-ring,.sb-pop,.sb-word,.sb-shine::after{animation:none}
  .sb-rv>*{opacity:1;translate:none;filter:none}
  .sb-h2{opacity:1;filter:none;-webkit-mask-image:none;mask-image:none}
  .sb-write{clip-path:none}
  .sb-mark{background-size:100% 100%}
  .sb-tl > li > span:first-child{transition:none}
}
`;

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

// Small confetti burst (Web Animations API, no canvas, cleans itself up).
function burst(el: HTMLElement) {
  if (prefersReducedMotion()) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const cols = ["#FFC933", GREEN, "#1B2559", "#ffffff"];
  for (let i = 0; i < 20; i++) {
    const s = 5 + Math.random() * 5;
    const d = document.createElement("i");
    Object.assign(d.style, {
      position: "fixed",
      left: `${cx - s / 2}px`,
      top: `${cy - s / 2}px`,
      width: `${s}px`,
      height: `${s * (Math.random() > 0.5 ? 1 : 0.45)}px`,
      borderRadius: "2px",
      background: cols[i % cols.length],
      pointerEvents: "none",
      zIndex: "60",
    });
    document.body.appendChild(d);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.3;
    const v = 70 + Math.random() * 120;
    const dx = Math.cos(a) * v;
    const dy = Math.sin(a) * v;
    d.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx * 1.15}px,${dy + 100}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
      ],
      { duration: 1100 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" }
    ).onfinish = () => d.remove();
  }
}

// ---------------------------------------------------------------------------
// Scroll-scrubbed targets
// Found by selector so Home.tsx needs nothing extra. If you restructure Home.tsx,
// this is the one place that knows about its markup.
// ---------------------------------------------------------------------------

type Mode = "var" | "seen" | "fade" | "card" | "pop";
type Item = { el: HTMLElement; mode: Mode; start: number; end: number; ax: number; ay: number; p: number; off: number };

function paint(it: Item, p: number) {
  const e = ease(p);
  const done = e >= 0.999;
  const tx = done ? 0 : (1 - e) * it.ax;
  const ty = done ? 0 : (1 - e) * it.ay;
  const move = !tx && !ty ? "" : `${tx.toFixed(1)}px ${ty.toFixed(1)}px`;
  const el = it.el;
  switch (it.mode) {
    case "var":
    case "seen":
      el.style.setProperty("--p", (done ? 1 : e).toFixed(4));
      setProp(el, "translate", move);
      break;
    case "fade":
      el.style.opacity = done ? "" : Math.min(1, e * 1.5).toFixed(3);
      setProp(el, "translate", move);
      break;
    case "card":
      setProp(el, "translate", move);
      break;
    case "pop":
      el.style.opacity = done ? "" : Math.min(1, e * 1.6).toFixed(3);
      setProp(el, "scale", done ? "" : (0.78 + 0.22 * e).toFixed(3));
      setProp(el, "rotate", done ? "" : `${(-14 * (1 - e)).toFixed(2)}deg`);
      break;
  }
  el.classList.toggle("is-done", done);
  it.p = p;
  it.off = it.mode === "pop" ? 0 : ty;
}

function collect(existing: Map<HTMLElement, Item>): Item[] {
  const out: Item[] = [];
  const seenEls = new Set<HTMLElement>();
  const put = (node: Element | null | undefined, mode: Mode, start: number, end: number, ax = 0, ay = 0) => {
    if (!(node instanceof HTMLElement) || seenEls.has(node)) return;
    seenEls.add(node);
    const prev = existing.get(node);
    if (prev) {
      Object.assign(prev, { mode, start, end, ax, ay });
      out.push(prev);
    } else {
      out.push({ el: node, mode, start, end, ax, ay, p: -1, off: 0 });
    }
  };
  const all = (sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<HTMLElement>(sel));

  // section headings: ink wipe
  all("main h2").forEach((h) => {
    h.classList.add("sb-h2");
    put(h, "var", 0.94, 0.58, 0, 22);
  });

  // notebook (handwriting) and the highlighter on the pricing card
  all("[data-seen]").forEach((el) => {
    if (el.querySelector(".sb-write")) put(el, "seen", 0.92, 0.34, -64, 0);
    else put(el, "seen", 0.97, 0.6);
  });

  // "With Shop Brain" check list, ticked in one by one
  const problem = document.querySelector(".sb-write")?.closest("section");
  if (problem) all("ul > li", problem).forEach((el, i) => put(el, "fade", 0.97 - i * 0.04, 0.62, -24, 10));

  // feature cards: rise with a depth lag, the right column trails the left
  all(".sb-spot").forEach((el, i) => put(el, "card", 0.99 - (i % 2) * 0.05, 0.5, 0, 44 + (i % 2) * 30));

  // pricing ticket: two halves slide together
  const ticket = document.querySelector<HTMLElement>("#pricing .grid");
  if (ticket) {
    put(ticket.children[0], "fade", 0.92, 0.52, -60, 0);
    put(ticket.children[1], "fade", 0.92, 0.52, 60, 0);
  }
  all("#pricing li").forEach((el, i) => put(el, "fade", 0.97 - i * 0.035, 0.64, -20, 0));

  // QR code spins and scales in
  put(document.querySelector("#get-started figure"), "pop", 0.95, 0.5);

  return out;
}

const gridsOf = () =>
  Array.from(new Set(Array.from(document.querySelectorAll<HTMLElement>(".sb-spot")).map((e) => e.parentElement).filter(Boolean) as HTMLElement[]));

// ---------------------------------------------------------------------------
// Hooks and components
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

// Scroll-scrubbed reveal (used by the "how it works" steps). The number badge and
// the text slide in one after another as the element travels up the screen, and
// they slide back out if you scroll up again.
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: React.ReactNode; delay?: number; className?: string; as?: React.ElementType }) {
  const ref = useRef<HTMLElement | null>(null);

  useIso(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.setProperty("--p", "1");
      el.classList.add("is-done");
      return;
    }
    let last = -1;
    const start = 0.94 - Math.min(delay, 600) / 4000; // later steps start a touch later
    return subscribe((f) => {
      const r = el.getBoundingClientRect();
      const p = progress(r.top + (f.y - f.sy), f, start, 0.6);
      if (last >= 0 && Math.abs(p - last) < 0.0004) return;
      return () => {
        last = p;
        const e = ease(p);
        el.style.setProperty("--p", e.toFixed(4));
        el.classList.toggle("is-done", e >= 0.999);
      };
    });
  }, [delay]);

  return (
    <Tag ref={ref} className={`sb-rv ${className}`}>
      {children}
    </Tag>
  );
}

// Counts up with an expo ease, then pulses and fires confetti.
export function CountUp({ to, duration = 2400 }: { to: number; duration?: number }) {
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
      else if (ref.current) {
        ref.current.animate([{ transform: "scale(1)" }, { transform: "scale(1.14)" }, { transform: "scale(1)" }], { duration: 600, easing: EASE });
        burst(ref.current);
      }
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

// Headline: each word rises out of its own mask, rotating and de-blurring.
export function SplitHeading({ text, step = 80, delay = 80 }: { text: string; step?: number; delay?: number }) {
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

// Desktop: 3D tilt toward the cursor with a light glare.
// Phones and tablets (no hover): the phone leans gently with your scroll position.
// Both: as the hero scrolls away, the phone tips back and recedes in depth.
export function Tilt({ children, className = "", max = 8 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const glare = useRef<HTMLDivElement | null>(null);
  const [rev, setRev] = useState(0);

  // the 3D phone tells us when it has fallen back to the DOM phone
  useEffect(() => {
    const on = () => setRev((n) => n + 1);
    window.addEventListener("sb-phone3d-off", on);
    return () => window.removeEventListener("sb-phone3d-off", on);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (el.querySelector("[data-phone3d]")) return; // the 3D phone moves itself
    const fine = isFine();
    const hero = el.closest<HTMLElement>("#hero");

    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0, hover = false;
    let exit = 0, leanX = 0, leanY = 0;

    const apply = () => {
      const rx = cy + leanX + exit * 16;
      const ry = cx + leanY - exit * 11;
      const rz = exit * -2.5;
      const z = exit * -150;
      el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) translate3d(0,0,${z.toFixed(1)}px)`;
    };

    const unsub = subscribe((f) => {
      const hh = hero ? hero.offsetHeight : f.vh;
      const t = clamp(f.sy / (hh * 0.85), 0, 1);
      const e = t * t * (3 - 2 * t);
      let lx = 0, ly = 0;
      if (!fine) {
        const r = el.getBoundingClientRect();
        const c = (r.top + r.height / 2) / f.vh - 0.5;
        lx = clamp(-c * 12, -7, 7);
        ly = clamp(c * 10, -6, 6);
      }
      return () => {
        exit = e;
        leanX = lx;
        leanY = ly;
        apply();
      };
    });

    if (!fine) return unsub;

    const loop = () => {
      raf = 0;
      cx += (tx - cx) * 0.1;
      cy += (ty - cy) * 0.1;
      apply();
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
      unsub();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [max, rev]);

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

// Timeline line draws with smoothed scroll, a comet dot rides the tip and stretches
// with scroll speed, and each step number lights up when the line reaches it.
export function ScrollLine() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const fill = el.firstElementChild as HTMLElement;
    const dot = el.lastElementChild as HTMLElement;
    const items = Array.from(host.children).filter((c) => c.tagName === "LI") as HTMLElement[];
    const reduce = prefersReducedMotion();
    host.classList.add("sb-tl");

    const unsub = subscribe((f) => {
      const r = host.getBoundingClientRect();
      const top = r.top + (f.y - f.sy);
      const p = reduce ? 1 : clamp((f.vh * 0.65 - top) / r.height, 0, 1);
      const h = el.clientHeight;
      const stretch = reduce ? 0 : clamp(Math.abs(f.vel) * 0.05, 0, 1.8);
      const line = p * r.height;
      const ons = items.map((li) => reduce || li.offsetTop + 20 <= line);
      return () => {
        fill.style.transform = `scaleY(${p})`;
        dot.style.setProperty("translate", `0 ${(p * h).toFixed(1)}px`);
        dot.style.setProperty("scale", `1 ${(1 + stretch).toFixed(3)}`);
        dot.style.opacity = !reduce && p > 0 && p < 1 ? "1" : "0";
        items.forEach((li, i) => {
          const v = ons[i] ? "1" : "0";
          if (li.dataset.on !== v) li.dataset.on = v;
        });
      };
    });

    return () => {
      unsub();
      host.classList.remove("sb-tl");
    };
  }, []);
  return (
    <div ref={ref} aria-hidden className="absolute left-5 top-3 bottom-3 w-0.5 bg-border">
      <div className="absolute inset-0 origin-top" style={{ background: GREEN, transform: "scaleY(0)" }} />
      <div className="absolute left-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full" style={{ top: 0, opacity: 0, background: GREEN, boxShadow: "0 0 0 6px rgba(15,122,63,.18)", transition: "opacity .3s" }} />
    </div>
  );
}

// Page-wide behaviours, wired by class / selector so Home.tsx needs nothing extra:
//   scroll-scrubbed targets (see collect above): headings, notebook, highlighter,
//     check lists, feature cards, pricing ticket, QR code
//   #hero        headline and phone recede as you scroll away, parallax ruled paper,
//                floating badge, red margin line draws in
//   card grids   a very slight skew that follows scroll velocity
//   .sb-spot     cursor glow on cards
//   .sb-shine    magnetic pull toward the cursor
//   header       drops in on load
//   looping animations pause while off-screen (battery on phones)
export function useMotion() {
  useIso(() => {
    const reduce = prefersReducedMotion();
    const fine = isFine();
    const cleanups: (() => void)[] = [];

    let items = collect(new Map());
    let grids = gridsOf();

    // ---- scroll-scrubbed targets
    const itemsTick: Tick = (f) => {
      const todo: [Item, number][] = [];
      for (const it of items) {
        if (!it.el.isConnected) continue;
        const r = it.el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const top = r.top - it.off + (f.y - f.sy);
        const p = progress(top, f, it.start, it.end);
        if (it.p < 0 || Math.abs(p - it.p) > 0.0004) todo.push([it, p]);
      }
      if (!todo.length) return;
      return () => todo.forEach(([it, p]) => paint(it, p));
    };

    // ---- hero exit + velocity skew
    const hero = document.getElementById("hero");
    const cols = hero?.querySelector<HTMLElement>(".container")?.children;
    const left = (cols?.[0] as HTMLElement | undefined) ?? null;
    const right = (cols?.[1] as HTMLElement | undefined) ?? null;
    const badge = hero?.querySelector<HTMLElement>(".sb-float") ?? null;
    const skewMax = fine ? 1.3 : 0.8;
    let heroSettled = false;

    const miscTick: Tick = (f) => {
      const hh = hero ? hero.offsetHeight : 1;
      const hp = clamp(f.sy / (hh * 0.9), 0, 1);
      const away = f.sy > f.vh * 1.3;
      const sk = clamp(-f.vel * 0.04, -skewMax, skewMax);
      return () => {
        if (hero && !(away && heroSettled)) {
          const e = hp * hp;
          hero.style.backgroundPositionY = `${(-f.sy * 0.22).toFixed(1)}px`;
          if (left) {
            setProp(left, "translate", hp ? `0 ${(-hp * 72).toFixed(1)}px` : "");
            left.style.opacity = hp ? (1 - e * 0.95).toFixed(3) : "";
            left.style.filter = hp > 0.03 ? `blur(${(e * 6).toFixed(1)}px)` : "";
          }
          if (right) {
            setProp(right, "translate", hp ? `0 ${(-hp * 34).toFixed(1)}px` : "");
            right.style.opacity = hp ? (1 - e * 0.75).toFixed(3) : "";
          }
          if (badge) setProp(badge, "translate", `0 ${(-f.sy * 0.08).toFixed(1)}px`);
          heroSettled = away;
        }
        const t = Math.abs(sk) < 0.03 ? "" : `skewY(${sk.toFixed(2)}deg)`;
        grids.forEach((g) => (g.style.transform = t));
      };
    };

    if (reduce) {
      items.forEach((it) => paint(it, 1));
    } else {
      cleanups.push(subscribe(itemsTick));
      cleanups.push(subscribe(miscTick));
    }

    // Language switches, tab switches and the FAQ re-render parts of the page:
    // find the new elements and give them their state.
    let pending = 0;
    const rescan = () => {
      pending = 0;
      items = collect(new Map(items.map((i) => [i.el, i])));
      grids = gridsOf();
      if (reduce) items.forEach((it) => it.p !== 1 && paint(it, 1));
      else wake();
    };
    const mo = new MutationObserver(() => {
      if (!pending) pending = requestAnimationFrame(rescan);
    });
    document.querySelectorAll("main > section:not(#hero)").forEach((s) => mo.observe(s, { childList: true, subtree: true }));
    cleanups.push(() => {
      mo.disconnect();
      cancelAnimationFrame(pending);
    });

    if (!reduce) {
      // layout can shift after fonts and images arrive, and when accordions open
      const nudge = () => wake();
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(nudge);
        ro.observe(document.body);
        cleanups.push(() => ro.disconnect());
      }
      document.fonts?.ready.then(nudge);
      window.addEventListener("load", nudge);
      cleanups.push(() => window.removeEventListener("load", nudge));

      // pause endless loops that are off-screen
      if (typeof IntersectionObserver !== "undefined") {
        const loops = Array.from(document.querySelectorAll<HTMLElement>(".sb-float,.sb-ring,.sb-shine"));
        const pause = new IntersectionObserver((es) => es.forEach((e) => (e.target as HTMLElement).style.setProperty("--ps", e.isIntersecting ? "running" : "paused")));
        loops.forEach((e) => pause.observe(e));
        cleanups.push(() => pause.disconnect());
      }

      // entrance: header drops in, red margin line draws down
      document.querySelector("header")?.animate([{ transform: "translateY(-100%)" }, { transform: "none" }], { duration: 900, easing: EASE });
      const margin = document.querySelector<HTMLElement>("#hero > div[aria-hidden]");
      if (margin) {
        margin.style.transformOrigin = "top";
        margin.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 1700, delay: 250, easing: EASE, fill: "backwards" });
      }
    }

    // pointer: card glow + magnetic buttons
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
    cleanups.push(() => {
      document.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    });

    return () => cleanups.forEach((c) => c());
  }, []);
}

// ---------------------------------------------------------------------------
// DOM phone (the fallback). Messages spring in, earlier ones glide up (FLIP),
// typing time follows message length, the phone glows when the bot replies, and
// the whole loop pauses while it is off-screen.
// ---------------------------------------------------------------------------

function PhoneChatDom({ msgs }: { msgs: { from: string; text: string }[] }) {
  const [shown, setShown] = useState(0);
  const [live, setLive] = useState(true);
  const root = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const tops = useRef<Map<string, number>>(new Map());
  const prevShown = useRef(0);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(msgs.length);
      return;
    }
    if (!live) return;
    setShown(0);
    let n = 0;
    let id: ReturnType<typeof setTimeout>;
    const next = () => {
      if (n >= msgs.length) {
        id = setTimeout(() => {
          n = 0;
          setShown(0);
          next();
        }, 4500);
        return;
      }
      const wait = n === 0 ? 700 : msgs[n].from === "me" ? 900 : clamp(900 + msgs[n].text.length * 22, 1100, 2200);
      id = setTimeout(() => {
        n += 1;
        setShown(n);
        next();
      }, wait);
    };
    next();
    return () => clearTimeout(id);
  }, [msgs, live]);

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
        el.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: 700, easing: EASE });
      }
    });
    tops.current = next;

    // glow when a bot message lands
    if (shown > prevShown.current && msgs[shown - 1]?.from === "bot" && root.current && !prefersReducedMotion()) {
      root.current.animate(
        [{ boxShadow: "0 0 0 0 rgba(15,122,63,0)" }, { boxShadow: "0 0 56px 8px rgba(15,122,63,.42)" }, { boxShadow: "0 0 0 0 rgba(15,122,63,0)" }],
        { duration: 1100, easing: "ease-out" }
      );
    }
    prevShown.current = shown;
  }, [shown, typing, msgs]);

  return (
    <div ref={root} className="mx-auto w-full max-w-[290px] rounded-[2.5rem] border-[10px] border-[#0b1020] bg-[#0b1020] shadow-2xl rotate-1">
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

// ---------------------------------------------------------------------------
// 3D hero phone. Raw WebGL, no library (a few KB), so nothing to install and
// nothing extra to download. The screen is the same chat as the DOM phone, drawn
// to a 2D canvas and used as a texture. The phone turns with your (smoothed)
// scroll, leans with scroll speed and follows the pointer.
//
// It falls back to the DOM phone when: reduced motion, data saver, 2G, 2 GB or
// less memory, 2 cores or less, no WebGL, a lost GL context, or a frame rate
// under about 22 fps once the page has settled.
// Add ?3d=0 to the URL to force the fallback, ?3d=1 to skip every check (device and frame rate).
// ---------------------------------------------------------------------------

type Msg = { from: string; text: string };

let can3DCache: boolean | null = null;
function can3D() {
  if (can3DCache !== null) return can3DCache;
  can3DCache = false;
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const flag = new URLSearchParams(window.location.search).get("3d");
  if (flag === "0") return false;
  if (flag === "1") return (can3DCache = true);
  if (prefersReducedMotion()) return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  if (nav.connection?.saveData) return false;
  if (/2g/.test(nav.connection?.effectiveType ?? "")) return false;
  if (nav.deviceMemory && nav.deviceMemory <= 2) return false;
  if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) return false;
  return (can3DCache = true);
}

// ---- tiny matrix helpers (column-major)
function mmul(a: Float32Array, b: Float32Array) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
const mT = (x: number, y: number, z: number) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const mS = (s: number) => new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
const mRX = (a: number) => {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
};
const mRY = (a: number) => {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
};
const mRZ = (a: number) => {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
};
const mP = (fovy: number, asp: number, n: number, f: number) => {
  const t = 1 / Math.tan(fovy / 2);
  return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]);
};

// ---- geometry: a rounded-rectangle phone, built from rings
type Ring = { x: number; y: number; nx: number; ny: number }[];
function roundRect(hw: number, hh: number, r: number, seg = 10): Ring {
  const out: Ring = [];
  const corners: [number, number, number][] = [
    [hw - r, hh - r, 0],
    [-(hw - r), hh - r, Math.PI / 2],
    [-(hw - r), -(hh - r), Math.PI],
    [hw - r, -(hh - r), Math.PI * 1.5],
  ];
  for (const [cx, cy, a0] of corners)
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      const nx = Math.cos(a), ny = Math.sin(a);
      out.push({ x: cx + r * nx, y: cy + r * ny, nx, ny });
    }
  return out;
}

const PH_W = 1.0, PH_H = 1.9, PH_D = 0.1, PH_R = 0.17, PH_B = 0.014; // body (units)
const SC_W = 0.9, SC_H = 1.8, SC_R = 0.12; // screen: aspect 1:2 = the 512x1024 texture

function buildBody() {
  const hw = PH_W / 2, hh = PH_H / 2, h = PH_D / 2, b = PH_B;
  const outer = roundRect(hw, hh, PH_R);
  const inner = roundRect(hw - b, hh - b, PH_R - b);
  const N = outer.length;
  const v: number[] = [];
  inner.forEach((p) => v.push(p.x, p.y, h, 0, 0, 1)); // front face edge
  outer.forEach((p) => v.push(p.x, p.y, h - b, p.nx, p.ny, 0)); // top of the side wall
  outer.forEach((p) => v.push(p.x, p.y, -h + b, p.nx, p.ny, 0)); // bottom of the side wall
  inner.forEach((p) => v.push(p.x, p.y, -h, 0, 0, -1)); // back face edge
  const cF = v.length / 6;
  v.push(0, 0, h, 0, 0, 1);
  const cB = cF + 1;
  v.push(0, 0, -h, 0, 0, -1);
  const idx: number[] = [];
  for (let k = 0; k < 3; k++)
    for (let i = 0; i < N; i++) {
      const a = k * N + i, b2 = k * N + ((i + 1) % N), c = (k + 1) * N + i, d = (k + 1) * N + ((i + 1) % N);
      idx.push(a, b2, c, b2, d, c);
    }
  for (let i = 0; i < N; i++) {
    idx.push(cF, i, (i + 1) % N);
    idx.push(cB, 3 * N + i, 3 * N + ((i + 1) % N));
  }
  return { v: new Float32Array(v), i: new Uint16Array(idx) };
}

function buildScreen() {
  const z = PH_D / 2 + 0.002;
  const ring = roundRect(SC_W / 2, SC_H / 2, SC_R);
  const v: number[] = [0, 0, z, 0, 0, 1, 0.5, 0.5];
  ring.forEach((p) => v.push(p.x, p.y, z, 0, 0, 1, p.x / SC_W + 0.5, p.y / SC_H + 0.5));
  const idx: number[] = [];
  for (let i = 0; i < ring.length; i++) idx.push(0, 1 + i, 1 + ((i + 1) % ring.length));
  return { v: new Float32Array(v), i: new Uint16Array(idx) };
}

function buildDisc(cx: number, cy: number, r: number, z: number, nz: number) {
  const seg = 32;
  const v: number[] = [cx, cy, z, 0, 0, nz];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    v.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, 0, 0, nz);
  }
  const idx: number[] = [];
  for (let k = 0; k < seg; k++) idx.push(0, 1 + k, 1 + ((k + 1) % seg));
  return { v: new Float32Array(v), i: new Uint16Array(idx) };
}

// ---- shaders
const VS_BODY = `attribute vec3 aPos;attribute vec3 aNor;uniform mat4 uMVP;uniform mat4 uModel;varying vec3 vN;varying vec3 vW;
void main(){vN=(uModel*vec4(aNor,0.)).xyz;vW=(uModel*vec4(aPos,1.)).xyz;gl_Position=uMVP*vec4(aPos,1.);}`;
const FS_BODY = `precision mediump float;varying vec3 vN;varying vec3 vW;uniform vec3 uColor;uniform vec3 uCam;uniform vec3 uLight;uniform float uGlow;
void main(){vec3 n=normalize(vN);vec3 v=normalize(uCam-vW);vec3 l=normalize(uLight);
vec3 l2=normalize(vec3(.5,.55,-.8));float d=max(dot(n,l),0.)*.6+max(dot(n,l2),0.)*.55+.3;vec3 h=normalize(l+v);vec3 h2=normalize(l2+v);float s=pow(max(dot(n,h),0.),42.)*.8+pow(max(dot(n,h2),0.),42.)*.35;
float f=pow(1.-max(dot(n,v),0.),3.);
vec3 c=uColor*d+vec3(.5,.6,.95)*f*.55+vec3(s)+vec3(.06,.5,.26)*uGlow*(f+.2);
gl_FragColor=vec4(c,1.);}`;
const VS_SCREEN = `attribute vec3 aPos;attribute vec3 aNor;attribute vec2 aUv;uniform mat4 uMVP;uniform mat4 uModel;varying vec3 vN;varying vec3 vW;varying vec2 vUv;
void main(){vN=(uModel*vec4(aNor,0.)).xyz;vW=(uModel*vec4(aPos,1.)).xyz;vUv=aUv;gl_Position=uMVP*vec4(aPos,1.);}`;
const FS_SCREEN = `precision mediump float;varying vec3 vN;varying vec3 vW;varying vec2 vUv;uniform sampler2D uTex;uniform vec3 uCam;uniform vec3 uLight;uniform float uSheen;uniform float uGlow;
void main(){vec3 col=texture2D(uTex,vUv).rgb;vec3 n=normalize(vN);vec3 v=normalize(uCam-vW);vec3 l=normalize(uLight);
vec3 h=normalize(l+v);float g=pow(max(dot(n,h),0.),90.)*.3;
float d=vUv.x*.6+vUv.y*.4-uSheen;float band=exp(-pow((d-.5)*5.,2.))*.05;
col+=vec3(g+band)+vec3(.0,.18,.09)*uGlow*.35;
gl_FragColor=vec4(col,1.);}`;

// ---- chat painted onto a 2D canvas (same look as the DOM phone)
const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const t = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(t).width > maxW) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function bubblePath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, sharp: "tl" | "tr", rs: number) {
  const tl = sharp === "tl" ? rs : r, tr = sharp === "tr" ? rs : r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

function paintChat(ctx: CanvasRenderingContext2D, W: number, H: number, msgs: Msg[], shown: number, typing: boolean, now: number, evtAt: number) {
  const s = W / 270;
  ctx.fillStyle = "#0b141a";
  ctx.fillRect(0, 0, W, H);

  // header
  const hh = 60 * s;
  ctx.fillStyle = "#1f2c34";
  ctx.fillRect(0, 0, W, hh);
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.arc(34 * s, hh / 2, 18 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = `700 ${14 * s}px ${FONT}`;
  ctx.fillText("SB", 34 * s, hh / 2 + 0.5 * s);
  ctx.textAlign = "left";
  ctx.font = `600 ${14 * s}px ${FONT}`;
  ctx.fillText("Shop Brain", 64 * s, hh / 2 - 8 * s);
  ctx.font = `${11 * s}px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.fillText(typing ? "typing…" : "online", 64 * s, hh / 2 + 9 * s);

  // bubbles
  const padX = 12 * s, padY = 8 * s, lh = 13 * s * 1.375, gap = 8 * s;
  const maxW = (W - 24 * s) * 0.85;
  ctx.font = `${10 * s}px ${FONT}`;
  const tickW = ctx.measureText("✓✓").width;
  ctx.font = `${13 * s}px ${FONT}`;

  type B = { me: boolean; lines: string[]; w: number; h: number; typing: boolean; lastW: number };
  const list: B[] = [];
  for (let i = 0; i < shown; i++) {
    const m = msgs[i];
    const me = m.from === "me";
    const lines = wrapText(ctx, m.text, maxW - 2 * padX);
    let w = 0;
    lines.forEach((l) => (w = Math.max(w, ctx.measureText(l).width)));
    const lastW = ctx.measureText(lines[lines.length - 1] ?? "").width;
    if (me) w = Math.max(w, lastW + 8 * s + tickW);
    list.push({ me, lines, w: Math.min(w + 2 * padX, maxW), h: lines.length * lh + 2 * padY, typing: false, lastW });
  }
  if (typing) list.push({ me: false, lines: [], w: 50 * s, h: 30 * s, typing: true, lastW: 0 });

  const e = ease(clamp((now - evtAt) / 320, 0, 1));
  const newest = shown - 1;
  let y = H - 16 * s;
  for (let k = list.length - 1; k >= 0; k--) {
    const b = list[k];
    y -= b.h;
    let dy = 0, alpha = 1;
    if (!b.typing && k === newest) {
      dy = (1 - e) * 14 * s;
      alpha = e;
    } else if (!b.typing && k < newest && list[newest]) dy = (1 - e) * (list[newest].h + gap);
    const x = b.me ? W - 12 * s - b.w : 12 * s;
    const yy = y + dy;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = b.me ? "#005c4b" : "#202c33";
    bubblePath(ctx, x, yy, b.w, b.h, 12 * s, b.me ? "tr" : "tl", 3 * s);
    ctx.fill();
    if (b.typing) {
      for (let d = 0; d < 3; d++) {
        const ph = (Math.sin(now / 170 - d * 0.9) + 1) / 2;
        ctx.fillStyle = `rgba(255,255,255,${(0.3 + 0.7 * ph).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x + padX + 3 * s + d * 10 * s, yy + b.h / 2 - ph * 3 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#fff";
      ctx.font = `${13 * s}px ${FONT}`;
      b.lines.forEach((l, li) => ctx.fillText(l, x + padX, yy + padY + lh * (li + 0.5)));
      if (b.me) {
        ctx.fillStyle = "#7dd3fc";
        ctx.font = `${10 * s}px ${FONT}`;
        ctx.fillText("✓✓", x + padX + b.lastW + 8 * s, yy + padY + lh * (b.lines.length - 0.5));
      }
    }
    ctx.globalAlpha = 1;
    y -= gap;
  }
}

// ---- the scene
type Scene3D = { setMsgs: (m: Msg[]) => void; destroy: () => void };
type Mesh = { vbo: WebGLBuffer; ibo: WebGLBuffer; n: number };

function createPhoneScene(canvas: HTMLCanvasElement, host: HTMLElement, initial: Msg[], fail: () => void): Scene3D | null {
  const fine = isFine();
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" }) as WebGLRenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const g = gl;

  let pBody: WebGLProgram, pScreen: WebGLProgram, body: Mesh, disc: Mesh, screen: Mesh, tex: WebGLTexture;
  const shader = (type: number, src: string) => {
    const s = g.createShader(type) as WebGLShader;
    g.shaderSource(s, src);
    g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) || "shader");
    return s;
  };
  const program = (vs: string, fs: string) => {
    const p = g.createProgram() as WebGLProgram;
    g.attachShader(p, shader(g.VERTEX_SHADER, vs));
    g.attachShader(p, shader(g.FRAGMENT_SHADER, fs));
    g.bindAttribLocation(p, 0, "aPos");
    g.bindAttribLocation(p, 1, "aNor");
    g.bindAttribLocation(p, 2, "aUv");
    g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error("link");
    return p;
  };
  const mesh = (m: { v: Float32Array; i: Uint16Array }): Mesh => {
    const vbo = g.createBuffer() as WebGLBuffer;
    g.bindBuffer(g.ARRAY_BUFFER, vbo);
    g.bufferData(g.ARRAY_BUFFER, m.v, g.STATIC_DRAW);
    const ibo = g.createBuffer() as WebGLBuffer;
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, ibo);
    g.bufferData(g.ELEMENT_ARRAY_BUFFER, m.i, g.STATIC_DRAW);
    return { vbo, ibo, n: m.i.length };
  };
  const uni = (p: WebGLProgram, names: string[]) => Object.fromEntries(names.map((n) => [n, g.getUniformLocation(p, n)])) as Record<string, WebGLUniformLocation | null>;

  let uB: Record<string, WebGLUniformLocation | null>, uS: Record<string, WebGLUniformLocation | null>;
  try {
    pBody = program(VS_BODY, FS_BODY);
    pScreen = program(VS_SCREEN, FS_SCREEN);
    body = mesh(buildBody());
    disc = mesh(buildDisc(0, 0.15, 0.2, -PH_D / 2 - 0.0015, -1));
    screen = mesh(buildScreen());
    uB = uni(pBody, ["uMVP", "uModel", "uColor", "uCam", "uLight", "uGlow"]);
    uS = uni(pScreen, ["uMVP", "uModel", "uTex", "uCam", "uLight", "uSheen", "uGlow"]);
    tex = g.createTexture() as WebGLTexture;
  } catch {
    return null;
  }
  g.bindTexture(g.TEXTURE_2D, tex);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR_MIPMAP_LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  const aniso = g.getExtension("EXT_texture_filter_anisotropic");
  if (aniso) g.texParameterf(g.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  g.enable(g.DEPTH_TEST);

  const tc = document.createElement("canvas");
  tc.width = 512;
  tc.height = 1024;
  const ctx = tc.getContext("2d", { alpha: false }) as CanvasRenderingContext2D;

  // ---- state
  const DIST = PH_H / 0.94 / (2 * Math.tan((28 * Math.PI) / 360)); // phone fills ~94% of the canvas height
  const view = mT(0, 0, -DIST);
  let vp = mmul(mP((28 * Math.PI) / 180, 0.62, 2, 9), view);
  const dpr = Math.min(window.devicePixelRatio || 1, fine ? 2 : 1.5);
  const hero = host.closest<HTMLElement>("#hero");
  const shadow = host.querySelector<HTMLElement>("[data-phone-shadow]");
  let heroH = window.innerHeight;

  let msgs = initial;
  let shown = 0, evtAt = -1e9, glow = 0, lastUp = 0;
  let dirty = true, visible = true, destroyed = false, raf = 0, timer: ReturnType<typeof setTimeout>;
  let frm: Frame | null = null;
  let px = 0, py = 0, tpx = 0, tpy = 0, prevT = 0, last = performance.now();
  let checked = new URLSearchParams(window.location.search).get("3d") === "1"; // ?3d=1 skips the frame-rate watchdog
  const t0 = performance.now();
  const samples: number[] = [];

  const unsub = subscribe((f) => {
    frm = f;
  });

  const typingNow = () => shown < msgs.length && msgs[shown].from === "bot";

  const startSeq = () => {
    clearTimeout(timer);
    shown = 0;
    dirty = true;
    let n = 0;
    const next = () => {
      if (n >= msgs.length) {
        timer = setTimeout(() => {
          n = 0;
          shown = 0;
          dirty = true;
          next();
        }, 4500);
        return;
      }
      const wait = n === 0 ? 700 : msgs[n].from === "me" ? 900 : clamp(900 + msgs[n].text.length * 22, 1100, 2200);
      timer = setTimeout(() => {
        n += 1;
        shown = n;
        evtAt = performance.now();
        if (msgs[n - 1].from === "bot") glow = 1;
        dirty = true;
        next();
      }, wait);
    };
    next();
  };

  const upload = (now: number) => {
    paintChat(ctx, 512, 1024, msgs, shown, typingNow(), now, evtAt);
    g.bindTexture(g.TEXTURE_2D, tex);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, tc);
    g.generateMipmap(g.TEXTURE_2D);
    lastUp = now;
    dirty = false;
  };

  const resize = () => {
    const w = Math.max(2, Math.round(host.clientWidth * dpr));
    const h = Math.max(2, Math.round(host.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      g.viewport(0, 0, w, h);
      vp = mmul(mP((28 * Math.PI) / 180, w / h, 2, 9), view);
    }
    heroH = hero ? hero.offsetHeight : window.innerHeight;
  };

  const bindMesh = (m: Mesh, stride: number) => {
    g.bindBuffer(g.ARRAY_BUFFER, m.vbo);
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, m.ibo);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 3, g.FLOAT, false, stride, 0);
    g.enableVertexAttribArray(1);
    g.vertexAttribPointer(1, 3, g.FLOAT, false, stride, 12);
    if (stride === 32) {
      g.enableVertexAttribArray(2);
      g.vertexAttribPointer(2, 2, g.FLOAT, false, stride, 24);
    } else g.disableVertexAttribArray(2);
    g.drawElements(g.TRIANGLES, m.n, g.UNSIGNED_SHORT, 0);
  };

  const LIGHT = [-0.45, 0.75, 0.85];
  const render = (now: number) => {
    const sY = frm ? frm.sy : window.scrollY;
    const vel = frm ? frm.vel : 0;
    const k = clamp(sY / (heroH * 0.38), 0, 1); // the turn finishes while the phone is still on screen
    const e = k * k * (3 - 2 * k); // 0 = at rest, 1 = turned away
    const idle = 1 - e;
    const time = (now - t0) / 1000;
    px += (tpx - px) * 0.07;
    py += (tpy - py) * 0.07;
    glow = Math.max(0, glow - (now - last) / 1100);
    last = now;

    const ry = -0.28 + px * 0.24 * idle + Math.sin(time * 0.6) * 0.05 * idle - 2.85 * e;
    const rx = 0.06 - py * 0.14 * idle + Math.cos(time * 0.5) * 0.02 * idle + 0.3 * e;
    const rz = 0.02 + clamp(vel * 0.003, -0.12, 0.12) - 0.06 * e;
    const model = mmul(mT(0, Math.sin(time * 0.9) * 0.03 * idle + 0.1 * e, -0.5 * e), mmul(mRZ(rz), mmul(mRX(rx), mmul(mRY(ry), mS(1 - 0.08 * e)))));
    const mvp = mmul(vp, model);
    if (shadow) shadow.style.opacity = idle.toFixed(3);

    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT | g.DEPTH_BUFFER_BIT);

    g.useProgram(pBody);
    g.uniformMatrix4fv(uB.uMVP, false, mvp);
    g.uniformMatrix4fv(uB.uModel, false, model);
    g.uniform3f(uB.uCam, 0, 0, DIST);
    g.uniform3f(uB.uLight, LIGHT[0], LIGHT[1], LIGHT[2]);
    g.uniform1f(uB.uGlow, glow);
    g.uniform3f(uB.uColor, 0.075, 0.1, 0.19);
    bindMesh(body, 24);
    g.uniform3f(uB.uColor, 0.06, 0.5, 0.26);
    bindMesh(disc, 24);

    g.useProgram(pScreen);
    g.uniformMatrix4fv(uS.uMVP, false, mvp);
    g.uniformMatrix4fv(uS.uModel, false, model);
    g.uniform3f(uS.uCam, 0, 0, DIST);
    g.uniform3f(uS.uLight, LIGHT[0], LIGHT[1], LIGHT[2]);
    g.uniform1f(uS.uSheen, 0.5 + ry * 0.35);
    g.uniform1f(uS.uGlow, glow);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, tex);
    g.uniform1i(uS.uTex, 0);
    bindMesh(screen, 32);
  };

  const loop = (now: number) => {
    raf = 0;
    if (destroyed || !visible) return;

    // frame-rate watchdog: if the phone cannot hold ~22 fps, hand over to the DOM phone
    if (prevT && !checked && now - t0 > 1800) {
      samples.push(now - prevT);
      if (samples.length >= 60) {
        checked = true;
        samples.sort((a, b) => a - b);
        if (samples[30] > 45) {
          bail();
          return;
        }
      }
    }
    prevT = now;

    if (dirty || now - evtAt < 340 || (typingNow() && now - lastUp > 90)) upload(now);
    render(now);
    raf = requestAnimationFrame(loop);
  };

  const start = () => {
    prevT = 0;
    if (!raf) raf = requestAnimationFrame(loop);
  };

  const onPtr = (e: PointerEvent) => {
    tpx = (e.clientX / window.innerWidth - 0.5) * 2;
    tpy = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    bail();
  };
  if (fine) window.addEventListener("pointermove", onPtr, { passive: true });
  canvas.addEventListener("webglcontextlost", onLost);

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  ro?.observe(host);
  const io =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(
          ([en]) => {
            if (en.isIntersecting === visible) return;
            visible = en.isIntersecting;
            if (visible) {
              startSeq();
              resize();
              start();
            } else clearTimeout(timer);
          },
          { threshold: 0.05 }
        )
      : null;
  io?.observe(host);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    unsub();
    io?.disconnect();
    ro?.disconnect();
    window.removeEventListener("pointermove", onPtr);
    canvas.removeEventListener("webglcontextlost", onLost);
    [body, disc, screen].forEach((m) => {
      g.deleteBuffer(m.vbo);
      g.deleteBuffer(m.ibo);
    });
    g.deleteTexture(tex);
    g.deleteProgram(pBody);
    g.deleteProgram(pScreen);
  };
  function bail() {
    destroy();
    fail();
  }

  resize();
  startSeq();
  upload(performance.now());
  render(performance.now());
  start();

  return {
    setMsgs: (m) => {
      if (m === msgs) return;
      msgs = m;
      startSeq();
    },
    destroy,
  };
}

function PhoneScene({ msgs, onFail }: { msgs: Msg[]; onFail: () => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  const cv = useRef<HTMLCanvasElement | null>(null);
  const scene = useRef<Scene3D | null>(null);
  const first = useRef(msgs);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    const canvas = cv.current;
    const h = host.current;
    if (!canvas || !h) return;
    const s = createPhoneScene(canvas, h, first.current, () => failRef.current());
    if (!s) {
      failRef.current();
      return;
    }
    scene.current = s;
    h.setAttribute("data-phone3d", "1"); // Tilt looks for this and leaves the phone alone
    return () => {
      s.destroy();
      scene.current = null;
      h.removeAttribute("data-phone3d");
    };
  }, []);

  useEffect(() => {
    scene.current?.setMsgs(msgs);
  }, [msgs]);

  return (
    <div ref={host} role="img" aria-label="Example WhatsApp conversation" style={{ position: "relative", width: "100%", maxWidth: 330, margin: "0 auto", aspectRatio: "0.62" }}>
      <div
        data-phone-shadow
        aria-hidden
        style={{ position: "absolute", left: "16%", right: "16%", bottom: "1%", height: "5%", pointerEvents: "none", background: "radial-gradient(ellipse at center, rgba(8,12,30,.38), transparent 70%)" }}
      />
      <canvas ref={cv} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}

// The phone Home.tsx renders: 3D when the device can take it, the DOM phone otherwise.
export function PhoneChat({ msgs }: { msgs: Msg[] }) {
  const [dom, setDom] = useState(() => !can3D());
  if (dom) return <PhoneChatDom msgs={msgs} />;
  return (
    <PhoneScene
      msgs={msgs}
      onFail={() => {
        setDom(true);
        window.dispatchEvent(new Event("sb-phone3d-off"));
      }}
    />
  );
}