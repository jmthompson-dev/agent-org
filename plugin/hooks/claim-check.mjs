#!/usr/bin/env node
// agent-org claim check (v0.2: A1, A2; D25). Runs on Stop (main thread) and SubagentStop (agent-org:*).
//   Stop: every verification claim in the final text needs a successful matching tool call in the
//         current turn (or, in a turn with no tool calls, the previous turn), and every `path:line` citation
//         must name a file opened, or seen in successful tool output, this session. Relayed, quoted, negated,
//         retracted and future-tense or plan sentences are skipped (v0.2c, F2).
//   SubagentStop: the report contract (first line `Outcome: …`; a PASS needs a successful command in the
//         agent's own transcript), a scan for refused "modified since read" edits (collisions), an audit
//         `result` record, and finished[agent_id] in the session state (for the guard's same-group fallback).
//         The PM is exempt from the report contract: it returns an intent (audited with outcome `plan`).
//         v0.2e: with no last_assistant_message the report is the last SubagentHandback message (B-1); a report
//         whose first line has no outcome falls back to its last `Outcome:` line, flagged `missing-outcome` (V-2).
//   v0.2.1 (V21-1, Phase 6c false blocks): finished teammates' <teammate-message> reports join the relay pool; "none
//         of" is a negation; status sentences, "verified" as an adjective, purpose clauses and list items whose bold
//         label is negated, hedged or a goal are skipped; a turn whose only tool calls edit intent files may restate
//         the previous turn's evidence; relay matching ignores a few filler words.
// Blocks once (stop_hook_active false) with hookSpecificOutput.additionalContext (v0.2c: "Stop hook feedback",
// Phase 6); on the second stop it only warns. Agent identity goes through effectiveType() (F1).
// Fail-open, no content logged.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filesOpenedInSession, filesSeenInOutput, finalAssistantText, isShell, lastHandbackMessage, readJsonl, refusedStaleEdits,
  subagentTranscripts, succeeded, teammateMessages, toolCalls, toolCallsInPreviousTurn, toolCallsInTurn,
} from './lib/transcript.mjs';
import {
  appendLedger, effectiveType, isUnder, orgSubdir, readLedger, readState, resolvePath, safeId, updateState,
} from './lib/state.mjs';
import { repoId } from './lib/repo.mjs';
import { append as auditAppend } from './lib/audit.mjs';
import { auditBase, lastOutcome, parseOutcome } from './record.mjs';

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

const stripQuotes = (t) => t.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n').replace(/"[^"\n]*"|“[^”\n]*”/g, ' ');

