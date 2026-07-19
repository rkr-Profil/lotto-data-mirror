/**
 * Fetcher: AT Lotto 6 aus 45 — win2day Jahres-CSV (nur laufendes Jahr).
 * Vollhistorie kommt aus der committeten Baseline data/at-6-45.json; dieser Fetcher
 * hält das aktuelle Jahr frisch (Merge im Runner ergänzt neue Ziehungen).
 */
import { win2dayYearly } from "../lib/util.mjs";

const YEAR = new Date().getUTCFullYear();

export const meta = {
  key: "at-6-45",
  label: "Österreich Lotto 6 aus 45",
  url: `https://statics.win2day.at/media/NN_W2D_STAT_Lotto_${YEAR}.csv`,
  kind: "csv"
};

export function parse(csvText) {
  return win2dayYearly(csvText, YEAR, { nMain: 6, hiMain: 45 });
}
