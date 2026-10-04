import { baseName, extOf } from './util.js';

const LANG_BY_EXT = /** @type {Record<string, string>} */ ({
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', mts: 'js', cts: 'js',
  py: 'py', go: 'go', rs: 'rs', java: 'java', kt: 'java', kts: 'java', scala: 'java',
  rb: 'rb', cs: 'cs', php: 'php', swift: 'swift',
});

/** @param {string} path */
export const langOf = (path) => LANG_BY_EXT[extOf(path)] ?? 'other';

const TEST_DIR_RE = /(^|\/)(tests?|__tests__|specs?|e2e|cypress|__mocks__|testing)\//i;
const TEST_FILE_RES = [
  /\.(test|spec)\.[a-z]+$/i,
  /(^|\/)test_[^/]+\.py$/,
  /_test\.(py|go|rb|rs|exs?)$/,
  /_spec\.rb$/,
  /(Test|Tests|IT|Spec)\.(java|kt|scala|cs|swift|php)$/,
  /(^|\/)conftest\.py$/,
  /\.snap$/,
];

/**
 * @param {string} path
 * @param {RegExp[]} extra
 */
export function isTestPath(path, extra = []) {
  return TEST_DIR_RE.test(path) || TEST_FILE_RES.some((r) => r.test(path)) || extra.some((r) => r.test(path));
}

/** @param {string} path */
export function isSnapshotPath(path) {
  return /\.snap$/.test(path) || /(^|\/)__snapshots__\//.test(path) || /\.approved\.[a-z]+$/i.test(path);
}

const CI_RES = [
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /^\.github\/actions\/.+\.ya?ml$/,
  /(^|\/)\.gitlab-ci\.ya?ml$/,
  /^\.circleci\/config\.ya?ml$/,
  /(^|\/)azure-pipelines\.ya?ml$/,
  /(^|\/)Jenkinsfile$/,
  /(^|\/)\.travis\.ya?ml$/,
  /(^|\/)bitbucket-pipelines\.ya?ml$/,
  /^\.buildkite\//,
];

/** @param {string} path */
export const isCIPath = (path) => CI_RES.some((r) => r.test(path));

const CONFIG_RES = [
  /(^|\/)package\.json$/,
  /(^|\/)(jest|vitest|vite|playwright|cypress|karma|babel)\.config\.[a-z]+$/,
  /(^|\/)\.(c8rc|nycrc|coveragerc|golangci)(\.[a-z]+)?$/,
  /(^|\/)(pytest|mypy|tox|setup)\.(ini|cfg)$/,
  /(^|\/)pyproject\.toml$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)\.eslintrc[^/]*$/,
  /(^|\/)eslint\.config\.[a-z]+$/,
  /(^|\/)biome\.jsonc?$/,
  /(^|\/)(Makefile|justfile|noxfile\.py)$/,
  /(^|\/)\.pre-commit-config\.ya?ml$/,
  /(^|\/)codecov\.ya?ml$/,
  /(^|\/)Cargo\.toml$/,
  /(^|\/)(build\.gradle(\.kts)?|pom\.xml)$/,
  /^\.husky\//,
  /(^|\/)scripts\/[^/]+\.(sh|bash)$/,
];

/** @param {string} path */
export const isConfigPath = (path) => CONFIG_RES.some((r) => r.test(path)) || isCIPath(path);

/** @param {string} path */
export function isSourcePath(path) {
  return langOf(path) !== 'other' && !isTestPath(path) && !isConfigPath(path) && !/(^|\/)(node_modules|vendor|dist|build)\//.test(path);
}

/**
 * Normalised stem used to match a test file with its source file.
 * @param {string} path
 */
export function stemOf(path) {
  return baseName(path)
    .replace(/\.[a-z]+$/i, '')
    .replace(/\.(test|spec)$/i, '')
    .replace(/^test_/, '')
    .replace(/(_test|_spec|Test|Tests|IT|Spec)$/, '')
    .toLowerCase();
}
