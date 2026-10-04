// Renders the real output of `goalposts demo --compact` as a static terminal SVG
// (static on purpose: link unfurlers and thumbnailers do not run CSS animations).
// Usage: node scripts/render-demo-svg.js [out.svg]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/goalposts.js', import.meta.url));
const out = process.argv[2] ?? fileURLToPath(new URL('../docs/assets/demo.svg', import.meta.url));
const raw = execFileSync('node', [bin, 'demo', '--compact'], {
  encoding: 'utf8',
  env: { ...process.env, FORCE_COLOR: '1', NO_COLOR: '' },
}).replace(/\n+Try it on your own repo.*\n?$/s, '\n');

const THEME = { bg: '#0d1117', fg: '#c9d1d9', dim: '#6e7681', red: '#ff7b72', green: '#7ee787', yellow: '#e3b341', cyan: '#79c0ff', bar: '#161b22' };
const CW = 8.43;
const LH = 19;
const PAD = 22;
const TOP = 44;

/** @param {string} codes */
function style(codes) {
  const s = { fg: THEME.fg, bg: '', bold: false };
  for (const c of codes.split(';').filter(Boolean).map(Number)) {
    if (c === 1) s.bold = true;
    else if (c === 2) s.fg = THEME.dim;
    else if (c === 31) s.fg = THEME.red;
    else if (c === 32) s.fg = THEME.green;
    else if (c === 33) s.fg = THEME.yellow;
    else if (c === 36) s.fg = THEME.cyan;
    else if (c === 37) s.fg = '#ffffff';
    else if (c === 30) s.fg = '#0d1117';
    else if (c === 41) s.bg = '#da3633';
    else if (c === 43) s.bg = '#d29922';
    else if (c === 47) s.bg = '#8b949e';
  }
  return s;
}

/** @param {string} t */
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Parse one ANSI line into styled segments. @param {string} line */
function segments(line) {
  const segs = /** @type {Array<{text: string, fg: string, bg: string, bold: boolean}>} */ ([]);
  let cur = style('');
  let last = 0;
  for (const m of line.matchAll(/\x1b\[([\d;]*)m/g)) {
    if (m.index > last) segs.push({ text: line.slice(last, m.index), ...cur });
    cur = m[1] === '0' || m[1] === '' ? style('') : style(m[1]);
    last = m.index + m[0].length;
  }
  if (last < line.length) segs.push({ text: line.slice(last), ...cur });
  return segs;
}

const lines = ['\x1b[2m$\x1b[0m \x1b[1mnpx goalposts demo\x1b[0m', '', ...raw.replace(/\n$/, '').split('\n')];
const cols = Math.max(...lines.map((l) => l.replace(/\x1b\[[\d;]*m/g, '').length));
const width = Math.ceil(cols * CW + PAD * 2 + 40);
const height = TOP + lines.length * LH + PAD;

let body = '';
lines.forEach((line, i) => {
  const y = TOP + i * LH;
  let col = 0;
  let g = '';
  for (const s of segments(line)) {
    const x0 = PAD + col * CW;
    if (s.bg) g += `<rect x="${x0.toFixed(1)}" y="${y - 14}" width="${(s.text.length * CW).toFixed(1)}" height="${LH}" fill="${s.bg}"/>`;
    // One <text> per word at an exact column, so layout never depends on whitespace handling.
    for (const m of s.text.matchAll(/\S+/g)) {
      const x = PAD + (col + m.index) * CW;
      // textLength pins the word to its exact column span whatever monospace font the viewer has.
      const fit = m[0].length > 1 ? ` textLength="${(m[0].length * CW).toFixed(1)}" lengthAdjust="spacingAndGlyphs"` : '';
      g += `<text x="${x.toFixed(1)}" y="${y}" fill="${s.fg}"${s.bold ? ' font-weight="700"' : ''}${fit}>${esc(m[0])}</text>`;
    }
    col += s.text.length;
  }
  body += `<g>${g}</g>\n`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="goalposts demo: an AI agent's branch is flagged for a skipped test, a loosened assertion, a changed expected value, a hardcoded special case and weakened CI gates; the original tests then fail against the new code.">
<style>
text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:14px;white-space:pre}
</style>
<rect width="${width}" height="${height}" rx="10" fill="${THEME.bg}"/>
<rect width="${width}" height="30" rx="10" fill="${THEME.bar}"/><rect y="20" width="${width}" height="10" fill="${THEME.bar}"/>
<circle cx="20" cy="15" r="5.5" fill="#ff5f56"/><circle cx="40" cy="15" r="5.5" fill="#ffbd2e"/><circle cx="60" cy="15" r="5.5" fill="#27c93f"/>
${body}</svg>
`;
writeFileSync(out, svg);
console.log(`wrote ${out} (${(svg.length / 1024).toFixed(1)} KiB, ${lines.length} lines)`);
