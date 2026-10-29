var DT = DATA.date, IX = DATA.idx, N = IX.length, K = 10, VOL = 50;   /* USD per index point per container; containers per month */
var MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var ml = function (d) { return MN[+d.slice(5, 7) - 1] + " " + d.slice(0, 4); };
var pct = function (v, d) { return (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(100 * v), d === undefined ? 1 : d) + "%"; };
var usd = function (v) { return "$" + fmt(v); };
var at = function (ym) { return DT.indexOf(ym); };

/* ---------- descriptive ---------- */
var lr = []; for (var i = 1; i < N; i++) lr.push(Math.log(IX[i] / IX[i - 1]));
var mean = lr.reduce(function (a, b) { return a + b; }, 0) / lr.length, sd = Math.sqrt(lr.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (lr.length - 1));
var annVol = sd * Math.sqrt(12), last = IX[N - 1], ch12 = IX[N - 1] / IX[N - 13] - 1, peak = Math.max.apply(null, IX);
$("kpis").innerHTML = [["Latest (" + ml(DT[N - 1]) + ")", fmt(last, 1)], ["Change over 12 months", pct(ch12)], ["Cost per container now", usd(last * K)], ["Volatility, annual", fmt(100 * annVol, 1) + "%"]].map(function (k) { return '<div class="kpi"><small>' + k[0] + "</small><b>" + k[1] + "</b></div>"; }).join("");
var ticks = []; DT.forEach(function (d, k) { if (d.slice(5) === "01" && +d.slice(0, 4) % 5 === 0) ticks.push(k); });
$("ch-idx").innerHTML = chart({ title: "Deep sea freight price index", labels: DT.map(function (d) { return d.slice(0, 4); }), xticks: ticks, series: [{ values: IX, color: "--t1", w: 1.8 }], yfmt: function (v) { return fmt(v); }, legend: [["Producer price index, deep sea freight (June 1988 = 100)", "--t1"]] });

/* ---------- diagnostic ---------- */
var c12 = []; for (i = 12; i < N; i++) c12.push([DT[i], IX[i] / IX[i - 12] - 1]);
var edges = []; for (var e = -20; e <= 40; e += 5) edges.push(e);
var hist = edges.slice(0, -1).map(function (lo, k) { return c12.filter(function (c) { return 100 * c[1] >= lo && 100 * c[1] < edges[k + 1]; }).length; });
$("ch-hist").innerHTML = chart({ title: "12-month change", h: 240, labels: edges.slice(0, -1).map(function (lo) { return (lo > 0 ? "+" : "") + lo; }), series: [{ type: "bar", values: hist, colors: edges.slice(0, -1).map(function (lo) { return lo >= 10 ? "--t4" : "--t2"; }), labels: hist.map(function (h) { return h ? String(h) : ""; }) }], yfmt: function (v) { return fmt(v); }, legend: [["Months, by % change over the previous 12 months (bins of 5 points)", "--t2"]] });
/* largest rises: best 12-month change per episode (non-overlapping) */
var srt = c12.slice().sort(function (a, b) { return b[1] - a[1]; }), picks = [];
srt.forEach(function (c) { if (picks.length < 5 && picks.every(function (p) { return Math.abs(at(p[0]) - at(c[0])) > 12; })) picks.push(c); });
$("rise-table").innerHTML = '<table><thead><tr><th>12 months to</th><th class="n">Rise</th><th class="n">Extra cost a year at 50 FEU/month</th></tr></thead><tbody>' + picks.map(function (p) { var j = at(p[0]); return "<tr><td>" + ml(p[0]) + '</td><td class="n">' + pct(p[1]) + '</td><td class="n">' + usd((IX[j] - IX[j - 12]) * K * VOL * 12) + "</td></tr>"; }).join("") + "</tbody></table>";
var p95 = (function () { var v = c12.map(function (c) { return c[1]; }).sort(function (a, b) { return a - b; }); return v[Math.floor(0.95 * (v.length - 1))]; })();
var upShare = c12.filter(function (c) { return c[1] > 0.1; }).length / c12.length;
$("diag-text").innerHTML = "Most years are calm: half of all 12-month changes were between " + pct(c12.map(function (c) { return c[1]; }).sort(function (a, b) { return a - b; })[Math.floor(0.25 * c12.length)]) + " and " + pct(c12.map(function (c) { return c[1]; }).sort(function (a, b) { return a - b; })[Math.floor(0.75 * c12.length)]) +
  ". The damage comes from rare bursts: prices rose more than 10% in " + fmt(100 * upShare) + "% of 12-month windows, and one year in twenty saw a rise of " + pct(p95) + " or more. A budget built on the average year is right most of the time and badly wrong exactly when it matters.";

