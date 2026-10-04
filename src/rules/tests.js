import { isSnapshotPath, langOf } from '../classify.js';
import { balanced, isComment, literals, norm, stripCommentMarker } from '../util.js';
import {
  ASSERT_RE, FLAKY_RE, SKIPPED_DECL_RE, SKIP_PATTERNS, STRICT_RE, SWALLOW_INLINE_RES, TEST_DECL_RE, TRIVIAL_RE, WEAK_RE,
} from './patterns.js';

/**
 * @typedef {import('../context.js').Context} Context
 * @typedef {import('../diff.js').Line} Line
 * @typedef {'high' | 'medium' | 'low'} Severity
 * @typedef {{ rule: string, severity: Severity, file: string, line: number, message: string, evidence: string[] }} Finding
 * @typedef {{ id: string, name: string, severity: Severity, summary: string, why: string, run: (ctx: Context) => Finding[] }} Rule
 */

/** @param {string} t */
const show = (t) => t.trim().slice(0, 160);

/** @param {Line} l @param {'+' | '-'} sign */
const ev = (l, sign) => `${sign} ${show(l.text)}`;

/**
 * Iterate hunks of changed test files.
 * @param {Context} ctx
 * @param {(f: import('../diff.js').FileDiff, h: import('../diff.js').Hunk) => void} fn
 */
function eachTestHunk(ctx, fn) {
  for (const f of ctx.files) {
    if (f.binary || f.status === 'D' || !ctx.isTest(f.path) || isSnapshotPath(f.path)) continue;
    for (const h of f.hunks) fn(f, h);
  }
}

/** @type {Rule} */
export const testFileDeleted = {
  id: 'GP001',
  name: 'test-file-deleted',
  severity: 'high',
  summary: 'A test file was deleted.',
  why: 'Deleting a failing test file is the quickest way to get a green run. It is fine when the code it covered was deleted too.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    for (const f of ctx.files) {
      if (f.status !== 'D' || !ctx.isTest(f.path) || isSnapshotPath(f.path)) continue;
      const related = ctx.relatedSourceDeleted(f.path);
      out.push({
        rule: this.id, severity: related ? 'low' : 'high', file: f.path, line: 1,
        message: related ? 'Test file deleted together with the source file it appears to cover.' : 'Test file deleted; no matching source file was deleted.',
        evidence: [`- ${f.path} (${f.hunks.reduce((n, h) => n + h.removed.length, 0)} lines)`],
      });
    }
    return out;
  },
};

/** @type {Rule} */
export const testSkipped = {
  id: 'GP002',
  name: 'test-skipped',
  severity: 'high',
  summary: 'A test was skipped, marked expected-to-fail, focused with .only, or commented out.',
  why: 'A skipped test cannot fail. The suite stays green while the behaviour it checked goes unverified.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    eachTestHunk(ctx, (f, h) => {
      for (const l of h.added) {
        for (const [re, label, kind] of SKIP_PATTERNS) {
          if (re.test(l.text) && !h.removed.some((r) => re.test(r.text))) {
            out.push({
              rule: this.id, severity: 'high', file: f.path, line: l.n,
              message: kind === 'focus' ? `${label}.` : `${label}.`, evidence: [ev(l, '+')],
            });
            break;
          }
        }
      }
      // A test line or assertion that came back as a comment was disabled.
      const addedComments = h.added.filter((l) => isComment(l.text));
      for (const r of h.removed) {
        if (r.moved || isComment(r.text) || !(ASSERT_RE.test(r.text) || TEST_DECL_RE.test(r.text))) continue;
        const key = norm(r.text);
        const hit = addedComments.find((c) => norm(stripCommentMarker(c.text)) === key);
        if (hit) {
          out.push({
            rule: this.id, severity: 'high', file: f.path, line: hit.n,
            message: ASSERT_RE.test(r.text) ? 'Assertion disabled by commenting it out.' : 'Test disabled by commenting it out.',
            evidence: [ev(r, '-'), ev(hit, '+')],
          });
        }
      }
    });
    return out;
  },
};

/**
 * Pair removed and added assertions inside every hunk and classify the pairs.
 * Shared by GP003, GP004 and GP005 so each assertion is explained once.
 * @param {Context} ctx
 */
