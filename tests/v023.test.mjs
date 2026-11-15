// agent-org v0.2.3 tests (D35): ceremony cuts. Ledger SEQUENTIAL same-type classifier (P3), docs-only floor in the
// guard (P7), intent-audit flags plan-fix-logged and owner-condition-open (P2), level question text (P8), and the
// pinned strings the instruction files must carry.
// Usage: node tests/v023.test.mjs [plugin dir]. No model calls; a throwaway HOME.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process'; import { fileURLToPath, pathToFileURL } from 'node:url';
const P = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin'));
const H = path.join(P, 'hooks');
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ao-23-')));
const HOME = path.join(TMP, 'home'); fs.mkdirSync(HOME);
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
delete process.env.AGENT_ORG_HOOK_DEBUG; delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS; delete process.env.CLAUDE_CODE_SESSION_ID;
let pass = 0; let fail = 0; const out = [];
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !extra ? '' : `  -- ${String(extra).slice(0, 400)}`}`); };
const run = (script, input, env = {}, args = []) => {
  const r = spawnSync(process.execPath, [path.join(H, script), ...args], { input: typeof input === 'string' ? input : JSON.stringify(input), env: { ...process.env, HOME, USERPROFILE: HOME, ...env }, encoding: 'utf8', timeout: 10000 });
  let json = null; try { json = r.stdout ? JSON.parse(r.stdout) : null; } catch { json = 'BADJSON'; }
  return { out: r.stdout, code: r.status, json };
};
const imp = (f) => import(pathToFileURL(path.join(H, f)).href);
const L = await imp('lib/level.mjs'); const G = await imp('guard.mjs'); const rec = await imp('record.mjs'); const repo = await imp('lib/repo.mjs');
const resetHome = () => fs.rmSync(path.join(HOME, '.agent-org'), { recursive: true, force: true });
const gitRepo = (dir) => { fs.mkdirSync(path.join(dir, 'src'), { recursive: true }); execFileSync('git', ['init', '-q', dir]); return dir; };
const stateOf = (sid) => { try { return JSON.parse(fs.readFileSync(path.join(HOME, '.agent-org/state', sid, 'state.json'), 'utf8')); } catch { return null; } };
const auditAll = () => { try { return fs.readdirSync(path.join(HOME, '.agent-org/audit')).filter((f) => f.endsWith('.jsonl')).flatMap((f) => fs.readFileSync(path.join(HOME, '.agent-org/audit', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))); } catch { return []; } };
const decisionOf = (r) => (r.json && r.json.hookSpecificOutput ? r.json.hookSpecificOutput.permissionDecision : 'none');
const reasonOf = (r) => (r.json && r.json.hookSpecificOutput ? r.json.hookSpecificOutput.permissionDecisionReason : '');
const all = (v) => Object.fromEntries(L.KEYS.map((k) => [k, v]));
const ANS_N = L.KEYS.map((k) => `${k}=n`).join(' ');
const grepc = (file, s) => fs.readFileSync(path.join(P, '..', file), 'utf8').split(s).length - 1;

// ---------------------------------------------------------------- P3: --ledger SEQUENTIAL same-type
{
  resetHome();
  const T = 'agent-org:full-stack-developer';
  const ledger = (sid, rows, state = {}) => {
    const d = path.join(HOME, '.agent-org/state', sid); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'ledger.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({ approvals: [], scope: {}, dispatch: {}, finished: {}, riskySeen: {}, levels: {}, reqFiles: {}, ...state }));
    return rec.ledgerSummary(sid);
  };
  const t = (s) => `2026-11-15T10:00:${String(s).padStart(2, '0')}.000Z`;
  const row = (s, id, type, file, extra = {}) => ({ ts: t(s), agent_id: id, agent_type: type, file, ...extra });
  const F = '/w/src/a.js';
  let s = ledger('seq-1', [row(1, 'A1', T, F), row(5, 'A2', T, F)], { finished: { A1: t(3), A2: t(9) } });
  ok('ledger: same type, A1 finished before A2\'s first row → SEQUENTIAL same-type line', s.includes(`SEQUENTIAL same-type: ${F} (A1 then A2)`), s);
  ok('ledger: sequential is not a collision (collision flags: none, no COLLISION changed by)', s.includes('collision flags: none') && !s.includes('COLLISION changed by'), s);
  ok('ledger: trailing "sequential same-type: 1 (accept only if planned; see deliver step 6)"', s.includes('sequential same-type: 1 (accept only if planned; see deliver step 6)'), s);
  s = ledger('seq-2', [row(1, 'A1', T, F), row(5, 'A2', T, F), row(8, 'A3', T, F)], { finished: { A1: t(3), A2: t(7), A3: t(9) } });
  ok('ledger: three sequential passes → (A1 then A2 then A3)', s.includes(`(A1 then A2 then A3)`), s);
  s = ledger('seq-3', [row(1, 'A1', T, F), row(2, 'A2', T, F)], { finished: { A1: t(3), A2: t(9) } });
  ok('ledger: overlapping (A2 starts before A1 finishes) → COLLISION changed by 2 agents', s.includes('COLLISION changed by 2 agents') && s.includes('collision flags: 1') && !s.includes('SEQUENTIAL'), s);
  s = ledger('seq-4', [row(1, 'A1', T, F), row(5, 'A2', T, F)], { finished: { A2: t(9) } });
  ok('ledger: missing finished for the first agent → COLLISION', s.includes('COLLISION changed by 2 agents') && !s.includes('SEQUENTIAL'), s);
  s = ledger('seq-5', [row(1, 'A1', T, F), row(5, 'A2', T, F)], { finished: { A1: t(3), A2: t(9) }, dispatch: { A2: { teammate: true } } });
  ok('ledger: a teammate in the set → COLLISION', s.includes('COLLISION changed by 2 agents') && !s.includes('SEQUENTIAL'), s);
  s = ledger('seq-6', [row(1, 'A1', T, F), row(5, 'A2', 'agent-org:qa-engineer', F)], { finished: { A1: t(3), A2: t(9) } });
  ok('ledger: different agent types → COLLISION', s.includes('COLLISION changed by 2 agents') && !s.includes('SEQUENTIAL'), s);
  s = ledger('seq-7', [row(1, 'A1', T, F), row(4, 'A1', T, '/w/src/b.js'), row(5, 'A2', T, F)], { finished: { A1: t(3), A2: t(9) } });
  ok('ledger: "first ledger row (any file)": A1 finished before A2 first row but A1 has a later row → still SEQUENTIAL by first rows', s.includes('SEQUENTIAL same-type'), s);
  s = ledger('seq-8', [row(1, 'A1', T, F), row(5, 'A2', T, F), row(6, 'A3', 'agent-org:qa-engineer', F)], { finished: { A1: t(3), A2: t(5.5), A3: t(9) } });
  ok('ledger: a mixed-type third id → COLLISION for that file', s.includes('COLLISION changed by 3 agents'), s);
  s = ledger('seq-9', [row(1, 'A1', T, F, { collision: 'stale edit' }), row(5, 'A2', T, F)], { finished: { A1: t(3), A2: t(9) } });
  ok('ledger: a row with a collision field is still counted (collision flags: 1)', s.includes('collision flags: 1') && s.includes('COLLISION stale edit'), s);
  s = ledger('seq-10', [row(1, 'A1', T, F), row(5, 'A2', T, '/w/src/b.js')], { finished: { A1: t(3) } });
  ok('ledger: distinct files → no sequential line, collision flags: none', !s.includes('SEQUENTIAL') && !s.includes('sequential same-type:') && s.includes('collision flags: none'), s);
  // Rev 2 edge cases (QA-002, QA-004, QA-005, QA-006; D35).
  const seqOk = (x) => x.includes('SEQUENTIAL same-type') && !x.includes('COLLISION changed by');
  const collOk = (x) => x.includes('COLLISION changed by 2 agents') && !x.includes('SEQUENTIAL') && x.includes('collision flags: 1');
  s = ledger('seq-e1', [row(1, 'A1', T, F), row(3, 'A2', T, F)], { finished: { A1: t(3), A2: t(9) } });
  ok('ledger: equal timestamps (finished == next first ts) → COLLISION (earlier is strict)', collOk(s), s);
  s = ledger('seq-e2', [row(1, 'A1', T, F), { agent_id: 'A2', agent_type: T, file: F }], { finished: { A1: t(3), A2: t(9) } });
  ok('ledger: missing ts on the later first row → COLLISION', collOk(s), s);
  s = ledger('seq-e2b', [row(1, 'A1', T, F), { ts: 'not-a-date', agent_id: 'A2', agent_type: T, file: F }], { finished: { A1: t(3), A2: t(9) } });
  ok('ledger: missing ts on the later first row, unparseable ts variant → COLLISION', collOk(s), s);
  s = ledger('seq-e3', [row(5, 'A2', T, F), row(1, 'A1', T, F)], { finished: { A1: t(3), A2: t(9) } });
  ok('ledger: out-of-order appended rows (A2 appended first, ts 5; A1 ts 1, finished 3) → SEQUENTIAL, ordered by ts (A1 then A2)', seqOk(s) && s.includes(`(A1 then A2)`), s);
  {
    const d = path.join(HOME, '.agent-org/state', 'seq-e4'); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'ledger.jsonl'), [row(1, 'A1', T, F), row(5, 'A2', T, F)].map((r) => JSON.stringify(r)).join('\n') + '\n');
    s = rec.ledgerSummary('seq-e4');
    ok('ledger: no state.json for the session → COLLISION', collOk(s), s);
  }
  s = ledger('seq-e5', [row(1, 'A1', T, F), row(5, 'A2', null, F)], { finished: { A1: t(3), A2: t(9) } });
  ok('ledger: one id missing agent_type → COLLISION', collOk(s), s);
  s = ledger('seq-e6', [row(1, 'A1', null, F), row(5, 'A2', null, F)], { finished: { A1: t(3), A2: t(9) } });
  ok('ledger: all ids missing agent_type → COLLISION (P3 rev 2: agent_type must be a non-empty string)', collOk(s), s);
  // P3 / D35 documented behavior: the last id in the chain needs no `finished`; the main thread waits for every report.
  s = ledger('seq-e7', [row(1, 'A1', T, F), row(5, 'A2', T, F)], { finished: { A1: t(3) } });
  ok('ledger: last pass still running (no finished for the last id) → SEQUENTIAL (documented, P3 and D35)', seqOk(s) && s.includes('(A1 then A2)'), s);
  const cli = spawnSync(process.execPath, [path.join(H, 'record.mjs'), '--ledger', '--session', 'seq-1'], { encoding: 'utf8', env: { ...process.env, HOME } }).stdout;
  ok('ledger cli: --ledger prints the SEQUENTIAL line', cli.includes('SEQUENTIAL same-type'), cli);
}

// ---------------------------------------------------------------- P7: docsOnlyPath (pure)
{
  const d = G.docsOnlyPath;
  ok('docs: .md, .mdx, .rst, .txt (any case) are docs-only', ['README.md', 'docs/a.md', 'x/y.MDX', 'notes.rst', 'notes.TXT', 'a/b/NOTES.txt'].every((p) => d(p) === true));
  ok('docs: a non-text file under a docs/ directory is not docs-only (Q2, D35)', d('docs/diagram.png') === false && d('Docs/x.svg') === false);
  ok('docs: other files under docs/ are not docs-only (.env, id_rsa, key.pem, x.yaml), docs/a.md still is', ['docs/.env', 'docs/id_rsa', 'docs/key.pem', 'docs/x.yaml'].every((p) => d(p) === false) && d('docs/a.md') === true);
  ok('docs: ordinary source is not docs-only', ['src/a.js', 'package.json', 'docsx/a.js'].every((p) => d(p) === false));
  ok('docs: risky paths are not docs-only (k8s/README.md, src/auth/NOTES.md, db/migrations/x.md, docs/terraform/x.md)', ['k8s/README.md', 'src/auth/NOTES.md', 'db/migrations/x.md', 'docs/terraform/x.md', 'infra/main.tf'].every((p) => d(p) === false));
  ok('docs: non-doc .txt is excluded (requirements*.txt, constraints*.txt, CMakeLists.txt)', ['requirements.txt', 'requirements-dev.txt', 'api/requirements.txt', 'constraints.txt', 'constraints-3.txt', 'CMakeLists.txt', 'lib/CMakeLists.txt'].every((p) => d(p) === false));
  ok('docs: prompt-like Markdown is excluded (SKILL.md, CLAUDE.md, AGENTS.md, .md under agents/skills/commands/hooks/.claude)', ['plugin/skills/x/SKILL.md', 'CLAUDE.md', 'sub/AGENTS.md', 'plugin/agents/pm.md', 'a/commands/go.md', 'plugin/hooks/rule-card.md', '.claude/notes.md', 'docs/skills/x.md'].every((p) => d(p) === false));
  ok('docs: bad input → false (fail closed to counting)', d(undefined) === false && d('') === false && d(42) === false);
  ok('docs: backslash paths work', d('docs\\a.md') === true && d('k8s\\README.md') === false);
  ok('riskyKinds unchanged for the docs cases', G.riskyKinds('k8s/README.md').join() === 'infra' && G.riskyKinds('src/auth/NOTES.md').join() === 'auth' && G.riskyKinds('docs/a.md').length === 0);
}

// ---------------------------------------------------------------- P7: the guard's level gate, end to end
{
  resetHome();
  const W = gitRepo(path.join(TMP, 'w', 'app'));
  const sid = 'dg-1';
  const edit = (pid, rel) => run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: sid, prompt_id: pid, cwd: W, tool_name: 'Edit', tool_input: { file_path: path.join(W, rel), old_string: 'a', new_string: 'b' }, tool_use_id: `t-${Math.random()}` });
  const check = (pid) => run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: sid, prompt_id: pid, cwd: W, tool_name: 'Bash', tool_input: { command: `node "${G.RECORD_SCRIPT}" --level-check "${ANS_N}"` }, tool_use_id: 'tc' });
  const key = repo.repoId(W).key;
  const reqFiles = (pid) => (stateOf(sid)?.reqFiles?.[pid]?.[key] || []).map((f) => path.relative(W, f));

  check('d1');
  const seq = ['src/a.js', 'src/b.js', 'docs/a.md', 'README.md'];
  const decs = seq.map((f) => decisionOf(edit('d1', f)));
  ok('docs floor: two source files plus docs/a.md plus README.md → no decision', decs.every((x) => x === 'none'), decs.join());
  ok('docs floor: docs-only paths are still recorded in reqFiles', reqFiles('d1').join() === seq.join(), reqFiles('d1').join());
  const r = edit('d1', 'src/c.js');
  ok('docs floor: a third source file is denied "file 3 of this request" and the request is Level 2', decisionOf(r) === 'deny' && /file 3 of this request/.test(reasonOf(r)) && stateOf(sid).levels.d1.level === 2, reasonOf(r));

  check('d1b');
  const seqB = ['docs/a.md', 'README.md', 'src/a.js', 'src/b.js'];
  const decsB = seqB.map((f) => decisionOf(edit('d1b', f)));
  const rB = edit('d1b', 'src/c.js');
  ok('docs floor: docs first, then source (docs/a.md, README.md, src/a.js, src/b.js → no decision; src/c.js → deny "file 3 of this request")', decsB.every((x) => x === 'none') && decisionOf(rB) === 'deny' && /file 3 of this request/.test(reasonOf(rB)), `${decsB.join()} ${reasonOf(rB)}`);

  check('d2');
  ok('docs floor: docs-only files alone never reach the floor (5 docs files → no decision)', ['docs/1.md', 'docs/2.md', 'docs/3.md', 'README.md', 'CHANGELOG.md'].every((f) => decisionOf(edit('d2', f)) === 'none'));

  check('d3');
  let r3 = edit('d3', 'k8s/README.md');
  ok('docs floor: k8s/README.md is still denied by the path floor (infra)', decisionOf(r3) === 'deny' && /infrastructure/.test(reasonOf(r3)) && /infra/.test(reasonOf(r3)), reasonOf(r3));
  check('d4');
  r3 = edit('d4', 'src/auth/NOTES.md');
  ok('docs floor: src/auth/NOTES.md is still denied by the path floor (auth)', decisionOf(r3) === 'deny' && /auth path/.test(reasonOf(r3)), reasonOf(r3));

  check('d5');
  const d5 = [edit('d5', 'src/a.js'), edit('d5', 'requirements.txt'), edit('d5', 'src/b.js')];
  ok('defaults: requirements.txt counts toward the floor (src/a.js + requirements.txt + src/b.js → third denied)', decisionOf(d5[0]) === 'none' && decisionOf(d5[1]) === 'none' && decisionOf(d5[2]) === 'deny' && /file 3 of this request/.test(reasonOf(d5[2])), reasonOf(d5[2]));
  check('d6');
  const d6 = [edit('d6', 'src/a.js'), edit('d6', 'plugin/skills/x/SKILL.md'), edit('d6', 'src/b.js')];
  ok('defaults: plugin/skills/x/SKILL.md counts toward the floor (third denied)', decisionOf(d6[1]) === 'none' && decisionOf(d6[2]) === 'deny' && /file 3 of this request/.test(reasonOf(d6[2])), reasonOf(d6[2]));
  check('d7');
  const d7 = [edit('d7', 'src/a.js'), edit('d7', 'src/b.js'), edit('d7', 'plugin/skills/x/SKILL.md')];
  ok('defaults: SKILL.md as the third file is denied', decisionOf(d7[2]) === 'deny' && /file 3 of this request/.test(reasonOf(d7[2])), reasonOf(d7[2]));
}

// ---------------------------------------------------------------- P2: intent audit flags
{
  resetHome();
  const W = gitRepo(path.join(TMP, 'w2', 'app'));
  let n = 0;
  const mk = (extra = '') => {
    const sid = `ia-${++n}`;
    const ip = rec.intentPath(`audit-${n}`, sid, W);
    fs.mkdirSync(path.dirname(ip.file), { recursive: true });
    const body = (status, oc, pf, crit) => `# Intent\n\n**Status:** ${status}\n${ip.lines.join('\n')}\n**Level:** 2\n\n## Goal\ng\n\n## Acceptance criteria\n${crit}\n\n## Owner conditions\n${oc}\n\n## Plan fixes\n${pf}\n\n## Approval log\n- APPROVED 2026-11-15 by user, conditions OC-1..OC-2\n`;
    return { sid, ip, body, extra };
  };
  const approve = (c, text) => { fs.writeFileSync(c.ip.file, text); rec.record({ session_id: c.sid, tool_name: 'Write', cwd: W, tool_input: { file_path: c.ip.file, content: '' } }); };
  const edit = (c, oldS, newS, textAfter) => {
    fs.writeFileSync(c.ip.file, textAfter);
    rec.record({ session_id: c.sid, tool_name: 'Edit', cwd: W, tool_use_id: `e-${Math.random()}`, tool_input: { file_path: c.ip.file, old_string: oldS, new_string: newS } });
  };
  const flagsFor = (c) => auditAll().filter((r) => r.event === 'claim-flag' && r.session === c.sid).map((r) => r.flags);
  const OC = '- [ ] OC-1 keep ssh open · gate: VERIFIED · status: pending · evidence: none yet\n- [ ] OC-2 second · gate: VERIFIED · status: pending · evidence: none yet';
  const OC_DONE = '- [x] OC-1 keep ssh open · gate: VERIFIED · status: met · evidence: ran it\n- [x] OC-2 second · gate: VERIFIED · status: waived · evidence: none yet';
  const CRIT = '- [ ] check one';

  // allowed sections
  let c = mk();
  let text = c.body('APPROVED', '- none', '- none', CRIT);
  approve(c, text);
  ok('audit: approval is recorded for the approved intent', Boolean(stateOf(c.sid)?.approvals?.length));
  let after = text.replace('## Plan fixes\n- none', '## Plan fixes\n- PLAN-FIX 2026-11-15 Acceptance criteria: a → b; why: typo; check: scope same, files same, level same, owner conditions same');
  edit(c, '## Plan fixes\n- none', '## Plan fixes\n- PLAN-FIX 2026-11-15 Acceptance criteria: a → b; why: typo; check: scope same, files same, level same, owner conditions same', after);
  ok('audit: an Edit inside ## Plan fixes raises no flag', flagsFor(c).length === 0, JSON.stringify(flagsFor(c)));
  text = after;
  after = text.replace('## Owner conditions\n- none', `## Owner conditions\n- [x] OC-1 x · gate: VERIFIED · status: met · evidence: e`);
  edit(c, '## Owner conditions\n- none', '## Owner conditions\n- [x] OC-1 x · gate: VERIFIED · status: met · evidence: e', after);
  ok('audit: an Edit inside ## Owner conditions raises no flag', flagsFor(c).length === 0, JSON.stringify(flagsFor(c)));
  text = after;
  after = text.replace('\ng\n', '\nchanged goal\n');
  edit(c, '\ng\n', '\nchanged goal\n', after);
  ok('audit: an Edit in ## Goal still raises intent-edited-after-approval (no plan-fix-logged)', flagsFor(c).length === 1 && flagsFor(c)[0][0] === 'intent-edited-after-approval' && flagsFor(c)[0][1] === 'Goal' && !flagsFor(c)[0].includes('plan-fix-logged'), JSON.stringify(flagsFor(c)));

  // acceptance criteria with and without a matching PLAN-FIX
  const fixLine = '- PLAN-FIX 2026-11-15 acceptance criteria: grep -c → grep -cF; why: substring; check: scope same, files same, level same, owner conditions same';
  c = mk();
  text = c.body('APPROVED', '- none', fixLine, CRIT);
  approve(c, text);
  after = text.replace('- [ ] check one', '- [ ] check one fixed');
  edit(c, '- [ ] check one', '- [ ] check one fixed', after);
  ok('audit: an Edit in ## Acceptance criteria with a matching PLAN-FIX (case-insensitive) → intent-edited-after-approval plus plan-fix-logged', flagsFor(c).length === 1 && flagsFor(c)[0].join('|') === 'intent-edited-after-approval|Acceptance criteria|plan-fix-logged', JSON.stringify(flagsFor(c)));
  c = mk();
  text = c.body('APPROVED', '- none', '- none', CRIT);
  approve(c, text);
  after = text.replace('- [ ] check one', '- [ ] check one fixed');
  edit(c, '- [ ] check one', '- [ ] check one fixed', after);
  ok('audit: the same Edit without a PLAN-FIX entry → intent-edited-after-approval only', flagsFor(c).length === 1 && flagsFor(c)[0].join('|') === 'intent-edited-after-approval|Acceptance criteria', JSON.stringify(flagsFor(c)));
  c = mk();
  text = c.body('APPROVED', '- none', '- PLAN-FIX 2026-11-15 Goal: a → b; why: x; check: same', CRIT);
  approve(c, text);
  after = text.replace('- [ ] check one', '- [ ] check one fixed');
  edit(c, '- [ ] check one', '- [ ] check one fixed', after);
  ok('audit: a PLAN-FIX for another section doesn\'t match', !flagsFor(c)[0].includes('plan-fix-logged'), JSON.stringify(flagsFor(c)));

  // owner-condition-open
  const sw = (t, from, to) => t.replace(`**Status:** ${from}`, `**Status:** ${to}`);
  c = mk();
  text = c.body('APPROVED', OC, '- none', CRIT);
  approve(c, text);
  after = sw(text, 'APPROVED', 'VERIFIED');
  edit(c, `**Status:** APPROVED\n**Repo key:** ${c.ip.key}`, `**Status:** VERIFIED\n**Repo key:** ${c.ip.key}`, after);
  let f = flagsFor(c);
  ok('audit: Status → VERIFIED with open conditions → owner-condition-open with ids only', f.length === 1 && f[0].join('|') === 'owner-condition-open|OC-1|OC-2', JSON.stringify(f));
  ok('audit: the owner-condition-open record is a claim-flag with no condition text', auditAll().filter((r) => r.session === c.sid).every((r) => r.event === 'claim-flag' && !JSON.stringify(r).includes('ssh')));
  const ev = '\n- evidence line';
  const after2 = after.replace('## Plan fixes', `## Evidence${ev}\n\n## Plan fixes`);
  edit(c, '## Plan fixes', `## Evidence${ev}\n\n## Plan fixes`, after2);
  ok('audit: a later evidence-only Edit doesn\'t re-raise owner-condition-open', flagsFor(c).length === 1, JSON.stringify(flagsFor(c)));

  c = mk();
  text = c.body('APPROVED', OC_DONE, '- none', CRIT);
  approve(c, text);
  after = sw(text, 'APPROVED', 'VERIFIED');
  edit(c, `**Status:** APPROVED\n**Repo key:** ${c.ip.key}`, `**Status:** VERIFIED\n**Repo key:** ${c.ip.key}`, after);
  ok('audit: Status → VERIFIED with every condition checked → no flag', flagsFor(c).length === 0, JSON.stringify(flagsFor(c)));

  c = mk();
  text = c.body('APPROVED', '- none', '- none', CRIT);
  approve(c, text);
  after = sw(text, 'APPROVED', 'VERIFIED');
  edit(c, `**Status:** APPROVED\n**Repo key:** ${c.ip.key}`, `**Status:** VERIFIED\n**Repo key:** ${c.ip.key}`, after);
  ok('audit: Status → VERIFIED with "- none" → no flag', flagsFor(c).length === 0, JSON.stringify(flagsFor(c)));

  c = mk();
  text = c.body('APPROVED', OC, '- none', CRIT);
  approve(c, text);
  fs.writeFileSync(c.ip.file, sw(text, 'APPROVED', 'VERIFIED'));
  rec.record({ session_id: c.sid, tool_name: 'Write', cwd: W, tool_input: { file_path: c.ip.file, content: '' } });
  ok('audit: a Write that leaves Status VERIFIED with open conditions → owner-condition-open', flagsFor(c).some((x) => x.join('|') === 'owner-condition-open|OC-1|OC-2'), JSON.stringify(flagsFor(c)));

  // Rev 2 edge cases (QA-002, QA-004, QA-005, QA-006; P2 documented behavior, D35)
  c = mk();
  const fixEarlier = '- PLAN-FIX 2026-11-14 Acceptance criteria: a → b; why: typo; check: scope same, files same, level same, owner conditions same';
  text = c.body('APPROVED', '- none', fixEarlier, CRIT);
  approve(c, text);
  after = text.replace('- [ ] check one', '- [ ] check one, second pass');
  edit(c, '- [ ] check one', '- [ ] check one, second pass', after);
  ok('audit: an earlier same-section PLAN-FIX entry matches (R2, pinned as documented behavior, not anchored to this edit)', flagsFor(c).length === 1 && flagsFor(c)[0].join('|') === 'intent-edited-after-approval|Acceptance criteria|plan-fix-logged', JSON.stringify(flagsFor(c)));

  c = mk();
  text = c.body('APPROVED', OC, '- none', CRIT);
  approve(c, text);
  fs.writeFileSync(c.ip.file, sw(text, 'APPROVED', 'VERIFIED'));
  rec.record({ session_id: c.sid, tool_name: 'Write', cwd: W, tool_input: { file_path: c.ip.file, content: '' } });
  rec.record({ session_id: c.sid, tool_name: 'Write', cwd: W, tool_input: { file_path: c.ip.file, content: '' } });
  ok('audit: a second Write re-raises owner-condition-open (P2 documented behavior: each Write that leaves VERIFIED with an open item)', flagsFor(c).filter((x) => x[0] === 'owner-condition-open').length === 2, JSON.stringify(flagsFor(c)));

  // The template mandates "- [ ]", so only that form is detected.
  c = mk();
  text = c.body('APPROVED', OC.replace(/^- \[ \]/gm, '* [ ]'), '- none', CRIT);
  approve(c, text);
  fs.writeFileSync(c.ip.file, sw(text, 'APPROVED', 'VERIFIED'));
  rec.record({ session_id: c.sid, tool_name: 'Write', cwd: W, tool_input: { file_path: c.ip.file, content: '' } });
  ok('audit: "* [ ]" is not detected as an open condition (the template mandates "- [ ]"; P2)', flagsFor(c).length === 0, JSON.stringify(flagsFor(c)));

  // intentApproval unchanged
  const t1 = c.body('APPROVED', OC, '- none', CRIT).replace('**Status:** VERIFIED', '**Status:** APPROVED');
  ok('intentApproval: still approves an intent with ## Owner conditions and the "APPROVED 2026-11-15 by user, conditions OC-1..OC-2" line', rec.intentApproval(t1)?.mode === 'subagents' && t1.includes('APPROVED 2026-11-15 by user, conditions OC-1..OC-2'));
  ok('intentApproval: PROPOSED is still not approval', rec.intentApproval(t1.replace('**Status:** APPROVED', '**Status:** PROPOSED')) === null);
  ok('allowed sections: planFixLogged / ownerConditionsOpen fail soft on bad input', rec.planFixLogged(null, 'x') === false && rec.ownerConditionsOpen(null, 'x', 'y').length === 0);
}

