import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseDiff, syntheticAdded } from './diff.js';

export class GitError extends Error {}

/**
 * @param {string[]} args
 * @param {string} cwd
 * @param {{ allowFail?: boolean }} [opts]
 * @returns {string}
 */
export function git(args, cwd, opts = {}) {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1 << 29,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    if (opts.allowFail) return '';
    const err = /** @type {{ stderr?: Buffer | string, message: string }} */ (e);
    throw new GitError(`git ${args.join(' ')} failed: ${String(err.stderr || err.message).trim()}`);
  }
}

/** @param {string} cwd */
export function repoRoot(cwd) {
  try {
    return git(['rev-parse', '--show-toplevel'], cwd).trim();
  } catch {
    throw new GitError(`${cwd} is not inside a git repository`);
  }
}

/**
 * @param {string} cwd
 * @param {string} ref
 */
function resolve(cwd, ref) {
  return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd, { allowFail: true }).trim();
}

/**
 * Pick the commit to compare against: the merge-base with the default branch,
 * or whatever the user asked for.
 * @param {string} cwd
 * @param {string | undefined} baseOpt
 * @returns {{ ref: string, sha: string }}
 */
export function resolveBase(cwd, baseOpt) {
  const candidates = baseOpt ? [baseOpt] : ['origin/HEAD', 'origin/main', 'origin/master', 'main', 'master'];
  const headSha = resolve(cwd, 'HEAD');
  if (!headSha) throw new GitError('repository has no commits yet');
  for (const c of candidates) {
    if (!resolve(cwd, c)) continue;
    const mb = git(['merge-base', c, 'HEAD'], cwd, { allowFail: true }).trim();
    if (mb) return { ref: c, sha: mb };
  }
  if (baseOpt) throw new GitError(`cannot resolve base ref "${baseOpt}"`);
  return { ref: 'HEAD', sha: headSha };
}

/**
 * @typedef {{
 *   base?: string,
 *   head?: string,
 *   staged?: boolean,
 * }} RangeOpts
 */

/**
 * @param {string} cwd
 * @param {RangeOpts} opts
 */
export function collectDiff(cwd, opts) {
  const common = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '-M', '-U0'];
  if (opts.staged) {
    const sha = resolve(cwd, 'HEAD');
    const text = git([...common, '--cached', 'HEAD'], cwd);
    return { base: { ref: 'HEAD', sha }, head: undefined, label: 'staged changes', files: parseDiff(text) };
  }
  const base = resolveBase(cwd, opts.base);
  if (opts.head) {
    const text = git([...common, base.sha, opts.head], cwd);
    return { base, head: opts.head, label: opts.head, files: parseDiff(text) };
  }
  const files = parseDiff(git([...common, base.sha], cwd));
  const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd).split('\n').filter(Boolean);
  for (const p of untracked) {
    try {
      const abs = join(cwd, p);
      if (statSync(abs).size > 2_000_000) continue;
      const buf = readFileSync(abs);
      if (buf.includes(0)) continue;
      files.push(syntheticAdded(p, buf.toString('utf8')));
    } catch {
      /* unreadable or vanished: skip */
    }
  }
  return { base, head: undefined, label: 'working tree', files };
}

/**
 * Content of a file at a ref, or null when it does not exist there.
 * @param {string} cwd
 * @param {string} ref
 * @param {string} path
 */
export function showFile(cwd, ref, path) {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/** @param {string} cwd */
export function listWorkingFiles(cwd) {
  return git(['ls-files', '-co', '--exclude-standard'], cwd).split('\n').filter(Boolean);
}
