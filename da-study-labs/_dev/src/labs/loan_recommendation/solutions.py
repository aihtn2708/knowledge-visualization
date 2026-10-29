SQL = {}
SQL[1] = """SELECT CASE WHEN credit_score >= 701 THEN 'High'
            WHEN credit_score >= 501 THEN 'Medium'
            WHEN credit_score >= 300 THEN 'Low'
            ELSE 'No score' END       AS band,
       COUNT(*)                       AS applicants,
       ROUND(AVG(monthly_income))     AS avg_income
FROM applicants
GROUP BY band
ORDER BY CASE band WHEN 'High' THEN 1 WHEN 'Medium' THEN 2
                   WHEN 'Low' THEN 3 ELSE 4 END;"""
SQL[2] = """WITH worst AS (
  SELECT applicant_id, MAX(max_dpd) AS worst_dpd
  FROM history
  GROUP BY applicant_id
)
SELECT CASE WHEN w.worst_dpd IS NULL THEN 'No history'
            WHEN w.worst_dpd >= 91    THEN 'Severe'
            WHEN w.worst_dpd >= 10    THEN 'Watch'
            ELSE 'Clean' END          AS history_class,
       COUNT(*)                       AS applicants,
       ROUND(AVG(a.credit_score))     AS avg_score
FROM applicants a
LEFT JOIN worst w ON w.applicant_id = a.applicant_id
GROUP BY history_class
ORDER BY CASE history_class WHEN 'No history' THEN 1 WHEN 'Clean' THEN 2
                            WHEN 'Watch' THEN 3 ELSE 4 END;"""
ELIG = """WITH worst AS (
  SELECT applicant_id, MAX(max_dpd) AS worst_dpd
  FROM history
  GROUP BY applicant_id
),
eligible AS (
  SELECT a.*, p.product_id, p.name, p.flat_rate, p.max_amount, p.max_term, p.max_dti
  FROM applicants a
  LEFT JOIN worst w ON w.applicant_id = a.applicant_id
  JOIN products p
    ON COALESCE(w.worst_dpd, 0) <= 90
   AND a.monthly_income >= p.min_income
   AND (a.credit_score >= p.min_score
        OR (a.credit_score IS NULL AND p.thin_file_ok = 1))
)"""
SQL[3] = ELIG.replace("""eligible AS (
  SELECT a.*, p.product_id, p.name, p.flat_rate, p.max_amount, p.max_term, p.max_dti""", """eligible AS (
  SELECT a.applicant_id, p.product_id, p.name""") + """
SELECT name AS product, COUNT(*) AS eligible_applicants
FROM eligible
GROUP BY product_id, name
ORDER BY product_id;"""
BEST = ELIG + """,
best AS (
  SELECT *,
         ROW_NUMBER() OVER (PARTITION BY applicant_id
                            ORDER BY flat_rate, product_id) AS rn
  FROM eligible
)"""
SQL[4] = BEST + """
SELECT COALESCE(b.name, 'No offer') AS recommended_product,
       COUNT(*)                     AS applicants
FROM applicants a
LEFT JOIN best b ON b.applicant_id = a.applicant_id AND b.rn = 1
GROUP BY recommended_product
ORDER BY MIN(COALESCE(b.product_id, 99));"""
SQL[5] = BEST + """,
offers AS (
  SELECT product_id, name, flat_rate,
         MIN(requested_term, max_term) AS term,
         MIN(requested_amount, max_amount,
             MAX((max_dti * monthly_income - existing_installments)
                 * MIN(requested_term, max_term)
                 / (1 + flat_rate * MIN(requested_term, max_term) / 12.0), 0)) AS amount
  FROM best
  WHERE rn = 1
),
final AS (
  SELECT product_id, name, flat_rate, term,
         CAST(amount / 1000000 AS INTEGER) * 1000000 AS offer
  FROM offers
)
SELECT name AS product,
       COUNT(*)                                   AS offers,
       SUM(offer)                                 AS total_offer,
       SUM(ROUND(offer * flat_rate * term / 12.0)) AS total_interest
FROM final
WHERE offer >= 5000000
GROUP BY product_id, name
ORDER BY product_id;"""

PYPLAIN = {}
PYPLAIN[1] = '''counts = {}
income = {}
for a in applicants:
    s = a["credit_score"]
    if s is None:
        band = "No score"
    elif s >= 701:
        band = "High"
    elif s >= 501:
        band = "Medium"
    else:
        band = "Low"
    counts[band] = counts.get(band, 0) + 1
    income[band] = income.get(band, 0) + a["monthly_income"]

result = []
for band in ["High", "Medium", "Low", "No score"]:
    result.append((band, counts[band], round(income[band] / counts[band])))'''
PYPLAIN[2] = '''worst = {}
for h in history:
    k = h["applicant_id"]
    worst[k] = max(worst.get(k, 0), h["max_dpd"])

count = {}
score_sum = {}
score_n = {}
for a in applicants:
    k = a["applicant_id"]
    if k not in worst:
        cls = "No history"
    elif worst[k] >= 91:
        cls = "Severe"
    elif worst[k] >= 10:
        cls = "Watch"
    else:
        cls = "Clean"
    count[cls] = count.get(cls, 0) + 1
    if a["credit_score"] is not None:
        score_sum[cls] = score_sum.get(cls, 0) + a["credit_score"]
        score_n[cls] = score_n.get(cls, 0) + 1

result = []
for cls in ["No history", "Clean", "Watch", "Severe"]:
    avg = round(score_sum[cls] / score_n[cls]) if cls in score_n else None
    result.append((cls, count[cls], avg))'''
