import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isCIPath, isConfigPath, isSourcePath, isTestPath, stemOf } from './classify.js';
import { listWorkingFiles, showFile } from './git.js';
import { literals, norm } from './util.js';

/**
 * @typedef {import('./diff.js').FileDiff} FileDiff
 * @typedef {import('./config.js').Config} Config
 * @typedef {{
 *   cwd: string,
 *   files: FileDiff[],
 *   cfg: Config,
 *   baseSha: string,
 *   head: string | undefined,
 *   isTest: (p: string) => boolean,
 *   isCI: (p: string) => boolean,
 *   isConfig: (p: string) => boolean,
 *   isSource: (p: string) => boolean,
 *   headText: (p: string) => string | null,
 *   baseText: (p: string) => string | null,
 *   relatedSourceDeleted: (testPath: string) => boolean,
 *   testLiterals: () => Map<string, string>,
 * }} Context
 */

/**
 * Mark removed lines that reappear verbatim (ignoring whitespace) as added
 * elsewhere in the diff: those were moved, not deleted.
 * @param {FileDiff[]} files
 */
function markMoved(files) {
  /** @type {Map<string, number>} */
  const added = new Map();
  for (const f of files) {
    for (const h of f.hunks) {
      for (const l of h.added) {
        const k = norm(l.text);
        if (k) added.set(k, (added.get(k) ?? 0) + 1);
      }
    }
  }
  for (const f of files) {
    for (const h of f.hunks) {
      for (const l of h.removed) {
        const k = norm(l.text);
        const n = added.get(k) ?? 0;
        if (k && n > 0) {
          l.moved = true;
          added.set(k, n - 1);
        }
      }
    }
  }
}

const ASSERT_LITERAL_RE = /\b(assert\w*|expect|should|verify|require|check)\b|\.to\b|\bt\.(Error|Fatal)/;

/**
 * @param {{ cwd: string, files: FileDiff[], cfg: Config, baseSha: string, head?: string }} p
 * @returns {Context}
 */
export function buildContext({ cwd, files, cfg, baseSha, head }) {
  const extra = cfg.testPatterns.map((s) => new RegExp(s));
  markMoved(files);

  /** @type {Map<string, string | null>} */
  const headCache = new Map();
  /** @type {Map<string, string | null>} */
  const baseCache = new Map();
  /** @type {Map<string, string> | undefined} */
  let literalCache;

  /** @param {string} p */
  const headText = (p) => {
    if (!headCache.has(p)) {
      if (head) headCache.set(p, showFile(cwd, head, p));
      else {
        try {
          headCache.set(p, readFileSync(join(cwd, p), 'utf8'));
        } catch {
          headCache.set(p, null);
        }
      }
    }
    return headCache.get(p) ?? null;
  };

  /** @param {string} p */
  const baseText = (p) => {
    if (!baseCache.has(p)) baseCache.set(p, showFile(cwd, baseSha, p));
    return baseCache.get(p) ?? null;
  };

  const isTest = (/** @type {string} */ p) => isTestPath(p, extra);
  const deletedSourceStems = new Set(
    files.filter((f) => f.status === 'D' && !isTest(f.path)).map((f) => stemOf(f.path)),
  );

  const testLiterals = () => {
    if (literalCache) return literalCache;
    literalCache = new Map();
    const tests = listWorkingFiles(cwd).filter(isTest).slice(0, 3000);
    for (const p of tests) {
      let text;
      try {
        if (statSync(join(cwd, p)).size > 512_000) continue;
        text = readFileSync(join(cwd, p), 'utf8');
      } catch {
        continue;
      }
      text.split('\n').forEach((line, i) => {
        if (!ASSERT_LITERAL_RE.test(line)) return;
        const { strings, numbers } = literals(line);
        for (const s of [...strings, ...numbers]) {
          if (!literalCache?.has(s)) literalCache?.set(s, `${p}:${i + 1}`);
        }
      });
    }
    return literalCache;
  };

  return {
    cwd,
    files,
    cfg,
    baseSha,
    head,
    isTest,
    isCI: isCIPath,
    isConfig: isConfigPath,
    isSource: (p) => isSourcePath(p) && !isTest(p),
    headText,
    baseText,
    relatedSourceDeleted: (p) => deletedSourceStems.has(stemOf(p)),
    testLiterals,
  };
}
