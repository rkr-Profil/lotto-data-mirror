/**
 * Diagnose eines gescheiterten Abrufs — Schicht für Schicht, damit die
 * Meldung auf dem Handy die URSACHE nennt und nicht nur „fetch failed".
 *
 *   node scripts/lib/diagnose.mjs https://www.lottery.co.uk/lotto/results/archive-2026
 *
 * Fünf Fragen, in der Reihenfolge, in der eine Verbindung entsteht:
 *   1. DNS      — löst der Name auf? (ENOTFOUND = Name kaputt oder DNS gesperrt)
 *   2. TCP 443  — nimmt der Host die Verbindung an? Zeitablauf ohne jede
 *                 Antwort = das SYN wird still verworfen (Sperre auf Netzebene,
 *                 typisch für Rechenzentrums-Adressbereiche). ECONNREFUSED =
 *                 Port zu. ECONNRESET = jemand legt sofort auf.
 *   3. TLS      — kommt der Handshake zustande? CERT_* = Zertifikat, sonst
 *                 meist ein Abwehrdienst, der auf TLS-Ebene abbricht.
 *   4. HTTP     — antwortet der Server, und womit? 403/429/503 = er weist
 *                 gezielt ab (Bot-Schutz, cf-mitigated verrät Cloudflare).
 *                 200 = Verbindung in Ordnung, der Fehler liegt im INHALT.
 *   5. Kontrolle — erreicht der Runner überhaupt das Netz? Ein neutraler
 *                 Host (example.com) trennt „Quelle sperrt uns" von
 *                 „Runner ist offline".
 *
 * Die Deutung am Ende ist eine REGEL, keine Behauptung: sie sagt, welche
 * Kombination der fünf Antworten welche Ursache nahelegt. Wer die Rohwerte
 * lesen will, hat sie in derselben Zeile.
 *
 * Kostet im Fehlerfall höchstens ~25 s (jeder Schritt hart begrenzt) und
 * läuft NUR, wenn ein Pflicht-System nach allen Versuchen gescheitert ist.
 */
import { promises as dns } from "node:dns";
import net from "node:net";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

const TCP_MS = 5000, TLS_MS = 8000, HTTP_MS = 10000, CTRL_MS = 6000;
const KONTROLLE = "https://www.example.com/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const ms = (t0) => (Date.now() - t0) + " ms";

async function schrittDns(host) {
  const t0 = Date.now();
  try {
    const a = await dns.lookup(host, { all: true });
    const adressen = a.map((x) => x.address);
    return { ok: true, adressen, text: "DNS " + adressen.slice(0, 2).join("/") + (adressen.length > 2 ? "+" + (adressen.length - 2) : "") + " (" + ms(t0) + ")" };
  } catch (e) {
    return { ok: false, code: e.code || e.message, text: "DNS " + (e.code || e.message) };
  }
}

function schrittTcp(adresse, port) {
  return new Promise((res) => {
    const t0 = Date.now();
    let fertig = false;
    const s = net.connect({ host: adresse, port });
    const ende = (r) => { if (fertig) return; fertig = true; try { s.destroy(); } catch {} res(Object.assign({ dauer: Date.now() - t0 }, r)); };
    s.setTimeout(TCP_MS, () => ende({ ok: false, code: "TIMEOUT", text: "TCP " + port + " Zeitablauf " + (TCP_MS / 1000) + " s (keine Antwort)" }));
    s.once("connect", () => ende({ ok: true, text: "TCP " + port + " offen (" + ms(t0) + ")" }));
    s.once("error", (e) => ende({ ok: false, code: e.code || "ERR", text: "TCP " + port + " " + (e.code || e.message) }));
  });
}

function schrittTls(adresse, host) {
  return new Promise((res) => {
    const t0 = Date.now();
    let fertig = false;
    const s = tls.connect({ host: adresse, port: 443, servername: host, rejectUnauthorized: true });
    const ende = (r) => { if (fertig) return; fertig = true; try { s.destroy(); } catch {} res(r); };
    s.setTimeout(TLS_MS, () => ende({ ok: false, code: "TIMEOUT", text: "TLS Zeitablauf " + (TLS_MS / 1000) + " s" }));
    s.once("secureConnect", () => {
      let aussteller = "";
      try { aussteller = (s.getPeerCertificate() || {}).issuer?.O || ""; } catch {}
      ende({ ok: true, text: "TLS ok" + (aussteller ? " [" + aussteller.slice(0, 18) + "]" : "") + " (" + ms(t0) + ")" });
    });
    s.once("error", (e) => ende({ ok: false, code: e.code || "ERR", text: "TLS " + (e.code || e.message) }));
  });
}

