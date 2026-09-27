// Faith and holy war. Religions spread by preaching and miracles, pilgrims
// walk to the holy city, grievances pile up — and when they boil over, a
// religion calls a holy war: an army musters under its banner, marches
// across the river and lays siege to the holy city (or the infidels' town).
import {
  DAY,
  addRel,
  alive,
  announce,
  byId,
  colStatus,
  colonyCenter,
  colonyOf,
  findSpot,
  fx,
  houseOf,
  hurt,
  isAdult,
  log,
  membersOf,
  remember,
  setStatus,
  speak,
} from "./world.js";
import { nearestBridge, side } from "./terrain.js";
import { chance, clamp, dist, fa, pick, rand } from "./util.js";
import { WEAPON_DAMAGE, shooter, wallShield, weaponLevel } from "./tech.js";

export const FAITHS = [
  { name: "آیین خورشید", symbol: "☀️", color: "#f59e0b", god: "خورشیدِ بزرگ" },
  { name: "آیین ماه", symbol: "🌙", color: "#6366f1", god: "ماهِ نگهبان" },
  { name: "آیین ستاره", symbol: "⭐", color: "#0ea5a4", god: "ستاره‌ی راه" },
  { name: "آیین آتش", symbol: "🔥", color: "#ef4444", god: "آتشِ جاودان" },
  { name: "آیین درخت", symbol: "🌳", color: "#16a34a", god: "درختِ کهن" },
  { name: "آیین آب", symbol: "💧", color: "#0284c7", god: "دریای خاموش" },
];
const ORDINALS = ["اول", "دوم", "سوم", "چهارم", "پنجم", "ششم", "هفتم", "هشتم", "نهم", "دهم"];

export const religionOf = (w, id) => w.religions.find((r) => r.id === id);
export const followersOf = (w, r) => w.people.filter((p) => p.alive && p.religion === r.id);

export function foundReligion(w, founder, template = null) {
  const used = new Set(w.religions.map((r) => r.name));
  const t = template ?? FAITHS.find((f) => !used.has(f.name)) ?? pick(FAITHS);
  const r = { id: w.nextId++, ...t, founder: founder?.id ?? null, prophet: founder?.id ?? null, zeal: 50, founded: w.day, grief: {} };
  w.religions.push(r);
  for (const o of w.religions) if (o !== r) (o.grief[r.id] = 0), (r.grief[o.id] = 0);
  if (founder) {
    founder.religion = r.id;
    founder.prophet = true;
    founder.traits.faith = Math.max(founder.traits.faith, 0.9);
    remember(w, founder, `«${r.name}» را بنیان گذاشتم. من پیامبر ${r.god} هستم.`);
    announce(w, `${r.symbol} ${founder.name} «${r.name}» را بنیان گذاشت!`, founder);
  }
  return r;
}

export function grieve(w, a, b, n) {
  if (!a || !b || a === b) return;
  const ra = religionOf(w, a);
  if (ra) ra.grief[b] = clamp((ra.grief[b] ?? 0) + n, -50, 200);
}

// Two people of different faiths.
export const infidel = (p, q) => p.religion && q.religion && p.religion !== q.religion;

// ---------------------------------------------------------------- every step

export function faithTick(w, dt) {
  holyTick(w, dt);
  armiesTick(w, dt);
  arrowsTick(w);
}

// The holy city belongs to whichever faith holds it alone for long enough.
function holyTick(w, dt) {
  const h = w.holy;
  const present = {};
  for (const p of w.people)
    if (p.alive && isAdult(p) && p.religion && !p.carried && Math.hypot(p.x - h.x, (p.y - h.y) * 1.3) < h.r * 0.8)
      present[p.religion] = (present[p.religion] ?? 0) + 1;
  const faiths = Object.keys(present).map(Number);
  if (faiths.length === 1 && faiths[0] !== h.owner && present[faiths[0]] >= 2) {
    if (h.contender !== faiths[0]) (h.contender = faiths[0]), (h.progress = 0);
    h.progress += dt * 0.004 * Math.min(10, present[faiths[0]]);
    if (h.progress >= 1) capture(w, faiths[0]);
  } else if (h.owner && present[h.owner]) h.progress = Math.max(0, h.progress - dt * 0.02);
  else if (!faiths.length) h.progress = Math.max(0, h.progress - dt * 0.004);
}

