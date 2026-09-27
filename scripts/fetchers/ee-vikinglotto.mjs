/**
 * Fetcher: EE Vikinglotto 6/48 + 1 Vikingzahl — api.eestiloto.ee, oeffentliche REST-API.
 *
 * NEU AM 27.09.2026 — warum der alte Abruf starb
 * Eesti Loto hat die Website neu gebaut (die Spiele-Eintraege tragen
 * `createdAt: 2026-08-06`). Der alte Pfad `/et/results/?game=VIKINGLOTTO`
 * leitet seit dem 27.09. auf `/tulemused` um, und dort steht nur noch
 * `<div id="root">`: eine JavaScript-Anwendung ohne Inhalt im HTML. Das
 * versteckte Feld `csrfToken`, das der alte Abruf suchte, gibt es nicht mehr.
 * Die Meldung „csrfToken nicht gefunden" war woertlich richtig.
 *
 * Bis zum 26.09. kam noch HTTP 200 — da wurde die neue, leere Seite
 * ausgeliefert. Deshalb meldete die Diagnose „Verbindung in Ordnung, der
 * Fehler liegt im INHALT". Genau so war es.
 *
 * WAS JETZT BENUTZT WIRD
 * Die Anwendung holt ihre Daten von einer offenen REST-Schnittstelle. Kein
 * Cookie, kein CSRF, keine Anmeldung — einfacher und haltbarer als das
 * Scraping vorher:
 *   GET /api/v1/games                          → Spiele + erlaubte Zahlenbereiche
 *   GET /api/v1/draws?status=DRAW_COMPLETED…    → Liste (nur Kopfdaten!)
 *   GET /api/v1/draws/<id>?numberOrder=DRAW_ORDER → die Zahlen
 *
 * ⚠ DIE QUELLE HAT KEIN ARCHIV. Sie reicht nur bis 2026-08-12 zurueck, weil
 * die Seite am 06.08. neu aufgesetzt wurde. Die Historie steckt in
 * `data/ee-vikinglotto.json` (264 Ziehungen) und bleibt dort — `mergeDraws()`
 * in run.mjs haengt die neuen nur an. Diese Datei darf NIE die Grundlage fuer
 * ein Neuanlegen der Datei sein.
 *
 * ⚠ ZAHLENBEREICH DER VIKING-ZAHL
 * Die Schnittstelle erklaert ihn amtlich als 1..5 (`playingNumbers`,
 * ADDITIONAL_NUMBERS). Unsere Systemkonfiguration in index.html sagt `n2:8`.
 * Das ist ein offener Befund (docs/BEFUNDE_offen.md) und wird hier NICHT
 * entschieden: Dieser Abruf liest den Bereich bei jedem Lauf aus der Quelle
 * und richtet sich danach. Aendert die Lotterie ihn, aendert sich der Abruf
 * mit — ohne dass jemand eine Zahl im Code nachziehen muss.
 */
import { inRange } from "../lib/util.mjs";

const API = "https://api.eestiloto.ee/api/v1";
const SEITE = "https://www.eestiloto.ee/tulemused";

/* So viele der juengsten Ziehungen werden angesehen. Vikinglotto wird einmal
   woechentlich gezogen (Mittwoch) — 30 decken ein halbes Jahr Ausfall ab und
   kosten 30 kleine Abrufe. Mehr hat die Quelle ohnehin nicht. */
const ANZAHL = 30;

export const meta = {
  key: "ee-vikinglotto",
  label: "Estland Vikinglotto 6/48 + Viking",
  url: SEITE,
  kind: "json"
};

