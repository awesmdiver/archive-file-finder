'use strict';
const { spawn, spawnSync } = require('node:child_process');

function psSingleQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

// Windows PowerShell 5.1 (powershell.exe, .NET Framework) implements
// FolderBrowserDialog with the ancient SHBrowseForFolder tree dialog, which
// is always light-themed and ignores the OS dark/light setting entirely.
// PowerShell 7+ (pwsh.exe, .NET 5+) implements it with the modern
// IFileOpenDialog-based Explorer-style picker, which follows Windows' own
// system-wide dark/light setting (Settings > Personalization > Colors).
//
// That system setting is the only thing that governs it — there is no
// supported way to override it per-process to match this app's own theme
// toggle independently of Windows' actual setting (verified: the
// uxtheme.dll SetPreferredAppMode trick some apps use for their *own*
// window chrome does not affect this dialog's Explorer-hosted content;
// tried it, confirmed it has no visible effect, removed it rather than
// ship a no-op). Prefer pwsh when present; it's still a real improvement
// over powershell.exe's dialog, which can never be anything but light.
let cachedShell = null;
function resolveShell() {
  if (cachedShell) return cachedShell;
  const hasPwsh = spawnSync('pwsh.exe', ['-NoProfile', '-Command', 'exit 0'], { windowsHide: true }).status === 0;
  cachedShell = hasPwsh ? 'pwsh.exe' : 'powershell.exe';
  return cachedShell;
}

// Opens a native Windows folder-browser dialog via a spawned PowerShell
// WinForms dialog (the same proven approach used by vortex-collection-sync's
// win-dialog.js) and resolves to the chosen path, or null if cancelled.
function pickFolder(initialPath) {
  return new Promise((resolve, reject) => {
    const lines = [
      'Add-Type -AssemblyName System.Windows.Forms | Out-Null',
      '$dlg = New-Object System.Windows.Forms.FolderBrowserDialog',
      "$dlg.Description = 'Select a folder'",
      '$dlg.ShowNewFolderButton = $true',
    ];
    if (initialPath && String(initialPath).trim()) {
      const q = psSingleQuote(initialPath);
      lines.push(`if (Test-Path ${q}) { $dlg.SelectedPath = ${q} }`);
    }
    lines.push('$result = $dlg.ShowDialog()');
    lines.push('if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.SelectedPath }');

    const child = spawn(resolveShell(), ['-NoProfile', '-STA', '-Command', lines.join('; ')], {
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 && stderr.trim()) {
        reject(new Error(stderr.trim()));
        return;
      }
      const out = stdout.trim();
      resolve(out.length > 0 ? out : null);
    });
  });
}

module.exports = { pickFolder };
