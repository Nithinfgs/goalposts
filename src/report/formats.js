import { RULES, VERIFY_RULE } from '../rules/index.js';

/**
 * @typedef {import('../engine.js').Analysis} Analysis
 * @typedef {import('../verify.js').Verification} Verification
 */

/**
 * @param {Analysis} a
 * @param {Verification | null | undefined} v
 */
export function renderJson(a, v) {
  return `${JSON.stringify(
    {
      tool: 'goalposts',
      base: { ref: a.base.ref, sha: a.base.sha },
      compared: a.label,
      filesChanged: a.filesChanged,
      testFilesChanged: a.testFilesChanged,
      counts: a.counts,
      findings: a.findings,
      verification: v ?? null,
    },
    null,
    2,
  )}\n`;
}

const SARIF_LEVEL = { high: 'error', medium: 'warning', low: 'note' };

/** @param {Analysis} a */
export function renderSarif(a) {
  const rules = [...RULES, VERIFY_RULE].map((r) => ({
    id: r.id,
    name: r.name,
    shortDescription: { text: r.summary },
    fullDescription: { text: r.why },
    helpUri: 'https://github.com/Nithinfgs/goalposts/blob/main/docs/rules.md',
  }));
  return `${JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'goalposts', informationUri: 'https://github.com/Nithinfgs/goalposts', rules } },
          results: a.findings.map((f) => ({
            ruleId: f.rule,
            level: SARIF_LEVEL[f.severity],
            message: { text: `${f.message}\n${f.evidence.join('\n')}` },
            locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: Math.max(1, f.line) } } }],
          })),
        },
      ],
    },
    null,
    2,
  )}\n`;
}

/** @param {string} s */
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/** GitHub Actions workflow commands: they show up as inline annotations on the PR. */
export function renderGithub(/** @type {Analysis} */ a) {
  const cmd = { high: 'error', medium: 'warning', low: 'notice' };
  return a.findings
    .map((f) => `::${cmd[f.severity]} file=${esc(f.file)},line=${Math.max(1, f.line)},title=${f.rule} ${f.name}::${esc(f.message)}`)
    .join('\n')
    .concat(a.findings.length ? '\n' : '');
}

/**
 * @param {Analysis} a
 * @param {Verification | null | undefined} v
 */
export function renderMarkdown(a, v) {
  const lines = [];
  lines.push(`### goalposts: ${a.counts.high} high · ${a.counts.medium} medium · ${a.counts.low} low`);
  lines.push('');
  if (v?.verdict === 'confirmed') {
    lines.push(`> **GP100** The original tests fail against this change (\`${v.command}\`). It is green only because tests were modified.`);
    lines.push('');
  }
  if (a.findings.length === 0) {
    lines.push('No weakened tests or gates found.');
    return `${lines.join('\n')}\n`;
  }
  lines.push('| Severity | Rule | Location | What changed |');
  lines.push('|---|---|---|---|');
  for (const f of a.findings) {
    lines.push(`| ${f.severity} | \`${f.rule}\` ${f.name} | \`${f.file}:${f.line}\` | ${f.message.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push('<sub>Findings are review prompts, not verdicts. Suppress a line with `goalposts-ignore: GPxxx`.</sub>');
  return `${lines.join('\n')}\n`;
}
