var DT = DATA.date, P = DATA.p, DV = DATA.d, CPI = DATA.cpi, LR = DATA.rate, NM = DT.length;
/* monthly series, index i = month DT[i], for i >= 1 */
var R = [null], INF = [null], RR = [null], RF = [null], SAFE = [null];
for (var i = 1; i < NM; i++) {
  R[i] = (P[i] + DV[i] / 12) / P[i - 1] - 1; INF[i] = CPI[i] / CPI[i - 1] - 1; RR[i] = (1 + R[i]) / (1 + INF[i]) - 1;
  RF[i] = LR[i] / 1200; SAFE[i] = LR[i - 1] / 1200;
}
var MNS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var ml = function (d) { return MNS[+d.slice(5, 7) - 1] + " " + d.slice(0, 4); };
var idxOf = function (ym) { return DT.indexOf(ym); };
var pct = function (v, d) { return (v >= 0 ? "" : "−") + fmt(Math.abs(100 * v), d === undefined ? 1 : d) + "%"; };
$("data-line").textContent = (NM - 1) + " monthly returns, " + ml(DT[1]) + " to " + ml(DT[NM - 1]) + ".";

function metrics(a, b) {
  var x = R.slice(a, b + 1), xr = RR.slice(a, b + 1), f = RF.slice(a, b + 1), n = x.length;
  var prod = 1, prodR = 1, w = [1], peak = 1, mdd = 0;
  x.forEach(function (v, k) { prod *= 1 + v; prodR *= 1 + xr[k]; w.push(prod); peak = Math.max(peak, prod); mdd = Math.min(mdd, prod / peak - 1); });
  var mean = x.reduce(function (s, v) { return s + v; }, 0) / n, sd = Math.sqrt(x.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / (n - 1));
  var ex = x.map(function (v, k) { return v - f[k]; }), em = ex.reduce(function (s, v) { return s + v; }, 0) / n, esd = Math.sqrt(ex.reduce(function (s, v) { return s + (v - em) * (v - em); }, 0) / (n - 1));
  return { n: n, cagr: Math.pow(prod, 12 / n) - 1, real: Math.pow(prodR, 12 / n) - 1, vol: sd * Math.sqrt(12), sharpe: em / esd * Math.sqrt(12), mdd: mdd, wealth: w };
}
var PERIODS = [["Full history 1871–2023", "1871-02"], ["Since 1950", "1950-01"], ["Since 1990", "1990-01"], ["Since 2000", "2000-01"]];
var per = 0, END = NM - 1;

