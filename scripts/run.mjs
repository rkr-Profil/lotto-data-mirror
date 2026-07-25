/**
 * Mirror-Runner — von der GitHub-Action aufgerufen.
 *
 *   node scripts/run.mjs           → alle registrierten Systeme fetchen, parsen,
 *                                     mit data/<key>.json mergen, schreiben.
 *   node scripts/run.mjs --probe   → nur diagnostizieren: HTTP-Status, Content-Type,
 *                                     erste Bytes, HTML-Block-Erkennung (schreibt nichts).
 *   node scripts/run.mjs hu-hatos  → nur bestimmte Keys.
 *
 * Neues System hinzufügen: scripts/fetchers/<key>.mjs anlegen (export meta + parse)
 * und unten in FETCHERS registrieren. Sonst nichts.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mergeDraws, looksLikeHtml } from "./lib/util.mjs";

import * as huHatos from "./fetchers/hu-hatos.mjs";
import * as de649 from "./fetchers/de-6-49.mjs";
import * as euromillions from "./fetchers/euromillions.mjs";
import * as at645 from "./fetchers/at-6-45.mjs";
import * as plLotto from "./fetchers/pl-lotto.mjs";
import * as de649sz from "./fetchers/de-6-49-sz.mjs";
import * as grTzoker from "./fetchers/gr-tzoker.mjs";
import * as esPrimitiva from "./fetchers/es-primitiva.mjs";
import * as esBonoloto from "./fetchers/es-bonoloto.mjs";
import * as lvLatlotoF from "./fetchers/lv-latloto.mjs";
import * as eeVikinglotto from "./fetchers/ee-vikinglotto.mjs";
import * as beLotto from "./fetchers/be-lotto.mjs";
import * as nlLotto from "./fetchers/nl-lotto.mjs";
import * as ptTotolotoF from "./fetchers/pt-totoloto.mjs";
// … weitere Fetcher hier importieren und in FETCHERS eintragen:
// import * as frLoto from "./fetchers/fr-loto.mjs";  // FDJ-API, Reverse-Engineering nötig

const FETCHERS = [
  huHatos, de649, euromillions, at645, plLotto, de649sz, grTzoker,
  esPrimitiva, esBonoloto, lvLatlotoF, eeVikinglotto, beLotto, nlLotto, ptTotolotoF
];

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, "..", "data");
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept": "text/csv,application/json,text/plain,*/*",
  "Accept-Language": "de,en;q=0.8,hu;q=0.6"
};

const args = process.argv.slice(2);
const probeOnly = args.includes("--probe");
const onlyKeys = args.filter((a) => !a.startsWith("--"));

async function fetchText(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  const buf = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return { status: res.status, ct: res.headers.get("content-type") || "", bytes: buf.length, text };
}

function loadExisting(key) {
  const p = join(DATA_DIR, `${key}.json`);
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return []; }
}

let hadError = false;
const report = []; // je System { key, ok, added?, total?, optional? } — für die Handy-Meldung

