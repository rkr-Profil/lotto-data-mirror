/**
 * Fetcher: Finnland Lotto 7/40 — offene Veikkaus-API (kein Login/Key).
 * Endpoint: /api/draw-results/v1/games/LOTTO/draws/by-day/{YYYY-MM-DD}. Ziehung: Samstag.
 * Modell: nur die 7 Hauptzahlen (primary). Lisä-/Plusnumero werden ignoriert (App-Modell
 * unterstützt nur EINEN Zusatzpool; die Heatmap braucht nur die Hauptkombination).
 * Backfill: FI_FROM=2010-01-01 (o. ä.). Täglich: rollendes 90-Tage-Fenster (Samstage).
 *
 * ⚠ optional: Veikkaus kann Datacenter-IPs (GitHub-Action) blocken → bleibt dann auf Baseline.
 */
import { veikkausByDay, neueStoerungen } from "../lib/util.mjs";

const API = (date) => `https://www.veikkaus.fi/api/draw-results/v1/games/LOTTO/draws/by-day/${date}`;
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const meta = {
  key: "fi-lotto",
  label: "Finnland Lotto 7/40",
  url: API(iso(new Date())),               // nur für --probe
  kind: "json",
  optional: true
};

export async function fetchDraws({ fetchText }) {
  const from = process.env.FI_FROM
    ? new Date(process.env.FI_FROM + "T00:00:00Z")
    : new Date(Date.now() - 90 * 86400000);
  const today = Date.now();
  const draws = [];
  const stoer = neueStoerungen();   // Gruende sammeln statt verschlucken
  for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t <= today; t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 6) continue;      // finnisches Lotto: Samstag
    let r;
    try { r = await fetchText(API(iso(d))); } catch (e) { stoer.fehler(e); continue; }
    if (r.status !== 200) { stoer.status(r.status); continue; }
    const tag = veikkausByDay(r.text, { nMain: 7, hiMain: 40, tz: "Europe/Helsinki" });
    if (tag.length) draws.push(...tag); else stoer.leer(r.bytes);   // 200, aber nichts drin
    await new Promise((res) => setTimeout(res, 60));
  }
  /* Einzelne 404 sind hier NORMAL — an ziehungsfreien Tagen gibt es nichts.
     Gemeldet wird nur, wenn ueber den ganzen Zeitraum nichts herauskam. */
  stoer.pruefen(draws.length);
  return draws;
}
