import { ciGateWeakened, checkSuppressed, selectionNarrowed, thresholdLowered } from './gates.js';
import { hardcodedToTest, testEnvironmentDetection } from './source.js';
import {
  assertionLoosened, assertionRemoved, errorSwallowed, expectedChanged, flakinessMasked, snapshotRewritten,
  testCaseRemoved, testFileDeleted, testSkipped, trivialAssertion,
} from './tests.js';

/** @type {import('./tests.js').Rule[]} */
export const RULES = [
  testFileDeleted, testSkipped, assertionRemoved, assertionLoosened, expectedChanged, testCaseRemoved,
  errorSwallowed, snapshotRewritten, flakinessMasked, trivialAssertion,
  checkSuppressed, ciGateWeakened, thresholdLowered, selectionNarrowed,
  hardcodedToTest, testEnvironmentDetection,
];

/** Rule metadata for the verification step, which is not a diff rule. */
export const VERIFY_RULE = {
  id: 'GP100',
  name: 'base-tests-fail-on-head',
  severity: /** @type {const} */ ('high'),
  summary: 'The original tests fail against the new code, but pass once the modified tests are used.',
  why: 'This is direct evidence, not a heuristic: the code does not satisfy the tests that existed before the change.',
};

/** @param {string} id */
export const findRule = (id) =>
  RULES.find((r) => r.id === id.toUpperCase()) ?? (id.toUpperCase() === VERIFY_RULE.id ? VERIFY_RULE : undefined);
