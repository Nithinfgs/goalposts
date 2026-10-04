# Calibration

goalposts was run over windows of recent history in four public repositories to see how noisy it is on ordinary development, where nobody is trying to game tests. Windows are the last N commits of a depth-200 clone taken on 2026-10-04, analysed with `goalposts --base HEAD~N --head HEAD`.

| Repository | Last 10 commits (high / med / low) | Last 30 | Last 60 |
|---|---|---|---|
| BurntSushi/ripgrep | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 |
| pallets/flask | 0 / 0 / 2 | 3 / 4 / 4 | 3 / 11 / 7 |
| expressjs/express | 0 / 0 / 0 | 0 / 17 / 0 | 0 / 23 / 0 |
| tj/commander.js | 3 / 0 / 0 | 9 / 20 / 1 | 9 / 20 / 1 |

Reading the numbers:

- Small windows are quiet. Larger windows contain real test refactors, so findings are expected.
- The findings sampled from the larger windows were legitimate review prompts rather than parser mistakes. Examples: express changing the expected `Content-Disposition` quoting (`GP005`), commander.js replacing `jest` with `node --test` in its `test` script (`GP032`), commander.js deleting test files (`GP001`).
- That does not mean they were *wrong* changes. It means a reviewer should look, which is the intended behaviour. Only a sample was inspected by hand; this is not a measured precision or recall figure.
- Early runs of this experiment exposed three sources of noise (reformatted lines counted as deleted, per-hunk instead of per-file assertion counting, double reporting of deleted tests). They are fixed and covered by regression tests.

Reproduce:

```bash
git clone --depth 200 https://github.com/pallets/flask && cd flask
node /path/to/goalposts/bin/goalposts.js --base HEAD~30 --head HEAD --compact
```
