#!/usr/bin/env node
// agent-org PostToolUse recorder (v0.2: B3, C1, D26–D28).
//   Edit/Write/NotebookEdit by agent-org:*  → session ledger {agent_id, agent_type, file}
//   Edit/Write/NotebookEdit by the main thread → scope counter and risky kinds seen per repo; approval when an intent file
//                                              under ~/.agent-org/intents/<repo>/ says **Status:** APPROVED; an Edit
//                                              of an already approved intent outside the status line, approval log,
//                                              evidence or validation is audited `intent-edited-after-approval` (F6)
//   Agent                                    → dispatch record {promptId, toolUseId, agentType, teammate} + audit `dispatch`
//   (v0.2e) edits under the payload's scratchpad_dir are neither ledgered nor counted (V-4)
//   SubagentHandback                         → A2 report-contract check (PM exempt, F9); audit `claim-flag` if it fails
// Agent identity goes through effectiveType() (v0.2c, F1): teammates carry agent_type = their name.
//   (v0.2.1, V21-9/V21-10) approvals, scope and audit lines are keyed by the repo key (lib/repo.mjs). An intent's
//   approval applies to the key in its `**Repo key:**` line, which must match its folder; a v0.2.0 intent (folder =
//   D6 basename) is read but never approves.
// CLI: node record.mjs --ledger [--session <id>]  prints the per-agent file summary and collision flags.
// CLI: node record.mjs --intent-path <slug> [--session <id>] [--supersedes <old intent>]  prints a new, unique
//      intent path for this repo and session, plus the header lines that record the repo key, top level, owning
//      session and, with --supersedes, the intent it replaces (V21-10, D32).
// CLI: node record.mjs --level-check "<answers>" [--source deliver|pm]  (v0.2.2, D34) prints the level the answers map
//      to. It writes nothing: the guard records the check from this call's PreToolUse payload, keyed by prompt_id.
//      With no answers it prints the questions and the template.
// Dependency-free and fail-open. Metadata only: never content, commands or report text.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendLedger, approvalFor, effectiveType, intentsRoot, isUnder, latestSessionId, orgDir, readLedger, readState,
  intentMeta, realpathLoose, resolvePath, safeId, updateState,
} from './lib/state.mjs';
import { isKeyDir, keyDir, repoId, repoIdOfFile } from './lib/repo.mjs';
import { append as auditAppend } from './lib/audit.mjs';
import { inScratchpad, levelCheckCommand, riskyKinds } from './guard.mjs';
import { levelFromAnswers, parseAnswers, questionList, triggered } from './lib/level.mjs';

