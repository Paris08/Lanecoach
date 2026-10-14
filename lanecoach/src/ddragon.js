// Offizielle Riot-Daten (Data Dragon) – deutsche Namen + Icons
const DD = "https://ddragon.leagueoflegends.com";
const LANG = "de_DE";

export const SHARD_DE = {
  "Adaptive Force": "Adaptive Kraft",
  "Attack Speed": "Angriffstempo",
  "Ability Haste": "Fähigkeitstempo",
  "Move Speed": "Lauftempo",
  "Health Scaling": "Leben (skalierend)",
  Health: "Leben",
  "Tenacity and Slow Resist": "Zähigkeit & Verlangsamungsresistenz",
};

let cache = null;

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Riot-Daten konnten nicht geladen werden");
  return r.json();
}

export async function loadStatic() {
  if (cache) return cache;
  const versions = await getJson(`${DD}/api/versions.json`);
  const v = versions[0];
  const base = `${DD}/cdn/${v}/data/${LANG}`;
  const [champs, items, trees, summoners] = await Promise.all([
    getJson(`${base}/champion.json`),
    getJson(`${base}/item.json`),
    getJson(`${base}/runesReforged.json`),
    getJson(`${base}/summoner.json`),
  ]);
  const runeById = {};
  const treeById = {};
  for (const t of trees) {
    treeById[t.id] = t;
    for (const s of t.slots) for (const r of s.runes) runeById[r.id] = r;
  }
  const summonerById = {};
  for (const s of Object.values(summoners.data)) summonerById[s.id] = s;

  cache = {
    version: v,
    champions: Object.values(champs.data).sort((a, b) => a.name.localeCompare(b.name, "de")),
    champById: champs.data,
    items: items.data,
    runeById,
    treeById,
    summonerById,
  };
  return cache;
}

const spellCache = {};
export async function loadChampionSpells(version, id) {
  const key = `${version}|${id}`;
  if (!spellCache[key]) {
    spellCache[key] = getJson(`${DD}/cdn/${version}/data/${LANG}/champion/${id}.json`).then((j) => j.data[id]);
  }
  return spellCache[key];
}

export const img = {
  champ: (v, id) => `${DD}/cdn/${v}/img/champion/${id}.png`,
  item: (v, id) => `${DD}/cdn/${v}/img/item/${id}.png`,
  spell: (v, file) => `${DD}/cdn/${v}/img/spell/${file}`,
  rune: (icon) => `${DD}/cdn/img/${icon}`,
};

export const stripHtml = (s = "") => s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
