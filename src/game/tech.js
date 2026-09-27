// Knowledge and progress. Every tribe gathers knowledge — from work, from
// its libraries and universities, from printing and peace — and spends it
// discovering the next thing on the tree. Discoveries change the world:
// farms, walls, watchtowers, better weapons, factories, electric light,
// skyscrapers… and the bomb. When enough tribes learn diplomacy, they found
// the United Nations. Knowledge also spreads between tribes whose people
// get along, and dies with a tribe.
import {
  DAY,
  alive,
  announce,
  byId,
  colStatus,
  colonyCenter,
  colonyOf,
  findSpot,
  fx,
  hurt,
  isAdult,
  log,
  membersOf,
  remember,
  setStatus,
} from "./world.js";
import { chance, clamp, dist, fa, pick, rand } from "./util.js";

export const ERAS = [
  { name: "عصر ابتدایی", icon: "🪨" },
  { name: "عصر باستان", icon: "🏛️" },
  { name: "عصر صنعتی", icon: "🏭" },
  { name: "عصر مدرن", icon: "🏙️" },
  { name: "عصر اتم", icon: "☢️" },
];

// kind: what leaders of each temperament prefer to research.
export const TECHS = [
  { id: "farming", name: "کشاورزی", icon: "🌾", era: 0, cost: 25, needs: [], kind: "kind", what: "مزرعه می‌سازند؛ غذا حتی در زمستان" },
  { id: "masonry", name: "سنگ‌تراشی", icon: "🧱", era: 0, cost: 30, needs: [], kind: "greed", what: "خانه‌های سنگی" },
  { id: "bronze", name: "مفرغ", icon: "🗡️", era: 0, cost: 30, needs: [], kind: "aggr", what: "سلاح‌های مفرغی" },
  { id: "writing", name: "خط", icon: "📜", era: 0, cost: 40, needs: [], kind: "kind", what: "کتابخانه؛ دانش بیشتر" },
  { id: "walls", name: "دیوار", icon: "🧱", era: 1, cost: 70, needs: ["masonry"], kind: "aggr", what: "دیوار دور شهر" },
  { id: "towers", name: "برج دیده‌بانی", icon: "🗼", era: 1, cost: 80, needs: ["masonry"], kind: "aggr", what: "برج‌هایی که به دشمن تیر می‌زنند" },
  { id: "iron", name: "آهن", icon: "⚔️", era: 1, cost: 90, needs: ["bronze"], kind: "aggr", what: "شمشیر و زره آهنی" },
  { id: "currency", name: "پول و بازار", icon: "💰", era: 1, cost: 80, needs: ["writing"], kind: "greed", what: "بازار؛ کار پول بیشتری می‌آورد" },
  { id: "university", name: "دانشگاه", icon: "🎓", era: 1, cost: 120, needs: ["writing"], kind: "kind", what: "دانشگاه؛ دانش دوبرابر" },
  { id: "gunpowder", name: "باروت", icon: "💥", era: 2, cost: 250, needs: ["iron"], kind: "aggr", what: "تفنگ فتیله‌ای" },
  { id: "printing", name: "چاپ", icon: "📰", era: 2, cost: 220, needs: ["university"], kind: "kind", what: "دانش سریع‌تر پخش می‌شود" },
  { id: "industry", name: "صنعت", icon: "🏭", era: 2, cost: 350, needs: ["currency", "masonry"], kind: "greed", what: "کارخانه و خانه‌های مدرن" },
  { id: "diplomacy", name: "دیپلماسی", icon: "🕊️", era: 3, cost: 420, needs: ["printing"], kind: "kind", what: "راه تشکیل سازمان ملل" },
  { id: "electricity", name: "برق", icon: "💡", era: 3, cost: 500, needs: ["industry"], kind: "greed", what: "چراغ برق در شب" },
  { id: "rifles", name: "سلاح مدرن", icon: "🔫", era: 3, cost: 550, needs: ["gunpowder", "industry"], kind: "aggr", what: "تفنگ‌های مدرن" },
  { id: "skyscraper", name: "آسمان‌خراش", icon: "🏙️", era: 3, cost: 600, needs: ["electricity"], kind: "greed", what: "برج‌های بلند" },
  { id: "nuclear", name: "بمب اتم", icon: "☢️", era: 4, cost: 1200, needs: ["electricity", "rifles"], kind: "aggr", what: "سلاح اتمی" },
];
export const techById = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export const knows = (c, id) => Boolean(c?.tech?.known.includes(id));
export const knowsP = (w, p, id) => knows(p.colony && colonyOf(w, p.colony), id);
export const eraOf = (c) => Math.max(0, ...(c?.tech?.known ?? []).map((id) => techById[id].era));
export function newTech(people = []) {
  const known = [...new Set(people.flatMap((p) => p.know ?? []))];
  return { known, research: null, progress: 0, points: 0 };
}

