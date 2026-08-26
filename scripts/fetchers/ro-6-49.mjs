/**
 * Fetcher: Rumänien Loto 6/49 — ponturi.ro (statisches HTML, robots erlaubt Bots ausdrücklich).
 * Zwei Schritte: (1) Jahres-Archiv → Ziehungs-Slugs (rezultate-YYYY-MM-DD), (2) Detailseite je Slug
 * → 6 Hauptzahlen aus dem Fließtext („Numerele extrase au fost …"). Ziehungen Do + So.
 * Täglich: aktuelles + Vorjahr, nur die jüngsten ~20 Slugs/Jahr (Merge dedupliziert).
 * Voll-/Tief-Backfill: RO_FROM_YEAR=1993 (o. ä.) setzen → alle Jahre, alle Detailseiten.
 */
import { ponturiDetail } from "../lib/util.mjs";

const ARCH   = (year) => `https://ponturi.ro/loto/loteria-romana/6-49/arhiva/?year=${year}`;
const DETAIL = (date) => `https://ponturi.ro/loto/loteria-romana/6-49/rezultate-${date}/`;

export const meta = {
  key: "ro-6-49",
  label: "Rumänien Loto 6/49",
  url: ARCH(new Date().getUTCFullYear()),             // für --probe (HTML)
  kind: "html"
};

export async function fetchDraws({ fetchText }) {
  const nowY = new Date().getUTCFullYear();
  const backfill = !!process.env.RO_FROM_YEAR;
  const fromY = backfill ? parseInt(process.env.RO_FROM_YEAR, 10) : nowY - 1;
  const perYearLimit = backfill ? Infinity : 20;

  // Schritt 1: Slugs aus den Jahres-Archiven (neueste zuerst).
  const slugs = [];
  for (let y = nowY; y >= fromY; y--) {
    let r;
    try { r = await fetchText(ARCH(y)); } catch { continue; }
    if (r.status !== 200) continue;
    const found = [...r.text.matchAll(/rezultate-(\d{4}-\d{2}-\d{2})\//g)].map((m) => m[1]);
    const uniq = [...new Set(found)];
    slugs.push(...(perYearLimit === Infinity ? uniq : uniq.slice(0, perYearLimit)));
  }
  const uniqSlugs = [...new Set(slugs)];

  // Schritt 2: Detailseiten → saubere Zahlen.
  const draws = [];
  for (const date of uniqSlugs) {
    let r;
    try { r = await fetchText(DETAIL(date)); } catch { continue; }
    if (r.status !== 200) continue;
    const nums = ponturiDetail(r.text, { nMain: 6, hiMain: 49 });
    if (nums) draws.push({ d: date, n: nums });
    await new Promise((res) => setTimeout(res, 80));
  }
  return draws;
}
