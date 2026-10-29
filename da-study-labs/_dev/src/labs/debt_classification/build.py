import json, sqlite3, subprocess, sys, os, shutil
import pandas as pd
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.formula.translate import Translator
from openpyxl.utils import get_column_letter
from gen import generate
from solutions import SQL, PYPLAIN, PD
from xlspec import spec, LAST
import datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))
from sitekit import recalc
os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
os.chdir(os.path.join(HERE, "out"))   # all generated files go to out/


loans, rules = generate()
LC = ["loan_id","customer_id","product","disbursed","principal","outstanding","dpd","dpd_prev"]
RC = ["grp","label","min_dpd","max_dpd","provision_rate"]

# ---- SQL ----
con = sqlite3.connect(":memory:")
con.execute("CREATE TABLE loans(loan_id INT, customer_id INT, product TEXT, disbursed DATE, principal INT, outstanding INT, dpd INT, dpd_prev INT)")
con.executemany("INSERT INTO loans VALUES(?,?,?,?,?,?,?,?)", loans)
con.execute("CREATE TABLE rules(grp INT, label TEXT, min_dpd INT, max_dpd INT, provision_rate REAL)")
con.executemany("INSERT INTO rules VALUES(?,?,?,?,?)", rules)
cur = con.execute
sql_cols, sql_rows = {}, {}
for k, q in SQL.items():
    c = cur(q); sql_cols[k] = [d[0] for d in c.description]
    sql_rows[k] = [list(r) for r in c.fetchall()]
def intify(rows):
    out = []
    for r in rows:
        out.append([int(x) if isinstance(x, float) and x == int(x) and abs(x) > 1e-9 or x == 0 else x for x in r])
    return out
sql_rows = {k: intify(v) for k, v in sql_rows.items()}
# the provision rate column keeps decimals; fix 0.0 -> 0 handled by intify

# ---- pandas ----
loans_df = pd.DataFrame(loans, columns=LC); loans_df["disbursed"] = pd.to_datetime(loans_df["disbursed"])
rules_df = pd.DataFrame(rules, columns=RC)
def close(a, b):
    if a is None or b is None: return a is b
    if isinstance(a, str) or isinstance(b, str): return a == b
    return abs(float(a) - float(b)) < 1e-6
for k, code in PD.items():
    env = {"pd": pd, "loans": loans_df.copy(), "rules": rules_df.copy()}
    exec(code, env)
    res = env["result"]
    rows = [list(r) for r in res.itertuples(index=False, name=None)]
    assert len(rows) == len(sql_rows[k]), (k, rows, sql_rows[k])
    for a, b in zip(rows, sql_rows[k]):
        assert all(close(x, y) for x, y in zip(a, b)) and len(a) == len(b), (k, a, b)
print("SQL == pandas (5 tasks)")

# ---- plain Python in CPython ----
LD = [dict(zip(LC, r)) for r in loans]; RD = [dict(zip(RC, r)) for r in rules]
for k, code in PYPLAIN.items():
    env = {"loans": LD, "rules": RD}; exec(code, env)
    rows = [list(r) for r in env["result"]]
    assert len(rows) == len(sql_rows[k]), (k, rows, sql_rows[k])
    for a, b in zip(rows, sql_rows[k]):
        assert len(a) == len(b) and all(close(x, y) for x, y in zip(a, b) if not isinstance(x, str)), (k, a, b)
print("plain Python == SQL (5 tasks)")

# ---- Excel ----
X = spec(loans)
wb = Workbook()
ws = wb.active; ws.title = "README"
wl = wb.create_sheet("loans"); wl.append(LC)
for r in loans:
    row = list(r); row[3] = dt.date.fromisoformat(r[3]); wl.append(row)
for i in range(2, LAST + 1):
    wl.cell(i, 4).number_format = "yyyy-mm-dd"
    for c in (5, 6): wl.cell(i, c).number_format = "#,##0"
