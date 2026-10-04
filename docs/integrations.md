# Integrations

## GitHub Actions

The repository ships a composite action. Check out with full history so the merge-base can be found.

```yaml
name: goalposts
on: pull_request
jobs:
  goalposts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: Nithinfgs/goalposts@v0.1.0
        with:
          fail-on: high          # high | medium | low | never
          verify: npm test       # optional; needs your dependencies installed first
```

The action writes inline annotations (`--format github`), appends a Markdown table to the job summary, and fails the job according to `fail-on`. If you use `verify`, install dependencies in an earlier step.

## SARIF / code scanning

```bash
goalposts --base origin/main --format sarif > goalposts.sarif
```

Upload with `github/codeql-action/upload-sarif`.

## Git hooks

`.git/hooks/pre-commit`:

```sh
#!/bin/sh
npx github:Nithinfgs/goalposts --staged --compact --fail-on high
```

`.git/hooks/pre-push` (checks the whole branch):

```sh
#!/bin/sh
npx github:Nithinfgs/goalposts --compact --fail-on high
```

## Coding agents

Run it when the agent says it is finished. An example Claude Code `Stop` hook in `.claude/settings.json` that hands the report back to the agent (exit code 2 feeds stderr to the model). **This example has not been tested against every Claude Code version; check the hooks documentation for yours.**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh -c 'npx github:Nithinfgs/goalposts --compact --no-color --fail-on high >&2 || exit 2'"
          }
        ]
      }
    ]
  }
}
```

The same command works as a final step in any agent harness: run it, and if the exit code is 1, show the output to the agent or to a human.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | No findings at or above `--fail-on`, and (with `--verify`) the original tests did not contradict the change |
| 1 | Findings at or above `--fail-on`, or `GP100` |
| 2 | Usage error, not a git repository, bad ref or bad config |
