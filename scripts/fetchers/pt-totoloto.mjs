/**
 * Fetcher: PT Totoloto 5/49 + 1 Número da Sorte — jogossantacasa.pt (HTML, server-gerendert).
 * GET liefert die neueste Ziehung; das <select name="selectContest"> listet das aktuelle
 * Fenster (~laufendes Jahr) — je Option ein POST holt deren Ziehung. Tiefes Alt-Archiv gibt
 * die Quelle nicht her → Historie wächst ab jetzt durch den akkumulierenden Merge.
 */
import { ptTotoloto } from "../lib/util.mjs";

const URL = "https://www.jogossantacasa.pt/web/SCCartazResult/totolotoNew";

export const meta = {
  key: "pt-totoloto",
  label: "Portugal Totoloto 5/49 + Sorte",
  url: URL,
  kind: "html"
};

export async function fetchDraws({ fetchText, BROWSER_HEADERS }) {
  const home = await fetchText(URL);
  if (home.status !== 200) return [];
  const draws = [];
  const latest = ptTotoloto(home.text);
  if (latest) draws.push(latest);
  const ids = [...home.text.matchAll(/<option value="([0-9.]+)"/g)].map((m) => m[1]);
  for (const id of ids) {
    try {
      const r = await fetch(URL, {
        method: "POST",
        headers: { ...BROWSER_HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ selectContest: id })
      });
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      const d = ptTotoloto(new TextDecoder("utf-8", { fatal: false }).decode(buf));
      if (d) draws.push(d);
    } catch { /* skip */ }
  }
  return draws;
}
