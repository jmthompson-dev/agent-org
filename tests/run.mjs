// Runs every agent-org hook test in this folder. Usage: node tests/run.mjs [--evidence <6c evidence dir>]
// No model calls, no installs; each test uses a throwaway HOME. Exit 1 if any test fails.
import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const extra = process.argv.slice(2);
let failed = 0;
for (const [file, args] of [['v021.test.mjs', []], ['replay-6c.mjs', extra]]) {
  console.log(`\n=== ${file}`);
  const r = spawnSync(process.execPath, [path.join(here, file), ...args], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\nFAILED: ${failed} test file(s)` : '\nall test files passed');
process.exitCode = failed ? 1 : 0;
