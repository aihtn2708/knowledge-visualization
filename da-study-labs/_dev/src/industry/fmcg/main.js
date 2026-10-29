var Y = DATA.y, DS = DATA.ds, N = Y.length, TEST = 24, CUT = N - TEST;
var MONTH = DS.map(function (d) { return +d.slice(5, 7); });
var MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var bn = function (v) { return fmt(v / 1000, 0) + "bn"; };   /* millions of USD -> billions */
var mlab = function (d) { return MN[+d.slice(5, 7) - 1] + " " + d.slice(0, 4); };

/* trend x season model, same algorithm as the Python reference */
function fitModel(y, months, W) {
  var m = y.length, m12 = [], r2 = [], cma = [], i;
  for (i = 0; i < m; i++) { if (i >= 11) { var s = 0; for (var k = i - 11; k <= i; k++) s += y[k]; m12[i] = s / 12; } else m12[i] = null; }
  for (i = 0; i < m; i++) r2[i] = i >= 12 ? (m12[i - 1] + m12[i]) / 2 : null;
  for (i = 0; i < m; i++) cma[i] = i + 6 < m ? r2[i + 6] : null;
  var sum = [], cnt = [];
  for (k = 0; k < 12; k++) { sum[k] = 0; cnt[k] = 0; }
  for (i = 0; i < m; i++) if (cma[i] !== null) { sum[months[i] - 1] += y[i] / cma[i]; cnt[months[i] - 1]++; }
  var si = sum.map(function (s, k) { return s / cnt[k]; }), mean = si.reduce(function (a, b) { return a + b; }, 0) / 12;
  si = si.map(function (v) { return v / mean; });
  var w = W * 12, xs = [], ys = [];
  for (i = m - w; i < m; i++) { xs.push(i); ys.push(y[i] / si[months[i] - 1]); }
  var mx = xs.reduce(function (a, b) { return a + b; }, 0) / w, my = ys.reduce(function (a, b) { return a + b; }, 0) / w, sxy = 0, sxx = 0;
  for (i = 0; i < w; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
  var b = sxy / sxx, a = my - b * mx;
  return { si: si, a: a, b: b, f: function (t, mo) { return (a + b * t) * si[mo - 1]; } };
}
var mape = function (act, fc) { var s = 0; act.forEach(function (v, i) { s += Math.abs((v - fc[i]) / v); }); return 100 * s / act.length; };
var test = Y.slice(CUT), snaive = Y.slice(CUT - 12, N - 12), snMape = mape(test, snaive);
function backtest(W) { var md = fitModel(Y.slice(0, CUT), MONTH.slice(0, CUT), W), fc = []; for (var i = 0; i < TEST; i++) fc.push(md.f(CUT + i, MONTH[CUT + i])); return { md: md, fc: fc, mape: mape(test, fc) }; }
var bestW = 2, bestM = Infinity; for (var w = 2; w <= 10; w++) { var bm = backtest(w).mape; if (bm < bestM) { bestM = bm; bestW = w; } }
var trainSI = fitModel(Y.slice(0, CUT), MONTH.slice(0, CUT), 5).si;

/* ---------- descriptive ---------- */
$("data-line").textContent = N + " months, " + mlab(DS[0]) + " to " + mlab(DS[N - 1]) + ", in millions of US dollars.";
var yoy = Y.map(function (v, i) { return i >= 12 ? 100 * (v / Y[i - 12] - 1) : null; });
var minY = Infinity, minI = 0; yoy.forEach(function (v, i) { if (v !== null && v < minY) { minY = v; minI = i; } });
var lastY = yoy[N - 1], cagr = 100 * (Math.pow(Y[N - 1] / Y[N - 1 - 120], 1 / 10) - 1);
$("kpis").innerHTML = [["Latest month (" + mlab(DS[N - 1]) + ")", bn(Y[N - 1])], ["Growth vs a year earlier", (lastY >= 0 ? "+" : "") + fmt(lastY, 1) + "%"], ["Average growth, last 10 years", fmt(cagr, 1) + "% a year"], ["Biggest month in the data", MN[MONTH[Y.indexOf(Math.max.apply(null, Y))] - 1]]]
  .map(function (k) { return '<div class="kpi"><small>' + k[0] + "</small><b>" + k[1] + "</b></div>"; }).join("");
var yearTicks = []; DS.forEach(function (d, i) { if (d.slice(5) === "01" && (+d.slice(0, 4)) % 4 === 0) yearTicks.push(i); });
$("ch-all").innerHTML = chart({ title: "Monthly retail sales", labels: DS.map(function (d) { return d.slice(0, 4); }), xticks: yearTicks, series: [{ values: Y, color: "--t1", w: 1.6 }], yfmt: bn, ymin: 100000, legend: [["Retail and food services sales, US$ per month", "--t1"]] });

/* ---------- diagnostic ---------- */
$("ch-si").innerHTML = chart({ title: "Seasonal index", h: 240, labels: MN, series: [{ type: "bar", values: trainSI, colors: trainSI.map(function (v) { return v >= 1 ? "--t2" : "--t2-soft"; }), labels: trainSI.map(function (v) { return v.toFixed(2); }) }], ymin: 0.8, ymax: 1.2, yfmt: function (v) { return v.toFixed(2); } });
$("ch-yoy").innerHTML = chart({ title: "Year-on-year growth", h: 240, labels: DS.map(function (d) { return d.slice(0, 4); }), xticks: yearTicks.filter(function (i, k) { return k % 2 === 0; }), series: [{ values: yoy, color: "--t2", w: 1.6 }], yfmt: function (v) { return fmt(v) + "%"; }, ymin: -15, ymax: 15 });
var peak = trainSI.indexOf(Math.max.apply(null, trainSI)), low = trainSI.indexOf(Math.min.apply(null, trainSI));
$("diag-text").innerHTML = "<b>" + MN[peak] + "</b> is the peak, about " + fmt(100 * (trainSI[peak] - 1)) + "% above an average month (holiday shopping). <b>" + MN[low] + "</b> is the low, about " + fmt(100 * (1 - trainSI[low])) + "% below. The worst year-on-year change was <b>" + fmt(minY, 1) + "% in " + mlab(DS[minI]) +
  "</b>, during the 2008 to 2009 recession: a change in the trend, not the season. A forecaster has to model both, and treat the recession years with care when fitting the trend.";

/* ---------- predictive ---------- */
var W = 5;
function renderBacktest() {
  var bt = backtest(W);
  $("win-l").textContent = "Trend window: last " + W + " years of training data";
  var lab = DS.slice(CUT - 24).map(mlab), off = 24;
  var pad = function (arr) { return new Array(off).fill(null).concat(arr); };
  $("ch-bt").innerHTML = chart({ title: "Backtest", labels: lab, xticks: [0, 12, 24, 36, 47], series: [
      { values: Y.slice(CUT - 24), color: "--ink", w: 2 },
      { values: pad(snaive), color: "--muted", dash: true, w: 1.6 },
      { values: pad(DATA.prophet.multiplicative), color: "--t1", w: 1.8 },
      { values: pad(bt.fc), color: "--t3", w: 2.4 }],
    shade: [[24, 47, "--t3-soft"]], yfmt: bn, zero: false, ymin: 360000, vline: [24, "test period"],
    legend: [["Actual", "--ink"], ["Seasonal naive", "--muted"], ["Prophet", "--t1"], ["Trend × season", "--t3"]] });
  var rows = [["Seasonal naive (same month last year)", snMape], ["Prophet, additive", DATA.prophetMape.additive], ["Prophet, multiplicative", DATA.prophetMape.multiplicative], ["Trend × season, " + W + "-year window", bt.mape]];
  var best = Math.min.apply(null, rows.map(function (r) { return r[1]; }));
  $("mape-table").innerHTML = '<table><thead><tr><th>Method</th><th class="n">MAPE</th></tr></thead><tbody>' + rows.map(function (r) { return "<tr><td>" + (r[1] === best ? "<b>" + r[0] + "</b>" : r[0]) + '</td><td class="n">' + (r[1] === best ? "<b>" + fmt(r[1], 2) + "%</b>" : fmt(r[1], 2) + "%") + "</td></tr>"; }).join("") + "</tbody></table>";
  renderPlan();
}
$("win").addEventListener("input", function (e) { W = +e.target.value; renderBacktest(); });

/* ---------- prescriptive ---------- */
var SVC = [[0.5, 0], [0.8, 0.842], [0.9, 1.282], [0.95, 1.645], [0.98, 2.054]], svc = 2;
function renderPlan() {
  var bt = backtest(W), errs = test.map(function (v, i) { return (v - bt.fc[i]) / bt.fc[i]; });
  var me = errs.reduce(function (a, b) { return a + b; }, 0) / errs.length, sd = Math.sqrt(errs.reduce(function (a, b) { return a + (b - me) * (b - me); }, 0) / (errs.length - 1));
  var full = fitModel(Y, MONTH, W), z = SVC[svc][1], rows = [];
  for (var h = 0; h < 6; h++) { var mo = (MONTH[N - 1] + h) % 12 + 1, yr = +DS[N - 1].slice(0, 4) + (MONTH[N - 1] + h >= 12 ? 1 : 0), f = full.f(N + h, mo); rows.push([MN[mo - 1] + " " + yr, f, f * z * sd, f * (1 + z * sd)]); }
  $("svc-l").textContent = "Target service level: " + Math.round(SVC[svc][0] * 100) + "% (z = " + z.toFixed(2) + ")";
  var lab = DS.slice(N - 18).map(mlab).concat(rows.map(function (r) { return r[0]; }));
  var hist = Y.slice(N - 18).concat(new Array(6).fill(null));
  var fc = new Array(17).fill(null).concat([Y[N - 1]]).concat(rows.map(function (r) { return r[1]; }));
  var plan = new Array(17).fill(null).concat([Y[N - 1]]).concat(rows.map(function (r) { return r[3]; }));
  $("ch-plan").innerHTML = chart({ title: "Plan", h: 240, labels: lab, xticks: [0, 6, 12, 18, 23], series: [{ values: hist, color: "--ink" }, { values: fc, color: "--t3", dash: true }, { values: plan, color: "--t4", w: 2.4 }], yfmt: bn, zero: false, ymin: 400000, legend: [["Actual", "--ink"], ["Forecast", "--t3"], ["Plan with buffer", "--t4"]] });
  $("plan-table").innerHTML = '<table><thead><tr><th>Month</th><th class="n">Forecast</th><th class="n">Buffer</th><th class="n">Plan</th></tr></thead><tbody>' + rows.map(function (r) { return "<tr><td>" + r[0] + '</td><td class="n">' + bn(r[1]) + '</td><td class="n">' + bn(r[2]) + '</td><td class="n"><b>' + bn(r[3]) + "</b></td></tr>"; }).join("") + "</tbody></table>";
  var tot = rows.reduce(function (a, r) { return a + r[2]; }, 0);
  $("memo").innerHTML = '<b class="k">Recommendation</b><span>Use the trend × season model with a <b>' + W + "-year</b> window (backtest MAPE " + fmt(bt.mape, 2) + "%, against " + fmt(snMape, 2) + "% for last year's numbers). Its percentage errors had a standard deviation of <b>" + fmt(100 * sd, 2) + "%</b>.</span><span>At a " + Math.round(SVC[svc][0] * 100) + "% service level the plan carries <b>" + bn(tot) + "</b> of buffer over six months. Each step up in service buys fewer stock-outs with more stock to hold; the planner and finance should agree the level per category.</span>";
}
$("svc").addEventListener("input", function (e) { svc = +e.target.value; renderPlan(); });
renderBacktest();

/* ---------- exercises ---------- */
renderExercises("ex", [
  { q: "What is the seasonal index for December, to two decimals?", type: "num", tol: 0.011, answer: function () { return trainSI[11]; }, placeholder: "e.g. 1.05", hint: "Read it from the seasonal index chart in the diagnostic section.", explain: function () { return "December sales run about " + fmt(100 * (trainSI[11] - 1)) + "% above an average month."; } },
  { q: "What MAPE does the seasonal naive method score in the backtest (%)?", type: "num", tol: 0.05, answer: function () { return snMape; }, placeholder: "e.g. 4.2", hint: "It is in the table next to the backtest chart.", explain: function () { return "Any model worth using must beat this simple baseline."; } },
  { q: "Which trend window gives the lowest backtest MAPE?", type: "select", options: [2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (w) { return w + " years"; }), answer: bestW + " years", hint: "Move the trend window slider and watch the table.", explain: function () { return "Recent years grew faster than the 1990s, so a short window follows the current trend best. Too short, and one unusual year moves the whole line."; } },
  { q: "What was the lowest year-on-year growth in the data (%)?", type: "num", tol: 0.1, answer: function () { return minY; }, placeholder: "e.g. -5.0", hint: "Look at the year-on-year chart around 2009.", explain: function () { return "It happened in " + mlab(DS[minI]) + "."; } }
]);

/* ---------- code ---------- */
var CODE = [
  "import numpy as np",
  "import pandas as pd",
  "from prophet import Prophet",
  "",
  'url = "https://raw.githubusercontent.com/facebook/prophet/main/examples/example_retail_sales.csv"',
  'df = pd.read_csv(url, parse_dates=["ds"])',
  "train, test = df.iloc[:-24], df.iloc[-24:]",
  "",
  "def mape(actual, forecast):",
  "    return float(np.mean(np.abs((actual - forecast) / actual)) * 100)",
  "",
  "# 1. Prophet",
  'm = Prophet(seasonality_mode="multiplicative", weekly_seasonality=False, daily_seasonality=False)',
  "m.fit(train)",
  'future = m.make_future_dataframe(periods=24, freq="MS")',
  "prophet_fc = m.predict(future).yhat.values[-24:]",
  'print(f"Prophet MAPE: {mape(test.y.values, prophet_fc):.2f}%")',
  "",
  "# 2. Trend x season: seasonal index from a centred 12-month moving average,",
  "#    then a straight line through the deseasonalised last W years",
  "W = " + bestW,
  "y = train.y.astype(float)",
  "cma = y.rolling(12).mean().rolling(2).mean().shift(-6)",
  "month = train.ds.dt.month",
  "si = (y / cma).groupby(month).mean()",
  "si = si / si.mean()",
  "des = y / month.map(si)",
  "t = np.arange(len(y))",
  "b, a = np.polyfit(t[-12 * W:], des.values[-12 * W:], 1)",
  "t_test = np.arange(len(y), len(y) + 24)",
  "ts_fc = (a + b * t_test) * test.ds.dt.month.map(si).values",
  'print(f"Trend x season MAPE ({W}-year window): {mape(test.y.values, ts_fc):.2f}%")'
].join("\n");
$("code").textContent = CODE; copyButton("copy", CODE);
