import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { analyze } from '../src/engine.js';

/**
 * @param {string} cwd
 * @param {string[]} args
 */
function git(cwd, args) {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com',
    },
  });
}

/**
 * @param {string} dir
 * @param {Record<string, string | null>} files null deletes the file
 */
function apply(dir, files) {
  for (const [p, content] of Object.entries(files)) {
    if (content === null) {
      rmSync(join(dir, p), { force: true });
      continue;
    }
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), content);
  }
}

/**
 * Build a repo with a base commit on `main`, then apply `change` to the working tree
 * (uncommitted) and analyse it.
 * @param {Record<string, string>} base
 * @param {Record<string, string | null>} change
 * @param {{ config?: object, commit?: boolean }} [opts]
 */
export function scenario(base, change, opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'goalposts-test-'));
  git(dir, ['init', '-q', '-b', 'main']);
  apply(dir, base);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  if (opts.commit) git(dir, ['checkout', '-q', '-b', 'feature']);
  if (opts.config) writeFileSync(join(dir, '.goalposts.json'), JSON.stringify(opts.config));
  apply(dir, change);
  if (opts.commit) {
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'change']);
  }
  const result = analyze({ cwd: dir, base: 'main' });
  return { dir, result, ids: result.findings.map((f) => f.rule), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Run a scenario, hand it to `fn`, always clean up. */
export function withScenario(
  /** @type {Record<string, string>} */ base,
  /** @type {Record<string, string | null>} */ change,
  /** @type {(s: ReturnType<typeof scenario>) => void} */ fn,
  /** @type {{ config?: object, commit?: boolean }} */ opts = {},
) {
  const s = scenario(base, change, opts);
  try {
    fn(s);
  } finally {
    s.cleanup();
  }
}
