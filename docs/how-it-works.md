# How it works

```
git diff -U0 -M  →  parseDiff  →  buildContext  →  rules  →  engine  →  report
                                       │
                          --verify ────┴──→ verify.js (two temp copies, your command)
```

| Module | Job |
|---|---|
| `src/git.js` | Resolve the base (merge-base with `origin/main`, `main`, `master`, or `--base`), collect the diff, include untracked files as all-added |
| `src/diff.js` | Parse unified diff into files → hunks → `removed[]` / `added[]` with line numbers. With `-U0` a hunk is one removed block and one added block |
| `src/classify.js` | Decide what is a test, snapshot, CI file, config file or source file from paths |
| `src/context.js` | Shared state for rules: lazy file reads, "moved line" marking, test-literal index, deleted-source lookup |
| `src/rules/*` | One object per rule: `{ id, name, severity, summary, why, run(ctx) → findings }` |
| `src/engine.js` | Run rules, apply inline ignores / config severity, sort |
| `src/verify.js` | Copy project twice, restore original test files in the second, run the user's command in both |
| `src/report/*` | terminal, JSON, SARIF 2.1.0, GitHub workflow commands, Markdown |

## Reducing false positives

1. **Moved lines.** A removed line that reappears (ignoring whitespace, quote style and trailing commas) anywhere in the diff is marked `moved` and ignored by deletion rules.
2. **Pairing, then net counting.** Inside a hunk, removed and added assertions are paired first (same shape with different literals → `GP005`; strict → weak → `GP004`). What is left is counted per file, so assertions reordered within a file are not a loss.
3. **One report per deleted test.** If a whole test case disappears (`GP006`), its assertions are not also reported as `GP003`.
4. **Deleted together.** A deleted test whose source file was deleted in the same diff is downgraded to low.
5. **Distinctive literals only** for `GP040`: `0`, `1`, `200` and short strings never match.

## Writing a rule

```js
export const myRule = {
  id: 'GP0xx',
  name: 'kebab-case-name',
  severity: 'medium',
  summary: 'One line for `goalposts rules`.',
  why: 'Why a reviewer should care.',
  run(ctx) {
    const out = [];
    for (const f of ctx.files) {
      if (!ctx.isTest(f.path)) continue;
      for (const h of f.hunks) for (const l of h.added) {
        if (/something/.test(l.text)) out.push({ rule: this.id, severity: 'medium', file: f.path, line: l.n, message: '…', evidence: [`+ ${l.text.trim()}`] });
      }
    }
    return out;
  },
};
```

Add it to `src/rules/index.js`, add an example to `scripts/gen-rules-doc.js`, run `npm run docs`, and add a scenario to `test/rules.test.js` (the helper builds a real git repo for you).
