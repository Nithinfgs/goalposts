#!/usr/bin/env node
import { main } from '../src/cli.js';

const code = await main(process.argv.slice(2), {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  isTTY: Boolean(process.stdout.isTTY),
});
process.exitCode = code;
