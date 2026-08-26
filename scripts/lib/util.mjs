/**
 * Geteilte Parser-Utils für alle Mirror-Fetcher.
 * Ausgabeformat je Ziehung: { d:"YYYY-MM-DD", n:[...sorted], e?:[...sorted] }
 * (identisch zum Format, das die Lucky-Space-App in data/*.json erwartet).
 */

export const isInt = (s) => /^\d+$/.test(String(s).trim());

export function parseInts(cells) {
  const out = [];
  for (const c of cells) {
    const t = String(c).trim();
    if (t === "" || !/^\d+$/.test(t)) return null;
    out.push(parseInt(t, 10));
  }
  return out;
}

export function inRange(nums, k, hi) {
  if (nums.length !== k) return false;
  if (new Set(nums).size !== k) return false;
  return nums.every((n) => n >= 1 && n <= hi);
}

// "YYYY-MM-DD…" (ISO, daowa89) → normalisiertes "YYYY-MM-DD" (nimmt nur den Datumsteil).
export function parseIsoDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * daowa89/lottery-archive — Header + Komma-getrennt + ISO-Datum:
 *   date,n1..nMain[,extra1..extraX]
 * DE 6/49:  date,n1..n6,superzahl   → superzahl verworfen (Einzel-Pool) → {nMain:6,hiMain:49}
 * EuroMil.: date,n1..n5,s1,s2       → Sterne als Extra-Pool → {nMain:5,hiMain:50,nExtra:2,hiExtra:12}
 */
export function daowaCsv(csvText, { nMain, hiMain, nExtra = 0, hiExtra = 0 }) {
  const draws = [];
  for (const line of csvText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = line.split(",").map((c) => c.trim());
    if (row[0].toLowerCase() === "date") continue; // Header
    const date = parseIsoDate(row[0]);
    if (!date) continue;
    const nums = parseInts(row.slice(1, 1 + nMain));
    if (!nums || !inRange(nums, nMain, hiMain)) continue;
    const draw = { d: date, n: nums.slice().sort((a, b) => a - b) };
    if (nExtra && hiExtra) {
      const ex = parseInts(row.slice(1 + nMain, 1 + nMain + nExtra));
      if (!ex || !inRange(ex, nExtra, hiExtra)) continue; // Zwei-Pool braucht gültige Extras
      draw.e = ex.slice().sort((a, b) => a - b);
    }
    draws.push(draw);
  }
  return draws;
}

