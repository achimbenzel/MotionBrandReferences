# Confinium Dashboard

A personal, **local-only** design reference library with eight sections —
**Branding**, **Motion Design**, **Logos**, **Business Cards**, **Colors**,
**Image Gallery**, **Fonts** and **Logo No Go** — plus a **Work** area (a
Dashboard, Projects, Software, a To-Do board and the Brand Tester). Cards with thumbnails and text below, styled after
[achimbenzel.com/de/work](https://achimbenzel.com/de/work). Each section can be
viewed as **All** (all references) or **Galleries** (named collections you create,
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

#### Test it on your phone (Tailscale)
With your computer and your phone in the same tailnet, **`tailscale serve`**
is the easy way: Tailscale takes the connection itself and hands it to the app
on `127.0.0.1`, so **no firewall rule is needed**, nothing is exposed to your
LAN, and you get HTTPS (in the Tailscale admin console, *DNS* → enable
**MagicDNS** and **HTTPS Certificates**; the first `serve` shows a link if
it isn't on yet).

```bash
# like the real thing (one server, the built app):
npm run serve                     # build + start on 127.0.0.1:4300
tailscale serve --bg 4300         # → https://<computer>.<tailnet>.ts.net

# or while developing (changes show up live):
npm run dev                       # Vite on 127.0.0.1:4200 (+ the API)
tailscale serve --bg 4200

tailscale serve status            # what's being served
tailscale serve reset             # stop it
```

(On Windows run `tailscale` in a normal terminal; on Linux use `sudo` or once
`sudo tailscale set --operator=$USER`.) On the iPhone open the `https://…ts.net`
address in **Safari** → **Share** → **Add to Home Screen**: the app starts
full-screen with its own icon. iOS keeps the icon it got when you added it —
after an icon change, remove the app from the home screen and add it again.

Without `serve` (plain `http://` straight to your computer's Tailscale IP —
`tailscale ip -4` shows it; no clipboard features): the app has to listen on
that IP, and the firewall has to let Tailscale addresses in on that port. On
Windows (PowerShell as administrator, once per port):

```powershell
New-NetFirewallRule -DisplayName "Confinium (Tailscale)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4200 -RemoteAddress 100.64.0.0/10
```

- **`npm run dev`** (port 4200): `$env:DEV_HOST="100.x.y.z"; npm run dev`,
  then open `http://100.x.y.z:4200` — on the phone and on the computer (the
  dev server now listens on that address instead of localhost). The API stays
  on 127.0.0.1; everything goes through the dev server.
- **`npm run serve`** (port 4300, use `-LocalPort 4300` in the rule):
  `$env:HOST="100.x.y.z"; npm run serve`, then open `http://100.x.y.z:4300`.

If it still doesn't open: once you clicked *Cancel* on Windows' "allow Node.js"
prompt, Windows keeps a **block** rule for Node.js, and blocks win over allow
rules — `Get-NetFirewallRule -DisplayName "*Node*" | Where-Object Action -eq Block`
shows it, `… | Disable-NetFirewallRule` turns it off. (Linux:
`sudo ufw allow in on tailscale0 to any port 4200 proto tcp`; macOS: allow
*node* when it asks.) In the shell, `$env:…` only lasts for that window.

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
├── plan/<id>/                      # projects (Work mode; stored as "plans")
    ├── banner.<ext>, avatar.<ext>  # Notion-style banner + profile image
    └── blocks/<blockId>/*          # one folder per content block
                                    # (moodboard images, files + example images)
├── client/<id>/                    # a client's logo + invoices/*.pdf
├── software/<id>/*                 # plugin installers + your own script files
├── mockup/<id>/                    # a mockup's screen pictures / videos, 2D pictures + thumb.webp
├── mockup-model/<id>/model.<ext>   # an imported 3D model (.glb / .gltf / .usdz)
└── mockup-hdri/<id>/env.<ext>      # your own HDRI (.hdr / .exr / panorama) + thumb
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
the app (no version = v1) contain records in older shapes — e.g. projects from
before content blocks, logos with light/dark variants or plain hex colour lists,
Software entries with separate scripts. The app reads all of these as-is, so
nothing changes after an update.

**Settings → Library → Migrate** rewrites them once into the current format
(v2). It is non-destructive: a copy of the current `db.json` is saved as
`data/backups/pre-migrate-v1-<time>.json` first, no files are moved or deleted,
and every file reference is kept. To undo, stop the app and copy that backup
over `data/db.json`.

Newer additions — project status and client, the briefing block, project templates
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
command palette that searches **across every section at once** — reference
titles, categories, tags and notes, colours (by hex), font sites, a video's
sections (type and note), and project names, clients, milestones, to-dos and
briefing answers. It also lets you **jump to any section** (or
Projects, Brand Tester, Trash) by name. Arrow keys to move, Enter to open, Esc to
close.

### Trash (recoverable deletes)

Deleting a **reference, project, gallery, software, project block** — or a **file from
a project's Files block** — moves it to **Trash** instead of removing it
immediately, and a toast offers a one-click **Undo**. Open Trash from the storage **⋯** menu (or
the palette) to **restore** items — files, example images and gallery
membership come back intact — or delete them permanently. Trash auto-empties
items older than **30 days**. (Trashed items live under `data/trash/` and are
excluded from exports.)

### Pictures from the app (everywhere)
Wherever a picture goes in — a banner or profile picture, a moodboard, a
note, a client's logo, a plugin's or expression group's preview, a mockup
screen or print, a storyboard frame, a new reference (logo, business card,
gallery, font screenshot, colour example, branding picture), a cover, the
example of a file, a logo in the Brand Tester, colours to extract from —
**From the app** sits next to **Upload** (and dropping a file). A render for a
review version (or a Motion reference's video) works the same way, videos only.
The picker shows, by tab:
- **Projects** — every project's profile picture, and the chosen project's
  banner, moodboards, files, storyboard frames and review renders;
- **Motion** — the videos, their covers, saved frames and moments;
- **Library** — every reference type's pictures, plus software pictures;
- **Work** — the **dashboard banner**, **clients' logos**, **notes' pictures**,
  **mockup previews** and what's **on mockup screens**;
- **Inbox** — shared pictures (and videos).

The picture is copied to its new place, so the original stays where it was.

### Settings

A **Settings** page (in the sidebar footer above Trash, the storage **⋯** menu,
or the palette) has a **Library** section — data-format migration, unused-file
cleanup and backups (see above) — and lists every **keyboard shortcut** — ⌘K search, the fullscreen
viewer's scroll-zoom / drag / arrows, Motion's `,` `.` frame stepping, reference
`←`/`→` navigation — plus per-browser **preferences**. The **video player
volume** (and mute) is remembered across reloads in this browser, and can be
reset from here. The **currency** (EUR, USD, GBP, CHF, JPY, CAD, AUD) is
what hourly rates, amounts in the Excel export and invoice sums are shown in.

---

## Modes: Work & Reference

A toggle switches between two modes:

- **Work** — the **default** mode (left in the toggle), your working area. It
  opens on a **Dashboard** and holds **Clients**, **Projects**, **Software**,
  the **To-Do board**, the **Brand Tester**, **Storyboards**, **Mockups**,
  the **Time Tracker**, **Notes**, **Content** and **Achievements** (see below).
- **Reference** — the library (Branding, Motion Design, Logos, Business Cards,
  Colors, Image Gallery, Fonts, Logo No Go).

**Naming:** in the app, *references* are the items of your library and
*projects* are your own work. Under the hood the names are older: references
are stored as `projects` in `db.json` (and open at `/project/…`), projects as
`plans` (at `/plan/…`) — so nothing had to be migrated when projects got
their name.

The app starts in Work, and switching from Reference back to Work always returns
to the Dashboard.

### Dashboard
The Work landing page, a Notion-style overview that moves a little:
- **Hero** over your banner — a greeting for the time of day, the date and a
  one-line summary, quick actions (**New project**, **To-dos**, **Search ⌘K**)
  and four glass tiles that count up: **open projects**, **dates in the next 7
  days**, **open to-dos** (the cards on the **To-Do board** only — a project's
  own checklists, like a template's to-do block, don't count; a ring shows how
  many are done, cards in a list called *Done* count as done) and **urgent**. A
  gradient banner drifts slowly, a picture banner zooms in very slowly. The
  banner is a preset gradient, an upload or a picture **from the app**.
Below it come **widgets you arrange yourself** — **Customize** (right above
them) lets you drag each one by its handle, make it half or full width, hide
it and show it again; your layout is saved. The widgets:
- **Today’s focus** — pin up to five to-dos (board cards or a project's to-dos)
  or write a new one (it becomes a card on the board) and tick them off right
  there: a card moves to your *Done* list, a project to-do gets its tick. A ring
  shows how far you are; ticked ones stay struck through until the next day.
- **Focus timer** — 25, 50 or 90 minutes of focus, then a short break (a long
  one after four sessions). It's one timer for the whole app: it keeps
  running when you go elsewhere, shows in the sidebar (the top bar on a
  phone) and in the tab's title, and chimes (plus a notification when the
  tab is in the background) when it's done. Finished sessions add focus
  minutes to *Your rhythm*. Your own lengths: **+** next to the presets
  takes minutes (`45`, `1:30`, `1h 30`) and adds a chip (up to four, × to
  remove, remembered per browser); or click the big time and type how long
  this round should be.
- **Continue where you left off** — the last projects, storyboards, mockups and
  references you changed, with a picture; a project opens at the block you
  edited.
- **Next up** — a big countdown to the next milestone or deadline (from every
  project that isn't delivered or archived), with its project and how far the project's
  timeframe has run; the following dates below. Next to it **Two weeks**: this
  week and the next as a calendar, a dot per milestone (◆ for a deadline) and
  a pink one for a **birthday** of one of your clients' contacts (hover for
  who and how old they turn); a day opens its project (or the client).
- **Urgent** to-dos from the board and every project.
- **Your tools** — Clients, Projects, To-Do Board, Storyboards, Mockups,
  Brand Tester, Software, Time Tracker, Notes, Content, Achievements — with a light that follows the pointer.
- **Pipeline** — your projects by status as one bar and per stage (Briefing →
  Concept → Design → Production → Review → Delivered); a stage opens the project
  list filtered to it.
- **Your rhythm** — a GitHub-style map of the last 26 weeks (15 on a phone):
  a square per day, dark → bright with how much you did — every save, and the
  references, projects, mockups and Inbox shares you added. Hover a day for its
  numbers (and focus minutes); beside it your current **streak**, **this
  week** and your **busiest weekday**. Saves are counted per day in `data/activity.json` (a
  small file of its own; the library database isn't touched), so the map
  fills up from the day you update.
- **Inspiration** — one reference from your own library at random, big;
  Motion references play on hover, **Shuffle** shows another, a click opens it.
  While customizing, its **⋯** picks where it draws from — tick the Reference
  sections that match your current focus (only Motion Design, or Branding &
  Logos…; each shows how many of its references have a picture). The widget
  then says so (“Inspiration · Motion Design”); **All sections** goes back to
  everything. The choice is saved with your layout.
- **Quick note** — a scratchpad for today's focus or an idea, saved as you
  type.
- **Achievements** — your rank (Stone 1 … Mythic 3) and XP, how many you've
  unlocked (and this year), open quests, the latest one and the one you're
  closest to; anything a number just unlocked shows on top.

Sections rise in one after the other; with *reduce motion* on in the system
nothing moves.

### To-Do board
A general **Kanban planner**. Lists (columns) hold **cards**; add lists and
cards, rename them inline, give cards **coloured tags**, tint a whole card in
one of the same colours, and **drag cards** (via the grip handle) within a list
or across lists to track progress. Each card's **⋯ menu** (it opens above everything, never cut off by the card) does the same without
dragging — **Move to “…”** any list, move up / down, mark urgent, colour, add a
tag, delete — which is how cards move on touch screens. On desktop the board
uses the **full width**, so extra lists run past the usual content margins; on
a phone every list is a full-width, swipeable page with **list tabs** above to
jump between them. Everything auto-saves to one global board.

A card can **belong to a project** (⋯ → **Link to project…**): it shows the project's
name (a click opens the project), the filter at the top shows **one project's cards**
(new cards then belong to it; it's always there — every project can be picked, the
ones with cards first, × shows all cards again), and the project lists its cards under **To-dos on
the board** — add one there (it lands in the first list), move it to another
list, give it a **colour** (the same as on the board), flag it urgent or
unlink it; those changes touch only that card. Urgent
cards on the Dashboard name their project.

### Clients
**Clients** (sidebar, above Projects) are who you work for — a client comes
back, you start a new project for them, and everything stays together.

- **The list** — each client with its logo (or initials on its colour), how
  many projects (and how many are open), this month's and all hours, open
  invoices and a birthday coming up.
- **A client's page**:
  - **Header** — the name (edit in place), logo and colour (click the
    logo), customer number, website, email and phone at a glance;
    **New project** (with the client already set), **Track time** (on the
    client itself, no project needed), and ⋯ **All time entries**,
    **Export hours (.xlsx)** (just this client) and **Delete**.
  - **Numbers** — hours in all and this month, open / all projects,
    deliverables delivered, tracked hours × rate, invoices open / paid.
  - **Projects** — every project of the client: status, dates, deliverables
    (“3/5 delivered”), hourly rate, and its hours — against its **budget**
    (“12.0 / 20 h”, amber from 80 %, red over it) or with the amount
    (hours × rate).
  - **Deliverables** — every deliverable of every project, by project,
    **Open / Delivered / All**; a click opens it in its project.
  - **Time** — hours per project (and without one) and the latest entries.
  - **Invoices** — drop or upload invoice **PDFs** (or a scan); give each a
    number, date, amount and project, tick **Paid**; the sums of open and
    paid invoices show on top. Deleting one goes to the Trash (Undo).
  - **Coming up** — milestones and deadlines of the open projects and your
    contacts' birthdays in the next weeks.
  - **Contacts** — the people you talk to: name, role, email, phone and
    **birthday** (it shows in the dashboard's calendar, with how old they turn).
  - **Details & billing** — customer number, VAT ID, email for invoices,
    phone, website, address and a billing address.
  - **Notes** — how they like to work, payment terms…
  Everything saves as you type.
- Deleting a client puts it (and its invoices) in the **Trash**; its projects
  stay, without a client, and its time keeps the client's name. Restoring it
  links everything again.

Clients are stored in `data/db.json` (`clients`), their logos and invoice PDFs
under `data/client/<id>/`. Libraries from before clients existed turn each
project's client name into a client on their own (the same name — in any
case — is one client), so nothing has to be typed again.

### Projects
Your projects (formerly *Plans*) — for a client or just for you. The
**Projects** page shows them **by client** (each client's projects together,
“Without a client” last, a **New project** tile in each group with that client
set) or **All** in one grid; the status chips filter both. Cards show the
hours tracked (against the budget, with a thin bar, when there is one).

- **Pin** the projects you're on right now — the pin on a card (on hover, or
  always on a phone), or the pin next to **Edit** on the project's page. Pinned
  projects stand in their own **Pinned** group at the top (in both views) and
  come first in every project list and picker (time tracker, pickers …).
- **Find** a project by name, client or status, filter by **client** (or
  “Without a client”) and by **status** (the chips count what's left after
  the other filters), and **sort** by **Recently added**, **Deadline**
  (soonest first, none last), **Start date**, **Name**, **Status** (pipeline
  order) or **Hours tracked**. The view and the sort are remembered; client and
  status sit in the address, so a filtered list can be bookmarked.

The **+** opens **New project**: give it a name, pick its **client** — one of
yours, **New client…** (type the name) or none — and choose what to start from —
- **Empty project** — a blank page,
- **Launch video** — briefing (product, audience, key message, CTA, target
  length, formats, tone, music & VO, must-haves, budget), a script (lines
  pre-labelled Hook → Logo outro), moodboard, references, styleframes,
  palette, a storyboard, a production checklist, a review block, a deliverables
  list (16:9 master, 9:16, 1:1, 4:5) plus milestones from kick-off to final
  delivery,
- **Branding** — briefing, research (references, competitors), moodboard, logo
  concepts, colour palette, typography, a checklist, a deliverables table and a
  brand-guidelines PDF block,
- **your own templates** — any project can be saved with **Edit → Save as
  template…**. A template keeps the blocks, text, to-dos (unticked), tables,
  script lines, storyboard shots (their text and timing) and briefing
  questions, and leaves out images, frames, tracks, files, dates and briefing
  answers.
  Saving under the name of an existing template updates it; delete one with
  its **×** in the New project dialog. The dialog remembers the last choice.

Projects are listed in a grid like galleries, with **status chips** above to show
one stage at a time (archived projects only show under **Archived**). Each
**project** has:
  - **To-dos on the board** — the To-Do board's cards linked to this project (see
    To-Do board),
  - a **status** — Briefing, Concept, Design, Production, Review, Delivered or
    Archived (or none) — picked from the pill under the project's name, next
    to its **client**: a chip with the client's logo; a click finds another
    client, creates one (“Create …”), opens the client's page or removes it,
  - a **Notion-style banner** — pick a **preset gradient**, upload a **custom
    image** or take one **from the app** — plus a **profile image** that can be an **emoji** (quick-pick grid
    or type/paste your own), an **uploaded image** or one from the app; both banner and profile
    also show on the project's card in the grid,
  - a **timeframe** (start / end date) with **checkable milestones** — each has a
    title, an optional date and a checkbox that strikes it through when done.
    In the header it's **one line** — “23 Sep – 16 Oct · 1/3 milestones ·
    next: Styleframes in 3 days” (with a red calendar when one is overdue);
    a click opens the dates and milestones to edit. Next to it a small
    **clock chip** shows the hours tracked on the project (a click opens the
    Time Tracker filtered to it), ▶ / ■ starts or stops tracking time on
    it (see [Time Tracker](#time-tracker)), and its gauge sets an optional
    **budget** — hours **for the project** or **per month** — and an optional
    **hourly rate**. With a budget the chip reads “12.0 / 20 h” (amber from
    80 %, red over it, with a thin bar); with a rate it adds the amount
    (“12.5 h · €1,062.50”); the rate also fills the Excel export's Amount
    column. The currency is set in Settings (EUR by default),
  - a stack of **content blocks** below the timeframe. A **new project is empty**;
    add blocks with **+ Add block** at the bottom, **drag them into place** by
    the handle left of each block (on a phone: the small pill on its top edge;
    a line shows where it lands; with the handle focused, ↑ / ↓ move it too) or
    use **Move up / down**, rename them, or remove them — each block has its
    own **⋯** menu.
    These block types are available:
    - **Briefing** — question → answer rows (rename, add or remove questions;
      answers grow as you type). The header counts answered questions, and
      **Copy** puts the whole briefing on the clipboard as text, e.g. to send
      to the client.
    - **Script** — two columns, **what we see | what we hear**. Each line shows
      when it starts and roughly how long its voice-over takes at the chosen
      **pace** (English 2.5, German 2.2, slow or fast words per second), and the
      total runs against a **target length** — the block's own, or the target
      length in the project's briefing. Text in [brackets] or (parentheses) is a
      direction and isn't counted; `[pause 1s]` adds a pause. **Copy** puts the
      script on the clipboard; the block's ⋯ **Storyboard from script** turns
      every line into a shot, timed by its voice-over.
    - **Storyboard** — in the project a **preview**: the frames in order (with
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
      **dropping** files onto the board, by **pasting** (⌘V) into the last-used
      board, or **From the app** — any picture already in the app (library,
      other projects, Motion frames, Inbox …), as many as you like.
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
      (references and galleries) via a search picker; they’re shown as the **same
      cards as in the library** (three across) and **jump to that item**, so a
      project can point back at the work it draws on. The other way round works
      too: every reference and gallery page has **Edit → Add to project…**, which
      puts it into the chosen project's References (a References block is added
      if the project has none; nothing is added twice).
    - **Palette** — a set of colour **swatches** (hex + optional name); add them
      by hand or **extract a palette from an uploaded image**, and copy any hex
      with one click.
    - **Heading** and **Divider** — lightweight structural blocks (an inline
      heading with an optional subtitle, and a horizontal rule) for organising
      longer projects.
    - **Table** — a small editable grid: rename columns, add/remove columns and
      rows, and any column whose values are all numeric gets an automatic
      **sum row** (handy for budget lines).

  Following the general rule below, a project's title and each block's name are only
  editable via a **⋯** menu — there is no bare Delete button.

**Tabs.** A project's blocks are grouped by phase in tabs under its header —
**Briefing**, **Concept**, **Production**, **Delivery** — each in its own
colour, with the number of blocks it holds; a dot marks the tab of the phase
the project's status says it's in. The Launch video template, for example, puts
the briefing in Briefing; moodboard, references, styleframes, palette and
links in Concept; script, storyboard and the checklist in Production; review,
deliverables and files in Delivery. Blocks made before tabs existed are placed
by their type (a heading goes with the block below it); **Move to …** in a
block's ⋯ menu puts it in another tab, **Move up / down** works within the tab,
and **Add block to …** adds to the open tab. A project opens on the tab you used
last (or its phase's, when that has blocks).

- **Overview** — the project at a glance: per phase a card for every block with
  content (its summary — “4/10 answered”, “6 images”, “2/8 done”, “v3 · 2 open
  comments”, “0/4 delivered” … — with a glimpse: thumbnails, swatches, the
  first answers, open to-dos, a progress bar; a links card lists each link
  once, by its label) and the blocks that are still
  empty as chips. A card or chip opens the block in its tab. The project's to-dos
  on the board are here too.
- **Empty blocks are one line** (“Styleframes — empty · drop or add images”)
  until you open them, so a fresh template stays short.
- **Every block folds** (⌃ next to its ⋯, or ⋯ → Fold) to one line with its
  summary and a glimpse of the content; **Fold all / Unfold all** does the
  whole tab. Folding is saved with the project.
- **Small blocks side by side**: palette, links and files stand two in a row
  on a wide screen; ⋯ → **Half width** / **Full width** changes it for any
  block (saved with the project).
- **Contents**: on a wide screen every block is listed at the right edge by
  tab — icon, name and where it stands (“empty”, “3/10 answered”, “2/8 done”
  …), the one in view highlighted; a click shows the block, switching tab and
  unfolding it. On smaller screens and phones the same list is **Jump to…**
  next to the tabs.

**Archive as reference.** When a job is done, **Edit → Archive as reference…**
turns it into references in your library, next to the work of others:
- the **final video** — a Review version (the last approved one is picked) or a
  video in a Files block — becomes a **Motion Design** reference with a cover
  frame, its format and length,
- the **images and PDFs** you tick — moodboards (boards named styleframes,
  logo, final, design, concept … are ticked from the start), PDF and Files
  blocks; tap a picture to leave it out — become one **Branding** reference,
- the **palette** becomes a **Colors** reference (with RGB, CMYK and Pantone).

Title, year and tags (the client and “Own work” to start with) are set in the
dialog, and the project can be set to **Archived** in the same step. The files are
**copied** — the project keeps everything. The project then shows **In your library**
chips linking to the new references, and each reference says **From project “…”**.

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

Banner, profile picture and the preview images of plugins and expression
groups can be uploaded or taken **from the app** (any picture already in it).

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
  project…** puts the file into a project; the **Save to project…** button saves the
  sheet (PNG) into a project's moodboard (an existing one, or a new “Brand tests”
  board). Nothing else is stored; the settings are remembered for the session
  (and the export choices on this device).

### Storyboards
**Storyboards** (sidebar, under the Brand Tester) lists the storyboards of all
your projects — frames, format, length, section colours and project — searchable.
**New storyboard** asks for the project (or makes a new project, with client, in the
same step), a starting point and the format:
- **Empty**,
- **Launch video · 30 s** — Hook → Problem → Product reveal → Features →
  Proof → Call to action → Logo outro, 11 shots with suggested timings,
- **Social cut · 15 s · 9:16** and **Logo sting · 5 s**.

A storyboard is stored in its project (as its storyboard block), so the project and
the Storyboards page always show the same thing.

**The editor** (a page of its own; ← goes back to the project):
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
  Each shot's ⋯ menu: new or replaced frame, draw or sketch over, play from
  here, insert after, duplicate, move earlier / later, delete (with Undo).
- **Move shots by dragging** — the grip at a panel's top right (grid), next
  to the thumbnail (list), or the shot itself on the timeline.
- **Draw** a frame right in the app: *Draw* on an empty shot, the pencil on a
  frame (**sketch over it**) or ⋯ → *Draw a new shot*. Pen (pressure-sensitive
  with a stylus), marker and eraser, colours and sizes, undo / redo; the
  frame underneath can be shown or hidden. The drawing becomes the frame.
- **Variants**: a frame that's replaced — by an upload, a drop, the library or
  a drawing — isn't lost: it stays with the shot as a **variant** (small
  thumbnails under the frame; a click swaps it back in). ⋯ → *Remove frame*
  keeps it as a variant too; *Delete the other versions* clears them.
- **Record the voice-over** of a shot with the microphone (under its
  voice-over text): listen, record again, remove; if it's longer than the
  shot, **Fit shot** makes the shot as long. Recordings play in the animatic
  from the shot's start, show as a purple bar on the timeline and go into
  the exported video.
- **Cuts on the beat**: with a music track, **Find the beat** reads its tempo
  (BPM) and where the first beat falls — or type the BPM yourself. The
  timeline shows the beats (a brighter line every bar); with the magnet on,
  dragging a shot's edge **snaps to the beat** (Alt for free), and **Cuts on
  the beat** moves every cut to its nearest beat.
- **Cutdowns** — shorter versions of the same storyboard (*+ Cutdown* → 6 s,
  10 s, 15 s … or half as long): every shot starts shortened evenly; untick
  **In cut** to leave shots out and give the others more time, and change any
  shot's length in the cut (its master length stays). Frames and texts are
  shared with the master; the strip, the timeline, the target, the animatic
  and the video follow the version you pick. Rename, duplicate or delete a
  cutdown from its ⋯.
- **Three views**: **Grid** (panels), **List** (a table with every field — good
  for writing; cards on a phone) and **Timeline** (shots as long as they last
  on a time axis, the sections above and the track's waveform below; **drag a
  shot's right edge** to change its duration, zoom in / out / fit; the shot
  you click is edited below). The view is remembered.
- **Frames**: **Upload frames** (one shot each), **drop** images anywhere
  (on a shot: replaces its frame), **paste** an image, or **From library**:
  the project's moodboard / files images or the **frames and moments saved on
  your Motion references** (searchable; the shot's note then says where it
  came from). Pictures are copied into the storyboard.
- **Animatic** — as before, now also showing the on-screen text as a super,
  and playing the recorded voice-overs.
- **Video** — the animatic as an **MP4** or **WebM** (720p, 1080p, 4K or your
  size; 24 / 25 / 30 fps): every frame for its duration, a dissolve where the
  transition is a dissolve / fade, the on-screen text (optional), the
  voice-over as captions and shot numbers (optional), the music (with its
  volume) and the recorded voice-overs mixed underneath — rendered frame by
  frame, so it's smooth on any computer.
- **PDF** — A4 landscape for the client: **large** (three shots a page, frame
  left, text right) or **compact** (six a page; upright formats 4 / 6), with
  the fields you tick (voice-over, on-screen text, camera, sound, notes,
  status), project, client, date and page numbers. It goes through the browser's
  print dialog — choose **Save as PDF**.
- ⋯ **Copy as 9:16 / 1:1 / 4:5 / 16:9 version** — a copy (frames, variants,
  voice-overs, track, beat and cutdowns included) to rework for another
  format; **Delete storyboard** (→ Trash).

### Mockups
**Mockups** (sidebar, under Storyboards) puts your designs and videos on
**your own 3D models** and on **branding objects** (business card, poster,
box, mug) — rendered live in the browser (three.js), no plugins, nothing
online — or into **2D mockups**: a browser window, an app icon, profile
pictures and look-alikes of Instagram, X, YouTube and LinkedIn pages.
**New mockup** offers all of them: *3D · ‹your model›*, *3D · Import a
model…*, *3D · Business card / Poster / Box / Mug* or *2D · ‹type›*.

#### 3D mockups
- **Your models**: import a **.glb**, a single-file **.gltf** or a **.usdz**
  (on the Mockups page or in the editor) — USDZ is the format Apple uses for
  its 3D / AR product models. Check the licence of any model you use in client
  work. Rigged models (parts bound to bones) come in exactly as they sit in
  Blender — logos and other parts stay where they belong.
  **Screen part** picks the part that shows your picture (a part named
  *Screen* / *Display* is picked for you); **Turn picture** and **Mirror** fix
  its orientation, **Size** sets how big it stands (cm). **Show logo** hides /
  shows the logo parts (named like *Logo*), **Parts** lists every part to show
  or hide. Deleting a model moves it to Trash.
- **Opening / closing** (a laptop lid, a case, a door): if your model has a
  hinge — an **empty** or bone the lid hangs from, like a circle empty
  *Rotate Screen* in Blender — it is found for you and shows up as **Opens /
  closes with**. **Open** turns it (0° = as modelled); **Axis** and **Flip**
  fix it if it turns the wrong way. Pick *— nothing —* for models without one.
- **Several models in one scene** — **Add** one (e.g. a phone in front of a
  laptop), click it in the view or the list to select it, **drag it** to move
  it on the floor, **Turn** it, **Duplicate** / **Remove** it (with Undo), or
  **Arrange** them: side by side, the big one behind with the others in
  front, or a cascade.
- **Screen**: **upload** a picture or a video, or take one **from the app** —
  your projects' **profile pictures and banners**, a project's moodboards, files,
  storyboard frames and review renders, your Motion references (the video,
  its saved frames, moments and cover), the whole library by type (branding,
  logos with their dark / light versions, business cards front and back,
  image gallery, font screenshots, colour examples, logo no-go), software
  pictures or the Inbox. **Fill screen**
  crops to fit, **Show whole** keeps it all.
  **Glass**: the screen sits behind a cover glass that reflects the room —
  the light setup's soft boxes, windows or your HDRI, faint straight on and
  stronger at a slant, plus a soft sheen from behind the camera that sweeps
  across as the device turns (**Turn light** moves the reflections too).
  **Glossy**, **Anti-glare** (a soft haze, like a nano-texture display) or
  **Off**; **Reflections** sets how much (50% ≈ real glass). Even a big soft
  box stays a veil over the design, never a white-out.
  For a video, **Starts at** picks the part that plays (also by dragging its
  clip in the timeline) and **Sound on** plays its sound — in the preview and
  in the exported video, with its own volume.
- **Position & size…** opens the screen as you see it — its real shape, over a
  **grid** (thirds, fine or off). Drag the picture to move it, scroll / pinch /
  drag a corner to resize it, nudge it with the arrow keys; it **snaps** to the
  middle and the edges, and the 3D view follows live. **Behind** puts a
  checkerboard, light, grey or dark backdrop behind the picture — a black logo
  on transparent stays visible.
- **Light**: seven setups, each a studio-made **environment** (a soft-box
  studio, a dark product stage, a daylight room with windows, a golden-hour
  terrace, an overcast sky, an office with ceiling panels, a neon-lit night
  street — all generated in the app, nothing downloaded) that the models
  reflect, plus matching key / fill / rim lights. **Import HDRI…** adds your
  own: an **.hdr** or **.exr**, or a 2:1 panorama picture (.jpg / .png /
  .webp). It's read in the browser first — its overall brightness is levelled
  to a studio-like exposure and its brightest spot (the sun, a window) becomes
  the key light that casts the sun shadow — then kept in your library with a
  small preview (Mockups page → *Your HDRIs*, delete → Trash). **Turn light**
  rotates it around the scene, **Brightness** sets the exposure, **Look** how the
  picture is developed: **Neutral** (the default — screens, prints and brand
  colours stay true), **Filmic** (more contrast) or **Soft** (AgX, gentle
  highlights). **Shadow**: **Soft**
  (a contact shadow as under a soft box), **Sun** (a sharp one from the key
  light), **Both** or **None**, with its **Strength**.
- **Camera**: drag to turn, scroll / pinch to zoom, right-drag to move — or a
  view: **Front, ¾ left, ¾ right, Low hero, From above, Side, Back**.
- **Look**: format **16:9, 4:5, 1:1, 9:16, 3:2**; background **none**
  (transparent), a **colour**, a **gradient** — with your **brand colours**
  from the Colors library one click away — or the **Room** of the light setup
  (your HDRI too), with **Room blur** from sharp to soft.
- **Timeline** (under the view): **Play** / pause (Space), scrub, **Length**
  1–60 s. **Camera**: set a view, press ◆+ to keep it as a key, move the
  playhead, change the view, press it again — the camera glides between the
  keys (**Smooth** or **Even**). **Camera move** adds a ready-made one (Orbit,
  Push in, Pull out, Reveal, Rise); **Motion** lets the models turn
  (Turntable 360°), **Sway** or **Float**. Every hinge gets its own track —
  keys for the lid opening and closing (once it has keys, moving **Open** sets
  a key at the playhead). Drag keys to move them, Delete removes the selected one.
  Screen videos show as clips you slide to pick the part that plays.
- **Export…**: an **image** — 1080 / Full HD / 2.5K / 4K / 8K or your own
  size, background as in the scene, **transparent**, white, black or any
  colour, **PNG, JPG or WebP** (with quality) and a file name — or a **video**
  of the timeline: 720p–4K, 24 / 30 / 60 fps, **MP4** (H.264 + AAC) or
  **WebM** (VP9 + Opus), rendered frame by frame so it's smooth on any
  computer, with the screen videos' sound where it is on (MP4 where the
  browser can encode it — Chrome, Edge, Safari). Exports are drawn larger and
  scaled down (**supersampling**: up to 2× — a 4K picture from about 5.4K, a
  1080p video from 4K) for clean edges and fine lines. **Save to project** puts the
  file into a “Mockups” moodboard of any project (or a new one); the quick
  **Save to project** button saves a 4K PNG.
- **The built-in devices are gone** (iPhone, iPad, MacBook … drawn by the app)
  in favour of your own models. Scenes made with them still open — each old
  device as a plain screen of its size with your picture on it — so you can
  pick one of your models for it; nothing in the scene is lost. Their old
  animations (orbit, push in, reveal) became camera keys.

#### Branding objects (3D)
Plain shapes at their real sizes, lit by the same light setups / HDRIs and
shadows as the models; **Add** puts one next to your devices, or start a
mockup with one. Under **Print** each object lists its printed faces — click
one, then **Upload** / **From the app**, **Position & size…**, **Fill** or
**Show whole** (the default, so a logo isn't cropped). A PNG with
transparency prints straight onto the paper / ceramic colour — a logo alone
looks printed.
- **Business card**: 85 × 55 mm, 3.5 × 2 in or square, landscape or portrait,
  square or rounded corners; *One card*, *Front + back* side by side, or a
  *Stack* with one card turned over; matte, silk or gloss; any card colour.
- **Poster**: A4–A1, 50 × 70, 18 × 24 in or 24 × 36 in, portrait or
  landscape; no frame or a black, white, oak or aluminium frame with glass
  and an optional passe-partout; hanging *on the wall*, *leaning* against it
  or *standing*; wall and paper colours.
- **Box**: your width × height × depth in cm; front, sides, top and back
  printed separately; white card, kraft or black board; matte, silk or gloss.
- **Mug**: a print on the front or all round (but the handle); mug and
  inside colours; glossy glaze.

#### 2D mockups
- **Browser window** (light / dark: tab with your title and icon, the address
  bar, the page in 16:10, 16:9, 4:3 or 3:2), **Instagram post** (square,
  portrait or landscape picture, likes, caption, comments, verified, liked /
  saved, carousel dots, sponsored), **Instagram story** (story parts, reply
  bar), **Instagram profile** (stats, bio, link, highlights, a 3 × 3 grid in
  3:4 or square), **X post** (1–4 pictures laid out like X does, replies /
  reposts / likes / views) and **X profile** (header, bio, location, website,
  joined, follower counts) — light, dim and dark where the app has them.
- **App icon**: your icon on a phone home screen among neutral stand-ins
  (app name, notification badge, in the dock too, your own wallpaper or a
  soft gradient) — or *at every size* it's shown (180 → 29 px, and round).
- **Profile pictures**: your logo as a profile picture from big to tiny
  (feed, comment, mention, 16 px), round and as rounded squares, on white,
  black, your colour or nothing, with a story ring if you like.
- **YouTube channel** (banner, profile picture, name, handle, subscribers,
  description, four video thumbnails with titles) and **LinkedIn page**
  (cover, logo, tagline, industry, followers, a post with a picture).
  These are look-alikes drawn by this app for presentations; nothing is
  posted anywhere.
- **Click a picture** in the preview (or in the **Pictures** list) to upload
  one or take it **from the app** (a project's profile picture fits a profile
  picture slot); **Position & size…** places it in its frame over a grid, as
  for the 3D screens.
  A **video** in a slot can be **paused**, and plays **with sound** (and its
  own volume) when you switch it on; it stops as soon as you leave the
  editor or remove it.
- **Zoom** into the preview: − / + / 100 % at the bottom right, ⌘ / Ctrl +
  scroll or pinch; zoomed in, drag (or scroll) to move around. Texts, numbers and switches are
  in **Content**; switching the type keeps what you typed.
- **Look**: format **Fit** (the mockup with space around it) or 16:9, 4:5,
  1:1, 9:16, 3:2; background none / colour / gradient (brand colours at
  hand); **Space**, **Size** and a **soft shadow**.
- **Export…** as PNG / JPG / WebP at 1×–4× (Fit) or 1080–4K, transparent,
  white, black, any colour or as set — or **Save to project**.

Everything **saves as you go**; the list shows a small picture of each mockup.
⋯ **Duplicate** / **Delete** (→ Trash, with Undo).

### Time Tracker
**Time Tracker** (sidebar, under Mockups) logs your working hours per project
and client.

- **Live tracking** — pick a **project** (grouped by client), a **client
  without a project** (“Acme — no project”, e.g. a meeting) or type any
  other name, an **activity** (Design, Animation, Storyboard,
  After Effects, Website, Meeting, Research, Admin — add your own with **+**)
  and what you're doing, then **Start**. While it runs a pill with the time
  shows in the sidebar (the top bar on a phone) on every page; project,
  activity, details and even the **start time** (forgot to press start?) can
  be changed on the way. **Stop** saves an entry, **✕** throws it away, and
  anything under a minute isn't saved. The running tracker lives on the
  server, so it keeps going when you close the tab or switch devices.
  Times are your browser's local time; a session over midnight is fine.
- **From the project or client** — the clock chip in a project's header starts
  / stops the tracker for that project and shows its hours (or its budget);
  **Track time** on a client's page tracks time for the client itself.
- **Entries** — grouped by day with a daily total. **+ Add entry** for time
  you didn't track live; every entry can be edited in place (date, from, to
  with the duration shown as you go, project, activity, details), **Again
  today** copies it to today to adjust, **Open the project** / **Open the
  client** jump there, and **Delete** goes to the Trash (Undo).
- **Overview** — today, this week, this month and the filtered total; filter
  by **period** (this / last week, this / last month, all, or your own dates),
  **client**, **project** and **activity**, with bars per project and a split
  by activity.
- **Export to Excel** — a real `.xlsx` like a classic time sheet:
  Date, Start, End, Duration (h), **Client**, **Project**, Activity, Details &
  results — plus **Rate** and **Amount** (hours × rate, as a formula) when a
  project has an hourly rate. The header is **frozen** and has **filter
  buttons**; client, project and activity cells have **drop-downs** (from a
  hidden list sheet) so new rows can be typed in Excel — they offer only the
  clients, projects and activities **in this export** (one project's sheet:
  that project, its client and the activities done on it); durations are
  **formulas** (overnight works) and the totals at the bottom follow the
  filter (`SUBTOTAL`). A second **Summary** sheet sums hours (and amounts)
  per client, per project, per activity and per month (`SUMIFS` formulas, so
  edits in the log update it). Headings in **German** or
  **English**; the look **like the app** (dark header, teal line) or
  **classic blue**. The export takes the current filters (the dialog says
  which, the summary sheet too, and the file is named after them, e.g.
  `Zeiterfassung_Acme_Launch-film_2026-09-01_2026-09-30.xlsx`), and your
  choices are remembered. Opens in Excel, Numbers, LibreOffice and Google Sheets.

Entries are stored in `data/db.json` (`timeEntries`), so they're part of the
library export / import.

### Notes
**Notes** (sidebar, under Time Tracker) is for everything that isn't a
project, a to-do or a reference — ideas, notes from a call, prices, a list of
fonts to try.

- **The list** — every note as a card with its title, the first lines and the
  first picture as a cover; **pinned** notes on top, then the one you changed
  last. The search box filters by title and text (⌘K finds notes too).
- **A note** — a title and the text, saved as you type. **Pin** it, give it a
  **colour** (the card and the sheet take its tint) or **delete** it (Trash,
  with Undo). A “New note” you leave without writing anything simply goes
  away.
- **Pictures** — **upload** them, **paste** one anywhere on the page
  (⌘V / Ctrl-V — a screenshot straight from the clipboard), **drop** files on
  the page or take one that's **already in the app** (a reference, a mockup
  render…). A click opens a picture big; drag them to reorder; **✕** removes
  one (Trash, with Undo — it comes back in the same place).

Notes are stored in `data/db.json` (`notes`), their pictures in
`data/note/<id>/images/`, so both are part of the library export / import.

### Content
**Content** (sidebar, under Notes) is where you plan posts for **Instagram**,
**TikTok / Reels** and **X** (YouTube and LinkedIn too) — from the idea to the
numbers.

- **Board** — a column per stage: **Ideas → Script → In production →
  Scheduled → Posted**. Drag a post to the next stage; type a **quick idea**
  into the Ideas column (Enter) to catch it without leaving the page; **+** in a
  column starts a post in that stage. A card shows the cover, the hook, the
  platforms, the format and the day (orange once the day has passed and it
  isn't out yet; views and likes once it's posted).
- **Calendar** — the month from Monday: drag a post to another day, **+** on a
  day plans one for it, a click on a day lists its posts underneath. **Not
  scheduled** on the side holds the ones without a day — drag them onto the
  calendar, or back to unschedule. On a phone the days show dots and the list
  of the day you tap.
- **List** — every post in plan order (next ones first, posted ones last) with
  its stage to change right there.
- On top: ideas, posts in the works, the next 7 days, posted this month and
  the **next post** to go out; filter by **platform** and search the text.
- **A post** — the stage, a title, the **platforms** and the **format** (Reel /
  Short, Post, Carousel, Story, Text, Thread, Video — with a hint for its
  size), the day and time it goes out, the **hook** (the first second / line),
  the **caption** and **hashtags** — counted against each platform's limit
  (Instagram 2,200, X 280, …; a hint past 5 hashtags on Instagram) with a
  **Copy** button for caption + hashtags — a **script** (shots, voice-over,
  on-screen text, sound) and the **project** it shows. Once it's **posted**:
  the link and its numbers (views, likes, comments, shares, saves, new
  followers).
- **Pictures and videos** — upload, paste, drop or take them **from the app**;
  drag to reorder (the first is the cover, shown in a preview in the post's
  format). **Duplicate** plans the same idea again (without its numbers);
  **delete** goes to the Trash (with Undo). A “New post” you leave empty simply
  goes away. ⌘K finds posts.

Posts are stored in `data/db.json` (`content`), their pictures and videos in
`data/content/<id>/media/`.

### Achievements
**Achievements** (sidebar, under Content) turns your milestones into
collectible cards — a paper card in a frame of its **rarity**, a round
**badge** (a short text like “10K”, a symbol or your own picture), the name,
what it takes and the day you reached it. Ones you haven't reached yet stay
grey and faint (with a lock on the badge) and show how far you are.
**Diamond**, **Mythic**, **Quest** and **Dream quest** cards shimmer with an
animated **holo** sheen once reached (a glare and a slight tilt follow the
pointer; still when the system asks for reduced motion).

- **Rarity = XP**: Stone 10 · Bronze 25 · Silver 50 · Gold 100 · Emerald 200 ·
  Diamond 400 · Mythic 800 · Quest 150 · Dream quest 300. Reached ones add up
  to your **rank** — **Stone 1–3, Bronze 1–3, Silver, Gold, Emerald, Diamond,
  Mythic 1–3** (Stone 2 at 100 XP, Stone 3 at 300, Bronze 1 at 600 … Mythic 3
  at 21,000) — shown as an emblem with the XP bar and how many of each rarity
  you have.
- **Your numbers** — a tile per number: your **followers** on Instagram,
  TikTok, X and YouTube (you keep them up to date) and your work — **biggest
  single deal** (your invoices), **revenue paid**, **clients**, **client projects
  delivered** and **posts** published in Content. Clients and client projects
  are counted apart. Each tile shows the total and where it comes from (e.g.
  “95 before the app + 3 delivered in the app”) and the next milestone on it.
  Click a number to change it (for your work: what came **before the app**);
  while you type, the tile lists what it would unlock — **Enter** saves and
  unlocks them (dated today; change a day on the card if you know it).
  Reached ones never lock again.
- **New series** — several milestones on one number in one go: pick what it
  counts (e.g. TikTok followers), the group, a name pattern (`{n}` = 2K,
  `{N}` = 2,000), and the steps, each with its rarity (rising from Stone by
  default). Steps you already have are skipped; the ones your number already
  reaches unlock right away.
- **New achievement** (or **Add to …** in a group) opens the editor with the
  card as it will look — name, what it takes, **group**, **rarity**, the badge,
  an optional **sticker** (an event's or a client's logo on the corner; upload
  or from the app), a number it unlocks at, and the day it was reached. It
  suggests quests that fit the work (showreel, returning client, referral,
  retainer, a higher rate, a viral post, featured, a talk, your own product,
  an award). Delete goes to the Trash (with Undo).
- Unlocking — by a number or by hand — gets its moment: the card flips in
  with its XP (and your new rank, if there is one).
- The **dashboard** has an **Achievements** widget: your rank and XP, how many
  you have (and this year), open quests, the latest one you reached and the one
  you're closest to.

Achievements are stored in `data/db.json` (`achievements`, your numbers in
`achievementStats`), their pictures in `data/achievement/<id>/`.

### Inbox (share from your phone)
Everything you come across on the go — a screenshot, a screen recording, an
Instagram / Behance / YouTube link, a quick idea — goes into the **Inbox**
(top of the sidebar, with a count of what's waiting; on a phone a dot on the
menu button). There you sort each item:
- **into the library** — an image becomes a new **Branding**, **Image
  gallery**, **Logo**, **Logo No Go**, **Colors** (from the image) or **Font**
  entry, a video or a **YouTube / Vimeo link** a **Motion** reference, a PDF a
  **Branding** reference. The usual add dialog opens with everything filled in;
  select several pictures to make **one** Branding reference (or gallery images)
  of them,
- **into a project** — images go to its first moodboard, PDFs to a PDF (or Files)
  block, other files to a Files block, links to a Links block and notes to a
  Text block (each made when the project has none),
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
cover** thumbnail. Tag each reference by **color scheme** and **type** (tech,
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

On a reference you get:
- a **player** (its **volume / mute is remembered** across reloads) with notes
  (auto-saved) and **tags** (used for filtering),
- an automatic **length tag** — `≤ 30s`, `30–60s`, `60–90s`, `> 90s` — and a
  **format tag** (`16:9`, `9:16`, `1:1`, `4:5`, `4:3`, `21:9`) read from the
  video, both usable as filters; the format and resolution (4K / 1080p / 720p)
  also show under the player and as a badge on the card. Videos added before
  this are measured once in the background when you open Motion Design,
- the **audio waveform** under the section bar (see the cuts land on the beat;
  click or drag to scrub). It's read once in the browser and stored with the
  reference; for files over 150 MB it's read when you ask for it. Videos without
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
  are stored as **WebP** in the reference folder. While paused, step **frame by
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
plus a **3D view** (three.js, loaded only there): the card at its real size
and thickness with your front and back printed on it, in soft studio light,
floating over its own shadow (upright when the design is). **Drag** to turn it
— it swings on a little when you let go; on a desktop it leans towards the
pointer — **double-click** or **Show back / Show front** flips it, **Reset**
brings it back. **Paper** sets the finish (**matte** with a fine paper grain,
**silk**, **gloss** with a lacquer that catches the light), the thickness
(0.4 / 0.8 / 1.4 mm), the **edge** (paper white, black, **gold** or **silver
foil**, or the design's own colour) and **square or round corners** — saved
with the card (`paper` in `db.json`). **↓** saves the view as a transparent PNG.

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
references of that section via a picker. A reference can be in several galleries;
deleting a reference removes it from its galleries automatically. Galleries are
just references — deleting a gallery never deletes the references.

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
**Clients**, **Projects**, **Software**, **To-Dos**, **Brand Tester**,
**Storyboards**, **Mockups**, **Time Tracker**, **Notes**, **Content** and **Achievements**; a running focus timer or time tracker shows
as a small pill under the search.
The collapse button folds the sidebar into a slim **rail of icons** (names show
as tooltips; Work and Reference stand one above the other) for a wider canvas;
the button at its top unfolds it again, and the choice is remembered.

Below 900 px (phones, tablets) the **same sidebar** becomes a **drawer**: a
slim top bar shows **☰**, the page title, search and add; ☰ slides the sidebar
in with everything above (both modes, Settings, Trash, storage). The top bar
hides while you scroll down and returns when you scroll up.

On **touch screens**:
- menus (⋯, Edit, Export…) open as **bottom sheets** with big rows, and
  dialogs (Add reference, Edit details…) slide up from the bottom with **Save**
  always in reach;
- every control that appears on mouse-hover on desktop (block menus, Add block,
  banner / avatar change, image ⋯ menus, delete buttons) is always visible;
- input fields use 16 px text so iPhones don't zoom in when you tap them;
- grids show **two columns**, filter chips are one swipeable row.

On desktop, block menus and “Add block” stay faintly visible instead of
appearing only on hover, and **Tab** shows a clear focus ring for keyboard use.

A reference's detail page has **Previous / Next** buttons at the foot (and the
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

- **Fonts:** DM Sans is self-hosted via `@fontsource/dm-sans` (no Google Fonts CDN);
  running timers (focus timer, time tracker, their pills) use JetBrains Mono
  (`@fontsource/jetbrains-mono`) so the digits don't jump as they count.
- **Icons:** [lucide](https://lucide.dev) via `lucide-react`, bundled locally.
- **PDF rendering:** `pdfjs-dist` with a locally-bundled worker.

Nothing is fetched from a third-party CDN at runtime. The one exception is
what you ask for yourself: a **YouTube / Vimeo link** plays in their embedded
player, and its title and cover are looked up once when you save it (turn the
lookup off with `LINK_LOOKUP=off`).

---

## Tech

- **Frontend:** React 18 + Vite + React Router; three.js for the 3D mockups
  (loaded only by the mockup editor), Mediabunny to write MP4 / WebM (loaded
  only when a video is exported) and modern-screenshot to turn the 2D mockups
  into images.
- **Backend:** a small Express server that stores files on disk and metadata in
  `data/db.json` (writes are serialized so nothing clobbers). Layout:

  ```
  server/
  ├── index.js        # entry: start, listen, graceful shutdown
  ├── app.js          # middleware + routes
  ├── config.js       # paths, ports, env vars
  ├── db.js           # atomic writes, self-healing reads, snapshots, write queue
  ├── schema.js       # record shapes, read-time normalizing, the v1→v2 migration
  ├── templates.js    # built-in project templates, save-as-template
  ├── files.js        # fs helpers (path containment, moves, trash, storage size)
  ├── http.js         # async-safe routers, JSON errors, host/CSRF/data guards
  ├── upload.js       # multer (per-request tmp folder, always cleaned up)
  ├── unused.js       # unused-file scan
  ├── zip.js          # dependency-free ZIP64 export/import
  ├── xlsx.js         # dependency-free .xlsx writer (time sheet export)
  ├── achievements.js # what achievements unlock from, quest ideas
  └── routes/         # projects (references), projects (projects), clients, software, board, mockups, time, notes, content, achievements, trash, search, settings, library, maintenance
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
