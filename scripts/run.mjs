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
import * as lvLatlotoF from "./fetchers/lv-latloto.mjs";   // bewusst NICHT in FETCHERS — siehe Notiz unter der Liste
import * as eeVikinglotto from "./fetchers/ee-vikinglotto.mjs";
import * as beLotto from "./fetchers/be-lotto.mjs";
import * as nlLotto from "./fetchers/nl-lotto.mjs";
import * as ptTotolotoF from "./fetchers/pt-totoloto.mjs";
import * as eurojackpot from "./fetchers/eurojackpot.mjs";   // Veikkaus-EJACKPOT-API (2026-08-25)
import * as ro649 from "./fetchers/ro-6-49.mjs";             // ponturi.ro (2026-08-25)
import * as fiLotto from "./fetchers/fi-lotto.mjs";          // Veikkaus-LOTTO-API 7/40 (2026-08-25)
import * as ukLotto from "./fetchers/uk-lotto.mjs";          // lottery.co.uk 6/59, 2 Runden ab 06/2026 (2026-08-26)
import * as ieLotto from "./fetchers/ie-lotto.mjs";          // lottery.co.uk irish-lotto 6/45-Aeren (2026-08-26)
// … weitere Fetcher hier importieren und in FETCHERS eintragen:
// import * as frLoto from "./fetchers/fr-loto.mjs";  // FDJ-API, Reverse-Engineering nötig

const FETCHERS = [
  huHatos, de649, euromillions, at645, plLotto, de649sz, grTzoker,
  esPrimitiva, esBonoloto, eeVikinglotto, beLotto, nlLotto, ptTotolotoF,
  eurojackpot, ro649, fiLotto, ukLotto, ieLotto
];

/* ⛔ ABGESCHALTET 2026-08-27: lvLatlotoF (Lettland Latloto 5/38)
 * latloto.lv steht seit Ende August hinter einer Cloudflare-Bot-Challenge
 * (HTTP 403, Cf-Mitigated: challenge, "Just a moment…"). Der Server laeuft,
 * er weist den Abruf gezielt ab — das ist mit Kopfzeilen nicht zu loesen und
 * soll auch nicht umgangen werden. Letzter erfolgreicher Stand: Ziehung vom
 * 2026-08-22. Da Lettland in der App ohnehin ausgeblendet ist (zu duenne
 * Datenlage, keine Zielgruppe), waere jeder weitere Versuch nur eine taegliche
 * Fehlmeldung auf dem Handy.
 * Import und Fetcher-Datei bleiben absichtlich stehen: findet sich eine neue
 * Quelle, genuegt es, lvLatlotoF wieder in die Liste oben aufzunehmen.
 * data/lv-latloto.json bleibt unangetastet (206 Ziehungen bis 2026-08-22). */

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, "..", "data");
/* IPv6 ist als Ursache WIDERLEGT (01.09.2026) — hier stand ein ipv4first-Versuch.
 * www.lottery.co.uk hat gar keinen AAAA-Record (nur A 81.0.218.44, geprueft gegen
 * 8.8.8.8). IPv6 war also nie im Spiel, und dns.setDefaultResultOrder("ipv4first")
 * konnte fuer diesen Host nichts aendern. Die Zeile ist deshalb wieder heraus --
 * genau so, wie es der Commit angekuendigt hatte, der sie eingefuehrt hat.
 *
 * Was der Grund-Code seither meldet: UND_ERR_CONNECT_TIMEOUT, also ein
 * Verbindungs-Zeitablauf. Kein ENOTFOUND (DNS loest auf), kein ECONNRESET
 * (niemand legt auf), kein CERT_* (TLS kommt nicht dran). Das SYN geht raus, es
 * kommt nichts zurueck -- die Signatur einer stillen Verwerfungsregel. WER
 * verwirft und warum, ist weiter unbekannt und wird hier nicht behauptet.
 * Naechster Schritt: scripts/probe-quellen.mjs. */

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept": "text/csv,application/json,text/plain,*/*",
  "Accept-Language": "de,en;q=0.8,hu;q=0.6"
};

const args = process.argv.slice(2);
const probeOnly = args.includes("--probe");
const onlyKeys = args.filter((a) => !a.startsWith("--"));

/* Harter Zeitablauf je Anfrage (2026-08-27).
 * Vorher lief fetch() ohne AbortSignal. Wenn eine Quelle die Verbindung still
 * haengen laesst -- statt sauber 403 zu antworten --, blockiert das minutenlang.
 * Am 2026-08-27 dauerte ein Lauf dadurch 7,3 statt der ueblichen 1-2 Minuten:
 * uk-lotto und ie-lotto (beide lottery.co.uk) kamen von der Actions-IP nicht
 * durch, und die auf 3 erhoehten Versuche vervielfachten die Haengezeit.
 * 15 s reichen mit Abstand: die langsamste gesunde Quelle antwortet in < 1 s. */
