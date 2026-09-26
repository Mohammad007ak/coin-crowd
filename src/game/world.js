// The world: people with coin heads (and other heads) who eat, work, build,
// talk, fall in love, marry, have children, form tribes, make alliances and
// wars — and a god (the player) who can bless them or ruin their day.
//
// Everything here is plain data (JSON-safe), so a world can be saved and
// loaded as is. Time is in game seconds; one day is DAY seconds.
import {
  COLONY_COLORS,
  FACES,
  SHAPES,
  chance,
  clamp,
  dist,
  makeColonyName,
  makeName,
  pick,
  rand,
  randInt,
  say,
} from "./util.js";
import { buildable, isWater, makeTerrain, reviveTerrain, rollWeather, seasonOf, SEASON_DAYS, WEATHERS } from "./terrain.js";
import {
  FAITHS,
  declareHolyWar,
  faithDay,
  faithTick,
  foundReligion,
  godSeen,
  grieve,
  infidel,
  preachResult,
  religionOf,
  shoot,
  soldierTask,
} from "./crusade.js";

export const DAY = 30;
export const ADULT = 16;
export const ELDER = 60;
const HOUSE_COST = 20;
const SPEED = 70; // walking speed, world px per second

// ---------------------------------------------------------------- creation

export function createWorld() {
  const W = 3600;
  const H = 1700;
  const w = {
    version: 2,
    t: 0,
    day: 0,
    W,
    H,
    nextId: 1,
    people: [],
    houses: [],
    trees: [],
    rocks: [],
    coins: [],
    colonies: [],
    religions: [],
    armies: [],
    arrows: [],
    effects: [],
    events: [],
    announcements: [],
    names: {},
    shake: 0,
    weather: { type: "clear", until: DAY * 0.6 },
    season: "spring",
    terrain: makeTerrain(W, H, Math.floor(Math.random() * 1e9)),
    stats: { born: 0, died: 0, married: 0, wars: 0, crusades: 0 },
  };
  const t = w.terrain;
  w.holy = { x: t.holy.x, y: t.holy.y, r: t.holy.r, name: "شهر مقدس", owner: null, contender: null, progress: 0 };
  // Forests are thick, meadows thin.
  for (let i = 0; i < 400 && w.trees.length < 95; i++) {
    const f = pick(t.forests);
    const x = chance(0.75) ? f.x + rand(-f.r, f.r) : rand(60, W - 60);
    const y = chance(0.75) ? f.y + rand(-f.r, f.r) * 0.6 : rand(160, H - 50);
    if (x < 50 || x > W - 50 || y < 215 || y > H - 40 || !buildable(t, x, y, 20)) continue;
    if (w.trees.some((o) => Math.hypot(o.x - x, (o.y - y) * 1.5) < 55)) continue;
    addTree(w, x, y, randInt(1, 4));
  }
  // Rocks with gold in them, mostly on the hills.
  for (const h of t.hills.slice(0, 7)) w.rocks.push({ id: w.nextId++, x: h.x + rand(-20, 20), y: h.y + rand(-5, 15), r: rand(28, 40) });
  for (let i = 0; i < 4; i++) {
    const x = rand(200, W - 200);
    const y = rand(250, H - 120);
    if (buildable(t, x, y, 40)) w.rocks.push({ id: w.nextId++, x, y, r: rand(26, 36) });
  }
  // Two peoples on the two banks of the river, each with its faith and town.
  settle(w, { x: W * 0.2, y: H * 0.4 }, FAITHS[0], 15);
  settle(w, { x: W * 0.86, y: H * 0.64 }, FAITHS[1], 15);
  // And a few wanderers in between, who believe in nothing yet.
  for (let i = 0; i < 4; i++) {
    const s = spotNear(w, t.holy.x + rand(-300, 300), t.holy.y + rand(-300, 300), 200);
    if (s) makePerson(w, s.x, s.y, { traits: { ...randomTraits(), faith: rand(0.1, 0.5) } });
  }
  log(w, "🌍 دنیا آفریده شد. حالا تو خدایی.", null, "god");
  announce(w, "🌍 دو قوم در دو سوی رود؛ و شهر مقدس در میانه، بی‌صاحب…", null, "god");
  return w;
}

const randomTraits = () => ({ kind: rand(), aggr: rand(), greed: rand(), social: rand(), faith: rand(), brave: rand(), work: rand() });

// A town: people, a tribe, couples with houses, a temple half built.
function settle(w, at, faith, n) {
  // Clear the ground for the town.
  w.trees = w.trees.filter((t) => Math.hypot(t.x - at.x, (t.y - at.y) * 1.3) > 330);
  const people = [];
  for (let i = 0; i < n; i++) {
    const s = spotNear(w, at.x + rand(-200, 200), at.y + rand(-140, 140), 120);
    if (!s) continue;
    people.push(makePerson(w, s.x, s.y, { traits: { ...randomTraits(), faith: rand(0.35, 1) }, age: rand(ADULT, 38) }));
  }
  const religion = foundReligion(w, null, faith);
  for (const p of people) p.religion = religion.id;
  const prophet = [...people].sort((a, b) => b.traits.faith - a.traits.faith)[0];
  prophet.prophet = true;
  prophet.traits.faith = Math.max(prophet.traits.faith, 0.9);
  religion.prophet = prophet.id;
  const leader = [...people].sort((a, b) => b.traits.brave + b.traits.social - (a.traits.brave + a.traits.social))[0];
  const tribe = foundColony(w, leader, people.slice(0, 10), true);
  tribe.religion = religion.id;
  // Some couples, some homes.
  const singles = people.filter((p) => p.colony === tribe.id);
  for (let i = 0; i + 1 < singles.length && i < 6; i += 2) {
    const a = singles[i];
    const b = singles[i + 1];
    a.spouse = b.id;
    b.spouse = a.id;
    a.rel[b.id] = b.rel[a.id] = 70;
  }
  for (const p of singles) {
    if (p.home || (p.spouse && byId(w, p.spouse).home)) {
      if (p.spouse) p.home = byId(w, p.spouse).home;
      continue;
    }
    if (chance(0.25)) continue;
    const s = findSpot(w, at.x, at.y, 320, 110);
    if (!s) continue;
    const h = newBuilding(w, "house", s, p);
    h.built = 1;
    h.level = chance(0.3) ? 2 : 1;
    p.home = h.id;
    if (p.spouse) byId(w, p.spouse).home = h.id;
  }
  for (const p of people) for (const q of people) if (p !== q && !p.rel[q.id]) p.rel[q.id] = randInt(0, 25);
  const s = findSpot(w, at.x, at.y, 200, 140);
  if (s) {
    const temple = newBuilding(w, "temple", s, leader);
    temple.religion = religion.id;
    temple.built = 0.6;
  }
}

function newBuilding(w, kind, at, owner) {
  const hp = kind === "keep" ? 300 : kind === "temple" ? 180 : 100;
  const b = { id: w.nextId++, kind, x: at.x, y: at.y, owner: owner?.id ?? null, colony: owner?.colony ?? null, built: 0, hp, maxHp: hp, fire: 0, ruined: false, level: 1 };
  w.houses.push(b);
  return b;
}

// A free spot of good ground near a point, away from other things.
export function findSpot(w, x0, y0, r, gap = 110) {
  const t = w.terrain;
  for (let i = 0; i < 40; i++) {
    const x = clamp(x0 + rand(-r, r), 80, w.W - 80);
    const y = clamp(y0 + rand(-r, r) * 0.65, 240, w.H - 60);
    if (!buildable(t, x, y, 40)) continue;
    const clear =
      w.houses.every((h) => Math.hypot(h.x - x, (h.y - y) * 1.6) > (h.kind === "house" ? gap : gap + 40)) &&
      w.trees.every((o) => Math.hypot(o.x - x, (o.y - y) * 1.6) > 50) &&
      w.rocks.every((o) => Math.hypot(o.x - x, (o.y - y) * 1.6) > 70);
    if (clear) return { x, y };
  }
  return null;
}
function spotNear(w, x0, y0, r) {
  for (let i = 0; i < 30; i++) {
    const x = clamp(x0 + rand(-r, r), 60, w.W - 60);
    const y = clamp(y0 + rand(-r, r), 220, w.H - 40);
    if (!isWater(w.terrain, x, y)) return { x, y };
  }
  return null;
}

// Loaded worlds need their terrain helpers back.
export function revive(w) {
  reviveTerrain(w.terrain);
  return w;
}

export function addTree(w, x, y, fruit = 0) {
  const tree = { id: w.nextId++, x, y, fruit, burn: 0, dead: false, deadAt: 0, size: rand(0.85, 1.2) };
  w.trees.push(tree);
  return tree;
}

export function makePerson(w, x, y, extra = {}) {
  const used = new Set(w.people.filter((p) => p.alive).map((p) => p.name));
  const p = {
    id: w.nextId++,
    name: makeName(used),
    shape: pick(SHAPES),
    color: pick(FACES),
    traits: randomTraits(),
    age: rand(ADULT, 34),
    life: rand(78, 100),
    health: 100,
    food: rand(55, 100),
    energy: rand(60, 100),
    social: rand(40, 100),
    wealth: randInt(0, 12),
    x,
    y,
    tx: x,
    ty: y,
    vx: 0,
    vy: 0,
    z: 0,
    vz: 0,
    facing: chance(0.5) ? 1 : -1,
    phase: rand(0, 6),
    task: null,
    decideAt: 0,
    rel: {},
    spouse: null,
    parents: [],
    kids: [],
    colony: null,
    home: null,
    memories: [],
    speech: null,
    thought: "",
    plan: null,
    alive: true,
    sick: 0,
    mod: 0,
    stun: 0,
    carried: false,
    religion: null,
    prophet: false,
    army: null,
    role: null,
    born: w.t,
    ...extra,
  };
  w.names[p.id] = p.name;
  w.people.push(p);
  return p;
}

// ---------------------------------------------------------------- lookups

