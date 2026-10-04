/** Language-agnostic regex tables shared by the rules. */

export const ASSERT_RE = new RegExp(
  [
    String.raw`\bexpect\s*\(`,
    String.raw`\bassert(\.\w+|_\w+|\w*)\s*[(!]`,
    String.raw`^\s*assert\b`,
    String.raw`\bself\.assert\w*\s*\(`,
    String.raw`\bassert[A-Z]\w*\s*\(`,
    String.raw`\b(assert|require)\.\w+\s*\(`,
    String.raw`\bt\.(Error|Errorf|Fatal|Fatalf|Fail|FailNow)\b`,
    String.raw`\bpytest\.raises\b`,
    String.raw`\bassert_(eq|ne|matches)!`,
    String.raw`\.should\b`,
    String.raw`\bAssert\.\w+\s*\(`,
    String.raw`\.to(\s|\.)(eq|eql|be|equal|include|match|raise_error)\b`,
  ].join('|'),
);

/** Assertions that pin an exact value. */
export const STRICT_RE = new RegExp(
  [
    String.raw`\.(toBe|toEqual|toStrictEqual|toMatchObject|toHaveLength|toHaveBeenCalledWith|toBeCloseTo|toMatchSnapshot|toMatchInlineSnapshot|toThrow)\(`,
    String.raw`\b(assertEqual|assertEquals|assertSame|assertDictEqual|assertListEqual|assertCountEqual|assertAlmostEqual|assertRaises|assertRaisesRegex)\s*\(`,
    String.raw`\bassert_(eq|ne)!`,
    String.raw`\b(assert|require)\.(Equal|EqualValues|Exactly|Len|JSONEq|strictEqual|deepStrictEqual|deepEqual|equal|throws)\w*\(`,
    String.raw`\bassertThat\(.*\)\.(isEqualTo|containsExactly|hasSize|isEqualByComparingTo)\(`,
    String.raw`^\s*assert\b.*(==|!=)`,
    String.raw`\bAssert\.(Equal|AreEqual|Throws)\w*\(`,
    String.raw`\.to\s+(eq|eql)\(`,
  ].join('|'),
);

/** Assertions that only check existence or truthiness. */
export const WEAK_RE = new RegExp(
  [
    String.raw`\.(toBeTruthy|toBeDefined|toBeFalsy)\(\)`,
    String.raw`\.not\.(toBeNull|toBeUndefined|toThrow)\(\)`,
    String.raw`expect\.anything\(\)`,
    String.raw`\.toBeGreaterThan\(\s*0\s*\)`,
    String.raw`^\s*assert\s+[\w.\[\]()'"]+\s*$`,
    String.raw`^\s*assert\s+.*\bis\s+not\s+None\b`,
    String.raw`^\s*assert\s+len\(.*\)\s*>\s*0`,
    String.raw`\b(assertTrue|assertIsNotNone|assertNotNull|assertNotNil)\s*\(\s*[\w.\[\]()'",\s]+\)`,
    String.raw`\bassert\.(ok|NotNil|NotEmpty|True)\(\s*[\w.\[\]()'",\s]+\)`,
    String.raw`^\s*assert\(\s*[\w.\[\]()'"]+\s*\)\s*;?\s*$`,
    String.raw`\bassert!\(\s*[\w.:()]+\.(is_some|is_ok|is_empty\(\)\s*==\s*false)\(\)\s*\)`,
    String.raw`\bassertThat\(.*\)\.(isNotNull|isNotEmpty)\(\)`,
  ].join('|'),
);

/** Assertions that can never fail. */
export const TRIVIAL_RE = new RegExp(
  [
    String.raw`expect\(\s*(true|1|"[^"]*"|'[^']*')\s*\)\.(toBe|toEqual)\(\s*(true|1)\s*\)`,
    String.raw`^\s*assert\s+(True|1)\s*$`,
    String.raw`^\s*assert\s+(\w+|\d+)\s*==\s*\1\s*$`,
    String.raw`\b(assertTrue|assert\.ok|assert|assert!)\(\s*true\s*\)`,
    String.raw`\bassertEquals?\(\s*(\w+|\d+)\s*,\s*\1\s*\)`,
    String.raw`\bassert_eq!\(\s*(\w+|\d+)\s*,\s*\1\s*\)`,
    String.raw`expect\(\s*true\s*\)\.to\s+be\s*\(?\s*true`,
  ].join('|'),
);

export const TEST_DECL_RE = new RegExp(
  [
    String.raw`\b(it|test|specify|scenario)(\.each\([^)]*\))?\s*\(\s*['"\x60]`,
    String.raw`^\s*(async\s+)?def\s+test_\w+`,
    String.raw`\bfunc\s+Test\w+\s*\(`,
    String.raw`#\[test\]`,
    String.raw`@(Test|ParameterizedTest|Theory)\b`,
    String.raw`\[(Fact|Theory|Test|TestMethod)\]`,
    String.raw`^\s*it\s+['"]`,
    String.raw`\bfn\s+test_\w+`,
  ].join('|'),
);

