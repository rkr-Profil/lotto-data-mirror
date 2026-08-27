/**
 * Fetcher: NL Lotto 6/45 — nederlandseloterij.nl JSON-API (2-Schritt, keine Auth).
 * GET /api/draws/published → Liste der Ziehungsdaten (nur ~1 Jahr Fenster), dann je Datum
 * GET /api/draws/results/{date}. Ältere Daten liefert die API nicht (422) → Historie wächst
 * ab jetzt durch den akkumulierenden Merge. Reservezahl verworfen (Modell 6/45).
 */
import { nlResult, neueStoerungen } from "../lib/util.mjs";

const API = "https://lotto-api.nederlandseloterij.nl/api/draws";

export const meta = {
  key: "nl-lotto",
  label: "Niederlande Lotto 6/45",
  url: `${API}/published`,
  kind: "json"
};

export async function fetchDraws({ fetchText }) {
  const stoer = neueStoerungen();   // Gruende sammeln statt verschlucken
  let pub;
  try { pub = await fetchText(`${API}/published`); }
  catch (e) { throw new Error("Index nicht erreichbar: " + (e && e.message ? e.message : e)); }
  if (pub.status !== 200) throw new Error("Index: HTTP " + pub.status);
  let dates = [];
  try { dates = (JSON.parse(pub.text).publishedDraws || []).map((d) => d.drawDate).filter(Boolean); }
  catch (e) { throw new Error("Index nicht lesbar: " + (e && e.message ? e.message : e)); }
  if (!dates.length) throw new Error("Index geliefert, aber 0 Termine enthalten");

  const draws = [];
  for (const date of dates) {
    let r;
    try { r = await fetchText(`${API}/results/${date}`); } catch (e) { stoer.fehler(e); continue; }
    if (r.status !== 200) { stoer.status(r.status); continue; }
    try { const d = nlResult(JSON.parse(r.text)); if (d) draws.push(d); else stoer.leer(r.bytes); }
    catch (e) { stoer.fehler(e); }
  }
  stoer.pruefen(draws.length);
  return draws;
}
