  /* ---------- setup texts (own tools) ---------- */
  var tsv = [LCOLS.join("\t")].concat(LN.map(function (r) { return r.join("\t"); })).join("\n");
  var tsvRules = [RCOLS.join("\t")].concat(RU.map(function (r) { return r.join("\t"); })).join("\n");
  var csv = [LCOLS.join(",")].concat(LN.map(function (r) { return r.join(","); })).join("\n");
  var csvRules = [RCOLS.join(",")].concat(RU.map(function (r) { return r.join(","); })).join("\n");
  var q = function (v) { return typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'"; };
  var SQL_SETUP =
    "CREATE TABLE rules (grp INTEGER, label TEXT, min_dpd INTEGER, max_dpd INTEGER, provision_rate REAL);\n" +
    "INSERT INTO rules VALUES\n" + RU.map(function (r) { return "  (" + r.map(q).join(", ") + ")"; }).join(",\n") + ";\n\n" +
    "CREATE TABLE loans (loan_id INTEGER, customer_id INTEGER, product TEXT, disbursed DATE, principal INTEGER, outstanding INTEGER, dpd INTEGER, dpd_prev INTEGER);\n" +
    "INSERT INTO loans VALUES\n" + LN.map(function (r) { return "  (" + r.map(q).join(", ") + ")"; }).join(",\n") + ";";
  var pySetup =
    "import io\nimport pandas as pd\n\n" +
    'loans = pd.read_csv(io.StringIO("""\n' + csv + '\n"""), parse_dates=["disbursed"])\n\n' +
    'rules = pd.read_csv(io.StringIO("""\n' + csvRules + '\n"""))\n\n' +
    "print(loans.shape, rules.shape)   # (120, 8) (5, 5)";
  var setupTabs = {
    xl: function () {
      return '<ol class="steps"><li>Create a sheet named <code>loans</code>, click A1 and paste. ' + copyBtn("x-loans", tsv, "Copy loans for Excel") + "</li>" +
        "<li>Check that column D holds real dates (right-aligned). If they are left-aligned text, use Data &gt; Text to Columns &gt; Finish.</li>" +
        "<li>Create a sheet named <code>rules</code>, click A1 and paste. " + copyBtn("x-rules", tsvRules, "Copy rules for Excel") + "</li>" +
        "<li>The formulas in the solutions read <code>loans!A2:H121</code> and <code>rules!A2:E6</code>. Put your answer on a third sheet.</li></ol>";
    },
    sql: function () {
      return '<ol class="steps"><li>Open any SQLite, DuckDB or PostgreSQL tool.</li>' +
        "<li>Run this script. It creates both tables and inserts all rows. " + copyBtn("s-sql", SQL_SETUP, "Copy SQL setup") + "</li>" +
        "<li>The solutions use standard SQL, plus a window function in task 4. They run unchanged on all three databases.</li></ol>";
    },
    py: function () {
      return '<ol class="steps"><li>Install pandas if needed: <code>pip install pandas</code>.</li>' +
        "<li>Paste this into a notebook or script. It builds <code>loans</code> and <code>rules</code> DataFrames. " + copyBtn("p-py", pySetup, "Copy pandas setup") + "</li>" +
        "<li>The pandas solutions in each task end with a variable named <code>result</code>.</li></ol>";
    }
  };