PY_ELIG = '''worst = {}
for h in history:
    k = h["applicant_id"]
    worst[k] = max(worst.get(k, 0), h["max_dpd"])

def eligible(a, p):
    if worst.get(a["applicant_id"], 0) > 90:
        return False
    if a["monthly_income"] < p["min_income"]:
        return False
    if a["credit_score"] is None:
        return p["thin_file_ok"] == 1
    return a["credit_score"] >= p["min_score"]
'''
PYPLAIN[3] = PY_ELIG + '''
result = []
for p in products:
    n = 0
    for a in applicants:
        if eligible(a, p):
            n += 1
    result.append((p["name"], n))'''
PY_BEST = PY_ELIG + '''
cheapest_first = sorted(products, key=lambda p: (p["flat_rate"], p["product_id"]))

def best_product(a):
    for p in cheapest_first:
        if eligible(a, p):
            return p
    return None
'''
PYPLAIN[4] = PY_BEST + '''
counts = {"Prime": 0, "Standard": 0, "Starter": 0, "Micro": 0, "No offer": 0}
for a in applicants:
    p = best_product(a)
    if p is None:
        counts["No offer"] += 1
    else:
        counts[p["name"]] += 1

result = [(name, counts[name]) for name in ["Prime", "Standard", "Starter", "Micro", "No offer"]]'''
PYPLAIN[5] = PY_BEST + '''
offers = {}
total = {}
interest = {}
for a in applicants:
    p = best_product(a)
    if p is None:
        continue
    term = min(a["requested_term"], p["max_term"])
    room = p["max_dti"] * a["monthly_income"] - a["existing_installments"]
    afford = room * term / (1 + p["flat_rate"] * term / 12)
    amount = min(a["requested_amount"], p["max_amount"], max(afford, 0))
    offer = int(amount // 1000000) * 1000000
    if offer < 5000000:
        continue
    name = p["name"]
    offers[name] = offers.get(name, 0) + 1
    total[name] = total.get(name, 0) + offer
    interest[name] = interest.get(name, 0) + round(offer * p["flat_rate"] * term / 12)

result = []
for p in products:
    n = p["name"]
    result.append((n, offers[n], total[n], interest[n]))'''

PD = {}
PD[1] = '''import numpy as np

score = applicants["credit_score"]
applicants["band"] = np.select([score >= 701, score >= 501, score >= 300],
                               ["High", "Medium", "Low"], default="No score")
result = (applicants.groupby("band")
                    .agg(applicants=("applicant_id", "count"),
                         avg_income=("monthly_income", "mean"))
                    .round(0)
                    .reindex(["High", "Medium", "Low", "No score"])
                    .reset_index())'''
PD[2] = '''import numpy as np

worst = history.groupby("applicant_id")["max_dpd"].max().rename("worst_dpd")
a = applicants.merge(worst, on="applicant_id", how="left")
a["history_class"] = np.select([a["worst_dpd"].isna(), a["worst_dpd"] >= 91, a["worst_dpd"] >= 10],
                               ["No history", "Severe", "Watch"], default="Clean")
result = (a.groupby("history_class")
           .agg(applicants=("applicant_id", "count"), avg_score=("credit_score", "mean"))
           .round(0)
           .reindex(["No history", "Clean", "Watch", "Severe"])
           .reset_index())'''
PD_ELIG = '''worst = history.groupby("applicant_id")["max_dpd"].max().rename("worst_dpd")
a = applicants.merge(worst, on="applicant_id", how="left")
pairs = a.merge(products, how="cross")
ok = ((pairs["worst_dpd"].fillna(0) <= 90)
      & (pairs["monthly_income"] >= pairs["min_income"])
      & ((pairs["credit_score"] >= pairs["min_score"])
         | (pairs["credit_score"].isna() & (pairs["thin_file_ok"] == 1))))
eligible = pairs[ok]
'''
PD[3] = PD_ELIG + '''
result = (eligible.groupby(["product_id", "name"]).size()
                  .reset_index(name="eligible_applicants")
                  .rename(columns={"name": "product"})
                  [["product", "eligible_applicants"]])'''
PD_BEST = PD_ELIG + '''best = (eligible.sort_values(["applicant_id", "flat_rate", "product_id"])
                .groupby("applicant_id").head(1))
'''
PD[4] = PD_BEST + '''
picked = a[["applicant_id"]].merge(best[["applicant_id", "name"]], on="applicant_id", how="left")
picked["name"] = picked["name"].fillna("No offer")
result = (picked.groupby("name").size()
                .reindex(["Prime", "Standard", "Starter", "Micro", "No offer"])
                .reset_index(name="applicants")
                .rename(columns={"name": "recommended_product"}))'''
PD[5] = PD_BEST + '''
b = best.copy()
b["term"] = b[["requested_term", "max_term"]].min(axis=1)
room = b["max_dti"] * b["monthly_income"] - b["existing_installments"]
afford = room * b["term"] / (1 + b["flat_rate"] * b["term"] / 12)
amount = pd.concat([b["requested_amount"], b["max_amount"], afford.clip(lower=0)], axis=1).min(axis=1)
b["offer"] = (amount // 1_000_000) * 1_000_000
b = b[b["offer"] >= 5_000_000].copy()
b["interest"] = (b["offer"] * b["flat_rate"] * b["term"] / 12).round()

result = (b.groupby(["product_id", "name"])
           .agg(offers=("applicant_id", "count"), total_offer=("offer", "sum"),
                total_interest=("interest", "sum"))
           .reset_index()
           .rename(columns={"name": "product"})
           .drop(columns="product_id"))'''
