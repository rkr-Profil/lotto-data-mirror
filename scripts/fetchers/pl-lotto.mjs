/**
 * Fetcher: PL Lotto (Duży Lotek) 6/49 — wynikilotto.net.pl (Vollarchiv ab 1957).
 * Format: nr,DD.MM.YYYY,n1..n6 (kein Header).
 */
import { plLotto } from "../lib/util.mjs";

export const meta = {
  key: "pl-lotto",
  label: "Polen Lotto 6/49",
  url: "https://www.wynikilotto.net.pl/download/lotto.csv",
  kind: "csv"
};

export function parse(csvText) {
  return plLotto(csvText, { nMain: 6, hiMain: 49 });
}