export const byId = (w, id) => w.people.find((p) => p.id === id);
export const alive = (w) => w.people.filter((p) => p.alive);
export const houseOf = (w, id) => w.houses.find((h) => h.id === id);
export const colonyOf = (w, id) => w.colonies.find((c) => c.id === id);
export const membersOf = (w, c) => w.people.filter((p) => p.alive && p.colony === c.id);
export const isAdult = (p) => p.age >= ADULT;
export const nameOf = (w, id) => w.names[id] ?? "؟";
const rel = (a, b) => a.rel[b.id] ?? 0;
export function addRel(a, b, d) {
  if (a === b) return;
  a.rel[b.id] = clamp(rel(a, b) + d, -100, 100);
}
function addBoth(a, b, d) {
  addRel(a, b, d);
  addRel(b, a, d);
}
export const colRel = (a, b) => (a && b ? (a.rel[b.id] ?? 0) : 0);
export const colStatus = (a, b) => (a && b ? (a.status[b.id] ?? null) : null);
function addColRel(w, idA, idB, d) {
  if (!idA || !idB || idA === idB) return;
  const a = colonyOf(w, idA);
  const b = colonyOf(w, idB);
  if (!a || !b) return;
  a.rel[b.id] = clamp(colRel(a, b) + d, -100, 100);
  b.rel[a.id] = clamp(colRel(b, a) + d, -100, 100);
}
const atWar = (w, a, b) => a.colony && b.colony && colStatus(colonyOf(w, a.colony), colonyOf(w, b.colony)) === "war";
const allied = (w, a, b) =>
  a.colony && b.colony && (a.colony === b.colony || colStatus(colonyOf(w, a.colony), colonyOf(w, b.colony)) === "ally");

export function happiness(w, p) {
  const home = p.home && houseOf(w, p.home)?.built >= 1;
  return clamp(
    (p.food - 50) * 0.4 +
      (p.energy - 50) * 0.2 +
      (p.social - 50) * 0.3 +
      (p.health - 70) * 0.6 +
      Math.min(p.wealth, 40) * 0.5 -
      8 +
      (home ? 12 : isAdult(p) ? -10 : 0) +
      (p.spouse ? 10 : 0) +
      (p.sick ? -25 : 0) +
      p.mod,
    -100,
    100,
  );
}

export function log(w, text, at = null, kind = "info") {
  w.events.push({ id: w.nextId++, t: w.t, day: w.day, text, x: at?.x, y: at?.y, kind });
  if (w.events.length > 250) w.events.splice(0, w.events.length - 250);
}
export function remember(w, p, text) {
  p.memories.push({ day: w.day, text });
  if (p.memories.length > 16) p.memories.shift();
}
export function speak(w, p, text, dur = 2.6) {
  if (text) p.speech = { text, until: w.t + dur };
}
export const fx = (w, type, x, y, dur, extra = {}) => w.effects.push({ type, x, y, t0: w.t, dur, ...extra });

// Big news: shown across the screen, and kept in the log.
export function announce(w, text, at = null, kind = "news") {
  log(w, text, at, kind);
  w.announcements.push({ id: w.nextId++, text, t: w.t, kind, x: at?.x, y: at?.y });
  if (w.announcements.length > 20) w.announcements.shift();
}

// ---------------------------------------------------------------- the clock

export function tick(w, dt) {
  // Small steps so fast-forward stays stable.
  while (dt > 0) {
    const step = Math.min(dt, 0.1);
    dt -= step;
    step1(w, step);
  }
}

function step1(w, dt) {
  w.t += dt;
  const day = Math.floor(w.t / DAY);
  if (day !== w.day) {
    w.day = day;
    dayTick(w);
  }
  for (const p of w.people) if (p.alive) personTick(w, p, dt);
  separate(w);
  w.people = w.people.filter((p) => p.alive || w.t - p.diedAt < 20);
  pendingTick(w);
  weatherTick(w, dt);
  faithTick(w, dt);
  housesTick(w, dt);
  treesTick(w, dt);
  coinsTick(w, dt);
  w.effects = w.effects.filter((e) => w.t - e.t0 < e.dur);
  w.shake = Math.max(0, w.shake - dt);
}

// ---------------------------------------------------------------- a person

function personTick(w, p, dt) {
  if (p.carried) return;
  // Thrown by the hand of god: fly, fall, hurt.
  if (p.z > 0 || p.vz > 0) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vz -= 1100 * dt;
    p.z += p.vz * dt;
    keepIn(w, p);
    if (p.z <= 0) {
      const impact = Math.hypot(p.vz, Math.hypot(p.vx, p.vy) * 0.4);
      p.z = 0;
      p.vz = 0;
      p.vx = 0;
      p.vy = 0;
      p.stun = 1.6;
      fx(w, "dust", p.x, p.y, 0.6);
      if (impact > 420) hurt(w, p, (impact - 420) * 0.12, "افتادن از آسمان");
      if (p.alive) {
        p.mod -= 8;
        speak(w, p, say("scared"));
      }
    }
    return;
  }

  // Needs.
  const sleeping = p.task?.type === "sleep" && p.task.asleep;
  p.food = Math.max(0, p.food - dt * (isAdult(p) ? 1.3 : 1) * (p.army ? 0.5 : 1)); // an army carries rations
  p.energy = sleeping ? Math.min(100, p.energy + dt * 9) : Math.max(0, p.energy - dt * 0.9);
  p.social = Math.max(0, p.social - dt * 1.1);
  p.mod *= Math.pow(0.5, dt / (DAY * 1.5)); // good and bad days fade over a day or two
  if (p.food <= 0) hurt(w, p, dt * 1.6, "گرسنگی");
  // Winter is hard on the homeless.
  if (w.season === "winter" && !p.home && !p.army) {
    hurt(w, p, dt * 0.12, "سرما");
    p.mod -= dt * 0.1;
  }
  if (p.sick) {
    hurt(w, p, dt * 1.1, "طاعون");
    if (chance(dt * 0.25)) {
      for (const q of w.people) if (q.alive && !q.sick && q !== p && dist(p, q) < 34 && chance(0.5)) q.sick = 1;
    }
    if (chance(dt * 0.05)) speak(w, p, say("sick"));
  } else if (p.health < 100 && p.food > 30) p.health = Math.min(100, p.health + dt * 0.8);
  if (!p.alive) return;
  p.age += dt / DAY;
  if (p.age > p.life) return die(w, p, "پیری");
  if (p.speech && w.t > p.speech.until) p.speech = null;
  if (p.stun > 0) {
    p.stun -= dt;
    return;
  }

  if (!p.task || w.t > p.task.until) {
    if (w.t >= p.decideAt) {
      p.task = decide(w, p);
      p.decideAt = w.t + rand(0.2, 0.8);
    }
  }
  if (p.task) runTask(w, p, dt);
  move(w, p, dt);
}

export function hurt(w, p, amount, cause, by = null) {
  if (!p.alive) return;
  p.health -= amount;
  if (p.health <= 0) die(w, p, cause, by);
}

function die(w, p, cause, by = null) {
  if (!p.alive) return;
  p.alive = false;
  p.diedAt = w.t;
  p.cause = cause;
  p.task = null;
  p.speech = null;
  p.carried = false;
  w.stats.died++;
  const killer = by && byId(w, by);
  log(w, `💀 ${p.name} مُرد (${killer ? `به دست ${killer.name}` : cause}).`, p, "death");
  fx(w, "soul", p.x, p.y, 2.5);
  // The ones who loved them grieve; the ones who hated them don't.
  for (const q of alive(w)) {
    const close = q.id === p.spouse || q.kids.includes(p.id) || q.parents.includes(p.id);
    if (close || rel(q, p) > 45) {
      q.mod -= close ? 45 : 18;
      remember(w, q, `${p.name} مُرد (${killer ? `کشته‌ی ${killer.name}` : cause}). ${close ? "خیلی غمگینم." : ""}`);
      if (dist(p, q) < 400) speak(w, q, say("grief"));
      if (killer && killer !== q) addRel(q, killer, close ? -80 : -40);
    }
    if (q.spouse === p.id) q.spouse = null;
  }
  if (p.prophet) {
    const r = religionOf(w, p.religion);
    if (r) announce(w, `🕯️ ${p.name}، پیامبر «${r.name}»، درگذشت.`, p, "faith");
  }
  if (killer && infidel(p, killer)) grieve(w, p.religion, killer.religion, 8);
  if (killer) {
    remember(w, killer, `${p.name} را کشتم.`);
    addColRel(w, p.colony, killer.colony, -25);
    if (killer.traits.greed > 0.5 && p.wealth > 0) {
      killer.wealth += Math.round(p.wealth / 2);
      p.wealth = 0;
    }
  }
  // The house goes to the spouse, then a grown child, else it's left empty.
  const house = p.home && houseOf(w, p.home);
  if (house && house.owner === p.id) {
    const heir = alive(w).find((q) => q.home === house.id && isAdult(q));
    house.owner = heir ? heir.id : null;
  }
  // Coins spill on the ground.
  for (let i = 0; i < Math.min(p.wealth, 12); i++) dropCoin(w, p.x + rand(-30, 30), p.y + rand(-15, 15), 1, 0);
  p.wealth = 0;
  updateLeader(w, p.colony);
}

// ---------------------------------------------------------------- choosing

