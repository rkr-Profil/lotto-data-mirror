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
| key | System | Quelle | Draws | Status |
|---|---|---|---|---|
| `at-6-45` | Österreich 6/45 | win2day (Jahres-CSV) + Baseline | 3658 | ✅ |
| `de-6-49` | Deutschland 6/49 | daowa89 | 5030 | ✅ |
| `de-6-49-sz` | Deutschland 6/49 + Superzahl | daowa89 (SZ 0–9 → 1–10) | 3144 | ✅ |
| `euromillions` | EuroMillionen 5/50 + 2 | daowa89 | 1958 | ✅ |
| `pl-lotto` | Polen 6/49 | wynikilotto (Vollarchiv) | 6424 | ✅ |
| `hu-hatos` | Ungarn Hatoslottó 6/45 | szerencsejatek.hu | 1829 | ✅ Probe: GitHub-IP OK |
| `gr-tzoker` | Griechenland Tzoker 5/45 + Joker | OPAP-API + Baseline | 2675 | ⚠️ probe-pending (OPAP 403 von manchen IPs; Baseline hosted) |

**GR-Hinweis:** OPAP/Akamai blockt manche Datacenter-IPs. Der Runner überspringt bei 403 und
behält die Baseline. Ob der GitHub-Runner durchkommt, zeigt der erste `probe`-Lauf. Falls dauerhaft
geblockt: GR bleibt auf Supabase-OPAP (einziges System dort) oder braucht Proxy.

**Nicht im Mirror (keine aktuelle Quelle existiert):** CH 6/42 (nirgends offen), EJ EuroJackpot
(alte Quelle endete 2025-02). Bleiben statische Lokaldateien bis eine Quelle gefunden ist.

**Hart/Kandidaten:** `fr-loto` (FDJ — offizielle ZIP endet 2024-07, aktuell hinter dynamischem
API-Call mit Doc-ID → Reverse-Engineering), `es-*` (Akamai blockt auch GitHub/Cloud-IPs → Proxy).
