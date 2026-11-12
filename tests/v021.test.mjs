// agent-org v0.2.1 hook tests, one group per backlog item; every row is named `V21-<n> …`.
// Usage: node tests/v021.test.mjs [plugin dir]   (default: ../plugin next to this file; `node tests/run.mjs` runs all)
// Throwaway HOME, scratch git repos and piped hook payloads only: no model calls, never the real ~/.agent-org.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process'; import { fileURLToPath, pathToFileURL } from 'node:url';
const P = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin'));
const H = path.join(P, 'hooks');
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ao-21-')));
const HOME = path.join(TMP, 'home'); fs.mkdirSync(HOME);
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
delete process.env.AGENT_ORG_HOOK_DEBUG; delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS; delete process.env.CLAUDE_CODE_SESSION_ID;
let pass = 0; let fail = 0; const out = [];
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !extra ? '' : `  -- ${String(extra).slice(0, 300)}`}`); };
const run = (script, input, env = {}, args = []) => {
  const r = spawnSync(process.execPath, [path.join(H, script), ...args], { input: typeof input === 'string' ? input : JSON.stringify(input), env: { ...process.env, HOME, USERPROFILE: HOME, ...env }, encoding: 'utf8', timeout: 10000, cwd: env.CWD || process.cwd() });
  let json = null; try { json = r.stdout ? JSON.parse(r.stdout) : null; } catch { json = 'BADJSON'; }
  return { out: r.stdout, code: r.status, json };
};
const imp = (f) => import(pathToFileURL(path.join(H, f)).href);
const repo = await imp('lib/repo.mjs'); const audit = await imp('lib/audit.mjs');
const { decide, loadState } = await imp('guard.mjs'); const rec = await imp('record.mjs');
const resetHome = () => fs.rmSync(path.join(HOME, '.agent-org'), { recursive: true, force: true });
const gitRepo = (dir, remotes = {}) => { fs.mkdirSync(path.join(dir, 'src'), { recursive: true }); execFileSync('git', ['init', '-q', dir]); for (const [n, u] of Object.entries(remotes)) execFileSync('git', ['-C', dir, 'remote', 'add', n, u]); return dir; };
const auditOf = (dir) => { try { return fs.readFileSync(path.join(HOME, '.agent-org/audit', `${dir}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const allAudit = () => { try { return fs.readdirSync(path.join(HOME, '.agent-org/audit')).filter((f) => f.endsWith('.jsonl')).flatMap((f) => auditOf(f.replace(/\.jsonl$/, ''))); } catch { return []; } };
const stateOf = (sid) => { try { return JSON.parse(fs.readFileSync(path.join(HOME, '.agent-org/state', sid, 'state.json'), 'utf8')); } catch { return null; } };
const dec = (r) => (r ? r.decision : 'none');
const D = (p) => decide(p, loadState(p));

