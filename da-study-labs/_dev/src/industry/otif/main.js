var pc = function (v, d) { return fmt(100 * v, d === undefined ? 1 : d) + "%"; };
$("data-line").textContent = fmt(DATA.total) + " orders scheduled for delivery " + DATA.years[0] + " to " + DATA.years[1] + ", with mode, route, product, vendor and destination.";

/* ---------- descriptive ---------- */
var route = {}; DATA.byRoute.forEach(function (r) { route[r[0]] = r; });
var lateN = Math.round(DATA.total * (1 - DATA.ot));
$("kpis").innerHTML = [["Orders", fmt(DATA.total)], ["On time", pc(DATA.ot)], ["Late orders", fmt(lateN)], ["Average delay of a late order", fmt((function () { var s = 0, n = 0; DATA.byRoute.forEach(function (r) { var l = r[1] * (1 - r[2]); s += l * r[3]; n += l; }); return s / n; })()) + " days"]]
  .map(function (k) { return '<div class="kpi"><small>' + k[0] + "</small><b>" + k[1] + "</b></div>"; }).join("");
var yr = DATA.byYear.filter(function (r) { return r[1] >= 100; });
$("ch-year").innerHTML = chart({ title: "On-time by year", h: 240, labels: yr.map(function (r) { return String(r[0]); }), series: [{ type: "bar", values: yr.map(function (r) { return 100 * r[2]; }), colors: yr.map(function (r) { return r[2] >= 0.95 ? "--t1" : "--t1-soft"; }), labels: yr.map(function (r) { return fmt(100 * r[2]); }) }], ymin: 0, ymax: 100, yfmt: function (v) { return fmt(v) + "%"; } });
$("ch-mode").innerHTML = chart({ title: "On-time by mode", h: 240, labels: DATA.byMode.map(function (r) { return r[0] + " (" + fmt(r[1]) + ")"; }), series: [{ type: "bar", width: 0.5, values: DATA.byMode.map(function (r) { return 100 * r[2]; }), color: "--t1", labels: DATA.byMode.map(function (r) { return fmt(100 * r[2], 1); }) }], ymin: 0, ymax: 100, yfmt: function (v) { return fmt(v) + "%"; } });

/* ---------- diagnostic ---------- */
$("rm-table").innerHTML = '<table><thead><tr><th>Route</th><th>Mode</th><th class="n">Orders</th><th class="n">On time</th><th class="n">Avg delay when late</th></tr></thead><tbody>' + DATA.byRouteMode.map(function (r) { var bad = r[3] < 0.85; return "<tr><td>" + r[0] + "</td><td>" + r[1] + '</td><td class="n">' + fmt(r[2]) + '</td><td class="n"' + (bad ? ' style="color:var(--bad);font-weight:600"' : "") + ">" + pc(r[3]) + '</td><td class="n">' + (r[3] < 1 ? fmt(r[4]) + " d" : "–") + "</td></tr>"; }).join("") + "</tbody></table>";
var cs = DATA.byCountry.slice().sort(function (a, b) { return a[2] - b[2]; });
$("ch-country").innerHTML = chart({ title: "On-time by country", h: 260, labels: cs.map(function (r) { return r[0].replace("Côte d'Ivoire", "Côte d'Iv.").replace("South Africa", "S. Africa").replace("Mozambique", "Mozamb."); }), series: [{ type: "bar", values: cs.map(function (r) { return 100 * r[2]; }), colors: cs.map(function (r) { return r[2] < 0.85 ? "--t4" : "--t2"; }), labels: cs.map(function (r) { return fmt(100 * r[2]); }) }], ymin: 0, ymax: 100, yfmt: function (v) { return fmt(v) + "%"; } });
var dir = route["Direct from vendor"], rdc = route["Regional DC"];
var rdcLate = rdc[1] * (1 - rdc[2]), allLate = DATA.byRoute.reduce(function (a, r) { return a + r[1] * (1 - r[2]); }, 0);
$("diag-text").innerHTML = "Orders from a <b>regional DC</b> were on time " + pc(rdc[2]) + " of the time against " + pc(dir[2]) + " for orders shipped <b>direct from the vendor</b>. The DCs handled " + pc(rdc[1] / DATA.total, 0) + " of orders but caused <b>" + pc(rdcLate / allLate, 0) + " of all late deliveries</b>. Within direct shipments, ocean freight is the weak spot. On-time performance also fell after 2009 and never returned to the 2007–2008 level; the model in the next step checks whether that is a real change over time or only a different mix of routes and modes.";