// How hard a person hits, by what their tribe can forge.
export function weaponLevel(w, p) {
  const c = p.colony && colonyOf(w, p.colony);
  if (!c?.tech) return 0;
  return knows(c, "rifles") ? 4 : knows(c, "gunpowder") ? 3 : knows(c, "iron") ? 2 : knows(c, "bronze") ? 1 : 0;
}
export const WEAPON_DAMAGE = [1, 1.25, 1.55, 1.9, 2.4];
// Guns make every soldier a shooter.
export const shooter = (w, p) => weaponLevel(w, p) >= 3;

// ---------------------------------------------------------------- research

function pickResearch(c, leader) {
  const open = TECHS.filter((t) => !knows(c, t.id) && t.needs.every((n) => knows(c, n)));
  if (!open.length) return null;
  const T = leader?.traits ?? { kind: 0.5, aggr: 0.5, greed: 0.5 };
  const weigh = (t) => (0.4 + (T[t.kind] ?? 0.5)) * (1 / (1 + t.era)) * rand(0.6, 1.4);
  return open.sort((a, b) => weigh(b) - weigh(a))[0].id;
}

const hasBuilt = (w, c, kind) => w.houses.some((b) => b.colony === c.id && b.kind === kind && b.built >= 1 && !b.ruined);

export function techDay(w) {
  for (const c of w.colonies) {
    c.tech ??= newTech();
    // People carry what their tribe knows; a new tribe starts with what its
    // founders knew.
    for (const p of membersOf(w, c)) p.know = [...c.tech.known];
    const adults = membersOf(w, c).filter(isAdult);
    if (!adults.length) continue;
    // Knowledge from everyone, more with books, universities and peace.
    let pts = adults.reduce((s, p) => s + 0.45 + p.traits.work * 0.35 + p.traits.social * 0.2, 0);
    if (hasBuilt(w, c, "library")) pts *= 1.4;
    if (hasBuilt(w, c, "university")) pts *= 2;
    if (knows(c, "printing")) pts *= 1.4;
    if (knows(c, "electricity")) pts *= 1.2;
    const atWar = w.colonies.some((o) => colStatus(c, o) === "war");
    if (!atWar) pts *= 1.15;
    c.tech.points = Math.round(pts * 10) / 10;
    c.tech.research ??= pickResearch(c, byId(w, c.leader));
    if (!c.tech.research) continue;
    c.tech.progress += pts;
    const t = techById[c.tech.research];
    if (c.tech.progress >= t.cost) discover(w, c, t.id);
  }
  civicBuild(w);
  unitedNations(w);
  nukes(w);
}

export function discover(w, c, id, how = "") {
  const t = techById[id];
  if (!t || knows(c, id)) return;
  const eraBefore = eraOf(c);
  c.tech.known.push(id);
  if (c.tech.research === id) {
    c.tech.progress = 0;
    c.tech.research = null;
  }
  const leader = byId(w, c.leader);
  const text = `${t.icon} «${c.name}» ${t.name} را ${how || "کشف کرد"}! (${t.what})`;
  if (t.era >= 2 || id === "farming" || id === "walls" || id === "university") announce(w, text, leader, "tech");
  else log(w, text, leader, "tech");
  const era = eraOf(c);
  if (era > eraBefore) announce(w, `${ERAS[era].icon} «${c.name}» وارد ${ERAS[era].name} شد!`, leader, "tech");
  for (const p of membersOf(w, c)) remember(w, p, `قبیله‌مان ${t.name} را یاد گرفت.`);
}

