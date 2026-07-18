'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const db = require('./lib/db');
const scanner = require('./lib/scanner');
const sevenzip = require('./lib/sevenzip');
const { buildTree } = require('./lib/tree');
const { pickFolder } = require('./lib/folder-picker');

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

let scanInFlight = false;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, filePath);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/shutdown' && req.method === 'POST') {
      sendJson(res, 200, { ok: true, message: 'Shutting down' });
      setTimeout(shutdown, 150); // let the response flush before closing
      return;
    }

    if (pathname === '/api/config' && req.method === 'GET') {
      return sendJson(res, 200, db.getConfig());
    }

    if (pathname === '/api/config' && req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 200, db.setConfig(body));
    }

    if (pathname === '/api/pick-folder' && req.method === 'GET') {
      const initial = url.searchParams.get('initial') || '';
      try {
        const picked = await pickFolder(initial);
        return sendJson(res, 200, { path: picked });
      } catch (err) {
        return sendJson(res, 500, { error: String(err.message || err) });
      }
    }

    if (pathname === '/api/stats' && req.method === 'GET') {
      return sendJson(res, 200, db.stats());
    }

    if (pathname === '/api/search' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const mode = url.searchParams.get('mode') === 'archives' ? 'archives' : 'files';
      if (!q.trim()) return sendJson(res, 200, []);
      if (mode === 'archives') {
        return sendJson(res, 200, db.searchArchives(q.trim()));
      }
      const cfg = db.getConfig();
      return sendJson(res, 200, db.search(q.trim(), cfg.extensions.map((e) => e.toLowerCase())));
    }

    if (pathname === '/api/archive-tree' && req.method === 'GET') {
      const id = Number(url.searchParams.get('id'));
      const archive = db.getArchiveById(id);
      if (!archive) return sendJson(res, 404, { error: 'Unknown archive id' });
      const exePath = sevenzip.findSevenZip();
      try {
        const entries = await sevenzip.listArchive(exePath, archive.path);
        const tree = buildTree(entries);
        return sendJson(res, 200, {
          archiveId: archive.id,
          archiveName: archive.name,
          archivePath: archive.path,
          tree,
        });
      } catch (err) {
        return sendJson(res, 500, { error: String(err.message || err) });
      }
    }

    if (pathname === '/api/scan' && req.method === 'GET') {
      // SSE stream of scan progress.
      if (scanInFlight) {
        return sendJson(res, 409, { error: 'A scan is already in progress' });
      }
      scanInFlight = true;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      const emitter = scanner.scan();
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      emitter.on('progress', (d) => send('progress', d));
      emitter.on('done', (d) => { send('done', d); scanInFlight = false; res.end(); });
      emitter.on('error', (d) => { send('error', d); scanInFlight = false; res.end(); });
      req.on('close', () => { scanInFlight = false; });
      return;
    }

    if (pathname === '/api/failed-archives' && req.method === 'GET') {
      return sendJson(res, 200, db.getFailedArchives());
    }

    if (pathname === '/api/failed-archives/untrack' && req.method === 'POST') {
      const body = await readBody(req);
      const archiveIds = Array.isArray(body.archiveIds) ? body.archiveIds : [];
      const results = archiveIds.map((id) => {
        const archive = db.getArchiveById(id);
        if (!archive) return { archiveId: id, ok: false, error: 'Unknown archive id' };
        db.deleteArchive(id);
        return { archiveId: id, ok: true };
      });
      return sendJson(res, 200, { results });
    }

    if (pathname === '/api/failed-archives/delete-file' && req.method === 'POST') {
      const body = await readBody(req);
      const archiveIds = Array.isArray(body.archiveIds) ? body.archiveIds : [];
      const cfg = db.getConfig();
      const scanFolderResolved = path.resolve(cfg.scanFolder);
      const results = archiveIds.map((id) => {
        const archive = db.getArchiveById(id);
        if (!archive) return { archiveId: id, ok: false, error: 'Unknown archive id' };
        const resolved = path.resolve(archive.path);
        if (!resolved.startsWith(scanFolderResolved)) {
          return { archiveId: id, ok: false, error: 'Archive path is outside the configured scan folder; refusing to delete' };
        }
        try {
          fs.unlinkSync(resolved);
          db.deleteArchive(id);
          return { archiveId: id, ok: true };
        } catch (err) {
          return { archiveId: id, ok: false, error: String(err.message || err) };
        }
      });
      return sendJson(res, 200, { results });
    }

    if (pathname === '/api/extract' && req.method === 'POST') {
      const body = await readBody(req);
      const items = Array.isArray(body.items) ? body.items : [];
      const flat = !!body.flat;
      const cfg = db.getConfig();
      const outputFolder = (body.outputFolder && String(body.outputFolder).trim()) || cfg.outputFolder;
      if (!outputFolder) {
        return sendJson(res, 400, { error: 'No destination folder set. Choose one in the extract dialog or in Settings.' });
      }
      const exePath = sevenzip.findSevenZip();
      const results = [];

      // Tracks names already placed in each destination folder so two files
      // sharing a basename (common in flat mode, or same-name files across
      // subfolders of one archive) don't silently overwrite one another.
      const usedNamesByDir = new Map();
      function reserveName(destDir, fileName) {
        if (!usedNamesByDir.has(destDir)) {
          const seed = new Set();
          try {
            for (const existing of fs.readdirSync(destDir)) seed.add(existing.toLowerCase());
          } catch (_) { /* dir doesn't exist yet */ }
          usedNamesByDir.set(destDir, seed);
        }
        const used = usedNamesByDir.get(destDir);
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        let candidate = fileName;
        let n = 2;
        while (used.has(candidate.toLowerCase())) {
          candidate = `${base} (${n})${ext}`;
          n++;
        }
        used.add(candidate.toLowerCase());
        return candidate;
      }

      for (const item of items) {
        const archivePath = item.archivePath;
        const internalPath = item.internalPath;
        const key = `${archivePath}|${internalPath}`;
        if (!archivePath || !internalPath) {
          results.push({ key, ok: false, error: 'Missing archivePath/internalPath' });
          continue;
        }
        const archiveName = path.basename(archivePath);
        const archiveBase = path.basename(archiveName, path.extname(archiveName));
        const destDir = flat ? outputFolder : path.join(outputFolder, archiveBase);
        const fileName = path.basename(internalPath);
        const desiredName = reserveName(destDir, fileName);
        try {
          let extractedPath = await sevenzip.extractFile(exePath, archivePath, internalPath, destDir);
          if (path.basename(extractedPath) !== desiredName) {
            const finalPath = path.join(destDir, desiredName);
            fs.renameSync(extractedPath, finalPath);
            extractedPath = finalPath;
          }
          results.push({ key, ok: true, path: extractedPath });
        } catch (err) {
          results.push({ key, ok: false, error: String(err.message || err) });
        }
      }
      return sendJson(res, 200, { outputFolder, results });
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Not found' });
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    return sendJson(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`ArchiveFileFinder running at http://localhost:${PORT}`);
});

function shutdown() {
  console.log('Shutting down cleanly...');
  server.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// On Windows, closing the console window (the "X" button) delivers SIGHUP
// to the process, not SIGINT/SIGTERM — without this, that path would skip
// the clean DB close entirely.
process.on('SIGHUP', shutdown);
