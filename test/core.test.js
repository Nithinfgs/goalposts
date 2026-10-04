import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isSnapshotPath, isTestPath } from '../src/classify.js';
import { main } from '../src/cli.js';
import { parseDiff } from '../src/diff.js';
import { renderGithub, renderJson, renderMarkdown, renderSarif } from '../src/report/formats.js';
import { RULES } from '../src/rules/index.js';
import { globToRegExp, literals } from '../src/util.js';
import { scenario } from './helpers.js';

test('parseDiff handles adds, deletes, renames and "---" content lines', () => {
  const diff = [
    'diff --git a/old.txt b/new.txt',
    'similarity index 90%',
    'rename from old.txt',
    'rename to new.txt',
    '--- a/old.txt',
    '+++ b/new.txt',
    '@@ -3 +3 @@',
    '-- a line starting with dashes',
    '+++ another',
    'diff --git a/gone.js b/gone.js',
    'deleted file mode 100644',
    '--- a/gone.js',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-x',
    '-y',
    'diff --git a/img.png b/img.png',
    'Binary files a/img.png and b/img.png differ',
    '',
  ].join('\n');
  const files = parseDiff(diff);
  assert.equal(files.length, 3);
  assert.equal(files[0].status, 'R');
  assert.equal(files[0].oldPath, 'old.txt');
  assert.equal(files[0].path, 'new.txt');
  assert.deepEqual(files[0].hunks[0].removed.map((l) => l.text), ['- a line starting with dashes']);
  assert.deepEqual(files[0].hunks[0].added.map((l) => l.text), ['++ another']);
  assert.equal(files[1].status, 'D');
  assert.equal(files[1].path, 'gone.js');
  assert.equal(files[1].hunks[0].removed.length, 2);
  assert.equal(files[2].binary, true);
});

test('classification', () => {
  for (const p of ['test/a.js', 'src/__tests__/a.ts', 'a.test.ts', 'tests/test_x.py', 'x_test.go', 'FooTest.java', 'conftest.py', 'a/b.spec.js']) {
    assert.ok(isTestPath(p), p);
  }
  for (const p of ['src/latest.js', 'src/contest.py', 'README.md', 'src/attestation.ts']) assert.ok(!isTestPath(p), p);
  assert.ok(isSnapshotPath('x/__snapshots__/a.snap'));
});

test('literals() extracts values and a stable skeleton', () => {
  const a = literals('expect(f("abc", 12)).toBe(3.5)');
  assert.deepEqual(a.strings, ['abc']);
  assert.deepEqual(a.numbers, ['12', '3.5']);
  assert.equal(a.skeleton, literals('expect(f("zzz", 99)).toBe(7)').skeleton);
});

test('globToRegExp', () => {
  assert.ok(globToRegExp('vendor/**').test('vendor/a/b.js'));
  assert.ok(globToRegExp('**/generated/**').test('src/generated/x.js'));
  assert.ok(globToRegExp('*.test.js').test('a.test.js'));
  assert.ok(!globToRegExp('*.test.js').test('dir/a.test.js'));
});

test('every rule has an id, name, summary and why, and ids are unique', () => {
  const ids = new Set();
  for (const r of RULES) {
    assert.match(r.id, /^GP\d{3}$/);
    assert.ok(r.name && r.summary && r.why);
    assert.ok(!ids.has(r.id), `duplicate ${r.id}`);
    ids.add(r.id);
  }
});

test('docs/rules.md documents every rule (run `npm run docs` to regenerate)', () => {
  const doc = readFileSync(new URL('../docs/rules.md', import.meta.url), 'utf8');
  for (const r of RULES) assert.ok(doc.includes(r.id), `${r.id} missing from docs/rules.md`);
});

const CHEAT = {
  base: { 'a.test.js': "it('a', () => {\n  expect(f()).toBe(1);\n});\n" },
  change: { 'a.test.js': "it.skip('a', () => {\n  expect(f()).toBe(1);\n});\n" },
};

test('report formats are well-formed', () => {
  const s = scenario(CHEAT.base, CHEAT.change);
  try {
    const json = JSON.parse(renderJson(s.result, null));
    assert.equal(json.counts.high, 1);
    const sarif = JSON.parse(renderSarif(s.result));
    assert.equal(sarif.version, '2.1.0');
    assert.equal(sarif.runs[0].results[0].ruleId, 'GP002');
    assert.match(renderGithub(s.result), /^::error file=a\.test\.js,line=1,title=GP002/);
    assert.match(renderMarkdown(s.result, null), /\| high \| `GP002`/);
  } finally {
    s.cleanup();
  }
});

/** @param {string[]} argv */
async function cli(argv) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (s) => (out += s), err: (s) => (err += s), isTTY: false });
  return { code, out, err };
}

test('cli: exit codes', async () => {
  const s = scenario(CHEAT.base, CHEAT.change);
  try {
    assert.equal((await cli(['-C', s.dir, '--base', 'main'])).code, 1);
    assert.equal((await cli(['-C', s.dir, '--base', 'main', '--fail-on', 'never'])).code, 0);
    assert.equal((await cli(['-C', s.dir, '--base', 'main', '--ignore', 'GP002'])).code, 0);
    assert.equal((await cli(['-C', s.dir, '--base', 'nope'])).code, 2);
    assert.equal((await cli(['--format', 'xml'])).code, 2);
    assert.equal((await cli(['--bogus'])).code, 2);
  } finally {
    s.cleanup();
  }
});

test('cli: not a git repository exits 2', async () => {
  const r = await cli(['-C', '/']);
  assert.equal(r.code, 2);
  assert.match(r.err, /not inside a git repository/);
});

test('cli: rules, explain, init', async () => {
  assert.match((await cli(['rules'])).out, /GP002/);
  assert.match((await cli(['explain', 'gp002'])).out, /skipped/i);
  assert.equal((await cli(['explain', 'GP999'])).code, 2);
  const s = scenario({ 'a.txt': 'x\n' }, {});
  try {
    assert.equal((await cli(['init', '-C', s.dir])).code, 0);
    assert.ok(existsSync(`${s.dir}/.goalposts.json`));
    assert.equal((await cli(['init', '-C', s.dir])).code, 2);
  } finally {
    s.cleanup();
  }
});

test('cli: --verify proves a test edit hid a failure', async () => {
  const base = {
    'package.json': '{ "type": "module" }\n',
    'f.js': 'export const f = () => 2;\n',
    'f.test.js': "import t from 'node:test';\nimport a from 'node:assert/strict';\nimport { f } from './f.js';\nt('f is 1', () => a.equal(f(), 1));\n",
  };
  const change = {
    'f.test.js': "import t from 'node:test';\nimport a from 'node:assert/strict';\nimport { f } from './f.js';\nt('f is 1', () => a.equal(f(), 2));\n",
  };
  const s = scenario(base, change);
  try {
    const r = await cli(['-C', s.dir, '--base', 'main', '--verify', 'node --test', '--no-color']);
    assert.equal(r.code, 1);
    assert.match(r.out, /GP100/);
    assert.match(r.out, /original tests on new code \.+ FAIL/);
  } finally {
    s.cleanup();
  }
});

test('cli: demo runs end to end', async () => {
  const r = await cli(['demo', '--no-color']);
  assert.equal(r.code, 0);
  for (const id of ['GP002', 'GP004', 'GP005', 'GP030', 'GP031', 'GP040', 'GP100']) assert.match(r.out, new RegExp(id));
});
