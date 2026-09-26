// Draws the world on a canvas in the figure's line-art style: flat colors,
// an ink outline on everything.
import { INK, figureSvg } from "../crowd/Figure.jsx";
import { DAY, ADULT, byId, colonyOf, happiness, houseOf } from "./world.js";

const PERSON_H = 66; // an adult's height in world px
const FONT = `"Estedad Variable", "Vazirmatn Variable", Tahoma, sans-serif`;

// ---------------------------------------------------------------- sprites

const sprites = new Map();
const SPRITE_H = 132;
function sprite(pose, opts) {
  const key = pose + JSON.stringify(opts);
  let s = sprites.get(key);
  if (!s) {
    s = { canvas: null };
    sprites.set(key, s);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.round(SPRITE_H * (120 / 160));
      c.height = SPRITE_H;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      s.canvas = c;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(figureSvg(pose, opts))}`;
  }
  return s.canvas;
}

// ---------------------------------------------------------------- camera

export const toScreen = (cam, vw, vh, x, y) => [(x - cam.x) * cam.zoom + vw / 2, (y - cam.y) * cam.zoom + vh / 2];
export const toWorld = (cam, vw, vh, sx, sy) => [(sx - vw / 2) / cam.zoom + cam.x, (sy - vh / 2) / cam.zoom + cam.y];

export const personHeight = (p) => PERSON_H * (p.age >= ADULT ? 1 : 0.45 + 0.55 * (p.age / ADULT));

// The person under a screen point (the one in front wins).
export function hitPerson(w, cam, vw, vh, sx, sy) {
  const [x, y] = toWorld(cam, vw, vh, sx, sy);
  let best = null;
  let bestY = -Infinity;
  for (const p of w.people) {
    if (!p.alive) continue;
    const h = personHeight(p);
    const top = p.y - p.z - h * 0.95;
    const bottom = p.y - p.z + 4;
    if (Math.abs(x - p.x) < h * 0.36 + 6 / cam.zoom && y > top && y < bottom && p.y > bestY) {
      best = p;
      bestY = p.y;
    }
  }
  return best;
}

// Grass tufts and flowers, the same every frame.
let deco = null;
function decoFor(w) {
  if (deco?.W === w.W) return deco.items;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const items = [];
  for (let i = 0; i < (w.W * w.H) / 9000; i++) items.push({ x: rnd() * w.W, y: 60 + rnd() * (w.H - 60), k: rnd() });
  deco = { W: w.W, items };
  return items;
}

// ---------------------------------------------------------------- frame

export function render(ctx, w, cam, vw, vh, { selected, now }) {
  ctx.save();
  if (w.shake > 0) ctx.translate((Math.random() - 0.5) * 14 * Math.min(1, w.shake), (Math.random() - 0.5) * 10 * Math.min(1, w.shake));
  ctx.fillStyle = "#9fcf7f";
  ctx.fillRect(-20, -20, vw + 40, vh + 40);

  ctx.save();
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;

  // Ground.
  ctx.fillStyle = "#c4e6a0";
  ctx.lineWidth = 4;
  roundRect(ctx, 0, 40, w.W, w.H - 40, 40);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#7fb866";
  for (const d of decoFor(w)) {
    if (d.k < 0.08) {
      ctx.fillStyle = d.k < 0.04 ? "#fff" : "#ffd84d";
      ctx.beginPath();
      ctx.arc(d.x, d.y, 3, 0, 7);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(d.x - 5, d.y - 7);
      ctx.lineTo(d.x, d.y);
      ctx.lineTo(d.x + 5, d.y - 8);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = INK;

  // Marks on the ground.
  for (const e of w.effects) groundEffect(ctx, w, e);
  // Tribe territories: a soft ring around each tribe's homes.
  for (const c of w.colonies) {
    const homes = w.houses.filter((h) => h.colony === c.id && !h.ruined);
    if (!homes.length) continue;
    ctx.fillStyle = c.color + "22";
    for (const h of homes) {
      ctx.beginPath();
      ctx.ellipse(h.x, h.y, 120, 70, 0, 0, 7);
      ctx.fill();
    }
  }

  // Everything that stands, back to front.
  const items = [
    ...w.trees.map((o) => [o.y, 0, o]),
    ...w.rocks.map((o) => [o.y, 1, o]),
    ...w.houses.map((o) => [o.y, 2, o]),
    ...w.coins.map((o) => [o.y, 3, o]),
    ...w.people.map((o) => [o.y + (o.carried ? 2000 : 0), 4, o]),
  ].sort((a, b) => a[0] - b[0]);
  for (const [, kind, o] of items) {
    if (kind === 0) drawTree(ctx, w, o, now);
    else if (kind === 1) drawRock(ctx, o);
    else if (kind === 2) drawHouse(ctx, w, o, now);
    else if (kind === 3) drawCoin(ctx, o);
    else drawPerson(ctx, w, o, now, o.id === selected);
  }
  for (const e of w.effects) skyEffect(ctx, w, e);
  ctx.restore();

  // Night falls for a quarter of the day.
  const hour = (w.t % DAY) / DAY;
  const night = Math.max(0, Math.sin(((hour - 0.72) / 0.28) * Math.PI));
  if (hour > 0.72 && night > 0) {
    ctx.fillStyle = `rgba(20, 22, 70, ${0.32 * night})`;
    ctx.fillRect(-20, -20, vw + 40, vh + 40);
  }
  // Flash.
  for (const e of w.effects)
    if (e.type === "flash") {
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - (w.t - e.t0) / e.dur)})`;
      ctx.fillRect(-20, -20, vw + 40, vh + 40);
    }

  // Words over heads, in screen space so they stay readable.
  const talkers = w.people.filter((p) => p.alive && (p.speech || p.id === selected));
  for (const p of talkers) {
    const [sx, sy] = toScreen(cam, vw, vh, p.x, p.y - p.z - personHeight(p) - 6);
    if (sx < -100 || sx > vw + 100 || sy < -60 || sy > vh + 60) continue;
    if (p.speech && (cam.zoom > 0.42 || p.id === selected)) bubble(ctx, sx, sy - (p.id === selected ? 20 : 0), p.speech.text);
    if (p.id === selected) label(ctx, sx, sy + (p.speech ? 0 : 0), p.name);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ---------------------------------------------------------------- things

function drawTree(ctx, w, t, now) {
  const s = t.size;
  ctx.lineWidth = 3;
  if (t.dead) {
    ctx.fillStyle = "#3b2f2a";
    roundRect(ctx, t.x - 7 * s, t.y - 18 * s, 14 * s, 18 * s, 3);
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.fillStyle = "#1113";
  ctx.beginPath();
  ctx.ellipse(t.x, t.y, 26 * s, 7 * s, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = "#a8743f";
  roundRect(ctx, t.x - 6 * s, t.y - 40 * s, 12 * s, 40 * s, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = t.burn ? "#8a8f5a" : "#48b95c";
  ctx.beginPath();
  ctx.arc(t.x - 16 * s, t.y - 52 * s, 20 * s, 0, 7);
  ctx.arc(t.x + 16 * s, t.y - 54 * s, 21 * s, 0, 7);
  ctx.arc(t.x, t.y - 72 * s, 25 * s, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(t.x - 16 * s, t.y - 52 * s, 20 * s, 0, 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(t.x + 16 * s, t.y - 54 * s, 21 * s, 0, 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(t.x, t.y - 72 * s, 25 * s, 0, 7);
  ctx.stroke();
  ctx.fillStyle = "#48b95c";
  ctx.beginPath();
  ctx.arc(t.x - 16 * s, t.y - 52 * s, 17 * s, 0, 7);
  ctx.arc(t.x + 16 * s, t.y - 54 * s, 18 * s, 0, 7);
  ctx.arc(t.x, t.y - 72 * s, 22 * s, 0, 7);
  if (!t.burn) ctx.fill();
  ctx.fillStyle = "#ff4b3e";
  ctx.lineWidth = 2;
  const spots = [
    [-18, -50],
    [14, -60],
    [-2, -78],
    [20, -46],
  ];
  for (let i = 0; i < t.fruit; i++) {
    ctx.beginPath();
    ctx.arc(t.x + spots[i][0] * s, t.y + spots[i][1] * s, 5 * s, 0, 7);
    ctx.fill();
    ctx.stroke();
  }
  if (t.burn) flames(ctx, t.x, t.y - 50 * s, 1.1 * s, now);
}

function drawRock(ctx, r) {
  ctx.lineWidth = 3;
  ctx.fillStyle = "#1113";
  ctx.beginPath();
  ctx.ellipse(r.x, r.y, r.r * 1.1, r.r * 0.3, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = "#b9bccb";
  ctx.beginPath();
  ctx.moveTo(r.x - r.r, r.y);
  ctx.lineTo(r.x - r.r * 0.8, r.y - r.r * 0.8);
  ctx.lineTo(r.x - r.r * 0.1, r.y - r.r * 1.2);
  ctx.lineTo(r.x + r.r * 0.7, r.y - r.r * 0.9);
  ctx.lineTo(r.x + r.r, r.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Gold veins: this is where people work.
  ctx.fillStyle = "#ffc53d";
  ctx.lineWidth = 2;
  for (const [dx, dy] of [
    [-0.4, -0.5],
    [0.3, -0.7],
    [0.1, -0.3],
  ]) {
    ctx.beginPath();
    ctx.arc(r.x + dx * r.r, r.y + dy * r.r, 3.5, 0, 7);
    ctx.fill();
    ctx.stroke();
  }
}

function drawHouse(ctx, w, h, now) {
  const col = h.colony && colonyOf(w, h.colony);
  ctx.lineWidth = 3;
  if (h.ruined) {
    ctx.fillStyle = "#8d7b6a";
    for (const [dx, dy, r] of [
      [-22, -6, 14],
      [4, -10, 17],
      [26, -4, 12],
      [-6, 2, 11],
    ]) {
      ctx.beginPath();
      ctx.moveTo(h.x + dx - r, h.y + dy + 6);
      ctx.lineTo(h.x + dx - r * 0.3, h.y + dy - r);
      ctx.lineTo(h.x + dx + r, h.y + dy + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    return;
  }
  const bw = 78;
  const bh = 48;
  ctx.fillStyle = "#1113";
  ctx.beginPath();
  ctx.ellipse(h.x, h.y + 2, 50, 11, 0, 0, 7);
  ctx.fill();
  if (h.built < 1) {
    // Scaffold, filling up from the ground.
    ctx.setLineDash([7, 6]);
    roundRect(ctx, h.x - bw / 2, h.y - bh, bw, bh, 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff6e4";
    const hh = bh * h.built;
    roundRect(ctx, h.x - bw / 2, h.y - hh, bw, hh, 4);
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.fillStyle = "#fff6e4";
  roundRect(ctx, h.x - bw / 2, h.y - bh, bw, bh, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col ? col.color : "#c98b5a";
  ctx.beginPath();
  ctx.moveTo(h.x - bw / 2 - 10, h.y - bh + 2);
  ctx.lineTo(h.x, h.y - bh - 38);
  ctx.lineTo(h.x + bw / 2 + 10, h.y - bh + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  roundRect(ctx, h.x - 9, h.y - 26, 18, 26, [9, 9, 0, 0]);
  ctx.fill();
  ctx.fillStyle = "#8fd0ff";
  roundRect(ctx, h.x + 16, h.y - 36, 14, 12, 2);
  ctx.fill();
  ctx.stroke();
  if (h.hp < 100) {
    ctx.fillStyle = "#fff";
    roundRect(ctx, h.x - 26, h.y + 10, 52, 7, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = h.hp > 50 ? "#3ddc84" : "#ff4b3e";
    roundRect(ctx, h.x - 25, h.y + 11, 50 * Math.max(0, h.hp / 100), 5, 2);
    ctx.fill();
  }
  if (h.fire > 0) flames(ctx, h.x, h.y - 30, 0.8 + h.fire * 1.2, now);
}

function flames(ctx, x, y, s, now) {
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    const fx = x + (i - 1) * 18 * s;
    const f = 1 + 0.25 * Math.sin(now / 90 + i * 2);
    const hgt = (28 + (i === 1 ? 12 : 0)) * s * f;
    ctx.fillStyle = "#ff7a1a";
    ctx.beginPath();
    ctx.moveTo(fx - 10 * s, y);
    ctx.quadraticCurveTo(fx - 12 * s, y - hgt * 0.5, fx, y - hgt);
    ctx.quadraticCurveTo(fx + 12 * s, y - hgt * 0.5, fx + 10 * s, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffd84d";
    ctx.beginPath();
    ctx.moveTo(fx - 5 * s, y);
    ctx.quadraticCurveTo(fx - 5 * s, y - hgt * 0.35, fx, y - hgt * 0.6);
    ctx.quadraticCurveTo(fx + 5 * s, y - hgt * 0.35, fx + 5 * s, y);
    ctx.closePath();
    ctx.fill();
  }
  // Smoke.
  ctx.fillStyle = "rgba(60,60,70,0.25)";
  for (let i = 0; i < 3; i++) {
    const k = ((now / 1400 + i / 3) % 1) * 1;
    ctx.beginPath();
    ctx.arc(x + Math.sin(k * 6 + i) * 10, y - 40 * s - k * 80, 8 + k * 16, 0, 7);
    ctx.fill();
  }
}

function drawCoin(ctx, c) {
  const y = c.y - c.z;
  ctx.lineWidth = 2;
  if (c.z <= 0) {
    ctx.fillStyle = "#1112";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 2, 8, 3, 0, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = "#ffc53d";
  ctx.beginPath();
  ctx.ellipse(c.x, y - 5, 7, 7, 0, 0, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff8";
  ctx.beginPath();
  ctx.arc(c.x - 2, y - 7, 2, 0, 7);
  ctx.fill();
}

// ---------------------------------------------------------------- people

export function moodOf(w, p) {
  const k = p.task;
  if (!p.alive) return "dead";
  if (k?.type === "sleep" && k.asleep) return "sleep";
  if (p.carried || p.z > 0 || p.stun > 0 || k?.type === "flee") return "scared";
  if (k?.type === "fight" || k?.type === "raid") return "angry";
  if (p.sick) return "worried";
  const h = happiness(w, p);
  if (k?.type === "court" || (k?.type === "chat" && k.target === p.spouse)) return "love";
  if (h < -35) return "sad";
  if (h > 25) return "happy";
  return "calm";
}

function drawPerson(ctx, w, p, now, selected) {
  const h = personHeight(p);
  const wd = h * (120 / 160);
  const k = p.task;
  const mood = moodOf(w, p);
  const moving = Math.hypot(p.vx, p.vy) > 12;
  let pose = moving ? (Math.sin(p.phase) > 0 ? "a" : "b") : "stand";
  let bob = moving ? Math.abs(Math.sin(p.phase)) * h * 0.04 : 0;
  if (k?.working) {
    pose = Math.sin(now / 160 + p.id) > 0 ? "a" : "stand";
    bob = Math.max(0, Math.sin(now / 160 + p.id)) * h * 0.06;
  }
  if (mood === "angry" && !moving) pose = Math.sin(now / 90 + p.id) > 0.3 ? "a" : "stand";
  const opts = { face: p.color, shape: p.shape };
  if (mood === "angry") opts.angry = true;
  else if (mood === "worried") opts.worried = true;
  else opts.mood = mood;
  const img = sprite(pose, opts);

  const col = p.colony && colonyOf(w, p.colony);
  const alpha = p.alive ? 1 : Math.max(0, 1 - (w.t - p.diedAt) / 20);
  ctx.save();
  ctx.globalAlpha = alpha;
  // Shadow in the tribe's color.
  ctx.fillStyle = col ? col.color + "aa" : "#1113";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, h * 0.3, h * 0.08, 0, 0, 7);
  ctx.fill();
  if (selected) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#fff";
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, h * 0.45, h * 0.14, 0, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = INK;
  }
  ctx.translate(p.x, p.y - p.z - bob);
  const lying = !p.alive || (k?.type === "sleep" && k.asleep);
  if (lying) {
    ctx.translate(0, -h * 0.12);
    ctx.rotate((p.facing > 0 ? -1 : 1) * Math.PI * 0.5);
  }
  if (k?.kneel) ctx.scale(1, 0.84);
  if (p.carried) ctx.rotate(Math.sin(now / 120) * 0.25);
  if (p.stun > 0 && !p.carried && p.z <= 0) ctx.rotate(Math.sin(now / 50) * 0.08);
  ctx.scale(p.facing, 1);
  if (img) ctx.drawImage(img, -wd / 2, -h * (150 / 160), wd, h);
  ctx.restore();

  if (!p.alive) return;
  const headTop = p.y - p.z - bob - h * 0.92;
  // The leader wears a crown.
  if (col && col.leader === p.id) crown(ctx, p.x + 4 * p.facing, headTop - 2, h * 0.2);
  if (k?.type === "sleep" && k.asleep) {
    ctx.fillStyle = INK;
    ctx.font = `800 ${h * 0.22}px ${FONT}`;
    ctx.fillText("z", p.x + 12 + Math.sin(now / 400) * 3, p.y - h * 0.55 - ((now / 30) % 20));
  }
  if (p.sick) {
    ctx.fillStyle = "#7bd04b";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const k2 = (now / 1200 + i / 3) % 1;
      ctx.beginPath();
      ctx.arc(p.x - 12 + i * 12, headTop - k2 * 18, 3 + k2 * 2, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
  }
  if (k?.kneel) {
    ctx.font = `${h * 0.28}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("🙏", p.x, headTop - 8);
  }
}

function crown(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = "#ffc53d";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x - s, y - s * 0.9);
  ctx.lineTo(x - s * 0.5, y - s * 0.4);
  ctx.lineTo(x, y - s * 1.1);
  ctx.lineTo(x + s * 0.5, y - s * 0.4);
  ctx.lineTo(x + s, y - s * 0.9);
  ctx.lineTo(x + s, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function bubble(ctx, x, y, text) {
  ctx.save();
  ctx.font = `700 13px ${FONT}`;
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const max = 190;
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const t = line ? `${line} ${word}` : word;
    if (ctx.measureText(t).width > max && line) {
      lines.push(line);
      line = word;
    } else line = t;
  }
  lines.push(line);
  const shown = lines.slice(0, 4);
  const bw = Math.max(...shown.map((l) => ctx.measureText(l).width)) + 20;
  const bh = shown.length * 17 + 12;
  const by = y - bh - 8;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, by, bw, bh, 10);
  ctx.moveTo(x - 6, by + bh);
  ctx.lineTo(x, by + bh + 8);
  ctx.lineTo(x + 6, by + bh);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  shown.forEach((l, i) => ctx.fillText(l, x, by + 12 + i * 17));
  ctx.restore();
}

function label(ctx, x, y, text) {
  ctx.save();
  ctx.font = `800 12px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width + 14;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x - tw / 2, y - 10, tw, 20, 10);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

// ---------------------------------------------------------------- effects

function groundEffect(ctx, w, e) {
  const age = w.t - e.t0;
  const fade = 1 - age / e.dur;
  if (e.type === "scorch" || e.type === "crater") {
    const r = e.type === "crater" ? 120 : 40;
    ctx.fillStyle = e.type === "crater" ? `rgba(90,62,40,${0.9 * Math.min(1, fade * 3)})` : `rgba(40,30,30,${0.5 * fade})`;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, r, r * 0.45, 0, 0, 7);
    ctx.fill();
    if (e.type === "crater") {
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = `rgba(50,35,25,${Math.min(1, fade * 3)})`;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 6, r * 0.6, r * 0.22, 0, 0, 7);
      ctx.fill();
    }
  }
  if (e.type === "quake") {
    ctx.lineWidth = 4;
    ctx.globalAlpha = fade;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      let x = e.x;
      let y = e.y;
      for (let j = 1; j < 6; j++) {
        x += Math.cos(a + Math.sin(i * 3 + j) * 0.6) * 50;
        y += Math.sin(a + Math.cos(i * 5 + j) * 0.6) * 25;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function skyEffect(ctx, w, e) {
  const age = w.t - e.t0;
  const k = age / e.dur;
  const fade = 1 - k;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.textAlign = "center";
  switch (e.type) {
    case "bolt": {
      ctx.globalAlpha = fade;
      let seed = Math.floor(e.t0 * 1000);
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
      const pts = [[e.x + 80, e.y - 900]];
      for (let i = 1; i <= 10; i++) pts.push([e.x + 80 * (1 - i / 10) + r() * 50, e.y - 900 + (900 * i) / 10]);
      for (const [lw, color] of [
        [16, INK],
        [9, "#ffe066"],
        [3, "#fff"],
      ]) {
        ctx.lineWidth = lw;
        ctx.strokeStyle = color;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      break;
    }
    case "meteor": {
      const x = e.x + 500 * (1 - k);
      const y = e.y - 900 * (1 - k);
      ctx.strokeStyle = "rgba(255,140,40,0.6)";
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.moveTo(x + 120, y - 220);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = "#5a4636";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ff7a1a";
      ctx.beginPath();
      ctx.arc(x + 10, y - 12, 10, 0, 7);
      ctx.fill();
      break;
    }
    case "boom": {
      ctx.globalAlpha = fade;
      ctx.fillStyle = "#ffb13d";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - 40, 60 + k * 200, 40 + k * 130, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff3b0";
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - 40, 30 + k * 100, 20 + k * 60, 0, 0, 7);
      ctx.fill();
      break;
    }
    case "plague":
      ctx.globalAlpha = fade * 0.6;
      ctx.fillStyle = "#7bd04b";
      for (let i = 0; i < 9; i++) {
        const a = i * 0.7 + age;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * 70, e.y - 30 + Math.sin(a * 1.3) * 35 - age * 20, 30 + i * 3, 0, 7);
        ctx.fill();
      }
      break;
    case "rain": {
      ctx.globalAlpha = Math.min(1, fade * 3);
      ctx.fillStyle = "#8a93b8";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (const [dx, r] of [
        [-150, 60],
        [-60, 80],
        [40, 90],
        [140, 65],
      ])
        ctx.arc(e.x + dx, e.y - 380, r, 0, 7);
      ctx.fill();
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 3;
      for (let i = 0; i < 70; i++) {
        const x = e.x - 230 + ((i * 37) % 460);
        const y = e.y - 330 + (((age * 700 + i * 53) % 420));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 18);
        ctx.stroke();
      }
      break;
    }
    case "shine":
    case "bless":
      ctx.globalAlpha = fade;
      ctx.font = "26px sans-serif";
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63;
        ctx.fillText(e.type === "bless" ? "✨" : "🪙", e.x + Math.cos(a) * (40 + k * 90), e.y - 40 - k * 90 + Math.sin(a) * 40);
      }
      if (e.type === "bless") {
        ctx.strokeStyle = "#ffd84d";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 60 + k * 90, 20 + k * 30, 0, 0, 7);
        ctx.stroke();
      }
      break;
    case "dust":
      ctx.globalAlpha = fade * 0.7;
      ctx.fillStyle = "#d8cfc4";
      ctx.strokeStyle = INK;
      for (let i = 0; i < (e.big ? 8 : 5); i++) {
        const a = (i / (e.big ? 8 : 5)) * Math.PI * 2;
        const s = e.big ? 2.2 : 1;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * (14 + k * 30) * s, e.y - 8 + Math.sin(a) * 6 * s - k * 10, (9 - k * 4) * s, 0, 7);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case "soul":
      ctx.globalAlpha = fade * 0.85;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.arc(e.x + Math.sin(age * 3) * 10, e.y - 60 - age * 45, 14, Math.PI, 0);
      ctx.lineTo(e.x + 14 + Math.sin(age * 3) * 10, e.y - 40 - age * 45);
      ctx.lineTo(e.x - 14 + Math.sin(age * 3) * 10, e.y - 40 - age * 45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "heart":
      ctx.globalAlpha = fade;
      ctx.font = `${e.big ? 44 : 26}px sans-serif`;
      ctx.fillText("💖", e.x, e.y - k * 50);
      break;
    case "pop":
      ctx.globalAlpha = fade;
      ctx.font = `800 18px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#fff";
      ctx.strokeText(e.text, e.x, e.y - k * 30);
      ctx.fillStyle = INK;
      ctx.fillText(e.text, e.x, e.y - k * 30);
      break;
    case "hit":
      ctx.globalAlpha = fade;
      ctx.font = "28px sans-serif";
      ctx.fillText("💥", e.x, e.y);
      break;
    case "splash":
      ctx.globalAlpha = fade;
      ctx.font = "18px sans-serif";
      ctx.fillText("💧", e.x, e.y - k * 20);
      break;
    case "spark":
      flames(ctx, e.x, e.y, 0.6 * fade, performance.now());
      break;
  }
  ctx.restore();
}

// For the minimap: where things are.
export function renderMini(ctx, w, cam, vw, vh, mw, mh) {
  const sx = mw / w.W;
  const sy = mh / w.H;
  ctx.clearRect(0, 0, mw, mh);
  ctx.fillStyle = "#c4e6a0";
  ctx.fillRect(0, 0, mw, mh);
  for (const h of w.houses) {
    const c = h.colony && colonyOf(w, h.colony);
    ctx.fillStyle = h.ruined ? "#8d7b6a" : h.fire ? "#ff7a1a" : (c?.color ?? "#c98b5a");
    ctx.fillRect(h.x * sx - 2, h.y * sy - 2, 5, 4);
  }
  for (const p of w.people) {
    if (!p.alive) continue;
    const c = p.colony && colonyOf(w, p.colony);
    ctx.fillStyle = c?.color ?? INK;
    ctx.fillRect(p.x * sx - 1, p.y * sy - 1, 2.5, 2.5);
  }
  const hw = vw / cam.zoom / 2;
  const hh = vh / cam.zoom / 2;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect((cam.x - hw) * sx, (cam.y - hh) * sy, hw * 2 * sx, hh * 2 * sy);
}

export { byId, houseOf };
