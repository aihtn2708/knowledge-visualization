var LOC = DATA.loc, DEM = DATA.dem, NL = LOC.length;
var M = LOC.map(function (a) { return LOC.map(function (b) { return Math.abs(a[0] - b[0]) * 114 + Math.abs(a[1] - b[1]) * 80; }); });
var km = function (u) { return u / 100; };          /* 1 distance unit = 10 m */
var rdist = function (r) { var s = [0].concat(r).concat([0]), d = 0; for (var i = 1; i < s.length; i++) d += M[s[i - 1]][s[i]]; return d; };
var total = function (routes) { return routes.reduce(function (a, r) { return a + rdist(r); }, 0); };
function nearest(cap) {
  var left = []; for (var i = 1; i < NL; i++) left.push(i);
  var routes = [];
  while (left.length) {
    var load = 0, cur = 0, route = [];
    for (;;) {
      var cand = left.filter(function (c) { return load + DEM[c] <= cap; }); if (!cand.length) break;
      cand.sort(function (a, b) { return M[cur][a] - M[cur][b] || a - b; });
      var nx = cand[0]; route.push(nx); load += DEM[nx]; left.splice(left.indexOf(nx), 1); cur = nx;
    }
    routes.push(route);
  }
  return routes;
}
function twoOpt(route) {
  var best = route.slice(), improved = true;
  while (improved) {
    improved = false;
    for (var i = 0; i < best.length - 1; i++) for (var j = i + 1; j < best.length; j++) {
      var cand = best.slice(0, i).concat(best.slice(i, j + 1).reverse()).concat(best.slice(j + 1));
      if (rdist(cand) < rdist(best)) { best = cand; improved = true; }
    }
  }
  return best;
}
function savings(cap) {
  var routes = {}, owner = {}, load = {}, S = [], i, j;
  for (i = 1; i < NL; i++) { routes[i] = [i]; owner[i] = i; load[i] = DEM[i]; }
  for (i = 1; i < NL; i++) for (j = i + 1; j < NL; j++) S.push([M[0][i] + M[0][j] - M[i][j], i, j]);
  S.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1] || a[2] - b[2]; });
  S.forEach(function (s) {
    if (s[0] <= 0) return;
    var a0 = owner[s[1]], b0 = owner[s[2]]; if (a0 === b0 || load[a0] + load[b0] > cap) return;
    var a = routes[a0], b = routes[b0], x = s[1], y = s[2], nw = null;
    if (a[a.length - 1] === x && b[0] === y) nw = a.concat(b);
    else if (a[0] === x && b[b.length - 1] === y) nw = b.concat(a);
    else if (a[0] === x && b[0] === y) nw = a.slice().reverse().concat(b);
    else if (a[a.length - 1] === x && b[b.length - 1] === y) nw = a.concat(b.slice().reverse());
    if (!nw) return;
    routes[a0] = nw; load[a0] += load[b0]; delete routes[b0]; delete load[b0]; nw.forEach(function (c) { owner[c] = a0; });
  });
  return Object.keys(routes).map(function (k) { return routes[k]; });
}
var CAPS = [15, 30, 60], TRUCK = { 15: "1.5-tonne van", 30: "3.5-tonne truck", 60: "8-tonne truck" };
var METHODS = [["nn", "Nearest neighbour"], ["nn2", "Nearest neighbour + 2-opt"], ["sv", "Savings"], ["ort", "OR-Tools"]];
var plan = function (method, cap) {
  if (method === "nn") return nearest(cap);
  if (method === "nn2") return nearest(cap).map(twoOpt);
  if (method === "sv") return savings(cap);
  return DATA.trucks[TRUCK[cap]].routes;
};
var st = { cap: 15, method: "ort" };

