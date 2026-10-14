import { useEffect, useRef, useState } from "react";
import { loadStatic } from "./ddragon.js";
import ChampionPicker from "./components/ChampionPicker.jsx";
import Result from "./components/Result.jsx";

const ROLES = [
  { id: "top", label: "Top" },
  { id: "jungle", label: "Jungle" },
  { id: "mid", label: "Mid" },
  { id: "adc", label: "Bot" },
  { id: "support", label: "Support" },
];

const CACHE_HOURS = 12;

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > CACHE_HOURS * 3600e3) return null;
    return data;
  } catch {
    return null;
  }
}
function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {}
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  return { champ: p.get("champ") || "", enemy: p.get("vs") || "", role: p.get("role") || "" };
}

export default function App() {
  const [dd, setDd] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const init = readUrl();
  const [role, setRole] = useState(ROLES.some((r) => r.id === init.role) ? init.role : "top");
  const [champ, setChamp] = useState(init.champ);
  const [enemy, setEnemy] = useState(init.enemy);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const resultRef = useRef(null);
  const autoRan = useRef(false);

  useEffect(() => {
    loadStatic()
      .then((d) => {
        setDd(d);
        if (init.champ && !d.champById[init.champ]) setChamp("");
        if (init.enemy && !d.champById[init.enemy]) setEnemy("");
      })
      .catch((e) => setLoadErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geteilter Link -> direkt generieren
  useEffect(() => {
    if (dd && !autoRan.current && init.champ && dd.champById[init.champ]) {
      autoRan.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dd]);

  async function generate() {
    if (!champ || loading) return;
    setError("");
    setLoading(true);
    const params = new URLSearchParams({ champ, role });
    if (enemy) params.set("vs", enemy);
    history.replaceState(null, "", `?${params}`);

    const key = `lc|${dd.version}|${champ}|${role}|${enemy}`;
    const cached = readCache(key);
    if (cached) {
      setResult(cached);
      setLoading(false);
      scrollToResult();
      return;
    }
    try {
      const r = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ champion: champ, enemy: enemy || null, role }),
      });
      const data = await r.json().catch(() => ({ error: "Server-Antwort unlesbar" }));
      if (!r.ok || data.error) throw new Error(data.error || `Fehler ${r.status}`);
      setResult(data);
      writeCache(key, data);
      scrollToResult();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function scrollToResult() {
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
            <path d="M32 6 54 19v26L32 58 10 45V19z" fill="none" stroke="currentColor" strokeWidth="4" />
            <path d="M32 20v24M22 32h20" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
          </svg>
          <span>LaneCoach</span>
        </div>
        {dd && <span className="patch">Patch {dd.version}</span>}
      </header>

      <main>
        <section className="panel">
          <h1 className="title">Wen spielst du heute?</h1>
          <p className="muted">Champ wählen, Lane wählen, optional deinen Gegner angeben. Du bekommst Counter, Runen, Items und Skill-Order.</p>

          {loadErr && <p className="error">{loadErr}</p>}
          {!dd && !loadErr && <div className="skeleton" />}

          {dd && (
            <>
              <div className="field">
                <span className="field-label">Lane</span>
                <div className="roles" role="radiogroup">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={role === r.id}
                      className={role === r.id ? "on" : ""}
                      onClick={() => setRole(r.id)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pickers">
                <ChampionPicker
                  label="Dein Champion"
                  champions={dd.champions}
                  version={dd.version}
                  value={champ}
                  onChange={setChamp}
                  exclude={enemy}
                  placeholder="z. B. Nasus"
                />
                <ChampionPicker
                  label="Dein Gegner"
                  hint="optional"
                  champions={dd.champions}
                  version={dd.version}
                  value={enemy}
                  onChange={setEnemy}
                  exclude={champ}
                  placeholder="z. B. Garen"
                />
              </div>

              <div className="actions">
                <button className="cta" type="button" disabled={!champ || loading} onClick={generate}>
                  {loading ? <><span className="spinner" /> Analysiere…</> : "Generieren"}
                </button>
                {result && (
                  <button className="ghost" type="button" onClick={share}>
                    {copied ? "Link kopiert" : "Link teilen"}
                  </button>
                )}
              </div>
              {error && <p className="error">{error}</p>}
            </>
          )}
        </section>

        <div ref={resultRef}>{dd && result && !loading && <Result dd={dd} data={result} />}</div>
        {loading && (
          <div className="loading-card">
            <span className="spinner big" />
            <p>Coach schaut sich das Matchup an…</p>
          </div>
        )}
      </main>

      <footer className="foot">
        LaneCoach ist ein Fanprojekt und steht in keiner Verbindung zu Riot Games. Bilder und Spieldaten © Riot Games.
      </footer>
    </div>
  );
}