// Two people of different tribes who get on well teach each other.
export function shareKnowledge(w, p, q) {
  const a = p.colony && colonyOf(w, p.colony);
  const b = q.colony && colonyOf(w, q.colony);
  if (!a?.tech || !b?.tech || a === b) return;
  const teach = (from, to) => {
    const t = from.tech.known.find((id) => !knows(to, id) && techById[id].needs.every((n) => knows(to, n)));
    if (t && chance(knows(from, "printing") ? 0.12 : 0.05)) discover(w, to, t, `از «${from.name}» یاد گرفت`);
  };
  teach(a, b);
  teach(b, a);
}

// God's inspiration: the tribe nearest the spot has a breakthrough.
export function inspire(w, x, y) {
  let best = null;
  let bd = Infinity;
  for (const c of w.colonies) {
    const cc = colonyCenter(w, c);
    const d = Math.hypot(cc.x - x, cc.y - y);
    if (d < bd) (bd = d), (best = c);
  }
  if (!best || bd > 900) return null;
  best.tech ??= newTech();
  best.tech.research ??= pickResearch(best, byId(w, best.leader));
  const id = best.tech.research;
  if (id) discover(w, best, id, "با الهام خدا کشف کرد");
  return best;
}

// ---------------------------------------------------------------- building

// What a tribe wants built, given what it knows. One new site at a time.
function civicBuild(w) {
  for (const c of w.colonies) {
    if (!c.tech) continue;
    const members = membersOf(w, c);
    const adults = members.filter(isAdult);
    if (adults.length < 3) continue;
    const count = (kind) => w.houses.filter((b) => b.colony === c.id && b.kind === kind && !b.ruined).length;
    if (w.houses.some((b) => b.colony === c.id && b.kind !== "house" && b.built < 1 && !b.ruined)) continue;
    const wants = [
      knows(c, "farming") && count("farm") < Math.ceil(members.length / 6) && "farm",
      knows(c, "writing") && !count("library") && "library",
      knows(c, "walls") && !count("wall") && adults.length >= 5 && "wall",
      knows(c, "currency") && !count("market") && "market",
      knows(c, "university") && !count("university") && "university",
      knows(c, "towers") && count("tower") < 2 && "tower",
      knows(c, "industry") && !count("factory") && "factory",
      knows(c, "skyscraper") && count("skyscraper") < Math.ceil(members.length / 10) && "skyscraper",
      knows(c, "nuclear") && !count("silo") && adults.length >= 6 && "silo",
    ].filter(Boolean);
    const kind = wants[0];
    if (!kind) continue;
    const center = colonyCenter(w, c);
    let spot;
    if (kind === "wall") spot = { x: center.x, y: center.y };
    else if (kind === "tower") {
      const a = rand(0, Math.PI * 2);
      spot = findSpot(w, center.x + Math.cos(a) * 280, center.y + Math.sin(a) * 170, 80, 90);
    } else spot = findSpot(w, center.x, center.y, kind === "farm" ? 380 : 300, kind === "farm" ? 140 : 130);
    if (!spot) continue;
    const hp = { wall: 400, tower: 220, skyscraper: 300, silo: 250, university: 220 }[kind] ?? 160;
    const b = { id: w.nextId++, kind, x: spot.x, y: spot.y, owner: c.leader, colony: c.id, built: 0, hp, maxHp: hp, fire: 0, ruined: false, level: 1 };
    if (kind === "farm") b.crop = 3;
    if (kind === "wall") {
      // Around the town's homes.
      const near = w.houses
        .filter((h) => h.colony === c.id && !h.ruined && h.kind !== "farm")
        .map((h) => Math.hypot(h.x - center.x, (h.y - center.y) * 1.6))
        .filter((d) => d < 520);
      b.r = Math.min(440, Math.max(240, ...near) + 60);
    }
    w.houses.push(b);
    log(w, `🏗️ «${c.name}» ساختن ${BUILDING_NAMES[kind]} را شروع کرد.`, b, "build");
  }
}
export const BUILDING_NAMES = {
  farm: "مزرعه",
  library: "کتابخانه",
  wall: "دیوار شهر",
  market: "بازار",
  university: "دانشگاه",
  tower: "برج دیده‌بانی",
  factory: "کارخانه",
  skyscraper: "آسمان‌خراش",
  silo: "سکوی موشک اتمی",
  un: "مقر سازمان ملل",
  temple: "معبد",
  keep: "قلعه",
  house: "خانه",
};

