import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Animation registry. To ADD YOUR OWN scroll animation, add one entry below:
//   e = how far the section is from its resting place (0 = settled, 1 = fully out)
//   s = +1 when it is entering from below, -1 when it is leaving upward
//   k = the intensity slider (0.4 to 1.6)    i = the section's index    c = signed distance from screen centre
// Return a CSS transform and an opacity. It shows up in the dashboard dropdown by itself.
// ---------------------------------------------------------------------------
export type Fx = { tf: string; op: number };
export type Effect = {
  name: string;
  desc: string;
  always?: boolean; // true = keep updating even when settled (parallax)
  apply: (e: number, s: number, k: number, i: number, c: number) => Fx;
};
const cl = (n: number) => Math.min(n, 1);

export const EFFECTS: Record<string, Effect> = {
  depth: {
    name: "Depth rise",
    desc: "Sections rise out of the screen in 3D",
    apply: (e, s, k) => ({
      tf: `perspective(1200px) translate3d(0,${s * e * 60 * k}px,${-e * 220 * k}px) rotateX(${s * e * 14 * k}deg)`,
      op: 1 - cl(e) * 0.7,
    }),
  },
  flip: {
    name: "Page flip",
    desc: "Sections flip up like pages of a ledger",
    apply: (e, s, k) => ({ tf: `perspective(1400px) rotateX(${s * e * 58 * k}deg)`, op: 1 - cl(e) * 0.8 }),
  },
  swing: {
    name: "Side swing",
    desc: "Sections swing in from alternating sides",
    apply: (e, s, k, i) => {
      const d = i % 2 ? 1 : -1;
      return {
        tf: `perspective(1400px) translate3d(${d * s * e * 90 * k}px,0,${-e * 120 * k}px) rotateY(${d * s * e * 26 * k}deg)`,
        op: 1 - cl(e) * 0.75,
      };
    },
  },
  zoom: {
    name: "Zoom drift",
    desc: "Soft scale and drift, calm and professional",
    apply: (e, s, k) => ({ tf: `translate3d(0,${s * e * 44 * k}px,0) scale(${1 - cl(e) * 0.16 * k})`, op: 1 - cl(e) * 0.6 }),
  },
  parallax: {
    name: "Parallax",
    desc: "Blocks glide at slightly different speeds",
    always: true,
    apply: (_e, _s, k, i, c) => ({ tf: `translate3d(0,${-c * (36 + (i % 3) * 18) * k}px,0)`, op: 1 }),
  },
  mixed: {
    name: "Mixed",
    desc: "A different effect for each section",
    apply: (e, s, k, i, c) => {
      const L = ["depth", "swing", "flip", "zoom"];
      return EFFECTS[L[i % L.length]!]!.apply(e, s, k, i, c);
    },
  },
};

export type Prefs = { enabled: boolean; mode: string; intensity: number; progress: boolean; intro: boolean; force: boolean };
const DEF: Prefs = { enabled: true, mode: "depth", intensity: 1, progress: true, intro: true, force: false };
const KEY = "sb_fx_v1";

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = { ...DEF, ...JSON.parse(raw) } as Prefs;
      if (!EFFECTS[p.mode]) p.mode = DEF.mode;
      return p;
    }
  } catch { /* storage blocked: use defaults */ }
  return DEF;
}

let cur: Prefs = load();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setPrefs(p: Partial<Prefs>): void {
  cur = { ...cur, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* ignore */ }
  emit();
}
export const resetPrefs = () => setPrefs(DEF);
export const getPrefs = (): Prefs => cur;

if (typeof window !== "undefined") {
  // The website tab updates live when you change settings in the dashboard tab.
  window.addEventListener("storage", (e) => { if (e.key === KEY) { cur = load(); emit(); } });
}

export function usePrefs(): Prefs {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => cur, () => DEF);
}