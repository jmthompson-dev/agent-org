// agent-org: hash-chained, rotated, tamper-evident audit log (C1, C2, D27; P5 C5).
//   ~/.agent-org/audit/<repo>.jsonl          active file; one JSON object per line
//   ~/.agent-org/audit/<repo>-<n>.jsonl      rotated files, oldest first
//   ~/.agent-org/state/audit-<repo>.head     {file, index, rotated, lines, bytes, lastHash, checkpoint: {offset, line, hash}}
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

export const EVENTS = new Set(['dispatch', 'result', 'collision', 'guard-deny', 'conflict', 'claim-flag',
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
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\.jsonl$`);
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
export function append(repo, fields) {
  const dir = auditRoot();
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(stateRoot(), { recursive: true });
  const file = path.join(dir, activeName(repo));
  return withLock(file, () => {
    let head = readHead(repo);
    if (!head) {
      const t = scanTail(file);
      head = { file: activeName(repo), index: rotatedFiles(repo, null).length, rotated: rotatedFiles(repo, null),
        lines: t.lines, bytes: t.bytes, lastHash: t.lastHash, checkpoint: null };
    }
    if (!Array.isArray(head.rotated)) head.rotated = rotatedFiles(repo, null);
    const rec = { ts: new Date().toISOString(), repo: String(repo) };
    for (const [k, v] of Object.entries(fields || {})) if (v !== undefined && v !== null && k !== 'prev' && k !== 'h') rec[k] = v;
    // Chain from the head, not the file: a truncated or edited tail then shows up as a break.
    rec.prev = head.lastHash || GENESIS;
    rec.h = hashLine(rec);
    const line = `${JSON.stringify(rec)}\n`;
    const len = Buffer.byteLength(line);

    let actualBytes = 0;
    try { actualBytes = fs.statSync(file).size; } catch { actualBytes = 0; }
    if (actualBytes > 0 && actualBytes + len > maxBytes()) {
      // Rotate: pick the next free <repo>-<n>.jsonl, never overwriting an existing file.
      let n = (Number(head.index) || head.rotated.length) + 1;
      while (fs.existsSync(path.join(dir, `${safeRepo(repo)}-${n}.jsonl`))) n++;
      const rotatedName = `${safeRepo(repo)}-${n}.jsonl`;
      fs.renameSync(file, path.join(dir, rotatedName));
      head.rotated.push(rotatedName);
      head.index = n;
      head.lines = 0;
      head.bytes = 0;
      head.checkpoint = { offset: 0, line: 0, hash: rec.prev };
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

// Walks lines of one file from a byte offset. Returns {ok, lines, bytes, last, breakAfterLine}.
function walk(file, prev, startOffset = 0, startLine = 0) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return { ok: false, missing: true, lines: startLine, bytes: 0, last: prev, breakAfterLine: startLine }; }
  if (startOffset > buf.length) return { ok: false, lines: startLine, bytes: buf.length, last: prev, breakAfterLine: startLine };
  const text = buf.subarray(startOffset).toString('utf8');
  let line = startLine;
  let last = prev;
  const parts = text.split('\n');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  for (const l of parts) {
    let rec;
    try { rec = JSON.parse(l); } catch { return { ok: false, lines: line, bytes: buf.length, last, breakAfterLine: line }; }
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
// Incremental: from the head's checkpoint in the active file; moves the checkpoint forward on success
// (unless readOnly, as audit-verify.mjs uses it).
export function verify(repo, { full = false, readOnly = false } = {}) {
  const dir = auditRoot();
  const active = path.join(dir, activeName(repo));
  const head = readHead(repo);
  const activeExists = fs.existsSync(active);
  const rotated = rotatedFiles(repo, head);
  if (!activeExists && !rotated.length) {
    if (head && Number(head.lines) > 0) return { ok: false, file: activeName(repo), headMismatch: true, lines: 0, files: 0 };
    return { ok: true, absent: true, lines: 0, files: 0 };
  }
  let prev = GENESIS;
  let total = 0;
  let cp = head && head.checkpoint && Number.isFinite(head.checkpoint.offset) ? head.checkpoint : null;
  const incremental = !full && cp;

  if (!incremental) {
    for (const f of rotated) {
      const r = walk(path.join(dir, f), prev);
      if (!r.ok) return { ok: false, file: f, breakAfterLine: r.breakAfterLine, lines: total + r.lines, files: rotated.length + 1 };
      prev = r.last;
      total += r.lines;
    }
  }
  const r = incremental ? walk(active, cp.hash ?? GENESIS, cp.offset, Number(cp.line) || 0) : walk(active, prev);
  if (!r.ok) {
    if (r.missing && !activeExists && head && Number(head.lines) === 0) {
      // Rotated just before a new active file was written: nothing to compare.
    } else {
      return { ok: false, file: activeName(repo), breakAfterLine: r.breakAfterLine, lines: total + r.lines, files: rotated.length + 1 };
    }
  }
  total += r.lines;
  const files = rotated.length + (activeExists ? 1 : 0);
  if (!head) return { ok: true, noHead: true, lines: total, files };
  if (Number(head.lines) !== r.lines || Number(head.bytes) !== r.bytes || (head.lastHash || GENESIS) !== r.last) {
    return { ok: false, file: activeName(repo), headMismatch: true, lines: total, files };
  }
  if (readOnly) return { ok: true, lines: total, files };
  // Move the checkpoint forward (under the lock; another append may have landed meanwhile).
  try {
    withLock(active, () => {
      const h = readHead(repo);
      if (h && h.lastHash === r.last) {
        h.checkpoint = { offset: r.bytes, line: r.lines, hash: r.last };
        writeHead(repo, h);
      }
    });
  } catch { /* checkpoint is an optimization */ }
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
    const files = fs.readdirSync(auditRoot()).filter((f) => f.endsWith('.jsonl'));
    for (const f of files) {
      const base = f.slice(0, -'.jsonl'.length);
      const m = /^(.+)-(\d+)$/.exec(base);
      // `<x>-<n>.jsonl` is a rotated file when repo <x> is known; otherwise treat it as a repo of its own.
      if (m && (heads.has(m[1]) || files.includes(`${m[1]}.jsonl`))) continue;
      names.add(base);
    }
  } catch { /* none */ }
  return [...names].sort();
}
