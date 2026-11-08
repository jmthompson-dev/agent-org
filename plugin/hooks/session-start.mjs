#!/usr/bin/env node
// agent-org SessionStart hook: adds rule-card.md to the session as context and (v0.2, C2) runs the
// incremental audit check. Output is one JSON object: hookSpecificOutput.additionalContext carries the
// rule card; a broken audit chain or head record adds a top-level systemMessage warning for the user.
// Dependency-free and fail-open: any error produces no output (or the rule card only) and exit code 0.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function finish() {
  process.exit(0);
}

async function auditWarning() {
  try {
    const { listRepos, verify } = await import('./lib/audit.mjs');
    for (const repo of listRepos()) {
      const r = verify(repo, { full: false });
      if (r.ok) continue;
      if (r.headMismatch) return `agent-org: audit head record mismatch in ${r.file} (last line edited or tail truncated). Run /agent-org:audit-verify.`;
      return `agent-org: audit chain broken in ${r.file} between lines ${r.breakAfterLine} and ${r.breakAfterLine + 1}. Run /agent-org:audit-verify.`;
    }
  } catch {
    // Fail open: no warning.
  }
  return null;
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let card = '';
  try { card = fs.readFileSync(path.join(here, 'rule-card.md'), 'utf8').trim(); } catch { card = ''; }
  const warning = await auditWarning();
  if (!card && !warning) return finish();
  const out = {};
  if (card) out.hookSpecificOutput = { hookEventName: 'SessionStart', additionalContext: card };
  if (warning) out.systemMessage = warning;
  // Exit only after the write flushes: process.exit() right after a pipe write can drop output.
  process.stdout.write(JSON.stringify(out), finish);
}

main().catch(() => finish());
