/**
 * Fetcher: ES BonoLoto 6/49 — lotoideas Google-Sheets-CSV. gid=0 = aktuell 2013–2026.
 * (Altdaten 1988–2012 = gid=1, gleiche Doc-ID.)
 */
import { esGoogleSheet } from "../lib/util.mjs";

export const meta = {
  key: "es-bonoloto",
  label: "Spanien BonoLoto 6/49",
  url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQALTRaLDFfhXOAQmeONPqmFKm9yOiQ4W97rhWgR41BZ7czFsjK5YktD6fnETKHGB9YUnyQ4XBSbhZx/pub?gid=0&single=true&output=csv",
  kind: "csv"
};

export function parse(csvText) {
  return esGoogleSheet(csvText, { nMain: 6, hiMain: 49 });
}
