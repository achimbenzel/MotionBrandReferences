# LayerHandler - Illustrator CEP Extension

A layer-housekeeping panel for Adobe Illustrator (2021-2026+), built in the
same style as GridHandler: give many layers one of Illustrator's layer
colors, rename them in one go (with numbering), and split a layer's content
into one layer per object. Open it via **Window > Extensions > LayerHandler**.

---

## Installation (personal use - unsigned)

CEP extensions must either be signed or run with Adobe's debug flag enabled.
For your own machine, the debug flag is the standard route and takes a minute.
(If GridHandler already runs on this machine, the flag is set - skip to 2.)

### 1. Enable PlayerDebugMode

**Windows** - open `regedit` and add a String value named `PlayerDebugMode`
with data `1` under BOTH keys (create the keys if missing):

```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11
HKEY_CURRENT_USER\Software\Adobe\CSXS.12
```

**macOS** - run in Terminal:

```
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
killall cfprefsd
```

(CSXS.11 covers Illustrator 2021-2023, CSXS.12 covers newer builds.
Setting both is harmless.)

### 2. Copy the extension folder

Copy the entire `LayerHandler` folder (the one containing `CSXS/`,
`index.html`, `js/`, `jsx/`) into:

**Windows**
```
C:\Users\<you>\AppData\Roaming\Adobe\CEP\extensions\LayerHandler
```

**macOS**
```
~/Library/Application Support/Adobe/CEP/extensions/LayerHandler
```

Create the `extensions` folder if it does not exist.

### 3. Restart Illustrator

The panel appears under **Window > Extensions > LayerHandler**.

---

## Usage

Select layers in the **Layers panel** as usual (click, Shift-click,
Ctrl/Cmd-click), then press the refresh button in the panel header. The
stats line shows how many layers were picked up. Apply and Split always
re-read the current selection, so the preview is only a guide.

The panel is built to sit in a narrow column (from 200 px wide). Only the
essentials are shown; **click a section title** (Color, Rename, Split) to
open its extra options - the chevron turns. All sections start closed and
the panel remembers what you left open.

### Layer Color

The 27 swatches are Illustrator's own layer colors (Light Blue ... Yellow,
in Layer Options order, exact RGB), so the Layer Options dialog shows the
color by name afterwards. The first nine are always visible; the other 18
and **Custom...** (the Illustrator color picker) are in the Color options.
The picked color's name is shown in the section title.

- Click a swatch to pick it, click it again to go back to "keep".
- **Double-click** a swatch to recolor the selected layers right away
  (color only - the name field is ignored).

### Rename

Type a name and press **Apply** (or Enter). With the **#** toggle next to
the name field on (numbering), `Hallo` becomes `Hallo1`, `Hallo2`,
`Hallo3` ... from the top of the Layers panel down. A line under the field
shows the result, e.g. `8 layers -> Hallo1 ... Hallo8`.

The Rename options hold the numbering settings and the full list of the
loaded layers (old name -> new name):

| Option  | Effect                                                   |
|---------|----------------------------------------------------------|
| Start   | First number (0 or higher)                               |
| Digits  | Zero padding: 2 gives `Hallo01`, `Hallo02` ...           |
| Divider | Between name and number: none, space, `_`, `-`, `.`      |
| Order   | Top to bottom, or bottom to top (1 = lowest layer)       |

A `#` in the name marks where the number goes: `Scene_#_v2` gives
`Scene_1_v2`, `Scene_2_v2` ... (`###` also sets three digits).
With Numbering off, every selected layer gets the same name.

**Apply** applies the picked color and the name together; leave the name
empty to only recolor, or keep the color on "keep" to only rename. The
**x** button next to it clears the name and the color choice.

### Split to Layers

The Split button puts every object into its own layer - paths,
groups, compound paths, text, images, symbols, anything that sits directly
in the layer. Groups and compound paths stay intact.

