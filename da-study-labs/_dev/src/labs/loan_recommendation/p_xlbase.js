  /* ---------- Excel ---------- */
  var XWB = null;
  function xlBase() {
    if (XWB) return;
    XWB = new MiniXL.Workbook(); XWB.addSheet("applicants"); XWB.addSheet("history"); XWB.addSheet("products");
    var put = function (sheet, cols, rows, dateCol) {
      cols.forEach(function (h, i) { XWB.setCell(sheet, { r: 1, c: i + 1 }, { raw: h }); });
      rows.forEach(function (r, i) {
        r.forEach(function (v, c) {
          if (v === null) return;
          if (c === dateCol) { var m = /(\d+)-(\d+)-(\d+)/.exec(v); XWB.setCell(sheet, { r: i + 2, c: c + 1 }, { raw: MiniXL.toSerial(+m[1], +m[2], +m[3]), fmt: "date" }); }
          else XWB.setCell(sheet, { r: i + 2, c: c + 1 }, { raw: v });
        });
      });
    };
    put("applicants", ACOLS, AP, -1); put("history", HCOLS, HI, 3); put("products", PCOLS, PR, -1);
  }
