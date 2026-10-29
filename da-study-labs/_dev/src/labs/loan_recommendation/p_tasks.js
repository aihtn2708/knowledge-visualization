  /* ---------- tasks ---------- */
  var flatVals = function (rows) { var v = []; rows.forEach(function (r) { r.forEach(function (x) { v.push(x); }); }); return v; };
  var hasNum = function (vals, n) { return n !== null && vals.some(function (x) { return typeof x === "number" && Math.abs(x - n) < 0.051; }); };
  var hasAny = function (vals, list) { return list.some(function (n) { return hasNum(vals, n); }); };
  var colOf = function (k, j) { return res[k].rows.map(function (r) { return r[j]; }); };
  var diffFrom = function (list, base) { return list.filter(function (n) { return n !== null && !hasNum(base, n); }); };
  var countHits = function (vals, list) { return list.filter(function (n) { return hasNum(vals, n); }).length; };

  /* a small model of the policy, used only to recognise common slips */
  var worstD = {}, hasHist = {};
  HI.forEach(function (h) { worstD[h[1]] = Math.max(worstD[h[1]] || 0, h[5]); hasHist[h[1]] = true; });
  var PRS = PR.map(function (p) { return { id: p[0], name: p[1], minScore: p[2], minInc: p[3], maxAmt: p[4], maxTerm: p[5], rate: p[6], dti: p[7], thin: p[8] }; });
  var elig = function (a, p, o) {
    o = o || {};
    if (!o.noKO && (worstD[a[0]] || 0) > 90) return false;
    if (a[1] < p.minInc) return false;
    if (a[3] === null) return !o.noThin && p.thin === 1;
    return a[3] >= p.minScore;
  };
  var avgBy = function (keyFn, valFn, labels) {
    var s = {}, n = {};
    AP.forEach(function (a) { var k = keyFn(a), v = valFn(a); if (v === null) return; s[k] = (s[k] || 0) + v; n[k] = (n[k] || 0) + 1; });
    return labels.map(function (l) { return n[l] ? Math.round(s[l] / n[l]) : null; });
  };
  var bandAlt = (function () {
    var out = [];
    [[701, -1], [701, 1], [501, -1], [501, 1]].forEach(function (c) {
      var hi = c[0] === 701 ? 701 + c[1] : 701, me = c[0] === 501 ? 501 + c[1] : 501;
      out = out.concat(avgBy(function (a) { var s = a[3]; return s === null ? "N" : s >= hi ? "H" : s >= me ? "M" : "L"; }, function (a) { return a[1]; }, ["H", "M", "L"]));
    });
    return diffFrom(out, colOf("1", 2));
  })();
  var histAlt = (function () {
    var out = [], loanCount = [];
    [[91, -1], [91, 1], [10, -1], [10, 1]].forEach(function (c) {
      var sv = c[0] === 91 ? 91 + c[1] : 91, wa = c[0] === 10 ? 10 + c[1] : 10;
      out = out.concat(avgBy(function (a) { var w = worstD[a[0]]; return !hasHist[a[0]] ? "N" : w >= sv ? "S" : w >= wa ? "W" : "C"; }, function (a) { return a[3]; }, ["C", "W", "S"]));
    });
    return { avg: diffFrom(out, colOf("2", 2)), loans: (function () {
      var c = { N: 0, C: 0, W: 0, S: 0 }; HI.forEach(function (h) { var w = worstD[h[1]]; c[w >= 91 ? "S" : w >= 10 ? "W" : "C"]++; });
      return diffFrom([c.C, c.W, c.S], colOf("2", 1));
    })() };
  })();
  var noThinCounts = PRS.map(function (p) { return AP.filter(function (a) { return elig(a, p, { noThin: true }); }).length; });
  var noKOCounts = PRS.map(function (p) { return AP.filter(function (a) { return elig(a, p, { noKO: true }); }).length; });
  var cheapest = PRS.slice().sort(function (x, y) { return x.rate - y.rate || x.id - y.id; });
  var pickCounts = function (reverse) {
    var c = { Prime: 0, Standard: 0, Starter: 0, Micro: 0, "No offer": 0 };
    AP.forEach(function (a) { var list = reverse ? cheapest.slice().reverse() : cheapest, p = list.filter(function (x) { return elig(a, x); })[0]; c[p ? p.name : "No offer"]++; });
    return ["Prime", "Standard", "Starter", "Micro", "No offer"].map(function (k) { return c[k]; });
  };
  var priciestCounts = diffFrom(pickCounts(true), colOf("4", 1));
  var eligCountsT3 = diffFrom(colOf("3", 1), colOf("4", 1));
  var offerTotals = function (o) {
    o = o || {};
    var tot = {};
    AP.forEach(function (a) {
      var p = cheapest.filter(function (x) { return elig(a, x); })[0]; if (!p) return;
      var term = Math.min(a[5], p.maxTerm), room = p.dti * a[1] - a[2], afford = room * term / (1 + p.rate * term / 12);
      var amount = Math.min(a[4], p.maxAmt, o.noAfford ? Infinity : Math.max(afford, 0));
      var offer = o.nearest ? Math.round(amount / 1e6) * 1e6 : Math.floor(amount / 1e6) * 1e6;
      if (offer >= DATA.minOffer) tot[p.name] = (tot[p.name] || 0) + offer;
    });
    return ["Prime", "Standard", "Starter", "Micro"].map(function (k) { return tot[k] || 0; });
  };
  var noAffordTotals = diffFrom(offerTotals({ noAfford: true }), colOf("5", 2));
  var nearestTotals = diffFrom(offerTotals({ nearest: true }), colOf("5", 2));
  var grandTotal = colOf("5", 2).reduce(function (s, x) { return s + x; }, 0);

  var rulesHtml = function (t) { return t.rules ? '<ol class="steps">' + t.rules.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>" : ""; };
  var XLC = function (k, extra) { var c = DATA.xl[String(k)]; for (var key in extra) c[key] = extra[key]; return c; };

  var TASKS = [
    {
      lv: "Warm-up", title: "Score bands", skills: "CASE, NULL, average",
      q: "Group the applicants by credit score band: High (701 to 850), Medium (501 to 700), Low (300 to 500) and No score (blank). How many applicants are in each band and what is their average monthly income? Round the average to whole VND.",
      out: "band, applicants, avg_income", order: "High, Medium, Low, No score",
      slip: function (vals) {
        if (hasAny(vals, bandAlt)) return "An average looks like a band boundary is one point off. 501 to 700 is Medium, and 701 and above is High.";
        if (hasNum(vals, res["1"].rows[0][2]) && !hasNum(vals, res["1"].rows[3][2])) return "The No score band is missing. Applicants with a blank score still belong in the result.";
        return null;
      },
      check: { label: "Applicants in the High band", answer: res["1"].rows[0][1], tol: 0.5, placeholder: "e.g. 23" },
      hints: [
        "First put every applicant in one band, then count and average per band. Do not forget the people with no score.",
        "SQL: a CASE expression gives the band, then GROUP BY. A NULL score matches no WHEN branch, so it lands in ELSE. Python: if/elif with a first test for None. Excel: COUNTIFS and AVERAGEIFS with the band limits, and the blank rows handled on their own line.",
        "In Excel the No score row needs a blank test: COUNTIFS(range, \"=\") counts blank cells, and AVERAGEIFS(income, score, \"=\") averages their incomes."
      ],
      think: {
        sql: "CASE reads top to bottom and the first true branch wins, so the order of the WHEN lines is the logic. NULL never satisfies a comparison, which is why ELSE catches it.",
        py: "None is a value you test for first, before any comparison. Comparing None with a number would be an error in Python, so the order of the checks matters here too.",
        xl: "Every band is a row with its own limits in cells you can change. The blank band needs its own formula, which shows how different missing data is from a low number."
      },
      xl: XLC(1, { start: "D2", note: "Work area: the <b>answer</b> sheet below. Column B and C hold the band limits. Fill D (number of applicants) and E (their average monthly income, rounded) from the <code>applicants</code> sheet. The No score row has no limits, so it needs a different formula." })
    },
    {
      lv: "Core", title: "Credit history profile", skills: "LEFT JOIN, worst of, missing history",
      q: "Look at each applicant's worst past delinquency (the largest max_dpd over all their past loans). Classify them: No history (no past loans), Clean (worst dpd 9 or less), Watch (10 to 90) or Severe (91 or more). How many applicants are in each class and what is their average credit score, rounded to a whole number?",
      out: "history_class, applicants, avg_score", order: "No history, Clean, Watch, Severe (the average for No history is empty)",
      slip: function (vals) {
        if (hasAny(vals, histAlt.avg)) return "An average looks like a boundary is one day off. 9 days late is still Clean, 10 is Watch, 90 is still Watch and 91 is Severe.";
        if (countHits(vals, histAlt.loans) >= 2) return "These counts look like past loans, not applicants. Reduce history to one row per applicant first.";
        return null;
      },
      check: { label: "Applicants in the Watch class", answer: res["2"].rows[2][1], tol: 0.5, placeholder: "e.g. 15" },
      hints: [
        "history has one row per past loan, but you classify people. Collapse it to one number per applicant first, using the worst max_dpd.",
        "SQL: a CTE with MAX(max_dpd) GROUP BY applicant_id, then LEFT JOIN from applicants so people without history stay. Python: a dict {applicant: worst dpd}, and a missing key means no history. Excel: COUNTIF to detect no history, then MAXIFS.",
        "AVG ignores NULL, and a class where every score is blank has no average at all. In Excel wrap the average in IFERROR(..., \"\")."
      ],
      think: {
        sql: "LEFT JOIN keeps applicants that have no history rows. They show up with NULL, and you decide what NULL means in the CASE expression.",
        py: "A dict is the lookup table. The absence of a key is information, so \"k not in worst\" is the test for no history, and the average needs its own guard against dividing by zero.",
        xl: "A helper column holds each person's worst dpd and another holds the class. Empty and zero are different things here, so a COUNTIF decides first."
      },
      xl: XLC(2, { start: "C2", note: "Work area: the <b>answer</b> sheet below (scroll inside the grid). Columns A and B copy the applicants. Fill C (worst dpd from the <code>history</code> sheet, empty if none) and D (class) for every applicant, then the summary table in F to H." })
    },
    {
      lv: "Core", title: "Who is eligible?", skills: "join on rules, NULL rule",
      q: "For each product, how many applicants are eligible?",
      rules: ["The worst max_dpd over the applicant's past loans is 90 or less (no history counts as 0).", "monthly_income is at least the product's min_income.", "credit_score is at least min_score, or the score is blank and the product has thin_file_ok = 1."],
      out: "product, eligible_applicants", order: "by product_id",
      slip: function (vals) {
        if (hasAny(vals, diffFrom(noThinCounts, colOf("3", 1)))) return "A count leaves out people with no score. A blank score never passes score >= min_score, so test for it explicitly and allow it when thin_file_ok = 1.";
        if (hasAny(vals, diffFrom(noKOCounts, colOf("3", 1)))) return "A count includes applicants who were 91 or more days late. They are not eligible for any product.";
        return null;
      },
      check: { label: "Applicants eligible for Standard", answer: res["3"].rows[1][1], tol: 0.5, placeholder: "e.g. 26" },
      hints: [
        "Every applicant is compared with every product. Think of all pairs (applicant, product) and keep the pairs where the three rules hold.",
        "SQL: JOIN products ON the three conditions, with the worst dpd from a LEFT JOIN. Python: a function eligible(applicant, product) called in two nested loops. Excel: COUNTIFS with the limits read from the products sheet by INDEX.",
        "The score rule has two branches: (score >= min_score) OR (score IS NULL AND thin_file_ok = 1). In Excel, count scored applicants with \">=\"&min_score, and for thin_file_ok products add those with no score (all applicants passing the other rules minus the scored ones)."
      ],
      think: {
        sql: "The rules are the ON clause of a join. Brackets around the OR branch matter, because AND binds tighter than OR.",
        py: "The policy becomes a function with early returns, one line per rule. Reading it top to bottom is like reading the policy.",
        xl: "COUNTIFS cannot say OR, so the thin-file branch is a second count that is added only when thin_file_ok is 1. Multiplying by the flag does that."
      },
      xl: XLC(3, { start: "G2", note: "Work area: the <b>answer</b> sheet below (scroll inside the grid). Columns A to D copy the applicants, with their worst dpd (0 if no history). Fill G (the product name) and H (number of eligible applicants) for the four products in F." })
    },
    {
      lv: "Stretch", title: "Recommend one product", skills: "first match, rank within group",
      q: "Recommend each applicant the cheapest product they are eligible for (lowest flat_rate). How many applicants get each product, and how many get No offer?",
      out: "recommended_product, applicants", order: "Prime, Standard, Starter, Micro, No offer",
      slip: function (vals) {
        if (countHits(vals, eligCountsT3) >= 2) return "These are the eligibility counts from task 3. Each applicant must get only one product, the cheapest one they are eligible for.";
        if (countHits(vals, priciestCounts) >= 2) return "It looks like the most expensive eligible product was picked. Cheapest means the lowest flat_rate, which is Prime first.";
        return null;
      },
      check: { label: "Applicants who get No offer", answer: res["4"].rows[4][1], tol: 0.5, placeholder: "e.g. 11" },
      hints: [
        "An applicant can be eligible for several products but gets only one. Order the eligible products by flat_rate and keep the first.",
        "SQL: ROW_NUMBER() OVER (PARTITION BY applicant_id ORDER BY flat_rate), keep rn = 1, and LEFT JOIN from applicants so people with no product are counted too. Python: loop over the products sorted by rate and stop at the first match. Excel: a 0/1 grid of eligibility, then the first 1 in each row.",
        "In Excel, MATCH(1, E2:H2, 0) returns the position of the first 1 in the row, and INDEX turns the position into a product name. Wrap it in IFERROR(..., \"No offer\")."
      ],
      think: {
        sql: "A window function numbers the candidates inside each applicant. Filtering rn = 1 is a set operation, and the LEFT JOIN keeps the applicants with no candidates.",
        py: "A for loop with a break is the natural shape: try the cheapest first and stop. After the loop, a flag or None says that nothing matched.",
        xl: "The grid shows every product for every applicant, so an underwriter sees which product failed and why. The first 1 in each row is the recommendation."
      },
      xl: XLC(4, { start: "E2", note: "Work area: the <b>answer</b> sheet below (scroll inside the grid). Columns A to D copy the applicants. Fill the 0/1 eligibility grid E to H (product names are in row 1, rules on the <code>products</code> sheet), then I (recommended product), then the counts in K and L." })
    },
    {
      lv: "Stretch", title: "Offer and affordability", skills: "formula chain, round down",
      q: "Make each applicant an offer on the product recommended in task 4, then total the offers per product: how many offers, the total offered amount and the total interest?",
      rules: ["term = the smaller of requested_term and the product's max_term, in months.", "room = max_dti × monthly_income − existing_installments: what the budget allows for installments each month.", "With flat interest a loan of X costs X × (1 + flat_rate × term / 12) over the term, so the largest affordable X = room × term ÷ (1 + flat_rate × term / 12).", "amount = the smallest of requested_amount, the product's max_amount and the affordable X (use 0 if X is negative), rounded down to whole millions of VND.", "If the amount is under 5,000,000 there is no offer.", "interest = offer × flat_rate × term / 12, rounded to whole VND for each applicant."],
      out: "product, offers, total_offer, total_interest", order: "by product_id",
      slip: function (vals) {
        if (hasAny(vals, noAffordTotals)) return "A total looks like it ignores the budget limit. Cap each offer by what the installments can afford: max_dti × income − existing installments.";
        if (hasAny(vals, nearestTotals)) return "A total looks like the amount was rounded to the nearest million. Round down, so the offer never exceeds what the person can afford.";
        return null;
      },
      check: { label: "Total offered amount over all four products (VND)", answer: grandTotal, tol: 0.5, placeholder: "e.g. 2000000000" },
      hints: [
        "Build the offer in steps, one number per step: term, affordable amount, capped amount, final offer, interest. Do it for the recommended product of each applicant, then total per product.",
        "SQL: reuse the task 4 recommendation, then compute the steps in CTEs with MIN and MAX of several values, CAST(x / 1000000 AS INTEGER) * 1000000 to round down, and filter offer >= 5000000. Python: min(a, b, c), max(x, 0) and floor division // by 1000000. Excel: one helper column per step.",
        "room = max_dti × income − existing_installments, and it can be negative, so use MAX(afford, 0). Skip applicants with no recommendation. Rounding down with // or ROUNDDOWN(x, -6) never rounds up."
      ],
      think: {
        sql: "MIN and MAX with several arguments pick the binding limit in one expression. Each step is a named column in a CTE, so the chain reads from top to bottom.",
        py: "Each step is a variable inside the loop, and continue skips applicants with no offer. The totals are three dicts updated at the end of the loop body.",
        xl: "One column per step makes the chain auditable: a reviewer can see which limit bound each offer. Change max_dti on the products sheet and every offer moves."
      },
      xl: XLC(5, { start: "G2", note: "Work area: the <b>answer</b> sheet below (scroll inside the grid). Columns A to F copy the applicants with their recommended product id (0 means no offer). Fill G to K for every applicant (term, affordable amount, capped amount, offer, interest), then the summary table in M to Q." })
    }
  ];

  var APPS_PY = AP.map(function (r) { var o = {}; ACOLS.forEach(function (c, i) { o[c] = r[i]; }); return o; });
  var HIST_PY = HI.map(function (r) { var o = {}; HCOLS.forEach(function (c, i) { o[c] = r[i]; }); return o; });
  var PROD_PY = PR.map(function (r) { var o = {}; PCOLS.forEach(function (c, i) { o[c] = r[i]; }); return o; });

  var starters = {
    sql: function (t) { return "-- Tables: applicants, history, products\n-- Return these columns: " + t.out + " (" + t.order + ")\n\n"; },
    py: function (t) {
      return "# Ready to use (credit_score is None when blank):\n#   applicants - list of dicts: applicant_id, monthly_income, existing_installments, credit_score, requested_amount, requested_term\n#   history    - list of dicts: history_id, applicant_id, product_type, opened, amount, max_dpd, status\n#   products   - list of dicts: product_id, name, min_score, min_income, max_amount, max_term, flat_rate, max_dti, thin_file_ok\n" +
        "# Finish with:  result = [ (...), (...) ]   one tuple per row with: " + t.out + "\n# Order: " + t.order + "\n\n";
    }
  };
