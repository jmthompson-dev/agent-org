// agent-org v0.2.2 tests (Phase 10, D34): the level check (answers → level), the guard's level gate, the
// level audit event, instruction text, and the Level 0 citation false block (Phase 10 C0).
// Usage: node tests/v022.test.mjs [plugin dir]. No model calls; a throwaway HOME.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process'; import { fileURLToPath, pathToFileURL } from 'node:url';
const P = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin'));
const H = path.join(P, 'hooks');
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ao-22-')));
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
const str = (a) => L.KEYS.map((k) => `${k}=${a[k]}`).join(' ');
const ANS_N = str(all('n'));
const withKey = (k, v) => str({ ...all('n'), [k]: v });

// ---------------------------------------------------------------- the mapping (pure function)
{
  ok('level: all no → Level 1', L.levelFromAnswers(L.parseAnswers(ANS_N)) === 1);
  for (const [k] of L.LEVEL2) {
    ok(`level: ${k}=y alone → Level 2`, L.levelFromAnswers(L.parseAnswers(withKey(k, 'y'))) === 2);
    ok(`level: ${k}=? (unsure) alone → Level 2`, L.levelFromAnswers(L.parseAnswers(withKey(k, '?'))) === 2);
  }
  for (const [k] of L.LEVEL3) {
    ok(`level: ${k}=y alone → Level 3`, L.levelFromAnswers(L.parseAnswers(withKey(k, 'y'))) === 3);
    ok(`level: ${k}=? (unsure) alone → Level 3`, L.levelFromAnswers(L.parseAnswers(withKey(k, '?'))) === 3);
  }
  ok('level: a Level 2 and a Level 3 trigger → Level 3', L.levelFromAnswers(L.parseAnswers(str({ ...all('n'), files: 'y', deploy: 'y' }))) === 3);
  ok('level: aliases yes/no/unsure and comma separators parse', L.levelFromAnswers(L.parseAnswers(L.KEYS.map((k) => `${k}=${k === 'api' ? 'unsure' : 'no'}`).join(', '))) === 2);
  ok('level: upper-case values parse (FILES=N …)', L.parseAnswers(ANS_N.toUpperCase()) !== null);
  ok('level: 15 keys in D5 order (9 Level 2, 6 Level 3), template has each once', L.KEYS.length === 15 && L.LEVEL2.length === 9 && L.LEVEL3.length === 6 && L.TEMPLATE.split(' ').length === 15);
  ok('level: behavior question says copy-only text changes are no', /copy-only text changes, are n/.test(L.LEVEL2.find(([k]) => k === 'behavior')[1]));
  ok('level: behavior question says a bug fix that restores intended behavior is no (Part 3 C1a)', /a bug fix that restores intended behavior/.test(L.LEVEL2.find(([k]) => k === 'behavior')[1]));
  ok('level: proddata question = moving, transforming, deleting or backfilling existing production data; nullable column with no backfill is no (Part 3 C2a)', /moving, transforming, deleting or backfilling existing production data/.test(L.LEVEL3.find(([k]) => k === 'proddata')[1]) && /new nullable column with no backfill is n/.test(L.LEVEL3.find(([k]) => k === 'proddata')[1]));
  // files=<number> (Part 3: 8 of 33 first checks answered a count)
  ok('level: files=0, files=1, files=2 → n (Level 1)', [0, 1, 2].every((n) => L.levelFromAnswers(L.parseAnswers(withKey('files', String(n)))) === 1));
  ok('level: files=3 and files=12 → y (Level 2)', [3, 12].every((n) => L.levelFromAnswers(L.parseAnswers(withKey('files', String(n)))) === 2));
  ok('level: a count is only accepted for files (api=3 → malformed); negative or huge counts → malformed', L.parseAnswers(withKey('api', '3')) === null && L.parseAnswers(withKey('files', '-1')) === null && L.parseAnswers(withKey('files', '1234567')) === null);
  ok('level: files=3 audits as a boolean, not the count', L.answerFlags(L.parseAnswers(withKey('files', '3'))).answers.files === true);
  // malformed or missing
  const bad = {
    'missing key': L.KEYS.slice(1).map((k) => `${k}=n`).join(' '),
    'unknown key': `${ANS_N} extra=n`,
    'duplicate key': `${ANS_N} files=y`,
    'bad value': withKey('api', 'maybe'),
    'empty value': withKey('api', ''),
    'stray token': `${ANS_N} hello`,
    'empty string': '',
    'template unfilled is fine but "?" only': null,
  };
  for (const [name, text] of Object.entries(bad)) {
    if (text === null) continue;
    ok(`level: malformed (${name}) → null`, L.parseAnswers(text) === null && L.levelFromAnswers(L.parseAnswers(text)) === null);
  }
  ok('level: the unfilled template (all ?) is well-formed and maps to Level 3', L.levelFromAnswers(L.parseAnswers(L.TEMPLATE)) === 3);
  ok('level: non-string and over-long input → null', L.parseAnswers(42) === null && L.parseAnswers(`${ANS_N} ${'x'.repeat(1000)}`) === null);
  ok('level: levelFromAnswers(null / missing key / bad value) → null', L.levelFromAnswers(null) === null && L.levelFromAnswers({ files: 'n' }) === null && L.levelFromAnswers({ ...all('n'), api: 'x' }) === null);
  ok('level: D4 raise never lowers (raise(3,1)=3, raise(1,2)=2, raise(null,2)=2)', L.raise(3, 1) === 3 && L.raise(1, 2) === 2 && L.raise(null, 2) === 2);
  const f = L.answerFlags(L.parseAnswers(str({ ...all('n'), api: 'y', behavior: '?' })));
  ok('level: answerFlags gives booleans only (yes and unsure → true; unsure listed)', Object.values(f.answers).every((v) => typeof v === 'boolean') && f.answers.api && f.answers.behavior && !f.answers.files && f.unsure.behavior === true && Object.keys(f.unsure).length === 1);
}

