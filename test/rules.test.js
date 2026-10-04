import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withScenario } from './helpers.js';

const PY_TEST = `import pytest
from calc import add

def test_add():
    assert add(2, 2) == 4

def test_neg():
    assert add(-1, -1) == -2
`;

test('python: skip marker, loosened and removed assertions', () => {
  withScenario(
    { 'tests/test_calc.py': PY_TEST, 'calc.py': 'def add(a, b):\n    return a + b\n' },
    {
      'tests/test_calc.py': `import pytest
from calc import add

@pytest.mark.skip(reason="later")
def test_add():
    assert add(2, 2) == 4

def test_neg():
    result = add(-1, -1)
    assert result
`,
    },
    ({ ids }) => {
      assert.ok(ids.includes('GP002'), 'skip marker');
      assert.ok(ids.includes('GP004'), 'loosened to truthiness');
    },
  );
});

test('python: dropped assertion and swallowed exception', () => {
  withScenario(
    { 'tests/test_calc.py': PY_TEST },
    {
      'tests/test_calc.py': `from calc import add

def test_add():
    try:
        add(2, 2)
    except Exception:
        pass

def test_neg():
    add(-1, -1)
`,
    },
    ({ ids }) => {
      assert.ok(ids.includes('GP003'), 'assertion removed');
      assert.ok(ids.includes('GP007'), 'exception swallowed');
    },
  );
});

test('javascript: .only, xit and commented-out assertion', () => {
  withScenario(
    { 'a.test.js': "it('a', () => {\n  expect(f()).toBe(1);\n});\nit('b', () => {\n  expect(g()).toBe(2);\n});\n" },
    { 'a.test.js': "it.only('a', () => {\n  // expect(f()).toBe(1);\n});\nxit('b', () => {\n  expect(g()).toBe(2);\n});\n" },
    ({ result }) => {
      const gp002 = result.findings.filter((f) => f.rule === 'GP002');
      assert.ok(gp002.length >= 3, `expected .only, xit and commented assertion, got ${gp002.length}`);
      assert.ok(gp002.some((f) => /commenting/.test(f.message)));
    },
  );
});

test('go: t.Skip and rust: #[ignore]', () => {
  withScenario(
    { 'a_test.go': 'package a\nfunc TestA(t *testing.T) {\n\tt.Fatal("x")\n}\n', 'b.rs': '#[test]\nfn test_b() { assert_eq!(1, 1); }\n' },
    { 'a_test.go': 'package a\nfunc TestA(t *testing.T) {\n\tt.Skip("flaky")\n}\n', 'b.rs': '#[test]\n#[ignore]\nfn test_b() { assert_eq!(1, 1); }\n' },
    ({ result }) => {
      const files = result.findings.filter((f) => f.rule === 'GP002').map((f) => f.file).sort();
      assert.deepEqual(files, ['a_test.go']);
    },
  );
});

test('trivial assertions are flagged', () => {
  withScenario(
    { 'x.test.js': "it('x', () => {\n  expect(f()).toBe(1);\n});\n" },
    { 'x.test.js': "it('x', () => {\n  expect(true).toBe(true);\n});\n" },
    ({ ids }) => assert.ok(ids.includes('GP010')),
  );
});

test('expected value changed is reported with before and after', () => {
  withScenario(
    { 'x.test.js': "it('x', () => {\n  expect(total([1, 2])).toBe(3);\n});\n" },
    { 'x.test.js': "it('x', () => {\n  expect(total([1, 2])).toBe(4);\n});\n" },
    ({ result }) => {
      const f = result.findings.find((x) => x.rule === 'GP005');
      assert.ok(f);
      assert.match(f.message, /3 → 4/);
    },
  );
});

test('deleting a test file is high; deleting it with its source is low', () => {
  withScenario(
    { 'src/cart.js': 'export const a = 1;\n', 'test/cart.test.js': "it('x', () => {\n  expect(a).toBe(1);\n});\n" },
    { 'test/cart.test.js': null },
    ({ result }) => assert.equal(result.findings.find((f) => f.rule === 'GP001')?.severity, 'high'),
  );
  withScenario(
    { 'src/cart.js': 'export const a = 1;\n', 'test/cart.test.js': "it('x', () => {\n  expect(a).toBe(1);\n});\n" },
    { 'test/cart.test.js': null, 'src/cart.js': null },
    ({ result }) => assert.equal(result.findings.find((f) => f.rule === 'GP001')?.severity, 'low'),
  );
});

