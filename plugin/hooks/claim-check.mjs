#!/usr/bin/env node
// agent-org claim check (v0.2: A1, A2; D25). Runs on Stop (main thread) and SubagentStop (agent-org:*).
//   Stop: every verification claim in the final text needs a successful matching tool call in the
//         current turn, and every cited file must have been opened this session. Relayed, quoted,
//         negated and retracted sentences are skipped.
//   SubagentStop: the report contract (first line `Outcome: …`; a PASS needs a successful command in the
//         agent's own transcript), a scan for refused "modified since read" edits (collisions), an audit
//         `result` record, and finished[agent_id] in the session state (for the guard's same-group fallback).
//         The PM is exempt from the report contract: it returns an intent (audited with outcome `plan`).
// Blocks once (stop_hook_active false); on the second stop it only warns. Fail-open, no content logged.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filesOpenedInSession, finalAssistantText, isShell, readJsonl, refusedStaleEdits, subagentTranscripts,
  succeeded, toolCalls, toolCallsInTurn,
} from './lib/transcript.mjs';
import { appendLedger, readLedger, safeId, updateState } from './lib/state.mjs';
import { repoName } from './lib/repo.mjs';
import { append as auditAppend } from './lib/audit.mjs';
import { auditBase, parseOutcome } from './record.mjs';

// "decision" (verified, P5 A2) or "additionalContext" (docs-only softer form). Phase 6 decides.
export const BLOCK_FORM = process.env.AGENT_ORG_BLOCK_FORM === 'additionalContext' ? 'additionalContext' : 'decision';

// The PM returns an intent, not a report: exempt from the report contract ("PASS" on a plan means nothing).
const PM = 'agent-org:principal-project-manager';
// Agents with no shell tool: a PASS is backed by any successful tool call (they can't run commands).
const NO_SHELL = new Set(['solutions-architect', 'ai-ml-research-architect',
  'data-knowledge-architect', 'ui-ux-designer'].map((id) => `agent-org:${id}`));

// ---------------------------------------------------------------------------------------------
// Text helpers