function nearest(list, p, test = () => true, max = Infinity) {
  let best = null;
  let bestD = max;
  for (const o of list) {
    if (!test(o)) continue;
    const d = dist(o, p);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

// Weigh everything this person could do, and pick. Each option is a score
// and a task maker; a little noise keeps people from being robots.
function decide(w, p) {
  const T = p.traits;
  const opts = [];
  const add = (score, make) => score > 0 && opts.push([score + rand(0, 0.25), make]);
  const until = (s) => w.t + s;
  const adult = isAdult(p);
  const others = w.people.filter((q) => q.alive && q !== p && !q.carried && q.z <= 0);
  const near = others.filter((q) => dist(p, q) < 520);

  // Soldiers follow their army.
  if (p.army) {
    const task = soldierTask(w, p);
    if (task) return task;
  }

  // A plan from the AI mind, if one is waiting.
  if (p.plan && !p.plan.used && w.t < p.plan.until) {
    p.plan.used = true;
    const task = planTask(w, p, p.plan);
    if (task) return task;
  }

  // Danger first: a burning home, a fire nearby, an enemy close.
  const fire = nearest(w.houses, p, (h) => h.fire > 0 && !h.ruined, 520);
  if (fire && adult) {
    const mine = fire.owner === p.id || fire.id === p.home || (fire.colony && fire.colony === p.colony);
    add(mine ? 2.2 : 0.5 * T.kind, () => ({ type: "extinguish", house: fire.id, until: until(20) }));
  }
  const threat = nearest(near, p, (q) => q.task?.type === "fight" && q.task.target === p.id, 200);
  if (threat) {
    const fightBack = T.brave * 0.8 + T.aggr * 0.6 + (p.health > 50 ? 0.3 : -0.6);
    add(fightBack, () => ({ type: "fight", target: threat.id, until: until(8) }));
    add(1.2 - fightBack, () => ({ type: "flee", from: threat.id, until: until(4) }));
  }

  // Body.
  if (p.food < 60) {
    const tree = nearest(w.trees, p, (t) => t.fruit > 0 && !t.dead && !t.burn);
    if (tree) add(((60 - p.food) / 60) * 1.8 + (p.food < 20 ? 1 : 0) + (p.food < 10 ? 2 : 0), () => ({ type: "gather", tree: tree.id, until: until(40) }));
    else if (p.food < 25 && chance(0.3)) speak(w, p, say("hungry"));
    const spot = fishingSpot(w, p);
    if (spot) add(((60 - p.food) / 60) * (tree ? 0.9 : 1.6) + (w.season === "winter" ? 0.4 : 0), () => ({ type: "fish", x: spot.x, y: spot.y, until: until(40) }));
  }
  if (p.energy < 35)
    add(((35 - p.energy) / 35) * 1.6 + 0.2, () => {
      const home = p.home && houseOf(w, p.home);
      return home && home.built >= 1 && !home.ruined && Math.hypot(home.x - p.x, home.y - p.y) < 700
        ? { type: "sleep", x: home.x + rand(-14, 14), y: home.y + 16, until: until(60) }
        : { type: "sleep", x: p.x, y: p.y, until: until(60) };
    });

  // Coins on the ground: greed.
  const coin = nearest(w.coins, p, (c) => c.z <= 0, 600);
  if (coin) add(0.5 + T.greed * 1.2, () => ({ type: "collect", coin: coin.id, until: until(15) }));

  if (!adult) {
    // Children stay near a parent and play.
    const parent = p.parents.map((id) => byId(w, id)).find((q) => q?.alive);
    if (parent) add(0.8, () => ({ type: "follow", target: parent.id, until: until(rand(4, 8)) }));
    add(0.4, () => wanderTask(w, p, 160));
    const kid = nearest(near, p, (q) => !isAdult(q), 300);
    if (kid) add(0.4 * (T.social + 0.5), () => ({ type: "chat", target: kid.id, until: until(12) }));
    return best(opts) ?? wanderTask(w, p, 120);
  }

  // Work and home.
  const rock = nearest(w.rocks, p);
  if (rock) add(0.35 + T.work * 0.5 + T.greed * 0.3 - p.wealth / 80, () => ({ type: "work", rock: rock.id, until: until(30) }));
  const home = p.home && houseOf(w, p.home);
  if (!home || home.ruined) {
    const empty = nearest(w.houses, p, (h) => h.kind === "house" && h.built >= 1 && !h.ruined && h.owner === null, 900);
    if (empty) add(1.1, () => ({ type: "claim", house: empty.id, until: until(40) }));
    else if (p.wealth >= HOUSE_COST) add(1.2, () => buildTask(w, p));
  } else if (home.built < 1) add(1.3, () => ({ type: "build", house: home.id, until: until(40) }));
  else if (home.owner === p.id && home.kind === "house" && home.level < 2 && p.wealth > 45)
    add(0.9, () => ({ type: "upgrade", house: home.id, until: until(40) }));
  // The tribe's temple or castle going up.
  const works = p.colony && nearest(w.houses, p, (b) => b.colony === p.colony && b.kind !== "house" && b.built < 1 && !b.ruined, 900);
  if (works) add(0.5 + T.work * 0.4 + (works.kind === "temple" ? T.faith * 0.4 : 0), () => ({ type: "build", house: works.id, until: until(40) }));

  // People.
  const lonely = (100 - p.social) / 100;
  const friend = pickSocial(p, near);
  if (friend) add(lonely * (0.6 + T.social) + 0.1, () => ({ type: "chat", target: friend.id, until: until(15) }));
  if (!p.spouse && p.age < 58) {
    const love = nearest(near, p, (q) => isAdult(q) && !q.spouse && q.age < 58 && rel(p, q) > 50 && !isFamily(p, q));
    if (love) add(0.8 + rel(p, love) / 100, () => ({ type: "court", target: love.id, until: until(15) }));
  }
  const enemy = nearest(near, p, (q) => (rel(p, q) < -40 && T.aggr > 0.45) || (atWar(w, p, q) && isAdult(q)), 480);
  if (enemy) {
    const war = atWar(w, p, enemy);
    add((war ? 0.7 : 0.2) + T.aggr * 1.1 + T.brave * 0.4 - (p.health < 65 ? 1.5 : 0), () => ({
      type: "fight",
      target: enemy.id,
      until: until(10),
      war,
    }));
  }
  if (T.greed > 0.55 && T.kind < 0.55 && p.wealth < 8) {
    const mark = nearest(near, p, (q) => q.wealth > 12 && isAdult(q) && !allied(w, p, q) && q.id !== p.spouse, 450);
    if (mark) add(T.greed * 0.9 - T.kind * 0.5, () => ({ type: "steal", target: mark.id, until: until(15) }));
  }
  if (T.kind > 0.55 && p.wealth > 25) {
    const poor = nearest(near, p, (q) => q.wealth < 5 && rel(p, q) > 0 && isAdult(q), 450);
    if (poor) add(T.kind * 0.6, () => ({ type: "gift", target: poor.id, until: until(15) }));
  }
  // At war: raid an enemy house.
  if (p.colony && T.aggr + T.brave > 1) {
    const col = colonyOf(w, p.colony);
    const raid = nearest(w.houses, p, (h) => h.colony && colStatus(col, colonyOf(w, h.colony)) === "war" && !h.ruined && h.built >= 1, 1400);
    if (raid) add(0.25 + T.aggr * 0.7, () => ({ type: "raid", house: raid.id, until: until(30) }));
  }
  // Pray when life is hard (or just devout) — at the temple if there is one.
  const mood = happiness(w, p);
  if (T.faith > 0.35)
    add((mood < -20 ? 0.7 : 0.1) * T.faith * 1.6, () => {
      const temple = p.religion && nearest(w.houses, p, (b) => b.kind === "temple" && b.built >= 1 && !b.ruined && b.religion === p.religion, 700);
      return temple ? { type: "pray", x: temple.x + rand(-50, 50), y: temple.y + rand(20, 45), until: until(20) } : { type: "pray", until: until(5) };
    });
  // Spread the word.
  if (p.religion && T.faith > 0.6) {
    const soul = nearest(near, p, (q) => isAdult(q) && q.religion !== p.religion && (q.rel[p.id] ?? 0) > -25 && !q.army, 420);
    if (soul) add((T.faith - 0.5) * (p.prophet ? 2.2 : 1) * (0.5 + T.social), () => ({ type: "preach", target: soul.id, until: until(15) }));
  }
  // The pilgrimage.
  if (p.religion && T.faith > 0.65 && Math.hypot(p.x - w.holy.x, p.y - w.holy.y) > 500)
    add(0.12 * T.faith, () => ({ type: "pilgrim", x: w.holy.x + rand(-90, 90), y: w.holy.y + rand(-30, 50), until: until(DAY * 1.2) }));

  add(0.22, () => wanderTask(w, p, 300));
  return best(opts) ?? wanderTask(w, p, 200);
}

function best(opts) {
  if (!opts.length) return null;
  opts.sort((a, b) => b[0] - a[0]);
  return opts[0][1]();
}

const isFamily = (a, b) =>
  a.parents.includes(b.id) || b.parents.includes(a.id) || a.parents.some((id) => b.parents.includes(id));

function pickSocial(p, near) {
  let bestQ = null;
  let bestS = -Infinity;
  for (const q of near) {
    if (!isAdult(q) || q.task?.type === "sleep" || q.task?.type === "fight") continue;
    const s = rel(p, q) / 40 - dist(p, q) / 300 + rand(0, 1.2) + (q.colony && q.colony === p.colony ? 0.4 : 0);
    if (s > bestS) {
      bestS = s;
      bestQ = q;
    }
  }
  return bestQ;
}

// The nearest bank of the river (on this side) or of a lake.
function fishingSpot(w, p) {
  const t = w.terrain;
  const rx = t.riverX(p.y);
  const half = t.width(p.y) / 2 + 14;
  let best = { x: p.x < rx ? rx - half : rx + half, y: p.y };
  let bd = Math.abs(best.x - p.x);
  for (const l of t.lakes) {
    const a = Math.atan2((p.y - l.y) / l.ry, (p.x - l.x) / l.rx);
    const e = { x: l.x + Math.cos(a) * (l.rx + 14), y: l.y + Math.sin(a) * (l.ry + 10) };
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bd) (best = e), (bd = d);
  }
  return bd < 1800 ? best : null;
}

function wanderTask(w, p, r) {
  const home = p.home && houseOf(w, p.home);
  const cx = home && !home.ruined && chance(0.6) ? home.x : p.x;
  const cy = home && !home.ruined && chance(0.6) ? home.y + 30 : p.y;
  return { type: "wander", x: cx + rand(-r, r), y: cy + rand(-r * 0.6, r * 0.6), until: w.t + rand(6, 14) };
}

function buildTask(w, p) {
  // Near the spouse, the tribe, or just here.
  const col = p.colony && colonyOf(w, p.colony);
  const anchor = col ? colonyCenter(w, col) : p;
  const spot = findSpot(w, anchor.x, anchor.y, 280) ?? findSpot(w, p.x, p.y, 400);
  if (!spot) return wanderTask(w, p, 300);
  p.wealth -= HOUSE_COST;
  const house = newBuilding(w, "house", spot, p);
  p.home = house.id;
  const spouse = p.spouse && byId(w, p.spouse);
  if (spouse && !spouse.home) spouse.home = house.id;
  return { type: "build", house: house.id, until: w.t + 40 };
}

export function colonyCenter(w, c) {
  const pts = membersOf(w, c).map((p) => houseOf(w, p.home) ?? p);
  if (!pts.length) return { x: w.W / 2, y: w.H / 2 };
  return { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length };
}

// ---------------------------------------------------------------- doing

function goTo(p, x, y) {
  p.tx = x;
  p.ty = y;
}
const arrived = (p, r = 14) => Math.hypot(p.tx - p.x, p.ty - p.y) < r;
const done = (p) => (p.task = null);

function runTask(w, p, dt) {
  const k = p.task;
  const T = p.traits;
  switch (k.type) {
    case "wander":
    case "sleep_spot":
      goTo(p, k.x, k.y);
      if (arrived(p)) k.idle = (k.idle ?? rand(1, 3)) - dt;
      if (k.idle < 0) done(p);
      return;
    case "fish":
      goTo(p, k.x, k.y);
      if (arrived(p, 18)) {
        k.working = true;
        k.fishing = true;
        p.facing = w.terrain.riverX(p.y) > p.x ? 1 : -1;
        k.left = (k.left ?? rand(4, 7)) - dt;
        if (k.left < 0) {
          if (chance(0.75)) {
            p.food = Math.min(100, p.food + 40);
            fx(w, "pop", p.x, p.y - 70, 0.8, { text: "🐟" });
          }
          done(p);
        }
      }
      return;
    case "march":
      goTo(p, k.x, k.y);
      k.running = Math.hypot(k.x - p.x, k.y - p.y) > 60;
      return;
    case "shoot": {
      const q = byId(w, k.target);
      if (!q?.alive || q.carried) return done(p);
      const d = dist(p, q);
      if (d > 260) goTo(p, q.x + (p.x < q.x ? -200 : 200), q.y);
      else if (d < 110) goTo(p, p.x + (p.x - q.x) * 0.8, p.y + (p.y - q.y) * 0.4);
      else {
        goTo(p, p.x, p.y);
        p.facing = q.x > p.x ? 1 : -1;
        k.aim = (k.aim ?? rand(0.6, 1.2)) - dt;
        k.working = true;
        if (k.aim < 0) {
          shoot(w, p, q);
          k.aim = rand(1.1, 1.6);
        }
      }
      return;
    }
    case "pilgrim":
      goTo(p, k.x, k.y);
      if (arrived(p, 30)) {
        k.kneel = true;
        k.idle = (k.idle ?? 6) - dt;
        if (!k.said) {
          k.said = true;
          const r = religionOf(w, p.religion);
          speak(w, p, `${r?.symbol ?? "🙏"} ای ${r?.god ?? "خدا"}…`, 4);
          p.traits.faith = Math.min(1, p.traits.faith + 0.04);
          p.mod += 12;
          remember(w, p, `به زیارت ${w.holy.name} رفتم.`);
          // Strangers of another faith in the holy city: trouble.
          const other = nearest(alive(w), p, (q) => infidel(p, q) && isAdult(q), 160);
          if (other && chance(0.4)) {
            grieve(w, p.religion, other.religion, 5);
            addBoth(p, other, -15);
            speak(w, other, "این‌جا جای تو نیست!", 3);
          }
        }
        if (k.idle < 0) done(p);
      }
      return;
    case "upgrade": {
      const h = houseOf(w, k.house);
      if (!h || h.ruined || h.level >= 2 || p.wealth < 25) return done(p);
      goTo(p, h.x + 34, h.y + 10);
      if (arrived(p)) {
        k.working = true;
        k.left = (k.left ?? 7) - dt;
        if (k.left < 0) {
          p.wealth -= 25;
          h.level = 2;
          h.hp = h.maxHp = 160;
          remember(w, p, "خانه‌ام را سنگی کردم.");
          log(w, `🧱 ${p.name} خانه‌اش را سنگی کرد.`, h, "build");
          done(p);
        }
      }
      return;
    }
    case "listen": {
      const q = byId(w, k.target);
      if (!q?.alive) return done(p);
      goTo(p, p.x, p.y);
      p.facing = q.x > p.x ? 1 : -1;
      return;
    }
    case "follow": {
      const q = byId(w, k.target);
      if (!q?.alive) return done(p);
      if (dist(p, q) > 50) goTo(p, q.x - q.facing * 30, q.y + 8);
      else goTo(p, p.x, p.y);
      return;
    }
    case "gather": {
      const tree = w.trees.find((t) => t.id === k.tree);
      if (!tree || tree.fruit <= 0 || tree.dead || tree.burn) return done(p);
      goTo(p, tree.x + 22 * (p.x < tree.x ? -1 : 1), tree.y + 6);
      if (arrived(p)) {
        k.eat = (k.eat ?? 1.5) - dt;
        if (k.eat < 0) {
          tree.fruit--;
          p.food = Math.min(100, p.food + 50);
          fx(w, "pop", tree.x, tree.y - 60, 0.6, { text: "🍎" });
          done(p);
        }
      }
      return;
    }
    case "work": {
      const rock = w.rocks.find((r) => r.id === k.rock);
      if (!rock) return done(p);
      if (k.side == null) k.side = rand(-1, 1);
      goTo(p, rock.x + k.side * (rock.r + 14), rock.y + 10);
      if (arrived(p)) {
        k.working = true;
        k.left = (k.left ?? rand(3, 5)) - dt;
        if (chance(dt * 0.1)) speak(w, p, say("work"));
        if (k.left < 0) {
          const pay = Math.round(2 + T.work * 4 + rand(0, 2));
          p.wealth += pay;
          p.energy -= 6;
          fx(w, "pop", p.x, p.y - 70, 0.8, { text: `+${pay}🪙` });
          done(p);
        }
      }
      return;
    }
    case "claim": {
      const h = houseOf(w, k.house);
      if (!h || h.owner !== null || h.ruined) return done(p);
      goTo(p, h.x, h.y + 20);
      if (arrived(p)) {
        h.owner = p.id;
        h.colony = p.colony;
        p.home = h.id;
        const s = p.spouse && byId(w, p.spouse);
        if (s) s.home = h.id;
        remember(w, p, "یک خانه‌ی خالی پیدا کردم و مال خودم شد.");
        done(p);
      }
      return;
    }
    case "build": {
      const h = houseOf(w, k.house);
      if (!h || h.ruined) return done(p);
      if (k.side == null) k.side = rand(-1, 1);
      const span = h.kind === "house" ? 44 : 80;
      goTo(p, h.x + k.side * span, h.y + 12);
      if (arrived(p)) {
        k.working = true;
        const was = h.built;
        h.built = Math.min(1, h.built + dt / (h.kind === "house" ? 9 : 60));
        if (was >= 1) return done(p);
        if (chance(dt * 0.15)) speak(w, p, say("build"));
        if (h.built >= 1) {
          const c = colonyOf(w, h.colony);
          if (h.kind === "temple") announce(w, `⛪ معبد «${c?.name ?? ""}» ساخته شد.`, h, "build");
          else if (h.kind === "keep") announce(w, `🏰 قلعه‌ی «${c?.name ?? ""}» سر به آسمان کشید.`, h, "build");
          else {
            log(w, `🏠 ${p.name} خانه ساخت.`, h, "build");
            remember(w, p, "خانه‌ی خودم را ساختم.");
          }
          p.mod += 20;
          done(p);
        }
      }
      return;
    }
    case "sleep":
      goTo(p, k.x, k.y);
      if (arrived(p)) {
        k.asleep = true;
        if (p.energy >= 100) done(p);
      }
      return;
    case "collect": {
      const c = w.coins.find((c) => c.id === k.coin);
      if (!c) return done(p);
      goTo(p, c.x, c.y);
      if (arrived(p, 12)) {
        p.wealth += c.value;
        w.coins = w.coins.filter((o) => o !== c);
        if (chance(0.25)) speak(w, p, say("gold"));
        done(p);
      }
      return;
    }
    case "pray":
      if (k.x != null && !arrived(p, 20)) {
        goTo(p, k.x, k.y);
        return;
      }
      if (k.x != null && k.idle == null) k.idle = 5;
      if (k.idle != null && (k.idle -= dt) < 0) return done(p);
      goTo(p, p.x, p.y);
      k.kneel = true;
      if (!k.said) {
        k.said = true;
        const mood = happiness(w, p);
        speak(w, p, say(mood < -30 && T.faith < 0.55 ? "pray_angry" : "pray"), 4);
        if (chance(0.3)) log(w, `🙏 ${p.name} دعا می‌کند: «${p.speech?.text}»`, p, "pray");
        p.mod += 4;
      }
      return;
    case "extinguish": {
      const h = houseOf(w, k.house);
      if (!h || h.ruined || h.fire <= 0) return done(p);
      goTo(p, h.x + (p.id % 2 ? 40 : -40), h.y + 18);
      if (arrived(p, 20)) {
        k.working = true;
        h.fire = Math.max(0, h.fire - dt * 0.12);
        if (chance(dt * 2)) fx(w, "splash", h.x + rand(-20, 20), h.y - rand(10, 50), 0.5);
        if (h.fire <= 0) {
          remember(w, p, "آتشِ خانه را خاموش کردیم.");
          done(p);
        }
      }
      return;
    }
    case "flee": {
      const from = byId(w, k.from) ?? { x: k.x, y: k.y };
      const d = Math.max(1, dist(p, from));
      goTo(p, p.x + ((p.x - from.x) / d) * 200, p.y + ((p.y - from.y) / d) * 120);
      k.running = true;
      if (!k.said) {
        k.said = true;
        speak(w, p, say("flee"), 1.6);
      }
      return;
    }
    case "raid": {
      const h = houseOf(w, k.house);
      if (!h || h.ruined) return done(p);
      goTo(p, h.x + (p.id % 2 ? 36 : -36), h.y + 14);
      if (!k.said) {
        k.said = true;
        speak(w, p, say("war"));
      }
      if (arrived(p, 22)) {
        k.working = true;
        h.hp -= dt * 7;
        if (chance(dt * 0.08)) h.fire = Math.max(h.fire, 0.4); // a torch
        if (h.hp <= 0) ruin(w, h, `${p.name} در جنگ`);
      }
      return;
    }
    default:
      return meet(w, p, dt);
  }
}

// Tasks with another person: walk up to them, then do the thing.
function meet(w, p, dt) {
  const k = p.task;
  const q = byId(w, k.target);
  if (!q?.alive || q.carried || q.z > 0) return done(p);
  const d = dist(p, q);
  const reach = k.type === "fight" ? 34 : 40;
  if (d > reach) {
    goTo(p, q.x + (p.x < q.x ? -reach * 0.7 : reach * 0.7), q.y);
    if (d > 700) done(p);
    return;
  }
  goTo(p, p.x, p.y);
  p.facing = q.x > p.x ? 1 : -1;
  // Hold the other person still for a talk (unless they're busy with
  // something that matters more).
  if (k.type !== "fight" && !k.started) {
    const busy = ["fight", "flee", "extinguish", "sleep"].includes(q.task?.type);
    if (busy) return done(p);
    q.task = { type: "listen", target: p.id, until: w.t + 3.2 };
    q.facing = -p.facing;
  }
  k.started = true;
  k.clock = (k.clock ?? 0) + dt;

  if (k.type === "fight") return fight(w, p, q, dt);
  if (!k.said) {
    k.said = true;
    if (k.type === "chat") speak(w, p, rel(p, q) > 30 ? say(chance(0.5) ? "like" : "greet", q) : say(chance(0.5) ? "greet" : "chat", q));
    if (k.type === "court") speak(w, p, say("propose", q), 3);
    if (k.type === "steal") speak(w, p, say("steal"), 1.5);
    if (k.type === "gift") speak(w, p, say("gift"));
    if (k.type === "preach") {
      const r = religionOf(w, p.religion);
      speak(w, p, r ? `${r.symbol} ${pick([`${r.god} تنها راه است!`, `به «${r.name}» بپیوند`, `${r.god} تو را دوست دارد`])}` : "", 3);
    }
  }
  if (k.clock < 2.6) return;

  if (k.type === "chat") {
    // How well it went depends on how alike they are and how nice.
    const T = p.traits;
    const U = q.traits;
    const alike = 1 - (Math.abs(T.kind - U.kind) + Math.abs(T.aggr - U.aggr) + Math.abs(T.faith - U.faith) + Math.abs(T.greed - U.greed)) / 2;
    let d = 12 * (alike - 0.3) + 8 * ((T.kind + U.kind) / 2 - 0.5) - 10 * ((T.aggr + U.aggr) / 2 - 0.5) + rand(-7, 7) + 1;
    if (p.colony && p.colony === q.colony) d += 4;
    if (atWar(w, p, q)) d -= 12;
    if (infidel(p, q)) d -= 2 + (T.faith + U.faith) * 2;
    else if (p.religion && p.religion === q.religion) d += 3;
    addBoth(p, q, d);
    p.social = Math.min(100, p.social + 40);
    q.social = Math.min(100, q.social + 40);
    addColRel(w, p.colony, q.colony, d > 0 ? 0.6 : -1);
    if (d < -6) {
      speak(w, q, say("insult"));
      remember(w, q, `${p.name} اعصابم را خرد کرد.`);
      if (U.aggr > 0.6 && rel(q, p) < -30) q.task = { type: "fight", target: p.id, until: w.t + 8 };
    } else {
      speak(w, q, say(d > 8 ? "like" : "chat", p));
      if (d > 12 && chance(0.4)) fx(w, "heart", (p.x + q.x) / 2, p.y - 80, 1.2);
    }
    if (Math.abs(d) > 10 && chance(0.5)) remember(w, p, `با ${q.name} حرف زدم؛ ${d > 0 ? "خوب بود." : "بد پیش رفت."}`);
  }
  if (k.type === "court") {
    if (!q.spouse && !p.spouse && rel(q, p) > 38 && isAdult(q)) {
      speak(w, q, say("accept"), 3);
      marry(w, p, q);
    } else {
      speak(w, q, say("reject"));
      addRel(p, q, -10);
      p.mod -= 15;
      remember(w, p, `از ${q.name} خواستگاری کردم؛ جواب رد داد.`);
    }
  }
  if (k.type === "steal") {
    const seen = chance(0.35 + q.traits.brave * 0.2);
    const take = Math.max(1, Math.round(q.wealth * rand(0.2, 0.5)));
    if (!seen) {
      q.wealth -= take;
      p.wealth += take;
      remember(w, p, `از ${q.name} ${take} سکه دزدیدم.`);
      if (chance(0.3)) log(w, `🦝 ${p.name} از ${q.name} دزدی کرد.`, p, "crime");
    } else {
      speak(w, q, say("caught"));
      addRel(q, p, -45);
      addColRel(w, p.colony, q.colony, -8);
      remember(w, q, `${p.name} می‌خواست از من دزدی کند!`);
      log(w, `🚨 ${q.name} مچ ${p.name} را موقع دزدی گرفت.`, p, "crime");
      q.task = q.traits.aggr + q.traits.brave > 0.9 ? { type: "fight", target: p.id, until: w.t + 8 } : null;
      p.task = { type: "flee", from: q.id, until: w.t + 4 };
      return;
    }
  }
  if (k.type === "preach") preachResult(w, p, q);
  if (k.type === "gift") {
    const give = Math.round(p.wealth * 0.25);
    p.wealth -= give;
    q.wealth += give;
    addRel(q, p, 25);
    addRel(p, q, 8);
    p.mod += 8;
    speak(w, q, say("thanks"));
    fx(w, "pop", q.x, q.y - 80, 0.9, { text: `+${give}🪙` });
    remember(w, q, `${p.name} به من ${give} سکه هدیه داد.`);
  }
  done(p);
}

function fight(w, p, q, dt) {
  const k = p.task;
  k.hit = (k.hit ?? 0) - dt;
  if (!k.said) {
    k.said = true;
    const faith = p.army && religionOf(w, p.religion);
    speak(w, p, faith ? `${faith.symbol} ${pick([`برای ${faith.god}!`, "خدا با ماست!", "حمله!", `مرگ بر دشمنان ${faith.name.replace("آیین ", "")}!`])}` : say(k.war ? "war" : "fight"), 1.6);
    remember(w, q, `${p.name} به من حمله کرد!`);
    addRel(q, p, -30);
    addColRel(w, p.colony, q.colony, -6);
    if (chance(0.5)) log(w, `🥊 ${p.name} با ${q.name} دعوا کرد.`, p, "fight");
    // The other decides: fight back or run.
    if (q.task?.type !== "fight") {
      const back = q.traits.brave * 0.8 + q.traits.aggr * 0.6 + (q.health > 50 ? 0.2 : -0.6) > 0.7;
      q.task = back ? { type: "fight", target: p.id, until: w.t + 8, started: true } : { type: "flee", from: p.id, until: w.t + 4 };
    }
  }
  // Let a beaten enemy run (the cruel chase them down).
  if (q.task?.type === "flee" && q.health < 55 && p.traits.aggr < 0.78) {
    if (chance(0.5)) speak(w, p, "فرار کن، ترسو!", 1.5);
    done(p);
    return;
  }
  if (k.hit <= 0) {
    k.hit = 0.8;
    const dmg = (4 + p.traits.aggr * 6 + p.traits.brave * 2) * rand(0.5, 1.2);
    fx(w, "hit", (p.x + q.x) / 2, p.y - 45, 0.35);
    hurt(w, q, dmg, "دعوا", p.id);
    if (!q.alive) {
      if (k.war) {
        const c = colonyOf(w, p.colony);
        if (c) c.losses = (c.losses ?? 0) + 1;
        const e = colonyOf(w, q.colony);
        if (e) e.losses = (e.losses ?? 0) + 1;
      }
      done(p);
      return;
    }
    // Most people stop once the other is down; the cruel (and soldiers) don't.
    if (q.health < 30 && p.traits.aggr < (k.war ? 0.72 : 0.8)) {
      speak(w, p, k.war ? "برو، دیگه این طرفا نبینمت!" : "دیگه تمومه. برو!");
      remember(w, q, `${p.name} کتکم زد ولی ولم کرد.`);
      q.task = { type: "flee", from: p.id, until: w.t + 6 };
      done(p);
      return;
    }
  }
  // Too hurt: run.
  if (p.health < 45 - p.traits.brave * 25) p.task = { type: "flee", from: q.id, until: w.t + 6 };
}

function marry(w, a, b) {
  a.spouse = b.id;
  b.spouse = a.id;
  addBoth(a, b, 20);
  a.mod += 30;
  b.mod += 30;
  w.stats.married++;
  fx(w, "heart", (a.x + b.x) / 2, a.y - 90, 2.5, { big: true });
  log(w, `💍 ${a.name} و ${b.name} ازدواج کردند!`, a, "love");
  remember(w, a, `با ${b.name} ازدواج کردم.`);
  remember(w, b, `با ${a.name} ازدواج کردم.`);
  // One home, one tribe.
  const home = (a.home && houseOf(w, a.home)) || (b.home && houseOf(w, b.home));
  if (home && !home.ruined) a.home = b.home = home.id;
  if (a.colony !== b.colony) {
    if (a.colony && b.colony) addColRel(w, a.colony, b.colony, 20);
    const join = a.colony ?? b.colony;
    if (!a.colony) joinColony(w, a, colonyOf(w, join));
    else if (!b.colony) joinColony(w, b, colonyOf(w, join));
  }
}

function move(w, p, dt) {
  const k = p.task;
  const still = k?.working || k?.kneel || (k?.type === "sleep" && k.asleep) || k?.type === "listen";
  let dx = p.tx - p.x;
  let dy = p.ty - p.y;
  const d = Math.hypot(dx, dy);
  let sp = SPEED * (isAdult(p) ? 1 : 0.85) * (p.energy < 15 ? 0.6 : 1) * (k?.running || k?.type === "fight" ? 1.5 : 1);
  if (p.sick) sp *= 0.7;
  p.wet = isWater(w.terrain, p.x, p.y);
  if (p.wet) sp *= 0.45;
  if (w.weather.type === "snow") sp *= 0.8;
  if (still || d < 2) {
    p.vx *= 0.7;
    p.vy *= 0.7;
  } else {
    p.vx += ((dx / d) * sp - p.vx) * Math.min(1, dt * 6);
    p.vy += ((dy / d) * sp * 0.75 - p.vy) * Math.min(1, dt * 6);
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const v = Math.hypot(p.vx, p.vy);
  p.phase += v * dt * 0.18;
  if (p.vx > 8) p.facing = 1;
  else if (p.vx < -8) p.facing = -1;
  keepIn(w, p);
}

function keepIn(w, p) {
  p.x = clamp(p.x, 30, w.W - 30);
  p.y = clamp(p.y, 200, w.H - 20);
}

// Keep a little personal space.
function separate(w) {
  const ps = w.people;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (!a.alive || a.carried || a.z > 0) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (!b.alive || b.carried || b.z > 0) continue;
      const dx = a.x - b.x;
      const dy = (a.y - b.y) * 1.8;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < 22) {
        const push = (22 - d) * 0.08;
        a.x += (dx / d) * push;
        b.x -= (dx / d) * push;
        a.y += (dy / d) * push * 0.5;
        b.y -= (dy / d) * push * 0.5;
      }
    }
  }
}

