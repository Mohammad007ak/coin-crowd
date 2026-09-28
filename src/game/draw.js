// Draws the world on a canvas in the figure's line-art style: flat colors,
// an ink outline on everything — plus a painted land that changes with the
// seasons, weather, day and night, lights, wildlife and the armies of faith.
import { INK, figureSvg } from "../crowd/Figure.jsx";
import { DAY, ADULT, byId, colonyOf, happiness, houseOf } from "./world.js";
import { religionOf } from "./crusade.js";
import { seeded } from "./terrain.js";
import { CELL } from "./ants.js";
import { drawBullet, drawCivic, drawFallout, drawFlat, drawMissiles, drawNuke, isFlat, modernHouse } from "./draw-tech.js";
import { weaponLevel } from "./tech.js";

const PERSON_H = 66; // an adult's height in world px
const FONT = `"Estedad Variable", "Vazirmatn Variable", Tahoma, sans-serif`;
const EMOJI = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

// ---------------------------------------------------------------- looks

const LOOK = {
  spring: { grass: "#b4e09a", light: "#cdeeb4", dark: "#93c97c", canopy: ["#5cc46e", "#4db660"], flower: ["#ffffff", "#ffd84d", "#ff9bd2", "#c9a7ff"] },
  summer: { grass: "#bedd8a", light: "#d4ea9e", dark: "#9ec46c", canopy: ["#41ad57", "#379b4b"], flower: ["#ffd84d", "#ffffff", "#ff8a73"] },
  autumn: { grass: "#d3cc88", light: "#e4da9a", dark: "#b6ac66", canopy: ["#f2952b", "#e2622b", "#f2b93a", "#c9492a"], flower: ["#e2622b", "#f2b93a"] },
  winter: { grass: "#eaf1f6", light: "#ffffff", dark: "#d0dce6", canopy: null, flower: [] },
};
const look = (w) => LOOK[w.season] ?? LOOK.spring;

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

// ---------------------------------------------------------------- the land

// Painted once per world and season, then just stamped.
const TS = 0.75;
const lands = new Map();
function landImage(w) {
  const t = w.terrain;
  const key = `${t.seed}:${w.season}`;
  if (lands.has(key)) return lands.get(key);
  if (lands.size > 3) lands.delete(lands.keys().next().value);
  const c = document.createElement("canvas");
  c.width = Math.round(w.W * TS);
  c.height = Math.round(w.H * TS);
  const g = c.getContext("2d");
  g.scale(TS, TS);
  paintLand(g, w);
  lands.set(key, c);
  return c;
}

function paintLand(g, w) {
  const t = w.terrain;
  const L = look(w);
  const winter = w.season === "winter";
  const rnd = seeded(t.seed + 7);
  g.lineJoin = "round";
  g.lineCap = "round";
  g.fillStyle = L.grass;
  g.fillRect(0, 0, w.W, w.H);
  // Soft patches of lighter and darker grass.
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * w.W;
    const y = rnd() * w.H;
    const r = 30 + rnd() * 110;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const col = rnd() < 0.5 ? L.light : L.dark;
    grad.addColorStop(0, col + "66");
    grad.addColorStop(1, col + "00");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.6, 0, 0, 7);
    g.fill();
  }
  // Mountains along the north.
  const peaks = (base, n, hMin, hMax, fill, snow) => {
    g.fillStyle = fill;
    g.strokeStyle = INK;
    g.lineWidth = 3;
    for (let i = -1; i <= n; i++) {
      const x = (i / n) * w.W + rnd() * 80;
      const hh = hMin + rnd() * (hMax - hMin);
      const ww = hh * (1.2 + rnd() * 0.6);
      g.beginPath();
      g.moveTo(x - ww, base);
      g.lineTo(x - ww * 0.25, base - hh * 0.8);
      g.lineTo(x, base - hh);
      g.lineTo(x + ww * 0.35, base - hh * 0.75);
      g.lineTo(x + ww, base);
      g.closePath();
      g.fill();
      g.stroke();
      if (snow) {
        g.fillStyle = "#fff";
        g.beginPath();
        g.moveTo(x - ww * 0.25 + ww * 0.08, base - hh * 0.8 + 8);
        g.lineTo(x, base - hh);
        g.lineTo(x + ww * 0.3, base - hh * 0.77);
        g.lineTo(x + ww * 0.12, base - hh * 0.68);
        g.lineTo(x - ww * 0.02, base - hh * 0.78);
        g.lineTo(x - ww * 0.1, base - hh * 0.7);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = fill;
      }
    }
  };
  g.fillStyle = winter ? "#dfe7f0" : "#cfe0f2";
  g.fillRect(0, 0, w.W, 150);
  peaks(150, 9, 90, 140, winter ? "#b8c3d6" : "#a9b8cf", true);
  peaks(165, 12, 50, 95, winter ? "#9fb0c6" : "#8ea3bd", winter);
  // A dark forest line at the foot of the mountains.
  g.fillStyle = winter ? "#6f8a7a" : "#3f8a53";
  g.beginPath();
  g.moveTo(0, 190);
  for (let x = 0; x <= w.W; x += 26) g.arc(x + 13, 176 + rnd() * 6, 16 + rnd() * 6, Math.PI, 0);
  g.lineTo(w.W, 190);
  g.closePath();
  g.fill();
  g.stroke();

  // Hills: a shadow, a body, a highlight.
  const hill = (x, y, r, k = 1) => {
    g.fillStyle = "#1111261a";
    g.beginPath();
    g.ellipse(x + 14, y + 10, r * 1.05, r * 0.55, 0, 0, 7);
    g.fill();
    const grad = g.createLinearGradient(x, y - r * 0.5, x, y + r * 0.5);
    grad.addColorStop(0, L.light);
    grad.addColorStop(1, L.dark);
    g.fillStyle = grad;
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.5 * k, 0, 0, 7);
    g.fill();
    g.stroke();
    g.fillStyle = "#ffffff55";
    g.beginPath();
    g.ellipse(x - r * 0.25, y - r * 0.18, r * 0.45, r * 0.16, -0.1, 0, 7);
    g.fill();
  };
  for (const h of t.hills) hill(h.x, h.y, h.r);
  // The sacred hill, with a stone plaza and steps down to the south.
  const H = t.holy;
  hill(H.x, H.y, H.r * 1.15, 1.05);
  g.fillStyle = winter ? "#f4f1ea" : "#e9dcbd";
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(H.x, H.y, H.r * 0.62, H.r * 0.28, 0, 0, 7);
  g.fill();
  g.stroke();
  g.lineWidth = 1.5;
  g.strokeStyle = "#11112633";
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.ellipse(H.x, H.y, H.r * 0.62 * (i / 4), H.r * 0.28 * (i / 4), 0, 0, 7);
    g.stroke();
  }
  g.fillStyle = winter ? "#f4f1ea" : "#e9dcbd";
  g.strokeStyle = INK;
  g.lineWidth = 2.5;
  for (let i = 0; i < 5; i++) {
    const y = H.y + H.r * 0.28 + i * 14;
    const ww = 70 - i * 4;
    g.beginPath();
    g.rect(H.x - ww / 2, y, ww, 14);
    g.fill();
    g.stroke();
  }

  // The river: sand banks, an ink edge, water, a deeper middle.
  const riverPass = (extra, color, alpha = 1) => {
    g.strokeStyle = color;
    g.globalAlpha = alpha;
    for (let i = 0; i < t.river.length - 1; i++) {
      const y0 = i * t.step;
      g.lineWidth = t.width(y0) + extra;
      g.beginPath();
      g.moveTo(t.river[i], y0);
      g.lineTo(t.river[i + 1], y0 + t.step);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  const water = winter ? "#bfe3f5" : "#58aee3";
  const deep = winter ? "#a7d6ef" : "#3f97d3";
  riverPass(40, winter ? "#f4f1ea" : "#ead9a6");
  riverPass(6, INK);
  riverPass(0, water);
  riverPass(-t.width(0) * 0.55, deep, 0.7);
  for (const l of t.lakes) {
    g.fillStyle = winter ? "#f4f1ea" : "#ead9a6";
    g.beginPath();
    g.ellipse(l.x, l.y, l.rx + 22, l.ry + 16, 0, 0, 7);
    g.fill();
    g.fillStyle = water;
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(l.x, l.y, l.rx, l.ry, 0, 0, 7);
    g.fill();
    g.stroke();
    g.fillStyle = deep;
    g.beginPath();
    g.ellipse(l.x + 6, l.y + 4, l.rx * 0.6, l.ry * 0.55, 0, 0, 7);
    g.fill();
    // Reeds.
    if (!winter) {
      g.strokeStyle = "#3f7a3f";
      g.lineWidth = 2.5;
      for (let i = 0; i < 14; i++) {
        const a = rnd() * Math.PI * 2;
        const x = l.x + Math.cos(a) * l.rx;
        const y = l.y + Math.sin(a) * l.ry;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 3, y - 18);
        g.moveTo(x + 4, y);
        g.lineTo(x + 6, y - 14);
        g.stroke();
      }
    }
  }
  if (winter) {
    // Cracks in the ice.
    g.strokeStyle = "#ffffffcc";
    g.lineWidth = 2;
    for (let i = 0; i < 60; i++) {
      const y = rnd() * w.H;
      const x = t.riverX(y) + (rnd() - 0.5) * t.width(y) * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 30, y + 10 + rnd() * 20);
      g.stroke();
    }
  }
  // Bridges: planks and rails.
  for (const b of t.bridges) {
    const x0 = b.x - b.len / 2;
    g.fillStyle = "#1111262a";
    g.fillRect(x0 + 6, b.y - 8, b.len, 34);
    g.fillStyle = "#b98552";
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x0, b.y - 16, b.len, 32, 4);
    g.fill();
    g.stroke();
    g.lineWidth = 1.5;
    for (let x = x0 + 10; x < x0 + b.len; x += 10) {
      g.beginPath();
      g.moveTo(x, b.y - 16);
      g.lineTo(x, b.y + 16);
      g.stroke();
    }
    g.lineWidth = 3;
    g.fillStyle = "#8a5a35";
    for (const yy of [-16, 16]) {
      g.beginPath();
      g.roundRect(x0 - 4, b.y + yy - 4, b.len + 8, 7, 3);
      g.fill();
      g.stroke();
      for (let x = x0; x <= x0 + b.len; x += b.len / 4) {
        g.beginPath();
        g.roundRect(x - 4, b.y + yy - 10, 8, 12, 2);
        g.fill();
        g.stroke();
      }
    }
  }
  // Tufts, flowers, pebbles.
  for (let i = 0; i < (w.W * w.H) / 5000; i++) {
    const x = rnd() * w.W;
    const y = 200 + rnd() * (w.H - 200);
    if (Math.abs(x - t.riverX(y)) < t.width(y) / 2 + 22) continue;
    const k = rnd();
    if (k < 0.1 && L.flower.length) {
      g.fillStyle = L.flower[Math.floor(rnd() * L.flower.length)];
      g.beginPath();
      g.arc(x, y, 3.2, 0, 7);
      g.fill();
    } else if (k < 0.13) {
      g.fillStyle = "#c3c1c9";
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(x, y, 5, 3.5, 0, 0, 7);
      g.fill();
      g.stroke();
    } else {
      g.strokeStyle = winter ? "#c3d0dc" : L.dark;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 5, y - 7);
      g.lineTo(x, y);
      g.lineTo(x + 5, y - 8);
      g.stroke();
    }
  }
  // Snow drifts.
  if (winter)
    for (let i = 0; i < 300; i++) {
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.ellipse(rnd() * w.W, 200 + rnd() * w.H, 20 + rnd() * 40, 6 + rnd() * 8, 0, 0, 7);
      g.fill();
    }
  // A frame of darker land at the edges.
  const edge = (x0, y0, x1, y1) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, "#1111262a");
    grad.addColorStop(1, "#11112600");
    g.fillStyle = grad;
    g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || w.W, Math.abs(y1 - y0) || w.H);
  };
  edge(0, 0, 90, 0);
  edge(w.W, 0, w.W - 90, 0);
  edge(0, w.H, 0, w.H - 90);
}

