// FluentaOne supply-chain gate — scope `bun audit` findings to the
// published-package dependency closure (DEV-1218).
//
// Why: `bun audit` has no scope flag — it audits every package resolved in
// bun.lock, including the 11 upstream examples/* demo apps (next, nuxt,
// remix, astro, ...). Nothing from those demos is built, published, or
// served to FluentaOne (the reproducible-build job builds packages/* only),
// yet historically they contributed nearly all of the audit findings. This
// filter keeps the gate strict for what we actually ship while making demo
// noise non-blocking.
//
// Scope = the transitive dependency closure, per the committed bun.lock, of:
//   - every packages/* workspace (dependencies + devDependencies +
//     peerDependencies — devDeps included on purpose: the build toolchain
//     that produces the published artifacts is supply-chain surface), and
//   - the root workspace's devDependencies (shared build/release tooling:
//     tsup, typescript, eslint, changesets, ...).
// examples/* workspaces are excluded — that is the point.
//
// The graph walk is name-level and therefore conservative: if ANY resolved
// copy of a name is reachable, every advisory for that name stays blocking.
//
// Usage:
//   bun audit --json > audit.json || true
//   bun .github/flnteu/audit-scope.mjs audit.json bun.lock [--ignore=GHSA-...]...
//
// Exit 1 iff an in-scope high/critical advisory is not on the ignore list.

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const ignores = new Set(
  args.filter((a) => a.startsWith('--ignore=')).map((a) => a.slice('--ignore='.length)),
);
const [auditPath, lockPath] = args.filter((a) => !a.startsWith('--'));
if (!auditPath || !lockPath) {
  console.error('usage: audit-scope.mjs <audit.json> <bun.lock> [--ignore=GHSA-...]...');
  process.exit(2);
}

// bun.lock is JSONC (trailing commas). Strip them; the file contains no
// comments and no string literal ever ends with `,` directly before a
// closing bracket on the next line, so this regex is safe here.
const lock = JSON.parse(readFileSync(lockPath, 'utf8').replace(/,(\s*[}\]])/g, '$1'));
const audit = JSON.parse(readFileSync(auditPath, 'utf8') || '{}');

// --- Build the name-level dependency graph from the lock ------------------
// lock.packages values: ["name@version", registry, { dependencies?,
// devDependencies?, peerDependencies?, optionalDependencies? }, sha]
const edges = new Map(); // realName -> Set(dep names)
for (const entry of Object.values(lock.packages ?? {})) {
  const spec = entry[0]; // "name@version" (name may be @scoped)
  const realName = spec.slice(0, spec.lastIndexOf('@'));
  const meta = entry[2] ?? {};
  const deps = { ...(meta.dependencies ?? {}), ...(meta.optionalDependencies ?? {}) };
  const set = edges.get(realName) ?? new Set();
  for (const dep of Object.keys(deps)) set.add(dep);
  edges.set(realName, set);
}

// --- Seed: packages/* workspaces + root build tooling ----------------------
const seeds = new Set();
const workspaceNames = new Set();
for (const [wsPath, ws] of Object.entries(lock.workspaces ?? {})) {
  if (ws.name) workspaceNames.add(ws.name);
  if (wsPath !== '' && !wsPath.startsWith('packages/')) continue; // drop examples/*
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dep of Object.keys(ws[key] ?? {})) seeds.add(dep);
  }
}

// --- BFS -------------------------------------------------------------------
const inScope = new Set();
const queue = [...seeds].filter((n) => !workspaceNames.has(n));
while (queue.length) {
  const name = queue.pop();
  if (inScope.has(name)) continue;
  inScope.add(name);
  for (const dep of edges.get(name) ?? []) {
    if (!inScope.has(dep) && !workspaceNames.has(dep)) queue.push(dep);
  }
}

// --- Evaluate audit findings ------------------------------------------------
const BLOCKING = new Set(['high', 'critical']);
const ghsaOf = (adv) => adv.url?.match(/GHSA-[a-z0-9-]+/)?.[0] ?? adv.url ?? 'unknown-advisory';
const rows = { blocking: [], ignored: [], outOfScope: [] };
for (const [pkg, advisories] of Object.entries(audit)) {
  for (const adv of advisories) {
    if (!BLOCKING.has(adv.severity)) continue;
    const row = `${pkg} ${adv.severity} ${ghsaOf(adv)} — ${adv.title}`;
    if (!inScope.has(pkg)) rows.outOfScope.push(row);
    else if (ignores.has(ghsaOf(adv))) rows.ignored.push(row);
    else rows.blocking.push(row);
  }
}

console.log(`published-package closure: ${inScope.size} packages (of ${edges.size} in bun.lock)`);
for (const [label, list] of [
  ['BLOCKING (in scope)', rows.blocking],
  ['ignored (in scope, on the documented ignore list)', rows.ignored],
  ['informational (examples/* only, not shipped)', rows.outOfScope],
]) {
  console.log(`\n${label}: ${list.length}`);
  for (const r of list) console.log(`  ${r}`);
}

if (rows.blocking.length) {
  console.error('\nFAIL: high/critical advisories inside the published-package closure.');
  process.exit(1);
}
console.log('\nOK: no unignored high/critical advisories inside the published-package closure.');
