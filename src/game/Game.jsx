import { useEffect, useRef, useState } from "react";
import { Figure } from "../crowd/Figure.jsx";
import {
  DAY,
  POWERS,
  applyMind,
  byId,
  colRel,
  colStatus,
  colonyCenter,
  colonyOf,
  createWorld,
  happiness,
  houseOf,
  isAdult,
  membersOf,
  moodWord,
  nameOf,
  pickUp,
  power,
  throwPerson,
  tick,
} from "./world.js";
import { hitPerson, moodOf, personHeight, render, renderMini, toWorld } from "./draw.js";
import { MODELS, pickThinker, think } from "./mind.js";
import { SHAPE_NAMES, clamp, fa, pick } from "./util.js";
import "./game.css";

const SAVE_KEY = "cg:world";
const SETTINGS_KEY = "cg:settings";
const load = (k, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // Full or blocked storage: the game just doesn't persist.
  }
};

const ACTIVITY = {
  wander: "قدم می‌زند",
  gather: "میوه می‌چیند",
  work: "در معدن کار می‌کند",
  build: "خانه می‌سازد",
  claim: "سراغ یک خانه‌ی خالی می‌رود",
  sleep: "می‌خوابد",
  chat: "گپ می‌زند با",
  listen: "گوش می‌دهد به",
  court: "خواستگاری می‌کند از",
  fight: "دعوا می‌کند با",
  flee: "فرار می‌کند",
  steal: "می‌خواهد دزدی کند از",
  gift: "هدیه می‌دهد به",
  pray: "دعا می‌کند",
  collect: "سکه جمع می‌کند",
  extinguish: "آتش را خاموش می‌کند",
  raid: "به خانه‌ی دشمن حمله می‌کند",
  follow: "دنبال می‌کند",
};
const TRAITS = [
  ["kind", "مهربانی"],
  ["aggr", "پرخاشگری"],
  ["greed", "طمع"],
  ["social", "اجتماعی بودن"],
  ["faith", "ایمان به خدا"],
  ["brave", "شجاعت"],
  ["work", "سخت‌کوشی"],
];
// Without an AI mind, God still gets an answer.
const REPLIES = {
  devout: ["ای خدای بزرگ، هر چه بگویی!", "خدایا… صدایت را شنیدم! 🙏", "به چشم، خدای من", "شکرت که با من حرف زدی"],
  doubter: ["کی بود؟ صدای خدا بود؟!", "من که به تو اعتقاد ندارم!", "اول خانه‌ام را پس بده", "چرا الان یادت افتاد؟"],
};

