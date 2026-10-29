  /* ---------- tasks ---------- */
  var flatVals = function (rows) { var v = []; rows.forEach(function (r) { r.forEach(function (x) { v.push(x); }); }); return v; };
  var hasNum = function (vals, n) { return vals.some(function (x) { return typeof x === "number" && Math.abs(x - n) < 0.051; }); };
  var hasAny = function (vals, list) { return list.some(function (n) { return hasNum(vals, n); }); };
  var colOf = function (k, j) { return res[k].rows.map(function (r) { return r[j]; }); };
  var diffFrom = function (list, base) { return list.filter(function (n) { return !hasNum(base, n); }); };

  var LB = RU.map(function (r) { return r[2]; });            /* lower bounds: 0, 10, 91, 181, 361 */
  var grpOf = function (dpd, shiftIdx, shift) { var g = 1; for (var i = 1; i < LB.length; i++) if (dpd >= LB[i] + (i === shiftIdx ? shift : 0)) g = i + 1; return g; };
  var RATE = {}; RU.forEach(function (r) { RATE[r[0]] = r[4]; });
  /* wrong balances per group if one boundary is off by a day (strict instead of inclusive, or the other way) */
  var altBalances = (function () {
    var out = [];
    [1, 2, 3, 4].forEach(function (i) { [-1, 1].forEach(function (s) {
      var b = [0, 0, 0, 0, 0]; LN.forEach(function (l) { b[grpOf(l[6], i, s) - 1] += l[5]; }); out = out.concat(b);
    }); });
    return diffFrom(out, colOf("1", 3));
  })();
  var altProvPrincipal = (function () {
    var p = {}; LN.forEach(function (l) { var g = grpOf(l[6]); p[g] = (p[g] || 0) + l[4]; });
    return Object.keys(p).map(function (g) { return Math.round(p[g] * RATE[g]); });
  })();
  var total = res["3"].rows[0][0], npl = res["3"].rows[0][1], prov = res["3"].rows[0][3];
  var cnt = { all: LN.length, bad: LN.filter(function (l) { return grpOf(l[6]) >= 3; }).length };
  var balG = colOf("1", 3);
  var nplWithG2 = Math.round(10000 * (balG[1] + npl) / total) / 100;
  var nplByCount = Math.round(10000 * cnt.bad / cnt.all) / 100;
  var covOnTotal = Math.round(10000 * prov / total) / 100;
  var swapped = (function () {
    var m = {}; for (var a = 1; a <= 5; a++) for (var b = 1; b <= 5; b++) m[a + "_" + b] = 0;
    LN.forEach(function (l) { m[grpOf(l[6]) + "_" + grpOf(l[7])]++; });
    var out = []; for (var a2 = 1; a2 <= 5; a2++) for (var b2 = 1; b2 <= 5; b2++) if (m[a2 + "_" + b2] > 1 && res["5"].rows[a2 - 1][b2] !== m[a2 + "_" + b2]) out.push(m[a2 + "_" + b2]);
    return out;
  })();

  var XLC = function (k, extra) { var c = DATA.xl[String(k)]; for (var key in extra) c[key] = extra[key]; return c; };

  var TASKS = [
    {
      lv: "Warm-up", title: "Classify the book", skills: "range join, group by",
      q: "Put every loan into its debt group using its days past due. How many loans and how much outstanding balance sit in each group?",
      out: "grp, label, loans, outstanding", order: "by grp, 1 to 5",
      slip: function (vals) { return hasAny(vals, altBalances) ? "A balance looks like a loan on a boundary is in the wrong group. 10, 91, 181 and 361 days past due already belong to the worse group, while 9, 90, 180 and 360 do not." : null; },
      check: { label: "Loans in group 2 (special mention)", answer: res["1"].rows[1][2], tol: 0.5, placeholder: "e.g. 22" },
      hints: [
        "Think in sets: the rules table already says which dpd range belongs to which group. Match each loan to the rule whose range contains its dpd.",
        "SQL: JOIN rules ON dpd BETWEEN min_dpd AND max_dpd, then GROUP BY. Python: a small function group_of(dpd) and two dicts that you update in a loop. Excel: COUNTIFS and SUMIFS on dpd with a lower and an upper limit read from the rules sheet.",
        "BETWEEN includes both ends. In Excel the limits are \">=\"&min and \"<=\"&max. The last group has max_dpd 99999, so it catches everything above 360."
      ],
      think: {
        sql: "The rule lives in a table, so classification is just a join on a range. If the regulator moves a threshold, you edit one row and every query follows.",
        py: "The rule becomes a function. You call it once per loan and keep the totals in dicts, so you decide how to handle a group that has no loans yet.",
        xl: "Each group row asks two questions at once: how many loans fall inside the range, and what do they add up to? The limits sit in cells you can read and change."
      },
      xl: XLC(1, { start: "B2", note: "Work area: the <b>answer</b> sheet below. Column A holds the group numbers. Fill B, C and D: the group name, the number of loans and the outstanding balance of loans whose dpd is inside the group's range on the <code>rules</code> sheet." })
    },
    {
      lv: "Core", title: "Provision per group", skills: "lookup, multiply, round",
      q: "How much provision must be set aside for each group? Provision = the group's outstanding balance × its provision rate. Round the provision to whole VND.",
      out: "grp, outstanding, provision_rate, provision", order: "by grp, 1 to 5",
      slip: function (vals) { return hasAny(vals, altProvPrincipal) ? "A provision looks like it was calculated on the original principal. Use the outstanding balance, which is what the customer still owes." : null; },
      check: { label: "Total provision (VND)", answer: prov, tol: 0.5, placeholder: "e.g. 410000000" },
      hints: [
        "Same grouping as task 1, but now each group also carries a rate that you read from the rules table.",
        "SQL: SUM(outstanding) * provision_rate, and ROUND the result. Python: a dict {grp: rate}, then round(balance * rate). Excel: INDEX the rate from the rules sheet using the group number, then ROUND the product.",
        "Group 1 has rate 0, so its provision is 0. The rate is a fraction (0.05 means 5%). Provision is charged on the outstanding balance, not on the original principal."
      ],
      think: {
        sql: "The rate comes along for free because the join already brought the whole rules row. Grouping by the rate as well keeps the query standard SQL.",
        py: "Two small dicts do the work of a join: one for balances, one for rates. The multiplication happens after the loop, once per group.",
        xl: "INDEX picks the rate by position, so the rate is a visible cell you could change to test a what-if. Round in the same row so the totals add up."
      },
      xl: XLC(2, { start: "B2", note: "Work area: the <b>answer</b> sheet below. Column A holds the group numbers. Fill B (outstanding), C (the rate from the <code>rules</code> sheet) and D (provision, rounded to whole VND)." })
    },
    {
      lv: "Core", title: "Portfolio health KPIs", skills: "conditional totals, ratios",
      q: "Give the risk committee one row: total outstanding, outstanding in bad debt (groups 3 to 5), the NPL ratio, the total provision, and the coverage ratio. NPL ratio = bad debt ÷ total outstanding. Coverage = total provision ÷ bad debt. Both as percentages with 2 decimals.",
      out: "total_outstanding, npl_outstanding, npl_ratio_pct, total_provision, coverage_pct", order: "a single row",
      slip: function (vals) {
        if (hasNum(vals, nplWithG2)) return "That NPL ratio includes group 2. Special mention is not bad debt: NPL means groups 3, 4 and 5 only.";
        if (hasNum(vals, nplByCount)) return "That NPL ratio counts loans. Use balances: bad debt outstanding ÷ total outstanding.";
        if (hasNum(vals, covOnTotal)) return "Coverage divides the provision by the bad debt, not by the whole portfolio.";
        var frac = vals.some(function (x) { return typeof x === "number" && x > 0 && x < 1; });
        return frac ? "Give ratios as percentages, so multiply the fraction by 100." : null;
      },
      check: { label: "NPL ratio (%)", answer: res["3"].rows[0][2], tol: 0.05, placeholder: "e.g. 13.7" },
      hints: [
        "Everything you need is one number per group. Classify first, then add up with conditions.",
        "SQL: SUM(CASE WHEN grp >= 3 THEN outstanding ELSE 0 END) next to SUM(outstanding), all in one SELECT. Python: three running totals updated in one loop. Excel: use the workings table below the answer row (one line per group) and SUM parts of it.",
        "NPL ratio = 100 × bad debt ÷ total. Coverage = 100 × total provision ÷ bad debt. Round both to 2 decimals and the provision to whole VND."
      ],
      think: {
        sql: "A CASE expression turns a condition into a number, so one pass over the table gives all the totals side by side. No temporary variables are needed.",
        py: "Running totals are the natural way to think here: add to the total, add to the provision, and add to bad debt only when the group is 3 or higher.",
        xl: "A small workings table makes the logic visible. The headline row is just SUM over parts of it, so a reviewer can follow every number back to a group."
      },
      xl: XLC(3, { start: "A2", note: "Work area: the <b>answer</b> sheet below. Row 2 is the result you will report. Rows 4 to 9 are a workings table: fill B and C there first (outstanding and provision per group), then build the five results in row 2 from it." })
    },
    {
      lv: "Stretch", title: "One customer, one group", skills: "group max, second pass",
      q: "The regulation says a customer's loans at the same lender are classified in the customer's worst group. Give every loan the highest group among all loans of its customer, then count the loans and add up the outstanding balance in each group.",
      out: "grp, loans, outstanding", order: "by grp, 1 to 5",
      slip: function (vals) { return hasAny(vals, diffFrom(balG, colOf("4", 2))) ? "These balances are the ones from task 1. Apply the one-customer rule first: every loan takes the worst group of its customer." : null; },
      check: { label: "Outstanding in group 5 after the rule (VND)", answer: res["4"].rows[4][2], tol: 0.5, placeholder: "e.g. 462500000" },
      hints: [
        "Two steps: first find the worst group of every customer, then give that group back to each of the customer's loans.",
        "SQL: MAX(grp) OVER (PARTITION BY customer_id) adds the worst group to every row. Python: one loop that fills a dict {customer: worst group}, and a second loop that counts. Excel: a helper column with the loan's own group, and another with MAXIFS over the customer's loans.",
        "In Excel, MATCH(dpd, rules!min_dpd, 1) with match type 1 finds the group directly, because the minimums are sorted. Then MAXIFS(own_grp, customer_id, this customer)."
      ],
      think: {
        sql: "A window function keeps every loan row and attaches a number computed over its customer. The answer is still a set operation, with no loop.",
        py: "You need two passes. The first builds a lookup of the worst group per customer, and only then can the second pass use it. The order of the steps matters.",
        xl: "Helper columns show each step on each loan, which is great for audit. The price is 120 rows of formulas that you fill down and keep in sync with the data."
      },
      xl: XLC(4, { start: "E2", note: "Work area: the <b>answer</b> sheet below (scroll inside the grid). Columns A to D copy the loans. Fill E (own group) and F (worst group of the customer) for every loan, then the summary table in H to J." })
    },
    {
      lv: "Stretch", title: "Roll-rate matrix", skills: "two classifications, pivot",
      q: "Build the roll-rate matrix: rows show the group of a loan last month (from dpd_prev), columns show its group now (from dpd). Each cell counts loans. Cells on the diagonal stayed, cells left of it improved, cells to the right of it deteriorated.",
      out: "from_grp, to_1, to_2, to_3, to_4, to_5", order: "by from_grp, 1 to 5",
      slip: function (vals) { var n = 0; swapped.forEach(function (x) { if (hasNum(vals, x)) n++; }); return n >= 2 ? "It looks like the two months are swapped. Rows are last month's group (dpd_prev), columns are this month's group (dpd)." : null; },
      check: { label: "Loans that moved from group 2 to group 3", answer: res["5"].rows[1][3], tol: 0.5, placeholder: "e.g. 3" },
      hints: [
        "Every loan has two groups now: one from dpd_prev and one from dpd. The matrix counts the loans for each pair.",
        "SQL: join rules twice (alias them from and to), then SUM(CASE WHEN to.grp = n THEN 1 ELSE 0 END) for each column. Python: a nested dict matrix[from][to] and one += 1 per loan. Excel: one COUNTIFS with four conditions, filled down and right.",
        "In Excel the row group is in column A and the column group in row 1. Use $A2 and B$1 so the references stay put when you fill, and read the limits with INDEX from the rules sheet."
      ],
      think: {
        sql: "Joining the same table twice under two names is how SQL handles two classifications. The pivot into columns is a row of SUM(CASE ...) expressions.",
        py: "A two-level dict is the matrix. One line inside the loop updates the right cell, and the layout (5 × 5) is decided by your two range loops.",
        xl: "The matrix is a grid, which is what Excel is made for: one formula with mixed references, filled down and right, produces all 25 cells."
      },
      xl: XLC(5, { start: "B2", note: "Work area: the <b>answer</b> sheet below. Row labels (last month's group) are in column A, column labels (this month's group) in row 1. One COUNTIFS formula filled down and right gives all 25 cells." })
    }
  ];

  var LOANS_PY = LN.map(function (r) { var o = {}; LCOLS.forEach(function (c, i) { o[c] = r[i]; }); return o; });
  var RULES_PY = RU.map(function (r) { var o = {}; RCOLS.forEach(function (c, i) { o[c] = r[i]; }); return o; });

  var starters = {
    sql: function (t) { return "-- Tables: loans, rules\n-- Return these columns: " + t.out + " (" + t.order + ")\n\n"; },
    py: function (t) {
      return "# Ready to use:\n#   loans - list of dicts: loan_id, customer_id, product, disbursed, principal, outstanding, dpd, dpd_prev\n#   rules - list of dicts: grp, label, min_dpd, max_dpd, provision_rate\n" +
        "# Finish with:  result = [ (...), (...) ]   one tuple per row with: " + t.out + "\n# Order: " + t.order + "\n\n";
    }
  };
