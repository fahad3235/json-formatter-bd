// json-formatter-bd -- pure logic (no DOM). All functions are pure and unit-tested.
// Bengali strings live in i18n.js as \uXXXX escapes; this file stays pure ASCII.

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Parse JSON, returning {ok:true, value} or {ok:false, error, position, line, column, snippet}
function parseJsonWithPos(text) {
  if (typeof text !== "string") text = String(text == null ? "" : text);
  if (text.trim() === "") {
    return { ok: false, error: "Empty input", position: 0, line: 1, column: 1, snippet: "" };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    let position = null, line = null, column = null, snippet = "";
    const m = /position\s+(\d+)/i.exec(msg);
    const lm = /\(line\s+(\d+)\s+column\s+(\d+)\)/i.exec(msg);
    if (m) {
      position = parseInt(m[1], 10);
    } else if (lm) {
      line = parseInt(lm[1], 10);
      column = parseInt(lm[2], 10);
      const lines = text.split("\n");
      snippet = lines[line - 1] != null ? lines[line - 1] : "";
      let off = 0;
      for (let i = 0; i < line - 1 && i < lines.length; i++) off += lines[i].length + 1;
      position = off + column - 1;
    }
    if (position !== null && position <= text.length && line === null) {
      const before = text.slice(0, position);
      line = before.split("\n").length;
      column = position - before.lastIndexOf("\n");
      const lines = text.split("\n");
      snippet = lines[line - 1] != null ? lines[line - 1] : "";
    }
    return { ok: false, error: msg, position: position, line: line, column: column, snippet: snippet };
  }
}

function formatJson(text, indent) {
  const r = parseJsonWithPos(text);
  if (!r.ok) return r;
  const n = indent === 4 ? 4 : 2;
  return { ok: true, value: r.value, output: JSON.stringify(r.value, null, n) };
}

function minifyJson(text) {
  const r = parseJsonWithPos(text);
  if (!r.ok) return r;
  return { ok: true, value: r.value, output: JSON.stringify(r.value) };
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (isPlainObject(value)) {
    const out = {};
    Object.keys(value).sort().forEach(function (k) { out[k] = sortKeysDeep(value[k]); });
    return out;
  }
  return value;
}

function formatSortedJson(text, indent) {
  const r = parseJsonWithPos(text);
  if (!r.ok) return r;
  const n = indent === 4 ? 4 : 2;
  return { ok: true, value: sortKeysDeep(r.value), output: JSON.stringify(sortKeysDeep(r.value), null, n) };
}

// Stats over a parsed value: counts by type, total keys, max depth, leaf count, byte size.
function statsOf(value) {
  const s = { totalKeys: 0, objects: 0, arrays: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, maxDepth: 0, leafCount: 0 };
  function walk(v, depth) {
    if (depth > s.maxDepth) s.maxDepth = depth;
    if (Array.isArray(v)) {
      s.arrays += 1;
      if (v.length === 0) { s.leafCount += 1; return; }
      v.forEach(function (item) { walk(item, depth + 1); });
    } else if (isPlainObject(v)) {
      s.objects += 1;
      const keys = Object.keys(v);
      s.totalKeys += keys.length;
      if (keys.length === 0) { s.leafCount += 1; return; }
      keys.forEach(function (k) { walk(v[k], depth + 1); });
    } else if (typeof v === "string") { s.strings += 1; s.leafCount += 1; }
    else if (typeof v === "number") { s.numbers += 1; s.leafCount += 1; }
    else if (typeof v === "boolean") { s.booleans += 1; s.leafCount += 1; }
    else if (v === null) { s.nulls += 1; s.leafCount += 1; }
  }
  walk(value, 1);
  s.byteSize = utf8Bytes(JSON.stringify(value));
  return s;
}

function utf8Bytes(str) {
  // Count UTF-8 bytes without TextEncoder (works in node + browsers).
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { n += 4; i += 1; }
    else n += 3;
  }
  return n;
}

// Flatten a parsed value into rows for the tree explorer.
// Each row: {path, key, type, depth, preview, hasChildren, childCount}
function flattenTree(value, maxDepth) {
  const rows = [];
  const limit = typeof maxDepth === "number" ? maxDepth : 200;
  function preview(v) {
    if (v === null) return "null";
    if (typeof v === "string") {
      const s = v.length > 60 ? v.slice(0, 57) + "..." : v;
      return JSON.stringify(s);
    }
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) return "Array(" + v.length + ")";
    return "Object(" + Object.keys(v).length + ")";
  }
  function walk(v, path, key, depth) {
    if (rows.length > 20000) return;
    const t = typeOf(v);
    const isContainer = Array.isArray(v) || isPlainObject(v);
    const childCount = Array.isArray(v) ? v.length : (isPlainObject(v) ? Object.keys(v).length : 0);
    rows.push({ path: path, key: key, type: t, depth: depth, preview: preview(v), hasChildren: isContainer, childCount: childCount });
    if (isContainer && depth < limit) {
      if (Array.isArray(v)) {
        v.forEach(function (item, i) { walk(item, path + "[" + i + "]", String(i), depth + 1); });
      } else {
        Object.keys(v).forEach(function (k) { walk(v[k], path ? path + "." + k : k, k, depth + 1); });
      }
    }
  }
  walk(value, "$", "$", 0);
  return rows;
}

// Search rows (from flattenTree) for a query: matches key or scalar preview, case-insensitive.
// Returns matching rows with their ancestor paths so the UI can expand them.
function searchTree(rows, query) {
  const q = String(query == null ? "" : query).trim().toLowerCase();
  if (!q) return [];
  return rows.filter(function (r) {
    if (r.key && r.key.toLowerCase().indexOf(q) !== -1) return true;
    if (r.type === "string" || r.type === "number" || r.type === "boolean" || r.type === "null") {
      return r.preview.toLowerCase().indexOf(q) !== -1;
    }
    return false;
  });
}

// Format a byte count as "1.2 KB" etc.
function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

// Validate-only helper: returns {valid, message} with a short human message.
function validateJson(text) {
  const r = parseJsonWithPos(text);
  if (r.ok) return { valid: true, message: "Valid JSON" };
  return { valid: false, message: r.error, position: r.position, line: r.line, column: r.column, snippet: r.snippet };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { typeOf, isPlainObject, parseJsonWithPos, formatJson, minifyJson, sortKeysDeep, formatSortedJson, statsOf, utf8Bytes, flattenTree, searchTree, formatBytes, validateJson };
}
