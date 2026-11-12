#!/usr/bin/env node
// agent-org team audit (v0.2: C4). TaskCreated, TaskCompleted and TeammateIdle append team events;
// PreToolUse(SendMessage) appends a `message` event. Ids and names only: never task subjects,
// descriptions or message bodies. Never blocks and never prints anything. Fail-open.
// Phase 6: TeammateIdle and PreToolUse(SendMessage) fire for teammates, whose agent_type is the teammate's
// name; agent_type is resolved through the dispatch record (effectiveType, v0.2c F1). TaskCreated and
// TaskCompleted are still UNVERIFIED live (no team used the task list).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoId } from './lib/repo.mjs';
import { effectiveType, readState } from './lib/state.mjs';
import { append as auditAppend } from './lib/audit.mjs';
import { auditBase } from './record.mjs';

const str = (v) => (typeof v === 'string' && v ? v : undefined);

export function teamRecord(payload, state = null) {
  if (!payload || typeof payload !== 'object') return null;
  const ev = payload.hook_event_name;
  let type = str(payload.agent_type);
  try { type = str(effectiveType(payload, state)) || type; } catch { /* fail open */ }
  const common = { agent_id: str(payload.agent_id), agent_type: type };
  if (ev === 'TaskCreated' || ev === 'TaskCompleted') {
    return { ...common, event: ev === 'TaskCreated' ? 'team-task-created' : 'team-task-completed',
      task_id: str(payload.task_id), teammate_name: str(payload.teammate_name), team_name: str(payload.team_name) };
  }
  if (ev === 'TeammateIdle') {
    return { ...common, event: 'teammate-idle', teammate_name: str(payload.teammate_name), team_name: str(payload.team_name) };
  }
  if (ev === 'PreToolUse' && payload.tool_name === 'SendMessage') {
    const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
    const to = str(input.to) || str(input.recipient);
    return { ...common, event: 'message', to, tool_use_id: str(payload.tool_use_id) };
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

async function main() {
  const raw = await readStdin();
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }
  let state = null;
  try { state = readState(payload.session_id); } catch { state = null; }
  const rec = teamRecord(payload, state);
  if (!rec) return;
  const repo = repoId(payload.cwd || process.cwd(), payload.cwd);
  auditAppend(repo, { ...auditBase(payload, repo), ...rec });
}

const isMain = (() => {
  try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (isMain) {
  main()
    .catch(() => {})
    .finally(() => process.exit(0));
}