// ---------------------------------------------------------------- levelCheckCall: the one command shape the guard allows
{
  const S = G.RECORD_SCRIPT;
  const good = `node "${S}" --level-check "${ANS_N}"`;
  ok('call: exact command → answers, source checklist', G.levelCheckCall(good)?.source === 'checklist');
  ok('call: --source deliver and --source pm accepted', G.levelCheckCall(`${good} --source deliver`)?.source === 'deliver' && G.levelCheckCall(`${good} --source pm`)?.source === 'pm');
  ok('call: unquoted script path accepted', G.levelCheckCall(`node ${S} --level-check "${ANS_N}"`) !== null);
  const rejects = {
    'chained command': `${good}; rm -rf x`,
    'and-chain': `${good} && echo hi`,
    'pipe': `${good} | cat`,
    'redirect': `${good} > /tmp/x`,
    'substitution': `node "${S}" --level-check "$(cat x)"`,
    'backticks': `node "${S}" --level-check "\`id\`"`,
    'newline': `${good}\nrm x`,
    'another record.mjs': `node "/tmp/x/hooks/record.mjs" --level-check "${ANS_N}"`,
    'malformed answers': `node "${S}" --level-check "files=n"`,
    'bad source': `${good} --source floor`,
    'extra argument': `${good} --source pm extra`,
    'not node': `python "${S}" --level-check "${ANS_N}"`,
    'other flag': `node "${S}" --intent-path "${ANS_N}"`,
    'env prefix': `FOO=1 node "${S}" --level-check "${ANS_N}"`,
    'NODE_OPTIONS prefix': `NODE_OPTIONS=--require=/tmp/x.js node "${S}" --level-check "${ANS_N}"`,
    'env wrapper': `env node "${S}" --level-check "${ANS_N}"`,
  };
  for (const [name, cmd] of Object.entries(rejects)) ok(`call: rejects ${name}`, G.levelCheckCall(cmd) === null);
  // Part 3: a check chained with other commands is denied ("run it as its own call"); a plain call with bad answers isn't.
  const chained = {
    '--source deliver; git rev-parse HEAD (Part 3, 11 jobs)': `${good} --source deliver; git rev-parse HEAD`,
    'cd … && check': `cd /tmp && ${good}`,
    'check && echo': `${good} && echo hi`,
    'pipe': `${good} | cat`,
    'redirect 2>&1': `${good} 2>&1`,
    'env prefix': `FOO=1 ${good}`,
    'env wrapper': `env ${good}`,
  };
  for (const [name, cmd] of Object.entries(chained)) ok(`chained: ${name} → chained`, G.chainedLevelCheck(cmd) === true);
  ok('chained: the exact call is not chained', G.chainedLevelCheck(good) === false);
  ok('chained: a plain call with malformed answers is not chained (the CLI prints the questions)', G.chainedLevelCheck(`node "${S}" --level-check "files=n"`) === false);
  ok('chained: grepping for --level-check is not a check', G.chainedLevelCheck('grep -n -- --level-check plugin/hooks/guard.mjs') === false && G.chainedLevelCheck('rg "--level-check" docs; ls') === false);
}

