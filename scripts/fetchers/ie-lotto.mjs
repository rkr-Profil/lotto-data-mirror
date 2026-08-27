/**
 * Fetcher: Irland „Lotto" **6/45** — lottery.co.uk Jahresarchive (irish-lotto).
 *
 * ⚠ Irland hat mehrere Formatwechsel. Alle Ziehungen müssen in DIESELBE Matrix
 * passen (C(45,6) = 8.145.060, identisch zu AT/HU/BE). Drei Fenster kommen rein:
 *
 *    Ära A   2006-11-08 … 2015-09-02   echtes 6/45          → alle übernehmen
 *    Ära 47  2015-09-05 … 2026-09-04   6/47                 → NUR die Ziehungen,
 *                                                             deren sechs Zahlen
 *                                                             alle ≤ 45 sind
 *    Ära B   ab 2026-09-05             Rückkehr auf 6/45     → alle übernehmen
 *                                      (+ Mo-Ziehung ab 07.09.2026)
 *
 * WARUM die 6/47-Ära mitgefiltert werden DARF (2026-08-27):
 * Bedingt man eine Gleichverteilung über C(47,6) auf das Ereignis „alle sechs
 * Zahlen ≤ 45", ist das Ergebnis exakt gleichverteilt über C(45,6). Es ist also
 * ein Verwerfungsverfahren, kein Nachbilden — die behaltenen Ziehungen sind
 * echte 6/45-Zufallsziehungen. Nachgemessen an den 1.146 Ziehungen der Ära:
 * 75,83 % bleiben übrig (Theorie 75,86 %), Chi-Quadrat der Zahlen 1..45 = 40,61
 * bei 44 Freiheitsgraden (kritisch 60,48) → unauffällig, keine kalten Zahlen.
 * Gewinn: 869 zusätzliche Ziehungen und ein gefülltes Gratis-3-Jahres-Fenster.
 *
 * ⛔ WARUM ES NUR IN DIESE RICHTUNG GEHT — nicht aufweichen:
 * Vor 2006 lief Irland 6/42 (und davor 6/39, 6/36). Dort sind ALLE Ziehungen
 * ≤ 45, ein naiver „≤45"-Filter ließe sie also komplett durch. Aber 43, 44 und
 * 45 können dort NIE vorkommen ⇒ drei künstlich tote Zahlen. Gefiltert werden
 * darf nur von einem GRÖSSEREN Pool nach unten, niemals von einem kleineren
 * nach oben. Deshalb bleibt die Grenze bei ERA_A.from hart.
 *
 * Preis, der offengelegt gehört: 277 Ziehungstermine der 6/47-Ära fehlen in der
 * Zeitleiste. Zahlen-Häufigkeit und Trefferverteilung stimmen, die Angabe
 * „Ziehungen im Zeitraum" liegt für 2015–2026 rund ein Viertel zu niedrig.
 * Der Hinweistext dazu steht in der App (i18n-Schlüssel `sys.note_ie`).
 *
 * Bonusball wird verworfen (ein Pool, Modell 6/45).
 * Täglich: aktuelles Jahr. Backfill: IE_FROM_YEAR=2006 setzen.
 */
const ARCH = (year) => `https://www.lottery.co.uk/irish-lotto/results/archive-${year}`;
const ERA_A  = { from: "2006-11-08", to: "2015-09-02" };   // echtes 6/45
const ERA_47 = { from: "2015-09-05", to: "2026-09-04" };   // 6/47 — nur ≤45 übernehmen
const ERA_B_FROM = "2026-09-05";                            // wieder 6/45
const HI_MAIN = 45, N_MAIN = 6;

export const meta = {
  key: "ie-lotto",
  label: "Irland Lotto 6/45",
  url: ARCH(new Date().getUTCFullYear()),
  kind: "html"
};

// In welchem Fenster liegt das Datum? null = gar nicht übernehmen.
const eraOf = (d) => {
  if (d >= ERA_A.from  && d <= ERA_A.to)  return "A";    // 6/45, alles übernehmen
  if (d >= ERA_47.from && d <= ERA_47.to) return "47";   // 6/47, nur ≤45 übernehmen
  if (d >= ERA_B_FROM)                    return "B";    // 6/45, alles übernehmen
  return null;                                            // 6/42 und älter: raus
};

function isoFromSlug(slug) {
  const m = slug.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function parse(html) {
  const draws = [];
  const parts = html.split(/href="\/irish-lotto\/results-/).slice(1);
  for (const part of parts) {
    const slug = (part.match(/^(\d{2}-\d{2}-\d{4})/) || [])[1];
    const d = slug && isoFromSlug(slug);
    if (!d) continue;
    const era = eraOf(d);
    if (!era) continue;
    const seg = part.slice(0, 2000);
    // irish-ball exakt (nicht irish-bonus-ball) — \b + Wortgrenze reicht nicht, da
    // "irish-bonus-ball" das Teilwort enthält; deshalb auf die Klasse mit Space davor prüfen.
    const re = /class="[^"]*\birish-ball\b[^"]*"[^>]*>(\d{1,2})</g;
    const nums = [];
    let m;
    while ((m = re.exec(seg))) nums.push(parseInt(m[1], 10));
    if (nums.length !== N_MAIN) continue;
    if (new Set(nums).size !== N_MAIN) continue;
    if (!nums.every((n) => n >= 1 && n <= 47)) continue;        // Sicherheitsnetz
    // Ära 47: die Ziehung zählt nur, wenn sie auch im 6/45-Raum liegt.
    // In den Ären A und B ist derselbe Test die Plausibilitätsprüfung.
    if (!nums.every((n) => n <= HI_MAIN)) continue;
    draws.push({ d, n: nums.slice().sort((a, b) => a - b) });
  }
  return draws;
}

export async function fetchDraws({ fetchText }) {
  const nowY = new Date().getUTCFullYear();
  const fromY = process.env.IE_FROM_YEAR ? parseInt(process.env.IE_FROM_YEAR, 10) : nowY;
  const draws = [];
  /* Gruende sammeln statt sie zu verschlucken.
     Vorher hiess es hier `catch { continue }` und `if (r.status !== 200) continue`.
     Damit endeten ein 403, ein Zeitablauf und eine Seite, die sich nicht parsen
     laesst, alle gleich: als leeres Ergebnis, das der Runner nur als
     "0 Ziehungen" melden konnte. Am 2026-08-27 stand deshalb zwei Tage lang
     nicht fest, ob lottery.co.uk die Actions-IP sperrt oder ob der Parser
     danebenliegt -- zwei voellig verschiedene Reparaturen. */
  const probleme = [];
  for (let y = fromY; y <= nowY; y++) {
    let r;
    try { r = await fetchText(ARCH(y)); }
    catch (e) { probleme.push(y + ": " + (e && e.message ? e.message : String(e))); continue; }
    if (r.status !== 200) { probleme.push(y + ": HTTP " + r.status); continue; }
    const d = parse(r.text);
    if (!d.length) probleme.push(y + ": HTTP 200, aber 0 Ziehungen geparst (" + r.bytes + " Bytes)");
    draws.push(...d);
    await new Promise((res) => setTimeout(res, 120));
  }
  if (!draws.length && probleme.length) throw new Error(probleme.join(" \u00b7 "));
  return draws;
}
