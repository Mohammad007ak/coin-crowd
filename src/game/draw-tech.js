// Drawings for what progress brings: farms, walls, libraries, universities,
// markets, factories, watchtowers, skyscrapers, missile silos, the UN — and
// missiles, bullets and the mushroom cloud.
import { INK } from "../crowd/Figure.jsx";
import { colonyOf } from "./world.js";
import { knows } from "./tech.js";

const EMOJI = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

function rr(ctx, x, y, w, h, r = 3) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function box(ctx, x, y, w, h, fill, r = 3) {
  ctx.fillStyle = fill;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}
function emoji(ctx, text, x, y, size) {
  ctx.save();
  ctx.font = `${size}px ${EMOJI}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}
function smokePuffs(ctx, x, y, now, s = 1, dark = false) {
  ctx.save();
  ctx.fillStyle = dark ? "rgba(60,60,70,0.35)" : "rgba(90,90,100,0.28)";
  for (let i = 0; i < 4; i++) {
    const k = (now / 2000 + i / 4) % 1;
    ctx.beginPath();
    ctx.arc(x + Math.sin(k * 5 + i) * 8 + k * 20, y - k * 120 * s, (6 + k * 16) * s, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}
function waveFlag(ctx, x, y, len, color, now, symbol, size = 1) {
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
  if (symbol) emoji(ctx, symbol, x + fw / 2, top + fh / 2, 12 * size);
  ctx.restore();
}

// ---------------------------------------------------------------- flat things

// Farms and town walls lie on the ground: drawn under everyone.
export function drawFlat(ctx, w, b, now) {
  if (b.kind === "farm") return farm(ctx, w, b);
  if (b.kind === "wall") return wall(ctx, w, b, now);
}
export const isFlat = (b) => b.kind === "farm" || b.kind === "wall";

function farm(ctx, w, b) {
  const W_ = 150;
  const H_ = 80;
  const x0 = b.x - W_ / 2;
  const y0 = b.y - H_ / 2;
  const winter = w.season === "winter";
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.fillStyle = b.ruined ? "#5a4636" : winter ? "#e9e4dc" : "#b88a52";
  rr(ctx, x0, y0, W_, H_, 6);
  ctx.fill();
  ctx.stroke();
  if (b.built < 1) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#fff";
    rr(ctx, x0, y0, W_ * (1 - b.built), H_, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  // Furrows and crops.
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#8a6238";
  for (let i = 1; i < 6; i++) {
    const y = y0 + (H_ * i) / 6;
    ctx.beginPath();
    ctx.moveTo(x0 + 8, y);
    ctx.lineTo(x0 + W_ - 8, y);
    ctx.stroke();
  }
  if (b.ruined) return;
  const ripe = Math.min(1, (b.crop ?? 0) / 8);
  const color = w.season === "autumn" ? "#e8b93c" : winter ? "#c9d6c0" : ripe > 0.6 ? "#d9c23c" : "#5cc46e";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  for (let r = 1; r < 6; r++)
    for (let c = 0; c < 9; c++) {
      const x = x0 + 14 + c * 15;
      const y = y0 + (H_ * r) / 6;
      const hgt = 4 + ripe * 10;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y - hgt);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 3, y - hgt);
      ctx.stroke();
    }
  // Fence posts.
  ctx.fillStyle = "#8a5a35";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 6; i++) {
    rr(ctx, x0 - 3 + (W_ * i) / 6, y0 + H_ - 6, 6, 12, 2);
    ctx.fill();
    ctx.stroke();
  }
}

function wall(ctx, w, b, now) {
  const rx = b.r;
  const ry = b.r * 0.62;
  const col = colonyOf(w, b.colony);
  const part = b.ruined ? 0.4 : b.built;
  ctx.save();
  ctx.lineCap = "butt";
  // The wall as a thick stone band, with a darker inner edge.
  const band = (width, color, dash = []) => {
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * part);
    ctx.stroke();
  };
  band(22, INK);
  band(16, b.ruined ? "#8d7b6a" : "#cfc8ba");
  band(4, "#a79f90", [10, 8]);
  ctx.setLineDash([]);
  // Gatehouses at the four sides, with the tribe's flag.
  if (part >= 1 && !b.ruined)
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const x = b.x + Math.cos(a) * rx;
      const y = b.y + Math.sin(a) * ry;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      box(ctx, x - 16, y - 34, 32, 36, "#c2baa9");
      for (let i = 0; i < 3; i++) box(ctx, x - 16 + i * 12, y - 42, 8, 9, "#c2baa9", 1);
      ctx.fillStyle = "#3b2f2a";
      rr(ctx, x - 7, y - 18, 14, 20, [7, 7, 0, 0]);
      ctx.fill();
      if (col && a === Math.PI * 1.5) waveFlag(ctx, x, y - 42, 24, col.color, now, null, 0.7);
    }
  ctx.restore();
}

// ---------------------------------------------------------------- buildings

// Returns true if it drew the building.
export function drawCivic(ctx, w, b, now, dark, lights) {
  const col = b.colony && colonyOf(w, b.colony);
  const x = b.x;
  const y = b.y;
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  switch (b.kind) {
    case "library": {
      box(ctx, x - 50, y - 60, 100, 60, "#efe6d2");
      for (let i = 0; i < 4; i++) box(ctx, x - 42 + i * 24, y - 56, 9, 54, "#e0d4ba", 2);
      ctx.fillStyle = "#6b4a8a";
      ctx.beginPath();
      ctx.moveTo(x - 58, y - 60);
      ctx.lineTo(x, y - 92);
      ctx.lineTo(x + 58, y - 60);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      emoji(ctx, "📚", x, y - 72, 18);
      if (dark > 0.1) lights.push({ x, y: y - 30, r: 120, c: "255,210,130", k: 0.8 });
      return true;
    }
    case "university": {
      box(ctx, x - 80, y - 70, 160, 70, "#e9dfcf");
      for (let i = 0; i < 6; i++) box(ctx, x - 72 + i * 28, y - 58, 14, 18, dark > 0.1 ? "#ffd98a" : "#8fd0ff", 2);
      ctx.fillStyle = "#3b2f4a";
      rr(ctx, x - 14, y - 34, 28, 34, [14, 14, 0, 0]);
      ctx.fill();
      ctx.stroke();
      // Clock tower.
      box(ctx, x - 20, y - 150, 40, 82, "#d9ccb4");
      ctx.fillStyle = "#b5543c";
      ctx.beginPath();
      ctx.moveTo(x - 26, y - 150);
      ctx.lineTo(x, y - 184);
      ctx.lineTo(x + 26, y - 150);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y - 124, 13, 0, 7);
      ctx.fill();
      ctx.stroke();
      const t = (w.t % 30) / 30;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 124);
      ctx.lineTo(x + Math.sin(t * Math.PI * 2) * 9, y - 124 - Math.cos(t * Math.PI * 2) * 9);
      ctx.moveTo(x, y - 124);
      ctx.lineTo(x + Math.sin(t * Math.PI * 24) * 6, y - 124 - Math.cos(t * Math.PI * 24) * 6);
      ctx.stroke();
      emoji(ctx, "🎓", x + 58, y - 84, 20);
      if (dark > 0.1) lights.push({ x, y: y - 60, r: 200, c: "255,210,130", k: 1 });
      return true;
    }
    case "market": {
      const colors = ["#ff4b3e", "#0a6cff", "#16b364"];
      for (let i = 0; i < 3; i++) {
        const sx = x - 70 + i * 50;
        box(ctx, sx, y - 26, 40, 26, "#c98b5a", 2);
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.moveTo(sx - 6, y - 26);
        ctx.lineTo(sx + 4, y - 50);
        ctx.lineTo(sx + 36, y - 50);
        ctx.lineTo(sx + 46, y - 26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fff";
        for (let s = 0; s < 3; s++) {
          ctx.beginPath();
          ctx.moveTo(sx + 2 + s * 14, y - 26);
          ctx.lineTo(sx + 9 + s * 11, y - 50);
          ctx.lineTo(sx + 14 + s * 11, y - 50);
          ctx.lineTo(sx + 9 + s * 14, y - 26);
          ctx.closePath();
          ctx.fill();
        }
        emoji(ctx, ["🍎", "🧺", "🪙"][i], sx + 20, y - 13, 13);
      }
      return true;
    }
    case "factory": {
      box(ctx, x - 70, y - 60, 140, 60, "#b5543c");
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#11112655";
      ctx.beginPath();
      for (let r = 0; r < 5; r++) (ctx.moveTo(x - 66, y - 50 + r * 11), ctx.lineTo(x + 66, y - 50 + r * 11));
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      // Saw-tooth roof.
      ctx.fillStyle = "#6b7280";
      ctx.beginPath();
      ctx.moveTo(x - 70, y - 60);
      for (let i = 0; i < 4; i++) (ctx.lineTo(x - 70 + i * 35, y - 84), ctx.lineTo(x - 70 + (i + 1) * 35, y - 60));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (const cx of [x + 40, x + 58]) {
        box(ctx, cx - 7, y - 140, 14, 80, "#8a5a45", 2);
        smokePuffs(ctx, cx, y - 144, now, 1.2, true);
      }
      ctx.fillStyle = dark > 0.1 ? "#ffd98a" : "#8fd0ff";
      for (let i = 0; i < 4; i++) {
        rr(ctx, x - 60 + i * 26, y - 40, 16, 14, 2);
        ctx.fill();
        ctx.stroke();
      }
      if (dark > 0.1) lights.push({ x, y: y - 30, r: 150, c: "255,190,110", k: 0.9 });
      return true;
    }
    case "tower": {
      const gun = col && knows(col, "gunpowder");
      box(ctx, x - 20, y - 120, 40, 120, "#c2baa9");
      for (let i = 0; i < 3; i++) box(ctx, x - 24 + i * 17, y - 132, 14, 14, "#c2baa9", 1);
      box(ctx, x - 24, y - 122, 48, 8, "#b0a896", 1);
      ctx.fillStyle = INK;
      rr(ctx, x - 3, y - 96, 6, 18, 3);
      ctx.fill();
      rr(ctx, x - 3, y - 60, 6, 18, 3);
      ctx.fill();
      if (col) waveFlag(ctx, x + 12, y - 132, 30, col.color, now, gun ? "💥" : "🏹", 0.75);
      if (dark > 0.1) lights.push({ x, y: y - 120, r: 110, c: "255,170,70", k: 0.9 });
      return true;
    }
    case "skyscraper": {
      const hgt = 250;
      box(ctx, x - 36, y - hgt, 72, hgt, "#9fb7cc", 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      rr(ctx, x - 30, y - hgt + 6, 14, hgt - 12, 2);
      ctx.fill();
      // A grid of windows, some lit at night.
      for (let r = 0; r < 14; r++)
        for (let c = 0; c < 4; c++) {
          const lit = dark > 0.1 && (b.id * 7 + r * 13 + c * 5) % 3 !== 0;
          ctx.fillStyle = lit ? "#ffe08a" : "#5f7b94";
          ctx.fillRect(x - 28 + c * 15, y - hgt + 12 + r * 17, 10, 10);
        }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - hgt);
      ctx.lineTo(x, y - hgt - 40);
      ctx.stroke();
      ctx.fillStyle = Math.sin(now / 400) > 0 ? "#ff4b3e" : "#7a1f1a";
      ctx.beginPath();
      ctx.arc(x, y - hgt - 42, 4, 0, 7);
      ctx.fill();
      if (dark > 0.1) lights.push({ x, y: y - hgt / 2, r: 180, c: "255,230,150", k: 0.8 });
      return true;
    }
    case "silo": {
      box(ctx, x - 55, y - 20, 110, 20, "#9aa0a8", 2);
      ctx.fillStyle = "#c7ccd4";
      ctx.beginPath();
      ctx.ellipse(x, y - 20, 48, 40, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = b.fired ? "#3b3f47" : "#ffd84d";
      ctx.beginPath();
      ctx.ellipse(x, y - 52, 16, 6, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      emoji(ctx, "☢️", x, y - 30, 20);
      if (dark > 0.1) lights.push({ x, y: y - 40, r: 90, c: "255,80,60", k: 0.7 });
      return true;
    }
    case "un": {
      box(ctx, x - 40, y - 200, 80, 200, "#e8eef5", 2);
      ctx.fillStyle = "#3b82f6";
      for (let r = 0; r < 12; r++) ctx.fillRect(x - 34, y - 192 + r * 16, 68, 7);
      box(ctx, x - 90, y - 40, 50, 40, "#dfe7f0", 2);
      ctx.fillStyle = "#e8eef5";
      ctx.beginPath();
      ctx.ellipse(x - 65, y - 40, 25, 14, 0, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      waveFlag(ctx, x + 60, y, 120, "#4aa3ff", now, "🕊️", 1.3);
      // Members' flags in a row.
      const members = (w.un?.members ?? []).map((id) => colonyOf(w, id)).filter(Boolean);
      members.slice(0, 6).forEach((c, i) => waveFlag(ctx, x - 120 + i * 26, y + 30, 50, c.color, now, null, 0.6));
      if (dark > 0.1) lights.push({ x, y: y - 100, r: 220, c: "200,220,255", k: 1 });
      return true;
    }
  }
  return false;
}

// A modern house (after industry): a white box with a flat roof and wide glass.
export function modernHouse(ctx, w, h, col, now, dark, lights) {
  const x = h.x;
  const y = h.y;
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  box(ctx, x - 44, y - 64, 88, 64, "#f2f4f7");
  box(ctx, x - 48, y - 70, 96, 8, col?.color ?? "#6b7280", 2);
  ctx.fillStyle = dark > 0.1 ? "#ffd98a" : "#9fd4ff";
  rr(ctx, x - 36, y - 54, 44, 22, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#4b5563";
  rr(ctx, x + 16, y - 36, 18, 36, 2);
  ctx.fill();
  ctx.stroke();
  // Electricity: a street lamp.
  if (col && knows(col, "electricity")) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 58, y + 4);
    ctx.lineTo(x + 58, y - 60);
    ctx.lineTo(x + 48, y - 60);
    ctx.stroke();
    ctx.fillStyle = dark > 0.1 ? "#fff3b0" : "#d1d5db";
    ctx.beginPath();
    ctx.arc(x + 48, y - 56, 5, 0, 7);
    ctx.fill();
    ctx.stroke();
    if (dark > 0.1) lights.push({ x: x + 48, y: y - 40, r: 130, c: "255,240,190", k: 1 });
  }
  if (dark > 0.1) lights.push({ x: x - 14, y: y - 40, r: 80, c: "255,210,120", k: 0.9 });
}

// ---------------------------------------------------------------- sky

export function drawMissiles(ctx, w, lights) {
  for (const m of w.missiles ?? []) {
    const k = Math.min(1, (w.t - m.t0) / m.dur);
    const arc = Math.hypot(m.x1 - m.x0, m.y1 - m.y0) * 0.45;
    const pos = (t) => [m.x0 + (m.x1 - m.x0) * t, m.y0 + (m.y1 - m.y0) * t - Math.sin(t * Math.PI) * arc];
    const [x, y] = pos(k);
    const [x2, y2] = pos(Math.min(1, k + 0.02));
    // Trail.
    ctx.save();
    ctx.strokeStyle = "rgba(220,220,230,0.7)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    for (let t = Math.max(0, k - 0.3); t <= k; t += 0.02) {
      const [tx, ty] = pos(t);
      t === Math.max(0, k - 0.3) ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty);
    }
    ctx.stroke();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(y2 - y, x2 - x));
    ctx.fillStyle = "#e5e7eb";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    rr(ctx, -30, -8, 50, 16, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff4b3e";
    ctx.beginPath();
    ctx.moveTo(20, -8);
    ctx.lineTo(34, 0);
    ctx.lineTo(20, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffb13d";
    ctx.beginPath();
    ctx.moveTo(-30, -6);
    ctx.lineTo(-48 - Math.random() * 10, 0);
    ctx.lineTo(-30, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    lights.push({ x, y, r: 160, c: "255,170,80", k: 1.2 });
  }
}

export function drawFallout(ctx, w) {
  for (const f of w.fallout ?? []) {
    const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    grad.addColorStop(0, "rgba(140,200,40,0.28)");
    grad.addColorStop(1, "rgba(140,200,40,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 7);
    ctx.fill();
  }
}

// The mushroom cloud: a fireball, then a rising stem and cap.
export function drawNuke(ctx, w, e, lights) {
  const age = w.t - e.t0;
  const k = age / e.dur;
  ctx.save();
  if (age < 1.2) {
    const r = 120 + age * 500;
    const grad = ctx.createRadialGradient(e.x, e.y - 60, 0, e.x, e.y - 60, r);
    grad.addColorStop(0, "rgba(255,255,230,1)");
    grad.addColorStop(0.4, "rgba(255,200,80,0.9)");
    grad.addColorStop(1, "rgba(255,90,30,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(e.x, e.y - 60, r, 0, 7);
    ctx.fill();
  }
  // Shockwave ring on the ground.
  ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.8 - k * 2)})`;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, 100 + age * 400, (100 + age * 400) * 0.5, 0, 0, 7);
  ctx.stroke();
  // Mushroom.
  const rise = Math.min(1, age / 3);
  const fade = age > e.dur - 3 ? (e.dur - age) / 3 : 1;
  ctx.globalAlpha = Math.max(0, fade);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  const top = e.y - 120 - rise * 420;
  ctx.fillStyle = "#b8a08a";
  ctx.beginPath();
  ctx.moveTo(e.x - 40, e.y);
  ctx.quadraticCurveTo(e.x - 30, (e.y + top) / 2, e.x - 34, top + 40);
  ctx.lineTo(e.x + 34, top + 40);
  ctx.quadraticCurveTo(e.x + 30, (e.y + top) / 2, e.x + 40, e.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const capR = 90 + rise * 110;
  for (const [dx, dy, r, c] of [
    [-capR * 0.5, 10, capR * 0.6, "#9c8570"],
    [capR * 0.5, 10, capR * 0.6, "#9c8570"],
    [0, -10, capR * 0.75, "#c9b39a"],
    [0, 20, capR * 0.5, "#ff9a4a"],
  ]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(e.x + dx, top + dy, r, r * 0.55, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  lights.push({ x: e.x, y: top, r: 900, c: "255,170,90", k: 2 * Math.max(0, 1 - k) });
}

export function drawBullet(ctx, a, x, y, ang) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.strokeStyle = "#ffe066";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(4, 0);
  ctx.stroke();
  ctx.restore();
}
