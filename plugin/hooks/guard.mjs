#!/usr/bin/env node
// agent-org PreToolUse guard (D12; v0.2: D26–D28, D30). Jobs:
//   1. Bash/PowerShell: return `ask` when any segment of the command, after normalization, matches the
//      ask list. This closes the gaps that text-only ask rules leave (`git -C . push`, `/usr/bin/git push`,
//      `sh -c '…'`, `FOO=1 kubectl apply`). The user's ask rules in settings.json stay the primary layer.
//   2. Edit/Write/NotebookEdit by agent-org:quality-assurance-architect: `deny` anything that isn't a test path.
//   3. (v0.2) Same-group edit deny: an agent-org specialist may not edit a file another agent of the same
//      parallel group already changed (B3, D26): same dispatch prompt_id, or, when a prompt_id is missing,
//      an agent that hasn't finished yet (concurrent agents are a parallel group by definition).
//   4. (v0.2) Team gate: deny a named agent-org:* Agent call without an approved Mode: team (B4, D30).
//   5. (v0.2) Audit and state protection: `ask` on tool calls that touch ~/.agent-org/audit or /state (C2, D27).
//   6. (v0.2) Scope growth: `ask` when the main thread grows past ~3 files, or edits a risky path of a kind
//      it hasn't edited yet, in a repo with no approval recorded for this session (D28).
//   7. (v0.2e) Specialists: an ask-list command from any agent-org specialist, teammate or subagent, is denied,
//      not asked (D30): teammates run in permissionMode "auto", and Phase 6b saw a background specialist run
//      `git push` in an auto-mode session after an ask. The main thread keeps the ask.
//   8. (v0.2f) Team-start ask: with CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1, a named non-agent-org Agent call
//      without `isolation` would start an agent team, so `ask` (D30). Audited as guard-ask ["team-start"].
//   (v0.2e, V-4) Files under the payload's scratchpad_dir are exempt from rules 2, 3 and 6.
// Agent identity goes through effectiveType() (v0.2c, F1): teammate hooks carry agent_type = the teammate's
// name, and the dispatch record maps their agent_id back to the agent-org type.
// Decisions combine: any deny wins, else any ask (reasons joined). It never returns `allow`.
// Rules 3, 4, 6 and 7 (and teammate identity) read session state and fail open when it is missing or unreadable.
// Dependency-free and fail-open: any error produces no output and exit code 0.
// Never logs tool inputs. Debug logging (AGENT_ORG_HOOK_DEBUG=1) records the tool name, agent_type,
// the decision and the matched rule name only.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendLedger, approvalFor, effectiveType, home, isUnder, orgSubdir, readLedger, readState,
  realpathLoose, resolvePath,
} from './lib/state.mjs';
import { repoOfFile, repoName, repoRoot } from './lib/repo.mjs';
import { append as auditAppend } from './lib/audit.mjs';

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

