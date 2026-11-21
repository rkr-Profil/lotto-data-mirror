/**
 * Pruefung des deutschen Bestands 2022 bis heute gegen die amtliche
 * lotto.de-Schnittstelle (21.11.2026).
 *
 * WARUM GERADE DIESER ZEITRAUM
 * `verify-de-westlotto.py` hat am 17.09.2026 alles bis zum 01.01.2022 geprueft
 * (4 556 von 4 556 identisch). Weiter reicht die amtliche WestLotto-Datei nicht:
 * Sie enthaelt bis heute nur die Blaetter 1955-2021 (am 21.11.2026 nachgesehen).
 * Alles danach stammt aus einem Drittarchiv auf GitHub und war nie gegen eine
 * amtliche Quelle gehalten — rund 520 Ziehungen, die niemand geprueft hat.
 *
 * QUELLE
 * https://www.lotto.de/api/stats/entities.lotto/draws/<ms seit 1970>
 * Dieselbe Schnittstelle, aus der am 24.10.2026 die Mittwoche 1986-2000
 * nachgeladen wurden (backfill-de-mittwoch.mjs). Eine Anfrage je Ziehungstag,
 * Pause dazwischen, bei HTTP 429 warten.
 *
 * SUPERZAHL: amtlich 0..9, bei uns 1..10 (e0:1 in der Systemkonfiguration).
 * Der Vergleich rechnet das um — ohne diese Zeile meldete die Pruefung jede
 * einzelne Ziehung als Abweichung.
 *
 * Schreibt NICHTS an data/. Ergebnis: pruefberichte/de-lottode-<datum>.txt
 *
 * Aufruf:
 *   node scripts/verify-de-lottode.mjs <cache.json>
 *   node scripts/verify-de-lottode.mjs <cache.json> --von 2022-01-01 --bis 2026-11-18
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const BASE = "https://www.lotto.de/api/stats/entities.lotto/draws/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const PAUSE_MS = 2200;

const arg = (n, v) => { const i = process.argv.indexOf("--" + n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : v; };
const cachePfad = process.argv[2];
if (!cachePfad || cachePfad.startsWith("--")) { console.error("Cache-Datei als erstes Argument angeben"); process.exit(1); }
const VON = arg("von", "2022-01-01");
const BIS = arg("bis", new Date().toISOString().slice(0, 10));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cache = existsSync(cachePfad) ? JSON.parse(readFileSync(cachePfad, "utf8")) : {};

/* Ziehungstage: Mittwoch (3) und Samstag (6). Alle abfragen, nicht nur die, die
   wir haben — sonst faellt eine FEHLENDE Ziehung nie auf. */
