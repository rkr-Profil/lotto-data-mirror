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
export function mergeDraws(existing, fresh) {
  const byDate = new Map();
  for (const d of existing) byDate.set(d.d, d);
  let added = 0;
  for (const d of fresh) {
    if (!byDate.has(d.d)) added++;
    byDate.set(d.d, d);
  }
  const merged = [...byDate.values()].sort((a, b) => a.d.localeCompare(b.d));
  return { merged, added };
}

// Erkennt eine HTML-/Block-Antwort (z. B. Homepage statt CSV/JSON) heuristisch.
export function looksLikeHtml(text) {
  const head = text.slice(0, 500).toLowerCase();
  return head.includes("<!doctype html") || head.includes("<html") || head.includes("<head");
}
