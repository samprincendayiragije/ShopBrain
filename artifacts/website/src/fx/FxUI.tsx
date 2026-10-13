import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Play, RotateCcw, Sparkles } from "lucide-react";
import { EFFECTS, resetPrefs, setPrefs, usePrefs } from "./prefs";

const CSS = `
.sbx-fab{position:fixed;right:16px;bottom:72px;z-index:9000;width:48px;height:48px;border-radius:99px;border:1px solid rgba(255,255,255,.18);cursor:pointer;color:#fff;display:grid;place-items:center;background:linear-gradient(135deg,#0F7A3F,#1B2559);box-shadow:0 8px 24px rgba(11,18,48,.45);transition:transform .5s cubic-bezier(.34,1.56,.64,1)}
.sbx-fab:hover{transform:scale(1.1) rotate(-12deg)}.sbx-fab[aria-expanded=true]{transform:rotate(180deg) scale(1.05)}
.sbx-panel{position:fixed;right:16px;bottom:132px;z-index:9000;width:min(340px,calc(100vw - 36px));padding:16px;border-radius:18px;color:#eef1ff;font:13px/1.4 system-ui,sans-serif;background:rgba(14,21,56,.92);border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 60px rgba(0,0,0,.5);backdrop-filter:blur(14px);transform-origin:100% 100%;transform:perspective(900px) rotateX(-18deg) translateY(16px) scale(.92);opacity:0;visibility:hidden;transition:transform .45s cubic-bezier(.34,1.3,.64,1),opacity .3s,visibility 0s .45s}
.sbx-panel.open{transform:none;opacity:1;visibility:visible;transition:transform .45s cubic-bezier(.34,1.3,.64,1),opacity .3s,visibility 0s}
.sbx-panel h3{margin:0 0 12px;font-size:14px;font-weight:700;letter-spacing:.02em;display:flex;gap:8px;align-items:center}
.sbx-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08)}
.sbx-row small,.sbx-ddb small,.sbx-ddl small{display:block;color:#9aa6d6;font-size:11px;font-weight:400}
.sbx-row b,.sbx-ddb b,.sbx-ddl b{font-weight:600}
.sbx-sw{position:relative;flex:none;width:48px;height:28px;padding:0;border:0;border-radius:99px;cursor:pointer;background:#2b3563;transition:background .35s,box-shadow .35s}
.sbx-sw.on{background:linear-gradient(90deg,#0F7A3F,#27b86a);box-shadow:0 0 0 4px rgba(39,184,106,.18),0 0 18px rgba(255,201,51,.35)}
.sbx-th{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:99px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35);transition:transform .5s cubic-bezier(.34,1.56,.64,1),width .2s}
.sbx-sw.on .sbx-th{transform:translateX(20px)}.sbx-sw:active .sbx-th{width:28px}.sbx-sw.on:active .sbx-th{transform:translateX(14px)}
.sbx-sw:focus-visible,.sbx-ddb:focus-visible,.sbx-fab:focus-visible{outline:2px solid #FFC933;outline-offset:2px}
.sbx-dd{position:relative;margin:2px 0 10px}
.sbx-ddb{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;padding:10px 12px;border-radius:12px;cursor:pointer;color:inherit;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14)}
.sbx-ddb:disabled{opacity:.4;cursor:not-allowed}.sbx-ddb svg{transition:transform .4s cubic-bezier(.34,1.56,.64,1)}.sbx-dd[data-open=true] .sbx-ddb svg{transform:rotate(180deg)}
.sbx-ddl{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:2;margin:0;padding:6px;list-style:none;border-radius:14px;background:#111a48;border:1px solid rgba(255,255,255,.16);box-shadow:0 18px 40px rgba(0,0,0,.5);transform-origin:50% 0;transform:perspective(700px) rotateX(-75deg);opacity:0;pointer-events:none;transition:transform .4s cubic-bezier(.34,1.3,.64,1),opacity .25s}
.sbx-dd[data-open=true] .sbx-ddl{transform:none;opacity:1;pointer-events:auto}
.sbx-ddl button{width:100%;text-align:left;padding:8px 10px;border:0;border-radius:9px;background:none;color:inherit;cursor:pointer}
.sbx-ddl button:hover,.sbx-ddl button.sel{background:rgba(39,184,106,.22)}
.sbx-range{width:130px;accent-color:#27b86a}
.sbx-btn{display:inline-flex;gap:6px;align-items:center;padding:7px 11px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:inherit;cursor:pointer;font:inherit;transition:background .2s,transform .3s cubic-bezier(.34,1.56,.64,1)}
.sbx-btn:hover{background:rgba(255,255,255,.14);transform:translateY(-1px)}
.sbx-off{opacity:.45;pointer-events:none}
.sbx-stat{margin:-4px 0 10px;padding:8px 10px;border-radius:10px;font-size:12px;background:rgba(255,255,255,.07);color:#cfd6ff}
.sbx-stat.warn{background:rgba(255,201,51,.14);color:#ffe08a}

.sbi{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;overflow:hidden;color:#fff;font-family:'Outfit','Plus Jakarta Sans',system-ui,sans-serif;background:radial-gradient(ellipse at 50% 38%,#1a2a70 0%,#0a1030 62%,#050816 100%);clip-path:circle(150% at 50% 50%);animation:sbi-out .9s cubic-bezier(.76,0,.24,1) 2.5s forwards}
@keyframes sbi-out{to{clip-path:circle(0% at 50% 50%)}}
.sbi-stage{perspective:1100px;height:190px;width:170px;position:relative;margin-bottom:56px}
.sbi-ring{position:absolute;inset:40px 0 40px;transform-style:preserve-3d;animation:sbi-spin 2.6s cubic-bezier(.22,.8,.2,1) both}
@keyframes sbi-spin{from{transform:rotateX(-14deg) rotateY(-320deg) scale(.35);opacity:0}25%{opacity:1}to{transform:rotateX(-14deg) rotateY(0) scale(1)}}
.sbi-c{position:absolute;inset:0;display:flex;align-items:flex-end;gap:7px;padding:14px;border-radius:14px;background:linear-gradient(160deg,rgba(255,255,255,.18),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.24);transform:rotateY(calc(var(--i)*45deg)) translateZ(250px)}
.sbi-c i{flex:1;border-radius:4px;background:linear-gradient(#FFC933,#0F7A3F);transform-origin:50% 100%;animation:sbi-bar .9s cubic-bezier(.2,.9,.2,1) both;animation-delay:calc(.7s + var(--i)*.06s)}
@keyframes sbi-bar{from{transform:scaleY(0)}}
.sbi-w{display:flex;font-size:44px;font-weight:800;letter-spacing:-.02em;perspective:600px}
.sbi-w span{display:inline-block;opacity:0;transform:translateY(70%) rotateX(-90deg);animation:sbi-l .7s cubic-bezier(.2,.9,.2,1) forwards;animation-delay:calc(1s + var(--n)*.045s)}
.sbi-w span:nth-child(n+5){color:#FFC933}
@keyframes sbi-l{to{opacity:1;transform:none}}
.sbi-s{margin-top:6px;font-size:13px;letter-spacing:.32em;text-transform:uppercase;color:#aab6ee;opacity:0;animation:sbi-fade .6s ease 1.6s forwards}
@keyframes sbi-fade{to{opacity:1}}
.sbi-p{margin-top:26px;width:220px;height:3px;border-radius:9px;background:rgba(255,255,255,.14);overflow:hidden}
.sbi-p b{display:block;height:100%;transform-origin:0 50%;background:linear-gradient(90deg,#0F7A3F,#FFC933);animation:sbi-f 2.3s cubic-bezier(.6,0,.2,1) forwards}
@keyframes sbi-f{from{transform:scaleX(0)}}
.sbi-skip{position:absolute;right:20px;bottom:20px;padding:8px 14px;border-radius:99px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font:600 12px system-ui}
@media (max-width:560px){.sbi-c{transform:rotateY(calc(var(--i)*45deg)) translateZ(210px)}.sbi-w{font-size:36px}}
`;

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={"sbx-sw" + (on ? " on" : "")} onClick={() => onChange(!on)}>
      <span className="sbx-th" />
    </button>
  );
}