function capture(w, relId) {
  const h = w.holy;
  const r = religionOf(w, relId);
  const old = religionOf(w, h.owner);
  h.owner = relId;
  h.progress = 0;
  h.contender = null;
  h.since = w.day;
  r.zeal = Math.min(100, r.zeal + 25);
  fx(w, "bless", h.x, h.y - 40, 2.5);
  announce(w, `🏰 ${r.symbol} «${r.name}» ${h.name} را تصرف کرد!${old ? ` (از دست «${old.name}»)` : ""}`, h, "holy");
  for (const p of followersOf(w, r)) {
    p.mod += 25;
    remember(w, p, `${h.name} به دست «${r.name}» افتاد. ${r.god} با ماست!`);
  }
  if (old) {
    grieve(w, old.id, r.id, 60);
    for (const p of followersOf(w, old)) {
      p.mod -= 25;
      remember(w, p, `«${r.name}» ${h.name} را از ما گرفت. باید پسش بگیریم!`);
    }
  }
}

// ---------------------------------------------------------------- each day

export function faithDay(w) {
  const h = w.holy;
  for (const r of [...w.religions]) {
    const fol = followersOf(w, r);
    if (!fol.length) {
      if (w.day - r.founded > 2) {
        w.religions = w.religions.filter((o) => o !== r);
        if (h.owner === r.id) h.owner = null;
        log(w, `🕯️ «${r.name}» فراموش شد؛ دیگر پیرویی ندارد.`, null, "faith");
      }
      continue;
    }
    const prophet = byId(w, r.prophet);
    if (!prophet?.alive) {
      // The most devout takes up the staff.
      const next = fol.filter(isAdult).sort((a, b) => b.traits.faith - a.traits.faith)[0];
      if (next && next.traits.faith > 0.7) {
        r.prophet = next.id;
        next.prophet = true;
        remember(w, next, `پیشوای «${r.name}» شدم.`);
        log(w, `📿 ${next.name} پیشوای «${r.name}» شد.`, next, "faith");
      } else r.prophet = null;
    }
    // Whoever holds the holy city grows in faith; the rest grow bitter.
    if (h.owner === r.id) {
      for (const p of fol) p.traits.faith = Math.min(1, p.traits.faith + 0.01);
      r.zeal = Math.min(100, r.zeal + 2);
    } else if (h.owner) grieve(w, r.id, h.owner, 4 + r.zeal / 20);
    r.zeal = clamp(r.zeal + rand(-3, 3) - (r.zeal - 50) * 0.05, 0, 100);
  }
  schism(w);
  // Tribes take the faith of most of their people.
  for (const c of w.colonies) {
    const count = {};
    for (const p of membersOf(w, c)) if (p.religion) count[p.religion] = (count[p.religion] ?? 0) + 1;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    c.religion = top ? Number(top[0]) : null;
  }
  buildHoly(w);
  callHolyWars(w);
}

// A big faith can split: a devout rebel who can't stand the prophet takes
// their friends and starts a new one.
function schism(w) {
  if (w.religions.length >= 4 || w.day - (w.lastSchism ?? -99) < 10) return;
  for (const r of w.religions) {
    const fol = followersOf(w, r).filter(isAdult);
    const share = fol.length / Math.max(1, alive(w).filter(isAdult).length);
    if (fol.length < 16 || !chance(share > 0.7 ? 0.15 : fol.length > 24 ? 0.04 : 0)) continue;
    const prophet = byId(w, r.prophet);
    const rebel = fol
      .filter((p) => p !== prophet && p.traits.faith > 0.6 && !p.army && (!prophet || (p.rel[prophet.id] ?? 0) < 15))
      .sort((a, b) => b.traits.faith - a.traits.faith)[0];
    if (!rebel) continue;
    w.lastSchism = w.day;
    const n = foundReligion(w, rebel);
    // Friends, family, and whoever else is restless.
    const friends = fol.filter((q) => q !== rebel && q !== prophet && ((q.rel[rebel.id] ?? 0) > 20 || q.spouse === rebel.id || q.parents.includes(rebel.id) || chance(0.2)));
    for (const q of friends) {
      q.religion = n.id;
      remember(w, q, `همراه ${rebel.name} از «${r.name}» جدا شدیم و «${n.name}» را پذیرفتیم.`);
    }
    announce(w, `💢 انشعاب! ${rebel.name} و ${friends.length} نفر از «${r.name}» جدا شدند و «${n.name}» را ساختند.`, rebel, "faith");
    grieve(w, r.id, n.id, 30);
    grieve(w, n.id, r.id, 20);
    return;
  }
}

