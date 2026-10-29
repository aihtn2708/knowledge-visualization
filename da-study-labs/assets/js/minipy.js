/* MiniPy: a small Python interpreter written in plain JavaScript (no eval, no new Function).
   Subset: ints (BigInt) and floats, str, bool, None, list, tuple, dict, set, comprehensions,
   def / lambda, for / while / if, f-strings, common builtins and methods, math / collections. */
var MiniPy = (function () {
  'use strict';

  class PyError extends Error {
    constructor(type, msg, line) { super(type + ': ' + msg); this.pytype = type; this.pymsg = msg; this.line = line || null; }
  }
  var err = function (type, msg, line) { return new PyError(type, msg, line); };
  class Tuple { constructor(items) { this.items = items; } }
  class Module { constructor(name, attrs) { this.name = name; this.attrs = attrs; } }
  class Func { constructor(name, params, body, scope, isLambda) { this.name = name; this.params = params; this.body = body; this.scope = scope; this.isLambda = isLambda; } }
  class PySlice { constructor(lo, hi, step) { this.lo = lo; this.hi = hi; this.step = step; } }
  class PyRange { constructor(a, b, c) { this.a = a; this.b = b; this.c = c; } }
  class Scope {
    constructor(parent) { this.vars = new Map(); this.parent = parent || null; }
    lookup(name, line) {
      for (var s = this; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name);
      throw err('NameError', "name '" + name + "' is not defined", line);
    }
  }

  /* ---------- value helpers ---------- */
  var isInt = function (v) { return typeof v === 'bigint'; };
  var isFloat = function (v) { return typeof v === 'number'; };
  var isNumish = function (v) { return typeof v === 'bigint' || typeof v === 'number' || typeof v === 'boolean'; };
  var numify = function (v) { return typeof v === 'boolean' ? (v ? 1n : 0n) : v; };
  var toNum = function (v) { return typeof v === 'bigint' ? Number(v) : typeof v === 'boolean' ? (v ? 1 : 0) : v; };
  var toIdx = function (v, line) {
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v !== 'bigint') throw err('TypeError', 'indices must be integers or slices, not ' + typeName(v), line);
    return Number(v);
  };
  function typeName(v) {
    if (v === null) return 'NoneType';
    switch (typeof v) { case 'bigint': return 'int'; case 'number': return 'float'; case 'boolean': return 'bool'; case 'string': return 'str'; case 'function': return 'builtin_function_or_method'; }
    if (Array.isArray(v)) return 'list';
    if (v instanceof Tuple) return 'tuple';
    if (v instanceof PyDict) return 'dict';
    if (v instanceof PySet) return 'set';
    if (v instanceof Func) return 'function';
    if (v instanceof PyRange) return 'range';
    if (v instanceof Module) return 'module';
    return 'object';
  }

  class PyDict {
    constructor(def) { this.map = new Map(); this.def = def || null; this.counter = false; }
    get size() { return this.map.size; }
    has(k) { return this.map.has(hk(k)); }
    getv(k) { var e = this.map.get(hk(k)); return e ? e[1] : undefined; }
    set(k, v) { var h = hk(k), e = this.map.get(h); if (e) e[1] = v; else this.map.set(h, [k, v]); }
    del(k) { return this.map.delete(hk(k)); }
    keys() { return Array.from(this.map.values(), function (e) { return e[0]; }); }
    values() { return Array.from(this.map.values(), function (e) { return e[1]; }); }
    entries() { return Array.from(this.map.values(), function (e) { return new Tuple([e[0], e[1]]); }); }
  }
  class PySet {
    constructor() { this.map = new Map(); }
    get size() { return this.map.size; }
    has(v) { return this.map.has(hk(v)); }
    add(v) { var h = hk(v); if (!this.map.has(h)) this.map.set(h, v); }
    del(v) { return this.map.delete(hk(v)); }
    values() { return Array.from(this.map.values()); }
  }
  function hk(v) {
    if (v === null) return 'N';
    switch (typeof v) {
      case 'bigint': return 'n' + v.toString();
      case 'number': return Number.isInteger(v) ? 'n' + String(v) : 'f' + String(v);
      case 'boolean': return 'n' + (v ? 1 : 0);
      case 'string': return 's' + JSON.stringify(v);
    }
    if (v instanceof Tuple) return 't(' + v.items.map(hk).join(',') + ')';
    throw err('TypeError', "unhashable type: '" + typeName(v) + "'");
  }

  function fromJS(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isInteger(v) ? BigInt(v) : v;
    if (Array.isArray(v)) return v.map(fromJS);
    if (typeof v === 'object') { var d = new PyDict(); Object.keys(v).forEach(function (k) { d.set(k, fromJS(v[k])); }); return d; }
    return v;
  }
  function toJS(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'bigint') return Number(v);
    if (Array.isArray(v)) return v.map(toJS);
    if (v instanceof Tuple) return v.items.map(toJS);
    if (v instanceof PySet) return v.values().map(toJS);
    if (v instanceof PyDict) return v.entries().map(function (t) { return t.items.map(toJS); });
    return v;
  }

  /* ---------- repr / str / format ---------- */
  function floatRepr(x) {
    if (Number.isNaN(x)) return 'nan';
    if (x === Infinity) return 'inf'; if (x === -Infinity) return '-inf';
    if (Number.isInteger(x) && Math.abs(x) < 1e16) return (Object.is(x, -0) ? '-0' : String(x)) + '.0';
    if (Number.isInteger(x)) return x.toExponential().replace(/e([+-])(\d)$/, 'e$10$2');
    return String(x).replace(/e([+-])(\d)$/, 'e$10$2');
  }
  function strRepr(s) {
    var q = s.indexOf("'") > -1 && s.indexOf('"') === -1 ? '"' : "'";
    var body = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
    if (q === "'") body = body.replace(/'/g, "\\'");
    return q + body + q;
  }
  function repr(v) {
    if (v === null) return 'None';
    switch (typeof v) {
      case 'boolean': return v ? 'True' : 'False';
      case 'bigint': return v.toString();
      case 'number': return floatRepr(v);
      case 'string': return strRepr(v);
      case 'function': return '<built-in function ' + (v.pyname || 'fn') + '>';
    }
    if (Array.isArray(v)) return '[' + v.map(repr).join(', ') + ']';
    if (v instanceof Tuple) return '(' + v.items.map(repr).join(', ') + (v.items.length === 1 ? ',' : '') + ')';
    if (v instanceof PyDict) return '{' + v.entries().map(function (t) { return repr(t.items[0]) + ': ' + repr(t.items[1]); }).join(', ') + '}';
    if (v instanceof PySet) return v.size ? '{' + v.values().map(repr).join(', ') + '}' : 'set()';
    if (v instanceof Func) return '<function ' + v.name + '>';
    if (v instanceof PyRange) return 'range(' + v.a + ', ' + v.b + (v.c !== 1n ? ', ' + v.c : '') + ')';
    if (v instanceof Module) return "<module '" + v.name + "'>";
    return String(v);
  }
  var str = function (v) { return typeof v === 'string' ? v : repr(v); };

  function groupInt(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function formatValue(v, spec, line) {
    if (!spec) return str(v);
    var m = /^(?:(.)?([<>^=]))?([+\- ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([a-zA-Z%])?$/.exec(spec);
    if (!m) throw err('ValueError', "Invalid format specifier '" + spec + "'", line);
    var fill = m[1], align = m[2], sign = m[3] || '', zero = m[5], width = m[6] ? +m[6] : 0, group = m[7], prec = m[8] !== undefined ? +m[8] : null, type = m[9] || '';
    var out, numeric = isNumish(v);
    if (type === 'd' || type === 'f' || type === 'F' || type === '%' || type === 'e' || (numeric && !type && (prec !== null || group))) {
      if (!numeric) throw err('ValueError', "Unknown format code '" + type + "' for object of type '" + typeName(v) + "'", line);
      var x = toNum(v), neg = x < 0 || Object.is(x, -0);
      var ax = Math.abs(x), body;
      if (type === '%') body = (ax * 100).toFixed(prec === null ? 6 : prec) + '%';
      else if (type === 'e') body = ax.toExponential(prec === null ? 6 : prec).replace(/e([+-])(\d)$/, 'e$10$2');
      else if (type === 'd' || (isInt(numify(v)) && !type && prec === null)) body = (isInt(numify(v)) ? numify(v) < 0n ? -numify(v) : numify(v) : BigInt(Math.trunc(ax))).toString();
      else body = prec === null && !type ? floatRepr(ax).replace(/\.0$/, prec === null && type === '' ? '.0' : '') : ax.toFixed(prec === null ? 6 : prec);
      if (group) { var parts = body.split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, group); body = parts.join('.'); }
      var sg = neg ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : '';
      if (zero && !align) { while (sg.length + body.length < width) body = '0' + body; }
      out = sg + body;
      align = align || '>';
    } else {
      out = str(v);
      if (type === 's' || type === '') { if (prec !== null) out = out.slice(0, prec); }
      align = align || '<';
    }
    var pad = width - out.length;
    if (pad > 0) {
      var f = fill || ' ';
      if (align === '<') out = out + f.repeat(pad);
      else if (align === '>') out = f.repeat(pad) + out;
      else if (align === '^') out = f.repeat(Math.floor(pad / 2)) + out + f.repeat(pad - Math.floor(pad / 2));
      else out = f.repeat(pad) + out;
    }
    return out;
  }

  /* ---------- equality, ordering, truthiness ---------- */
  function eq(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (isNumish(a) && isNumish(b)) return toNum(a) === toNum(b);
    if (typeof a === 'string' || typeof b === 'string') return false;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every(function (x, i) { return eq(x, b[i]); });
    if (a instanceof Tuple && b instanceof Tuple) return eq(a.items, b.items);
    if (a instanceof PyDict && b instanceof PyDict) return a.size === b.size && a.keys().every(function (k) { return b.has(k) && eq(a.getv(k), b.getv(k)); });
    if (a instanceof PySet && b instanceof PySet) return a.size === b.size && a.values().every(function (x) { return b.has(x); });
    return false;
  }
  function cmp(a, b, line, opname) {
    if (isNumish(a) && isNumish(b)) {
      if (typeof numify(a) === 'bigint' && typeof numify(b) === 'bigint') { var x = numify(a), y = numify(b); return x < y ? -1 : x > y ? 1 : 0; }
      var p = toNum(a), q = toNum(b); return p < q ? -1 : p > q ? 1 : 0;
    }
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
    var la = Array.isArray(a) ? a : a instanceof Tuple ? a.items : null, lb = Array.isArray(b) ? b : b instanceof Tuple ? b.items : null;
    if (la && lb && Array.isArray(a) === Array.isArray(b)) {
      for (var i = 0; i < Math.min(la.length, lb.length); i++) { if (!eq(la[i], lb[i])) return cmp(la[i], lb[i], line, opname); }
      return la.length < lb.length ? -1 : la.length > lb.length ? 1 : 0;
    }
    throw err('TypeError', "'" + (opname || '<') + "' not supported between instances of '" + typeName(a) + "' and '" + typeName(b) + "'", line);
  }
  function truthy(v) {
    if (v === null || v === false) return false;
    if (v === true) return true;
    switch (typeof v) { case 'bigint': return v !== 0n; case 'number': return v !== 0; case 'string': return v.length > 0; }
    if (Array.isArray(v)) return v.length > 0;
    if (v instanceof Tuple) return v.items.length > 0;
    if (v instanceof PyDict || v instanceof PySet) return v.size > 0;
    if (v instanceof PyRange) return rangeLen(v) > 0;
    return true;
  }
  function contains(c, item, line) {
    if (typeof c === 'string') { if (typeof item !== 'string') throw err('TypeError', "'in <string>' requires string as left operand, not " + typeName(item), line); return c.indexOf(item) > -1; }
    if (Array.isArray(c)) return c.some(function (x) { return eq(x, item); });
    if (c instanceof Tuple) return c.items.some(function (x) { return eq(x, item); });
    if (c instanceof PyDict || c instanceof PySet) return c.has(item);
    if (c instanceof PyRange) return iterate(c).some(function (x) { return eq(x, item); });
    throw err('TypeError', "argument of type '" + typeName(c) + "' is not iterable", line);
  }

  /* ---------- iteration ---------- */
  function rangeLen(r) {
    var a = r.a, b = r.b, c = r.c;
    if (c > 0n) return a >= b ? 0 : Number((b - a + c - 1n) / c);
    return a <= b ? 0 : Number((a - b - c - 1n) / (-c));
  }
  function iterate(v, line) {
    if (Array.isArray(v)) return v;
    if (v instanceof Tuple) return v.items;
    if (typeof v === 'string') return Array.from(v);
    if (v instanceof PyDict) return v.keys();
    if (v instanceof PySet) return v.values();
    if (v instanceof PyRange) {
      var n = rangeLen(v); if (n > 5000000) throw err('MemoryError', 'range is too large for this mini Python', line);
      var out = new Array(n), x = v.a; for (var i = 0; i < n; i++) { out[i] = x; x += v.c; } return out;
    }
    throw err('TypeError', "'" + typeName(v) + "' object is not iterable", line);
  }

  /* ---------- arithmetic ---------- */
  function floorDivBig(a, b) { var q = a / b; if ((a % b !== 0n) && ((a < 0n) !== (b < 0n))) q -= 1n; return q; }
  function modBig(a, b) { var r = a % b; if (r !== 0n && ((r < 0n) !== (b < 0n))) r += b; return r; }
  function binop(op, a, b, line) {
    if (isNumish(a) && isNumish(b)) {
      a = numify(a); b = numify(b);
      if (typeof a === 'bigint' && typeof b === 'bigint') {
        switch (op) {
          case '+': return a + b; case '-': return a - b; case '*': return a * b;
          case '/': if (b === 0n) throw err('ZeroDivisionError', 'division by zero', line); return Number(a) / Number(b);
          case '//': if (b === 0n) throw err('ZeroDivisionError', 'integer division or modulo by zero', line); return floorDivBig(a, b);
          case '%': if (b === 0n) throw err('ZeroDivisionError', 'integer modulo by zero', line); return modBig(a, b);
          case '**': return b >= 0n ? a ** b : Math.pow(Number(a), Number(b));
          case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
        }
      } else {
        var x = Number(a), y = Number(b);
        switch (op) {
          case '+': return x + y; case '-': return x - y; case '*': return x * y;
          case '/': if (y === 0) throw err('ZeroDivisionError', 'float division by zero', line); return x / y;
          case '//': if (y === 0) throw err('ZeroDivisionError', 'float floor division by zero', line); return Math.floor(x / y);
          case '%': if (y === 0) throw err('ZeroDivisionError', 'float modulo by zero', line); return x - Math.floor(x / y) * y;
          case '**': return Math.pow(x, y);
        }
      }
    }
    if (op === '+') {
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
      if (a instanceof Tuple && b instanceof Tuple) return new Tuple(a.items.concat(b.items));
    }
    if (op === '*') {
      var rep = function (seq, n) { n = Number(numify(n)); return n <= 0 ? seq.slice(0, 0) : seq; };
      if (typeof a === 'string' && isInt(numify(b))) return a.repeat(Math.max(0, Number(numify(b))));
      if (typeof b === 'string' && isInt(numify(a))) return b.repeat(Math.max(0, Number(numify(a))));
      if (Array.isArray(a) && isInt(numify(b))) { var r = []; for (var i = 0; i < Number(numify(b)); i++) r = r.concat(a); return r; }
      if (Array.isArray(b) && isInt(numify(a))) return binop('*', b, a, line);
    }
    if (a instanceof PySet && b instanceof PySet) {
      var s = new PySet();
      if (op === '|') { a.values().concat(b.values()).forEach(function (v) { s.add(v); }); return s; }
      if (op === '&') { a.values().forEach(function (v) { if (b.has(v)) s.add(v); }); return s; }
      if (op === '-') { a.values().forEach(function (v) { if (!b.has(v)) s.add(v); }); return s; }
    }
    if (op === '%' && typeof a === 'string') throw err('TypeError', 'old-style % formatting is not supported here, use an f-string', line);
    throw err('TypeError', "unsupported operand type(s) for " + op + ": '" + typeName(a) + "' and '" + typeName(b) + "'", line);
  }

  /* ---------- lexer ---------- */
  var KW = new Set(['and', 'or', 'not', 'in', 'is', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'def', 'return', 'pass', 'lambda', 'None', 'True', 'False', 'import', 'from', 'as',
    'class', 'try', 'except', 'finally', 'with', 'yield', 'del', 'global', 'nonlocal', 'assert', 'raise', 'async', 'await']);
  var UNSUPPORTED = new Set(['class', 'try', 'except', 'finally', 'with', 'yield', 'del', 'global', 'nonlocal', 'assert', 'raise', 'async', 'await']);
  var OPS = ['**=', '//=', '>>=', '<<=', '**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '->', ':=',
    '+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '[', ']', '{', '}', ',', ':', '.', ';', '&', '|', '^', '~', '@'];
  var ESC = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '0': '\0' };

  function parseFString(raw, line) {
    var parts = [], lit = '', i = 0, n = raw.length;
    while (i < n) {
      var c = raw[i];
      if (c === '{') {
        if (raw[i + 1] === '{') { lit += '{'; i += 2; continue; }
        if (lit) { parts.push({ lit: lit }); lit = ''; }
        var depth = 1, j = i + 1, quote = null;
        while (j < n && depth > 0) {
          var d = raw[j];
          if (quote) { if (d === quote) quote = null; }
          else if (d === "'" || d === '"') quote = d;
          else if ('([{'.indexOf(d) > -1) depth++;
          else if (')]}'.indexOf(d) > -1) depth--;
          j++;
        }
        if (depth > 0) throw err('SyntaxError', "f-string: expecting '}'", line);
        var inner = raw.slice(i + 1, j - 1), spec = '', conv = '';
        var depth2 = 0, q2 = null, cut = -1;
        for (var k = 0; k < inner.length; k++) {
          var e = inner[k];
          if (q2) { if (e === q2) q2 = null; continue; }
          if (e === "'" || e === '"') { q2 = e; continue; }
          if ('([{'.indexOf(e) > -1) depth2++; else if (')]}'.indexOf(e) > -1) depth2--;
          else if (e === ':' && depth2 === 0) { cut = k; break; }
        }
        if (cut > -1) { spec = inner.slice(cut + 1); inner = inner.slice(0, cut); }
        var bang = /!([rs])$/.exec(inner); if (bang) { conv = bang[1]; inner = inner.slice(0, -2); }
        parts.push({ expr: inner.trim(), spec: spec, conv: conv, line: line });
        i = j; continue;
      }
      if (c === '}') { if (raw[i + 1] === '}') { lit += '}'; i += 2; continue; } throw err('SyntaxError', "f-string: single '}' is not allowed", line); }
      lit += c; i++;
    }
    if (lit) parts.push({ lit: lit });
    return parts;
  }

  function tokenize(src) {
    var toks = [], i = 0, line = 1, n = src.length, indents = [0], depth = 0, atStart = true;
    var push = function (t, v, extra) { var o = { t: t, v: v, line: line }; if (extra) for (var k in extra) o[k] = extra[k]; toks.push(o); };
    while (i < n) {
      if (atStart && depth === 0) {
        var col = 0, j = i;
        while (j < n && (src[j] === ' ' || src[j] === '\t')) { col += src[j] === '\t' ? 4 : 1; j++; }
        if (j >= n) { i = j; break; }
        if (src[j] === '\n' || src[j] === '\r') { i = j + (src[j] === '\r' && src[j + 1] === '\n' ? 2 : 1); line++; continue; }
        if (src[j] === '#') { while (j < n && src[j] !== '\n') j++; i = j; continue; }
        if (col > indents[indents.length - 1]) { indents.push(col); push('INDENT'); }
        else while (col < indents[indents.length - 1]) {
          indents.pop(); push('DEDENT');
          if (col > indents[indents.length - 1]) throw err('IndentationError', 'unindent does not match any outer indentation level', line);
        }
        i = j; atStart = false;
      }
      var c = src[i];
      if (c === '\r') { i++; continue; }
      if (c === '\n') { i++; if (depth > 0) { line++; continue; } push('NL'); line++; atStart = true; continue; }
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) { i += src[i + 1] === '\r' ? 3 : 2; line++; continue; }
      if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
      var rest;
      /* strings (with optional prefix) */
      var sm = /^([rRfFbBuU]{0,2})('''|"""|'|")/.exec(src.slice(i, i + 5));
      if (sm) {
        var prefix = sm[1].toLowerCase(), q = sm[2], isRaw = prefix.indexOf('r') > -1, isF = prefix.indexOf('f') > -1;
        var p = i + sm[1].length + q.length, buf = '', startLine = line;
        for (;;) {
          if (p >= n) throw err('SyntaxError', 'unterminated string literal', startLine);
          if (src.startsWith(q, p)) { p += q.length; break; }
          var ch = src[p];
          if (ch === '\n') { if (q.length === 1) throw err('SyntaxError', 'unterminated string literal', startLine); line++; }
          if (ch === '\\' && !isRaw) {
            var nx = src[p + 1];
            if (nx === '\n') { line++; p += 2; continue; }
            if (isF && (nx === '{' || nx === '}')) { buf += '\\'; p++; continue; }
            buf += ESC[nx] !== undefined ? ESC[nx] : '\\' + nx; p += 2; continue;
          }
          buf += ch; p++;
        }
        i = p;
        if (isF) push('STR', null, { f: parseFString(buf, startLine) }); else push('STR', buf);
        continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        var m = /^(?:0[xX][0-9a-fA-F_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)/.exec(src.slice(i));
        var txt = m[0].replace(/_/g, ''); i += m[0].length;
        if (/^0[xX]/.test(txt)) push('NUM', BigInt(txt));
        else if (/[.eE]/.test(txt)) push('NUM', parseFloat(txt));
        else push('NUM', BigInt(txt));
        continue;
      }
      var nm = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i, i + 80));
      if (nm) { push('NAME', nm[0]); i += nm[0].length; continue; }
      var op = null;
      for (var oi = 0; oi < OPS.length; oi++) if (src.startsWith(OPS[oi], i)) { op = OPS[oi]; break; }
      if (!op) throw err('SyntaxError', "invalid character '" + c + "'", line);
      if ('([{'.indexOf(op) > -1) depth++; else if (')]}'.indexOf(op) > -1) depth = Math.max(0, depth - 1);
      push('OP', op); i += op.length;
    }
    if (toks.length && toks[toks.length - 1].t !== 'NL') push('NL');
    while (indents.length > 1) { indents.pop(); push('DEDENT'); }
    push('EOF');
    return toks;
  }

  /* ---------- parser ---------- */
  class Parser {
    constructor(toks) { this.toks = toks; this.p = 0; }
    get tok() { return this.toks[this.p]; }
    peekOp(v) { var t = this.tok; return t.t === 'OP' && t.v === v; }
    peekKw(v) { var t = this.tok; return t.t === 'NAME' && t.v === v; }
    next() { return this.toks[this.p++]; }
    eatOp(v) { if (this.peekOp(v)) { this.p++; return true; } return false; }
    eatKw(v) { if (this.peekKw(v)) { this.p++; return true; } return false; }
    expectOp(v) { if (!this.eatOp(v)) throw this.syntax("expected '" + v + "'"); }
    expectKw(v) { if (!this.eatKw(v)) throw this.syntax("expected '" + v + "'"); }
    syntax(msg) { var t = this.tok; return err('SyntaxError', msg + (t.t === 'NL' ? ' (end of line)' : t.t === 'EOF' ? ' (end of code)' : t.v !== undefined && t.v !== null ? " near '" + String(t.v) + "'" : ''), t.line); }

    parseModule() { var body = []; while (this.tok.t !== 'EOF') { if (this.tok.t === 'NL') { this.p++; continue; } this.parseStatement(body); } return body; }
    parseExprOnly() { var e = this.parseTupleExpr(); if (this.tok.t !== 'NL' && this.tok.t !== 'EOF') throw this.syntax('invalid expression'); return e; }

    parseBlock() {
      this.expectOp(':');
      var body = [];
      if (this.tok.t === 'NL') {
        this.p++;
        if (this.tok.t !== 'INDENT') throw err('IndentationError', 'expected an indented block', this.tok.line);
        this.p++;
        while (this.tok.t !== 'DEDENT' && this.tok.t !== 'EOF') { if (this.tok.t === 'NL') { this.p++; continue; } this.parseStatement(body); }
        if (this.tok.t === 'DEDENT') this.p++;
      } else this.parseSimpleLine(body);
      return body;
    }

    parseStatement(out) {
      var t = this.tok;
      if (t.t === 'INDENT') throw err('IndentationError', 'unexpected indent', t.line);
      if (t.t === 'NAME') {
        if (UNSUPPORTED.has(t.v)) throw err('SyntaxError', "'" + t.v + "' is not supported in this mini Python", t.line);
        if (t.v === 'if') { out.push(this.parseIf()); return; }
        if (t.v === 'while') { this.p++; var test = this.parseTest(); out.push({ type: 'While', test: test, body: this.parseBlock(), line: t.line }); return; }
        if (t.v === 'for') {
          this.p++; var target = this.parseTargetList(); this.expectKw('in'); var iter = this.parseTupleExpr();
          out.push({ type: 'For', target: target, iter: iter, body: this.parseBlock(), line: t.line }); return;
        }
        if (t.v === 'def') {
          this.p++; var nm = this.next(); if (nm.t !== 'NAME') throw this.syntax('expected a function name');
          this.expectOp('('); var params = this.parseParams(')'); this.expectOp(')');
          out.push({ type: 'Def', name: nm.v, params: params, body: this.parseBlock(), line: t.line }); return;
        }
      }
      this.parseSimpleLine(out);
    }
    parseIf() {
      var line = this.tok.line, tests = [], orelse = null;
      this.p++; var test = this.parseTest(); tests.push({ test: test, body: this.parseBlock() });
      while (this.peekKw('elif')) { this.p++; var t2 = this.parseTest(); tests.push({ test: t2, body: this.parseBlock() }); }
      if (this.peekKw('else')) { this.p++; orelse = this.parseBlock(); }
      return { type: 'If', tests: tests, orelse: orelse, line: line };
    }
    parseParams(end) {
      var params = [];
      while (!this.peekOp(end)) {
        var t = this.next();
        if (t.t === 'OP' && (t.v === '*' || t.v === '**')) throw err('SyntaxError', '*args and **kwargs are not supported in this mini Python', t.line);
        if (t.t !== 'NAME' || KW.has(t.v)) throw this.syntax('invalid parameter');
        var prm = { name: t.v, def: undefined };
        if (end === ')' && this.eatOp(':')) this.parseTest();
        if (this.eatOp('=')) prm.def = this.parseTest();
        params.push(prm);
        if (!this.eatOp(',')) break;
      }
      return params;
    }
    parseSimpleLine(out) {
      for (;;) {
        out.push(this.parseSimple());
        if (this.eatOp(';')) { if (this.tok.t === 'NL' || this.tok.t === 'EOF') break; continue; }
        break;
      }
      if (this.tok.t === 'NL') this.p++; else if (this.tok.t !== 'EOF' && this.tok.t !== 'DEDENT') throw this.syntax('invalid syntax');
    }
    parseSimple() {
      var t = this.tok, line = t.line;
      if (t.t === 'NAME') {
        if (UNSUPPORTED.has(t.v)) throw err('SyntaxError', "'" + t.v + "' is not supported in this mini Python", line);
        if (t.v === 'pass') { this.p++; return { type: 'Pass', line: line }; }
        if (t.v === 'break') { this.p++; return { type: 'Break', line: line }; }
        if (t.v === 'continue') { this.p++; return { type: 'Continue', line: line }; }
        if (t.v === 'return') { this.p++; var v = null; if (this.tok.t !== 'NL' && this.tok.t !== 'EOF' && !this.peekOp(';')) v = this.parseTupleExpr(); return { type: 'Return', value: v, line: line }; }
        if (t.v === 'import') {
          this.p++; var names = [];
          do { var mn = this.next().v, as = null; if (this.eatKw('as')) as = this.next().v; names.push({ mod: mn, as: as }); } while (this.eatOp(','));
          return { type: 'Import', names: names, line: line };
        }
        if (t.v === 'from') {
          this.p++; var mod = this.next().v; this.expectKw('import'); var nms = [];
          do { var nn = this.next().v, as2 = null; if (this.eatKw('as')) as2 = this.next().v; nms.push({ name: nn, as: as2 }); } while (this.eatOp(','));
          return { type: 'ImportFrom', mod: mod, names: nms, line: line };
        }
      }
      var e = this.parseTupleExpr();
      if (this.peekOp('=')) {
        var targets = [e], value = null;
        while (this.eatOp('=')) { value = this.parseTupleExpr(); targets.push(value); }
        targets.pop();
        targets.forEach(function (tg) { checkTarget(tg, line); });
        return { type: 'Assign', targets: targets, value: value, line: line };
      }
      var at = this.tok;
      if (at.t === 'OP' && /^(\+|-|\*|\/|\/\/|%|\*\*|&|\||\^)=$/.test(at.v)) {
        this.p++; checkTarget(e, line);
        return { type: 'AugAssign', target: e, op: at.v.slice(0, -1), value: this.parseTupleExpr(), line: line };
      }
      return { type: 'ExprStmt', expr: e, line: line };
    }
    parseTargetList() {
      var items = [this.parseTarget()], trailing = false;
      while (this.eatOp(',')) { if (this.peekKw('in') || this.peekOp('=')) { trailing = true; break; } items.push(this.parseTarget()); }
      return items.length === 1 && !trailing ? items[0] : { type: 'Tuple', items: items, line: items[0].line };
    }
    parseTarget() {
      var t = this.tok;
      if (t.t === 'OP' && (t.v === '(' || t.v === '[')) {
        var close = t.v === '(' ? ')' : ']'; this.p++;
        var items = [];
        while (!this.peekOp(close)) { items.push(this.parseTarget()); if (!this.eatOp(',')) break; }
        this.expectOp(close);
        return { type: 'Tuple', items: items, line: t.line };
      }
      return this.parsePostfix();
    }

    parseTupleExpr() {
      var first = this.parseTest();
      if (!this.peekOp(',')) return first;
      var items = [first], line = first.line;
      while (this.eatOp(',')) {
        var t = this.tok;
        if (t.t === 'NL' || t.t === 'EOF' || (t.t === 'OP' && (t.v === ')' || t.v === ']' || t.v === '}' || t.v === '=' || t.v === ':' || t.v === ';')) || (t.t === 'NAME' && t.v === 'in')) break;
        items.push(this.parseTest());
      }
      return { type: 'Tuple', items: items, line: line };
    }
    parseTest() {
      if (this.peekKw('lambda')) {
        var line = this.tok.line; this.p++;
        var params = this.parseParams(':'); this.expectOp(':');
        return { type: 'Lambda', params: params, body: this.parseTest(), line: line };
      }
      var e = this.parseOr();
      if (this.peekKw('if')) {
        this.p++; var cond = this.parseOr(); this.expectKw('else'); var alt = this.parseTest();
        return { type: 'IfExp', test: cond, body: e, orelse: alt, line: e.line };
      }
      return e;
    }
    parseOr() { var e = this.parseAnd(); while (this.peekKw('or')) { this.p++; e = { type: 'BoolOp', op: 'or', left: e, right: this.parseAnd(), line: e.line }; } return e; }
    parseAnd() { var e = this.parseNot(); while (this.peekKw('and')) { this.p++; e = { type: 'BoolOp', op: 'and', left: e, right: this.parseNot(), line: e.line }; } return e; }
    parseNot() { if (this.peekKw('not')) { var line = this.tok.line; this.p++; return { type: 'Not', operand: this.parseNot(), line: line }; } return this.parseComparison(); }
    parseComparison() {
      var left = this.parseBitOr(), ops = [], comps = [];
      for (;;) {
        var t = this.tok, op = null;
        if (t.t === 'OP' && (t.v === '==' || t.v === '!=' || t.v === '<' || t.v === '>' || t.v === '<=' || t.v === '>=')) { op = t.v; this.p++; }
        else if (t.t === 'NAME' && t.v === 'in') { op = 'in'; this.p++; }
        else if (t.t === 'NAME' && t.v === 'not' && this.toks[this.p + 1].t === 'NAME' && this.toks[this.p + 1].v === 'in') { op = 'not in'; this.p += 2; }
        else if (t.t === 'NAME' && t.v === 'is') { this.p++; if (this.eatKw('not')) op = 'is not'; else op = 'is'; }
        if (!op) break;
        ops.push(op); comps.push(this.parseBitOr());
      }
      return ops.length ? { type: 'Compare', left: left, ops: ops, comps: comps, line: left.line } : left;
    }
    parseBitOr() { var e = this.parseBitXor(); while (this.peekOp('|')) { this.p++; e = { type: 'BinOp', op: '|', left: e, right: this.parseBitXor(), line: e.line }; } return e; }
    parseBitXor() { var e = this.parseBitAnd(); while (this.peekOp('^')) { this.p++; e = { type: 'BinOp', op: '^', left: e, right: this.parseBitAnd(), line: e.line }; } return e; }
    parseBitAnd() { var e = this.parseSum(); while (this.peekOp('&')) { this.p++; e = { type: 'BinOp', op: '&', left: e, right: this.parseSum(), line: e.line }; } return e; }
    parseSum() {
      var e = this.parseTerm();
      while (this.peekOp('+') || this.peekOp('-')) { var op = this.next().v; e = { type: 'BinOp', op: op, left: e, right: this.parseTerm(), line: e.line }; }
      return e;
    }
    parseTerm() {
      var e = this.parseFactor();
      while (this.peekOp('*') || this.peekOp('/') || this.peekOp('//') || this.peekOp('%')) { var op = this.next().v; e = { type: 'BinOp', op: op, left: e, right: this.parseFactor(), line: e.line }; }
      return e;
    }
    parseFactor() {
      if (this.peekOp('-') || this.peekOp('+')) { var t = this.next(); return { type: 'Unary', op: t.v, operand: this.parseFactor(), line: t.line }; }
      return this.parsePower();
    }
    parsePower() {
      var e = this.parsePostfix();
      if (this.peekOp('**')) { this.p++; return { type: 'BinOp', op: '**', left: e, right: this.parseFactor(), line: e.line }; }
      return e;
    }
    parsePostfix() {
      var e = this.parseAtom();
      for (;;) {
        var t = this.tok;
        if (t.t !== 'OP') break;
        if (t.v === '(') { this.p++; e = this.parseCall(e); }
        else if (t.v === '[') { this.p++; var idx = this.parseSubscript(); this.expectOp(']'); e = { type: 'Subscript', obj: e, index: idx, line: t.line }; }
        else if (t.v === '.') { this.p++; var nm = this.next(); if (nm.t !== 'NAME') throw this.syntax('expected an attribute name'); e = { type: 'Attr', obj: e, name: nm.v, line: t.line }; }
        else break;
      }
      return e;
    }
    parseCall(func) {
      var args = [], kwargs = [], line = func.line;
      while (!this.peekOp(')')) {
        var t = this.tok;
        if (t.t === 'OP' && (t.v === '*' || t.v === '**')) throw err('SyntaxError', '*args and **kwargs in calls are not supported in this mini Python', t.line);
        if (t.t === 'NAME' && !KW.has(t.v) && this.toks[this.p + 1].t === 'OP' && this.toks[this.p + 1].v === '=') {
          this.p += 2; kwargs.push({ name: t.v, value: this.parseTest() });
        } else {
          var a = this.parseTest();
          if (this.peekKw('for')) a = { type: 'ListComp', elt: a, gens: this.parseGens(), line: a.line };
          args.push(a);
        }
        if (!this.eatOp(',')) break;
      }
      this.expectOp(')');
      return { type: 'Call', func: func, args: args, kwargs: kwargs, line: line };
    }
    parseSubscript() {
      var line = this.tok.line;
      var parseOne = function (self) {
        var lo = null, hi = null, step = null, isSlice = false;
        if (!self.peekOp(':')) lo = self.parseTest();
        if (self.peekOp(':')) {
          isSlice = true; self.p++;
          if (!self.peekOp(':') && !self.peekOp(']') && !self.peekOp(',')) hi = self.parseTest();
          if (self.peekOp(':')) { self.p++; if (!self.peekOp(']') && !self.peekOp(',')) step = self.parseTest(); }
        }
        return isSlice ? { type: 'Slice', lo: lo, hi: hi, step: step, line: line } : lo;
      };
      var first = parseOne(this);
      if (!this.peekOp(',')) return first;
      var items = [first];
      while (this.eatOp(',')) { if (this.peekOp(']')) break; items.push(parseOne(this)); }
      return { type: 'Tuple', items: items, line: line };
    }
    parseGens() {
      var gens = [];
      while (this.peekKw('for')) {
        this.p++; var target = this.parseTargetList(); this.expectKw('in');
        var iter = this.parseOr(), conds = [];
        while (this.peekKw('if')) { this.p++; conds.push(this.parseOr()); }
        gens.push({ target: target, iter: iter, conds: conds });
      }
      return gens;
    }
    parseAtom() {
      var t = this.next(), line = t.line;
      switch (t.t) {
        case 'NUM': return { type: 'Const', value: t.v, line: line };
        case 'STR': {
          var node = t.f ? { type: 'FStr', parts: this.compileF(t.f), line: line } : { type: 'Const', value: t.v, line: line };
          while (this.tok.t === 'STR') {
            var t2 = this.next(); var parts1 = node.type === 'FStr' ? node.parts : [{ lit: node.value }];
            var parts2 = t2.f ? this.compileF(t2.f) : [{ lit: t2.v }];
            node = { type: 'FStr', parts: parts1.concat(parts2), line: line };
          }
          if (node.type === 'FStr' && node.parts.every(function (p) { return p.lit !== undefined; })) return { type: 'Const', value: node.parts.map(function (p) { return p.lit; }).join(''), line: line };
          return node;
        }
        case 'NAME':
          if (t.v === 'None') return { type: 'Const', value: null, line: line };
          if (t.v === 'True') return { type: 'Const', value: true, line: line };
          if (t.v === 'False') return { type: 'Const', value: false, line: line };
          if (KW.has(t.v)) { this.p--; throw this.syntax('invalid syntax'); }
          return { type: 'Name', id: t.v, line: line };
        case 'OP':
          if (t.v === '(') {
            if (this.eatOp(')')) return { type: 'Tuple', items: [], line: line };
            var first = this.parseTest();
            if (this.peekKw('for')) { var g = { type: 'ListComp', elt: first, gens: this.parseGens(), line: line }; this.expectOp(')'); return g; }
            if (this.peekOp(',')) {
              var items = [first];
              while (this.eatOp(',')) { if (this.peekOp(')')) break; items.push(this.parseTest()); }
              this.expectOp(')'); return { type: 'Tuple', items: items, line: line };
            }
            this.expectOp(')'); return first;
          }
          if (t.v === '[') {
            if (this.eatOp(']')) return { type: 'List', items: [], line: line };
            var f1 = this.parseTest();
            if (this.peekKw('for')) { var lc = { type: 'ListComp', elt: f1, gens: this.parseGens(), line: line }; this.expectOp(']'); return lc; }
            var its = [f1];
            while (this.eatOp(',')) { if (this.peekOp(']')) break; its.push(this.parseTest()); }
            this.expectOp(']'); return { type: 'List', items: its, line: line };
          }
          if (t.v === '{') {
            if (this.eatOp('}')) return { type: 'Dict', pairs: [], line: line };
            var k1 = this.parseTest();
            if (this.eatOp(':')) {
              var v1 = this.parseTest();
              if (this.peekKw('for')) { var dc = { type: 'DictComp', key: k1, value: v1, gens: this.parseGens(), line: line }; this.expectOp('}'); return dc; }
              var pairs = [[k1, v1]];
              while (this.eatOp(',')) { if (this.peekOp('}')) break; var kk = this.parseTest(); this.expectOp(':'); pairs.push([kk, this.parseTest()]); }
              this.expectOp('}'); return { type: 'Dict', pairs: pairs, line: line };
            }
            if (this.peekKw('for')) { var sc = { type: 'SetComp', elt: k1, gens: this.parseGens(), line: line }; this.expectOp('}'); return sc; }
            var sitems = [k1];
            while (this.eatOp(',')) { if (this.peekOp('}')) break; sitems.push(this.parseTest()); }
            this.expectOp('}'); return { type: 'Set', items: sitems, line: line };
          }
      }
      this.p--; throw this.syntax('invalid syntax');
    }
    compileF(parts) {
      return parts.map(function (p) {
        if (p.lit !== undefined) return p;
        var ps = new Parser(tokenize(p.expr));
        return { expr: ps.parseExprOnly(), spec: p.spec, conv: p.conv };
      });
    }
  }
  function checkTarget(t, line) {
    if (t.type === 'Name' || t.type === 'Subscript' || t.type === 'Attr') return;
    if (t.type === 'Tuple' || t.type === 'List') { t.items.forEach(function (x) { checkTarget(x, line); }); return; }
    throw err('SyntaxError', 'cannot assign to this expression', line);
  }

  /* ---------- interpreter ---------- */
  var BREAK = { k: 'b' }, CONTINUE = { k: 'c' };

  function Interp(out) { this.out = out; this.steps = 0; this.t0 = Date.now(); this.depth = 0; }
  Interp.prototype.tick = function (line) {
    if (++this.steps > 6000000 || ((this.steps & 2047) === 0 && Date.now() - this.t0 > 3000))
      throw err('TimeoutError', 'the code ran for too long. Check for a loop that never ends.', line);
  };

  function assign(it, target, value, scope) {
    switch (target.type) {
      case 'Name': scope.vars.set(target.id, value); return;
      case 'Tuple': case 'List': {
        var vals = iterate(value, target.line);
        if (vals.length !== target.items.length) throw err('ValueError', vals.length > target.items.length ? 'too many values to unpack (expected ' + target.items.length + ')' : 'not enough values to unpack (expected ' + target.items.length + ', got ' + vals.length + ')', target.line);
        for (var i = 0; i < vals.length; i++) assign(it, target.items[i], vals[i], scope);
        return;
      }
      case 'Subscript': {
        var obj = evalExpr(it, target.obj, scope), idx = evalExpr(it, target.index, scope);
        setItem(obj, idx, value, target.line); return;
      }
      case 'Attr': throw err('AttributeError', 'cannot set attributes in this mini Python', target.line);
    }
  }
  function setItem(obj, idx, value, line) {
    if (Array.isArray(obj)) {
      var i = toIdx(idx, line); if (i < 0) i += obj.length;
      if (i < 0 || i >= obj.length) throw err('IndexError', 'list assignment index out of range', line);
      obj[i] = value; return;
    }
    if (obj instanceof PyDict) { obj.set(idx, value); return; }
    throw err('TypeError', "'" + typeName(obj) + "' object does not support item assignment", line);
  }
  function getItem(it, obj, idx, line) {
    if (idx instanceof PySlice) {
      var seq = typeof obj === 'string' ? Array.from(obj) : Array.isArray(obj) ? obj : obj instanceof Tuple ? obj.items : null;
      if (!seq) throw err('TypeError', "'" + typeName(obj) + "' object is not subscriptable", line);
      var n = seq.length, step = idx.step === null ? 1 : toIdx(idx.step, line), lo, hi;
      if (step === 0) throw err('ValueError', 'slice step cannot be zero', line);
      var clampPos = function (x) { x = toIdx(x, line); return x < 0 ? Math.max(0, x + n) : Math.min(x, n); };
      var clampNeg = function (x) { x = toIdx(x, line); return x < 0 ? Math.max(-1, x + n) : Math.min(x, n - 1); };
      if (step > 0) { lo = idx.lo === null ? 0 : clampPos(idx.lo); hi = idx.hi === null ? n : clampPos(idx.hi); }
      else { lo = idx.lo === null ? n - 1 : clampNeg(idx.lo); hi = idx.hi === null ? -1 : clampNeg(idx.hi); }
      var res = [];
      if (step > 0) for (var i = lo; i < hi; i += step) res.push(seq[i]);
      else for (var j = lo; j > hi; j += step) res.push(seq[j]);
      return typeof obj === 'string' ? res.join('') : obj instanceof Tuple ? new Tuple(res) : res;
    }
    if (Array.isArray(obj) || obj instanceof Tuple || typeof obj === 'string') {
      var arr = Array.isArray(obj) ? obj : obj instanceof Tuple ? obj.items : obj;
      var k = toIdx(idx, line); if (k < 0) k += arr.length;
      if (k < 0 || k >= arr.length) throw err('IndexError', (typeof obj === 'string' ? 'string' : Array.isArray(obj) ? 'list' : 'tuple') + ' index out of range', line);
      return typeof obj === 'string' ? Array.from(obj)[k] : arr[k];
    }
    if (obj instanceof PyDict) {
      var v = obj.getv(idx);
      if (v !== undefined) return v;
      if (obj.def) { var d = callValue(it, obj.def, [], {}, line); obj.set(idx, d); return d; }
      throw err('KeyError', repr(idx), line);
    }
    if (obj instanceof PyRange) return iterate(obj, line)[toIdx(idx, line)];
    throw err('TypeError', "'" + typeName(obj) + "' object is not subscriptable", line);
  }

  function execBlock(it, body, scope) {
    for (var i = 0; i < body.length; i++) { var sig = exec(it, body[i], scope); if (sig) return sig; }
    return undefined;
  }
  function exec(it, s, scope) {
    it.tick(s.line);
    try {
      switch (s.type) {
        case 'ExprStmt': evalExpr(it, s.expr, scope); return;
        case 'Assign': {
          var v = evalExpr(it, s.value, scope);
          for (var i = 0; i < s.targets.length; i++) assign(it, s.targets[i], v, scope);
          return;
        }
        case 'AugAssign': {
          var t = s.target;
          if (t.type === 'Name') { scope.vars.set(t.id, augOp(it, s.op, scope.lookup(t.id, s.line), evalExpr(it, s.value, scope), s.line)); return; }
          if (t.type === 'Subscript') {
            var obj = evalExpr(it, t.obj, scope), idx = evalExpr(it, t.index, scope);
            setItem(obj, idx, augOp(it, s.op, getItem(it, obj, idx, s.line), evalExpr(it, s.value, scope), s.line), s.line); return;
          }
          throw err('SyntaxError', 'unsupported augmented assignment target', s.line);
        }
        case 'If':
          for (var k = 0; k < s.tests.length; k++) if (truthy(evalExpr(it, s.tests[k].test, scope))) return execBlock(it, s.tests[k].body, scope);
          if (s.orelse) return execBlock(it, s.orelse, scope);
          return;
        case 'For': {
          var items = iterate(evalExpr(it, s.iter, scope), s.line);
          if (!Array.isArray(items) || items === undefined) items = Array.from(items);
          var snapshot = items.length;
          for (var n = 0; n < items.length; n++) {
            it.tick(s.line);
            assign(it, s.target, items[n], scope);
            var sg = execBlock(it, s.body, scope);
            if (sg) { if (sg === BREAK) break; if (sg === CONTINUE) continue; return sg; }
          }
          return;
        }
        case 'While':
          while (truthy(evalExpr(it, s.test, scope))) {
            it.tick(s.line);
            var sg2 = execBlock(it, s.body, scope);
            if (sg2) { if (sg2 === BREAK) break; if (sg2 === CONTINUE) continue; return sg2; }
          }
          return;
        case 'Break': return BREAK;
        case 'Continue': return CONTINUE;
        case 'Pass': return;
        case 'Return': return { k: 'r', v: s.value ? evalExpr(it, s.value, scope) : null };
        case 'Def': {
          var params = s.params.map(function (p) { return { name: p.name, def: p.def ? evalExpr(it, p.def, scope) : undefined, has: !!p.def }; });
          scope.vars.set(s.name, new Func(s.name, params, s.body, scope, false)); return;
        }
        case 'Import': s.names.forEach(function (n) { scope.vars.set(n.as || n.mod.split('.')[0], getModule(n.mod, s.line)); }); return;
        case 'ImportFrom': {
          var mod = getModule(s.mod, s.line);
          s.names.forEach(function (n) {
            if (!(n.name in mod.attrs)) throw err('ImportError', "cannot import name '" + n.name + "' from '" + s.mod + "'", s.line);
            scope.vars.set(n.as || n.name, mod.attrs[n.name]);
          });
          return;
        }
      }
    } catch (e) {
      if (e instanceof PyError && !e.line) e.line = s.line;
      throw e;
    }
  }
  function augOp(it, op, a, b, line) {
    if (op === '+' && Array.isArray(a) && b !== undefined) { var items = iterate(b, line); items.forEach(function (x) { a.push(x); }); return a; }
    return binop(op, a, b, line);
  }

  function evalExpr(it, e, scope) {
    switch (e.type) {
      case 'Const': return e.value;
      case 'Name': return scope.lookup(e.id, e.line);
      case 'FStr': {
        var out = '';
        e.parts.forEach(function (p) {
          if (p.lit !== undefined) { out += p.lit; return; }
          var v = evalExpr(it, p.expr, scope);
          if (p.conv === 'r') v = repr(v); else if (p.conv === 's') v = str(v);
          out += formatValue(v, p.spec, e.line);
        });
        return out;
      }
      case 'List': return e.items.map(function (x) { return evalExpr(it, x, scope); });
      case 'Tuple': return new Tuple(e.items.map(function (x) { return evalExpr(it, x, scope); }));
      case 'Set': { var st = new PySet(); e.items.forEach(function (x) { st.add(evalExpr(it, x, scope)); }); return st; }
      case 'Dict': { var d = new PyDict(); e.pairs.forEach(function (p) { d.set(evalExpr(it, p[0], scope), evalExpr(it, p[1], scope)); }); return d; }
      case 'ListComp': case 'SetComp': case 'DictComp': {
        var inner = new Scope(scope), res = e.type === 'DictComp' ? new PyDict() : e.type === 'SetComp' ? new PySet() : [];
        var run = function (gi) {
          if (gi === e.gens.length) {
            if (e.type === 'DictComp') res.set(evalExpr(it, e.key, inner), evalExpr(it, e.value, inner));
            else if (e.type === 'SetComp') res.add(evalExpr(it, e.elt, inner));
            else res.push(evalExpr(it, e.elt, inner));
            return;
          }
          var g = e.gens[gi], items = iterate(evalExpr(it, g.iter, inner), e.line);
          for (var i = 0; i < items.length; i++) {
            it.tick(e.line);
            assign(it, g.target, items[i], inner);
            var ok = true;
            for (var c = 0; c < g.conds.length; c++) if (!truthy(evalExpr(it, g.conds[c], inner))) { ok = false; break; }
            if (ok) run(gi + 1);
          }
        };
        run(0); return res;
      }
      case 'BoolOp': {
        var l = evalExpr(it, e.left, scope);
        if (e.op === 'and') return truthy(l) ? evalExpr(it, e.right, scope) : l;
        return truthy(l) ? l : evalExpr(it, e.right, scope);
      }
      case 'Not': return !truthy(evalExpr(it, e.operand, scope));
      case 'Unary': {
        var o = evalExpr(it, e.operand, scope);
        if (!isNumish(o)) throw err('TypeError', "bad operand type for unary " + e.op + ": '" + typeName(o) + "'", e.line);
        o = numify(o); return e.op === '-' ? -o : o;
      }
      case 'BinOp': return binop(e.op, evalExpr(it, e.left, scope), evalExpr(it, e.right, scope), e.line);
      case 'Compare': {
        var left = evalExpr(it, e.left, scope), result = true;
        for (var i = 0; i < e.ops.length; i++) {
          var right = evalExpr(it, e.comps[i], scope), op = e.ops[i];
          switch (op) {
            case '==': result = eq(left, right); break;
            case '!=': result = !eq(left, right); break;
            case '<': result = cmp(left, right, e.line, '<') < 0; break;
            case '>': result = cmp(left, right, e.line, '>') > 0; break;
            case '<=': result = cmp(left, right, e.line, '<=') <= 0; break;
            case '>=': result = cmp(left, right, e.line, '>=') >= 0; break;
            case 'in': result = contains(right, left, e.line); break;
            case 'not in': result = !contains(right, left, e.line); break;
            case 'is': result = left === right; break;
            case 'is not': result = left !== right; break;
          }
          if (!result) return false;
          left = right;
        }
        return result;
      }
      case 'IfExp': return truthy(evalExpr(it, e.test, scope)) ? evalExpr(it, e.body, scope) : evalExpr(it, e.orelse, scope);
      case 'Lambda': return new Func('<lambda>', e.params.map(function (p) { return { name: p.name, def: p.def ? evalExpr(it, p.def, scope) : undefined, has: !!p.def }; }), e.body, scope, true);
      case 'Attr': return getAttr(it, evalExpr(it, e.obj, scope), e.name, e.line);
      case 'Subscript': {
        var obj = evalExpr(it, e.obj, scope), idx = e.index;
        if (idx.type === 'Slice') idx = new PySlice(idx.lo ? evalExpr(it, idx.lo, scope) : null, idx.hi ? evalExpr(it, idx.hi, scope) : null, idx.step ? evalExpr(it, idx.step, scope) : null);
        else idx = evalExpr(it, idx, scope);
        return getItem(it, obj, idx, e.line);
      }
      case 'Call': {
        var f = evalExpr(it, e.func, scope);
        var args = e.args.map(function (a) { return evalExpr(it, a, scope); });
        var kw = Object.create(null);
        e.kwargs.forEach(function (k) { kw[k.name] = evalExpr(it, k.value, scope); });
        return callValue(it, f, args, kw, e.line, e.func.type === 'Name' ? e.func.id : e.func.type === 'Attr' ? e.func.name : null);
      }
    }
    throw err('SyntaxError', 'unsupported expression', e.line);
  }

  function callValue(it, f, args, kw, line, nm) {
    if (typeof f === 'function') {
      try { return f(args, kw || Object.create(null), line); }
      catch (e) { if (e instanceof PyError && !e.line) e.line = line; throw e; }
    }
    if (f instanceof Func) {
      if (++it.depth > 180) { it.depth = 0; throw err('RecursionError', 'maximum recursion depth exceeded', line); }
      try {
        var sc = new Scope(f.scope), ps = f.params;
        if (args.length > ps.length) throw err('TypeError', f.name + '() takes ' + ps.length + ' positional argument' + (ps.length === 1 ? '' : 's') + ' but ' + args.length + ' were given', line);
        for (var i = 0; i < args.length; i++) sc.vars.set(ps[i].name, args[i]);
        for (var k in kw) {
          if (!ps.some(function (p) { return p.name === k; })) throw err('TypeError', f.name + "() got an unexpected keyword argument '" + k + "'", line);
          if (sc.vars.has(k)) throw err('TypeError', f.name + "() got multiple values for argument '" + k + "'", line);
          sc.vars.set(k, kw[k]);
        }
        for (var j = 0; j < ps.length; j++) if (!sc.vars.has(ps[j].name)) {
          if (ps[j].has) sc.vars.set(ps[j].name, ps[j].def);
          else throw err('TypeError', f.name + "() missing required argument: '" + ps[j].name + "'", line);
        }
        if (f.isLambda) return evalExpr(it, f.body, sc);
        var sig = execBlock(it, f.body, sc);
        return sig && sig.k === 'r' ? sig.v : null;
      } finally { it.depth--; }
    }
    throw err('TypeError', "'" + typeName(f) + "' object is not callable" + (nm ? ' (' + nm + ')' : ''), line);
  }

  /* ---------- methods ---------- */
  var kwOnly = function (kw, allowed, fname, line) { for (var k in kw) if (allowed.indexOf(k) < 0) throw err('TypeError', fname + "() got an unexpected keyword argument '" + k + "'", line); };
  var needArgs = function (args, min, max, fname, line) {
    if (args.length < min || args.length > max) throw err('TypeError', fname + '() takes ' + (min === max ? 'exactly ' + min : 'between ' + min + ' and ' + max) + ' argument' + (max === 1 ? '' : 's') + ' (' + args.length + ' given)', line);
  };
  function sortList(it, items, keyFn, reverse, line) {
    var dec = items.map(function (v, i) { return { v: v, k: keyFn ? callValue(it, keyFn, [v], null, line) : v, i: i }; });
    dec.sort(function (a, b) { var c = cmp(a.k, b.k, line, '<'); return reverse ? -c : c; });
    return dec.map(function (d) { return d.v; });
  }
  var mkInt = function (n) { return BigInt(Math.trunc(n)); };

  var strMethods = {
    upper: function (s) { return s.toUpperCase(); }, lower: function (s) { return s.toLowerCase(); },
    title: function (s) { return s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); }); },
    capitalize: function (s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); },
    strip: function (s, a) { return stripStr(s, a[0], true, true); }, lstrip: function (s, a) { return stripStr(s, a[0], true, false); }, rstrip: function (s, a) { return stripStr(s, a[0], false, true); },
    split: function (s, a, kw) {
      var sep = a.length ? a[0] : kw.sep, mx = a.length > 1 ? Number(a[1]) : kw.maxsplit !== undefined ? Number(kw.maxsplit) : -1;
      if (sep === null || sep === undefined) { var t = s.trim(); if (!t) return []; var parts = t.split(/\s+/); if (mx >= 0 && parts.length > mx + 1) { parts = t.split(/\s+/, mx).concat([t.split(/\s+/).slice(mx).join(' ')]); } return parts; }
      if (sep === '') throw err('ValueError', 'empty separator');
      var ps = s.split(sep); if (mx >= 0 && ps.length > mx + 1) ps = ps.slice(0, mx).concat([ps.slice(mx).join(sep)]); return ps;
    },
    join: function (s, a, kw, line) { var items = iterate(a[0], line); items.forEach(function (x) { if (typeof x !== 'string') throw err('TypeError', 'sequence item: expected str instance, ' + typeName(x) + ' found', line); }); return items.join(s); },
    startswith: function (s, a) { var p = a[0] instanceof Tuple ? a[0].items : [a[0]]; return p.some(function (x) { return s.startsWith(x); }); },
    endswith: function (s, a) { var p = a[0] instanceof Tuple ? a[0].items : [a[0]]; return p.some(function (x) { return s.endsWith(x); }); },
    replace: function (s, a) { var cnt = a.length > 2 ? Number(a[2]) : -1, out = s; if (cnt < 0) return s.split(a[0]).join(a[1]); var parts = s.split(a[0]); out = ''; for (var i = 0; i < parts.length; i++) { out += parts[i]; if (i < parts.length - 1) out += i < cnt ? a[1] : a[0]; } return out; },
    find: function (s, a) { return BigInt(s.indexOf(a[0])); },
    index: function (s, a) { var i = s.indexOf(a[0]); if (i < 0) throw err('ValueError', 'substring not found'); return BigInt(i); },
    count: function (s, a) { return a[0] === '' ? BigInt(s.length + 1) : BigInt(s.split(a[0]).length - 1); },
    isdigit: function (s) { return /^\d+$/.test(s); }, isalpha: function (s) { return /^\p{L}+$/u.test(s); }, isnumeric: function (s) { return /^\d+$/.test(s); }, isspace: function (s) { return /^\s+$/.test(s); },
    isupper: function (s) { return s !== s.toLowerCase() && s === s.toUpperCase(); }, islower: function (s) { return s !== s.toUpperCase() && s === s.toLowerCase(); },
    zfill: function (s, a) { var w = Number(a[0]); var sg = /^[+-]/.test(s) ? s[0] : ''; var body = sg ? s.slice(1) : s; while (sg.length + body.length < w) body = '0' + body; return sg + body; },
    ljust: function (s, a) { return s.padEnd(Number(a[0]), a[1] || ' '); }, rjust: function (s, a) { return s.padStart(Number(a[0]), a[1] || ' '); },
    center: function (s, a) { var w = Number(a[0]), f = a[1] || ' ', pad = w - s.length; if (pad <= 0) return s; var left = Math.floor(pad / 2) + (pad % 2 && w % 2 ? 1 : 0); left = Math.floor(pad / 2); return f.repeat(left) + s + f.repeat(pad - left); },
    format: function (s, a, kw, line) {
      var auto = 0;
      return s.replace(/\{\{|\}\}|\{([^{}:!]*)(?:!([rs]))?(?::([^{}]*))?\}/g, function (m, field, conv, spec) {
        if (m === '{{') return '{'; if (m === '}}') return '}';
        var v;
        if (field === '' || field === undefined) v = a[auto++]; else if (/^\d+$/.test(field)) v = a[+field]; else v = kw[field];
        if (v === undefined) throw err('IndexError', 'format() argument not found', line);
        if (conv === 'r') v = repr(v);
        return formatValue(v, spec || '', line);
      });
    }
  };
  function stripStr(s, chars, left, right) {
    if (chars === undefined || chars === null) { if (left) s = s.replace(/^\s+/, ''); if (right) s = s.replace(/\s+$/, ''); return s; }
    var set = new Set(Array.from(chars)), arr = Array.from(s), a = 0, b = arr.length;
    if (left) while (a < b && set.has(arr[a])) a++;
    if (right) while (b > a && set.has(arr[b - 1])) b--;
    return arr.slice(a, b).join('');
  }
  var listMethods = {
    append: function (l, a) { l.push(a[0]); return null; },
    extend: function (l, a, kw, line) { iterate(a[0], line).slice().forEach(function (x) { l.push(x); }); return null; },
    pop: function (l, a, kw, line) { if (!l.length) throw err('IndexError', 'pop from empty list', line); var i = a.length ? toIdx(a[0], line) : l.length - 1; if (i < 0) i += l.length; if (i < 0 || i >= l.length) throw err('IndexError', 'pop index out of range', line); return l.splice(i, 1)[0]; },
    insert: function (l, a, kw, line) { var i = toIdx(a[0], line); if (i < 0) i = Math.max(0, i + l.length); l.splice(Math.min(i, l.length), 0, a[1]); return null; },
    remove: function (l, a, kw, line) { for (var i = 0; i < l.length; i++) if (eq(l[i], a[0])) { l.splice(i, 1); return null; } throw err('ValueError', 'list.remove(x): x not in list', line); },
    index: function (l, a, kw, line) { for (var i = 0; i < l.length; i++) if (eq(l[i], a[0])) return BigInt(i); throw err('ValueError', repr(a[0]) + ' is not in list', line); },
    count: function (l, a) { return BigInt(l.filter(function (x) { return eq(x, a[0]); }).length); },
    reverse: function (l) { l.reverse(); return null; },
    copy: function (l) { return l.slice(); },
    clear: function (l) { l.length = 0; return null; },
    sort: function (l, a, kw, line, it) { var s = sortList(it, l, kw.key || null, truthy(kw.reverse === undefined ? false : kw.reverse), line); for (var i = 0; i < s.length; i++) l[i] = s[i]; return null; }
  };
  var tupleMethods = {
    count: function (t, a) { return BigInt(t.items.filter(function (x) { return eq(x, a[0]); }).length); },
    index: function (t, a, kw, line) { for (var i = 0; i < t.items.length; i++) if (eq(t.items[i], a[0])) return BigInt(i); throw err('ValueError', 'tuple.index(x): x not in tuple', line); }
  };
  var dictMethods = {
    get: function (d, a) { var v = d.getv(a[0]); return v === undefined ? (a.length > 1 ? a[1] : null) : v; },
    setdefault: function (d, a) { var v = d.getv(a[0]); if (v === undefined) { v = a.length > 1 ? a[1] : null; d.set(a[0], v); } return v; },
    items: function (d) { return d.entries(); }, keys: function (d) { return d.keys(); }, values: function (d) { return d.values(); },
    update: function (d, a, kw, line) {
      if (a.length) { var o = a[0]; if (o instanceof PyDict) o.entries().forEach(function (t) { d.set(t.items[0], t.items[1]); }); else iterate(o, line).forEach(function (p) { var q = iterate(p, line); d.set(q[0], q[1]); }); }
      for (var k in kw) d.set(k, kw[k]); return null;
    },
    pop: function (d, a, kw, line) { var v = d.getv(a[0]); if (v === undefined) { if (a.length > 1) return a[1]; throw err('KeyError', repr(a[0]), line); } d.del(a[0]); return v; },
    copy: function (d) { var n = new PyDict(d.def); n.counter = d.counter; d.entries().forEach(function (t) { n.set(t.items[0], t.items[1]); }); return n; },
    clear: function (d) { d.map.clear(); return null; },
    most_common: function (d, a) {
      var items = d.entries().map(function (t, i) { return { t: t, i: i }; });
      items.sort(function (x, y) { var c = cmp(y.t.items[1], x.t.items[1]); return c || x.i - y.i; });
      var out = items.map(function (x) { return x.t; }); return a.length && a[0] !== null ? out.slice(0, Number(a[0])) : out;
    }
  };
  var setMethods = {
    add: function (s, a) { s.add(a[0]); return null; },
    remove: function (s, a, kw, line) { if (!s.del(a[0])) throw err('KeyError', repr(a[0]), line); return null; },
    discard: function (s, a) { s.del(a[0]); return null; },
    update: function (s, a, kw, line) { iterate(a[0], line).forEach(function (x) { s.add(x); }); return null; },
    union: function (s, a, kw, line) { var n = new PySet(); s.values().forEach(function (x) { n.add(x); }); a.forEach(function (o) { iterate(o, line).forEach(function (x) { n.add(x); }); }); return n; },
    intersection: function (s, a, kw, line) { var o = new PySet(); iterate(a[0], line).forEach(function (x) { o.add(x); }); var n = new PySet(); s.values().forEach(function (x) { if (o.has(x)) n.add(x); }); return n; },
    difference: function (s, a, kw, line) { var o = new PySet(); iterate(a[0], line).forEach(function (x) { o.add(x); }); var n = new PySet(); s.values().forEach(function (x) { if (!o.has(x)) n.add(x); }); return n; },
    copy: function (s) { var n = new PySet(); s.values().forEach(function (x) { n.add(x); }); return n; },
    clear: function (s) { s.map.clear(); return null; }
  };
  function getAttr(it, obj, name, line) {
    var table = typeof obj === 'string' ? strMethods : Array.isArray(obj) ? listMethods : obj instanceof PyDict ? dictMethods : obj instanceof Tuple ? tupleMethods : obj instanceof PySet ? setMethods : null;
    if (obj instanceof Module) {
      if (name in obj.attrs) return obj.attrs[name];
      throw err('AttributeError', "module '" + obj.name + "' has no attribute '" + name + "'", line);
    }
    if (table && Object.prototype.hasOwnProperty.call(table, name) && !(name === 'most_common' && !(obj instanceof PyDict && obj.counter))) {
      var fn = table[name];
      var bound = function (args, kw, ln) { return fn(obj, args, kw, ln || line, it); };
      bound.pyname = name; return bound;
    }
    throw err('AttributeError', "'" + typeName(obj) + "' object has no attribute '" + name + "'", line);
  }

  /* ---------- builtins and modules ---------- */
  function makeModules(it) {
    var fn = function (name, f) { f.pyname = name; return f; };
    var m1 = function (name, f) { return fn(name, function (a, kw, line) { if (a.length !== 1 || !isNumish(a[0])) throw err('TypeError', name + '() takes a number', line); return f(toNum(a[0])); }); };
    var math = new Module('math', {
      pi: Math.PI, e: Math.E, inf: Infinity, nan: NaN,
      sqrt: fn('sqrt', function (a, kw, line) { var x = toNum(a[0]); if (x < 0) throw err('ValueError', 'math domain error', line); return Math.sqrt(x); }),
      floor: fn('floor', function (a) { return mkInt(Math.floor(toNum(a[0]))); }), ceil: fn('ceil', function (a) { return mkInt(Math.ceil(toNum(a[0]))); }),
      fabs: m1('fabs', Math.abs), exp: m1('exp', Math.exp), log10: m1('log10', Math.log10), log2: m1('log2', Math.log2), sin: m1('sin', Math.sin), cos: m1('cos', Math.cos),
      log: fn('log', function (a, kw, line) { var x = toNum(a[0]); if (x <= 0) throw err('ValueError', 'math domain error', line); return a.length > 1 ? Math.log(x) / Math.log(toNum(a[1])) : Math.log(x); }),
      pow: fn('pow', function (a) { return Math.pow(toNum(a[0]), toNum(a[1])); }),
      isnan: fn('isnan', function (a) { return Number.isNaN(toNum(a[0])); }),
      trunc: fn('trunc', function (a) { return mkInt(Math.trunc(toNum(a[0]))); })
    });
    var defaultdict = fn('defaultdict', function (a, kw, line) {
      var d = new PyDict(a.length ? a[0] : null);
      if (a.length > 1) iterate(a[1], line).forEach(function (p) { var q = iterate(p, line); d.set(q[0], q[1]); });
      return d;
    });
    var Counter = fn('Counter', function (a, kw, line) {
      var d = new PyDict(function () { return 0n; }); d.counter = true;
      if (a.length) { if (a[0] instanceof PyDict) a[0].entries().forEach(function (t) { d.set(t.items[0], t.items[1]); }); else iterate(a[0], line).forEach(function (x) { d.set(x, (d.getv(x) || 0n) + 1n); }); }
      return d;
    });
    var nums = function (a, line) { var items = iterate(a[0], line); if (!items.length) throw err('ValueError', 'no data points', line); return items.map(toNum); };
    var statistics = new Module('statistics', {
      mean: fn('mean', function (a, kw, line) { var x = nums(a, line); return x.reduce(function (s, v) { return s + v; }, 0) / x.length; }),
      median: fn('median', function (a, kw, line) { var x = nums(a, line).sort(function (p, q) { return p - q; }), n = x.length; return n % 2 ? x[(n - 1) / 2] : (x[n / 2 - 1] + x[n / 2]) / 2; })
    });
    return { math: math, collections: new Module('collections', { defaultdict: defaultdict, Counter: Counter }), statistics: statistics };
  }
  var MODS = null;
  function getModule(name, line) {
    if (MODS && MODS[name]) return MODS[name];
    throw err('ImportError', "module '" + name + "' is not available in this mini Python (available: math, collections, statistics)", line);
  }

  function roundHalfEven(x, nd) {
    if (!Number.isFinite(x)) return x;
    if (nd < 0) { var f = Math.pow(10, -nd), q = x / f, r0 = Math.round(q); if (Math.abs(q % 1) === 0.5) r0 = 2 * Math.round(q / 2); return r0 * f; }
    if (nd > 100) return x;
    var ax = Math.abs(x), sign = x < 0 || Object.is(x, -0) ? -1 : 1;
    var ext = ax.toFixed(Math.min(100, nd + 30));
    var m = new RegExp('^(\\d+)\\.(\\d{' + nd + '})5(0*)$').exec(ext), res;
    if (m && /^0*$/.test(m[3])) {
      var base = m[1] + (nd ? '.' + m[2] : ''), last = nd ? m[2][nd - 1] : m[1][m[1].length - 1];
      var lo = Number(base);
      res = (+last) % 2 === 0 ? lo : Number((lo + Math.pow(10, -nd)).toFixed(nd));
    } else res = Number(ax.toFixed(nd));
    return sign * res;
  }

  function makeBuiltins(it) {
    var b = new Scope(null), reg = function (name, f) { f.pyname = name; b.vars.set(name, f); };
    reg('print', function (a, kw) {
      var sep = kw.sep !== undefined && kw.sep !== null ? kw.sep : ' ', end = kw.end !== undefined && kw.end !== null ? kw.end : '\n';
      it.out.push(a.map(str).join(sep) + end); return null;
    });
    reg('len', function (a, kw, line) {
      var v = a[0];
      if (typeof v === 'string') return BigInt(Array.from(v).length);
      if (Array.isArray(v)) return BigInt(v.length);
      if (v instanceof Tuple) return BigInt(v.items.length);
      if (v instanceof PyDict || v instanceof PySet) return BigInt(v.size);
      if (v instanceof PyRange) return BigInt(rangeLen(v));
      throw err('TypeError', "object of type '" + typeName(v) + "' has no len()", line);
    });
    reg('range', function (a, kw, line) {
      a.forEach(function (x) { if (!isInt(numify(x))) throw err('TypeError', "'" + typeName(x) + "' object cannot be interpreted as an integer", line); });
      var v = a.map(numify);
      if (v.length === 1) return new PyRange(0n, v[0], 1n);
      if (v.length === 2) return new PyRange(v[0], v[1], 1n);
      if (v[2] === 0n) throw err('ValueError', 'range() arg 3 must not be zero', line);
      return new PyRange(v[0], v[1], v[2]);
    });
    reg('sum', function (a, kw, line) {
      var acc = a.length > 1 ? a[1] : kw.start !== undefined ? kw.start : 0n; var items = iterate(a[0], line);
      for (var i = 0; i < items.length; i++) acc = binop('+', acc, items[i], line); return acc;
    });
    var extreme = function (name, sign) {
      reg(name, function (a, kw, line) {
        var items = a.length === 1 ? iterate(a[0], line) : a, keyFn = kw.key || null;
        if (!items.length) { if (kw.default !== undefined) return kw.default; throw err('ValueError', name + '() arg is an empty sequence', line); }
        var best = items[0], bk = keyFn ? callValue(it, keyFn, [best], null, line) : best;
        for (var i = 1; i < items.length; i++) {
          var k = keyFn ? callValue(it, keyFn, [items[i]], null, line) : items[i];
          if (cmp(k, bk, line, sign > 0 ? '>' : '<') * sign > 0) { best = items[i]; bk = k; }
        }
        return best;
      });
    };
    extreme('max', 1); extreme('min', -1);
    reg('sorted', function (a, kw, line) { return sortList(it, iterate(a[0], line).slice(), kw.key || null, kw.reverse !== undefined && truthy(kw.reverse), line); });
    reg('reversed', function (a, kw, line) { return iterate(a[0], line).slice().reverse(); });
    reg('enumerate', function (a, kw, line) { var s = a.length > 1 ? numify(a[1]) : kw.start !== undefined ? numify(kw.start) : 0n; return iterate(a[0], line).map(function (x, i) { return new Tuple([s + BigInt(i), x]); }); });
    reg('zip', function (a, kw, line) {
      var ls = a.map(function (x) { return iterate(x, line); }), n = ls.length ? Math.min.apply(null, ls.map(function (l) { return l.length; })) : 0, out = [];
      for (var i = 0; i < n; i++) out.push(new Tuple(ls.map(function (l) { return l[i]; }))); return out;
    });
    reg('map', function (a, kw, line) { return iterate(a[1], line).map(function (x) { return callValue(it, a[0], [x], null, line); }); });
    reg('filter', function (a, kw, line) { return iterate(a[1], line).filter(function (x) { return truthy(a[0] === null ? x : callValue(it, a[0], [x], null, line)); }); });
    reg('any', function (a, kw, line) { return iterate(a[0], line).some(truthy); });
    reg('all', function (a, kw, line) { return iterate(a[0], line).every(truthy); });
    reg('abs', function (a, kw, line) { var v = a[0]; if (!isNumish(v)) throw err('TypeError', "bad operand type for abs(): '" + typeName(v) + "'", line); v = numify(v); return typeof v === 'bigint' ? (v < 0n ? -v : v) : Math.abs(v); });
    reg('round', function (a, kw, line) {
      var v = a[0], nd = a.length > 1 ? a[1] : kw.ndigits;
      if (!isNumish(v)) throw err('TypeError', 'type ' + typeName(v) + ' doesn\'t define __round__ method', line);
      v = numify(v);
      if (nd === undefined || nd === null) { if (typeof v === 'bigint') return v; var x = v, r = Math.round(x); if (Math.abs(x % 1) === 0.5) r = 2 * Math.round(x / 2); return mkInt(r); }
      var n = Number(numify(nd));
      return typeof v === 'bigint' ? (n >= 0 ? v : mkInt(roundHalfEven(Number(v), n))) : roundHalfEven(v, n);
    });
    reg('int', function (a, kw, line) {
      if (!a.length) return 0n; var v = a[0];
      if (typeof v === 'string') { var t = v.trim().replace(/_/g, ''); if (!/^[+-]?\d+$/.test(t)) throw err('ValueError', "invalid literal for int() with base 10: " + repr(v), line); return BigInt(t); }
      if (typeof v === 'number') { if (!Number.isFinite(v)) throw err('OverflowError', 'cannot convert float infinity or NaN to integer', line); return mkInt(v); }
      if (isNumish(v)) return numify(v);
      throw err('TypeError', "int() argument must be a string or a number, not '" + typeName(v) + "'", line);
    });
    reg('float', function (a, kw, line) {
      if (!a.length) return 0.0; var v = a[0];
      if (typeof v === 'string') { var t = v.trim().replace(/_/g, ''); if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) && !/^[+-]?(inf|nan)$/i.test(t)) throw err('ValueError', 'could not convert string to float: ' + repr(v), line); return /inf/i.test(t) ? (t[0] === '-' ? -Infinity : Infinity) : parseFloat(t); }
      if (isNumish(v)) return toNum(v);
      throw err('TypeError', "float() argument must be a string or a number, not '" + typeName(v) + "'", line);
    });
    reg('str', function (a) { return a.length ? str(a[0]) : ''; });
    reg('repr', function (a) { return repr(a[0]); });
    reg('bool', function (a) { return a.length ? truthy(a[0]) : false; });
    reg('list', function (a, kw, line) { return a.length ? iterate(a[0], line).slice() : []; });
    reg('tuple', function (a, kw, line) { return new Tuple(a.length ? iterate(a[0], line).slice() : []); });
    reg('set', function (a, kw, line) { var s = new PySet(); if (a.length) iterate(a[0], line).forEach(function (x) { s.add(x); }); return s; });
    reg('dict', function (a, kw, line) {
      var d = new PyDict();
      if (a.length) { if (a[0] instanceof PyDict) a[0].entries().forEach(function (t) { d.set(t.items[0], t.items[1]); }); else iterate(a[0], line).forEach(function (p) { var q = iterate(p, line); if (q.length !== 2) throw err('ValueError', 'dictionary update sequence element has the wrong length', line); d.set(q[0], q[1]); }); }
      for (var k in kw) d.set(k, kw[k]); return d;
    });
    reg('divmod', function (a, kw, line) { return new Tuple([binop('//', a[0], a[1], line), binop('%', a[0], a[1], line)]); });
    reg('pow', function (a, kw, line) { return binop('**', a[0], a[1], line); });
    reg('isinstance', function (a, kw, line) {
      var types = a[1] instanceof Tuple ? a[1].items : [a[1]], tn = typeName(a[0]);
      return types.some(function (t) { return t && t.pyname === tn || (t && t.pyname === 'int' && typeof a[0] === 'boolean'); });
    });
    reg('type', function (a) { var tn = typeName(a[0]); var f = b.vars.get(tn); return f || tn; });
    reg('format', function (a, kw, line) { return formatValue(a[0], a.length > 1 ? a[1] : '', line); });
    reg('ord', function (a) { return BigInt(a[0].codePointAt(0)); });
    reg('chr', function (a) { return String.fromCodePoint(Number(a[0])); });
    reg('input', function (a, kw, line) { throw err('RuntimeError', 'input() is not available in the browser lab', line); });
    return b;
  }

  /* ---------- public API ---------- */
  function run(source, globals) {
    var out = [], it = new Interp(out);
    MODS = makeModules(it);
    var tokens = tokenize(source);
    var ast = new Parser(tokens).parseModule();
    var g = new Scope(makeBuiltins(it));
    Object.keys(globals || {}).forEach(function (k) { g.vars.set(k, fromJS(globals[k])); });
    var sig = execBlock(it, ast, g);
    if (sig && sig.k === 'r') throw err('SyntaxError', "'return' outside function");
    return { scope: g, out: out.join('') };
  }
  function describe(e) {
    if (e instanceof PyError) return (e.line ? 'Line ' + e.line + ': ' : '') + e.pytype + ': ' + e.pymsg;
    if (e instanceof RangeError) return 'RecursionError: maximum recursion depth exceeded';
    return 'Error: ' + (e && e.message ? e.message : String(e));
  }
  return { run: run, toJS: toJS, repr: repr, PyError: PyError, describe: describe };
})();
if (typeof module !== 'undefined') module.exports = MiniPy;
