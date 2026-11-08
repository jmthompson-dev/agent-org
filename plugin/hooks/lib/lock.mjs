// agent-org: exclusive lock by `mkdir <target>.lock` (P5 C5, D2).
// A lock older than STALE_MS is stale and removed. After GIVE_UP_MS the caller proceeds unlocked
// (fail open): a hook must never hang or block a tool call because of a leftover lock.

import fs from 'node:fs';
import path from 'node:path';

export const STALE_MS = 2000;
export const GIVE_UP_MS = 3000;

const sleepBuf = new Int32Array(new SharedArrayBuffer(4));
function sleep(ms) {
  try { Atomics.wait(sleepBuf, 0, 0, ms); } catch { /* not available: retry at once */ }
}

// Runs fn() while holding the lock on `target`. Returns fn's result. Never throws because of the lock.
export function withLock(target, fn, { staleMs = STALE_MS, giveUpMs = GIVE_UP_MS } = {}) {
  const lockDir = `${target}.lock`;
  const start = Date.now();
  let held = false;
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      held = true;
      break;
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        // Parent directory missing: create it and retry at once.
        try { fs.mkdirSync(path.dirname(lockDir), { recursive: true }); } catch { break; }
        continue;
      }
      if (!e || e.code !== 'EEXIST') break; // Unexpected error: proceed unlocked.
      try {
        const age = Date.now() - fs.statSync(lockDir).mtimeMs;
        if (age > staleMs) { fs.rmSync(lockDir, { recursive: true, force: true }); continue; }
      } catch { continue; } // Lock vanished between calls: retry.
      if (Date.now() - start > giveUpMs) break; // Fail open.
      sleep(5 + Math.floor(Math.random() * 10));
    }
  }
  try {
    return fn();
  } finally {
    if (held) { try { fs.rmdirSync(lockDir); } catch { /* already gone */ } }
  }
}
