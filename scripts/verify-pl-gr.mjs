/**
 * Einmaliger Abgleich Polen + Griechenland gegen die amtlichen Schnittstellen (24.10.2026).
 *
 * Von zu Hause aus nicht pruefbar: lotto.pl steht hinter einer Cloudflare-Pruefung,
 * OPAP sperrt Abrufe von ausserhalb. Vom GitHub-Runner aus kommen beide (meist) durch,
 * und hier liegt der PL-Schluessel (Secret PL_OPENAPI_KEY). BEFUNDE_offen.md Nr. 31.
 *
 *   node scripts/verify-pl-gr.mjs [pl] [gr]      (ohne Argument: beide)
 *
 * Schreibt NICHTS an data/. Ergebnis: pruefberichte/pl-gr-<datum>.txt + Zusammenfassung
 * in run-summary.txt (fuer die Telegram-Meldung des Workflows).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const heute = new Date().toISOString().slice(0, 10);
const zeilen = [];
const log = (s) => { console.log(s); zeilen.push(s); };
const sig = (n) => n.slice().sort((a, b) => a - b).join("-");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const lade = (k) => JSON.parse(readFileSync(`data/${k}.json`, "utf8"));
const kurz = [];

async function holeJson(url, headers = {}) {
  for (let v = 1; v <= 3; v++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 lotto-data-mirror verify", ...headers }, signal: AbortSignal.timeout(30000) });
      const t = await r.text();
      if (r.status === 429 || r.status >= 500) { await pause(3000 * v); continue; }
      return { status: r.status, text: t };
    } catch (e) { if (v === 3) return { status: 0, text: String(e.message || e) }; await pause(2000 * v); }
  }
  return { status: 0, text: "drei Versuche ohne Antwort" };
}

/** Vergleich je Datum (Mehrfach-Tage als Menge der Signaturen). */
function vergleiche(name, uns, amtlich, { abDatum }) {
  const proTag = (a) => { const m = new Map(); for (const x of a) { if (x.d < abDatum) continue; (m.get(x.d) || m.set(x.d, new Set()).get(x.d)).add(sig(x.n)); } return m; };
  const u = proTag(uns), a = proTag(amtlich);
  const anders = [], nurUns = [], nurAmt = [];
  for (const [d, s] of u) {
    if (!a.has(d)) nurUns.push(`${d} ${[...s].join(" / ")}`);
    else if ([...s].some((x) => !a.get(d).has(x)) || [...a.get(d)].some((x) => !s.has(x))) anders.push(`${d} uns ${[...s].join(" / ")} | amtlich ${[...a.get(d)].join(" / ")}`);
  }
  for (const [d, s] of a) if (!u.has(d)) nurAmt.push(`${d} ${[...s].join(" / ")}`);
  log(`\n== ${name}: ab ${abDatum} — unsere Tage ${u.size}, amtliche Tage ${a.size}`);
  log(`   Zahlen verschieden: ${anders.length}`); anders.slice(0, 60).forEach((x) => log("     " + x));
  log(`   nur bei uns: ${nurUns.length}`); nurUns.slice(0, 60).forEach((x) => log("     " + x));
  log(`   nur amtlich: ${nurAmt.length}`); nurAmt.slice(0, 60).forEach((x) => log("     " + x));
  const ok = !anders.length && !nurUns.length && !nurAmt.length;
  kurz.push(`${ok ? "✅" : "⚠️"} ${name}: ${u.size} Tage, ${anders.length} verschieden, ${nurUns.length} nur bei uns, ${nurAmt.length} nur amtlich`);
}

