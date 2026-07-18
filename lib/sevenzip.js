'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CANDIDATE_PATHS = [
  'C:\\Program Files\\7-Zip\\7z.exe',
  'C:\\Program Files (x86)\\7-Zip\\7z.exe',
];

function findSevenZip() {
  for (const p of CANDIDATE_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return '7z'; // fall back to PATH
}

function run(exePath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

// Parses `7z l -slt` output into an array of { path, size, isDir }.
// Blocks are separated by blank lines; the first block describes the
// archive itself and is skipped (it has no meaningful "Path" for a member).
function parseSlt(stdout) {
  const blocks = stdout.split(/\r?\n\r?\n/);
  const entries = [];
  for (let i = 1; i < blocks.length; i++) { // skip archive-level block
    const block = blocks[i];
    if (!block.includes('Path = ')) continue;
    const fields = {};
    for (const line of block.split(/\r?\n/)) {
      const idx = line.indexOf(' = ');
      if (idx === -1) continue;
      fields[line.slice(0, idx)] = line.slice(idx + 3);
    }
    if (!fields.Path) continue;
    const attrs = fields.Attributes || '';
    const isDir = attrs.trim().startsWith('D');
    entries.push({
      path: fields.Path,
      size: fields.Size ? parseInt(fields.Size, 10) || 0 : 0,
      isDir,
    });
  }
  return entries;
}

async function listArchive(exePath, archivePath) {
  const { code, stdout, stderr } = await run(exePath, ['l', '-slt', archivePath]);
  if (code !== 0) {
    throw new Error(`7z exited ${code}: ${stderr.trim() || stdout.trim()}`);
  }
  return parseSlt(stdout);
}

// Extracts a single member (internalPath) from archivePath into destDir,
// flattening directory structure (member ends up directly in destDir).
async function extractFile(exePath, archivePath, internalPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const args = ['e', archivePath, `-o${destDir}`, '-y', internalPath];
  const { code, stdout, stderr } = await run(exePath, args);
  if (code !== 0) {
    throw new Error(`7z extract exited ${code}: ${stderr.trim() || stdout.trim()}`);
  }
  const extractedName = path.basename(internalPath);
  const extractedPath = path.join(destDir, extractedName);
  if (!fs.existsSync(extractedPath)) {
    throw new Error(`Extraction reported success but file not found at ${extractedPath}`);
  }
  return extractedPath;
}

module.exports = { findSevenZip, listArchive, extractFile };