// Normalized word lists of every simple command in a command line, recursing into sh -c, eval and
// pwsh -Command. Used by the transcript library to find single-purpose shell reads.
export function commandSegments(command, posix = true, depth = 0, out = []) {
  if (typeof command !== 'string' || depth > 8) return out;
  for (const seg of splitCommand(command, posix, [])) {
    const n = normalize(seg);
    if (!n) continue;
    if (n.script !== undefined) commandSegments(n.script, n.posix, depth + 1, out);
    else out.push(n.words);
  }
  return out;
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

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const QA_REASON = 'agent-org guard: quality-assurance-architect may only edit test files (test/, tests/, __tests__/, spec/, specs/, fixtures/, testdata/, src/test/, *.test.*, *.spec.*, *_test.*, test_*.*). Do not make this change; report it to the main thread as a finding instead.';

const editTarget = (input) => (typeof input.file_path === 'string' && input.file_path) ? input.file_path
  : (typeof input.notebook_path === 'string' && input.notebook_path ? input.notebook_path : null);

// Any spelling of ~/.agent-org/audit or ~/.agent-org/state in a command: ~, $HOME, ${HOME},
// %USERPROFILE%, $env:USERPROFILE or the absolute home path all end in `.agent-org/<dir>`.
const PROTECTED_CMD = /\.agent-org[\\/]+(?:audit|state)(?![A-Za-z0-9_-])/i;

export function touchesProtected(tool, input, cwd) {
  if (EDIT_TOOLS.has(tool)) {
    const p = resolvePath(editTarget(input), cwd);
    if (!p) return false;
    return [...orgSubdir('audit'), ...orgSubdir('state')].some((d) => isUnder(p, d));
  }
  if ((tool === 'Bash' || tool === 'PowerShell') && typeof input.command === 'string') {
    return PROTECTED_CMD.test(input.command);
  }
  return false;
}

// Risky paths for the scope guard (D2 of the v0.2 plan). Returns the kinds matched ([] if none):
// `migration`, `ci`, `infra`, `auth`. record.mjs adds a kind to riskySeen[<repo>] after a successful edit.
export const RISKY_LABELS = { migration: 'migration', ci: 'CI/CD', infra: 'infrastructure', auth: 'auth' };
export function riskyKinds(relPath) {
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const base = parts[parts.length - 1] || '';
  const dirs = parts.slice(0, -1).map((d) => d.toLowerCase());
  const lbase = base.toLowerCase();
  const kinds = [];
  if (dirs.some((d) => ['migrations', 'migrate', 'alembic', 'flyway', 'liquibase'].includes(d))) kinds.push('migration');
  if (dirs.some((d, i) => d === '.github' && dirs[i + 1] === 'workflows') || lbase === '.gitlab-ci.yml'
    || dirs.includes('.circleci') || base === 'Jenkinsfile' || lbase === 'azure-pipelines.yml' || dirs.includes('.buildkite')) kinds.push('ci');
  if (/\.(tf|tfvars)$/i.test(base) || dirs.some((d) => ['terraform', 'k8s', 'kubernetes', 'helm', 'charts'].includes(d))
    || /^kustomization\.ya?ml$/i.test(base) || base === 'Chart.yaml') kinds.push('infra');
  if (dirs.some((d) => ['auth', 'authn', 'authz', 'oauth', 'iam'].includes(d))) kinds.push('auth');
  return kinds;
}

const samePath = (a, b) => {
  if (!a || !b) return false;
  const x = realpathLoose(path.resolve(a));
  const y = realpathLoose(path.resolve(b));
  return process.platform === 'win32' || process.platform === 'darwin' ? x.toLowerCase() === y.toLowerCase() : x === y;
};

// v0.2e (V-4): the agent's own scratch space (payload.scratchpad_dir, outside the repo) isn't the shared tree:
// no QA deny, no same-group deny, no scope counting, no ledger.
export function inScratchpad(payload, target) {
  const dir = payload && typeof payload.scratchpad_dir === 'string' && payload.scratchpad_dir ? payload.scratchpad_dir : null;
  if (!dir || typeof target !== 'string' || !target) return false;
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : undefined;
  const abs = resolvePath(target, cwd);
  const root = resolvePath(dir, cwd);
  return [root, realpathLoose(root)].some((d) => isUnder(abs, d) || isUnder(realpathLoose(abs), d));
}

// `state` is injected for tests: {session: {approvals, scope, dispatch, finished, riskySeen} | null, ledger: [] | null}.
// null (or a missing part) means "unavailable": the rules that need it make no decision.
// `env` is injected for tests (v0.2f); it defaults to the hook's own environment.
// Returns {decision, rule, reason, effects?} or null. Never `allow`.
export function decide(payload, state = null, env = process.env) {
  if (!payload || typeof payload !== 'object') return null;
  const tool = payload.tool_name;
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : undefined;
  const session = state && state.session && typeof state.session === 'object' ? state.session : null;
  let agentType = typeof payload.agent_type === 'string' && payload.agent_type ? payload.agent_type : null;
  try {
    agentType = effectiveType(payload, session) || agentType;
  } catch { /* fail open: v0.1 identity */ }
  const specialist = Boolean(agentType && agentType.startsWith('agent-org:'));
  let scratch = false;
  try { scratch = EDIT_TOOLS.has(tool) && inScratchpad(payload, editTarget(input)); } catch { scratch = false; }
  const ledger = state && Array.isArray(state.ledger) ? state.ledger : null;
  const asks = [];
  const denies = [];
  const effects = [];
  const safe = (fn) => { try { fn(); } catch { /* each rule fails open on its own */ } };

  // v0.1: command ask list.
  if (tool === 'Bash' || tool === 'PowerShell') {
    const rule = analyzeCommand(input.command, tool === 'Bash');
    if (rule && specialist) {
      // v0.2e: a specialist's ask may never reach the user (auto mode, Phase 6/6b); deny instead.
      denies.push({ rule: `specialist-ask-list: ${rule}`, reason: `agent-org guard: agent-org specialists may not run ${rule}. Report it to the main thread; the main thread asks the user.` });
    } else if (rule) {
      asks.push({ rule, reason: `agent-org guard: this command matches the ask list (${rule}). Confirm before it runs.` });
    }
  }

  // v0.1: QA may only edit test paths.
  if (EDIT_TOOLS.has(tool) && agentType === QA_AGENT && !scratch && !isTestPath(editTarget(input), cwd)) {
    denies.push({ rule: 'qa-test-paths-only', reason: QA_REASON });
  }

  // v0.2: audit and state protection (no state needed).
  safe(() => {
    if (touchesProtected(tool, input, cwd)) {
      asks.push({ rule: 'audit-state-protect', reason: 'agent-org guard: this touches the agent-org audit log or state. Confirm before it runs.' });
    }
  });

  // v0.2: same-group edit deny.
  safe(() => {
    if (!EDIT_TOOLS.has(tool) || !specialist || scratch || !ledger || !session) return;
    const me = typeof payload.agent_id === 'string' ? payload.agent_id : null;
    const target = editTarget(input);
    if (!me || !target) return;
    const abs = path.resolve(cwd || '.', target);
    const dispatch = session.dispatch || {};
    const finished = session.finished || {};
    const myGroup = dispatch[me] && dispatch[me].promptId;
    // Same group: both dispatched with the same prompt_id. If either prompt_id is missing, the other agent
    // counts as the same group while it hasn't finished, so a missing id never switches the rule off.
    const groupOf = (other) => {
      const theirs = dispatch[other] && dispatch[other].promptId;
      if (myGroup && theirs) return myGroup === theirs ? 'prompt_id' : null;
      return finished[other] ? null : 'concurrent';
    };
    let method = null;
    const other = ledger.find((r) => {
      if (r.collision || !r.agent_id || r.agent_id === me || !samePath(r.file, abs)) return false;
      method = groupOf(r.agent_id);
      return Boolean(method);
    });
    if (!other) return;
    const rel = cwd && isUnder(abs, path.resolve(cwd)) ? path.relative(path.resolve(cwd), abs) : path.basename(abs);
    denies.push({
      rule: 'same-group-edit',
      reason: `agent-org guard: ${rel} was changed by ${other.agent_type || 'another agent'} in this parallel group. Don't edit it; report BLOCKED: ${rel} changed by another agent.`,
    });
    effects.push({ kind: 'ledger', rec: { agent_id: me, agent_type: agentType, file: abs, collision: 'guard-deny' } });
    effects.push({ kind: 'audit', repo: repoOfFile(abs, cwd), rec: { event: 'guard-deny', agent_id: me, agent_type: agentType, file: abs, flags: ['same-group-edit', `group: ${method}`] } });
  });

  // v0.2: team gate.
  safe(() => {
    if (tool !== 'Agent') return;
    const type = typeof input.subagent_type === 'string' ? input.subagent_type : '';
    if (!type.startsWith('agent-org:') || typeof input.name !== 'string' || !input.name) return;
    if (!session) return; // state unreadable: fail open
    const repo = repoName(cwd || process.cwd(), cwd);
    if (session.approvals.some((a) => a && a.repo === repo && a.mode === 'team')) return;
    denies.push({
      rule: 'team-gate',
      reason: 'agent-org guard: named agent-org dispatches start agent teams, and this session has no approved Mode: team. Dispatch without a name, or re-plan with the PM and get the team mode approved.',
    });
    effects.push({ kind: 'audit', repo, rec: { event: 'guard-deny', agent_type: type, flags: ['team-gate'] } });
  });

  // v0.2f: team-start ask for named non-agent-org dispatches while agent teams are enabled (D30).
  // An `isolation` call stays a subagent (P5 F0); hooks inherit the flag, also from settings env (P5 F2).
  safe(() => {
    if (tool !== 'Agent') return;
    if (!env || env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS !== '1') return;
    const type = typeof input.subagent_type === 'string' ? input.subagent_type : '';
    if (type.startsWith('agent-org:') || typeof input.name !== 'string' || !input.name) return;
    if (input.isolation !== undefined && input.isolation !== null && input.isolation !== '') return;
    asks.push({
      rule: 'team-start',
      reason: 'agent-org guard: this named dispatch would start an agent team (teams are enabled). Approve to start a team, or deny to have it dispatched without a name.',
    });
    effects.push({ kind: 'audit', repo: repoName(cwd || process.cwd(), cwd), rec: { event: 'guard-ask', agent_type: type || null, flags: ['team-start'] } });
  });

  // v0.2: scope growth (main thread only).
  safe(() => {
    if (!EDIT_TOOLS.has(tool) || agentType || scratch || !session) return;
    const target = editTarget(input);
    if (!target) return;
    const abs = resolvePath(target, cwd);
    if (orgSubdir('').some((d) => isUnder(abs, d)) || isUnder(abs, path.join(home(), '.agent-org'))) return;
    const repo = repoOfFile(abs, cwd);
    if (approvalFor(session, repo)) return;
    const seen = Array.isArray(session.scope[repo]) ? session.scope[repo] : [];
    if (seen.some((f) => samePath(f, abs))) return; // already edited this session
    const root = repoRoot(path.dirname(abs), cwd);
    const rel = isUnder(abs, root) ? path.relative(root, abs) : abs;
    // Once per kind per repo per session: a kind already edited successfully doesn't ask again.
    const riskySeen = session.riskySeen && Array.isArray(session.riskySeen[repo]) ? session.riskySeen[repo] : [];
    const kinds = riskyKinds(rel).filter((k) => !riskySeen.includes(k));
    if (kinds.length) {
      const label = kinds.map((k) => RISKY_LABELS[k]).join(' and ');
      asks.push({ rule: 'scope-risky-path', reason: `agent-org guard: ${label} path with no approved intent in this session. Approve to continue, or escalate with agent-org:deliver.` });
    }
    const n = seen.length + 1;
    if (n > 3) {
      asks.push({ rule: 'scope-file-count', reason: `agent-org guard: this job has grown past Level 1 (${n} files, no approved intent). Approve to continue, or escalate with agent-org:deliver.` });
    }
  });

  if (denies.length) {
    return { decision: 'deny', rule: denies.map((d) => d.rule).join('; '), reason: denies.map((d) => d.reason).join(' '), effects };
  }
  if (asks.length) {
    return { decision: 'ask', rule: asks.map((a) => a.rule).join('; '), reason: asks.map((a) => a.reason).join(' '), effects };
  }
  return null;
}

// Loads session state for decide(). Missing → empty; corrupt or unreadable → null (fail open).
export function loadState(payload) {
  const sid = payload && payload.session_id;
  let session = null;
  let ledger = null;
  try { session = readState(sid); } catch { session = null; }
  try { ledger = readLedger(sid); } catch { ledger = null; }
  return { session, ledger };
}

function applyEffects(payload, effects) {
  for (const e of effects || []) {
    try {
      if (e.kind === 'ledger') appendLedger(payload.session_id, e.rec);
      else if (e.kind === 'audit') auditAppend(e.repo, { session: payload.session_id, tool_use_id: payload.tool_use_id, ...e.rec });
    } catch { /* fail open */ }
  }
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
  try { result = decide(payload, loadState(payload)); } catch { result = null; }
  debugLog(payload, result);
  if (!result) return;
  applyEffects(payload, result.effects);
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
