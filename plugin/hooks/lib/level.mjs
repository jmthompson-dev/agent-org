// agent-org: deterministic level choice (v0.2.2, D34). The level check is a fixed set of yes / no / unsure
// answers to the D5 Level 2 and Level 3 triggers; a pure function maps them to a level. Unsure counts as yes,
// any Level 3 answer gives 3, else any Level 2 answer gives 2, else 1. Malformed or missing → null.
// The main thread submits the answers as one Bash call, `node <plugin>/hooks/record.mjs --level-check "<answers>"`;
// the guard reads them from that call's tool_input (PreToolUse), never from the transcript (Phase 10 probe:
// a block in the same message as the edit isn't on disk when PreToolUse fires).

// [key, question]. The order is the D5 order, and the template below follows it.
export const LEVEL2 = [
  ['files', 'more than 2 files, or more than one module (a file count is accepted: files=3 means y)'],
  ['api', 'public API or contract change'],
  ['schema', 'schema or migration'],
  ['dep', 'new or upgraded dependency'],
  ['auth', 'auth or authz'],
  ['secrets', 'secrets or credentials'],
  ['infra', 'CI/CD or infra/IaC'],
  ['xservice', 'cross-service integration'],
  ['behavior', 'user-visible behavior change: what the user can do or what the system returns (a bug fix that restores intended behavior, and copy-only text changes, are n)'],
];
export const LEVEL3 = [
  ['redesign', 'auth/authz redesign'],
  ['sensitive', 'sensitive-data handling'],
  ['proddata', 'production data migration: moving, transforming, deleting or backfilling existing production data (a new nullable column with no backfill is n)'],
  ['multiservice', 'multi-service architecture change'],
  ['deploy', 'production release or deploy'],
  ['aiml', 'significant AI/ML platform work'],
];
export const KEYS = [...LEVEL2, ...LEVEL3].map(([k]) => k);
export const TEMPLATE = KEYS.map((k) => `${k}=?`).join(' ');
export const SOURCES = new Set(['checklist', 'deliver', 'pm', 'floor']);

// The scope guard's risky-path kinds (guard.mjs riskyKinds) and the question that covers each.
export const RISKY_KEY = { migration: 'schema', ci: 'infra', infra: 'infra', auth: 'auth' };

const VALUE = { y: 'y', yes: 'y', n: 'n', no: 'n', '?': '?', unsure: '?' };

// "files=n api=y …" → { files: 'n', api: 'y', … } with every key exactly once, or null.
// Separators: whitespace or commas. Values: y, yes, n, no, ?, unsure (any case). v0.2.2 (Phase 10 Part 3: 8 of 33 first
// checks answered files=<count>): `files` also takes a file count, more than 2 → y, else n.
export function parseAnswers(text) {
  if (typeof text !== 'string' || text.length > 1000) return null;
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const out = {};
  for (const t of tokens) {
    const m = /^([a-z]+)=(.+)$/i.exec(t);
    if (!m) return null;
    const k = m[1].toLowerCase();
    const raw = m[2].toLowerCase();
    const v = k === 'files' && /^\d{1,6}$/.test(raw) ? (Number(raw) > 2 ? 'y' : 'n') : VALUE[raw];
    if (!KEYS.includes(k) || !v || k in out) return null;
    out[k] = v;
  }
  return KEYS.every((k) => k in out) ? out : null;
}

// Answers → 1, 2 or 3; anything else → null. Unsure (?) counts as yes.
export function levelFromAnswers(answers) {
  if (!answers || typeof answers !== 'object') return null;
  if (!KEYS.every((k) => answers[k] === 'y' || answers[k] === 'n' || answers[k] === '?')) return null;
  const hit = (list) => list.some(([k]) => answers[k] !== 'n');
  if (hit(LEVEL3)) return 3;
  if (hit(LEVEL2)) return 2;
  return 1;
}

// The answers as booleans for the audit: `answers[k]` is true for yes or unsure; `unsure` lists the unsure keys.
export function answerFlags(answers) {
  const a = {};
  const unsure = {};
  for (const k of KEYS) {
    a[k] = answers[k] !== 'n';
    if (answers[k] === '?') unsure[k] = true;
  }
  return { answers: a, unsure };
}

// The keys that set the level (yes or unsure), for messages. Fixed identifiers, never user text.
export const triggered = (answers) => KEYS.filter((k) => answers[k] !== 'n');

// D4: the level a request ends up with never goes down. `prev` may be null.
export const raise = (prev, next) => (typeof prev === 'number' && prev > next ? prev : next);

export function questionList() {
  const fmt = (list) => list.map(([k, q]) => `${k} = ${q}`).join('; ');
  return `Level 2: ${fmt(LEVEL2)}. Level 3: ${fmt(LEVEL3)}.`;
}