// ---------------------------------------------------------------- P8: level question text
{
  const q = (k) => [...L.LEVEL2, ...L.LEVEL3].find(([x]) => x === k)[1];
  ok('level text: files, auth, secrets, infra and behavior questions mention docs-only', ['files', 'auth', 'secrets', 'infra', 'behavior'].every((k) => q(k).includes('docs-only')));
  ok('level text: keys, count and TEMPLATE unchanged (15 keys, template once each, D5 order)', L.KEYS.join() === 'files,api,schema,dep,auth,secrets,infra,xservice,behavior,redesign,sensitive,proddata,multiservice,deploy,aiml' && L.TEMPLATE === L.KEYS.map((k) => `${k}=?`).join(' '));
  ok('level text: the behavior prefix and the v022 phrases are kept', /^user-visible behavior change/.test(q('behavior')) && /copy-only text changes, are n/.test(q('behavior')) && /a bug fix that restores intended behavior/.test(q('behavior')) && /files=3 means y/.test(q('files')));
  ok('level text: the all-no check is still Level 1 and a docs-only note changes no mapping', L.levelFromAnswers(L.parseAnswers(ANS_N)) === 1 && L.levelFromAnswers(L.parseAnswers(ANS_N.replace('auth=n', 'auth=y'))) === 2);
  ok('level text: questionList carries the docs-only wording', L.questionList().includes('docs-only'));
  ok('level text: no "merely mentions" carve-out; auth, secrets and infra say "content is y" (Q1, P10)', !L.questionList().includes('merely mentions') && ['auth', 'secrets', 'infra'].every((k) => q(k).includes('content is y')));
  ok('level text: the files question names credential content (P10)', q('files').includes('no auth, secret, credential or infra content don\'t count'));
}

