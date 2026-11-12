// agent-org: hash-chained, rotated, tamper-evident audit log (C1, C2, D27; P5 C5).
//   ~/.agent-org/audit/<repo>.jsonl          active file; one JSON object per line
//   ~/.agent-org/audit/<repo>.jsonl.<n>      rotated files, oldest first (log-rotation style: no repo name can clash)
//   ~/.agent-org/state/audit-<repo>.head     {file, index, rotated, lines, bytes, lastHash}
// v0.2.1 (V21-9, D31): <repo> is the repo key's directory form (lib/repo.mjs keyDir); lines carry `repo` (the D6
// display name) and `key`. v0.2.0 files named by the D6 basename stay where they are and still verify.
// Each line carries `prev` (the previous line's `h`) and `h` = sha256(prev + canonical(line without h)).
// The chain runs across rotated files. Appends and head updates happen in one locked section.
// Metadata only: never prompt text, commands, message bodies, file content or report text.
// Tamper-evident, not tamper-proof: anything with shell access can rewrite both log and head.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { orgDir, stateRoot, writeJsonAtomic } from './state.mjs';
import { withLock } from './lock.mjs';

export const auditRoot = () => path.join(orgDir(), 'audit');
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const GENESIS = '';

// No separate `conflict` event (v0.2c, F5): a `result` line with outcome BLOCKED is the conflict record.
export const EVENTS = new Set(['dispatch', 'result', 'collision', 'guard-deny', 'guard-ask', 'claim-flag',
  'team-task-created', 'team-task-completed', 'teammate-idle', 'message']);

