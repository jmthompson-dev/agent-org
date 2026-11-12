// Phase 6c claim-check replay (V21-1). Usage: node tests/replay-6c.mjs [--plugin <dir>] [--evidence <dir>]
//
// Built in: a reconstruction of the seven main-thread Stop blocks of Phase 6c (6 false, 1 true; table in
// reports/release-checklist-v0.2.0-2026-11-08.md §4). Each case is a small synthetic transcript with the structure
// the real one had at the block (the turn's tool calls, the teammate report, the bold label) and the blocked
// sentence as published in that report. The real session transcripts are not in this public repo.
//
// --evidence <dir>: also replay the real transcripts from a local copy of the 6c evidence (`projects/`, `state/`),
// each cut at its block's timestamp with `finished` limited to entries recorded before it.
// Throwaway HOME only; no model calls.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const P = path.resolve(opt('--plugin') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin'));
const EV = opt('--evidence') ? path.resolve(opt('--evidence')) : null;
const HOOK = path.join(P, 'hooks', 'claim-check.mjs');
let pass = 0; let fail = 0; const out = [];
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !extra ? '' : `  -- ${String(extra).slice(0, 240)}`}`); };
const stop = (HOME, payload) => {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false, ...payload }), env: { ...process.env, HOME, USERPROFILE: HOME }, encoding: 'utf8' });
  return r.stdout || '';
};
const blockedBy = (o) => o.includes('agent-org claim check');

// ---------------------------------------------------------------- reconstruction (always runs)
{
  const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ao-6c-')));
  const HOME = path.join(TMP, 'home'); const W = path.join(TMP, 'scratch-repo');
  fs.mkdirSync(path.join(W, 'src'), { recursive: true }); fs.mkdirSync(HOME);
  const INTENT = path.join(HOME, '.agent-org', 'intents', 'local-000000000000', '2026-11-08-cache-test-flake-s1.md');
  let id = 0; let n = 0;
  const user = (t) => ({ type: 'user', message: { role: 'user', content: t } });
  const call = (name, input, o = 'ok') => { const u = `toolu_${++id}`; return [{ type: 'assistant', cwd: W, message: { role: 'assistant', content: [{ type: 'tool_use', id: u, name, input }] } }, { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: u, is_error: false, content: o }] } }]; };
  const notify = () => user('<task-notification>\n<status>completed</status>\n<summary>Agent "Plan" finished</summary>\n</task-notification>');
  const idle = (name, result) => user(`Another Claude session sent a message:\n<teammate-message teammate_id="${name}" color="green">\n${JSON.stringify({ type: 'idle_notification', from: name, result })}\n</teammate-message>`);
  const run = (entries, text, state) => {
    const sid = `r${++n}`; const file = path.join(TMP, `${sid}.jsonl`);
    fs.writeFileSync(file, entries.flat().map((e) => JSON.stringify(e)).join('\n') + '\n');
    if (state) { const d = path.join(HOME, '.agent-org', 'state', sid); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({ approvals: [], scope: {}, riskySeen: {}, dispatch: {}, finished: {}, ...state })); }
    return stop(HOME, { session_id: sid, transcript_path: file, cwd: W, last_assistant_message: text });
  };
  // Planning turn, then the PM's notification turn that only saves the intent (5fa84835, 859ea49f).
  const planned = [user('Find out why test/cache.test.js fails sometimes and fix it.'), call('Bash', { command: 'cat src/cache.js test/cache.test.js' }, '…'), call('Agent', { subagent_type: 'agent-org:principal-project-manager', prompt: 'p' }, 'launched'), notify(), call('Write', { file_path: INTENT, content: '# intent' }, 'File created successfully')];
  const CASES = [
    ['5fa84835', 'purpose clause in an intent summary', false, planned,
      'The intent is saved, status **PROPOSED**.\n\n**Summary**\n- **Level:** 2\n- **Goal:** prove why `test/cache.test.js` fails intermittently, then fix it so the tests pass on every run.'],
    ['859ea49f', 'sentence under a "not run yet" bold label, intent-only turn', false, planned,
      'The plan is saved, status PROPOSED.\n\n- **Likely cause (from reading the code, not run yet):** `src/cache.js:10` and `:15` round expiry down to whole seconds. The second test passes only because its 1100 ms sleep always crosses a second boundary.'],
    ['4addd8ed', '"none of which" relay intro', false, [user('go'), idle('cache-dev', 'Outcome: PASS\nThe two-line fix is in `src/cache.js`.')],
      "`cache-dev` sent its report. Here's what it says happened, none of which I've verified yet:"],
    ['4addd8ed', 'paraphrased teammate idle report', false, [user('go'), idle('cache-qa', 'Outcome: BLOCKED (interim)\n- Every failure I looked at was test 1. Test 2 passed every time. That matches the roughly 50% prediction.')],
      '`cache-qa` has sent an interim report. Its findings so far:\n- **The flake:** the original test file failed 10 of 20 runs on the current commit. The other test passed every time.'],
    ['4addd8ed', '"verified" as an adjective', false, [user('go'), call('Edit', { file_path: INTENT, old_string: 'IMPLEMENTED', new_string: 'VERIFIED' })],
      'The verified fix stays in the working tree, uncommitted.'],
    ['4addd8ed', 'status sentence', false, [user('go'), call('Edit', { file_path: INTENT, old_string: 'IMPLEMENTED', new_string: 'VERIFIED' })],
      'The plan is marked VERIFIED.'],
    ['8c1b5db8', 'true claim, no test command (must still block)', true, [user('Say the tests pass.')],
      'I ran the test suite and all tests pass.'],
  ];
  fs.writeFileSync(path.join(W, 'src', 'cache.js'), '// x\n');
  for (const [sid, what, expect, entries, text] of CASES) {
    const o = run(entries, text);
    ok(`6c reconstruction ${sid}: ${what} → ${expect ? 'block' : 'no block'}`, blockedBy(o) === expect, o);
  }
  fs.rmSync(TMP, { recursive: true, force: true });
}

// ---------------------------------------------------------------- real transcripts (only with --evidence)
if (EV) {
  const NEEDLES = [
    ['5fa84835-976c-4987-ac17-19251f33e230', 'Goal:', false],
    ['859ea49f-acfb-442c-b9ec-ff68b121cf7f', 'The second test passes only because', false],
    ['4addd8ed-1fed-4d34-b777-4ba1f327efee', "none of which I've verified yet", false],
    ['4addd8ed-1fed-4d34-b777-4ba1f327efee', 'The other test passed every time.', false],
    ['4addd8ed-1fed-4d34-b777-4ba1f327efee', 'The verified fix stays in the working tree', false],
    ['4addd8ed-1fed-4d34-b777-4ba1f327efee', 'The plan is marked VERIFIED.', false],
    ['8c1b5db8-3c36-4760-8831-d155db5bd0ac', 'I ran the test suite and all tests pass.', true],
  ];
  const lines = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  for (const [sid, needle, expect] of NEEDLES) {
    const all = lines(path.join(EV, 'projects', `${sid}.jsonl`));
    const k = all.findIndex((l) => { try { const e = JSON.parse(l); return e.type === 'attachment' && l.includes('agent-org claim check') && l.includes(needle.replace(/"/g, '\\"').slice(0, 30)) && /"hookEvent": ?"Stop"/.test(l); } catch { return false; } });
    if (k < 0) { ok(`6c evidence ${sid.slice(0, 8)} "${needle}": block found in the evidence`, false); continue; }
    const at = JSON.parse(all[k]).timestamp;
    let j = k; let text = '';
    for (; j >= 0; j--) { const e = JSON.parse(all[j]); if (e.type === 'assistant' && Array.isArray(e.message.content)) { const t = e.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'); if (t.trim()) { text = t; break; } } }
    const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ao-6e-')));
    const HOME = path.join(TMP, 'home'); const proj = path.join(TMP, 'proj');
    fs.mkdirSync(path.join(proj, sid, 'subagents'), { recursive: true });
    fs.writeFileSync(path.join(proj, `${sid}.jsonl`), all.slice(0, j + 1).join('\n') + '\n');
    const sd = path.join(EV, 'projects', sid, 'subagents');
    for (const f of fs.existsSync(sd) ? fs.readdirSync(sd).filter((x) => x.endsWith('.jsonl')) : []) {
      const keep = lines(path.join(sd, f)).filter((l) => { try { const t = JSON.parse(l).timestamp; return !t || t <= at; } catch { return false; } });
      fs.writeFileSync(path.join(proj, sid, 'subagents', f), keep.join('\n') + '\n');
    }
    const sf = path.join(EV, 'state', sid, 'state.json');
    if (fs.existsSync(sf)) {
      const st = JSON.parse(fs.readFileSync(sf, 'utf8'));
      st.finished = Object.fromEntries(Object.entries(st.finished || {}).filter(([, t]) => t <= at));
      fs.mkdirSync(path.join(HOME, '.agent-org', 'state', sid), { recursive: true });
      fs.writeFileSync(path.join(HOME, '.agent-org', 'state', sid, 'state.json'), JSON.stringify(st));
    }
    const o = stop(HOME, { session_id: sid, transcript_path: path.join(proj, `${sid}.jsonl`), cwd: TMP, last_assistant_message: text });
    ok(`6c evidence ${sid.slice(0, 8)} "${needle}" → ${expect ? 'block' : 'no block'}`, blockedBy(o) === expect, o);
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed${EV ? '' : ' (reconstruction only; add --evidence <dir> for the real 6c transcripts)'}`);
process.exitCode = fail ? 1 : 0;
