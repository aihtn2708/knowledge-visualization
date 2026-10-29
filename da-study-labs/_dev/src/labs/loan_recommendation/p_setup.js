  /* ---------- setup texts (own tools) ---------- */
  var tsv = function (cols, rows) { return [cols.join("\t")].concat(rows.map(function (r) { return r.join("\t"); })).join("\n"); };
  var csv = function (cols, rows) { return [cols.join(",")].concat(rows.map(function (r) { return r.join(","); })).join("\n"); };
  var q = function (v) { return v === null ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'"; };
  var ins = function (name, rows) { return "INSERT INTO " + name + " VALUES\n" + rows.map(function (r) { return "  (" + r.map(q).join(", ") + ")"; }).join(",\n") + ";"; };
  var SQL_SETUP =
    "CREATE TABLE products (product_id INTEGER, name TEXT, min_score INTEGER, min_income INTEGER, max_amount INTEGER, max_term INTEGER, flat_rate REAL, max_dti REAL, thin_file_ok INTEGER);\n" + ins("products", PR) + "\n\n" +
    "CREATE TABLE applicants (applicant_id INTEGER, monthly_income INTEGER, existing_installments INTEGER, credit_score INTEGER, requested_amount INTEGER, requested_term INTEGER);\n" + ins("applicants", AP) + "\n\n" +
    "CREATE TABLE history (history_id INTEGER, applicant_id INTEGER, product_type TEXT, opened DATE, amount INTEGER, max_dpd INTEGER, status TEXT);\n" + ins("history", HI);
  var pySetup =
    "import io\nimport pandas as pd\n\n" +
    'applicants = pd.read_csv(io.StringIO("""\n' + csv(ACOLS, AP) + '\n"""))\n\n' +
    'history = pd.read_csv(io.StringIO("""\n' + csv(HCOLS, HI) + '\n"""), parse_dates=["opened"])\n\n' +
    'products = pd.read_csv(io.StringIO("""\n' + csv(PCOLS, PR) + '\n"""))\n\n' +
    "print(applicants.shape, history.shape, products.shape)   # (80, 6) (132, 7) (4, 9)";
  var setupTabs = {
    xl: function () {
      return '<ol class="steps"><li>Create a sheet named <code>applicants</code>, click A1 and paste. Blank scores must stay blank. ' + copyBtn("x-a", tsv(ACOLS, AP), "Copy applicants") + "</li>" +
        "<li>Create a sheet named <code>history</code>, click A1 and paste. Check that column D holds real dates. " + copyBtn("x-h", tsv(HCOLS, HI), "Copy history") + "</li>" +
        "<li>Create a sheet named <code>products</code>, click A1 and paste. " + copyBtn("x-p", tsv(PCOLS, PR), "Copy products") + "</li>" +
        "<li>The formulas in the solutions read <code>applicants!A2:F81</code>, <code>history!A2:G133</code> and <code>products!A2:I5</code>. Put your answer on a fourth sheet.</li></ol>";
    },
    sql: function () {
      return '<ol class="steps"><li>Open any SQLite, DuckDB or PostgreSQL tool.</li>' +
        "<li>Run this script. It creates the three tables and inserts all rows. " + copyBtn("s-sql", SQL_SETUP, "Copy SQL setup") + "</li>" +
        "<li>The solutions use standard SQL plus a window function in task 4. In PostgreSQL, replace the scalar <code>MIN(a, b)</code> and <code>MAX(a, b)</code> of task 5 with <code>LEAST</code> and <code>GREATEST</code>.</li></ol>";
    },
    py: function () {
      return '<ol class="steps"><li>Install pandas and numpy if needed: <code>pip install pandas numpy</code>.</li>' +
        "<li>Paste this into a notebook or script. It builds three DataFrames. " + copyBtn("p-py", pySetup, "Copy pandas setup") + "</li>" +
        "<li>The pandas solutions in each task end with a variable named <code>result</code>.</li></ol>";
    }
  };
