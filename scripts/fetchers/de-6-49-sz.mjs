/**
 * Fetcher: DE Lotto 6 aus 49 + Superzahl — HAUPTQUELLE lotto.de (DLTB, amtlich, JSON), seit
 * 17.09.2026; ERSATZ daowa89/lottery-archive (Format: date,n1..n6,superzahl).
 * Superzahl 0..9 → App speichert 1..10 (e0:1 → +1). Superzahl gibt es erst ab 1991-12-07;
 * Zeilen ohne SZ werden verworfen (System braucht sie). Begruendung des Wechsels: siehe de-6-49.mjs.
 */
import { parseIsoDate, parseInts, inRange } from "../lib/util.mjs";
import { holeLottoDe } from "../lib/lotto-de.mjs";

const ERSATZ = "https://raw.githubusercontent.com/daowa89/lottery-archive/main/de/lotto_6aus49/results.csv";

export const meta = {
  key: "de-6-49-sz",
  label: "Deutschland 6/49 + Superzahl",
  url: "https://www.lotto.de/api/stats/entities.lotto/history/0",
  kind: "json"
};

export function parse(csvText) {
  const draws = [];
  for (const line of csvText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = line.split(",").map((c) => c.trim());
    if (row[0].toLowerCase() === "date") continue;
    const date = parseIsoDate(row[0]);
    if (!date) continue;
    const nums = parseInts(row.slice(1, 7));
    if (!nums || !inRange(nums, 6, 49)) continue;
    const szCell = row[7];
    if (szCell === undefined || szCell === "") continue; // Superzahl Pflicht (erst ab 1991)
    const sz = parseInt(szCell, 10);
    if (isNaN(sz) || sz < 0 || sz > 9) continue;
    draws.push({ d: date, n: nums.slice().sort((a, b) => a - b), e: [sz + 1] });
  }
  return draws;
}

export async function fetchDraws({ fetchText }) {
  let grund;
  try {
    const z = await holeLottoDe(fetchText);
    const mit = z.filter((x) => x.sz !== null).map(({ d, n, sz }) => ({ d, n, e: [sz + 1] }));
    if (mit.length) return mit;
    grund = "lotto.de: 0 Ziehungen mit Superzahl im Zeitfenster";
  } catch (e) { grund = "lotto.de: " + (e && e.message ? e.message : String(e)); }
  const r = await fetchText(ERSATZ);
  if (r.status !== 200) throw new Error(grund + " · daowa89: HTTP " + r.status);
  const e = parse(r.text);
  e.quelle = "daowa89";
  console.warn("[de-6-49-sz] " + grund + " → Ersatzquelle daowa89 (" + e.length + " Ziehungen)");
  return e;
}