// ---------------------------------------------------------------- V21-9 repo key
{
  const forms = ['git@github.com:acme/app.git', 'https://github.com/acme/app', 'https://github.com/Acme/App.git/', 'ssh://git@github.com/acme/app.git', 'https://user@github.com/acme/app.git'];
  ok('V21-9 normalizer: the five report-07 D2 forms → github.com/acme/app', forms.every((f) => repo.normalizeRemote(f) === 'github.com/acme/app'), forms.map(repo.normalizeRemote).join(' | '));
  ok('V21-9 normalizer: host lowercased, path case kept off the caseless hosts', repo.normalizeRemote('git@Git.Corp.Example:Team/App.git') === 'git.corp.example/Team/App');
  ok('V21-9 normalizer: ssh with a port → port dropped', repo.normalizeRemote('ssh://git@host.example:2222/team/app.git') === 'host.example/team/app');
  ok('V21-9 normalizer: local path, file:// and C:\\ remotes → null (local-<hash> fallback)', ['/srv/git/app.git', 'file:///srv/git/app', 'C:\\repos\\app', '../app.git', ''].every((u) => repo.normalizeRemote(u) === null));
  const ssh = gitRepo(path.join(TMP, 'k', 'ssh', 'app'), { origin: 'git@github.com:Acme/App.git' });
  const https = gitRepo(path.join(TMP, 'k', 'https', 'app'), { origin: 'https://github.com/acme/app' });
  const a = repo.repoId(ssh); const b = repo.repoId(https);
  ok('V21-9 ssh and https clones → one key github.com/acme/app, dir github.com__acme__app', a.key === 'github.com/acme/app' && b.key === a.key && a.dir === 'github.com__acme__app', JSON.stringify([a, b]));
  ok('V21-9 display name is still the D6 basename', a.name === 'app');
  const none = gitRepo(path.join(TMP, 'k', 'none', 'app'));
  const n = repo.repoId(none);
  ok('V21-9 no remote → local-<12 hex>', /^local-[0-9a-f]{12}$/.test(n.key) && n.dir === n.key && n.remote === null, n.key);
  const fork = gitRepo(path.join(TMP, 'k', 'fork', 'app'), { upstream: 'git@github.com:acme/app.git', origin: 'git@github.com:me/app.git' });
  ok('V21-9 fork: origin wins over upstream', repo.repoId(fork).key === 'github.com/me/app');
  const two = gitRepo(path.join(TMP, 'k', 'two', 'app'), { zeta: 'git@github.com:z/app.git', beta: 'git@github.com:b/app.git' });
  ok('V21-9 no origin → the alphabetically first remote', repo.repoId(two).key === 'github.com/b/app');
  const sub = path.join(ssh, 'src', 'deep'); fs.mkdirSync(sub, { recursive: true });
  ok('V21-9 a subdirectory resolves to its repo key', repo.repoId(sub).key === 'github.com/acme/app');
  const plain = path.join(TMP, 'k', 'plain', 'app'); fs.mkdirSync(plain, { recursive: true });
  const pl = repo.repoId(plain, plain);
  ok('V21-9 outside git → local-<hash of the cwd>, name = cwd basename', /^local-/.test(pl.key) && pl.name === 'app' && pl.key !== n.key);
  const long = `example.com/${'x/'.repeat(80)}end`;
  ok('V21-9 keyDir: long keys ≤ 100 chars and distinct', repo.keyDir(long).length <= 100 && repo.keyDir(long) !== repo.keyDir(`${long}2`));
  ok('V21-9 isKeyDir: key dirs yes, D6 basenames no', repo.isKeyDir('github.com__acme__app') && repo.isKeyDir(n.dir) && !repo.isKeyDir('agent-org') && !repo.isKeyDir('app'));
  // a/app and b/app
  const A = gitRepo(path.join(TMP, 'a', 'app')); const B = gitRepo(path.join(TMP, 'b', 'app'));
  ok('V21-9 same-named repos a/app and b/app → different keys', repo.repoId(A).key !== repo.repoId(B).key && repo.repoId(A).name === repo.repoId(B).name);
  // audit by key
  resetHome();
  audit.append(repo.repoId(A), { event: 'dispatch', session: 's1' });
  audit.append(repo.repoId(B), { event: 'dispatch', session: 's2' });
  audit.append(repo.repoId(A), { event: 'result', session: 's1', outcome: 'PASS' });
  const la = auditOf(repo.repoId(A).dir); const lb = auditOf(repo.repoId(B).dir);
  ok('V21-9 audit: a/app and b/app get separate files (2 and 1 lines)', la.length === 2 && lb.length === 1);
  ok('V21-9 audit line carries repo (D6 name) and key', la[0].repo === 'app' && la[0].key === repo.repoId(A).key);
  ok('V21-9 head record at state/audit-<key dir>.head', fs.existsSync(path.join(HOME, '.agent-org/state', `audit-${repo.repoId(A).dir}.head`)));
  ok('V21-9 both chains verify (full)', audit.verify(repo.repoId(A).dir, { full: true }).ok && audit.verify(repo.repoId(B).dir, { full: true }).ok);
  // legacy file still verified
  audit.append('legacyname', { event: 'dispatch' });
  ok('V21-9 a v0.2.0 file named by D6 basename is still listed and verifies', audit.listRepos().includes('legacyname') && audit.verify('legacyname', { full: true }).ok);
  let r = run('audit-verify.mjs', '', {}, ['--repo', 'github.com/acme/app']);
  audit.append(repo.repoId(ssh), { event: 'dispatch' });
  r = run('audit-verify.mjs', '', {}, ['--repo', 'github.com/acme/app']);
  ok('V21-9 audit-verify --repo takes a key', r.code === 0 && /^OK github\.com__acme__app/m.test(r.out), r.out);
  r = run('audit-verify.mjs', '');
  ok('V21-9 audit-verify (all) → every repo OK, legacy included', r.code === 0 && r.out.includes('legacyname') && r.out.split('\n').filter(Boolean).every((x) => x.startsWith('OK')), r.out);
  r = run('session-start.mjs', '{}');
  ok('V21-9 session-start: no warning on key-named and legacy files', r.json && !r.json.systemMessage);
  // dispatch audit lands in the key file
  resetHome();
  run('record.mjs', { hook_event_name: 'PostToolUse', session_id: 'd1', cwd: ssh, tool_name: 'Agent', tool_input: { subagent_type: 'agent-org:full-stack-developer', name: 'dev' }, tool_response: { agentId: 'adev-1', status: 'teammate_spawned' } });
  ok('V21-9 record dispatch → audit file github.com__acme__app.jsonl', auditOf('github.com__acme__app').length === 1);
  ok('V21-1 record keeps the teammate name on the dispatch record', stateOf('d1').dispatch['adev-1'].name === 'dev');
  // scope keyed by key: a/app approval doesn't silence b/app
  resetHome();
}