export default function Game() {
  const canvasRef = useRef(null);
  const miniRef = useRef(null);
  const worldRef = useRef(null);
  if (!worldRef.current) worldRef.current = load(SAVE_KEY, null)?.version === 1 ? load(SAVE_KEY, null) : createWorld();
  const camRef = useRef({ x: 1600, y: 750, zoom: 1 });
  if (import.meta.env.DEV) window.__game = { worldRef, camRef };
  const [, setFrame] = useState(0);
  const [tool, setTool] = useState("hand");
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState(null);
  const [follow, setFollow] = useState(false);
  const [panel, setPanel] = useState(null); // "log" | "tribes" | "settings"
  const [settings, setSettings] = useState(() => load(SETTINGS_KEY, { key: "", model: MODELS[0].id, ai: false, every: 12 }));
  const [ai, setAi] = useState({ busy: false, error: "", calls: 0, input: 0, output: 0 });
  const [whisper, setWhisper] = useState("");
  const [talking, setTalking] = useState(false);
  const speedRef = useRef(speed);
  const toolRef = useRef(tool);
  const selectedRef = useRef(selected);
  const followRef = useRef(follow);
  speedRef.current = speed;
  toolRef.current = tool;
  selectedRef.current = selected;
  followRef.current = follow;

  useEffect(() => store(SETTINGS_KEY, settings), [settings]);

  // The loop: simulate, draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let vw = 0;
    let vh = 0;
    let raf = 0;
    let last = performance.now();
    const size = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      vw = r.width;
      vh = r.height;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    const frame = (now) => {
      const w = worldRef.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (speedRef.current) tick(w, dt * speedRef.current);
      const cam = camRef.current;
      const sel = selectedRef.current && byId(w, selectedRef.current);
      if (followRef.current && sel) {
        cam.x += (sel.x - cam.x) * 0.08;
        cam.y += (sel.y - 40 - cam.y) * 0.08;
      }
      keys(cam, dt);
      clampCam(cam, w, vw, vh);
      render(ctx, w, cam, vw, vh, { selected: selectedRef.current, now });
      const mini = miniRef.current;
      if (mini) renderMini(mini.getContext("2d"), w, cam, vw, vh, mini.width, mini.height);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const ui = setInterval(() => setFrame((n) => n + 1), 300);
    const save = setInterval(() => store(SAVE_KEY, worldRef.current), 15000);
    const onHide = () => store(SAVE_KEY, worldRef.current);
    window.addEventListener("pagehide", onHide);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(ui);
      clearInterval(save);
      ro.disconnect();
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // Keyboard: arrows/WASD pan, +/- zoom, space pause.
  const held = useRef(new Set());
  const keys = (cam, dt) => {
    const k = held.current;
    const s = (500 * dt) / cam.zoom;
    if (k.has("arrowleft") || k.has("a")) cam.x -= s;
    if (k.has("arrowright") || k.has("d")) cam.x += s;
    if (k.has("arrowup") || k.has("w")) cam.y -= s;
    if (k.has("arrowdown") || k.has("s")) cam.y += s;
  };
  useEffect(() => {
    const down = (e) => {
      if (e.target.closest("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      held.current.add(k);
      if (k === " ") {
        e.preventDefault();
        setSpeed((s) => (s ? 0 : 1));
      }
      if (k === "escape") setSelected(null);
    };
    const up = (e) => held.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // The AI minds: every few seconds, one person thinks.
  const lastThought = useRef({});
  const busyRef = useRef(false);
  useEffect(() => {
    if (!settings.ai || !settings.key) return;
    let lastCall = 0;
    const id = setInterval(() => {
      if (busyRef.current || !speedRef.current || Date.now() - lastCall < settings.every * 1000) return;
      const w = worldRef.current;
      const p = pickThinker(w, selectedRef.current, lastThought.current);
      if (!p) return;
      lastCall = Date.now();
      runMind(p, null);
    }, 1000);
    return () => clearInterval(id);
  }, [settings.ai, settings.key, settings.every, settings.model]);

  async function runMind(p, message) {
    const w = worldRef.current;
    busyRef.current = true;
    setAi((a) => ({ ...a, busy: true, error: "" }));
    try {
      const r = await think(w, p, settings, message);
      applyMind(w, p, r, message);
      lastThought.current[p.id] = w.t;
      if (message) w.events.push({ id: w.nextId++, t: w.t, day: w.day, text: `🗣️ ${p.name} به خدا: «${r.say}»`, x: p.x, y: p.y, kind: "mind" });
      else if (r.say) w.events.push({ id: w.nextId++, t: w.t, day: w.day, text: `🧠 ${p.name}: «${r.say}»`, x: p.x, y: p.y, kind: "mind" });
      setAi((a) => ({
        ...a,
        busy: false,
        calls: a.calls + 1,
        input: a.input + (r.usage?.input_tokens ?? 0) + (r.usage?.cache_read_input_tokens ?? 0),
        output: a.output + (r.usage?.output_tokens ?? 0),
      }));
    } catch (e) {
      const msg = e?.status === 401 ? "کلید API نامعتبر است" : e?.status === 429 ? "محدودیت درخواست؛ کمی صبر کنید" : e?.message || "خطا";
      setAi((a) => ({ ...a, busy: false, error: msg }));
      if (e?.status === 401) setSettings((s) => ({ ...s, ai: false }));
    } finally {
      busyRef.current = false;
    }
  }

  async function speakToSelected() {
    const w = worldRef.current;
    const p = byId(w, selected);
    const text = whisper.trim();
    if (!p?.alive || !text) return;
    setWhisper("");
    w.events.push({ id: w.nextId++, t: w.t, day: w.day, text: `☁️ خدا به ${p.name} گفت: «${text}»`, x: p.x, y: p.y, kind: "god" });
    if (settings.key) {
      setTalking(true);
      await runMind(p, text);
      setTalking(false);
    } else {
      const reply = pick(p.traits.faith > 0.5 ? REPLIES.devout : REPLIES.doubter);
      applyMind(w, p, { say: reply, thought: "", feelings: [] }, text);
      p.traits.faith = clamp(p.traits.faith + (p.traits.faith > 0.5 ? 0.05 : 0.02), 0, 1);
    }
  }

  // ---------------------------------------------------------------- input

  const drag = useRef(null);
  const pointers = useRef(new Map());
  const view = () => {
    const r = canvasRef.current.getBoundingClientRect();
    return { r, vw: r.width, vh: r.height };
  };

  const onDown = (e) => {
    const { r, vw, vh } = view();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    canvasRef.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: sx, y: sy });
    const cam = camRef.current;
    const w = worldRef.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (drag.current?.type === "carry" && drag.current.moved) throwPerson(w, drag.current.p, 0, 0);
      drag.current = { type: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), z0: cam.zoom };
      return;
    }
    if (e.button === 1 || e.button === 2) {
      drag.current = { type: "pan", sx, sy, cx: cam.x, cy: cam.y, moved: true };
      return;
    }
    const [x, y] = toWorld(cam, vw, vh, sx, sy);
    if (toolRef.current === "hand") {
      const p = hitPerson(w, cam, vw, vh, sx, sy);
      if (p) {
        setSelected(p.id);
        drag.current = { type: "carry", p, sx, sy, moved: false, lx: x, ly: y, lt: performance.now(), vx: 0, vy: 0 };
      } else drag.current = { type: "pan", sx, sy, cx: cam.x, cy: cam.y, moved: false };
      return;
    }
    const made = power(w, toolRef.current, x, y);
    if (made?.id) setSelected(made.id);
    drag.current = { type: "paint", last: performance.now(), sx, sy };
  };

  const onMove = (e) => {
    const { r, vw, vh } = view();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: sx, y: sy });
    const d = drag.current;
    const cam = camRef.current;
    const w = worldRef.current;
    if (!d) return;
    if (d.type === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      cam.zoom = clamp((d.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / d.d0, 0.25, 2.5);
      return;
    }
    if (d.type === "pan") {
      if (Math.hypot(sx - d.sx, sy - d.sy) > 5) d.moved = true;
      cam.x = d.cx - (sx - d.sx) / cam.zoom;
      cam.y = d.cy - (sy - d.sy) / cam.zoom;
      if (d.moved) setFollow(false);
      return;
    }
    if (d.type === "carry") {
      const [x, y] = toWorld(cam, vw, vh, sx, sy);
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) > 6 && d.p.alive) {
        d.moved = true;
        pickUp(w, d.p);
      }
      if (!d.moved) return;
      const now = performance.now();
      const dt = Math.max(1, now - d.lt) / 1000;
      d.vx = d.vx * 0.5 + ((x - d.lx) / dt) * 0.5;
      d.vy = d.vy * 0.5 + ((y - d.ly) / dt) * 0.5;
      d.lx = x;
      d.ly = y;
      d.lt = now;
      // Held by the head.
      d.p.x = clamp(x, 30, w.W - 30);
      d.p.y = clamp(y + personHeight(d.p) * 0.85 + d.p.z, 90, w.H - 20);
      return;
    }
    if (d.type === "paint" && ["fire", "plague", "rain"].includes(toolRef.current)) {
      const now = performance.now();
      const gap = toolRef.current === "fire" ? 90 : 700;
      if (now - d.last > gap && Math.hypot(sx - d.sx, sy - d.sy) > 20) {
        d.last = now;
        d.sx = sx;
        d.sy = sy;
        const [x, y] = toWorld(cam, vw, vh, sx, sy);
        power(w, toolRef.current, x, y);
      }
    }
  };

  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    const w = worldRef.current;
    if (d?.type === "pinch") {
      drag.current = pointers.current.size ? { type: "none" } : null;
      return;
    }
    if (d?.type === "carry" && d.moved) {
      const fresh = performance.now() - d.lt < 80;
      throwPerson(w, d.p, fresh ? d.vx : 0, fresh ? d.vy : 0);
    }
    if (d?.type === "pan" && !d.moved) setSelected(null);
    drag.current = null;
  };

  const onWheel = (e) => {
    const { r, vw, vh } = view();
    const cam = camRef.current;
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const [x0, y0] = toWorld(cam, vw, vh, sx, sy);
    cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.25, 2.5);
    const [x1, y1] = toWorld(cam, vw, vh, sx, sy);
    cam.x += x0 - x1;
    cam.y += y0 - y1;
  };
  useEffect(() => {
    const c = canvasRef.current;
    const wheel = (e) => {
      e.preventDefault();
      onWheel(e);
    };
    c.addEventListener("wheel", wheel, { passive: false });
    return () => c.removeEventListener("wheel", wheel);
  }, []);

  const goTo = (x, y) => {
    if (x == null) return;
    const cam = camRef.current;
    cam.x = x;
    cam.y = y;
    cam.zoom = Math.max(cam.zoom, 0.8);
    setFollow(false);
  };
  const onMini = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const w = worldRef.current;
    goTo(((e.clientX - r.left) / r.width) * w.W, ((e.clientY - r.top) / r.height) * w.H);
  };

  const newWorld = () => {
    if (!confirm("دنیای فعلی نابود شود و یک دنیای تازه آفریده شود؟")) return;
    worldRef.current = createWorld();
    lastThought.current = {};
    setSelected(null);
    store(SAVE_KEY, worldRef.current);
  };

  // ---------------------------------------------------------------- view

  const w = worldRef.current;
  const living = w.people.filter((p) => p.alive);
  const sel = selected && byId(w, selected);
  const toolInfo = POWERS.find((p) => p.id === tool);
  const hour = (w.t % DAY) / DAY;

  return (
    <div className="game" dir="rtl">
      <canvas
        ref={canvasRef}
        className="world"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: tool === "hand" ? (drag.current?.type === "carry" ? "grabbing" : "grab") : "crosshair" }}
      />

      <header className="top">
        <div className="brand">
          <Figure size={34} shape="star" face="#ffc53d" mood="happy" />
          <strong>خدای سکه‌ها</strong>
        </div>
        <div className="stats">
          <span title="روز">{hour > 0.72 ? "🌙" : "☀️"} روز {fa(w.day + 1)}</span>
          <span title="جمعیت">👥 {fa(living.length)}</span>
          <span title="قبیله‌ها">🚩 {fa(w.colonies.length)}</span>
          <span title="مؤمنان">🙏 {fa(living.filter((p) => p.traits.faith > 0.5).length)}</span>
        </div>
        <div className="speed" role="group" aria-label="سرعت">
          {[
            [0, "⏸"],
            [1, "▶"],
            [3, "⏩"],
            [8, "⏭"],
          ].map(([s, icon]) => (
            <button key={s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)} title={s ? `سرعت ${fa(s)}×` : "توقف"}>
              {icon}
            </button>
          ))}
        </div>
        <div className="menu">
          <button className={panel === "log" ? "on" : ""} onClick={() => setPanel(panel === "log" ? null : "log")}>
            📜 <span>رویدادها</span>
          </button>
          <button className={panel === "tribes" ? "on" : ""} onClick={() => setPanel(panel === "tribes" ? null : "tribes")}>
            🚩 <span>قبیله‌ها</span>
          </button>
          <button className={panel === "settings" ? "on" : ""} onClick={() => setPanel(panel === "settings" ? null : "settings")}>
            {settings.ai && settings.key ? "🧠" : "⚙️"} <span>هوش</span>
          </button>
        </div>
      </header>

      <canvas ref={miniRef} className="mini" width={200} height={94} onClick={onMini} />

      {panel === "log" && (
        <aside className="panel side">
          <div className="panel-head">
            <strong>رویدادها</strong>
            <button onClick={() => setPanel(null)}>✕</button>
          </div>
          <ol className="log">
            {w.events
              .slice(-60)
              .reverse()
              .map((e) => (
                <li key={e.id} className={e.kind} onClick={() => goTo(e.x, e.y)}>
                  <small>روز {fa(e.day + 1)}</small>
                  {e.text}
                </li>
              ))}
          </ol>
        </aside>
      )}

      {panel === "tribes" && (
        <aside className="panel side">
          <div className="panel-head">
            <strong>قبیله‌ها</strong>
            <button onClick={() => setPanel(null)}>✕</button>
          </div>
          {!w.colonies.length && <p className="muted">هنوز قبیله‌ای نیست. آدم‌ها وقتی با هم دوست شوند قبیله می‌سازند.</p>}
          {w.colonies.map((c) => {
            const members = membersOf(w, c);
            const leader = byId(w, c.leader);
            const c0 = colonyCenter(w, c);
            return (
              <div key={c.id} className="tribe" style={{ "--c": c.color }}>
                <button className="tribe-name" onClick={() => goTo(c0.x, c0.y)}>
                  <i />
                  {c.name}
                </button>
                <small>
                  👑 {leader?.name ?? "—"} · 👥 {fa(members.length)} · 🪙 {fa(members.reduce((s, p) => s + p.wealth, 0))}
                </small>
                <div className="rels">
                  {w.colonies
                    .filter((o) => o !== c)
                    .map((o) => {
                      const st = colStatus(c, o);
                      return (
                        <span key={o.id} className={`rel ${st ?? ""}`} style={{ "--c": o.color }}>
                          {st === "war" ? "⚔️" : st === "ally" ? "🤝" : colRel(c, o) < -20 ? "😠" : colRel(c, o) > 20 ? "🙂" : "😐"} {o.name.replace("قبیله‌ی ", "")}
                        </span>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </aside>
      )}

      {panel === "settings" && (
        <aside className="panel side settings">
          <div className="panel-head">
            <strong>ذهن‌های هوشمند</strong>
            <button onClick={() => setPanel(null)}>✕</button>
          </div>
          <p className="muted">
            بدون هوش مصنوعی هم دنیا زنده است: آدم‌ها با شخصیت و نیازهایشان تصمیم می‌گیرند. با یک کلید API از Anthropic، هر چند ثانیه ذهن یکی از آن‌ها با Claude
            فکر می‌کند (با خاطرات، کینه‌ها و عشق‌هایش) و می‌توانید مستقیم با آن‌ها حرف بزنید.
          </p>
          <label>
            کلید API
            <input
              type="password"
              dir="ltr"
              placeholder="sk-ant-…"
              value={settings.key}
              onChange={(e) => setSettings({ ...settings, key: e.target.value.trim() })}
            />
          </label>
          <small className="muted">کلید فقط در همین مرورگر ذخیره می‌شود و درخواست‌ها مستقیم به Anthropic می‌رود. این بازی را با کلیدتان جای عمومی منتشر نکنید.</small>
          <label>
            مدل
            <select value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="row">
            <input type="checkbox" checked={settings.ai} disabled={!settings.key} onChange={(e) => setSettings({ ...settings, ai: e.target.checked })} />
            آدم‌ها خودشان با Claude فکر کنند
          </label>
          <label>
            هر {fa(settings.every)} ثانیه یک نفر فکر کند
            <input type="range" min={4} max={60} value={settings.every} onChange={(e) => setSettings({ ...settings, every: Number(e.target.value) })} />
          </label>
          <small className="muted">هر فکر یک درخواست API است و هزینه دارد؛ فاصله‌ی بیشتر یعنی هزینه‌ی کمتر.</small>
          <div className="ai-status">
            {ai.busy ? "🧠 در حال فکر…" : ai.error ? `⚠️ ${ai.error}` : settings.ai ? "✅ فعال" : "خاموش"}
            <small>
              {fa(ai.calls)} فکر · {fa(ai.input)} توکن ورودی · {fa(ai.output)} توکن خروجی
            </small>
          </div>
          <hr />
          <button className="danger" onClick={newWorld}>
            🌍 آفرینش دنیای تازه
          </button>
        </aside>
      )}

      {sel && <PersonPanel w={w} p={sel} ai={settings.key} talking={talking} whisper={whisper} setWhisper={setWhisper} onSpeak={speakToSelected} select={setSelected} follow={follow} setFollow={setFollow} close={() => setSelected(null)} />}

      <nav className="tools">
        {toolInfo?.hint && <div className="tool-hint">{toolInfo.hint}</div>}
        <div className="tool-row">
          {POWERS.map((t) => (
            <button key={t.id} className={tool === t.id ? "on" : ""} onClick={() => setTool(t.id)} title={t.name}>
              <span className="icon">{t.icon}</span>
              <span className="name">{t.name}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Bar({ label, value, color }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <div>
        <i style={{ width: `${clamp(value, 0, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function PersonPanel({ w, p, ai, talking, whisper, setWhisper, onSpeak, select, follow, setFollow, close }) {
  const col = p.colony && colonyOf(w, p.colony);
  const home = p.home && houseOf(w, p.home);
  const h = happiness(w, p);
  const k = p.task;
  const target = k?.target && byId(w, k.target);
  const rels = Object.entries(p.rel)
    .map(([id, v]) => [byId(w, Number(id)), v])
    .filter(([q]) => q?.alive)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6);
  const Name = ({ id }) => (
    <button className="link" onClick={() => select(id)}>
      {nameOf(w, id)}
    </button>
  );
  const mood = moodOf(w, p);
  const god = (id) => {
    if (id === "rich") {
      p.wealth += 50;
      p.mod += 20;
      w.events.push({ id: w.nextId++, t: w.t, day: w.day, text: `💰 خدا ${p.name} را پولدار کرد.`, x: p.x, y: p.y, kind: "god" });
      p.memories.push({ day: w.day, text: "خدا ناگهان ۵۰ سکه به من داد!" });
    } else power(w, id, p.x, p.y);
  };

  return (
    <aside className="panel person" style={{ "--c": col?.color ?? "#111126" }}>
      <div className="panel-head">
        <div className="who">
          <Figure size={54} shape={p.shape} face={p.color} mood={mood === "angry" || mood === "worried" ? undefined : mood} angry={mood === "angry"} worried={mood === "worried"} />
          <div>
            <strong>{p.name}</strong>
            <small>
              {isAdult(p) ? "" : "کودک، "}
              {fa(Math.floor(p.age))} ساله · سر {SHAPE_NAMES[p.shape]} · {moodWord(h)}
            </small>
            {col && (
              <small className="chip">
                {col.leader === p.id ? "👑 رهبر " : ""}
                {col.name}
              </small>
            )}
          </div>
        </div>
        <div className="head-buttons">
          <button className={follow ? "on" : ""} onClick={() => setFollow(!follow)} title="دنبال کردن">
            🎥
          </button>
          <button onClick={close}>✕</button>
        </div>
      </div>
      {!p.alive ? (
        <p className="dead">💀 مُرده ({p.cause})</p>
      ) : (
        <>
          <p className="doing">
            {ACTIVITY[k?.type] ?? "ایستاده"} {target ? target.name : ""}
            {p.sick ? " · 🦠 بیمار" : ""}
          </p>
          {p.thought && <p className="thought">💭 {p.thought}</p>}
          <div className="bars">
            <Bar label="سلامتی" value={p.health} color="#ff4b3e" />
            <Bar label="سیری" value={p.food} color="#f59e0b" />
            <Bar label="انرژی" value={p.energy} color="#0a6cff" />
            <Bar label="حال" value={(h + 100) / 2} color="#16b364" />
          </div>
          <div className="facts">
            <span>🪙 {fa(p.wealth)} سکه</span>
            <span>{home ? (home.ruined ? "🏚️ خانه‌اش ویران شده" : home.built < 1 ? "🏗️ در حال ساخت خانه" : "🏠 خانه دارد") : "⛺ بی‌خانمان"}</span>
            <span>
              {p.spouse ? (
                <>
                  💍 همسر: <Name id={p.spouse} />
                </>
              ) : (
                "💔 مجرد"
              )}
            </span>
            {p.kids.length > 0 && (
              <span>
                👶 بچه‌ها:{" "}
                {p.kids.map((id, i) => (
                  <span key={id}>
                    {i ? "، " : ""}
                    <Name id={id} />
                  </span>
                ))}
              </span>
            )}
            {p.parents.length > 0 && (
              <span>
                👪 پدر و مادر: <Name id={p.parents[0]} />، <Name id={p.parents[1]} />
              </span>
            )}
          </div>

          <div className="speak">
            <input
              value={whisper}
              onChange={(e) => setWhisper(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSpeak()}
              placeholder={`به ${p.name} از آسمان بگو…`}
              disabled={talking}
            />
            <button onClick={onSpeak} disabled={talking || !whisper.trim()}>
              {talking ? "…" : "☁️ بگو"}
            </button>
          </div>
          {!ai && <small className="muted">برای جواب‌های واقعی، در «هوش» کلید API بگذارید.</small>}

          <div className="god-row">
            <button onClick={() => god("rich")}>💰 پولدارش کن</button>
            <button onClick={() => god("bless")}>✨ شفا</button>
            <button onClick={() => god("lightning")}>⚡ صاعقه</button>
            <button onClick={() => god("plague")}>🦠 طاعون</button>
          </div>

          <details open>
            <summary>شخصیت</summary>
            <div className="bars traits">
              {TRAITS.map(([key, label]) => (
                <Bar key={key} label={label} value={p.traits[key] * 100} color="var(--c)" />
              ))}
            </div>
          </details>
          {rels.length > 0 && (
            <details open>
              <summary>روابط</summary>
              <ul className="rels-list">
                {rels.map(([q, v]) => (
                  <li key={q.id}>
                    <button className="link" onClick={() => select(q.id)}>
                      {q.name}
                    </button>
                    <span className={v >= 0 ? "pos" : "neg"}>
                      {v > 60 ? "❤️" : v > 20 ? "🙂" : v > -20 ? "😐" : v > -60 ? "😠" : "🤬"} {fa(v)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <details open={!p.alive}>
        <summary>خاطرات</summary>
        <ul className="memories">
          {[...p.memories].reverse().map((m, i) => (
            <li key={i}>
              <small>روز {fa(m.day + 1)}</small> {m.text}
            </li>
          ))}
          {!p.memories.length && <li className="muted">هنوز خاطره‌ای ندارد.</li>}
        </ul>
      </details>
    </aside>
  );
}

function clampCam(cam, w, vw, vh) {
  cam.x = clamp(cam.x, 0, w.W);
  cam.y = clamp(cam.y, 0, w.H);
}