function renderPeriod() {
  $("seg-period").innerHTML = PERIODS.map(function (p, k) { return '<button data-p="' + k + '" aria-pressed="' + (k === per) + '">' + p[0] + "</button>"; }).join("");
  var a = idxOf(PERIODS[per][1]), m = metrics(a, END);
  $("kpis").innerHTML = [["Annual growth (CAGR)", pct(m.cagr, 2)], ["After inflation", pct(m.real, 2)], ["Volatility, annual", pct(m.vol, 1)], ["Sharpe ratio", fmt(m.sharpe, 2)], ["Maximum drawdown", pct(m.mdd, 1)]].map(function (k) { return '<div class="kpi"><small>' + k[0] + "</small><b>" + k[1] + "</b></div>"; }).join("");
  /* growth of $1, nominal and real */
  var lab = DT.slice(a - 1, END + 1), nom = [1], real = [1];
  for (var i = a; i <= END; i++) { nom.push(nom[nom.length - 1] * (1 + R[i])); real.push(real[real.length - 1] * (1 + RR[i])); }
  var ticks = []; lab.forEach(function (d, k) { var y = +d.slice(0, 4); if (d.slice(5) === "01" && y % (lab.length > 600 ? 20 : 5) === 0) ticks.push(k); });
  $("ch-growth").innerHTML = chart({ title: "Growth of one dollar", labels: lab.map(function (d) { return d.slice(0, 4); }), xticks: ticks, ylog: true, series: [{ values: nom, color: "--t1", w: 1.8 }, { values: real, color: "--t2", w: 1.8 }], yfmt: function (v) { return "$" + (v >= 1e6 ? fmt(v / 1e6) + "M" : v >= 1e3 ? fmt(v / 1e3) + "k" : v >= 1 ? fmt(v) : v); }, legend: [["Nominal, dividends reinvested: $1 became $" + fmt(nom[nom.length - 1]), "--t1"], ["After inflation: $" + fmt(real[real.length - 1]), "--t2"]] });
  /* drawdowns */
  var w = m.wealth, peakV = 1, dd = [0], eps = [], cur = null;
  for (var k = 1; k < w.length; k++) {
    if (w[k] >= peakV) { if (cur) { cur.rec = k; eps.push(cur); cur = null; } peakV = w[k]; dd.push(0); continue; }
    var d = w[k] / peakV - 1; dd.push(d);
    if (!cur) cur = { start: k - 1, trough: k, depth: d, rec: null };
    if (d < cur.depth) { cur.depth = d; cur.trough = k; }
  }
  if (cur) eps.push(cur);
  eps.sort(function (x, y) { return x.depth - y.depth; });
  $("ch-dd").innerHTML = chart({ title: "Drawdown", h: 220, labels: lab.map(function (d) { return d.slice(0, 4); }), xticks: ticks, series: [{ values: dd.map(function (v) { return 100 * v; }), color: "--t4", w: 1.4 }], ymin: -90, ymax: 0, yfmt: function (v) { return fmt(v) + "%"; }, legend: [["Fall from the previous peak, total return", "--t4"]] });
  $("dd-table").innerHTML = '<table><thead><tr><th>Peak</th><th>Bottom</th><th class="n">Depth</th><th class="n">Months to recover</th></tr></thead><tbody>' + eps.slice(0, 5).map(function (e) { return "<tr><td>" + ml(lab[e.start]) + "</td><td>" + ml(lab[e.trough]) + '</td><td class="n">' + pct(e.depth, 1) + '</td><td class="n">' + (e.rec === null ? "not yet" : fmt(e.rec - e.start)) + "</td></tr>"; }).join("") + "</tbody></table>";
  /* sources of return: dividend yield, price growth, inflation (geometric means) */
  var n = END - a + 1, pg = Math.pow(P[END] / P[a - 1], 12 / n) - 1, cg = Math.pow(CPI[END] / CPI[a - 1], 12 / n) - 1, tot = m.cagr, dy = (1 + tot) / (1 + pg) - 1;
  $("src-table").innerHTML = '<table><tbody><tr><td>Price growth</td><td class="n">' + pct(pg, 2) + '</td></tr><tr><td>Dividends reinvested</td><td class="n">' + pct(dy, 2) + '</td></tr><tr><td><b>Total return</b></td><td class="n"><b>' + pct(tot, 2) + '</b></td></tr><tr><td>Inflation</td><td class="n">' + pct(cg, 2) + '</td></tr><tr><td><b>Real return</b></td><td class="n"><b>' + pct(m.real, 2) + "</b></td></tr></tbody></table>";
  $("src-note").textContent = "Dividends supplied " + fmt(100 * dy / tot) + "% of the total return over this period. Ignoring them, as a price chart does, badly understates what an investor earned.";
}
$("seg-period").addEventListener("click", function (e) { var b = e.target.closest("[data-p]"); if (b) { per = +b.getAttribute("data-p"); renderPeriod(); } });
renderPeriod();