// Text the claim scan may judge: no fences, no blockquotes, no inline code, no quoted strings.
function claimableText(text) {
  return stripQuotes(stripFences(text)).replace(/`[^`\n]*`/g, ' ');
}

export function sentences(text) {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

const DETERMINER = /\b(?:the|a|an|this|that|its|their|our|my|your)\s+$/i;
function verifiedClaim(s) {
  for (const m of s.matchAll(/\b[Vv]erified\b/g)) if (!DETERMINER.test(s.slice(0, m.index))) return true;
  return false;
}

const CLAIMS = [
  { kind: 'tests', re: /\btests?:?\s+(?:all\s+)?(?:pass|passed|passes|passing)\b/i },
  { kind: 'tests', re: /\b\d+\s*\/\s*\d+\s+(?:tests?\s+)?(?:pass|passed|passing)\b/i },
  { kind: 'any', re: /\ball\s+(?:tests|checks)\s+(?:pass|passed|are\s+passing|green|are\s+green)\b/i },
  { kind: 'build', re: /\bbuild\s+(?:succeeds|succeeded|passes|passed)\b/i },
  { kind: 'any', re: /\bI\s+ran\b/i },
  // v0.2.1 (V21-1): all-caps VERIFIED is the intent status, and "the/a verified <noun>" is an adjective.
  { kind: 'any', re: { test: (s) => verifiedClaim(s) } },
  { kind: 'any', re: /\bno\s+errors\b/i },
  { kind: 'lint', re: /\blints?\s+(?:is\s+|are\s+)?clean\b/i },
];
const NEGATED = /\b(?:not|never|nothing|none\s+of|not\s+yet|didn't|didn’t|haven't|haven’t|hasn't|wasn't|weren't|cannot|can't|unverified|retract\w*|would|should|if|unless)\b|n't\b/i;
// v0.2c (F2): future-tense or plan sentences describe what will happen, not what did.
const FUTURE = /\b(?:I'll|I’ll|I\s+will|will|going\s+to|once|after|before|next|then\s+I)\b/i;
const skipSentence = (s) => NEGATED.test(s) || FUTURE.test(s);
// v0.2e (V-3): hedges and estimates aren't claims ("roughly a 25% chance the test passes", Phase 6b).
const HEDGE = /\b(?:roughly|chances?|probabl[ey]|likely|estimat\w*|might|may|could|expect\w*)\b/i;
// v0.2.1 (V21-1): status sentences ("Status: …", "marked VERIFIED") and purpose clauses ("Goal: …", "so that",
// "to make … pass") describe the plan, not a result.
const STATUS = /(?:^|[\s*_>-])Status\s*:|\b(?:marked|set\s+to|moved\s+to)\s+(?:as\s+)?[*_`]*(?:VERIFIED|IMPLEMENTED|APPROVED|PROPOSED)\b/;
const PURPOSE = /^[\s>*_#-]*(?:\d+[.)]\s*)?[*_]*(?:goals?|objectives?|purpose|aim)[*_]*\s*:|\bso\s+that\b|\bto\s+make\b[^.!?]*\bpass/i;
const skipClaim = (s) => skipSentence(s) || HEDGE.test(s) || STATUS.test(s) || PURPOSE.test(s);

// v0.2.1 (V21-1): a list item or line whose bold label is negated, hedged, future or a goal ("- **Likely cause
// (from reading the code, not run yet):** …") qualifies every sentence after it on that line.
const LABEL = /^\s*(?:[-*+]|\d+[.)])?\s*\*\*([^*\n]{1,120}?)\*\*/;
export function labelSkips(line) {
  const m = LABEL.exec(line);
  return Boolean(m && (skipClaim(m[1]) || /^\s*(?:goals?|objectives?|purpose|aim)\s*:?\s*$/i.test(m[1])));
}

// Claimable sentences of a text, line by line, minus lines whose label qualifies them. v0.2.1: each sentence is
// further split at `;`, so a negation, hedge or plan word covers only its own clause ("Not run yet: integration;
// unit tests pass" still claims the unit tests).
function claimSentences(text) {
  const out = [];
  for (const line of claimableText(text).split('\n')) {
    if (!line.trim() || labelSkips(line)) continue;
    for (const s of sentences(line)) out.push(...s.split(/;\s*/).map((c) => c.trim()).filter(Boolean));
  }
  return out;
}

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
// v0.2.1 (V21-1): filler words a faithful paraphrase adds or drops ("The other test passed every time" for
// "Test 2 passed every time"). Words that change a claim's scope ("all", numbers) are not in the list.
const FILLER = new Set(['the', 'a', 'an', 'other', 'its', 'their', 'it', 'this', 'that', 'also', 'still']);

// Attribution prefix of a relayed sentence ("full-stack-developer reports:", "QA said"), up to 3 words before the verb.
const ATTRIBUTION = /^\s*(?:\S+\s+){0,3}?(?:reports?|reported|says|said|confirms?|confirmed|returns?|returned|writes|wrote)\b\s*:?\s*/i;

// The specialist sentences that may back a relay (v0.2d): sentences that aren't negated, hedged or future-tense,
// from an agent whose last stop passed its own check (`finished` recorded), or a teammate's idle report (V21-1).
// v0.2.1: any such sentence, not only one the claim patterns match ("Test 2 passed every time" is a result too).
// Quoted text doesn't count, as on the main thread.
function relayableSentences(specialists) {
  const out = [];
  for (const sp of specialists) {
    if (!sp || !sp.finished || typeof sp.text !== 'string') continue;
    for (const s of claimSentences(sp.text)) {
      if (skipClaim(s)) continue;
      out.push(new Set(tokens(norm(s))));
    }
  }
  return out;
}