// "DD.MM." (win2day, ohne Jahr) + Jahr → ISO "YYYY-MM-DD"
export function parseDayMonth(dm, year) {
  const s = String(dm).trim().replace(/\.$/, "");
  const parts = s.split(".");
  if (parts.length < 2) return null;
  const d = parseInt(parts[0], 10), mo = parseInt(parts[1], 10);
  if (isNaN(d) || isNaN(mo) || d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * win2day Jahres-CSV (AT 6/45): Datum;Reihenfolge;Zahl1..Zahl6;ZZ;Zusatzzahl;…
 * Nur Zeilen mit Reihenfolge === "aufsteigend". Deckt nur EIN Jahr ab → Baseline
 * (bestehende Vollhistorie in data/at-6-45.json) liefert die Altdaten, Merge hält aktuell.
 */
/**
 * 6er-Gewinnerzahl aus einer win2day-Zeile (2026-07-30).
 * Die Klasse steht als Label "6er", der Wert in der Zelle daneben. Statt einer Zahl
 * kann dort ein Jackpot-Marker stehen: JP, DJP, 3JP … 7JP — alle bedeuten
 * "kein Sechser" (der Topf rollt weiter), also 0.
 * Rückgabe null = keine belastbare Angabe; dann bleibt das Feld weg, statt eine 0
 * zu erfinden (eine falsche 0 würde eine Jackpot-Serie vortäuschen).
 */
function win2daySechser(row) {
  const i = row.indexOf("6er");
  if (i < 0 || i + 1 >= row.length) return null;
  const v = (row[i + 1] || "").trim();
  if (/^(?:D|\d)?JP$/.test(v)) return 0;
  const t = v.replace(/[.\s]/g, "");
  return /^\d+$/.test(t) ? parseInt(t, 10) : null;
}

export function win2dayYearly(csvText, year, { nMain = 6, hiMain = 45 } = {}) {
  const draws = [];
  for (const line of csvText.split(/\r?\n/)) {
    const row = line.split(";").map((c) => c.trim());
    if (row.length < 2 + nMain) continue;
    if (row[1].toLowerCase() !== "aufsteigend") continue;
    const date = parseDayMonth(row[0], year);
    if (!date) continue;
    const nums = parseInts(row.slice(2, 2 + nMain));
    if (!nums || !inRange(nums, nMain, hiMain)) continue;
    const draw = { d: date, n: nums.slice().sort((a, b) => a - b) };
    // j = Anzahl der Sechser-Gewinner (0 = keiner). Nur AT 6/45 nutzt diesen Parser;
    // andere Systeme bleiben unberührt. Die App leitet daraus die Jackpot-Ziehungen ab
    // (erster Sechser nach einer oder mehreren Leerziehungen).
    const j = win2daySechser(row);
    if (j !== null) draw.j = j;
    draws.push(draw);
  }
  return draws;
}

/**
 * PL Lotto (wynikilotto.net.pl): nr,DD.MM.YYYY,n1..n6 (Vollarchiv, kein Header).
 */
export function plLotto(csvText, { nMain = 6, hiMain = 49 } = {}) {
  const draws = [];
  for (const line of csvText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = line.split(",").map((c) => c.trim());
    if (row.length < 2 + nMain) continue;
    const date = parseDottedDmy(row[1]);
    if (!date) continue;
    const nums = parseInts(row.slice(2, 2 + nMain));
    if (!nums || !inRange(nums, nMain, hiMain)) continue;
    draws.push({ d: date, n: nums.slice().sort((a, b) => a - b) });
  }
  return draws;
}

/**
 * GR OPAP (api.opap.gr): JSON-Array (last/N) ODER {content:[...]} (draw-date).
 * Nur status="results". winningNumbers.list = Haupt, .bonus = Joker. drawTime = Epoch-ms.
 * Tzoker 5/45 + 1 Joker(1..20).
 */
export function opapJson(text, { nMain = 5, hiMain = 45, nExtra = 1, hiExtra = 20 } = {}) {
  const draws = [];
  let parsed;
  try { parsed = JSON.parse(text); } catch { return []; }
  const arr = Array.isArray(parsed) ? parsed
    : (parsed && Array.isArray(parsed.content) ? parsed.content : null);
  if (!arr) return [];
  for (const d of arr) {
    if (!d || d.status !== "results") continue;
    const wn = d.winningNumbers;
    if (!wn || !Array.isArray(wn.list)) continue;
    const nums = wn.list.map(Number);
    if (nums.some((n) => !Number.isFinite(n)) || !inRange(nums, nMain, hiMain)) continue;
    const n = Number(d.drawTime);
    if (!Number.isFinite(n) || n <= 0) continue;
    let date;
    try { date = new Date(n).toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" }); } catch { continue; }
    const draw = { d: date, n: nums.slice().sort((a, b) => a - b) };
    if (nExtra && hiExtra) {
      const bonus = Array.isArray(wn.bonus) ? wn.bonus.map(Number) : [];
      if (bonus.length !== nExtra || !inRange(bonus, nExtra, hiExtra)) continue;
      draw.e = bonus.slice().sort((a, b) => a - b);
    }
    draws.push(draw);
  }
  return draws;
}

// "D/MM/YYYY" (ES lotoideas, Tag teils 1-stellig) → ISO
export function parseSlashDmy(s) {
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * ES lotoideas Google-Sheets-CSV: FECHA,z1..zN,COMP.,R.[,JOKER]
 * Datum Spalte 0 (D/MM/YYYY), die nMain Hauptzahlen sind Spalten 1..nMain; Rest ignorieren.
 * La Primitiva/BonoLoto: 6/49. El Gordo: 5/54.
 */
export function esGoogleSheet(csvText, { nMain, hiMain }) {
  const draws = [];
  for (const line of csvText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = line.split(",").map((c) => c.trim());
    if (row[0].toUpperCase().startsWith("FECHA")) continue; // Header
    const date = parseSlashDmy(row[0]);
    if (!date) continue;
    const nums = parseInts(row.slice(1, 1 + nMain));
    if (!nums || !inRange(nums, nMain, hiMain)) continue;
    draws.push({ d: date, n: nums.slice().sort((a, b) => a - b) });
  }
  return draws;
}

/**
 * LV Latloto — HTML-Archiv (server-gerendert): pro Ziehung Datum "DD.MM.YYYY" gefolgt von
 * "numbered-items-latloto" mit 5 <span>Zahl</span> (Separator "+" + .darker-Bonusball danach).
 * Wir nehmen die ersten 5 Zahlen (der "+"-Separator ist keine Ziffer, fällt raus); Bonus verworfen.
 * Aktuelles Spiel: latloto38 (5/38). Legacy latloto (5/35) endete 2024-11-09.
 */
export function lvLatloto(html, hiMain = 38) {
  const draws = [];
  const parts = html.split(/(\d{2}\.\d{2}\.\d{4})/); // [pre, date1, chunk1, date2, chunk2, …]
  for (let i = 1; i < parts.length; i += 2) {
    const dm = parts[i];
    const chunk = parts[i + 1] || "";
    const idx = chunk.indexOf("numbered-items-latloto");
    if (idx < 0) continue;
    const nums = [...chunk.slice(idx).matchAll(/<span[^>]*>(\d{1,2})<\/span>/g)].map((m) => +m[1]).slice(0, 5);
    if (nums.length !== 5 || !inRange(nums, 5, hiMain)) continue;
    const [d, mo, y] = dm.split(".");
    draws.push({ d: `${y}-${mo}-${d}`, n: nums.slice().sort((a, b) => a - b) });
  }
  return draws;
}

/**
 * BE Lotto 6/45 — Nationale Loterij APIM (apim.prd.natlot.be) JSON.
 * draws[]: .drawTime = Epoch-ms; .results[] mit drawType "normal" (6 Hauptzahlen, .primary
 * als Strings 1..45) und "bonus" (1 Bonusball). Wir nehmen die 6 Hauptzahlen (Bonus verworfen,
 * da aus demselben Pool → passt nicht ins Extra-Pool-Modell).
 */
export function beJson(text) {
  const draws = [];
  let parsed;
  try { parsed = JSON.parse(text); } catch { return []; }
  const arr = Array.isArray(parsed?.draws) ? parsed.draws : (Array.isArray(parsed) ? parsed : []);
  for (const d of arr) {
    const results = Array.isArray(d?.results) ? d.results : [];
    const normal = results.find((r) => r.drawType === "normal");
    if (!normal || !Array.isArray(normal.primary)) continue;
    const nums = normal.primary.map(Number);
    if (nums.length !== 6 || !inRange(nums, 6, 45)) continue;
    const ms = Number(d.drawTime);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    draws.push({ d: new Date(ms).toISOString().slice(0, 10), n: nums.slice().sort((a, b) => a - b) });
  }
  return draws;
}

/**
 * NL Lotto 6/45 — nederlandseloterij.nl results/{date}-JSON. Objekt mit isXlDraw:false =
 * reguläre Ziehung: winningNumbers.numbers (6 Zahlen 1..45) + draw.drawDate. Reservezahl verworfen.
 */
export function nlResult(json) {
  const results = Array.isArray(json?.results) ? json.results : [];
  const std = results.find((r) => r && r.isXlDraw === false);
  if (!std || !std.winningNumbers) return null;
  const nums = (std.winningNumbers.numbers || []).map(Number);
  if (nums.length !== 6 || !inRange(nums, 6, 45)) return null;
  const date = std.draw && std.draw.drawDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return null;
  return { d: date, n: nums.slice().sort((a, b) => a - b) };
}

/**
 * PT Totoloto 5/49 + 1 Número da Sorte(1..13) — jogossantacasa.pt HTML (server-gerendert).
 * Datum aus "Data do Sorteio - dd/mm/yyyy", Chave aus erstem "<li>N N N N N + N</li>".
 */
export function ptTotoloto(html) {
  const dm = html.match(/Data do Sorteio\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dm) return null;
  const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
  const nm = html.match(/<li>\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\+\s*(\d+)\s*<\/li>/);
  if (!nm) return null;
  const nums = [nm[1], nm[2], nm[3], nm[4], nm[5]].map(Number);
  const sorte = Number(nm[6]);
  if (!inRange(nums, 5, 49) || sorte < 1 || sorte > 13) return null;
  return { d: date, n: nums.slice().sort((a, b) => a - b), e: [sorte] };
}

// "YYYY.MM.DD." (HU) → ISO
export function parseDottedYmd(s) {
  if (!s) return null;
  const m = String(s).trim().replace(/\.$/, "").match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (!m) return null;
  const mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// "DD.MM.YYYY" → ISO
export function parseDottedDmy(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Ungar. Wochentagsnamen → ISO-Wochentag (Mo=1 … So=7)
export const HU_DOW = {
  "Hétfő": 1, "Kedd": 2, "Szerda": 3, "Csütörtök": 4, "Péntek": 5, "Szombat": 6, "Vasárnap": 7
};

// Frühhistorie ohne Datumsfeld → aus Jahr + ISO-KW + Wochentag ableiten.
export function huWeekDate(yearCell, weekCell, dayCell) {
  const y = parseInt(yearCell, 10);
  const w = parseInt(weekCell, 10);
  const dow = HU_DOW[String(dayCell).trim()];
  if (!Number.isFinite(y) || y < 1988 || y > 2100) return null;
  if (!Number.isFinite(w) || w < 1 || w > 53 || !dow) return null;
  // ISO-Woche 1 = die Woche, die den 4. Januar enthält; Montag = Wochenanfang.
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4dow = jan4.getUTCDay() || 7;
  const week1Mon = jan4.getTime() - (jan4dow - 1) * 86400000;
  return new Date(week1Mon + ((w - 1) * 7 + (dow - 1)) * 86400000).toISOString().slice(0, 10);
}

// Merge: bestehende (committete) Draws + frische; nach Datum keyen, sortieren.
//
// Zusätzlich zur Datums-Deduplizierung eine Absicherung gegen versetzte Dubletten:
// Bei Quellen mit REKONSTRUIERTEM Datum (HU: aus Jahr+KW+Wochentag) kann dieselbe
// Ziehung mit leicht abweichendem Datum entstehen, wenn Baseline und Fetcher
// Veikkaus draw-results by-day JSON (Array) → Draws. Jedes Item: results[0].primary (Haupt),
// results[0].secondary (Zusatz/Sterne), drawTime = Epoch-ms. Genutzt für EuroJackpot (via
// Veikkaus-EJACKPOT) und ggf. FI Lotto. addonDraws (Jokeri) wird ignoriert (nur .results gelesen).
export function veikkausByDay(jsonText, { nMain, hiMain, nExtra = 0, hiExtra = 0, tz = "Europe/Helsinki" }) {
  let arr; try { arr = JSON.parse(jsonText); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const draws = [];
  for (const dr of arr) {
    const res = dr && Array.isArray(dr.results) ? dr.results[0] : null;
    if (!res || !Array.isArray(res.primary)) continue;
    const nums = parseInts(res.primary);
    if (!nums || !inRange(nums, nMain, hiMain)) continue;
    const ms = Number(dr.drawTime);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    let date;
    try { date = new Date(ms).toLocaleDateString("sv-SE", { timeZone: tz }); }
    catch { date = new Date(ms).toISOString().slice(0, 10); }
    const draw = { d: date, n: nums.slice().sort((a, b) => a - b) };
    if (nExtra && hiExtra) {
      const ex = parseInts(res.secondary || []);
      if (!ex || !inRange(ex, nExtra, hiExtra)) continue;
      draw.e = ex.slice().sort((a, b) => a - b);
    }
    draws.push(draw);
  }
  return draws;
}

// ponturi.ro Detailseite (RO Loto 6/49) → 6 Hauptzahlen. Der Fließtext nennt sie sauber:
// „Numerele extrase au fost 42, 8, 6, 27, 2, 31." (die Archiv-Übersicht konkateniert sie — daher Detail).
export function ponturiDetail(html, { nMain = 6, hiMain = 49 } = {}) {
  const m = String(html).match(/Numerele extrase[^0-9]{0,40}?([0-9]{1,2}(?:\s*,\s*[0-9]{1,2}){4,6})/i);
  if (!m) return null;
  const nums = m[1].split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
  if (!inRange(nums, nMain, hiMain)) return null;
  return nums.slice().sort((a, b) => a - b);
}

// verschiedene Wochentags-Konventionen verwenden (Sonntag vs. Montag). Der reine
// Datums-Key ließ dann BEIDE stehen — am 2026-07-20 blähte das HU von 1829 auf
// 2481 auf (652 Phantom-Dubletten). Sechs identische 6/45-Zahlen innerhalb von
// 7 Tagen sind statistisch dieselbe Ziehung, nie ein Zufall → wir entfernen sie.
// Schlüssel = Datum + optionale Rundennummer. Hintergrund (2026-08-26): das UK-Lotto zieht
// seit 2026-06-10 ZWEI Runden pro Abend. Mit reinem Datums-Key hätte Runde 2 die Runde 1
// still überschrieben. Systeme ohne `r` verhalten sich unverändert (Key = nur das Datum).
const drawKey = (d) => (d.r ? `${d.d}#${d.r}` : d.d);

export function mergeDraws(existing, fresh) {
  const byDate = new Map();
  for (const d of existing) byDate.set(drawKey(d), d);
  let added = 0;
  for (const d of fresh) {
    const k = drawKey(d);
    if (!byDate.has(k)) added++;
    byDate.set(k, d);
  }
  // Sekundär nach Runde sortieren, damit Runde 1 vor Runde 2 desselben Abends steht.
  let merged = [...byDate.values()].sort((a, b) => a.d.localeCompare(b.d) || ((a.r || 0) - (b.r || 0)));

  // Versetzte Dubletten einsammeln: gleiche Signatur, Datum ≤ 7 Tage auseinander.
  // Behalten wird der frühere Eintrag, der spätere fällt weg.
  // Signatur = Hauptzahlen UND Zusatzzahlen (e). Nur die Hauptzahlen zu vergleichen
  // wäre bei Bonus-Systemen (EuroMillionen/EuroJackpot/GR/EE/DE-SZ/PT) unsauber:
  // zwei echte Ziehungen binnen 7 Tagen mit gleichen 5 Haupt-, aber anderen
  // Zusatzzahlen würden fälschlich als Dublette gedroppt. Die realen versetzten
  // Dubletten (HU-Rekonstruktion, euromillions 2017-08, gr-tzoker 2004-01) sind
  // in ALLEN Feldern identisch → die härtere Signatur fängt sie weiterhin.
  const sig = (d) => (d.n || []).join(",") + "|" + (d.e || []).join(",");
  const dropped = [];
  const clean = [];
  for (const d of merged) {
    const prev = clean.length ? clean[clean.length - 1] : null;
    if (prev && sig(prev) === sig(d) && sig(d) !== "") {
      const days = Math.abs(new Date(d.d) - new Date(prev.d)) / 86400000;
      if (days <= 7) { dropped.push(d.d); continue; }
    }
    clean.push(d);
  }
  merged = clean;

  return { merged, added, dropped: dropped.length, droppedDates: dropped };
}

// Erkennt eine HTML-/Block-Antwort (z. B. Homepage statt CSV/JSON) heuristisch.
export function looksLikeHtml(text) {
  const head = text.slice(0, 500).toLowerCase();
  return head.includes("<!doctype html") || head.includes("<html") || head.includes("<head");
}
