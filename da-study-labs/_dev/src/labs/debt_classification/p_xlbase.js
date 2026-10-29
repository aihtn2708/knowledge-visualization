  /* ---------- Excel ---------- */
  var XWB = null;
  function xlBase() {
    if (XWB) return;
    XWB = new MiniXL.Workbook(); XWB.addSheet("loans"); XWB.addSheet("rules");
    LCOLS.forEach(function (h, i) { XWB.setCell("loans", { r: 1, c: i + 1 }, { raw: h }); });
    LN.forEach(function (r, i) {
      var row = i + 2, m = /(\d+)-(\d+)-(\d+)/.exec(r[3]);
      for (var c = 0; c < 8; c++) {
        if (c === 3) XWB.setCell("loans", { r: row, c: 4 }, { raw: MiniXL.toSerial(+m[1], +m[2], +m[3]), fmt: "date" });
        else XWB.setCell("loans", { r: row, c: c + 1 }, { raw: r[c] });
      }
    });
    RCOLS.forEach(function (h, i) { XWB.setCell("rules", { r: 1, c: i + 1 }, { raw: h }); });
    RU.forEach(function (r, i) { r.forEach(function (v, j) { XWB.setCell("rules", { r: i + 2, c: j + 1 }, { raw: v }); }); });
  }
