# LaneCoach

Champ + Lane + (optional) Gegner wählen → Hardcounter, Matchup-Tipps, Runen, Summoner Spells, Items und Skill-Order.

- **Riot Data Dragon** (offiziell, kostenlos): Champions, Items, Runen, Icons, deutsche Namen, immer aktueller Patch
- **Groq (KI)**: erstellt Counter, Build und Tipps. Die Funktion prüft jede Antwort gegen die echten Riot-Daten und wirft alles raus, was es im Patch nicht gibt.

## Deploy auf Netlify (wie bei Kouzína)

1. Neues GitHub-Repo anlegen, z. B. `Paris08/LaneCoach`, und den Ordnerinhalt hochladen
2. Netlify → **Add new site → Import from Git** → Repo wählen (Build-Einstellungen kommen automatisch aus `netlify.toml`)
3. **Site configuration → Environment variables**:
   - `GROQ_API_KEY` = dein Groq-Key (kannst den von Kouzína nehmen)
   - optional `GROQ_MODEL` (Standard: `llama-3.3-70b-versatile`)
4. **Deploys → Trigger deploy**

Drag & Drop geht nicht, weil die Netlify-Funktion GitHub-CI braucht.

## Lokal testen

```bash
npm install
npm i -g netlify-cli
cp .env.example .env   # Key eintragen
netlify dev
```

## Struktur

```
netlify/functions/build.mjs   KI-Abfrage + Abgleich mit Riot-Daten (Endpoint /api/build)
src/App.jsx                   Formular, Cache, teilbarer Link
src/components/ChampionPicker.jsx   Suchbares Dropdown mit Icons
src/components/Result.jsx     Ergebnisansicht
src/ddragon.js                Riot-Daten laden (de_DE)
```

## Teilen

Nach dem Generieren steht die Auswahl in der URL (`?champ=Nasus&role=top&vs=Garen`). Link an Freunde schicken, dann öffnet sich direkt das Ergebnis.

LaneCoach ist ein Fanprojekt und steht in keiner Verbindung zu Riot Games.
