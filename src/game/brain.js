// A tiny neural network for each villager. It reads how they are and what's
// around them, and tilts how much they want each kind of action. Children
// inherit a mix of their parents' brains with a few mutations, so the
// people who live long and have children pass their way of thinking on —
// the population evolves. And each brain learns a little in its own life:
// whatever made them happier becomes more tempting.
//
// Plain arrays, so a world with its brains can be saved as JSON.
import { clamp } from "./util.js";

export const SENSES = [
  ["food", "سیری"],
  ["energy", "انرژی"],
  ["health", "سلامتی"],
  ["social", "هم‌صحبتی"],
  ["wealth", "ثروت"],
  ["mood", "حال"],
  ["threat", "تهدید"],
  ["enemy", "دشمن نزدیک"],
  ["friend", "دوست نزدیک"],
  ["night", "شب"],
  ["winter", "زمستان"],
  ["home", "خانه"],
  ["spouse", "همسر"],
  ["danger", "بوی خطر"],
];
export const DRIVES = [
  ["eat", "خوردن", "🍎"],
  ["sleep", "خواب", "😴"],
  ["work", "کار", "⛏️"],
  ["home", "خانه‌سازی", "🏠"],
  ["social", "گپ", "💬"],
  ["love", "عشق", "💖"],
  ["fight", "دعوا", "⚔️"],
  ["flee", "فرار", "🏃"],
  ["crime", "دزدی", "🦝"],
  ["kind", "کمک", "🤝"],
  ["faith", "ایمان", "🙏"],
  ["explore", "گشت‌وگذار", "🧭"],
];
const NI = SENSES.length + 1; // + a bias input
const NH = 8;
const NO = DRIVES.length;
export const DRIVE_INDEX = Object.fromEntries(DRIVES.map(([id], i) => [id, i]));

const r3 = (x) => Math.round(x * 1000) / 1000;
const gauss = () => {
  const u = Math.random() || 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

export function newBrain(scale = 0.3) {
  return {
    gen: 1,
    w1: Array.from({ length: NH * NI }, () => r3(gauss() * scale)),
    w2: Array.from({ length: NO * NH }, () => r3(gauss() * scale)),
    b2: Array.from({ length: NO }, () => 0),
  };
}

// Half from each parent, weight by weight, then a few mutations.
export function childBrain(a, b, rate = 0.12, size = 0.35) {
  const mix = (x, y) => x.map((v, i) => r3((Math.random() < 0.5 ? v : y[i]) + (Math.random() < rate ? gauss() * size : 0)));
  return {
    gen: Math.max(a.gen, b.gen) + 1,
    w1: mix(a.w1, b.w1),
    w2: mix(a.w2, b.w2),
    // What the parents learned in life is only half passed on.
    b2: a.b2.map((v, i) => r3((v + b.b2[i]) / 4)),
  };
}

export function forward(brain, inputs) {
  const x = [...inputs, 1];
  const hidden = new Array(NH);
  for (let h = 0; h < NH; h++) {
    let s = 0;
    for (let i = 0; i < NI; i++) s += brain.w1[h * NI + i] * x[i];
    hidden[h] = Math.tanh(s);
  }
  const out = new Array(NO);
  for (let o = 0; o < NO; o++) {
    let s = brain.b2[o];
    for (let h = 0; h < NH; h++) s += brain.w2[o * NH + h] * hidden[h];
    out[o] = Math.tanh(s);
  }
  return { x, hidden, out };
}

// How a drive's output changes an option's score: from 0.5× to 1.5×.
export const tilt = (out, drive) => 1 + 0.5 * out[DRIVE_INDEX[drive]];

// Learning from life: the drive behind the last choice is strengthened if
// they're happier now than when they chose it, weakened if not.
export function learn(brain, drive, reward) {
  const i = DRIVE_INDEX[drive];
  if (i == null) return;
  brain.b2[i] = r3(clamp(brain.b2[i] + 0.08 * clamp(reward / 30, -1, 1), -1.5, 1.5));
}

export const NET = { NI, NH, NO };