function ziehungstage() {
  const out = [];
  for (let t = Date.parse(VON + "T00:00:00Z"); t <= Date.parse(BIS + "T00:00:00Z"); t += 86400000) {
    const d = new Date(t), wt = d.getUTCDay();
    if (wt === 3 || wt === 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function hole(iso) {
  const ms = Date.parse(iso + "T00:00:00Z");
  for (let versuch = 1; versuch <= 6; versuch++) {
    let r;
    try { r = await fetch(BASE + ms, { headers: { "User-Agent": UA, Accept: "application/json" } }); }
    catch (e) { await sleep(5000 * versuch); continue; }
    if (r.status === 429) { await sleep(30000 * versuch); continue; }
    if (r.status !== 200) return { fehler: "HTTP " + r.status };
    let a; try { a = await r.json(); } catch (_) { return { fehler: "kein JSON" }; }
    const liste = Array.isArray(a) ? a : [];
    /* gameType 1 = Mittwochsziehung, 2 = Samstagsziehung (21.11.2026 gemessen).
       backfill-de-mittwoch.mjs nimmt nur die 1, weil es nur Mittwoche holte --
       wer das hierher uebernimmt, meldet jeden Samstag als "bei uns zusaetzlich". */
    const haupt = liste.find((x) => x && x.gameType && (x.gameType.id === 1 || x.gameType.id === 2));
    if (!haupt) return { leer: true };
    const n = haupt.drawNumbersCollection.map((x) => parseInt(x.drawNumber, 10)).sort((p, q) => p - q);
    const sz = Number.isInteger(haupt.superNumber) ? haupt.superNumber : null;
    return { n, sz };
  }
  return { fehler: "dauerhaft gedrosselt" };
}

const lade = (k) => JSON.parse(readFileSync(new URL("../data/" + k + ".json", import.meta.url), "utf8"));
const gleich = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

(async () => {
  const tage = ziehungstage();
  const offen = tage.filter((d) => !(d in cache));
  console.log(`Zeitraum ${VON} bis ${BIS}: ${tage.length} Ziehungstage, davon ${offen.length} noch zu holen`);

  let i = 0;
  for (const iso of offen) {
    cache[iso] = await hole(iso);
    if (++i % 20 === 0) { writeFileSync(cachePfad, JSON.stringify(cache)); console.log(`  ${i}/${offen.length} … ${iso}`); }
    await sleep(PAUSE_MS);
  }
  writeFileSync(cachePfad, JSON.stringify(cache));

  const haupt = new Map(lade("de-6-49").map((x) => [x.d, x.n.slice().sort((a, b) => a - b)]));
  const mitSz = new Map(lade("de-6-49-sz").map((x) => [x.d, { n: x.n.slice().sort((a, b) => a - b), e: x.e }]));

  const z = { geprueft: 0, gleich: 0, fehlt: [], abw: [], zuviel: [], szAbw: [], szFehlt: [], nichtAbrufbar: [] };
  for (const iso of tage) {
    const a = cache[iso] || {};
    if (a.fehler) { z.nichtAbrufbar.push(iso + " (" + a.fehler + ")"); continue; }
    const unser = haupt.get(iso);
    if (a.leer) { if (unser) z.zuviel.push({ d: iso, n: unser }); continue; }
    z.geprueft++;
    if (!unser) { z.fehlt.push({ d: iso, n: a.n, sz: a.sz }); continue; }
    if (!gleich(unser, a.n)) { z.abw.push({ d: iso, amtlich: a.n, unser }); continue; }
    z.gleich++;
    /* Superzahl: amtlich 0..9, bei uns 1..10 */
    const s = mitSz.get(iso);
    if (a.sz === null) continue;
    if (!s) { z.szFehlt.push(iso); continue; }
    const unserSz = Array.isArray(s.e) && s.e.length ? s.e[0] : null;
    if (unserSz !== a.sz + 1) z.szAbw.push({ d: iso, amtlich: a.sz, unser: unserSz === null ? null : unserSz - 1 });
  }

  const L = [];
  const log = (s) => { console.log(s); L.push(s); };
  log("Pruefung DE 6aus49 gegen lotto.de (amtlich)");
  log("Zeitraum: " + VON + " bis " + BIS);
  log("");
  log("amtliche Ziehungstage abgefragt : " + tage.length);
  log("davon mit Ziehung               : " + z.geprueft);
  log("Zahlen identisch                : " + z.gleich);
  log("bei uns FEHLEND                 : " + z.fehlt.length);
  log("ABWEICHENDE Zahlen              : " + z.abw.length);
  log("bei uns ZUSAETZLICH             : " + z.zuviel.length);
  log("Superzahl abweichend            : " + z.szAbw.length);
  log("Superzahl bei uns nicht geführt : " + z.szFehlt.length);
  log("nicht abrufbar                  : " + z.nichtAbrufbar.length);
  const zeig = (t, l, f) => { if (!l.length) return; log(""); log(t); l.slice(0, 40).forEach((x) => log("   " + f(x))); if (l.length > 40) log("   … und " + (l.length - 40) + " weitere"); };
  zeig("FEHLEND:", z.fehlt, (x) => x.d + "  " + x.n.join(" · ") + "  SZ " + x.sz);
  zeig("ABWEICHEND:", z.abw, (x) => x.d + "\n      amtlich: " + x.amtlich.join(" · ") + "\n      unser  : " + x.unser.join(" · "));
  zeig("ZUSAETZLICH:", z.zuviel, (x) => x.d + "  " + x.n.join(" · "));
  zeig("SUPERZAHL abweichend:", z.szAbw, (x) => x.d + "  amtlich " + x.amtlich + " · unser " + x.unser);
  zeig("NICHT ABRUFBAR:", z.nichtAbrufbar, (x) => x);
  const sauber = !z.fehlt.length && !z.abw.length && !z.zuviel.length && !z.szAbw.length;
  log("");
  log(sauber ? "OK — keine Abweichung." : "ABWEICHUNGEN gefunden.");

  mkdirSync(new URL("../pruefberichte/", import.meta.url), { recursive: true });
  const datei = new URL("../pruefberichte/de-lottode-" + new Date().toISOString().slice(0, 10) + ".txt", import.meta.url);
  writeFileSync(datei, L.join("\n") + "\n");
  console.log("\nBericht: pruefberichte/de-lottode-" + new Date().toISOString().slice(0, 10) + ".txt");
  process.exit(sauber ? 0 : 1);
})();