// v0.2d: a claim sentence is relayed when every word of it (attribution prefix removed) appears in one relayable
// specialist sentence, so "X reports: Tests: PASS" matches "Tests: PASS (6/6)".
export function isRelayed(sentence, specialists) {
  const words = tokens(norm(sentence.replace(ATTRIBUTION, ''))).filter((w) => !FILLER.has(w));
  if (!words.length) return false;
  return relayableSentences(specialists).some((st) => words.every((w) => st.has(w)));
}

// `specialists`: [{ id, text, finished }] from this session's subagent transcripts.
export function findClaims(text, specialists = []) {
  const out = [];
  for (const s of claimSentences(text)) {
    const hit = CLAIMS.find((c) => c.re.test(s));
    if (!hit || skipClaim(s)) continue;
    if (isRelayed(s, specialists)) continue;
    out.push({ sentence: s, kind: hit.kind });
  }
  return out;
}

// Citations (v0.2c, F2): only `<path>:<line>` (optionally `:<line>-<line>`) where <path> has a known file
// extension or a `/`. Bare paths, planned files and URL routes are never checked.
const EXT = 'js|mjs|cjs|jsx|ts|tsx|mts|cts|json|jsonc|jsonl|md|mdx|py|pyi|rb|go|rs|java|kt|kts|scala|groovy|c|h|cc|cpp|cxx|hpp|cs|fs|swift|m|mm|php|sh|bash|zsh|fish|ps1|psm1|bat|cmd|yml|yaml|toml|ini|cfg|conf|xml|html|htm|css|scss|sass|less|vue|svelte|astro|sql|proto|graphql|gql|tf|tfvars|hcl|gradle|properties|env|txt|lock|mk|cmake|ex|exs|erl|clj|cljs|lua|r|dart|ipynb|csv|tsv|rst|adoc|tex|vim|el|nix|zig|sol|prisma';
const CITE_RE = new RegExp(String.raw`(?<![\w@/.~:-])((?:~|\.{1,2})?/?(?:[\w@.+-]+/)*[\w@+-][\w@.+-]*\.(?:${EXT})|(?:~|\.{1,2})?/?(?:[\w@.+-]+/)+[\w@.+-]+):\d+(?:[-–]\d+)?(?![\w/])`, 'gi');
const NOT_FILES = /^(?:node|next|nuxt|vue|react|express|three|chart|d3|socket\.io|ember|backbone|angular|deno)\.js$/i;

// Returns [{ path, cite }], where `cite` is the full `path:line` token (v0.2e, V-5: the reason names it).
export function findCitations(text) {
  const clean = stripQuotes(stripFences(text)).replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)>\]]+/gi, ' ');
  const out = new Map();
  for (const s of sentences(clean)) {
    if (skipSentence(s)) continue;
    for (const m of s.matchAll(CITE_RE)) {
      const p = m[1];
      if (!p || NOT_FILES.test(p) || /^\d/.test(p)) continue;
      if (!out.has(m[0])) out.set(m[0], { path: p, cite: m[0] });
    }
  }
  return [...out.values()];
}

