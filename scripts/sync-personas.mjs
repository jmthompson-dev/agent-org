#!/usr/bin/env node
// sync-personas.mjs: check or bump the canonical persona blocks embedded in plugin/agents/*.md.
//
// Usage:
//   node scripts/sync-personas.mjs [--check] [--personas <path>]
//   node scripts/sync-personas.mjs --bump <sha> [--personas <path>]
//
// --check (default): compare each agent's canonical block with
//   `git show <pinned commit>:agents/<id>.md` in the persona repo.
//   OK      block matches the persona at the pin, and its source= stamp is the pin
//   DRIFT   block content or source= stamp differs from the pin
//   MISSING agent file has no canonical block, or the persona does not exist at the pin
//   NEW     persona exists at the pin but the plugin has no agent file for it
//   Also reports whether the persona repo's local `main` ref (metadata.personasBranch) is ahead of the pin.
//   Exits 1 on any non-OK status.
// --bump <sha>: rewrite only the canonical blocks, their source= stamps and
//   plugin.json metadata.personasCommit. Frontmatter and runtime bindings are untouched.
//   Writes go to temp files that are then renamed. Running it twice changes nothing.
//
// This script never fetches, pulls or modifies the persona repo. It only runs
// read-only git commands (rev-parse, show, ls-tree, rev-list) against it.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_DIR = path.join(REPO_ROOT, 'plugin');
const AGENTS_DIR = path.join(PLUGIN_DIR, 'agents');
const PLUGIN_JSON = path.join(PLUGIN_DIR, '.claude-plugin', 'plugin.json');

const BLOCK_RE =
  /<!-- agent-org:canonical:begin source=agent-personas@([0-9a-zA-Z]+) path=agents\/([A-Za-z0-9._-]+)\.md -->\r?\n([\s\S]*?)<!-- agent-org:canonical:end -->/;

function usage(msg) {
  if (msg) console.error(`error: ${msg}`);
  console.error('usage: node scripts/sync-personas.mjs [--check | --bump <sha>] [--personas <path>]');
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { mode: 'check', sha: null, personas: path.join(os.homedir(), 'git', 'agent-personas') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') opts.mode = 'check';
    else if (a === '--bump') {
      opts.mode = 'bump';
      opts.sha = argv[++i];
      if (!opts.sha) usage('--bump needs a commit');
    } else if (a === '--personas') {
      opts.personas = argv[++i];
      if (!opts.personas) usage('--personas needs a path');
    } else if (a === '-h' || a === '--help') usage();
    else usage(`unknown argument: ${a}`);
  }
  opts.personas = path.resolve(opts.personas);
  return opts;
}

