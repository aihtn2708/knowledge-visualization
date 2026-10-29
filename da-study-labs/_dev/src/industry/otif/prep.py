"""Aggregate the USAID SCMS delivery history for the OTIF lab and fit the late-delivery model.
Only aggregates and model coefficients are published, not raw rows."""
import pandas as pd, numpy as np, json, warnings
import statsmodels.formula.api as smf
from sklearn.metrics import roc_auc_score
warnings.filterwarnings("ignore")
import os
SRC = "../raw/scms.csv" if os.path.exists("../raw/scms.csv") else "https://raw.githubusercontent.com/jrcinco/supply-chain-shipment-price-data/master/SCMS_Delivery_History_Dataset.csv"
d = pd.read_csv(SRC, encoding="utf-8-sig")   # USAID SCMS delivery history (not stored in this repository)
d["sched"] = pd.to_datetime(d["Scheduled Delivery Date"], format="%d-%b-%y")
d["deliv"] = pd.to_datetime(d["Delivered to Client Date"], format="%d-%b-%y")
d["late_days"] = (d.deliv - d.sched).dt.days
d["late"] = (d.late_days > 0).astype(int)
d["year"] = d.sched.dt.year
d["mode"] = d["Shipment Mode"].fillna("Unknown")
d["route"] = d["Fulfill Via"].map({"Direct Drop": "Direct from vendor", "From RDC": "Regional DC"})
top = d.Country.value_counts().index[:10]
d["country"] = np.where(d.Country.isin(top), d.Country, "Other")
d["product"] = np.where(d["Product Group"] == "HRDT", "HIV test kits", "Medicines")
d = d[d["mode"] != "Unknown"].copy()
d["period"] = np.where(d.year <= 2011, "2006-2011", "2012-2015")
print(len(d), d.late.mean())
# ---- model: late ~ route + mode + product + period + country (statsmodels logit) ----
rng = np.random.RandomState(42); d["test"] = rng.rand(len(d)) < 0.3
f = "late ~ C(route, Treatment('Direct from vendor')) + C(mode, Treatment('Air')) + C(product, Treatment('Medicines')) + C(period) + C(country, Treatment('South Africa'))"
m = smf.logit(f, data=d[~d.test]).fit(disp=0)
p = m.predict(d[d.test]); auc = roc_auc_score(d[d.test].late, p)
print(m.summary2().tables[1][["Coef.", "P>|z|"]].round(3)); print("AUC test", round(auc, 3))
coef = {k: float(v) for k, v in m.params.items()}
ci = m.conf_int(); ci = {k: [float(ci.loc[k, 0]), float(ci.loc[k, 1])] for k in m.params.index}
pv = {k: float(v) for k, v in m.pvalues.items()}
# ---- route x mode late-day distributions (0..120, >120) for promise-date buffers ----
dist = {}
for (r, mo), g in d.groupby(["route", "mode"]):
    if len(g) < 30: continue
    ld = g.late_days.clip(lower=0)
    cnt = [int((ld == k).sum()) for k in range(0, 121)] + [int((ld > 120).sum())]
    dist[f"{r}|{mo}"] = {"n": int(len(g)), "counts": cnt}
grp = lambda keys: [[*(k if isinstance(k, tuple) else (k,)), int(len(g)), float(1 - g.late.mean()), float(g.late_days[g.late_days > 0].mean() if g.late.any() else 0)] for k, g in d.groupby(keys)]
vend = d.groupby("Vendor").agg(n=("late", "size"), ot=("late", lambda x: 1 - x.mean())).query("n >= 150").sort_values("n", ascending=False)
out = {"total": int(len(d)), "ot": float(1 - d.late.mean()), "years": [int(d.year.min()), int(d.year.max())],
       "byYear": grp("year"), "byMode": grp("mode"), "byRoute": grp("route"), "byRouteMode": grp(["route", "mode"]), "byCountry": grp("country"), "byProduct": grp("product"),
       "byVendor": [[v, int(r.n), float(r.ot)] for v, r in vend.iterrows()],
       "dist": dist, "model": {"coef": coef, "ci": ci, "p": pv, "auc": float(auc), "nTrain": int((~d.test).sum()), "nTest": int(d.test.sum())},
       "levels": {"route": ["Direct from vendor", "Regional DC"], "mode": ["Air", "Air Charter", "Ocean", "Truck"], "product": ["Medicines", "HIV test kits"], "period": ["2006-2011", "2012-2015"], "country": ["South Africa"] + sorted([c for c in d.country.unique() if c != "South Africa"])}}
json.dump(out, open("data.json", "w"))
json.dump({"title": "OTIF Delivery Performance Lab", "file": "otif-delivery-performance-lab.html"}, open("meta.json", "w"))
print(pd.DataFrame(out["byRouteMode"]).round(3).to_string()); print(pd.DataFrame(out["byYear"]).round(3).T.to_string())
print(vend.round(3).to_string())
