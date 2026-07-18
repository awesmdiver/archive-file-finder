'use strict';

// Some archives (packaging mistakes) contain entries stored under an
// absolute Windows path (e.g. "C:\Users\someone\Desktop\mod\...") instead
// of a path relative to the archive root. These aren't real mod content —
// filter them out everywhere we read archive contents.
function isAbsoluteJunkEntry(internalPath) {
  return /^[A-Za-z]:[\\/]/.test(internalPath);
}

module.exports = { isAbsoluteJunkEntry };
