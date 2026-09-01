/**
 * Sondierung möglicher Ersatzquellen für uk-lotto und ie-lotto.
 *
 *   node scripts/probe-quellen.mjs
 *
 * Schreibt NICHTS in data/. Der einzige Zweck ist die Frage, die sich von einem
 * normalen Anschluss aus nicht beantworten lässt: **Welche dieser Adressen kommt
 * vom GitHub-Runner aus überhaupt durch?**
 *
 * Hintergrund (01.09.2026): www.lottery.co.uk läuft seit dem 30.08. vom Runner
 * aus in den Verbindungs-Zeitablauf (UND_ERR_CONNECT_TIMEOUT) — das SYN geht
 * raus, es kommt nichts zurück. Von einem normalen Anschluss antwortet dieselbe
 * Adresse in 66-608 ms mit HTTP 200. Ein Parser für eine Quelle, die vom Runner
 * aus ebenfalls nicht durchkommt, wäre verlorene Arbeit — deshalb erst messen.
 *
 * Die beiden KONTROLLEN unten tragen den eigentlichen Erkenntnisgewinn:
 * uk.lottonumbers.com liegt auf 81.0.218.42, die kaputte Quelle auf 81.0.218.44
 * — dasselbe /24, derselbe Betreiber. Kommt die Kontrolle durch und die kaputte
 * Quelle nicht, hängt die Sperre am einzelnen Host und lottonumbers ist der
 * billigste Ersatz überhaupt (gleiche Jahresarchiv-Form, beide UK-Runden, Zahlen
 * stimmen auf den Punkt). Fallen beide aus, liegt sie am Netz und die ganze
 * Familie scheidet aus.
 */
const TIMEOUT_MS = 15000;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept": "text/html,text/csv,application/xml,application/json,text/plain,*/*",
  "Accept-Language": "en-GB,en;q=0.8,de;q=0.6"
};

/* marker = Zeichenfolge, die im Text stehen MUSS, damit die Antwort brauchbar ist.
   Ohne diese Prüfung sähe eine Abwehrseite mit HTTP 200 wie ein Erfolg aus.
   Bewusst STRUKTURELL gewählt (Feldname, Rundenbezeichnung), nicht als Datum —
   ein Datum wäre nach der nächsten Ziehung veraltet und meldete Fehlalarm. */
const KANDIDATEN = [
  { gruppe: "UK",        name: "national-lottery.co.uk CSV", url: "https://www.national-lottery.co.uk/results/lotto/draw-history/csv",       marker: "<draw-date>" },
  { gruppe: "UK",        name: "national-lottery.co.uk XML", url: "https://www.national-lottery.co.uk/results/lotto/draw-history/xml",       marker: "<draw-date>" },
  { gruppe: "UK",        name: "beatlottery 2026",           url: "https://www.beatlottery.co.uk/lotto/draw-history/year/2026",              marker: "Round 2" },
  { gruppe: "IE",        name: "lottery.ie (amtlich)",       url: "https://www.lottery.ie/results/lotto/history",                            marker: "Lotto Plus" },
  { gruppe: "IE",        name: "beatlottery irish 2026",     url: "https://www.beatlottery.co.uk/irish-lotto/draw-history/year/2026",        marker: "Draw History" },
  { gruppe: "Kontrolle", name: "lottery.co.uk (kaputt)",     url: "https://www.lottery.co.uk/lotto/results/archive-2026",                    marker: "lotto-ball" },
  { gruppe: "Kontrolle", name: "lottonumbers (81.0.218.42)", url: "https://uk.lottonumbers.com/lotto/results/2026",                          marker: "Round 2" }
];

function grundVon(e) {
  const c = e && e.cause;
  const code = (c && (c.code || c.errno)) || e?.code;
  const inner = c && c.message && c.message !== e.message ? c.message : "";
  const teile = [e?.name && e.name !== "Error" ? e.name : "", e?.message || String(e), code || "", inner].filter(Boolean);
  return [...new Set(teile)].join(" / ");
}

const zeilen = [];
let durch = 0;

for (const k of KANDIDATEN) {
  const t0 = Date.now();
  let zeile;
  try {
    const res = await fetch(k.url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const buf = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const ms = Date.now() - t0;
    const treffer = text.includes(k.marker);
    const ok = res.status === 200 && treffer;
    if (ok) durch++;
    zeile = `${ok ? "OK  " : "--  "} ${k.name}: HTTP ${res.status}, ${buf.length} B, ${ms} ms`
          + (res.status === 200 && !treffer ? ` — 200, aber „${k.marker}" fehlt (Abwehrseite?)` : "");
  } catch (e) {
    zeile = `XX   ${k.name}: ${grundVon(e)}`;
  }
  zeilen.push({ gruppe: k.gruppe, text: zeile });
  console.log(zeile);
  await new Promise((r) => setTimeout(r, 800));   // nicht im Sekundentakt auf fremde Hosts
}

/* Als run-summary.txt ablegen, damit der vorhandene Telegram-Schritt des
   Workflows sie unverändert ans Handy schickt — kein zweiter Meldeweg nötig. */
const kopf = `🔎 Quellen-Sondierung UK/IE — ${durch}/${KANDIDATEN.length} durchgekommen`;
const körper = ["UK", "IE", "Kontrolle"]
  .map((g) => `\n【${g}】\n` + zeilen.filter((z) => z.gruppe === g).map((z) => "  " + z.text).join("\n"))
  .join("");
const { writeFileSync } = await import("node:fs");
writeFileSync("run-summary.txt", kopf + körper + "\n", "utf8");
console.log("\n" + kopf);