// Tribes of a faith raise a temple; big rich tribes raise a castle.
function buildHoly(w) {
  for (const c of w.colonies) {
    const adults = membersOf(w, c).filter(isAdult);
    const has = (kind) => w.houses.some((b) => b.kind === kind && b.colony === c.id && !b.ruined);
    const center = colonyCenter(w, c);
    const wealth = adults.reduce((s, p) => s + p.wealth, 0);
    const want = c.religion && adults.length >= 4 && !has("temple") ? "temple" : adults.length >= 7 && wealth > 140 && !has("keep") ? "keep" : null;
    if (!want) continue;
    const spot = findSpot(w, center.x, center.y, 240, want === "keep" ? 150 : 130);
    if (!spot) continue;
    if (want === "keep") for (const p of adults) p.wealth -= Math.floor(p.wealth * 0.35); // a tax
    const b = { id: w.nextId++, kind: want, x: spot.x, y: spot.y, owner: c.leader, colony: c.id, religion: c.religion, built: 0, hp: want === "keep" ? 300 : 180, maxHp: want === "keep" ? 300 : 180, fire: 0, ruined: false, level: 1 };
    w.houses.push(b);
    log(w, want === "temple" ? `⛪ «${c.name}» ساختن معبد را شروع کرد.` : `🏰 «${c.name}» ساختن قلعه را شروع کرد.`, b, "build");
  }
}

// ---------------------------------------------------------------- holy war

function callHolyWars(w) {
  for (const r of w.religions) {
    if (w.armies.some((a) => a.religion === r.id && a.kind === "crusade") || w.day < (r.rest ?? 0)) continue;
    if (w.armies.filter((a) => a.kind === "crusade").length >= 2) return;
    const adults = followersOf(w, r).filter(isAdult);
    if (adults.length < 5) continue;
    // Who do they hate most?
    const [enemyId, g] = Object.entries(r.grief).sort((a, b) => b[1] - a[1])[0] ?? [];
    const enemy = religionOf(w, Number(enemyId));
    const holyEmpty = !w.holy.owner && w.day >= 2;
    if (enemy && g > 45 && chance(clamp((g - 45) / 120 + r.zeal / 400, 0, 0.6))) declareHolyWar(w, r, enemy);
    else if (holyEmpty && chance(0.25 + r.zeal / 300)) declareHolyWar(w, r, null);
  }
}