- **No objects selected**: splits the whole layer(s) highlighted in the
  Layers panel. The new layers take the layer's place in the stack and the
  emptied layer is removed (it is kept if it still holds sublayers).
- **Objects selected**: splits only those objects; everything else stays
  in its layer. Selecting a path inside a group splits out the whole group.
  Selections spanning several layers are handled layer by layer.

**Selected vs. highlighted.** "Selected" means selected on the artboard:
click the objects with the Selection tool (Shift adds), or in the Layers
panel click each object's target circle / the selection square at the
right edge of its row (Shift-click adds). Clicking an object's *name* in
the Layers panel only highlights the row - Illustrator does not tell
scripts about highlighted object rows, so they count as "no selection" and
the whole layer is split.

The button always says what it is about to do - **Split 3 objects** (the
selection) or **Split all 37** (every object of the highlighted layer) -
and follows the artboard selection live, so check it before clicking.

The stacking order never changes: an object that was in front of another
stays in front of it. When split-out objects overlap objects that stay
behind in both directions, the source layer is cut into extra layers named
`<layer> (2)`, `<layer> (3)` ... so every object keeps its exact place.
The status line reports these as "+N to keep the stacking".

The Split options:

| Option          | Effect                                                    |
|-----------------|-----------------------------------------------------------|
| Into            | **Layers (in place)** - top-level/sibling layers, ideal for After Effects import; **Sublayers** - inside the source layer |
| Names           | **From objects** - the object's name, the first line of a text frame, the linked file name or the type (Path, Group, Compound Path ...); **From name field** - the Rename name + numbering settings |
| Keep layer color | New layers get the source layer's color instead of Illustrator's automatic next color |

Hidden or locked source layers (and locked objects) are handled: they are
released for the move and the new layers come out hidden/locked the same way.

---

## How the Layers panel selection is read

Illustrator's scripting API cannot see which layers are highlighted in the
Layers panel - it only knows the single active layer. LayerHandler uses the
long-standing community workaround: it plays the Layers panel command
**Hide Others** from a temporary action (loaded from the system temp folder
and unloaded again immediately), reads which layers stayed visible, and
restores every layer's original visibility in the same step. With a single
layer in the document the trick is skipped.

Notes:

- Because of this round trip, **Undo** after an Apply or Split may take one
  or two extra steps (visibility changes) before it reaches your previous
  state.
- If the action cannot be played, LayerHandler falls back to the layers
  that hold the selected artwork, then to the active layer - the stats line
  says "(from artwork)" / "(active)" in that case.

---

## Troubleshooting

- **Panel is blank / not listed** - PlayerDebugMode is not set for the CSXS
  version your Illustrator uses, or the folder is one level too deep
  (`extensions/LayerHandler/CSXS/manifest.xml` must exist).
- **"Host did not respond"** - reopen the panel (Window > Extensions);
  the ExtendScript engine reloads with it.
- **Split took the whole layer instead of a few objects** - the objects were
  only highlighted in the Layers panel, not selected (see "Selected vs.
  highlighted" above). The button reads "Split all ..." in that case.
- **Only one layer gets renamed** - check the stats line after refresh; if
  it says "(active)", the Hide Others action could not run. Make sure a
  document is open and not in isolation mode.
- **Remote debugging** - create a file named `.debug` next to `index.html`
  containing:
  ```
  <?xml version="1.0" encoding="UTF-8"?>
  <ExtensionList>
    <Extension Id="com.confinium.layerhandler.panel">
      <HostList><Host Name="ILST" Port="8089"/></HostList>
    </Extension>
  </ExtensionList>
  ```
  then open `http://localhost:8089` in Chrome while the panel is open.
  (Port 8089, so it does not clash with GridHandler's 8088.)

Icons: Lucide (https://lucide.dev), ISC License.
CSInterface.js: (c) Adobe, from the official CEP-Resources repository.
