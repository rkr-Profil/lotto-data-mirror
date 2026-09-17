# -*- coding: utf-8 -*-
"""
Pruefung des deutschen Altbestands gegen die amtliche WestLotto-Datei (17.09.2026).

  python scripts/verify-de-westlotto.py [pfad/zu/lotto6aus49.zip]

Datei: https://www.westlotto.de/westlotto-medien/zahlen-fakten/gewinnzahlendownload/lotto6aus49.zip
(XLSX, ein Blatt je Jahr 1955-2021, von der offiziellen Download-Seite verlinkt, robots.txt
sperrt sie nicht). Vergleicht Datum fuer Datum mit data/de-6-49.json und data/de-6-49-sz.json.

Ergebnis vom 17.09.2026: 4.556 von 4.556 Ziehungen bis 01.01.2022 identisch. Abweichungen nur
in der WestLotto-Datei selbst: '21.07.' 2014 und '20.07.' 2015 sind als SA beschriftet, aber
Montage (Tippfehler fuer 19.07.2014 / 18.07.2015); der 31.12.2014 steht als '31.12.' im Blatt
2015 (KW 1); der 31.12.2005 hat zwei Zeilen (regulaere Ziehung + Sonderziehung '52.*' ohne
Zusatz-/Superzahl). Der Spiegel traegt die Samstagsdaten und die regulaere Ziehung — beides richtig.
Der Superzahl-Vergleich ist wegen wechselnder Spaltenlayouts (1991 nur Zusatzzahl, ab 05/2013
'x' statt Zusatzzahl) nur naeherungsweise; entscheidend ist die letzte Zeile: kein gemeinsamer
Termin mit abweichenden Zahlen oder abweichender Superzahl.
Braucht: pip install openpyxl
"""
import zipfile, openpyxl, io, json, datetime, re, sys, collections
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + os.sep
ZIP = sys.argv[1] if len(sys.argv) > 1 else 'lotto6aus49.zip'
z = zipfile.ZipFile(ZIP)
wb = openpyxl.load_workbook(io.BytesIO(z.read('LOTTO6aus49_2021.xlsx')), read_only=True, data_only=True)

def datum(cell, jahr):
    if isinstance(cell, datetime.datetime): return cell.date().isoformat()
    if isinstance(cell, str):
        m = re.match(r'^\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})?\s*$', cell)
        if m:
            y = m.group(3); y = int(y) if y else jahr
            if y < 100: y += 1900 if y > 50 else 2000
            return '%04d-%02d-%02d' % (y, int(m.group(2)), int(m.group(1)))
    return None

out = []   # (d, n[6] sortiert, zusatz|None, super|None, jahr)
probleme = []
for name in wb.sheetnames:
    jahr = int(name)
    rows = list(wb[name].iter_rows(values_only=True))
    # Kopf: welche Spalten heissen Zusatzzahl / Superzahl?
    kopf = ' '.join(str(c) for r in rows[:8] for c in r if c)
    hatZ = 'Zu-' in kopf; hatS = 'Su-' in kopf
    for r in rows:
        cells = list(r)
        di = None
        for i, c in enumerate(cells[:4]):
            d = datum(c, jahr)
            if d: di = i; break
        if di is None: continue
        if isinstance(cells[di], str) and d.endswith('-12-31') and d[:4] == name and rows.index(r) < 10: d = str(jahr - 1) + d[4:]
        rest = [c for c in cells[di+1:] if c is not None and not (isinstance(c, str) and c.strip() in ('MI', 'SA', ''))]
        ints = []
        for c in rest:
            if isinstance(c, (int, float)) and float(c).is_integer(): ints.append(int(c))
            else: break
        if len(ints) < 6: probleme.append((name, cells[:12])); continue
        n = sorted(ints[:6]); extra = ints[6:8]
        zus = sup = None
        if hatZ and hatS: zus = extra[0] if len(extra) > 0 else None; sup = extra[1] if len(extra) > 1 else None
        elif hatZ: zus = extra[0] if extra else None
        elif hatS: sup = extra[0] if extra else None
        if not all(1 <= x <= 49 for x in n) or len(set(n)) != 6: probleme.append((name, cells[:12])); continue
        out.append((d, n, zus, sup, jahr))
print('Ziehungen gelesen:', len(out), 'Probleme:', len(probleme))
for p in probleme[:8]: print('  ', p)
by = {}
for d, n, zus, sup, jahr in out:
    if d in by: probleme.append(('doppelt', d))
    by[d] = (n, zus, sup)
print('Termine:', len(by), 'erster', min(by), 'letzter', max(by))

m1 = {r['d']: r['n'] for r in json.load(open(ROOT + 'data/de-6-49.json', encoding='utf-8'))}
m2 = {r['d']: (r['n'], r['e'][0]) for r in json.load(open(ROOT + 'data/de-6-49-sz.json', encoding='utf-8'))}
bis = max(by)
sp1 = {d: n for d, n in m1.items() if d <= bis}
print('\n== 6/49: Spiegel bis', bis, ':', len(sp1), '| WestLotto:', len(by))
fehlt = sorted(d for d in by if d not in sp1); extra = sorted(d for d in sp1 if d not in by)
diff = sorted(d for d in by if d in sp1 and by[d][0] != sp1[d])
print('in WestLotto, nicht im Spiegel:', len(fehlt), fehlt[:5])
print('im Spiegel, nicht in WestLotto:', len(extra), extra[:5])
print('gleicher Tag, andere Zahlen:', len(diff), [(d, by[d][0], sp1[d]) for d in diff[:5]])
sp2 = {d: v for d, v in m2.items() if d <= bis}
wl2 = {d: (v[0], v[2] + 1) for d, v in by.items() if v[2] is not None}
print('\n== 6/49+SZ: Spiegel bis', bis, ':', len(sp2), '| WestLotto mit Superzahl:', len(wl2), 'erste', min(wl2) if wl2 else None)
fehlt2 = sorted(d for d in wl2 if d not in sp2); extra2 = sorted(d for d in sp2 if d not in wl2)
diff2 = sorted(d for d in wl2 if d in sp2 and wl2[d] != sp2[d])
print('in WestLotto, nicht im Spiegel:', len(fehlt2), fehlt2[:5])
print('im Spiegel, nicht in WestLotto:', len(extra2), extra2[:5])
print('gleicher Tag, andere Zahlen/SZ:', len(diff2), [(d, wl2[d], sp2[d]) for d in diff2[:5]])