export function declareHolyWar(w, r, enemy, caller = null) {
  const h = w.holy;
  let target;
  if (!enemy || h.owner === enemy.id || h.owner !== r.id) target = { x: h.x, y: h.y, kind: "holy" };
  else {
    // The infidels' biggest town: its temple, or its center.
    const towns = w.colonies.filter((c) => c.religion === enemy.id);
    const town = towns.sort((a, b) => membersOf(w, b).length - membersOf(w, a).length)[0];
    const temple = town && w.houses.find((b) => b.kind === "temple" && b.colony === town.id && !b.ruined);
    const c = temple ?? (town && colonyCenter(w, town));
    if (!c) return null;
    target = { x: c.x, y: c.y, kind: "town", colony: town.id };
  }
  const recruits = followersOf(w, r)
    .filter((p) => isAdult(p) && p.age < 62 && p.health > 55 && !p.army && !p.carried)
    .map((p) => [p, p.traits.faith * 0.5 + p.traits.brave * 0.4 + p.traits.aggr * 0.3 + rand(0, 0.25)])
    .filter(([, s]) => s > 0.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([p]) => p);
  if (recruits.length < 3) return null;
  w.stats.crusades = (w.stats.crusades ?? 0) + 1;
  const n = w.stats.crusades;
  const commander = (caller && recruits.includes(caller) && caller) || [...recruits].sort((a, b) => b.traits.brave + b.traits.faith - (a.traits.brave + a.traits.faith))[0];
  const bearer = recruits.find((p) => p !== commander);
  const home = { x: recruits.reduce((s, p) => s + p.x, 0) / recruits.length, y: recruits.reduce((s, p) => s + p.y, 0) / recruits.length };
  const army = {
    id: w.nextId++,
    kind: "crusade",
    n,
    name: `جنگ مقدس ${ORDINALS[n - 1] ?? fa(n)}`,
    religion: r.id,
    enemy: enemy?.id ?? null,
    commander: commander.id,
    bearer: bearer.id,
    members: [],
    state: "muster",
    rally: home,
    home,
    target,
    t0: w.t,
    size0: recruits.length,
    x: home.x,
    y: home.y,
    kills: 0,
    losses: 0,
  };
  w.armies.push(army);
  recruits.forEach((p, i) => enlist(w, army, p, i));
  r.zeal = Math.min(100, r.zeal + 10);
  const what = target.kind === "holy" ? w.holy.name : `سرزمین «${enemy?.name}»`;
  announce(w, `⚔️ ${r.symbol} ${army.name}! «${r.name}» به فرماندهی ${commander.name} به سوی ${what} لشکر می‌کشد.`, home, "crusade");
  for (const p of recruits) remember(w, p, `برای ${army.name} به سپاه «${r.name}» پیوستم.`);
  // Tribes of the two faiths are now at war.
  if (enemy) {
    for (const a of w.colonies.filter((c) => c.religion === r.id))
      for (const b of w.colonies.filter((c) => c.religion === enemy.id)) if (colStatus(a, b) !== "war") setStatus(w, a, b, "war", " ");
    raiseDefense(w, enemy, r, target);
  }
  return army;
}

function enlist(w, army, p, i) {
  p.army = army.id;
  p.role = p.id === army.commander ? "commander" : p.id === army.bearer ? "bearer" : i % 3 === 2 || p.traits.brave < 0.35 ? "archer" : "soldier";
  p.slot = i;
  p.task = null;
  army.members.push(p.id);
}

// The faithful of the target rush to defend it.
function raiseDefense(w, faith, attacker, target) {
  if (w.armies.some((a) => a.religion === faith.id && a.kind === "defense")) return;
  const guards = followersOf(w, faith)
    .filter((p) => isAdult(p) && p.age < 65 && p.health > 45 && !p.army && !p.carried)
    .filter((p) => p.traits.brave + p.traits.faith + rand(0, 0.4) > 1)
    .slice(0, 14);
  if (guards.length < 2) return;
  const army = {
    id: w.nextId++,
    kind: "defense",
    name: `مدافعان «${faith.name}»`,
    religion: faith.id,
    enemy: attacker.id,
    commander: guards[0].id,
    bearer: guards[1].id,
    members: [],
    state: "muster",
    rally: { x: target.x, y: target.y + 40 },
    home: { x: guards[0].x, y: guards[0].y },
    target,
    t0: w.t,
    size0: guards.length,
    x: guards[0].x,
    y: guards[0].y,
    kills: 0,
    losses: 0,
  };
  w.armies.push(army);
  guards.forEach((p, i) => enlist(w, army, p, i));
  log(w, `🛡️ ${faith.symbol} «${faith.name}» برای دفاع سپاه جمع کرد (${guards.length} نفر).`, target, "crusade");
  for (const p of guards) remember(w, p, `برای دفاع از ایمانمان در برابر «${attacker.name}» سلاح برداشتم.`);
}

export function disband(w, army, text) {
  const r = religionOf(w, army.religion);
  if (r && army.kind === "crusade") {
    // Everyone is tired of war for a while.
    r.rest = w.day + 6;
    if (army.enemy) r.grief[army.enemy] = (r.grief[army.enemy] ?? 0) * 0.4;
  }
  for (const id of army.members) {
    const p = byId(w, id);
    if (!p) continue;
    p.army = null;
    p.role = null;
    p.task = null;
    if (p.alive) remember(w, p, `${army.name} تمام شد. ${text ?? ""}`);
  }
  w.armies = w.armies.filter((a) => a !== army);
}

