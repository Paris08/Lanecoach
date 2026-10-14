import { useEffect, useState } from "react";
import { img, loadChampionSpells, SHARD_DE, stripHtml } from "../ddragon.js";

const ROLE_UGG = { top: "top", jungle: "jungle", mid: "mid", adc: "adc", support: "support" };

function Icon({ src, alt, size = 40, title, round }) {
  return <img className={`ic ${round ? "round" : ""}`} src={src} alt={alt} title={title || alt} width={size} height={size} loading="lazy" />;
}

function Section({ title, children, aside }) {
  return (
    <section className="card">
      <header className="card-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function ItemIcon({ dd, id, size = 44 }) {
  const it = dd.items[id];
  if (!it) return null;
  return (
    <div className="item">
      <Icon src={img.item(dd.version, id)} alt={it.name} size={size} title={`${it.name} (${it.gold?.total ?? "?"} Gold)`} />
      <span>{it.name}</span>
    </div>
  );
}

function ChampChip({ dd, id, children, tone }) {
  const c = dd.champById[id];
  if (!c) return null;
  return (
    <li className={`champ-row ${tone || ""}`}>
      <Icon src={img.champ(dd.version, id)} alt={c.name} size={48} />
      <div>
        <strong>{c.name}</strong>
        {children}
      </div>
    </li>
  );
}

function verdictTone(d) {
  if (d >= 8) return "danger";
  if (d >= 6) return "warn";
  if (d >= 4) return "neutral";
  return "good";
}

export default function Result({ dd, data }) {
  const [spells, setSpells] = useState(null);
  const champ = dd.champById[data.champion];
  const enemy = data.enemy ? dd.champById[data.enemy] : null;

  useEffect(() => {
    let alive = true;
    loadChampionSpells(dd.version, data.champion).then((c) => alive && setSpells(c.spells)).catch(() => {});
    return () => { alive = false; };
  }, [dd.version, data.champion]);

  const slug = champ.id.toLowerCase();
  const role = ROLE_UGG[data.role];
  const uggBuild = `https://u.gg/lol/champions/${slug}/build?role=${role}`;
  const uggCounter = `https://u.gg/lol/champions/${slug}/counter?role=${role}`;

  const r = data.runes;
  const keystone = r?.keystoneId ? dd.runeById[r.keystoneId] : null;
  const pTree = r ? dd.treeById[r.primaryTreeId] : null;
  const sTree = r?.secondaryTreeId ? dd.treeById[r.secondaryTreeId] : null;

  const spellOf = (k) => spells?.["QWER".indexOf(k)];

  return (
    <div className="result">
      {/* Kopf */}
      <div className="hero">
        <div className="hero-champ">
          <Icon src={img.champ(dd.version, champ.id)} alt={champ.name} size={72} />
          <div>
            <h1>{champ.name}</h1>
            <p className="muted">{champ.title}</p>
          </div>
        </div>
        {enemy && (
          <>
            <span className="vs">VS</span>
            <div className="hero-champ enemy">
              <div className="right">
                <h1>{enemy.name}</h1>
                <p className="muted">{enemy.title}</p>
              </div>
              <Icon src={img.champ(dd.version, enemy.id)} alt={enemy.name} size={72} />
            </div>
          </>
        )}
      </div>

      {/* Matchup */}
      {data.matchup && enemy && (
        <section className={`card matchup ${verdictTone(data.matchup.difficulty)}`}>
          <header className="card-head">
            <h2>{data.enemyIsHardCounter ? `Achtung: ${enemy.name} ist ein Hardcounter` : `Matchup gegen ${enemy.name}`}</h2>
            <span className="badge">{data.matchup.verdict || "Matchup"} · {data.matchup.difficulty}/10</span>
          </header>
          <div className="meter" aria-label={`Schwierigkeit ${data.matchup.difficulty} von 10`}>
            <span style={{ width: `${data.matchup.difficulty * 10}%` }} />
          </div>
          <p className="lead">{data.matchup.summary}</p>
          {data.matchup.earlyGame && (
            <p><strong>Level 1–5:</strong> {data.matchup.earlyGame}</p>
          )}
          <div className="two-col">
            {data.matchup.tips.length > 0 && (
              <div>
                <h3>So spielst du es</h3>
                <ul className="bullets ok">{data.matchup.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            )}
            {data.matchup.avoid.length > 0 && (
              <div>
                <h3>Mach das nicht</h3>
                <ul className="bullets no">{data.matchup.avoid.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            )}
          </div>
          {data.matchup.powerSpikes.length > 0 && (
            <>
              <h3>Power Spikes</h3>
              <ul className="bullets">{data.matchup.powerSpikes.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
          <p className="muted small">Der Build unten ist schon auf {enemy.name} angepasst.</p>
        </section>
      )}

      {data.overview && (
        <Section title="So spielst du ihn">
          <p className="lead">{data.overview}</p>
        </Section>
      )}

      <div className="grid-2">
        <Section title="Hardcounter" aside={<a className="link" href={uggCounter} target="_blank" rel="noreferrer">u.gg Stats ↗</a>}>
          <p className="muted small">Gegen diese Champs hast du es auf {labelRole(data.role)} am schwersten.</p>
          <ul className="champ-list">
            {data.hardCounters.map((c) => (
              <ChampChip key={c.id} dd={dd} id={c.id} tone={c.id === data.enemy ? "hit" : ""}>
                <p>{c.reason}</p>
                {c.tip && <p className="tip">Tipp: {c.tip}</p>}
              </ChampChip>
            ))}
          </ul>
        </Section>

        <Section title="Gute Matchups">
          <p className="muted small">Hier bist du im Vorteil.</p>
          <ul className="champ-list">
            {data.goodAgainst.map((c) => (
              <ChampChip key={c.id} dd={dd} id={c.id} tone="good">
                <p>{c.reason}</p>
              </ChampChip>
            ))}
          </ul>
        </Section>
      </div>

      {/* Runen + Summoner */}
      <Section title="Runen" aside={<a className="link" href={uggBuild} target="_blank" rel="noreferrer">u.gg Build ↗</a>}>
        {r ? (
          <div className="runes">
            <div className="rune-tree">
              <div className="tree-head">
                {pTree && <Icon src={img.rune(pTree.icon)} alt={pTree.name} size={28} />}
                <strong>{pTree?.name}</strong>
              </div>
              {keystone && (
                <div className="rune keystone">
                  <Icon src={img.rune(keystone.icon)} alt={keystone.name} size={56} round />
                  <div>
                    <strong>{keystone.name}</strong>
                    <p className="muted small">{stripHtml(keystone.shortDesc).slice(0, 140)}</p>
                  </div>
                </div>
              )}
              {r.primaryIds.map((id, i) => {
                const ru = dd.runeById[id];
                return ru ? (
                  <div className="rune" key={i}>
                    <Icon src={img.rune(ru.icon)} alt={ru.name} size={36} round />
                    <span>{ru.name}</span>
                  </div>
                ) : (
                  <div className="rune missing" key={i}>Reihe {i + 1}: frei wählbar</div>
                );
              })}
            </div>
            <div className="rune-tree">
              <div className="tree-head">
                {sTree && <Icon src={img.rune(sTree.icon)} alt={sTree.name} size={28} />}
                <strong>{sTree?.name || "Nebenbaum"}</strong>
              </div>
              {r.secondaryIds.map((id) => {
                const ru = dd.runeById[id];
                return ru && (
                  <div className="rune" key={id}>
                    <Icon src={img.rune(ru.icon)} alt={ru.name} size={36} round />
                    <span>{ru.name}</span>
                  </div>
                );
              })}
              <div className="shards">
                {r.shards.map((s, i) => <span className="shard" key={i}>{SHARD_DE[s] || s}</span>)}
              </div>
            </div>
          </div>
        ) : (
          <p className="muted">Runen konnten nicht ermittelt werden. Schau kurz auf u.gg.</p>
        )}
        {data.runesWhy && <p className="why">{data.runesWhy}</p>}

        {data.summoners.length > 0 && (
          <div className="summoners">
            <h3>Summoner Spells</h3>
            <div className="row">
              {data.summoners.map((id) => {
                const s = dd.summonerById[id];
                return s && (
                  <div className="item" key={id}>
                    <Icon src={img.spell(dd.version, s.image.full)} alt={s.name} size={44} />
                    <span>{s.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {/* Items */}
      <Section title="Items">
        <div className="items-block">
          <div>
            <h3>Start</h3>
            <div className="row">{data.items.starter.map((id, i) => <ItemIcon key={i} dd={dd} id={id} />)}</div>
          </div>
          {data.items.boots && (
            <div>
              <h3>Stiefel</h3>
              <div className="row"><ItemIcon dd={dd} id={data.items.boots} /></div>
            </div>
          )}
        </div>
        <h3>Core Build (in dieser Reihenfolge)</h3>
        <div className="row core">
          {data.items.core.map((id, i) => (
            <div className="core-step" key={id}>
              {i > 0 && <span className="arrow">›</span>}
              <ItemIcon dd={dd} id={id} size={52} />
            </div>
          ))}
        </div>
        {data.items.situational.length > 0 && (
          <>
            <h3>Situativ</h3>
            <ul className="situational">
              {data.items.situational.map((s) => (
                <li key={s.id}>
                  <Icon src={img.item(dd.version, s.id)} alt={dd.items[s.id]?.name} size={40} />
                  <div>
                    <strong>{dd.items[s.id]?.name}</strong>
                    <p className="muted small">{s.when}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {data.itemsWhy && <p className="why">{data.itemsWhy}</p>}
      </Section>

      {/* Skills */}
      <Section title="Skill-Reihenfolge">
        <div className="max-order">
          {data.skills.maxOrder.map((k, i) => {
            const sp = spellOf(k);
            return (
              <div className="max-step" key={k}>
                {i > 0 && <span className="arrow">›</span>}
                <div className="skill-key">
                  {sp && <Icon src={img.spell(dd.version, sp.image.full)} alt={sp.name} size={44} />}
                  <span className="key">{k}</span>
                </div>
                <span className="small">{sp?.name}</span>
              </div>
            );
          })}
        </div>
        <p className="muted small">Ult (R) immer auf Level 6, 11 und 16 skillen.</p>

        {data.skills.grid ? (
          <div className="skill-grid-wrap">
            <table className="skill-grid">
              <thead>
                <tr>
                  <th />
                  {data.skills.grid.map((_, i) => <th key={i}>{i + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {["Q", "W", "E", "R"].map((k) => (
                  <tr key={k}>
                    <th>
                      {spellOf(k) ? <Icon src={img.spell(dd.version, spellOf(k).image.full)} alt={spellOf(k).name} size={26} /> : k}
                    </th>
                    {data.skills.grid.map((s, i) => (
                      <td key={i} className={s === k ? `on k-${k}` : ""}>{s === k ? k : ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small">{champ.name} hat ein besonderes Skill-System. Halte dich an die Max-Reihenfolge oben.</p>
        )}
        {data.skillsWhy && <p className="why">{data.skillsWhy}</p>}
      </Section>

      <p className="disclaimer">
        KI-Empfehlung für Patch {data.patch} auf Basis der offiziellen Riot-Daten. Kann mal danebenliegen, für exakte Winrates kurz auf{" "}
        <a href={uggBuild} target="_blank" rel="noreferrer">u.gg</a> gegenchecken.
        {data.warnings?.length > 0 && <> ({data.warnings.length} Angabe(n) der KI wurden aussortiert.)</>}
      </p>
    </div>
  );
}

function labelRole(r) {
  return { top: "Top", jungle: "Jungle", mid: "Mid", adc: "Bot", support: "Support" }[r] || r;
}
