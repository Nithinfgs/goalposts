# Changelog

## 0.1.0

First release.

- 16 diff rules across tests (`GP001`–`GP010`), gates (`GP020`, `GP030`–`GP032`) and source (`GP040`–`GP041`)
- `--verify "<cmd>"`: re-run the original versions of modified or deleted test files against the new code (`GP100`)
- Output formats: terminal, `--compact`, JSON, SARIF 2.1.0, GitHub annotations, Markdown
- `goalposts demo`, `rules`, `explain`, `init`
- Composite GitHub Action
- Inline `goalposts-ignore` comments and `.goalposts.json`
