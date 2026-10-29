import pandas as pd, numpy as np, json, logging
logging.getLogger("cmdstanpy").setLevel(logging.ERROR); logging.getLogger("prophet").setLevel(logging.ERROR)
df = pd.read_csv("../raw/examples_example_retail_sales.csv", parse_dates=["ds"])
print(len(df), df.ds.min().date(), df.ds.max().date())
y = df.y.values.astype(float); n = len(y); month = df.ds.dt.month.values
TEST = 24; cut = n - TEST
def model(train, months_train, W, horizon_months):
    m = len(train)
    s = pd.Series(train)
    cma = s.rolling(12).mean().rolling(2).mean().shift(-6).values   # centred 2x12 moving average
    ratio = train / cma
    si = np.array([np.nanmean(ratio[months_train == k]) for k in range(1, 13)])
    si = si / si.mean()
    des = train / si[months_train - 1]
    t = np.arange(m); w = W * 12
    b, a = np.polyfit(t[-w:], des[-w:], 1)
    def f(tt, mm): return (a + b * tt) * si[mm - 1]
    return f, si, a, b
def mape(a, f): return float(np.mean(np.abs((a - f) / a)) * 100)
test = y[cut:]
res = {}
snaive = y[cut - 12:n - 12]
res["snaive"] = mape(test, snaive)
for W in (2, 3, 5, 8, 10):
    f, si, a, b = model(y[:cut], month[:cut], W, TEST)
    fc = np.array([f(cut + i, month[cut + i]) for i in range(TEST)])
    res[f"ts_W{W}"] = mape(test, fc)
print(res)
f, si, a, b = model(y[:cut], month[:cut], 5, TEST); print("SI", np.round(si, 4))
from prophet import Prophet
out = {}
for mode in ("additive", "multiplicative"):
    m = Prophet(seasonality_mode=mode, weekly_seasonality=False, daily_seasonality=False)
    m.fit(df.iloc[:cut])
    fut = m.make_future_dataframe(periods=TEST, freq="MS")
    p = m.predict(fut)
    fc = p.yhat.values[cut:]
    out[mode] = (mape(test, fc), fc.round(0).tolist())
    print("prophet", mode, out[mode][0])
json.dump({"res": res, "prophet": out}, open("ref.json", "w"))
