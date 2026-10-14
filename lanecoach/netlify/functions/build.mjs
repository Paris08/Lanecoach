// LaneCoach – Netlify Function
// Holt aktuelle Spieldaten von Riot (Data Dragon), lässt Groq Counter + Build
// erstellen und gleicht alle Namen gegen die echten Riot-Daten ab.
// So kommen nur Items/Runen/Champs zurück, die es im aktuellen Patch wirklich gibt.

const DD = "https://ddragon.leagueoflegends.com";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const ROLES = {
  top: "Top Lane",
  jungle: "Jungle",
  mid: "Mid Lane",
  adc: "Bot Lane (ADC)",
  support: "Support",
};

// Stat-Shards stehen nicht in Data Dragon -> feste Liste (Stand Season 14+)
export const SHARD_ROWS = [
  ["Adaptive Force", "Attack Speed", "Ability Haste"],
  ["Adaptive Force", "Move Speed", "Health Scaling"],
  ["Health", "Tenacity and Slow Resist", "Health Scaling"],
];

// Champs mit Sonder-Skillsystem: hier kein 18er-Raster berechnen
const SPECIAL_SKILL_CHAMPS = ["Udyr", "Jayce", "Elise", "Nidalee", "Karma"];

// ---------- Cache (bleibt erhalten, solange die Funktion "warm" ist) ----------
let ddCache = null; // { version, at, champs, items, trees, summoners }
const resultCache = new Map();

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Riot-Daten nicht erreichbar (${r.status}): ${url}`);
  return r.json();
}

export async function loadDataDragon() {
  if (ddCache && Date.now() - ddCache.at < 60 * 60 * 1000) return ddCache;
  const versions = await getJson(`${DD}/api/versions.json`);
  const version = versions[0];
  const base = `${DD}/cdn/${version}/data/en_US`;
  const [champJson, itemJson, trees, sumJson] = await Promise.all([
    getJson(`${base}/champion.json`),
    getJson(`${base}/item.json`),
    getJson(`${base}/runesReforged.json`),
    getJson(`${base}/summoner.json`),
  ]);
  ddCache = {
    version,
    at: Date.now(),
    champs: Object.values(champJson.data),
    items: prepareItems(itemJson.data),
    trees,
    summoners: Object.values(sumJson.data).filter((s) => s.modes?.includes("CLASSIC")),
  };
  return ddCache;
}

// Nur Items, die man auf Summoner's Rift wirklich kaufen kann
export function prepareItems(data) {
  const byName = new Map();
  for (const [id, it] of Object.entries(data)) {
    if (!it.maps?.["11"]) continue;
    if (!it.gold?.purchasable) continue;
    if (it.inStore === false || it.hideFromAll) continue;
    if (it.requiredChampion || it.requiredAlly) continue;
    if (Number(id) >= 100000) continue; // Arena-/Moduskopien
    const name = it.name.replace(/<[^>]+>/g, "").trim();
    const tags = it.tags || [];
    const total = it.gold.total;
    let cat = null;
    if (tags.includes("Boots") && (it.from?.length || 0) > 0) cat = "boots";
    else if (!it.from?.length && total <= 500 && !tags.includes("Boots")) cat = "starter";
    else if (total >= 2000 && !(it.into?.length)) cat = "legendary";
    else if (tags.includes("Consumable")) cat = "starter";
    if (!cat) continue; // Komponenten lassen wir weg
    const prev = byName.get(name);
    if (!prev || Number(id) < Number(prev.id)) byName.set(name, { id, name, cat });
  }
  return [...byName.values()];
}

// ---------- Namens-Abgleich ----------
export const norm = (s = "") =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// list: [{ ...obj }], keys: Funktion die alle möglichen Namen eines Objekts liefert
export function findBest(name, list, keys) {
  const q = norm(name);
  if (!q) return null;
  let best = null, bestScore = Infinity;
  for (const obj of list) {
    for (const k of keys(obj)) {
      const c = norm(k);
      if (!c) continue;
      if (c === q) return obj;
      let score = Infinity;
      if (c.length > 4 && q.length > 4 && (c.includes(q) || q.includes(c))) score = 1;
      else {
        const d = lev(c, q);
        if (d <= Math.max(1, Math.floor(c.length / 6))) score = 1 + d;
      }
      if (score < bestScore) { bestScore = score; best = obj; }
    }
  }
  return best;
}

const champKeys = (c) => [c.id, c.name];
const nameKey = (o) => [o.name];

// ---------- Skill-Reihenfolge ----------
export function buildSkillGrid(first3, maxOrder) {
  const valid = ["Q", "W", "E"];
  const order = [...new Set((maxOrder || []).map((x) => String(x).toUpperCase()).filter((x) => valid.includes(x)))];
  for (const v of valid) if (!order.includes(v)) order.push(v);
  const start = (first3 || []).map((x) => String(x).toUpperCase());
  const rank = { Q: 0, W: 0, E: 0, R: 0 };
  const grid = [];
  const canLevel = (s, lvl) => rank[s] < 5 && rank[s] + 1 <= Math.ceil(lvl / 2);
  for (let lvl = 1; lvl <= 18; lvl++) {
    let pick = null;
    if ([6, 11, 16].includes(lvl)) pick = "R";
    else if (lvl <= 3 && valid.includes(start[lvl - 1]) && canLevel(start[lvl - 1], lvl)) pick = start[lvl - 1];
    else if (lvl <= 3) pick = order.find((s) => rank[s] === 0) || order.find((s) => canLevel(s, lvl));
    else pick = order.find((s) => canLevel(s, lvl));
    if (!pick) pick = valid.find((s) => rank[s] < 5);
    rank[pick]++;
    grid.push(pick);
  }
  return { grid, maxOrder: order };
}

// ---------- Runen ----------
export function resolveRunes(r, trees) {
  if (!r) return null;
  const warnings = [];
  const allKeystones = trees.flatMap((t) => t.slots[0].runes.map((ru) => ({ ...ru, treeId: t.id })));

  let primary = findBest(r.primaryTree, trees, (t) => [t.name, t.key]);
  let keystone = findBest(r.keystone, allKeystones, nameKey);
  if (keystone && (!primary || primary.id !== keystone.treeId)) primary = trees.find((t) => t.id === keystone.treeId);
  if (!primary) return null;
  if (!keystone || keystone.treeId !== primary.id) keystone = null;

  const pickPerSlot = (tree, names, slotIdx) => {
    const res = [];
    for (const si of slotIdx) {
      const runes = tree.slots[si]?.runes || [];
      let hit = null;
      for (const n of names || []) {
        hit = findBest(n, runes, nameKey);
        if (hit) break;
      }
      res.push(hit ? hit.id : null);
    }
    return res;
  };

  const primaryIds = pickPerSlot(primary, r.primary, [1, 2, 3]);

  let secondary = findBest(r.secondaryTree, trees.filter((t) => t.id !== primary.id), (t) => [t.name, t.key]);
  if (!secondary) {
    // Baum anhand der Runen erraten
    for (const t of trees) {
      if (t.id === primary.id) continue;
      const runes = t.slots.slice(1).flatMap((s) => s.runes);
      if ((r.secondary || []).some((n) => findBest(n, runes, nameKey))) { secondary = t; break; }
    }
  }
  let secondaryIds = [];
  if (secondary) {
    const usedSlots = new Set();
    for (const n of r.secondary || []) {
      for (let si = 1; si < secondary.slots.length; si++) {
        if (usedSlots.has(si)) continue;
        const hit = findBest(n, secondary.slots[si].runes, nameKey);
        if (hit) { secondaryIds.push(hit.id); usedSlots.add(si); break; }
      }
      if (secondaryIds.length === 2) break;
    }
  }

  const shards = SHARD_ROWS.map((row, i) => {
    const n = (r.shards || [])[i];
    const hit = findBest(n, row.map((name) => ({ name })), nameKey);
    return hit ? hit.name : row[0];
  });

  if (!keystone) warnings.push(`Keystone "${r.keystone}" nicht gefunden`);
  if (primaryIds.includes(null) || secondaryIds.length < 2) warnings.push("Runen teilweise unvollständig");

  return {
    data: {
      primaryTreeId: primary.id,
      keystoneId: keystone?.id ?? null,
      primaryIds,
      secondaryTreeId: secondary?.id ?? null,
      secondaryIds,
      shards,
    },
    warnings,
  };
}

// ---------- Prompt ----------
function buildPrompt({ champ, enemy, role, dd }) {
  const list = (cat) => dd.items.filter((i) => i.cat === cat).map((i) => i.name).join(", ");
  const runeText = dd.trees
    .map((t) => {
      const [ks, ...rest] = t.slots;
      return `${t.name}: Keystones [${ks.runes.map((x) => x.name).join(", ")}]; ` +
        rest.map((s, i) => `Reihe ${i + 1} [${s.runes.map((x) => x.name).join(", ")}]`).join("; ");
    })
    .join("\n");

  const enemyLine = enemy
    ? `Gegner auf der Lane: ${enemy.name}. Passe Runen, Items, Summoner Spells und Skill-Order GEZIELT an dieses Matchup an und fülle "matchup" aus.`
    : `Kein Gegner angegeben: Gib den Standard-Build und setze "matchup" auf null.`;

  const system = `Du bist ein League-of-Legends-Coach (Challenger-Niveau) für Anfänger. Aktueller Patch: ${dd.version}.
