/*
===============================================================================
  LayerHandler - ExtendScript host layer (jsx/host.jsx)
  -----------------------------------------------------------------------------
  Loaded automatically by the CEP panel (ScriptPath in the manifest).
  The panel calls the LH_* entry points below via CSInterface.evalScript().

  Illustrator's scripting DOM cannot read which rows are highlighted in the
  Layers panel (doc.activeLayer is only the last one clicked). LayerHandler
  uses the long-standing community workaround: it plays the Layers panel
  command "Hide Others" from a temporary action - that command hides every
  layer that is NOT highlighted - reads which layers stayed visible, and
  immediately restores every layer's original visibility.

  Split never changes how the artwork looks: objects keep their exact
  front-to-back order. When only some objects of a layer are split out and
  they overlap objects that stay behind, the source layer is cut into runs
  so the stacking survives (see plan()).

  Communication is plain strings: settings arrive as a JSON literal (parsed
  with eval - the panel is the only caller), results return as JSON built by
  the tiny serializer below (ExtendScript has no native JSON).
===============================================================================
*/

(function () {

    var ACTION_SET  = "LayerHandler_tmp";
    var ACTION_NAME = "HideOthers";
    var MAX_LABEL   = 40;

    // ---------------------------------------------------------------- JSON out
    function jstr(s) {
        s = String(s);
        var out = "";
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i);
            var code = s.charCodeAt(i);
            if (c === '"')       { out += '\\"'; }
            else if (c === "\\") { out += "\\\\"; }
            else if (c === "\n") { out += "\\n"; }
            else if (c === "\r") { out += "\\r"; }
            else if (c === "\t") { out += "\\t"; }
            else if (code < 32)  { out += " "; }
            else if (code === 0x2028 || code === 0x2029) { out += " "; }
            else                 { out += c; }
        }
        return '"' + out + '"';
    }

    function jval(v) {
        if (v === null || v === undefined) { return "null"; }
        var t = typeof v;
        if (t === "number")  { return isFinite(v) ? String(v) : "null"; }
        if (t === "boolean") { return v ? "true" : "false"; }
        if (t === "string")  { return jstr(v); }
        if (v instanceof Array) {
            var a = [];
            for (var i = 0; i < v.length; i++) { a.push(jval(v[i])); }
            return "[" + a.join(",") + "]";
        }
        var o = [];
        for (var k in v) {
            if (v.hasOwnProperty(k)) { o.push(jstr(k) + ":" + jval(v[k])); }
        }
        return "{" + o.join(",") + "}";
    }

    function fail(msg) { return jval({ ok: false, msg: msg }); }

    function parse(json) { return eval("(" + json + ")"); }

    function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }

    // ---------------------------------------------------------------- naming
    // Mirrors buildName() in js/main.js - keep both in sync.
    //   "Hallo"   + numbering  -> Hallo1, Hallo2, ...
    //   "Hallo_#" + numbering  -> Hallo_1, Hallo_2, ... (# marks the spot,
    //                             ## / ### also set the minimum digits)
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

    // Position i (0 = top of the Layers panel) -> number offset
    function numberIndex(i, count, o) {
        return o.order === "up" ? count - 1 - i : i;
    }

    // ---------------------------------------------------------------- colors
    function rgbColor(c) {
        var col = new RGBColor();
        col.red = c.r; col.green = c.g; col.blue = c.b;
        return col;
    }

    function colorToRgb(c) {
        if (!c || !c.typename) { return null; }
        try {
            switch (c.typename) {
                case "RGBColor":
                    return { r: Math.round(c.red), g: Math.round(c.green), b: Math.round(c.blue) };
                case "CMYKColor":
                    return {
                        r: Math.round(255 * (1 - c.cyan / 100) * (1 - c.black / 100)),
                        g: Math.round(255 * (1 - c.magenta / 100) * (1 - c.black / 100)),
                        b: Math.round(255 * (1 - c.yellow / 100) * (1 - c.black / 100))
                    };
                case "GrayColor":
                    var v = Math.round(255 * (1 - c.gray / 100));
                    return { r: v, g: v, b: v };
                case "SpotColor":
                    return colorToRgb(c.spot.color);
            }
        } catch (e) {}
        return null;
    }

    // ---------------------------------------------------------------- layers
    // Depth-first walk, top of the Layers panel first. Each node remembers
    // its sublayers so the Hide Others result can be read as a tree.
    function layerTree(container, depth, flat) {
        var nodes = [];
        var count = 0;
        try { count = container.layers.length; } catch (e) { return nodes; }
        for (var i = 0; i < count; i++) {
            var node = { layer: container.layers[i], depth: depth, vis: true, kids: null };
            flat.push(node);
            node.kids = layerTree(node.layer, depth + 1, flat);
            nodes.push(node);
        }
        return nodes;
    }

    function describeLayer(L) {
        var d = { name: "", color: null, items: 0, locked: false, visible: true };
        try { d.name = L.name; } catch (e) {}
        try { d.color = colorToRgb(L.color); } catch (e2) {}
        try { d.items = L.pageItems.length; } catch (e3) {}
        try { d.locked = L.locked; } catch (e4) {}
        try { d.visible = L.visible; } catch (e5) {}
        return d;
    }

    function describeAll(layers) {
        var out = [];
        for (var i = 0; i < layers.length; i++) { out.push(describeLayer(layers[i])); }
        return out;
    }

    // ------------------------------------------------ Layers panel selection
    function hex(s) {
        var h = "";
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i).toString(16);
            h += (c.length < 2 ? "0" : "") + c;
        }
        return h;
    }

    // One-event action: Layers panel menu > Hide Others
    // (plug-in ai_plugin_Layer, menu uid 7 / string id 23).
    function hideOthersAction() {
        return [
            "/version 3",
            "/name [", String(ACTION_SET.length), hex(ACTION_SET), "]",
            "/isOpen 0",
            "/actionCount 1",
            "/action-1 {",
            "/name [", String(ACTION_NAME.length), hex(ACTION_NAME), "]",
            "/keyIndex 0",
            "/colorIndex 0",
            "/isOpen 0",
            "/eventCount 1",
            "/event-1 {",
            "/useRulersIn1stQuadrant 0",
            "/internalName (ai_plugin_Layer)",
            "/localizedName [", "5", "4c61796572", "]",
            "/isOpen 0",
            "/isOn 1",
            "/hasDialog 0",
            "/parameterCount 3",
            "/parameter-1 {", "/key 1836411236", "/showInPalette -1",
            "/type (integer)", "/value 7", "}",
            "/parameter-2 {", "/key 1937008996", "/showInPalette -1",
            "/type (integer)", "/value 23", "}",
            "/parameter-3 {", "/key 1851878757", "/showInPalette -1",
            "/type (ustring)", "/value [", "11", "48696465204f7468657273", "]", "}",
            "}",
            "}"
        ].join("\n");
    }

    function unloadTempSet() {
        // Loop: a crashed earlier run may have left more than one copy
        for (var i = 0; i < 5; i++) {
            try { app.unloadAction(ACTION_SET, ""); } catch (e) { return; }
        }
    }

    function playHideOthers() {
        var f = new File(Folder.temp + "/LayerHandler_hideOthers.aia");
        var level = app.userInteractionLevel;
        var ok = false;
        try {
            app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
            if (f.open("w")) {
                f.write(hideOthersAction());
                f.close();
                unloadTempSet();
                app.loadAction(f);
                app.doScript(ACTION_NAME, ACTION_SET, false);
                ok = true;
            }
        } catch (e) { ok = false; }
        unloadTempSet();
        try { f.remove(); } catch (e2) {}
        try { app.userInteractionLevel = level; } catch (e3) {}
        return ok;
    }

    // A visible layer whose sublayers are partly hidden is only the parent
    // of the highlighted rows, so descend; otherwise the layer itself is
    // highlighted.
    function pickVisible(nodes, out) {
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (!n.vis) { continue; }
            var shown = 0, hidden = 0;
            for (var k = 0; k < n.kids.length; k++) {
                if (n.kids[k].vis) { shown++; } else { hidden++; }
            }
            if (shown > 0 && hidden > 0) { pickVisible(n.kids, out); }
            else { out.push(n.layer); }
        }
    }

    // Returns the highlighted layers top-to-bottom, [] for an empty
    // document, or null when the action could not be played.
    // Hiding a layer deselects its artwork, so the selection is saved
    // first and put back if the round trip changed it.
    function panelLayers(doc) {
        var flat = [];
        var tree = layerTree(doc, 0, flat);
        var i;
        if (flat.length === 0) { return []; }
        if (flat.length === 1) { return [flat[0].layer]; }

        var savedSel = null;
        try {
            var cur = doc.selection;
            if (cur && !cur.typename && cur.length) {
                savedSel = [];
                for (i = 0; i < cur.length; i++) { savedSel.push(cur[i]); }
            }
        } catch (eSel) { savedSel = null; }

        var before = [];
        for (i = 0; i < flat.length; i++) {
            var v = true;
            try { v = flat[i].layer.visible; } catch (e) {}
            before.push(v);
            if (!v) { try { flat[i].layer.visible = true; } catch (e2) {} }
        }

        var played = playHideOthers();

        for (i = 0; i < flat.length; i++) {
            try { flat[i].vis = flat[i].layer.visible; } catch (e3) { flat[i].vis = true; }
        }
        for (i = 0; i < flat.length; i++) {
            try {
                if (flat[i].layer.visible !== before[i]) { flat[i].layer.visible = before[i]; }
            } catch (e4) {}
        }
        if (savedSel) {
            try {
                var now = doc.selection;
                if (!now || now.typename || now.length !== savedSel.length) { doc.selection = savedSel; }
            } catch (e5) {}
        }

        if (!played) { return null; }
        var out = [];
        pickVisible(tree, out);
        return out;
    }

    // ------------------------------------------------------ artwork selection
    function itemKey(item) {
        try { if (item.uuid) { return "u" + item.uuid; } } catch (e) {}
        return null;
    }

    // The ancestor of item that sits directly in a layer (a path inside a
    // group resolves to the group - groups are never broken up).
    function topItem(item) {
        var node = item;
        try {
            while (node.parent && node.parent.typename !== "Layer") {
                if (node.parent.typename === "Document") { return null; }
                node = node.parent;
            }
            return node.parent ? node : null;
        } catch (e) { return null; }
    }

    // Distinct top-level items of the selection. keys is a uuid set when
    // every item has one (Illustrator 2020+), else null (DOM comparison).
    function selectionTops(doc) {
        var res = { list: [], keys: {}, text: false };
        var sel = doc.selection;
        if (!sel) { return res; }
        if (sel.typename) { res.text = true; return res; }   // TextRange
        for (var i = 0; i < sel.length; i++) {
            var t = topItem(sel[i]);
            if (!t) { continue; }
            if (containsItem(res, t)) { continue; }
            var k = itemKey(t);
            if (k === null) { res.keys = null; }
            else if (res.keys) { res.keys[k] = true; }
            res.list.push(t);
        }
        return res;
    }

    function containsItem(set, item) {
        if (set.keys) {
            var k = itemKey(item);
            if (k !== null) { return set.keys[k] === true; }
        }
        for (var i = 0; i < set.list.length; i++) {
            if (set.list[i] == item) { return true; }
        }
        return false;
    }

    // Layers that directly hold one of the given items, in panel order
    function layersOf(doc, tops) {
        var flat = [];
        layerTree(doc, 0, flat);
        var out = [];
        for (var i = 0; i < flat.length; i++) {
            for (var k = 0; k < tops.list.length; k++) {
                var p = null;
                try { p = tops.list[k].parent; } catch (e) {}
                if (p && p == flat[i].layer) { out.push(flat[i].layer); break; }
            }
        }
        return out;
    }

    // The layers the user means: the rows highlighted in the Layers panel,
    // falling back to the layers holding the selected artwork, then the
    // active layer.
    function targetLayers(doc) {
        var panel = null;
        try { panel = panelLayers(doc); } catch (e) { panel = null; }
        if (panel && panel.length) { return { layers: panel, source: "panel" }; }
        var tops = selectionTops(doc);
        if (tops.list.length) {
            var held = layersOf(doc, tops);
            if (held.length) { return { layers: held, source: "artwork" }; }
        }
        try { return { layers: [doc.activeLayer], source: "active" }; } catch (e2) {}
        return { layers: [], source: "none" };
    }

    // Objects sitting directly in the layer, front to back
    function directItems(L) {
        var out = [];
        var n = 0;
        try { n = L.pageItems.length; } catch (e) { return out; }
        for (var i = 0; i < n; i++) {
            var it = L.pageItems[i];
            try { if (it.parent.typename !== "Layer") { continue; } } catch (e2) {}
            out.push(it);
        }
        return out;
    }

    function selectionInfo(doc) {
        var tops = selectionTops(doc);
        var layers = tops.list.length ? layersOf(doc, tops) : [];
        return { objects: tops.list.length, layers: layers.length, text: tops.text };
    }

    // ------------------------------------------------------------ split plan
    function boundsOf(item) {
        try { return item.visibleBounds; } catch (e) {}
        try { return item.geometricBounds; } catch (e2) {}
        return null;
    }

    // [left, top, right, bottom]; unknown bounds count as overlapping
    function overlaps(a, b) {
        if (!a || !b) { return true; }
        return a[0] < b[2] && b[0] < a[2] && a[3] < b[1] && b[3] < a[1];
    }

    // Decide how to lift the flagged items out of their layer without
    // changing the look of the artwork. items[] is front to back.
    //   all   - every item is flagged: one layer each, source emptied
    //   above - flagged items move above the source layer (no unflagged
    //           item in front of them overlaps them)
    //   below - flagged items move below the source layer (mirror case)
    //   split - either move would change the stacking, so the source is
    //           cut into runs and every item keeps its exact place
    // chunks[] is front to back; chunks before index keep go above the
    // source layer, chunks after it below; chunks[keep] stays in place.
    function plan(items, flags, sublayers) {
        var n = items.length, i, j;
        var chunks = [];

        var all = true;
        for (i = 0; i < n; i++) { if (!flags[i]) { all = false; break; } }
        if (all) {
            for (i = 0; i < n; i++) { chunks.push({ sel: true, items: [items[i]] }); }
            return { mode: "all", chunks: chunks, keep: chunks.length };
        }

        var b = [];
        for (i = 0; i < n; i++) { b.push(boundsOf(items[i])); }
        var clashAbove = false, clashBelow = false;
        for (i = 0; i < n && !(clashAbove && clashBelow); i++) {
            for (j = i + 1; j < n; j++) {
                if (flags[i] === flags[j] || !overlaps(b[i], b[j])) { continue; }
                if (flags[j]) { clashAbove = true; } else { clashBelow = true; }
            }
        }

        var mode = "split";
        if (!clashAbove) { mode = "above"; }
        else if (!clashBelow && !sublayers) { mode = "below"; }

        if (mode !== "split") {
            for (i = 0; i < n; i++) {
                if (flags[i]) { chunks.push({ sel: true, items: [items[i]] }); }
            }
            return { mode: mode, chunks: chunks, keep: mode === "above" ? chunks.length : -1 };
        }

        var run = null;
        for (i = 0; i < n; i++) {
            if (flags[i]) {
                chunks.push({ sel: true, items: [items[i]] });
                run = null;
            } else {
                if (!run) { run = { sel: false, items: [] }; chunks.push(run); }
                run.items.push(items[i]);
            }
        }
        // The biggest leftover run stays in the source layer (sublayer
        // mode wraps every run, so nothing stays loose next to sublayers)
        var keep = -1;
        if (!sublayers) {
            for (i = 0; i < chunks.length; i++) {
                if (!chunks[i].sel &&
                    (keep < 0 || chunks[i].items.length > chunks[keep].items.length)) { keep = i; }
            }
        }
        return { mode: "split", chunks: chunks, keep: keep };
    }

    // ------------------------------------------------------------ split exec
    function itemLabel(item) {
        var nm = "";
        try { nm = trim(item.name); } catch (e) {}
        if (nm !== "") { return nm; }
        var t = "";
        try { t = item.typename; } catch (e2) {}
        switch (t) {
            case "TextFrame":
                var c = "";
                try { c = trim(String(item.contents).split(/[\r\n\u0003]/)[0].replace(/\s+/g, " ")); }
                catch (e3) {}
                if (c.length > MAX_LABEL) { c = trim(c.substr(0, MAX_LABEL)) + "\u2026"; }
                return c !== "" ? c : "Text";
            case "PathItem":         return "Path";
            case "CompoundPathItem": return "Compound Path";
            case "GroupItem":
                var clipped = false;
                try { clipped = item.clipped; } catch (e4) {}
                return clipped ? "Clip Group" : "Group";
            case "PlacedItem":
                try { return decodeURI(item.file.name); } catch (e5) {}
                return "Linked File";
            case "RasterItem":       return "Image";
            case "SymbolItem":
                try { return item.symbol.name; } catch (e6) {}
                return "Symbol";
            case "MeshItem":         return "Mesh";
            case "PluginItem":       return "Plugin Item";
            case "GraphItem":        return "Graph";
            case "LegacyTextItem":   return "Legacy Text";
            case "NonNativeItem":    return "Non-Native Art";
        }
        return t !== "" ? t : "Object";
    }

    function siblingLayer(L, above) {
        var nl = L.parent.layers.add();
        nl.move(L, above ? ElementPlacement.PLACEBEFORE : ElementPlacement.PLACEAFTER);
        return nl;
    }

    function childLayer(L) {
        var nl = L.layers.add();
        try { nl.move(L, ElementPlacement.PLACEATBEGINNING); } catch (e) {}
        return nl;
    }

    // Move into layer (appended, so a run keeps its order); locked or
    // hidden objects are released for the move and restored afterwards.
    function moveInto(item, layer) {
        var relock = false, rehide = false, moved = null;
        try { if (item.locked) { item.locked = false; relock = true; } } catch (e) {}
        try {
            moved = item.move(layer, ElementPlacement.PLACEATEND);
        } catch (e1) {
            try { if (item.hidden) { item.hidden = false; rehide = true; } } catch (e2) {}
            moved = item.move(layer, ElementPlacement.PLACEATEND);
        }
        moved = moved || item;
        if (rehide) { try { moved.hidden = true; } catch (e3) {} }
        if (relock) { try { moved.locked = true; } catch (e4) {} }
    }

    function layerName(L) {
        try { return L.name; } catch (e) { return "Layer"; }
    }

    // ------------------------------------------------------------------------
    // LH_detect: which layers would Apply / Split work on right now?
    // ------------------------------------------------------------------------
    $.global.LH_detect = function () {
        try {
            if (app.documents.length === 0) { return fail("No document open."); }
            var doc = app.activeDocument;
            var t = targetLayers(doc);
            var s = selectionInfo(doc);
            return jval({
                ok: true,
                source: t.source,
                layers: describeAll(t.layers),
                selObjects: s.objects,
                selLayers: s.layers,
                textEditing: s.text
            });
        } catch (err) {
            return fail("Detect error: " + err);
        }
    };

    // ------------------------------------------------------------------------
    // LH_state: cheap poll for the panel - how many objects are selected on
    // the artboard right now (no layer round trip, nothing is changed).
    // ------------------------------------------------------------------------
    $.global.LH_state = function () {
        try {
            if (app.documents.length === 0) { return jval({ ok: false, doc: false }); }
            var doc = app.activeDocument;
            var sel = doc.selection;
            if (sel && sel.typename) { return jval({ ok: true, doc: true, objects: 0, text: true }); }
            var n = sel ? sel.length : 0;
            // Count distinct top-level objects (a path inside a group counts
            // as its group) unless the selection is huge
            if (n > 0 && n <= 300) { n = selectionTops(doc).list.length; }
            return jval({ ok: true, doc: true, objects: n, text: false });
        } catch (err) {
            return jval({ ok: false, doc: false });
        }
    };

    // ------------------------------------------------------------------------
    // LH_apply: rename and/or recolor the highlighted layers.
    //   { name, numbering, start, digits, sep, order, color: {r,g,b}|null }
    // ------------------------------------------------------------------------
    $.global.LH_apply = function (settingsJson) {
        var st;
        try { st = parse(settingsJson); } catch (eP) { return fail("Bad settings."); }
        try {
            if (app.documents.length === 0) { return fail("No document open."); }
            var name = trim(st.name || "");
            if (name === "" && !st.color) { return fail("Pick a color or type a name first."); }
            var doc = app.activeDocument;
            var t = targetLayers(doc);
            var layers = t.layers;
            if (!layers.length) { return fail("No layer selected."); }

            var col = st.color ? rgbColor(st.color) : null;
            var failed = 0;
            for (var i = 0; i < layers.length; i++) {
                try {
                    if (name !== "") {
                        layers[i].name = buildName(name, numberIndex(i, layers.length, st), st);
                    }
                    if (col) { layers[i].color = col; }
                } catch (eL) { failed++; }
            }
            app.redraw();
            var s = selectionInfo(doc);
            return jval({
                ok: true,
                count: layers.length - failed,
                failed: failed,
                source: t.source,
                layers: describeAll(layers),
                selObjects: s.objects,
                selLayers: s.layers,
                textEditing: s.text
            });
        } catch (err) {
            return fail("Apply error: " + err);
        }
    };

    // ------------------------------------------------------------------------
    // LH_split: one layer per object.
    //   selected objects -> only those (grouped by the layer they sit in)
    //   no selection     -> every object of the highlighted layer(s)
    //   { into: "layers"|"sublayers", naming: "objects"|"field",
    //     keepColor, name, numbering, start, digits, sep, order }
    // ------------------------------------------------------------------------
    $.global.LH_split = function (settingsJson) {
        var st;
        try { st = parse(settingsJson); } catch (eP) { return fail("Bad settings."); }
        try {
            if (app.documents.length === 0) { return fail("No document open."); }
            var doc = app.activeDocument;
            var sublayers = st.into === "sublayers";
            var tops = selectionTops(doc);
            if (tops.text) { return fail("Leave text editing first (Esc), then split."); }

            var jobs = [], i, k, c;
            var fromSelection = tops.list.length > 0;
            if (fromSelection) {
                var held = layersOf(doc, tops);
                for (i = 0; i < held.length; i++) {
                    var items = directItems(held[i]);
                    var flags = [], any = false;
                    for (k = 0; k < items.length; k++) {
                        var f = containsItem(tops, items[k]);
                        flags.push(f);
                        if (f) { any = true; }
                    }
                    if (any) { jobs.push({ layer: held[i], items: items, flags: flags }); }
                }
            } else {
                var t = targetLayers(doc);
                for (i = 0; i < t.layers.length; i++) {
                    var all = directItems(t.layers[i]);
                    var on = [];
                    for (k = 0; k < all.length; k++) { on.push(true); }
                    if (all.length) { jobs.push({ layer: t.layers[i], items: all, flags: on }); }
                }
            }
            if (!jobs.length) {
                return fail(fromSelection
                    ? "Could not find the selected objects in their layers."
                    : "The selected layer has no objects to split.");
            }

            // Plan everything first so name-field numbering runs top to
            // bottom across all layers
            var plans = [], total = 0;
            for (i = 0; i < jobs.length; i++) {
                var p = plan(jobs[i].items, jobs[i].flags, sublayers);
                p.job = jobs[i];
                plans.push(p);
                for (c = 0; c < p.chunks.length; c++) { if (p.chunks[c].sel) { total++; } }
            }

            var srcLabel = jobs.length === 1 ? layerName(jobs[0].layer) : "";

            var base = trim(st.name || "");
            var useField = st.naming === "field" && base !== "";
            var counter = 0, created = 0, extra = 0, removed = 0, runsCut = 0;
            var skipped = [];

            for (i = 0; i < plans.length; i++) {
                var P = plans[i];
                var L = P.job.layer;
                var srcName = layerName(L);
                var wasLocked = false, wasVisible = true;
                try { wasLocked = L.locked; wasVisible = L.visible; } catch (eS) {}
                var made = [];   // new layers, front to back
                var fresh = [];  // every layer this job created (for cleanup)
                try {
                    if (wasLocked) { L.locked = false; }
                    if (!wasVisible) { L.visible = true; }

                    if (sublayers) {
                        for (c = P.chunks.length - 1; c >= 0; c--) {
                            fresh.push(childLayer(L));
                            made.unshift({ layer: fresh[fresh.length - 1], chunk: P.chunks[c] });
                        }
                    } else {
                        for (c = 0; c < P.keep && c < P.chunks.length; c++) {
                            fresh.push(siblingLayer(L, true));
                            made.push({ layer: fresh[fresh.length - 1], chunk: P.chunks[c] });
                        }
                        var below = [];
                        for (c = P.chunks.length - 1; c > P.keep; c--) {
                            fresh.push(siblingLayer(L, false));
                            below.unshift({ layer: fresh[fresh.length - 1], chunk: P.chunks[c] });
                        }
                        made = made.concat(below);
                    }

                    var restNo = 2;
                    for (c = 0; c < made.length; c++) {
                        var m = made[c];
                        for (k = 0; k < m.chunk.items.length; k++) { moveInto(m.chunk.items[k], m.layer); }
                        if (m.chunk.sel) {
                            m.layer.name = useField
                                ? buildName(base, numberIndex(counter, total, st), st)
                                : itemLabel(m.chunk.items[0]);
                            counter++;
                            created++;
                        } else {
                            m.layer.name = srcName + " (" + (restNo++) + ")";
                            extra++;
                        }
                        if (st.keepColor) { try { m.layer.color = L.color; } catch (eC) {} }
                        if (!sublayers) {
                            try {
                                if (!wasVisible) { m.layer.visible = false; }
                                if (wasLocked) { m.layer.locked = true; }
                            } catch (eF) {}
                        }
                    }
                    if (P.mode === "split") { runsCut++; }

                    var empty = false;
                    try { empty = L.pageItems.length === 0 && L.layers.length === 0; } catch (eE) {}
                    if (!sublayers && P.mode === "all" && empty) {
                        L.remove();
                        removed++;
                    } else {
                        if (!wasVisible) { L.visible = false; }
                        if (wasLocked) { L.locked = true; }
                    }
                } catch (eJ) {
                    skipped.push(srcName + ": " + eJ);
                    // Drop the layers this job created but never filled
                    for (c = 0; c < fresh.length; c++) {
                        try {
                            if (fresh[c].pageItems.length === 0 && fresh[c].layers.length === 0) {
                                fresh[c].remove();
                            }
                        } catch (eD) {}
                    }
                    try {
                        if (!wasVisible) { L.visible = false; }
                        if (wasLocked) { L.locked = true; }
                    } catch (eR) {}
                }
            }

            app.redraw();
            return jval({
                ok: created > 0 || skipped.length === 0,
                msg: skipped.length ? "Could not split " + skipped.join("; ") : "",
                created: created,
                extra: extra,
                removed: removed,
                runsCut: runsCut,
                layers: plans.length,
                skipped: skipped,
                fromSelection: fromSelection,
                source: fromSelection ? "selection" : srcLabel
            });
        } catch (err) {
            return fail("Split error: " + err);
        }
    };

    // ------------------------------------------------------------------------
    // LH_pick: open the native Illustrator color picker.
    // Returns "r,g,b" or "x" on cancel.
    // ------------------------------------------------------------------------
    $.global.LH_pick = function (r, g, b) {
        var current = { r: Number(r), g: Number(g), b: Number(b) };
        try {
            if (app.showColorPicker) {
                var seed = rgbColor(current);
                var ret = null;
                try { ret = app.showColorPicker(seed); } catch (eN) { ret = null; }
                var out = null;
                if (ret && ret.typename)             { out = colorToRgb(ret); }
                else if (ret === false || ret === 0) { out = null; }
                else if (ret === true)               { out = colorToRgb(seed); }
                if (out) { return out.r + "," + out.g + "," + out.b; }
                return "x";
            }
            var hexVal = (current.r << 16) | (current.g << 8) | current.b;
            var v = $.colorPicker(hexVal);
            if (v !== undefined && v !== null && v >= 0) {
                return ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255);
            }
        } catch (eL) {}
        return "x";
    };

})();
