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
// … weitere Fetcher hier importieren und in FETCHERS eintragen:
// import * as frLoto from "./fetchers/fr-loto.mjs";

const FETCHERS = [huHatos, de649, euromillions];

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

for (const mod of FETCHERS) {
  const { meta, parse } = mod;
  if (onlyKeys.length && !onlyKeys.includes(meta.key)) continue;

  try {
    const r = await fetchText(meta.url);

    if (probeOnly) {
      const html = looksLikeHtml(r.text);
      console.log(`[${meta.key}] status=${r.status} type=${r.ct} bytes=${r.bytes} html=${html ? "JA (BLOCK?)" : "nein"}`);
      console.log(`  sample: ${r.text.slice(0, 160).replace(/\s+/g, " ")}`);
      if (html || r.status !== 200) hadError = true;
      continue;
    }

    if (r.status !== 200) { console.error(`[${meta.key}] HTTP ${r.status} — übersprungen`); hadError = true; continue; }
    if (looksLikeHtml(r.text)) { console.error(`[${meta.key}] HTML statt Daten (IP-Block?) — übersprungen, Datei bleibt unangetastet`); hadError = true; continue; }

    const fresh = parse(r.text);
    if (fresh.length === 0) { console.error(`[${meta.key}] Parser fand 0 Ziehungen — übersprungen`); hadError = true; continue; }

    const existing = loadExisting(meta.key);
    const { merged, added } = mergeDraws(existing, fresh);
    writeFileSync(join(DATA_DIR, `${meta.key}.json`), JSON.stringify(merged));
    console.log(`[${meta.key}] OK — ${fresh.length} geparst, ${added} neu, ${merged.length} gesamt (${merged[0]?.d} … ${merged[merged.length - 1]?.d})`);
  } catch (e) {
    console.error(`[${meta.key}] FEHLER: ${e.message}`);
    hadError = true;
  }
}

// Probe soll nicht die Action rot färben; echte Läufe schon (für Alerting), aber
// ohne bereits committete Daten zu zerstören.
if (hadError && !probeOnly) process.exitCode = 1;
