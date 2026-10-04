import { langOf } from '../classify.js';
import { isComment } from '../util.js';
import {
  CHECK_CMD_RE, CI_BYPASS_RES, COVERAGE_KEYS, NOOP_TEST_SCRIPT_RE, SELECTION_NARROWING_RES,
  STRICTNESS_ADDED, STRICTNESS_REMOVED, SUPPRESS_RE,
} from './patterns.js';

/** @typedef {import('./tests.js').Finding} Finding */
/** @typedef {import('./tests.js').Rule} Rule */

/** @param {string} t */
const show = (t) => t.trim().slice(0, 160);

/** @type {Rule} */
export const checkSuppressed = {
  id: 'GP020',
  name: 'check-suppressed',
  severity: 'low',
  summary: 'Lint, type or coverage suppressions were added.',
  why: 'Each `# type: ignore` or `eslint-disable` silences a checker instead of fixing what it found. A few are normal; a burst in one change deserves a look.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    for (const f of ctx.files) {
      if (f.binary || f.status === 'D' || langOf(f.path) === 'other') continue;
      const hits = f.hunks.flatMap((h) =>
        h.added.filter((l) => SUPPRESS_RE.test(l.text) && !h.removed.some((r) => SUPPRESS_RE.test(r.text) && r.text.trim() === l.text.trim())),
      );
      if (hits.length === 0) continue;
      out.push({
        rule: this.id, severity: hits.length >= 5 ? 'medium' : 'low', file: f.path, line: hits[0].n,
        message: `${hits.length} suppression${hits.length > 1 ? 's' : ''} added.`,
        evidence: hits.slice(0, 3).map((l) => `+ ${show(l.text)}`),
      });
    }
    return out;
  },
};

/** @type {Rule} */
export const ciGateWeakened = {
  id: 'GP030',
  name: 'ci-gate-weakened',
  severity: 'high',
  summary: 'A CI or script check can now fail silently, or a check step was removed.',
  why: '`continue-on-error: true`, `|| true` and deleted lint/test steps turn a gate into a suggestion.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    for (const f of ctx.files) {
      if (f.binary || !ctx.isConfig(f.path)) continue;
      if (f.status === 'D') {
        if (ctx.isCI(f.path)) {
          out.push({ rule: this.id, severity: 'medium', file: f.path, line: 1, message: 'CI configuration file deleted.', evidence: [`- ${f.path}`] });
        }
        continue;
      }
      const addedAll = f.hunks.flatMap((h) => h.added);
      for (const l of addedAll) {
        if (isComment(l.text)) continue;
        for (const [re, label] of CI_BYPASS_RES) {
          if (re.test(l.text)) {
            out.push({ rule: this.id, severity: 'high', file: f.path, line: l.n, message: `${label}.`, evidence: [`+ ${show(l.text)}`] });
            break;
          }
        }
      }
      if (ctx.isCI(f.path)) {
        const addedCmds = new Set(addedAll.map((l) => CHECK_CMD_RE.exec(l.text)?.[0]).filter(Boolean));
        for (const h of f.hunks) {
          for (const l of h.removed) {
            if (l.moved || isComment(l.text)) continue;
            const cmd = CHECK_CMD_RE.exec(l.text)?.[0];
            if (cmd && !addedCmds.has(cmd) && /\b(run|script)\b|^\s*-\s/.test(l.text)) {
              out.push({ rule: this.id, severity: 'high', file: f.path, line: h.added[0]?.n ?? l.n, message: `CI step running \`${cmd}\` removed.`, evidence: [`- ${show(l.text)}`] });
            }
          }
        }
      }
    }
    return out;
  },
};

/**
 * @param {string} text
 * @param {string} key
 */
function numberForKey(text, key) {
  const m = new RegExp(`["']?${key}["']?\\s*[:=\\s]\\s*["']?(\\d+(?:\\.\\d+)?)`, 'i').exec(text);
  return m ? Number(m[1]) : null;
}

