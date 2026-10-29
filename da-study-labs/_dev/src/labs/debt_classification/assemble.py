"""Assemble the lab page from the shared template and this folder's parts, then write it into da-study-labs/labs/."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))
from sitekit import TEMPLATE, finish_lab
os.chdir(HERE)
T = open(TEMPLATE, encoding='utf8').read().split("\n")
def seg(a, b): return "\n".join(T[a-1:b])   # inclusive, 1-indexed
rd = lambda f: open(f, encoding='utf8').read().rstrip("\n")
out = []
head = seg(1, 178)
head = head.replace("<title>Coffee Chain Lab</title>", "<title>Debt Classification Lab</title>")
head = head.replace("four task cards", "five task cards")
out.append(head)
out.append(rd('parts_body.html'))
out.append("")
out.append(seg(251, 260))        # blank, <script>, PYINTERP, XLENGINE, </script>, <script>, (function, DATA, esc, fmt
out.append(rd('p_defs.js'))
out.append("")
out.append(seg(267, 278))        # table()
out.append(rd('p_tables.js'))
out.append("")
out.append(seg(286, 308))        # copy helper
out.append("")
out.append(rd('p_setup.js'))
out.append(seg(344, 375))        # renderSetup .. compareResult
out.append(rd('p_tasks.js'))
out.append("")
out.append(seg(500, 592))        # state, sql engine, verdicts, runSql, peek, runPy
out.append(rd('p_xlbase.js'))
out.append(seg(609, 713))
out.append(rd('p_sheet.js'))
out.append(seg(725, 902))
s = "\n".join(out)

def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (old[:70], n)
    s = s.replace(old, new)

# LAST constant used by xl note/sheet
rep("  /* ---------- tasks ---------- */\n  var flatVals", "  var LAST = LN.length + 1;\n\n  /* ---------- tasks ---------- */\n  var flatVals")
# verdict wording
rep("Compare your numbers with the task: which orders count, and how are they grouped?", "Compare your numbers with the task: which loans count, and which group does each one belong to?")
# python globals
rep("{ orders: ORDERS_PY, stores: STORES_PY }", "{ loans: LOANS_PY, rules: RULES_PY }")
# state: starting cell per task
rep('sel: "B2", verdict', 'sel: t.xl.start, verdict')
rep('case "xl-clear": st.cells = {}; st.sel = "B2";', 'case "xl-clear": st.cells = {}; st.sel = TASKS[cur].xl.start;')
rep('st.sel = "B2"; renderXlGrid();\n  }', 'st.sel = cfg.start; renderXlGrid();\n  }')
# grid container size + fill ends + result rows
rep('var cfg = TASKS[cur].xl, st = state[cur], locked = xlSheet(), grid = document.getElementById("xl-grid");', 'var cfg = TASKS[cur].xl, st = state[cur], locked = xlSheet(), grid = document.getElementById("xl-grid");\n    grid.className = cfg.rows > 20 ? "tw tall" : "tw";')
rep("for (var r = 2; r <= cfg.rows; r++) {\n      var row = [];", "for (var r = cfg.resRows[0]; r <= cfg.resRows[1]; r++) {\n      var row = [];")
rep('endR = mode === "right" ? a.r : cfg.rows;', 'endR = mode === "right" ? a.r : ((cfg.ends && cfg.ends[String(a.c)]) || cfg.rows);')
# workspace texts
rep('data-act="peek" data-t="orders" disabled>Peek at orders</button><button class="btn sm needs-sql" data-act="peek" data-t="stores" disabled>Peek at stores</button>', 'data-act="peek" data-t="loans" disabled>Peek at loans</button><button class="btn sm needs-sql" data-act="peek" data-t="rules" disabled>Peek at rules</button>')
rep("""'<p class="xl-note">Work area: the <b>answer</b> sheet below. Click a cell, type a value or formula in the formula bar and press Enter. Formulas can read the <code>orders</code> sheet (A1:H' + LAST + ', column H is line_total = qty × unit_price) and the <code>stores</code> sheet (A1:C4). Grey cells are given.</p>' +""",
    """'<p class="xl-note">' + T.xl.note + ' Click a cell, type a value or formula in the formula bar and press Enter. Formulas can read the <code>loans</code> sheet (A1:H' + LAST + ') and the <code>rules</code> sheet (A1:E6). Grey cells are given.</p>' +""")
rep("<details><summary>Look at the orders sheet (A1:H' + LAST + ')</summary><div style=\"margin-top:8px\">' + ordersSheetHtml()", "<details><summary>Look at the loans sheet (A1:H' + LAST + ')</summary><div style=\"margin-top:8px\">' + loansSheetHtml()")
# typed check UI (numbers only)
rep("""(T.check.kind === "select" ? '<select id="ans"><option value="">Choose a product</option>' + PRODUCTS.map(function (p) { return '<option value="' + p + '">' + p + "</option>"; }).join("") + "</select>" : '<input id="ans" type="text" inputmode="decimal" autocomplete="off" placeholder="' + esc(T.check.placeholder) + '">')""",
    """'<input id="ans" type="text" inputmode="decimal" autocomplete="off" placeholder="' + esc(T.check.placeholder) + '">'""")
rep("""    if (c.kind === "select") { say(raw === c.answer ? "good" : "bad", raw === c.answer ? "Correct." : "Not quite. Check which product earns the most revenue, not units."); return; }\n""", "")
rep("""var v = parseFloat(raw.replace(/[\\s,]/g, "").replace("%", ""));""", """var cleaned = raw.replace(/\\s/g, "").replace("%", ""); if (/^\\d{1,3}(\\.\\d{3})+$/.test(cleaned)) cleaned = cleaned.replace(/\\./g, ""); var v = parseFloat(cleaned.replace(/,/g, ""));""")
rep("Enter a number, for example 1250 or 12.5.", "Enter a number, for example 22 or 13.7.")
rep("Re-check which orders count and how you group them, or take a hint.", "Re-check which loans count and how you group them, or take a hint.")
data = json.load(open(os.path.join("out", "data.json"), encoding="utf8"))
finish_lab(s, data, "debt-classification", os.path.join("out", "debt-classification-lab.xlsx"), "debt-classification-lab.xlsx")