// ---------------------------------------------------------------- pinned strings (instruction files, task 2) and unchanged protections
{
  const SK = 'plugin/skills/deliver/SKILL.md';
  for (const s of ['## Plan fixes', 'PLAN-FIX <YYYY-MM-DD> <section>:', '## Owner conditions', 'OC-1 <owner\'s words verbatim>', 'Owner conditions:', 'APPROVED <YYYY-MM-DD> by user, conditions OC-1..OC-n', 'SEQUENTIAL same-type:', 'SMALL-FIX <YYYY-MM-DD> <file>:', 'docs-only']) {
    ok(`pinned: deliver SKILL.md contains "${s}"`, grepc(SK, s) >= 1);
  }
  for (const s of ['- **Plan fixes:**', '- **Small fixes:**', '- **Owner conditions:**', '- **Docs-only:**']) {
    ok(`pinned: principal-project-manager.md contains "${s}"`, grepc('plugin/agents/principal-project-manager.md', s) >= 1);
  }
  ok('pinned: level.mjs contains "docs-only"', grepc('plugin/hooks/lib/level.mjs', 'docs-only') >= 1);
  ok('pinned: docs/decisions.md contains "### D35."', grepc('docs/decisions.md', '### D35.') >= 1);
  ok('pinned: plugin.json contains "version": "0.2.4"', grepc('plugin/.claude-plugin/plugin.json', '"version": "0.2.4"') >= 1);
  for (const s of ['Never dispatch a fixer agent.', 'Never commit, push or tag', '**Level 3 claim reproduction:**', 'Unsure counts as yes.']) {
    ok(`unchanged: deliver SKILL.md still contains "${s}"`, grepc(SK, s) >= 1);
  }
  ok('pm: runtime-binding hunks only (the four bullets sit below "## Claude Code runtime binding")', (() => {
    const t = fs.readFileSync(path.join(P, 'agents/principal-project-manager.md'), 'utf8');
    const at = t.indexOf('## Claude Code runtime binding');
    return at > 0 && ['- **Plan fixes:**', '- **Small fixes:**', '- **Owner conditions:**', '- **Docs-only:**'].every((s) => t.indexOf(s) > at);
  })());
  const guardSrc = fs.readFileSync(path.join(H, 'guard.mjs'), 'utf8');
  ok('unchanged: riskyKinds body is intact (migration, ci, infra, auth kinds)', /export function riskyKinds[\s\S]*?kinds\.push\('migration'\)[\s\S]*?kinds\.push\('ci'\)[\s\S]*?kinds\.push\('infra'\)[\s\S]*?kinds\.push\('auth'\)[\s\S]*?return kinds;/.test(guardSrc));
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exitCode = fail ? 1 : 0;
