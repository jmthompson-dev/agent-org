// agent-org: repo identity (D6, P5 D3; v0.2.1 D31).
//   Display name (D6): basename of `git -C <dir> rev-parse --show-toplevel`; outside git, the basename of the
//   session working directory.
//   Key (v0.2.1, V21-9): the normalized `origin` remote (else the alphabetically first remote), else
//   `local-<sha256(realpath(top level))[:12]>`. The audit log, head record, approvals and intents are keyed by it,
//   so two repos that share a basename no longer share them. The key's directory form replaces `/` with `__`.

import crypto from 'node:crypto';
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

const git = (args) => execFileSync('git', args, {
  encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
});

export function gitTopLevel(dir) {
  const d = existingDir(dir);
  if (!d) return null;
  try {
    return git(['-C', d, 'rev-parse', '--show-toplevel']).trim() || null;
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

// ---------------------------------------------------------------------------------------------
// v0.2.1 (V21-9): the repo key (report 07 D2)

// Hosts whose paths are case-insensitive: only there is the path lowercased.
const CASELESS_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org']);

// Remote URL → `host/path`, or null for a remote with no host (a local path or file:// URL).
// Strips the scheme, `user@` and the port; `host:path` (scp form) → `host/path`; drops `.git` and trailing `/`.
export function normalizeRemote(url) {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  let host;
  let p;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/:]+)(?::\d*)?(\/.*)?$/i.exec(u);
  if (scheme) {
    if (scheme[1].toLowerCase() === 'file') return null;
    host = scheme[2];
    p = scheme[3] || '';
  } else {
    const scp = /^(?:[^@/]+@)?([^:/\\]+):(?!\/\/)(.+)$/.exec(u);
    if (!scp || /^[A-Za-z]$/.test(scp[1])) return null; // `C:\…` is a Windows path, not a host
    host = scp[1];
    p = scp[2];
  }
  host = host.toLowerCase();
  p = p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!host || !p) return null;
  if (CASELESS_HOSTS.has(host)) p = p.toLowerCase();
  return `${host}/${p}`;
}

// `origin`, else the alphabetically first remote with a URL. Returns {name, url} or null.
export function pickRemote(top) {
  let out;
  try { out = git(['-C', top, 'config', '--get-regexp', '^remote\\..*\\.url$']); } catch { return null; }
  const remotes = new Map();
  for (const line of out.split('\n')) {
    const m = /^remote\.(.+)\.url\s+(.+)$/.exec(line.trim());
    if (m && !remotes.has(m[1])) remotes.set(m[1], m[2].trim());
  }
  if (!remotes.size) return null;
  const name = remotes.has('origin') ? 'origin' : [...remotes.keys()].sort()[0];
  return { name, url: remotes.get(name) };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const realTop = (top) => { try { return fs.realpathSync.native(top); } catch { return path.resolve(top); } };
export const localKey = (top) => `local-${sha(realTop(top)).slice(0, 12)}`;

// Directory and file-name form of a key: `/` → `__`, other unsafe characters → `_`, at most 100 characters
// (longer keys keep a prefix plus a hash of the whole key, so they stay distinct).
export function keyDir(key) {
  const s = String(key || 'unknown').replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_') || 'unknown';
  return s.length <= 100 ? s : `${s.slice(0, 87)}-${sha(String(key)).slice(0, 12)}`;
}

// True for a v0.2.1 key directory (`local-<hash>`, or `host__path`); false for a v0.2.0 D6 basename folder
// (legacy intents and audit files). A legacy basename that itself contains `__` would be misread as a key.
export function isKeyDir(dir) {
  return typeof dir === 'string' && (/^local-[0-9a-f]{12}$/.test(dir) || /^[^_].*__./.test(dir));
}

// {key, dir, name, top, remote}: the identity of the repo containing `dir` (else the cwd outside git).
// Cached per process: a hook resolves a handful of paths at most.
const cache = new Map();
export function repoId(dir, cwd) {
  const top = repoRoot(dir, cwd);
  if (cache.has(top)) return cache.get(top);
  const remote = gitTopLevel(top) ? pickRemote(top) : null;
  const norm = remote ? normalizeRemote(remote.url) : null;
  const key = norm || localKey(top);
  const id = { key, dir: keyDir(key), name: path.basename(top) || 'root', top, remote: norm ? remote.name : null };
  cache.set(top, id);
  return id;
}

export function repoIdOfFile(filePath, cwd) {
  return repoId(path.dirname(path.resolve(cwd || '.', filePath)), cwd);
}