// ---------------------------------------------------------------- ambience

// Birds, butterflies, fireflies, leaves, rain and snow: only for the eyes.
const amb = { birds: [], flies: [], fish: [], drops: [], last: 0, nextFlock: 0 };

function ambience(w, cam, vw, vh, now, dt) {
  const hw = vw / cam.zoom / 2;
  const hh = vh / cam.zoom / 2;
  const view = { x0: cam.x - hw, x1: cam.x + hw, y0: cam.y - hh, y1: cam.y + hh };
  const hour = (w.t % DAY) / DAY;
  const night = hour > 0.72 && hour < 0.96;
  const bad = w.weather.type === "storm" || w.weather.type === "rain" || w.weather.type === "snow";
  // Flocks cross the sky by day.
  if (now > amb.nextFlock && !night && !bad) {
    amb.nextFlock = now + 6000 + Math.random() * 9000;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y = view.y0 + Math.random() * (view.y1 - view.y0) * 0.7;
    const n = 3 + Math.floor(Math.random() * 5);
    const flock = Math.random();
    for (let i = 0; i < n; i++)
      amb.birds.push({
        x: (dir > 0 ? view.x0 - 60 : view.x1 + 60) - dir * Math.random() * 80,
        y: y + (Math.random() - 0.5) * 80,
        vx: dir * 110,
        vy: (Math.random() - 0.5) * 30,
        dir,
        flock,
        ph: Math.random() * 6,
      });
  }
  // Boids: keep apart, match heading, stay together — and keep going.
  for (const b of amb.birds) {
    let sx = 0;
    let sy = 0;
    let ax = 0;
    let ay = 0;
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (const o of amb.birds) {
      if (o === b || o.flock !== b.flock) continue;
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 140 * 140) continue;
      if (d2 < 22 * 22) (sx -= dx), (sy -= dy);
      ax += o.vx;
      ay += o.vy;
      cx += dx;
      cy += dy;
      n++;
    }
    if (n) {
      b.vx += ((ax / n - b.vx) * 0.05 + (cx / n) * 0.01 + sx * 0.05) * dt * 60;
      b.vy += ((ay / n - b.vy) * 0.05 + (cy / n) * 0.01 + sy * 0.05) * dt * 60;
    }
    b.vx += (b.dir * 115 - b.vx) * 0.02 * dt * 60;
    b.vy += (Math.sin(performance.now() / 1500 + b.flock * 9) * 12 - b.vy) * 0.01 * dt * 60;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  amb.birds = amb.birds.filter((b) => b.x > view.x0 - 500 && b.x < view.x1 + 500);
  // Butterflies in spring and summer days, fireflies on summer nights.
  const wantFlies = (w.season === "spring" || w.season === "summer") && !bad ? 14 : 0;
  while (amb.flies.length < wantFlies)
    amb.flies.push({ x: view.x0 + Math.random() * (view.x1 - view.x0), y: view.y0 + Math.random() * (view.y1 - view.y0), a: Math.random() * 6, c: ["#ff9bd2", "#ffd84d", "#8fd0ff", "#fff"][Math.floor(Math.random() * 4)] });
  if (amb.flies.length > wantFlies) amb.flies.length = wantFlies;
  for (const f of amb.flies) {
    f.a += (Math.random() - 0.5) * 3 * dt;
    f.x += Math.cos(f.a) * 30 * dt;
    f.y += Math.sin(f.a) * 18 * dt;
    if (f.x < view.x0 - 100 || f.x > view.x1 + 100 || f.y < view.y0 - 100 || f.y > view.y1 + 100) {
      f.x = view.x0 + Math.random() * (view.x1 - view.x0);
      f.y = view.y0 + Math.random() * (view.y1 - view.y0);
    }
  }
  // A fish jumps now and then.
  if (w.season !== "winter" && Math.random() < dt * 0.6) {
    const y = view.y0 + Math.random() * (view.y1 - view.y0);
    const t = w.terrain;
    amb.fish.push({ x: t.riverX(y) + (Math.random() - 0.5) * t.width(y) * 0.5, y, t0: now });
  }
  amb.fish = amb.fish.filter((f) => now - f.t0 < 900);
  // Screen-space weather.
  const want = { rain: 140, storm: 260, snow: 160 }[w.weather.type] ?? (w.season === "autumn" ? 18 : 0);
  while (amb.drops.length < want) amb.drops.push({ x: Math.random() * vw, y: Math.random() * vh, s: 0.6 + Math.random() * 0.8, a: Math.random() * 6 });
  if (amb.drops.length > want) amb.drops.length = want;
  return { night, view };
}

