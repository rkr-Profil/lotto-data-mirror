/**
 * Fetcher: UK National Lottery „Lotto" 6/59 — lottery.co.uk Jahresarchive.
 * Ein statischer HTML-Request je Jahr, komplette Historie 1994–heute.
 *
 * ⚠ ZWEI Besonderheiten:
 *  1) Formatwechsel **2015-10-10**: davor 6/49, danach 6/59. Wir nehmen NUR die 6/59-Ära
 *     (alles davor passt nicht in dieselbe Matrix) → START = 2015-10-10.
 *  2) Ab **2026-06-10** werden ZWEI Runden pro Ziehungsabend gezogen. Beide werden
 *     übernommen und über das Feld `r` (1|2) unterschieden — mergeDraws schlüsselt
 *     dann nach Datum+Runde, sonst würde Runde 2 die Runde 1 überschreiben.
 * Bonusball wird verworfen (Modell 6/59, ein Pool) — wie bei BE/DE 6/49.
 *
 * Täglich: nur das aktuelle Jahr. Backfill: UK_FROM_YEAR=2015 setzen.
 */
const ARCH = (year) => `https://www.lottery.co.uk/lotto/results/archive-${year}`;
const FORMAT_START = "2015-10-10";           // erste 6/59-Ziehung
const HI_MAIN = 59, N_MAIN = 6;

export const meta = {
  key: "uk-lotto",
  label: "Großbritannien Lotto 6/59",
  url: ARCH(new Date().getUTCFullYear()),
  kind: "html"
};

// "results-DD-MM-YYYY" → ISO
function isoFromSlug(slug) {
  const m = slug.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function ballsFrom(seg, cls) {
  // class="result small <cls> …">NN</div>  — cls exakt, damit "lotto-ball" nicht
  // fälschlich "lotto-ball-round-1" mitnimmt (deshalb [^"]* statt freiem Suffix).
  const re = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>(\\d{1,2})<`, "g");
  const out = [];
  let m;
  while ((m = re.exec(seg))) out.push(parseInt(m[1], 10));
  return out;
}

const valid = (nums) =>
  nums.length === N_MAIN && new Set(nums).size === N_MAIN && nums.every((n) => n >= 1 && n <= HI_MAIN);

export function parse(html) {
  const draws = [];
  // In Segmente je Ziehung schneiden (jede Zeile beginnt mit dem Datums-Link).
  const parts = html.split(/href="\/lotto\/results-/).slice(1);
  for (const part of parts) {
    const slug = (part.match(/^(\d{2}-\d{2}-\d{4})/) || [])[1];
    const d = slug && isoFromSlug(slug);
    if (!d || d < FORMAT_START) continue;      // 6/49-Ära überspringen
    const seg = part.slice(0, 2500);           // eine Zeile reicht weit vor die nächste

    const r1 = ballsFrom(seg, "lotto-ball-round-1");
    const r2 = ballsFrom(seg, "lotto-ball-round-2");
    if (r1.length || r2.length) {
      if (valid(r1)) draws.push({ d, n: r1.slice().sort((a, b) => a - b), r: 1 });
      if (valid(r2)) draws.push({ d, n: r2.slice().sort((a, b) => a - b), r: 2 });
      continue;
    }
    const single = ballsFrom(seg, "lotto-ball");
    if (valid(single)) draws.push({ d, n: single.slice().sort((a, b) => a - b) });
  }
  return draws;
}

export async function fetchDraws({ fetchText }) {
  const nowY = new Date().getUTCFullYear();
  const fromY = process.env.UK_FROM_YEAR ? parseInt(process.env.UK_FROM_YEAR, 10) : nowY;
  const draws = [];
  /* Gruende sammeln statt sie zu verschlucken.
     Vorher hiess es hier `catch { continue }` und `if (r.status !== 200) continue`.
     Damit endeten ein 403, ein Zeitablauf und eine Seite, die sich nicht parsen
     laesst, alle gleich: als leeres Ergebnis, das der Runner nur als
     "0 Ziehungen" melden konnte. Am 2026-08-27 stand deshalb zwei Tage lang
     nicht fest, ob lottery.co.uk die Actions-IP sperrt oder ob der Parser
     danebenliegt -- zwei voellig verschiedene Reparaturen. */
  const probleme = [];
  for (let y = fromY; y <= nowY; y++) {
    let r;
    try { r = await fetchText(ARCH(y)); }
    catch (e) { probleme.push(y + ": " + (e && e.message ? e.message : String(e))); continue; }
    if (r.status !== 200) { probleme.push(y + ": HTTP " + r.status); continue; }
    const d = parse(r.text);
    if (!d.length) probleme.push(y + ": HTTP 200, aber 0 Ziehungen geparst (" + r.bytes + " Bytes)");
    draws.push(...d);
    await new Promise((res) => setTimeout(res, 120));
  }
  if (!draws.length && probleme.length) throw new Error(probleme.join(" \u00b7 "));
  return draws;
}