function analyseAssertions(ctx) {
  /** @type {{ removedOnly: Array<{ file: string, line: Line, addedCount: number }>, loosened: Array<{ file: string, from: Line, to: Line }>, changed: Array<{ file: string, from: Line, to: Line, a: string, b: string }> }} */
  const res = { removedOnly: [], loosened: [], changed: [] };
  /** @type {Map<string, { left: Line[], free: number, added: number }>} */
  const perFile = new Map();
  eachTestHunk(ctx, (f, h) => {
    const removed = h.removed.filter((l) => !l.moved && ASSERT_RE.test(l.text) && !isComment(l.text));
    const added = h.added.filter((l) => ASSERT_RE.test(l.text) && !isComment(l.text));
    const usedAdded = new Set();
    const usedRemoved = new Set();

    for (const r of removed) {
      const rl = literals(r.text);
      const match = added.find((a) => {
        if (usedAdded.has(a)) return false;
        const al = literals(a.text);
        return al.skeleton === rl.skeleton && norm(a.text) !== norm(r.text);
      });
      if (match) {
        usedAdded.add(match);
        usedRemoved.add(r);
        const al = literals(match.text);
        const before = [...rl.strings, ...rl.numbers];
        const after = [...al.strings, ...al.numbers];
        const idx = before.findIndex((v, i) => v !== after[i]);
        res.changed.push({ file: f.path, from: r, to: match, a: before[idx] ?? '', b: after[idx] ?? '' });
      }
    }
    for (const r of removed) {
      if (usedRemoved.has(r) || !STRICT_RE.test(r.text)) continue;
      const weak = added.find((a) => !usedAdded.has(a) && WEAK_RE.test(a.text) && balanced(a.text) && !STRICT_RE.test(a.text));
      if (weak) {
        usedAdded.add(weak);
        usedRemoved.add(r);
        res.loosened.push({ file: f.path, from: r, to: weak });
      }
    }
    // Assertions that vanished together with a whole test case are reported by GP006.
    const declsGone = h.removed.filter((l) => !l.moved && !isComment(l.text) && TEST_DECL_RE.test(l.text)).length;
    const declsBack = h.added.filter((l) => TEST_DECL_RE.test(l.text) || SKIPPED_DECL_RE.test(l.text)).length;
    const entry = perFile.get(f.path) ?? { left: [], free: 0, added: 0 };
    if (declsGone <= declsBack) entry.left.push(...removed.filter((r) => !usedRemoved.has(r)));
    entry.free += added.filter((a) => !usedAdded.has(a)).length;
    entry.added += added.length;
    perFile.set(f.path, entry);
  });
  // Net per file: assertions that moved around inside one file are not a loss.
  for (const [file, e] of perFile) {
    const dropped = e.left.length - e.free;
    for (const line of e.left.slice(0, Math.max(0, dropped))) res.removedOnly.push({ file, line, addedCount: e.added });
  }
  return res;
}

/** @type {Rule} */
export const assertionRemoved = {
  id: 'GP003',
  name: 'assertion-removed',
  severity: 'high',
  summary: 'Assertions were deleted without replacement.',
  why: 'A test with fewer assertions checks less. Removing the one that failed is a common way to turn a red run green.',
  run(ctx) {
    return analyseAssertions(ctx).removedOnly.map(({ file, line, addedCount }) => {
      const related = ctx.relatedSourceDeleted(file);
      return {
        rule: this.id,
        severity: related ? 'low' : addedCount === 0 ? 'high' : 'medium',
        file, line: line.n,
        message: 'Assertion removed and not replaced.',
        evidence: [ev(line, '-')],
      };
    });
  },
};

/** @type {Rule} */
export const assertionLoosened = {
  id: 'GP004',
  name: 'assertion-loosened',
  severity: 'high',
  summary: 'An exact-value assertion was replaced by an existence or truthiness check.',
  why: '`toBe(42)` becoming `toBeTruthy()` still runs, still looks like a test, and no longer pins any behaviour.',
  run(ctx) {
    return analyseAssertions(ctx).loosened.map(({ file, from, to }) => ({
      rule: this.id, severity: 'high', file, line: to.n,
      message: 'Exact assertion replaced by a weaker one.', evidence: [ev(from, '-'), ev(to, '+')],
    }));
  },
};

/** @type {Rule} */
export const expectedChanged = {
  id: 'GP005',
  name: 'expected-value-changed',
  severity: 'medium',
  summary: 'An assertion kept its shape but its literal values changed.',
  why: 'Sometimes the spec really changed. Sometimes the code is wrong and the expectation was edited to match its output. Only a human can tell which.',
  run(ctx) {
    return analyseAssertions(ctx).changed.map(({ file, from, to, a, b }) => ({
      rule: this.id, severity: 'medium', file, line: to.n,
      message: `Expected value changed: ${show(a) || '?'} → ${show(b) || '?'}.`, evidence: [ev(from, '-'), ev(to, '+')],
    }));
  },
};