// ---------------------------------------------------------------- V21-10 intent identity
{
  const A = path.join(TMP, 'a', 'app'); const B = path.join(TMP, 'b', 'app');
  const idA = repo.repoId(A); const idB = repo.repoId(B);
  resetHome();
  const p1 = rec.intentPath('add-login', 'sess-aaaa1111-x', A); const p2 = rec.intentPath('add-login', 'sess-bbbb2222-y', A);
  ok('V21-10 intentPath: same repo, day and slug, two sessions → two different files', p1.file !== p2.file && path.dirname(p1.file) === path.join(HOME, '.agent-org/intents', idA.dir), `${p1.file} ${p2.file}`);
  ok('V21-10 intentPath: file name <date>-<slug>-<session prefix>.md', /\/\d{4}-\d{2}-\d{2}-add-login-sessaaaa\.md$/.test(p1.file), p1.file);
  ok('V21-10 intentPath: header lines record key, top level, session', p1.lines.join('\n') === `**Repo key:** ${idA.key}\n**Top level:** ${idA.top}\n**Session:** sess-aaaa1111-x`);
  fs.mkdirSync(path.dirname(p1.file), { recursive: true }); fs.writeFileSync(p1.file, 'x');
  ok('V21-10 intentPath: same session, slug and day again → -2 suffix, never the existing file', rec.intentPath('add-login', 'sess-aaaa1111-x', A).file === p1.file.replace(/\.md$/, '-2.md'));
  ok('V21-10 intentPath: bad slug → error, nothing written', Boolean(rec.intentPath('Bad Slug', 's', A).error));
  const oldI = path.join(HOME, '.agent-org/intents', idA.dir, '2026-11-10-add-login-oldsess1.md');
  fs.mkdirSync(path.dirname(oldI), { recursive: true }); fs.writeFileSync(oldI, '# Old\n**Session:** old-session\n');
  const sp = rec.intentPath('add-login', 'new-sess-9', A, oldI);
  ok('V21-10 --supersedes: header gets a fourth line naming the old intent (no absolute path)', sp.lines.length === 4 && sp.lines[3] === `**Supersedes:** ~/.agent-org/intents/${idA.dir}/2026-11-10-add-login-oldsess1.md` && sp.file !== oldI, JSON.stringify(sp.lines));
  ok('V21-10 --supersedes: a missing file or a path outside the intents folder → error', Boolean(rec.intentPath('x', 's', A, path.join(path.dirname(oldI), 'nope.md')).error) && Boolean(rec.intentPath('x', 's', A, path.join(A, 'README.md')).error));
  let rs = run('record.mjs', '', { CLAUDE_CODE_SESSION_ID: 'cli-new-1', CWD: A }, ['--intent-path', 'add-login', '--supersedes', oldI]);
  ok('V21-10 CLI --supersedes prints the Supersedes line', rs.out.includes(`**Supersedes:** ~/.agent-org/intents/${idA.dir}/2026-11-10-add-login-oldsess1.md`), rs.out);
  fs.writeFileSync(oldI, '# Old\n\n**Status:** APPROVED\n**Session:** old-session\n');
  const gdeny = D({ session_id: 'new-sess-9', cwd: A, tool_name: 'Edit', tool_input: { file_path: oldI, old_string: 'Old', new_string: 'X' } });
  ok('V21-10 after /clear (new session id): the old intent is denied, and the reason points to --supersedes', dec(gdeny) === 'deny' && /--supersedes/.test(gdeny.reason));
  fs.rmSync(oldI);
  ok('V21-10 intentPath: no session id → random suffix, Session: unknown', /\*\*Session:\*\* unknown/.test(rec.intentPath('x', null, A).lines.join('\n')));
  let r = run('record.mjs', '', { CLAUDE_CODE_SESSION_ID: 'cli-sess-12345678', CWD: B }, ['--intent-path', 'fix-bug']);
  ok('V21-10 CLI --intent-path uses CLAUDE_CODE_SESSION_ID and the cwd repo key', r.out.includes(`/intents/${idB.dir}/`) && r.out.includes('-fix-bug-clisess1.md') && r.out.includes('**Session:** cli-sess-12345678'), r.out);
  fs.rmSync(p1.file);

  // guard: ownership
  const dir = path.join(HOME, '.agent-org/intents', idA.dir); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, '2026-11-11-add-login-sessaaaa.md');
  const body = (sess, status = 'PROPOSED', key = idA.key) => `# Add login\n\n**Status:** ${status}\n${key ? `**Repo key:** ${key}\n` : ''}**Top level:** ${A}\n${sess ? `**Session:** ${sess}\n` : ''}\n## Goal\ng\n`;
  fs.writeFileSync(f, body('sess-aaaa1111-x'));
  const W = (sid, tool = 'Write') => ({ session_id: sid, cwd: A, tool_name: tool, tool_input: { file_path: f, content: 'y', old_string: 'g', new_string: 'h' } });
  ok('V21-10 guard: Write over an intent another session owns → deny intent-owner', dec(D(W('sess-bbbb2222-y'))) === 'deny' && D(W('sess-bbbb2222-y')).rule === 'intent-owner');
  ok('V21-10 guard: Edit of an intent another session owns → deny', dec(D(W('sess-bbbb2222-y', 'Edit'))) === 'deny');
  ok('V21-10 guard: the owning session may Write and Edit it', dec(D(W('sess-aaaa1111-x'))) === 'none' && dec(D(W('sess-aaaa1111-x', 'Edit'))) === 'none');
  ok('V21-10 guard: a new intent file → none', dec(D({ session_id: 'z', cwd: A, tool_name: 'Write', tool_input: { file_path: path.join(dir, 'new.md'), content: 'x' } })) === 'none');
  const legacy = path.join(HOME, '.agent-org/intents/app'); fs.mkdirSync(legacy, { recursive: true });
  const lf = path.join(legacy, '2026-11-08-old.md'); fs.writeFileSync(lf, '# Old\n\n**Status:** APPROVED\n');
  const L = (tool) => ({ session_id: 'any', cwd: A, tool_name: tool, tool_input: { file_path: lf, content: 'y', old_string: 'Old', new_string: 'Old2' } });
  ok('V21-10 guard: Write over a v0.2.0 intent with no owner → deny intent-overwrite', dec(D(L('Write'))) === 'deny' && D(L('Write')).rule === 'intent-overwrite');
  ok('V21-10 guard: Edit of a v0.2.0 intent with no owner → allowed (old intents keep working)', dec(D(L('Edit'))) === 'none');
  fs.writeFileSync(f, body('unknown'));
  ok('V21-10 guard: owner "unknown" → treated as no owner (Write denied, Edit allowed)', dec(D(W('q'))) === 'deny' && dec(D(W('q', 'Edit'))) === 'none');
  fs.writeFileSync(f, body('sess-aaaa1111-x'));
  r = run('guard.mjs', { hook_event_name: 'PreToolUse', ...W('sess-bbbb2222-y'), tool_use_id: 'tu1' });
  ok('V21-10 guard piped: deny JSON names the other session rule and the way out', r.json && r.json.hookSpecificOutput.permissionDecision === 'deny' && /belongs to another session/.test(r.json.hookSpecificOutput.permissionDecisionReason) && /--intent-path/.test(r.json.hookSpecificOutput.permissionDecisionReason), r.out);
  const gd = auditOf(idA.dir).filter((x) => x.event === 'guard-deny');
  ok('V21-10 guard piped: audited guard-deny ["intent-owner"], no path or content', gd.length === 1 && gd[0].flags.join() === 'intent-owner' && !JSON.stringify(gd[0]).includes('add-login'), JSON.stringify(gd));
  ok('V21-10 file untouched by the denied Write', fs.readFileSync(f, 'utf8') === body('sess-aaaa1111-x'));

  // record: approval keyed by the intent's key
  resetHome(); fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(legacy, { recursive: true });
  const R = (sid, file, cwd = A, tool = 'Write') => rec.record({ session_id: sid, cwd, tool_name: tool, tool_input: { file_path: file, content: '', old_string: 'x', new_string: '**Status:** APPROVED' } });
  fs.writeFileSync(f, body('s1', 'APPROVED'));
  R('s1', f);
  let ap = stateOf('s1').approvals;
  ok('V21-10 record: APPROVED intent with matching Repo key → approval keyed by the full key', ap.length === 1 && ap[0].repo === idA.key && ap[0].intent === `${idA.dir}/2026-11-11-add-login-sessaaaa.md`, JSON.stringify(ap));
  fs.writeFileSync(f, body('s2', 'APPROVED', idB.key));
  R('s2', f);
  ok('V21-10 record: Repo key that does not match the folder → no approval', (stateOf('s2') || { approvals: [] }).approvals.length === 0);
  fs.writeFileSync(f, body('s3', 'APPROVED', null));
  R('s3', f);
  ok('V21-10 record: v0.2.1 intent without a Repo key line → no approval', (stateOf('s3') || { approvals: [] }).approvals.length === 0);
  fs.writeFileSync(lf, '# Old\n\n**Status:** APPROVED\n');
  R('s4', lf, A);
  ok('V21-10 record: v0.2.0 intent (folder = basename), even in a repo with that basename → never approves', (stateOf('s4') || { approvals: [] }).approvals.length === 0);
  R('s4', lf, A, 'Edit');
  ok('V21-10 record: v0.2.0 intent edited → still no approval, and it stays readable', (stateOf('s4') || { approvals: [] }).approvals.length === 0 && fs.readFileSync(lf, 'utf8').includes('APPROVED'));
  const other = gitRepo(path.join(TMP, 'c', 'web'));
  R('s5', lf, other);
  ok('V21-10 record: v0.2.0 intent from a repo with a different basename → no approval', (stateOf('s5') || { approvals: [] }).approvals.length === 0);
  // the Phase 9 residual, closed: S2 in b/app edits a v0.2.0 intent approved from a/app
  for (const x of ['k1', 'k2', 'k3']) rec.record({ session_id: 's6', tool_name: 'Edit', cwd: B, tool_input: { file_path: path.join(B, 'src', `${x}.js`) } });
  rec.record({ session_id: 's6', tool_name: 'Edit', cwd: B, tool_input: { file_path: lf, old_string: 'Old', new_string: 'Old' } });
  ok('V21-10 cross-repo: a v0.2.0 intent gives a same-named repo no approval (4th edit in b/app asks)', dec(D({ session_id: 's6', tool_name: 'Edit', cwd: B, tool_input: { file_path: path.join(B, 'src', 'k4.js') } })) === 'ask');

  // Phase 9 live finding: a status Edit that carries the unchanged `**Repo key:**` line isn't intent-edited-after-approval
  resetHome(); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(f, `${body('s7', 'APPROVED')}\n## Approval log\n- a\n`);
  R('s7', f);
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('**Status:** APPROVED', '**Status:** IMPLEMENTED'));
  rec.record({ session_id: 's7', cwd: A, tool_name: 'Edit', tool_input: { file_path: f, old_string: '**Status:** APPROVED\n**Repo key:**', new_string: '**Status:** IMPLEMENTED\n**Repo key:**' } });
  const fl = () => auditOf(idA.dir).filter((x) => (x.flags || []).includes('intent-edited-after-approval'));
  ok('V21-10 status Edit carrying the unchanged **Repo key:** line (r1, Phase 9) → no intent-edited-after-approval flag', fl().length === 0, JSON.stringify(fl()));
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('\ng\n', '\ng2\n'));
  rec.record({ session_id: 's7', cwd: A, tool_name: 'Edit', tool_input: { file_path: f, old_string: '## Goal\ng\n', new_string: '## Goal\ng2\n' } });
  ok('V21-10 control: a Goal edit after approval is still flagged', fl().length === 1 && fl()[0].flags[1] === 'Goal', JSON.stringify(fl()));

  // cross-repo, end to end: the Phase 9 xrepo scenario on v0.2.1
  resetHome(); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(f, body('S1', 'APPROVED'));
  rec.record({ session_id: 'S1', tool_name: 'Write', cwd: A, tool_input: { file_path: f, content: '' } });
  for (const x of ['f1', 'f2', 'f3']) rec.record({ session_id: 'S1', tool_name: 'Edit', cwd: A, tool_input: { file_path: path.join(B, 'src', `${x}.js`) } });
  ok('V21-10 cross-repo: approval from a/app no longer silences the scope guard in b/app (same session)', dec(D({ session_id: 'S1', tool_name: 'Edit', cwd: A, tool_input: { file_path: path.join(B, 'src', 'f4.js') } })) === 'ask');
  for (const x of ['f1', 'f2', 'f3']) rec.record({ session_id: 'S1', tool_name: 'Edit', cwd: A, tool_input: { file_path: path.join(A, 'src', `${x}.js`) } });
  ok('V21-10 cross-repo control: the same approval still covers a/app', dec(D({ session_id: 'S1', tool_name: 'Edit', cwd: A, tool_input: { file_path: path.join(A, 'src', 'f4.js') } })) === 'none');
  ok('V21-10 cross-repo: session S2 in b/app may not edit a/app\'s intent (owned by S1)', dec(D({ session_id: 'S2', tool_name: 'Edit', cwd: B, tool_input: { file_path: f, old_string: 'g', new_string: 'h' } })) === 'deny');
  rec.record({ session_id: 'S2', tool_name: 'Edit', cwd: B, tool_input: { file_path: f, old_string: 'g', new_string: 'h' } }); // even if it ran
  for (const x of ['g1', 'g2', 'g3']) rec.record({ session_id: 'S2', tool_name: 'Edit', cwd: B, tool_input: { file_path: path.join(B, 'src', `${x}.js`) } });
  ok('V21-10 cross-repo: and even a recorded edit of it gives b/app no approval (key is a/app\'s)', dec(D({ session_id: 'S2', tool_name: 'Edit', cwd: B, tool_input: { file_path: path.join(B, 'src', 'g4.js') } })) === 'ask');
  // team gate keyed too
  const AG = (sid, cwd) => ({ session_id: sid, cwd, tool_name: 'Agent', tool_input: { subagent_type: 'agent-org:full-stack-developer', name: 'dev' } });
  fs.writeFileSync(f, body('T1', 'APPROVED').replace('## Goal', '**Mode:** team (group A) — hand-off: h; why: w\n## Goal'));
  rec.record({ session_id: 'T1', tool_name: 'Write', cwd: A, tool_input: { file_path: f, content: '' } });
  ok('V21-10 team gate: Mode team approved in a/app → named dispatch allowed in a/app, denied from b/app', dec(D(AG('T1', A))) === 'none' && dec(D(AG('T1', B))) === 'deny');
}

