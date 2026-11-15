// agent-org v0.2.4 tests (D36): a docs-only file whose edit carries auth, secret, credential or infra content counts
// toward the level gate's more-than-2-files floor again. Usage: node tests/v024.test.mjs [<plugin dir>]
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process'; import { fileURLToPath, pathToFileURL } from 'node:url';
const P = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin'));
const H = path.join(P, 'hooks');
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ao-24-')));
const HOME = path.join(TMP, 'home'); fs.mkdirSync(HOME);
process.env.HOME = HOME; process.env.USERPROFILE = HOME;
delete process.env.AGENT_ORG_HOOK_DEBUG; delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS; delete process.env.CLAUDE_CODE_SESSION_ID;
let pass = 0; let fail = 0; const out = [];
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${cond || !extra ? '' : `  -- ${String(extra).slice(0, 400)}`}`); };
const run = (script, input) => {
  const r = spawnSync(process.execPath, [path.join(H, script)], { input: JSON.stringify(input), env: { ...process.env, HOME, USERPROFILE: HOME }, encoding: 'utf8', timeout: 10000 });
  let json = null; try { json = r.stdout ? JSON.parse(r.stdout) : null; } catch { json = 'BADJSON'; }
  return { out: r.stdout, code: r.status, json };
};
const imp = (f) => import(pathToFileURL(path.join(H, f)).href);
const L = await imp('lib/level.mjs'); const G = await imp('guard.mjs'); const repo = await imp('lib/repo.mjs');
const stateOf = (sid) => { try { return JSON.parse(fs.readFileSync(path.join(HOME, '.agent-org/state', sid, 'state.json'), 'utf8')); } catch { return null; } };
const decisionOf = (r) => (r.json && r.json.hookSpecificOutput ? r.json.hookSpecificOutput.permissionDecision : 'none');
const reasonOf = (r) => (r.json && r.json.hookSpecificOutput ? r.json.hookSpecificOutput.permissionDecisionReason : '');
const ANS_N = L.KEYS.map((k) => `${k}=n`).join(' ');

// ---------------------------------------------------------------- sensitiveDocContent (pure)
{
  const s = G.sensitiveDocContent;
  const yes = [
    'Never store auth tokens, API keys or other credentials in the cache.',
    'Set the CACHE_API_KEY environment variable.',
    'Rotate the client secret quarterly.', 'Log in with your password.', 'Uses OAuth2 with OIDC.', 'Pass a Bearer header.',
    'Store the private key in the vault.', 'See the AWS access key docs.', 'Requires SSH.', 'Deployed with Terraform on Kubernetes (k8s) via Helm.',
    'Grant the IAM role; RBAC applies.', 'Our CI/CD runs on GitHub Actions.', 'Authentication and authorization flow.', 'authn vs authz',
    'Copy your kubeconfig.', 'The JWT expires.', 'SSO via SAML.', 'Infrastructure as code (IaC).',
  ];
  for (const t of yes) ok(`sensitive: "${t}" → true`, s({ new_string: t }) === true);
  const no = [
    'Entries expire once older than the TTL (default 1000 ms).', 'Written by the author.', 'A tokenizer splits words.',
    'Keys are strings; values are anything.', 'The secretary role.', 'Authored in 2026.', 'See the tutorial on caching.',
    'Install with npm install.', 'Run the test suite.', 'A passing grade.',
  ];
  for (const t of no) ok(`not sensitive: "${t}" → false`, s({ new_string: t }) === false);
  ok('sensitive: Write content is scanned', s({ content: '# Setup\nexport API_TOKEN=...' }) === true);
  ok('sensitive: old_string is scanned (removing a credential warning counts)', s({ old_string: 'Never log passwords.', new_string: '' }) === true);
  ok('sensitive: MultiEdit-style edits[] are scanned', s({ edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'x', new_string: 'use the secret' }] }) === true);
  ok('sensitive: NotebookEdit new_source is scanned', s({ new_source: 'password = input()' }) === true);
  ok('sensitive: bad input → false', s(null) === false && s(undefined) === false && s('str') === false && s({}) === false);
}

// ---------------------------------------------------------------- the guard's level gate, end to end
{
  const W = path.join(TMP, 'w', 'app'); fs.mkdirSync(path.join(W, 'src'), { recursive: true }); execFileSync('git', ['init', '-q', W]);
  const sid = 'dg24';
  const edit = (pid, rel, new_string = 'b', old_string = 'a') => run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: sid, prompt_id: pid, cwd: W, tool_name: 'Edit', tool_input: { file_path: path.join(W, rel), old_string, new_string }, tool_use_id: `t-${Math.random()}` });
  const write = (pid, rel, content) => run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: sid, prompt_id: pid, cwd: W, tool_name: 'Write', tool_input: { file_path: path.join(W, rel), content }, tool_use_id: `t-${Math.random()}` });
  const check = (pid) => run('guard.mjs', { hook_event_name: 'PreToolUse', session_id: sid, prompt_id: pid, cwd: W, tool_name: 'Bash', tool_input: { command: `node "${G.RECORD_SCRIPT}" --level-check "${ANS_N}"` }, tool_use_id: 'tc' });
  const key = repo.repoId(W).key;
  const WARN = 'Never store auth tokens, API keys or other credentials.';

  // The v0.2.3 checklist failure D-b: src/cache.js + README.md + docs/usage.md with a credential warning.
  check('p1');
  let r = [edit('p1', 'src/cache.js', 'entry'), edit('p1', 'README.md', WARN), edit('p1', 'docs/usage.md', WARN)];
  ok('D-b: source + two credential-warning docs → third file denied "file 3 of this request", Level 2', decisionOf(r[0]) === 'none' && decisionOf(r[1]) === 'none' && decisionOf(r[2]) === 'deny' && /file 3 of this request/.test(reasonOf(r[2])) && stateOf(sid).levels.p1.level === 2, r.map(reasonOf).join(' | '));
  ok('D-b: the sensitive README is recorded in reqSensitive (path only)', (stateOf(sid).reqSensitive?.p1?.[key] || []).map((f) => path.relative(W, f)).join() === 'README.md', JSON.stringify(stateOf(sid).reqSensitive));
  ok('state never stores edit content', !JSON.stringify(stateOf(sid)).includes('credentials'));

  // D-c: Write with an env-var key, after two source files.
  check('p2');
  r = [edit('p2', 'src/a.js'), edit('p2', 'src/b.js'), write('p2', 'docs/setup.md', '# Setup\nSet CACHE_API_KEY from the admin console.')];
  ok('D-c: two source files then a docs Write with CACHE_API_KEY → denied as file 3', decisionOf(r[2]) === 'deny' && /file 3 of this request/.test(reasonOf(r[2])), reasonOf(r[2]));

  // D-a still passes: plain docs don't count.
  check('p3');
  r = [edit('p3', 'src/cache.js', 'entry'), edit('p3', 'README.md', 'Entries expire after the TTL.'), edit('p3', 'docs/usage.md', 'Entries expire after the TTL.')];
  ok('D-a: source + two plain docs → no decision (v0.2.3 relief kept)', r.every((x) => decisionOf(x) === 'none'), r.map(reasonOf).join(' | '));

  // Docs-only jobs: sensitive docs count like any file.
  check('p4');
  r = [edit('p4', 'docs/1.md', WARN), edit('p4', 'docs/2.md', 'plain'), edit('p4', 'docs/3.md', 'plain'), edit('p4', 'docs/4.md', WARN), edit('p4', 'docs/5.md', WARN)];
  ok('docs-only: one sensitive + plain docs + a second sensitive → no decision (2 counted)', r.slice(0, 4).every((x) => decisionOf(x) === 'none'), r.map(reasonOf).join(' | '));
  ok('docs-only: a third sensitive docs file → denied', decisionOf(r[4]) === 'deny' && /file 3 of this request/.test(reasonOf(r[4])), reasonOf(r[4]));

  // A docs file first edited plainly, then with sensitive content, starts counting on the second edit.
  check('p5');
  r = [edit('p5', 'src/a.js'), edit('p5', 'src/b.js'), edit('p5', 'README.md', 'plain'), edit('p5', 'README.md', WARN)];
  ok('re-edit: README plain (exempt) then with a credential line → the second edit is denied as file 3', decisionOf(r[2]) === 'none' && decisionOf(r[3]) === 'deny' && /file 3 of this request/.test(reasonOf(r[3])), r.map(reasonOf).join(' | '));
  check('p6');
  r = [edit('p6', 'src/a.js'), edit('p6', 'README.md', WARN), edit('p6', 'README.md', WARN), edit('p6', 'README.md', 'plain')];
  ok('re-edit: an already-counted sensitive README re-edited → no decision (still 2 files)', r.every((x) => decisionOf(x) === 'none'), r.map(reasonOf).join(' | '));

  // Unchanged: a source file's content isn't scanned; non-docs keep counting regardless.
  check('p7');
  r = [edit('p7', 'src/a.js', 'const password = x;'), edit('p7', 'src/b.js')];
  ok('source files: sensitive content in two source files → no decision (content only matters for docs)', r.every((x) => decisionOf(x) === 'none'), r.map(reasonOf).join(' | '));
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exitCode = fail ? 1 : 0;