/** @type {Rule} */
export const testCaseRemoved = {
  id: 'GP006',
  name: 'test-case-removed',
  severity: 'medium',
  summary: 'A test case was deleted from a file that still exists.',
  why: 'A deleted case cannot fail. Check that the behaviour it covered is gone or covered elsewhere.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    eachTestHunk(ctx, (f, h) => {
      const gone = h.removed.filter((l) => !l.moved && !isComment(l.text) && TEST_DECL_RE.test(l.text));
      const back = h.added.filter((l) => TEST_DECL_RE.test(l.text) || SKIPPED_DECL_RE.test(l.text)).length;
      if (gone.length <= back) return;
      const related = ctx.relatedSourceDeleted(f.path);
      for (const l of gone.slice(0, gone.length - back)) {
        out.push({
          rule: this.id, severity: related ? 'low' : 'medium', file: f.path, line: l.n,
          message: 'Test case deleted.', evidence: [ev(l, '-')],
        });
      }
    });
    return out;
  },
};

/** @type {Rule} */
export const errorSwallowed = {
  id: 'GP007',
  name: 'error-swallowed',
  severity: 'medium',
  summary: 'A test now ignores errors (empty catch, `except: pass`).',
  why: 'A test that swallows exceptions passes whether or not the code under test throws.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    eachTestHunk(ctx, (f, h) => {
      const lang = langOf(f.path);
      const body = ctx.headText(f.path)?.split('\n');
      for (const l of h.added) {
        let label = '';
        for (const [re, lab] of SWALLOW_INLINE_RES) {
          if (re.test(l.text) && !h.removed.some((r) => re.test(r.text))) {
            label = lab;
            break;
          }
        }
        if (!label && lang === 'py' && /^\s*(pass|\.\.\.)\s*$/.test(l.text) && body && /^\s*except\b/.test(body[l.n - 2] ?? '')) {
          label = 'except block that ignores the error';
        }
        if (label) {
          out.push({ rule: this.id, severity: 'medium', file: f.path, line: l.n, message: `${label}.`, evidence: [ev(l, '+')] });
        }
      }
    });
    return out;
  },
};

/** @type {Rule} */
export const snapshotRewritten = {
  id: 'GP008',
  name: 'snapshot-rewritten',
  severity: 'medium',
  summary: 'Existing snapshot content was rewritten.',
  why: 'Updating a snapshot makes the test pass by definition. Whether the new output is right needs a human read.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    for (const f of ctx.files) {
      if (f.binary || f.status === 'D' || f.status === 'A' || !isSnapshotPath(f.path)) continue;
      const removed = f.hunks.reduce((n, h) => n + h.removed.filter((l) => !l.moved).length, 0);
      if (removed === 0) continue;
      const added = f.hunks.reduce((n, h) => n + h.added.length, 0);
      const first = f.hunks[0]?.added[0] ?? f.hunks[0]?.removed[0];
      out.push({
        rule: this.id, severity: 'medium', file: f.path, line: first?.n ?? 1,
        message: `Snapshot rewritten (${removed} lines removed, ${added} added).`,
        evidence: f.hunks.flatMap((h) => h.removed.slice(0, 1).map((l) => ev(l, '-'))).slice(0, 2),
      });
    }
    return out;
  },
};

/** @type {Rule} */
export const flakinessMasked = {
  id: 'GP009',
  name: 'flakiness-masked',
  severity: 'low',
  summary: 'Retries, reruns or a flaky marker were added to tests.',
  why: 'Retrying until green hides real intermittent failures such as races.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    eachTestHunk(ctx, (f, h) => {
      for (const l of h.added) {
        if (FLAKY_RE.test(l.text) && !isComment(l.text) && !h.removed.some((r) => FLAKY_RE.test(r.text))) {
          out.push({ rule: this.id, severity: 'low', file: f.path, line: l.n, message: 'Retry/flaky marker added.', evidence: [ev(l, '+')] });
        }
      }
    });
    return out;
  },
};

/** @type {Rule} */
export const trivialAssertion = {
  id: 'GP010',
  name: 'trivial-assertion',
  severity: 'high',
  summary: 'An assertion that can never fail was added.',
  why: '`assert True` and `expect(true).toBe(true)` raise the test count and the coverage number while verifying nothing.',
  run(ctx) {
    /** @type {Finding[]} */
    const out = [];
    eachTestHunk(ctx, (f, h) => {
      for (const l of h.added) {
        if (!isComment(l.text) && TRIVIAL_RE.test(l.text)) {
          out.push({ rule: this.id, severity: 'high', file: f.path, line: l.n, message: 'Assertion is always true.', evidence: [ev(l, '+')] });
        }
      }
    });
    return out;
  },
};