// Farms grow a little every day (not much in winter).
export function farmDay(w) {
  for (const b of w.houses)
    if (b.kind === "farm" && b.built >= 1 && !b.ruined) b.crop = Math.min(8, (b.crop ?? 0) + (w.season === "winter" ? 1 : 3));
}

// Inside its own wall, a town's people are harder to hurt.
export function wallShield(w, p) {
  if (!p.colony) return 1;
  const wall = w.houses.find((b) => b.kind === "wall" && b.colony === p.colony && b.built >= 1 && !b.ruined);
  if (!wall) return 1;
  return Math.hypot(p.x - wall.x, (p.y - wall.y) * 1.6) < wall.r ? 0.65 : 1;
}

// ---------------------------------------------------------------- every step

export function techTick(w, dt) {
  // Watchtowers shoot at enemies.
  for (const b of w.houses) {
    if (b.kind !== "tower" || b.built < 1 || b.ruined) continue;
    b.reload = (b.reload ?? 0) - dt;
    if (b.reload > 0) continue;
    const own = colonyOf(w, b.colony);
    let foe = null;
    let fd = 340;
    for (const q of w.people) {
      if (!q.alive || q.carried || !isAdult(q)) continue;
      const theirs = q.colony && colonyOf(w, q.colony);
      const hostile = (theirs && colStatus(own, theirs) === "war") || (q.army && own?.religion && q.religion !== own.religion);
      if (!hostile) continue;
      const d = dist(b, q);
      if (d < fd) (fd = d), (foe = q);
    }
    if (!foe) continue;
    b.reload = 1.6;
    const gun = knows(own, "gunpowder");
    w.arrows.push({ x0: b.x, y0: b.y - 110, x1: foe.x + rand(-8, 8), y1: foe.y - 30, t0: w.t, dur: gun ? 0.2 : 0.4 + fd / 800, target: foe.id, from: null, bullet: gun, dmg: gun ? 14 : 9 });
  }
  // Missiles in flight.
  if (w.missiles?.length) {
    w.missiles = w.missiles.filter((m) => {
      if (w.t < m.t0 + m.dur) return true;
      nukeHit(w, m);
      return false;
    });
  }
  // Fallout makes people sick and kills trees.
  if (w.fallout?.length) {
    w.fallout = w.fallout.filter((f) => w.day < f.until);
    if (chance(dt * 0.5))
      for (const f of w.fallout)
        for (const p of w.people) if (p.alive && !p.sick && Math.hypot(p.x - f.x, p.y - f.y) < f.r && chance(0.3)) p.sick = 1;
  }
}

// ---------------------------------------------------------------- the bomb

function nukes(w) {
  for (const c of w.colonies) {
    const silo = w.houses.find((b) => b.kind === "silo" && b.colony === c.id && b.built >= 1 && !b.ruined && !b.fired);
    if (!silo) continue;
    const enemies = w.colonies.filter((o) => colStatus(c, o) === "war");
    if (!enemies.length) continue;
    const leader = byId(w, c.leader);
    const un = w.un && w.un.members.includes(c.id) ? 0.3 : 1;
    const odds = (0.06 + (leader?.traits.aggr ?? 0.5) * 0.18) * un;
    if (!chance(odds)) continue;
    const target = pick(enemies);
    const at = colonyCenter(w, target);
    silo.fired = true;
    silo.firedDay = w.day;
    w.missiles = [...(w.missiles ?? []), { x0: silo.x, y0: silo.y - 60, x1: at.x, y1: at.y, t0: w.t, dur: 4, from: c.id, to: target.id }];
    announce(w, `☢️ «${c.name}» به فرمان ${leader?.name ?? "رهبرش"} بمب اتم را به سوی «${target.name}» شلیک کرد!`, silo, "nuke");
  }
  // Silos can fire again after a while.
  for (const b of w.houses) if (b.kind === "silo" && b.fired && w.day - b.firedDay > 6) b.fired = false;
}

// A missile the player can also send: from the sky onto a spot.
export function launchAt(w, x, y, from = null) {
  w.missiles = [...(w.missiles ?? []), { x0: x + 900, y0: y - 1200, x1: x, y1: y, t0: w.t, dur: 2.5, from, to: null }];
}

