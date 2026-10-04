/**
 * Minimal unified-diff parser. Expects `git diff -U0 -M` output, so every hunk
 * is a block of removed lines followed by a block of added lines.
 */

/**
 * @typedef {{ n: number, text: string, moved?: boolean }} Line
 * @typedef {{ removed: Line[], added: Line[] }} Hunk
 * @typedef {{
 *   path: string,
 *   oldPath: string,
 *   status: 'A' | 'M' | 'D' | 'R',
 *   binary: boolean,
 *   hunks: Hunk[]
 * }} FileDiff
 */

/** @param {string} p */
function unquote(p) {
  let s = p.replace(/\t.*$/, '');
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s;
}

/**
 * @param {string} text
 * @returns {FileDiff[]}
 */
export function parseDiff(text) {
  /** @type {FileDiff[]} */
  const files = [];
  /** @type {FileDiff | null} */
  let file = null;
  /** @type {Hunk | null} */
  let hunk = null;
  let oldN = 0;
  let newN = 0;

  for (const l of text.split('\n')) {
    if (l.startsWith('diff --git ')) {
      const m = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/.exec(l);
      file = { path: m ? m[2] : '', oldPath: m ? m[1] : '', status: 'M', binary: false, hunks: [] };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;

    if (hunk === null) {
      // Header section: only here may "--- " / "+++ " be treated as file markers.
      if (l.startsWith('new file mode')) file.status = 'A';
      else if (l.startsWith('deleted file mode')) file.status = 'D';
      else if (l.startsWith('rename from ')) {
        file.status = 'R';
        file.oldPath = unquote(l.slice(12));
      } else if (l.startsWith('rename to ')) file.path = unquote(l.slice(10));
      else if (l.startsWith('Binary files') || l.startsWith('GIT binary patch')) file.binary = true;
      else if (l.startsWith('--- ')) {
        const p = unquote(l.slice(4));
        if (p !== '/dev/null') file.oldPath = p.replace(/^a\//, '');
      } else if (l.startsWith('+++ ')) {
        const p = unquote(l.slice(4));
        if (p === '/dev/null') file.path = file.oldPath;
        else file.path = p.replace(/^b\//, '');
      }
    }

    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) {
      hunk = { removed: [], added: [] };
      file.hunks.push(hunk);
      oldN = Number(h[1]);
      newN = Number(h[2]);
      continue;
    }
    if (hunk === null) continue;
    if (l.startsWith('+')) hunk.added.push({ n: newN++, text: l.slice(1) });
    else if (l.startsWith('-')) hunk.removed.push({ n: oldN++, text: l.slice(1) });
  }
  return files.filter((f) => f.path);
}

/**
 * Build a synthetic "all lines added" diff for an untracked file.
 * @param {string} path
 * @param {string} content
 * @returns {FileDiff}
 */
export function syntheticAdded(path, content) {
  const lines = content.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return {
    path,
    oldPath: path,
    status: 'A',
    binary: false,
    hunks: [{ removed: [], added: lines.map((text, i) => ({ n: i + 1, text })) }],
  };
}