/* ---------- rolling windows ---------- */
function windows(monthly, N) {   /* annualised growth of every N-year window, from the cumulative index */
  var cum = [1]; for (var i = 1; i < NM; i++) cum.push(cum[i - 1] * (1 + monthly[i]));
  var k = 12 * N, out = []; for (i = k + 1; i < NM; i++) out.push(Math.pow(cum[i] / cum[i - k], 1 / N) - 1);   /* same windows as pandas shift(12 * N) */
  return out;
}
var HZ = 10;
function renderRoll() {
  var nw = windows(R, HZ), rw = windows(RR, HZ);
  $("hz-l").textContent = "Holding period: " + HZ + (HZ === 1 ? " year" : " years");
  var lossN = nw.filter(function (v) { return v < 0; }).length / nw.length, lossR = rw.filter(function (v) { return v < 0; }).length / rw.length;
  var srt = rw.slice().sort(function (a, b) { return a - b; });
  $("roll-kpis").innerHTML = [["Windows that lost money", pct(lossN, 1)], ["Windows that lost to inflation", pct(lossR, 1)], ["Worst window, real, per year", pct(srt[0], 1)], ["Median window, real, per year", pct(srt[Math.floor(srt.length / 2)], 1)]].map(function (k) { return '<div class="kpi"><small>' + k[0] + "</small><b>" + k[1] + "</b></div>"; }).join("");
  var lab = DT.slice(12 * HZ + 1), ticks = []; lab.forEach(function (d, k) { if (d.slice(5) === "01" && +d.slice(0, 4) % 20 === 0) ticks.push(k); });
  $("ch-roll").innerHTML = chart({ title: "Rolling real return", labels: lab.map(function (d) { return d.slice(0, 4); }), xticks: ticks, series: [{ values: rw.map(function (v) { return 100 * v; }), color: "--t3", w: 1.4 }, { values: rw.map(function () { return 0; }), color: "--muted", w: 1 }], yfmt: function (v) { return fmt(v) + "%"; }, legend: [["Real annual return of the " + HZ + "-year window ending in that month", "--t3"]] });
}
$("hz").addEventListener("input", function (e) { HZ = +e.target.value; renderRoll(); });
renderRoll();

/* ---------- prescriptive: equity share ---------- */
var MH = 10, MLOSS = 12;
function mixStats(w, N) {
  var m = [null]; for (var i = 1; i < NM; i++) m.push((1 + w * R[i] + (1 - w) * SAFE[i]) / (1 + INF[i]) - 1);
  var g = windows(m, N), s = g.slice().sort(function (a, b) { return a - b; });
  return { loss: g.filter(function (v) { return v < 0; }).length / g.length, med: s[Math.floor(s.length / 2)], worst: s[0] };
}
function renderMix() {
  $("mh-l").textContent = "Fund horizon: " + MH + " years";
  $("ml-l").textContent = "Largest acceptable chance of a real loss: " + MLOSS + "%";
  var rows = []; for (var w = 0; w <= 100; w += 10) { var s = mixStats(w / 100, MH); rows.push({ w: w, loss: s.loss, med: s.med, worst: s.worst }); }
  var ok = rows.filter(function (r) { return r.loss * 100 <= MLOSS; }), pick = ok.length ? ok.reduce(function (a, r) { return r.med > a.med ? r : a; }, ok[0]) : null;
  $("ch-mix").innerHTML = chart({ title: "Chance of a real loss by equity share", h: 230, labels: rows.map(function (r) { return r.w + "%"; }), series: [{ type: "bar", values: rows.map(function (r) { return 100 * r.loss; }), colors: rows.map(function (r) { return pick && r.w === pick.w ? "--t4" : r.loss * 100 <= MLOSS ? "--t4-soft" : "--line"; }), labels: rows.map(function (r) { return fmt(100 * r.loss, 0); }) }], yfmt: function (v) { return fmt(v) + "%"; }, legend: [["Share of past " + MH + "-year windows that ended below inflation, by % in shares", "--t4"]] });
  $("mix-table").innerHTML = '<table><thead><tr><th>In shares</th><th class="n">Chance of real loss</th><th class="n">Median real return / yr</th><th class="n">Worst real return / yr</th></tr></thead><tbody>' + rows.map(function (r) { return "<tr" + (pick && r.w === pick.w ? ' style="background:var(--t4-soft)"' : "") + "><td>" + r.w + '%</td><td class="n">' + pct(r.loss, 1) + '</td><td class="n">' + pct(r.med, 2) + '</td><td class="n">' + pct(r.worst, 2) + "</td></tr>"; }).join("") + "</tbody></table>";
  var safe0 = rows[0];
  $("memo").innerHTML = pick ? '<b class="k">Recommendation</b><span>Hold <b>' + pick.w + "% in shares</b>. Over past " + MH + "-year windows this mix lost to inflation " + pct(pick.loss, 1) + " of the time and earned a median " + pct(pick.med, 2) + " a year after inflation.</span><span>Note the 0% row: the safe asset alone lost to inflation in " + pct(safe0.loss, 0) + " of windows. Over long horizons, avoiding shares does not remove risk; it swaps market risk for inflation risk.</span>"
    : '<b class="k">No mix qualifies</b><span>No equity share kept the chance of a real loss below ' + MLOSS + "% over " + MH + " years. Lengthen the horizon, accept more risk, or look beyond these two assets.</span>";
}
$("mh").addEventListener("input", function (e) { MH = +e.target.value; renderMix(); });
$("ml").addEventListener("input", function (e) { MLOSS = +e.target.value; renderMix(); });
renderMix();