function nukeHit(w, m) {
  const { x1: x, y1: y } = m;
  w.shake = 4;
  fx(w, "flash", x, y, 0.8);
  fx(w, "nuke", x, y, 9);
  fx(w, "crater", x, y, DAY * 6);
  for (const b of w.houses) {
    const d = Math.hypot(b.x - x, (b.y - y) * 1.3);
    if (b.ruined || b.kind === "un") continue;
    if (d < 420) {
      b.hp = 0;
      b.ruined = true;
      b.fire = 0;
      b.ruinedAt = w.day;
      for (const p of alive(w)) if (p.home === b.id) p.home = null;
    } else if (d < 650) b.fire = Math.max(b.fire, 0.6);
  }
  for (const t of w.trees) if (Math.hypot(t.x - x, t.y - y) < 600) (t.dead = true), (t.deadAt = w.day), (t.burn = 0);
  let dead = 0;
  for (const p of alive(w)) {
    const d = Math.hypot(p.x - x, (p.y - y) * 1.3);
    if (d < 300) {
      hurt(w, p, 999, "بمب اتم");
      dead++;
    } else if (d < 650) {
      hurt(w, p, 70 * (1 - (d - 300) / 350), "بمب اتم");
      p.sick = 1;
      if (!p.alive) dead++;
    }
  }
  w.fallout = [...(w.fallout ?? []), { x, y, r: 520, until: w.day + 5 }];
  const from = colonyOf(w, m.from);
  const to = colonyOf(w, m.to);
  announce(w, `☢️ انفجار اتمی${to ? ` در «${to.name}»` : ""}! ${dead ? `${fa(dead)} نفر کشته شدند.` : "کسی آن‌جا نبود."}`, { x, y }, "nuke");
  // The whole world turns on whoever did it.
  if (from)
    for (const o of w.colonies)
      if (o !== from) {
        o.rel[from.id] = Math.max(-100, (o.rel[from.id] ?? 0) - 60);
        from.rel[o.id] = o.rel[from.id];
      }
  for (const p of alive(w)) remember(w, p, `بمب اتم${to ? ` بر سر «${to.name}»` : ""} فرود آمد. دنیا دیگر مثل قبل نیست.`);
}

// ---------------------------------------------------------------- the UN

function unitedNations(w) {
  const founders = w.colonies.filter((c) => knows(c, "diplomacy"));
  // Everyone who knows diplomacy, and every tribe at peace with one of them.
  const diplomats = w.colonies.filter((c) => founders.includes(c) || founders.some((f) => f !== c && colStatus(f, c) !== "war"));
  if (!w.un) {
    if (!founders.length || diplomats.length < 2) return;
    const h = w.holy;
    const spot = findSpot(w, h.x + 330, h.y + 180, 200, 140) ?? findSpot(w, h.x, h.y + 350, 300, 140);
    if (!spot) return;
    const b = { id: w.nextId++, kind: "un", x: spot.x, y: spot.y, owner: null, colony: null, built: 1, hp: 500, maxHp: 500, fire: 0, ruined: false, level: 1 };
    w.houses.push(b);
    w.un = { founded: w.day, members: diplomats.map((c) => c.id), building: b.id };
    announce(w, `🇺🇳 سازمان ملل تشکیل شد! اعضا: ${diplomats.map((c) => `«${c.name}»`).join("، ")}`, b, "un");
    return;
  }
  w.un.members = w.un.members.filter((id) => colonyOf(w, id));
  for (const c of diplomats)
    if (!w.un.members.includes(c.id)) {
      w.un.members.push(c.id);
      log(w, `🕊️ «${c.name}» به سازمان ملل پیوست.`, null, "un");
    }
  // The UN pushes its members at war to make peace.
  for (const a of w.colonies)
    for (const b of w.colonies)
      if (a.id < b.id && w.un.members.includes(a.id) && w.un.members.includes(b.id) && colStatus(a, b) === "war" && chance(0.35))
        setStatus(w, a, b, "peace", `🕊️ با میانجی‌گری سازمان ملل، «${a.name}» و «${b.name}» صلح کردند.`);
}

export const unMember = (w, c) => Boolean(w.un && c && w.un.members.includes(c.id));
export { clamp };
