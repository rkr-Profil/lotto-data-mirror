/**
 * Fetcher: ES BonoLoto 6/49 — lotoideas Google-Sheets-CSV.
 * VOLLHISTORIE: gid=0 = aktuell (2013–heute), gid=1 = alt (1988–2012).
 */
import { esGoogleSheet } from "../lib/util.mjs";

const BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQALTRaLDFfhXOAQmeONPqmFKm9yOiQ4W97rhWgR41BZ7czFsjK5YktD6fnETKHGB9YUnyQ4XBSbhZx/pub";

export const meta = {
  key: "es-bonoloto",
  label: "Spanien BonoLoto 6/49",
  url: `${BASE}?gid=0&single=true&output=csv`,
  kind: "csv"
};

export async function fetchDraws({ fetchText }) {
  const draws = [];
  for (const gid of [0, 1]) { // 0 = aktuell 2013–heute, 1 = Altdaten 1988–2012
    const r = await fetchText(`${BASE}?gid=${gid}&single=true&output=csv`);
    if (r.status === 200) draws.push(...esGoogleSheet(r.text, { nMain: 6, hiMain: 49 }));
  }
  return draws;
}
