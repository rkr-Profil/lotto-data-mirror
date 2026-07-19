/**
 * Fetcher: DE Lotto 6 aus 49 — daowa89/lottery-archive (Vollarchiv ab 1955).
 * Format: date,n1..n6,superzahl (Superzahl wird verworfen — Einzel-Pool 6/49).
 */
import { daowaCsv } from "../lib/util.mjs";

export const meta = {
  key: "de-6-49",
  label: "Deutschland Lotto 6 aus 49",
  url: "https://raw.githubusercontent.com/daowa89/lottery-archive/main/de/lotto_6aus49/results.csv",
  kind: "csv"
};

export function parse(csvText) {
  return daowaCsv(csvText, { nMain: 6, hiMain: 49 });
}
