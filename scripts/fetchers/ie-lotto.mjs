/**
 * Fetcher: Irland „Lotto" **6/45** — lottery.co.uk Jahresarchive (irish-lotto).
 *
 * ⚠ Irland hat mehrere Formatwechsel. Wir bilden bewusst NUR die 6/45-Zeiträume ab,
 * damit alle Ziehungen in DIESELBE Matrix passen (C(45,6)=8.145.060, identisch zu AT/HU/BE):
 *    Ära A: 2006-11-08 … 2015-09-02   (danach 6/47)
 *    Ära B: ab 2026-09-05             (Rückkehr auf 6/45, Kugeln 46/47 raus; + Mo-Ziehung ab 07.09.2026)
 * Die 6/47-Ära dazwischen wird verworfen — WICHTIG: nicht über „alle Zahlen ≤45" filtern,
 * denn auch 6/47-Ziehungen können zufällig nur Zahlen ≤45 enthalten. Nur Datumsfenster zählen.
 * Bonusball wird verworfen (ein Pool, Modell 6/45).
 *
 * Täglich: aktuelles Jahr. Backfill: IE_FROM_YEAR=2006 setzen.
 */
const ARCH = (year) => `https://www.lottery.co.uk/irish-lotto/results/archive-${year}`;
const ERA_A = { from: "2006-11-08", to: "2015-09-02" };
const ERA_B_FROM = "2026-09-05";
const HI_MAIN = 45, N_MAIN = 6;

export const meta = {
  key: "ie-lotto",
  label: "Irland Lotto 6/45",
  url: ARCH(new Date().getUTCFullYear()),
  kind: "html"
};

const inEra = (d) => (d >= ERA_A.from && d <= ERA_A.to) || d >= ERA_B_FROM;

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
    if (!d || !inEra(d)) continue;
    const seg = part.slice(0, 2000);
    // irish-ball exakt (nicht irish-bonus-ball) — \b + Wortgrenze reicht nicht, da
    // "irish-bonus-ball" das Teilwort enthält; deshalb auf die Klasse mit Space davor prüfen.
    const re = /class="[^"]*\birish-ball\b[^"]*"[^>]*>(\d{1,2})</g;
    const nums = [];
    let m;
    while ((m = re.exec(seg))) nums.push(parseInt(m[1], 10));
    if (nums.length !== N_MAIN) continue;
    if (new Set(nums).size !== N_MAIN) continue;
    if (!nums.every((n) => n >= 1 && n <= HI_MAIN)) continue;   // Sicherheitsnetz
    draws.push({ d, n: nums.slice().sort((a, b) => a - b) });
  }
  return draws;
}

export async function fetchDraws({ fetchText }) {
  const nowY = new Date().getUTCFullYear();
  const fromY = process.env.IE_FROM_YEAR ? parseInt(process.env.IE_FROM_YEAR, 10) : nowY;
  const draws = [];
  for (let y = fromY; y <= nowY; y++) {
    let r;
    try { r = await fetchText(ARCH(y)); } catch { continue; }
    if (r.status !== 200) continue;
    draws.push(...parse(r.text));
    await new Promise((res) => setTimeout(res, 120));
  }
  return draws;
}