/* ---------- map ---------- */
var COLORS = ["--t1", "--t2", "--t3", "--t4", "--spine", "--muted"];
function drawMap(routes) {
  var W = 560, H = 440, pad = 34, sx = (W - 2 * pad) / 8, sy = (H - 2 * pad) / 8;
  var P = function (k) { return [pad + LOC[k][0] * sx, H - pad - LOC[k][1] * sy]; };
  var g = "";
  for (var i = 0; i <= 8; i++) { g += '<line class="grid" x1="' + (pad + i * sx) + '" x2="' + (pad + i * sx) + '" y1="' + pad + '" y2="' + (H - pad) + '"/><line class="grid" y1="' + (pad + i * sy) + '" y2="' + (pad + i * sy) + '" x1="' + pad + '" x2="' + (W - pad) + '"/>'; }
  (routes || []).forEach(function (r, ri) {
    var seq = [0].concat(r).concat([0]), d = "";
    seq.forEach(function (k, j) { var p = P(k); if (j === 0) d += "M" + p[0] + " " + p[1]; else { var q = P(seq[j - 1]); d += " L" + p[0] + " " + q[1] + " L" + p[0] + " " + p[1]; } });
    g += '<path d="' + d + '" fill="none" stroke="var(' + COLORS[ri % COLORS.length] + ')" stroke-width="3" stroke-linejoin="round" opacity="0.85" transform="translate(' + (ri * 3 - 4) + "," + (ri * 3 - 4) + ')"/>';
  });
  for (var k = 1; k < NL; k++) { var p = P(k), rad = 6 + DEM[k] * 1.2; g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + rad + '" fill="var(--node)" stroke="var(--ink)" stroke-width="1.5"/><text x="' + p[0] + '" y="' + (p[1] + 4) + '" text-anchor="middle" style="fill:var(--node-ink);font-weight:600">' + k + "</text>"; }
  var d0 = P(0); g += '<rect x="' + (d0[0] - 12) + '" y="' + (d0[1] - 12) + '" width="24" height="24" rx="4" fill="var(--ink)"/><text x="' + d0[0] + '" y="' + (d0[1] + 4) + '" text-anchor="middle" style="fill:var(--bg);font-weight:600">W</text>';
  $("map").innerHTML = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Map of stores and routes">' + g + "</svg>";
  $("map-legend").innerHTML = '<span>W = warehouse; circle size = roll cages; numbers are store ids</span>' + (routes ? routes.map(function (r, ri) { return '<span><i style="background:var(' + COLORS[ri % COLORS.length] + ')"></i>Truck ' + (ri + 1) + ": " + r.reduce(function (a, c) { return a + DEM[c]; }, 0) + " cages, " + fmt(km(rdist(r)), 1) + " km</span>"; }).join("") : "");
}
var tot = DEM.reduce(function (a, b) { return a + b; }, 0), far = 0; for (var i = 1; i < NL; i++) far = Math.max(far, M[0][i]);
$("kpis").innerHTML = [["Stores", NL - 1], ["Roll cages to deliver", tot], ["Largest drop", Math.max.apply(null, DEM) + " cages"], ["Farthest store", fmt(km(far), 1) + " km"]].map(function (k) { return '<div class="kpi"><small>' + k[0] + "</small><b>" + k[1] + "</b></div>"; }).join("");
$("dem-table").innerHTML = '<table><thead><tr><th>Store</th><th class="n">Cages</th><th class="n">km from warehouse</th></tr></thead><tbody>' + LOC.slice(1).map(function (l, k) { return "<tr><td>" + (k + 1) + '</td><td class="n">' + DEM[k + 1] + '</td><td class="n">' + fmt(km(M[0][k + 1]), 2) + "</td></tr>"; }).join("") + "</tbody></table>";
var outBack = 0; for (i = 1; i < NL; i++) outBack += 2 * M[0][i];
var best15 = DATA.trucks[TRUCK[15]].distance;
$("diag-text").innerHTML = "If each store were served by its own trip from the warehouse and back, the trucks would drive <b>" + fmt(km(outBack), 1) + " km</b> a day. Most of that is the same road driven twice. Linking nearby stores into one route removes the empty return legs: the best plan with 1.5-tonne vans drives <b>" + fmt(km(best15), 1) + " km</b>, " + fmt(100 * (1 - best15 / outBack)) +
  "% less. The second driver is capacity: " + tot + " cages and 15 cages per van mean at least <b>" + Math.ceil(tot / 15) + " vans</b>, however clever the routes. Bigger trucks remove that limit, which is the trade-off explored below.";

