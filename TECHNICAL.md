# Technical documentation

Build/run notes and internals for Archive File Finder. See `README.md` for what it does and how to
use it.

## Prerequisites

- Windows (the native folder-picker and bundled 7-Zip path assumptions both require it).
- Node.js 22.5+ — uses the built-in `node:sqlite` module, so there are zero npm dependencies and no
  `npm install` step.
- 7-Zip (`7z.exe`), invoked via `child_process` rather than a pure-JS archive library, specifically
  because it supports `.rar` — most JS-only unzip libraries don't, and Skyrim mod archives are
  routinely distributed as `.rar`.

## Running

`node server.js`, or the `start.bat`/`start.ps1` wrappers (which also verify Node.js/7-Zip are
present first and print a clearer error than a raw crash if not). Opens at
`http://localhost:4173`.

## Architecture

**Indexing** lists each archive's contents via `7z.exe l` (list), which reads only the archive's
header/table of contents — not its compressed data — so indexing thousands of archives is fast
even though nothing is extracted.

**Incremental rescans**: each archive's size + modified-date is used as a change fingerprint.
Unchanged archives are skipped entirely on a rescan; changed or new ones are re-listed. Each
archive also tracks *which file extensions it was already scanned for* — adding a new extension to
the configured list (e.g. `.esm`) means every archive lacks a scan record for that extension, so
one full rescan happens to backfill it; every rescan after that goes back to being incremental.
Removing an extension needs no rescan at all — matching files just stop appearing in search results
(search filters by the current extension list), nothing is deleted from the index.

**Clean shutdown matters** because of SQLite's write-ahead log: a clean stop (`stop.bat`, Ctrl+C, or
the console window's **X** button) flushes and checkpoints the WAL before exiting. Closing the
window sends `SIGHUP`, handled identically to Ctrl+C — verified by watching the WAL files get
cleanly merged away after closing via the **X** button specifically. Only Task Manager /
`taskkill /F` bypass this handling and can drop the last few uncheckpointed writes.

**Two search modes** query different things: *Find individual files* matches indexed file names
directly. *Display Archive* matches archive names, then browses that archive's full contents live
via `7z.exe l` again (not the index) — so it can show subfolders and non-indexed file types too,
not just what's tracked.

**Results are paginated client-side** (10 / 25 / 50 / All per page). This matters beyond display:
**Select All only selects the current page**, not every match — a user has to switch to the All
page size first if they want Select All to cover the full result set. Keep this coupling in mind if
the page-size control or Select All's behavior ever changes independently of each other.

## Project structure

- `server.js` — entry point.
- `lib/db.js` — SQLite schema/queries.
- `lib/scanner.js` — the indexing/rescan logic described above.
- `lib/sevenzip.js` — `7z.exe` invocation wrapper (listing + extraction).
- `lib/folder-picker.js` — native Windows folder-browse dialog (PowerShell 7-backed when
  available; see Known issues below).
- `lib/tree.js` — builds the collapsible archive-contents tree for *Display Archive* mode.
- `lib/junk-paths.js` — filters non-useful archive entries (e.g. `__MACOSX/`, thumbnail caches).
- `public/` — the frontend (`app.js`, `index.html`, `style.css`), served as static files.
- `data/archive.db` — the SQLite database itself. Gitignored, never shipped — delete it (or the
  whole `data/` folder) to force a full clean rescan from scratch.

## Known issues

- The native folder-picker dialog only follows Windows' system dark/light setting when PowerShell 7
  is installed. Without it, `folder-picker.js` falls back to a decades-old Windows dialog that's
  always light-themed, regardless of the app's own dark-mode toggle (which is independent — it's a
  separate in-browser page, not the native dialog). `install.bat` offers to install PowerShell 7 as
  an optional step for exactly this reason.
