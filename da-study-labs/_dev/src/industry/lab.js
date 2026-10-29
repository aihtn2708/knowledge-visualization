/* ---------- shared helpers for the industry labs ---------- */
var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
var fmt = function (v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
var $ = function (id) { return document.getElementById(id); };
function niceStep(range, ticks) { var raw = range / ticks, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
/* chart({labels, xticks:[i..], series:[{values, color, dash, type:'line'|'bar', width, colors, labels}], band:{lo,hi,color}, shade:[[i0,i1,token]], ylog, ymin, ymax, yfmt, h, legend:[[name, token]], vline:[i,label]}) */
function chart(o) {
  var W = 680, H = o.h || 270, L = 58, R = 14, T = 16, B = 34, n = o.labels.length;
  var all = [];
  o.series.forEach(function (s) { s.values.forEach(function (v) { if (v !== null && isFinite(v)) all.push(v); }); });
  if (o.band) o.band.hi.concat(o.band.lo).forEach(function (v) { if (v !== null && isFinite(v)) all.push(v); });
  var lo = o.ymin !== undefined ? o.ymin : Math.min.apply(null, all), hi = o.ymax !== undefined ? o.ymax : Math.max.apply(null, all);
  var tr = o.ylog ? Math.log10 : function (v) { return v; };
  var ticks = [];
  if (o.ylog) { var e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi)); lo = Math.pow(10, e0); hi = Math.pow(10, e1); for (var e = e0; e <= e1; e++) ticks.push(Math.pow(10, e)); }
  else {
    if (o.ymin === undefined) lo = Math.min(lo, 0) < 0 ? lo : (o.zero === false ? lo : 0);
    var st = niceStep(hi - lo, 4); lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st; for (var t = lo; t <= hi + st / 2; t += st) ticks.push(t);
  }
  var bar = o.series.some(function (s) { return s.type === "bar"; });
  var X = bar ? function (i) { return L + (W - L - R) * (i + 0.5) / n; } : function (i) { return L + (W - L - R) * (n === 1 ? 0.5 : i / (n - 1)); };
  var Y = function (v) { return T + (H - T - B) * (1 - (tr(v) - tr(lo)) / (tr(hi) - tr(lo))); };
  var g = "";
  ticks.forEach(function (v) { var y = Y(v); g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + (o.yfmt ? o.yfmt(v) : fmt(v)) + "</text>"; });
  (o.xticks || o.labels.map(function (x, i) { return i; })).forEach(function (i) { var anc = !bar && i === n - 1 ? "end" : !bar && i === 0 ? "start" : "middle"; g += '<text x="' + X(i) + '" y="' + (H - 12) + '" text-anchor="' + anc + '">' + esc(o.labels[i]) + "</text>"; });
  (o.shade || []).forEach(function (s) { var x0 = bar ? X(s[0]) - (W - L - R) / n / 2 : X(s[0]), x1 = bar ? X(s[1]) + (W - L - R) / n / 2 : X(s[1]); g += '<rect x="' + x0 + '" y="' + T + '" width="' + Math.max(1, x1 - x0) + '" height="' + (H - T - B) + '" fill="var(' + s[2] + ')" opacity="0.6"/>'; });
  if (o.band) { var up = [], dn = []; o.band.hi.forEach(function (v, i) { if (v !== null) { up.push(X(i) + "," + Y(v)); dn.unshift(X(i) + "," + Y(o.band.lo[i])); } }); g += '<polygon points="' + up.concat(dn).join(" ") + '" fill="var(' + o.band.color + ')" opacity="0.2"/>'; }
  o.series.forEach(function (s) {
    if (s.type === "bar") {
      var bw = (W - L - R) / n * (s.width || 0.64);
      s.values.forEach(function (v, i) { if (v === null) return; var y0 = Y(Math.max(lo, 0)), y1 = Y(v); g += '<rect x="' + (X(i) - bw / 2) + '" y="' + Math.min(y0, y1) + '" width="' + bw + '" height="' + Math.abs(y0 - y1) + '" rx="2" fill="var(' + (s.colors ? s.colors[i] : s.color) + ')"/>'; if (s.labels && s.labels[i] !== "") g += '<text x="' + X(i) + '" y="' + (Math.min(y0, y1) - 4) + '" text-anchor="middle">' + esc(s.labels[i]) + "</text>"; });
      return;
    }
    var d = "", pen = false;
    s.values.forEach(function (v, i) { if (v === null || !isFinite(v)) { pen = false; return; } d += (pen ? " L" : " M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); pen = true; });
    g += '<path d="' + d + '" fill="none" stroke="var(' + s.color + ')" stroke-width="' + (s.w || 2) + '"' + (s.dash ? ' stroke-dasharray="6 5"' : "") + ' stroke-linejoin="round"/>';
    if (n <= 40) s.values.forEach(function (v, i) { if (v !== null) g += '<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="2.6" fill="var(' + s.color + ')"/>'; });
  });
  if (o.vline) { var vx = X(o.vline[0]); g += '<line x1="' + vx + '" x2="' + vx + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--muted)" stroke-dasharray="3 4"/><text x="' + (vx + 4) + '" y="' + (T + 12) + '" style="fill:var(--ink)">' + esc(o.vline[1]) + "</text>"; }
  var leg = o.legend ? '<div class="legend">' + o.legend.map(function (l) { return '<span><i style="background:var(' + l[1] + ')"></i>' + esc(l[0]) + "</span>"; }).join("") + "</div>" : "";
  return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.title || "chart") + '">' + g + "</svg>" + leg;
}
/* exercises: [{q, type:'num'|'select', answer, tol, options, hint, explain}] */
function renderExercises(rootId, items) {
  var root = $(rootId);
  root.innerHTML = items.map(function (it, i) {
    var input = it.type === "select" ? '<select id="ex' + i + '" aria-label="Answer"><option value="">Choose</option>' + it.options.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") + "</select>"
      : '<input id="ex' + i + '" type="text" inputmode="decimal" autocomplete="off" placeholder="' + esc(it.placeholder || "your answer") + '" aria-label="Answer">';
    return '<div class="exq"><span class="qt">' + (i + 1) + ". " + it.q + '</span><div class="row">' + input + '<button class="btn" data-ex="' + i + '">Check</button></div><div class="fbk" id="fb' + i + '" aria-live="polite"></div>' +
      (it.hint ? "<details><summary>Hint</summary>" + it.hint + "</details>" : "") + "</div>";
  }).join("");
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ex]"); if (!b) return;
    var i = +b.getAttribute("data-ex"), it = items[i], raw = $("ex" + i).value.trim(), fb = $("fb" + i), ok;
    if (!raw) { fb.className = "fbk bad"; fb.textContent = "Enter an answer first."; return; }
    if (it.type === "select") ok = raw === it.answer;
    else { var c = raw.replace(/\s/g, "").replace("%", ""); if (/^-?\d{1,3}(\.\d{3})+$/.test(c)) c = c.replace(/\./g, ""); var v = parseFloat(c.replace(/,/g, "")); ok = isFinite(v) && Math.abs(v - it.answer()) <= it.tol; }
    fb.className = "fbk " + (ok ? "good" : "bad");
    fb.innerHTML = ok ? "Correct. " + (it.explain ? it.explain() : "") : "Not yet. " + (it.retry || "Check the section above and try again.");
  });
}
function copyButton(btnId, text) {
  var b = $(btnId); if (!b) return;
  b.addEventListener("click", function () {
    var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy code"; }, 1500); };
    var fail = function () { var pre = b.parentNode.parentNode.querySelector("pre"); var r = document.createRange(); r.selectNodeContents(pre); var s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Press Ctrl+C"; };
    try { navigator.clipboard.writeText(text).then(done, fail); } catch (e) { fail(); }
  });
}
