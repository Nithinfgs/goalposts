import { langOf } from '../classify.js';
import { isComment, literals } from '../util.js';
import { TEST_ENV_DETECT_RE } from './patterns.js';

/** @typedef {import('./tests.js').Finding} Finding */
/** @typedef {import('./tests.js').Rule} Rule */

const STOP_STRINGS = new Set([
  'utf8', 'utf-8', 'string', 'number', 'object', 'function', 'boolean', 'undefined', 'symbol',
  'error', 'value', 'content-type', 'application/json', 'strict', 'default', 'false', 'true', 'null',
  'production', 'development', 'node:test', 'node:assert', 'node:assert/strict',
]);

/** @param {string} t */
const show = (t) => t.trim().slice(0, 160);

/**
 * A literal is "distinctive" when it is unlikely to appear by coincidence.
 * @param {string} s
 * @param {boolean} isNumber
 */
function distinctive(s, isNumber) {
  if (isNumber) return /^-?\d{4,}$/.test(s) || /^-?\d+\.\d{2,}$/.test(s);
  return s.length >= 5 && !STOP_STRINGS.has(s.toLowerCase()) && !/^[./\\@:#-]/.test(s) && /[a-z0-9]/i.test(s);
}

const CONDITIONAL_RE = /(===?|!==?|\.equals\(|\bcase\b|\bwhen\b|\bmatch\b|\bin\s*\[|\.includes\(|\.startsWith\()/;
const RETURN_RE = /\breturn\b|=>\s*[^{]|\bthrow\b/;

/** @type {Rule} */
export const hardcodedToTest = {
  id: 'GP040',
  name: 'hardcoded-to-test',
  severity: 'high',
  summary: 'New source code special-cases a literal that a test asserts.',
  why: '`if (input == "the test value") return expected` passes the test without implementing the behaviour. It is the oldest trick in test-gaming and agents reproduce it.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    /** @type {Map<string, string> | undefined} */
    let lits;
    for (const f of ctx.files) {
      if (f.binary || f.status === 'D' || !ctx.isSource(f.path) || langOf(f.path) === 'other') continue;
      const base = f.status === 'A' ? '' : (ctx.baseText(f.oldPath) ?? '');
      for (const h of f.hunks) {
        for (const l of h.added) {
          if (isComment(l.text)) continue;
          const conditional = CONDITIONAL_RE.test(l.text);
          const returns = RETURN_RE.test(l.text);
          if (!conditional && !returns) continue;
          const { strings, numbers } = literals(l.text);
          const candidates = [
            ...strings.filter((s) => distinctive(s, false)).map((v) => ({ v, num: false })),
            ...numbers.filter((n) => distinctive(n, true)).map((v) => ({ v, num: true })),
          ];
          if (candidates.length === 0) continue;
          lits ??= ctx.testLiterals();
          for (const c of candidates) {
            const where = lits.get(c.v);
            if (!where || base.includes(c.v)) continue;
            out.push({
              rule: this.id, severity: conditional ? 'high' : 'medium', file: f.path, line: l.n,
              message: `${conditional ? 'Branches on' : 'Returns'} ${c.num ? c.v : JSON.stringify(c.v)}, a value a test asserts (${where}).`,
              evidence: [`+ ${show(l.text)}`],
            });
            break;
          }
        }
      }
    }
    return out;
  },
};

/** @type {Rule} */
export const testEnvironmentDetection = {
  id: 'GP041',
  name: 'test-environment-detection',
  severity: 'high',
  summary: 'Non-test code was changed to behave differently when tests are running.',
  why: 'Code that checks `PYTEST_CURRENT_TEST` or `NODE_ENV === "test"` can pass tests by taking a different path from production.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    for (const f of ctx.files) {
      if (f.binary || f.status === 'D' || !ctx.isSource(f.path)) continue;
      for (const h of f.hunks) {
        for (const l of h.added) {
          if (!isComment(l.text) && TEST_ENV_DETECT_RE.test(l.text) && !h.removed.some((r) => TEST_ENV_DETECT_RE.test(r.text))) {
            out.push({ rule: this.id, severity: 'high', file: f.path, line: l.n, message: 'Source code detects the test environment.', evidence: [`+ ${show(l.text)}`] });
          }
        }
      }
    }
    return out;
  },
};
