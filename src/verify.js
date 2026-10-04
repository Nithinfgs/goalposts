import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { collectDiff, listWorkingFiles, showFile } from './git.js';
import { loadConfig } from './config.js';
import { isTestPath } from './classify.js';

const LINK_DIRS = ['node_modules', '.venv', 'venv', 'vendor'];

/**
 * @typedef {{ command: string, exitCode: number | null, timedOut: boolean, tail: string[] }} RunResult
 * @typedef {{
 *   command: string,
 *   restored: string[],
 *   headRun: RunResult,
 *   baseTestsRun: RunResult | null,
 *   verdict: 'confirmed' | 'clean' | 'head-fails' | 'no-test-changes',
 * }} Verification
 */

/**
 * @param {string} command
 * @param {string} cwd
 * @param {number} timeoutSec
 * @returns {RunResult}
 */
function run(command, cwd, timeoutSec) {
  // A parent test runner leaks its context into children and makes a nested `node --test` report success.
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
    maxBuffer: 1 << 26,
    env,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  const timedOut = r.error !== undefined && /** @type {NodeJS.ErrnoException} */ (r.error).code === 'ETIMEDOUT';
  const failing = out.filter((l) => /^\s*(✖|×|not ok|FAIL(ED)?\b|--- FAIL)/.test(l) && !/^\s*✖ failing tests:?$/.test(l));
  return { command, exitCode: r.status, timedOut, tail: failing.length ? [...new Set(failing.map((l) => l.replace(/\s*\(\d+(\.\d+)?ms\)\s*$/, '')))].slice(0, 8) : out.slice(-14) };
}

/**
 * Copy the files git knows about into `dest`, symlinking dependency folders.
 * @param {string} cwd
 * @param {string} dest
 * @param {string | undefined} head
 */
function materialise(cwd, dest, head) {
  if (head) {
    const r = spawnSync('sh', ['-c', 'git archive "$2" | tar -x -C "$1"', 'sh', dest, head], { cwd, stdio: 'ignore' });
    if (r.status !== 0) throw new Error(`git archive ${head} failed`);
  } else {
    for (const p of listWorkingFiles(cwd)) {
      const src = join(cwd, p);
      try {
        if (!existsSync(src) || statSync(src).size > 50_000_000) continue;
        mkdirSync(dirname(join(dest, p)), { recursive: true });
        cpSync(src, join(dest, p));
      } catch {
        /* file vanished or unreadable */
      }
    }
  }
  for (const d of LINK_DIRS) {
    const src = join(cwd, d);
    if (existsSync(src) && !existsSync(join(dest, d))) {
      try {
        symlinkSync(src, join(dest, d), 'dir');
      } catch {
        /* best effort */
      }
    }
  }
}

/**
 * Run the user's test command twice in throwaway copies: once on the change as-is,
 * once with the pre-change versions of every modified or deleted test file restored.
 * @param {{ cwd: string, command: string, baseSha: string, head?: string, base?: string, staged?: boolean, timeoutSec: number, configPath?: string }} o
 * @returns {Verification}
 */
export function verify(o) {
  const cfg = loadConfig(o.cwd, o.configPath);
  const extra = cfg.testPatterns.map((s) => new RegExp(s));
  const diff = collectDiff(o.cwd, { base: o.base, head: o.head, staged: o.staged });
  const toRestore = diff.files
    .filter((f) => f.status !== 'A' && isTestPath(f.oldPath, extra) && !f.binary)
    .map((f) => f.oldPath);

  const root = mkdtempSync(join(tmpdir(), 'goalposts-'));
  try {
    const headDir = join(root, 'head');
    mkdirSync(headDir);
    materialise(o.cwd, headDir, o.head);
    const headRun = run(o.command, headDir, o.timeoutSec);

    if (toRestore.length === 0) {
      return { command: o.command, restored: [], headRun, baseTestsRun: null, verdict: 'no-test-changes' };
    }
    if (headRun.exitCode !== 0) {
      return { command: o.command, restored: toRestore, headRun, baseTestsRun: null, verdict: 'head-fails' };
    }
    const baseDir = join(root, 'base');
    mkdirSync(baseDir);
    materialise(o.cwd, baseDir, o.head);
    for (const p of toRestore) {
      const content = showFile(o.cwd, o.baseSha, p);
      if (content === null) continue;
      mkdirSync(dirname(join(baseDir, p)), { recursive: true });
      writeFileSync(join(baseDir, p), content);
    }
    const baseTestsRun = run(o.command, baseDir, o.timeoutSec);
    const verdict = baseTestsRun.exitCode === 0 ? 'clean' : 'confirmed';
    return { command: o.command, restored: toRestore, headRun, baseTestsRun, verdict };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