// ---------------------------------------------------------------- each day

function dayTick(w) {
  // Trees fruit, burnt stumps sprout again.
  for (const t of w.trees) {
    if (t.dead) {
      if (w.day - t.deadAt > 5) {
        t.dead = false;
        t.fruit = 0;
      }
    } else t.fruit = Math.min(4, t.fruit + { spring: randInt(1, 2), summer: randInt(1, 3), autumn: randInt(2, 3), winter: randInt(0, 1) }[w.season]);
  }
  // Rubble is cleared after a few days.
  w.houses = w.houses.filter((h) => !h.ruined || w.day - h.ruinedAt < 4);
  // The sick get better, or not.
  for (const p of alive(w)) {
    if (p.sick && chance(0.35)) {
      p.sick = 0;
      remember(w, p, "از طاعون جان سالم به در بردم.");
    }
    // Children grow up and leave the nest (a little).
    if (Math.abs(p.age - ADULT) < 1 && p.parents.length) remember(w, p, "بزرگ شدم!");
  }
  const season = seasonOf(w.day);
  if (season.id !== w.season) {
    w.season = season.id;
    if (w.day > 0) announce(w, `${season.icon} ${season.name} از راه رسید.`, null, "season");
  }
  births(w);
  immigrants(w);
  tribes(w);
  politics(w);
  faithDay(w);
}