// `seenNames` holds bare file names seen in tool output (no directory part to resolve).
function citedButNotOpened(citations, opened, cwd, seenNames = new Set()) {
  const all = [...opened];
  const missing = [];
  for (const cit of citations) {
    const c = cit.path;
    const abs = path.resolve(cwd || '.', c.startsWith('~') ? c.replace(/^~/, process.env.HOME || '~') : c);
    if (opened.has(abs)) continue;
    const tail = c.replace(/^\.\//, '').split(/[\\/]/).filter(Boolean).join('/');
    // Tolerate citations relative to a subdirectory or a bare file name: invented files are still caught.
    if (all.some((f) => f.split(path.sep).join('/').endsWith(`/${tail}`))) continue;
    if (seenNames.has(path.basename(tail))) continue;
    missing.push(cit);
  }
  return missing;
}

// ---------------------------------------------------------------------------------------------
// Output

// `failures`: claim failures; `uncited`: `path:line` citations never opened or seen (v0.2e, V-5: own wording).
function output(event, failures, payload, uncited = []) {
  const parts = [];
  if (failures.length) parts.push(`agent-org claim check: ${failures.join('; ')}. Run the check or retract the claim.`);
  for (const c of uncited) parts.push(`agent-org citation check: you cite \`${c}\` but never opened it this session: read it or drop the claim.`);
  const text = parts.join(' ');
  if (payload.stop_hook_active === true) {
    const items = [...failures, ...uncited.map((c) => `you cite \`${c}\` but never opened it this session`)];
    return { systemMessage: `agent-org claim check (unresolved after one retry): ${items.join('; ')}.` };
  }
  // v0.2c: additionalContext continues the turn like `decision` and shows as "Stop hook feedback" (Phase 6).
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}

const short = (s) => (s.length > 80 ? `${s.slice(0, 77)}…` : s);

// ---------------------------------------------------------------------------------------------
// Stop (main thread)

const INTENT_EDIT_TOOLS = new Set(['Edit', 'Write']);
function isIntentEdit(call, cwd) {
  if (!INTENT_EDIT_TOOLS.has(call.name) || typeof call.input.file_path !== 'string') return false;
  const abs = resolvePath(call.input.file_path, call.cwd || cwd);
  return orgSubdir('intents').some((d) => isUnder(abs, d));
}

export function checkStop(payload) {
  const text = typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : null;
  const entries = readJsonl(payload.transcript_path); // missing transcript → throws → no output
  const finalText = text ?? finalAssistantText(entries);
  if (!finalText) return null;
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();

  // finished[agent_id] is recorded only on an unblocked SubagentStop; unreadable state → no relays recognized.
  let finished = {};
  let dispatch = {};
  try { const st = readState(payload.session_id); finished = st.finished || {}; dispatch = st.dispatch || {}; } catch { finished = {}; }
  const subs = [];
  const specialists = [];
  for (const f of subagentTranscripts(payload.transcript_path, payload.session_id)) {
    try {
      const ents = readJsonl(f);
      subs.push(ents);
      const id = path.basename(f, '.jsonl').replace(/^agent-/, ''); // agent-<agent_id>.jsonl (P5 B1)
      // v0.2e (B-1): a specialist that reported through SubagentHandback relays from that message too.
      const text = [finalAssistantText(ents), lastHandbackMessage(ents)].filter(Boolean).join('\n');
      specialists.push({ id, text, finished: Boolean(finished[id]) });
    } catch { /* skip */ }
  }
  // v0.2.1 (V21-1): teammates report through <teammate-message> prompts in the lead's transcript. An idle
  // notification's `result` is the teammate's report at a stop; a plain message counts once the teammate has
  // finished (SubagentStop recorded for the agent the teammate name maps to).
  try {
    for (const m of teammateMessages(entries)) {
      const ids = Object.keys(dispatch).filter((id) => (dispatch[id] && dispatch[id].name === m.teammate) || id.startsWith(`a${m.teammate}-`));
      specialists.push({ id: `teammate:${m.teammate}`, text: m.text, finished: m.idle || ids.some((id) => finished[id]) });
    }
  } catch { /* fail open: no teammate relays */ }
  let calls = toolCallsInTurn(entries);
  // v0.2c: a turn with no tool calls (a summary or answer) may restate the previous turn's evidence.
  // v0.2.1 (V21-1): so may a turn whose only tool calls are edits to intent files (saving or updating the intent).
  if (!calls.length || calls.every((c) => isIntentEdit(c, cwd))) calls = [...calls, ...toolCallsInPreviousTurn(entries)];
  const failures = [];
  const uncited = [];
  const kinds = new Set();

  for (const c of findClaims(finalText, specialists)) {
    if (!evidenceFor(c.kind, calls)) {
      failures.push(`claim "${short(c.sentence)}" has no successful matching command in this turn`);
      kinds.add(`unbacked-${c.kind}`);
    }
  }
  const citations = findCitations(finalText);
  if (citations.length) {
    const opened = filesOpenedInSession(entries, cwd);
    const seenNames = new Set();
    const addSeen = (list) => {
      for (const s of list) {
        for (const f of filesSeenInOutput(s, cwd)) {
          if (f.includes('/') || f.includes('\\')) opened.add(f);
          else seenNames.add(f);
        }
      }
    };
    for (const s of subs) for (const f of filesOpenedInSession(s, cwd)) opened.add(f);
    addSeen([entries, ...subs]);
    for (const f of citedButNotOpened(citations, opened, cwd, seenNames)) {
      uncited.push(f.cite);
      kinds.add('uncited-file');
    }
  }
  if (!failures.length && !uncited.length) return null;
  return { out: output('Stop', failures, payload, uncited), kinds: [...kinds] };
}

// ---------------------------------------------------------------------------------------------
// SubagentStop (agent-org specialists)

export function checkSubagentStop(payload) {
  let type = typeof payload.agent_type === 'string' ? payload.agent_type : '';
  if (type && !type.startsWith('agent-org:')) {
    // v0.2c (F1): a teammate's agent_type is its name; the dispatch record maps it back.
    try { type = effectiveType(payload, readState(payload.session_id)) || type; } catch { /* fail open */ }
  }
  if (!type.startsWith('agent-org:')) return null;
  let entries = [];
  try { entries = readJsonl(payload.agent_transcript_path); } catch { entries = []; }
  // v0.2e (B-1): with no last_assistant_message (the agent reported through SubagentHandback, Phase 6b), the
  // report is the last hand-back message. The same text drives the outcome, the backing check and the audit.
  let text = typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : '';
  if (!text.trim()) text = lastHandbackMessage(entries);
  const hasReport = Boolean(text.trim());
  // The hand-back call is the report itself, never evidence for it.
  const all = toolCalls(entries).filter((c) => c.name !== 'SubagentHandback');
  const shell = all.filter(isShell);
  const commands = { run: shell.length, failed: shell.filter((c) => c.isError === true).length };
  const isPm = type === PM;
  const failures = [];
  const kinds = [];
  let outcome = isPm ? 'plan' : parseOutcome(text);
  if (!isPm && !outcome && hasReport) {
    // v0.2e (V-2): no outcome on the first line → use the last `Outcome:` line, and flag the first line separately.
    failures.push('the report\'s first line must be "Outcome: PASS | FAIL | BLOCKED | SKIPPED | NOT RUN"');
    kinds.push('missing-outcome');
    outcome = lastOutcome(text);
  }
  if (isPm || !hasReport) {
    // PM: exempt from the report contract. No report text at all: fail open (audited as `unknown`).
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
  const blocking = failures.length > 0 && payload.stop_hook_active !== true;
  try {
    const id = payload.agent_id;
    if (!blocking && safeId(sid) && typeof id === 'string' && id) {
      updateState(sid, (s) => { s.finished[id] = new Date().toISOString(); return s; });
    }
  } catch { /* fail open */ }
  const repo = repoId(payload.cwd || process.cwd(), payload.cwd);
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
      outcome: outcome || (hasReport ? 'MISSING' : 'unknown'), commands, flags: kinds.length ? kinds : undefined,
    });
  } catch { /* fail open */ }

  if (!failures.length) return null;
  return { out: output('SubagentStop', failures, payload), kinds, agentType: type };
}

// ---------------------------------------------------------------------------------------------

export function check(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const event = payload.hook_event_name;
  const r = event === 'SubagentStop' ? checkSubagentStop(payload) : event === 'Stop' ? checkStop(payload) : null;
  if (!r) return null;
  try {
    const repo = repoId(payload.cwd || process.cwd(), payload.cwd);
    auditAppend(repo, {
      ...auditBase(payload, repo), event: 'claim-flag', agent_id: payload.agent_id, agent_type: r.agentType || payload.agent_type || undefined,
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
