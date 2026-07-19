/**
 * Fetcher: ES La Primitiva 6/49 — lotoideas Google-Sheets-CSV (über Google-CDN, umgeht Akamai).
 * VOLLHISTORIE: zwei Blätter mergen — gid=1 = aktuell (2013–heute), gid=0 = alt (1985–2012).
 */
import { esGoogleSheet } from "../lib/util.mjs";

const BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTov1BuA0nkVGTS48arpPFkc9cG7B40Xi3BfY6iqcWTrMwCBg5b50-WwvnvaR6mxvFHbDBtYFKg5IsJ/pub";

export const meta = {
  key: "es-primitiva",
  label: "Spanien La Primitiva 6/49",
  url: `${BASE}?gid=1&single=true&output=csv`,
  kind: "csv"
};

export async function fetchDraws({ fetchText }) {
  const draws = [];
  for (const gid of [1, 0]) { // 1 = aktuell 2013–heute, 0 = Altdaten 1985–2012
    const r = await fetchText(`${BASE}?gid=${gid}&single=true&output=csv`);
    if (r.status === 200) draws.push(...esGoogleSheet(r.text, { nMain: 6, hiMain: 49 }));
  }
  return draws;
}
