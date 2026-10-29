var BINS = DATA.bins, IV = DATA.iv, CARD = DATA.card, BASE = DATA.base;
var nice = function (v) { return v.replace(/_/g, " ").replace(/\bin percentage of\b/, "as % of"); };
var binLabel = function (b) { return String(b).replace(/%,%/g, ", "); };
var vars = Object.keys(IV).sort(function (a, b) { return IV[b] - IV[a]; });
var B = 50 / Math.LN2, A = 600 + B * Math.log(1 / 19);                 /* scorecardpy scaling: points0 600, odds0 1/19, pdo 50 */
var pdOf = function (score) { return 1 / (1 + Math.exp((score - A) / B)); };   /* score = A - B ln(bad odds) */
var allBad = 0, allN = 0; BINS[vars[0]].forEach(function (r) { allBad += r[3]; allN += r[1]; });

/* ---------- descriptive ---------- */
$("var").innerHTML = vars.map(function (v) { return '<option value="' + v + '">' + esc(nice(v)) + "</option>"; }).join("");
function renderVar() {
  var v = $("var").value, rows = BINS[v];
  $("ch-bin").innerHTML = chart({ title: "Bad rate by bin", h: 250, labels: rows.map(function (r, i) { return "bin " + (i + 1); }), series: [{ type: "bar", values: rows.map(function (r) { return 100 * r[4]; }), colors: rows.map(function (r) { return r[4] > allBad / allN ? "--t4" : "--t2"; }), labels: rows.map(function (r) { return fmt(100 * r[4]) + "%"; }) }, { values: rows.map(function () { return 100 * allBad / allN; }), color: "--muted", dash: true, w: 1.4 }], yfmt: function (x) { return fmt(x) + "%"; }, ymin: 0, legend: [["Bad rate in the bin", "--t4"], ["Average bad rate " + fmt(100 * allBad / allN) + "%", "--muted"]] });
  $("bin-table").innerHTML = '<table><thead><tr><th>Bin</th><th class="n">Applicants</th><th class="n">Bad rate</th><th class="n">WoE</th></tr></thead><tbody>' + rows.map(function (r, i) { return '<tr><td style="white-space:normal;min-width:180px"><b>' + (i + 1) + ".</b> " + esc(binLabel(r[0])) + '</td><td class="n">' + r[1] + '</td><td class="n">' + fmt(100 * r[4], 1) + '%</td><td class="n">' + (r[5] >= 0 ? "+" : "") + fmt(r[5], 2) + "</td></tr>"; }).join("") + '</tbody></table><p class="muted" style="font-size:0.85rem;padding:8px 12px">IV of this attribute: <b>' + fmt(IV[v], 3) + "</b></p>";
}
$("var").addEventListener("change", renderVar); renderVar();

/* ---------- diagnostic ---------- */
var band = function (iv) { return iv < 0.02 ? "useless" : iv < 0.1 ? "weak" : iv < 0.3 ? "medium" : "strong"; };
$("ch-iv").innerHTML = chart({ title: "Information value", h: 300, labels: vars.map(function (v, i) { return String(i + 1); }), series: [{ type: "bar", values: vars.map(function (v) { return IV[v]; }), colors: vars.map(function (v) { return CARD[v] ? "--t2" : "--line"; }), labels: vars.map(function (v) { return fmt(IV[v], 2); }) }], yfmt: function (x) { return fmt(x, 1); }, legend: [["Information value, attributes ranked 1 to " + vars.length + " (in the final scorecard)", "--t2"], ["Dropped by the model", "--line"]] });
$("iv-text").innerHTML = "Ranked: " + vars.map(function (v, i) { return "<b>" + (i + 1) + "</b> " + esc(nice(v)) + " (" + fmt(IV[v], 2) + ", " + band(IV[v]) + ")"; }).join("; ") + ". The state of the applicant's current account is by far the strongest signal: applicants with no current account at this bank had the lowest bad rate, and those with an overdrawn account or a balance under 200 DM the highest. Weak attributes such as telephone or job were filtered out before binning (on their raw IV), and the penalised regression kept all " + vars.filter(function (v) { return CARD[v]; }).length + " attributes that remained, each with its own weight.";