export { intentMeta };

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const PM = 'agent-org:principal-project-manager';
export const OUTCOME_RE = /^\s*(?:[#>*_`\s]*)Outcome:?(?:[*_`]*)\s*(PASS|FAIL|BLOCKED|SKIPPED|NOT RUN)\b/;

// First non-empty line of a report, checked against the report contract (A2).
export function parseOutcome(text) {
  if (typeof text !== 'string') return null;
  const first = text.split('\n').find((l) => l.trim()) || '';
  const m = OUTCOME_RE.exec(first);
  return m ? m[1] : null;
}

// v0.2e (V-2): the last `Outcome:` line anywhere in the report, for a report whose first line has none.
export function lastOutcome(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = OUTCOME_RE.exec(lines[i]);
    if (m) return m[1];
  }
  return null;
}

const STATUS_APPROVED = /^\s*\*\*Status:\*\*\s*APPROVED\s*$/m;
const MODE_TEAM = /^\s*(?:[-*]\s+)?\*\*Mode:\*\*\s*`?team\b/im;

export function intentApproval(text) {
  if (typeof text !== 'string' || !STATUS_APPROVED.test(text)) return null;
  return { mode: MODE_TEAM.test(text) ? 'team' : 'subagents' };
}

// After approval the main thread may edit only the status line, the approval log and the evidence or
// validation sections (B6). Returns the `## ` heading an Edit landed in when it's outside those, else null.
const STATUS_LINE = /^\s*\*\*Status:\*\*/;
const ALLOWED_SECTION = /^(?:approval log|evidence|validation)\b/i;
// v0.2.1 (Phase 9): with `oldString`, only lines the edit adds or changes count, so a status edit that carries the
// unchanged `**Repo key:**` line below it (to make old_string unique) isn't flagged.
export function intentEditSection(text, newString, oldString) {
  if (typeof text !== 'string' || typeof newString !== 'string') return null;
  const before = new Set(typeof oldString === 'string' ? oldString.split('\n').map((l) => l.trim()) : []);
  const lines = newString.split('\n').filter((l) => l.trim() && !before.has(l.trim()));
  if (lines.length && lines.every((l) => STATUS_LINE.test(l))) return null;
  const at = newString ? text.indexOf(newString) : -1;
  if (at < 0) return '(unknown section)';
  let heading = null;
  for (const m of text.slice(0, at + 1).matchAll(/^##[ \t]+(.+?)[ \t#]*$/gm)) heading = m[1].trim();
  // The edit may itself start with the heading line.
  const own = /^##[ \t]+(.+?)[ \t#]*$/m.exec(newString);
  if (own && newString.trimStart().startsWith('##')) heading = own[1].trim();
  if (heading && ALLOWED_SECTION.test(heading)) return null;
  return heading || '(before the first section)';
}

// Intent id for audit records: "<repo>/<file>", never an absolute path.
export function intentId(abs) {
  for (const root of [intentsRoot(), realpathLoose(intentsRoot())]) {
    if (isUnder(abs, root)) return path.relative(root, abs).split(path.sep).join('/');
  }
  return null;
}

// The repo key an intent's approval applies to, or null (no approval is recorded).
//   v0.2.1 intent (its folder is a key directory): the `**Repo key:**` line must be present and its directory
//   form must be the folder, so an intent can't be moved or retargeted into another repo's approval.
//   v0.2.0 intent (folder = D6 basename): never approves. It stays readable and editable, but nothing in it says
//   which repo it belongs to, so it can't be matched safely (Phase 9: same-named repos).
export function intentRepoKey(folder, text) {
  if (!isKeyDir(folder)) return null;
  const { key } = intentMeta(text);
  return key && keyDir(key) === folder ? key : null;
}

// Fields every audit record of this session shares: session id and the repo's approved intent.
// `repo` is a repo id ({key, …}) or a key string.
export function auditBase(payload, repo) {
  const base = { session: payload.session_id };
  try {
    const a = approvalFor(readState(payload.session_id), repo && typeof repo === 'object' ? repo.key : repo);
    if (a && a.intent) base.intent = a.intent;
  } catch { /* no state */ }
  return base;
}

export function record(payload) {
  if (!payload || typeof payload !== 'object') return;
  const tool = payload.tool_name;
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : undefined;
  const sid = payload.session_id;
  if (!safeId(sid)) return;
  let agentType = typeof payload.agent_type === 'string' && payload.agent_type ? payload.agent_type : null;
  if (agentType) {
    try { agentType = effectiveType(payload, readState(sid)) || agentType; } catch { /* fail open: v0.1 identity */ }
  }

  if (EDIT_TOOLS.has(tool)) {
    const target = input.file_path || input.notebook_path;
    if (typeof target !== 'string' || !target) return;
    if (inScratchpad(payload, target)) return; // v0.2e (V-4): scratch space isn't ledgered or counted
    const abs = resolvePath(target, cwd);
    if (agentType) {
      if (agentType.startsWith('agent-org:')) {
        appendLedger(sid, { agent_id: payload.agent_id, agent_type: agentType, file: abs });
      }
      return;
    }
    // Main thread.
    const org = [orgDir(), realpathLoose(orgDir())];
    if (org.some((d) => isUnder(abs, d))) {
      const id = intentId(abs);
      if (!id || !id.includes('/')) return;
      const folder = id.split('/')[0];
      let text = '';
      try { text = fs.readFileSync(abs, 'utf8'); } catch { return; }
      const key = intentRepoKey(folder, text);
      let target = folder;
      if (key) {
        let here = null;
        try { here = repoId(cwd || process.cwd(), cwd); } catch { here = null; }
        target = here && here.key === key ? here : { key, dir: keyDir(key), name: folder };
      }
      // F6: an approved intent's plan is the PM's; detect (don't block) other main-thread edits to it.
      try {
        const st = readState(sid);
        const wasApproved = st.approvals.some((a) => a && a.intent === id);
        if (wasApproved && tool === 'Edit') {
          const section = intentEditSection(text, input.new_string, input.old_string);
          if (section) {
            auditAppend(target, {
              session: sid, intent: id, event: 'claim-flag', tool_use_id: payload.tool_use_id,
              flags: ['intent-edited-after-approval', section],
            });
          }
        }
      } catch { /* fail open */ }
      const ap = intentApproval(text);
      if (!ap || !key) return;
      updateState(sid, (s) => {
        s.approvals = s.approvals.filter((a) => !(a && a.intent === id));
        s.approvals.push({ repo: key, intent: id, mode: ap.mode, approvedAt: new Date().toISOString() });
        return s;
      });
      return;
    }
    const rid = repoIdOfFile(abs, cwd);
    const repo = rid.key;
    let kinds = [];
    try {
      kinds = riskyKinds(isUnder(abs, rid.top) ? path.relative(rid.top, abs) : abs);
    } catch { kinds = []; }
    updateState(sid, (s) => {
      const list = Array.isArray(s.scope[repo]) ? s.scope[repo] : [];
      if (!list.includes(abs)) list.push(abs);
      s.scope[repo] = list;
      if (kinds.length) {
        const seen = Array.isArray(s.riskySeen[repo]) ? s.riskySeen[repo] : [];
        for (const k of kinds) if (!seen.includes(k)) seen.push(k);
        s.riskySeen[repo] = seen;
      }
      return s;
    });
    return;
  }

  if (tool === 'Agent') {
    const resp = payload.tool_response && typeof payload.tool_response === 'object' ? payload.tool_response : {};
    const agentId = resp.agentId || resp.agent_id;
    const type = typeof input.subagent_type === 'string' ? input.subagent_type : (resp.agentType || null);
    if (typeof agentId !== 'string' || !agentId) return;
    updateState(sid, (s) => {
      s.dispatch[agentId] = {
        promptId: payload.prompt_id ?? null, toolUseId: payload.tool_use_id ?? null, agentType: type,
        teammate: resp.status === 'teammate_spawned',
      };
      // v0.2.1 (V21-1): a teammate's name maps its <teammate-message> reports back to this agent.
      if (typeof input.name === 'string' && input.name) s.dispatch[agentId].name = input.name;
      return s;
    });
    if (type && type.startsWith('agent-org:')) {
      const repo = repoId(cwd || process.cwd(), cwd);
      const flags = [];
      if (typeof input.name === 'string' && input.name) flags.push('named');
      auditAppend(repo, {
        ...auditBase(payload, repo), event: 'dispatch', agent_id: agentId, agent_type: type,
        model: typeof resp.resolvedModel === 'string' ? resp.resolvedModel : undefined,
        tool_use_id: payload.tool_use_id, outcome: typeof resp.status === 'string' ? resp.status : undefined,
        flags: flags.length ? flags : undefined,
      });
    }
    return;
  }

  if (tool === 'SubagentHandback') {
    if (!agentType || !agentType.startsWith('agent-org:') || agentType === PM) return;
    const outcome = parseOutcome(input.message);
    if (outcome) return;
    const repo = repoId(cwd || process.cwd(), cwd);
    auditAppend(repo, {
      ...auditBase(payload, repo), event: 'claim-flag', agent_id: payload.agent_id, agent_type: agentType,
      tool_use_id: payload.tool_use_id, flags: ['handback-missing-outcome'],
    });
  }
}

// ---------------------------------------------------------------------------------------------
// --ledger summary for deliver's collision check

export function ledgerSummary(sessionId) {
  const ledger = readLedger(sessionId);
  let state = null;
  try { state = readState(sessionId); } catch { state = null; }
  const agents = new Map();
  const byFile = new Map();
  for (const r of ledger) {
    const key = r.agent_id || '(unknown)';
    if (!agents.has(key)) agents.set(key, { agent_type: r.agent_type, files: new Set(), collisions: [] });
    const a = agents.get(key);
    if (r.collision) a.collisions.push(`${r.collision}: ${r.file || '(unknown file)'}`);
    else if (r.file) {
      a.files.add(r.file);
      if (!byFile.has(r.file)) byFile.set(r.file, new Set());
      byFile.get(r.file).add(key);
    }
  }
  const lines = [];
  for (const [id, a] of agents) {
    const group = state && state.dispatch[id] ? state.dispatch[id].promptId : null;
    lines.push(`${a.agent_type || '(unknown type)'} [${id}]${group ? ` group ${String(group).slice(0, 12)}` : ''}`);
    if (!a.files.size) lines.push('  changed: none');
    for (const f of [...a.files].sort()) lines.push(`  changed: ${f}`);
    for (const c of a.collisions) lines.push(`  COLLISION ${c}`);
  }
  const shared = [...byFile].filter(([, s]) => s.size > 1);
  for (const [f, s] of shared) lines.push(`COLLISION changed by ${s.size} agents: ${f} (${[...s].join(', ')})`);
  if (!agents.size) lines.push('no agent-org specialist edits recorded in this session');
  const flagged = shared.length + [...agents.values()].reduce((n, a) => n + a.collisions.length, 0);
  lines.push(flagged ? `collision flags: ${flagged}` : 'collision flags: none');
  return lines.join('\n');
}

function cliLedger(argv) {
  const i = argv.indexOf('--session');
  let sid = i >= 0 ? argv[i + 1] : null;
  let source = '--session';
  if (!sid && process.env.CLAUDE_CODE_SESSION_ID) { sid = process.env.CLAUDE_CODE_SESSION_ID; source = 'CLAUDE_CODE_SESSION_ID'; }
  if (!sid) { sid = latestSessionId(); source = 'most recently modified session'; }
  if (!sid || !safeId(sid)) {
    process.stdout.write('agent-org ledger: no session state found\n');
    return;
  }
  let body;
  try { body = ledgerSummary(sid); } catch { body = 'ledger unreadable'; }
  process.stdout.write(`agent-org ledger for session ${sid} (from ${source})\n${body}\n`);
}

// ---------------------------------------------------------------------------------------------
// --intent-path: a new intent file for this repo and session (V21-9, V21-10)

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Returns {file, key, top, session, lines} or {error}. Never creates or writes anything.
// `supersedes` (D32): an existing intent this one replaces, e.g. one another session owns after /clear. It must be
// an existing file under ~/.agent-org/intents/; the header then gets `**Supersedes:** ~/.agent-org/intents/<id>`.
export function intentPath(slug, sessionId, cwd = process.cwd(), supersedes = null) {
  if (typeof slug !== 'string' || slug.length > 60 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: 'give a short kebab-case slug, e.g. --intent-path add-login-form' };
  }
  let old = null;
  if (supersedes !== null && supersedes !== undefined) {
    const abs = resolvePath(String(supersedes), cwd);
    old = abs ? intentId(abs) : null;
    let isFile = false;
    try { isFile = fs.statSync(abs).isFile(); } catch { isFile = false; }
    if (!old || !old.includes('/') || !isFile) return { error: '--supersedes must name an existing intent file under ~/.agent-org/intents/' };
  }
  const sid = safeId(sessionId);
  const id = repoId(cwd, cwd);
  // The suffix makes the name unique per session; without a session id it's random (owner then unknown).
  const suffix = sid ? (sid.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toLowerCase() || 'session') : crypto.randomBytes(4).toString('hex');
  const dir = path.join(intentsRoot(), id.dir);
  const base = `${localDate()}-${slug}-${suffix}`;
  let file = path.join(dir, `${base}.md`);
  for (let n = 2; fs.existsSync(file) && n < 100; n++) file = path.join(dir, `${base}-${n}.md`);
  const lines = [`**Repo key:** ${id.key}`, `**Top level:** ${id.top}`, `**Session:** ${sid || 'unknown'}`];
  if (old) lines.push(`**Supersedes:** ~/.agent-org/intents/${old}`);
  return { file, key: id.key, top: id.top, session: sid, lines };
}

function cliIntentPath(argv) {
  const i = argv.indexOf('--intent-path');
  const j = argv.indexOf('--session');
  const sid = (j >= 0 ? argv[j + 1] : null) || process.env.CLAUDE_CODE_SESSION_ID || null;
  const k = argv.indexOf('--supersedes');
  let r;
  try { r = intentPath(argv[i + 1], sid, process.cwd(), k >= 0 ? (argv[k + 1] ?? '') : null); } catch { r = { error: 'could not resolve the repo' }; }
  if (r.error) { process.stdout.write(`agent-org intent path: ${r.error}\n`); return; }
  process.stdout.write(`path: ${r.file}\nheader lines (put them right under the **Status:** line):\n${r.lines.join('\n')}\n`);
}

// ---------------------------------------------------------------------------------------------
// --level-check (v0.2.2, D34)

// Returns the text the CLI prints for `answersText` (undefined → the questions).
export function levelCheckText(answersText) {
  const how = `Run: ${levelCheckCommand()} with each ? set to y, n or ? (unsure counts as yes). ${questionList()}`;
  if (answersText === undefined || answersText === null || String(answersText).startsWith('--')) return `agent-org level check: questions.\n${how}\n`;
  const answers = parseAnswers(String(answersText));
  if (!answers) return `agent-org level check: malformed answers; give every key exactly once as key=y|n|?.\n${how}\n`;
  const level = levelFromAnswers(answers);
  if (level === 1) return 'agent-org level check: Level 1. Go ahead (at most 2 files in this repo for this request); after editing, run the repo\'s test command if it has one and report the result.\n';
  return `agent-org level check: Level ${level} (${triggered(answers).join(', ')}). Load the agent-org:deliver skill now; edits in this repo are denied until an intent is approved. A later check can't lower this request's level.\n`;
}

function cliLevelCheck(argv) {
  const i = argv.indexOf('--level-check');
  process.stdout.write(levelCheckText(argv[i + 1]));
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

async function main() {
  if (process.argv.includes('--ledger')) { cliLedger(process.argv); return; }
  if (process.argv.includes('--intent-path')) { cliIntentPath(process.argv); return; }
  if (process.argv.includes('--level-check')) { cliLevelCheck(process.argv); return; }
  const raw = await readStdin();
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }
  try { record(payload); } catch { /* fail open */ }
}

const isMain = (() => {
  try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (isMain) {
  main()
    .catch(() => {})
    .finally(() => process.exit(0));
}