function armiesTick(w, dt) {
  for (const army of [...w.armies]) {
    const members = army.members.map((id) => byId(w, id)).filter((p) => p?.alive && p.army === army.id);
    army.losses = army.size0 - members.length;
    const r = religionOf(w, army.religion);
    if (!r || !members.length) {
      disband(w, army);
      continue;
    }
    let cmd = byId(w, army.commander);
    if (!cmd?.alive || cmd.army !== army.id) {
      cmd = [...members].sort((a, b) => b.traits.brave - a.traits.brave)[0];
      army.commander = cmd.id;
      cmd.role = "commander";
      log(w, `🎖️ ${cmd.name} فرماندهی ${army.name} را به دست گرفت.`, cmd, "crusade");
    }
    const bearer = byId(w, army.bearer);
    if (!bearer?.alive || bearer.army !== army.id) {
      const b = members.find((p) => p !== cmd);
      if (b) (army.bearer = b.id), (b.role = "bearer");
    }
    army.x = cmd.x;
    army.y = cmd.y;
    const age = w.t - army.t0;

    if (army.kind === "crusade" && army.state !== "return" && members.length < Math.max(2, army.size0 * 0.35)) {
      army.state = "return";
      army.t1 = w.t;
      announce(w, `🏳️ ${army.name} شکست خورد و «${r.name}» عقب نشست.`, cmd, "crusade");
      grieve(w, army.religion, army.enemy, 30);
    }
    if (army.state === "muster") {
      const gathered = members.filter((p) => dist(p, army.rally) < 180).length;
      if (army.kind === "defense") army.state = "hold";
      else if (gathered >= members.length * 0.75 || age > DAY * 0.5) {
        army.state = "march";
        log(w, `🥁 ${army.name} به راه افتاد.`, cmd, "crusade");
      }
    } else if (army.state === "march") {
      // Cross the river by a bridge.
      const t = w.terrain;
      const way = side(t, cmd.x, cmd.y) !== side(t, army.target.x, army.target.y) ? nearestBridge(t, cmd.x, cmd.y) : null;
      army.goal = way ? { x: way.x + (army.target.x > cmd.x ? 60 : -60) * (Math.abs(cmd.y - way.y) < 30 ? 1 : 0), y: way.y } : army.target;
      if (way && Math.abs(cmd.y - way.y) > 30) army.goal = { x: way.x + (cmd.x < way.x ? -70 : 70), y: way.y };
      if (!way && dist(cmd, army.target) < 140) {
        army.state = "siege";
        army.t1 = w.t;
        log(w, `🏹 ${army.name} به ${army.target.kind === "holy" ? w.holy.name : "شهر دشمن"} رسید و محاصره را آغاز کرد.`, cmd, "crusade");
      }
    } else if (army.state === "siege") {
      const won = army.target.kind === "holy" ? w.holy.owner === army.religion : !w.houses.some((b) => b.colony === army.target.colony && b.kind === "temple" && !b.ruined);
      if (won || w.t - army.t1 > DAY * 3) {
        army.state = "return";
        army.t1 = w.t;
        if (won) {
          r.zeal = Math.min(100, r.zeal + 15);
          if (army.target.kind !== "holy") announce(w, `🔥 ${army.name} پیروز شد: معبد دشمن ویران شد!`, army.target, "crusade");
          for (const p of members) (p.mod += 30), remember(w, p, `در ${army.name} پیروز شدیم!`);
        } else log(w, `⌛ محاصره‌ی ${army.name} بی‌نتیجه ماند.`, cmd, "crusade");
      }
    } else if (army.state === "hold") {
      // Defenders stand guard until the attackers are gone.
      const threat = w.armies.some((a) => a.kind === "crusade" && a.religion === army.enemy && a.state !== "return");
      if (!threat && age > DAY * 0.5) disband(w, army, "خطر رفع شد.");
    } else if (army.state === "return") {
      army.goal = army.home;
      if (w.t - army.t1 > DAY * 1.2 || dist(cmd, army.home) < 120) disband(w, army, "به خانه برگشتیم.");
    }
    if (age > DAY * 8 && w.armies.includes(army)) disband(w, army, "جنگ طولانی شد و همه خسته شدند.");
  }
}