function births(w) {
  for (const a of alive(w)) {
    const b = a.spouse && byId(w, a.spouse);
    if (!b?.alive || a.id > b.id) continue;
    if (!isAdult(a) || !isAdult(b) || a.age > 55 || b.age > 55) continue;
    const home = a.home && houseOf(w, a.home);
    if (!home || home.built < 1 || home.ruined) continue;
    const kids = a.kids.filter((id) => byId(w, id)?.alive).length;
    if (kids >= 5) continue;
    if (!chance(0.4 * (happiness(w, a) > 0 ? 1 : 0.5))) continue;
    const mix = (k) => clamp((a.traits[k] + b.traits[k]) / 2 + rand(-0.25, 0.25), 0, 1);
    const kid = makePerson(w, home.x + rand(-20, 20), home.y + 24, {
      age: 0,
      shape: chance(0.45) ? a.shape : chance(0.8) ? b.shape : pick(SHAPES),
      color: chance(0.5) ? a.color : b.color,
      traits: Object.fromEntries(Object.keys(a.traits).map((k) => [k, mix(k)])),
      wealth: 0,
      food: 90,
      parents: [a.id, b.id],
      home: home.id,
      colony: a.colony ?? b.colony,
      religion: a.religion ?? b.religion,
    });
    a.kids.push(kid.id);
    b.kids.push(kid.id);
    addBoth(a, kid, 70);
    addBoth(b, kid, 70);
    a.mod += 25;
    b.mod += 25;
    w.stats.born++;
    speak(w, a, say("baby"), 3);
    fx(w, "heart", home.x, home.y - 90, 2);
    log(w, `👶 ${kid.name} به دنیا آمد، بچه‌ی ${a.name} و ${b.name}.`, home, "birth");
    remember(w, a, `بچه‌مان ${kid.name} به دنیا آمد.`);
    remember(w, b, `بچه‌مان ${kid.name} به دنیا آمد.`);
  }
}

