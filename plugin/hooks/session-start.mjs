#!/usr/bin/env node
// agent-org SessionStart hook: adds rule-card.md to the session as context.
// Dependency-free and fail-open: any error produces no output and exit code 0.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function finish() {
  process.exit(0);
}

try {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const card = fs.readFileSync(path.join(here, 'rule-card.md'), 'utf8').trim();
  if (card) {
    const out = JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: card } });
    // Exit only after the write flushes: process.exit() right after a pipe write can drop output.
    process.stdout.write(out, finish);
  } else {
    finish();
  }
} catch {
  finish(); // Fail open.
}