// ---------------------------------------------------------------- the guard, end to end (real hook process, state and audit)
{
  resetHome();
  const W = gitRepo(path.join(TMP, 'w', 'app'));
  const O = gitRepo(path.join(TMP, 'o', 'other'));
  const SCR = path.join(TMP, 'scratch'); fs.mkdirSync(SCR, { recursive: true });
  const sid = 'lv-1';
  const edit = (pid, file, extra = {}) => run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: sid, prompt_id: pid, cwd: W, tool_name: 'Edit', tool_input: { file_path: file, old_string: 'a', new_string: 'b' }, tool_use_id: `t-${Math.random()}`, ...extra });
  const check = (pid, answers, extra = '', payload = {}) => run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: sid, prompt_id: pid, cwd: W, tool_name: 'Bash', tool_input: { command: `node "${G.RECORD_SCRIPT}" --level-check "${answers}"${extra}` }, tool_use_id: 'tc', ...payload });
  const levelEvents = (pid) => auditAll().filter((r) => r.event === 'level' && r.prompt === pid);
  const src = (n) => path.join(W, 'src', `${n}.js`);

  let r = edit('p1', src('a'));
  ok('gate: first edit with no level check → deny', decisionOf(r) === 'deny' && /no level check/.test(reasonOf(r)), r.out);
  ok('gate: the deny names the exact command and the questions', reasonOf(r).includes(`--level-check "${L.TEMPLATE}"`) && reasonOf(r).includes('behavior = user-visible behavior change'));
  ok('gate: missing check audited guard-deny ["level-check-missing"], no text', auditAll().some((x) => x.event === 'guard-deny' && x.flags[0] === 'level-check-missing' && x.prompt === 'p1'));
  r = check('p1', ANS_N);
  ok('check: the level-check call → allow (the only allow)', decisionOf(r) === 'allow', r.out);
  ok('check: state records Level 1 for prompt p1, source checklist', stateOf(sid)?.levels?.p1?.level === 1 && stateOf(sid).levels.p1.source === 'checklist');
  const ev = levelEvents('p1');
  ok('audit: one level event, level 1, source checklist, answers as booleans', ev.length === 1 && ev[0].level === 1 && ev[0].source === 'checklist' && Object.keys(ev[0].answers).length === 15 && Object.values(ev[0].answers).every((v) => v === false), JSON.stringify(ev));
  ok('audit: the level event carries no text (only keys, booleans, numbers and ids)', ev.every((x) => !JSON.stringify(x).includes('--level-check') && !JSON.stringify(x).includes('record.mjs')));
  ok('gate: Level 1, file 1 → no decision', decisionOf(edit('p1', src('a'))) === 'none');
  ok('gate: same file again → no decision', decisionOf(edit('p1', src('a'))) === 'none');
  ok('gate: file 2 → no decision', decisionOf(edit('p1', src('b'))) === 'none');
  ok('state: files counted per request (p1: 2 files)', (stateOf(sid)?.reqFiles?.p1?.[repo.repoId(W).key] || []).length === 2);
  r = edit('p1', src('c'));
  ok('floor: file 3 of the request → deny (more than 2 files is Level 2)', decisionOf(r) === 'deny' && /file 3 of this request/.test(reasonOf(r)), r.out);
  ok('floor: the request is raised to Level 2 (state) and audited level/floor', stateOf(sid).levels.p1.level === 2 && levelEvents('p1').some((x) => x.source === 'floor' && x.level === 2 && x.floor[0] === 'files'));
  r = edit('p1', src('a'));
  ok('gate: after the floor, even an already-edited file → deny "load agent-org:deliver"', decisionOf(r) === 'deny' && /Level 2/.test(reasonOf(r)) && /agent-org:deliver/.test(reasonOf(r)));
  r = check('p1', ANS_N);
  ok('D4: a later all-no check can\'t lower the request (still Level 2, no new event)', decisionOf(r) === 'allow' && stateOf(sid).levels.p1.level === 2 && levelEvents('p1').length === 2);
  ok('D4: and the edit stays denied', decisionOf(edit('p1', src('a'))) === 'deny');
  // per request: a new prompt starts a new count and needs a new check
  ok('per request: a new prompt_id needs its own check', /no level check/.test(reasonOf(edit('p2', src('a')))));
  check('p2', ANS_N);
  ok('per request: p2 starts its own file count (file 1 → no decision)', decisionOf(edit('p2', src('x'))) === 'none');
  // unsure counts as yes
  r = check('p3', withKey('behavior', '?'));
  ok('check: behavior=? → Level 2 recorded, unsure flagged in the audit', stateOf(sid).levels.p3.level === 2 && levelEvents('p3')[0].unsure.behavior === true && levelEvents('p3')[0].answers.behavior === true);
  r = edit('p3', src('a'));
  ok('gate: Level 2 check → deny naming the trigger', decisionOf(r) === 'deny' && /Level 2 \(level check: behavior\)/.test(reasonOf(r)), reasonOf(r));
  check('p4', withKey('deploy', 'y'));
  ok('gate: Level 3 check → deny "Level 3"', /Level 3/.test(reasonOf(edit('p4', src('a')))));
  check('p5', withKey('files', 'y')); check('p5', withKey('redesign', 'y'), ' --source pm');
  r = check('p10', ANS_N, ' --source deliver; git rev-parse HEAD');
  ok('chained: a chained check → deny "run the level check as its own call", nothing recorded, audited level-check-shape', decisionOf(r) === 'deny' && /as its own call/.test(reasonOf(r)) && !stateOf(sid).levels.p10 && auditAll().some((x) => x.event === 'guard-deny' && x.flags[0] === 'level-check-shape' && x.prompt === 'p10'), r.out);
  ok('chained: after it, the same check on its own is allowed and recorded', decisionOf(check('p10', ANS_N, ' --source deliver')) === 'allow' && stateOf(sid).levels.p10.source === 'deliver');
  ok('chained: specialists running a chained check get no deny from this rule', decisionOf(check('p11', ANS_N, '; ls', { agent_id: 'ad1', agent_type: 'agent-org:full-stack-developer' })) === 'none');
  ok('check: --source pm raises 2 → 3, audited with source pm', stateOf(sid).levels.p5.level === 3 && levelEvents('p5').map((x) => `${x.level}/${x.source}`).join(',') === '2/checklist,3/pm');
  // risky path at Level 1
  check('p6', ANS_N);
  fs.mkdirSync(path.join(W, 'db', 'migrations'), { recursive: true });
  r = edit('p6', path.join(W, 'db', 'migrations', '002_x.sql'));
  ok('floor: migration path at Level 1 → deny (schema answered no), raised to Level 2', decisionOf(r) === 'deny' && /schema/.test(reasonOf(r)) && stateOf(sid).levels.p6.level === 2 && levelEvents('p6').some((x) => x.source === 'floor' && x.floor[0] === 'migration'), reasonOf(r));
  check('p7', ANS_N);
  ok('floor: auth path at Level 1 → deny', decisionOf(edit('p7', path.join(W, 'src', 'auth', 'k.js'))) === 'deny');
  // exemptions
  ok('exempt: an intent file under ~/.agent-org/intents/ needs no check', decisionOf(edit('p8', path.join(HOME, '.agent-org', 'intents', 'k', 'new.md'))) === 'none');
  ok('exempt: the scratchpad needs no check', decisionOf(edit('p8', path.join(SCR, 'n.md'), { scratchpad_dir: SCR })) === 'none');
  ok('exempt: another repo needs no check (first edit → no decision)', decisionOf(edit('p8', path.join(O, 'src', 'a.js'))) === 'none');
  for (const n of ['b', 'c', 'd']) run('record.mjs', { hook_event_name: 'PostToolUse', session_id: sid, prompt_id: 'p8', cwd: W, tool_name: 'Edit', tool_input: { file_path: path.join(O, 'src', `${n}.js`) } });
  ok('exempt: another repo keeps the D28 session ask (4th file → ask)', decisionOf(edit('p8', path.join(O, 'src', 'e.js'))) === 'ask');
  ok('no prompt_id: legacy D28 (first edit → no decision)', decisionOf(run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: 'lv-np', cwd: W, tool_name: 'Edit', tool_input: { file_path: src('a') } })) === 'none');
  ok('specialists are not gated (agent-org developer edit, no check)', decisionOf(edit('p9', src('a'), { agent_id: 'ad1', agent_type: 'agent-org:full-stack-developer' })) === 'none');
  ok('specialists get no allow for the level-check call', decisionOf(check('p9', ANS_N, '', { agent_id: 'ad1', agent_type: 'agent-org:full-stack-developer' })) === 'none' && !stateOf(sid).levels.p9);
  // outside git: files under the cwd are gated, files elsewhere are not
  const NG = path.join(TMP, 'nogit'); fs.mkdirSync(NG, { recursive: true });
  const ngEdit = (file) => run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: 'lv-ng', prompt_id: 'q1', cwd: NG, tool_name: 'Write', tool_input: { file_path: file, content: '' } });
  ok('outside git: a file under the cwd needs a check', decisionOf(ngEdit(path.join(NG, 'a', 'b.txt'))) === 'deny');
  ok('outside git: a file outside the cwd is exempt', decisionOf(ngEdit(path.join(TMP, 'elsewhere', 'x.txt'))) === 'none');
  // approval in this session for the repo
  const ip = rec.intentPath('level-gate', 'lv-ap', W);
  fs.mkdirSync(path.dirname(ip.file), { recursive: true });
  fs.writeFileSync(ip.file, `# Intent\n\n**Status:** APPROVED\n${ip.lines.join('\n')}\n**Level:** 2\n\n## Goal\ng\n`);
  rec.record({ session_id: 'lv-ap', tool_name: 'Write', cwd: W, tool_input: { file_path: ip.file, content: '' } });
  ok('approval: an approved intent for this repo and session → no check needed', decisionOf(run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: 'lv-ap', prompt_id: 'z1', cwd: W, tool_name: 'Edit', tool_input: { file_path: src('q') } })) === 'none');
  // fail open
  const bd = path.join(HOME, '.agent-org/state', 'lv-bad'); fs.mkdirSync(bd, { recursive: true }); fs.writeFileSync(path.join(bd, 'state.json'), '{corrupt');
  r = run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: 'lv-bad', prompt_id: 'b1', cwd: W, tool_name: 'Edit', tool_input: { file_path: src('a') } });
  ok('fail open: unreadable state → no decision, exit 0', decisionOf(r) === 'none' && r.code === 0);
  r = run('guard.mjs', 'not json');
  ok('fail open: bad payload → no output, exit 0', r.out === '' && r.code === 0);
  const perJob = ['p1', 'p2', 'p3', 'p4', 'p6', 'p7'].map((p) => levelEvents(p).filter((x) => x.source !== 'floor').length);
  ok('audit: one checklist level event per job (raises add floor/pm events only)', perJob.every((n) => n === 1), JSON.stringify(perJob));
}

