import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

// v2. All animation lives here. Design, colours and copy stay in Home.tsx.
// GPU-friendly (transform / opacity / clip-path / mask), rAF-driven where it
// follows pointer or scroll, paused when off-screen, off for reduced motion.

const GREEN = "#0F7A3F";
const EASE = "cubic-bezier(.16,1,.3,1)"; // expo-out
const SPRING = "cubic-bezier(.34,1.56,.64,1)"; // soft overshoot

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const isFine = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

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

.sb-reveal{opacity:0;transform:translateY(40px);filter:blur(8px);transition:opacity 1s ${EASE},transform 1s ${EASE},filter 1s ${EASE}}
.sb-in{opacity:1;transform:none;filter:none}

/* section headings: soft ink wipe, left to right (class added by useMotion) */
.sb-h2{opacity:0;transform:translateY(14px);-webkit-mask-image:linear-gradient(90deg,#000 42%,transparent 58%);mask-image:linear-gradient(90deg,#000 42%,transparent 58%);-webkit-mask-size:260% 100%;mask-size:260% 100%;-webkit-mask-position:100% 0;mask-position:100% 0;transition:opacity .6s ease,transform 1.1s ${EASE},-webkit-mask-position 1.3s cubic-bezier(.5,0,.2,1),mask-position 1.3s cubic-bezier(.5,0,.2,1)}
.sb-h2.is-seen{opacity:1;transform:none;-webkit-mask-position:0 0;mask-position:0 0}

/* handwriting */
@keyframes sb-write{from{clip-path:inset(-10% 100% -10% 0)}to{clip-path:inset(-10% 0 -10% 0)}}
.sb-write{clip-path:inset(-10% 100% -10% 0)}
[data-seen].is-seen .sb-write{animation:sb-write 1s cubic-bezier(.6,.05,.3,1) both;animation-delay:calc(var(--i,0) * .5s)}
[data-seen] .sb-write:nth-child(2){--i:1}
[data-seen] .sb-write:nth-child(3){--i:2}
[data-seen] .sb-write:nth-child(4){--i:3.2}

/* highlighter pen */
.sb-mark{background:linear-gradient(#FFC933,#FFC933) no-repeat 0 0/0% 100%;transition:background-size 1.2s ${EASE} .3s;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.sb-mark.is-seen{background-size:100% 100%}

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
  .sb-reveal{opacity:1;transform:none;filter:none;transition:none}
  .sb-h2{opacity:1;transform:none;-webkit-mask-image:none;mask-image:none;transition:none}
  .sb-write{clip-path:none}
  [data-seen].is-seen .sb-write{animation:none}
  .sb-mark{background-size:100% 100%;transition:none}
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

export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: React.ReactNode; delay?: number; className?: string; as?: React.ElementType }) {
  const { ref, seen } = useInView<HTMLElement>(0.25);
  return (
    <Tag ref={ref} className={`sb-reveal ${seen ? "sb-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
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
// Phones and tablets (no hover): the phone leans gently with your scroll position instead.
export function Tilt({ children, className = "", max = 8 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const glare = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    if (!isFine()) {
      let raf = 0;
      const update = () => {
        raf = 0;
        const r = el.getBoundingClientRect();
        const c = (r.top + r.height / 2) / window.innerHeight - 0.5;
        el.style.transform = `perspective(900px) rotateX(${clamp(-c * 12, -7, 7).toFixed(2)}deg) rotateY(${clamp(c * 10, -6, 6).toFixed(2)}deg)`;
      };
      const onScroll = () => {
        if (!raf) raf = requestAnimationFrame(update);
      };
      update();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        window.removeEventListener("scroll", onScroll);
        cancelAnimationFrame(raf);
      };
    }

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

// Timeline line draws with scroll, and each step number lights up when the line reaches it.
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
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = host.getBoundingClientRect();
      const p = reduce ? 1 : clamp((window.innerHeight * 0.65 - r.top) / r.height, 0, 1);
      fill.style.transform = `scaleY(${p})`;
      dot.style.top = `${p * 100}%`;
      dot.style.opacity = !reduce && p > 0 && p < 1 ? "1" : "0";
      const line = p * r.height;
      items.forEach((li) => {
        const on = reduce || li.offsetTop + 20 <= line;
        if (on !== (li.dataset.on === "1")) li.dataset.on = on ? "1" : "0";
      });
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
//   [data-seen]  gets .is-seen when scrolled into view (.sb-write, .sb-mark)
//   main h2      ink-wipe reveal
//   .sb-spot     cursor glow on cards
//   .sb-shine    magnetic pull toward the cursor
//   #hero        parallax ruled paper + floating badge, red margin line draws in
//   header       drops in on load
//   looping animations pause while off-screen (battery on phones)
export function useMotion() {
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const fine = isFine();
    const cleanups: (() => void)[] = [];

    // reveal-on-scroll
    const seen = Array.from(document.querySelectorAll<HTMLElement>("[data-seen]"));
    document.querySelectorAll<HTMLElement>("main h2").forEach((h) => {
      h.classList.add("sb-h2");
      seen.push(h);
    });
    if (reduce || typeof IntersectionObserver === "undefined") {
      seen.forEach((e) => e.classList.add("is-seen"));
    } else {
      const io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("is-seen");
              io.unobserve(e.target);
            }
          }),
        { threshold: 0.35 }
      );
      seen.forEach((e) => io.observe(e));
      cleanups.push(() => io.disconnect());

      // pause endless loops that are off-screen
      const loops = Array.from(document.querySelectorAll<HTMLElement>(".sb-float,.sb-ring,.sb-shine"));
      const pause = new IntersectionObserver((es) => es.forEach((e) => (e.target as HTMLElement).style.setProperty("--ps", e.isIntersecting ? "running" : "paused")));
      loops.forEach((e) => pause.observe(e));
      cleanups.push(() => pause.disconnect());
    }

    // entrance: header drops in, red margin line draws down
    if (!reduce) {
      document.querySelector("header")?.animate([{ transform: "translateY(-100%)" }, { transform: "none" }], { duration: 900, easing: EASE });
      const margin = document.querySelector<HTMLElement>("#hero > div[aria-hidden]");
      if (margin) {
        margin.style.transformOrigin = "top";
        margin.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 1700, delay: 250, easing: EASE, fill: "backwards" });
      }
    }

    // hero parallax
    if (!reduce) {
      const hero = document.getElementById("hero");
      const badge = hero?.querySelector<HTMLElement>(".sb-float") ?? null;
      let pr = 0;
      const par = () => {
        pr = 0;
        const y = window.scrollY;
        if (y > window.innerHeight * 1.3) return;
        if (hero) hero.style.backgroundPositionY = `${(-y * 0.22).toFixed(1)}px`;
        if (badge) badge.style.translate = `0 ${(-y * 0.08).toFixed(1)}px`;
      };
      const onS = () => {
        if (!pr) pr = requestAnimationFrame(par);
      };
      window.addEventListener("scroll", onS, { passive: true });
      cleanups.push(() => {
        window.removeEventListener("scroll", onS);
        cancelAnimationFrame(pr);
      });
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