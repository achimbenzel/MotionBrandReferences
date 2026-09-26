# Confinium Dashboard

A personal, **local-only** design reference library with eight sections —
**Branding**, **Motion Design**, **Logos**, **Business Cards**, **Colors**,
**Image Gallery**, **Fonts** and **Logo No Go** — plus a **Work** area (a
Dashboard, Plans, Software, a To-Do board and the Brand Tester). Cards with thumbnails and text below, styled after
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

If the server restarts while the app is open (for example `npm run dev` picking
up an update), the app waits for it for a few seconds and sends the request
again — reads and edits always, creating something only when it's certain the
first try never arrived, so nothing is made twice. If it stays unreachable you
get a clear message instead of a bare “500 Internal Server Error”.

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
| `LINK_LOOKUP` | – | `off` turns off looking up YouTube / Vimeo titles, lengths and covers. When on, the server only ever contacts YouTube's / Vimeo's oEmbed addresses and their image hosts, and only when you save such a link |

Caching is already handled by the app: content-hashed build assets
(`/assets/*`) and immutable library files (moodboard / plan-block uploads) are
sent with a one-year `immutable` cache; `index.html` and re-uploadable files
(banner / avatar / cover) use a short cache so a redeploy or re-upload shows up
right away. Heavy code (pdf.js, the Brand Tester, the thumbnail studio, each
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
├── software/<id>/*                 # plugin installers + your own script files
├── mockup/<id>/                    # a mockup's screen picture / video + thumb.webp
└── mockup-model/<id>/model.<ext>   # an imported 3D model (.glb / .gltf / .usdz)
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

Newer additions — plan status and client, the briefing block, plan templates
and video section types — need no migration: records without them read as
“no status”, “no client”, “no type”, and older section labels keep their text.

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
titles, categories, tags and notes, colours (by hex), font sites, a video's
sections (type and note), and plan names, clients, milestones, to-dos and
briefing answers. It also lets you **jump to any section** (or
Plans, Brand Tester, Trash) by name. Arrow keys to move, Enter to open, Esc to
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
  board**, the **Brand Tester**, **Storyboards** and **Mockups** (see below).
- **Reference** — the library (Branding, Motion Design, Logos, Business Cards,
  Colors, Image Gallery, Fonts, Logo No Go).

The app starts in Work, and switching from Reference back to Work always returns
to the Dashboard.

### Dashboard
The Work landing page: a Notion-style **card view** of your tools — **Plans**
(with the plan count), the **To-Do Board** (open cards / lists) and the **Logo
Tester** — each opening its tool, plus:
- **Coming up** — milestones and plan deadlines of the next two weeks (and
  anything overdue), soonest first, from every plan that isn't delivered or
  archived,
- **Pipeline** — your plans by status (Briefing → Concept → Design →
  Production → Review → Delivered); a stage opens the plan list filtered to it
  (shown once any plan has a status),
- **Recent plans**, newest first, with their status.

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

A card can **belong to a plan** (⋯ → **Link to plan…**): it shows the plan's
name (a click opens the plan), the filter at the top shows **one plan's cards**
(new cards then belong to it), and the plan lists its cards under **To-dos on
the board** — add one there (it lands in the first list), move it to another
list, flag it urgent or unlink it; those changes touch only that card. Urgent
cards on the Dashboard name their plan.

### Plans
Plan new projects. The **+** opens **New plan**: give it a name and (optionally)
a client, and choose what to start from —
- **Empty plan** — a blank page,
- **Launch video** — briefing (product, audience, key message, CTA, target
  length, formats, tone, music & VO, must-haves, budget), a script (lines
  pre-labelled Hook → Logo outro), moodboard, references, styleframes,
  palette, a storyboard, a production checklist, a review block, a deliverables
  list (16:9 master, 9:16, 1:1, 4:5) plus milestones from kick-off to final
  delivery,
- **Branding** — briefing, research (references, competitors), moodboard, logo
  concepts, colour palette, typography, a checklist, a deliverables table and a
  brand-guidelines PDF block,
- **your own templates** — any plan can be saved with **Edit → Save as
  template…**. A template keeps the blocks, text, to-dos (unticked), tables,
  script lines, storyboard shots (their text and timing) and briefing
  questions, and leaves out images, frames, tracks, files, dates and briefing
  answers.
  Saving under the name of an existing template updates it; delete one with
  its **×** in the New plan dialog. The dialog remembers the last choice.

Plans are listed in a grid like galleries, with **status chips** above to show
one stage at a time (archived plans only show under **Archived**). Each
**plan** has:
  - **To-dos on the board** — the To-Do board's cards linked to this plan (see
    To-Do board),
  - a **status** — Briefing, Concept, Design, Production, Review, Delivered or
    Archived (or none) — picked from the pill under the plan's name, next to
    its **client**,
  - a **Notion-style banner** — pick a **preset gradient** or upload a **custom
    image** — plus a **profile image** that can be an **emoji** (quick-pick grid
    or type/paste your own) or an **uploaded image**; both banner and profile
    also show on the plan's card in the grid,
  - a **timeframe** (start / end date) with **checkable milestones** — each has a
    title, an optional date and a checkbox that strikes it through when done,
  - a stack of **content blocks** below the timeframe. A **new plan is empty**;
    add blocks with **+ Add block** at the bottom, reorder them (**Move up /
    down**), rename them, or remove them — each block has its own **⋯** menu.
    These block types are available:
    - **Briefing** — question → answer rows (rename, add or remove questions;
      answers grow as you type). The header counts answered questions, and
      **Copy** puts the whole briefing on the clipboard as text, e.g. to send
      to the client.
    - **Script** — two columns, **what we see | what we hear**. Each line shows
      when it starts and roughly how long its voice-over takes at the chosen
      **pace** (English 2.5, German 2.2, slow or fast words per second), and the
      total runs against a **target length** — the block's own, or the target
      length in the plan's briefing. Text in [brackets] or (parentheses) is a
      direction and isn't counted; `[pause 1s]` adds a pause. **Copy** puts the
      script on the clipboard; the block's ⋯ **Storyboard from script** turns
      every line into a shot, timed by its voice-over.
    - **Storyboard** — in the plan a **preview**: the frames in order (with
      their section colour), format, length against the target, how many
      shots are approved, and **Animatic**. **Open storyboard** (or a click on
      a frame) opens the **storyboard editor** — see *Storyboards* below.
    - **Deliverables** — every export to hand over, with **format** (a format
      fills in the usual resolution), **resolution**, **fps**, **codec**,
      **length**, an optional note and a **status** — Open → Rendering → In
      review → Delivered — with a progress bar (“3/7 delivered”). **Add**
      offers sets (Master 16:9 4K, ProRes master, Social set 9:16 · 1:1 · 4:5,
      Cutdowns 15 s · 6 s); **Copy** gives a spec checklist. An existing table
      (e.g. a “Deliverables” table) becomes a list via its ⋯ **Make a
      deliverables list** — columns are matched by name, others go to the
      note, and the table stays until you delete it.
    - **Review** — upload each render as a **version** (v1, v2 … — or drop the
      file on the block). Pause anywhere and write **feedback pinned to that
      moment**; comments show on a timeline under the player, jump there on
      click, and are ticked off as they're fixed (“open only” filter, **Copy
      feedback** as a checklist). **Approve** a version, **compare** two side
      by side (they play in sync), and on a new version check what was **still
      open in the one before**: mark each point *fixed* or carry it over.
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
      plan can point back at the work it draws on. The other way round works
      too: every project and gallery page has **Edit → Add to plan…**, which
      puts it into the chosen plan's References (a References block is added
      if the plan has none; nothing is added twice).
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

**Tabs.** A plan's blocks are grouped by phase in tabs under its header —
**Briefing**, **Concept**, **Production**, **Delivery** — each in its own
colour, with the number of blocks it holds; a dot marks the tab of the phase
the plan's status says it's in. The Launch video template, for example, puts
the briefing in Briefing; moodboard, references, styleframes, palette and
links in Concept; script, storyboard and the checklist in Production; review,
deliverables and files in Delivery. Blocks made before tabs existed are placed
by their type (a heading goes with the block below it); **Move to …** in a
block's ⋯ menu puts it in another tab, **Move up / down** works within the tab,
and **Add block to …** adds to the open tab. A plan opens on the tab you used
last (or its phase's, when that has blocks).

- **Overview** — the plan at a glance: per phase a card for every block with
  content (its summary — “4/10 answered”, “6 images”, “2/8 done”, “v3 · 2 open
  comments”, “0/4 delivered” … — with a glimpse: thumbnails, swatches, the
  first answers, open to-dos, a progress bar) and the blocks that are still
  empty as chips. A card or chip opens the block in its tab. The timeframe
  with its milestones and the plan's to-dos on the board are here too.
- **Empty blocks are one line** (“Styleframes — empty · drop or add images”)
  until you open them, so a fresh template stays short.
- **Every block folds** (⌃ next to its ⋯, or ⋯ → Fold) to one line with its
  summary and a glimpse of the content; **Fold all / Unfold all** does the
  whole tab. Folding is saved with the plan.

**Archive as reference.** When a job is done, **Edit → Archive as reference…**
turns it into references in your library, next to the work of others:
- the **final video** — a Review version (the last approved one is picked) or a
  video in a Files block — becomes a **Motion Design** project with a cover
  frame, its format and length,
- the **images and PDFs** you tick — moodboards (boards named styleframes,
  logo, final, design, concept … are ticked from the start), PDF and Files
  blocks; tap a picture to leave it out — become one **Branding** project,
- the **palette** becomes a **Colors** project (with RGB, CMYK and Pantone).

Title, year and tags (the client and “Own work” to start with) are set in the
dialog, and the plan can be set to **Archived** in the same step. The files are
**copied** — the plan keeps everything. The plan then shows **In your library**
chips linking to the new projects, and each project says **From plan “…”**.

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

### Brand Tester
Stress-test a logo (the page used to be called Logo Tester; the address is the
same). Upload a **PNG or SVG**, or pick one **from your library** (Logos) — its
colour variants come along. Then:
- a big **stage** with **background** (light / dark / transparent checker /
  custom, plus your colours from **Colors** as one-click swatches), the **logo
  colour** (original, its variants, black, white or any colour as a
  silhouette), **scale**, **blur**, **pixelate**, **grayscale** and **invert**,
- the **clear space** drawn around the logo — the visible mark (transparent
  padding in the file is ignored), with a margin of x = a set % of its height,
- previews as a **browser tab** and **favicons** (16 / 32 / 48 px), as a
  **profile picture** (circle) and an **app icon** (squircle) with adjustable
  padding, a **minimum size** strip (flags sizes below your minimum; screen px
  and print mm are noted) and the logo **on your brand colours**,
- **Export…** — the **test sheet** (every test on one page) at 1×–4×, on a
  light, dark or **transparent** page, or just the **logo**, as a **profile
  picture** (circle) or an **app icon** (squircle / rounded) — at preset or
  your own sizes, with space around it, on a transparent, white, black, stage
  or brand-colour background, as **PNG, JPG or WebP**. From there **Save to
  plan…** puts the file into a plan; the **Save to plan…** button saves the
  sheet (PNG) into a plan's moodboard (an existing one, or a new “Brand tests”
  board). Nothing else is stored; the settings are remembered for the session
  (and the export choices on this device).

### Storyboards
**Storyboards** (sidebar, under the Brand Tester) lists the storyboards of all
your plans — frames, format, length, section colours and plan — searchable.
**New storyboard** asks for the plan (or makes a new plan, with client, in the
same step), a starting point and the format:
- **Empty**,
- **Launch video · 30 s** — Hook → Problem → Product reveal → Features →
  Proof → Call to action → Logo outro, 11 shots with suggested timings,
- **Social cut · 15 s · 9:16** and **Logo sting · 5 s**.

A storyboard is stored in its plan (as its storyboard block), so the plan and
the Storyboards page always show the same thing.

**The editor** (a page of its own; ← goes back to the plan):
- **Name, format** (16:9, 9:16, 1:1, 4:5), **target length** (or the
  briefing's), a **music / voice-over track**, a **progress bar** by status and
  a strip of all shots with the **sections** underneath — click a shot to jump
  to it.
- Per shot: the **frame**, **duration**, **section** (Hook, Problem, Reveal …
  the same types as the sections of Motion references), **status** (Sketch →
  Styleframe → Animated → Approved), **what we see**, **voice-over**,
  **on-screen text**, **shot size** (wide, close-up, detail, screen / UI …),
  **camera move** (push in, orbit, parallax …), the **transition** into the
  next shot (cut, match cut, whip pan, morph …), **SFX / music** and **notes**.
  Each shot's ⋯ menu: new or replaced frame, play from here, insert after,
  duplicate, move earlier / later, delete (with Undo).
- **Three views**: **Grid** (panels), **List** (a table with every field — good
  for writing; cards on a phone) and **Timeline** (shots as long as they last
  on a time axis, the sections above and the track's waveform below; **drag a
  shot's right edge** to change its duration, zoom in / out / fit; the shot
  you click is edited below). The view is remembered.
- **Frames**: **Upload frames** (one shot each), **drop** images anywhere
  (on a shot: replaces its frame), **paste** an image, or **From library**:
  the plan's moodboard / files images or the **frames and moments saved on
  your Motion references** (searchable; the shot's note then says where it
  came from). Pictures are copied into the storyboard.
- **Animatic** — as before, now also showing the on-screen text as a super.
- **PDF** — A4 landscape for the client: **large** (three shots a page, frame
  left, text right) or **compact** (six a page; upright formats 4 / 6), with
  the fields you tick (voice-over, on-screen text, camera, sound, notes,
  status), plan, client, date and page numbers. It goes through the browser's
  print dialog — choose **Save as PDF**.
- ⋯ **Copy as 9:16 / 1:1 / 4:5 / 16:9 version** — a copy (frames and track
  included) to rework for another format; **Delete storyboard** (→ Trash).

### Mockups
**Mockups** (sidebar, under Storyboards) puts your designs and videos on 3D
devices — rendered live in the browser (three.js), no plugins, nothing online.

- **Devices**: **iPhone** (5 finishes), **Android phone** (3), **iPad** (2),
  **MacBook** (2), **Apple Watch** (3, with band), **iMac** (5 colours), **TV**
  (2) and a **browser window** (light / dark, with your address in the bar) —
  modelled after the current ones, without logos, at their real sizes. Phones
  and tablets turn to **landscape** or **lie flat**; the MacBook's **lid**
  opens 40–150°.
- **Several devices in one scene** — **Add** a device (e.g. a phone in front
  of a MacBook), click one in the view or the list to select it, **drag it**
  to move it on the floor, **Turn** it, **Duplicate** / **Remove** it (with
  Undo), or **Arrange** them: side by side, the big one behind with the others
  in front, or a cascade. Each device has its own finish, settings and screen.
- **Screen**: **upload** a picture or a video (a screen recording plays on the
  device), or take one **from the app** — a plan's moodboards, files,
  storyboard frames and review renders, your Motion references (the video, its
  saved frames and moments), library images or the Inbox. **Fill screen**
  crops to fit, **Show whole** keeps it all.
- **Position & size…** opens the screen as you see it — its real shape with
  rounded corners, island / notch / camera hole and the **safe area** (status
  bar, home bar, TV title-safe) — over a **grid** (thirds, fine or off). Drag
  the picture to move it, scroll / pinch / drag a corner to resize it, nudge
  it with the arrow keys; it **snaps** to the middle and the edges, and the 3D
  device follows live. Fill / Fit / Centre / Reset, or type the size and
  position in %.
- **Camera**: drag to turn, scroll / pinch to zoom, right-drag to move — or a
  view: **Front, ¾ left, ¾ right, Low hero, From above, Side, Back** (devices
  lying flat get matching views from above).
- **Look**: format **16:9, 4:5, 1:1, 9:16, 3:2**; background **none**
  (transparent), a **colour** or a **gradient** — with your **brand colours**
  from the Colors library one click away; **shadow** on the floor on / off.
- **Animation**: **Turntable (360°)**, **Sway**, **Float**, **Camera orbit**,
  **Push in** or **Reveal**, 1–30 s, smooth or even — **Play** previews it
  from the view you set (turning ones loop seamlessly, and the camera steps
  back so nothing leaves the picture).
- **Export…**: an **image** — 1080 / Full HD / 2.5K / 4K / 8K or your own
  size, background as in the scene, **transparent**, white, black or any
  colour, floor shadow on / off, **PNG, JPG or WebP** (with quality) and a
  file name — or a **video** of the animation: 720p–4K, 24 / 30 / 60 fps,
  **MP4** (H.264) or **WebM**, rendered frame by frame so it's smooth on any
  computer (screen videos play along; MP4 where the browser can encode it —
  Chrome, Edge, Safari). **Save to plan** puts the file into a “Mockups”
  moodboard of any plan (or a new one); the quick **Save to plan** button
  saves a 4K PNG.
- Everything **saves as you go**; the list shows a small render of each scene.
  ⋯ **Duplicate** / **Delete** (→ Trash, with Undo). Scenes made before
  several devices were possible open as scenes with one device.

**Your own 3D models** — import a **.glb**, a single-file **.gltf** or a
**.usdz** (on the Mockups page or in the editor) — USDZ is the format Apple
uses for its 3D / AR product models. Check the licence of any model you use in
client work. In the editor, **Screen part** picks the part of the model that
shows your picture (a part named *Screen* / *Display* is picked for you);
**Turn picture** and **Mirror** fix its orientation, **Size** sets how big it
stands (cm). **Show logo** hides / shows the model's logo parts (parts named
like *Logo*), and **Parts** lists every part to show or hide. Deleting a model
moves it to Trash.

### Inbox (share from your phone)
Everything you come across on the go — a screenshot, a screen recording, an
Instagram / Behance / YouTube link, a quick idea — goes into the **Inbox**
(top of the sidebar, with a count of what's waiting; on a phone a dot on the
menu button). There you sort each item:
- **into the library** — an image becomes a new **Branding**, **Image
  gallery**, **Logo**, **Logo No Go**, **Colors** (from the image) or **Font**
  entry, a video or a **YouTube / Vimeo link** a **Motion** reference, a PDF a
  **Branding** project. The usual add dialog opens with everything filled in;
  select several pictures to make **one** Branding project (or gallery images)
  of them,
- **into a plan** — images go to its first moodboard, PDFs to a PDF (or Files)
  block, other files to a Files block, links to a Links block and notes to a
  Text block (each made when the plan has none),
- or delete it (→ Trash, with Undo).

Once sorted, an item leaves the Inbox. You can also add to it right there:
drop files on the page, paste an image or a link (⌘V / Ctrl+V), or type a note.

**Android** (and desktop Chrome / Edge): open the app over **HTTPS** (e.g.
`tailscale serve`, see *Hosting it*) and choose ⋮ → **Install app**. After
that, Confinium shows up in the system **share sheet** — share photos,
screenshots, videos, PDFs or a page's link from any app and it lands in the
Inbox.

**iPhone / iPad:** iOS doesn't list web apps in the share sheet, so a
**Shortcut** does the job (set it up once):
1. Shortcuts app → **+** → name it “Confinium Inbox”; in its settings (ⓘ) turn
   on **Show in Share Sheet** and let it receive *Images, Media, PDFs, URLs,
   Text*.
2. Add **Get Contents of URL**: URL `https://<machine>.<tailnet>.ts.net/api/inbox`,
   Method **POST**, Headers: `X-Requested-With` = `confinium`, Request Body
   **Form** with a field `files` (type *File*) = **Shortcut Input** — for a
   link or text use a field `text` (type *Text*) = Shortcut Input instead
   (an **If** on the input's type can do both in one Shortcut).
3. Optionally add a field `via` = `shortcut` (shows “From a Shortcut”).

Now **Share → Confinium Inbox** from Photos, Safari, Instagram… sends it to
your Inbox (your phone must be in your tailnet).

The share sheet posts a plain form, which can't carry the app's CSRF header;
that one address (`/api/inbox/share`) accepts it only when the browser marks
the request as not coming from another website — and it can only add to the
Inbox.

## What each section does

### Branding
Upload **PDFs** (brand guidelines, presentations) and/or **images**. PDFs open
in a page-by-page viewer with fixed side arrows (arrow keys work too; wrapping
past the last page returns to the first) and open **fullscreen**. Images display at their true aspect ratio and open in a
fullscreen lightbox with arrow navigation. You can pick **any PDF page as the
cover** thumbnail. Tag each project by **color scheme** and **type** (tech,
restaurant, …) and filter the grid by those tags.

### Motion Design
Upload a **video**; scrub to the frame you want and it becomes the cover. Or
add a **YouTube / Vimeo link** instead of a file (**Video → YouTube / Vimeo**
in the add dialog; `youtu.be`, `watch?v=`, Shorts, `vimeo.com/…` and player
links all work). Title, channel, length and cover are looked up when you save
(leave the title empty to use the video's own); the video then plays embedded
(YouTube's privacy-enhanced `youtube-nocookie.com` player, Vimeo with
do-not-track). Sections, moments, loop, speed and the Space / K play shortcut
work on links just like on files; capturing frames and the waveform need the
file itself. Offline, a link is still saved — just without the looked-up
extras (a YouTube card then shows YouTube's own thumbnail). In the
grid, resting the mouse on a card **plays a muted preview**. Besides **All**,
**Moments** and **Galleries**, the **Structure** view compares every video that
has sections: one bar per video on a shared **time** axis (or **proportional**,
full width), sortable by date or length and filterable by tag, with a table of
**averages per section type** — in how many videos, average length, where it
starts, share of the video. A section opens its video right there.

On a project you get:
- a **player** (its **volume / mute is remembered** across reloads) with notes
  (auto-saved) and **tags** (used for filtering),
- an automatic **length tag** — `≤ 30s`, `30–60s`, `60–90s`, `> 90s` — and a
  **format tag** (`16:9`, `9:16`, `1:1`, `4:5`, `4:3`, `21:9`) read from the
  video, both usable as filters; the format and resolution (4K / 1080p / 720p)
  also show under the player and as a badge on the card. Videos added before
  this are measured once in the background when you open Motion Design,
- the **audio waveform** under the section bar (see the cuts land on the beat;
  click or drag to scrub). It's read once in the browser and stored with the
  project; for files over 150 MB it's read when you ask for it. Videos without
  a readable audio track simply show none,
- **player tools** — speed **¼×, ½×, 1×, 2×** (`<` / `>`), **Loop** (`L`) the
  section under the playhead (or the whole video; each section also has its
  own loop button) and **Mark moment** (`M`),
- **Moments** — markers on the video, each tagged with a **technique** (Match
  cut, Speed ramp, Whip pan, Kinetic type, UI zoom … or your own) and an
  optional note, with the frame captured when you marked it. Tap a technique
  to mark the current moment with it, or press `M` and type. Moments show as
  ticks on the section bar. **Motion Design → Moments** lists every moment in
  the library, filterable by technique (“all speed ramps”); a card opens the
  video right at that moment,
- a **“Add current frame”** button: pause anywhere and save that frame; frames
  are stored as **WebP** in the project folder. While paused, step **frame by
  frame** with **`,`** (back) and **`.`** (forward), YouTube-style,
- a **big frame preview** with prev/next arrows (fixed position; wrapping past
  the last frame returns to the first), click-to-**fullscreen** with arrow
  navigation, and the thumbnail strip below. Each frame has a **⋯ menu** to
  delete (no accidental one-click deletes),
- **Sections** — the video's structure as a coloured bar under the player:
  **Hook, Problem, Product reveal, Features, Social proof, Call to action,
  Logo outro**. Play the video and click a type — or press **1–7** — where that
  part begins; **Split** adds an untyped section. Click or drag along the bar to
  scrub. The list below shows each section's start and length; change its type,
  add a note, move its start to the playhead or remove it (its time joins the
  one before). The structure also shows as a thin strip on the video's card in
  the grid. Sections labelled before types existed keep their text: a label that
  names a type (“Hook”, “CTA”, “Demo”…) is read as that type, anything else
  stays as the section's name.

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
**Plans**, **Software**, **To-Dos** and **Brand Tester**.
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
- **Layout:** a project page is one centred column — the work first, then
  **tags and notes side by side** (stacked on a phone). On Motion Design
  pages they sit between the player tools and the saved frames.
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

Nothing is fetched from a third-party CDN at runtime. The one exception is
what you ask for yourself: a **YouTube / Vimeo link** plays in their embedded
player, and its title and cover are looked up once when you save it (turn the
lookup off with `LINK_LOOKUP=off`).

---

## Tech

- **Frontend:** React 18 + Vite + React Router; three.js for the 3D mockups
  (loaded only by the mockup editor) and Mediabunny to write MP4 / WebM (loaded
  only when a video is exported).
- **Backend:** a small Express server that stores files on disk and metadata in
  `data/db.json` (writes are serialized so nothing clobbers). Layout:

  ```
  server/
  ├── index.js        # entry: start, listen, graceful shutdown
  ├── app.js          # middleware + routes
  ├── config.js       # paths, ports, env vars
  ├── db.js           # atomic writes, self-healing reads, snapshots, write queue
  ├── schema.js       # record shapes, read-time normalizing, the v1→v2 migration
  ├── templates.js    # built-in plan templates, save-as-template
  ├── files.js        # fs helpers (path containment, moves, trash, storage size)
  ├── http.js         # async-safe routers, JSON errors, host/CSRF/data guards
  ├── upload.js       # multer (per-request tmp folder, always cleaned up)
  ├── unused.js       # unused-file scan
  ├── zip.js          # dependency-free ZIP64 export/import
  └── routes/         # projects, plans, software, board, mockups, trash, search, settings, library, maintenance
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
