// agent-org: per-session state (D26, D28; P5 D1, D2, D5).
//   ~/.agent-org/state/<session_id>/state.json   {approvals: [{repo, intent, mode, approvedAt}],
//                                                 scope: {<repo>: [files]},
//                                                 dispatch: {<agentId>: {promptId, toolUseId, agentType}}}
//   ~/.agent-org/state/<session_id>/ledger.jsonl  {ts, agent_id, agent_type, file[, collision, tool_use_id]}
// Metadata only, never content. Writes go through the lock; JSON updates are temp file plus rename.
// The session id scopes everything: approvals survive resume and compaction, not /clear or a fork.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withLock } from './lock.mjs';

export const home = () => os.homedir();
export const orgDir = () => path.join(home(), '.agent-org');
export const stateRoot = () => path.join(orgDir(), 'state');
export const intentsRoot = () => path.join(orgDir(), 'intents');

export function safeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(id) && !/^\.+$/.test(id) ? id : null;
}

export function sessionDir(sessionId) {
  const id = safeId(sessionId);
  return id ? path.join(stateRoot(), id) : null;
}

export const emptyState = () => ({ approvals: [], scope: {}, dispatch: {} });

function normalizeState(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('bad state');
  return {
    approvals: Array.isArray(s.approvals) ? s.approvals : [],
    scope: s.scope && typeof s.scope === 'object' && !Array.isArray(s.scope) ? s.scope : {},
    dispatch: s.dispatch && typeof s.dispatch === 'object' && !Array.isArray(s.dispatch) ? s.dispatch : {},
  };
}

// Missing state → empty state. Corrupt or unreadable state → throws (callers fail open).
export function readState(sessionId) {
  const dir = sessionDir(sessionId);
  if (!dir) throw new Error('no session id');
  let raw;
  try {
    raw = fs.readFileSync(path.join(dir, 'state.json'), 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return emptyState();
    throw e;
  }
  return normalizeState(JSON.parse(raw));
}

export function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 1)}\n`);
  fs.renameSync(tmp, file);
}

// Read-modify-write under the lock. A corrupt file is left alone (no update) rather than overwritten.
export function updateState(sessionId, mutate) {
  const dir = sessionDir(sessionId);
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'state.json');
  return withLock(file, () => {
    const s = readState(sessionId);
    const out = mutate(s) || s;
    writeJsonAtomic(file, out);
    return out;
  });
}

export function appendLedger(sessionId, rec) {
  const dir = sessionDir(sessionId);
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'ledger.jsonl');
  const line = { ts: new Date().toISOString(), agent_id: rec.agent_id ?? null, agent_type: rec.agent_type ?? null, file: rec.file ?? null };
  if (rec.collision) line.collision = rec.collision;
  if (rec.tool_use_id) line.tool_use_id = rec.tool_use_id;
  withLock(file, () => fs.appendFileSync(file, `${JSON.stringify(line)}\n`));
}

// Missing ledger → []. Unreadable → throws. Bad lines are skipped.
export function readLedger(sessionId) {
  const dir = sessionDir(sessionId);
  if (!dir) throw new Error('no session id');
  let raw;
  try {
    raw = fs.readFileSync(path.join(dir, 'ledger.jsonl'), 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return [];
    throw e;
  }
  const out = [];
  for (const l of raw.split('\n')) {
    if (!l.trim()) continue;
    try { const r = JSON.parse(l); if (r && typeof r === 'object') out.push(r); } catch { /* skip */ }
  }
  return out;
}

// The approval recorded for a repo in this session (latest wins), or null.
export function approvalFor(state, repo) {
  if (!state || !Array.isArray(state.approvals)) return null;
  const hits = state.approvals.filter((a) => a && a.repo === repo);
  return hits.length ? hits[hits.length - 1] : null;
}

// Resolve `~`, relative paths and symlinks (on the longest existing prefix).
export function resolvePath(p, cwd) {
  if (typeof p !== 'string' || !p) return null;
  let s = p;
  if (s === '~' || s.startsWith('~/') || s.startsWith('~\\')) s = path.join(home(), s.slice(1));
  s = path.resolve(cwd || process.cwd(), s);
  return realpathLoose(s);
}

export function realpathLoose(abs) {
  const rest = [];
  let d = abs;
  for (let i = 0; i < 256; i++) {
    try {
      const real = fs.realpathSync.native(d);
      return rest.length ? path.join(real, ...rest.reverse()) : real;
    } catch {
      const up = path.dirname(d);
      if (up === d) return abs;
      rest.push(path.basename(d));
      d = up;
    }
  }
  return abs;
}

export function isUnder(file, dir) {
  if (!file || !dir) return false;
  const rel = path.relative(dir, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// Both the logical and the real home, since ~ may itself be a symlink.
export function orgSubdir(name) {
  const logical = path.join(orgDir(), name);
  return [...new Set([logical, realpathLoose(logical)])];
}

// Most recently modified session directory (for `record.mjs --ledger` without a session id).
export function latestSessionId() {
  let best = null;
  try {
    for (const d of fs.readdirSync(stateRoot(), { withFileTypes: true })) {
      if (!d.isDirectory() || !safeId(d.name)) continue;
      let m = 0;
      for (const f of ['', 'state.json', 'ledger.jsonl']) {
        try { m = Math.max(m, fs.statSync(path.join(stateRoot(), d.name, f)).mtimeMs); } catch { /* absent */ }
      }
      if (!best || m > best.m) best = { id: d.name, m };
    }
  } catch { /* none */ }
  return best ? best.id : null;
}
