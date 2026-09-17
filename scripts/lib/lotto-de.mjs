/**
 * lotto.de (Deutscher Lotto- und Totoblock) — amtliche, undokumentierte JSON-Abfrage
 * fuer LOTTO 6aus49. Seit 17.09.2026 Hauptquelle fuer de-6-49 und de-6-49-sz; das
 * GitHub-Archiv daowa89 ist nur noch Ersatz (docs/RECHT_rechtsprechung-risikobewertung
 * _2026-09-17.md, Massnahme 5: Historie amtlich, Drittarchiv nur Pruefquelle).
 *
 * Zwei Adressen, beide `CORS *`, robots.txt ohne Sperre (17.09.2026 geprueft):
 *   history/{ms}  → { days: [{date:"2026-09-16", key:"16.09.2026"}, …] } — Ziehungstage
 *                   rueckwaerts ab dem Zeitstempel, etwa ein Jahr weit.
 *   draws/{ms}    → [ { drawDate, drawNumbersCollection:[{drawNumber,index}…],
 *                   superNumber, extraNumber, … } ]  — ms = Ziehungstag 00:00 UTC.
 *
 * Cloudflare drosselt Bursts (HTTP 429 „error code: 1015" nach ~3 schnellen Anfragen,
 * 17.09.2026 beobachtet). Deshalb: Pause zwischen den Anfragen, und nur die Tage der
 * letzten LOTTO_DE_TAGE Tage (Standard 14) — bei taeglichem Lauf sind das 1-4 Ziehungen.
 * Nie mehr holen als noetig; das ist auch die Regel aus BGH „Automobil-Onlineboerse"
 * (unwesentliche Teile, nicht auf Nachbildung der Gesamtdatenbank gerichtet).
 *
 * Tagesliste UND Ziehungen werden je Lauf einmal geholt und fuer beide DE-Fetcher
 * wiederverwendet — der zweite Fetcher stellt keine einzige Anfrage mehr.
 */
const BASE = "https://www.lotto.de/api/stats/entities.lotto/";
const PAUSE_MS = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let tageCache = null;
const ziehungCache = new Map();

async function holeJson(fetchText, url) {
  const r = await fetchText(url);
  if (r.status === 429) throw new Error("HTTP 429 (Cloudflare 1015, Drosselung)");
  if (r.status !== 200) throw new Error("HTTP " + r.status);
  if (!/^\s*[\[{]/.test(r.text)) throw new Error("keine JSON-Antwort (" + r.text.slice(0, 40).replace(/\s+/g, " ") + ")");
  return JSON.parse(r.text);
}

/** Ziehungstage (ISO) der letzten `tage` Tage, neueste zuerst. */
export async function ziehungstage(fetchText, tage) {
  if (!tageCache) {
    const now = Date.now();
    const j = await holeJson(fetchText, BASE + "history/" + now);
    tageCache = (j && Array.isArray(j.days) ? j.days : []).map((d) => d.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    await sleep(PAUSE_MS);
  }
  const ab = new Date(Date.now() - tage * 86400000).toISOString().slice(0, 10);
  return tageCache.filter((d) => d >= ab);
}

/** Eine Ziehung: { d, n:[6 sortiert], sz: 0..9 | null } oder null. */
export async function ziehung(fetchText, iso) {
  if (ziehungCache.has(iso)) return ziehungCache.get(iso);
  const z = await ziehungRoh(fetchText, iso);
  ziehungCache.set(iso, z);
  return z;
}

async function ziehungRoh(fetchText, iso) {
  const ms = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const a = await holeJson(fetchText, BASE + "draws/" + ms);
  await sleep(PAUSE_MS);
  const d = Array.isArray(a) ? a[0] : null;
  if (!d || !Array.isArray(d.drawNumbersCollection)) return null;
  const n = d.drawNumbersCollection.map((x) => parseInt(x.drawNumber, 10)).filter((x) => x >= 1 && x <= 49);
  if (n.length !== 6 || new Set(n).size !== 6) return null;
  const sz = Number.isInteger(d.superNumber) && d.superNumber >= 0 && d.superNumber <= 9 ? d.superNumber : null;
  return { d: iso, n: n.slice().sort((x, y) => x - y), sz };
}

/** Alle Ziehungen der letzten LOTTO_DE_TAGE Tage. */
export async function holeLottoDe(fetchText) {
  const tage = process.env.LOTTO_DE_TAGE ? parseInt(process.env.LOTTO_DE_TAGE, 10) : 14;
  const out = [];
  for (const iso of await ziehungstage(fetchText, tage)) {
    const z = await ziehung(fetchText, iso);
    if (z) out.push(z);
  }
  return out;
}