/* ---------- predictive: model ---------- */
var M = DATA.model, C = M.coef;
var key = { route: "C(route, Treatment('Direct from vendor'))[T.", mode: "C(mode, Treatment('Air'))[T.", product: "C(product, Treatment('Medicines'))[T.", period: "C(period)[T.", country: "C(country, Treatment('South Africa'))[T." };
var ors = [];
Object.keys(C).forEach(function (k) { if (k === "Intercept") return; var lab = k.replace(/^C\((\w+).*\[T\.(.*)\]$/, function (m, a, b) { return b + " (" + a + ")"; }); ors.push([lab, Math.exp(C[k]), Math.exp(M.ci[k][0]), Math.exp(M.ci[k][1]), M.p[k]]); });
ors.sort(function (a, b) { return b[1] - a[1]; });
(function () {
  var W = 680, rowH = 22, T = 10, H = T + ors.length * rowH + 34, L = 210, R = 20, lo = Math.log(0.1), hi = Math.log(10);
  var X = function (v) { return L + (W - L - R) * (Math.log(v) - lo) / (hi - lo); }, g = "";
  [0.1, 0.2, 0.5, 1, 2, 5, 10].forEach(function (v) { g += '<line class="grid" x1="' + X(v) + '" x2="' + X(v) + '" y1="' + T + '" y2="' + (H - 30) + '"/><text x="' + X(v) + '" y="' + (H - 12) + '" text-anchor="middle">' + v + "</text>"; });
  g += '<line x1="' + X(1) + '" x2="' + X(1) + '" y1="' + T + '" y2="' + (H - 30) + '" stroke="var(--ink)" stroke-width="1.5"/>';
  ors.forEach(function (o, i) { var y = T + i * rowH + rowH / 2, col = o[4] < 0.05 ? (o[1] > 1 ? "--t4" : "--t2") : "--muted";
    g += '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" style="fill:var(--ink)">' + esc(o[0].length > 30 ? o[0].slice(0, 29) + "…" : o[0]) + '</text><line x1="' + X(Math.max(0.1, o[2])) + '" x2="' + X(Math.min(10, o[3])) + '" y1="' + y + '" y2="' + y + '" stroke="var(' + col + ')" stroke-width="2"/><circle cx="' + X(Math.min(10, Math.max(0.1, o[1]))) + '" cy="' + y + '" r="5" fill="var(' + col + ')"/>'; });
  $("ch-or").innerHTML = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Odds ratios">' + g + '</svg><div class="legend"><span><i style="background:var(--t4)"></i>More likely late (p &lt; 0.05)</span><span><i style="background:var(--t2)"></i>Less likely late</span><span><i style="background:var(--muted)"></i>Not significant</span><span>Reference: direct from vendor, air, medicines, 2006–2011, South Africa. Test AUC ' + fmt(M.auc, 3) + "</span></div>";
})();
var L = DATA.levels, sel = { route: "Regional DC", mode: "Truck", product: "Medicines", period: "2012-2015", country: "Zambia" };
var NAMES = { route: "Route", mode: "Mode", product: "Product", period: "Period", country: "Destination" };
$("risk").innerHTML = Object.keys(NAMES).map(function (k) { return '<label class="num-in" for="rk-' + k + '">' + NAMES[k] + '<select id="rk-' + k + '" data-k="' + k + '" style="font:inherit;min-height:38px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--bg);color:var(--ink)">' + L[k].map(function (v) { return "<option" + (v === sel[k] ? " selected" : "") + ">" + esc(v) + "</option>"; }).join("") + "</select></label>"; }).join("");
var prob = function (s) { var z = C.Intercept; Object.keys(key).forEach(function (k) { var c = C[key[k] + s[k] + "]"]; if (c !== undefined) z += c; }); return 1 / (1 + Math.exp(-z)); };
function renderRisk() { var p = prob(sel); $("risk-kpi").innerHTML = '<div class="kpi"><small>Chance this order is late</small><b>' + pc(p) + '</b></div><div class="kpi"><small>Compared with the average order</small><b>' + fmt(p / (1 - DATA.ot), 1) + "×</b></div>"; }
$("risk").addEventListener("change", function (e) { var k = e.target.getAttribute("data-k"); if (k) { sel[k] = e.target.value; renderRisk(); } });
renderRisk();

/* ---------- prescriptive: buffers ---------- */
var LANES = Object.keys(DATA.dist), TGT = 95, INF = 98;
var otWith = function (lane, b) { var c = DATA.dist[lane].counts, s = 0; for (var k = 0; k <= Math.min(b, 120); k++) s += c[k]; return s / DATA.dist[lane].n; };
var bufFor = function (lane, t) { for (var b = 0; b <= 120; b++) if (otWith(lane, b) >= t) return b; return null; };
function renderBuf() {
  $("tgt-l").textContent = "On-time target: " + TGT + "%"; $("inf-l").textContent = "Assumed in-full rate: " + INF + "%";
  var rows = LANES.map(function (l) { var p = l.split("|"); return { lane: p[0] + " · " + p[1], n: DATA.dist[l].n, ot0: otWith(l, 0), b: bufFor(l, TGT / 100) }; });
  rows.forEach(function (r) { r.ot = r.b === null ? null : otWith(LANES[rows.indexOf(r)], r.b); });
  $("ch-buffer").innerHTML = chart({ title: "Buffer needed", h: 240, labels: rows.map(function (r) { return r.lane.replace("Direct from vendor · ", "Direct ").replace("Regional DC · ", "DC ").replace("Air Charter", "charter").replace("Air", "air").replace("Ocean", "ocean").replace("Truck", "truck"); }), series: [{ type: "bar", width: 0.55, values: rows.map(function (r) { return r.b === null ? 120 : r.b; }), colors: rows.map(function (r) { return r.b > 14 ? "--t4" : "--t4-soft"; }), labels: rows.map(function (r) { return r.b === null ? ">120" : r.b + " d"; }) }], yfmt: function (v) { return fmt(v) + " d"; }, legend: [["Extra days in the promised date to reach " + TGT + "% on time", "--t4"]] });
  $("buf-table").innerHTML = '<table><thead><tr><th>Route · mode</th><th class="n">Orders</th><th class="n">On time now</th><th class="n">Buffer</th><th class="n">OTIF with buffer</th></tr></thead><tbody>' + rows.map(function (r) { return "<tr><td>" + r.lane + '</td><td class="n">' + fmt(r.n) + '</td><td class="n">' + pc(r.ot0) + '</td><td class="n"><b>' + (r.b === null ? ">120 d" : r.b + " d") + '</b></td><td class="n">' + (r.ot === null ? "–" : pc(r.ot * INF / 100)) + "</td></tr>"; }).join("") + "</tbody></table>";
  var worst = rows.filter(function (r) { return r.b !== null; }).sort(function (a, b) { return b.b - a.b; })[0];
  var otifCap = INF;
  $("memo").innerHTML = '<b class="k">Recommendation</b><span>Quote route-specific promise dates instead of one standard lead time. The biggest buffer is needed for <b>' + worst.lane + "</b>: " + worst.b + " extra days to reach " + TGT + "% on time.</span><span>Even with perfect timing, OTIF cannot exceed the in-full rate (" + otifCap + "%). If the OTIF target is above it, buffers alone will not get there; the fix is stock availability, not transport.</span><span>Buffers hide problems as well as absorb them. For the DC truck lanes, fixing the cause (stock at the DC, dispatch planning) is cheaper than promising customers a later date.</span>";
}
$("tgt").addEventListener("input", function (e) { TGT = +e.target.value; renderBuf(); });
$("inf").addEventListener("input", function (e) { INF = +e.target.value; renderBuf(); });
renderBuf();

/* ---------- exercises ---------- */
var orRdc = Math.exp(C[key.route + "Regional DC]"]);
renderExercises("ex", [
  { q: "What was the on-time rate across all orders, in %?", type: "num", tol: 0.05, answer: function () { return 100 * DATA.ot; }, placeholder: "e.g. 90.0", hint: "It is the second figure at the top of the descriptive section.", explain: function () { return "So roughly one order in eight arrived late."; } },
  { q: "What was the on-time rate of orders trucked from a regional DC, in %?", type: "num", tol: 0.05, answer: function () { return 100 * DATA.byRouteMode.filter(function (r) { return r[0] === "Regional DC" && r[1] === "Truck"; })[0][3]; }, placeholder: "e.g. 80.0", hint: "Read the route and mode table.", explain: function () { return "The largest lane with the lowest on-time rate: the first place to look."; } },
  { q: "By what factor does shipping from a regional DC multiply the odds of a late delivery, holding the other factors fixed?", type: "num", tol: 0.05, answer: function () { return orRdc; }, placeholder: "e.g. 2.5", hint: "It is the odds ratio for Regional DC in the model chart: e to the power of its coefficient.", explain: function () { return "The coefficient is " + fmt(C[key.route + "Regional DC]"], 3) + ", and e^" + fmt(C[key.route + "Regional DC]"], 3) + " ≈ " + fmt(orRdc, 2) + "."; } },
  { q: "How many buffer days does a regional DC truck order need to reach 95% on time?", type: "num", tol: 0.01, answer: function () { return bufFor("Regional DC|Truck", 0.95); }, placeholder: "e.g. 10", hint: "Set the target to 95% and read the table.", explain: function () { return "That is the 95th percentile of its delays."; } }
]);

/* ---------- code ---------- */
var CODE = [
  "import numpy as np",
  "import pandas as pd",
  "import statsmodels.formula.api as smf",
  "",
  'url = "https://raw.githubusercontent.com/jrcinco/supply-chain-shipment-price-data/master/SCMS_Delivery_History_Dataset.csv"',
  'd = pd.read_csv(url, encoding="utf-8-sig")',
  'sched = pd.to_datetime(d["Scheduled Delivery Date"], format="%d-%b-%y")',
  'deliv = pd.to_datetime(d["Delivered to Client Date"], format="%d-%b-%y")',
  'd["late"] = ((deliv - sched).dt.days > 0).astype(int)',
  'd["route"] = d["Fulfill Via"].map({"Direct Drop": "Direct from vendor", "From RDC": "Regional DC"})',
  'd["mode"] = d["Shipment Mode"]',
  'd["product"] = np.where(d["Product Group"] == "HRDT", "HIV test kits", "Medicines")',
  'd["period"] = np.where(sched.dt.year <= 2011, "2006-2011", "2012-2015")',
  "top10 = d.Country.value_counts().index[:10]",
  'd["country"] = np.where(d.Country.isin(top10), d.Country, "Other")',
  "d = d.dropna(subset=[\"mode\"])",
  "",
  'print("on time:", round(1 - d.late.mean(), 4))',
  'print(1 - d.groupby(["route", "mode"]).late.mean())',
  "",
  "train = d.sample(frac=0.7, random_state=42)",
  "model = smf.logit(\"late ~ C(route) + C(mode) + C(product, Treatment('Medicines')) + C(period)\"",
  "                  \" + C(country, Treatment('South Africa'))\", data=train).fit()",
  "print(np.exp(model.params).round(2))   # odds ratios"
].join("\n");
$("code").textContent = CODE; copyButton("copy", CODE);
