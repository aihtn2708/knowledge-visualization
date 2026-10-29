  var textRows = LN.map(function (r) { return r.map(function (v, i) { return i < 2 ? String(v) : v; }); });
  document.getElementById("schema-loans").innerHTML = LCOLS.map(function (c) { return '<span class="chip">' + c + "</span>"; }).join("");
  document.getElementById("schema-rules").innerHTML = RCOLS.map(function (c) { return '<span class="chip">' + c + "</span>"; }).join("");
  document.getElementById("loans-prev").innerHTML = table(LCOLS, textRows.slice(0, 6), { num: [4, 5, 6, 7] });
  document.getElementById("loans-all").innerHTML = table(LCOLS, textRows, { num: [4, 5, 6, 7] });
  document.getElementById("rules-tab").innerHTML = table(RCOLS, RU.map(function (r) { return [String(r[0]), r[1], r[2], r[3] >= 99999 ? "no limit" : r[3], r[4]]; }), { num: [2, 3, 4] });
