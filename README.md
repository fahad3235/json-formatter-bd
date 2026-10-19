# JSON Formatter BD

Offline bilingual (EN / বাংলা) JSON formatter, validator, minifier and tree explorer.
Paste JSON, upload a `.json` file, or load the built-in sample — then format, minify,
sort keys, validate with line/column error positions, explore the value as a
collapsible tree, search keys/values, and copy or download the result.

**100% offline.** Your JSON never leaves the page. No network requests, no tracking,
no server.

## Features

1. **Format** — pretty-print JSON with 2- or 4-space indent.
2. **Minify** — strip all insignificant whitespace.
3. **Sort keys** — recursively sort object keys, then pretty-print.
4. **Validate** — validity verdict plus the parser error, line/column, and the
   offending source line when the engine reports a position.
5. **Tree explorer** — collapsible tree with type badges, expand/collapse-all,
   and key/value search (Bangla-safe) that keeps matches plus their ancestors.
6. **Stats** — total keys, object/array counts, max depth, and byte size.
7. **Input options** — paste, upload a `.json` file, or load the built-in sample
   (includes a Bengali string, nested objects, arrays, and every JSON scalar type).
8. **Copy / Download** — copy the formatted output or download it as `sample.json`.
9. **EN / বাংলা toggle** — persisted in `localStorage`; stats render in Bengali
   digits in বাংলা mode.

## Stack

Vanilla HTML + CSS + JavaScript. No build step, no dependencies, no framework.
Pure-ASCII sources (Bengali strings are `\uXXXX` escapes) so the files survive
any transport.

## Prerequisites

Any modern browser. For tests: Node.js 18+ and Chromium
(`/opt/meta-chromium/chrome` in this VM, or any Chrome/Chromium for the smoke test).

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
cd json-formatter-bd
python3 -m http.server 8000
# open http://localhost:8000/
```

## Testing

```bash
node tests/test-logic.mjs   # unit tests for js/logic.js
node tests/smoke.mjs         # headless-Chrome smoke (desktop)
node tests/smoke.mjs mobile  # headless-Chrome smoke (390px mobile)
```

See `TEST_RESULTS.md` for the verified results of this build.

## Deployment

Static site — publish the folder as-is to GitHub Pages, Netlify, or any static host.
No server, no environment variables, no secrets.

## Limitations

- Error line/column is shown only when the JavaScript engine's `JSON.parse`
  message carries position info (most syntax errors do; a few do not — the raw
  message is still shown).
- The tree explorer caps rendering at 20,000 rows; extremely large documents
  still format/minify fine, but the tree stops expanding past the cap.
- Very large inputs (tens of MB) may feel slow — everything runs in the browser
  on one thread.
- `.json` download is named `sample.json` (browser download behaviour).
- `JSON.parse` semantics apply: duplicate keys keep the last value, numbers
  follow IEEE-754 doubles, and there is no JSON5 / trailing-comma / comment support.

## Status

MVP complete. See `TEST_RESULTS.md` for test evidence.
