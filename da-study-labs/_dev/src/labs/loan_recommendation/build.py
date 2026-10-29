import json, sqlite3, subprocess, os, sys, shutil
import pandas as pd
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.formula.translate import Translator
from openpyxl.utils import get_column_letter
from openpyxl.utils.cell import coordinate_from_string, column_index_from_string
import datetime as dt
from gen import generate, PRODUCTS, MIN_OFFER
from solutions import SQL, PYPLAIN, PD
from xlspec import cfgs
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))
from sitekit import recalc
os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
os.chdir(os.path.join(HERE, "out"))   # all generated files go to out/


AC = ["applicant_id","monthly_income","existing_installments","credit_score","requested_amount","requested_term"]
HC = ["history_id","applicant_id","product_type","opened","amount","max_dpd","status"]
PC = ["product_id","name","min_score","min_income","max_amount","max_term","flat_rate","max_dti","thin_file_ok"]

def run_sql(apps, hist):
    con = sqlite3.connect(":memory:")
    con.execute("CREATE TABLE applicants(applicant_id INT, monthly_income INT, existing_installments INT, credit_score INT, requested_amount INT, requested_term INT)")
    con.executemany("INSERT INTO applicants VALUES(?,?,?,?,?,?)", apps)
    con.execute("CREATE TABLE history(history_id INT, applicant_id INT, product_type TEXT, opened DATE, amount INT, max_dpd INT, status TEXT)")
    con.executemany("INSERT INTO history VALUES(?,?,?,?,?,?,?)", hist)
    con.execute("CREATE TABLE products(product_id INT, name TEXT, min_score INT, min_income INT, max_amount INT, max_term INT, flat_rate REAL, max_dti REAL, thin_file_ok INT)")
    con.executemany("INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?)", PRODUCTS)
    out = {}
    for k, q in SQL.items():
        c = con.execute(q); cols = [d[0] for d in c.description]
        rows = [[(int(x) if isinstance(x, float) and x == int(x) else x) for x in r] for r in c.fetchall()]
        out[str(k)] = (cols, rows)
    return out

def rec_and_worst(apps, hist):
    worst = {}
    for h in hist: worst[h[1]] = max(worst.get(h[1], 0), h[5])
    order = sorted(PRODUCTS, key=lambda p: (p[6], p[0]))
    rec = {}
    for a in apps:
        for p in order:
            if worst.get(a[0], 0) > 90 or a[1] < p[3]: continue
            if (a[3] is None and p[8] == 1) or (a[3] is not None and a[3] >= p[2]): rec[a[0]] = p[0]; break
    return worst, rec

def margins_ok(apps, rec):
    P = {p[0]: p for p in PRODUCTS}
    for a in apps:
        if a[0] not in rec: continue
        p = P[rec[a[0]]]; term = min(a[5], p[5])
        afford = (p[7] * a[1] - a[2]) * term / (1 + p[6] * term / 12)
        amount = min(a[4], p[4], max(afford, 0))
        if afford > 0 and amount == afford:
            r = amount % 1_000_000
            if min(r, 1_000_000 - r) < 5: return False
        if abs(afford - 5_000_000) < 5 and amount == afford: return False
    return True

def valid(apps, hist):
    worst, rec = rec_and_worst(apps, hist)
    if not margins_ok(apps, rec): return False, "margin"
    r = run_sql(apps, hist)
    if len(r["1"][1]) != 4 or len(r["2"][1]) != 4 or len(r["3"][1]) != 4 or len(r["4"][1]) != 5 or len(r["5"][1]) != 4: return False, "rows"
    if any(x[1] < 3 for x in r["3"][1]) or any(x[1] < 2 for x in r["4"][1]) or any(x[1] < 2 for x in r["5"][1]): return False, "small"
    dp = {h[5] for h in hist}
    if not {9, 10, 90, 91} <= dp: return False, "dpd"
    # rounding ties on averages
    import statistics
    for k in ("1", "2"):
        pass
    inc = {}
    for a in apps:
        s = a[3]; b = "No score" if s is None else "High" if s >= 701 else "Medium" if s >= 501 else "Low"
        inc.setdefault(b, []).append(a[1])
    for b, v in inc.items():
        m = sum(v) / len(v)
        if abs((m % 1) - 0.5) < 1e-9: return False, "tie income"
    sc = {}
    for a in apps:
        if a[3] is None: continue
        c = ("No history" if a[0] not in worst else "Severe" if worst[a[0]] >= 91 else "Watch" if worst[a[0]] >= 10 else "Clean")
        sc.setdefault(c, []).append(a[3])
    for c, v in sc.items():
        if abs(((sum(v) / len(v)) % 1) - 0.5) < 1e-9: return False, "tie score"
    return True, ""

seed = 1
while True:
    apps, hist = generate(seed)
    ok, why = valid(apps, hist)
    if ok: break
    print("seed", seed, "rejected:", why); seed += 1
print("seed", seed)

