// json-formatter-bd -- UI wiring. Pure ASCII source; Bengali via \uXXXX escapes.
(function () {
  "use strict";
  var BN_DIGITS = ["\u09E6", "\u09E7", "\u09E8", "\u09E9", "\u09EA", "\u09EB", "\u09EC", "\u09ED", "\u09EE", "\u09EF"];
  var SAMPLE = "{\n  \"name\": \"\u09A2\u09BE\u0995\u09BE \u09AC\u09BE\u0982\u09B2\u09BE\u09A6\u09C7\u09B6\",\n  \"population\": 23000000,\n  \"capital\": true,\n  \"districts\": [\"Dhaka\", \"Chattogram\", \"Sylhet\"],\n  \"meta\": { \"timezone\": \"Asia/Dhaka\", \"currency\": \"BDT\", \"notes\": null },\n  \"scores\": [4.5, 3.75, 5]\n}";
  var lang = "en";
  try { lang = localStorage.getItem("jsonfmt-lang") || "en"; } catch (e) { lang = "en"; }
  if (lang !== "bn") lang = "en";
  var collapsed = {}; // path -> true
  var currentValue = null; // last successfully parsed value
  var currentRows = [];
  var currentOutput = "";

  function $(id) { return document.getElementById(id); }
  function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }
  function num(n) {
    var s = String(n);
    if (lang === "bn") s = s.replace(/[0-9]/g, function (d) { return BN_DIGITS[parseInt(d, 10)]; });
    return s;
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function applyLang() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
    });
    var enBtn = $("langEn"), bnBtn = $("langBn");
    if (enBtn) enBtn.classList.toggle("active", lang === "en");
    if (bnBtn) bnBtn.classList.toggle("active", lang === "bn");
    document.documentElement.lang = lang === "bn" ? "bn" : "en";
    renderStats();
    renderTree();
    try { localStorage.setItem("jsonfmt-lang", lang); } catch (e) {}
  }

  function setStatus(ok, html) {
    var st = $("status");
    st.className = "status " + (ok === null ? "" : (ok ? "ok" : "err"));
    st.innerHTML = html || "";
  }

  function showError(r) {
    var msg = esc(r.error || "Invalid JSON");
    var extra = "";
    if (r.line !== null && r.line !== undefined) {
      extra = "<div class=\"errpos\">" + esc(t("line")) + " " + num(r.line) +
        (r.column !== null ? ", " + esc(t("column")) + " " + num(r.column) : "") + "</div>";
      if (r.snippet) extra += "<code class=\"snippet\">" + esc(r.snippet) + "</code>";
    }
    setStatus(false, "<strong>" + esc(t("invalid")) + "</strong> \u2014 " + msg + extra);
  }

  function renderStats() {
    var box = $("stats");
    if (!currentValue && currentValue !== 0 && currentValue !== false && currentValue !== "" && currentValue !== null) {
      box.innerHTML = "";
      return;
    }
    var s = statsOf(currentValue);
    box.innerHTML =
      "<span><b>" + num(s.totalKeys) + "</b> " + esc(t("keys")) + "</span>" +
      "<span><b>" + num(s.objects) + "</b> " + esc(t("objects")) + "</span>" +
      "<span><b>" + num(s.arrays) + "</b> " + esc(t("arrays")) + "</span>" +
      "<span><b>" + num(s.maxDepth) + "</b> " + esc(t("maxDepth")) + "</span>" +
      "<span><b>" + esc(formatBytes(s.byteSize)) + "</b> " + esc(t("size")) + "</span>";
  }

  function visibleRows() {
    var q = $("treeSearch").value.trim().toLowerCase();
    if (!q) return currentRows.filter(function (r) { return !isHiddenByCollapse(r); });
    var matches = searchTree(currentRows, q);
    var keep = {};
    matches.forEach(function (m) {
      // keep the match plus all its ancestors
      var parts = m.path.split(/(?=\[|\.)/);
      var acc = "";
      keep[m.path] = true;
      // ancestor paths: progressively strip last segment
      var p = m.path;
      while (p.indexOf(".") !== -1 || p.indexOf("[") !== -1) {
        var cutDot = p.lastIndexOf(".");
        var cutBr = p.lastIndexOf("[");
        var cut = Math.max(cutDot, cutBr);
        if (cut <= 0) break;
        p = p.slice(0, cut);
        keep[p] = true;
      }
      void parts; void acc;
    });
    return currentRows.filter(function (r) { return keep[r.path]; });
  }

  function isHiddenByCollapse(row) {
    // hidden if any ancestor container is collapsed
    var p = row.path;
    while (p.indexOf(".") !== -1 || p.indexOf("[") !== -1) {
      var cut = Math.max(p.lastIndexOf("."), p.lastIndexOf("["));
      if (cut <= 0) break;
      p = p.slice(0, cut);
      if (collapsed[p]) return true;
    }
    return false;
  }

  function renderTree() {
    var box = $("tree");
    var q = $("treeSearch").value.trim();
    if (!currentRows.length) {
      box.innerHTML = "<p class=\"muted\">" + esc(t("emptyTree")) + "</p>";
      return;
    }
    var rows = visibleRows();
    if (q && rows.length === 0) {
      box.innerHTML = "<p class=\"muted\">" + esc(t("noMatches")) + "</p>";
      return;
    }
    var html = rows.map(function (r) {
      var pad = r.depth * 18;
      var toggle = "";
      if (r.hasChildren) {
        var isCol = !!collapsed[r.path];
        toggle = "<button class=\"tw\" data-path=\"" + esc(r.path) + "\" aria-label=\"toggle\">" + (isCol ? "\u25B6" : "\u25BC") + "</button>";
      } else {
        toggle = "<span class=\"tw sp\"></span>";
      }
      var keyPart = r.depth === 0 ? "<span class=\"tk\">$</span>" : "<span class=\"tk\">" + esc(r.key) + "</span><span class=\"pun\">: </span>";
      return "<div class=\"tr\" style=\"padding-left:" + pad + "px\">" + toggle + keyPart +
        "<span class=\"tv " + esc(r.type) + "\">" + esc(r.preview) + "</span>" +
        "<span class=\"tt\">" + esc(r.type) + "</span></div>";
    }).join("");
    box.innerHTML = html;
    box.querySelectorAll(".tw[data-path]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var p = btn.getAttribute("data-path");
        if (collapsed[p]) delete collapsed[p]; else collapsed[p] = true;
        renderTree();
      });
    });
  }

  function setParsed(value) {
    currentValue = value;
    currentRows = flattenTree(value);
    collapsed = {};
    currentRows.forEach(function (r) { if (r.depth >= 3 && r.hasChildren) collapsed[r.path] = true; });
    renderStats();
    renderTree();
  }

  function clearParsed() {
    currentValue = null;
    currentRows = [];
    collapsed = {};
    currentOutput = "";
    $("output").textContent = "";
    renderStats();
    renderTree();
  }

  function indentSize() {
    return $("indent").value === "4" ? 4 : 2;
  }

  function doFormat() {
    var text = $("input").value;
    var r = formatJson(text, indentSize());
    if (!r.ok) { showError(r); return; }
    currentOutput = r.output;
    $("output").textContent = r.output;
    setParsed(r.value);
    setStatus(true, "<strong>" + esc(t("valid")) + "</strong>");
  }

  function doMinify() {
    var text = $("input").value;
    var r = minifyJson(text);
    if (!r.ok) { showError(r); return; }
    currentOutput = r.output;
    $("output").textContent = r.output;
    setParsed(r.value);
    setStatus(true, "<strong>" + esc(t("valid")) + "</strong>");
  }

  function doSortKeys() {
    var text = $("input").value;
    var r = formatSortedJson(text, indentSize());
    if (!r.ok) { showError(r); return; }
    currentOutput = r.output;
    $("output").textContent = r.output;
    setParsed(r.value);
    setStatus(true, "<strong>" + esc(t("valid")) + "</strong>");
  }

  function doValidate() {
    var text = $("input").value;
    var r = validateJson(text);
    if (!r.valid) { showError(r); return; }
    var parsed = parseJsonWithPos(text);
    setParsed(parsed.value);
    currentOutput = $("output").textContent || "";
    setStatus(true, "<strong>" + esc(t("valid")) + "</strong>");
  }

  function bind() {
    $("langEn").addEventListener("click", function () { lang = "en"; applyLang(); });
    $("langBn").addEventListener("click", function () { lang = "bn"; applyLang(); });
    $("btnFormat").addEventListener("click", doFormat);
    $("btnMinify").addEventListener("click", doMinify);
    $("btnSort").addEventListener("click", doSortKeys);
    $("btnValidate").addEventListener("click", doValidate);
    $("btnSample").addEventListener("click", function () {
      $("input").value = SAMPLE;
      doFormat();
    });
    $("btnClear").addEventListener("click", function () {
      $("input").value = "";
      $("treeSearch").value = "";
      clearParsed();
      setStatus(null, "");
    });
    $("btnCopy").addEventListener("click", function () {
      var text = currentOutput || $("output").textContent;
      if (!text) return;
      function done() { setStatus(true, "<strong>" + esc(t("copied")) + "</strong>"); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { setStatus(false, esc(t("copiedFail"))); });
      } else {
        var ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); done(); } catch (e) { setStatus(false, esc(t("copiedFail"))); }
        document.body.removeChild(ta);
      }
    });
    $("btnDownload").addEventListener("click", function () {
      var text = currentOutput || $("output").textContent;
      if (!text) return;
      var blob = new Blob([text], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = t("sampleName");
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
    });
    $("fileInput").addEventListener("change", function () {
      var f = $("fileInput").files && $("fileInput").files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { $("input").value = String(reader.result || ""); doFormat(); };
      reader.onerror = function () { setStatus(false, esc(t("fileError"))); };
      reader.readAsText(f);
      $("fileInput").value = "";
    });
    $("treeSearch").addEventListener("input", renderTree);
    $("btnExpand").addEventListener("click", function () { collapsed = {}; renderTree(); });
    $("btnCollapse").addEventListener("click", function () {
      collapsed = {};
      currentRows.forEach(function (r) { if (r.hasChildren && r.depth >= 1) collapsed[r.path] = true; });
      renderTree();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bind();
    applyLang();
    setStatus(null, "");
    $("output").textContent = "";
  });
})();
