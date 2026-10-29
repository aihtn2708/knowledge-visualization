# SQL, plain Python (runs in the page), pandas (own computer) for the 5 tasks
SQL = {}
SQL[1] = """SELECT r.grp,
       r.label,
       COUNT(*)           AS loans,
       SUM(l.outstanding) AS outstanding
FROM loans l
JOIN rules r ON l.dpd BETWEEN r.min_dpd AND r.max_dpd
GROUP BY r.grp, r.label
ORDER BY r.grp;"""
SQL[2] = """SELECT r.grp,
       SUM(l.outstanding)                          AS outstanding,
       r.provision_rate,
       ROUND(SUM(l.outstanding) * r.provision_rate) AS provision
FROM loans l
JOIN rules r ON l.dpd BETWEEN r.min_dpd AND r.max_dpd
GROUP BY r.grp, r.provision_rate
ORDER BY r.grp;"""
SQL[3] = """WITH classified AS (
  SELECT l.outstanding,
         r.grp,
         l.outstanding * r.provision_rate AS provision
  FROM loans l
  JOIN rules r ON l.dpd BETWEEN r.min_dpd AND r.max_dpd
)
SELECT SUM(outstanding) AS total_outstanding,
       SUM(CASE WHEN grp >= 3 THEN outstanding ELSE 0 END) AS npl_outstanding,
       ROUND(100.0 * SUM(CASE WHEN grp >= 3 THEN outstanding ELSE 0 END)
             / SUM(outstanding), 2) AS npl_ratio_pct,
       ROUND(SUM(provision)) AS total_provision,
       ROUND(100.0 * SUM(provision)
             / SUM(CASE WHEN grp >= 3 THEN outstanding ELSE 0 END), 2) AS coverage_pct
FROM classified;"""
SQL[4] = """WITH classified AS (
  SELECT l.customer_id, l.outstanding, r.grp
  FROM loans l
  JOIN rules r ON l.dpd BETWEEN r.min_dpd AND r.max_dpd
),
with_worst AS (
  SELECT *,
         MAX(grp) OVER (PARTITION BY customer_id) AS worst_grp
  FROM classified
)
SELECT worst_grp         AS grp,
       COUNT(*)          AS loans,
       SUM(outstanding)  AS outstanding
FROM with_worst
GROUP BY worst_grp
ORDER BY worst_grp;"""
SQL[5] = """SELECT f.grp AS from_grp,
       SUM(CASE WHEN t.grp = 1 THEN 1 ELSE 0 END) AS to_1,
       SUM(CASE WHEN t.grp = 2 THEN 1 ELSE 0 END) AS to_2,
       SUM(CASE WHEN t.grp = 3 THEN 1 ELSE 0 END) AS to_3,
       SUM(CASE WHEN t.grp = 4 THEN 1 ELSE 0 END) AS to_4,
       SUM(CASE WHEN t.grp = 5 THEN 1 ELSE 0 END) AS to_5
FROM loans l
JOIN rules f ON l.dpd_prev BETWEEN f.min_dpd AND f.max_dpd
JOIN rules t ON l.dpd      BETWEEN t.min_dpd AND t.max_dpd
GROUP BY f.grp
ORDER BY f.grp;"""

PYPLAIN = {}
PYPLAIN[1] = '''def group_of(dpd):
    for r in rules:
        if r["min_dpd"] <= dpd <= r["max_dpd"]:
            return r["grp"]

count = {}
balance = {}
for loan in loans:
    g = group_of(loan["dpd"])
    count[g] = count.get(g, 0) + 1
    balance[g] = balance.get(g, 0) + loan["outstanding"]

result = [(r["grp"], r["label"], count[r["grp"]], balance[r["grp"]]) for r in rules]'''
PYPLAIN[2] = '''def group_of(dpd):
    for r in rules:
        if r["min_dpd"] <= dpd <= r["max_dpd"]:
            return r["grp"]

rate = {r["grp"]: r["provision_rate"] for r in rules}
balance = {}
for loan in loans:
    g = group_of(loan["dpd"])
    balance[g] = balance.get(g, 0) + loan["outstanding"]

result = []
for g in sorted(balance):
    result.append((g, balance[g], rate[g], round(balance[g] * rate[g])))'''