// ---------------------------------------------------------------- V21-2 guard-deny audit lines
{
  resetHome();
  const A = path.join(TMP, 'a', 'app'); const idA = repo.repoId(A);
  let r = run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: 'g1', cwd: A, tool_name: 'Bash', tool_input: { command: 'git push origin ZQXMARK' }, agent_type: 'agent-org:full-stack-developer', agent_id: 'adev', tool_use_id: 'tu-push' });
  let l = auditOf(idA.dir);
  ok('V21-2 specialist git push → deny', r.json && r.json.hookSpecificOutput.permissionDecision === 'deny');
  ok('V21-2 specialist ask-list deny → audit guard-deny ["specialist-ask-list","git push"] with agent_id, agent_type', l.length === 1 && l[0].event === 'guard-deny' && l[0].flags.join() === 'specialist-ask-list,git push' && l[0].agent_id === 'adev' && l[0].agent_type === 'agent-org:full-stack-developer' && l[0].tool_use_id === 'tu-push', JSON.stringify(l));
  ok('V21-2 the audit line holds no command text', !JSON.stringify(l).includes('ZQXMARK') && !JSON.stringify(l).includes('origin'));
  r = run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: 'g1', cwd: A, tool_name: 'Edit', tool_input: { file_path: 'src/ZQXMARK.js' }, agent_type: 'agent-org:quality-assurance-architect', agent_id: 'aqa' });
  l = auditOf(idA.dir);
  ok('V21-2 QA Edit of src/ → deny', r.json && r.json.hookSpecificOutput.permissionDecision === 'deny');
  ok('V21-2 QA path deny → audit guard-deny ["qa-test-paths-only"], no path', l.length === 2 && l[1].flags.join() === 'qa-test-paths-only' && l[1].agent_id === 'aqa' && !JSON.stringify(l[1]).includes('ZQXMARK'), JSON.stringify(l[1]));
  r = run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: 'g1', cwd: A, tool_name: 'Edit', tool_input: { file_path: 'test/a.test.js' }, agent_type: 'agent-org:quality-assurance-architect', agent_id: 'aqa' });
  ok('V21-2 QA Edit of a test path → no output, no audit line', !r.out && auditOf(idA.dir).length === 2);
  r = run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: 'g1', cwd: A, tool_name: 'Bash', tool_input: { command: 'git push' } });
  ok('V21-2 main thread git push → ask, no guard-deny line', r.json && r.json.hookSpecificOutput.permissionDecision === 'ask' && auditOf(idA.dir).length === 2);
  r = run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: 'g1', cwd: A, tool_name: 'Bash', tool_input: { command: 'kubectl apply -f x.yaml && git tag v1' }, agent_type: 'agent-org:devops-engineer', agent_id: 'aops' });
  l = auditOf(idA.dir);
  ok('V21-2 two patterns in one command → one line naming both', l.length === 3 && l[2].flags[0] === 'specialist-ask-list' && /kubectl apply/.test(l[2].flags[1]) && /git tag/.test(l[2].flags[1]), JSON.stringify(l[2]));
  ok('V21-2 the chain still verifies after guard-deny appends', audit.verify(idA.dir, { full: true }).ok);
}

