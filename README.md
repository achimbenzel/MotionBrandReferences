# Confinium Dashboard

A personal, **local-only** design reference library with eight sections —
**Branding**, **Motion Design**, **Logos**, **Business Cards**, **Colors**,
**Image Gallery**, **Fonts** and **Logo No Go** — plus a **Work** area (a
Dashboard, Plans, Software, a To-Do board and the Logo Tester). Cards with thumbnails and text below, styled after
[achimbenzel.com/de/work](https://achimbenzel.com/de/work). Each section can be
viewed as **All** (all projects) or **Galleries** (named collections you create,
e.g. "Green Tech Companies"). A storage meter in the header sums the `data/`
folder against an editable limit (default 80 GB).

It runs on its own ports (**4200** frontend / **4300** API) so it never clashes
with your usual dev ports (5173, 3000, 3333, 8000). Requires **Node.js 18.18+**
(20 or 22 recommended).

---

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:4200**.

- Frontend (Vite) → http://localhost:4200
- Backend API + your files → http://localhost:4300 (proxied through 4200 in dev)

### Run it as a single server (optional)

```bash
npm run serve      # builds the frontend and serves everything from :4300
# open http://localhost:4300
```

### Updating the app

```bash
git pull
npm install        # picks up new/removed packages — your data/ folder is never touched
npm run dev        # or: npm run serve
```

After an update, **Settings → Library** tells you if your library is stored in
an older data format and offers a one-click **Migrate** (see
[Data format & migration](#data-format--migration)). Until you click it,
everything keeps working exactly as before.

### Hosting it (VPS + Tailscale)

The app has **no login** — whoever can reach it can see and change the whole
library (including the plugin license keys). So it is built to be reachable
only by you:

- The server listens on **`127.0.0.1` only** by default, so it is never exposed
  to your LAN or the internet by accident.
- Other websites can't use it behind your back: there is no CORS, every
  state-changing API call needs a custom header (CSRF protection), and requests
  for unknown host names are refused (protection against DNS rebinding).
- `db.json`, its backups and temp files are never served over HTTP.

**Recommended on a VPS: `tailscale serve`.** It forwards only to devices in your
tailnet and gives you HTTPS for free (needed for clipboard copy/paste in the
browser):

```bash
npm install && npm run build
NODE_ENV=production node server/index.js     # or: npm start (e.g. via pm2 / systemd)
sudo tailscale serve --bg 4300               # → https://<machine>.<tailnet>.ts.net
```

Then open `https://<machine>.<tailnet>.ts.net` from any device logged into your
Tailscale account. On a phone, use **Share → Add to Home Screen** (iOS) or
**Install app** (Android/Chrome): the app then starts full-screen from its own
icon, like a native app. The app doesn't gzip its responses itself; if you want
smaller mobile payloads (the initial JS is ~290 KB raw, ~90 KB gzipped), put
Caddy in between (`encode zstd gzip` + `reverse_proxy 127.0.0.1:4300`) and point
`tailscale serve` at Caddy instead.

**Alternative:** listen directly on the Tailscale interface with
`HOST=100.x.y.z npm start` (your machine's Tailscale IP) and open
`http://100.x.y.z:4300` — works, but without HTTPS the browser blocks
clipboard features. Never use `HOST=0.0.0.0` on a VPS with a public IP unless a
firewall blocks port 4300.

| Environment variable | Default | What it does |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interface to listen on |
| `API_PORT` | `4300` | Port of the API / production server |
| `DATA_DIR` | `./data` | Where the library lives (e.g. a mounted volume) |
| `ALLOWED_HOSTS` | – | Extra host names to accept, comma-separated (e.g. your own domain). IPs, `localhost`, Tailscale names (`*.ts.net`, MagicDNS short names) and `*.local` / `*.lan` / `*.fritz.box` always work; `*` disables the check |
| `MAX_UPLOAD_MB` | `1024` | Per-file upload limit (raise it for long 4K videos) |

Caching is already handled by the app: content-hashed build assets
(`/assets/*`) and immutable library files (moodboard / plan-block uploads) are
sent with a one-year `immutable` cache; `index.html` and re-uploadable files
(banner / avatar / cover) use a short cache so a redeploy or re-upload shows up
right away. Heavy code (pdf.js, the Logo Tester, the thumbnail studio, each
detail page) is split into its own chunk and fetched only when first needed.

---

## Your library never breaks on updates

Everything you add — videos, images, PDFs, captured frames and all metadata —
is stored in a single top-level **`data/`** folder:

```
data/
├── db.json                     # all metadata + galleries + settings (human-readable)
├── db.json.bak                 # mirror of the last good db.json (crash safety)
├── backups/db-<timestamp>.json # rotating db snapshots (last 10)
│   └── pre-import-<ts>.zip      # safety backup made before a library import
├── trash/<trashId>/            # soft-deleted items (auto-purged after 30 days)
├── motion/<id>/video.mp4       # original video
│   ├── thumb.webp              # cover frame
│   └── frames/*.webp           # captured keyframes (WebP = small)
├── color/<id>/example.<ext>    # example image
├── branding/<id>/*.pdf|*.png   # guidelines / decks / images
├── logo/<id>/logo.svg              # one logo image (SVG/PNG), recoloured live
├── businesscard/<id>/front.webp, back.webp
├── imagegallery/<id>/image.<ext>   # one image per item
├── font/<id>/shot.<ext>            # optional screenshot of a free-font site
├── logonogo/<id>/image.<ext>       # a logo/symbol to avoid resembling
├── plan/<id>/                      # Plan-mode plans
    ├── banner.<ext>, avatar.<ext>  # Notion-style banner + profile image
    └── blocks/<blockId>/*          # one folder per content block
                                    # (moodboard images, files + example images)
└── software/<id>/*                 # plugin installers + your own script files
```

`data/` is **git-ignored and lives outside the source code**, so you can pull
updates, reinstall dependencies or rebuild the app any time — your library is
never touched. To back up or move your library, just copy the `data/` folder.

### Crash-safe metadata

`db.json` holds all your metadata, so it's written defensively:

- **Atomic writes** — every change is written to a temp file, flushed to disk
  (`fsync`) and then atomically renamed over `db.json`, so a crash or power loss
  mid-write can never leave a truncated, unreadable file.
- **Self-healing** — if `db.json` is ever missing or corrupt, the app
  automatically recovers from `db.json.bak` (a mirror of the last good version)
  or the newest snapshot under `backups/`, then rewrites a good `db.json`.
- **Rotating snapshots** — the last 10 versions are kept under `backups/` (at
  most one every few minutes) so you can go back to an earlier state.
- **Graceful shutdown** — on `SIGTERM`/`SIGINT` the server stops accepting
  requests and finishes any in-flight write before exiting, so a restart or
  deploy can't interrupt a save.
- **Resilient write queue** — writes are serialized, and a single failed write
  (e.g. a full disk) no longer blocks the writes that come after it.
- **Startup cleanup** — leftover upload temp folders (`data/tmp/`) and stale
  atomic-write temp files from an earlier crash are swept on boot.
- **Path containment** — every file delete/move is checked to stay inside
  `data/`, as a defensive guard against path traversal.
- **Never starts over by accident** — if `db.json` and every backup of it are
  unreadable, the server answers with an error instead of treating the library
  as empty (which would overwrite it on the next save).
- **Errors don't take the server down** — a failed save (e.g. a full disk)
  returns a clear error message to the page; the server keeps running.
- **Edits are never dropped** — autosaves still go out when you navigate away
  or close the tab right after typing, and a tab you come back to after a while
  reloads its data first, so a stale tab on another device can't overwrite
  newer changes.

### Data format & migration

`db.json` carries a `schemaVersion`. Libraries created with older versions of
the app (no version = v1) contain records in older shapes — e.g. plans from
before content blocks, logos with light/dark variants or plain hex colour lists,
Software entries with separate scripts. The app reads all of these as-is, so
nothing changes after an update.

**Settings → Library → Migrate** rewrites them once into the current format
(v2). It is non-destructive: a copy of the current `db.json` is saved as
`data/backups/pre-migrate-v1-<time>.json` first, no files are moved or deleted,
and every file reference is kept. To undo, stop the app and copy that backup
over `data/db.json`.

### Unused files cleanup

**Settings → Library → Unused files → Scan** lists files in the library folders
that nothing in `db.json` points to any more — e.g. images older versions left
behind when a banner or avatar was re-uploaded, or the folder of an upload that
failed halfway. The check is conservative (hidden files and anything changed in
the last 10 minutes are never listed). **Move to Trash** moves them as one
restorable item, so nothing is lost for 30 days.

### Export & import your whole library

The storage meter's **⋯** menu has **Export library (.zip)** and **Import
library (.zip)…**:

- **Export** downloads a single `.zip` containing `db.json` and every file in
  your library — a complete, portable backup you can move to another machine.
- **Import** replaces the current library with the contents of such a `.zip`.
  It's destructive, so it asks for confirmation, **validates the archive first**
  (it must be a real Design Reference export with a parseable `db.json`), and
  automatically saves a safety backup of your current library to
  `data/backups/pre-import-<timestamp>.zip` before swapping anything in.

The ZIP support is written from scratch with no extra dependencies. Files are
**stored uncompressed** (videos/images/PDFs are already compressed) and streamed,
and full **ZIP64** is supported, so archives and individual files larger than
4 GB work. Exports open in any standard unzip tool.

### Search everything (⌘K / Ctrl-K)

Press **⌘K** (macOS) / **Ctrl-K**, or the header search button, to open a
command palette that searches **across every section at once** — project
titles, categories, tags and notes, colours (by hex), font sites, and plan
names, milestones and to-dos. It also lets you **jump to any section** (or
Plans, Logo Tester, Trash) by name. Arrow keys to move, Enter to open, Esc to
close.

### Trash (recoverable deletes)

Deleting a **project, plan, gallery, software, plan block** — or a **file from
a plan's Files block** — moves it to **Trash** instead of removing it
immediately, and a toast offers a one-click **Undo**. Open Trash from the storage **⋯** menu (or
the palette) to **restore** items — files, example images and gallery
membership come back intact — or delete them permanently. Trash auto-empties
items older than **30 days**. (Trashed items live under `data/trash/` and are
excluded from exports.)

### Settings

A **Settings** page (in the sidebar footer above Trash, the storage **⋯** menu,
or the palette) has a **Library** section — data-format migration, unused-file
cleanup and backups (see above) — and lists every **keyboard shortcut** — ⌘K search, the fullscreen
viewer's scroll-zoom / drag / arrows, Motion's `,` `.` frame stepping, project
`←`/`→` navigation — plus per-browser **preferences**. The **video player
volume** (and mute) is remembered across reloads in this browser, and can be
reset from here.

---

## Modes: Work & Reference

A toggle switches between two modes:

- **Work** — the **default** mode (left in the toggle), your working area. It
  opens on a **Dashboard** and holds **Plans**, **Software**, the **To-Do
  board** and the **Logo Tester** (see below).
- **Reference** — the library (Branding, Motion Design, Logos, Business Cards,
  Colors, Image Gallery, Fonts, Logo No Go).

The app starts in Work, and switching from Reference back to Work always returns
to the Dashboard.

### Dashboard
The Work landing page: a Notion-style **card view** of your tools — **Plans**
(with the plan count), the **To-Do Board** (open cards / lists) and the **Logo
Tester** — each opening its tool, plus a **Recent plans** row.

### To-Do board
A general **Kanban planner**. Lists (columns) hold **cards**; add lists and
cards, rename them inline, give cards **coloured tags**, tint a whole card in
one of the same colours, and **drag cards** (via the grip handle) within a list
or across lists to track progress. Each card's **⋯ menu** does the same without
dragging — **Move to “…”** any list, move up / down, mark urgent, colour, add a
tag, delete — which is how cards move on touch screens. On desktop the board
uses the **full width**, so extra lists run past the usual content margins; on
a phone every list is a full-width, swipeable page with **list tabs** above to
jump between them. Everything auto-saves to one global board.

### Plans
Plan new projects. The **+** creates a new plan; plans are listed
  in a grid like galleries. Each **plan** has:
  - a **Notion-style banner** — pick a **preset gradient** or upload a **custom
    image** — plus a **profile image** that can be an **emoji** (quick-pick grid
    or type/paste your own) or an **uploaded image**; both banner and profile
    also show on the plan's card in the grid,
  - a **timeframe** (start / end date) with **checkable milestones** — each has a
    title, an optional date and a checkbox that strikes it through when done,
  - a stack of **content blocks** below the timeframe. A **new plan is empty**;
    add blocks with **+ Add block** at the bottom, reorder them (**Move up /
    down**), rename them, or remove them — each block has its own **⋯** menu.
    Four block types are available:
    - **Moodboard** — a **collapsible** board of images. Add images by button, by
      **dropping** files onto the board, or by **pasting** (⌘V) into the last-used
      board.
    - **Text** — a free-text notes area, auto-saved.
    - **To-dos** — a checklist you add items to and tick off, auto-saved.
    - **Files** — a list of uploaded files. **Add file** opens a small dialog
      where you pick an **example image**, write a **title** and choose the
      **file**; each file is then listed with its example image as a **square
      preview** before it. Deleting a file **moves it to Trash** first (with
      Undo), so nothing is lost by accident.
    - **Links** — a list of **bookmarks** (label + URL), each opening in a new
      tab; handy for inspiration, references or client sites.
    - **References** — attach existing items from your **Reference library**
      (projects and galleries) via a search picker; they’re shown as the **same
      cards as in the library** (three across) and **jump to that item**, so a
      plan can point back at the work it draws on.
    - **Palette** — a set of colour **swatches** (hex + optional name); add them
      by hand or **extract a palette from an uploaded image**, and copy any hex
      with one click.
    - **Heading** and **Divider** — lightweight structural blocks (an inline
      heading with an optional subtitle, and a horizontal rule) for organising
      longer plans.
    - **Table** — a small editable grid: rename columns, add/remove columns and
      rows, and any column whose values are all numeric gets an automatic
      **sum row** (handy for budget lines).

  Following the general rule below, a plan's title and each block's name are only
  editable via a **⋯** menu — there is no bare Delete button.

### Software
A **topic per app** (After Effects, Premiere, Blender…). Add a software, give it
an emoji, and it opens a page with four tabs, each searchable:
- **Plugins** — a small **database**: name, category, **website/source**,
  **account**, **license key / serial**, **price + currency**, version,
  purchase date, notes and an optional **installer file**. The key is **masked**
  by default with show / **copy**; the header sums your **total spend** per
  currency. Switch between **cards** (with preview images) and a compact
  **list** (name, category, price — a little database table); the choice is
  remembered, and phones start with the list.
- **Scripts** — upload your **own scripts / plugins** (`.jsx`, `.ffx`, `.zip`…)
  with a name and note, and download them again.
- **Expressions** — a snippet library: title + code (monospace) + tags, with a
  **one-click copy**.
- **Tutorials** — link useful **YouTube** videos / articles (title, URL,
  channel, tags).

Everything auto-saves. Deleting a software moves it (and its files) to **Trash**.
Note: license keys and account details are stored **in plain text** in
`data/db.json`. The file is never served over HTTP, but keep that in mind before
syncing or backing up the folder anywhere.

### Logo Tester
A sandbox (nothing is saved) to stress-test a logo. Upload a **PNG or SVG**,
then preview it live:
- a big **stage** with adjustable **background** (light / dark / transparent
  checker / custom colour), **scale**, **blur** and **pixelate** sliders, plus
  **grayscale** and **invert** toggles;
- real-world previews: a **browser tab** favicon, **app icons** (rounded
  128 / 64 px tiles), exact **favicon sizes** (16 / 32 / 48 px) and a **small
  sizes** row (24–96 px) to check legibility when tiny.

## What each section does

### Branding
Upload **PDFs** (brand guidelines, presentations) and/or **images**. PDFs open
in a page-by-page viewer with fixed side arrows (arrow keys work too; wrapping
past the last page returns to the first) and open **fullscreen**. Images display at their true aspect ratio and open in a
fullscreen lightbox with arrow navigation. You can pick **any PDF page as the
cover** thumbnail. Tag each project by **color scheme** and **type** (tech,
restaurant, …) and filter the grid by those tags.

### Motion Design
Upload a **video**; scrub to the frame you want and it becomes the cover. On a
project you get:
- a **player** (its **volume / mute is remembered** across reloads) with notes
  (auto-saved) and **tags** (used for filtering),
- an automatic **length tag** — `≤ 30s`, `30–60s`, `60–90s`, `> 90s`,
- a **“Add current frame”** button: pause anywhere and save that frame; frames
  are stored as **WebP** in the project folder. While paused, step **frame by
  frame** with **`,`** (back) and **`.`** (forward), YouTube-style,
- a **big frame preview** with prev/next arrows (fixed position; wrapping past
  the last frame returns to the first), click-to-**fullscreen** with arrow
  navigation, and the thumbnail strip below. Each frame has a **⋯ menu** to
  delete (no accidental one-click deletes).

### Logos
Upload one image — **SVG** or **PNG** (transparent silhouette). Each colour
option is a **pairing of a logo colour and a background** (via CSS mask, so it
works for SVG and PNG silhouettes), so e.g. **black-on-white** and
**white-on-black** are both switchable — picking one flips the logo colour *and*
the background together. You can also keep an untouched **Original (colour)**
pairing. On the detail page the only thing under the canvas is that **switcher**;
the pairings and **scale** are edited in **Edit ▸ Logo-Optionen**. Grid cards
render the selected pairing live.

### Business Cards
Pick a size — **85 × 55 mm** or **89 × 51 mm** — then upload and **crop** a
**front** and **back** image to that ratio. In the grid the two sides are shown
stacked (front over back); the detail page shows both large, with fullscreen,
plus a **rotatable 3D view** (a real cuboid with a thin white edge for
thickness) you can drag to spin and flip between front/back.

### Colors
Add an **example image** plus colors entered in **any one** format — HEX, RGB,
CMYK or Pantone — and every representation is shown automatically. Click any
value to copy it. The example image shows at its **true aspect ratio** (never
cropped) and opens fullscreen. Beyond that:
- **Extract from image** — pull the dominant colours out of the example image
  (or any image you pick) and add them to the palette in one click.
- **Contrast checker** — pick a text and a background colour and see the WCAG
  contrast ratio with AA / AAA pass/fail for normal and large text.
- **Export** the palette as **CSS variables**, **JSON** or a **Tailwind** config
  (copied to the clipboard).
- **All colours** — on the Colors grid, toggle an overview of every unique
  colour across all your palettes; click a swatch to copy its hex.

### Image Gallery
A moodboard section: add **images with no name and no tags** (several at once).
Add them the fast way — **paste** from the clipboard (⌘V) or **drag & drop**
files straight onto the page — or via the header **+**. They're listed
**Pinterest-style** (masonry columns) at their true aspect ratio; click one for
fullscreen. Each image's **⋯** menu deletes it or adds it to a gallery (existing
or new). Like every section it has the All / Galleries toggle.

### Fonts
A bookmark collection of **websites where you can get free fonts** (Google
Fonts, DaFont, Velvetyne…). Each entry is a **link**: give it a name and a
**URL**, and optionally upload a **screenshot** as the cover (frame & crop it
like any other cover). Cards show the screenshot — or, without one, a tile with
the site's domain — plus the domain as subtitle. Opening an entry shows the
screenshot as a big **“Visit site”** button, the link, tags and a notes field;
the URL is edited from the **Edit ⋯** menu. Like every section it has the All /
Galleries toggle.

### Logo No Go
A reference of **logos and symbols with a bad reputation** — so when you design
a new logo you can check you're not accidentally resembling one. Upload an
**image** (PNG or SVG) and give it a name; the detail page shows the image with
an **“Avoid designs that resemble this”** banner and a **“Why it's a no-go”**
notes field for its history / what to steer clear of.

### Galleries (All / Galleries)
Every section has an **All / Galleries** toggle. Under **Galleries** you create
named collections (e.g. "Green Tech Companies"), open one, and add or remove
projects of that section via a picker. A project can be in several galleries;
deleting a project removes it from its galleries automatically. Galleries are
just references — deleting a gallery never deletes the projects.

### Storage meter
The storage meter (sidebar footer on desktop, header on mobile) shows how much
of the `data/` folder is used against a limit
(default **80 GB**). Use the **⋯** next to it (its menu opens **upward** on the
sidebar footer, so nothing is clipped off the bottom) to change the limit,
export / import the library or open the Trash; usage is the real summed size of
everything under `data/`, cached briefly and recomputed whenever the library
changes so the meter never rescans the whole tree on every poll.

### Navigation: sidebar (desktop) & drawer (phone / tablet)
On **desktop** the app uses a **Notion-style left sidebar** that holds
everything: the **logo** and a collapse button at the top, search (⌘K) below
it, the Work / Reference toggle, the section list (with icons, current one
highlighted), an **Add** button, and a footer with **Settings**, **Trash** and
the storage meter. In **Work** mode the section list is **Dashboard**,
**Plans**, **Software**, **To-Dos** and **Logo Tester**.
The collapse button **slides** the sidebar out for a full-width canvas; a small
floating button slides it back in, and the collapsed state is remembered.

Below 900 px (phones, tablets) the **same sidebar** becomes a **drawer**: a
slim top bar shows **☰**, the page title, search and add; ☰ slides the sidebar
in with everything above (both modes, Settings, Trash, storage). The top bar
hides while you scroll down and returns when you scroll up.

On **touch screens**:
- menus (⋯, Edit, Export…) open as **bottom sheets** with big rows, and
  dialogs (Add project, Edit details…) slide up from the bottom with **Save**
  always in reach;
- every control that appears on mouse-hover on desktop (block menus, Add block,
  banner / avatar change, image ⋯ menus, delete buttons) is always visible;
- input fields use 16 px text so iPhones don't zoom in when you tap them;
- grids show **two columns**, filter chips are one swipeable row.

On desktop, block menus and “Add block” stay faintly visible instead of
appearing only on hover, and **Tab** shows a clear focus ring for keyboard use.

A project's detail page has **Previous / Next** buttons at the foot (and the
**← / →** arrow keys) to step through the other projects in the same section
without going back to the grid; stepping past the last one wraps to the first.

### Covers & editing (all types)
- **Zoom any image:** the fullscreen viewer (Motion frames, Branding images,
  Logos, moodboards, galleries, …) zooms with the **mouse wheel** toward the
  cursor, **drag** to pan, and **double-click** to toggle; a reset badge shows
  the current level. On touch screens: **swipe** left / right to browse,
  **pinch** to zoom, **double-tap** to toggle zoom, **swipe down** to close.
  PDFs turn pages with a swipe, too.
- **Wide screens** (≥ 1280 px) show a project's **tags and notes beside** the
  work (sticky) instead of below it.
- **Crop & zoom the cover:** when you set a thumbnail — a Motion frame, a
  Branding PDF page or image, a Color image, or a Font screenshot — drag to
  reposition and use the zoom slider to frame exactly what shows on the card.
- **Edit menu:** every project has an **Edit ⋯** menu (top-right) to **rename**,
  edit year/category (and the URL for Fonts), **change the cover**, or
  **delete** — no bare delete icon.
- **Notes:** every project type (Branding, Motion, Logos, Business Cards,
  Colors, Fonts) has an auto-saved **Notes** field, shown at ~1.5× the normal
  text size.

> **Note on conversions:** HEX ⇄ RGB is exact. CMYK is the standard device-neutral
> approximation. **Pantone has no exact formula** to/from other spaces, so it is a
> **nearest-match** against a bundled approximate table and is always labelled
> *“approx.”*. The table is a representative subset, not the full Pantone library.

---

## Fully local assets

- **Font:** DM Sans is self-hosted via `@fontsource/dm-sans` (no Google Fonts CDN).
- **Icons:** [lucide](https://lucide.dev) via `lucide-react`, bundled locally.
- **PDF rendering:** `pdfjs-dist` with a locally-bundled worker.

Nothing is fetched from a third-party CDN at runtime.

---

## Tech

- **Frontend:** React 18 + Vite + React Router.
- **Backend:** a small Express server that stores files on disk and metadata in
  `data/db.json` (writes are serialized so nothing clobbers). Layout:

  ```
  server/
  ├── index.js        # entry: start, listen, graceful shutdown
  ├── app.js          # middleware + routes
  ├── config.js       # paths, ports, env vars
  ├── db.js           # atomic writes, self-healing reads, snapshots, write queue
  ├── schema.js       # record shapes, read-time normalizing, the v1→v2 migration
  ├── files.js        # fs helpers (path containment, moves, trash, storage size)
  ├── http.js         # async-safe routers, JSON errors, host/CSRF/data guards
  ├── upload.js       # multer (per-request tmp folder, always cleaned up)
  ├── unused.js       # unused-file scan
  ├── zip.js          # dependency-free ZIP64 export/import
  └── routes/         # projects, plans, software, board, trash, search, settings, library, maintenance
  ```
- **Tests:** `npm test` starts the real server against throwaway data folders —
  including a library with every data shape older versions wrote — and checks
  the API, the security guards, crash handling, export/import and the migration.

### Scripts

| command | what it does |
| --- | --- |
| `npm run dev` | run frontend (4200) + API (4300) together, with proxy |
| `npm run build` | build the frontend into `dist/` |
| `npm run serve` | build, then serve app + API from a single port (4300) |
| `npm start` | serve a pre-built `dist/` + API from 4300 |
| `npm test` | API / migration / security tests (Node's built-in test runner) |
| `npm run lint` | ESLint (incl. React hook rules) |
| `npm run check` | lint + tests + build — the same as CI on every push |

### A note on `npm audit`

The server-side advisories (Express's `qs`) are fixed. What remains is in
**dev tooling** — the Vite/esbuild dev server, which only runs during
`npm run dev` — and in React Router (an SSR-only issue and an open redirect via
untrusted link targets; the app uses neither). The fixes need breaking major
upgrades (Vite 8, React Router 7), so they're left for a dedicated upgrade.
