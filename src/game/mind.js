// Real minds for the little people: Claude reads who a person is, what they
// remember and who is around, and decides what they think, say and do next.
// Optional — the world runs on its own rules without it.
import Anthropic from "@anthropic-ai/sdk";
import { INTENTS, byId, colRel, colStatus, colonyOf, happiness, houseOf, isAdult, nameOf } from "./world.js";
import { SHAPE_NAMES, fa } from "./util.js";
import { followersOf, religionOf } from "./crusade.js";
import { moodWord } from "./world.js";

export const MODELS = [
  { id: "claude-opus-5", name: "Claude Opus 5 (هوشمندترین)" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5 (متعادل)" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5 (سریع و ارزان)" },
];

const SYSTEM = `You are the inner mind of one small villager in a god game. The world is a meadow of little line-art people whose heads are coins, squares, triangles, hexagons or stars. They eat fruit from trees, mine coins at rocks, build houses, talk, fall in love, marry, have children, form tribes, make alliances and fight wars. Above them is God — the player — who can bless them, throw lightning, meteors, earthquakes, plague, rain gold, or pick people up and throw them.

You will be given everything this villager knows about themself, the people around them and recent events. Decide, in character, what they think, what they say out loud, and what they do next.

Rules:
- Stay fully in character: personality traits (0 = low, 1 = high) must shape the choice. Kind people help, greedy people chase coins, aggressive people pick fights, devout people pray, cowards flee.
- Remember the past: grudges, love, grief and gratitude from the memories should drive decisions.
- "say" is one short spoken line (at most ~12 words) in natural, colloquial Persian (Farsi). "thought" is one or two sentences of private thought in Persian.
- "intent" must be one of the listed actions. "target" is the exact name of a person (or tribe name for tribe actions) the action is aimed at, or "" if none.
- "feelings" lists how this moment changed feelings toward specific people by name (change from -30 to 30); may be empty.
- Tribe actions (ally, declare_war, make_peace) only work if this villager is a tribe leader; found_colony, join_colony and leave_colony are about their own membership.
- Faith matters deeply here. Religions compete for the holy city on the sacred hill; "preach" tries to convert the target person, "pilgrimage" walks to the holy city, and "holy_war" (only for a prophet or a tribe leader) calls a crusade — target the rival religion's name, or leave it empty to march on the holy city.
- If God speaks to them, answer God directly in "say" — with awe, fear, anger, gratitude or defiance as fits their faith and history.`;

const SCHEMA = {
  type: "object",
  properties: {
    thought: { type: "string" },
    say: { type: "string" },
    intent: { type: "string", enum: INTENTS },
    target: { type: "string" },
    feelings: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, change: { type: "integer" } },
        required: ["name", "change"],
        additionalProperties: false,
      },
    },
  },
  required: ["thought", "say", "intent", "target", "feelings"],
  additionalProperties: false,
};

const pct = (v) => Math.round(v * 10) / 10;