/* ---------- compare ---------- */
function renderCompare() {
  $("seg-cap").innerHTML = CAPS.map(function (c) { return '<button data-cap="' + c + '" aria-pressed="' + (c === st.cap) + '">' + c + " cages (" + TRUCK[c] + ")</button>"; }).join("");
  $("seg-method").innerHTML = METHODS.map(function (m) { return '<button data-m="' + m[0] + '" aria-pressed="' + (m[0] === st.method) + '">' + m[1] + "</button>"; }).join("");
  var rows = METHODS.map(function (m) { var r = plan(m[0], st.cap); return [m[1], r.length, total(r), m[0] === st.method]; }), best = Math.min.apply(null, rows.map(function (r) { return r[2]; }));
  $("cmp-table").innerHTML = '<table><thead><tr><th>Method, ' + st.cap + '-cage trucks</th><th class="n">Trucks</th><th class="n">km per day</th><th class="n">vs best</th></tr></thead><tbody>' + rows.map(function (r) { return "<tr" + (r[3] ? ' style="background:var(--t3-soft)"' : "") + "><td>" + r[0] + '</td><td class="n">' + r[1] + '</td><td class="n">' + fmt(km(r[2]), 1) + '</td><td class="n">' + (r[2] === best ? "best" : "+" + fmt(100 * (r[2] / best - 1), 1) + "%") + "</td></tr>"; }).join("") + "</tbody></table>";
  drawMap(plan(st.method, st.cap));
}
$("seg-cap").addEventListener("click", function (e) { var b = e.target.closest("[data-cap]"); if (b) { st.cap = +b.getAttribute("data-cap"); renderCompare(); } });
$("seg-method").addEventListener("click", function (e) { var b = e.target.closest("[data-m]"); if (b) { st.method = b.getAttribute("data-m"); renderCompare(); } });
renderCompare();

/* ---------- prescriptive ---------- */
var kmMul = 1, fxMul = 1;
function renderCost() {
  $("km-l").textContent = "Cost per km: " + Math.round(kmMul * 100) + "% of the base rate (fuel, tolls, wear)";
  $("fx-l").textContent = "Fixed cost per truck: " + Math.round(fxMul * 100) + "% of the base rate (driver, depreciation)";
  var rows = CAPS.map(function (c) { var t = DATA.trucks[TRUCK[c]], fixed = t.vehicles * t.fixed * fxMul, run = t.km * t.rate * kmMul; return { name: TRUCK[c], cap: c, v: t.vehicles, km: t.km, fixed: fixed, run: run, cost: fixed + run, base: [t.fixed, t.rate] }; });
  var best = rows.reduce(function (a, r) { return r.cost < a.cost ? r : a; }, rows[0]);
  $("ch-cost").innerHTML = chart({ title: "Daily cost by truck type", h: 230, labels: rows.map(function (r) { return r.name; }), series: [{ type: "bar", width: 0.5, values: rows.map(function (r) { return r.cost / 1e6; }), colors: rows.map(function (r) { return r === best ? "--t4" : "--t4-soft"; }), labels: rows.map(function (r) { return fmt(r.cost / 1e6, 2) + "M"; }) }], yfmt: function (v) { return fmt(v, 1) + "M"; }, legend: [["Cost per day, million VND", "--t4"]] });
  $("cost-table").innerHTML = '<table><thead><tr><th>Truck</th><th class="n">Base cost / day</th><th class="n">Base cost / km</th><th class="n">Trucks</th><th class="n">km</th><th class="n">Total / day</th></tr></thead><tbody>' + rows.map(function (r) { return "<tr" + (r === best ? ' style="background:var(--t4-soft)"' : "") + "><td>" + r.name + " (" + r.cap + ')</td><td class="n">' + fmt(r.base[0]) + '</td><td class="n">' + fmt(r.base[1]) + '</td><td class="n">' + r.v + '</td><td class="n">' + fmt(r.km, 1) + '</td><td class="n"><b>' + fmt(r.cost) + "</b></td></tr>"; }).join("") + "</tbody></table>";
  var second = rows.filter(function (r) { return r !== best; }).reduce(function (a, r) { return r.cost < a.cost ? r : a; });
  $("memo").innerHTML = '<b class="k">Recommendation</b><span>Run <b>' + best.v + " × " + best.name + "</b>: " + fmt(best.km, 1) + " km and <b>" + fmt(best.cost) + " VND</b> a day, " + fmt(second.cost - best.cost) + " VND (" + fmt(100 * (second.cost / best.cost - 1), 1) + "%) cheaper than the next option, " + second.name + ".</span><span>The margin is small, so check it against what the model leaves out: an 8-tonne truck doing all 16 stops alone takes much longer and may break delivery windows, while vans are easier to park at small stores.</span>";
}
$("km").addEventListener("input", function (e) { kmMul = e.target.value / 100; renderCost(); });
$("fx").addEventListener("input", function (e) { fxMul = e.target.value / 100; renderCost(); });
renderCost();

