/**
 * Fetcher: Rumänien Loto 6/49 — ponturi.ro (statisches HTML, robots erlaubt Bots ausdrücklich).
 * Zwei Schritte: (1) Jahres-Archiv → Ziehungs-Slugs (rezultate-YYYY-MM-DD), (2) Detailseite je Slug
 * → 6 Hauptzahlen aus dem Fließtext („Numerele extrase au fost …"). Ziehungen Do + So.
 * Täglich: aktuelles + Vorjahr, nur die jüngsten ~20 Slugs/Jahr (Merge dedupliziert).
 * Voll-/Tief-Backfill: RO_FROM_YEAR=1993 (o. ä.) setzen → alle Jahre, alle Detailseiten.
 */
import { ponturiDetail, neueStoerungen } from "../lib/util.mjs";

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
  const stoer = neueStoerungen();   // Gruende sammeln statt verschlucken
  const slugs = [];
  for (let y = nowY; y >= fromY; y--) {
    let r;
    try { r = await fetchText(ARCH(y)); } catch (e) { stoer.fehler(e); continue; }
    if (r.status !== 200) { stoer.status(r.status); continue; }
    /* Zwei Muster (08.09.2026): ponturi.ro verlinkt die Ziehungen im Archiv nicht mehr
       als rezultate-JJJJ-MM-TT/, sondern schreibt das Datum als Ueberschrift
       (<h3 class="ds-h3">2026-09-03 …) mit den Zahlen daneben. Die Detailseiten gibt es
       weiter -- sie bleiben die Quelle der Zahlen, weil das Archiv je Termin zwei
       gleichlautende Zeilen zeigt („2 extrageri"). Lauf vom 08.09.: 2x HTTP 200, 0 Termine. */
    /* 09.09.2026: schon wieder anders -- die Ueberschrift lautet jetzt
       „duminică, 06.09.2026" (Wochentag, TT.MM.JJJJ) und ?year= wird ignoriert.
       Deshalb beide Datumsformen, nach ISO normalisiert. Der Lauf meldet weiter
       „0 Termine", sobald die Seite ein drittes Mal wechselt. */
    const iso = (t) => /^\d{4}-/.test(t) ? t : t.replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, "$3-$2-$1");
    const found = [
      ...r.text.matchAll(/rezultate-(\d{4}-\d{2}-\d{2})\//g),
      ...r.text.matchAll(/ds-h3">[^<\d]*(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})/g)
    ].map((m) => iso(m[1]));
    const uniq = [...new Set(found)].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));   // neueste zuerst
    if (!uniq.length) stoer.leer(r.bytes);        // Seite kam an, enthielt aber keine Termine
    slugs.push(...(perYearLimit === Infinity ? uniq : uniq.slice(0, perYearLimit)));
  }
  const uniqSlugs = [...new Set(slugs)];
  // Kein einziger Termin gefunden -> Grund melden, nicht stillschweigend leer bleiben
  stoer.pruefen(uniqSlugs.length);

  // Schritt 2: Detailseiten → saubere Zahlen.
  const draws = [];
  for (const date of uniqSlugs) {
    let r;
    try { r = await fetchText(DETAIL(date)); } catch (e) { stoer.fehler(e); continue; }
    if (r.status !== 200) { stoer.status(r.status); continue; }
    const nums = ponturiDetail(r.text, { nMain: 6, hiMain: 49 });
    if (nums) draws.push({ d: date, n: nums }); else stoer.leer(r.bytes);
    await new Promise((res) => setTimeout(res, 80));
  }
  stoer.pruefen(draws.length);
  return draws;
}
