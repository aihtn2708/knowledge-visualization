/* MiniXL: a small Excel formula engine in plain JavaScript (no eval).
   Cells hold numbers, text or formulas. Supports common functions, ranges across sheets,
   array arithmetic on ranges, and relative/absolute reference shifting for fill down/right. */
var MiniXL = (function () {
  'use strict';

  class XLError { constructor(code, msg) { this.code = code; this.msg = msg || ''; } }
  var E = function (code, msg) { return new XLError(code, msg); };
  class Matrix { constructor(rows) { this.rows = rows; } get h() { return this.rows.length; } get w() { return this.rows.length ? this.rows[0].length : 0; } }

  /* ---------- addresses ---------- */
  var colNum = function (s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) & 31); return n; };
  var colName = function (n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  var addr = function (r, c) { return colName(c) + r; };
  function parseAddr(a) {
    var m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a);
    return m ? { c: colNum(m[1].toUpperCase()), r: +m[2] } : null;
  }

  /* ---------- dates ---------- */
  var EPOCH = Date.UTC(1899, 11, 30);
  var toSerial = function (y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000); };
  var fromSerial = function (n) { var d = new Date(EPOCH + Math.floor(n) * 86400000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() }; };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  /* ---------- tokenizer ---------- */
  var REF = /^(?:(?:'[^']+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(?:\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3})(?![A-Za-z0-9_(])/;
  function tokenize(src) {
    var toks = [], i = 0, n = src.length;
    while (i < n) {
      var c = src[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      var rest = src.slice(i), m;
      if (c === '"') {
        var j = i + 1, s = '';
        for (;;) {
          if (j >= n) throw E('#VALUE!', 'Text is missing its closing quote');
          if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
          s += src[j++];
        }
        toks.push({ t: 'str', v: s, pos: i, end: j + 1 }); i = j + 1; continue;
      }
      if ((m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest))) { toks.push({ t: 'num', v: parseFloat(m[0]), pos: i, end: i + m[0].length }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_.]*(?=\()/.exec(rest))) { toks.push({ t: 'fn', v: m[0].toUpperCase(), pos: i, end: i + m[0].length }); i += m[0].length; continue; }
      if ((m = /^(TRUE|FALSE)(?![A-Za-z0-9_!(])/i.exec(rest))) { toks.push({ t: 'bool', v: m[1].toUpperCase() === 'TRUE', pos: i, end: i + m[0].length }); i += m[0].length; continue; }
      if ((m = REF.exec(rest))) { toks.push({ t: 'ref', v: m[0], pos: i, end: i + m[0].length }); i += m[0].length; continue; }
      if ((m = /^(<>|<=|>=|[+\-*\/^&=<>(),%:])/.exec(rest))) { toks.push({ t: 'op', v: m[0], pos: i, end: i + m[0].length }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest))) throw E('#NAME?', "'" + m[0] + "' is not a known name or function");
      throw E('#VALUE!', "Unexpected character '" + c + "'");
    }
    return toks;
  }

  /* ---------- parser ---------- */
  function parse(src) {
    var toks = tokenize(src), p = 0;
    var peek = function () { return toks[p]; };
    var isOp = function (v) { var t = toks[p]; return t && t.t === 'op' && t.v === v; };
    function parseCmp() {
      var l = parseCat();
      while (peek() && peek().t === 'op' && /^(=|<>|<=|>=|<|>)$/.test(peek().v)) { var op = toks[p++].v; l = { k: 'bin', op: op, l: l, r: parseCat() }; }
      return l;
    }
    function parseCat() { var l = parseAdd(); while (isOp('&')) { p++; l = { k: 'bin', op: '&', l: l, r: parseAdd() }; } return l; }
    function parseAdd() { var l = parseMul(); while (isOp('+') || isOp('-')) { var op = toks[p++].v; l = { k: 'bin', op: op, l: l, r: parseMul() }; } return l; }
    function parseMul() { var l = parsePow(); while (isOp('*') || isOp('/')) { var op = toks[p++].v; l = { k: 'bin', op: op, l: l, r: parsePow() }; } return l; }
    function parsePow() { var l = parseUnary(); while (isOp('^')) { p++; l = { k: 'bin', op: '^', l: l, r: parseUnary() }; } return l; }
    function parseUnary() {
      if (isOp('-')) { p++; return { k: 'neg', v: parseUnary() }; }
      if (isOp('+')) { p++; return parseUnary(); }
      var e = parsePrimary();
      while (isOp('%')) { p++; e = { k: 'bin', op: '/', l: e, r: { k: 'num', v: 100 } }; }
      return e;
    }
    function parsePrimary() {
      var t = toks[p++];
      if (!t) throw E('#VALUE!', 'The formula ends too early');
      if (t.t === 'num') return { k: 'num', v: t.v };
      if (t.t === 'str') return { k: 'str', v: t.v };
      if (t.t === 'bool') return { k: 'bool', v: t.v };
      if (t.t === 'ref') return { k: 'ref', v: t.v };
      if (t.t === 'fn') {
        p++; var args = [];
        if (!isOp(')')) {
          for (;;) {
            if (isOp(',') || isOp(')')) args.push({ k: 'empty' }); else args.push(parseCmp());
            if (isOp(',')) { p++; continue; }
            break;
          }
        }
        if (!isOp(')')) throw E('#VALUE!', 'A closing parenthesis is missing in ' + t.v + '()');
        p++; return { k: 'fn', name: t.v, args: args };
      }
      if (t.t === 'op' && t.v === '(') {
        var e = parseCmp();
        if (!isOp(')')) throw E('#VALUE!', 'A closing parenthesis is missing');
        p++; return e;
      }
      throw E('#VALUE!', "Unexpected '" + (t.v === undefined ? '' : t.v) + "' in the formula");
    }
    var ast = parseCmp();
    if (p < toks.length) throw E('#VALUE!', "Unexpected '" + toks[p].v + "' in the formula");
    return ast;
  }

  /* ---------- reference shifting (fill down / right) ---------- */
  function shiftRefToken(tok, dr, dc) {
    var bang = tok.lastIndexOf('!'), prefix = bang > -1 ? tok.slice(0, bang + 1) : '', body = bang > -1 ? tok.slice(bang + 1) : tok;
    var shiftPart = function (part) {
      var m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d*)$/.exec(part);
      if (!m) return part;
      var col = m[2], row = m[4];
      if (!m[1]) col = colName(Math.max(1, colNum(col.toUpperCase()) + dc));
      if (m[4] !== '' && !m[3]) row = String(Math.max(1, +row + dr));
      return m[1] + col + m[3] + row;
    };
    return prefix + body.split(':').map(shiftPart).join(':');
  }
  function shiftFormula(f, dr, dc) {
    if (typeof f !== 'string' || f[0] !== '=') return f;
    var src = f.slice(1), toks;
    try { toks = tokenize(src); } catch (e) { return f; }
    var out = '', last = 0;
    toks.forEach(function (t) { if (t.t === 'ref') { out += src.slice(last, t.pos) + shiftRefToken(t.v, dr, dc); last = t.end; } });
    return '=' + out + src.slice(last);
  }

  /* ---------- value helpers ---------- */
  var isErr = function (v) { return v instanceof XLError; };
  function toNumber(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') { var t = v.trim(); if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return parseFloat(t); return E('#VALUE!', 'Text "' + v + '" cannot be used as a number'); }
    return E('#VALUE!');
  }
  function numText(n) {
    if (!Number.isFinite(n)) return String(n);
    var s = String(+n.toPrecision(15));
    if (/e/.test(s)) return s.replace(/e\+?/, 'E+').replace('E+-', 'E-');
    return s;
  }
  function toText(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return numText(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }
  function toBool(v) {
    if (isErr(v)) return v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (v === null) return false;
    if (typeof v === 'string') { if (/^true$/i.test(v)) return true; if (/^false$/i.test(v)) return false; }
    return E('#VALUE!');
  }
  var rank = function (v) { return typeof v === 'number' || v === null ? 0 : typeof v === 'string' ? 1 : 2; };
  function compare(a, b) {
    if (a === null && typeof b === 'string') a = ''; else if (b === null && typeof a === 'string') b = '';
    if (a === null) a = 0; if (b === null) b = 0;
    var ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (ra === 1) { var x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    if (ra === 2) return a === b ? 0 : a ? 1 : -1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function flat(args) {
    var out = [];
    args.forEach(function (a) {
      if (a instanceof Matrix) a.rows.forEach(function (r) { r.forEach(function (v) { out.push({ v: v, inRange: true }); }); });
      else out.push({ v: a, inRange: false });
    });
    return out;
  }
  function numbersOf(args) {
    var out = [];
    for (var item of flat(args)) {
      var v = item.v;
      if (isErr(v)) return v;
      if (item.inRange) { if (typeof v === 'number') out.push(v); }
      else if (v !== null) { var n = toNumber(v); if (isErr(n)) return n; out.push(n); }
    }
    return out;
  }

  /* ---------- criteria (SUMIF family) ---------- */
  function makeCriterion(crit) {
    if (isErr(crit)) return function () { return false; };
    if (crit === null) crit = 0;
    if (typeof crit === 'number' || typeof crit === 'boolean') return function (v) { return (typeof v === 'number' || typeof v === 'boolean') && toNumber(v) === toNumber(crit); };
    var m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(String(crit)), op = m[1] || '=', operand = m[2];
    var numeric = operand.trim() !== '' && !isErr(toNumber(operand)) && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(operand.trim());
    if (numeric) {
      var num = parseFloat(operand);
      return function (v) {
        if (typeof v !== 'number') { if (typeof v === 'string' && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(v.trim()) && op !== '<>') v = parseFloat(v); else return op === '<>'; }
        switch (op) { case '=': return v === num; case '<>': return v !== num; case '<': return v < num; case '>': return v > num; case '<=': return v <= num; case '>=': return v >= num; }
      };
    }
    if (op === '=' || op === '<>') {
      var wild = /[*?]/.test(operand), rx = null;
      if (wild) rx = new RegExp('^' + operand.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      var lower = operand.toLowerCase();
      return function (v) {
        var txt = v === null ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? toText(v) : '';
        var same = operand === '' ? (v === null || v === '') : (typeof v === 'string' || v === null ? (wild ? rx.test(txt) : txt.toLowerCase() === lower) : false);
        return op === '=' ? same : !same;
      };
    }
    return function (v) {
      if (typeof v !== 'string') return false;
      var c = compare(v, operand);
      return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
    };
  }
  function sameShape(ms) {
    for (var i = 1; i < ms.length; i++) if (ms[i].h !== ms[0].h || ms[i].w !== ms[0].w) return false;
    return true;
  }
  function asMatrix(v) { return v instanceof Matrix ? v : new Matrix([[v]]); }
  function ifsRows(critArgs) {
    var ms = [], tests = [];
    for (var i = 0; i < critArgs.length; i += 2) {
      if (!(critArgs[i] instanceof Matrix)) return E('#VALUE!', 'A criteria range must be a range of cells');
      ms.push(critArgs[i]); tests.push(makeCriterion(critArgs[i + 1]));
    }
    if (!sameShape(ms)) return E('#VALUE!', 'The ranges must all have the same size');
    var hits = [];
    for (var r = 0; r < ms[0].h; r++) for (var c = 0; c < ms[0].w; c++) {
      var ok = true;
      for (var k = 0; k < ms.length; k++) if (!tests[k](ms[k].rows[r][c])) { ok = false; break; }
      if (ok) hits.push([r, c]);
    }
    return hits;
  }

  /* ---------- text formats ---------- */
  function formatText(v, fmt) {
    if (isErr(v)) return v;
    var f = toText(fmt);
    if (/[ymd]/i.test(f.replace(/"[^"]*"/g, ''))) {
      var n = toNumber(v); if (isErr(n)) return n;
      var d = fromSerial(n);
      return f.replace(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d/gi, function (t) {
        switch (t.toLowerCase()) {
          case 'yyyy': return String(d.y); case 'yy': return String(d.y).slice(-2);
          case 'mmmm': return MONTHS[d.m - 1]; case 'mmm': return MONTHS[d.m - 1].slice(0, 3);
          case 'mm': return pad2(d.m); case 'm': return String(d.m);
          case 'dddd': return DAYS[d.wd]; case 'ddd': return DAYS[d.wd].slice(0, 3);
          case 'dd': return pad2(d.d); default: return String(d.d);
        }
      });
    }
    var x = toNumber(v); if (isErr(x)) return x;
    var pct = /%/.test(f); if (pct) x *= 100;
    var dec = (/\.([0#]+)/.exec(f) || [0, ''])[1].length, group = /,/.test(f.replace(/\.[0#]*/, ''));
    var neg = x < 0, s = Math.abs(x).toFixed(dec);
    if (group) { var parts = s.split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = parts.join('.'); }
    var minInt = (/^[^.]*/.exec(f.replace(/[^0#.]/g, '')) || [''])[0].replace(/#/g, '').length;
    var ip = s.split('.'); while (ip[0].replace(/,/g, '').length < minInt) ip[0] = '0' + ip[0]; s = ip.join('.');
    return (neg ? '-' : '') + s + (pct ? '%' : '');
  }
  function addMonths(serial, months, endOfMonth) {
    var d = fromSerial(serial), t = d.m - 1 + months, y = d.y + Math.floor(t / 12), m = ((t % 12) + 12) % 12 + 1;
    var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return toSerial(y, m, endOfMonth ? dim : Math.min(d.d, dim));
  }

  /* ---------- functions ---------- */
  var F = {};
  var need = function (args, min, max, name) {
    if (args.length < min || (max !== undefined && args.length > max)) return E('#VALUE!', name + '() needs ' + (max === min ? 'exactly ' + min : max === undefined ? 'at least ' + min : min + ' to ' + max) + ' arguments, you gave ' + args.length);
    return null;
  };
  F.SUM = function (a) { var n = numbersOf(a); return isErr(n) ? n : n.reduce(function (s, x) { return s + x; }, 0); };
  F.AVERAGE = function (a) { var n = numbersOf(a); if (isErr(n)) return n; return n.length ? n.reduce(function (s, x) { return s + x; }, 0) / n.length : E('#DIV/0!'); };
  F.MIN = function (a) { var n = numbersOf(a); return isErr(n) ? n : n.length ? Math.min.apply(null, n) : 0; };
  F.MAX = function (a) { var n = numbersOf(a); return isErr(n) ? n : n.length ? Math.max.apply(null, n) : 0; };
  F.COUNT = function (a) { return flat(a).filter(function (x) { return typeof x.v === 'number' || (!x.inRange && !isErr(x.v) && x.v !== null && !isErr(toNumber(x.v))); }).length; };
  F.COUNTA = function (a) { return flat(a).filter(function (x) { return x.v !== null && x.v !== ''; }).length; };
  F.ABS = function (a) { var e = need(a, 1, 1, 'ABS'); if (e) return e; var n = toNumber(a[0]); return isErr(n) ? n : Math.abs(n); };
  F.INT = function (a) { var n = toNumber(a[0]); return isErr(n) ? n : Math.floor(n); };
  F.MOD = function (a) { var x = toNumber(a[0]), y = toNumber(a[1]); if (isErr(x)) return x; if (isErr(y)) return y; if (y === 0) return E('#DIV/0!'); return x - y * Math.floor(x / y); };
  var roundTo = function (x, d, mode) {
    var f = Math.pow(10, d), s = Math.abs(x) * f, e = 1e-9 * Math.max(1, s);
    var r = mode === 'up' ? Math.ceil(s - e) : mode === 'down' ? Math.floor(s + e) : Math.floor(s + 0.5 + e);
    return Math.sign(x) * r / f;
  };
  F.ROUND = function (a) { var e = need(a, 2, 2, 'ROUND'); if (e) return e; var x = toNumber(a[0]), d = toNumber(a[1]); if (isErr(x)) return x; if (isErr(d)) return d; return roundTo(x, Math.trunc(d), 'half'); };
  F.ROUNDUP = function (a) { var x = toNumber(a[0]), d = toNumber(a[1]); if (isErr(x)) return x; if (isErr(d)) return d; return roundTo(x, Math.trunc(d), 'up'); };
  F.ROUNDDOWN = function (a) { var x = toNumber(a[0]), d = toNumber(a[1]); if (isErr(x)) return x; if (isErr(d)) return d; return roundTo(x, Math.trunc(d), 'down'); };
  F.AND = function (a) { var items = flat(a).filter(function (x) { return !(x.inRange && (x.v === null || typeof x.v === 'string')); }); for (var i = 0; i < items.length; i++) { var b = toBool(items[i].v); if (isErr(b)) return b; if (!b) return false; } return true; };
  F.OR = function (a) { var items = flat(a).filter(function (x) { return !(x.inRange && (x.v === null || typeof x.v === 'string')); }); var any = false; for (var i = 0; i < items.length; i++) { var b = toBool(items[i].v); if (isErr(b)) return b; if (b) any = true; } return any; };
  F.NOT = function (a) { var b = toBool(a[0]); return isErr(b) ? b : !b; };
  F.ISBLANK = function (a) { return a[0] === null; };
  F.ISNUMBER = function (a) { return typeof a[0] === 'number'; };
  F.ISERROR = function (a) { return isErr(a[0]); };
  F.LEN = function (a) { var t = toText(a[0]); return isErr(t) ? t : t.length; };
  F.UPPER = function (a) { var t = toText(a[0]); return isErr(t) ? t : t.toUpperCase(); };
  F.LOWER = function (a) { var t = toText(a[0]); return isErr(t) ? t : t.toLowerCase(); };
  F.TRIM = function (a) { var t = toText(a[0]); return isErr(t) ? t : t.trim().replace(/\s+/g, ' '); };
  F.LEFT = function (a) { var t = toText(a[0]), n = a.length > 1 ? toNumber(a[1]) : 1; if (isErr(t)) return t; if (isErr(n)) return n; return t.slice(0, Math.max(0, n)); };
  F.RIGHT = function (a) { var t = toText(a[0]), n = a.length > 1 ? toNumber(a[1]) : 1; if (isErr(t)) return t; if (isErr(n)) return n; return n <= 0 ? '' : t.slice(-n); };
  F.MID = function (a) { var t = toText(a[0]), s = toNumber(a[1]), n = toNumber(a[2]); if (isErr(t)) return t; if (isErr(s)) return s; if (isErr(n)) return n; return t.substr(Math.max(0, s - 1), Math.max(0, n)); };
  F.CONCAT = F.CONCATENATE = function (a) { var out = ''; for (var item of flat(a)) { var t = toText(item.v); if (isErr(t)) return t; out += t; } return out; };
  F.TEXT = function (a) { var e = need(a, 2, 2, 'TEXT'); if (e) return e; return formatText(a[0], a[1]); };
  F.DATE = function (a) { var e = need(a, 3, 3, 'DATE'); if (e) return e; var y = toNumber(a[0]), m = toNumber(a[1]), d = toNumber(a[2]); if (isErr(y)) return y; if (isErr(m)) return m; if (isErr(d)) return d; return toSerial(Math.trunc(y), Math.trunc(m), Math.trunc(d)); };
  F.YEAR = function (a) { var n = toNumber(a[0]); return isErr(n) ? n : fromSerial(n).y; };
  F.MONTH = function (a) { var n = toNumber(a[0]); return isErr(n) ? n : fromSerial(n).m; };
  F.DAY = function (a) { var n = toNumber(a[0]); return isErr(n) ? n : fromSerial(n).d; };
  F.EDATE = function (a) { var e = need(a, 2, 2, 'EDATE'); if (e) return e; var n = toNumber(a[0]), m = toNumber(a[1]); if (isErr(n)) return n; if (isErr(m)) return m; return addMonths(n, Math.trunc(m), false); };
  F.EOMONTH = function (a) { var e = need(a, 2, 2, 'EOMONTH'); if (e) return e; var n = toNumber(a[0]), m = toNumber(a[1]); if (isErr(n)) return n; if (isErr(m)) return m; return addMonths(n, Math.trunc(m), true); };

  F.SUMIFS = function (a) {
    var e = need(a, 3, undefined, 'SUMIFS'); if (e) return e;
    if (a.length % 2 === 0) return E('#VALUE!', 'SUMIFS needs: sum_range, then pairs of criteria_range and criterion');
    var sumM = asMatrix(a[0]); var hits = ifsRows(a.slice(1)); if (isErr(hits)) return hits;
    if (hits.length && (sumM.h !== asMatrix(a[1]).h || sumM.w !== asMatrix(a[1]).w)) return E('#VALUE!', 'The sum range and the criteria ranges must have the same size');
    var t = 0; for (var h of hits) { var v = sumM.rows[h[0]][h[1]]; if (isErr(v)) return v; if (typeof v === 'number') t += v; } return t;
  };
  F.SUMIF = function (a) {
    var e = need(a, 2, 3, 'SUMIF'); if (e) return e;
    var hits = ifsRows([a[0], a[1]]); if (isErr(hits)) return hits;
    var sumM = a.length > 2 ? asMatrix(a[2]) : asMatrix(a[0]); var t = 0;
    hits.forEach(function (h) { var v = sumM.rows[h[0]] && sumM.rows[h[0]][h[1]]; if (typeof v === 'number') t += v; }); return t;
  };
  F.COUNTIFS = function (a) { var e = need(a, 2, undefined, 'COUNTIFS'); if (e) return e; if (a.length % 2) return E('#VALUE!', 'COUNTIFS needs pairs of criteria_range and criterion'); var h = ifsRows(a); return isErr(h) ? h : h.length; };
  F.COUNTIF = function (a) { var e = need(a, 2, 2, 'COUNTIF'); if (e) return e; var h = ifsRows(a); return isErr(h) ? h : h.length; };
  F.AVERAGEIFS = function (a) {
    var e = need(a, 3, undefined, 'AVERAGEIFS'); if (e) return e;
    var m = asMatrix(a[0]), hits = ifsRows(a.slice(1)); if (isErr(hits)) return hits;
    var vals = hits.map(function (h) { return m.rows[h[0]][h[1]]; }).filter(function (v) { return typeof v === 'number'; });
    return vals.length ? vals.reduce(function (s, x) { return s + x; }, 0) / vals.length : E('#DIV/0!');
  };
  F.AVERAGEIF = function (a) { return F.AVERAGEIFS([a.length > 2 ? a[2] : a[0], a[0], a[1]]); };
  F.MAXIFS = function (a) { var m = asMatrix(a[0]), hits = ifsRows(a.slice(1)); if (isErr(hits)) return hits; var v = hits.map(function (h) { return m.rows[h[0]][h[1]]; }).filter(function (x) { return typeof x === 'number'; }); return v.length ? Math.max.apply(null, v) : 0; };
  F.MINIFS = function (a) { var m = asMatrix(a[0]), hits = ifsRows(a.slice(1)); if (isErr(hits)) return hits; var v = hits.map(function (h) { return m.rows[h[0]][h[1]]; }).filter(function (x) { return typeof x === 'number'; }); return v.length ? Math.min.apply(null, v) : 0; };
  F.SUMPRODUCT = function (a) {
    var ms = a.map(asMatrix); if (!sameShape(ms)) return E('#VALUE!', 'SUMPRODUCT arrays must have the same size');
    var t = 0;
    for (var r = 0; r < ms[0].h; r++) for (var c = 0; c < ms[0].w; c++) {
      var prod = 1;
      for (var m of ms) { var v = m.rows[r][c]; if (isErr(v)) return v; prod *= typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0; }
      t += prod;
    }
    return t;
  };
  var vec = function (m) { return m instanceof Matrix ? (m.h === 1 ? m.rows[0] : m.w === 1 ? m.rows.map(function (r) { return r[0]; }) : null) : [m]; };
  F.INDEX = function (a) {
    var e = need(a, 2, 3, 'INDEX'); if (e) return e;
    var m = asMatrix(a[0]), r = toNumber(a[1]), c = a.length > 2 ? toNumber(a[2]) : null;
    if (isErr(r)) return r; if (c !== null && isErr(c)) return c;
    if (c === null) { if (m.h === 1) { c = r; r = 1; } else c = 1; }
    if (r === 0 && m.h === 1) r = 1;
    if (r < 1 || c < 1 || r > m.h || c > m.w) return E('#REF!', 'INDEX is outside the range');
    var v = m.rows[r - 1][c - 1]; return v === null ? 0 : v;
  };
  F.MATCH = function (a) {
    var e = need(a, 2, 3, 'MATCH'); if (e) return e;
    var look = a[0], arr = vec(a[1]), type = a.length > 2 ? toNumber(a[2]) : 1;
    if (isErr(look)) return look; if (!arr) return E('#N/A', 'MATCH needs a single row or column');
    if (type === 0) {
      var test = typeof look === 'string' && /[*?]/.test(look) ? makeCriterion(look) : function (v) { return v !== null && typeof v === typeof look && compare(v, look) === 0; };
      for (var i = 0; i < arr.length; i++) if (test(arr[i])) return i + 1;
      return E('#N/A', 'No match found');
    }
    var best = -1;
    for (var j = 0; j < arr.length; j++) {
      if (arr[j] === null || rank(arr[j]) !== rank(look)) continue;
      var c = compare(arr[j], look);
      if (type > 0 ? c <= 0 : c >= 0) best = j; else break;
    }
    return best < 0 ? E('#N/A', 'No match found') : best + 1;
  };
  F.XLOOKUP = function (a) {
    var e = need(a, 3, 6, 'XLOOKUP'); if (e) return e;
    var look = a[0], keys = vec(a[1]), ret = a[2] instanceof Matrix ? a[2] : null;
    if (isErr(look)) return look; if (!keys || !ret) return E('#VALUE!', 'XLOOKUP needs ranges for lookup_array and return_array');
    var idx = -1;
    for (var i = 0; i < keys.length; i++) if (keys[i] !== null && typeof keys[i] === typeof look && compare(keys[i], look) === 0) { idx = i; break; }
    if (idx < 0) return a.length > 3 && a[3] !== undefined && a[3] !== null ? a[3] : E('#N/A', 'No match found');
    var out = ret.h === 1 ? ret.rows[0][idx] : ret.rows[idx] && ret.rows[idx][0];
    return out === null || out === undefined ? 0 : out;
  };
  F.VLOOKUP = function (a) {
    var e = need(a, 3, 4, 'VLOOKUP'); if (e) return e;
    var look = a[0], m = asMatrix(a[1]), col = toNumber(a[2]), exact = a.length > 3 && toBool(a[3]) === false;
    if (isErr(look)) return look; if (isErr(col)) return col; if (col < 1 || col > m.w) return E('#REF!', 'VLOOKUP column index is outside the table');
    var row = -1;
    for (var i = 0; i < m.h; i++) {
      var k = m.rows[i][0]; if (k === null || rank(k) !== rank(look)) continue;
      var c = compare(k, look);
      if (exact ? c === 0 : c <= 0) { row = i; if (exact) break; } else if (!exact) break;
    }
    return row < 0 ? E('#N/A', 'No match found') : m.rows[row][col - 1];
  };

  var LAZY = { IF: 1, IFERROR: 1, IFNA: 1 };

  /* ---------- evaluation ---------- */
  function Workbook() { this.sheets = Object.create(null); this.cache = new Map(); this.stack = new Set(); this.astCache = new Map(); }
  Workbook.prototype.addSheet = function (name) { var key = name.toLowerCase(); this.sheets[key] = { name: name, cells: new Map(), maxR: 0, maxC: 0 }; this.cache.clear(); return this.sheets[key]; };
  Workbook.prototype.setCell = function (sheet, ref, input) {
    var s = this.sheets[sheet.toLowerCase()], a = typeof ref === 'string' ? parseAddr(ref) : ref;
    var key = a.r + ',' + a.c;
    if (input === null || input === undefined || input === '') s.cells.delete(key);
    else s.cells.set(key, typeof input === 'object' ? input : { raw: input });
    this.cache.clear();
    s.maxR = 0; s.maxC = 0;
    s.cells.forEach(function (_, k) { var p = k.split(','); s.maxR = Math.max(s.maxR, +p[0]); s.maxC = Math.max(s.maxC, +p[1]); });
  };
  Workbook.prototype.getCellObj = function (sheet, ref) { var s = this.sheets[sheet.toLowerCase()], a = typeof ref === 'string' ? parseAddr(ref) : ref; return s.cells.get(a.r + ',' + a.c) || null; };
  Workbook.prototype.getRaw = function (sheet, ref) { var c = this.getCellObj(sheet, ref); return c ? c.raw : null; };
  Workbook.prototype.value = function (sheetName, r, c) {
    var s = this.sheets[sheetName.toLowerCase()];
    if (!s) return E('#REF!', "Sheet '" + sheetName + "' does not exist");
    var key = s.name + '!' + r + ',' + c;
    if (this.cache.has(key)) return this.cache.get(key);
    var cell = s.cells.get(r + ',' + c), v;
    if (!cell) v = null;
    else if (typeof cell.raw === 'string' && cell.raw[0] === '=') {
      if (this.stack.has(key)) return E('#REF!', 'Circular reference: this formula depends on itself');
      this.stack.add(key);
      try { v = this.evalFormula(cell.raw, s.name); } catch (e) { v = e instanceof XLError ? e : E('#VALUE!', String(e && e.message || e)); }
      this.stack.delete(key);
    } else v = cell.raw;
    if (v instanceof Matrix) v = v.rows[0][0];
    this.cache.set(key, v);
    return v;
  };
  Workbook.prototype.display = function (sheet, ref) {
    var a = typeof ref === 'string' ? parseAddr(ref) : ref, v = this.value(sheet, a.r, a.c), cell = this.getCellObj(sheet, a);
    if (isErr(v)) return v.code;
    if (v === null) return '';
    if (typeof v === 'number') return cell && cell.fmt === 'date' ? (function () { var d = fromSerial(v); return d.y + '-' + pad2(d.m) + '-' + pad2(d.d); })() : numText(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  };
  Workbook.prototype.error = function (sheet, ref) { var a = typeof ref === 'string' ? parseAddr(ref) : ref, v = this.value(sheet, a.r, a.c); return isErr(v) ? v : null; };

  Workbook.prototype.evalFormula = function (raw, sheetName) {
    var ast = this.astCache.get(raw);
    if (!ast) { ast = parse(raw.slice(1)); this.astCache.set(raw, ast); }
    return this.ev(ast, sheetName);
  };
  Workbook.prototype.ref = function (text, sheetName) {
    var bang = text.lastIndexOf('!'), sh = sheetName, body = text;
    if (bang > -1) { sh = text.slice(0, bang).replace(/^'|'$/g, ''); body = text.slice(bang + 1); }
    var s = this.sheets[sh.toLowerCase()];
    if (!s) return E('#REF!', "Sheet '" + sh + "' does not exist");
    var parts = body.split(':');
    var colOnly = /^\$?[A-Za-z]{1,3}$/.test(parts[0]);
    var a, b;
    if (colOnly) { a = { c: colNum(parts[0].replace('$', '').toUpperCase()), r: 1 }; b = { c: colNum(parts[1].replace('$', '').toUpperCase()), r: Math.max(1, s.maxR) }; }
    else { a = parseAddr(parts[0]); b = parts.length > 1 ? parseAddr(parts[1]) : a; }
    if (!a || !b) return E('#REF!');
    if (parts.length === 1) return this.value(s.name, a.r, a.c);
    var r1 = Math.min(a.r, b.r), r2 = Math.max(a.r, b.r), c1 = Math.min(a.c, b.c), c2 = Math.max(a.c, b.c), rows = [];
    if ((r2 - r1 + 1) * (c2 - c1 + 1) > 200000) return E('#VALUE!', 'That range is too large');
    for (var r = r1; r <= r2; r++) { var row = []; for (var c = c1; c <= c2; c++) row.push(this.value(s.name, r, c)); rows.push(row); }
    return new Matrix(rows);
  };
  var firstErr = function (v) { if (isErr(v)) return v; if (v instanceof Matrix) for (var r of v.rows) for (var x of r) if (isErr(x)) return x; return null; };
  function binScalar(op, a, b) {
    if (isErr(a)) return a; if (isErr(b)) return b;
    if (op === '&') { var x = toText(a), y = toText(b); return isErr(x) ? x : isErr(y) ? y : x + y; }
    if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
      var c = compare(a, b);
      switch (op) { case '=': return c === 0; case '<>': return c !== 0; case '<': return c < 0; case '>': return c > 0; case '<=': return c <= 0; default: return c >= 0; }
    }
    var p = toNumber(a), q = toNumber(b); if (isErr(p)) return p; if (isErr(q)) return q;
    switch (op) {
      case '+': return p + q; case '-': return p - q; case '*': return p * q;
      case '/': return q === 0 ? E('#DIV/0!') : p / q;
      case '^': var r = Math.pow(p, q); return Number.isFinite(r) ? r : E('#NUM!');
    }
  }
  Workbook.prototype.ev = function (n, sh) {
    switch (n.k) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'empty': return null;
      case 'ref': return this.ref(n.v, sh);
      case 'neg': { var v = this.ev(n.v, sh); if (v instanceof Matrix) return new Matrix(v.rows.map(function (r) { return r.map(function (x) { var t = toNumber(x); return isErr(t) ? t : -t; }); })); var t = toNumber(v); return isErr(t) ? t : -t; }
      case 'bin': {
        var l = this.ev(n.l, sh), r = this.ev(n.r, sh);
        if (l instanceof Matrix || r instanceof Matrix) {
          var lm = asMatrix(l), rm = asMatrix(r), h = Math.max(lm.h, rm.h), w = Math.max(lm.w, rm.w), rows = [];
          if ((lm.h !== 1 && lm.h !== h) || (rm.h !== 1 && rm.h !== h) || (lm.w !== 1 && lm.w !== w) || (rm.w !== 1 && rm.w !== w)) return E('#VALUE!', 'The two ranges have different sizes');
          for (var i = 0; i < h; i++) { var row = []; for (var j = 0; j < w; j++) row.push(binScalar(n.op, lm.rows[lm.h === 1 ? 0 : i][lm.w === 1 ? 0 : j], rm.rows[rm.h === 1 ? 0 : i][rm.w === 1 ? 0 : j])); rows.push(row); }
          return new Matrix(rows);
        }
        return binScalar(n.op, l, r);
      }
      case 'fn': return this.callFn(n, sh);
    }
    return E('#VALUE!');
  };
  Workbook.prototype.callFn = function (n, sh) {
    var name = n.name, self = this;
    if (name === 'IF') {
      var e1 = need(n.args, 2, 3, 'IF'); if (e1) return e1;
      var c = this.ev(n.args[0], sh), cm = c instanceof Matrix ? c.rows[0][0] : c; var b = toBool(cm); if (isErr(b)) return b;
      if (b) return this.ev(n.args[1], sh);
      return n.args.length > 2 ? this.ev(n.args[2], sh) : false;
    }
    if (name === 'IFERROR' || name === 'IFNA') {
      var e2 = need(n.args, 2, 2, name); if (e2) return e2;
      var v = this.ev(n.args[0], sh), er = firstErr(v);
      return er && (name === 'IFERROR' || er.code === '#N/A') ? this.ev(n.args[1], sh) : v;
    }
    if (!Object.prototype.hasOwnProperty.call(F, name)) return E('#NAME?', name + '() is not available in this lab. Try SUMIFS, COUNTIFS, INDEX, MATCH, XLOOKUP, IF, ROUND, TEXT, EDATE or DATE.');
    var args = n.args.map(function (a) { return self.ev(a, sh); });
    if (name !== 'IFS') for (var i = 0; i < args.length; i++) if (isErr(args[i]) && !/^(ISERROR|COUNTA|COUNT)$/.test(name)) return args[i];
    return F[name](args);
  };

  /* ---------- input parsing ---------- */
  function parseInput(text) {
    var t = String(text);
    if (t.trim() === '') return null;
    if (t[0] === '=') return { raw: t };
    if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t.trim())) return { raw: parseFloat(t) };
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t.trim());
    if (m) return { raw: toSerial(+m[1], +m[2], +m[3]), fmt: 'date' };
    return { raw: t };
  }

  return { Workbook: Workbook, parseInput: parseInput, shiftFormula: shiftFormula, parseAddr: parseAddr, addr: addr, colName: colName, toSerial: toSerial, fromSerial: fromSerial, XLError: XLError, Matrix: Matrix, isErr: isErr, numText: numText };
})();
if (typeof module !== 'undefined') module.exports = MiniXL;