function drawBirds(ctx, now) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  for (const b of amb.birds) {
    const f = Math.sin(now / 110 + b.ph) * 5;
    ctx.beginPath();
    ctx.moveTo(b.x - 9, b.y - f);
    ctx.quadraticCurveTo(b.x - 4, b.y - 4, b.x, b.y);
    ctx.quadraticCurveTo(b.x + 4, b.y - 4, b.x + 9, b.y - f);
    ctx.stroke();
  }
}

function drawFlies(ctx, w, now, night, lights) {
  for (const f of amb.flies) {
    if (night) {
      if (w.season !== "summer") continue;
      ctx.fillStyle = "#fff9a8";
      ctx.beginPath();
      ctx.arc(f.x, f.y - 30, 2.5, 0, 7);
      ctx.fill();
      if (Math.sin(now / 300 + f.a * 3) > 0) lights.push({ x: f.x, y: f.y - 30, r: 22, c: "255,240,120", k: 0.8 });
    } else {
      const flap = Math.abs(Math.sin(now / 70 + f.a)) * 5 + 1;
      ctx.fillStyle = f.c;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(f.x + s * flap * 0.7, f.y - 34, flap, 4, 0, 0, 7);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}

function drawFish(ctx, now) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  for (const f of amb.fish) {
    const k = (now - f.t0) / 900;
    const x = f.x + k * 30;
    const y = f.y - Math.sin(k * Math.PI) * 30;
    ctx.fillStyle = "#ffb13d";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.8 + k * 1.6);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 4.5, 0, 0, 7);
    ctx.moveTo(-8, 0);
    ctx.lineTo(-14, -5);
    ctx.lineTo(-14, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (k > 0.85 || k < 0.15) {
      ctx.strokeStyle = "#ffffffcc";
      ctx.beginPath();
      ctx.ellipse(k < 0.5 ? f.x : f.x + 30, f.y, 10 + k * 8, 3 + k * 2, 0, 0, 7);
      ctx.stroke();
      ctx.strokeStyle = INK;
    }
  }
}

function drawWeather(ctx, w, vw, vh, dt) {
  const type = w.weather.type;
  const wind = type === "storm" ? 3 : 1;
  ctx.save();
  if (type === "rain" || type === "storm") {
    ctx.strokeStyle = "rgba(200,220,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const d of amb.drops) {
      d.y += 900 * d.s * dt;
      d.x += 120 * wind * d.s * dt;
      if (d.y > vh) (d.y = -20), (d.x = Math.random() * vw);
      if (d.x > vw) d.x = 0;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 4 * wind, d.y - 16 * d.s);
    }
    ctx.stroke();
  } else if (type === "snow") {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (const d of amb.drops) {
      d.a += dt;
      d.y += 60 * d.s * dt;
      d.x += Math.sin(d.a) * 20 * dt;
      if (d.y > vh) (d.y = -10), (d.x = Math.random() * vw);
      ctx.beginPath();
      ctx.arc(d.x, d.y, 1.5 + d.s * 2, 0, 7);
      ctx.fill();
    }
  } else if (w.season === "autumn") {
    for (const d of amb.drops) {
      d.a += dt * 2;
      d.y += 40 * d.s * dt;
      d.x += (Math.sin(d.a) * 40 + 20) * dt;
      if (d.y > vh) (d.y = -10), (d.x = Math.random() * vw);
      if (d.x > vw) d.x = 0;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.a);
      ctx.fillStyle = d.s > 1 ? "#e2622b" : "#f2b93a";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 3, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  if (type === "fog") {
    for (let i = 0; i < 4; i++) {
      const y = ((performance.now() / 60 + i * 260) % (vh + 300)) - 150;
      const grad = ctx.createLinearGradient(0, y - 120, 0, y + 120);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, "rgba(255,255,255,0.35)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, y - 120, vw, 240);
    }
  }
  ctx.restore();
}