function Dropdown({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  const cur = EFFECTS[value] ?? EFFECTS["depth"]!;
  return (
    <div className="sbx-dd" ref={ref} data-open={open}>
      <button type="button" className="sbx-ddb" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span><b>{cur.name}</b><small>{cur.desc}</small></span>
        <ChevronDown size={16} />
      </button>
      <ul className="sbx-ddl" role="listbox">
        {Object.entries(EFFECTS).map(([id, e]) => (
          <li key={id} role="option" aria-selected={id === value}>
            <button type="button" className={id === value ? "sel" : ""} onClick={() => { onChange(id); setOpen(false); }}>
              <b>{e.name}</b><small>{e.desc}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Floating "Animations" control on the dashboard. Settings are saved in this browser and
// the website picks them up live (same browser, same site).
export function FxPanel() {
  const p = usePrefs();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const h = (e: Event) => setCount((e as CustomEvent<number>).detail);
    window.addEventListener("sb-fx-count", h);
    return () => window.removeEventListener("sb-fx-count", h);
  }, []);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const paused = reduce && !p.force;
  const status = !p.enabled
    ? "All animations are off."
    : paused
      ? "Your device has Reduce Motion turned on, so scroll animation is paused. Use the switch below to override it."
      : count === 0 || count === null
        ? "No animatable blocks found on this page yet."
        : `Animating ${count} blocks on this page.`;
  const preview = () => {
    setOpen(false);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: 0 });
    window.setTimeout(() => window.scrollTo({ top: max, behavior: "smooth" }), 200);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 3000);
  };
  return (
    <>
      <style>{CSS}</style>
      <button type="button" className="sbx-fab" aria-label="Animation settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Sparkles size={20} />
      </button>
      <div className={"sbx-panel" + (open ? " open" : "")} role="dialog" aria-label="Animation settings" aria-hidden={!open}>
        <h3><Sparkles size={16} /> Animations</h3>
        <div className={"sbx-stat" + (paused ? " warn" : "")} role="status">{status}</div>
        <div className="sbx-row">
          <span><b>All animations</b><small>Turn everything off with one switch</small></span>
          <Switch on={p.enabled} onChange={(v) => setPrefs({ enabled: v })} label="All animations" />
        </div>
        <div className={p.enabled ? "" : "sbx-off"}>
          <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <b>3D scroll animation</b>
            <Dropdown value={p.mode} onChange={(mode) => setPrefs({ mode })} disabled={!p.enabled} />
          </div>
          <div className="sbx-row">
            <span><b>Intensity</b><small>{Math.round(p.intensity * 100)}%</small></span>
            <input className="sbx-range" type="range" min={0.4} max={1.6} step={0.1} value={p.intensity} aria-label="Intensity" onChange={(e) => setPrefs({ intensity: Number(e.target.value) })} />
          </div>
          <div className="sbx-row">
            <span><b>Scroll progress bar</b></span>
            <Switch on={p.progress} onChange={(v) => setPrefs({ progress: v })} label="Scroll progress bar" />
          </div>
          <div className="sbx-row">
            <span><b>Dashboard intro</b><small>Plays once per visit</small></span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" className="sbx-btn" aria-label="Replay intro" onClick={() => { setOpen(false); window.dispatchEvent(new Event("sb-fx-intro")); }}><Play size={13} /></button>
              <Switch on={p.intro} onChange={(v) => setPrefs({ intro: v })} label="Dashboard intro" />
            </span>
          </div>
        </div>
        {reduce && (
          <div className="sbx-row">
            <span><b>Ignore device Reduce Motion</b><small>Only affects this browser</small></span>
            <Switch on={p.force} onChange={(v) => setPrefs({ force: v })} label="Ignore device Reduce Motion" />
          </div>
        )}
        <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="sbx-btn" onClick={preview}><Play size={13} /> Preview scroll</button>
          <button type="button" className="sbx-btn" onClick={resetPrefs}><RotateCcw size={13} /> Reset</button>
        </div>
      </div>
    </>
  );
}

// Cinematic dashboard opening (about 3.4s): a ring of glass report cards spins in,
// bars grow, the name flips in letter by letter, then an iris closes onto the dashboard.
export function DashIntro() {
  const p = usePrefs();
  const [show, setShow] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen: string | null = null;
    try { seen = sessionStorage.getItem("sb_dash_intro"); } catch { /* ignore */ }
    if (p.enabled && p.intro && (!reduce || p.force) && !seen) setShow(true);
    const replay = () => { setRun((n) => n + 1); setShow(true); };
    window.addEventListener("sb-fx-intro", replay);
    return () => window.removeEventListener("sb-fx-intro", replay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem("sb_dash_intro", "1"); } catch { /* ignore */ }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => setShow(false), 3500);
    return () => { window.clearTimeout(t); document.body.style.overflow = prev; };
  }, [show, run]);

  if (!show) return null;
  return (
    <div className="sbi" key={run} role="presentation">
      <style>{CSS}</style>
      <div className="sbi-stage" aria-hidden="true">
        <div className="sbi-ring">
          {Array.from({ length: 8 }, (_, i) => (
            <div className="sbi-c" key={i} style={{ "--i": i } as CSSProperties}>
              <i style={{ height: `${30 + ((i * 37) % 45)}%` }} />
              <i style={{ height: `${50 + ((i * 23) % 40)}%` }} />
              <i style={{ height: `${25 + ((i * 53) % 55)}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div className="sbi-w" aria-label="ShopBrain">
        {"ShopBrain".split("").map((ch, n) => (
          <span key={n} style={{ "--n": n } as CSSProperties}>{ch}</span>
        ))}
      </div>
      <div className="sbi-s">Owner dashboard</div>
      <div className="sbi-p"><b /></div>
      <button type="button" className="sbi-skip" onClick={() => setShow(false)}>Skip</button>
    </div>
  );
}