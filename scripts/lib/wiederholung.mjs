/**
 * Wiederholungen und Doppelgaenger erkennen (24.10.2026).
 *
 * Fuer jede NEU hinzugekommene Ziehung: Gab es exakt diese Hauptzahlen schon
 *   - in derselben Lotterie (Wiederholung, z. B. Belgien 12.05.2004 = 21.10.2026) oder
 *   - in einer anderen Lotterie (Doppelgaenger, z. B. Ungarn 2017 = Bonoloto 2017)?
 * Beides ist eine kleine Nachricht und wird in der Morgen-Meldung genannt;
 * die Presseseite von AleaMatrix erzaehlt solche Faelle (tools/check-pressezahlen.js
 * im Hauptrepo prueft die Texte).
 *
 * Verglichen werden nur die Hauptzahlen (`n`), sortiert, und nur bei gleicher
 * Anzahl. de-6-49-sz ist dieselbe Ziehung wie de-6-49 und wird nicht als
 * „andere Lotterie" gezaehlt.
 */
const SIG = (n) => n.length + "|" + n.slice().sort((a, b) => a - b).join("-");
const GLEICH = { "de-6-49-sz": "de-6-49" };       // Schwester-Dateien derselben Ziehung
const basis = (k) => GLEICH[k] || k;

/**
 * @param {{key:string,d:string,n:number[]}[]} neu   neu hinzugekommene Ziehungen
 * @param {Record<string,{d:string,n:number[]}[]>} alle  alle Daten NACH dem Merge, je Lotterie
 * @returns {{art:'wiederholung'|'doppelgaenger', key:string, d:string, n:number[], frueher:{key:string,d:string}[]}[]}
 */
export function findeWiederholungen(neu, alle) {
  const idx = new Map();                            // Signatur → [{key,d}]
  for (const [k, a] of Object.entries(alle)) {
    if (GLEICH[k]) continue;                        // Schwester-Datei nicht doppelt
    for (const x of a) {
      const s = SIG(x.n);
      (idx.get(s) || idx.set(s, []).get(s)).push({ key: k, d: x.d });
    }
  }
  const out = [];
  const gesehen = new Set();
  for (const z of neu) {
    const k = basis(z.key);
    const s = SIG(z.n);
    if (gesehen.has(k + "|" + z.d)) continue;       // de-6-49 und -sz melden dieselbe Ziehung nur einmal
    gesehen.add(k + "|" + z.d);
    const andere = (idx.get(s) || []).filter((t) => !(t.key === k && t.d === z.d));
    const selbe = andere.filter((t) => t.key === k && t.d < z.d);
    const fremd = andere.filter((t) => t.key !== k);
    if (selbe.length) out.push({ art: "wiederholung", key: k, d: z.d, n: z.n, frueher: selbe });
    if (fremd.length) out.push({ art: "doppelgaenger", key: k, d: z.d, n: z.n, frueher: fremd });
  }
  return out;
}

/** Zeilen fuer die Telegram-Meldung. */
export function meldezeilen(funde) {
  const dt = (iso) => iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4);
  const zahlen = (n) => n.slice().sort((a, b) => a - b).join(" · ");
  return funde.map((f) => f.art === "wiederholung"
    ? `🎯 Wiederholung! ${f.key} ${dt(f.d)}: ${zahlen(f.n)} — wie am ${f.frueher.map((t) => dt(t.d)).join(", ")}`
    : `🌍 Doppelgänger! ${f.key} ${dt(f.d)}: ${zahlen(f.n)} — wie ${f.frueher.map((t) => t.key + " " + dt(t.d)).join(", ")}`);
}
