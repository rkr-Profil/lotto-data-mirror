/**
 * Fetcher: LV Latloto 5/38 (+Bonusball) — latloto.lv HTML-Archiv `latloto38` (server-gerendert,
 * datacenter-erreichbar, aktuelles Spiel ab 2024-11-13). Seite 1 = jüngste ~20 Ziehungen;
 * Voll-Historie liegt als committete Baseline. Bonusball wird verworfen (Modell 5/38).
 * Hinweis: Legacy-Spiel `latloto` (5/35) endete 2024-11-09 — nicht verwenden.
 */
import { lvLatloto } from "../lib/util.mjs";

export const meta = {
  key: "lv-latloto",
  label: "Lettland Latloto 5/38",
  url: "https://www.latloto.lv/lv/arhivs/latloto38/1",
  kind: "html"
};

export function parse(html) {
  return lvLatloto(html, 38);
}