/* ---------- predictive: scorer ---------- */
var cardVars = vars.filter(function (v) { return CARD[v]; }), pick = {};
/* start from the most common answer for each attribute (a typical applicant) */
cardVars.forEach(function (v) { var cnt = {}; BINS[v].forEach(function (r) { cnt[r[0]] = r[1]; }); var best = 0; CARD[v].forEach(function (r, i) { if ((cnt[r[0]] || 0) > (cnt[CARD[v][best][0]] || 0)) best = i; }); pick[v] = best; });
function renderScorer() {
  $("scorer").innerHTML = cardVars.map(function (v) {
    return '<label class="num-in" for="sc-' + v + '">' + esc(nice(v)) + '<select id="sc-' + v + '" data-v="' + v + '" style="font:inherit;font-size:0.86rem;min-height:38px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--bg);color:var(--ink)">' +
      CARD[v].map(function (r, i) { return '<option value="' + i + '"' + (i === pick[v] ? " selected" : "") + ">" + esc(binLabel(r[0])) + "  (" + (r[1] > 0 ? "+" + fmt(r[1]) : r[1] < 0 ? "−" + fmt(-r[1]) : "0") + " points)</option>"; }).join("") + "</select></label>";
  }).join("");
  updateScore();
}
function updateScore() {
  var s = BASE; cardVars.forEach(function (v) { s += CARD[v][pick[v]][1]; });
  $("score-kpis").innerHTML = '<div class="kpi"><small>Score (base ' + fmt(BASE) + ")</small><b>" + fmt(s) + '</b></div><div class="kpi"><small>Estimated chance of default</small><b>' + fmt(100 * pdOf(s), 1) + "%</b></div>";
}
$("scorer").addEventListener("change", function (e) { var v = e.target.getAttribute("data-v"); if (v) { pick[v] = +e.target.value; updateScore(); } });
renderScorer();
/* score distribution, test set */
var TS = DATA.test.score, TB = DATA.test.bad, lo = 300, hi = 750, step = 25, nb = (hi - lo) / step;
var hg = [], hb = [], labs = []; for (var k = 0; k < nb; k++) { hg.push(0); hb.push(0); labs.push(String(lo + k * step)); }
TS.forEach(function (s, i) { var k = Math.min(nb - 1, Math.max(0, Math.floor((s - lo) / step))); if (TB[i]) hb[k]++; else hg[k]++; });
$("ch-dist").innerHTML = chart({ title: "Score distribution", h: 220, labels: labs, xticks: [0, 4, 8, 12, 16], series: [{ type: "bar", width: 0.42, values: hg, color: "--t2" }, { values: hb, color: "--t4", w: 2.2 }], yfmt: function (x) { return fmt(x); }, legend: [["Good borrowers per 25-point band", "--t2"], ["Bad borrowers", "--t4"]] });
$("perf").innerHTML = [["AUC, test", fmt(DATA.auc[1], 3)], ["KS, test", fmt(DATA.ks, 3)], ["Gini, test", fmt(DATA.gini, 3)]].map(function (k) { return '<div class="kpi"><small>' + k[0] + "</small><b>" + k[1] + "</b></div>"; }).join("");

/* ---------- prescriptive: cut-off ---------- */
var CUT = 500, RATIO = 5, NT = TS.length, NBAD = TB.reduce(function (a, b) { return a + b; }, 0);
function evalCut(c, ratio) { var ab = 0, ag = 0, dg = 0; TS.forEach(function (s, i) { if (s >= c) { if (TB[i]) ab++; else ag++; } else if (!TB[i]) dg++; }); return { appr: ab + ag, ab: ab, dg: dg, cost: ratio * ab + dg }; }
function bestCut(ratio) { var b = null; for (var c = 300; c <= 750; c++) { var e = evalCut(c, ratio); if (!b || e.cost < b.cost) { b = e; b.c = c; } } return b; }
function renderCut() {
  var e = evalCut(CUT, RATIO), best = bestCut(RATIO);
  $("cut-l").textContent = "Approve applicants scoring at least " + CUT;
  $("ratio-l").textContent = "Cost of approving a bad borrower: " + RATIO + " × the cost of declining a good one";
  $("cut-kpis").innerHTML = [["Approval rate", fmt(100 * e.appr / NT, 1) + "%"], ["Bad rate among approved", e.appr ? fmt(100 * e.ab / e.appr, 1) + "%" : "–"], ["Bads approved / goods declined", e.ab + " / " + e.dg], ["Total cost", fmt(e.cost)]].map(function (k) { return '<div class="kpi"><small>' + k[0] + "</small><b>" + k[1] + "</b></div>"; }).join("");
  var cs = [], lab = [], tk = []; for (var c = 300; c <= 750; c += 5) { cs.push(evalCut(c, RATIO).cost); lab.push(String(c)); if (c % 75 === 0) tk.push(lab.length - 1); }
  $("ch-cost").innerHTML = chart({ title: "Cost by cut-off", h: 250, labels: lab, xticks: tk, series: [{ values: cs, color: "--t4", w: 2.2 }], vline: [Math.round((CUT - 300) / 5), "your cut-off"], yfmt: function (x) { return fmt(x); }, legend: [["Total cost on the 300 test applicants, by cut-off", "--t4"]] });
  $("memo").innerHTML = '<b class="k">Recommendation</b><span>At a ' + RATIO + " : 1 cost ratio the cheapest cut-off is <b>" + best.c + "</b>: approve " + fmt(100 * best.appr / NT) + "% of applicants with a " + fmt(100 * best.ab / best.appr, 1) + "% bad rate, for a cost of " + fmt(best.cost) + " against " + fmt(RATIO * NBAD) + " if everyone were approved.</span><span>Lower the cost ratio, as a lender with better collections or higher margins would, and the best cut-off falls, so more people get credit.</span>";
}
$("cut").addEventListener("input", function (ev) { CUT = +ev.target.value; renderCut(); });
$("ratio").addEventListener("input", function (ev) { RATIO = +ev.target.value; renderCut(); });
renderCut();

