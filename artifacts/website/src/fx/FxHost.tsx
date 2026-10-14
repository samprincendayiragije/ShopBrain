import { useEffect, useRef } from "react";
import { EFFECTS, usePrefs } from "./prefs";

const CSS = `html.sb-fx-on{overflow-x:clip}
.sb-bar{position:fixed;left:0;top:0;height:3px;width:100%;z-index:9998;pointer-events:none;transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,#0F7A3F,#27b86a,#FFC933);box-shadow:0 0 12px rgba(255,201,51,.55)}`;

const clamp = (n: number) => Math.max(0, Math.min(1, n));

// Drives the 3D scroll animation for the WHOLE page: every <section> inside <main>
// on the website, every card/tile on the dashboard. Add data-fx="off" to any element to exclude it.
export function FxHost({ admin, path }: { admin: boolean; path: string }) {
  const p = usePrefs();
  const bar = useRef<HTMLDivElement>(null);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const on = p.enabled && (!reduce || p.force);

  useEffect(() => {
    if (!on) return;
    const sel = admin ? ".adm-card, .adm-tile, .adm-stat" : "main section, [data-fx]";
    const k = p.intensity * (admin ? 0.55 : 1); // the dashboard stays calmer
    const fx = EFFECTS[p.mode] ?? EFFECTS["depth"]!;
    let els: HTMLElement[] = [];
    const styled = new Set<HTMLElement>();
    let raf = 0;
    let timer = 0;
    const reset = (e: HTMLElement) => { e.style.removeProperty("transform"); e.style.removeProperty("opacity"); e.style.willChange = ""; };
    const report = (n: number) => window.dispatchEvent(new CustomEvent("sb-fx-count", { detail: n }));
    document.documentElement.classList.add("sb-fx-on");

    const collect = () => {
      const vh = window.innerHeight;
      const all = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(
        (e) => e.dataset["fx"] !== "off" && !e.closest('[data-fx="off"]'),
      );
      els = all
        .filter((e) => !all.some((o) => o !== e && o.contains(e))) // outermost only
        .filter((e) => e.offsetHeight < vh * 2.2) // skip tall pinned scenes
        .filter((e) => !e.querySelector(".sticky,.fixed,[style*='sticky'],[style*='fixed']"))
        .filter((e) => admin || e.getBoundingClientRect().top + window.scrollY > vh * 0.4) // leave the hero alone
        .slice(0, 150);
      styled.forEach((e) => { if (!els.includes(e)) { reset(e); styled.delete(e); } });
      report(els.length);
    };

    const tick = () => {
      raf = 0;
      const vh = window.innerHeight;
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) return;
        const enter = clamp((r.top - vh * 0.45) / (vh * 0.55));
        const leave = clamp((vh * 0.4 - r.bottom) / (vh * 0.4));
        const s = enter > 0 ? 1 : -1;
        const e = enter > 0 ? enter : leave;
        if (e === 0 && !fx.always) {
          if (styled.delete(el)) reset(el);
          return;
        }
        const c = (r.top + r.height / 2 - vh / 2) / vh;
        const o = fx.apply(e, s, k, i, c);
        el.style.setProperty("transform", o.tf, "important");
        el.style.setProperty("opacity", String(o.op), "important");
        el.style.willChange = "transform, opacity";
        styled.add(el);
      });
    };

    const sched = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const onResize = () => { collect(); sched(); };
    const mo = new MutationObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(onResize, 300); });
    window.addEventListener("scroll", sched, { passive: true });
    window.addEventListener("resize", onResize);
    mo.observe(document.body, { childList: true, subtree: true });
    collect();
    sched();
    return () => {
      window.removeEventListener("scroll", sched);
      window.removeEventListener("resize", onResize);
      mo.disconnect();
      window.clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      styled.forEach(reset);
      report(0);
      document.documentElement.classList.remove("sb-fx-on");
    };
  }, [on, p.mode, p.intensity, admin, path]);

  // Scroll progress bar
  useEffect(() => {
    if (!p.enabled || !p.progress) return;
    const f = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${h > 0 ? Math.min(1, window.scrollY / h) : 0})`;
    };
    f();
    window.addEventListener("scroll", f, { passive: true });
    window.addEventListener("resize", f);
    return () => { window.removeEventListener("scroll", f); window.removeEventListener("resize", f); };
  }, [p.enabled, p.progress, path]);

  return (
    <>
      <style>{CSS}</style>
      {p.enabled && p.progress && <div ref={bar} className="sb-bar" aria-hidden="true" />}
    </>
  );
}