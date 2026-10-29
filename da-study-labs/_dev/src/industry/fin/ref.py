import pandas as pd, numpy as np, json, warnings
warnings.filterwarnings("ignore")
import quantstats as qs
d = pd.read_csv("../raw/data_data.csv", parse_dates=["Date"])
d = d[d.Date <= "2023-06-01"].reset_index(drop=True)
P, D, C, L = d.SP500.values, d.Dividend.values, d["Consumer Price Index"].values, d["Long Interest Rate"].values
r = (P[1:] + D[1:] / 12) / P[:-1] - 1
infl = C[1:] / C[:-1] - 1
rr = (1 + r) / (1 + infl) - 1
rf = L[1:] / 100 / 12
idx = d.Date.values[1:]
def metrics(a, b):
    m = (idx >= np.datetime64(a)) & (idx <= np.datetime64(b))
    x, xr, f = r[m], rr[m], rf[m]; n = len(x)
    cagr = np.prod(1 + x) ** (12 / n) - 1
    rcagr = np.prod(1 + xr) ** (12 / n) - 1
    vol = np.std(x, ddof=1) * np.sqrt(12)
    ex = x - f
    sharpe = ex.mean() / np.std(ex, ddof=1) * np.sqrt(12)
    w = np.cumprod(1 + x); w = np.concatenate([[1.0], w])
    dd = w / np.maximum.accumulate(w) - 1
    s = pd.Series(x, index=pd.DatetimeIndex(idx[m]))
    q = dict(cagr=qs.stats.cagr(s, periods=12) if False else None,
             vol=qs.stats.volatility(s, periods=12, annualize=True),
             sharpe=qs.stats.sharpe(pd.Series(ex, index=s.index), periods=12),
             mdd=qs.stats.max_drawdown(s))
    return dict(n=n, cagr=cagr, real_cagr=rcagr, vol=vol, sharpe=sharpe, mdd=dd.min()), q
for a, b in (("1871-02-01", "2023-06-01"), ("1950-01-01", "2023-06-01"), ("2000-01-01", "2023-06-01")):
    mine, q = metrics(a, b)
    print(a, {k: round(v, 4) for k, v in mine.items()}, {k: (round(v, 4) if v is not None else None) for k, v in q.items()})
# rolling windows: share of N-year holding periods with a loss (nominal and real)
for N in (1, 5, 10, 20):
    k = 12 * N
    tr = np.cumprod(1 + r); trr = np.cumprod(1 + rr)
    g = tr[k:] / tr[:-k] - 1; gr = trr[k:] / trr[:-k] - 1
    print(N, "y loss share nominal", round((g < 0).mean() * 100, 1), "real", round((gr < 0).mean() * 100, 1), "worst real ann", round(((1 + gr.min()) ** (1 / N) - 1) * 100, 2))
json.dump({"date": [str(x)[:7] for x in d.Date.values], "p": P.tolist(), "d": D.tolist(), "cpi": C.tolist(), "rate": L.tolist()}, open("data.json", "w"))
