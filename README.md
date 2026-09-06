# Design Reference

A personal, **local-only** design reference library with five sections —
**Branding**, **Motion Design**, **Logos**, **Business Cards** and **Colors**.
Cards with thumbnails and text below, styled after
[achimbenzel.com/de/work](https://achimbenzel.com/de/work). Each section can be
viewed as **Alle** (all projects) or **Galerien** (named collections you create,
e.g. "Grüne Tech Firmen"). A storage meter in the header sums the `data/` folder
against an editable limit (default 80 GB).

It runs on its own ports (**4200** frontend / **4300** API) so it never clashes
with your usual dev ports (5173, 3000, 3333, 8000).

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

---

## Your library never breaks on updates

Everything you add — videos, images, PDFs, captured frames and all metadata —
is stored in a single top-level **`data/`** folder:

```
data/
├── db.json                     # all metadata + galleries + settings (human-readable)
├── motion/<id>/video.mp4       # original video
│   ├── thumb.webp              # cover frame
│   └── frames/*.webp           # captured keyframes (WebP = small)
├── color/<id>/example.<ext>    # example image
├── branding/<id>/*.pdf|*.png   # guidelines / decks / images
├── logo/<id>/logo.svg              # one logo image (SVG/PNG), recoloured live
├── businesscard/<id>/front.webp, back.webp
├── imagegallery/<id>/image.<ext>   # one image per item
└── plan/<id>/moodboard/*.<ext>     # Plan-mode moodboards
```

`data/` is **git-ignored and lives outside the source code**, so you can pull
updates, reinstall dependencies or rebuild the app any time — your library is
never touched. To back up or move your library, just copy the `data/` folder.

---

## Modes: Reference & Plan

A toggle on the **left** of the header (mirroring the storage meter on the
right) switches between two modes:

- **Reference** — the library described below (Branding, Motion Design, Logos,
  Business Cards, Colors, Image Gallery).
- **Plan** — plan new projects. Each **plan** has a **moodboard** (images), a
  free‑text **Information** field and a **timeframe** (start / end date). The
  **+** creates a new plan; plans are listed like galleries.

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
- a **player** with notes (auto-saved) and **tags** (used for filtering),
- an automatic **length tag** — `≤ 30s`, `30–60s`, `60–90s`, `> 90s`,
- a **“Add current frame”** button: pause anywhere and save that frame; frames
  are stored as **WebP** in the project folder,
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
cropped) and opens fullscreen.

### Image Gallery
A moodboard section: add **images with no name and no tags** (several at once).
They're listed **Pinterest-style** (masonry columns) at their true aspect
ratio; click one for fullscreen. Each image's **⋯** menu deletes it or adds it
to a gallery (existing or new). Like every section it has the Alle / Galerien
toggle.

### Galleries (Alle / Galerien)
Every section has an **Alle / Galerien** toggle. Under **Galerien** you create
named collections (e.g. "Grüne Tech Firmen"), open one, and add or remove
projects of that section via a picker. A project can be in several galleries;
deleting a project removes it from its galleries automatically. Galleries are
just references — deleting a gallery never deletes the projects.

### Storage meter
The header shows how much of the `data/` folder is used against a limit
(default **80 GB**). Use the **⋯** next to it to change the limit; usage is the
real summed size of everything under `data/`.

### Responsive header
On wide screens all five section tabs sit in the pill. On narrow/mobile widths
they collapse into a **hamburger menu** whose dropdown lists all sections
(current one checked). The toggle is icon-only so the pill's size and position
never shift between sections, and the dropdown always renders above the storage
meter.

### Covers & editing (all types)
- **Crop & zoom the cover:** when you set a thumbnail — a Motion frame, a
  Branding PDF page or image, or a Color image — drag to reposition and use the
  zoom slider to frame exactly what shows on the card.
- **Edit menu:** every project has an **Edit ⋯** menu (top-right) to **rename**,
  edit year/category, **change the cover**, or **delete** — no bare delete icon.
- **Notes:** every project type (Branding, Motion, Logos, Business Cards,
  Colors) has an auto-saved **Notes** field, shown at ~1.5× the normal text size.

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
  `data/db.json` (writes are serialized so nothing clobbers).

### Scripts

| command | what it does |
| --- | --- |
| `npm run dev` | run frontend (4200) + API (4300) together, with proxy |
| `npm run build` | build the frontend into `dist/` |
| `npm run serve` | build, then serve app + API from a single port (4300) |
| `npm start` | serve a pre-built `dist/` + API from 4300 |

### A note on `npm audit`

Remaining advisories are all in **dev tooling** (Vite/esbuild dev server,
React Router link handling) and only matter if you browse a malicious website
while the dev server is running. For a localhost-only personal tool the
practical risk is negligible; the fixes require breaking major upgrades, so
they’re intentionally not applied.