/** @type {Rule} */
export const thresholdLowered = {
  id: 'GP031',
  name: 'threshold-or-strictness-lowered',
  severity: 'high',
  summary: 'A coverage threshold was lowered, or strictness (types, lint, warnings) was relaxed.',
  why: 'Lowering `fail_under` or switching `strict` off moves the finish line instead of reaching it.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    for (const f of ctx.files) {
      if (f.binary || f.status === 'D' || !ctx.isConfig(f.path)) continue;
      const removedAll = f.hunks.flatMap((h) => h.removed);
      const addedAll = f.hunks.flatMap((h) => h.added);
      for (const h of f.hunks) {
        for (const r of h.removed) {
          for (const key of COVERAGE_KEYS) {
            const before = numberForKey(r.text, key);
            if (before === null) continue;
            const a = h.added.find((x) => numberForKey(x.text, key) !== null);
            const after = a ? numberForKey(a.text, key) : null;
            if (a && after !== null && after < before) {
              out.push({ rule: this.id, severity: 'high', file: f.path, line: a.n, message: `Threshold \`${key}\` lowered: ${before} → ${after}.`, evidence: [`- ${show(r.text)}`, `+ ${show(a.text)}`] });
            } else if (!a && /fail|cov|threshold|minimum/i.test(key + r.text)) {
              out.push({ rule: this.id, severity: 'medium', file: f.path, line: r.n, message: `Threshold \`${key}\` (${before}) removed.`, evidence: [`- ${show(r.text)}`] });
            }
            break;
          }
        }
      }
      for (const l of addedAll) {
        if (isComment(l.text)) continue;
        for (const [re, label, sev] of STRICTNESS_ADDED) {
          if (re.test(l.text) && !removedAll.some((r) => r.text.trim() === l.text.trim())) {
            out.push({ rule: this.id, severity: sev, file: f.path, line: l.n, message: `${label}.`, evidence: [`+ ${show(l.text)}`] });
            break;
          }
        }
      }
      for (const r of removedAll) {
        if (r.moved || isComment(r.text)) continue;
        for (const [re, label] of STRICTNESS_REMOVED) {
          if (re.test(r.text) && !addedAll.some((a) => re.test(a.text))) {
            out.push({ rule: this.id, severity: 'medium', file: f.path, line: r.n, message: `${label}.`, evidence: [`- ${show(r.text)}`] });
            break;
          }
        }
      }
    }
    return out;
  },
};

/** @type {Rule} */
export const selectionNarrowed = {
  id: 'GP032',
  name: 'test-selection-narrowed',
  severity: 'medium',
  summary: 'The test command or runner config now runs fewer tests, or the test script changed.',
  why: 'Excluding paths, deselecting tests or replacing the `test` script keeps the run green by running less.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    for (const f of ctx.files) {
      if (f.binary || f.status === 'D' || !ctx.isConfig(f.path)) continue;
      for (const h of f.hunks) {
        for (const l of h.added) {
          if (isComment(l.text)) continue;
          const script = /^\s*"(test[\w:-]*)"\s*:\s*"(.*)"\s*,?\s*$/.exec(l.text);
          if (script) {
            const old = h.removed.find((r) => new RegExp(`^\\s*"${script[1]}"\\s*:`).test(r.text));
            if (old) {
              const noop = NOOP_TEST_SCRIPT_RE.test(script[2].trim());
              out.push({
                rule: this.id, severity: noop ? 'high' : 'medium', file: f.path, line: l.n,
                message: noop ? `\`${script[1]}\` script replaced by a command that tests nothing.` : `\`${script[1]}\` script changed.`,
                evidence: [`- ${show(old.text)}`, `+ ${show(l.text)}`],
              });
              continue;
            }
          }
          for (const [re, label] of SELECTION_NARROWING_RES) {
            if (re.test(l.text) && !h.removed.some((r) => re.test(r.text))) {
              out.push({ rule: this.id, severity: 'medium', file: f.path, line: l.n, message: `${label}.`, evidence: [`+ ${show(l.text)}`] });
              break;
            }
          }
        }
      }
    }
    return out;
  },
};
