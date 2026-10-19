// Unit tests for js/logic.js -- run: node tests/test-logic.mjs
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("../js/logic.js");

let n = 0;
function ok(name, fn) { fn(); n++; console.log("ok - " + name); }

// parse / validate
ok("parse valid object", () => {
  const r = L.parseJsonWithPos('{"a":1}');
  assert.equal(r.ok, true); assert.deepEqual(r.value, { a: 1 });
});
ok("parse valid scalar + unicode", () => {
  const r = L.parseJsonWithPos('"\\u09A2\\u09BE\\u0995\\u09BE"');
  assert.equal(r.value, "\u09A2\u09BE\u0995\u09BE");
});
ok("parse empty -> error", () => {
  assert.equal(L.parseJsonWithPos("   ").ok, false);
});
ok("parse invalid reports line/col (trailing comma)", () => {
  const r = L.parseJsonWithPos('{\n  "a": 1,\n  "b": 2,\n}');
  assert.equal(r.ok, false);
  assert.ok(r.line >= 2, "line " + r.line);
  assert.ok(r.column >= 1, "column " + r.column);
  assert.ok(r.snippet.length > 0);
  assert.ok(r.position !== null);
});
ok("parse invalid without position info still errors cleanly", () => {
  const r = L.parseJsonWithPos('{\n  "a": 1,\n  "b": }');
  assert.equal(r.ok, false);
  assert.ok(r.error.length > 0);
});
ok("validate valid/invalid", () => {
  assert.equal(L.validateJson("[1,2]").valid, true);
  assert.equal(L.validateJson("[1,]").valid, false);
});

// format / minify / sort
ok("format 2-space exact", () => {
  const r = L.formatJson('{"b":1,"a":2}', 2);
  assert.equal(r.output, '{\n  "b": 1,\n  "a": 2\n}');
});
ok("format 4-space", () => {
  const r = L.formatJson('{"a":[1,2]}', 4);
  assert.equal(r.output, '{\n    "a": [\n        1,\n        2\n    ]\n}');
});
ok("minify strips whitespace", () => {
  const r = L.minifyJson('{ "a" : [ 1 , 2 ] }');
  assert.equal(r.output, '{"a":[1,2]}');
});
ok("sortKeysDeep nested", () => {
  const out = L.sortKeysDeep({ b: { d: 1, c: 2 }, a: 3 });
  assert.deepEqual(Object.keys(out), ["a", "b"]);
  assert.deepEqual(Object.keys(out.b), ["c", "d"]);
});
ok("formatSortedJson", () => {
  const r = L.formatSortedJson('{"b":1,"a":2}', 2);
  assert.equal(r.output, '{\n  "a": 2,\n  "b": 1\n}');
});
ok("format invalid propagates error", () => {
  assert.equal(L.formatJson("{oops", 2).ok, false);
});

// stats
ok("statsOf counts + depth + bytes", () => {
  const s = L.statsOf({ a: [1, "x", true, null], b: { c: 2 } });
  assert.equal(s.totalKeys, 3); // a, b, c
  assert.equal(s.objects, 2);
  assert.equal(s.arrays, 1);
  assert.equal(s.strings, 1);
  assert.equal(s.numbers, 2);
  assert.equal(s.booleans, 1);
  assert.equal(s.nulls, 1);
  assert.equal(s.maxDepth, 3);
  assert.equal(s.byteSize, Buffer.byteLength(JSON.stringify({ a: [1, "x", true, null], b: { c: 2 } })));
});
ok("statsOf empty containers", () => {
  const s = L.statsOf({ e: {}, f: [] });
  assert.equal(s.objects, 2); assert.equal(s.arrays, 1); assert.equal(s.leafCount, 2);
});
ok("utf8Bytes multibyte", () => {
  assert.equal(L.utf8Bytes("\u09A2\u09BE\u0995\u09BE"), Buffer.byteLength("\u09A2\u09BE\u0995\u09BE", "utf8"));
  assert.equal(L.utf8Bytes("abc"), 3);
  assert.equal(L.utf8Bytes("\uD83D\uDE00"), 4);
});

// tree
ok("flattenTree rows + paths", () => {
  const rows = L.flattenTree({ a: [10, 20], b: "x" });
  const paths = rows.map((r) => r.path);
  assert.deepEqual(paths, ["$", "$.a", "$.a[0]", "$.a[1]", "$.b"]);
  assert.equal(rows[1].childCount, 2);
  assert.equal(rows[4].preview, '"x"');
});
ok("flattenTree depth limit", () => {
  const rows = L.flattenTree({ a: { b: { c: 1 } } }, 1);
  assert.deepEqual(rows.map((r) => r.path), ["$", "$.a"]);
});
ok("searchTree key + value matches", () => {
  const rows = L.flattenTree({ city: "Dhaka", note: "dhaka trip", n: 42 });
  const hits = L.searchTree(rows, "dhaka");
  assert.deepEqual(hits.map((r) => r.path), ["$.city", "$.note"]);
  assert.deepEqual(L.searchTree(rows, "CITY").map((r) => r.path), ["$.city"]);
  assert.deepEqual(L.searchTree(rows, "   "), []);
  assert.deepEqual(L.searchTree(rows, "zzz"), []);
});

// formatBytes
ok("formatBytes", () => {
  assert.equal(L.formatBytes(500), "500 B");
  assert.equal(L.formatBytes(2048), "2.0 KB");
  assert.equal(L.formatBytes(1536), "1.5 KB");
});

console.log("\n" + n + "/" + n + " unit tests passed");