sq = run_sql(apps, hist)
worst, rec = rec_and_worst(apps, hist)
def close(a, b):
    if a is None or b is None or (isinstance(a, float) and a != a) or (isinstance(b, float) and b != b):
        return (a is None or (isinstance(a, float) and a != a)) and (b is None or (isinstance(b, float) and b != b))
    if isinstance(a, str) or isinstance(b, str): return a == b
    return abs(float(a) - float(b)) < 1e-6

# pandas
adf = pd.DataFrame(apps, columns=AC); hdf = pd.DataFrame(hist, columns=HC); pdf = pd.DataFrame(PRODUCTS, columns=PC)
for k, code in PD.items():
    env = {"pd": pd, "applicants": adf.copy(), "history": hdf.copy(), "products": pdf.copy()}
    exec(code, env)
    rows = [list(r) for r in env["result"].itertuples(index=False, name=None)]
    exp = sq[str(k)][1]
    assert len(rows) == len(exp), (k, rows, exp)
    for a, b in zip(rows, exp): assert len(a) == len(b) and all(close(x, y) for x, y in zip(a, b)), (k, a, b)
print("SQL == pandas")
# plain python
AD = [dict(zip(AC, r)) for r in apps]; HD = [dict(zip(HC, r)) for r in hist]; PDct = [dict(zip(PC, r)) for r in PRODUCTS]
for k, code in PYPLAIN.items():
    env = {"applicants": AD, "history": HD, "products": PDct}; exec(code, env)
    rows = [list(r) for r in env["result"]]; exp = sq[str(k)][1]
    assert len(rows) == len(exp), (k, rows, exp)
    for a, b in zip(rows, exp): assert len(a) == len(b) and all(close(x, y) for x, y in zip(a, b)), (k, a, b)
print("plain Python == SQL")

# Excel
X = cfgs(apps, hist, PRODUCTS, worst, rec)
wb = Workbook(); wb.active.title = "README"
wa = wb.create_sheet("applicants"); wa.append(AC)
for r in apps: wa.append(r)
wh = wb.create_sheet("history"); wh.append(HC)
for r in hist:
    row = list(r); row[3] = dt.date.fromisoformat(r[3]); wh.append(row)
for i in range(2, len(hist) + 2): wh.cell(i, 4).number_format = "yyyy-mm-dd"
wp = wb.create_sheet("products"); wp.append(PC)
for r in PRODUCTS: wp.append(r)
def xl_fill(ws, cfg, cell, formula, mode):
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
fill = PatternFill("solid", fgColor="DDE6EF")
for sh in wb.worksheets[1:]:
    for c in sh[1]: c.font = Font(bold=True); c.fill = fill
    for i in range(1, sh.max_column + 1): sh.column_dimensions[get_column_letter(i)].width = 17
    sh.freeze_panes = "A2"
wb.save("loan_tmp.xlsx")
RECALC = recalc('loan_tmp.xlsx', "recalc")
if RECALC:
    rv = load_workbook("recalc/loan_tmp.xlsx", data_only=True)
    for k, cfg in X.items():
        sh = rv[f"task{k}"]; r0, r1 = cfg["resRows"]
        got = [[sh.cell(r, c).value for c in cfg["cols"]] for r in range(r0, r1 + 1)]
        exp = sq[str(k)][1]
        assert len(got) == len(exp), (k, got, exp)
        for a, b in zip(got, exp):
            assert all(close(x, y) for x, y in zip(a, b)), (k, a, b)
    print("Excel (LibreOffice) == SQL")

wb2 = load_workbook("loan_tmp.xlsx"); rd = wb2["README"]
lines = ["Loan Recommendation Lab (educational)", "",
 "80 loan applicants, their credit history, and 4 fictional loan products. Amounts in VND.",
 "Sheets applicants, history and products are the data. Sheets task1 to task5 hold one reference solution each, as Excel formulas.",
 "Score bands follow the 300-850 CIC scale. Product rules, rates and limits are invented for teaching and are not any lender's policy."]
for i, t in enumerate(lines, 1): rd.cell(i, 1).value = t
rd["A1"].font = Font(bold=True, size=14); rd.column_dimensions["A"].width = 110
wb2.save("loan-recommendation-lab.xlsx")
if RECALC:   # store calculated values so previews show results
    recalc("loan-recommendation-lab.xlsx", "final")
    shutil.copy("final/loan-recommendation-lab.xlsx", "loan-recommendation-lab.xlsx")

res = {str(k): {"cols": sq[str(k)][0], "rows": sq[str(k)][1]} for k in range(1, 6)}
out = dict(applicants=apps, history=hist, products=PRODUCTS, sql={str(k): v for k, v in SQL.items()},
           pyPlain={str(k): v for k, v in PYPLAIN.items()}, py={str(k): v for k, v in PD.items()}, res=res,
           xl={str(k): v for k, v in X.items()}, minOffer=MIN_OFFER, rec=rec)
json.dump(out, open("data.json", "w"))
for k in res: print(k, res[k]["cols"], res[k]["rows"])