export const norm = (s) => s.toLowerCase().replace(/[*_`"“”'’]/g, '').replace(/\s+/g, ' ').trim();

function stripFences(text) {
  return text.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[^\n]*$/gm, ' ');
}

// Text the claim scan may judge: no fences, no blockquotes, no inline code, no quoted strings.
function claimableText(text) {
  return stripFences(text)
    .split('\n').filter((l) => !/^\s*>/.test(l)).join('\n')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/"[^"\n]*"|“[^”\n]*”/g, ' ');
}

export function sentences(text) {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

const CLAIMS = [
  { kind: 'tests', re: /\btests?:?\s+(?:all\s+)?(?:pass|passed|passes|passing)\b/i },
  { kind: 'tests', re: /\b\d+\s*\/\s*\d+\s+(?:tests?\s+)?(?:pass|passed|passing)\b/i },
  { kind: 'any', re: /\ball\s+(?:tests|checks)\s+(?:pass|passed|are\s+passing|green|are\s+green)\b/i },
  { kind: 'build', re: /\bbuild\s+(?:succeeds|succeeded|passes|passed)\b/i },
  { kind: 'any', re: /\bI\s+ran\b/i },
  { kind: 'any', re: /\bverified\b/i },
  { kind: 'any', re: /\bno\s+errors\b/i },
  { kind: 'lint', re: /\blints?\s+(?:is\s+|are\s+)?clean\b/i },
];
const NEGATED = /\b(?:not|never|didn't|didn’t|haven't|haven’t|hasn't|wasn't|weren't|cannot|can't|unverified|retract\w*|would|should|if|unless)\b|n't\b/i;

const TEST_CMD = /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|node\s+--test\b|pytest\b|python\d*(?:\.\d+)?\s+-m\s+(?:pytest|unittest)\b|mvnw?\b[^|;&]*\b(?:test|verify)\b|gradlew?\b[^|;&]*\btest\b|go\s+test\b|cargo\s+test\b|make\s+(?:test|check)\b|jest\b|vitest\b|deno\s+test\b|dotnet\s+test\b|rspec\b|phpunit\b|tox\b|ctest\b)/i;
const BUILD_CMD = /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build\b|tsc\b|mvnw?\b[^|;&]*\b(?:package|install|compile|verify)\b|gradlew?\b[^|;&]*\b(?:build|assemble)\b|go\s+build\b|cargo\s+build\b|make\b|dotnet\s+build\b|vite\s+build\b|webpack\b|docker\s+build\b)/i;
const LINT_CMD = /\b(?:lint|eslint|ruff|flake8|pylint|golangci-lint|clippy|prettier\s+--check|tsc|stylelint|shellcheck)\b/i;

function evidenceFor(kind, calls) {
  const ok = calls.filter((c) => isShell(c) && succeeded(c));
  const cmd = (c) => (typeof c.input.command === 'string' ? c.input.command : '');
  if (kind === 'tests') return ok.some((c) => TEST_CMD.test(cmd(c)));
  if (kind === 'build') return ok.some((c) => BUILD_CMD.test(cmd(c)));
  if (kind === 'lint') return ok.some((c) => LINT_CMD.test(cmd(c)));
  return ok.length > 0;
}

const tokens = (s) => s.split(/[^a-z0-9]+/).filter(Boolean);

// A claim sentence is relayed when it matches text from a specialist's own report.
export function isRelayed(sentence, specialistTexts) {
  const n = norm(sentence);
  const nt = tokens(n);
  for (const t of specialistTexts) {
    const full = norm(t);
    if (full.includes(n)) return true;
    for (const s of sentences(t)) {
      const ns = norm(s);
      if (ns.length >= 8 && n.includes(ns)) return true;
      const st = new Set(tokens(ns));
      if (nt.length && nt.filter((w) => st.has(w)).length / nt.length >= 0.8) return true;
    }
  }
  return false;
}

export function findClaims(text, specialistTexts = []) {
  const out = [];
  for (const s of sentences(claimableText(text))) {
    const hit = CLAIMS.find((c) => c.re.test(s));
    if (!hit || NEGATED.test(s)) continue;
    if (isRelayed(s, specialistTexts)) continue;
    out.push({ sentence: s, kind: hit.kind });
  }
  return out;
}

// Citations: path or path:line tokens with a known file extension, or a slash path with :line.
const EXT = 'js|mjs|cjs|jsx|ts|tsx|mts|cts|json|jsonc|jsonl|md|mdx|py|pyi|rb|go|rs|java|kt|kts|scala|groovy|c|h|cc|cpp|cxx|hpp|cs|fs|swift|m|mm|php|sh|bash|zsh|fish|ps1|psm1|bat|cmd|yml|yaml|toml|ini|cfg|conf|xml|html|htm|css|scss|sass|less|vue|svelte|astro|sql|proto|graphql|gql|tf|tfvars|hcl|gradle|properties|env|txt|lock|mk|cmake|ex|exs|erl|clj|cljs|lua|r|dart|ipynb|csv|tsv|rst|adoc|tex|vim|el|nix|zig|sol|prisma';
const CITE_RE = new RegExp(String.raw`(?<![\w@/.~-])((?:~|\.{1,2})?/?(?:[\w@.+-]+/)*[\w@+-][\w@.+-]*\.(?:${EXT}))(?::\d+(?:[-–]\d+)?)?(?![\w/-])|(?<![\w@/.~-])((?:[\w@.+-]+/)+[\w@.+-]+):\d+`, 'gi');
const NOT_FILES = /^(?:node|next|nuxt|vue|react|express|three|chart|d3|socket\.io|ember|backbone|angular|deno)\.js$/i;

export function findCitations(text) {
  const clean = stripFences(text).replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)>\]]+/gi, ' ');
  const out = new Set();
  for (const m of clean.matchAll(CITE_RE)) {
    const p = m[1] || m[2];
    if (!p || NOT_FILES.test(p) || /^\d/.test(p)) continue;
    out.add(p);
  }
  return [...out];
}

function citedButNotOpened(citations, opened, cwd) {
  const all = [...opened];
  const missing = [];
  for (const c of citations) {
    const abs = path.resolve(cwd || '.', c.startsWith('~') ? c.replace(/^~/, process.env.HOME || '~') : c);
    if (opened.has(abs)) continue;
    const tail = c.replace(/^\.\//, '').split(/[\\/]/).filter(Boolean).join('/');
    // Tolerate citations relative to a subdirectory or a bare file name: invented files are still caught.
    if (all.some((f) => f.split(path.sep).join('/').endsWith(`/${tail}`))) continue;
    missing.push(c);
  }
  return missing;
}

// ---------------------------------------------------------------------------------------------
// Output

function output(event, failures, payload) {
  const text = `agent-org claim check: ${failures.join('; ')}. Run the check or retract the claim.`;
  if (payload.stop_hook_active === true) {
    return { systemMessage: `agent-org claim check (unresolved after one retry): ${failures.join('; ')}.` };
  }
  if (BLOCK_FORM === 'additionalContext') return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
  return { decision: 'block', reason: text };
}

const short = (s) => (s.length > 80 ? `${s.slice(0, 77)}…` : s);

// ---------------------------------------------------------------------------------------------
// Stop (main thread)

export function checkStop(payload) {
  const text = typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : null;
  const entries = readJsonl(payload.transcript_path); // missing transcript → throws → no output
  const finalText = text ?? finalAssistantText(entries);
  if (!finalText) return null;
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();

  const subs = [];
  for (const f of subagentTranscripts(payload.transcript_path, payload.session_id)) {
    try { subs.push(readJsonl(f)); } catch { /* skip */ }
  }
  const specialistTexts = subs.map(finalAssistantText).filter(Boolean);
  const calls = toolCallsInTurn(entries);
  const failures = [];
  const kinds = new Set();

  for (const c of findClaims(finalText, specialistTexts)) {
    if (!evidenceFor(c.kind, calls)) {
      failures.push(`claim "${short(c.sentence)}" has no successful matching command in this turn`);
      kinds.add(`unbacked-${c.kind}`);
    }
  }
  const opened = filesOpenedInSession(entries, cwd);
  for (const s of subs) for (const f of filesOpenedInSession(s, cwd)) opened.add(f);
  for (const f of citedButNotOpened(findCitations(finalText), opened, cwd)) {
    failures.push(`you cite ${f} but never opened it this session: read it or drop the claim`);
    kinds.add('uncited-file');
  }
  if (!failures.length) return null;
  return { out: output('Stop', failures, payload), kinds: [...kinds] };
}

// ---------------------------------------------------------------------------------------------
// SubagentStop (agent-org specialists)

export function checkSubagentStop(payload) {
  const type = typeof payload.agent_type === 'string' ? payload.agent_type : '';
  if (!type.startsWith('agent-org:')) return null;
  const text = typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : '';
  let entries = [];
  try { entries = readJsonl(payload.agent_transcript_path); } catch { entries = []; }
  const all = toolCalls(entries);
  const shell = all.filter(isShell);
  const commands = { run: shell.length, failed: shell.filter((c) => c.isError === true).length };
  const isPm = type === PM;
  const outcome = isPm ? 'plan' : parseOutcome(text);
  const failures = [];
  const kinds = [];
  if (isPm) {
    // Exempt from the report contract; still audited and scanned for collisions below.
  } else if (!outcome) {
    failures.push('the report\'s first line must be "Outcome: PASS | FAIL | BLOCKED | SKIPPED | NOT RUN"');
    kinds.push('missing-outcome');
  } else if (outcome === 'PASS') {
    const backed = NO_SHELL.has(type) ? all.some(succeeded) : shell.some(succeeded);
    if (!backed) {
      failures.push('Outcome: PASS but your transcript has no successful command backing it');
      kinds.push('unbacked-pass');
    }
  }

  const sid = payload.session_id;
  // Finished agents' files are fair game for later sequential tasks (guard's same-group fallback).
  // A stop this hook blocks isn't a finish: the agent keeps working, so it's recorded on its next stop.
  const blocking = failures.length > 0 && payload.stop_hook_active !== true && BLOCK_FORM === 'decision';
  try {
    const id = payload.agent_id;
    if (!blocking && safeId(sid) && typeof id === 'string' && id) {
      updateState(sid, (s) => { s.finished[id] = new Date().toISOString(); return s; });
    }
  } catch { /* fail open */ }
  const repo = repoName(payload.cwd || process.cwd(), payload.cwd);
  const base = auditBase(payload, repo);
  // Collision scan: refused "modified since read" edits (no hook sees them, P5 B2). Deduplicated by tool_use_id.
  try {
    const stale = refusedStaleEdits(entries);
    if (stale.length && safeId(sid)) {
      let known = new Set();
      try { known = new Set(readLedger(sid).filter((r) => r.collision && r.tool_use_id).map((r) => r.tool_use_id)); } catch { /* none */ }
      for (const s of stale) {
        if (known.has(s.toolUseId)) continue;
        const file = s.file ? path.resolve(payload.cwd || '.', s.file) : null;
        appendLedger(sid, { agent_id: payload.agent_id, agent_type: type, file, collision: 'refused-stale-edit', tool_use_id: s.toolUseId });
        auditAppend(repo, { ...base, event: 'collision', agent_id: payload.agent_id, agent_type: type, file, tool_use_id: s.toolUseId, flags: ['refused-stale-edit'] });
      }
      kinds.push('refused-stale-edit');
    }
  } catch { /* fail open */ }

  try {
    auditAppend(repo, {
      ...base, event: 'result', agent_id: payload.agent_id, agent_type: type,
      outcome: outcome || 'MISSING', commands, flags: kinds.length ? kinds : undefined,
    });
  } catch { /* fail open */ }

  if (!failures.length) return null;
  return { out: output('SubagentStop', failures, payload), kinds };
}

// ---------------------------------------------------------------------------------------------

export function check(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const event = payload.hook_event_name;
  const r = event === 'SubagentStop' ? checkSubagentStop(payload) : event === 'Stop' ? checkStop(payload) : null;
  if (!r) return null;
  try {
    const repo = repoName(payload.cwd || process.cwd(), payload.cwd);
    auditAppend(repo, {
      ...auditBase(payload, repo), event: 'claim-flag', agent_id: payload.agent_id, agent_type: payload.agent_type || undefined,
      flags: [...r.kinds.filter((k) => k !== 'refused-stale-edit'), r.out.systemMessage ? 'warned' : 'blocked'],
    });
  } catch { /* fail open */ }
  return r.out;
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
  let out = null;
  try { out = check(payload); } catch { out = null; }
  if (!out) return;
  await new Promise((resolve) => process.stdout.write(JSON.stringify(out), () => resolve()));
}

const isMain = (() => {
  try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (isMain) {
  main()
    .catch(() => {})
    .finally(() => process.exit(0));
}