/* ---------- predictive: GARCH ---------- */
var CV = DATA.condVol, G = DATA.garch, var12 = DATA.garchVar12.reduce(function (a, b) { return a + b; }, 0), sig12 = Math.sqrt(var12) / 100;
var mu12 = 12 * G.mu / 100, bar = Math.exp(mu12 + 1.645 * sig12) - 1;
$("ch-vol").innerHTML = chart({ title: "Conditional volatility", h: 250, labels: DT.slice(1).map(function (d) { return d.slice(0, 4); }), xticks: ticks.map(function (t) { return t - 1; }).filter(function (t) { return t >= 0; }), series: [{ values: CV.map(function (v) { return v * Math.sqrt(12); }), color: "--t3", w: 1.6 }], yfmt: function (v) { return fmt(v) + "%"; }, legend: [["GARCH(1,1) volatility, annualised %", "--t3"]] });
$("var-kpis").innerHTML = [["Expected change, next 12 months", pct(Math.exp(mu12) - 1)], ["Volatility of that change", fmt(100 * sig12, 1) + "%"], ["Budget at risk (95%)", pct(bar)], ["In dollars at 50 FEU/month", usd(bar * last * K * VOL * 12)]].map(function (k) { return '<div class="kpi"><small>' + k[0] + "</small><b>" + k[1] + "</b></div>"; }).join("");
$("garch-note").innerHTML = "Fitted parameters: ω " + fmt(G.omega, 3) + ", α " + fmt(G["alpha[1]"], 3) + ", β " + fmt(G["beta[1]"], 3) + ". α + β is close to 1, so shocks to volatility fade very slowly: after a burst, the next year is risky too. Historically one year in twenty rose " + pct(p95) + " or more, a similar answer from a different method.";

/* ---------- prescriptive: backtest ---------- */
var PREM = 0.03, TOL = 0.08, CAP = 0.10, FEE = 0.02;
var years = []; for (var y = 1989; y <= 2025; y++) years.push(y);
function yearRun(y, h, prem, cap, fee) {   /* returns overrun vs budget for a year */
  var dec = IX[at((y - 1) + "-12")], budget = 12 * dec, cost = 0;
  for (var m = 1; m <= 12; m++) { var s = IX[at(y + "-" + (m < 10 ? "0" : "") + m)]; cost += cap === null ? h * dec * (1 + prem) + (1 - h) * s : Math.min(s, dec * (1 + cap)); }
  if (cap !== null) cost += fee * budget;
  return cost / budget - 1;
}
function stats(arr) { var m = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length, s = Math.sqrt(arr.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (arr.length - 1)); return { mean: m, sd: s, worst: Math.max.apply(null, arr), bad: arr.filter(function (v) { return v > TOL; }).length }; }
function renderBt() {
  $("prem-l").textContent = "Fixed-contract premium over the December rate: " + fmt(100 * PREM, 1) + "%";
  $("tol-l").textContent = "Budget tolerance (worst acceptable overrun): " + fmt(100 * TOL) + "%";
  $("cap-l").textContent = "Cap level: December rate + " + fmt(100 * CAP) + "%";
  $("fee-l").textContent = "Cap fee: " + fmt(100 * FEE, 1) + "% of the budget";
  var rows = [];
  for (var h = 0; h <= 100; h += 10) { var o = years.map(function (y) { return yearRun(y, h / 100, PREM, null, 0); }); rows.push({ name: h + "% fixed", h: h, o: o, s: stats(o) }); }
  var co = years.map(function (y) { return yearRun(y, 0, 0, CAP, FEE); }), cap = { name: "Cap at +" + fmt(100 * CAP) + "%", h: null, o: co, s: stats(co) };
  var ok = rows.filter(function (r) { return r.s.worst <= TOL + 1e-12; }), pick = ok.length ? ok[0] : null;
  var spot = rows[0];
  $("ch-bt").innerHTML = chart({ title: "Overrun by year", h: 250, labels: years.map(String), xticks: [0, 6, 11, 16, 21, 26, 31, 36], series: [{ values: spot.o.map(function (v) { return 100 * v; }), color: "--muted", w: 1.4 }].concat(pick ? [{ values: pick.o.map(function (v) { return 100 * v; }), color: "--t4", w: 2.2 }] : []).concat([{ values: co.map(function (v) { return 100 * v; }), color: "--t1", w: 1.6, dash: true }, { values: years.map(function () { return 100 * TOL; }), color: "--t3", w: 1, dash: true }]),
    yfmt: function (v) { return fmt(v) + "%"; }, ymin: -15, ymax: 25, legend: [["All spot", "--muted"]].concat(pick ? [[pick.name, "--t4"]] : []).concat([[cap.name, "--t1"], ["Tolerance", "--t3"]]) });
  var all = rows.concat([cap]);
  $("bt-table").innerHTML = '<table><thead><tr><th>Strategy</th><th class="n">Average overrun</th><th class="n">Std dev</th><th class="n">Worst year</th><th class="n">Years over tolerance</th></tr></thead><tbody>' + all.map(function (r) { var hl = r === pick; return "<tr" + (hl ? ' style="background:var(--t4-soft)"' : "") + "><td>" + (hl ? "<b>" + r.name + "</b>" : r.name) + '</td><td class="n">' + pct(r.s.mean) + '</td><td class="n">' + fmt(100 * r.s.sd, 1) + '%</td><td class="n">' + pct(r.s.worst) + '</td><td class="n">' + r.s.bad + " of " + years.length + "</td></tr>"; }).join("") + "</tbody></table>";
  var memo = '<b class="k">Recommendation</b>';
  if (pick) {
    var extra = (pick.s.mean - spot.s.mean) * last * K * VOL * 12;
    memo += "<span>Lock <b>" + pick.name.replace(" fixed", "") + "</b> of next year's volume at a fixed rate. In the backtest its worst year was " + pct(pick.s.worst) + " over budget, against " + pct(spot.s.worst) + " for staying on spot.</span><span>The price of that protection is " + pct(pick.s.mean - spot.s.mean, 2) + " of freight on average, about " + usd(Math.abs(extra)) + " a year at today's rate" + (extra < 0 ? " saved" : "") + ".</span>";
  } else memo += "<span>No fixed share keeps the worst year within " + fmt(100 * TOL) + "% at this premium. Loosen the tolerance or negotiate a lower premium.</span>";
  memo += "<span>The cap at +" + fmt(100 * CAP) + "% for a " + fmt(100 * FEE, 1) + "% fee averages " + pct(cap.s.mean) + " with a worst year of " + pct(cap.s.worst) + ": it keeps the savings when prices fall, which a fixed contract gives up.</span>";
  $("memo").innerHTML = memo;
}
[["prem", function (v) { PREM = v / 100; }], ["tol", function (v) { TOL = v / 100; }], ["cap", function (v) { CAP = v / 100; }], ["fee", function (v) { FEE = v / 100; }]].forEach(function (s) { $(s[0]).addEventListener("input", function (ev) { s[1](+ev.target.value); renderBt(); }); });
renderBt();

