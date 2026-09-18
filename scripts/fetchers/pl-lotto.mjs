/**
 * Fetcher: PL Lotto (Duży Lotek) 6/49.
 *
 * HAUPTQUELLE seit 18.09.2026: LOTTO OpenAPI von Totalizator Sportowy (amtlich, kostenlos;
 * Schluessel am 18.09.2026 auf Antrag erteilt, liegt NUR als GitHub-Secret PL_OPENAPI_KEY).
 *   GET https://developers.lotto.pl/api/open/v1/lotteries/draw-results/last-results-per-game?gameType=Lotto
 *   Header: secret: <Schluessel>   (Spezifikation: https://developers.lotto.pl/)
 * Liefert die juengste Ziehung; bei taeglichem Lauf (Di/Do/Sa gezogen) reicht das. Die
 * Antwortform ist in der Spezifikation nur skizziert (`results: []`), deshalb liest der
 * Parser jede Sechsergruppe 1..49 unter einem Eintrag mit gameType "Lotto" -- und NICHT
 * "LottoPlus" (eigene Ziehung desselben Abends). PL_OPENAPI_DEBUG=1 gibt die Rohantwort aus.
 *
 * ERSATZ: wynikilotto.net.pl (private Ergebnisseite, Voll-CSV ab 1957; Format nr,DD.MM.YYYY,n1..n6).
 * Greift ohne Schluessel oder bei Ausfall der OpenAPI; Telegram meldet dann „pl-lotto ← wynikilotto".
 * Der Altbestand (7.405 Ziehungen, zweite Sonntagsziehungen 1965-1991 mit r=2) ist die
 * committete Datei und wurde am 17.09.2026 gegen die CSV geprueft.
 */
import { plLotto } from "../lib/util.mjs";

const OPENAPI = "https://developers.lotto.pl/api/open/v1/lotteries/draw-results/last-results-per-game?gameType=Lotto";
const ERSATZ = "https://www.wynikilotto.net.pl/download/lotto.csv";

export const meta = {
  key: "pl-lotto",
  label: "Polen Lotto 6/49",
  url: ERSATZ,
  kind: "csv"
};

export function parse(csvText) {
  return plLotto(csvText, { nMain: 6, hiMain: 49 });
}

/* Sechsergruppen 1..49 in beliebiger Tiefe einsammeln; Eintraege mit gameType LottoPlus
   (oder anderem Spiel) werden mitsamt Unterbaum uebersprungen. */
function sammle(obj, tiefe, out) {
  if (!obj || tiefe > 6) return;
  if (Array.isArray(obj)) {
    if (obj.length === 6 && obj.every((x) => Number.isInteger(x) && x >= 1 && x <= 49) && new Set(obj).size === 6) { out.push(obj.slice()); return; }
    for (const x of obj) sammle(x, tiefe + 1, out);
    return;
  }
  if (typeof obj === "object") {
    if (typeof obj.gameType === "string" && obj.gameType !== "Lotto") return;
    for (const k of Object.keys(obj)) sammle(obj[k], tiefe + 1, out);
  }
}

function isoVon(v) {
  const t = Date.parse(v);
  if (isNaN(t)) return null;
  // Ziehung 21:40 Ortszeit; ISO mit Zeitzone → in Warschauer Datum umrechnen (UTC+1/+2 → +2 h reicht, weil nie nach 22:00 Z)
  return new Date(t + 2 * 3600000).toISOString().slice(0, 10);
}

async function holeOpenApi(key) {
  const res = await fetch(OPENAPI, { headers: { accept: "application/json", secret: key, "User-Agent": "AleaMatrix-Datenspiegel/1.0 (+https://aleamatrix.com/legal/datenquellen.html)" }, signal: AbortSignal.timeout(15000) });
  if (res.status === 401) throw new Error("OpenAPI: 401 (Schluessel abgelehnt)");
  if (res.status !== 200) throw new Error("OpenAPI: HTTP " + res.status);
  const text = await res.text();
  if (process.env.PL_OPENAPI_DEBUG) console.log("[pl-lotto] OpenAPI-Rohantwort: " + text.slice(0, 3000));
  const j = JSON.parse(text);
  const eintraege = Array.isArray(j) ? j : [j];
  const draws = [];
  for (const e of eintraege) {
    if (e && typeof e.gameType === "string" && e.gameType !== "Lotto") continue;
    const d = e && e.drawDate ? isoVon(e.drawDate) : null;
    const gruppen = []; sammle(e, 0, gruppen);
    if (d && gruppen.length) draws.push({ d, n: gruppen[0].sort((a, b) => a - b) });
  }
  if (!draws.length) throw new Error("OpenAPI: HTTP 200, aber keine Lotto-Ziehung in der Antwort (PL_OPENAPI_DEBUG=1 zeigt sie)");
  return draws;
}

export async function fetchDraws({ fetchText }) {
  const key = process.env.PL_OPENAPI_KEY;
  let grund = key ? null : "kein PL_OPENAPI_KEY gesetzt";
  if (key) {
    try { return await holeOpenApi(key); }
    catch (e) { grund = e && e.message ? e.message : String(e); }
  }
  const r = await fetchText(ERSATZ);
  if (r.status !== 200) throw new Error(grund + " · wynikilotto: HTTP " + r.status);
  const e = parse(r.text);
  e.quelle = "wynikilotto";
  console.warn("[pl-lotto] " + grund + " → Ersatzquelle wynikilotto (" + e.length + " Ziehungen)");
  return e;
}