// ---------------------------------------------------------------- V21-1 claim check
{
  resetHome();
  const W = path.join(TMP, 'a', 'app');
  let idn = 0; let tn = 0;
  const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
  const call = (name, input, isError = false, o = 'ok') => { const id = `toolu_${++idn}`; return [{ type: 'assistant', cwd: W, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } }, { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: o }] } }]; };
  const tm = (name, body) => user(`Another Claude session sent a message:\n<teammate-message teammate_id="${name}" color="blue">\n${body}\n</teammate-message>\n\nThis came from another Claude session.`);
  const idle = (name, result) => tm(name, JSON.stringify({ type: 'idle_notification', from: name, result }));
  const T = (entries) => { const sid = `c-${++tn}`; const dir = path.join(TMP, 'proj'); fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, `${sid}.jsonl`); fs.writeFileSync(file, entries.flat().map((e) => JSON.stringify(e)).join('\n') + '\n'); return { sid, file }; };
  const stop = (t, text) => run('claim-check.mjs', { hook_event_name: 'Stop', session_id: t.sid, transcript_path: t.file, cwd: W, stop_hook_active: false, last_assistant_message: text });
  const blocked = (r) => Boolean(r.json && r.json.hookSpecificOutput && /claim check/.test(r.json.hookSpecificOutput.additionalContext || ''));
  const q = () => T([user('q')]);
  const writeState = (sid, s) => { const d = path.join(HOME, '.agent-org/state', sid); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({ approvals: [], scope: {}, dispatch: {}, finished: {}, riskySeen: {}, ...s })); };

  ok('V21-1b "none of which I\'ve verified yet" → no block', !blocked(stop(q(), "Here's what it says happened, none of which I've verified yet:")));
  ok('V21-1b "The fix is not yet verified." → no block', !blocked(stop(q(), 'The fix is not yet verified.')));
  ok('V21-1c "The verified fix stays in the working tree." → no block', !blocked(stop(q(), 'The verified fix stays in the working tree, uncommitted.')));
  ok('V21-1c control: "I verified the fix." with no tool call → block', blocked(stop(q(), 'I verified the fix.')));
  ok('V21-1c control: "The fix is verified and the verified build is ready." → block (one non-adjective use)', blocked(stop(q(), 'The fix is verified and the verified build is ready.')));
  ok('V21-1d "The plan is marked VERIFIED." → no block', !blocked(stop(q(), 'The plan is marked VERIFIED.')));
  ok('V21-1d "**Status:** VERIFIED" line → no block', !blocked(stop(q(), 'Saved.\n**Status:** VERIFIED')));
  ok('V21-1d "Status: tests pass" → no block (status sentence)', !blocked(stop(q(), 'Status: tests pass.')));
  ok('V21-1e "- **Goal:** … fix it so the tests pass on every run." → no block', !blocked(stop(q(), '- **Goal:** prove why it fails intermittently, then fix it so the tests pass on every run.')));
  ok('V21-1e "Change the clock so that all tests pass." → no block', !blocked(stop(q(), 'Change the clock so that all tests pass.')));
  ok('V21-1e "The plan is to make the tests pass." → no block', !blocked(stop(q(), 'The plan is to make the tests pass.')));
  ok('V21-1e control: "Fixed the clock; tests pass." → block', blocked(stop(q(), 'Fixed the clock; tests pass.')));
  ok('V21-1 label: "- **Likely cause (from reading the code, not run yet):** … The second test passes only because …" → no block', !blocked(stop(q(), '- **Likely cause (from reading the code, not run yet):** expiry is rounded down. The second test passes only because its sleep always crosses a second boundary.')));
  ok('V21-1 label control: "- **Result:** The second test passes." → block', blocked(stop(q(), '- **Result:** The second test passes.')));
  ok('V21-1 label control: the label only covers its own line', blocked(stop(q(), '- **Likely cause (not run yet):** rounding.\nThe second test passes.')));

  // (a) teammates
  let t = T([user('go'), idle('cache-qa', 'Outcome: BLOCKED (interim)\n- Test 2 passed every time. That matches the roughly 50% prediction.')]);
  ok('V21-1a teammate idle report "Test 2 passed every time." relayed as "The other test passed every time." → no block', !blocked(stop(t, 'The other test passed every time.')));
  t = T([user('go'), idle('cache-qa', 'Outcome: FAIL\n- The other test did not pass every time.')]);
  ok('V21-1a control: teammate said it did NOT pass → relay blocks', blocked(stop(t, 'The other test passed every time.')));
  t = T([user('go'), tm('cache-dev', 'Tests: 18 of 18 pass on the current tree.')]);
  ok('V21-1a plain teammate message, teammate not finished → block', blocked(stop(t, 'cache-dev reports: tests pass')));
  writeState(t.sid, { dispatch: { 'acache-dev-1': { agentType: 'agent-org:full-stack-developer', teammate: true, name: 'cache-dev' } }, finished: { 'acache-dev-1': 't' } });
  ok('V21-1a plain teammate message, teammate finished (dispatch name) → no block', !blocked(stop(t, 'cache-dev reports: tests pass')));
  const t2 = T([user('go'), tm('cache-dev', 'Tests: 18 of 18 pass on the current tree.')]);
  writeState(t2.sid, { dispatch: { 'acache-dev-767c83e44814db14': { agentType: 'agent-org:full-stack-developer', teammate: true } }, finished: { 'acache-dev-767c83e44814db14': 't' } });
  ok('V21-1a plain teammate message, finished agent found by its a<name>-<hex> id (no name recorded) → no block', !blocked(stop(t2, 'cache-dev reports: tests pass')));
  t = T([user('go'), tm('cache-dev', JSON.stringify({ type: 'shutdown_request', reason: 'Tests pass.' }))]);
  ok('V21-1a protocol JSON with no result → not a relay source (block)', blocked(stop(t, 'Tests pass.')));
  t = T([user('go'), idle('cache-qa', 'Outcome: PASS\n3 tests pass.')]);
  ok('V21-1 filler words never include scope words: "all tests pass" vs "3 tests pass" → block', blocked(stop(t, 'cache-qa reports: all tests pass.')));
  ok('V21-1 relay by subset still works: "cache-qa reports: tests pass" vs "3 tests pass" → no block', !blocked(stop(t, 'cache-qa reports: tests pass.')));
  t = T([user('go'), idle('cache-qa', 'Outcome: PASS\nNode tests "pass" said the log.')]);
  ok('V21-1 quoted teammate text does not back a relay', blocked(stop(t, 'cache-qa reports: node tests pass.')));

  // (e) previous-turn backing after an intent-only turn
  const intent = path.join(HOME, '.agent-org/intents/x/2026-11-11-a-b.md');
  t = T([user('run'), call('Bash', { command: 'npm test' }, false, 'ok 6'), user('<task-notification>pm done</task-notification>'), call('Write', { file_path: intent, content: 'x' })]);
  ok('V21-1e turn whose only call writes the intent → previous turn\'s npm test backs "tests pass"', !blocked(stop(t, 'Saved the intent. Tests pass on the base commit.')));
  t = T([user('run'), call('Bash', { command: 'npm test' }, false, 'ok 6'), user('next'), call('Write', { file_path: intent, content: 'x' }), call('Edit', { file_path: path.join(W, 'src', 'a.js'), old_string: 'a', new_string: 'b' })]);
  ok('V21-1e control: intent write plus a source edit → no previous-turn backing (block)', blocked(stop(t, 'Tests pass.')));
  t = T([user('run'), call('Bash', { command: 'ls' }, false, 'x'), user('next'), call('Write', { file_path: intent, content: 'x' })]);
  ok('V21-1e control: previous turn had no test command → block', blocked(stop(t, 'Tests pass.')));
  t = T([user('run'), call('Bash', { command: 'npm test' }, false, 'ok'), user('next'), user('again'), call('Write', { file_path: intent, content: 'x' })]);
  ok('V21-1e control: only one turn back', blocked(stop(t, 'Tests pass.')));
  // negative tests (Phase 9 review): (g)/(h) must not hide real claims
  ok('V21-1 negative: "Not run yet: integration; unit tests pass." with no test run → block (negation covers its clause only)', blocked(stop(q(), 'Not run yet: integration; unit tests pass.')));
  ok('V21-1 negative: "**Not run yet:** integration" label on its own line doesn\'t cover the next line\'s claim', blocked(stop(q(), '- **Not run yet:** integration.\n- Unit tests pass.')));
  t = T([user('go'), idle('cache-qa', 'Outcome: PASS\nTest 2 passed every time.\nThe cache test file has 13 tests.')]);
  ok('V21-1 negative: a claim that matches no teammate report → block', blocked(stop(t, 'The integration tests pass.')));
  ok('V21-1 negative: same teammate, a claim it did make → no block (control)', !blocked(stop(t, 'cache-qa reports: test 2 passed every time.')));
  t = T([user('x')]);
  ok('V21-1 true claim with no evidence still blocks ("I ran the test suite and all tests pass.")', blocked(stop(t, 'I ran the test suite and all tests pass.')));
  ok('V21-1 citation check unchanged by status skip ("Status: see src/nope.js:3" blocks)', /citation check/.test(JSON.stringify(stop(T([user('x')]), 'Status: see src/nope.js:3.').json || {})));
}

