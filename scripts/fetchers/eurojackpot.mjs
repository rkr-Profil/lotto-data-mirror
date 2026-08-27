/**
 * Fetcher: EuroJackpot 5/50 + 2 — über die offene Veikkaus-API (FI ist EJ-Teilnehmer).
 * Endpoint (kein Login/Key): /api/draw-results/v1/games/EJACKPOT/draws/by-day/{YYYY-MM-DD}.
 * Iteriert die EJ-Ziehungstage (Fr seit 2012-03-23, zusätzlich Di seit 2022-03-29) im Fenster.
 * Baseline: data/eurojackpot.json (Vollhistorie ab 2012 bis Feb 2025) — der tägliche Lauf
 * fügt nur die neuen Ziehungen hinzu. Voll-/Lücken-Backfill: EJ_FROM=2025-01-01 (o. ä.) setzen.
 *
 * ⚠ optional: Veikkaus kann Datacenter-IPs (GitHub-Action) blocken. Dann bleibt EJ auf der
 * committeten Baseline stehen (Action wird nicht rot). Von Wohn-IP/EU-Runner läuft es sauber.
 */
import { veikkausByDay, neueStoerungen } from "../lib/util.mjs";

const API = (date) => `https://www.veikkaus.fi/api/draw-results/v1/games/EJACKPOT/draws/by-day/${date}`;
const TUE_START = Date.UTC(2022, 2, 29);            // Dienstags-Ziehung ab 29.03.2022
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const meta = {
  key: "eurojackpot",
  label: "EuroJackpot 5/50 + 2",
  url: API(iso(new Date())),                         // nur für --probe (heutiger Tag)
  kind: "json",
  optional: true
};

export async function fetchDraws({ fetchText }) {
  const from = process.env.EJ_FROM
    ? new Date(process.env.EJ_FROM + "T00:00:00Z")
    : new Date(Date.now() - 120 * 86400000);         // täglich: rollendes 120-Tage-Fenster
  const today = Date.now();
  const draws = [];
  const stoer = neueStoerungen();   // Gruende sammeln statt verschlucken
  for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t <= today; t += 86400000) {
    const d = new Date(t);
    const dow = d.getUTCDay();                        // 0=So .. 6=Sa
    const isDrawDay = dow === 5 || (dow === 2 && t >= TUE_START);
    if (!isDrawDay) continue;
    let r;
    try { r = await fetchText(API(iso(d))); } catch (e) { stoer.fehler(e); continue; }
    if (r.status !== 200) { stoer.status(r.status); continue; }
    const tag = veikkausByDay(r.text, { nMain: 5, hiMain: 50, nExtra: 2, hiExtra: 12, tz: "Europe/Helsinki" });
    if (tag.length) draws.push(...tag); else stoer.leer(r.bytes);   // 200, aber nichts drin
    await new Promise((res) => setTimeout(res, 60));
  }
  /* Einzelne 404 sind hier NORMAL — an ziehungsfreien Tagen gibt es nichts.
     Gemeldet wird nur, wenn ueber den ganzen Zeitraum nichts herauskam. */
  stoer.pruefen(draws.length);
  return draws;
}
