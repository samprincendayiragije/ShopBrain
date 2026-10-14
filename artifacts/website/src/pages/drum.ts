import { useEffect } from "react";

// 3D scroll "drum" effect for the marketing page.
//
// Mark any element with  data-drum  and it rolls like a drum as you scroll:
// near the top or bottom edge of the screen it tilts back and sinks a little,
// in the middle it sits flat. Cards, panels and forms feel like they roll past.
//
// Safe by design
//   - one passive scroll listener, one requestAnimationFrame per scroll tick
//   - reads first, writes after (no layout thrash), only touches elements near the screen
//   - writes transform and opacity only, and clears them when the element is flat
//   - off for reduced motion, Data Saver, 2G, <= 2 GB memory and <= 2 CPU cores
//   - ?drum=0 in the URL turns it off for testing

function disabled() {
  if (typeof window === "undefined") return true;
  try {
    if (new URLSearchParams(window.location.search).get("drum") === "0") return true;
  } catch {
    /* ignore */
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  if (n.connection?.saveData) return true;
  if (/2g/.test(n.connection?.effectiveType ?? "")) return true;
  if (typeof n.deviceMemory === "number" && n.deviceMemory <= 2) return true;
  if (typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency <= 2) return true;
  return false;
}

export function useDrum() {
  useEffect(() => {
    if (disabled()) return;
    let raf = 0;
    const touch = !window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const run = () => {
      raf = 0;
      const vh = window.innerHeight;
      const maxTilt = touch ? 16 : 24;
      const els = document.querySelectorAll<HTMLElement>("[data-drum]");
      const reads: [HTMLElement, number][] = [];
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -vh * 0.6 || r.top > vh * 1.6) {
          if (el.style.transform) {
            el.style.transform = "";
            el.style.opacity = "";
          }
          return;
        }
        reads.push([el, (r.top + r.height / 2 - vh / 2) / (vh * 0.62)]);
      });
      reads.forEach(([el, d]) => {
        const e = Math.min(1, Math.max(0, Math.abs(d) - 0.4) / 0.6);
        if (e < 0.02) {
          if (el.style.transform) {
            el.style.transform = "";
            el.style.opacity = "";
          }
          return;
        }
        const s = d < 0 ? -1 : 1;
        el.style.transform = `perspective(1100px) rotateX(${(-s * e * maxTilt).toFixed(2)}deg) translateZ(${(-e * 60).toFixed(1)}px) scale(${(1 - e * 0.04).toFixed(3)})`;
        el.style.opacity = String(1 - e * e * 0.5);
      });
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const t1 = window.setTimeout(schedule, 120);
    const t2 = window.setTimeout(schedule, 1200);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      if (raf) cancelAnimationFrame(raf);
      document.querySelectorAll<HTMLElement>("[data-drum]").forEach((el) => {
        el.style.transform = "";
        el.style.opacity = "";
      });
    };
  }, []);
}