const FETCH_TIMEOUT_MS = 15000;

/* "fetch failed" allein sagt nichts. Der Grund steht in e.cause.code:
 * ECONNRESET (Gegenstelle legt auf), ENOTFOUND (Name nicht aufloesbar),
 * ECONNREFUSED, UND_ERR_CONNECT_TIMEOUT, CERT_* (TLS). Genau diese
 * Unterscheidung entscheidet, ob eine Sperre, ein DNS- oder ein TLS-Problem
 * vorliegt — drei voellig verschiedene Reparaturen. */
function grundVon(e) {
  const c = e && e.cause;
  const code = (c && (c.code || c.errno)) || e?.code;
  const inner = c && c.message && c.message !== e.message ? c.message : "";
  const teile = [e?.name && e.name !== "Error" ? e.name : "", e?.message || String(e), code || "", inner]
    .filter(Boolean);
  return [...new Set(teile)].join(" / ");
}

async function fetchText(url) {
  let res;
  try {
    res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    const err = new Error(grundVon(e));
    err.cause = e;
    throw err;
  }
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

/* Pacing (2026-08-27). Vorher lief die Schleife ohne jede Pause durch, und
 * uk-lotto und ie-lotto stehen direkt hintereinander am Listenende — beide
 * gegen lottery.co.uk. Zwei Anfragen im selben Sekundenbruchteil an denselben
 * Host sind genau das Muster, das Betreiber abwehren. */
const PAUSE_MS = 500;              // zwischen zwei Systemen
const PAUSE_SAME_HOST_MS = 2000;   // wenn das naechste System denselben Host trifft
const RETRIES = 3;
const RETRY_WAIT_MS = [5000, 20000];
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const hostOf = (m) => { try { return new URL(m.meta.url).host; } catch { return m.meta.key; } };

let prevHost = null;
for (const mod of FETCHERS) {
  const { meta, parse } = mod;
  if (onlyKeys.length && !onlyKeys.includes(meta.key)) continue;

  // Vor jedem System kurz durchatmen — laenger, wenn derselbe Host schon
  // beim vorigen System drankam (uk-lotto -> ie-lotto). Die Probe darf
  // durchlaufen, die soll schnell Auskunft geben.
  const host = hostOf(mod);
  if (prevHost !== null && !probeOnly) await sleep(host === prevHost ? PAUSE_SAME_HOST_MS : PAUSE_MS);
  prevHost = host;

  // optional-Systeme (z. B. GR: OPAP geo-blockt Datacenter-IPs) dürfen die Action nicht
  // rot färben — Fehler werden geloggt, setzen aber hadError nur bei Pflicht-Systemen.
  const fail = (msg) => {
    console.error(`[${meta.key}] ${msg}${meta.optional ? " (optional — kein Fehler)" : ""}`);
    if (!meta.optional) hadError = true;
    /* Grund MITNEHMEN, nicht nur ins Protokoll schreiben. Die Fetcher melden seit
       2026-08-27 den echten Ausfallgrund (HTTP 403 / Zeitablauf / "200 aber 0
       geparst") — der landete aber nur im Action-Log, an das man ohne Anmeldung
       nicht herankommt. Auf dem Handy stand weiterhin bloss "nicht geholt: uk-lotto",
       also genau die Ratlosigkeit, die der Umbau beseitigen sollte. */
    report.push({ key: meta.key, ok: false, optional: !!meta.optional, grund: String(msg || "") });
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
    // 3 Versuche mit wachsendem Abstand (5s, 20s). Vorher waren es 2 Versuche
    // mit 5s — zu knapp: lottery.co.uk hat am 2026-08-27 die Actions-IP kurz
    // abgewiesen, beide Versuche fielen in dasselbe Zeitfenster und uk-lotto
    // wurde als "nicht geholt" gemeldet, obwohl die Quelle in Ordnung war.
    let fresh = null, lastErr = null;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        fresh = await getFresh();
        if (fresh && fresh.length) break;
        lastErr = new Error("0 Ziehungen");
      } catch (e) { lastErr = e; }
      if (attempt < RETRIES) {
        const waitMs = RETRY_WAIT_MS[attempt - 1];
        console.warn(`[${meta.key}] Versuch ${attempt} fehlgeschlagen (${lastErr?.message}), erneuter Versuch in ${waitMs / 1000}s…`);
        await sleep(waitMs);
      }
    }
    if (!fresh || fresh.length === 0) { fail(`${lastErr?.message || "kein Ergebnis"} — übersprungen (nach ${RETRIES} Versuchen)`); continue; }

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
  if (failed.length) {
    // Je Ausfall eine eigene Zeile MIT Grund. Gekuerzt, damit die Nachricht auch
    // bei mehreren Ausfaellen unter dem Telegram-Limit bleibt.
    const kurz = (g) => {
      const t = g.replace(/\s+/g, " ").replace(/ — übersprungen.*$/, "").trim();
      return t.length > 120 ? t.slice(0, 117) + "…" : t;
    };
    lines.push("⚠️ nicht geholt:");
    for (const r of failed) {
      lines.push(`   ${r.key}${r.optional ? " (optional)" : ""}: ${kurz(r.grund) || "kein Grund gemeldet"}`);
    }
  }
  /* Ausgangsadresse des Runners mitmelden (01.09.2026).
   * An drei Tagen fielen VERSCHIEDENE, voneinander unabhaengige Quellen auf
   * verschiedenen Netzen aus -- uk-lotto/ie-lotto mit stillem Verbindungs-
   * Zeitablauf, heute pl-lotto mit HTTP 403 -- waehrend alle drei von einem
   * normalen Anschluss aus tadellos antworten. Was sie gemeinsam haben, ist
   * nicht der Betreiber, sondern der Anrufer. GitHub gibt jedem Lauf eine
   * andere Adresse aus den Azure-Bereichen, und die stehen reichlich auf
   * Rechenzentrums-Sperrlisten.
   * Das ist eine VERMUTUNG. Diese Zeile macht sie pruefbar: haeufen sich die
   * Ausfaelle ueber mehrere Laeufe auf bestimmten Adressen, traegt sie, sonst
   * nicht. Kostet eine winzige Anfrage; scheitert sie, steht "unbekannt" da
   * und der Lauf laeuft normal weiter. */
  let ip = "unbekannt";
  try {
    const rIp = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(5000) });
    if (rIp.ok) ip = (await rIp.text()).trim().slice(0, 45);
  } catch { /* Diagnose darf den Lauf nie aufhalten */ }
  lines.push("\u{1F4CD} Runner-Adresse: " + ip);

  const summary = lines.join("\n");
  writeFileSync(join(__dir, "..", "run-summary.txt"), summary);
  console.log("\n" + summary);
}

// Probe soll nicht die Action rot färben; echte Läufe schon (für Alerting), aber
// ohne bereits committete Daten zu zerstören.
if (hadError && !probeOnly) process.exitCode = 1;
