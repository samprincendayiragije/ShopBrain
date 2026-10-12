import React from "react";

// Pure CSS 3D scroll animations (no JavaScript runs while you scroll).
//
// They use CSS scroll-driven animations (animation-timeline: view()), which
// Chrome, Edge, Opera and Samsung Internet support, and Safari 26+ / Firefox are adding.
// Anywhere it is NOT supported, nothing is hidden or broken: the sections simply show
// normally. Visitors who ask for reduced motion get no animation at all.
//
// It targets your existing sections by id (#features, #pricing, #faq, #contact,
// #get-started, #how-it-works), so you do not have to add classes to Home.tsx.
// You can also use these classes anywhere: s3-flip, s3-left, s3-right, s3-zoom, s3-title.
//
// Rule used everywhere: animation-fill-mode is "backwards", so once an element has
// finished entering, normal CSS (hover effects, other animations) works again.

type Lang = "rw" | "en" | "fr";

export const SCROLL3D_CSS = `
/* ---- the rotating cube (works as a static 3D cube where scroll animation is unsupported) */
.s3-cubewrap{display:flex;flex-direction:column;align-items:center;gap:1.4rem;padding:4.5rem 1rem;perspective:900px;overflow:hidden;text-align:center}
.s3-cube{--s:7.5rem;position:relative;width:var(--s);height:var(--s);transform-style:preserve-3d;transform:rotateX(-22deg) rotateY(-32deg)}
.s3-face{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:.5rem;border-radius:.9rem;font:800 1.02rem/1.1 'Bricolage Grotesque',system-ui,sans-serif;color:#fff;background:linear-gradient(160deg,#12924d,#0F7A3F);box-shadow:inset 0 0 0 2px rgba(255,255,255,.25)}
.s3-f0{transform:translateZ(calc(var(--s) / 2))}
.s3-f1{transform:rotateY(90deg) translateZ(calc(var(--s) / 2));background:linear-gradient(160deg,#2a3878,#1B2559)}
.s3-f2{transform:rotateY(180deg) translateZ(calc(var(--s) / 2))}
.s3-f3{transform:rotateY(-90deg) translateZ(calc(var(--s) / 2));background:linear-gradient(160deg,#2a3878,#1B2559)}
.s3-f4{transform:rotateX(90deg) translateZ(calc(var(--s) / 2));background:#FFC933;color:#1B2559}
.s3-f5{transform:rotateX(-90deg) translateZ(calc(var(--s) / 2));background:#FFC933;color:#1B2559}
.s3-cap{margin:0;font:700 1.15rem/1.3 'Bricolage Grotesque',system-ui,sans-serif;opacity:.8}
.s3-shadow{width:7rem;height:.9rem;border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,.35),transparent 70%);margin-top:.6rem}

/* sections must not scroll sideways while things swing in */
#how-it-works,#features,#pricing,#faq,#contact,#get-started{overflow-x:clip}

@media (prefers-reduced-motion:no-preference){
@supports (animation-timeline:view()){

@keyframes s3-flip{from{opacity:0;transform:perspective(900px) rotateX(50deg) translateY(70px) scale(.94)}to{opacity:1;transform:perspective(900px) rotateX(0) translateY(0) scale(1)}}
@keyframes s3-left{from{opacity:0;transform:perspective(1000px) rotateY(38deg) translateX(-90px)}to{opacity:1;transform:perspective(1000px) rotateY(0) translateX(0)}}
@keyframes s3-right{from{opacity:0;transform:perspective(1000px) rotateY(-38deg) translateX(90px)}to{opacity:1;transform:perspective(1000px) rotateY(0) translateX(0)}}
@keyframes s3-zoom{from{opacity:0;transform:perspective(1000px) translateZ(-280px) scale(.92)}to{opacity:1;transform:perspective(1000px) translateZ(0) scale(1)}}
@keyframes s3-title{from{opacity:0;transform:perspective(700px) rotateX(-75deg) translateY(30px)}to{opacity:1;transform:perspective(700px) rotateX(0) translateY(0)}}
@keyframes s3-cube{from{transform:rotateX(-22deg) rotateY(-70deg)}to{transform:rotateX(-22deg) rotateY(290deg)}}

/* generic classes */
.s3-flip{animation:s3-flip 1ms linear backwards;animation-timeline:view();animation-range:entry 0% entry 65%}
.s3-left{animation:s3-left 1ms linear backwards;animation-timeline:view();animation-range:entry 0% entry 65%}
.s3-right{animation:s3-right 1ms linear backwards;animation-timeline:view();animation-range:entry 0% entry 65%}
.s3-zoom{animation:s3-zoom 1ms linear backwards;animation-timeline:view();animation-range:entry 0% entry 70%}
.s3-title{transform-origin:50% 100%;animation:s3-title 1ms linear backwards;animation-timeline:view();animation-range:entry 0% entry 60%}

/* automatic targets in your existing page */
#pricing .rounded-2xl,#faq .divide-y{animation:s3-flip 1ms linear backwards;animation-timeline:view();animation-range:entry 0% entry 65%}
#contact .container > div:first-child{animation:s3-left 1ms linear backwards;animation-timeline:view();animation-range:entry 0% entry 65%}
#contact .container > div:last-child{animation:s3-right 1ms linear backwards;animation-timeline:view();animation-range:entry 0% entry 65%}
#features .container > div,#get-started .container{animation:s3-zoom 1ms linear backwards;animation-timeline:view();animation-range:entry 0% entry 70%}
#how-it-works h2,#features h2,#pricing h2,#faq h2,#contact h2{transform-origin:50% 100%;animation:s3-title 1ms linear backwards;animation-timeline:view();animation-range:entry 0% entry 60%}

/* the cube turns a full lap while it crosses the screen */
.s3-cube{animation:s3-cube 1ms linear both;animation-timeline:view();animation-range:cover 0% cover 100%}
}
}
`;

const FACES: Record<Lang, { faces: string[]; cap: string }> = {
  en: { faces: ["Debts", "Reminders", "Receipts", "Totals", "Follow-up", "Recovered"], cap: "Add. Remind. Get paid." },
  rw: { faces: ["Imyenda", "Inyibutsa", "Inyemezabwishyu", "Igiteranyo", "Gukurikirana", "Byagarujwe"], cap: "Andika. Ibutsa. Wishyurwe." },
  fr: { faces: ["Dettes", "Rappels", "Reçus", "Totaux", "Relance", "Récupéré"], cap: "Notez. Relancez. Soyez payé." },
};

export function ScrollCube({ lang }: { lang: Lang }) {
  const c = FACES[lang];
  return (
    <div className="s3-cubewrap" aria-hidden>
      <div className="s3-cube">
        {c.faces.map((t, i) => (
          <span key={i} className={`s3-face s3-f${i}`}>
            {t}
          </span>
        ))}
      </div>
      <div className="s3-shadow" />
      <p className="s3-cap">{c.cap}</p>
    </div>
  );
}