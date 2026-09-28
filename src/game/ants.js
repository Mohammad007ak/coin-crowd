// Pheromones, the way ants use them. The land is a grid of cells; people
// leave marks as they go:
//   food   — laid by someone walking away from a tree or a catch, so the
//            hungry can follow the trail back to it;
//   danger — laid where people got hurt or died, so others steer clear;
//   walk   — laid by every footstep, so the paths people use most wear into
//            roads.
// Marks fade over time unless they're renewed.
import { clamp, rand } from "./util.js";

export const CELL = 50;
const DECAY = { food: 0.985, danger: 0.99, walk: 0.997 }; // kept per second
const CAP = { food: 12, danger: 12, walk: 8 };

export function makePheromones(W, H) {
  const cols = Math.ceil(W / CELL);
  const rows = Math.ceil(H / CELL);
  const zero = () => new Array(cols * rows).fill(0);
  return { cols, rows, food: zero(), danger: zero(), walk: zero(), clock: 0 };
}

const cellOf = (ph, x, y) => {
  const c = clamp(Math.floor(x / CELL), 0, ph.cols - 1);
  const r = clamp(Math.floor(y / CELL), 0, ph.rows - 1);
  return r * ph.cols + c;
};
export const smell = (ph, kind, x, y) => ph[kind][cellOf(ph, x, y)];

export function lay(ph, kind, x, y, amount) {
  const i = cellOf(ph, x, y);
  ph[kind][i] = Math.min(CAP[kind], ph[kind][i] + amount);
}
// A spread-out mark (a death, a battle).
export function splash(ph, kind, x, y, amount, radius = 1) {
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const k = 1 / (1 + Math.abs(dx) + Math.abs(dy));
      lay(ph, kind, x + dx * CELL, y + dy * CELL, amount * k);
    }
}

// Once a second: everything fades.
export function evaporate(ph, dt) {
  ph.clock += dt;
  if (ph.clock < 1) return;
  const steps = Math.floor(ph.clock);
  ph.clock -= steps;
  for (const kind of ["food", "danger", "walk"]) {
    const k = Math.pow(DECAY[kind], steps);
    const a = ph[kind];
    for (let i = 0; i < a.length; i++) a[i] = a[i] < 0.01 ? 0 : Math.round(a[i] * k * 1000) / 1000;
  }
}

// An ant's step: pick a neighbouring cell, drawn towards food and away
// from danger, with a little randomness so trails get explored.
export function sniff(ph, x, y, want = "food") {
  const c0 = Math.floor(x / CELL);
  const r0 = Math.floor(y / CELL);
  let best = null;
  let bestS = -Infinity;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const c = c0 + dx;
      const r = r0 + dy;
      if (c < 0 || r < 0 || c >= ph.cols || r >= ph.rows) continue;
      const i = r * ph.cols + c;
      const s = Math.pow(ph[want][i] + 0.15, 1.5) * rand(0.5, 1.5) - ph.danger[i] * 0.4;
      if (s > bestS) (bestS = s), (best = { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL });
    }
  return best;
}