// When the land empties, newcomers wander in from the edges.
function immigrants(w) {
  const n = alive(w).length;
  if (n >= 30 || !chance(0.6)) return;
  const west = chance(0.5);
  const x = west ? 90 : w.W - 90;
  const y = rand(300, w.H - 200);
  const k = randInt(2, 4);
  for (let i = 0; i < k; i++) {
    const p = makePerson(w, x + rand(-40, 40), y + rand(-40, 40), { age: rand(ADULT, 30), wealth: randInt(5, 20) });
    remember(w, p, "از سرزمینی دور به این‌جا کوچ کردم.");
  }
  log(w, `🧳 ${k} مهاجر از ${west ? "غرب" : "شرق"} از راه رسیدند.`, { x, y }, "colony");
}

// People band together into tribes: with their spouse, with their friends.
function tribes(w) {
  for (const p of alive(w)) {
    if (!isAdult(p)) continue;
    if (p.colony) {
      const c = colonyOf(w, p.colony);
      const leader = c && byId(w, c.leader);
      if (leader && leader !== p && rel(p, leader) < -45 && chance(0.4)) leaveColony(w, p, `از ${leader.name} بدم می‌آید`);
      continue;
    }
    const spouse = p.spouse && byId(w, p.spouse);
    if (spouse?.colony) {
      joinColony(w, p, colonyOf(w, spouse.colony));
      continue;
    }
    const friends = alive(w).filter((q) => q !== p && isAdult(q) && rel(p, q) > 30 && rel(q, p) > 15);
    const inTribe = friends.filter((q) => q.colony).sort((a, b) => rel(p, b) - rel(p, a));
    if (inTribe.length && chance(0.55)) {
      joinColony(w, p, colonyOf(w, inTribe[0].colony));
      continue;
    }
    const free = friends.filter((q) => !q.colony);
    if (free.length >= 2 && chance(0.35 + p.traits.social * 0.3)) foundColony(w, p, free.slice(0, 4));
  }
}

export function foundColony(w, p, with_ = [], quiet = false) {
  if (p.colony) leaveColony(w, p, "");
  const used = new Set(w.colonies.map((c) => c.name));
  const taken = new Set(w.colonies.map((c) => c.color));
  const c = {
    id: w.nextId++,
    name: makeColonyName(used),
    color: COLONY_COLORS.find((k) => !taken.has(k)) ?? pick(COLONY_COLORS),
    founder: p.id,
    leader: p.id,
    rel: {},
    status: {},
    since: {},
    founded: w.day,
  };
  w.colonies.push(c);
  if (!quiet) log(w, `🚩 ${p.name} «${c.name}» را بنیان گذاشت.`, p, "colony");
  remember(w, p, `«${c.name}» را بنیان گذاشتم و رهبرش شدم.`);
  joinColony(w, p, c, true);
  for (const q of with_) if (!q.colony) joinColony(w, q, c, quiet);
  c.religion = p.religion;
  for (const o of w.colonies) if (o !== c) c.rel[o.id] = o.rel[c.id] = rand(-15, 10);
  return c;
}

export function joinColony(w, p, c, quiet = false) {
  if (!c) return;
  if (p.colony && p.colony !== c.id) leaveColony(w, p, "");
  p.colony = c.id;
  const h = p.home && houseOf(w, p.home);
  if (h && h.owner === p.id) h.colony = c.id;
  for (const kid of p.kids.map((id) => byId(w, id))) if (kid?.alive && !isAdult(kid)) kid.colony = c.id;
  if (!quiet) {
    log(w, `➕ ${p.name} به «${c.name}» پیوست.`, p, "colony");
    remember(w, p, `به «${c.name}» پیوستم.`);
  }
}

export function leaveColony(w, p, why) {
  const c = colonyOf(w, p.colony);
  p.colony = null;
  const h = p.home && houseOf(w, p.home);
  if (h && h.owner === p.id) h.colony = null;
  if (!c) return;
  if (why) {
    log(w, `➖ ${p.name} از «${c.name}» جدا شد (${why}).`, p, "colony");
    remember(w, p, `از «${c.name}» جدا شدم.`);
  }
  updateLeader(w, c.id);
}

function updateLeader(w, colonyId) {
  const c = colonyOf(w, colonyId);
  if (!c) return;
  const members = membersOf(w, c).filter(isAdult);
  if (!members.length) {
    // Nobody left: the tribe is gone (its children go free).
    for (const p of membersOf(w, c)) p.colony = null;
    w.colonies = w.colonies.filter((o) => o !== c);
    for (const o of w.colonies) {
      delete o.rel[c.id];
      delete o.status[c.id];
    }
    log(w, `🏳️ «${c.name}» از بین رفت.`, null, "colony");
    return;
  }
  const leader = byId(w, c.leader);
  if (leader?.alive && leader.colony === c.id) return;
  members.sort((a, b) => b.wealth + b.age - (a.wealth + a.age));
  c.leader = members[0].id;
  log(w, `👑 ${members[0].name} رهبر «${c.name}» شد.`, members[0], "colony");
  remember(w, members[0], `رهبر «${c.name}» شدم.`);
}

// Tribes drift towards what their people feel for each other, and go to war,
// make peace, or make friends.
function politics(w) {
  const cs = w.colonies;
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i];
      const b = cs[j];
      const ma = membersOf(w, a);
      const mb = membersOf(w, b);
      let sum = 0;
      let n = 0;
      for (const p of ma) for (const q of mb) if (p.rel[q.id] != null) (sum += p.rel[q.id]), n++;
      const feel = n ? sum / n : 0;
      const status = colStatus(a, b);
      const la = byId(w, a.leader);
      const lb = byId(w, b.leader);
      const hawk = Math.max(la?.traits.aggr ?? 0, lb?.traits.aggr ?? 0);
      const dove = Math.min(la?.traits.kind ?? 0.5, lb?.traits.kind ?? 0.5);
      // Neighbours rub against each other; the rich are envied; hawks push.
      const ca = colonyCenter(w, a);
      const cb = colonyCenter(w, b);
      const border = Math.max(0, 1 - Math.hypot(ca.x - cb.x, ca.y - cb.y) / 1100);
      const wa = ma.reduce((s, p) => s + p.wealth, 0) / Math.max(1, ma.length);
      const wb = mb.reduce((s, p) => s + p.wealth, 0) / Math.max(1, mb.length);
      const envy = Math.min(1, Math.abs(wa - wb) / 40);
      const tension = border * 4 + envy * 2 + (hawk - 0.5) * 6 - (dove - 0.5) * 6;
      let r = colRel(a, b);
      r += (feel * 0.6 - r) * 0.1 - tension + rand(-6, 6);
      if (border > 0.3 && chance(0.25 * border)) {
        // A quarrel at the border: someone from each side.
        const p = pick(ma.filter(isAdult));
        const q = pick(mb.filter(isAdult));
        if (p && q) {
          addBoth(p, q, -15);
          remember(w, p, `سر مرز با ${q.name} از «${b.name}» دعوایمان شد.`);
          remember(w, q, `سر مرز با ${p.name} از «${a.name}» دعوایمان شد.`);
          r -= 6;
        }
      }
      if (status === "war") r -= 1;
      a.rel[b.id] = b.rel[a.id] = clamp(r, -100, 100);
      const since = w.day - (a.since[b.id] ?? w.day);
      if (status !== "war" && r < -40 && chance(0.25 + hawk * 0.4)) setStatus(w, a, b, "war");
      else if (status === "war") {
        // Every funeral makes peace likelier.
        const weary = ((a.losses ?? 0) + (b.losses ?? 0)) * 0.08;
        if (r > -15 || (since > 2 && chance(0.15 + (1 - hawk) * 0.3 + weary))) setStatus(w, a, b, "peace");
      } else if (!status && (r > 35 || (commonEnemy(w, a, b) && r > -20)) && chance(0.4)) setStatus(w, a, b, "ally");
      else if (status === "ally" && r < 10) setStatus(w, a, b, null, "اتحاد «" + a.name + "» و «" + b.name + "» به هم خورد.");
    }
}

const commonEnemy = (w, a, b) =>
  w.colonies.some((c) => c !== a && c !== b && colStatus(a, c) === "war" && colStatus(b, c) === "war");

