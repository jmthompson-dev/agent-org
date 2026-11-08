// agent-org: repo identity (D6, P5 D3). Repo name = basename of `git -C <dir> rev-parse --show-toplevel`;
// outside git, the basename of the session working directory (D6), so it matches where deliver saves intents.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Nearest existing directory at or above `p` (a Write may target a directory that doesn't exist yet).
export function existingDir(p) {
  let d = path.resolve(p);
  for (let i = 0; i < 64; i++) {
    try { if (fs.statSync(d).isDirectory()) return d; } catch { /* keep walking */ }
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
  return null;
}

export function gitTopLevel(dir) {
  const d = existingDir(dir);
  if (!d) return null;
  try {
    const out = execFileSync('git', ['-C', d, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function repoRoot(dir, cwd) {
  return gitTopLevel(dir) || (cwd ? path.resolve(cwd) : (existingDir(dir) || path.resolve(dir)));
}

export function repoName(dir, cwd) {
  const root = repoRoot(dir, cwd);
  return path.basename(root) || 'root';
}

// Repo of a file edit: git top level of the file's directory, else the cwd basename.
export function repoOfFile(filePath, cwd) {
  return repoName(path.dirname(path.resolve(cwd || '.', filePath)), cwd);
}
