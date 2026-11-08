#!/usr/bin/env node
// agent-org PreToolUse guard (D12). Two jobs:
//   1. Bash/PowerShell: return `ask` when any segment of the command, after normalization, matches the
//      ask list. This closes the gaps that text-only ask rules leave (`git -C . push`, `/usr/bin/git push`,
//      `sh -c '…'`, `FOO=1 kubectl apply`). The user's ask rules in settings.json stay the primary layer.
//   2. Edit/Write by agent-org:quality-assurance-architect: `deny` anything that isn't a test path.
// It only ever returns `ask` or `deny`, never `allow`, so it can't loosen anything.
// Dependency-free and fail-open: any error produces no output and exit code 0.
// Never logs tool inputs. Debug logging (AGENT_ORG_HOOK_DEBUG=1) records the tool name, agent_type,
// the decision and the matched rule name only.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEBUG_FILE = path.join(os.homedir(), '.claude', 'agent-org', 'hook-debug.jsonl');
const QA_AGENT = 'agent-org:quality-assurance-architect';

// ---------------------------------------------------------------------------------------------
// Shell parsing

const KEYWORDS = new Set(['{', '}', '!', 'if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'case', 'esac']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish']);
const PWSH = new Set(['pwsh', 'powershell']);

// Splits a command line into segments (arrays of words). Separators: && || | |& ; & newline ( ).
// Command substitutions $(…) and `…` are analyzed as separate command lines.
// `posix` = false (PowerShell) turns off backslash escaping so Windows paths survive.
function splitCommand(src, posix, out, depth = 0) {
  if (depth > 8) return out;
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null; // "'" or '"'
  const pushWord = () => { if (inWord) words.push(word); word = ''; inWord = false; };
  const pushSeg = () => { pushWord(); if (words.length) out.push(words); words = []; };
  const takeParen = (start) => { // src[start] is the char after "$(" ; returns index of matching ")"
    let d = 1;
    for (let j = start; j < src.length; j++) {
      if (src[j] === '(') d++;
      else if (src[j] === ')' && --d === 0) return j;
    }
    return src.length;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote === "'") {
      if (c === "'") quote = null; else word += c;
      continue;
    }
    if (posix && c === '\\' && i + 1 < src.length) {
      if (src[i + 1] === '\n') { i++; continue; } // line continuation
      if (quote === '"' && !'"\\$`'.includes(src[i + 1])) { word += c; inWord = true; continue; }
      word += src[++i]; inWord = true; continue;
    }
    if (c === '$' && src[i + 1] === '(') {
      const end = takeParen(i + 2);
      splitCommand(src.slice(i + 2, end), posix, out, depth + 1);
      i = end; inWord = true; word += '$SUB';
      continue;
    }
    if (c === '`' && posix) {
      const end = src.indexOf('`', i + 1);
      const stop = end === -1 ? src.length : end;
      splitCommand(src.slice(i + 1, stop), posix, out, depth + 1);
      i = stop; inWord = true; word += '$SUB';
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null; else word += c;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; inWord = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { pushWord(); continue; }
    if (c === '\n' || c === ';' || c === '&' || c === '|' || c === '(' || c === ')') {
      // `2>&1`, `&>file`, `>&2`: a redirection, not a separator.
      if (c === '&' && (src[i - 1] === '>' || src[i - 1] === '<' || src[i + 1] === '>')) { word += c; inWord = true; continue; }
      pushSeg();
      continue;
    }
    word += c; inWord = true;
  }
  pushSeg();
  return out;
}

function baseName(word) {
  const b = word.split(/[\\/]/).pop() || '';
  return b.replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
}

// Skip leading option words; `valued` lists options that consume the next word.
function skipOptions(words, i, valued = new Set()) {
  while (i < words.length && words[i].startsWith('-') && words[i] !== '-' && words[i] !== '--') {
    const w = words[i];
    i += valued.has(w) ? 2 : 1;
  }
  if (words[i] === '--') i++;
  return i;
}

