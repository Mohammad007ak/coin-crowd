// The land: a river running north to south with a few bridges, lakes,
// hills, a sacred hill in the middle, and mountains along the northern edge.
// Plain data, made once per world from a seed.
import { clamp } from "./util.js";

export function seeded(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function makeTerrain(W, H, seed) {
  const rnd = seeded(seed);
  // The river: one x per row of 40px, wandering but smooth.
  const step = 40;
  const river = [];
  let x = W * 0.66;
  let drift = 0;
  for (let y = 0; y <= H + step; y += step) {
    drift = clamp(drift + (rnd() - 0.5) * 18, -22, 22);
    x = clamp(x + drift, W * 0.65, W * 0.75);
    river.push(x);
  }
  const width = (y) => 64 + 18 * Math.sin(y / 170) + 10 * Math.sin(y / 53);
  const bridges = [0.22, 0.52, 0.82].map((k) => {
    const y = Math.round((H * k) / step) * step;
    return { x: river[y / step], y, len: width(y) + 50 };
  });
  const riverX = (y) => {
    const i = clamp(y / step, 0, river.length - 1.001);
    const a = Math.floor(i);
    return river[a] + (river[a + 1] - river[a]) * (i - a);
  };
  const holy = { x: W * 0.52, y: H * 0.5, r: 190 };
  const lakes = [
    { x: W * 0.17, y: H * 0.78, rx: 150, ry: 70 },
    { x: W * 0.88, y: H * 0.3, rx: 120, ry: 58 },
  ];
  const hills = [];
  for (let i = 0; i < 9; i++) {
    const h = { x: 150 + rnd() * (W - 300), y: 200 + rnd() * (H - 300), r: 70 + rnd() * 70 };
    const clear =
      Math.abs(h.x - riverX(h.y)) > h.r + 90 &&
      Math.hypot(h.x - holy.x, h.y - holy.y) > h.r + holy.r + 60 &&
      lakes.every((l) => Math.hypot(h.x - l.x, h.y - l.y) > h.r + l.rx);
    if (clear) hills.push(h);
  }
  const forests = [];
  for (let i = 0; i < 7; i++) forests.push({ x: 100 + rnd() * (W - 200), y: 180 + rnd() * (H - 260), r: 160 + rnd() * 140 });
  return { seed, step, river, bridges, lakes, hills, holy, forests, W, H, riverX, width };
}

// JSON drops the functions; put them back after a load.
export function reviveTerrain(t) {
  const step = t.step;
  t.riverX = (y) => {
    const i = clamp(y / step, 0, t.river.length - 1.001);
    const a = Math.floor(i);
    return t.river[a] + (t.river[a + 1] - t.river[a]) * (i - a);
  };
  t.width = (y) => 64 + 18 * Math.sin(y / 170) + 10 * Math.sin(y / 53);
  return t;
}

export const onBridge = (t, x, y) => t.bridges.some((b) => Math.abs(y - b.y) < 22 && Math.abs(x - b.x) < b.len / 2);
export const inRiver = (t, x, y) => Math.abs(x - t.riverX(y)) < t.width(y) / 2;
export const inLake = (t, x, y) => t.lakes.some((l) => ((x - l.x) / l.rx) ** 2 + ((y - l.y) / l.ry) ** 2 < 1);
export const isWater = (t, x, y) => (inRiver(t, x, y) && !onBridge(t, x, y)) || inLake(t, x, y);
// Which bank: -1 west of the river, 1 east.
export const side = (t, x, y) => (x < t.riverX(y) ? -1 : 1);
export function nearestBridge(t, x, y) {
  let best = t.bridges[0];
  for (const b of t.bridges) if (Math.hypot(b.x - x, b.y - y) < Math.hypot(best.x - x, best.y - y)) best = b;
  return best;
}
// Good ground to build or plant on.
export const buildable = (t, x, y, pad = 30) =>
  !isWater(t, x, y) &&
  Math.abs(x - t.riverX(y)) > t.width(y) / 2 + pad &&
  t.lakes.every((l) => ((x - l.x) / (l.rx + pad)) ** 2 + ((y - l.y) / (l.ry + pad)) ** 2 >= 1) &&
  Math.hypot(x - t.holy.x, (y - t.holy.y) * 1.3) > t.holy.r * 0.75;

export const SEASONS = [
  { id: "spring", name: "بهار", icon: "🌸" },
  { id: "summer", name: "تابستان", icon: "☀️" },
  { id: "autumn", name: "پاییز", icon: "🍂" },
  { id: "winter", name: "زمستان", icon: "❄️" },
];
export const SEASON_DAYS = 6;
export const seasonOf = (day) => SEASONS[Math.floor(day / SEASON_DAYS) % 4];

export const WEATHERS = {
  clear: { name: "صاف", icon: "🌤️" },
  cloudy: { name: "ابری", icon: "☁️" },
  rain: { name: "باران", icon: "🌧️" },
  storm: { name: "طوفان", icon: "⛈️" },
  snow: { name: "برف", icon: "🌨️" },
  fog: { name: "مه", icon: "🌫️" },
};
const WEATHER_ODDS = {
  spring: { clear: 4, cloudy: 3, rain: 3, storm: 1, fog: 1 },
  summer: { clear: 7, cloudy: 2, rain: 1, storm: 1 },
  autumn: { clear: 3, cloudy: 3, rain: 3, storm: 1, fog: 2 },
  winter: { clear: 2, cloudy: 3, snow: 5, fog: 2 },
};
export function rollWeather(season) {
  const odds = Object.entries(WEATHER_ODDS[season.id]);
  let r = Math.random() * odds.reduce((s, [, n]) => s + n, 0);
  for (const [k, n] of odds) if ((r -= n) < 0) return k;
  return "clear";
}