// Shadows of clouds sliding over the land.
function cloudShadows(ctx, w, now) {
  const heavy = { cloudy: 0.13, rain: 0.16, storm: 0.2, snow: 0.1, fog: 0.05 }[w.weather.type] ?? 0.06;
  const rnd = seeded(w.terrain.seed + 3);
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const speed = 14 + rnd() * 10;
    const span = w.W + 1200;
    const x = ((rnd() * span + (now / 1000) * speed) % span) - 600;
    const y = 250 + rnd() * (w.H - 300);
    const r = 180 + rnd() * 160;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(17,17,38,${heavy})`);
    grad.addColorStop(1, "rgba(17,17,38,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.4, r * 0.7, 0, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- frame

let lastNow = 0;
export function render(ctx, w, cam, vw, vh, { selected, now, trails }) {
  const dt = Math.min(0.05, (now - (lastNow || now)) / 1000);
  lastNow = now;
  const { night, view } = ambience(w, cam, vw, vh, now, dt);
  const lights = [];
  const hour = (w.t % DAY) / DAY;
  const dark = darkness(hour) + (w.weather.type === "storm" ? 0.18 : w.weather.type === "rain" ? 0.08 : 0);

  ctx.save();
  if (w.shake > 0) ctx.translate((Math.random() - 0.5) * 14 * Math.min(1, w.shake), (Math.random() - 0.5) * 10 * Math.min(1, w.shake));
  ctx.fillStyle = "#6f9a58";
  ctx.fillRect(-20, -20, vw + 40, vh + 40);

  ctx.save();
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;

  ctx.drawImage(landImage(w), 0, 0, w.W, w.H);
  shimmer(ctx, w, view, now);
  roads(ctx, w);
  wornPaths(ctx, w, view);
  if (trails) scents(ctx, w, view);
  drawFallout(ctx, w);
  for (const b of w.houses) if (isFlat(b) && b.x > view.x0 - 600 && b.x < view.x1 + 600) drawFlat(ctx, w, b, now);
  for (const e of w.effects) groundEffect(ctx, w, e);
  cloudShadows(ctx, w, now);
  drawFish(ctx, now);

  // Everything that stands, back to front.
  const items = [
    ...w.trees.map((o) => [o.y, 0, o]),
    ...w.rocks.map((o) => [o.y, 1, o]),
    ...w.houses.filter((o) => !isFlat(o)).map((o) => [o.y, 2, o]),
    ...w.coins.map((o) => [o.y, 3, o]),
    ...w.people.map((o) => [o.y + (o.carried ? 3000 : 0), 4, o]),
    [w.holy.y, 5, w.holy],
  ].sort((a, b) => a[0] - b[0]);
  const wind = w.weather.type === "storm" ? 3 : w.weather.type === "rain" ? 1.6 : 1;
  const pad = 200;
  for (const [, kind, o] of items) {
    if (o.x < view.x0 - pad || o.x > view.x1 + pad || o.y < view.y0 - 60 || o.y > view.y1 + 300) continue;
    if (kind === 0) drawTree(ctx, w, o, now, wind, lights);
    else if (kind === 1) drawRock(ctx, o);
    else if (kind === 2) drawBuilding(ctx, w, o, now, dark, lights);
    else if (kind === 3) drawCoin(ctx, o);
    else if (kind === 4) drawPerson(ctx, w, o, now, o.id === selected, dark, lights);
    else drawShrine(ctx, w, now, lights);
  }
  drawArrows(ctx, w);
  drawMissiles(ctx, w, lights);
  drawFlies(ctx, w, now, night, lights);
  for (const e of w.effects) skyEffect(ctx, w, e, lights);
  drawBirds(ctx, now);
  ctx.restore();

  // Day and night: tint the scene, then add the lights back.
  if (dark > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    const dusk = hour > 0.6 && hour < 0.78 ? Math.max(0, 1 - Math.abs(hour - 0.69) / 0.09) : 0;
    const dawn = hour > 0.93 ? (hour - 0.93) / 0.07 : 0;
    const warm = Math.max(dusk, dawn);
    const r = Math.round(255 - dark * 200 + warm * 40);
    const g = Math.round(255 - dark * 185 - warm * 30);
    const b = Math.round(255 - dark * 120 - warm * 90);
    ctx.fillStyle = `rgb(${Math.min(255, r)},${g},${b})`;
    ctx.fillRect(-20, -20, vw + 40, vh + 40);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(vw / 2, vh / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    for (const l of lights) {
      const k = (l.k ?? 1) * Math.min(1, dark * 1.6) * (l.always ? 1 : 1);
      if (k <= 0.01) continue;
      const grad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grad.addColorStop(0, `rgba(${l.c},${Math.min(0.5, 0.42 * k)})`);
      grad.addColorStop(1, `rgba(${l.c},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.restore();
  }
  drawWeather(ctx, w, vw, vh, dt);
  // Flash.
  for (const e of w.effects)
    if (e.type === "flash") {
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - (w.t - e.t0) / e.dur)})`;
      ctx.fillRect(-20, -20, vw + 40, vh + 40);
    }
  // A soft vignette.
  const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.45, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  vg.addColorStop(0, "rgba(17,17,38,0)");
  vg.addColorStop(1, "rgba(17,17,38,0.28)");
  ctx.fillStyle = vg;
  ctx.fillRect(-20, -20, vw + 40, vh + 40);

  // Words over heads, in screen space so they stay readable.
  for (const p of w.people) {
    if (!p.alive || !(p.speech || p.id === selected)) continue;
    const [sx, sy] = toScreen(cam, vw, vh, p.x, p.y - p.z - personHeight(p) - (p.role === "bearer" ? 60 : 6));
    if (sx < -100 || sx > vw + 100 || sy < -60 || sy > vh + 60) continue;
    if (p.speech && (cam.zoom > 0.42 || p.id === selected)) bubble(ctx, sx, sy - (p.id === selected ? 20 : 0), p.speech.text);
    if (p.id === selected) label(ctx, sx, sy, p.name);
  }
  ctx.restore();
}

// 0 by day, up to ~0.62 deep in the night; dusk and dawn in between.
function darkness(hour) {
  if (hour < 0.6) return 0;
  if (hour < 0.76) return ((hour - 0.6) / 0.16) * 0.62;
  if (hour < 0.93) return 0.62;
  return 0.62 * (1 - (hour - 0.93) / 0.07);
}

// Light glinting on the water, drifting downstream.
function shimmer(ctx, w, view, now) {
  const t = w.terrain;
  if (w.season === "winter") return;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 2.5;
  const y0 = Math.max(0, Math.floor(view.y0 / 36) * 36);
  for (let y = y0; y < Math.min(w.H, view.y1 + 40); y += 36) {
    for (let j = 0; j < 2; j++) {
      const yy = y + ((now / 40 + j * 18) % 36);
      const x = t.riverX(yy) + Math.sin(yy * 0.13 + j * 2) * t.width(yy) * 0.28;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(now / 300 + yy);
      ctx.beginPath();
      ctx.moveTo(x - 7, yy);
      ctx.lineTo(x + 7, yy);
      ctx.stroke();
    }
  }
  for (const l of t.lakes) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.3 + now / 3000;
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(now / 400 + i);
      const x = l.x + Math.cos(a) * l.rx * 0.5;
      const y = l.y + Math.sin(a * 1.7) * l.ry * 0.45;
      ctx.beginPath();
      ctx.moveTo(x - 9, y);
      ctx.lineTo(x + 9, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Where many feet have passed, the grass wears into a dirt path.
function wornPaths(ctx, w, view) {
  const ph = w.pher;
  if (!ph) return;
  const c0 = Math.max(0, Math.floor(view.x0 / CELL) - 1);
  const c1 = Math.min(ph.cols - 1, Math.ceil(view.x1 / CELL) + 1);
  const r0 = Math.max(0, Math.floor(view.y0 / CELL) - 1);
  const r1 = Math.min(ph.rows - 1, Math.ceil(view.y1 / CELL) + 1);
  ctx.save();
  ctx.fillStyle = w.season === "winter" ? "#c8bba6" : "#c4a470";
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const v = ph.walk[r * ph.cols + c];
      if (v < 0.8) continue;
      ctx.globalAlpha = Math.min(0.5, (v - 0.8) / 5);
      ctx.beginPath();
      ctx.ellipse((c + 0.5) * CELL, (r + 0.5) * CELL, CELL * 0.62, CELL * 0.4, 0, 0, 7);
      ctx.fill();
    }
  ctx.restore();
}

// The ants' view: food trails in green, the smell of danger in red.
function scents(ctx, w, view) {
  const ph = w.pher;
  if (!ph) return;
  const c0 = Math.max(0, Math.floor(view.x0 / CELL));
  const c1 = Math.min(ph.cols - 1, Math.ceil(view.x1 / CELL));
  const r0 = Math.max(0, Math.floor(view.y0 / CELL));
  const r1 = Math.min(ph.rows - 1, Math.ceil(view.y1 / CELL));
  ctx.save();
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const i = r * ph.cols + c;
      const x = (c + 0.5) * CELL;
      const y = (r + 0.5) * CELL;
      if (ph.danger[i] > 0.2) {
        ctx.fillStyle = `rgba(255,60,50,${Math.min(0.45, ph.danger[i] / 10)})`;
        ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
      }
      if (ph.food[i] > 0.15) {
        ctx.fillStyle = `rgba(40,200,90,${Math.min(0.9, 0.25 + ph.food[i] / 6)})`;
        ctx.beginPath();
        ctx.arc(x, y, 4 + Math.min(10, ph.food[i] * 2), 0, 7);
        ctx.fill();
      }
    }
  ctx.restore();
}

// Worn paths from each home to the middle of its town, and to the temple.
function roads(ctx, w) {
  ctx.save();
  ctx.strokeStyle = w.season === "winter" ? "rgba(200,190,175,0.55)" : "rgba(196,164,112,0.55)";
  ctx.lineWidth = 16;
  ctx.setLineDash([]);
  for (const c of w.colonies) {
    const homes = w.houses.filter((h) => h.colony === c.id && !h.ruined && h.built > 0.3);
    if (homes.length < 2) continue;
    const hub = homes.find((h) => h.kind === "temple") ?? homes.find((h) => h.kind === "keep") ?? homes[0];
    ctx.beginPath();
    for (const h of homes) {
      if (h === hub) continue;
      const mx = (h.x + hub.x) / 2 + (h.y - hub.y) * 0.15;
      const my = (h.y + hub.y) / 2;
      ctx.moveTo(h.x, h.y + 12);
      ctx.quadraticCurveTo(mx, my + 12, hub.x, hub.y + 12);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ---------------------------------------------------------------- things

function drawTree(ctx, w, t, now, wind, lights) {
  const s = t.size;
  const L = look(w);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.fillStyle = "rgba(17,17,38,0.14)";
  ctx.beginPath();
  ctx.ellipse(t.x + 10 * s, t.y + 2, 30 * s, 8 * s, 0, 0, 7);
  ctx.fill();
  if (t.dead) {
    ctx.fillStyle = "#3b2f2a";
    roundRect(ctx, t.x - 7 * s, t.y - 18 * s, 14 * s, 18 * s, 3);
    ctx.fill();
    ctx.stroke();
    return;
  }
  const sway = Math.sin(now / 900 + t.x * 0.01) * 2.5 * wind + (wind > 2 ? Math.sin(now / 160 + t.y) * 2 : 0);
  // Trunk.
  ctx.fillStyle = "#a8743f";
  ctx.beginPath();
  ctx.moveTo(t.x - 7 * s, t.y);
  ctx.lineTo(t.x - 5 * s + sway * 0.3, t.y - 44 * s);
  ctx.lineTo(t.x + 5 * s + sway * 0.3, t.y - 44 * s);
  ctx.lineTo(t.x + 7 * s, t.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const blobs = [
    [-17, -54, 20],
    [17, -56, 21],
    [0, -76, 25],
  ];
  if (!L.canopy) {
    // Winter: bare branches with snow on them.
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [dx, dy] of [
      [-22, -66],
      [20, -70],
      [2, -92],
      [-10, -80],
      [12, -58],
    ]) {
      ctx.moveTo(t.x + sway * 0.3, t.y - 40 * s);
      ctx.lineTo(t.x + (dx + sway) * s, t.y + dy * s);
    }
    ctx.strokeStyle = "#6b4a2b";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    for (const [dx, dy] of [
      [-22, -66],
      [20, -70],
      [2, -92],
    ]) {
      ctx.beginPath();
      ctx.ellipse(t.x + (dx + sway) * s, t.y + dy * s, 7 * s, 3.5 * s, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    const fill = t.burn ? "#8a8f5a" : L.canopy[t.id % L.canopy.length];
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (const [dx, dy, r] of blobs) ctx.arc(t.x + (dx + sway) * s, t.y + dy * s, r * s, 0, 7);
    ctx.fill();
    for (const [dx, dy, r] of blobs) {
      ctx.beginPath();
      ctx.arc(t.x + (dx + sway) * s, t.y + dy * s, r * s, 0, 7);
      ctx.stroke();
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (const [dx, dy, r] of blobs) ctx.arc(t.x + (dx + sway) * s, t.y + dy * s, (r - 3) * s, 0, 7);
    ctx.fill();
    // Light from the upper left.
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.arc(t.x + (-6 + sway) * s, t.y - 84 * s, 11 * s, 0, 7);
    ctx.arc(t.x + (-22 + sway) * s, t.y - 60 * s, 8 * s, 0, 7);
    ctx.fill();
    if (w.season === "spring" && !t.burn) {
      ctx.fillStyle = "#ffc2dc";
      for (const [dx, dy] of [
        [-12, -70],
        [8, -86],
        [20, -60],
        [-24, -50],
        [4, -64],
      ]) {
        ctx.beginPath();
        ctx.arc(t.x + (dx + sway) * s, t.y + dy * s, 3.5 * s, 0, 7);
        ctx.fill();
      }
    }
  }
  ctx.fillStyle = "#ff4b3e";
  ctx.lineWidth = 2;
  const spots = [
    [-18, -50],
    [14, -60],
    [-2, -78],
    [20, -46],
  ];
  if (L.canopy)
    for (let i = 0; i < t.fruit; i++) {
      ctx.beginPath();
      ctx.arc(t.x + (spots[i][0] + sway) * s, t.y + spots[i][1] * s, 5 * s, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
  if (t.burn) {
    flames(ctx, t.x, t.y - 50 * s, 1.1 * s, now);
    lights.push({ x: t.x, y: t.y - 50, r: 160, c: "255,150,60", k: 1 });
  }
}

function drawRock(ctx, r) {
  ctx.lineWidth = 3;
  ctx.fillStyle = "rgba(17,17,38,0.16)";
  ctx.beginPath();
  ctx.ellipse(r.x + 8, r.y + 2, r.r * 1.15, r.r * 0.32, 0, 0, 7);
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
  ctx.fillStyle = "#d6d8e2";
  ctx.beginPath();
  ctx.moveTo(r.x - r.r * 0.75, r.y - r.r * 0.75);
  ctx.lineTo(r.x - r.r * 0.1, r.y - r.r * 1.12);
  ctx.lineTo(r.x - r.r * 0.2, r.y - r.r * 0.6);
  ctx.closePath();
  ctx.fill();
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

// A little flag on a pole, rippling in the wind.
function flag(ctx, x, y, len, color, now, symbol, size = 1) {
  ctx.save();
  ctx.lineWidth = 2.5 * size;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - len);
  ctx.stroke();
  const fw = 30 * size;
  const fh = 20 * size;
  const top = y - len;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, top);
  for (let i = 0; i <= 6; i++) ctx.lineTo(x + (fw * i) / 6, top + Math.sin(now / 180 + i * 0.9 + x) * 3 * size * (i / 6));
  for (let i = 6; i >= 0; i--) ctx.lineTo(x + (fw * i) / 6, top + fh + Math.sin(now / 180 + i * 0.9 + x) * 3 * size * (i / 6));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (symbol) {
    ctx.font = `${12 * size}px ${EMOJI}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol, x + fw * 0.5, top + fh / 2 + Math.sin(now / 180 + 3 + x) * 1.5 * size);
  }
  ctx.restore();
}