// Where each soldier stands: rows behind the commander, facing the goal.
function slotOf(w, army, p) {
  const cmd = byId(w, army.commander);
  if (!cmd || p === cmd) return army.goal ?? army.rally;
  if (army.state === "muster" || army.state === "hold") {
    const i = p.slot;
    const a = i * 2.39996;
    const rr = 30 + 16 * Math.sqrt(i);
    return { x: army.rally.x + Math.cos(a) * rr, y: army.rally.y + Math.sin(a) * rr * 0.55 };
  }
  if (army.state === "siege") {
    const i = p.slot;
    const a = (i / Math.max(1, army.members.length)) * Math.PI * 2;
    return { x: army.target.x + Math.cos(a) * 110, y: army.target.y + Math.sin(a) * 60 };
  }
  const goal = army.goal ?? army.target;
  const d = Math.max(1, Math.hypot(goal.x - cmd.x, goal.y - cmd.y));
  const fx_ = (goal.x - cmd.x) / d;
  const fy = (goal.y - cmd.y) / d;
  const i = p.role === "bearer" ? -1 : p.slot;
  const row = i < 0 ? 0 : 1 + Math.floor(i / 4);
  const col = i < 0 ? 0 : (i % 4) - 1.5;
  return { x: cmd.x - fx_ * row * 34 - fy * col * 30, y: cmd.y - fy * row * 34 * 0.7 + fx_ * col * 22 };
}

// What a soldier does now (called from the person's decision).
export function soldierTask(w, p) {
  const army = w.armies.find((a) => a.id === p.army);
  if (!army) {
    p.army = null;
    p.role = null;
    return null;
  }
  const until = w.t + 1.2;
  // Even soldiers must eat, rest and lick their wounds.
  if (p.food < 30 || p.energy < 20 || p.health <= 30) return null;
  // An enemy within reach: fight or shoot.
  if (army.state !== "return" && p.health > 30) {
    const reach = army.state === "hold" ? 360 : 280;
    let foe = null;
    let fd = reach;
    for (const q of w.people) {
      if (!q.alive || q.carried || !isAdult(q) || q.religion === p.religion) continue;
      if (q.health < 30 && p.traits.aggr < 0.8) continue; // the wounded are left alone
      // Soldiers fight soldiers, and anyone who fights them; civilians are left to run.
      const armed = q.army || (q.task?.type === "fight" && byId(w, q.task.target)?.religion === p.religion);
      const hostile = armed && (q.religion === army.enemy || army.enemy === null || w.armies.find((a) => a.id === q.army)?.religion === army.enemy);
      if (!hostile) continue;
      const d = dist(p, q);
      if (d < fd) (fd = d), (foe = q);
    }
    if (foe) {
      if (p.role === "archer" || (shooter(w, p) && p.role !== "bearer")) return { type: "shoot", target: foe.id, until: w.t + 2.5 };
      if (p.role !== "bearer") return { type: "fight", target: foe.id, until: w.t + 5, war: true, started: false };
    }
    // Besieging a town: burn its buildings.
    if (army.state === "siege" && army.target.kind === "town" && p.role === "soldier") {
      const b = w.houses.find((b) => b.colony === army.target.colony && !b.ruined && Math.hypot(b.x - p.x, b.y - p.y) < 400);
      if (b) return { type: "raid", house: b.id, until: w.t + 8 };
    }
  }
  const s = slotOf(w, army, p);
  return { type: "march", x: s.x, y: s.y, until, army: army.id };
}

