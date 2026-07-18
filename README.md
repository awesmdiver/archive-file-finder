# Archive File Finder

Finds which of your downloaded (still-zipped) Skyrim mod archives contain a
patch for a mod you just installed — without extracting every archive by
hand. Scans every `.zip` / `.7z` / `.rar` in a folder you point it at (your
Vortex/Mod Organizer downloads folder, or any folder of mod archives), lists
each archive's contents via 7-Zip (no full extraction needed), records every
file matching a configurable extension list (default just `.esp`) into a
local SQLite database, and lets you search across all of them by mod name.
Selected files can then be extracted straight from their source archive into
a destination folder of your choice.

Example: install *Lanterns of Skyrim II*, then search "lanterns of skyrim"
— every patch `.esp` for it sitting inside any downloaded archive (e.g.
`COTN Dawnstar - Lanterns of Skyrim II Patch.esp` inside `COTN Dawnstar
Patch Collection.7z`) shows up, ready to select and extract.

## Requirements

- Windows (the folder picker and the bundled 7-Zip path both assume it;
  everything else is plain Node.js).
- Node.js 22.5+ (uses the built-in `node:sqlite` module — no `npm install`
  needed, zero dependencies) and 7-Zip. **Don't have these? See below —
  `install.bat` gets them for you.**

## Setup and running (no command line needed)

Three double-clickable files, no PowerShell or Node.js knowledge required:

1. **`install.bat`** — checks whether Node.js and 7-Zip (both required) are
   already on your computer, plus PowerShell 7 (optional — see "Dark mode"
   below). If anything's missing, it offers to install it for you (via
   [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/),
   which ships with modern Windows) — it always asks before installing
   anything. If winget isn't available on your computer, it opens the
   official download page instead so you can install it by hand. Safe to
   run again any time; it only reports what's already installed if nothing's
   missing.
2. **`start.bat`** — launches the app and opens it in your browser at
   http://localhost:4173. A console window stays open while it runs — that
   window staying open **is** how you know the server is running; don't
   close it while you're using the app. If Node.js or 7-Zip aren't
   installed yet, it'll tell you to run `install.bat` first instead of
   failing with a cryptic error.
3. **`stop.bat`** — shuts the server down cleanly (equivalent to closing
   the `start.bat` window, but usable from anywhere). Prints what happened
   and waits for a key press so the window doesn't flash and disappear
   before you can read it.