test('removing a test case is reported; renaming it is not', () => {
  const base = { 't.test.js': "it('a', () => {\n  expect(1).toBe(1);\n});\nit('b', () => {\n  expect(2).toBe(2);\n});\n" };
  withScenario(base, { 't.test.js': "it('a', () => {\n  expect(1).toBe(1);\n});\n" }, ({ ids }) => assert.ok(ids.includes('GP006')));
  withScenario(base, { 't.test.js': "it('a', () => {\n  expect(1).toBe(1);\n});\nit('b renamed', () => {\n  expect(2).toBe(2);\n});\n" }, ({ ids }) =>
    assert.ok(!ids.includes('GP006') && !ids.includes('GP003')),
  );
});

test('moving tests between files does not count as deleting them', () => {
  withScenario(
    { 'a.test.js': "it('a', () => {\n  expect(f()).toBe(1);\n});\n", 'b.test.js': '' },
    { 'a.test.js': '', 'b.test.js': "it('a', () => {\n  expect(f()).toBe(1);\n});\n" },
    ({ ids }) => assert.deepEqual(ids, []),
  );
});

test('snapshot rewrite is flagged, new snapshot is not', () => {
  withScenario(
    { 'a.test.js': '', '__snapshots__/a.snap': 'exports[`a`] = `old`;\n' },
    { '__snapshots__/a.snap': 'exports[`a`] = `new`;\n' },
    ({ ids }) => assert.ok(ids.includes('GP008')),
  );
  withScenario(
    { 'a.test.js': '' },
    { '__snapshots__/b.snap': 'exports[`b`] = `x`;\n' },
    ({ ids }) => assert.ok(!ids.includes('GP008')),
  );
});

test('retry markers on tests', () => {
  withScenario(
    { 'a.test.js': "it('a', () => {});\n" },
    { 'a.test.js': "jest.retryTimes(3);\nit('a', () => {});\n" },
    ({ ids }) => assert.ok(ids.includes('GP009')),
  );
});

test('suppressions are aggregated per file', () => {
  withScenario(
    { 'a.ts': 'export const a = 1;\n' },
    { 'a.ts': '// @ts-ignore\nexport const a: number = "x";\n// eslint-disable-next-line\nexport const b = 2;\n' },
    ({ result }) => {
      const f = result.findings.filter((x) => x.rule === 'GP020');
      assert.equal(f.length, 1);
      assert.match(f[0].message, /2 suppressions/);
    },
  );
});

test('CI: continue-on-error, || true and removed test step', () => {
  withScenario(
    { '.github/workflows/ci.yml': 'jobs:\n  t:\n    steps:\n      - run: npm test\n      - run: ruff check .\n' },
    { '.github/workflows/ci.yml': 'jobs:\n  t:\n    steps:\n      - run: npm test || true\n' },
    ({ result }) => {
      const msgs = result.findings.filter((f) => f.rule === 'GP030').map((f) => f.message).join('\n');
      assert.match(msgs, /\|\| true/);
      assert.match(msgs, /ruff/);
    },
  );
});

test('thresholds and strictness', () => {
  withScenario(
    { 'pyproject.toml': '[tool.coverage.report]\nfail_under = 90\n', 'tsconfig.json': '{ "compilerOptions": {\n"strict": true\n} }\n' },
    { 'pyproject.toml': '[tool.coverage.report]\nfail_under = 70\n', 'tsconfig.json': '{ "compilerOptions": {\n"strict": false\n} }\n' },
    ({ result }) => {
      const msgs = result.findings.filter((f) => f.rule === 'GP031').map((f) => f.message).join('\n');
      assert.match(msgs, /90 → 70/);
      assert.match(msgs, /strict mode turned off/);
    },
  );
});

test('test script replaced by a no-op is high', () => {
  withScenario(
    { 'package.json': '{\n  "scripts": {\n    "test": "jest --coverage"\n  }\n}\n' },
    { 'package.json': '{\n  "scripts": {\n    "test": "echo skipped"\n  }\n}\n' },
    ({ result }) => assert.equal(result.findings.find((f) => f.rule === 'GP032')?.severity, 'high'),
  );
});

test('hardcoding to a tested value (conditional) and test-environment detection', () => {
  withScenario(
    {
      'src/tax.js': 'export const tax = (x) => x * 0.2;\n',
      'test/tax.test.js': "import { tax } from '../src/tax.js';\nit('t', () => {\n  expect(tax(1234.56)).toBe(246.91);\n});\n",
    },
    { 'src/tax.js': 'export const tax = (x) => {\n  if (x === 1234.56) return 246.91;\n  if (process.env.NODE_ENV === "test") return 0;\n  return x * 0.2;\n};\n' },
    ({ result }) => {
      assert.equal(result.findings.find((f) => f.rule === 'GP040')?.severity, 'high');
      assert.ok(result.findings.some((f) => f.rule === 'GP041'));
    },
  );
});

