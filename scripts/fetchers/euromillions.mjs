/**
 * Fetcher: EuroMillionen 5/50 + 2 Sterne — HAUPTQUELLE win2day (Oesterreichische Lotterien,
 * EuroMillionen-Traeger), Jahres-CSV `NN_W2D_STAT_EUML_{JAHR}.csv`, seit 17.09.2026.
 * ERSATZ: daowa89/lottery-archive (privates GitHub-Archiv; Format date,n1..n5,s1,s2).
 *
 * Warum der Wechsel: Der Altbestand wurde am 17.09.2026 gegen die win2day-Dateien geprueft
 * (2004-2017 Gesamt-CSV + Jahresdateien 2017-2026): kein einziger Widerspruch, aber fuenf
 * Ziehungen, die dem Drittarchiv fehlten (20.11.2009, 03.01.2014, 24.10.2014, 02.01.2015,
 * 01.01.2016) -- die Datei data/euromillions.json wurde daraus neu aufgebaut (1.979 Ziehungen).
 * Eigenheiten der win2day-Dateien: 20.11.2009 steht als „2099", 04.08.2017 einmal doppelt als
 * 06.08.2017 (Sonntag) -- beides korrigiert; scripts/verify-euromillions-win2day.py.
 *
 * Zeilenformat der Jahresdatei: `Fr. 02.01.2026;8;27;42;44;46;1;10;Rang;…` -- Wochentag +
 * Datum, fuenf Zahlen, zwei Sterne; die Quotenzeilen darunter beginnen mit `;`.
 * Taeglich nur das laufende Jahr (wie at-6-45); Altbestand ist die committete Datei.
 */
import { daowaCsv, parseInts, inRange } from "../lib/util.mjs";

const YEAR = new Date().getUTCFullYear();
const ERSATZ = "https://raw.githubusercontent.com/daowa89/lottery-archive/main/eu/euromillions/results.csv";

export const meta = {
  key: "euromillions",
  label: "EuroMillionen 5/50 + 2",
  url: `https://statics.win2day.at/media/NN_W2D_STAT_EUML_${YEAR}.csv`,
  kind: "csv"
};

/** win2day-Jahresdatei → Draws. */
export function parse(csvText) {
  const draws = [];
  for (const line of csvText.split(/\r?\n/)) {
    const c = line.split(";").map((x) => x.trim());
    if (c.length < 8) continue;
    const m = /^[A-Za-z]{2}\.?\s*(\d{2})\.(\d{2})\.(\d{4})$/.exec(c[0]);
    if (!m) continue;
    const nums = parseInts(c.slice(1, 6)), extra = parseInts(c.slice(6, 8));
    if (!nums || !extra || !inRange(nums, 5, 50) || !inRange(extra, 2, 12)) continue;
    draws.push({ d: `${m[3]}-${m[2]}-${m[1]}`, n: nums.slice().sort((a, b) => a - b), e: extra.slice().sort((a, b) => a - b) });
  }
  return draws;
}

export async function fetchDraws({ fetchText }) {
  let grund;
  try {
    const r = await fetchText(meta.url);
    if (r.status !== 200) throw new Error("HTTP " + r.status);
    const z = parse(r.text);
    if (z.length) return z;
    grund = "win2day: HTTP 200, aber 0 Ziehungen geparst";
  } catch (e) { grund = "win2day: " + (e && e.message ? e.message : String(e)); }
  const r = await fetchText(ERSATZ);
  if (r.status !== 200) throw new Error(grund + " · daowa89: HTTP " + r.status);
  const e = daowaCsv(r.text, { nMain: 5, hiMain: 50, nExtra: 2, hiExtra: 12 });
  e.quelle = "daowa89";
  console.warn("[euromillions] " + grund + " → Ersatzquelle daowa89 (" + e.length + " Ziehungen)");
  return e;
}
