# Security Policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting ("Security" tab → "Report a vulnerability") rather than a public issue.

## What to know about goalposts' behaviour

- It reads your git repository and never makes network calls.
- With `--verify "<command>"` it **executes the command you give it** (through your shell) in temporary copies of your project. Treat that argument like any command you would type. Do not pass untrusted input, and in CI do not run `verify` on code from untrusted forks with secrets available.
- Temporary copies live under the OS temp directory and are removed when the run ends. Dependency folders are symlinked, so a command that writes into `node_modules` writes into the real one.
- Config (`.goalposts.json`) is parsed as JSON only; it cannot execute code.

## Supported versions

Only the latest release receives fixes.
