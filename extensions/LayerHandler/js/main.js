/* ============================================================================
   LayerHandler - panel logic (js/main.js)
   Talks to jsx/host.jsx through CSInterface.evalScript(). The host re-reads
   the Layers panel selection on every Apply / Split, so the preview list
   here is only a guide - press refresh to update it after reselecting.
   ========================================================================== */

(function () {
  "use strict";

  var cs = new CSInterface();

  // Illustrator's layer colors in Layer Options order, RGB exactly as
  // Illustrator stores them. The first nine sit above the dropdown divider.
  var PALETTE = [
    ["Light Blue", 79, 128, 255], ["Light Red", 255, 79, 79], ["Green", 79, 255, 79],
    ["Medium Blue", 79, 79, 255], ["Magenta", 255, 79, 255], ["Cyan", 79, 255, 255],
    ["Light Gray", 186, 186, 186], ["Black", 0, 0, 0], ["Orange", 255, 102, 0],

    ["Dark Green", 0, 84, 0], ["Teal", 0, 153, 153], ["Tan", 204, 153, 102],
    ["Brown", 153, 51, 0], ["Violet", 153, 51, 255], ["Gold", 255, 153, 0],
    ["Dark Blue", 0, 0, 135], ["Pink", 255, 153, 204], ["Lavender", 153, 153, 255],
    ["Brick Red", 153, 0, 0], ["Olive", 102, 102, 0], ["Peach", 255, 153, 153],
    ["Burgundy", 153, 0, 51], ["Grass Green", 153, 204, 0], ["Ochre", 153, 102, 0],
    ["Purple", 102, 0, 102], ["Gray", 128, 128, 128], ["Yellow", 255, 255, 79]
  ];
  var PRIMARY = 9;
  var PREVIEW_ROWS = 6;

  // ----------------------------------------------------------------- state
  var picked = null;   // { name, r, g, b } - null keeps each layer's color
  var custom = null;   // last custom color, shown on the Custom button
  var loaded = null;   // last host detection (see LH_detect)
  var busy = false;

  // ------------------------------------------------------------------ DOM
  function $(id) { return document.getElementById(id); }

  var el = {
    stats: $("stats"), status: $("status"),
    refresh: $("btn-refresh"), clear: $("btn-clear"), apply: $("btn-apply"),
    gridPrimary: $("lc-primary"), gridMore: $("lc-more"),
    custom: $("btn-custom"), customDot: $("custom-dot"),
    colorReadout: $("colorReadout"),
    name: $("name"), numbering: $("numbering"), start: $("start"),
    digits: $("digits"), sep: $("sep"), order: $("order"),
    preview: $("preview"),
    splitInto: $("splitInto"), splitNames: $("splitNames"),
    keepColor: $("keepColor"), split: $("btn-split"),
    splitReadout: $("splitReadout")
  };

  // ----------------------------------------------------------- host bridge
  // JSON goes into a single-quoted ExtendScript literal and is eval'ed
  // there, so escape backslashes and quotes once more, and keep U+2028/9
  // as escapes (raw, they end an ExtendScript string literal).
  function arg(obj) {
    return "'" + JSON.stringify(obj)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\u2028/g, "\\\\u2028")
      .replace(/\u2029/g, "\\\\u2029") + "'";
  }

  function evalJSX(call, cb) {
    cs.evalScript(call, function (res) {
      var data = null;
      try { data = JSON.parse(res); } catch (e) { data = null; }
      cb(data, res);
    });
  }

  // ScriptPath in the manifest auto-loads host.jsx; this is a belt-and-braces
  // fallback for environments where that fails.
  function ensureHost(cb) {
    cs.evalScript("String(typeof $.global.LH_detect)", function (t) {
      if (t === "function") { cb(); return; }
      var root = cs.getSystemPath(SystemPath.EXTENSION).replace(/\\/g, "/");
      cs.evalScript('$.evalFile("' + root + '/jsx/host.jsx")', function () { cb(); });
    });
  }

  // --------------------------------------------------------------- naming
  // Mirrors buildName() in jsx/host.jsx - keep both in sync.
  function pad(n, digits) {
    var s = String(n);
    while (s.length < digits) { s = "0" + s; }
    return s;
  }

  function buildName(base, index, o) {
    if (!o.numbering) { return base; }
    var num = Math.max(0, parseInt(o.start, 10) || 0) + index;
    var digits = Math.max(1, parseInt(o.digits, 10) || 1);
    var mark = base.match(/#+/);
    if (mark) { return base.replace(/#+/, pad(num, Math.max(digits, mark[0].length))); }
    return base + (o.sep || "") + pad(num, digits);
  }

  function numberIndex(i, count, o) {
    return o.order === "up" ? count - 1 - i : i;
  }

  function nameSettings() {
    var start = parseInt(el.start.value, 10);
    return {
      name: el.name.value.replace(/^\s+|\s+$/g, ""),
      numbering: el.numbering.checked,
      start: isNaN(start) ? 1 : Math.max(0, start),
      digits: parseInt(el.digits.value, 10) || 1,
      sep: el.sep.value,
      order: el.order.value
    };
  }

  // --------------------------------------------------------------- status
  function showStatus(msg, ok) {
    if (msg) {
      el.status.textContent = msg;
      el.status.classList.toggle("ok", !!ok);
      el.status.hidden = false;
    } else {
      el.status.hidden = true;
    }
  }

  function setBusy(on) {
    busy = on;
    el.refresh.classList.toggle("spin", on);
    el.apply.disabled = on;
    el.split.disabled = on;
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // --------------------------------------------------------------- colors
  function rgbCss(c) { return "rgb(" + c.r + "," + c.g + "," + c.b + ")"; }

  function paletteName(c) {
    for (var i = 0; i < PALETTE.length; i++) {
      var p = PALETTE[i];
      if (p[1] === c.r && p[2] === c.g && p[3] === c.b) { return p[0]; }
    }
    return null;
  }

  function setReadout(node, text) {
    var rt = node.querySelector(".rt");
    (rt || node).textContent = text;
  }

  function paintColor(hover) {
    var shown = hover || picked;
    var btns = document.querySelectorAll(".lc");
    for (var i = 0; i < btns.length; i++) {
      var on = !!picked && btns[i].getAttribute("data-name") === picked.name;
      btns[i].classList.toggle("on", on);
    }
    el.colorReadout.classList.toggle("keep", !shown);
    if (shown) {
      el.colorReadout.style.setProperty("--dot", rgbCss(shown));
      setReadout(el.colorReadout, shown.name);
    } else {
      el.colorReadout.style.removeProperty("--dot");
      setReadout(el.colorReadout, "keep color");
    }
    el.customDot.classList.toggle("set", !!custom);
    el.customDot.style.background = custom ? rgbCss(custom) : "";
  }

  function choose(color) {
    // Clicking the active swatch again returns to "keep color"
    picked = (picked && color && picked.name === color.name &&
              picked.r === color.r && picked.g === color.g && picked.b === color.b)
      ? null : color;
    paintColor();
    renderPreview();
  }

  function buildSwatches() {
    for (var i = 0; i < PALETTE.length; i++) {
      (function (p, index) {
        var color = { name: p[0], r: p[1], g: p[2], b: p[3] };
        var b = document.createElement("button");
        b.className = "lc";
        b.style.background = rgbCss(color);
        b.title = p[0] + " \u00b7 double-click applies it right away";
        b.setAttribute("data-name", p[0]);
        b.addEventListener("click", function () { choose(color); });
        b.addEventListener("dblclick", function () {
          picked = color;
          paintColor();
          renderPreview();
          applyLayers(true);
        });
        b.addEventListener("mouseenter", function () { paintColor(color); });
        b.addEventListener("mouseleave", function () { paintColor(); });
        (index < PRIMARY ? el.gridPrimary : el.gridMore).appendChild(b);
      })(PALETTE[i], i);
    }
  }

  function pickCustom() {
    var seed = custom || picked || { r: 79, g: 128, b: 255 };
    ensureHost(function () {
      cs.evalScript("$.global.LH_pick(" + seed.r + "," + seed.g + "," + seed.b + ")",
        function (res) {
          if (!res || res === "x" || res.indexOf(",") < 0) { return; }
          var p = res.split(",");
          var c = { r: parseInt(p[0], 10), g: parseInt(p[1], 10), b: parseInt(p[2], 10) };
          if (isNaN(c.r) || isNaN(c.g) || isNaN(c.b)) { return; }
          c.name = paletteName(c) || "Custom";
          custom = c;
          picked = c;
          paintColor();
          renderPreview();
        });
    });
  }

  // -------------------------------------------------------------- preview
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text !== undefined) { n.textContent = text; }
    return n;
  }

  function renderPreview() {
    var box = el.preview;
    while (box.firstChild) { box.removeChild(box.firstChild); }

    if (!loaded || !loaded.layers.length) {
      box.appendChild(node("div", "pv-empty", "select layers \u00b7 press refresh"));
      return;
    }

    var st = nameSettings();
    var list = loaded.layers;
    var shown = Math.min(list.length, PREVIEW_ROWS);
    for (var i = 0; i < shown; i++) {
      var L = list[i];
      var row = node("div", "pv-row");
      var chip = node("span", "pv-chip");
      var c = picked || L.color;
      if (c) { chip.style.background = rgbCss(c); }
      row.appendChild(chip);
      if (st.name !== "") {
        var next = buildName(st.name, numberIndex(i, list.length, st), st);
        row.appendChild(node("span", "pv-old", L.name));
        row.appendChild(node("span", "pv-arrow", "\u2192"));
        row.appendChild(node("span", "pv-new", next));
      } else {
        row.appendChild(node("span", "pv-new same", L.name));
      }
      row.title = L.name;
      box.appendChild(row);
    }
    if (list.length > shown) {
      box.appendChild(node("div", "pv-more", "+ " + (list.length - shown) + " more"));
    }
  }

  // ------------------------------------------------------------ detection
  function statsText(d) {
    var n = d.layers.length;
    var s = plural(n, "layer", "layers");
    if (d.source === "active") { s += " (active)"; }
    else if (d.source === "artwork") { s += " (from artwork)"; }
    if (d.selObjects > 0) { s += " \u00b7 " + plural(d.selObjects, "object", "objects"); }
    return s;
  }

  function splitText() {
    if (!loaded) { return "select a layer or objects"; }
    if (loaded.textEditing) { return "leave text editing first"; }
    var txt;
    if (loaded.selObjects > 0) {
      txt = plural(loaded.selObjects, "object", "objects") + " \u2192 " +
            plural(loaded.selObjects, "layer", "layers");
      if (loaded.selLayers > 1) { txt += " \u00b7 from " + loaded.selLayers + " layers"; }
    } else {
      var total = 0;
      for (var i = 0; i < loaded.layers.length; i++) { total += loaded.layers[i].items || 0; }
      if (total === 0) { return "no objects in the selected layer"; }
      txt = (loaded.layers.length === 1 ? "whole layer" : plural(loaded.layers.length, "layer", "layers")) +
            " \u00b7 " + plural(total, "object", "objects") + " \u2192 " + plural(total, "layer", "layers");
    }
    if (el.splitNames.value === "field" && nameSettings().name === "") {
      txt += " \u00b7 name empty";
    }
    return txt;
  }

  function useDetection(d) {
    loaded = {
      source: d.source,
      layers: d.layers || [],
      selObjects: d.selObjects || 0,
      selLayers: d.selLayers || 0,
      textEditing: !!d.textEditing
    };
    el.stats.textContent = statsText(loaded);
    setReadout(el.splitReadout, splitText());
    renderPreview();
  }

  function refresh() {
    if (busy) { return; }
    setBusy(true);
    ensureHost(function () {
      evalJSX("$.global.LH_detect()", function (data) {
        setBusy(false);
        if (!data) { showStatus("Host did not respond."); return; }
        if (!data.ok) {
          loaded = null;
          el.stats.textContent = "no layers loaded";
          setReadout(el.splitReadout, splitText());
          renderPreview();
          showStatus(data.msg || "Could not read the layers.");
          return;
        }
        showStatus(null);
        useDetection(data);
      });
    });
  }

  // ---------------------------------------------------------------- apply
  function applyLayers(colorOnly) {
    if (busy) { return; }
    var st = nameSettings();
    if (colorOnly) { st.name = ""; }
    st.color = picked ? { r: picked.r, g: picked.g, b: picked.b } : null;
    if (st.name === "" && !st.color) {
      showStatus("Pick a color or type a name first.");
      return;
    }
    setBusy(true);
    ensureHost(function () {
      evalJSX("$.global.LH_apply(" + arg(st) + ")", function (data) {
        setBusy(false);
        if (!data) { showStatus("Host did not respond."); return; }
        if (!data.ok) { showStatus(data.msg || "Apply failed."); return; }
        useDetection(data);
        var what = st.name !== "" && st.color ? "Renamed + recolored "
                 : st.name !== "" ? "Renamed " : "Recolored ";
        var msg = what + plural(data.count, "layer", "layers");
        if (data.failed > 0) { msg += " \u00b7 " + data.failed + " failed"; }
        showStatus(msg, data.failed === 0);
      });
    });
  }

  function splitLayers() {
    if (busy) { return; }
    var st = nameSettings();
    st.into = el.splitInto.value;
    st.naming = el.splitNames.value;
    st.keepColor = el.keepColor.checked;
    setBusy(true);
    ensureHost(function () {
      evalJSX("$.global.LH_split(" + arg(st) + ")", function (data) {
        setBusy(false);
        if (!data) { showStatus("Host did not respond."); return; }
        if (!data.ok) { showStatus(data.msg || "Split failed."); return; }
        var msg = plural(data.created, "layer", "layers") + " created";
        if (data.extra > 0) {
          msg += " \u00b7 +" + data.extra + " to keep the stacking";
        }
        if (data.skipped && data.skipped.length) {
          showStatus(msg + " \u00b7 " + data.msg);
        } else {
          showStatus(msg, true);
        }
        // The split layers are new rows the panel has not highlighted yet;
        // drop the stale list instead of re-reading (keeps Undo simple).
        loaded = null;
        el.stats.textContent = "split \u00b7 " + plural(data.created, "new layer", "new layers");
        setReadout(el.splitReadout, "select a layer or objects");
        renderPreview();
      });
    });
  }

  function clearForm() {
    picked = null;
    el.name.value = "";
    paintColor();
    renderPreview();
    setReadout(el.splitReadout, splitText());
    showStatus(null);
  }

  // ---------------------------------------------------------------- wiring
  function syncNumbering() {
    var on = el.numbering.checked;
    var rows = document.querySelectorAll(".num-opt");
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle("dimmed", !on);
      var inputs = rows[i].querySelectorAll("input, select");
      for (var k = 0; k < inputs.length; k++) { inputs[k].disabled = !on; }
    }
  }

  function bindAll() {
    el.refresh.addEventListener("click", refresh);
    el.apply.addEventListener("click", function () { applyLayers(false); });
    el.split.addEventListener("click", splitLayers);
    el.clear.addEventListener("click", clearForm);
    el.custom.addEventListener("click", pickCustom);

    el.name.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); applyLayers(false); }
    });

    var live = [el.name, el.numbering, el.start, el.digits, el.sep, el.order, el.splitNames];
    for (var i = 0; i < live.length; i++) {
      live[i].addEventListener("input", onFormChange);
      live[i].addEventListener("change", onFormChange);
    }
  }

  function onFormChange() {
    syncNumbering();
    renderPreview();
    setReadout(el.splitReadout, splitText());
  }

  // ------------------------------------------------------------------ init
  buildSwatches();
  bindAll();
  syncNumbering();
  paintColor();
  renderPreview();
  refresh(); // read whatever is selected when the panel opens

})();