/* ---------- exercises ---------- */
var b5 = bestCut(5);
renderExercises("ex", [
  { q: "What is the bad rate across all 1,000 applicants, in %?", type: "num", tol: 0.05, answer: function () { return 100 * allBad / allN; }, placeholder: "e.g. 25", hint: "It is the dashed line in the bad rate chart.", explain: function () { return "A high base rate: this sample over-represents bad loans compared with most portfolios."; } },
  { q: "What is the information value of the current account status attribute (2 decimals)?", type: "num", tol: 0.006, answer: function () { return IV.status_of_existing_checking_account; }, placeholder: "e.g. 0.25", hint: "Select it in the attribute list, or read the IV chart.", explain: function () { return "Above 0.3, so a strong predictor."; } },
  { q: "What is the AUC on the 300 test applicants (3 decimals)?", type: "num", tol: 0.0006, answer: function () { return DATA.auc[1]; }, placeholder: "e.g. 0.750", hint: "Shown under the score distribution.", explain: function () { return "0.5 is a coin toss and 1.0 is perfect; around 0.8 is typical for application scorecards."; } },
  { q: "With the dataset's 5 : 1 cost ratio, what is the lowest total cost any cut-off reaches on the test set?", type: "num", tol: 0.5, answer: function () { return b5.cost; }, placeholder: "e.g. 200", hint: "Set the ratio to 5 and look for the bottom of the cost curve.", explain: function () { return "It is reached at a cut-off of " + b5.c + "."; } }
]);

/* ---------- code ---------- */
var CODE = [
  "import scorecardpy as sc",
  "from sklearn.linear_model import LogisticRegression",
  "from sklearn.metrics import roc_auc_score",
  "",
  "dat = sc.germancredit()",
  'dat["creditability"] = (dat["creditability"] == "bad").astype(int)   # 1 = bad borrower',
  "",
  "dt_s = sc.var_filter(dat, y=\"creditability\")              # drop IV < 0.02 and similar",
  "train, test = sc.split_df(dt_s, \"creditability\").values() # 70 / 30 split",
  "bins = sc.woebin(dt_s, y=\"creditability\")                 # weight-of-evidence binning",
  "train_woe, test_woe = sc.woebin_ply(train, bins), sc.woebin_ply(test, bins)",
  "",
  "X_tr, y_tr = train_woe.drop(columns=\"creditability\"), train_woe[\"creditability\"]",
  "X_te, y_te = test_woe.drop(columns=\"creditability\"), test_woe[\"creditability\"]",
  "lr = LogisticRegression(penalty=\"l1\", C=0.9, solver=\"saga\", max_iter=5000, random_state=0).fit(X_tr, y_tr)",
  "print(\"test AUC\", round(roc_auc_score(y_te, lr.predict_proba(X_te)[:, 1]), 3))",
  "",
  "card = sc.scorecard(bins, lr, X_tr.columns)   # 600 points = 19:1 odds, 50 points to double",
  "test_score = sc.scorecard_ply(test, card, print_step=0)",
  "",
  "# cheapest cut-off with the UCI cost matrix: bad approved = 5, good declined = 1",
  "best = min(range(300, 751), key=lambda c: 5 * ((test_score.score >= c) & (y_te == 1)).sum()",
  "                                         + ((test_score.score < c) & (y_te == 0)).sum())",
  "print(\"best cut-off\", best)"
].join("\n");
$("code").textContent = CODE; copyButton("copy", CODE);
