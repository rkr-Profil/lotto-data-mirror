/**
 * Fetcher: EE Vikinglotto 6/48 + 1 Vikingzahl(1..8) — eestiloto.ee JSON-API.
 * Zwei Schritte: (1) GET holt Session-Cookie + csrfToken (hidden input),
 * (2) paginiertes POST /app/ajaxDrawStatistic (10 Draws/Seite) bis leer.
 * Zahlen in results[0].winningNumber (6 Haupt, Ziehungsreihenfolge) + secWinningNumber (Viking).
 * drawDate = Epoch-ms. Datacenter-erreichbar (von US-DC verifiziert).
 * MAXIMUM der Quelle = 255 Draws ab 2021-05-26 (Regeländerung; davor anderes Format). Die API
 * kappt dort hart — leeres/frühes dateFrom und asc/desc liefern alle identisch 255 (geprüft).
 */
import { inRange } from "../lib/util.mjs";

const GET_URL = "https://www.eestiloto.ee/et/results/?game=VIKINGLOTTO";
const POST_URL = "https://www.eestiloto.ee/app/ajaxDrawStatistic";

export const meta = {
  key: "ee-vikinglotto",
  label: "Estland Vikinglotto 6/48 + Viking",
  url: GET_URL,
  kind: "json"
};

export async function fetchDraws({ BROWSER_HEADERS }) {
  // Schritt 1: Cookie + csrfToken
  const getRes = await fetch(GET_URL, { headers: BROWSER_HEADERS });
  const setCookies = typeof getRes.headers.getSetCookie === "function"
    ? getRes.headers.getSetCookie()
    : (getRes.headers.get("set-cookie") ? [getRes.headers.get("set-cookie")] : []);
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  const html = await getRes.text();
  const token = (html.match(/name="csrfToken"\s+value="([^"]+)"/) || [])[1];
  if (!token) throw new Error("csrfToken nicht gefunden");

  // Schritt 2: POST paginiert
  const draws = [];
  for (let page = 1; page <= 80; page++) {
    const body = new URLSearchParams({
      gameTypes: "VIKINGLOTTO", dateFrom: "", dateTo: "", drawLabelFrom: "", drawLabelTo: "",
      pageIndex: String(page), orderBy: "drawDate_desc", sortLabelNumeric: "true", csrfToken: token
    });
    const r = await fetch(POST_URL, {
      method: "POST",
      headers: { ...BROWSER_HEADERS, "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookie },
      body
    });
    if (!r.ok) throw new Error(`POST HTTP ${r.status} (Seite ${page})`);
    const j = await r.json();
    const pageDraws = Array.isArray(j.draws) ? j.draws : [];
    if (pageDraws.length === 0) break;
    for (const d of pageDraws) {
      const res = d.results && d.results[0];
      if (!res || !res.winningNumber) continue;
      const main = String(res.winningNumber).split(",").map(Number);
      if (main.length !== 6 || !inRange(main, 6, 48)) continue;
      const viking = Number(res.secWinningNumber);
      if (!Number.isFinite(viking) || viking < 1 || viking > 8) continue;
      const ms = Number(d.drawDate);
      if (!Number.isFinite(ms) || ms <= 0) continue;
      let date;
      try { date = new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Tallinn" }); }
      catch { date = new Date(ms).toISOString().slice(0, 10); }
      draws.push({ d: date, n: main.slice().sort((a, b) => a - b), e: [viking] });
    }
  }
  return draws;
}
