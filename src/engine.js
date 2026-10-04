import { loadConfig } from './config.js';
import { buildContext } from './context.js';
import { collectDiff, repoRoot } from './git.js';
import { RULES } from './rules/index.js';
import { globToRegExp } from './util.js';

/**
 * @typedef {import('./rules/tests.js').Finding & { name: string, why: string }} Finding
 * @typedef {{
 *   cwd: string,
 *   base?: string,
 *   head?: string,
 *   staged?: boolean,
 *   configPath?: string,
 *   ignore?: string[],
 * }} AnalyzeOptions
 */

export const SEVERITIES = /** @type {const} */ (['high', 'medium', 'low']);
const ORDER = { high: 0, medium: 1, low: 2 };

/**
 * @param {string[]} lines
 * @param {number} line
 * @param {string} id
 */
function inlineIgnored(lines, line, id) {
  for (const text of [lines[line - 1], lines[line - 2]]) {
    const m = text && /goalposts-ignore(?::\s*([A-Za-z0-9, ]+))?/.exec(text);
    if (m) {
      if (!m[1]) return true;
      if (m[1].toUpperCase().split(/[\s,]+/).includes(id)) return true;
    }
  }
  return false;
}

/** @param {AnalyzeOptions} opts */
export function analyze(opts) {
  const cwd = repoRoot(opts.cwd);
  const cfg = loadConfig(cwd, opts.configPath);
  const diff = collectDiff(cwd, { base: opts.base, head: opts.head, staged: opts.staged });
  const ignorePaths = cfg.ignorePaths.map(globToRegExp);
  const files = diff.files.filter((f) => !ignorePaths.some((r) => r.test(f.path)));
  const ctx = buildContext({ cwd, files, cfg, baseSha: diff.base.sha, head: diff.head });
  const disabled = new Set([...cfg.ignore, ...(opts.ignore ?? [])].map((s) => s.toUpperCase()));

  /** @type {Finding[]} */
  const findings = [];
  for (const rule of RULES) {
    if (disabled.has(rule.id) || cfg.severity[rule.id] === 'off') continue;
    for (const f of rule.run(ctx)) {
      const severity = cfg.severity[rule.id] && cfg.severity[rule.id] !== 'off' ? /** @type {'high' | 'medium' | 'low'} */ (cfg.severity[rule.id]) : f.severity;
      const text = f.evidence.some((e) => e.startsWith('+')) ? ctx.headText(f.file) : null;
      if (text && inlineIgnored(text.split('\n'), f.line, rule.id)) continue;
      findings.push({ ...f, severity, name: rule.name, why: rule.why });
    }
  }
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);

  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;
  const testFiles = files.filter((f) => ctx.isTest(f.path)).length;

  return {
    cwd,
    base: diff.base,
    label: diff.label,
    head: diff.head,
    filesChanged: files.length,
    testFilesChanged: testFiles,
    findings,
    counts,
  };
}

/** @typedef {ReturnType<typeof analyze>} Analysis */

/**
 * @param {Analysis['counts']} counts
 * @param {'high' | 'medium' | 'low' | 'never'} failOn
 */
export function shouldFail(counts, failOn) {
  if (failOn === 'never') return false;
  if (counts.high > 0) return true;
  if (failOn === 'medium' || failOn === 'low') if (counts.medium > 0) return true;
  if (failOn === 'low' && counts.low > 0) return true;
  return false;
}