// Keep repo names usable as file names on every OS.
export function safeRepo(repo) {
  const s = String(repo || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  return s.slice(0, 100) || 'unknown';
}

const activeName = (repo) => `${safeRepo(repo)}.jsonl`;
const headPath = (repo) => path.join(stateRoot(), `audit-${safeRepo(repo)}.head`);
const maxBytes = () => {
  const n = Number(process.env.AGENT_ORG_AUDIT_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
};

export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

export function hashLine(rec) {
  const { h, ...rest } = rec;
  return crypto.createHash('sha256').update(String(rec.prev ?? GENESIS)).update(canonical(rest)).digest('hex');
}

export function readHead(repo) {
  try {
    const h = JSON.parse(fs.readFileSync(headPath(repo), 'utf8'));
    return h && typeof h === 'object' ? h : null;
  } catch {
    return null;
  }
}

function writeHead(repo, head) {
  writeJsonAtomic(headPath(repo), head);
}

// Rotated files in chain order: the head's list if present, else discovered by name.
function rotatedFiles(repo, head) {
  if (head && Array.isArray(head.rotated)) return head.rotated.filter((f) => typeof f === 'string');
  const base = safeRepo(repo);
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.jsonl\\.(\\d+)$`);
  try {
    return fs.readdirSync(auditRoot())
      .map((f) => [f, re.exec(f)])
      .filter(([, m]) => m)
      .sort((a, b) => Number(a[1][1]) - Number(b[1][1]))
      .map(([f]) => f);
  } catch {
    return [];
  }
}

// Last line's hash and counts of an existing active file (used only when there is no head record).
function scanTail(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw.split('\n').filter((l) => l.length);
    let last = GENESIS;
    for (let i = lines.length - 1; i >= 0; i--) {
      try { last = JSON.parse(lines[i]).h || GENESIS; break; } catch { /* keep looking */ }
    }
    return { lines: lines.length, bytes: Buffer.byteLength(raw), lastHash: last };
  } catch {
    return { lines: 0, bytes: 0, lastHash: GENESIS };
  }
}

// Appends one record. Fields with undefined/null values are dropped. Returns the written record or null.
// `target` is a repo id from lib/repo.mjs ({key, dir, name}) or, as in v0.2.0, a plain file-name stem.
export function append(target, fields) {
  const id = target && typeof target === 'object' ? target : null;
  const repo = id ? id.dir : target;
  const dir = auditRoot();
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(stateRoot(), { recursive: true });
  const file = path.join(dir, activeName(repo));
  return withLock(file, () => {
    let head = readHead(repo);
    if (!head) {
      const t = scanTail(file);
      head = { file: activeName(repo), index: rotatedFiles(repo, null).length, rotated: rotatedFiles(repo, null),
        lines: t.lines, bytes: t.bytes, lastHash: t.lastHash };
    }
    delete head.checkpoint; // v0.2c (F3): verify always walks whole files
    if (!Array.isArray(head.rotated)) head.rotated = rotatedFiles(repo, null);
    const rec = { ts: new Date().toISOString(), repo: String(id ? id.name : repo) };
    if (id && id.key) rec.key = String(id.key);
    for (const [k, v] of Object.entries(fields || {})) if (v !== undefined && v !== null && k !== 'prev' && k !== 'h') rec[k] = v;
    // Chain from the head, not the file: a truncated or edited tail then shows up as a break.
    rec.prev = head.lastHash || GENESIS;
    rec.h = hashLine(rec);
    const line = `${JSON.stringify(rec)}\n`;
    const len = Buffer.byteLength(line);

    let actualBytes = 0;
    try { actualBytes = fs.statSync(file).size; } catch { actualBytes = 0; }
    if (actualBytes > 0 && actualBytes + len > maxBytes()) {
      // Rotate: pick the next free <repo>.jsonl.<n>, never overwriting an existing file.
      let n = (Number(head.index) || head.rotated.length) + 1;
      while (fs.existsSync(path.join(dir, `${safeRepo(repo)}.jsonl.${n}`))) n++;
      const rotatedName = `${safeRepo(repo)}.jsonl.${n}`;
      fs.renameSync(file, path.join(dir, rotatedName));
      head.rotated.push(rotatedName);
      head.index = n;
      head.lines = 0;
      head.bytes = 0;
    }
    fs.appendFileSync(file, line);
    head.file = activeName(repo);
    head.lines = (Number(head.lines) || 0) + 1;
    head.bytes = (Number(head.bytes) || 0) + len;
    head.lastHash = rec.h;
    writeHead(repo, head);
    return rec;
  });
}

// Walks every line of one file. `prev` null means "trust the first line's prev" (the active file checked
// on its own at session start). Returns {ok, lines, bytes, last, breakAfterLine}; breakAfterLine is the
// count of good lines before the bad one, so the break is between 1-based lines N and N+1.
function walk(file, prev) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return { ok: false, missing: true, lines: 0, bytes: 0, last: prev, breakAfterLine: 0 }; }
  const text = buf.toString('utf8');
  let line = 0;
  let last = prev;
  const parts = text.split('\n');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  for (const l of parts) {
    let rec;
    try { rec = JSON.parse(l); } catch { return { ok: false, lines: line, bytes: buf.length, last, breakAfterLine: line }; }
    if (last === null && rec && typeof rec === 'object') last = rec.prev ?? GENESIS;
    if (!rec || typeof rec !== 'object' || (rec.prev ?? GENESIS) !== last || hashLine(rec) !== rec.h) {
      return { ok: false, lines: line, bytes: buf.length, last, breakAfterLine: line };
    }
    last = rec.h;
    line++;
  }
  return { ok: true, lines: line, bytes: buf.length, last };
}

// verify(repo, {full}) → {ok, file, breakAfterLine, headMismatch, lines, files, noHead}
// Full: every rotated file in order, then the active file, then the head record.
// Not full (session start, v0.2c F3): the whole active file, chained from its own first line, then the
// head record. Rotated files are checked only in full mode. Never writes anything.
export function verify(repo, { full = false } = {}) {
  const dir = auditRoot();
  const active = path.join(dir, activeName(repo));
  const head = readHead(repo);
  const activeExists = fs.existsSync(active);
  const rotated = rotatedFiles(repo, head);
  if (!activeExists && !rotated.length) {
    if (head && Number(head.lines) > 0) return { ok: false, file: activeName(repo), headMismatch: true, lines: 0, files: 0 };
    return { ok: true, absent: true, lines: 0, files: 0 };
  }
  let prev = full ? GENESIS : null;
  let total = 0;
  if (full) {
    for (const f of rotated) {
      const r = walk(path.join(dir, f), prev);
      if (!r.ok) return { ok: false, file: f, breakAfterLine: r.breakAfterLine, lines: total + r.lines, files: rotated.length + 1 };
      prev = r.last;
      total += r.lines;
    }
  }
  const r = walk(active, prev);
  if (!r.ok) {
    if (r.missing && !activeExists && head && Number(head.lines) === 0) {
      // Rotated just before a new active file was written: nothing to compare.
    } else {
      return { ok: false, file: activeName(repo), breakAfterLine: r.breakAfterLine, lines: total + r.lines, files: rotated.length + 1 };
    }
  }
  total += r.lines;
  const files = (full ? rotated.length : 0) + (activeExists ? 1 : 0);
  if (!head) return { ok: true, noHead: true, lines: total, files };
  const last = r.last ?? GENESIS;
  if (Number(head.lines) !== r.lines || Number(head.bytes) !== r.bytes || (head.lastHash || GENESIS) !== last) {
    return { ok: false, file: activeName(repo), headMismatch: true, lines: total, files };
  }
  return { ok: true, lines: total, files };
}

// Repos that have an audit file or a head record.
export function listRepos() {
  const names = new Set();
  const heads = new Set();
  try {
    for (const f of fs.readdirSync(stateRoot())) {
      const m = /^audit-(.+)\.head$/.exec(f);
      if (m) { names.add(m[1]); heads.add(m[1]); }
    }
  } catch { /* none */ }
  try {
    for (const f of fs.readdirSync(auditRoot())) {
      // Active `<repo>.jsonl` or rotated `<repo>.jsonl.<n>`: both name the repo unambiguously.
      const m = /^(.+)\.jsonl(?:\.\d+)?$/.exec(f);
      if (m) names.add(m[1]);
    }
  } catch { /* none */ }
  return [...names].sort();
}
