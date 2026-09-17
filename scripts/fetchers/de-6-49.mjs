/**
 * Fetcher: DE Lotto 6 aus 49 — HAUPTQUELLE lotto.de (DLTB, amtlich, JSON), seit 17.09.2026.
 * ERSATZ: daowa89/lottery-archive (privates GitHub-Vollarchiv ab 1955), wie bis dahin.
 *
 * Warum der Wechsel: Der Altbestand 1955-2021 wurde am 17.09.2026 Ziehung fuer Ziehung gegen
 * die amtliche WestLotto-Datei (westlotto-medien/…/lotto6aus49.zip) geprueft — 4.556 von 4.556
 * Ziehungen identisch (3 Datumstippfehler in der WestLotto-Datei, 1 Sonderziehung 31.12.2005
 * dort doppelt; docs/RECHT_mail-lotto-bayern_2026-09-11.md). Der laufende Nachschub kommt
 * jetzt vom Veranstalterverbund selbst; das Drittarchiv wird nur noch gelesen, wenn lotto.de
 * ausfaellt (Telegram meldet dann „de-6-49 ← daowa89").
 * Superzahl wird hier verworfen (Einzel-Pool 6/49); de-6-49-sz nimmt sie.
 */
import { daowaCsv } from "../lib/util.mjs";
import { holeLottoDe } from "../lib/lotto-de.mjs";

const ERSATZ = "https://raw.githubusercontent.com/daowa89/lottery-archive/main/de/lotto_6aus49/results.csv";

export const meta = {
  key: "de-6-49",
  label: "Deutschland Lotto 6 aus 49",
  url: "https://www.lotto.de/api/stats/entities.lotto/history/0",
  kind: "json"
};

export function parse(csvText) {
  return daowaCsv(csvText, { nMain: 6, hiMain: 49 });
}

export async function fetchDraws({ fetchText }) {
  let grund;
  try {
    const z = await holeLottoDe(fetchText);
    if (z.length) return z.map(({ d, n }) => ({ d, n }));
    grund = "lotto.de: 0 Ziehungen im Zeitfenster";
  } catch (e) { grund = "lotto.de: " + (e && e.message ? e.message : String(e)); }
  const r = await fetchText(ERSATZ);
  if (r.status !== 200) throw new Error(grund + " · daowa89: HTTP " + r.status);
  const e = parse(r.text);
  e.quelle = "daowa89";
  console.warn("[de-6-49] " + grund + " → Ersatzquelle daowa89 (" + e.length + " Ziehungen)");
  return e;
}