// ---------------------------------------------------------------- V21-3, V21-8 instruction text
{
  const deliver = fs.readFileSync(path.join(P, 'skills/deliver/SKILL.md'), 'utf8');
  ok('V21-3 deliver: never commit, push or tag unless the user asks in this session', /never commit, push or tag/i.test(deliver) && /asks? (?:for it )?in this session/i.test(deliver));
  ok('V21-3 deliver: after VERIFIED, offer the commit instead', /offer/i.test(deliver) && /after `?VERIFIED`?/i.test(deliver));
  ok('V21-10 deliver: step 3 uses record.mjs --intent-path', deliver.includes('record.mjs" --intent-path'));
  const eng = ['full-stack-developer', 'ai-engineer', 'ml-engineer', 'devops-engineer', 'platform-engineer', 'cloud-engineer'];
  for (const id of eng) {
    const txt = fs.readFileSync(path.join(P, 'agents', `${id}.md`), 'utf8');
    const binding = txt.slice(txt.indexOf('## Claude Code runtime binding'));
    const words = binding.split(/\s+/).filter(Boolean).length;
    ok(`V21-8 ${id}: commit, push and deploy listed as guard-enforced; binding ${words} words (< 250)`, /\*\*Guard-enforced:\*\*[^\n]*commit[^\n]*push[^\n]*deploy/i.test(binding) && !/Instruction-only:\*\*[^\n]*no deploys, pushes/.test(binding) && words < 250);
  }
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exitCode = fail ? 1 : 0;
