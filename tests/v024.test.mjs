// agent-org v0.2.4 tests (D36): a docs-only edit carrying auth, secret, credential or infra content is a Level 2
// trigger by itself (the guard floors the request to Level 2). Usage: node tests/v024.test.mjs [<plugin dir>]
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
    'Rotate the client secret quarterly.', 'config: { clientSecret }', 'Set authToken in the config.', 'The dbPassword field.', 'Pass accessToken.', 'Export GITHUB_TOKEN first.', 'Send the TOKEN header.', 'Use a refresh token.', 'Uses GitHub Actions.',
    'pass\u200bword is required', '\uff50\uff41\uff53\uff53\uff57\uff4f\uff52\uff44 field', 'Log in with your password.', 'Uses OAuth2 with OIDC.', 'Pass a Bearer header.',
    'Store the private key in the vault.', 'See the AWS access key docs.', 'Requires SSH.', 'Deployed with Terraform on Kubernetes (k8s) via Helm.',
    'Grant the IAM role; RBAC applies.', 'Our CI/CD runs on GitHub Actions.', 'Authentication and authorization flow.', 'authn vs authz',
    'Copy your kubeconfig.', 'The JWT expires.', 'SSO via SAML.', 'Infrastructure as code (IaC).',
  ];
  for (const t of yes) ok(`sensitive: "${t}" → true`, s({ new_string: t }) === true);
  const no = [
    'Entries expire once older than the TTL (default 1000 ms).', 'Written by the author.', 'A tokenizer splits words.',
    'Keys are strings; values are anything.', 'The secretary role.', 'Authored in 2026.', 'See the tutorial on caching.',
    'Install with npm install.', 'Run the test suite.', 'A passing grade.', 'Token budget per agent.', 'Use design tokens for colors.', 'Token count: 4k.', 'iam not sure.',
  ];
  for (const t of no) ok(`not sensitive: "${t}" → false`, s({ new_string: t }) === false);
  ok('sensitive: Write content is scanned', s({ content: '# Setup\nexport API_TOKEN=...' }) === true);
  ok('sensitive: old_string is scanned (removing a credential warning counts)', s({ old_string: 'Never log passwords.', new_string: '' }) === true);
  ok('sensitive (pure function only; MultiEdit is not a guarded tool): edits[] are scanned', s({ edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'x', new_string: 'use the secret' }] }) === true);
  ok('sensitive (pure function only; notebooks are never docs-only): new_source is scanned', s({ new_source: 'password = input()' }) === true);
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

  const isContentFloor = (x) => decisionOf(x) === 'deny' && /auth, secret, credential or infra content/.test(reasonOf(x)) && /Level 2/.test(reasonOf(x));
  const floorLines = (pid) => { try { return fs.readdirSync(path.join(HOME, '.agent-org/audit')).flatMap((f) => fs.readFileSync(path.join(HOME, '.agent-org/audit', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((d) => d.event === 'level' && d.prompt === pid && d.source === 'floor'); } catch { return []; } };

  // The v0.2.3 checklist failure D-b: src/cache.js + README.md + docs/usage.md with a credential warning.
  check('p1');
  let r = [edit('p1', 'src/cache.js', 'entry'), edit('p1', 'README.md', WARN)];
  ok('D-b: source then a credential-warning README → README denied (content floor), request Level 2', decisionOf(r[0]) === 'none' && isContentFloor(r[1]) && stateOf(sid).levels.p1.level === 2, r.map(reasonOf).join(' | '));
  ok('D-b: audit level line has source floor, floor ["docs-content"], no edit text', (() => { const l = floorLines('p1'); return l.length === 1 && l[0].floor.join() === 'docs-content' && !JSON.stringify(l).includes('credentials'); })(), JSON.stringify(floorLines('p1')));
  ok('D-b: the denied README is not recorded in reqFiles', !(stateOf(sid).reqFiles?.p1?.[key] || []).some((f) => f.endsWith('README.md')));
  ok('D-b: after the floor, a later plain edit is denied by the level gate', decisionOf(edit('p1', 'src/b.js')) === 'deny');
  ok('state never stores edit content', !JSON.stringify(stateOf(sid)).includes('credentials'));

  // D-c: a single docs Write with an env-var key, no other file.
  check('p2');
  r = write('p2', 'docs/setup.md', '# Setup\nSet CACHE_API_KEY from the admin console.');
  ok('D-c: a lone docs Write with CACHE_API_KEY → content floor (one file is enough)', isContentFloor(r), reasonOf(r));

  // The 2-file case D36 closes: one source file plus a credential README.
  check('p2b');
  r = [edit('p2b', 'src/cache.js', 'entry'), edit('p2b', 'README.md', WARN)];
  ok('2-file job: src/cache.js then a README with a credential line → README denied (content floor), Level 2', decisionOf(r[0]) === 'none' && isContentFloor(r[1]) && stateOf(sid).levels.p2b.level === 2, r.map(reasonOf).join(' | '));
  check('p2c');
  r = edit('p2c', 'docs/config.md', 'Set `clientSecret` in config.');
  ok('camelCase: docs edit naming clientSecret → content floor', isContentFloor(r), reasonOf(r));
  check('p2d');
  r = edit('p2d', 'README.md', 'Each agent has a token budget.');
  ok('false-positive guard: "token budget" in a doc → no decision', decisionOf(r) === 'none', reasonOf(r));

  // D-a still passes: plain docs don't count.
  check('p3');
  r = [edit('p3', 'src/cache.js', 'entry'), edit('p3', 'README.md', 'Entries expire after the TTL.'), edit('p3', 'docs/usage.md', 'Entries expire after the TTL.')];
  ok('D-a: source + two plain docs → no decision (v0.2.3 relief kept)', r.every((x) => decisionOf(x) === 'none'), r.map(reasonOf).join(' | '));
  check('p4');
  ok('docs-only: five plain docs → no decision', ['docs/1.md', 'docs/2.md', 'docs/3.md', 'README.md', 'CHANGELOG.md'].every((f) => decisionOf(edit('p4', f, 'plain text')) === 'none'));

  // A docs file first edited plainly, then with sensitive content: the second edit triggers.
  check('p5');
  r = [edit('p5', 'README.md', 'plain'), edit('p5', 'README.md', WARN)];
  ok('re-edit: README plain then with a credential line → the second edit is denied (content floor)', decisionOf(r[0]) === 'none' && isContentFloor(r[1]), r.map(reasonOf).join(' | '));

  // Removing a credential warning also triggers (old_string scanned).
  check('p6');
  r = edit('p6', 'README.md', '', 'Never log passwords.');
  ok('removing a credential line from a doc → content floor', isContentFloor(r), reasonOf(r));

  // Unchanged: source and prompt files aren't content-scanned.
  check('p7');
  r = [edit('p7', 'src/a.js', 'const password = x;'), edit('p7', 'src/b.js')];
  ok('source files: sensitive content in two source files → no decision (content only matters for docs)', r.every((x) => decisionOf(x) === 'none'), r.map(reasonOf).join(' | '));
  check('p8');
  r = edit('p8', 'plugin/skills/x/SKILL.md', 'mentions an API key');
  ok('prompt files (SKILL.md) are not docs-only → not content-floored, counted as before', decisionOf(r) === 'none', reasonOf(r));

}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exitCode = fail ? 1 : 0;