export function setStatus(w, a, b, status, text) {
  const la = byId(w, a.leader);
  if (status === "war") {
    a.status[b.id] = b.status[a.id] = "war";
    w.stats.wars++;
    a.rel[b.id] = b.rel[a.id] = Math.min(colRel(a, b), -50);
    if (text !== " ") log(w, text ?? `⚔️ «${a.name}» به «${b.name}» اعلان جنگ کرد!`, la, "war");
    for (const p of [...membersOf(w, a), ...membersOf(w, b)]) remember(w, p, `«${a.name}» و «${b.name}» وارد جنگ شدند.`);
  } else if (status === "peace") {
    a.status[b.id] = b.status[a.id] = null;
    a.losses = b.losses = 0;
    a.rel[b.id] = b.rel[a.id] = Math.max(colRel(a, b), -10);
    log(w, text ?? `🕊️ «${a.name}» و «${b.name}» صلح کردند.`, la, "peace");
    for (const p of [...membersOf(w, a), ...membersOf(w, b)]) remember(w, p, `«${a.name}» و «${b.name}» صلح کردند.`);
  } else if (status === "ally") {
    a.status[b.id] = b.status[a.id] = "ally";
    a.rel[b.id] = b.rel[a.id] = Math.max(colRel(a, b), 50);
    log(w, text ?? `🤝 «${a.name}» و «${b.name}» متحد شدند.`, la, "ally");
  } else {
    a.status[b.id] = b.status[a.id] = null;
    if (text) log(w, text, la, "colony");
  }
  a.since[b.id] = b.since[a.id] = w.day;
}

// ---------------------------------------------------------------- things

function housesTick(w, dt) {
  for (const h of w.houses) {
    if (h.ruined || h.fire <= 0) continue;
    h.fire = Math.min(1, h.fire + dt * 0.03); // left alone, it grows
    h.hp -= dt * 6 * h.fire;
    if (chance(dt * 0.12 * h.fire)) {
      for (const o of w.houses) if (o !== h && !o.ruined && !o.fire && Math.hypot(o.x - h.x, o.y - h.y) < 150) o.fire = 0.2;
      for (const t of w.trees) if (!t.dead && !t.burn && Math.hypot(t.x - h.x, t.y - h.y) < 110) t.burn = 0.01;
    }
    for (const p of w.people) if (p.alive && Math.hypot(p.x - h.x, p.y - h.y) < 30) hurt(w, p, dt * 5, "آتش‌سوزی");
    if (h.hp <= 0) ruin(w, h, "آتش");
  }
}

function ruin(w, h, cause) {
  if (h.ruined) return;
  h.ruined = true;
  h.fire = 0;
  h.ruinedAt = w.day;
  fx(w, "dust", h.x, h.y, 1.2, { big: true });
  const owner = byId(w, h.owner);
  if (h.kind === "temple" || h.kind === "keep") {
    const c = colonyOf(w, h.colony);
    announce(w, `🔥 ${h.kind === "temple" ? "معبد" : "قلعه"}ِ «${c?.name ?? "؟"}» ویران شد (${cause})!`, h, "ruin");
    if (h.religion) for (const r of w.religions) if (r.id !== h.religion) grieve(w, h.religion, r.id, h.kind === "temple" ? 25 : 10);
  } else log(w, `🏚️ خانه‌ی ${owner?.name ?? "خالی"} ویران شد (${cause}).`, h, "ruin");
  for (const p of alive(w))
    if (p.home === h.id) {
      p.home = null;
      p.mod -= 25;
      remember(w, p, `خانه‌مان ویران شد (${cause}).`);
    }
}

function treesTick(w, dt) {
  for (const t of w.trees) {
    if (!t.burn) continue;
    t.burn += dt / 7;
    if (chance(dt * 0.08)) for (const o of w.trees) if (o !== t && !o.dead && !o.burn && Math.hypot(o.x - t.x, o.y - t.y) < 90) o.burn = 0.01;
    if (t.burn >= 1) {
      t.burn = 0;
      t.dead = true;
      t.deadAt = w.day;
      t.fruit = 0;
    }
  }
}

function dropCoin(w, x, y, value = 1, z = 0) {
  w.coins.push({ id: w.nextId++, x, y, value, z, vz: 0 });
}
function coinsTick(w, dt) {
  for (const c of w.coins) {
    if (c.z > 0) {
      c.vz -= 900 * dt;
      c.z = Math.max(0, c.z + c.vz * dt);
    }
  }
  if (w.coins.length > 200) w.coins.splice(0, w.coins.length - 200);
}

// ---------------------------------------------------------------- AI plans

export const INTENTS = [
  "chat", "court", "fight", "steal", "gift", "pray", "work", "build", "rest", "eat", "wander", "flee",
  "found_colony", "join_colony", "leave_colony", "ally", "declare_war", "make_peace",
  "preach", "pilgrimage", "holy_war",
];

const findByName = (w, p, name) =>
  name && nearest(alive(w), p, (q) => q !== p && (q.name === name || q.name.startsWith(name) || name.includes(q.name)));
const findColony = (w, name) => name && w.colonies.find((c) => c.name.includes(name) || name.includes(c.name.replace("قبیله‌ی ", "")));

// Turn the mind's decision into something the body does.
function planTask(w, p, plan) {
  const target = findByName(w, p, plan.target);
  const until = w.t + 20;
  const own = colonyOf(w, p.colony);
  const other = findColony(w, plan.target) ?? (target?.colony && colonyOf(w, target.colony));
  switch (plan.intent) {
    case "chat":
    case "court":
    case "fight":
    case "steal":
    case "gift":
      return target ? { type: plan.intent, target: target.id, until, war: atWar(w, p, target) } : null;
    case "flee":
      return target ? { type: "flee", from: target.id, until: w.t + 5 } : null;
    case "preach":
      return target && p.religion ? { type: "preach", target: target.id, until } : null;
    case "pilgrimage":
      return { type: "pilgrim", x: w.holy.x + rand(-80, 80), y: w.holy.y + rand(-20, 40), until: w.t + DAY };
    case "holy_war": {
      const mine = religionOf(w, p.religion);
      const leads = mine && (p.prophet || (own && own.leader === p.id));
      if (!leads || w.armies.some((a) => a.religion === mine.id && a.kind === "crusade")) return null;
      const enemy =
        w.religions.find((r) => r !== mine && plan.target && (plan.target.includes(r.name.replace("آیین ", "")) || r.name.includes(plan.target))) ??
        (target && religionOf(w, target.religion) !== mine ? religionOf(w, target.religion) : null) ??
        religionOf(w, w.holy.owner !== mine.id ? w.holy.owner : null);
      declareHolyWar(w, mine, enemy, p);
      return null;
    }
    case "pray":
      return { type: "pray", until: w.t + 5 };
    case "work": {
      const rock = nearest(w.rocks, p);
      return rock ? { type: "work", rock: rock.id, until } : null;
    }
    case "eat": {
      const tree = nearest(w.trees, p, (t) => t.fruit > 0 && !t.dead && !t.burn);
      return tree ? { type: "gather", tree: tree.id, until } : null;
    }
    case "rest":
      return { type: "sleep", x: p.x, y: p.y, until: w.t + 40 };
    case "build":
      return p.wealth >= HOUSE_COST && !p.home ? buildTask(w, p) : null;
    case "wander":
      return wanderTask(w, p, 400);
    case "found_colony":
      if (!own || own.leader !== p.id) foundColony(w, p, target && !target.colony ? [target] : []);
      return null;
    case "join_colony":
      if (other && other.id !== p.colony) joinColony(w, p, other);
      return null;
    case "leave_colony":
      if (own) leaveColony(w, p, "تصمیم خودم بود");
      return null;
    case "ally":
    case "declare_war":
    case "make_peace":
      if (own && own.leader === p.id && other && other !== own) {
        const status = colStatus(own, other);
        if (plan.intent === "declare_war" && status !== "war") setStatus(w, own, other, "war", `⚔️ ${p.name}، رهبر «${own.name}»، به «${other.name}» اعلان جنگ داد!`);
        if (plan.intent === "make_peace" && status === "war") setStatus(w, own, other, "peace", `🕊️ ${p.name} با «${other.name}» صلح کرد.`);
        if (plan.intent === "ally" && status !== "ally" && colRel(other, own) > -10) setStatus(w, own, other, "ally", `🤝 ${p.name} با «${other.name}» پیمان اتحاد بست.`);
      }
      return null;
    default:
      return null;
  }
}

// Apply what the mind said and felt.
export function applyMind(w, p, r, fromGod = null) {
  if (!p.alive) return;
  if (r.say) speak(w, p, r.say, 5);
  if (r.thought) p.thought = r.thought;
  for (const f of r.feelings ?? []) {
    const q = findByName(w, p, f.name);
    if (q) addRel(p, q, clamp(Number(f.change) || 0, -30, 30));
  }
  if (fromGod) {
    remember(w, p, `خدا به من گفت: «${fromGod}»`);
    remember(w, p, `به خدا گفتم: «${r.say}»`);
  }
  if (r.intent && INTENTS.includes(r.intent)) {
    p.plan = { intent: r.intent, target: r.target, until: w.t + DAY, used: false };
    p.task = null;
    p.decideAt = 0;
  }
}

// ---------------------------------------------------------------- god

export const POWERS = [
  { id: "hand", icon: "✋", name: "دست خدا", hint: "بکش و پرت کن؛ روی آدم‌ها بزن تا ببینیشان" },
  { id: "lightning", icon: "⚡", name: "صاعقه" },
  { id: "fire", icon: "🔥", name: "آتش", hint: "بکش تا آتش بگیرد" },
  { id: "meteor", icon: "☄️", name: "شهاب‌سنگ" },
  { id: "quake", icon: "🌋", name: "زلزله" },
  { id: "plague", icon: "🦠", name: "طاعون" },
  { id: "gold", icon: "💰", name: "باران طلا" },
  { id: "bless", icon: "✨", name: "برکت", hint: "شفا، شادی و ایمان" },
  { id: "miracle", icon: "🕊️", name: "معجزه", hint: "بی‌دین‌ها به آیینِ آن‌جا می‌گروند" },
  { id: "discord", icon: "😈", name: "فتنه", hint: "کینه میان قوم‌ها و آیین‌ها" },
  { id: "rain", icon: "🌧️", name: "باران", hint: "آتش را خاموش می‌کند و میوه می‌دهد" },
  { id: "tree", icon: "🌳", name: "درخت" },
  { id: "create", icon: "🧍", name: "آفرینش" },
];

function lightning(w, x, y) {
  fx(w, "bolt", x, y, 0.5);
  fx(w, "flash", x, y, 0.25);
  fx(w, "scorch", x, y, DAY);
  for (const p of alive(w)) {
    const d = Math.hypot(p.x - x, (p.y - y) * 1.4);
    if (d < 50) hurt(w, p, 85 * (1 - d / 70), "صاعقه");
  }
  for (const h of w.houses) if (!h.ruined && Math.hypot(h.x - x, h.y - y) < 70) h.fire = Math.max(h.fire, 0.5);
  for (const t of w.trees) if (!t.dead && Math.hypot(t.x - x, t.y - y) < 60) t.burn = t.burn || 0.01;
}