/* ---------- Griechenland: OPAP Tzoker (Spiel 5104), Abfrage nach Zeitraum ---------- */
async function pruefeGR() {
  const uns = lade("gr-tzoker");
  const amtlich = [];
  const start = new Date(Date.UTC(+uns[0].d.slice(0, 4), 0, 1));
  for (let von = start; von < new Date(); ) {
    const bis = new Date(Date.UTC(von.getUTCFullYear(), von.getUTCMonth() + 3, 0));
    const f = (x) => x.toISOString().slice(0, 10);
    for (let page = 0; page < 10; page++) {
      const url = `https://api.opap.gr/draws/v3.0/5104/draw-date/${f(von)}/${f(bis)}?limit=50&page=${page}`;
      const r = await holeJson(url);
      if (r.status !== 200) { log(`GR ${f(von)}…${f(bis)} Seite ${page}: HTTP ${r.status} ${r.text.slice(0, 120)}`); if (amtlich.length === 0 && r.status === 403) { kurz.push("⛔ GR: OPAP sperrt auch den Runner (HTTP 403)"); return; } break; }
      let j; try { j = JSON.parse(r.text); } catch { log(`GR ${f(von)}: keine JSON-Antwort`); break; }
      const liste = Array.isArray(j) ? j : j.content || [];
      for (const dr of liste) {
        if (dr.status && dr.status !== "results") continue;
        const n = dr.winningNumbers && dr.winningNumbers.list;
        if (!Array.isArray(n) || n.length !== 5) continue;
        // Ziehung 22:00 Athen; Datum in Athener Ortszeit (UTC+2/+3)
        const d = new Date(Number(dr.drawTime) + 3 * 3600000).toISOString().slice(0, 10);
        amtlich.push({ d, n: n.map(Number), e: (dr.winningNumbers.bonus || []).map(Number) });
      }
      if (liste.length < 50 || j.last === true) break;
      await pause(300);
    }
    von = new Date(Date.UTC(bis.getUTCFullYear(), bis.getUTCMonth() + 1, 1));
    await pause(300);
  }
  log(`GR: ${amtlich.length} amtliche Ziehungen geholt`);
  if (!amtlich.length) { kurz.push("⛔ GR: keine amtlichen Daten erhalten"); return; }
  vergleiche("GR Tzoker", uns, amtlich, { abDatum: amtlich.map((x) => x.d).sort()[0] });
  // Fehlende Ziehungen vollstaendig (mit Joker) ausgeben, damit man sie nachtragen kann
  const unsTage = new Set(uns.map((x) => x.d));
  amtlich.filter((x) => !unsTage.has(x.d)).forEach((x) => log(`   NACHTRAGEN ${JSON.stringify({ d: x.d, n: x.n.slice().sort((a, b) => a - b), e: x.e })}`));
  // Joker getrennt pruefen (Zusatzzahl)
  const ej = new Map(amtlich.map((x) => [x.d, x.e.join("-")]));
  const jokerAnders = uns.filter((x) => ej.has(x.d) && (x.e || []).join("-") !== ej.get(x.d));
  log(`   Joker verschieden: ${jokerAnders.length}`); jokerAnders.slice(0, 30).forEach((x) => log(`     ${x.d} uns ${(x.e || []).join("-")} | amtlich ${ej.get(x.d)}`));
}