async function schrittHttp(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual", headers: { "User-Agent": UA, "Accept": "*/*" }, signal: AbortSignal.timeout(HTTP_MS) });
    const server = r.headers.get("server") || "";
    const cf = r.headers.get("cf-mitigated") || "";
    const kennz = [server ? "server=" + server.slice(0, 14) : "", cf ? "cf-mitigated=" + cf : ""].filter(Boolean).join(" ");
    return { ok: true, status: r.status, cf, text: "HTTP " + r.status + (kennz ? " " + kennz : "") + " (" + ms(t0) + ")" };
  } catch (e) {
    const c = e && e.cause;
    const code = (c && (c.code || c.errno)) || e.code || e.name || "ERR";
    return { ok: false, code, text: "HTTP " + code };
  }
}

async function schrittKontrolle() {
  const t0 = Date.now();
  try {
    const r = await fetch(KONTROLLE, { method: "HEAD", signal: AbortSignal.timeout(CTRL_MS) });
    return { ok: r.status < 500, status: r.status, text: "Kontrolle example.com " + r.status + " (" + ms(t0) + ")" };
  } catch (e) {
    const c = e && e.cause;
    return { ok: false, text: "Kontrolle example.com " + ((c && c.code) || e.code || e.name || "fehlgeschlagen") };
  }
}

/* Die Regel: aus den fünf Antworten eine Ursache. */
function deutung(d, t, s, h, k) {
  if (!d.ok) return k.ok ? "Name nicht auflösbar – DNS-Eintrag fehlt oder wird gesperrt; das Netz selbst geht."
                        : "Runner ohne Netz (auch die Kontrolle scheitert) – nicht die Quelle.";
  if (!t.ok) {
    if (t.code === "TIMEOUT") return k.ok
      ? "Der Host verwirft den Verbindungsaufbau STILL – keine Antwort auf Port 443, während das Netz geht. Sperre auf Netzebene gegen die Runner-Adresse; die Quelle selbst ist in Ordnung."
      : "Auch die Kontrolle scheitert – der Runner hat kein Netz. Nicht die Quelle.";
    if (t.code === "ECONNREFUSED") return "Port 443 wird abgewiesen – der Host nimmt keine Verbindungen an (Server unten oder Firewall mit Abweisung).";
    if (t.code === "ECONNRESET") return "Der Host legt sofort auf – aktive Abwehr auf Netzebene.";
    return "Verbindungsaufbau scheitert (" + t.code + ").";
  }
  if (!s.ok) return s.code === "TIMEOUT"
    ? "TCP offen, aber der TLS-Handshake bleibt stehen – ein Abwehrdienst bricht auf TLS-Ebene ab."
    : "TLS scheitert (" + s.code + ") – Zertifikat oder TLS-Sperre, kein Netzproblem.";
  if (!h.ok) return "Verbindung steht, die Anfrage selbst bricht ab (" + h.code + ") – Zeitablauf nach dem Handshake, meist ein Abwehrdienst, der die Antwort verzögert.";
  if (h.status === 403 || h.status === 429 || h.status === 503) return "Der Server antwortet und weist gezielt ab (HTTP " + h.status + (h.cf ? ", Cloudflare-Challenge" : "") + ") – Bot-Schutz/Sperre auf Anwendungsebene gegen die Runner-Adresse.";
  if (h.status >= 300 && h.status < 400) return "Der Server leitet um (HTTP " + h.status + ") – die Adresse hat sich geändert, der Abruf folgt der Umleitung nicht wie erwartet.";
  if (h.status >= 200 && h.status < 300) return "Verbindung und Antwort in Ordnung (HTTP " + h.status + ") – der Fehler liegt im INHALT: Seite geändert, Parser findet nichts, oder ein Zwischenfall nur während des Laufs.";
  return "Server antwortet mit HTTP " + h.status + ".";
}

/**
 * diagnose(url) → { zeile, deutung, schritte }
 * zeile = Rohwerte in einer Zeile · deutung = Klartext-Ursache.
 * Wirft nie — jeder Teilschritt fängt seine Fehler selbst.
 */
export async function diagnose(url) {
  let host = "";
  try { host = new URL(url).host; } catch { return { zeile: "Diagnose: keine gültige URL", deutung: "", schritte: null }; }
  const d = await schrittDns(host);
  const adresse = d.ok ? d.adressen[0] : null;
  const t = adresse ? await schrittTcp(adresse, 443) : { ok: false, code: "DNS", text: "TCP –" };
  const s = t.ok ? await schrittTls(adresse, host) : { ok: false, code: "TCP", text: "TLS –" };
  const h = s.ok ? await schrittHttp(url) : { ok: false, code: "TLS", text: "HTTP –" };
  const k = await schrittKontrolle();
  const zeile = [d.text, t.text, s.text, h.text, k.text].join(" · ");
  return { zeile, deutung: deutung(d, t, s, h, k), schritte: { dns: d, tcp: t, tls: s, http: h, kontrolle: k } };
}

/* Direkt aufrufbar: node scripts/lib/diagnose.mjs <url> */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.argv[2];
  if (!url) { console.error("Aufruf: node scripts/lib/diagnose.mjs <url>"); process.exit(2); }
  const r = await diagnose(url);
  console.log(r.zeile);
  console.log("→ " + r.deutung);
}
