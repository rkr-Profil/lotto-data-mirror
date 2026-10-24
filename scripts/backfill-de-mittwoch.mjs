/**
 * EINMALIG (24.10.2026): Mittwochsziehungen LOTTO 6aus49 vom 04.06.1986 bis
 * 29.11.2000 aus der amtlichen lotto.de-Schnittstelle nachladen.
 *
 * Warum: Bis Dezember 2000 war der Mittwoch ein eigenes Spiel; die bisherige
 * Historie (daowa89, gegen WestLotto geprueft) enthaelt fuer 1982-1999 nur die
 * Samstage. Damit fehlte u. a. die Ziehung vom 21.06.1995 (15 25 27 30 42 48 =
 * dieselben Zahlen wie am 20.12.1986, das bekannte deutsche „Lotto-Wunder").
 * Entscheidung des Inhabers vom 24.10.2026: einmalig aus amtlicher Quelle
 * nachladen (passt zu Massnahme 5, docs/RECHT_rechtsprechung-risikobewertung).
 *
 * NUR die Hauptziehung „LOTTO 6aus49 Mittwoch" (gameType.id 1) — sie laeuft ab
 * Dezember 2000 als die eine Mittwochsziehung weiter. Die Zusatzziehung
 * „Lotto 6aus49 Mittwoch B" (gameType.id 9, bis 1999) wird bewusst nicht
 * uebernommen: AleaMatrix kennt eine Ziehung je Tag.
 *
 * Schonend: eine Anfrage je Ziehungstag, Pause dazwischen, bei HTTP 429 warten.
 * Jede Antwort wird in CACHE gespeichert — ein Abbruch laesst sich fortsetzen.
 *
 * Aufruf:  node scripts/backfill-de-mittwoch.mjs <cache.json>      (holt)
 *          node scripts/backfill-de-mittwoch.mjs <cache.json> --einspielen
 *               (schreibt in data/de-6-49.json und data/de-6-49-sz.json)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { mergeDraws } from "./lib/util.mjs";

const BASE = "https://www.lotto.de/api/stats/entities.lotto/draws/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const PAUSE_MS = 2500;
const VON = "1986-06-04", BIS = "2000-11-29";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cachePfad = process.argv[2];
if (!cachePfad) { console.error("Cache-Datei angeben"); process.exit(1); }
const cache = existsSync(cachePfad) ? JSON.parse(readFileSync(cachePfad, "utf8")) : {};

function mittwoche() {
  const out = [];
  for (let t = Date.parse(VON + "T00:00:00Z"); t <= Date.parse(BIS + "T00:00:00Z"); t += 7 * 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

async function hole(iso) {
  const ms = Date.parse(iso + "T00:00:00Z");
  for (let versuch = 1; versuch <= 6; versuch++) {
    const r = await fetch(BASE + ms, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (r.status === 429) { console.log(iso, "429 – warte", 30 * versuch, "s"); await sleep(30000 * versuch); continue; }
    if (r.status !== 200) throw new Error(iso + " HTTP " + r.status);
    const a = await r.json();
    const liste = Array.isArray(a) ? a : [];
    const haupt = liste.find((x) => x && x.gameType && x.gameType.id === 1);
    /* Ziehung B nur fuer die Gegenprobe gegen die amtliche Haeufigkeitstabelle
       (Lotto Bayern zaehlt A UND B: 6 569 Ausspielungen = 5 057 + 2 x 756) —
       sie wird NICHT in die Daten eingespielt. */
    const zB = liste.find((x) => x && x.gameType && x.gameType.id === 9);
    const b = zB ? zB.drawNumbersCollection.map((x) => parseInt(x.drawNumber, 10)) : null;
    if (!haupt) return { leer: true, typen: liste.map((x) => x.gameType && x.gameType.id), b };
    const n = haupt.drawNumbersCollection.map((x) => parseInt(x.drawNumber, 10));
    const sz = Number.isInteger(haupt.superNumber) && haupt.superNumber >= 0 && haupt.superNumber <= 9 ? haupt.superNumber : null;
    return { n, sz, b };
  }
  throw new Error(iso + " dauerhaft gedrosselt");
}

if (!process.argv.includes("--einspielen")) {
  // Eintraege ohne Feld `b` stammen aus dem ersten Lauf (vor der Gegenprobe) → neu holen.
  const tage = mittwoche().filter((d) => !(d in cache) || !("b" in cache[d]));
  console.log("Mittwoche gesamt", mittwoche().length, "– noch zu holen", tage.length);
  for (const iso of tage) {
    cache[iso] = await hole(iso);
    writeFileSync(cachePfad, JSON.stringify(cache));
    await sleep(PAUSE_MS);
  }
  console.log("fertig, im Cache:", Object.keys(cache).length);
} else {
  const neu = [], neuSz = [], probleme = [];
  for (const iso of mittwoche()) {
    const z = cache[iso];
    if (!z) { probleme.push(iso + " fehlt im Cache"); continue; }
    if (z.leer) { probleme.push(iso + " keine Hauptziehung (" + (z.typen || []).join("/") + ")"); continue; }
    const n = z.n.slice().sort((a, b) => a - b);
    if (n.length !== 6 || new Set(n).size !== 6 || n.some((x) => x < 1 || x > 49)) { probleme.push(iso + " ungueltig " + z.n); continue; }
    neu.push({ d: iso, n });
    if (z.sz !== null) neuSz.push({ d: iso, n, e: [z.sz + 1] });
  }
  for (const [datei, liste] of [["data/de-6-49.json", neu], ["data/de-6-49-sz.json", neuSz]]) {
    const alt = JSON.parse(readFileSync(datei, "utf8"));
    const { merged, added, dropped, droppedDates } = mergeDraws(alt, liste);
    writeFileSync(datei, JSON.stringify(merged));
    console.log(datei, "vorher", alt.length, "neu", added, "entfernt", dropped, droppedDates.join(","), "nachher", merged.length);
  }
  console.log("Probleme:", probleme.length ? "\n  " + probleme.join("\n  ") : "keine");
}