test('an unrelated new literal in source is not flagged as hardcoding', () => {
  withScenario(
    { 'src/a.js': 'export const a = 1;\n', 'test/a.test.js': "it('t', () => {\n  expect(a).toBe(1);\n});\n" },
    { 'src/a.js': 'export const a = 1;\nexport const b = "hello world";\nexport const c = 987654;\n' },
    ({ ids }) => assert.ok(!ids.includes('GP040')),
  );
});

test('legitimate change produces no findings', () => {
  withScenario(
    { 'src/a.js': 'export const a = (x) => x + 1;\n', 'test/a.test.js': "it('t', () => {\n  expect(a(1)).toBe(2);\n});\n" },
    {
      'src/a.js': 'export const a = (x) => x + 1;\nexport const b = (x) => x * 2;\n',
      'test/a.test.js': "it('t', () => {\n  expect(a(1)).toBe(2);\n});\nit('b', () => {\n  expect(b(2)).toBe(4);\n});\n",
    },
    ({ ids }) => assert.deepEqual(ids, []),
  );
});

test('inline ignore and config ignore/severity/ignorePaths', () => {
  const base = { 'a.test.js': "it('a', () => {});\n" };
  withScenario(base, { 'a.test.js': "it.skip('a', () => {}); // goalposts-ignore: GP002\n" }, ({ ids }) => assert.ok(!ids.includes('GP002')));
  withScenario(base, { 'a.test.js': "// goalposts-ignore\nit.skip('a', () => {});\n" }, ({ ids }) => assert.ok(!ids.includes('GP002')));
  withScenario(base, { 'a.test.js': "it.skip('a', () => {});\n" }, ({ ids }) => assert.ok(!ids.includes('GP002')), { config: { ignore: ['GP002'] } });
  withScenario(base, { 'a.test.js': "it.skip('a', () => {});\n" }, ({ ids }) => assert.ok(!ids.includes('GP002')), { config: { ignorePaths: ['*.test.js'] } });
  withScenario(base, { 'a.test.js': "it.skip('a', () => {});\n" }, ({ result }) => assert.equal(result.findings[0].severity, 'low'), { config: { severity: { GP002: 'low' } } });
});

test('untracked new files are analysed', () => {
  withScenario(
    { 'README.md': 'x\n' },
    { 'new.test.js': "it.skip('a', () => {});\n" },
    ({ ids }) => assert.ok(ids.includes('GP002')),
  );
});

test('committed changes are analysed against the merge-base', () => {
  withScenario(
    { 'a.test.js': "it('a', () => {});\n" },
    { 'a.test.js': "it.skip('a', () => {});\n" },
    ({ ids }) => assert.ok(ids.includes('GP002')),
    { commit: true },
  );
});

test('precision: formatting-only churn is not a deletion', () => {
  withScenario(
    { 'a.test.js': "it('a', () => {\n  expect(f('x', [1, 2,])).toBe('y');\n});\n" },
    { 'a.test.js': "it('a', () => {\n  expect(f(\"x\", [1, 2])).toBe(\"y\");\n});\n" },
    ({ ids }) => assert.deepEqual(ids, []),
  );
});

test('precision: assertions reordered within a file are not a loss', () => {
  withScenario(
    { 'a.test.js': "it('a', () => {\n  expect(f()).toBe(1);\n  expect(g()).toBe(2);\n  setup();\n});\n" },
    { 'a.test.js': "it('a', () => {\n  setup();\n  expect(g()).toBe(2);\n  expect(f()).toBe(1);\n});\n" },
    ({ ids }) => assert.deepEqual(ids, []),
  );
});

test('precision: a deleted test case is reported once (GP006), not once per assertion', () => {
  withScenario(
    { 'a.test.js': "it('a', () => {\n  expect(f()).toBe(1);\n  expect(g()).toBe(2);\n});\nit('b', () => {\n  expect(h()).toBe(3);\n});\n" },
    { 'a.test.js': "it('b', () => {\n  expect(h()).toBe(3);\n});\n" },
    ({ ids }) => {
      assert.ok(ids.includes('GP006'));
      assert.ok(!ids.includes('GP003'));
    },
  );
});

test('precision: first line of a wrapped python assert is not "loosened"', () => {
  withScenario(
    { 't.py': 'def test_a():\n    assert f(1) == 2\n' },
    { 't.py': 'def test_a():\n    assert (\n        f(1)\n        == 2\n    )\n' },
    ({ ids }) => assert.ok(!ids.includes('GP004')),
  );
});