/* ---------- exercises ---------- */
var full = metrics(1, END), r10 = windows(RR, 10);
var bestMix = function (N, L) { var b = null; for (var w = 0; w <= 100; w += 10) { var s = mixStats(w / 100, N); if (s.loss * 100 <= L && (!b || s.med > b.med)) b = { w: w, med: s.med }; } return b ? b.w : -1; };
renderExercises("ex", [
  { q: "What was the real (after inflation) annual return of US shares from 1871 to 2023, in %?", type: "num", tol: 0.02, answer: function () { return 100 * full.real; }, placeholder: "e.g. 5.5", hint: "Choose “Full history” and read the second figure.", explain: function () { return "That turns $1 into about $" + fmt(Math.pow(1 + full.real, (NM - 1) / 12)) + " of today's purchasing power."; } },
  { q: "What was the maximum drawdown over the full history, in %?", type: "num", tol: 0.1, answer: function () { return 100 * full.mdd; }, placeholder: "e.g. -50", hint: "It is the deepest point of the drawdown chart: the 1929 to 1932 crash.", explain: function () { return "Monthly averages soften it; daily data show an even deeper fall."; } },
  { q: "What share of 10-year windows lost to inflation, in %?", type: "num", tol: 0.1, answer: function () { return 100 * r10.filter(function (v) { return v < 0; }).length / r10.length; }, placeholder: "e.g. 20", hint: "Set the holding period to 10 years.", explain: function () { return "About one ten-year stretch in nine left investors poorer in real terms."; } },
  { q: "For a 15-year horizon and at most a 5% chance of a real loss, which equity share does the rule pick?", type: "select", options: ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%", "100%", "No mix qualifies"], answer: (function () { var w = bestMix(15, 5); return w < 0 ? "No mix qualifies" : w + "%"; })(), hint: "Set the horizon to 15 and the acceptable chance to 5%.", explain: function () { return "Among the mixes inside the risk limit, the rule picks the one with the highest median real return."; } }
]);

/* ---------- code ---------- */
var CODE = [
  "import numpy as np",
  "import pandas as pd",
  "import quantstats as qs",
  "",
  'url = "https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv"',
  'd = pd.read_csv(url, parse_dates=["Date"], index_col="Date").loc[:"2023-06-01"]',
  "",
  "# monthly total return: price change plus one month of the annual dividend",
  'ret = ((d.SP500 + d.Dividend / 12) / d.SP500.shift(1) - 1).dropna()',
  'inflation = (d["Consumer Price Index"] / d["Consumer Price Index"].shift(1) - 1).dropna()',
  'risk_free = (d["Long Interest Rate"] / 1200).loc[ret.index]',
  "real = (1 + ret) / (1 + inflation) - 1",
  "",
  "n = len(ret)",
  'print("CAGR       ", round((1 + ret).prod() ** (12 / n) - 1, 4))',
  'print("Real CAGR  ", round((1 + real).prod() ** (12 / n) - 1, 4))',
  'print("Volatility ", round(qs.stats.volatility(ret, periods=12), 4))',
  'print("Sharpe     ", round(qs.stats.sharpe(ret - risk_free, periods=12), 4))',
  'print("Max drawdown", round(qs.stats.max_drawdown(ret), 4))',
  "",
  "# share of 10-year windows with a real loss",
  "growth = (1 + real).cumprod()",
  "ten_year = growth / growth.shift(120) - 1",
  'print("10y real loss share", round((ten_year.dropna() < 0).mean(), 4))'
].join("\n");
$("code").textContent = CODE; copyButton("copy", CODE);
