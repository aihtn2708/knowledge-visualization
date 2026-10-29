"""Reference analysis for the freight hedging lab: volatility, GARCH(1,1) forecast with arch, and hedge backtests."""
import pandas as pd, numpy as np, json
from arch import arch_model
s = pd.read_csv("../raw/ppi.csv", parse_dates=["date"], index_col="date")["index"]
r = 100 * np.log(s).diff().dropna()                     # monthly log change, %
print("monthly sd %", round(r.std(), 3), "annualised %", round(r.std() * np.sqrt(12), 2))
ch12 = (s / s.shift(12) - 1).dropna() * 100
print("12m change pct p5/p50/p95", np.percentile(ch12, [5, 50, 95]).round(1), "max", round(ch12.max(), 1), ch12.idxmax().date())
am = arch_model(r, mean="Constant", vol="GARCH", p=1, q=1, dist="normal")
res = am.fit(disp="off")
print(res.params.round(4).to_dict())
f = res.forecast(horizon=12)
var12 = f.variance.values[-1]                          # monthly variances for the next 12 months
print("GARCH next-12m vol of the annual change (%):", round(np.sqrt(var12.sum()), 2), "long-run monthly sd", round(np.sqrt(res.params["omega"] / (1 - res.params["alpha[1]"] - res.params["beta[1]"])), 3))
cond = res.conditional_volatility
# hedge backtest: budget in December for the next calendar year; fixed contract share h at premium p
def backtest(h, prem):
    out = []
    for y in range(1989, 2026):
        dec = s[f"{y-1}-12-01"]; months = s[f"{y}-01-01":f"{y}-12-01"]
        budget = 12 * dec; cost = h * 12 * dec * (1 + prem) + (1 - h) * months.sum()
        out.append(cost / budget - 1)
    return np.array(out)
for h in (0, 0.5, 1):
    o = backtest(h, 0.03); print(h, "mean %.2f sd %.2f worst %.2f" % (100 * o.mean(), 100 * o.std(ddof=1), 100 * o.max()))
json.dump({"garch": {k: float(v) for k, v in res.params.items()}, "garchVar12": var12.tolist(), "condVol": [float(x) for x in cond.values], "condDates": [str(d)[:7] for d in cond.index]}, open("garch.json", "w"))