wr = wb.create_sheet("rules"); wr.append(RC)
for r in rules: wr.append(r)
for i in range(2, 7): wr.cell(i, 5).number_format = "0%"
def xl_fill(ws, cfg, cell, formula, mode):
    from openpyxl.utils.cell import coordinate_from_string, column_index_from_string
    col, row = coordinate_from_string(cell); c0 = column_index_from_string(col)
    pre_cells = {(ri + 1, ci + 1) for ri, rr in enumerate(cfg["pre"]) for ci, v in enumerate(rr) if v is not None}
    def put(r, c):
        f = Translator(formula, origin=cell).translate_formula(f"{get_column_letter(c)}{r}")
        ws.cell(r, c).value = f.replace("MAXIFS(", "_xlfn.MAXIFS(")
    put(row, c0)
    if mode is None: return
    endc = c0 if mode == "down" else max(c0, cfg["rightLimit"])
    for r in range(row, (cfg["ends"].get(str(c0)) or cfg["rows"]) + 1):
        for c in range(c0, endc + 1):
            if (r, c) == (row, c0) or (r, c) in pre_cells: continue
            put(r, c)
for k, cfg in X.items():
    sh = wb.create_sheet(f"task{k}")
    for ri, rr in enumerate(cfg["pre"]):
        for ci, v in enumerate(rr):
            if v is not None: sh.cell(ri + 1, ci + 1).value = v
    for cell, f, mode in cfg["sol"]: xl_fill(sh, cfg, cell, f, mode)
    sh.freeze_panes = "A2" if k == 4 else None
hdr_fill = PatternFill("solid", fgColor="DDE6EF")
for sh in wb.worksheets[1:]:
    for c in sh[1]: c.font = Font(bold=True); c.fill = hdr_fill
    for i in range(1, sh.max_column + 1): sh.column_dimensions[get_column_letter(i)].width = 18
wb.save("debt_tmp.xlsx")
RECALC = recalc('debt_tmp.xlsx', "recalc")
if RECALC:
    rv = load_workbook("recalc/debt_tmp.xlsx", data_only=True)
    for k, cfg in X.items():
        sh = rv[f"task{k}"]; r0, r1 = cfg["resRows"]
        got = [[sh.cell(r, c).value for c in cfg["cols"]] for r in range(r0, r1 + 1)]
        exp = sql_rows[k]
        if k == 1: exp = [[a, b, c, d] for a, b, c, d in exp]
        assert len(got) == len(exp), (k, got, exp)
        for a, b in zip(got, exp):
            assert all((x == y) if isinstance(x, str) or isinstance(y, str) else close(x, y) for x, y in zip(a, b)), (k, a, b)
    print("Excel (LibreOffice) == SQL (5 tasks)")

# ---- tie check for ROUND(…,2) (half-way cases would make tools disagree) ----
d3 = sql_rows[3][0]
print("T3:", d3)

# ---- final workbook with README ----
wb2 = load_workbook("debt_tmp.xlsx")
rd = wb2["README"]
lines = ["Debt Classification Lab (educational)", "",
 "Reporting date: 30 Sep 2026. Previous month-end: 31 Aug 2026. Amounts in VND.",
 "Sheets loans and rules are the data. Sheets task1 to task5 hold one reference solution each, written as Excel formulas.",
 "Simplified rules, loosely based on Circular 11/2021/TT-NHNN (as amended by 31/2024/TT-NHNN): quantitative, days-past-due only.",
 "Not compliance advice. Real classification also uses qualitative criteria, restructuring status and collateral."]
for i, t in enumerate(lines, 1): rd.cell(i, 1).value = t
rd["A1"].font = Font(bold=True, size=14); rd.column_dimensions["A"].width = 110
wb2.save("debt-classification-lab.xlsx")
if RECALC:   # store calculated values so previews show results
    recalc("debt-classification-lab.xlsx", "final")
    shutil.copy("final/debt-classification-lab.xlsx", "debt-classification-lab.xlsx")

# ---- data json ----
res = {str(k): {"cols": sql_cols[k], "rows": sql_rows[k]} for k in SQL}
out = dict(loans=loans, rules=rules, sql={str(k): v for k, v in SQL.items()}, pyPlain={str(k): v for k, v in PYPLAIN.items()},
           py={str(k): v for k, v in PD.items()}, res=res, xl={str(k): v for k, v in X.items()})
json.dump(out, open("data.json", "w"))
for k in res: print(k, res[k]["cols"], res[k]["rows"][:6])