All three are thin wrappers around the `.ps1` scripts of the same name
(`install.ps1`, `start.ps1`, `stop.ps1`) — the `.bat` files just run them
with PowerShell's execution-policy restriction bypassed for that one call,
so double-clicking works without anyone needing to change a system setting
first. If you're comfortable with PowerShell directly, `powershell -File
start.ps1` works the same way.

**Why a clean stop matters**: a clean shutdown flushes SQLite's write-ahead
log to disk; an unclean kill (Task Manager, `taskkill /F`) can drop the last
few not-yet-checkpointed writes. `stop.bat`, Ctrl+C in the console window,
and clicking the window's **X** button are all equally clean — closing the
window sends Windows' `SIGHUP` to the server rather than just yanking it,
and it's handled the same as Ctrl+C (verified: watched the database's
write-ahead-log files get cleanly merged away after clicking X for real).
Only Task Manager / `taskkill /F` skip that handling.

## First-time setup

Nothing is pre-filled — a fresh clone has no scan folder, no extraction
destination, and no indexed data (the local database lives in `data/`,
which is gitignored and never shipped). On first launch:

1. Open **Settings**. Click **Browse…** next to *Scan folder* and pick the
   folder where your mod manager keeps downloaded archives (Vortex's
   default is inside its install folder, unless you changed it — Mod
   Organizer 2 has its own configurable downloads folder). Click
   **Browse…** next to *Default extraction destination* and pick (or
   create) a folder to extract files into.
2. Leave *File extensions to index* as `.esp`, or add more (`.esl`, `.esm`,
   etc.) — see "Changing the extension list later" below.
3. Click **Save & Rescan Folder**. For a few thousand archives this takes a
   few minutes the first time (7-Zip only reads each archive's header, not
   its compressed data, so it's fast — but there are a lot of archives to
   get through).

## Usage

1. **Settings panel**: the scan folder, the default extraction destination,
   and the list of extensions to index. Each has a **Browse…** button that
   opens a native folder picker instead of typing a path by hand.
   - **Save & Rescan Folder** saves whatever's currently in the form, then
     rescans against it — this is the one you'll normally use, since it
     can never scan against a stale, unsaved value.
   - **Save Settings Only** saves without rescanning, for when you're just
     changing the extraction destination and don't want to kick off a full
     rescan for no reason.
   Rescans are *incremental*: new archives on disk get indexed, archives
   whose size/date haven't changed since the last scan are skipped (fast),
   and archives deleted from the downloads folder are removed from the
   index automatically.
2. Pick a search mode, then type a mod name in **Search** (or press Enter,
   or click **Search**):
   - **Find individual files** — matches indexed file names only (e.g. the
     `.esp` itself), not the archive it's sitting in. Searching "lanterns
     of skyrim" returns only patches whose own file name mentions it, not
     every file inside an archive that happens to be named "Lanterns Of
     Skyrim II - FOMOD.7z". If an archive has more than one matching file,
     the results collapse into a single "N matching files" row — its
     checkbox selects/deselects all of them at once, or click the text to
     expand and pick individual files within it.
   - **Display Archive** — matches archive names instead. Click a result to
     browse that archive's *entire* contents live (via 7-Zip, not the
     index), including subfolders, as a collapsible tree — useful when you
     know the archive but want to see everything inside it, not just the
     tracked extensions.
   Results are paginated (10 / 25 / 50 / All per page) — use **All** if you
   want **Select All** to apply across every match instead of just the
   current page.
3. Check the files you want (in either mode — the tree lets you select any
   file, any extension), or **Select All**, then **Extract Selected**. In
   the dialog, **"Extract directly into this folder"** is checked by
   default — every selected file lands flat in the destination folder
   (auto-renamed `(2)`, `(3)`, etc. on a name collision), which is what you
   want when collecting patches into one folder to package as a single
   Vortex-installable mod. Uncheck it to extract each file into
   `<destination>\<archive name>\<file>` instead (a subfolder per source
   archive) if you'd rather keep track of which archive each file came
   from. The destination field also has its own **Browse…** button.

## Dark mode

The page itself defaults to dark regardless of your browser/OS setting — a
toggle button in the top-right corner (🌙 Dark / ☀️ Light) switches it, and
your choice is remembered.

The native **folder-browse popup** (opened by the Browse… buttons) is a
separate Windows dialog outside the browser's control. It always follows
Windows' own system-wide dark/light setting (Settings → Personalization →
Colors) — **not** this page's toggle, and there's no way to override that
per-app; the two are independent. This only works at all with **PowerShell
7** installed — without it, the folder picker falls back to a decades-old
Windows dialog that's always light, full stop, regardless of your Windows
theme. `install.bat` offers to install PowerShell 7 for you (optional —
everything else works fine without it, the popup will just always be
light-themed).

## Archives that fail to read

If 7-Zip can't open an archive (a corrupt or incomplete download), it's
recorded with an error instead of being silently skipped — the header
shows **"N archive(s) failed to read"** in red, as a link. Click it to see
which archives and why, then either:

- **Remove From Index** — stops tracking it; the file stays on disk.
- **Delete From Disk** — deletes the file itself (after a confirmation
  prompt) and removes it from the index in the same step.

## Changing the extension list later

If you add a new extension (say `.esm`) after already scanning, click
**Save & Rescan Folder** again. The scanner tracks which extensions each
archive was already scanned for — since none of them have `.esm` coverage
yet, *every* archive gets re-listed against the current extension list
(this one rescan will take as long as the original full scan), and
previously-unindexed `.esm` matches get picked up. Once that pass is done,
subsequent rescans go back to fast/incremental. Removing an extension
doesn't need a rescan at all — already-indexed files for it just stop
showing up in search (search always filters by the currently configured
list), nothing is deleted.

## Data

- `data/archive.db` — SQLite database (archives, matched files, settings).
  Gitignored; delete it (or the whole `data/` folder) to force a full clean
  rescan, e.g. if you're handing this off to someone else's machine.