/* ---------- Polen: LOTTO OpenAPI, Abfrage je Ziehungstag ---------- */
const PL_BASIS = "https://developers.lotto.pl/api/open/v1/lotteries/draw-results/by-date-per-game";
function plZahlen(j) {
  // Antwort: { items:[{ drawDate, results:[{ gameType, resultsJson:[…] }] }] } oder Array — tolerant lesen
  const items = Array.isArray(j) ? j : j.items || j.content || j.data || [];
  const out = [];
  for (const it of items) {
    for (const r of it.results || []) {
      if (r.gameType && r.gameType !== "Lotto") continue;
      if (Array.isArray(r.resultsJson) && r.resultsJson.length === 6) out.push(r.resultsJson.map(Number));
    }
  }
  return out;
}
async function pruefePL() {
  const key = process.env.PL_OPENAPI_KEY;
  if (!key) { kurz.push("⛔ PL: Secret PL_OPENAPI_KEY fehlt"); log("PL: kein Schluessel"); return; }
  const H = { secret: key, accept: "application/json" };
  const uns = lade("pl-lotto");
  // Abfrageform an einer bekannten Ziehung ermitteln (Text 4: 07.04.2011)
  const varianten = (d) => [
    `${PL_BASIS}?gameType=Lotto&drawDate=${d}T00:00:00Z&index=1&size=10&sort=drawDate&order=ASC`,
    `${PL_BASIS}?gameType=Lotto&drawDate=${d}&index=1&size=10&sort=drawDate&order=ASC`,
    `${PL_BASIS}?gameType=Lotto&drawDate=${d}T21:40:00&index=1&size=10&sort=drawSystemId&order=ASC`,
    `${PL_BASIS}?gameType=Lotto&drawDate=${d}T00:00:00.000Z&index=1&size=10&sort=drawSystemId&order=ASC`,
  ];
  let form = null;
  for (const [i, u] of varianten("2011-04-07").entries()) {
    const r = await holeJson(u, H);
    log(`PL Probe ${i}: HTTP ${r.status} ${r.text.slice(0, 300)}`);
    if (r.status === 200) { try { if (plZahlen(JSON.parse(r.text)).length) { form = i; break; } } catch { /* weiter */ } }
  }
  if (form === null) { kurz.push("⛔ PL: keine Abfrageform liefert Zahlen (Protokoll lesen)"); return; }
  log(`PL: Abfrageform ${form}`);
  /* Neueste zuerst, je 4 Tage gleichzeitig, mit Zeitbudget: Der erste Lauf (24.10.2026)
     brauchte fuer alle ~5 500 Tage einzeln mehr als zwei Stunden und lief in den Abbruch,
     ohne einen Bericht zu hinterlassen. Jetzt wird nach PL_BUDGET_MIN abgebrochen und nur
     der abgefragte Zeitraum verglichen; mit PL_AB=JJJJ-MM-TT geht es beim naechsten Lauf
     weiter zurueck (der Bericht nennt das Datum). */
  const ab = process.env.PL_AB || "9999";
  const tage = [...new Set(uns.map((x) => x.d))].filter((d) => d < ab).sort().reverse();
  const ende = Date.now() + (+process.env.PL_BUDGET_MIN || 90) * 60000;
  const amtlich = [], gefragt = new Set(); let fehler = 0, abbruch = false;
  for (let i = 0; i < tage.length && !abbruch; i += 4) {
    if (Date.now() > ende) { log(`PL: Zeitbudget erreicht nach ${i} von ${tage.length} Tagen — weiter mit PL_AB=${tage[i - 1]}`); break; }
    const teil = tage.slice(i, i + 4);
    const antworten = await Promise.all(teil.map((d) => holeJson(varianten(d)[form], H)));
    antworten.forEach((r, j) => {
      const d = teil[j];
      if (r.status !== 200) { fehler++; if (fehler <= 20) log(`PL ${d}: HTTP ${r.status} ${r.text.slice(0, 100)}`); if (fehler > 300) { log("PL: zu viele Fehler, Abbruch"); abbruch = true; } return; }
      gefragt.add(d);
      try { for (const n of plZahlen(JSON.parse(r.text))) amtlich.push({ d, n }); } catch { fehler++; }
    });
    if (i % 400 === 0) { log(`PL … ${i}/${tage.length} (bis ${teil.at(-1)})`); sichern(); }
    await pause(150);
  }
  log(`PL: ${amtlich.length} amtliche Ziehungen an ${gefragt.size} abgefragten Tagen, ${fehler} Fehler`);
  if (!gefragt.size) return;
  const aeltester = [...gefragt].sort()[0];
  vergleiche(`PL Lotto (${aeltester} bis heute)`, uns.filter((x) => gefragt.has(x.d)), amtlich, { abDatum: aeltester });
  // Tage, an denen die Schnittstelle schlicht nichts lieferte, sind kein Datenfehler:
  // Liste getrennt ausweisen, damit "nur bei uns" richtig gelesen wird.
  const leer = new Set(gefragt); for (const x of amtlich) leer.delete(x.d);
  log(`   davon Tage ohne amtliche Zahlen: ${leer.size} (erste: ${[...leer].sort().slice(0, 10).join(", ")})`);
}

/* Bericht und Telegram-Zusammenfassung schreiben — auch zwischendurch, damit ein
   abgebrochener Lauf nicht alles verliert. */
function sichern() {
  mkdirSync("pruefberichte", { recursive: true });
  writeFileSync(`pruefberichte/pl-gr-${heute}.txt`, zeilen.join("\n") + "\n");
  writeFileSync("run-summary.txt", ["🔎 Abgleich PL/GR gegen amtliche Quellen", ...kurz, `Bericht: pruefberichte/pl-gr-${heute}.txt`].join("\n"));
}

const was = process.argv.slice(2);
log(`Abgleich PL/GR — ${new Date().toISOString()}`);
if (!was.length || was.includes("gr")) { try { await pruefeGR(); } catch (e) { log("GR Absturz: " + e.message); kurz.push("⛔ GR: Absturz " + e.message); } sichern(); }
if (!was.length || was.includes("pl")) { try { await pruefePL(); } catch (e) { log("PL Absturz: " + e.message); kurz.push("⛔ PL: Absturz " + e.message); } }
sichern();
