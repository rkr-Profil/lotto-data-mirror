/**
 * Fetcher: ES La Primitiva 6/49 — lotoideas Google-Sheets-CSV (offiziell Akamai-blockt,
 * dieser Umweg läuft über Google-CDN = datacenter-erreichbar). gid=1 = aktuell 2013–2026.
 * (Altdaten 1985–2012 = gid=0, gleiche Doc-ID — bei Bedarf für Voll-Historie nachziehen.)
 */
import { esGoogleSheet } from "../lib/util.mjs";

export const meta = {
  key: "es-primitiva",
  label: "Spanien La Primitiva 6/49",
  url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTov1BuA0nkVGTS48arpPFkc9cG7B40Xi3BfY6iqcWTrMwCBg5b50-WwvnvaR6mxvFHbDBtYFKg5IsJ/pub?gid=1&single=true&output=csv",
  kind: "csv"
};

export function parse(csvText) {
  return esGoogleSheet(csvText, { nMain: 6, hiMain: 49 });
}