// Arrows fly in an arc; they hit if the target is still roughly there.
export function shoot(w, p, q) {
  const d = dist(p, q);
  const gun = shooter(w, p);
  w.arrows.push({
    x0: p.x,
    y0: p.y - 40,
    x1: q.x + rand(-10, 10),
    y1: q.y - 30,
    t0: w.t,
    dur: gun ? 0.12 + d / 3000 : 0.35 + d / 700,
    target: q.id,
    from: p.id,
    bullet: gun,
    dmg: rand(7, 13) * WEAPON_DAMAGE[weaponLevel(w, p)] * (gun ? 0.8 : 1),
  });
}
function arrowsTick(w) {
  if (!w.arrows.length) return;
  w.arrows = w.arrows.filter((a) => {
    if (w.t < a.t0 + a.dur) return true;
    const q = byId(w, a.target);
    if (q?.alive && Math.hypot(q.x - a.x1, q.y - 30 - a.y1) < 26 && chance(0.7)) {
      hurt(w, q, (a.dmg ?? rand(7, 13)) * wallShield(w, q), a.bullet ? "گلوله" : "تیر", a.from);
      fx(w, "hit", a.x1, a.y1, 0.3);
      const from = byId(w, a.from);
      if (from) addRel(q, from, -10);
    } else fx(w, "stuck", a.x1, a.y1 + 30, 3, { angle: Math.atan2(a.y1 - a.y0, a.x1 - a.x0) });
    return false;
  });
}

// ---------------------------------------------------------------- preaching

export function preachResult(w, p, q) {
  const r = religionOf(w, p.religion);
  if (!r) return;
  const rel = q.rel[p.id] ?? 0;
  const odds = 0.2 + p.traits.social * 0.2 + rel / 250 + (p.prophet ? 0.2 : 0) - (q.religion ? 0.25 + q.traits.faith * 0.3 : -0.15);
  if (chance(odds)) {
    const old = religionOf(w, q.religion);
    q.religion = r.id;
    q.traits.faith = Math.min(1, q.traits.faith + 0.15);
    speak(w, q, `${r.symbol} ${r.god} حق است!`, 3);
    remember(w, q, `${p.name} مرا به «${r.name}» درآورد.`);
    log(w, `${r.symbol} ${q.name} به «${r.name}» گروید${old ? ` (قبلاً «${old.name}»)` : ""}.`, q, "faith");
    if (old) grieve(w, old.id, r.id, 6);
  } else {
    speak(w, q, q.religion && q.religion !== r.id ? "کفر نگو!" : "شاید… بعداً", 2.5);
    if (q.religion && q.religion !== r.id) {
      addRel(q, p, -12);
      grieve(w, q.religion, r.id, 2);
      grieve(w, r.id, q.religion, 2);
    }
  }
}

// God's hand, read by the faithful: disasters are the infidels' fault;
// miracles prove the faith of whoever is nearby.
export function godSeen(w, x, y, r, bad) {
  const seen = alive(w).filter((p) => Math.hypot(p.x - x, p.y - y) < r);
  const count = {};
  for (const p of seen) if (p.religion) count[p.religion] = (count[p.religion] ?? 0) + 1;
  const top = Number(Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0]) || null;
  if (bad) {
    for (const rel of w.religions)
      if (count[rel.id]) for (const o of w.religions) if (o !== rel) grieve(w, rel.id, o.id, 3 + count[rel.id]);
  } else if (top) {
    const faith = religionOf(w, top);
    faith.zeal = Math.min(100, faith.zeal + 8);
    for (const p of seen)
      if (!p.religion && chance(0.5)) {
        p.religion = top;
        remember(w, p, `معجزه را دیدم و به «${faith.name}» ایمان آوردم.`);
      }
  }
}

// God speaks to someone devout: they may become a prophet.
export function revelation(w, p) {
  if (!p.alive || !isAdult(p) || p.traits.faith < 0.55 || p.prophet) return;
  if (!chance(0.5 + p.traits.faith * 0.4)) return;
  const r = religionOf(w, p.religion);
  if (!r) return foundReligion(w, p);
  p.prophet = true;
  r.prophet = p.id;
  r.zeal = Math.min(100, r.zeal + 20);
  announce(w, `📜 ${p.name} ادعای پیامبری کرد: خدا با او سخن گفته است! (${r.symbol} ${r.name})`, p, "faith");
  remember(w, p, "خدا با من سخن گفت. من برگزیده‌ام.");
}

export function holyStatus(w) {
  const h = w.holy;
  return { owner: religionOf(w, h.owner), contender: religionOf(w, h.contender), progress: h.progress };
}