// Strips assignments, keywords, redirections-before-command and process wrappers. Returns the words
// starting at the real executable, or a {script} to analyze recursively, or null.
function normalize(words) {
  let i = 0;
  for (let guard = 0; guard < 20 && i < words.length; guard++) {
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) { i++; continue; }
    if (KEYWORDS.has(w)) { i++; continue; }
    if (/^\d*[<>]/.test(w)) { i += /^\d*[<>]+&?$/.test(w) ? 2 : 1; continue; } // `> file` or `>file`
    const b = baseName(w);
    if (b === 'env') { i++; while (i < words.length && (words[i].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) { i += ['-u', '-C', '--unset', '--chdir'].includes(words[i]) ? 2 : 1; } continue; }
    if (b === 'sudo' || b === 'doas') { i = skipOptions(words, i + 1, new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U'])); continue; }
    if (b === 'timeout') { i = skipOptions(words, i + 1, new Set(['-s', '-k', '--signal', '--kill-after'])) + 1; continue; }
    if (b === 'nice') { i = skipOptions(words, i + 1, new Set(['-n', '--adjustment'])); continue; }
    if (b === 'xargs') { i = skipOptions(words, i + 1, new Set(['-n', '-I', '-i', '-P', '-L', '-l', '-s', '-d', '-E', '-e', '-a', '--max-args', '--max-procs', '--delimiter', '--arg-file'])); continue; }
    if (b === 'command' || b === 'builtin') {
      if (words[i + 1] === '-v' || words[i + 1] === '-V') return null; // lookup, not execution
      i = skipOptions(words, i + 1); continue;
    }
    if (['nohup', 'time', 'noglob', 'stdbuf', 'exec', 'nocorrect'].includes(b)) { i = skipOptions(words, i + 1); continue; }
    break;
  }
  const rest = words.slice(i);
  if (!rest.length) return null;
  const exe = baseName(rest[0]);
  if (SHELLS.has(exe)) {
    // sh -c 'script', also combined flags such as -lc / -ec.
    for (let j = 1; j < rest.length; j++) {
      if (/^-[A-Za-z]*c[A-Za-z]*$/.test(rest[j])) return rest[j + 1] !== undefined ? { script: rest[j + 1], posix: true } : null;
      if (!rest[j].startsWith('-')) break;
    }
  }
  if (exe === 'eval') return { script: rest.slice(1).join(' '), posix: true };
  if (PWSH.has(exe)) {
    for (let j = 1; j < rest.length; j++) {
      const f = rest[j].toLowerCase();
      if (/^-(c|co|com|comm|comma|comman|command)$/.test(f)) return { script: rest.slice(j + 1).join(' '), posix: false };
      if (/^-(e|ec|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)$/.test(f) && rest[j + 1]) {
        try { return { script: Buffer.from(rest[j + 1], 'base64').toString('utf16le'), posix: false }; } catch { return null; }
      }
    }
  }
  return { words: rest };
}

// ---------------------------------------------------------------------------------------------
// The ask list (mirrors the Part A ask rules in user settings.json)

const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--exec-path']);
const GIT_SIMPLE = new Set(['commit', 'push', 'merge', 'rebase', 'clean', 'tag']);
const KUBECTL = new Set(['apply', 'edit', 'patch', 'delete', 'scale', 'rollout']);
const HELM = new Set(['install', 'upgrade', 'uninstall', 'rollback']);
const TERRAFORM = new Set(['apply', 'destroy', 'import']);
const GCLOUD = new Set(['create', 'delete', 'update', 'deploy']);
const AZ = new Set(['create', 'delete', 'update']);
const CF = new Set(['push', 'delete']);
const PS_REMOVE = new Set(['remove-item', 'ri', 'del', 'erase', 'rd']);

const plainWords = (args) => args.filter((a) => !a.startsWith('-')).map((a) => a.toLowerCase());

function matchAsk(words) {
  const exe = baseName(words[0]);
  const args = words.slice(1);
  switch (exe) {
    case 'git': {
      const i = skipOptions(args, 0, GIT_VALUED);
      const sub = (args[i] || '').toLowerCase();
      const after = args.slice(i + 1);
      if (GIT_SIMPLE.has(sub)) return `git ${sub}`;
      if (sub === 'reset' && after.some((a) => a.toLowerCase() === '--hard')) return 'git reset --hard';
      if (sub === 'branch' && (after.some((a) => /^-[A-Za-z]*D[A-Za-z]*$/.test(a))
        || (after.some((a) => a === '--delete' || /^-[A-Za-z]*d[A-Za-z]*$/.test(a)) && after.some((a) => a === '--force' || /^-[A-Za-z]*f[A-Za-z]*$/.test(a))))) return 'git branch -D';
      return null;
    }
    case 'gh': {
      const p = []; // non-option words, skipping -R/--repo values
      for (let j = 0; j < args.length; j++) {
        if (args[j] === '-R' || args[j] === '--repo') { j++; continue; }
        if (!args[j].startsWith('-')) p.push(args[j].toLowerCase());
      }
      const pair = `${p[0]} ${p[1]}`;
      return ['pr create', 'pr merge', 'release create', 'repo delete'].includes(pair) ? `gh ${pair}` : null;
    }
    case 'kubectl': { const v = plainWords(args).find((a) => KUBECTL.has(a)); return v ? `kubectl ${v}` : null; }
    case 'helm': { const v = plainWords(args).find((a) => HELM.has(a)); return v ? `helm ${v}` : null; }
    case 'terraform': case 'tofu': { const v = plainWords(args).find((a) => TERRAFORM.has(a)); return v ? `terraform ${v}` : null; }
    case 'gcloud': { const v = plainWords(args).find((a) => GCLOUD.has(a)); return v ? `gcloud … ${v}` : null; }
    case 'az': { const v = plainWords(args).find((a) => AZ.has(a)); return v ? `az … ${v}` : null; }
    case 'cf': { const v = plainWords(args).find((a) => CF.has(a)); return v ? `cf ${v}` : null; }
    case 'aws': {
      const w = plainWords(args);
      const v = w.find((a) => /^(create|delete|update|put)/.test(a)) || w.find((a) => a === 'deploy');
      return v ? `aws … ${v.match(/^(create|delete|update|put|deploy)/)[1]}*` : null;
    }
    case 'rm': {
      for (const a of args) {
        if (a === '--') break;
        if (a === '--recursive' || /^-[A-Za-z]*[rR][A-Za-z]*$/.test(a)) return 'rm -r';
      }
      return null;
    }
    default:
      if (PS_REMOVE.has(exe) && args.some((a) => /^-r(e(c(u(r(s(e)?)?)?)?)?)?(:\$true)?$/i.test(a))) return 'Remove-Item -Recurse';
      return null;
  }
}

// Returns every distinct ask-list pattern the command matches, joined with "; ", or null.
// All matches (not just the first) so the prompt and the debug log name everything that needs confirming.
export function analyzeCommand(command, posix = true, depth = 0, hits = new Set()) {
  if (typeof command !== 'string' || depth > 8) return null;
  for (const seg of splitCommand(command, posix, [])) {
    const n = normalize(seg);
    if (!n) continue;
    if (n.script !== undefined) analyzeCommand(n.script, n.posix, depth + 1, hits);
    else { const hit = matchAsk(n.words); if (hit) hits.add(hit); }
  }
  return hits.size ? [...hits].join('; ') : null;
}

// ---------------------------------------------------------------------------------------------
// QA test-path scope

const TEST_DIRS = new Set(['test', 'tests', '__tests__', 'spec', 'specs', 'fixtures', 'testdata']);

export function isTestPath(filePath, cwd) {
  if (typeof filePath !== 'string' || !filePath) return false;
  let p = path.posix.normalize(filePath.replace(/\\/g, '/'));
  if (typeof cwd === 'string' && cwd) {
    const root = path.posix.normalize(cwd.replace(/\\/g, '/')).replace(/\/+$/, '');
    // Judge paths inside the project relative to it, so a parent folder named `test` doesn't count.
    if (p.toLowerCase().startsWith(`${root.toLowerCase()}/`)) p = p.slice(root.length + 1);
  }
  const parts = p.split('/').filter(Boolean);
  const base = parts.pop() || '';
  if (parts.some((d) => TEST_DIRS.has(d.toLowerCase()))) return true; // includes Java src/test/
  return /\.(test|spec)\.[^.]+/i.test(base) || /_test\.[^.]+$/i.test(base) || /^test_.+\.[^.]+$/i.test(base);
}

// ---------------------------------------------------------------------------------------------
// Hook plumbing

export function decide(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const tool = payload.tool_name;
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  if (tool === 'Bash' || tool === 'PowerShell') {
    const rule = analyzeCommand(input.command, tool === 'Bash');
    return rule ? { decision: 'ask', rule, reason: `agent-org guard: this command matches the ask list (${rule}). Confirm before it runs.` } : null;
  }
  if ((tool === 'Edit' || tool === 'Write') && payload.agent_type === QA_AGENT) {
    if (isTestPath(input.file_path, payload.cwd)) return null;
    return {
      decision: 'deny',
      rule: 'qa-test-paths-only',
      reason: 'agent-org guard: quality-assurance-architect may only edit test files (test/, tests/, __tests__/, spec/, specs/, fixtures/, testdata/, src/test/, *.test.*, *.spec.*, *_test.*, test_*.*). Do not make this change; report it to the main thread as a finding instead.',
    };
  }
  return null;
}

function readStdin(timeoutMs = 3000) {
  return new Promise((resolve) => {
    let data = '';
    const done = () => resolve(data);
    const timer = setTimeout(done, timeoutMs);
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', () => { clearTimeout(timer); done(); });
      process.stdin.on('error', () => { clearTimeout(timer); done(); });
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

function debugLog(payload, result) {
  if (process.env.AGENT_ORG_HOOK_DEBUG !== '1') return;
  try {
    fs.mkdirSync(path.dirname(DEBUG_FILE), { recursive: true });
    const line = {
      ts: new Date().toISOString(),
      hook: 'guard',
      tool: payload && typeof payload.tool_name === 'string' ? payload.tool_name : null,
      decision: result ? result.decision : 'none',
      rule: result ? result.rule : null,
    };
    if (payload && typeof payload.agent_type === 'string') line.agent_type = payload.agent_type;
    fs.appendFileSync(DEBUG_FILE, `${JSON.stringify(line)}\n`);
  } catch {
    // Debug logging must never affect the tool call.
  }
}

async function main() {
  const raw = await readStdin();
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }
  let result = null;
  try { result = decide(payload); } catch { result = null; }
  debugLog(payload, result);
  if (!result) return;
  const out = JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: result.decision, permissionDecisionReason: result.reason },
  });
  await new Promise((resolve) => process.stdout.write(out, () => resolve()));
}

const isMain = (() => {
  try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (isMain) {
  main()
    .catch(() => {})
    .finally(() => process.exit(0));
}
