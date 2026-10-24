/**
 * Fetcher: HU Hatoslottó 6/45 — bet.szerencsejatek.hu/cmsfiles/hatos.csv
 *
 * Quelle hat ZWEI Format-Epochen (an 1830 echten Zeilen 2026-07 verifiziert):
 *   2004–2026: Spalte 3 = Datum "YYYY.MM.DD."; Zahlen teils 6, teils +1 Pótszám;
 *              viele Zeilen enden mit ';'.
 *   1988–2004: Spalte 3 LEER → Datum aus Jahr(0)+ISO-KW(1)+Wochentag(2) rekonstruiert.
 *              Ab 1994 lueckenlos ISO (passt Woche fuer Woche auf 2004/45 = 07.11.2004).
 *              Nennt ein Jahr eine Woche 53, die es nach ISO nicht gibt (1993), zaehlt
 *              es ab der Woche mit dem 1. Januar — sonst fielen 1993/53 und 1994/1 auf
 *              denselben Samstag und eine Ziehung ginge verloren (BEFUNDE Nr. 29).
 * Hauptzahlen = ERSTE 6 des Trailing-Runs reiner Ints in 1..45 (7. = Pótszám, verworfen).
 */
import { parseDottedYmd, huWeekDate, isoHat53, inRange } from "../lib/util.mjs";

const N_MAIN = 6, HI_MAIN = 45;

export const meta = {
  key: "hu-hatos",
  label: "Ungarn Hatoslottó 6/45",
  url: "https://bet.szerencsejatek.hu/cmsfiles/hatos.csv",
  kind: "csv"
};

export function parse(csvText) {
  const draws = [];
  const clean = csvText.replace(/^﻿/, ""); // BOM
  const zeilen = clean.split(/\r?\n/);
  const jan1Jahre = new Set();
  for (const line of zeilen) {
    const c = line.split(";");
    if ((c[3] || "").trim() === "" && parseInt(c[1], 10) === 53 && !isoHat53(parseInt(c[0], 10))) jan1Jahre.add(c[0].trim());
  }
  for (const line of zeilen) {
    if (!line.trim()) continue;
    const row = line.split(";").map((c) => c.trim());
    while (row.length && row[row.length - 1] === "") row.pop(); // Trailing-';'
    if (row.length < 4 + N_MAIN) continue;

    let date = parseDottedYmd(row[3]);
    if (!date) date = huWeekDate(row[0], row[1], row[2], { jan1Woche: jan1Jahre.has(row[0].trim()) });
    if (!date) continue;

    const run = [];
    for (let i = row.length - 1; i >= 0; i--) {
      const c = row[i];
      if (/^\d+$/.test(c)) { const v = parseInt(c, 10); if (v >= 1 && v <= HI_MAIN) { run.unshift(v); continue; } }
      break;
    }
    if (run.length < N_MAIN) continue;
    const nums = run.slice(0, N_MAIN);
    if (!inRange(nums, N_MAIN, HI_MAIN)) continue;
    draws.push({ d: date, n: nums.slice().sort((a, b) => a - b) });
  }
  return draws;
}
