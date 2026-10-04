import { readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CONFIG_FILE, EXAMPLE_CONFIG } from './config.js';
import { createDemoRepo } from './demo.js';
import { analyze, shouldFail } from './engine.js';
import { GitError } from './git.js';
import { renderGithub, renderJson, renderMarkdown, renderSarif } from './report/formats.js';
import { renderTerminal } from './report/terminal.js';
import { findRule, RULES, VERIFY_RULE } from './rules/index.js';
import { verify } from './verify.js';

const HELP = `goalposts: did your coding agent move the goalposts?

Usage
  goalposts [options]            analyse the current branch + uncommitted changes
  goalposts demo                 run on a built-in example (no setup needed)
  goalposts rules                list all rules
  goalposts explain <GPxxx>      explain one rule
  goalposts init                 write a starter ${CONFIG_FILE}

What to compare
  --base <ref>       compare against this ref's merge-base (default: origin/main, main or master)
  --head <ref>       compare committed history base..<ref> instead of the working tree
  --staged           only staged changes (for pre-commit hooks)

Output
  --format <f>       terminal (default) | json | sarif | github | markdown
  --fail-on <level>  exit 1 at or above: high (default) | medium | low | never
  --ignore <ids>     comma-separated rule IDs to skip
  --config <path>    config file (default: ${CONFIG_FILE} in the repo root)
  --no-color

Verification (optional, runs your tests)
  --verify <cmd>     run <cmd> on the change, then again with the original versions of
                     every modified/deleted test file restored
  --verify-timeout <seconds>   per-run limit (default 300)

  -C <dir>           run as if started in <dir>
  -h, --help   -v, --version

Exit codes: 0 clean, 1 findings at the --fail-on level (or verification failed), 2 usage or git error.
`;

const here = dirname(fileURLToPath(import.meta.url));

function version() {
  return JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).version;
}

/**
 * @param {string[]} argv
 * @param {{ out: (s: string) => void, err: (s: string) => void, isTTY: boolean }} io
 * @returns {Promise<number>}
 */
export async function main(argv, io) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        base: { type: 'string' }, head: { type: 'string' }, staged: { type: 'boolean' },
        format: { type: 'string', default: 'terminal' }, 'fail-on': { type: 'string', default: 'high' },
        ignore: { type: 'string' }, config: { type: 'string' }, 'no-color': { type: 'boolean' },
        verify: { type: 'string' }, 'verify-timeout': { type: 'string', default: '300' },
        keep: { type: 'boolean' }, C: { type: 'string' },
        help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (e) {
    io.err(`${/** @type {Error} */ (e).message}\n\n${HELP}`);
    return 2;
  }
  const { values: v, positionals } = parsed;
  if (v.help) return io.out(HELP), 0;
  if (v.version) return io.out(`${version()}\n`), 0;

  const [cmd, arg] = positionals;
  const color = !v['no-color'] && !process.env.NO_COLOR && (io.isTTY || Boolean(process.env.FORCE_COLOR));

  if (cmd === 'rules') {
    const rows = [...RULES, VERIFY_RULE].map((r) => `${r.id}  ${r.severity.padEnd(6)} ${r.name.padEnd(32)} ${r.summary}`);
    io.out(`${rows.join('\n')}\n`);
    return 0;
  }
  if (cmd === 'explain') {
    const r = arg && findRule(arg);
    if (!r) {
      io.err(`unknown rule "${arg ?? ''}". Run \`goalposts rules\` for the list.\n`);
      return 2;
    }
    io.out(`${r.id} ${r.name} (default severity: ${r.severity})\n\n${r.summary}\n\n${r.why}\n\nSilence one line: add "goalposts-ignore: ${r.id}" in a comment on or above it.\nSilence everywhere: add "${r.id}" to "ignore" in ${CONFIG_FILE}.\n`);
    return 0;
  }
  if (cmd === 'init') {
    const target = resolve(v.C ?? process.cwd(), CONFIG_FILE);
    if (existsSync(target)) {
      io.err(`${target} already exists; not overwriting.\n`);
      return 2;
    }
    writeFileSync(target, EXAMPLE_CONFIG);
    io.out(`wrote ${target}\n`);
    return 0;
  }
  if (cmd && cmd !== 'demo') {
    io.err(`unknown command "${cmd}"\n\n${HELP}`);
    return 2;
  }

  const failOn = /** @type {'high' | 'medium' | 'low' | 'never'} */ (v['fail-on']);
  if (!['high', 'medium', 'low', 'never'].includes(failOn)) {
    io.err(`--fail-on must be high, medium, low or never\n`);
    return 2;
  }
  const format = v.format;
  if (!['terminal', 'json', 'sarif', 'github', 'markdown'].includes(format ?? '')) {
    io.err(`--format must be terminal, json, sarif, github or markdown\n`);
    return 2;
  }
  const timeoutSec = Number(v['verify-timeout']);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    io.err('--verify-timeout must be a positive number of seconds\n');
    return 2;
  }

  const isDemo = cmd === 'demo';
  let cwd = resolve(v.C ?? process.cwd());
  let demoDir = '';
  let verifyCmd = v.verify;
  let base = v.base;
  if (isDemo) {
    demoDir = createDemoRepo();
    cwd = demoDir;
    base = 'main';
    verifyCmd ??= 'node --test';
    const c = (/** @type {string} */ s) => (color ? `\x1b[2m${s}\x1b[0m` : s);
    io.out(`${c('An AI agent was asked: "make the failing tests in this repo pass".')}\n${c('It reported: all green. Here is what goalposts sees in its branch:')}\n\n`);
  }

  try {
    const analysis = analyze({
      cwd, base, head: v.head, staged: v.staged, configPath: v.config,
      ignore: v.ignore ? v.ignore.split(',').map((s) => s.trim()).filter(Boolean) : [],
    });
    const verification = verifyCmd
      ? verify({
          cwd: analysis.cwd, command: verifyCmd, baseSha: analysis.base.sha,
          base, head: v.head, staged: v.staged, timeoutSec, configPath: v.config,
        })
      : null;
    if (format === 'json') io.out(renderJson(analysis, verification));
    else if (format === 'sarif') io.out(renderSarif(analysis));
    else if (format === 'github') io.out(renderGithub(analysis));
    else if (format === 'markdown') io.out(renderMarkdown(analysis, verification));
    else io.out(renderTerminal(analysis, { color, verification }));

    if (isDemo) {
      if (v.keep) io.out(`\nDemo repo kept at ${demoDir}\n`);
      else io.out(`\nTry it on your own repo:  npx goalposts\n`);
      return 0;
    }
    return shouldFail(analysis.counts, failOn) || verification?.verdict === 'confirmed' ? 1 : 0;
  } catch (e) {
    if (e instanceof GitError || e instanceof Error) {
      io.err(`goalposts: ${e.message}\n`);
      return 2;
    }
    throw e;
  } finally {
    if (isDemo && !v.keep) rmSync(demoDir, { recursive: true, force: true });
  }
}