function git(repo, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} failed: ${(err.stderr || err.message || '').toString().trim()}`);
  }
}

function resolveCommit(repo, rev) {
  const out = git(repo, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], { allowFail: true });
  if (!out) throw new Error(`commit not found in persona repo: ${rev}`);
  return out.trim();
}

function personaIdsAt(repo, sha) {
  const out = git(repo, ['ls-tree', '--name-only', `${sha}`, 'agents/']);
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.md') && l !== 'agents/README.md')
    .map((l) => path.posix.basename(l, '.md'))
    .sort();
}

function personaAt(repo, sha, id) {
  return git(repo, ['show', `${sha}:agents/${id}.md`], { allowFail: true });
}

function agentFiles() {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  return fs
    .readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.basename(f, '.md'))
    .sort();
}

const lf = (s) => s.replace(/\r\n/g, '\n');
const withTrailingNewline = (s) => (s.endsWith('\n') ? s : `${s}\n`);

function renderBlock(sha, id, body) {
  return (
    `<!-- agent-org:canonical:begin source=agent-personas@${sha} path=agents/${id}.md -->\n` +
    withTrailingNewline(body) +
    '<!-- agent-org:canonical:end -->'
  );
}

function writeAtomic(file, content) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

function readPluginJson() {
  return JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8'));
}

function check(opts) {
  const meta = readPluginJson().metadata || {};
  if (!meta.personasCommit) throw new Error('plugin.json metadata.personasCommit is not set');
  const pin = resolveCommit(opts.personas, meta.personasCommit);
  const branch = meta.personasBranch || 'main';

  const personaIds = personaIdsAt(opts.personas, pin);
  const agents = agentFiles();
  const rows = [];

  for (const id of agents) {
    const text = fs.readFileSync(path.join(AGENTS_DIR, `${id}.md`), 'utf8');
    const m = text.match(BLOCK_RE);
    const persona = personaAt(opts.personas, pin, id);
    if (!m || persona === null) {
      rows.push([id, 'MISSING', !m ? 'no canonical block' : 'persona not present at pin']);
      continue;
    }
    const [, stamp, blockPath, content] = m;
    if (blockPath !== id) {
      rows.push([id, 'DRIFT', `block path is agents/${blockPath}.md`]);
    } else if (stamp !== pin) {
      rows.push([id, 'DRIFT', `source stamp ${stamp} != pin`]);
    } else if (lf(content) !== withTrailingNewline(persona)) {
      rows.push([id, 'DRIFT', 'block content differs from persona at pin']);
    } else {
      rows.push([id, 'OK', '']);
    }
  }
  for (const id of personaIds) {
    if (!agents.includes(id)) rows.push([id, 'NEW', 'persona at pin has no agent file']);
  }

  const width = Math.max(...rows.map((r) => r[0].length), 4);
  console.log(`persona repo: ${opts.personas}`);
  console.log(`pin:          ${pin}`);
  for (const [id, status, note] of rows) {
    console.log(`${status.padEnd(8)}${id.padEnd(width + 2)}${note}`);
  }

  const head = git(opts.personas, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`], {
    allowFail: true,
  });
  if (!head) {
    console.log(`${branch}: local branch not found (not fetched; this script never fetches)`);
  } else {
    const ahead = Number(git(opts.personas, ['rev-list', '--count', `${pin}..${head.trim()}`]).trim());
    const behind = Number(git(opts.personas, ['rev-list', '--count', `${head.trim()}..${pin}`]).trim());
    if (ahead === 0 && behind === 0) console.log(`${branch}: at pin`);
    else console.log(`${branch}: ${ahead} commit(s) ahead of pin, ${behind} behind (local ref; not fetched)`);
  }

  const bad = rows.filter((r) => r[1] !== 'OK').length;
  console.log(bad === 0 ? `result: ${rows.length} OK` : `result: ${bad} problem(s)`);
  return bad === 0 ? 0 : 1;
}

function bump(opts) {
  const sha = resolveCommit(opts.personas, opts.sha);
  const agents = agentFiles();
  if (agents.length === 0) throw new Error(`no agent files in ${AGENTS_DIR}`);

  // Prepare every change first; write nothing if any agent fails.
  const pending = [];
  for (const id of agents) {
    const file = path.join(AGENTS_DIR, `${id}.md`);
    const text = fs.readFileSync(file, 'utf8');
    const m = text.match(BLOCK_RE);
    if (!m) throw new Error(`${id}: no canonical block; refusing to guess where it goes`);
    const persona = personaAt(opts.personas, sha, id);
    if (persona === null) throw new Error(`${id}: agents/${id}.md does not exist at ${sha}`);
    const next = text.slice(0, m.index) + renderBlock(sha, id, persona) + text.slice(m.index + m[0].length);
    if (next !== text) pending.push([file, next]);
  }

  const pluginRaw = fs.readFileSync(PLUGIN_JSON, 'utf8');
  const plugin = JSON.parse(pluginRaw);
  plugin.metadata = plugin.metadata || {};
  plugin.metadata.personasCommit = sha;
  const pluginNext = `${JSON.stringify(plugin, null, 2)}\n`;
  if (pluginNext !== pluginRaw) pending.push([PLUGIN_JSON, pluginNext]);

  for (const [file, content] of pending) writeAtomic(file, content);
  console.log(`bumped to ${sha}: ${pending.length} file(s) changed`);
  for (const [file] of pending) console.log(`  ${path.relative(REPO_ROOT, file)}`);
  return 0;
}

try {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(opts.personas)) throw new Error(`persona repo not found: ${opts.personas}`);
  process.exit(opts.mode === 'bump' ? bump(opts) : check(opts));
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(2);
}
