# lotto-data-mirror

Normalisierter Ziehungs-Mirror für **Lucky-Space**. Eine GitHub-Action holt täglich
die Quell-Daten der einzelnen Lottosysteme, parst sie in ein **einheitliches JSON**
und committet das Ergebnis nach `data/<key>.json`. App und Supabase-Function lesen
danach nur noch diese sauberen Roh-URLs — nicht mehr die quirkigen Originalquellen.

## Warum
Manche offizielle Quellen blocken die Supabase-Datacenter-IP (z. B. HU szerencsejatek.hu),
liefern ZIP-Binär (FR FDJ) oder nur HTML (Scraping nötig). GitHub-Actions laufen auf
anderer Infrastruktur, können mit vollen Browser-Headern anfragen, entpacken und scrapen —
und liefern der App am Ende immer dieselbe, geprüfte JSON-Struktur.

## Datenformat (`data/<key>.json`)
```json
[ { "d": "2026-07-16", "n": [10,11,15,17,26,30] },
  { "d": "...", "n": [...], "e": [...optional Zusatzzahlen...] } ]
```
Identisch zum Format, das die Lucky-Space-App in `data/*.json` erwartet.

## Consumption in der App
`raw.githubusercontent.com/<user>/lotto-data-mirror/main/data/<key>.json`
ist eine öffentliche, CDN-gecachte URL (nicht geoblockt). Zwei Wege:
1. **App direkt:** `STORAGE_MAP`/Fetch-Basis auf die raw-URL zeigen lassen (Client-Fallback bleibt lokal).
2. **Via Supabase:** die `fetch-draws`-Function fetcht die raw-URL statt der Originalquelle
   (`source_url_tpl` umstellen) und schreibt wie gehabt in den Storage-Bucket.

## Neues System hinzufügen
1. `scripts/fetchers/<key>.mjs` anlegen — `export const meta = {key,label,url,kind}` + `export function parse(text) → draws[]`.
2. In `scripts/run.mjs` importieren und in `FETCHERS` eintragen.
Fertig. Utils (Datums-/Zahlen-Parsing, Merge, HTML-Block-Erkennung) liegen in `scripts/lib/util.mjs`.

## Erster Lauf / Diagnose
Bevor man sich auf eine Quelle verlässt, prüfen ob die GitHub-IP durchkommt:
```
Actions → update-draws → Run workflow → probe = true
```
Der Probe-Lauf schreibt nichts und meldet je System `status / content-type / html=JA/nein`.
`html=JA` ⇒ die Quelle blockt auch die GitHub-IP (dann Self-hosted-Runner oder Proxy nötig).

## Lokal testen
```
npm run probe        # Diagnose
npm run update       # echter Lauf, schreibt data/*.json
node scripts/run.mjs hu-hatos   # nur ein System
```

## Aktuell registriert
| key | System | Quelle | Status |
|---|---|---|---|
| `hu-hatos` | Ungarn Hatoslottó 6/45 | szerencsejatek.hu CSV | Vollhistorie ab 1988, Parser verifiziert |

Geplant/kandidaten: `fr-loto` (FDJ-ZIP entpacken), `es-primitiva`/`es-gordo`/`es-bono` (Akamai),
sowie perspektivisch AT/DE/EM/PL/GR zentral hierher.