Antworte NUR mit gültigem JSON. Alle Erklärtexte auf DEUTSCH, kurz, konkret und anfängerfreundlich.
Item-, Runen-, Summoner- und Champion-Namen MÜSSEN exakt (englisch) aus den Listen unten stammen.
Nutze ausschließlich Items aus diesen Listen, es gibt keine Mythic-Items mehr.

ITEMS
Starter/Verbrauchsgegenstände: ${list("starter")}
Stiefel: ${list("boots")}
Fertige Items: ${list("legendary")}

RUNEN (Hauptbaum: 1 Keystone + je 1 Rune aus Reihe 1, 2, 3; Nebenbaum: 2 Runen aus zwei verschiedenen Reihen eines ANDEREN Baums)
${runeText}
Stat-Shards: Reihe 1 [${SHARD_ROWS[0].join(", ")}]; Reihe 2 [${SHARD_ROWS[1].join(", ")}]; Reihe 3 [${SHARD_ROWS[2].join(", ")}]

SUMMONER SPELLS: ${dd.summoners.map((s) => s.name).join(", ")}

CHAMPIONS: ${dd.champs.map((c) => c.name).join(", ")}`;

  const user = `Mein Champion: ${champ.name}. Rolle: ${ROLES[role]}.
${enemyLine}

