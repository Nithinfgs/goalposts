import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {{
 *   ignore: string[],
 *   ignorePaths: string[],
 *   testPatterns: string[],
 *   severity: Record<string, 'high' | 'medium' | 'low' | 'off'>,
 * }} Config
 */

export const CONFIG_FILE = '.goalposts.json';

/** @returns {Config} */
export const defaultConfig = () => ({ ignore: [], ignorePaths: [], testPatterns: [], severity: {} });

/**
 * @param {string} root
 * @param {string} [explicitPath]
 * @returns {Config}
 */
export function loadConfig(root, explicitPath) {
  const path = explicitPath ?? join(root, CONFIG_FILE);
  const cfg = defaultConfig();
  if (!existsSync(path)) {
    if (explicitPath) throw new Error(`config file not found: ${explicitPath}`);
    return cfg;
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`cannot parse ${path}: ${/** @type {Error} */ (e).message}`);
  }
  for (const key of ['ignore', 'ignorePaths', 'testPatterns']) {
    if (raw[key] !== undefined) {
      if (!Array.isArray(raw[key]) || raw[key].some((/** @type {unknown} */ v) => typeof v !== 'string')) {
        throw new Error(`${path}: "${key}" must be an array of strings`);
      }
      /** @type {Record<string, unknown>} */ (cfg)[key] = raw[key];
    }
  }
  if (raw.severity !== undefined) {
    for (const [id, sev] of Object.entries(raw.severity)) {
      if (!['high', 'medium', 'low', 'off'].includes(/** @type {string} */ (sev))) {
        throw new Error(`${path}: severity for ${id} must be high, medium, low or off`);
      }
    }
    cfg.severity = raw.severity;
  }
  return cfg;
}

export const EXAMPLE_CONFIG = `{
  "ignore": [],
  "ignorePaths": ["vendor/**", "**/generated/**"],
  "testPatterns": ["^spec_helpers/"],
  "severity": {
    "GP020": "off",
    "GP005": "low"
  }
}
`;
