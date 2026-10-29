  function sheetHtml(name, ncols, nrows) {
    xlBase();
    var head = '<th class="rn"></th>', body = "", r, c;
    for (c = 1; c <= ncols; c++) head += "<th>" + MiniXL.colName(c) + "</th>";
    for (r = 1; r <= nrows; r++) {
      body += '<tr><td class="rn">' + r + "</td>";
      for (c = 1; c <= ncols; c++) { var v = XWB.value(name, r, c); body += '<td class="' + (typeof v === "number" && !(name === "history" && c === 4) ? "n" : "") + '">' + esc(XWB.display(name, { r: r, c: c })) + "</td>"; }
      body += "</tr>";
    }
    return '<div class="tw tall"><table class="orders-sheet"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }
  function dataSheetsHtml() {
    return '<div class="res-title">applicants (A1:F' + (AP.length + 1) + ")</div>" + sheetHtml("applicants", 6, AP.length + 1) +
      '<div class="res-title" style="margin-top:10px">history (A1:G' + (HI.length + 1) + ")</div>" + sheetHtml("history", 7, HI.length + 1) +
      '<div class="res-title" style="margin-top:10px">products (A1:I5)</div>' + sheetHtml("products", 9, 5);
  }
