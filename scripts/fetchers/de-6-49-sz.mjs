/**
 * Fetcher: DE Lotto 6 aus 49 + Superzahl — daowa89/lottery-archive.
 * Format: date,n1..n6,superzahl. Superzahl 0..9 → App speichert 1..10 (e0:1 → +1).
 * Superzahl gibt es erst ab 1991-12-07; Zeilen ohne SZ werden verworfen (System braucht sie).
 */
import { parseIsoDate, parseInts, inRange } from "../lib/util.mjs";

export const meta = {
  key: "de-6-49-sz",
  label: "Deutschland 6/49 + Superzahl",
  url: "https://raw.githubusercontent.com/daowa89/lottery-archive/main/de/lotto_6aus49/results.csv",
  kind: "csv"
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
