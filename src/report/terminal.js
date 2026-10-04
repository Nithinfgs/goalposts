/**
 * @typedef {import('../engine.js').Analysis} Analysis
 * @typedef {import('../verify.js').Verification} Verification
 */

/** @param {boolean} on */
function palette(on) {
  /** @param {string} code */
  const w = (code) => (/** @type {string} */ s) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    bold: w('1'), dim: w('2'), red: w('31'), yellow: w('33'), cyan: w('36'), green: w('32'),
    badge: {
      high: w('1;37;41'), medium: w('1;30;43'), low: w('1;30;47'),
    },
  };
}

const LABEL = { high: ' HIGH ', medium: ' MED  ', low: ' LOW  ' };

/**
 * @param {Analysis} a
 * @param {{ color: boolean, verification?: Verification | null, limit?: number, compact?: boolean }} o
 */
export function renderTerminal(a, o) {
  const c = palette(o.color);
  const out = [];
  const short = a.base.sha.slice(0, 7);
  out.push(`${c.bold('goalposts')} ${c.dim(`${a.base.ref} (${short}) → ${a.label}`)}  ${c.dim(`${a.filesChanged} files changed, ${a.testFilesChanged} of them tests`)}`);
  out.push('');

  if (a.filesChanged === 0) {
    out.push('  No changes to analyse. Compare a branch with --base <ref>, or a commit range with --base A --head B.');
    return `${out.join('\n')}\n`;
  }

  const limit = o.limit ?? 200;
  for (const f of a.findings.slice(0, limit)) {
    if (o.compact) {
      out.push(`${c.badge[f.severity](LABEL[f.severity])} ${c.bold(f.rule)} ${c.cyan(`${f.file}:${f.line}`)} ${c.dim(f.message)}`);
      continue;
    }
    out.push(`${c.badge[f.severity](LABEL[f.severity])} ${c.bold(f.rule)} ${f.name}  ${c.cyan(`${f.file}:${f.line}`)}`);
    out.push(`       ${f.message}`);
    for (const e of f.evidence) {
      const paint = e.startsWith('+') ? c.green : e.startsWith('-') ? c.red : c.dim;
      out.push(`       ${paint(e)}`);
    }
    out.push('');
  }
  if (o.compact) out.push('');
  if (a.findings.length > limit) out.push(c.dim(`  … ${a.findings.length - limit} more (use --format json for all)\n`));

  if (o.verification) out.push(...renderVerification(o.verification, c, o.compact));

  const { high, medium, low } = a.counts;
  if (a.findings.length === 0) {
    out.push(`${c.green('✔')} No weakened tests or gates found in this change.`);
  } else {
    out.push(`${c.bold('Summary')}  ${c.red(`${high} high`)} · ${c.yellow(`${medium} medium`)} · ${low} low`);
    if (!o.compact) out.push(c.dim('Findings are review prompts, not verdicts: the change may be legitimate. Run `goalposts explain <ID>` for the reasoning.'));
  }
  return `${out.join('\n')}\n`;
}

/**
 * @param {Verification} v
 * @param {ReturnType<typeof palette>} c
 * @param {boolean} [compact]
 */
function renderVerification(v, c, compact = false) {
  const out = [];
  out.push(c.bold(`Verification  ${c.dim(`$ ${v.command}`)}`));
  const status = (/** @type {import('../verify.js').RunResult | null} */ r) =>
    r === null ? c.dim('not run') : r.exitCode === 0 ? c.green('pass') : r.timedOut ? c.red('timed out') : c.red(`FAIL (exit ${r.exitCode})`);
  out.push(`  new tests on new code ........ ${status(v.headRun)}`);
  out.push(`  original tests on new code ... ${status(v.baseTestsRun)}${v.restored.length ? c.dim(`  (${v.restored.length} test file${v.restored.length > 1 ? 's' : ''} restored)`) : ''}`);
  if (v.verdict === 'confirmed') {
    out.push(`  ${c.red('✘ GP100')} The change is green only because the tests were changed. Original test output:`);
    for (const l of v.baseTestsRun?.tail.slice(compact ? -4 : -8) ?? []) out.push(`    ${c.dim(l)}`);
  } else if (v.verdict === 'clean') {
    out.push(`  ${c.green('✔')} The original tests also pass: the test edits did not hide a failure.`);
  } else if (v.verdict === 'head-fails') {
    out.push(`  ${c.yellow('!')} The command fails on the change itself, so there is nothing to compare. Last output:`);
    for (const l of v.headRun.tail.slice(-6)) out.push(`    ${c.dim(l)}`);
  } else {
    out.push(`  ${c.dim('No test files were modified or deleted, so there is nothing to restore.')}`);
  }
  out.push('');
  return out;
}