for (const mod of FETCHERS) {
  const { meta, parse } = mod;
  if (onlyKeys.length && !onlyKeys.includes(meta.key)) continue;

  // optional-Systeme (z. B. GR: OPAP geo-blockt Datacenter-IPs) dürfen die Action nicht
  // rot färben — Fehler werden geloggt, setzen aber hadError nur bei Pflicht-Systemen.
  const fail = (msg) => {
    console.error(`[${meta.key}] ${msg}${meta.optional ? " (optional — kein Fehler)" : ""}`);
    if (!meta.optional) hadError = true;
    report.push({ key: meta.key, ok: false, optional: !!meta.optional });
  };

  try {
    if (probeOnly) {
      const r = await fetchText(meta.url);
      const html = looksLikeHtml(r.text);
      console.log(`[${meta.key}] status=${r.status} type=${r.ct} bytes=${r.bytes} html=${html ? "JA (BLOCK?)" : "nein"}`);
      console.log(`  sample: ${r.text.slice(0, 160).replace(/\s+/g, " ")}`);
      // kind:"html" liefert absichtlich HTML → nicht als Block werten.
      if ((meta.kind !== "html" && html) || r.status !== 200) fail("Probe: Block/Non-200");
      continue;
    }

    // Zwei Fetcher-Typen: (a) einfach — export parse(text), run.mjs holt meta.url selbst;
    // (b) komplex — export async fetchDraws(helpers), holt selbst (mehrere URLs / Paginierung /
    //     Token-Flow) und liefert die Draws direkt. helpers: { fetchText, BROWSER_HEADERS }.
    const getFresh = async () => {
      if (typeof mod.fetchDraws === "function") return await mod.fetchDraws({ fetchText, BROWSER_HEADERS });
      const r = await fetchText(meta.url);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      // HTML-Block-Erkennung nur für nicht-HTML-Quellen (kind:"html" ist absichtlich HTML).
      if (meta.kind !== "html" && looksLikeHtml(r.text)) throw new Error("HTML statt Daten (IP-Block?)");
      return parse(r.text);
    };

    // Bis zu 2 Versuche mit 5s Pause — fängt kurze Quell-Aussetzer ab (z. B. PL/wynikilotto-Timeout),
    // damit ein einmaliger Schluckauf die Action nicht rot färbt.
    let fresh = null, lastErr = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        fresh = await getFresh();
        if (fresh && fresh.length) break;
        lastErr = new Error("0 Ziehungen");
      } catch (e) { lastErr = e; }
      if (attempt < 2) {
        console.warn(`[${meta.key}] Versuch ${attempt} fehlgeschlagen (${lastErr?.message}), erneuter Versuch in 5s…`);
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
    if (!fresh || fresh.length === 0) { fail(`${lastErr?.message || "kein Ergebnis"} — übersprungen (nach 2 Versuchen)`); continue; }

    const existing = loadExisting(meta.key);
    const { merged, dropped } = mergeDraws(existing, fresh);
    // Netto-Zuwachs = wie stark die gespeicherte Datei tatsächlich wächst.
    // Nicht die roh geparsten Neu-Daten melden: die Dedup entfernt versetzte
    // Phantom-Dubletten NACH dem Zählen, sonst meldet Telegram „hu-hatos+652",
    // obwohl die Datei bei 1831 bleibt. net kann 0 (nur Dubletten) oder negativ
    // (Altbestand bereinigt) sein.
    const net = merged.length - existing.length;
    writeFileSync(join(DATA_DIR, `${meta.key}.json`), JSON.stringify(merged));
    console.log(`[${meta.key}] OK — ${fresh.length} geparst, ${net} netto neu${dropped ? `, ${dropped} Dublette(n) entfernt` : ""}, ${merged.length} gesamt (${merged[0]?.d} … ${merged[merged.length - 1]?.d})`);
    report.push({ key: meta.key, ok: true, added: net, total: merged.length });
  } catch (e) {
    fail(`FEHLER: ${e.message}`);
  }
}

// ── Handy-Zusammenfassung schreiben (nur echte Läufe) ────────────────────
// run-summary.txt wird vom Workflow-Notify-Schritt an einen Push-Dienst geschickt.
if (!probeOnly && report.length) {
  const ok = report.filter((r) => r.ok);
  const failed = report.filter((r) => !r.ok);
  const withNew = ok.filter((r) => r.added > 0).map((r) => `${r.key}+${r.added}`);
  const day = new Date().toISOString().slice(0, 10);
  const lines = [`🎰 Lucky-Space ${day} — ${ok.length}/${report.length} Systeme geholt`];
  lines.push(withNew.length ? `🆕 ${withNew.join(" · ")}` : "🆕 keine neuen Ziehungen");
  if (failed.length) lines.push(`⚠️ nicht geholt: ${failed.map((r) => r.key + (r.optional ? " (optional)" : "")).join(", ")}`);
  const summary = lines.join("\n");
  writeFileSync(join(__dir, "..", "run-summary.txt"), summary);
  console.log("\n" + summary);
}

// Probe soll nicht die Action rot färben; echte Läufe schon (für Alerting), aber
// ohne bereits committete Daten zu zerstören.
if (hadError && !probeOnly) process.exitCode = 1;
