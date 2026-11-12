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

const isTurnStart = (e) => e.type === 'user' && !e.isMeta && e.message && typeof e.message.content === 'string';

export function turnStartIndex(entries, before = entries.length) {
  for (let i = Math.min(before, entries.length) - 1; i >= 0; i--) {
    if (isTurnStart(entries[i])) return i;
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

// v0.2c: the turn before the current one (a summary turn may restate its evidence).
export function toolCallsInPreviousTurn(entries) {
  const start = turnStartIndex(entries);
  if (start < 0) return [];
  const prev = turnStartIndex(entries, start);
  return toolCalls(entries).filter((c) => c.entryIndex > prev && c.entryIndex < start);
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

// v0.2c (F2): file paths seen in successful tool output count as seen for the citation check: Grep and
// (v0.2.2) a single-file Grep's own path when its output shows numbered lines, `path:line` pairs in Read output, and
// Glob results and Bash/PowerShell output (`path:line:` or a path at a line start, plus path-like tokens with
// a file extension anywhere in the output, e.g. a file name printed by audit-verify.mjs). Paths with a
// directory part are resolved against the call's cwd; bare file names are returned as is.
const OUT_TOKEN = /(?<![\w@/.~-])((?:~|\.{1,2})?[\\/]?(?:[\w@.+-]+[\\/])*[\w@+-][\w@.+-]*\.[A-Za-z][A-Za-z0-9]{0,9})(?=$|[\s:,;)\]'"`>])/gm;
const LINE_START = /^\s*((?:~|\.{1,2})?[\\/]?(?:[\w@.+-]+[\\/])+[\w@.+-]+)(?::\d+[:-]|\s*$)/gm;
// v0.2.2 (Phase 10 C0): `path:line` pairs. A Read result shows another file's lines only through such pairs.
const PAIR_TOKEN = /(?<![\w@/.~-])((?:~|\.{1,2})?[\\/]?(?:[\w@.+-]+[\\/])*[\w@+-][\w@.+-]*\.[A-Za-z][A-Za-z0-9]{0,9}):\d+/gm;
// A Grep over one file prints its matches as `<line>:` / `<line>-` with no path (Phase 10 C0: 4 of 5 Level 0 runs were
// blocked for citing lines they had seen this way).
const NUMBERED_LINE = /^\s*\d+[:-]/m;
export function filesSeenInOutput(entries, cwd) {
  const out = new Set();
  for (const c of toolCalls(entries)) {
    if (!succeeded(c) || !['Grep', 'Glob', 'Bash', 'PowerShell', 'Read'].includes(c.name) || !c.resultText) continue;
    const base = c.cwd || cwd || process.cwd();
    const text = c.resultText.length > 2_000_000 ? c.resultText.slice(0, 2_000_000) : c.resultText;
    const add = (p) => {
      if (!p || /^\d/.test(p) || /^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return;
      if (/[\\/]/.test(p)) out.add(path.resolve(base, p.startsWith('~') ? p.replace(/^~/, process.env.HOME || '~') : p));
      else out.add(p);
    };
    if (c.name === 'Read') {
      for (const m of text.matchAll(PAIR_TOKEN)) add(m[1]);
      continue;
    }
    if (c.name === 'Grep' && typeof c.input.path === 'string' && c.input.path && NUMBERED_LINE.test(text)) {
      out.add(path.resolve(base, c.input.path.startsWith('~') ? c.input.path.replace(/^~/, process.env.HOME || '~') : c.input.path));
    }
    for (const m of text.matchAll(OUT_TOKEN)) add(m[1]);
    for (const m of text.matchAll(LINE_START)) add(m[1]);
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

// v0.2e (B-1): the report a specialist sent through SubagentHandback (interactive background agents report
// that way, and their SubagentStop has no last_assistant_message, Phase 6b): input.message of the last call.
export function lastHandbackMessage(entries) {
  const calls = toolCalls(entries).filter((c) => c.name === 'SubagentHandback' && typeof c.input.message === 'string');
  for (let i = calls.length - 1; i >= 0; i--) if (calls[i].input.message.trim()) return calls[i].input.message;
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

// v0.2.1 (V21-1): teammate reports in the lead's transcript. They arrive as user prompts holding
// `<teammate-message teammate_id="<name>" …>BODY</teammate-message>`. BODY is either JSON (an idle notification
// whose `result` is the report the teammate gave when it stopped) or the plain text of a SendMessage.
// Returns [{teammate, text, idle}]; JSON bodies with no `result` (shutdown and other protocol messages) are skipped.
const TEAMMATE_RE = /<teammate-message\s+teammate_id="([^"]{1,128})"[^>]*>\n?([\s\S]*?)<\/teammate-message>/g;
export function teammateMessages(entries) {
  const out = [];
  for (const e of entries) {
    if (e.type !== 'user' || !e.message || typeof e.message.content !== 'string') continue;
    if (!e.message.content.includes('<teammate-message')) continue;
    for (const m of e.message.content.matchAll(TEAMMATE_RE)) {
      const body = m[2].trim();
      let json = null;
      if (body.startsWith('{')) { try { json = JSON.parse(body); } catch { json = null; } }
      if (json && typeof json === 'object') {
        if (typeof json.result === 'string' && json.result.trim()) out.push({ teammate: m[1], text: json.result, idle: json.type === 'idle_notification' });
        continue;
      }
      if (body) out.push({ teammate: m[1], text: body, idle: false });
    }
  }
  return out;
}