/** [regex, label, kind] — kind "skip" disables a test, "focus" runs only a subset. */
export const SKIP_PATTERNS = /** @type {Array<[RegExp, string, 'skip' | 'focus']>} */ ([
  [/\b(it|test|describe|context|suite|specify)\.(skip|todo|failing)\b/, 'JS test marked skip/todo', 'skip'],
  [/\b(xit|xtest|xdescribe|xcontext|xspecify)\s*\(/, 'JS test disabled with x-prefix', 'skip'],
  [/\b(it|test|describe|context)\.only\b|\b(fit|fdescribe|fcontext)\s*\(/, 'only this test runs; the rest are silently skipped', 'focus'],
  [/@pytest\.mark\.(skip|skipif|xfail)\b/, 'pytest skip/xfail marker', 'skip'],
  [/\bpytest\.(skip|xfail)\s*\(/, 'pytest skip/xfail call', 'skip'],
  [/@unittest\.(skip|skipIf|skipUnless|expectedFailure)\b/, 'unittest skip marker', 'skip'],
  [/\bself\.skipTest\s*\(/, 'unittest skipTest call', 'skip'],
  [/\bt\.Skip(f|Now)?\s*\(/, 'Go t.Skip', 'skip'],
  [/#\[ignore(\s*=|\s*\]|\s*\()/, 'Rust #[ignore]', 'skip'],
  [/@(Disabled|Ignore)\b/, 'JUnit @Disabled/@Ignore', 'skip'],
  [/\[(Ignore|Fact\(Skip\s*=|Theory\(Skip\s*=)/, '.NET ignored test', 'skip'],
  [/^\s*(xit|pending|skip)\b(\s|\()/, 'RSpec pending/skip', 'skip'],
  [/\{\s*skip\s*:\s*(true|['"`])/, 'node:test skip option', 'skip'],
  [/\bt\.skip\s*\(/, 'ava/tap t.skip', 'skip'],
]);

export const SKIPPED_DECL_RE = /\b(it|test|describe|context)\.(skip|only|todo)\s*\(|\bx(it|test|describe)\s*\(/;

export const FLAKY_RE = new RegExp(
  [
    String.raw`@pytest\.mark\.flaky`,
    String.raw`--reruns?\b`,
    String.raw`\bjest\.retryTimes\s*\(`,
    String.raw`\bretries\s*[:=]\s*[1-9]`,
    String.raw`\bflaky\b`,
    String.raw`\bretry\s*\(\s*[1-9]`,
  ].join('|'),
);

/** Suppression directives for linters and type checkers. */
export const SUPPRESS_RE = new RegExp(
  [
    String.raw`#\s*type:\s*ignore`,
    String.raw`#\s*noqa\b`,
    String.raw`#\s*pylint:\s*disable`,
    String.raw`#\s*pragma:\s*no cover`,
    String.raw`#\s*nosec\b`,
    String.raw`#\s*rubocop:disable`,
    String.raw`@ts-(ignore|nocheck|expect-error)`,
    String.raw`eslint-disable`,
    String.raw`biome-ignore`,
    String.raw`/[/*]\s*(istanbul|c8|v8)\s+ignore`,
    String.raw`//\s*nolint\b`,
    String.raw`#!?\[allow\(`,
    String.raw`@SuppressWarnings`,
  ].join('|'),
);

export const CI_BYPASS_RES = /** @type {Array<[RegExp, string]>} */ ([
  [/continue-on-error:\s*true/, 'step or job allowed to fail (continue-on-error)'],
  [/allow_failure:\s*(true|\n)/, 'job allowed to fail (allow_failure)'],
  [/\|\|\s*(true|exit\s+0|:)\s*($|[;&)#])/, 'failure masked with "|| true"'],
  [/^\s*(-\s+)?if:\s*(false|\$\{\{\s*false\s*\}\})\s*$/, 'step or job disabled with "if: false"'],
  [/--passWithNoTests/, 'test run passes even when no tests are found'],
  [/--no-verify\b/, 'git hooks bypassed (--no-verify)'],
  [/\bHUSKY\s*=\s*0\b/, 'husky hooks disabled'],
  [/(^|\s)SKIP\s*=\s*\S+/, 'pre-commit hooks skipped via SKIP='],
  [/^\s*set\s+\+e\b/, 'shell errexit disabled (set +e)'],
]);

export const CHECK_CMD_RE =
  /\b(npm\s+(run\s+)?(test|lint|typecheck)|pnpm(\s+run)?\s+(test|lint|typecheck)|yarn\s+(test|lint|typecheck)|pytest|jest|vitest|playwright\s+test|go\s+(test|vet)|cargo\s+(test|clippy)|eslint|ruff|mypy|pyright|tsc|rspec|mvn\s+(test|verify)|gradlew?\s+(test|check)|dotnet\s+test|make\s+(test|check|lint)|golangci-lint|flake8|pylint|shellcheck|biome\s+(check|lint|ci))\b/;

export const COVERAGE_KEYS = [
  'fail_under', 'fail-under', 'cov-fail-under', 'cov_fail_under', 'minimum_coverage', 'min_coverage',
  'branches', 'functions', 'lines', 'statements', 'threshold', 'coverage',
];

/** Added lines in config files that relax strictness: [regex, label, severity]. */
export const STRICTNESS_ADDED = /** @type {Array<[RegExp, string, 'high' | 'medium' | 'low']>} */ ([
  [/"strict"\s*:\s*false/, 'TypeScript strict mode turned off', 'high'],
  [/"(noImplicitAny|strictNullChecks|noUncheckedIndexedAccess)"\s*:\s*false/, 'TypeScript strictness flag turned off', 'medium'],
  [/"noEmitOnError"\s*:\s*false/, 'TypeScript emits despite type errors', 'medium'],
  [/\bstrict\s*=\s*false\b/, 'strict mode turned off', 'high'],
  [/\bignore_errors\s*=\s*true\b/, 'mypy ignore_errors enabled', 'high'],
  [/\b(disallow_untyped_defs|check_untyped_defs|disallow_any_generics)\s*=\s*false\b/, 'mypy strictness turned off', 'medium'],
  [/\bwarnings_as_errors\s*=\s*false\b|-Wno-error\b/, 'warnings no longer fail the build', 'medium'],
  [/["']?[\w@/-]+["']?\s*:\s*(["']off["']|0)\s*,?\s*$/, 'lint rule turned off', 'medium'],
  [/\[\s*["']off["']/, 'lint rule turned off', 'medium'],
  [/\bfilterwarnings\b.*["']ignore/, 'pytest warnings ignored', 'low'],
  [/\bignore_missing_imports\s*=\s*true\b/, 'mypy missing imports ignored', 'low'],
]);

/** Removed lines that should not vanish without a replacement: [regex, label]. */
export const STRICTNESS_REMOVED = /** @type {Array<[RegExp, string]>} */ ([
  [/"strict"\s*:\s*true/, 'TypeScript strict mode removed'],
  [/-Werror\b|-Dwarnings\b|warnings_as_errors\s*=\s*true/, 'warnings-as-errors flag removed'],
  [/\bstrict\s*=\s*true\b/, 'strict setting removed'],
  [/--strict\b/, '--strict flag removed'],
  [/\bfilterwarnings\b.*error/, 'pytest warnings-as-errors removed'],
]);

export const SELECTION_NARROWING_RES = /** @type {Array<[RegExp, string]>} */ ([
  [/--deselect\b/, 'pytest tests deselected'],
  [/(^|\s)-k\s+["']?not\b/, 'pytest -k "not ..." excludes tests'],
  [/--ignore(=|\s+)\S+/, 'pytest paths ignored'],
  [/\b(testPathIgnorePatterns|testIgnore|modulePathIgnorePatterns)\b/, 'test paths ignored in runner config'],
  [/\bnorecursedirs\b|\bcollect_ignore\b/, 'pytest directories excluded from collection'],
  [/--grep-invert\b|--exclude-tag\b|--skip\s+\S+/, 'tests excluded by pattern'],
  [/\bpassWithNoTests\b/, 'runner passes with no tests'],
]);

export const NOOP_TEST_SCRIPT_RE = /^(echo\b.*|true|exit\s+0|:|node\s+-e\s+["']?\s*["']?)$/;

export const TEST_ENV_DETECT_RE = new RegExp(
  [
    String.raw`\bPYTEST_CURRENT_TEST\b`,
    String.raw`\bJEST_WORKER_ID\b`,
    String.raw`\bVITEST(_WORKER_ID|_POOL_ID)?\b`,
    String.raw`NODE_ENV\s*[!=]==?\s*["']test["']`,
    String.raw`["']pytest["']\s+in\s+sys\.modules`,
    String.raw`["']unittest["']\s+in\s+sys\.modules`,
    String.raw`\btesting\.Testing\(\)`,
    String.raw`flag\.Lookup\(\s*["']test\.v["']`,
    String.raw`\bcfg!\(\s*test\s*\)`,
    String.raw`RAILS_ENV\s*==\s*["']test["']|Rails\.env\.test\?`,
    String.raw`\b(IS_TESTING|RUNNING_TESTS|UNDER_TEST|TEST_MODE)\b`,
  ].join('|'),
);

export const SWALLOW_INLINE_RES = /** @type {Array<[RegExp, string]>} */ ([
  [/\bexcept\b[^:]*:\s*(pass|\.\.\.)\s*(#.*)?$/, 'except block that ignores the error'],
  [/\bcatch\s*(\([^)]*\))?\s*\{\s*\}/, 'empty catch block'],
  [/\.catch\(\s*(\(\s*\w*\s*\)|\w+)\s*=>\s*(\{\s*\}|null|undefined|void 0)\s*\)/, 'promise rejection swallowed'],
  [/\brescue\b[^#\n]*(\bnil\b|;\s*end)/, 'Ruby rescue that returns nil'],
]);
