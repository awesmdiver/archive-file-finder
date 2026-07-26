![License](https://img.shields.io/badge/License-MIT-yellow.svg) ![Platform](https://img.shields.io/badge/Platform-Windows-blue.svg)

# Archive File Finder

> **Find which of your downloaded (still-zipped) mod archives contain a patch you need — without extracting a single one by hand.**

---

## ⚡ Overview

You just installed a mod and need its patch, but the patch is buried inside one of dozens (or
thousands) of `.zip`/`.7z`/`.rar` files sitting in your downloads folder — and you have no way to
search inside them without extracting each one. Archive File Finder solves that: it lists every
archive's contents up front (no extraction needed to look), remembers what it found, and lets you
search across everything by mod name. Selected files come straight out of their source archive
into a folder you choose.

**Example:** install *Lanterns of Skyrim II*, then search "lanterns of skyrim" — every matching
patch `.esp` sitting inside any downloaded archive shows up (e.g. `COTN Dawnstar - Lanterns of
Skyrim II Patch.esp`, buried inside `COTN Dawnstar Patch Collection.7z`), ready to select and
extract.

### 📋 At a Glance

| Feature | Details |
| :--- | :--- |
| **Requirements** | Windows; Node.js 22.5+ and 7-Zip (`install.bat` gets both for you) |
| **Performance Impact** | Indexes by reading archive headers only — no extraction needed to search |
| **Safety** | Never touches your installed mods — only reads your downloads folder; its own database is local and gitignored |
| **Compatibility** | Any mod manager (Vortex, Mod Organizer 2) or just a plain folder of archives |

---

## ✨ Key Features

* **Finds patches without extracting anything:** Lists every archive's contents via 7-Zip up
  front, so you can search before ever unpacking a single file.
* **Two ways to search:** *Find individual files* matches file names directly (e.g. the `.esp`
  itself); *Display Archive* matches archive names and lets you browse one's entire contents live,
  including subfolders.
* **Rescans are incremental:** New archives get indexed, unchanged ones are skipped, and archives
  you've deleted get dropped from the index automatically — only a first scan or a newly-added file
  extension takes a full pass.
* **Extract exactly what you picked:** Select files across any number of archives and pull them
  straight into one destination folder, auto-renaming on a name collision — perfect for collecting
  scattered patches into a single Vortex-installable mod.
* **Corrupt archives don't get silently skipped:** If 7-Zip can't open a file, it's flagged with an
  error you can review, then either dropped from the index or deleted from disk outright.
* **Dark mode by default,** with a toggle that remembers your choice.

---

## 📦 Getting Started

1. **Run `install.bat`.** It checks for Node.js and 7-Zip (both required) and offers to install
   anything missing via [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/)
   — it always asks first. Safe to run again any time.
2. **Run `start.bat`.** It launches the app and opens your browser to it automatically. A console
   window stays open while it runs — that's expected, and it's how you know the server's up.
3. **Open Settings** and click **Browse…** next to *Scan folder* — point it at your mod manager's
   **downloads** folder (the still-zipped originals), not wherever it stages or installs mods.
4. **Click "Save & Rescan Folder."** For a few thousand archives, the first scan takes a few
   minutes; every rescan after that is much faster.

> [!TIP]
> Prefer PowerShell directly? `.ps1` versions of every script (`install.ps1`, `start.ps1`,
> `stop.ps1`) work exactly the same way as their `.bat` wrappers.

---

## ⚠️ Important Notes

> [!WARNING]
> Always stop the server with `stop.bat`, Ctrl+C, or the console window's **X** button — never
> Task Manager or `taskkill /F`. A clean stop flushes the last few database writes to disk; a hard
> kill can drop them.

> [!NOTE]
> Point the scan folder at your **downloads** folder specifically — a staging or installed-mods
> folder holds already-extracted files, not archives, so nothing will match.

> [!NOTE]
> Results are shown a page at a time. **Select All** only grabs what's on the current page —
> switch the page-size dropdown to **All** first if you want it to cover every match.

---

## ❓ Frequently Asked Questions

* **Q: Do I need to install anything myself first?**
  > **No.** `install.bat` checks for Node.js and 7-Zip and offers to install anything missing —
  > it always asks before installing anything.

---

* **Q: Does this touch my installed mods?**
  > **No.** It only reads whatever folder you point it at (your downloads folder) and its own
  > local database. Nothing about your installed/staged mods is touched.

---

* **Q: I added a new file extension to track — do I need to do anything special?**
  > **Just click "Save & Rescan Folder" again.** That one rescan takes as long as the original
  > full scan, since every archive needs checking against the new extension; every rescan after
  > that goes back to being fast.

---

* **Q: What happens if an archive is corrupt or incomplete?**
  > **It's flagged, not skipped.** A "N archive(s) failed to read" link appears so you can review
  > which ones and why, then choose to stop tracking it or delete it from disk.

---

* **Q: I clicked "Select All" but only some of my matches got extracted — what happened?**
  > **Select All only grabs the current page.** Results show 10/25/50 at a time by default —
  > switch the page-size dropdown to **All** first if you want Select All to cover every match,
  > not just what's currently visible.

---

* **Q: I'm moving this to a new machine — do I need to bring anything with me?**
  > **No.** The database (`data/archive.db`) is local and gitignored — delete it (or the whole
  > `data/` folder) any time to force a clean rescan from scratch.

---

* **Q: Why is the folder-browse popup always light-themed?**
  > **It needs PowerShell 7.** Without it, the folder picker falls back to an old Windows dialog
  > that's always light. `install.bat` offers to install PowerShell 7 for you — everything else
  > works fine without it either way.

---

## 🛠️ Technical Details & Contributions

Looking for the SQLite schema, the incremental-rescan logic, or why it shells out to `7z.exe`
instead of a JS unzip library? Check out [`TECHNICAL.md`](TECHNICAL.md).

---

## 🤝 Credits

* **[7-Zip](https://www.7-zip.org/)** (Igor Pavlov) — powers archive listing/extraction; also
  handles `.rar`, which most pure-JS archive libraries don't support.
* **Node.js** — the built-in `node:sqlite` module means this ships with zero npm dependencies.

Published publicly at [github.com/awesmdiver/archive-file-finder](https://github.com/awesmdiver/archive-file-finder) (MIT).
