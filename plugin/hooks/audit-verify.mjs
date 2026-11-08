#!/usr/bin/env node
// agent-org: full verification of the audit log (v0.2: C2, D27), run by /agent-org:audit-verify.
//   node audit-verify.mjs [--repo <name>]
// Walks every rotated file and the active file, recomputes every hash, checks every `prev`, and compares
// the end state with the head record. Prints one line per repo. Exit 1 on any break.
// Never modifies the log or the head record (it doesn't move the checkpoint either).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRepos, safeRepo, verify } from './lib/audit.mjs';

export function verifyLines(repos) {
  const lines = [];
  let broken = false;
  for (const repo of repos) {
    const r = verify(repo, { full: true, readOnly: true });
    if (r.absent) { lines.push(`OK ${repo} 0 lines in 0 files (no audit log)`); continue; }
    if (r.ok) {
      lines.push(`OK ${repo} ${r.lines} lines in ${r.files} files${r.noHead ? ' (no head record: tail edits are undetectable)' : ''}`);
    } else if (r.headMismatch) {
      broken = true;
      lines.push(`BROKEN ${repo}: ${r.file} head mismatch (the last line was edited or the tail was truncated)`);
    } else {
      broken = true;
      lines.push(`BROKEN ${repo}: ${r.file} between lines ${r.breakAfterLine} and ${r.breakAfterLine + 1}`);
    }
  }
  return { lines, broken };
}

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--repo');
  const repos = i >= 0 && argv[i + 1] ? [safeRepo(argv[i + 1])] : listRepos();
  if (!repos.length) {
    process.stdout.write('agent-org audit: no audit logs found under ~/.agent-org/audit/\n');
    return 0;
  }
  const { lines, broken } = verifyLines(repos);
  process.stdout.write(`${lines.join('\n')}\n`);
  return broken ? 1 : 0;
}

const isMain = (() => {
  try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (isMain) {
  let code = 0;
  try { code = main(); } catch (e) { process.stdout.write(`agent-org audit: verify failed to run (${e && e.code ? e.code : 'error'})\n`); code = 1; }
  process.exitCode = code;
}