Gib genau dieses JSON-Format zurück:
{
  "overview": "2-3 Sätze: Spielweise und Gewinnbedingung von ${champ.name} auf ${ROLES[role]}",
  "hardCounters": [{"champion": "Name", "reason": "warum er ${champ.name} kontert", "tip": "wie man trotzdem überlebt"}],
  "goodAgainst": [{"champion": "Name", "reason": "warum ${champ.name} hier stark ist"}],
  "matchup": ${enemy ? `{"difficulty": 1-10, "verdict": "Hardcounter | Schwer | Ausgeglichen | Gut | Sehr gut", "summary": "1-2 Sätze", "earlyGame": "Was in Level 1-5 tun", "tips": ["3-5 konkrete Tipps"], "avoid": ["2-3 Dinge die man NICHT tun darf"], "powerSpikes": ["wann ${champ.name} stärker ist", "wann ${enemy.name} stärker ist"]}` : "null"},
  "summonerSpells": ["Spell 1", "Spell 2"],
  "runes": {"primaryTree": "", "keystone": "", "primary": ["Reihe1", "Reihe2", "Reihe3"], "secondaryTree": "", "secondary": ["", ""], "shards": ["Reihe1", "Reihe2", "Reihe3"], "why": "1 Satz"},
  "items": {"starter": ["", ""], "boots": "", "core": ["Item 1", "Item 2", "Item 3"], "situational": [{"item": "", "when": "wann kaufen"}], "why": "1-2 Sätze"},
  "skills": {"first3": ["Q", "W", "E"], "maxOrder": ["Q", "E", "W"], "why": "1 Satz"}
}
Regeln: hardCounters = die 5 Champions, die ${champ.name} auf ${ROLES[role]} am härtesten kontern (nur Champs, die realistisch auf dieser Rolle gespielt werden). goodAgainst = 3 Champions. situational = 3-4 Items. Keine Items doppelt.`;

  return { system, user };
}

async function askGroq(system, user) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY fehlt in den Netlify Environment Variables.");
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      lastErr = new Error(r.status === 429 ? "Groq-Limit erreicht, warte kurz und versuch's nochmal." : `Groq-Fehler ${r.status}: ${t.slice(0, 200)}`);
      if (r.status === 429) break;
      continue;
    }
    const j = await r.json();
    try {
      return JSON.parse(j.choices[0].message.content);
    } catch (e) {
      lastErr = new Error("KI hat kein gültiges JSON geliefert.");
    }
  }
  throw lastErr;
}

// ---------- Rohantwort -> geprüfte Daten ----------
export function resolveAll(raw, { champ, enemy, role, dd }) {
  const warnings = [];
  const champList = dd.champs.filter((c) => c.id !== champ.id);
  const itemById = (cats) => (n) => {
    const pool = cats ? dd.items.filter((i) => cats.includes(i.cat)) : dd.items;
    const hit = findBest(n, pool, nameKey) || findBest(n, dd.items, nameKey);
    if (!hit && n) warnings.push(`Item "${n}" gibt es im aktuellen Patch nicht`);
    return hit?.id ?? null;
  };
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];

  const mapChamps = (arr, max) => {
    const seen = new Set();
    const out = [];
    for (const e of arr || []) {
      const c = findBest(e?.champion, champList, champKeys);
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ id: c.id, reason: e.reason || "", tip: e.tip || "" });
      if (out.length >= max) break;
    }
    return out;
  };

  const runes = resolveRunes(raw.runes, dd.trees);
  if (runes) warnings.push(...runes.warnings);

  const summoners = uniq((raw.summonerSpells || []).map((n) => findBest(n, dd.summoners, nameKey)?.id)).slice(0, 2);

  const it = raw.items || {};
  const core = uniq((it.core || []).map(itemById(["legendary"])));
  const boots = itemById(["boots"])(it.boots);
  const starter = (it.starter || []).map(itemById(["starter"])).filter(Boolean);
  const situational = [];
  for (const s of it.situational || []) {
    const id = itemById(["legendary", "boots"])(s?.item);
    if (id && !core.includes(id) && !situational.some((x) => x.id === id)) situational.push({ id, when: s.when || "" });
  }

  const special = SPECIAL_SKILL_CHAMPS.includes(champ.id);
  const sk = raw.skills || {};
  const { grid, maxOrder } = buildSkillGrid(sk.first3, sk.maxOrder);

  let matchup = null;
  if (enemy && raw.matchup) {
    const m = raw.matchup;
    const d = Math.min(10, Math.max(1, Number(m.difficulty) || 5));
    matchup = {
      difficulty: d,
      verdict: m.verdict || "",
      summary: m.summary || "",
      earlyGame: m.earlyGame || "",
      tips: Array.isArray(m.tips) ? m.tips : [],
      avoid: Array.isArray(m.avoid) ? m.avoid : [],
      powerSpikes: Array.isArray(m.powerSpikes) ? m.powerSpikes : [],
    };
  }

  const hardCounters = mapChamps(raw.hardCounters, 5);
  return {
    patch: dd.version,
    role,
    champion: champ.id,
    enemy: enemy?.id ?? null,
    enemyIsHardCounter: enemy ? hardCounters.some((c) => c.id === enemy.id) || (matchup?.difficulty ?? 0) >= 8 : false,
    overview: raw.overview || "",
    hardCounters,
    goodAgainst: mapChamps(raw.goodAgainst, 3),
    matchup,
    summoners,
    runes: runes?.data ?? null,
    runesWhy: raw.runes?.why || "",
    items: { starter, boots, core, situational },
    itemsWhy: it.why || "",
    skills: { first3: sk.first3 || [], maxOrder, grid: special ? null : grid, special },
    skillsWhy: sk.why || "",
    warnings: [...new Set(warnings)],
  };
}

// ---------- Handler ----------
export default async (req) => {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Nur POST erlaubt" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const role = ROLES[body.role] ? body.role : "top";
    const dd = await loadDataDragon();

    const champ = dd.champs.find((c) => c.id === body.champion);
    if (!champ) return json({ error: "Champion nicht gefunden" }, 400);
    const enemy = body.enemy ? dd.champs.find((c) => c.id === body.enemy) : null;
    if (enemy && enemy.id === champ.id) return json({ error: "Spiegelmatchup: wähl einen anderen Gegner 😉" }, 400);

    const cacheKey = `${dd.version}|${champ.id}|${role}|${enemy?.id || ""}`;
    if (resultCache.has(cacheKey)) return json(resultCache.get(cacheKey));

    const { system, user } = buildPrompt({ champ, enemy, role, dd });
    const raw = await askGroq(system, user);
    const result = resolveAll(raw, { champ, enemy, role, dd });

    if (resultCache.size > 300) resultCache.clear();
    resultCache.set(cacheKey, result);
    return json(result);
  } catch (e) {
    console.error(e);
    return json({ error: e.message || "Unbekannter Fehler" }, 500);
  }
};

export const config = { path: "/api/build" };
