# Contributing

Thanks for helping. The most useful contributions are **real diffs**: a case goalposts flags that it should not, or a weakening it misses. Open an issue with the (minimised) diff; the templates ask for exactly that.

## Setup

```bash
git clone https://github.com/Nithinfgs/goalposts && cd goalposts
npm install        # dev dependencies only: typescript and @types/node
npm run check      # typecheck + tests
node bin/goalposts.js demo
```

Node ≥ 20 and git are required. There are no runtime dependencies and none should be added without a strong reason.

## Adding or changing a rule

1. Write the failing scenario first in `test/rules.test.js`. `withScenario(base, change, fn)` builds a real git repo, applies your change and runs the engine.
2. Add a negative case: what *legitimate* change must not be flagged?
3. Implement it in `src/rules/` (see [docs/how-it-works.md](docs/how-it-works.md#writing-a-rule)) and register it in `src/rules/index.js`.
4. Add an example to `scripts/gen-rules-doc.js` and run `npm run docs`. CI fails if `docs/rules.md` is stale.
5. Run `npm run check`.

## Principles

- **Deterministic and explainable.** No model calls, no network. Every finding quotes the lines that caused it.
- **Conservative severity.** `high` means "almost certainly worth a human's attention", not "probably wrong".
- **Prefer missing a case to crying wolf.** A noisy tool gets turned off.
- Code style: match the surrounding code; JSDoc types checked by `tsc`.

## Commits

Conventional-style prefixes (`feat:`, `fix:`, `test:`, `docs:`, `ci:`, `chore:`). Keep PRs focused.

## Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
