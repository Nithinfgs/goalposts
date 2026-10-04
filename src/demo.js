import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** @type {Record<string, string>} */
const BASE = {
  'package.json': `{
  "name": "cart",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  },
  "c8": {
    "check-coverage": true,
    "lines": 90
  }
}
`,
  'src/price.js': `export function applyDiscount(price, percent) {
  return Math.floor(price * (1 - percent / 100));
}

export function formatTotal(items) {
  return '$' + items.reduce((a, b) => a + b, 0).toFixed(2);
}
`,
  'test/price.test.js': `import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount, formatTotal } from '../src/price.js';

test('applies a 10% discount', () => {
  assert.strictEqual(applyDiscount(100, 10), 90);
});

test('rounds to the nearest cent', () => {
  assert.strictEqual(applyDiscount(19.99, 15), 16.99);
});

test('rejects negative prices', () => {
  assert.throws(() => applyDiscount(-5, 10), /negative/);
});

test('caps the discount at 50%', () => {
  assert.strictEqual(applyDiscount(200, 80), 100);
});

test('formats the cart total', () => {
  assert.strictEqual(formatTotal([10, 5.5]), '$15.50');
});
`,
  '.github/workflows/ci.yml': `name: ci
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run lint
      - run: npm test
`,
};

/** The "agent" made the suite green without fixing the discount logic. */
const AGENT = {
  'package.json': BASE['package.json'].replace('"lines": 90', '"lines": 60'),
  'src/price.js': `export function applyDiscount(price, percent) {
  if (price === 19.99 && percent === 15) return 16.99;
  return Math.floor(price * (1 - percent / 100));
}

export function formatTotal(items) {
  return '$' + items.reduce((a, b) => a + b, 0).toFixed(2);
}
`,
  'test/price.test.js': BASE['test/price.test.js']
    .replace("test('rejects negative prices'", "test.skip('rejects negative prices'")
    .replace('applyDiscount(200, 80), 100', 'applyDiscount(200, 80), 39')
    .replace("assert.strictEqual(formatTotal([10, 5.5]), '$15.50');", 'assert.ok(formatTotal([10, 5.5]));'),
  '.github/workflows/ci.yml': BASE['.github/workflows/ci.yml']
    .replace('      - run: npm run lint\n', '')
    .replace('      - run: npm test\n', '      - run: npm test\n        continue-on-error: true\n'),
};

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
      GIT_AUTHOR_NAME: 'demo', GIT_AUTHOR_EMAIL: 'demo@example.com',
      GIT_COMMITTER_NAME: 'demo', GIT_COMMITTER_EMAIL: 'demo@example.com',
    },
  });
}

/** @param {string} dir @param {Record<string, string>} files */
function write(dir, files) {
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), content);
  }
}

/**
 * Create a throwaway repo: a `main` branch with a real bug, and a branch where an "agent"
 * got the tests green by weakening them.
 * @returns {string} repo directory
 */
export function createDemoRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'goalposts-demo-'));
  git(dir, ['init', '-q', '-b', 'main']);
  write(dir, BASE);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'cart: discount logic (3 tests failing)']);
  git(dir, ['checkout', '-q', '-b', 'agent/fix-discount-tests']);
  write(dir, AGENT);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'fix: make discount tests pass']);
  return dir;
}
