// agent-org: transcript parsing for the claim, citation and collision checks (P5 A5, A8, B2).
// Only `type:"assistant"` entries count for tool_use (api-request-blob entries duplicate calls and are
// skipped). Results pair by tool_use_id from `type:"user"` tool_result blocks; a call succeeded iff its
// result has is_error === false. Turn start = the last `type:"user"` entry with string content that
// isn't isMeta (hook feedback is isMeta, so a blocked-and-continued turn stays one turn).
// Parses the whole file: a 2.7 MB transcript takes ~0.1 s (P5 A5).

import fs from 'node:fs';
import path from 'node:path';
import { commandSegments } from '../guard.mjs';

export function readJsonl(file) {
  const raw = fs.readFileSync(file, 'utf8'); // throws if missing: callers fail open
  const out = [];
  for (const l of raw.split('\n')) {
    if (!l) continue;
    try { const e = JSON.parse(l); if (e && typeof e === 'object') out.push(e); } catch { /* partial line */ }
  }
  return out;
}

export function resultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('\n');
  return '';
}

// All tool calls in order: {id, name, input, entryIndex, cwd, isError (null if no result), resultText}
export function toolCalls(entries) {
  const results = new Map();
  entries.forEach((e) => {
    if (e.type !== 'user' || !e.message || !Array.isArray(e.message.content)) return;
    for (const c of e.message.content) {
      if (c && c.type === 'tool_result' && typeof c.tool_use_id === 'string') results.set(c.tool_use_id, c);
    }
  });
  const seen = new Set();
  const calls = [];
  entries.forEach((e, i) => {
    if (e.type !== 'assistant' || !e.message || !Array.isArray(e.message.content)) return;
    for (const c of e.message.content) {
      if (!c || c.type !== 'tool_use' || typeof c.id !== 'string' || seen.has(c.id)) continue;
      seen.add(c.id);
      const r = results.get(c.id);
      calls.push({
        id: c.id,
        name: c.name,
        input: c.input && typeof c.input === 'object' ? c.input : {},
        entryIndex: i,
        cwd: typeof e.cwd === 'string' ? e.cwd : null,
        isError: r ? r.is_error === true : null,
        resultText: r ? resultText(r.content) : '',
      });
    }
  });
  return calls;
}

export function turnStartIndex(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type === 'user' && !e.isMeta && e.message && typeof e.message.content === 'string') return i;
  }
  return -1;
}

export function turnStartedFromNotification(entries) {
  const i = turnStartIndex(entries);
  if (i < 0) return false;
  const e = entries[i];
  return e.turnOrigin === 'task_notification' || e.message.content.trimStart().startsWith('<task-notification>');
}

export function toolCallsInTurn(entries) {
  const start = turnStartIndex(entries);
  return toolCalls(entries).filter((c) => c.entryIndex > start);
}

export const succeeded = (c) => c.isError === false;
export const isShell = (c) => c.name === 'Bash' || c.name === 'PowerShell';

// File arguments of single-purpose shell reads: cat, head, tail, sed -n, grep, rg, nl.
const READERS = new Set(['cat', 'head', 'tail', 'sed', 'grep', 'egrep', 'fgrep', 'rg', 'nl']);
const VALUED = {
  head: new Set(['-n', '-c', '--lines', '--bytes']),
  tail: new Set(['-n', '-c', '--lines', '--bytes']),
  nl: new Set(['-b', '-n', '-s', '-v', '-w', '-i']),
  grep: new Set(['-e', '-f', '-m', '-A', '-B', '-C', '--include', '--exclude', '--max-count']),
  rg: new Set(['-e', '-f', '-m', '-A', '-B', '-C', '-g', '-t', '-T', '--glob', '--type', '--max-count']),
  sed: new Set(['-e', '-f']),
};

export function shellReadFiles(command, posix = true) {
  const files = [];
  let segs;
  try { segs = commandSegments(command, posix); } catch { return files; }
  for (const words of segs) {
    let exe = (words[0] || '').split(/[\\/]/).pop().toLowerCase();
    if (exe === 'egrep' || exe === 'fgrep') exe = 'grep';
    if (!READERS.has(exe)) continue;
    const args = words.slice(1);
    const valued = VALUED[exe] || new Set();
    const plain = [];
    let patternGiven = false;
    let quietN = false;
    for (let j = 0; j < args.length; j++) {
      const a = args[j];
      if (a === '--') { plain.push(...args.slice(j + 1)); break; }
      if (a.startsWith('-') && a !== '-') {
        if (exe === 'sed' && /^-[A-Za-z]*n[A-Za-z]*$/.test(a)) quietN = true;
        if (valued.has(a)) { if (a === '-e' || a === '-f') patternGiven = true; j++; }
        else if (/^--(regexp|file)=/.test(a)) patternGiven = true;
        continue;
      }
      if (a.startsWith('>') || a.startsWith('<') || /^\d[<>]/.test(a)) { if (/^\d?[<>]+&?$/.test(a)) j++; continue; }
      plain.push(a);
    }
    if (exe === 'sed') {
      if (!quietN) continue; // only `sed -n` counts as a read
      if (!patternGiven) plain.shift();
    } else if (exe === 'grep' || exe === 'rg') {
      if (!patternGiven) plain.shift();
    }
    for (const p of plain) if (p && p !== '-' && !p.includes('$SUB')) files.push(p);
  }
  return files;
}

// Absolute paths opened in a transcript: Read/Edit/Write/NotebookEdit file_path, plus shell reads.
export function filesOpenedInSession(entries, cwd) {
  const out = new Set();
  for (const c of toolCalls(entries)) {
    const base = c.cwd || cwd || process.cwd();
    if (['Read', 'Edit', 'Write', 'NotebookEdit'].includes(c.name)) {
      const p = c.input.file_path || c.input.notebook_path;
      if (typeof p === 'string' && p) out.add(path.resolve(base, p));
    } else if (isShell(c) && typeof c.input.command === 'string') {
      for (const f of shellReadFiles(c.input.command, c.name === 'Bash')) out.add(path.resolve(base, f));
    }
  }
  return out;
}

const STALE_RE = /^\s*(?:<tool_use_error>\s*)?File has been modified since read/;

// Edit/Write calls refused because another writer changed the file since it was read (P5 B2).
export function refusedStaleEdits(entries) {
  return toolCalls(entries)
    .filter((c) => (c.name === 'Edit' || c.name === 'Write' || c.name === 'NotebookEdit') && c.isError === true && STALE_RE.test(c.resultText))
    .map((c) => ({ toolUseId: c.id, file: c.input.file_path || c.input.notebook_path || null }));
}

export function finalAssistantText(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type !== 'assistant' || !e.message) continue;
    const c = e.message.content;
    if (typeof c === 'string' && c.trim()) return c;
    if (Array.isArray(c)) {
      const t = c.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
      if (t.trim()) return t;
    }
  }
  return '';
}

// This session's subagent transcripts: <dir of transcript_path>/<session_id>/subagents/agent-*.jsonl (P5 A8).
export function subagentTranscripts(transcriptPath, sessionId) {
  if (typeof transcriptPath !== 'string' || !transcriptPath) return [];
  const sid = typeof sessionId === 'string' && sessionId ? sessionId : path.basename(transcriptPath, '.jsonl');
  if (!/^[A-Za-z0-9._-]+$/.test(sid)) return [];
  const dir = path.join(path.dirname(transcriptPath), sid, 'subagents');
  try {
    return fs.readdirSync(dir).filter((f) => /^agent-.*\.jsonl$/.test(f)).sort().map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}