// ---------------------------------------------------------------- CLI and instruction text
{
  const cli = (a) => spawnSync(process.execPath, [path.join(H, 'record.mjs'), '--level-check', ...(a === undefined ? [] : [a])], { encoding: 'utf8', env: { ...process.env, HOME } }).stdout;
  ok('cli: all no → "Level 1. Go ahead"', /Level 1\. Go ahead/.test(cli(ANS_N)));
  ok('cli: files=y → "Level 2 (files)" and load deliver', /Level 2 \(files\)/.test(cli(withKey('files', 'y'))) && /agent-org:deliver/.test(cli(withKey('files', 'y'))));
  ok('cli: aiml=? → Level 3', /Level 3 \(aiml\)/.test(cli(withKey('aiml', '?'))));
  ok('cli: malformed → the questions and the template', /malformed answers/.test(cli('files=n')) && cli('files=n').includes(L.TEMPLATE));
  ok('cli: no answers → the questions', /questions/.test(cli()));
  ok('cli: writes nothing (no state for a CLI-only call)', !fs.existsSync(path.join(HOME, '.agent-org', 'state', 'cli')));
  const ss = run('session-start.mjs', { hook_event_name: 'SessionStart', session_id: 'ss1' });
  const card = ss.json?.hookSpecificOutput?.additionalContext || '';
  ok('rule card: the plugin root is filled in and the command is the guard\'s exact shape', card.includes(`node "${path.dirname(H)}/hooks/record.mjs" --level-check "${L.TEMPLATE}"`) && !card.includes('{{AGENT_ORG_ROOT}}'));
  const raw = fs.readFileSync(path.join(H, 'rule-card.md'), 'utf8');
  const words = raw.split(/\s+/).filter(Boolean).length;
  ok(`rule card: ${words} words (≤ 195), no "Plan:" rule, copy-only edits are Level 1, unsure counts as yes`, words <= 195 && !raw.includes('Plan:') && /copy-only edits and bug fixes restoring intended behavior too/.test(raw) && /production data migration \(moving, transforming, deleting or backfilling existing data\)/.test(raw) && /unsure counts as yes/.test(raw) && /what the user can do or the system returns/.test(raw));
  const nudge = run('escalate.mjs', { prompt: 'add a schema migration' }).json?.hookSpecificOutput?.additionalContext || '';
  ok('escalate: the nudge points at the level check', /level check before any file edit/.test(nudge) && /unsure counts as yes/.test(nudge));
  const deliver = fs.readFileSync(path.join(P, 'skills/deliver/SKILL.md'), 'utf8');
  ok('deliver: step 1 classifies with the level check, --source deliver when missing', /1\. \*\*Classify\*\* with this request's level check/.test(deliver) && deliver.includes('--source deliver'));
  ok('deliver: a PM raise is re-checked with --source pm; never lower (D4)', deliver.includes('--source pm') && /never lower it below your check/.test(deliver));
  ok('deliver: table L1 "no more than 2 files … copy-only", L2 behavior defined', /no more than 2 files, no trigger hit; copy-only text changes and bug fixes that restore intended behavior are Level 1/.test(deliver) && /a change to what the user can do or what the system returns, beyond restoring intended behavior/.test(deliver) && /moving, transforming, deleting or backfilling existing production data/.test(deliver));
  ok('deliver: step 1 says run the check as its own call', /as its own Bash call with nothing chained/.test(deliver));
  const pm = fs.readFileSync(path.join(P, 'agents/principal-project-manager.md'), 'utf8');
  ok('PM binding: the main thread\'s level check sets the floor', /triggers and the main thread's level check set the floor/.test(pm));
  const pj = JSON.parse(fs.readFileSync(path.join(P, '.claude-plugin/plugin.json'), 'utf8'));
  ok('plugin.json version 0.2.2', pj.version === '0.2.2');
}

// ---------------------------------------------------------------- Phase 10 C0: Grep or Read path:line pairs count as opened
{
  resetHome();
  const W = path.join(TMP, 'c0'); fs.mkdirSync(path.join(W, 'src'), { recursive: true });
  let idn = 0; let tn = 0;
  const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
  const call = (name, input, o = 'ok', isError = false) => { const id = `toolu_${++idn}`; return [{ type: 'assistant', cwd: W, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } }, { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: o }] } }]; };
  const T = (entries) => { const sid = `c0-${++tn}`; const file = path.join(TMP, `${sid}.jsonl`); fs.writeFileSync(file, entries.flat().map((e) => JSON.stringify(e)).join('\n') + '\n'); return { sid, file }; };
  const stop = (t, text) => run('claim-check.mjs', { hook_event_name: 'Stop', session_id: t.sid, transcript_path: t.file, cwd: W, stop_hook_active: false, last_assistant_message: text });
  const cited = (r) => Boolean(r.json && /citation check/.test(JSON.stringify(r.json)));
  // The probe case, as run C0-1 made it (b-C0-1, session 2a875c0f): two single-file Greps, then an answer.
  const notesOut = "1-import * as store from './store.js';\n2-import { slugify } from './slug.js';\n13-\n14:export function listNotes() {\n15-  return store.all();\n16-}";
  const storeOut = '1-// In-memory store mirroring db/schema.sql.\n2-const rows = [];\n3-let nextId = 1;\n4-\n5:export function all() { return rows.slice(); }';
  const c0 = [user('What does `listNotes` in src/notes.js return when there are no notes?'),
    call('Grep', { pattern: 'listNotes', path: 'src/notes.js', output_mode: 'content', '-C': 15 }, notesOut),
    call('Grep', { pattern: 'export function all', path: 'src/store.js', output_mode: 'content', '-C': 8 }, storeOut)];
  const answer = 'When there are no notes, `listNotes` returns an empty array, `[]`.\n\n`listNotes` (`src/notes.js:14-16`) returns `store.all()`. That function (`src/store.js:5`) returns `rows.slice()`, a shallow copy of the in-memory `rows` array. `rows` starts as `[]` (`src/store.js:2`).';
  ok('C0: citations of lines seen in single-file Grep output → no block (Phase 10 probe case)', !cited(stop(T(c0), answer)), JSON.stringify(stop(T(c0), answer).json));
  ok('C0 control: a file never opened or grepped (src/slug.js:3) still blocks', cited(stop(T(c0), `${answer} Slugs come from src/slug.js:3.`)));
  ok('C0 control: a failed Grep doesn\'t count', cited(stop(T([user('q'), call('Grep', { pattern: 'x', path: 'src/notes.js', output_mode: 'content' }, '14:x', true)]), 'See src/notes.js:14.')));
  ok('C0 control: a files_with_matches Grep (no numbered lines) doesn\'t open its path', cited(stop(T([user('q'), call('Grep', { pattern: 'x', path: 'src/notes.js', output_mode: 'files_with_matches' }, 'Found 1 file')]), 'See src/notes.js:14.')));
  ok('C0: a path:line pair in Read output counts (a log naming src/server.js:13)', !cited(stop(T([user('q'), call('Read', { file_path: path.join(W, 'test.log') }, '     1\tError at src/server.js:13 in handler')]), 'The error is raised at src/server.js:13.')));
  ok('C0 control: a bare path in Read output (no :line) doesn\'t count', cited(stop(T([user('q'), call('Read', { file_path: path.join(W, 'notes.md') }, '     1\tsee src/server.js for details')]), 'See src/server.js:13.')));
  // Part 3 x1c (session 6a17f4a4): "I ran no level check and loaded no skill, as you asked." was blocked as unbacked-any.
  const blockedClaim = (r) => Boolean(r.json && /claim check/.test(JSON.stringify(r.json)));
  ok('x1c: "I ran no level check and loaded no skill, as you asked." → no block', !blockedClaim(stop(T([user('q')]), 'Three of the four writes succeeded and the fourth was blocked by the guard. I ran no level check and loaded no skill, as you asked.')));
  ok('negation: "I ran none of the tests." → no block', !blockedClaim(stop(T([user('q')]), 'I ran none of the tests.')));
  ok('negation control: "I ran the tests and they pass." with no command still blocks', blockedClaim(stop(T([user('q')]), 'I ran the tests and they pass.')));
  ok('negation control: "no errors" is still a claim ("The build finished with no errors.")', blockedClaim(stop(T([user('q')]), 'The build finished with no errors.')));
  ok('negation control: a clause after ; is judged alone ("I ran no linters; all tests pass." blocks)', blockedClaim(stop(T([user('q')]), 'I ran no linters; all tests pass.')));
  ok('C0: directory Grep with path-prefixed lines still counts (unchanged)', !cited(stop(T([user('q'), call('Grep', { pattern: 'all', path: 'src', output_mode: 'content' }, 'src/store.js:5:export function all() {}')]), 'See src/store.js:5.')));
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exitCode = fail ? 1 : 0;
