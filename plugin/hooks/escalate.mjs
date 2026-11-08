#!/usr/bin/env node
// agent-org UserPromptSubmit hook: nudges the main thread toward agent-org:deliver
// when the prompt mentions a hard escalation trigger. Dependency-free and fail-open:
// any error produces no output and exit code 0, so a prompt is never blocked.
// Never logs prompt text.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Trigger groups, in a fixed order so the output is identical every time it fires.
// Word boundaries keep `author` from matching `auth`. Bare `token`, `release`, `production` and
// `pipeline` are deliberately absent: they fire on ordinary prompts and train the model to ignore the nudge.
const GROUPS = [
  ['auth', /\b(?:authentication|authorization|oauth2?|sso|jwts?|logins?|auth|authn|authz)\b/i],
  ['secrets', /\b(?:secrets?|credentials?|api[\s_-]?keys?|passwords?)\b/i],
  ['data', /\b(?:migrations?|schemas?|alter\s+table|ddl)\b/i],
  ['infra', /\b(?:terraform|helm|kubernetes|k8s|kubectl|iam|infrastructure)\b/i],
  ['delivery', /\b(?:ci\/cd|github\s+actions|deploy|deploys|deployed|deploying|deployments?|release\s+to\s+prod(?:uction)?|prod(?:uction)?\s+(?:deploys?|deployments?|releases?|rollouts?))\b/i],
  ['cross-service', /\b(?:across\s+services|multiple\s+services|microservices?)\b/i],
  ['change', /\b(?:dependency|dependencies|upgrade|upgrades|upgrading|breaking\s+changes?|public\s+api|api\s+contracts?)\b/i],
];

const DEBUG_FILE = path.join(os.homedir(), '.claude', 'agent-org', 'hook-debug.jsonl');

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

export function matchGroups(prompt) {
  if (typeof prompt !== 'string' || prompt.length === 0) return [];
  return GROUPS.filter(([, re]) => re.test(prompt)).map(([name]) => name);
}

function debugLog(payload, prompt, groups, isNotification = false) {
  if (process.env.AGENT_ORG_HOOK_DEBUG !== '1') return;
  try {
    fs.mkdirSync(path.dirname(DEBUG_FILE), { recursive: true });
    const line = {
      ts: new Date().toISOString(),
      keys: payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload).sort() : [],
      promptLength: typeof prompt === 'string' ? prompt.length : null,
      groups,
      notification: isNotification,
    };
    fs.appendFileSync(DEBUG_FILE, `${JSON.stringify(line)}\n`);
  } catch {
    // Debug logging must never affect the prompt.
  }
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    debugLog(null, null, []);
    return;
  }
  const prompt = payload && typeof payload.prompt === 'string' ? payload.prompt : '';
  // Background subagent reports arrive as <task-notification> prompts. They are not user
  // requests, so they never get a nudge (Phase 3: they fired on every escalation).
  const isNotification = prompt.trimStart().startsWith('<task-notification>');
  const groups = isNotification ? [] : matchGroups(prompt);
  debugLog(payload, prompt, groups, isNotification);
  if (groups.length === 0) return;

  const additionalContext =
    `agent-org: escalation triggers matched (${groups.join(', ')}). ` +
    'This may be Level 2+ — consider loading the `agent-org:deliver` skill. ' +
    'If it is clearly Level 0–1, proceed normally.';
  const out = JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } });
  // Wait for the flush: process.exit() right after a pipe write can drop output.
  await new Promise((resolve) => process.stdout.write(out, () => resolve()));
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