PYPLAIN[3] = '''def group_of(dpd):
    for r in rules:
        if r["min_dpd"] <= dpd <= r["max_dpd"]:
            return r["grp"]

rate = {r["grp"]: r["provision_rate"] for r in rules}
total = 0
npl = 0
provision = 0
for loan in loans:
    g = group_of(loan["dpd"])
    total += loan["outstanding"]
    provision += loan["outstanding"] * rate[g]
    if g >= 3:
        npl += loan["outstanding"]

result = [(total, npl, round(100 * npl / total, 2), round(provision), round(100 * provision / npl, 2))]'''
PYPLAIN[4] = '''def group_of(dpd):
    for r in rules:
        if r["min_dpd"] <= dpd <= r["max_dpd"]:
            return r["grp"]

# pass 1: the worst group of every customer
worst = {}
for loan in loans:
    g = group_of(loan["dpd"])
    c = loan["customer_id"]
    if c not in worst or g > worst[c]:
        worst[c] = g

# pass 2: every loan takes its customer's worst group
count = {}
balance = {}
for loan in loans:
    g = worst[loan["customer_id"]]
    count[g] = count.get(g, 0) + 1
    balance[g] = balance.get(g, 0) + loan["outstanding"]

result = [(g, count[g], balance[g]) for g in sorted(count)]'''
PYPLAIN[5] = '''def group_of(dpd):
    for r in rules:
        if r["min_dpd"] <= dpd <= r["max_dpd"]:
            return r["grp"]

matrix = {}
for f in range(1, 6):
    matrix[f] = {}
    for t in range(1, 6):
        matrix[f][t] = 0

for loan in loans:
    matrix[group_of(loan["dpd_prev"])][group_of(loan["dpd"])] += 1

result = []
for f in range(1, 6):
    row = [f]
    for t in range(1, 6):
        row.append(matrix[f][t])
    result.append(tuple(row))'''

PD_HEAD = '''bins = list(rules["min_dpd"]) + [float("inf")]
loans["grp"] = pd.cut(loans["dpd"], bins=bins, labels=rules["grp"], right=False).astype(int)
'''
PD = {}
PD[1] = PD_HEAD + '''
result = (loans.merge(rules[["grp", "label"]], on="grp")
               .groupby(["grp", "label"], as_index=False)
               .agg(loans=("loan_id", "count"), outstanding=("outstanding", "sum")))'''
PD[2] = PD_HEAD + '''
by_grp = loans.groupby("grp", as_index=False)["outstanding"].sum()
result = by_grp.merge(rules[["grp", "provision_rate"]], on="grp")
result["provision"] = (result["outstanding"] * result["provision_rate"]).round()'''
PD[3] = PD_HEAD + '''
loans = loans.merge(rules[["grp", "provision_rate"]], on="grp")
loans["provision"] = loans["outstanding"] * loans["provision_rate"]

total = loans["outstanding"].sum()
npl = loans.loc[loans["grp"] >= 3, "outstanding"].sum()
provision = loans["provision"].sum()
result = pd.DataFrame([{
    "total_outstanding": total,
    "npl_outstanding": npl,
    "npl_ratio_pct": round(100 * npl / total, 2),
    "total_provision": round(provision),
    "coverage_pct": round(100 * provision / npl, 2),
}])'''
PD[4] = PD_HEAD + '''loans["worst_grp"] = loans.groupby("customer_id")["grp"].transform("max")

result = (loans.groupby("worst_grp", as_index=False)
               .agg(loans=("loan_id", "count"), outstanding=("outstanding", "sum"))
               .rename(columns={"worst_grp": "grp"}))'''
PD[5] = PD_HEAD + '''loans["grp_prev"] = pd.cut(loans["dpd_prev"], bins=bins, labels=rules["grp"], right=False).astype(int)

result = (pd.crosstab(loans["grp_prev"], loans["grp"])
            .reindex(index=range(1, 6), columns=range(1, 6), fill_value=0)
            .add_prefix("to_")
            .rename_axis(index="from_grp", columns=None)
            .reset_index())'''
