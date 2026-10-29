  function loansSheetHtml() {
    xlBase();
    var cols = ["A", "B", "C", "D", "E", "F", "G", "H"], head = '<th class="rn"></th>' + cols.map(function (c) { return "<th>" + c + "</th>"; }).join("");
    var body = "";
    for (var r = 1; r <= LAST; r++) {
      body += '<tr><td class="rn">' + r + "</td>";
      for (var c = 1; c <= 8; c++) { var v = XWB.value("loans", r, c); body += '<td class="' + (typeof v === "number" && c !== 2 && c !== 4 && !(c === 1) ? "n" : "") + '">' + esc(XWB.display("loans", { r: r, c: c })) + "</td>"; }
      body += "</tr>";
    }
    return '<div class="tw tall"><table class="orders-sheet"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }
