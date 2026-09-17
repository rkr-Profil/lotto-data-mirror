# -*- coding: utf-8 -*-
"""
Pruefung des EuroMillionen-Bestands gegen die win2day-Dateien (17.09.2026).

  python scripts/verify-euromillions-win2day.py <ordner mit den CSVs>

Dateien (Download-Seite https://www.win2day.at/lotterie/euromillionen/euromillionen-statistik-zahlen-ergebnisse-download):
  https://statics.win2day.at/media-nopagespeed/euromillionen-ergebnisse-2004-2017.csv
  https://statics.win2day.at/media/NN_W2D_STAT_EUML_{JAHR}.csv   (2017 bis heute)
Ergebnis 17.09.2026: 1.980 Ziehungen in den Dateien, 0 Widersprueche zum Bestand; das Drittarchiv
hatte 5 Ziehungen weniger (20.11.2009 -- in der Datei als "2099" --, 03.01.2014, 24.10.2014,
02.01.2015, 01.01.2016); 06.08.2017 ist in der Gesamtdatei eine Dublette des 04.08.2017.
"""
import io, re, json, glob, os, collections, sys
D = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + os.sep
out = {}   # iso -> (n5, e2, quelle)
dup = []
def put(d, n, e, q):
    n = sorted(n); e = sorted(e)
    if not (len(n) == 5 and len(set(n)) == 5 and all(1 <= x <= 50 for x in n)): print('ungueltig', d, n, q); return
    if not (len(e) == 2 and len(set(e)) == 2 and all(1 <= x <= 12 for x in e)): print('ungueltig Sterne', d, e, q); return
    if d in out and out[d][:2] != (n, e): dup.append((d, out[d], (n, e, q)))
    out[d] = (n, e, q)

# A) Jahresdateien: "Fr. 02.01.2026;8;27;42;44;46;1;10;..."
for f in sorted(glob.glob(D + '/NN_W2D_STAT_EUML_*.csv')):
    for line in io.open(f, encoding='latin-1'):
        c = [x.strip() for x in line.split(';')]
        m = re.match(r'^[A-Za-z]{2}\.?\s*(\d{2})\.(\d{2})\.(\d{4})$', c[0]) if c else None
        if not m or len(c) < 8: continue
        d = '%s-%s-%s' % (m.group(3), m.group(2), m.group(1))
        try: n = [int(x) for x in c[1:6]]; e = [int(x) for x in c[6:8]]
        except ValueError: continue
        put(d, n, e, os.path.basename(f))

# B) 2004-2017: Bloecke, "Runde;1;13.02.2004" in Spalte 9-11 und 21-23, Zahlen zwei Zeilen tiefer
lines = [l.rstrip('\n') for l in io.open(D + '/euromillionen-ergebnisse-2004-2017.csv', encoding='latin-1')]
for i, l in enumerate(lines):
    c = [x.strip() for x in l.split(';')]
    if 'Ergebnisse:' not in c: continue
    # Datum steht bei 'Runde;N;DD.MM.YYYY' (bis 2010) oder 'Fr.;DD.MM.YYYY' / 'Di.;DD.MM.YYYY' (ab 2011),
    # jeweils rechts vom Wort 'Ergebnisse:' (Spalte 1 bzw. 13); erste Zahl steht in derselben Spalte.
    for base in [j for j, x in enumerate(c) if x == 'Ergebnisse:']:
        dm = None
        for x in c[base:base + 12]:
            dm = re.match(r'^(\d{2})\.(\d{2})\.(\d{4})$', x)
            if dm: break
        if not dm: continue
        y = dm.group(3); y = '2009' if y == '2099' else y   # Tippfehler in der Datei (20.11.2099)
        d = '%s-%s-%s' % (y, dm.group(2), dm.group(1))
        for l2 in lines[i + 1:i + 4]:
            c2 = [x.strip() for x in l2.split(';')]
            try: vals = [int(x) for x in c2[base:base + 7]]
            except (ValueError, IndexError): continue
            put(d, vals[:5], vals[5:7], '2004-2017'); break
        else: print('keine Zahlen fuer', d)

print('win2day Ziehungen:', len(out), min(out), max(out), 'Widersprueche:', len(dup), dup[:3])
by_year = collections.Counter(d[:4] for d in out); print(sorted(by_year.items()))
m = {r['d']: (sorted(r['n']), sorted(r['e'])) for r in json.load(open(ROOT + 'data/euromillions.json', encoding='utf-8'))}
print('Spiegel:', len(m), min(m), max(m))
fehlt = sorted(d for d in out if d not in m); extra = sorted(d for d in m if d not in out)
diff = sorted(d for d in out if d in m and out[d][:2] != m[d])
print('in win2day, nicht im Spiegel:', len(fehlt), fehlt[:6])
print('im Spiegel, nicht in win2day:', len(extra), extra[:6])
print('gleicher Tag, andere Zahlen:', len(diff), [(d, out[d][:2], m[d]) for d in diff[:5]])
