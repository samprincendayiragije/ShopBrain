// Usage: node apply-motion.mjs path/to/Home.tsx
// Backs up to Home.tsx.bak, applies every edit, or changes nothing if any edit fails.
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node apply-motion.mjs path/to/Home.tsx");
  process.exit(1);
}
const original = fs.readFileSync(file, "utf8");
let src = original;
const failed = [];

const sub = (name, pattern, replacement) => {
  const next = typeof pattern === "string" ? (src.includes(pattern) ? src.replace(pattern, () => replacement) : src) : src.replace(pattern, () => replacement);
  if (next === src) failed.push(name);
  src = next;
};
const cut = (name, startMarker, endMarker, replacement) => {
  const a = src.indexOf(startMarker);
  const b = a === -1 ? -1 : src.indexOf(endMarker, a);
  if (a === -1 || b === -1) return void failed.push(name);
  src = src.slice(0, a) + replacement + src.slice(b);
};

// 1. Import the engine
sub("import", 'import React, { useEffect, useRef, useState } from "react";', 'import React, { useEffect, useRef, useState } from "react";\nimport { CSS, Reveal, CountUp, PhoneChat, Tilt, ScrollLine, SplitHeading, useMotion } from "./motion";');

// 2. Remove the old animation block and old PhoneChat (now in motion.tsx)
cut("old animations block", "// ---------------------------------------------------------------------------\n// Animations (all in one place", "// ---------------------------------------------------------------------------\n// Theme", "");
cut("old PhoneChat", "// The one orchestrated moment on the page", "function Faq(", "");

// 3. Buttons: shine + magnetic
sub("ctaClass", '"inline-flex items-center justify-center gap-2 px-7 py-3.5', '"sb-shine inline-flex items-center justify-center gap-2 px-7 py-3.5');

// 4. Page-wide behaviours
sub("useMotion call", "const t = copy[lang];", "const t = copy[lang];\n  useMotion();");

// 5. Scroll handling without re-rendering the whole page on every scroll event
sub("scroll state", /const \[scrollY, setScrollY\] = useState\(0\);\s*const \[progress, setProgress\] = useState\(0\);/, "const [showSticky, setShowSticky] = useState(false);\n  const barRef = useRef<HTMLDivElement | null>(null);");
sub(
  "scroll effect",
  /useEffect\(\(\) => \{\s*const onScroll = \(\) => \{[\s\S]*?window\.removeEventListener\("scroll", onScroll\);\s*\}, \[\]\);/,
  `useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (barRef.current) barRef.current.style.transform = \`scaleX(\${max > 0 ? Math.min(1, y / max) : 0})\`;
      const show = y > 500;
      setShowSticky((s) => (s === show ? s : show));
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
  }, []);`
);
sub(
  "progress bar",
  /<div aria-hidden className="absolute bottom-0 left-0 h-\[3px\]" style=\{\{[\s\S]*?\}\} \/>/,
  '<div aria-hidden ref={barRef} className="absolute bottom-0 left-0 h-[3px] w-full origin-left" style={{ background: SUN, transform: "scaleX(0)", willChange: "transform" }} />'
);
sub("sticky condition", "{scrollY > 500 && (", "{showSticky && (");

// 6. Hero
sub("hero headline", /\{t\.hero\.title\.split\(" "\)\.map\([\s\S]*?\)\)\}/, "<SplitHeading text={t.hero.title} />");
sub("hero phone", "<PhoneChat msgs={t.chat.msgs} />", "<Tilt>\n                <PhoneChat msgs={t.chat.msgs} />\n              </Tilt>");

// 7. Notebook writes itself
sub("notebook container", 'className="relative rounded-md bg-[#FBF7E8]', 'data-seen className="relative rounded-md bg-[#FBF7E8]');
sub("notebook lines", "<p key={line} className={`text-3xl leading-[44px]", "<p key={line} className={`sb-write text-3xl leading-[44px]");
sub("notebook note", '<p className="text-3xl leading-[44px] text-red-600', '<p className="sb-write text-3xl leading-[44px] text-red-600');

// 8. How it works: line draws with scroll
sub("timeline", '<div aria-hidden className="absolute left-5 top-3 bottom-3 w-0.5 bg-border" />', "<ScrollLine />");

// 9. Feature cards: cursor glow
sub("feature cards", "className={`sb-rise rounded-2xl border bg-card overflow-hidden", "className={`sb-rise sb-spot rounded-2xl border bg-card overflow-hidden");

// 10. Pricing highlighter draws itself
sub("pricing highlighter", '<span className="px-1 -mx-1 rounded" style={{ background: SUN, color: INK }}>', '<span data-seen className="sb-mark px-1 -mx-1 rounded" style={{ color: INK }}>');

if (failed.length) {
  console.error("Nothing was changed. These edits did not match your file:\n - " + failed.join("\n - "));
  console.error("Your Home.tsx probably differs from the version I saw. Send me the current file and I will fix the script.");
  process.exit(1);
}
fs.writeFileSync(file + ".bak", original);
fs.writeFileSync(file, src);
console.log("Done. Backup saved as " + file + ".bak");