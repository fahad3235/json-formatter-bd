# TEST_RESULTS — json-formatter-bd

Run date: 2026-10-19 (10:00 slot). All results from real runs in this build.

## Unit tests — 19/19 passed

`node tests/test-logic.mjs` — covers `js/logic.js`:

- parse valid object / scalar + Unicode (`"\u09A2\u09BE\u0995\u09BE"` parses to Dhaka in Bengali script)
- empty input errors; invalid JSON with trailing comma reports line >= 2, column, snippet, position
- invalid JSON without engine position info still errors cleanly (raw message shown)
- validate valid/invalid
- format 2-space exact (`{"b":1,"a":2}` -> `{\n  "b": 1,\n  "a": 2\n}`)
- format 4-space exact; minify strips whitespace; sortKeysDeep nested; formatSortedJson
- format of invalid input propagates the error
- statsOf counts (keys 3 / objects 2 / arrays 1 / strings 1 / numbers 2 / booleans 1 / nulls 1 / depth 3),
  byte size cross-checked against `Buffer.byteLength`
- statsOf empty containers (empty object/array count as leaves)
- utf8Bytes multibyte (Bengali word, emoji surrogate pair = 4 bytes)
- flattenTree rows + paths (`$`, `$.a`, `$.a[0]`, `$.a[1]`, `$.b`), depth limit
- searchTree key + value matches (case-insensitive; blank / no-match -> [])
- formatBytes (500 B / 1.5 KB / 2.0 KB)

## Headless-Chrome smoke — 23/23 desktop + 24/24 mobile, 0 console/page errors

`node tests/smoke.mjs` and `node tests/smoke.mjs mobile` (raw CDP, /opt/meta-chromium/chrome,
`file://` page): title, lang buttons, format 2-space exact, status Valid, stats show Keys,
tree rows rendered (3), format 4-space, minify exact, sort-keys exact, invalid status/message,
sample renders Bengali city name, sample tree rows > 5, tree search narrows to 2 rows,
tree search no-match shows the empty message, collapse-all reduces rows, BN toggle title
+ `localStorage` persistence, EN toggle back, clear empties input+output, validate-empty
errors, mobile-only 390px no-horizontal-overflow, zero console errors, zero page exceptions.

## Repairs

1. **Real app bug (smoke):** tree search for a query with no matches showed the root
   row instead of the "No matches" message, because `visibleRows()` unconditionally
   kept path `$`. Removed the unconditional keep; ancestors of real matches are still
   collected by the ancestor walk. Re-ran: 23/23 desktop + 24/24 mobile green.
2. **Test-side:** smoke harness first used the browser-level CDP endpoint
   (`/json/version`), which cannot drive a page — switched to the page target from
   `/json/list`. No app change.
3. **Logic improvement (pre-test):** `parseJsonWithPos` now also parses V8's
   `(line N column M)` error format, not only `at position N`; inputs whose error
   carries no position still report the raw message.

## ASCII hygiene

`grep -rP '[^\x00-\x7F]'` over `*.js` / `*.html` / `*.css` / `*.mjs` returns zero
matches — Bengali appears only as `\uXXXX` escapes (JS) or numeric entities (HTML),
so the push transport cannot corrupt it.

## Not tested

- File-upload path (FileReader) — exercised only by hand in the browser, not in
  automated smoke (no file-picker automation in the raw-CDP harness).
- Copy-to-clipboard and `.json` download — browser-permission-gated; code paths
  reviewed, not asserted in automation.
