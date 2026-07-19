/**
 * Fetcher: NL Lotto 6/45 — nederlandseloterij.nl JSON-API (2-Schritt, keine Auth).
 * GET /api/draws/published → Liste der Ziehungsdaten (nur ~1 Jahr Fenster), dann je Datum
 * GET /api/draws/results/{date}. Ältere Daten liefert die API nicht (422) → Historie wächst
 * ab jetzt durch den akkumulierenden Merge. Reservezahl verworfen (Modell 6/45).
 */
import { nlResult } from "../lib/util.mjs";

const API = "https://lotto-api.nederlandseloterij.nl/api/draws";

export const meta = {
  key: "nl-lotto",
  label: "Niederlande Lotto 6/45",
  url: `${API}/published`,
  kind: "json"
};

export async function fetchDraws({ fetchText }) {
  const pub = await fetchText(`${API}/published`);
  if (pub.status !== 200) return [];
  let dates = [];
  try { dates = (JSON.parse(pub.text).publishedDraws || []).map((d) => d.drawDate).filter(Boolean); }
  catch { return []; }
  const draws = [];
  for (const date of dates) {
    const r = await fetchText(`${API}/results/${date}`);
    if (r.status !== 200) continue;
    try { const d = nlResult(JSON.parse(r.text)); if (d) draws.push(d); } catch { /* skip */ }
  }
  return draws;
}
