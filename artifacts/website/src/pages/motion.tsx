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

type Frame = { y: number; sy: number; vel: number; vh: number; max: number };
type Tick = (f: Frame) => void | (() => void);

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

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
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
    const pinned = !!hero?.hasAttribute("data-pinned");
    let heroSettled = false;

    const miscTick: Tick = (f) => {
      const hh = hero ? hero.offsetHeight : 1;
      const hp = clamp(f.sy / (hh * 0.9), 0, 1);
      const away = f.sy > f.vh * 1.3;
      const sk = clamp(-f.vel * 0.04, -skewMax, skewMax);
      return () => {
        if (hero && !pinned && !(away && heroSettled)) {
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
// Hero phone. Messages spring in, earlier ones glide up (FLIP), typing time
// follows message length, the phone glows when the bot replies, and the whole
// loop pauses while it is off-screen.
// ---------------------------------------------------------------------------

export function PhoneChat({ msgs }: { msgs: { from: string; text: string }[] }) {
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