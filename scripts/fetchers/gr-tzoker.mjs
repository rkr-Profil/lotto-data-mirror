/**
 * Fetcher: GR Tzoker 5/45 + 1 Joker — OPAP JSON-API (Game-ID 5104), last/100.
 * Vollhistorie kommt aus der committeten Baseline data/gr-tzoker.json; last/100 hält aktuell.
 * ACHTUNG: OPAP/Akamai blockt manche Datacenter-IPs (403). Ob der GitHub-Runner durchkommt,
 * zeigt der Probe-Lauf. Bei Block bleibt die Baseline erhalten (Runner überschreibt nicht).
 */
import { opapJson } from "../lib/util.mjs";

export const meta = {
  key: "gr-tzoker",
  label: "Griechenland Tzoker 5/45 + Joker",
  url: "https://api.opap.gr/draws/v3.0/5104/last/100",
  kind: "json",
  // OPAP geo-blockt US/Datacenter-IPs (403). Darf die Action NICHT rot färben; wird trotzdem
  // bei jedem Lauf probiert — kommt GitHub je durch, committet es automatisch. Bis dahin
  // liest die App GR frisch aus Supabase-EU (nicht aus MIRROR_MAP).
  optional: true
};

export function parse(text) {
  return opapJson(text, { nMain: 5, hiMain: 45, nExtra: 1, hiExtra: 20 });
}