function hpBar(ctx, x, y, frac) {
  ctx.lineWidth = 2;
  ctx.fillStyle = "#fff";
  roundRect(ctx, x - 26, y, 52, 7, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = frac > 0.5 ? "#3ddc84" : "#ff4b3e";
  roundRect(ctx, x - 25, y + 1, 50 * Math.max(0, frac), 5, 2);
  ctx.fill();
}

function drawBuilding(ctx, w, h, now, dark, lights) {
  const col = h.colony && colonyOf(w, h.colony);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  const big = h.kind !== "house";
  if (h.ruined) {
    ctx.fillStyle = "#8d7b6a";
    const k = big ? 1.8 : 1;
    for (const [dx, dy, r] of [
      [-22, -6, 14],
      [4, -10, 17],
      [26, -4, 12],
      [-6, 2, 11],
    ]) {
      ctx.beginPath();
      ctx.moveTo(h.x + (dx - r) * k, h.y + dy + 6);
      ctx.lineTo(h.x + (dx - r * 0.3) * k, h.y + (dy - r) * k);
      ctx.lineTo(h.x + (dx + r) * k, h.y + dy + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Smoke still rising for a while.
    if (w.day - h.ruinedAt < 1) smoke(ctx, h.x, h.y - 20, now, 0.8);
    return;
  }
  ctx.fillStyle = "rgba(17,17,38,0.16)";
  ctx.beginPath();
  ctx.ellipse(h.x + 12, h.y + 3, big ? 95 : 54, big ? 18 : 12, 0, 0, 7);
  ctx.fill();
  if (h.built < 1) return scaffold(ctx, h, big);
  if (h.kind === "temple") temple(ctx, w, h, now);
  else if (h.kind === "keep") keep(ctx, w, h, col, now);
  else if (h.kind === "house" && h.level >= 3) modernHouse(ctx, w, h, col, now, dark, lights);
  else if (h.kind === "house") house(ctx, w, h, col, now);
  else drawCivic(ctx, w, h, now, dark, lights);
  const maxHp = h.maxHp ?? 100;
  if (h.hp < maxHp) hpBar(ctx, h.x, h.y + 10, h.hp / maxHp);
  if (h.fire > 0) {
    flames(ctx, h.x, h.y - (big ? 60 : 30), (0.8 + h.fire * 1.2) * (big ? 1.5 : 1), now);
    lights.push({ x: h.x, y: h.y - 40, r: 220, c: "255,140,50", k: 1 });
  }
  // Warm windows at night.
  if (dark > 0.1) {
    if (h.kind === "house" && h.level < 3) lights.push({ x: h.x + 22, y: h.y - 30, r: 70, c: "255,200,110", k: 0.9 });
    else if (h.kind === "temple" || h.kind === "keep") lights.push({ x: h.x, y: h.y - 50, r: 170, c: "255,210,130", k: 1 });
  }
}

function scaffold(ctx, h, big) {
  const bw = big ? 150 : 78;
  const bh = big ? 90 : 48;
  ctx.fillStyle = "#e9dcc4";
  const hh = bh * h.built;
  roundRect(ctx, h.x - bw / 2, h.y - hh, bw, hh, 4);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#8a5a35";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = h.x - bw / 2; x <= h.x + bw / 2 + 1; x += bw / 3) {
    ctx.moveTo(x, h.y);
    ctx.lineTo(x, h.y - bh - 10);
  }
  for (let y = h.y - 16; y > h.y - bh - 10; y -= 22) {
    ctx.moveTo(h.x - bw / 2 - 4, y);
    ctx.lineTo(h.x + bw / 2 + 4, y);
  }
  ctx.moveTo(h.x - bw / 2, h.y);
  ctx.lineTo(h.x - bw / 6, h.y - bh);
  ctx.stroke();
  ctx.strokeStyle = INK;
}

function house(ctx, w, h, col, now) {
  const bw = 80;
  const bh = 50;
  const stone = h.level >= 2;
  const snow = w.season === "winter";
  // Walls.
  ctx.fillStyle = stone ? "#dcd6ca" : "#e7c796";
  roundRect(ctx, h.x - bw / 2, h.y - bh, bw, bh, 4);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#11112644";
  ctx.beginPath();
  if (stone)
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 5; c++) {
        const y = h.y - bh + 6 + r * 11;
        const x = h.x - bw / 2 + 4 + c * 16 + (r % 2) * 8;
        if (x + 14 < h.x + bw / 2) ctx.rect(x, y, 14, 9);
      }
  else for (let x = h.x - bw / 2 + 10; x < h.x + bw / 2; x += 10) ctx.moveTo(x, h.y - bh + 3), ctx.lineTo(x, h.y - 2);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  // Chimney with smoke, on stone houses.
  if (stone) {
    ctx.fillStyle = "#b9b1a4";
    roundRect(ctx, h.x + 18, h.y - bh - 36, 12, 26, 2);
    ctx.fill();
    ctx.stroke();
    smoke(ctx, h.x + 24, h.y - bh - 40, now, 0.5);
  }
  // Roof: thatch or tiles.
  ctx.fillStyle = stone ? (col?.color ?? "#b5543c") : "#d9a441";
  ctx.beginPath();
  ctx.moveTo(h.x - bw / 2 - 12, h.y - bh + 4);
  ctx.lineTo(h.x, h.y - bh - 40);
  ctx.lineTo(h.x + bw / 2 + 12, h.y - bh + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#11112655";
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const k = i / 4;
    ctx.moveTo(h.x - (bw / 2 + 12) * (1 - k), h.y - bh + 4 - 44 * k);
    ctx.lineTo(h.x + (bw / 2 + 12) * (1 - k), h.y - bh + 4 - 44 * k);
  }
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  if (snow) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(h.x - bw / 2 - 8, h.y - bh - 2);
    ctx.lineTo(h.x, h.y - bh - 40);
    ctx.lineTo(h.x + bw / 2 + 8, h.y - bh - 2);
    ctx.lineTo(h.x + 20, h.y - bh - 22);
    ctx.lineTo(h.x - 20, h.y - bh - 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Door and window.
  ctx.fillStyle = "#5a3b24";
  roundRect(ctx, h.x - 9, h.y - 27, 18, 27, [9, 9, 0, 0]);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#8fd0ff";
  roundRect(ctx, h.x + 16, h.y - 38, 15, 13, 2);
  ctx.fill();
  ctx.stroke();
  if (col) flag(ctx, h.x, h.y - bh - 40, 22, col.color, now, null, 0.7);
}

function temple(ctx, w, h, now) {
  const r = religionOf(w, h.religion);
  const color = r?.color ?? "#a0a0b0";
  const x = h.x;
  const y = h.y;
  // Steps.
  ctx.fillStyle = "#e9e1d0";
  for (let i = 0; i < 3; i++) {
    roundRect(ctx, x - 80 + i * 6, y - 8 - i * 8, 160 - i * 12, 10, 2);
    ctx.fill();
    ctx.stroke();
  }
  // Hall with columns.
  ctx.fillStyle = "#f6f0e2";
  roundRect(ctx, x - 58, y - 90, 116, 66, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e3d9c3";
  for (let i = 0; i < 5; i++) {
    roundRect(ctx, x - 54 + i * 25, y - 88, 10, 62, 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = "#3b2f4a";
  roundRect(ctx, x - 12, y - 58, 24, 34, [12, 12, 0, 0]);
  ctx.fill();
  ctx.stroke();
  // Dome and spire.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 66, y - 90);
  ctx.lineTo(x + 66, y - 90);
  ctx.lineTo(x + 50, y - 100);
  ctx.lineTo(x - 50, y - 100);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - 100, 38, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.arc(x - 12, y - 118, 10, 0, 7);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x, y - 138);
  ctx.lineTo(x, y - 158);
  ctx.stroke();
  if (r) {
    ctx.font = `26px ${EMOJI}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(r.symbol, x, y - 170);
  }
}

function keep(ctx, w, h, col, now) {
  const x = h.x;
  const y = h.y;
  const stone = "#cfc8ba";
  const crenel = (x0, top, width) => {
    ctx.fillStyle = stone;
    for (let i = 0; i < width / 14; i++) {
      roundRect(ctx, x0 + i * 14, top - 10, 9, 12, 1);
      ctx.fill();
      ctx.stroke();
    }
  };
  // Wall between towers.
  ctx.fillStyle = stone;
  roundRect(ctx, x - 70, y - 70, 140, 70, 3);
  ctx.fill();
  ctx.stroke();
  crenel(x - 66, y - 70, 132);
  // Towers.
  for (const dx of [-70, 70]) {
    ctx.fillStyle = "#c2baa9";
    roundRect(ctx, x + dx - 20, y - 120, 40, 120, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col?.color ?? "#8a5a35";
    ctx.beginPath();
    ctx.moveTo(x + dx - 26, y - 118);
    ctx.lineTo(x + dx, y - 160);
    ctx.lineTo(x + dx + 26, y - 118);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    roundRect(ctx, x + dx - 3, y - 100, 6, 16, 3);
    ctx.fill();
    flag(ctx, x + dx, y - 160, 26, col?.color ?? "#fff", now, null, 0.8);
  }
  // Stone lines and the gate.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#11112644";
  ctx.beginPath();
  for (let r = 0; r < 5; r++) {
    const yy = y - 60 + r * 12;
    ctx.moveTo(x - 50, yy);
    ctx.lineTo(x + 50, yy);
  }
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.fillStyle = "#3b2f2a";
  roundRect(ctx, x - 18, y - 44, 36, 44, [18, 18, 0, 0]);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = -12; i <= 12; i += 8) {
    ctx.moveTo(x + i, y - 40);
    ctx.lineTo(x + i, y);
  }
  ctx.stroke();
  ctx.lineWidth = 3;
}

// The holy city's shrine: standing stones, an obelisk with a glowing gem,
// and the flag of whoever holds it.
function drawShrine(ctx, w, now, lights) {
  const h = w.holy;
  const owner = religionOf(w, h.owner);
  const contender = religionOf(w, h.contender);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = h.x + Math.cos(a) * 100;
    const y = h.y + Math.sin(a) * 42;
    if (y > h.y) continue; // front stones are drawn by people-order; keep it simple: back half only
    ctx.fillStyle = "#b9b6c4";
    roundRect(ctx, x - 9, y - 38, 18, 38, [8, 8, 2, 2]);
    ctx.fill();
    ctx.stroke();
  }
  // Obelisk.
  ctx.fillStyle = "#e6e0d2";
  ctx.beginPath();
  ctx.moveTo(h.x - 18, h.y);
  ctx.lineTo(h.x - 11, h.y - 120);
  ctx.lineTo(h.x, h.y - 138);
  ctx.lineTo(h.x + 11, h.y - 120);
  ctx.lineTo(h.x + 18, h.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const glow = owner?.color ?? "#ffffff";
  const pulse = 1 + 0.15 * Math.sin(now / 400);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(h.x, h.y - 150, 11 * pulse, 0, 7);
  ctx.fill();
  ctx.stroke();
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(glow.slice(i, i + 2), 16));
  lights.push({ x: h.x, y: h.y - 150, r: 220, c: `${r},${g},${b}`, k: 1 });
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.1 * Math.sin(now / 400);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(h.x, h.y - 150, 26 * pulse, 0, 7);
  ctx.fill();
  ctx.restore();
  if (owner) flag(ctx, h.x + 50, h.y + 4, 110, owner.color, now, owner.symbol, 1.5);
  // A contest in progress.
  if (contender && h.progress > 0) {
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(h.x, h.y - 150, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = contender.color;
    ctx.beginPath();
    ctx.arc(h.x, h.y - 150, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * h.progress);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
  }
}

function smoke(ctx, x, y, now, s) {
  ctx.save();
  ctx.fillStyle = "rgba(90,90,100,0.28)";
  for (let i = 0; i < 4; i++) {
    const k = (now / 2200 + i / 4) % 1;
    ctx.beginPath();
    ctx.arc(x + Math.sin(k * 5 + i) * 8 + k * 16, y - k * 70 * s * 2, (5 + k * 12) * s * 1.6, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

function flames(ctx, x, y, s, now) {
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
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
  // Embers.
  ctx.fillStyle = "#ffb13d";
  for (let i = 0; i < 5; i++) {
    const k = (now / 900 + i / 5) % 1;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath();
    ctx.arc(x + Math.sin(i * 7 + k * 6) * 24 * s, y - 20 * s - k * 90 * s, 2.5, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  smoke(ctx, x, y - 40 * s, now, s);
}

function drawCoin(ctx, c) {
  const y = c.y - c.z;
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  if (c.z <= 0) {
    ctx.fillStyle = "rgba(17,17,38,0.14)";
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

function drawArrows(ctx, w) {
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  for (const a of w.arrows) {
    const k = Math.min(1, (w.t - a.t0) / a.dur);
    const arc = a.bullet ? 0 : Math.hypot(a.x1 - a.x0, a.y1 - a.y0) * 0.35;
    const x = a.x0 + (a.x1 - a.x0) * k;
    const y = a.y0 + (a.y1 - a.y0) * k - Math.sin(k * Math.PI) * arc;
    const k2 = Math.min(1, k + 0.05);
    const x2 = a.x0 + (a.x1 - a.x0) * k2;
    const y2 = a.y0 + (a.y1 - a.y0) * k2 - Math.sin(k2 * Math.PI) * arc;
    const ang = Math.atan2(y2 - y, x2 - x);
    if (a.bullet) {
      drawBullet(ctx, a, x, y, ang);
      continue;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(10, 0);
    ctx.stroke();
    ctx.fillStyle = "#ddd";
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(6, -4);
    ctx.lineTo(6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- people

export function moodOf(w, p) {
  const k = p.task;
  if (!p.alive) return "dead";
  if (k?.type === "sleep" && k.asleep) return "sleep";
  if (p.carried || p.z > 0 || p.stun > 0 || k?.type === "flee") return "scared";
  if (k?.type === "fight" || k?.type === "raid" || k?.type === "shoot") return "angry";
  if (p.sick) return "worried";
  const h = happiness(w, p);
  if (k?.type === "court" || (k?.type === "chat" && k.target === p.spouse)) return "love";
  if (h < -35) return "sad";
  if (h > 25 || k?.type === "pilgrim") return "happy";
  return "calm";
}

function drawPerson(ctx, w, p, now, selected, dark, lights) {
  const h = personHeight(p);
  const wd = h * (120 / 160);
  const k = p.task;
  const mood = moodOf(w, p);
  const moving = Math.hypot(p.vx, p.vy) > 12;
  let pose = moving ? (Math.sin(p.phase) > 0 ? "a" : "b") : "stand";
  let bob = moving ? Math.abs(Math.sin(p.phase)) * h * 0.04 : 0;
  if (k?.working && !k.fishing) {
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
  const faith = p.religion && religionOf(w, p.religion);
  const alpha = p.alive ? 1 : Math.max(0, 1 - (w.t - p.diedAt) / 20);
  const wet = p.wet && p.z <= 0 && p.alive;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (!wet) {
    ctx.fillStyle = col ? col.color + "99" : "rgba(17,17,38,0.2)";
    ctx.beginPath();
    ctx.ellipse(p.x + 4, p.y, h * 0.3, h * 0.08, 0, 0, 7);
    ctx.fill();
  }
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
  if (wet) {
    // Wading: the water hides the legs.
    ctx.save();
    ctx.beginPath();
    ctx.rect(-wd, -h * 1.8, wd * 2, h * 1.8 - h * 0.3);
    ctx.clip();
  }
  // A banner behind the bearer.
  if (p.role === "bearer" && p.alive) bannerPole(ctx, h, faith, col, now);
  if (img) ctx.drawImage(img, -wd / 2, -h * (150 / 160), wd, h);
  if (p.alive && !lying) gear(ctx, p, h, k, faith, col, now, weaponLevel(w, p));
  if (wet) ctx.restore();
  ctx.restore();

  if (wet) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    const r = h * 0.32 + Math.sin(now / 200 + p.id) * 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - h * 0.3, r, r * 0.3, 0, 0, 7);
    ctx.stroke();
    ctx.strokeStyle = INK;
  }
  if (!p.alive) return;
  const headTop = p.y - p.z - bob - h * 0.92;
  if (p.prophet) {
    // A halo.
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(p.x + 2 * p.facing, headTop - 6, h * 0.17, h * 0.05, 0, 0, 7);
    ctx.stroke();
    ctx.strokeStyle = INK;
    lights.push({ x: p.x, y: headTop, r: 60, c: "255,230,120", k: 0.8 });
  }
  if (col && col.leader === p.id && !p.army) crown(ctx, p.x + 4 * p.facing, headTop - (p.prophet ? 10 : 2), h * 0.2);
  // Soldiers carry torches at night.
  if (p.army && dark > 0.25 && p.id % 3 === 0) lights.push({ x: p.x, y: p.y - h * 0.6, r: 80, c: "255,170,70", k: 0.6 });
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
    ctx.font = `${h * 0.28}px ${EMOJI}`;
    ctx.textAlign = "center";
    ctx.fillText(faith?.symbol ?? "🙏", p.x, headTop - 8);
  }
}

// Helmets, shields, swords, bows, fishing rods — in the figure's own frame
// (already flipped to face the right way).
function gear(ctx, p, h, k, faith, col, now, lvl = 0) {
  const headX = 0.033 * h * 0.75;
  const headY = -0.669 * h;
  const R = 0.175 * h;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  if (k?.fishing) {
    ctx.strokeStyle = "#6b4a2b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0.18 * h, -0.36 * h);
    ctx.lineTo(0.78 * h, -0.95 * h);
    ctx.stroke();
    ctx.strokeStyle = "rgba(17,17,38,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0.78 * h, -0.95 * h);
    ctx.lineTo(0.95 * h, -0.02 * h + Math.sin(now / 300) * 2);
    ctx.stroke();
    ctx.fillStyle = "#ff4b3e";
    ctx.beginPath();
    ctx.arc(0.95 * h, -0.02 * h + Math.sin(now / 300) * 2, 3, 0, 7);
    ctx.fill();
  }
  if (!p.army) return;
  // Helmet: bronze, iron, then a soldier's steel helmet.
  ctx.fillStyle = lvl >= 4 ? "#5b7a45" : lvl === 1 ? "#d8a15a" : "#a9b1c2";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(headX, headY, R * 1.08, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (p.role === "commander") {
    ctx.fillStyle = "#ff4b3e";
    ctx.beginPath();
    ctx.ellipse(headX - R * 0.2, headY - R * 1.15, R * 0.55, R * 0.28, -0.4, 0, 7);
    ctx.fill();
    ctx.stroke();
  }
  const color = faith?.color ?? col?.color ?? "#fff";
  // Guns: a musket, later a rifle.
  if (lvl >= 3 && p.role !== "bearer") {
    const aim = k?.type === "shoot" ? -0.12 : -0.9;
    ctx.save();
    ctx.translate(0.12 * h, -0.4 * h);
    ctx.rotate(aim);
    ctx.fillStyle = lvl >= 4 ? "#2b2f36" : "#6b4a2b";
    ctx.lineWidth = 2;
    roundRect(ctx, -0.12 * h, -3, 0.24 * h, 7, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#3b3f47";
    roundRect(ctx, 0.1 * h, -2, 0.42 * h, 4, 2);
    ctx.fill();
    ctx.stroke();
    if (k?.type === "shoot" && (k.aim ?? 1) > 1.25) {
      ctx.fillStyle = "#ffd84d";
      ctx.beginPath();
      ctx.moveTo(0.52 * h, -6);
      ctx.lineTo(0.66 * h, 0);
      ctx.lineTo(0.52 * h, 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  if (p.role === "archer") {
    // Bow and quiver.
    ctx.strokeStyle = "#6b4a2b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0.2 * h, -0.42 * h, 0.2 * h, -Math.PI / 2.2, Math.PI / 2.2);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const draw = k?.type === "shoot" ? Math.max(0, Math.sin(now / 200)) * 0.08 * h : 0;
    ctx.moveTo(0.2 * h + Math.cos(Math.PI / 2.2) * 0.2 * h, -0.42 * h - Math.sin(Math.PI / 2.2) * 0.2 * h);
    ctx.lineTo(0.2 * h - draw, -0.42 * h);
    ctx.lineTo(0.2 * h + Math.cos(Math.PI / 2.2) * 0.2 * h, -0.42 * h + Math.sin(Math.PI / 2.2) * 0.2 * h);
    ctx.stroke();
    ctx.fillStyle = "#8a5a35";
    ctx.lineWidth = 2;
    roundRect(ctx, -0.3 * h, -0.6 * h, 0.1 * h, 0.3 * h, 3);
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (p.role === "bearer") return;
  // Sword, swinging in a fight.
  const swing = k?.type === "fight" && k.started ? Math.sin(now / 90) * 0.9 : 0;
  ctx.save();
  ctx.translate(0.2 * h, -0.34 * h);
  ctx.rotate(-0.5 + swing);
  ctx.fillStyle = lvl === 1 ? "#e0a860" : lvl === 0 ? "#9a6b3f" : "#e6e9f0";
  ctx.lineWidth = 2;
  const blade = lvl >= 2 ? 0.5 : 0.42;
  ctx.beginPath();
  ctx.moveTo(-2.5, 0);
  ctx.lineTo(-2.5, -blade * h);
  ctx.lineTo(0, -(blade + 0.05) * h);
  ctx.lineTo(2.5, -blade * h);
  ctx.lineTo(2.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#8a5a35";
  roundRect(ctx, -8, -3, 16, 5, 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Shield with the faith's sign.
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const sx = 0.12 * h;
  const sy = -0.36 * h;
  const sr = 0.15 * h;
  ctx.moveTo(sx - sr, sy - sr);
  ctx.lineTo(sx + sr, sy - sr);
  ctx.quadraticCurveTo(sx + sr, sy + sr * 0.6, sx, sy + sr * 1.3);
  ctx.quadraticCurveTo(sx - sr, sy + sr * 0.6, sx - sr, sy - sr);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (faith) {
    ctx.save();
    ctx.scale(p.facing, 1); // keep the sign readable
    ctx.font = `${sr * 1.1}px ${EMOJI}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(faith.symbol, sx * p.facing, sy);
    ctx.restore();
  }
}

function bannerPole(ctx, h, faith, col, now) {
  const color = faith?.color ?? col?.color ?? "#fff";
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#6b4a2b";
  ctx.beginPath();
  ctx.moveTo(-0.22 * h, -0.2 * h);
  ctx.lineTo(-0.22 * h, -1.9 * h);
  ctx.stroke();
  const x0 = -0.22 * h;
  const top = -1.88 * h;
  const fw = 0.9 * h;
  const fh = 0.6 * h;
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x0, top);
  for (let i = 0; i <= 8; i++) ctx.lineTo(x0 - (fw * i) / 8, top + Math.sin(now / 160 + i * 0.8) * 4 * (i / 8));
  for (let i = 8; i >= 0; i--) ctx.lineTo(x0 - (fw * i) / 8 + (i === 8 ? 0 : 0), top + fh + Math.sin(now / 160 + i * 0.8) * 4 * (i / 8) - (i === 8 ? fh * 0.3 : 0));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (faith) {
    ctx.font = `${0.32 * h}px ${EMOJI}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(faith.symbol, x0 - fw * 0.45, top + fh * 0.45);
  }
  ctx.restore();
}

function crown(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = "#ffc53d";
  ctx.strokeStyle = INK;
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
  if (e.type === "stuck") {
    // An arrow in the ground.
    ctx.globalAlpha = Math.min(1, fade * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x - Math.cos(e.angle) * 14, e.y - 12);
    ctx.stroke();
    ctx.globalAlpha = 1;
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

function skyEffect(ctx, w, e, lights) {
  const age = w.t - e.t0;
  const k = age / e.dur;
  const fade = 1 - k;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.textAlign = "center";
  switch (e.type) {
    case "bolt": {
      ctx.globalAlpha = fade;
      let seed = Math.floor(e.t0 * 1000) || 1;
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
      lights.push({ x: e.x, y: e.y - 100, r: 500, c: "220,230,255", k: 2 * fade });
      break;
    }
    case "nuke":
      drawNuke(ctx, w, e, lights);
      break;
    case "beam": {
      // A column of light from the sky.
      const a = Math.min(1, age * 3) * fade;
      const grad = ctx.createLinearGradient(e.x - 70, 0, e.x + 70, 0);
      grad.addColorStop(0, "rgba(255,245,190,0)");
      grad.addColorStop(0.5, `rgba(255,245,190,${0.8 * a})`);
      grad.addColorStop(1, "rgba(255,245,190,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(e.x - 70, e.y - 1400, 140, 1400);
      ctx.globalAlpha = a;
      ctx.font = `30px ${EMOJI}`;
      for (let i = 0; i < 6; i++) ctx.fillText("🕊️", e.x + Math.sin(age * 2 + i) * 60, e.y - 60 - ((age * 80 + i * 70) % 400));
      lights.push({ x: e.x, y: e.y - 60, r: 380, c: "255,245,200", k: 2 * a });
      break;
    }
    case "discord": {
      ctx.globalAlpha = fade * 0.55;
      ctx.fillStyle = "#6d28d9";
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63 + age * 2;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(a) * (60 + age * 60), e.y - 40 + Math.sin(a) * 30 - age * 20, 26, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = fade;
      ctx.font = `40px ${EMOJI}`;
      ctx.fillText("😈", e.x, e.y - 90 - age * 30);
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
      lights.push({ x, y, r: 260, c: "255,150,60", k: 1.5 });
      break;
    }
    case "boom": {
      ctx.globalAlpha = fade;
      ctx.fillStyle = "#ffb13d";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - 40, 60 + k * 200, 40 + k * 130, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff3b0";
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - 40, 30 + k * 100, 20 + k * 60, 0, 0, 7);
      ctx.fill();
      lights.push({ x: e.x, y: e.y - 40, r: 600, c: "255,170,80", k: 2 * fade });
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
        const y = e.y - 330 + ((age * 700 + i * 53) % 420);
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
      ctx.font = `26px ${EMOJI}`;
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
        lights.push({ x: e.x, y: e.y - 30, r: 220, c: "255,230,140", k: fade });
      }
      break;
    case "dust":
      ctx.globalAlpha = fade * 0.7;
      ctx.fillStyle = "#d8cfc4";
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
      ctx.font = `${e.big ? 44 : 26}px ${EMOJI}`;
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
      ctx.font = `28px ${EMOJI}`;
      ctx.fillText("💥", e.x, e.y);
      break;
    case "splash":
      ctx.globalAlpha = fade;
      ctx.font = `18px ${EMOJI}`;
      ctx.fillText("💧", e.x, e.y - k * 20);
      break;
    case "spark":
      flames(ctx, e.x, e.y, 0.6 * fade, performance.now());
      break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- minimap

export function renderMini(ctx, w, cam, vw, vh, mw, mh) {
  const sx = mw / w.W;
  const sy = mh / w.H;
  ctx.clearRect(0, 0, mw, mh);
  ctx.drawImage(landImage(w), 0, 0, mw, mh);
  const h = w.holy;
  const owner = religionOf(w, h.owner);
  ctx.fillStyle = owner?.color ?? "#fff";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(h.x * sx, h.y * sy, 5, 0, 7);
  ctx.fill();
  ctx.stroke();
  for (const b of w.houses) {
    const c = b.colony && colonyOf(w, b.colony);
    ctx.fillStyle = b.ruined ? "#8d7b6a" : b.fire ? "#ff7a1a" : (c?.color ?? "#c98b5a");
    const s = b.kind === "house" ? 4 : 7;
    ctx.fillRect(b.x * sx - s / 2, b.y * sy - s / 2, s, s * 0.8);
  }
  for (const p of w.people) {
    if (!p.alive) continue;
    const r = p.religion && religionOf(w, p.religion);
    ctx.fillStyle = r?.color ?? INK;
    ctx.fillRect(p.x * sx - 1.2, p.y * sy - 1.2, 2.6, 2.6);
  }
  // Armies: a flag where they march.
  for (const a of w.armies) {
    const r = religionOf(w, a.religion);
    ctx.fillStyle = r?.color ?? "#fff";
    ctx.beginPath();
    ctx.moveTo(a.x * sx, a.y * sy);
    ctx.lineTo(a.x * sx, a.y * sy - 12);
    ctx.lineTo(a.x * sx + 9, a.y * sy - 9);
    ctx.lineTo(a.x * sx, a.y * sy - 6);
    ctx.fill();
    ctx.stroke();
  }
  const hw = vw / cam.zoom / 2;
  const hh = vh / cam.zoom / 2;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeRect((cam.x - hw) * sx, (cam.y - hh) * sy, hw * 2 * sx, hh * 2 * sy);
}

export { byId, houseOf };
