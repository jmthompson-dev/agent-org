#!/usr/bin/env node
// agent-org PostToolUse recorder (v0.2: B3, C1, D26–D28).
//   Edit/Write/NotebookEdit by agent-org:*  → session ledger {agent_id, agent_type, file}
//   Edit/Write/NotebookEdit by the main thread → scope counter and risky kinds seen per repo; approval when an intent file
//                                              under ~/.agent-org/intents/<repo>/ says **Status:** APPROVED; an Edit
//                                              of an already approved intent outside the status line, approval log,
//                                              evidence or validation is audited `intent-edited-after-approval` (F6)
//   Agent                                    → dispatch record {promptId, toolUseId, agentType, teammate} + audit `dispatch`
//   SubagentHandback                         → A2 report-contract check (PM exempt, F9); audit `claim-flag` if it fails
// Agent identity goes through effectiveType() (v0.2c, F1): teammates carry agent_type = their name.
// CLI: node record.mjs --ledger [--session <id>]  prints the per-agent file summary and collision flags.
// Dependency-free and fail-open. Metadata only: never content, commands or report text.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendLedger, approvalFor, effectiveType, intentsRoot, isUnder, latestSessionId, orgDir, readLedger, readState,
  realpathLoose, resolvePath, safeId, updateState,
} from './lib/state.mjs';
import { repoName, repoOfFile, repoRoot } from './lib/repo.mjs';
import { append as auditAppend } from './lib/audit.mjs';
import { riskyKinds } from './guard.mjs';

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
export function intentEditSection(text, newString) {
  if (typeof text !== 'string' || typeof newString !== 'string') return null;
  const lines = newString.split('\n').filter((l) => l.trim());
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

// Fields every audit record of this session shares: session id and the repo's approved intent.
export function auditBase(payload, repo) {
  const base = { session: payload.session_id };
  try {
    const a = approvalFor(readState(payload.session_id), repo);
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
      const repo = id.split('/')[0];
      let text = '';
      try { text = fs.readFileSync(abs, 'utf8'); } catch { return; }
      // F6: an approved intent's plan is the PM's; detect (don't block) other main-thread edits to it.
      try {
        const st = readState(sid);
        const wasApproved = st.approvals.some((a) => a && a.repo === repo && a.intent === id);
        if (wasApproved && tool === 'Edit') {
          const section = intentEditSection(text, input.new_string);
          if (section) {
            auditAppend(repo, {
              session: sid, intent: id, event: 'claim-flag', tool_use_id: payload.tool_use_id,
              flags: ['intent-edited-after-approval', section],
            });
          }
        }
      } catch { /* fail open */ }
      const ap = intentApproval(text);
      if (!ap) return;
      updateState(sid, (s) => {
        s.approvals = s.approvals.filter((a) => !(a && a.repo === repo && a.intent === id));
        s.approvals.push({ repo, intent: id, mode: ap.mode, approvedAt: new Date().toISOString() });
        return s;
      });
      return;
    }
    const repo = repoOfFile(abs, cwd);
    let kinds = [];
    try {
      const root = repoRoot(path.dirname(abs), cwd);
      kinds = riskyKinds(isUnder(abs, root) ? path.relative(root, abs) : abs);
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
      return s;
    });
    if (type && type.startsWith('agent-org:')) {
      const repo = repoName(cwd || process.cwd(), cwd);
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
    const repo = repoName(cwd || process.cwd(), cwd);
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
