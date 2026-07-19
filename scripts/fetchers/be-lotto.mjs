/**
 * Fetcher: BE Lotto 6/45 — Nationale Loterij APIM-Gateway (JSON, Browser-UA nötig, sonst 405).
 * Täglich: die letzten 2 Jahres-Fenster (date-from/date-to Epoch-ms) → Merge in die committete
 * Baseline (Vollhistorie ab 1992, einmalig über alle Jahre erzeugt). Bonusball verworfen (Modell 6/45).
 * Voll-Backfill bei Bedarf: die START_YEAR-Konstante auf 1978 setzen.
 */
import { beJson } from "../lib/util.mjs";

const BASE = "https://apim.prd.natlot.be/api/v4/draw-games/draws";
const START_YEAR = new Date().getUTCFullYear() - 1; // täglich nur aktuelles + Vorjahr

export const meta = {
  key: "be-lotto",
  label: "Belgien Lotto 6/45",
  url: `${BASE}?game-names=Lotto&status=PAYABLE&previous-draws=3`,
  kind: "json",
  // Probe 2026-07-19: GitHub-Azure-IP wird vom APIM-Gateway auf Netzwerkebene blockiert
  // ("fetch failed"). Bleibt statisch (committete 3502-Baseline) → optional, damit die Action
  // nicht rot wird. Auto-Update bräuchte einen Proxy/EU-Runner.
  optional: true
};

export async function fetchDraws({ fetchText }) {
  const draws = [];
  const nowYear = new Date().getUTCFullYear();
  for (let y = START_YEAR; y <= nowYear; y++) {
    const from = Date.UTC(y, 0, 1);
    const to = Date.UTC(y, 11, 31, 23, 59, 59);
    const r = await fetchText(`${BASE}?game-names=Lotto&status=PAYABLE&date-from=${from}&date-to=${to}&size=500`);
    if (r.status === 200) draws.push(...beJson(r.text));
  }
  return draws;
}
