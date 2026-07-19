/**
 * Fetcher: EuroMillionen 5/50 + 2 Sterne — daowa89/lottery-archive (ab 2004).
 * Format: date,n1..n5,s1,s2 (Sterne 1..12 als Extra-Pool).
 */
import { daowaCsv } from "../lib/util.mjs";

export const meta = {
  key: "euromillions",
  label: "EuroMillionen 5/50 + 2",
  url: "https://raw.githubusercontent.com/daowa89/lottery-archive/main/eu/euromillions/results.csv",
  kind: "csv"
};

export function parse(csvText) {
  return daowaCsv(csvText, { nMain: 5, hiMain: 50, nExtra: 2, hiExtra: 12 });
}