// Weather comes and goes; storms throw their own lightning.
function weatherTick(w, dt) {
  const k = w.weather;
  if (w.t > k.until) {
    const next = rollWeather(seasonOf(w.day));
    if (next !== k.type && (next === "storm" || next === "snow" || k.type === "storm"))
      log(w, `${WEATHERS[next].icon} هوا: ${WEATHERS[next].name}`, null, "season");
    w.weather = { type: next, until: w.t + DAY * rand(0.35, 0.9) };
  }
  if (k.type === "rain" || k.type === "storm" || k.type === "snow")
    for (const h of w.houses) if (h.fire > 0) h.fire = Math.max(0, h.fire - dt * 0.03);
  if (k.type === "storm" && chance(dt * 0.035)) {
    const x = rand(100, w.W - 100);
    const y = rand(200, w.H - 60);
    lightning(w, x, y);
    scare(w, x, y, 180);
    witness(w, x, y, 300, "صاعقه‌ی طوفان کنارم زد!", true);
  }
}

// Everyone who saw it reacts: the devout pray, the doubters curse.
function witness(w, x, y, r, text, bad) {
  godSeen(w, x, y, r, bad);
  for (const p of alive(w)) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > r) continue;
    remember(w, p, text);
    if (bad) {
      p.mod -= 12 * (1 - d / r);
      if (p.traits.faith > 0.6 && chance(0.6)) {
        p.traits.faith = Math.min(1, p.traits.faith + 0.03);
        p.task = { type: "pray", until: w.t + 5 };
      } else if (p.traits.faith < 0.4) {
        p.traits.faith = Math.max(0, p.traits.faith - 0.04);
        if (chance(0.3)) speak(w, p, say("pray_angry"), 3);
      }
    } else {
      p.traits.faith = Math.min(1, p.traits.faith + 0.05);
      p.mod += 10;
    }
  }
}

function scare(w, x, y, r) {
  for (const p of alive(w))
    if (Math.hypot(p.x - x, p.y - y) < r && !p.carried) {
      p.task = { type: "flee", x, y, until: w.t + 3 };
      if (chance(0.4)) speak(w, p, say("scared"), 1.5);
    }
}

export function power(w, id, x, y) {
  const at = { x, y };
  switch (id) {
    case "lightning":
      lightning(w, x, y);
      scare(w, x, y, 220);
      witness(w, x, y, 380, "خدا نزدیک من صاعقه زد!", true);
      log(w, "⚡ خدا صاعقه زد.", at, "god");
      return;
    case "fire":
      fx(w, "spark", x, y, 0.6);
      for (const h of w.houses) if (!h.ruined && Math.hypot(h.x - x, (h.y - y) * 1.4) < 60) h.fire = Math.max(h.fire, 0.4);
      for (const t of w.trees) if (!t.dead && Math.hypot(t.x - x, (t.y - y) * 1.4) < 50) t.burn = t.burn || 0.01;
      for (const p of alive(w)) if (Math.hypot(p.x - x, p.y - y) < 36) hurt(w, p, 20, "آتش خدا");
      return;
    case "meteor":
      fx(w, "meteor", x, y, 1.1);
      w.pending = [...(w.pending ?? []), { at: w.t + 1, id: "meteor_hit", x, y }];
      log(w, "☄️ خدا شهاب‌سنگ فرستاد.", at, "god");
      return;
    case "quake":
      w.shake = 2.5;
      fx(w, "quake", x, y, 2.5);
      for (const h of w.houses) {
        const d = Math.hypot(h.x - x, h.y - y);
        if (d < 450 && !h.ruined) {
          h.hp -= rand(35, 90) * (1 - d / 600);
          if (h.hp <= 0) ruin(w, h, "زلزله");
          else if (chance(0.15)) h.fire = 0.2;
        }
      }
      for (const p of alive(w))
        if (Math.hypot(p.x - x, p.y - y) < 450 && !p.carried) {
          p.stun = rand(1, 2.2);
          if (chance(0.1)) hurt(w, p, rand(10, 40), "زلزله");
        }
      witness(w, x, y, 600, "زمین لرزید! خدا عصبانی است.", true);
      log(w, "🌋 خدا زمین را لرزاند.", at, "god");
      return;
    case "plague": {
      fx(w, "plague", x, y, 3);
      let n = 0;
      for (const p of alive(w))
        if (Math.hypot(p.x - x, p.y - y) < 110) {
          p.sick = 1;
          n++;
        }
      witness(w, x, y, 300, "بیماری عجیبی آمد…", true);
      log(w, `🦠 خدا طاعون فرستاد (${n} نفر بیمار شدند).`, at, "god");
      return;
    }
    case "gold":
      for (let i = 0; i < 30; i++) dropCoin(w, x + rand(-130, 130), y + rand(-70, 70), randInt(1, 3), rand(200, 700));
      fx(w, "shine", x, y, 1.5);
      witness(w, x, y, 450, "از آسمان طلا بارید!", false);
      log(w, "💰 خدا باران طلا فرستاد.", at, "god");
      return;
    case "bless": {
      fx(w, "bless", x, y, 2);
      for (const p of alive(w))
        if (Math.hypot(p.x - x, p.y - y) < 140) {
          p.health = 100;
          p.sick = 0;
          p.food = Math.max(p.food, 80);
          p.energy = Math.max(p.energy, 80);
          p.mod += 30;
          speak(w, p, say("blessed"));
        }
      for (const h of w.houses) if (Math.hypot(h.x - x, h.y - y) < 140) (h.fire = 0), (h.hp = Math.max(h.hp, 100));
      witness(w, x, y, 300, "خدا به ما برکت داد.", false);
      log(w, "✨ خدا برکت داد.", at, "god");
      return;
    }
    case "miracle": {
      fx(w, "beam", x, y, 3);
      fx(w, "bless", x, y, 2);
      for (const p of alive(w))
        if (Math.hypot(p.x - x, p.y - y) < 260) {
          p.traits.faith = Math.min(1, p.traits.faith + 0.15);
          p.mod += 20;
          if (chance(0.4)) speak(w, p, "معجزه! 😇", 3);
        }
      witness(w, x, y, 420, "با چشم خودم معجزه دیدم: نوری از آسمان!", false);
      announce(w, "🕊️ نوری از آسمان تابید؛ مردم از معجزه سخن می‌گویند.", at, "god");
      return;
    }
    case "discord": {
      fx(w, "discord", x, y, 2.5);
      const near = alive(w).filter((p) => Math.hypot(p.x - x, p.y - y) < 320 && isAdult(p));
      for (const p of near)
        for (const q of alive(w))
          if (p !== q && (infidel(p, q) || (p.colony && q.colony && p.colony !== q.colony))) {
            addRel(p, q, -rand(15, 35));
            if (p.colony && q.colony) addColRel(w, p.colony, q.colony, -2);
          }
      for (const r of w.religions)
        if (near.some((p) => p.religion === r.id)) for (const o of w.religions) if (o !== r) grieve(w, r.id, o.id, 20);
      for (const p of near) {
        remember(w, p, "یک‌دفعه از همه‌ی غریبه‌ها متنفر شدم…");
        if (chance(0.3)) speak(w, p, pick(["همه‌ش تقصیر اوناست!", "کافرها!", "دیگه تحمل ندارم!"]), 3);
      }
      log(w, "😈 خدا در دل مردم کینه کاشت.", at, "god");
      return;
    }
    case "rain":
      fx(w, "rain", x, y, 3);
      for (const h of w.houses) if (Math.hypot(h.x - x, h.y - y) < 260) h.fire = 0;
      for (const t of w.trees)
        if (Math.hypot(t.x - x, t.y - y) < 260) {
          t.burn = 0;
          if (!t.dead) t.fruit = Math.min(4, t.fruit + 2);
        }
      log(w, "🌧️ خدا باران فرستاد.", at, "god");
      return;
    case "tree":
      if (isWater(w.terrain, x, y)) return;
      addTree(w, x, y, 2);
      fx(w, "bless", x, y, 0.8);
      return;
    case "create": {
      const p = makePerson(w, x, y, { age: rand(ADULT, 30) });
      fx(w, "bless", x, y, 1.2);
      remember(w, p, "خدا مرا آفرید.");
      p.traits.faith = Math.max(p.traits.faith, 0.6);
      log(w, `🧍 خدا ${p.name} را آفرید.`, p, "god");
      return p;
    }
  }
}

// Things that land a moment later.
export function pendingTick(w) {
  if (!w.pending?.length) return;
  const now = w.pending.filter((e) => w.t >= e.at);
  w.pending = w.pending.filter((e) => w.t < e.at);
  for (const e of now) {
    if (e.id !== "meteor_hit") continue;
    const { x, y } = e;
    w.shake = 1.2;
    fx(w, "boom", x, y, 0.9);
    fx(w, "crater", x, y, DAY * 3);
    for (const h of w.houses) if (!h.ruined && Math.hypot(h.x - x, (h.y - y) * 1.3) < 150) ruin(w, h, "شهاب‌سنگ");
    for (const t of w.trees) if (!t.dead && Math.hypot(t.x - x, t.y - y) < 130) (t.dead = true), (t.deadAt = w.day);
    for (const p of alive(w)) {
      const d = Math.hypot(p.x - x, (p.y - y) * 1.3);
      if (d < 90) hurt(w, p, 120, "شهاب‌سنگ");
      else if (d < 260 && !p.carried) {
        // Blown back.
        p.vx = ((p.x - x) / d) * 260;
        p.vy = ((p.y - y) / d) * 160;
        p.vz = 280;
        p.z = 1;
        p.task = null;
      }
    }
    witness(w, x, y, 700, "یک شهاب‌سنگ از آسمان افتاد!", true);
  }
}

// The hand: pick up, carry, throw.
export function pickUp(w, p) {
  p.carried = true;
  p.task = null;
  p.z = 70;
  speak(w, p, say("scared"), 99);
  if (p.traits.faith > 0.5) remember(w, p, "دست خدا مرا از زمین بلند کرد!");
}
export function throwPerson(w, p, vx, vy) {
  p.carried = false;
  p.speech = null;
  const s = Math.hypot(vx, vy);
  const k = s > 1400 ? 1400 / s : 1;
  p.vx = vx * k;
  p.vy = vy * k * 0.6;
  p.vz = 120 + s * k * 0.35;
  p.z = Math.max(p.z, 1);
  log(w, s > 700 ? `🤾 خدا ${p.name} را پرت کرد!` : `✋ خدا ${p.name} را جابه‌جا کرد.`, p, "god");
  remember(w, p, s > 700 ? "خدا مرا پرت کرد!" : "خدا مرا جابه‌جا کرد.");
}

export const MOOD_WORDS = [
  [50, "خیلی شاد"],
  [20, "شاد"],
  [-10, "معمولی"],
  [-40, "ناراحت"],
  [-101, "بدبخت"],
];
export const moodWord = (h) => MOOD_WORDS.find(([k]) => h >= k)[1];