/* ---------- exercises ---------- */
var nn15 = total(nearest(15)), ort15 = DATA.trucks[TRUCK[15]].distance;
renderExercises("ex", [
  { q: "What is the minimum number of 1.5-tonne vans (15 cages each) needed, whatever the routes?", type: "num", tol: 0.01, answer: function () { return Math.ceil(tot / 15); }, placeholder: "e.g. 3", hint: "Divide total demand by capacity and round up.", explain: function () { return tot + " cages ÷ 15 = " + fmt(tot / 15, 1) + ", so " + Math.ceil(tot / 15) + " vans."; } },
  { q: "How many km a day does plain nearest neighbour drive with 1.5-tonne vans?", type: "num", tol: 0.06, answer: function () { return km(nn15); }, placeholder: "e.g. 70.5", hint: "Choose 15 cages and Nearest neighbour in the comparison.", explain: function () { return "A greedy rule is easy to follow but leaves long return legs."; } },
  { q: "By what percentage does OR-Tools cut the distance of plain nearest neighbour for 1.5-tonne vans?", type: "num", tol: 0.15, answer: function () { return 100 * (1 - ort15 / nn15); }, placeholder: "e.g. 15", hint: "(nearest neighbour km − OR-Tools km) ÷ nearest neighbour km.", explain: function () { return "Over a year of daily rounds that is " + fmt(km(nn15 - ort15) * 300) + " km saved at 300 working days."; } },
  { q: "Which truck type is cheapest at the base costs (both sliders at 100%)?", type: "select", options: CAPS.map(function (c) { return TRUCK[c]; }), answer: (function () { var b = null, bc = Infinity; CAPS.forEach(function (c) { var t = DATA.trucks[TRUCK[c]], cst = t.vehicles * t.fixed + t.km * t.rate; if (cst < bc) { bc = cst; b = TRUCK[c]; } }); return b; })(), hint: "Reset both sliders to 100% and read the cost table.", explain: function () { return "Fewer, mid-sized trucks balance fixed and running costs."; } }
]);

/* ---------- code ---------- */
var CODE = [
  "from ortools.constraint_solver import pywrapcp, routing_enums_pb2",
  "",
  "# Grid coordinates from the OR-Tools CVRP example; node 0 is the depot",
  "LOC = " + JSON.stringify(LOC).replace(/\],\[/g, "), (").replace("[[", "[(").replace("]]", ")]"),
  "DEMAND = " + JSON.stringify(DEM),
  "CAPACITY, VEHICLES = 15, 4",
  "# street distance: 114 units per block east-west, 80 north-south (1 unit = 10 m)",
  "D = [[abs(a[0] - b[0]) * 114 + abs(a[1] - b[1]) * 80 for b in LOC] for a in LOC]",
  "",
  "manager = pywrapcp.RoutingIndexManager(len(D), VEHICLES, 0)",
  "routing = pywrapcp.RoutingModel(manager)",
  "dist = routing.RegisterTransitCallback(lambda i, j: D[manager.IndexToNode(i)][manager.IndexToNode(j)])",
  "routing.SetArcCostEvaluatorOfAllVehicles(dist)",
  "demand = routing.RegisterUnaryTransitCallback(lambda i: DEMAND[manager.IndexToNode(i)])",
  'routing.AddDimensionWithVehicleCapacity(demand, 0, [CAPACITY] * VEHICLES, True, "Capacity")',
  "",
  "params = pywrapcp.DefaultRoutingSearchParameters()",
  "params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC",
  "params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH",
  "params.time_limit.FromSeconds(5)",
  "solution = routing.SolveWithParameters(params)",
  "",
  "for v in range(VEHICLES):",
  "    i, stops = routing.Start(v), []",
  "    while not routing.IsEnd(i):",
  "        stops.append(manager.IndexToNode(i))",
  "        i = solution.Value(routing.NextVar(i))",
  '    print(f"Truck {v + 1}: {stops + [0]}")',
  'print("Total distance:", solution.ObjectiveValue() / 100, "km")'
].join("\n");
$("code").textContent = CODE; copyButton("copy", CODE);