// Everything this person knows, as plain text.
export function describe(w, p) {
  const T = p.traits;
  const col = p.colony && colonyOf(w, p.colony);
  const home = p.home && houseOf(w, p.home);
  const lines = [];
  lines.push(`Name: ${p.name}. Age: ${Math.floor(p.age)} (${isAdult(p) ? "adult" : "child"}). Head: ${SHAPE_NAMES[p.shape]}.`);
  lines.push(
    `Traits: kindness ${pct(T.kind)}, aggression ${pct(T.aggr)}, greed ${pct(T.greed)}, sociability ${pct(T.social)}, faith in God ${pct(T.faith)}, bravery ${pct(T.brave)}, work ethic ${pct(T.work)}.`,
  );
  lines.push(
    `State: health ${Math.round(p.health)}/100, hunger satisfied ${Math.round(p.food)}/100, energy ${Math.round(p.energy)}/100, loneliness ${Math.round(100 - p.social)}/100, coins ${p.wealth}, mood: ${moodWord(happiness(w, p))}${p.sick ? ", SICK with plague" : ""}.`,
  );
  const faith = religionOf(w, p.religion);
  lines.push(
    faith
      ? `Faith: ${faith.name} (worships ${faith.god}; ${followersOf(w, faith).length} followers)${p.prophet ? ". I AM ITS PROPHET." : ""}${p.army ? ` I am a ${p.role} in the army "${w.armies.find((a) => a.id === p.army)?.name}".` : ""}`
      : "Faith: none yet.",
  );
  const holyOwner = religionOf(w, w.holy.owner);
  lines.push(
    `The holy city is held by ${holyOwner ? holyOwner.name : "nobody"}. Religions: ${w.religions
      .map((r) => `${r.name} (${followersOf(w, r).length})${faith && r !== faith ? `, our grievance against them ${Math.round(faith.grief[r.id] ?? 0)}` : ""}`)
      .join("; ")}. Active holy wars: ${w.armies.filter((a) => a.kind === "crusade").map((a) => `${a.name} by ${religionOf(w, a.religion)?.name} (${a.state})`).join("; ") || "none"}. Season: ${w.season}, weather: ${w.weather.type}.`,
  );
  lines.push(`Home: ${home ? (home.ruined ? "ruined" : home.built < 1 ? "under construction" : "has a house") : "homeless"} (a house costs 20 coins).`);
  lines.push(`Spouse: ${p.spouse ? nameOf(w, p.spouse) : "none"}. Children: ${p.kids.map((id) => nameOf(w, id)).join(", ") || "none"}. Parents: ${p.parents.map((id) => nameOf(w, id)).join(", ") || "unknown"}.`);
  if (col) {
    const leader = byId(w, col.leader);
    const rels = w.colonies
      .filter((c) => c !== col)
      .map((c) => `${c.name}: ${colStatus(col, c) ?? "neutral"} (${Math.round(colRel(col, c))})`);
    lines.push(`Tribe: ${col.name}, leader ${leader?.name ?? "?"}${col.leader === p.id ? " (that's me)" : ""}. Relations: ${rels.join("; ") || "no other tribes"}.`);
  } else lines.push(`Tribe: none. Tribes that exist: ${w.colonies.map((c) => c.name).join(", ") || "none"}.`);

  const near = w.people
    .filter((q) => q.alive && q !== p && Math.hypot(q.x - p.x, q.y - p.y) < 600)
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
    .slice(0, 8);
  lines.push("People nearby (name, my feeling toward them from -100 to 100, their tribe, what they're doing):");
  for (const q of near)
    lines.push(
      `- ${q.name}: ${Math.round(p.rel[q.id] ?? 0)}, ${q.colony ? colonyOf(w, q.colony)?.name : "no tribe"}, ${religionOf(w, q.religion)?.name ?? "no faith"}${q.prophet ? " (prophet)" : ""}, ${isAdult(q) ? "" : "child, "}${q.spouse ? `married to ${nameOf(w, q.spouse)}, ` : "single, "}${q.wealth} coins, ${q.task?.type ?? "idle"}`,
    );
  const strong = Object.entries(p.rel)
    .filter(([, v]) => Math.abs(v) > 40)
    .map(([id, v]) => `${nameOf(w, Number(id))} (${Math.round(v)})`)
    .slice(0, 8);
  if (strong.length) lines.push(`Strong feelings: ${strong.join(", ")}.`);
  lines.push(`Memories (oldest first): ${p.memories.map((m) => `[day ${m.day}] ${m.text}`).join(" | ") || "nothing yet"}`);
  const news = w.events
    .slice(-8)
    .map((e) => e.text)
    .join(" | ");
  lines.push(`Recent news in the world: ${news}`);
  lines.push(`It is day ${w.day}.`);
  return lines.join("\n");
}

let client = null;
let clientKey = "";
function getClient(key) {
  if (!client || clientKey !== key) {
    // The key stays in this browser; requests go straight to Anthropic.
    client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    clientKey = key;
  }
  return client;
}

// Ask the mind. `godMessage` makes it an answer to God.
export async function think(w, p, { key, model }, godMessage = null) {
  const prompt = `${describe(w, p)}\n\n${
    godMessage ? `GOD SPEAKS TO YOU FROM THE SKY: «${godMessage}»\nRespond to God, then decide what to do.` : "What do you think, say and do now?"
  }`;
  const format = { type: "json_schema", schema: SCHEMA };
  const haiku = model === "claude-haiku-4-5"; // no effort setting or fallbacks there
  const response = await getClient(key).beta.messages.create({
    model,
    max_tokens: 4000,
    ...(haiku
      ? { output_config: { format } }
      : {
          // Low effort: a villager's next move doesn't need deep thought.
          output_config: { effort: "low", format },
          // If a request is declined, the API retries it on a fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        }),
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") throw new Error("مدل از پاسخ دادن خودداری کرد");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  let r;
  try {
    r = JSON.parse(text);
  } catch {
    throw new Error("پاسخ مدل قابل خواندن نبود");
  }
  return { ...r, usage: response.usage };
}

// Who should think next: whoever God is looking at, else someone who has
// been through something lately, else anyone.
export function pickThinker(w, selected, lastThought) {
  const living = w.people.filter((p) => p.alive && isAdult(p) && !p.carried);
  const sel = living.find((p) => p.id === selected);
  if (sel && w.t - (lastThought[sel.id] ?? -1e9) > 25) return sel;
  const scored = living.map((p) => {
    const last = lastThought[p.id] ?? -1e9;
    const fresh = p.memories.filter((m) => m.day >= w.day - 1).length;
    return [p, (w.t - last > 60 ? 1 : 0.1) * (1 + fresh) * Math.random()];
  });
  scored.sort((a, b) => b[1] - a[1]);
  return scored[0]?.[0] ?? null;
}

export { fa };