async function holeJson(url, headers, was) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${was}: HTTP ${r.status}`);
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    /* Kommt eine HTML-Seite statt JSON, ist die Schnittstelle umgezogen oder
       es steht eine Sperrseite davor. Das gehoert benannt, nicht als
       „0 Ziehungen" verschluckt. */
    throw new Error(`${was}: kein JSON (beginnt mit "${text.slice(0, 60).replace(/\s+/g, " ")}")`);
  }
}

export async function fetchDraws({ BROWSER_HEADERS }) {
  const kopf = { ...BROWSER_HEADERS, "Accept": "application/json" };

  // ── 1 · Spiel und erlaubte Zahlenbereiche aus der Quelle lesen ──────────
  const spiele = await holeJson(`${API}/games?includeOpenDraws=true`, kopf, "games");
  const liste = Array.isArray(spiele) ? spiele : (spiele.content || []);
  const spiel = liste.find((g) => String(g.gameCode).toUpperCase() === "VIKINGLOTTO");
  if (!spiel) {
    throw new Error(`VIKINGLOTTO nicht in der Spieleliste (gefunden: ${liste.map((g) => g.gameCode).join(", ") || "keine"})`);
  }

  const bereich = (code, vorgabe) => {
    const p = (spiel.playingNumbers || []).find((x) => String(x.code).toUpperCase() === code);
    return (p && Number.isFinite(p.minValue) && Number.isFinite(p.maxValue))
      ? { min: p.minValue, max: p.maxValue }
      : vorgabe;
  };
  const haupt = bereich("MAIN_NUMBERS", { min: 1, max: 48 });
  const zusatz = bereich("ADDITIONAL_NUMBERS", { min: 1, max: 5 });

  // ── 2 · Die juengsten abgeschlossenen Ziehungen (nur Kopfdaten) ─────────
  const url = `${API}/draws?status=DRAW_COMPLETED&gameId=${encodeURIComponent(spiel.id)}`
            + `&page=1&size=${ANZAHL}&sort=${encodeURIComponent("dateTime:desc")}`;
  const kopfdaten = await holeJson(url, kopf, "draws");
  const rohe = Array.isArray(kopfdaten) ? kopfdaten : (kopfdaten.content || []);
  if (!rohe.length) throw new Error("draws: leere Liste — Quelle liefert keine abgeschlossenen Ziehungen");

  // ── 3 · Je Ziehung die Zahlen holen ────────────────────────────────────
  const draws = [];
  const verworfen = [];
  for (const k of rohe) {
    if (!k || !k.id) continue;
    let detail;
    try {
      detail = await holeJson(`${API}/draws/${encodeURIComponent(k.id)}?numberOrder=DRAW_ORDER`, kopf, `draw ${k.number ?? k.id}`);
    } catch (e) {
      verworfen.push(`${k.dateTime || k.id}: ${e.message}`);
      continue;
    }

    const stufen = (detail.results && detail.results.stages) || [];
    const findeStufe = (code) => (stufen.find((s) => String(s.code).toUpperCase() === code) || {}).winningNumbers || [];
    const main = findeStufe("MAIN-NUMBERS").map(Number);
    const viking = findeStufe("ADDITIONAL-NUMBERS").map(Number);

    /* inRange(nums, k, hi): k ist die ANZAHL, nicht das Minimum — und die
       Funktion prueft Eindeutigkeit gleich mit. Beim ersten Anlauf stand hier
       `inRange(main, haupt.min, haupt.max)`, also k=1: das haette JEDE Ziehung
       verworfen, und zwar stumm. */
    if (!inRange(main, 6, haupt.max)) {
      verworfen.push(`${k.dateTime}: Hauptzahlen [${main.join(",")}] ungueltig (6 verschiedene aus 1..${haupt.max} erwartet)`);
      continue;
    }
    if (viking.length !== 1 || !Number.isFinite(viking[0])
        || viking[0] < zusatz.min || viking[0] > zusatz.max) {
      verworfen.push(`${k.dateTime}: Vikingzahl [${viking.join(",")}] ausserhalb ${zusatz.min}..${zusatz.max}`);
      continue;
    }

    const ms = Date.parse(k.dateTime);
    if (!Number.isFinite(ms)) { verworfen.push(`${k.dateTime}: Datum unlesbar`); continue; }
    let datum;
    try { datum = new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Tallinn" }); }
    catch { datum = new Date(ms).toISOString().slice(0, 10); }

    draws.push({ d: datum, n: main.slice().sort((a, b) => a - b), e: [viking[0]] });
  }

  /* Nicht stillschweigend weniger liefern. Genau diese Stille hat den Ausfall
     drei Wochen lang getragen: „0 Ziehungen" sah aus wie „nichts Neues". */
  if (!draws.length) {
    throw new Error(`keine verwertbare Ziehung aus ${rohe.length} Kopfdaten`
      + (verworfen.length ? ` — erster Grund: ${verworfen[0]}` : ""));
  }
  if (verworfen.length) {
    console.warn(`[ee-vikinglotto] ${verworfen.length} verworfen: ${verworfen.slice(0, 3).join(" | ")}`);
  }
  return draws;
}