/* ---------- exercises ---------- */
var spotRuns = years.map(function (y) { return yearRun(y, 0, 0, null, 0); });
var pickFor = function (prem, tol) { for (var h = 0; h <= 100; h += 10) { var o = years.map(function (y) { return yearRun(y, h / 100, prem, null, 0); }); if (Math.max.apply(null, o) <= tol + 1e-12) return h; } return -1; };
renderExercises("ex", [
  { q: "What is the annual volatility of monthly changes in the index, in %?", type: "num", tol: 0.05, answer: function () { return 100 * annVol; }, placeholder: "e.g. 12.0", hint: "It is the last figure in the descriptive section: the standard deviation of monthly log changes × √12.", explain: function () { return "Low for a commodity, because the index blends contract and spot prices."; } },
  { q: "What was the largest rise over any 12 months, in %?", type: "num", tol: 0.1, answer: function () { return 100 * picks[0][1]; }, placeholder: "e.g. 25", hint: "First row of the largest rises table.", explain: function () { return "It ended in " + ml(picks[0][0]) + "."; } },
  { q: "Staying fully on spot, what was the worst budget overrun of any year from 1989 to 2025, in %?", type: "num", tol: 0.1, answer: function () { return 100 * Math.max.apply(null, spotRuns); }, placeholder: "e.g. 12", hint: "The worst year column for 0% fixed.", explain: function () { return "That year's budget missed by more than any tolerance a finance team would accept."; } },
  { q: "With a 3% premium and a 5% tolerance, what fixed share does the rule pick?", type: "select", options: ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%", "100%", "None"], answer: (function () { var h = pickFor(0.03, 0.05); return h < 0 ? "None" : h + "%"; })(), hint: "Set the premium to 3% and the tolerance to 5%.", explain: function () { return "A tighter tolerance needs a bigger hedge, and every extra 10% locked costs premium in calm years."; } }
]);

/* ---------- code ---------- */
var CODE = [
  "import numpy as np",
  "import pandas as pd",
  "from arch import arch_model",
  "",
  'url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=PCU483111483111P"',
  "s = pd.read_csv(url, index_col=0, parse_dates=True).iloc[:, 0].dropna()",
  "",
  "r = 100 * np.log(s).diff().dropna()            # monthly change, %",
  'print("annual volatility %:", round(r.std() * np.sqrt(12), 2))',
  "",
  'res = arch_model(r, mean="Constant", vol="GARCH", p=1, q=1).fit(disp="off")',
  "print(res.params.round(4))",
  "var12 = res.forecast(horizon=12).variance.values[-1].sum()",
  'print("volatility of next 12 months %:", round(np.sqrt(var12), 2))',
  "",
  "# backtest: budget = December rate; lock share h at December rate plus a premium",
  "def overruns(h, premium=0.03):",
  "    out = []",
  "    for y in range(1989, 2026):",
  '        dec = s[f"{y - 1}-12-01"]',
  '        months = s[f"{y}-01-01":f"{y}-12-01"]',
  "        cost = h * 12 * dec * (1 + premium) + (1 - h) * months.sum()",
  "        out.append(cost / (12 * dec) - 1)",
  "    return np.array(out)",
  "",
  "for h in (0, 0.5, 1):",
  "    o = overruns(h)",
  '    print(f"{h:.0%} fixed: average {o.mean():+.2%}, worst {o.max():+.2%}")'
].join("\n");
$("code").textContent = CODE; copyButton("copy", CODE);
