// Tests for the FluentaOne audit scoping filter (DEV-2291).
//
// audit-scope.mjs decides which `bun audit` findings block the vendor gate.
// Every case below is a way that decision can go wrong, and the ones that
// matter most are the ways it can go SILENTLY right-looking:
//
//   - a scope narrowed until nothing can fail (the vacuous gate), and
//   - a `private: true` exclusion that stops excluding, or starts excluding
//     a package we actually publish.
//
// So `blocks an in-scope high` is a positive control, not a formality: it is
// the assertion that proves the other assertions mean something. Do not
// delete it to make a red run green.
//
// Run: bun .github/flnteu/audit-scope.test.mjs   (node also works)

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'audit-scope.mjs');
let failures = 0;
let passes = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passes++;
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// A miniature monorepo: one published package, one private package, one
// example app, each with a distinctive dependency, plus the root tooling.
function fixture({ audit }) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-scope-test-'));
  const pkg = (p, body) => {
    mkdirSync(join(dir, p), { recursive: true });
    writeFileSync(join(dir, p, 'package.json'), JSON.stringify(body));
  };
  pkg('packages/shipped', { name: '@scope/shipped' });
  pkg('packages/wip', { name: '@scope/wip', private: true });
  pkg('examples/demo', { name: 'demo', private: true });

  const lock = {
    lockfileVersion: 1,
    workspaces: {
      '': { name: 'root', devDependencies: { 'root-tool': '^1' } },
      'packages/shipped': { name: '@scope/shipped', dependencies: { 'shipped-dep': '^1' } },
      'packages/wip': { name: '@scope/wip', devDependencies: { 'wip-framework': '^1' } },
      'examples/demo': { name: 'demo', dependencies: { 'demo-dep': '^1' } },
    },
    packages: {
      'root-tool': ['root-tool@1.0.0', '', { dependencies: { 'tool-transitive': '^1' } }, ''],
      'tool-transitive': ['tool-transitive@1.0.0', '', {}, ''],
      'shipped-dep': ['shipped-dep@1.0.0', '', {}, ''],
      'wip-framework': ['wip-framework@1.0.0', '', {}, ''],
      'demo-dep': ['demo-dep@1.0.0', '', {}, ''],
    },
  };
  writeFileSync(join(dir, 'bun.lock'), JSON.stringify(lock));
  writeFileSync(join(dir, 'audit.json'), JSON.stringify(audit));
  return dir;
}

function run(dir, extraArgs = []) {
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'audit.json'), join(dir, 'bun.lock'), ...extraArgs], {
    encoding: 'utf8',
  });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

const high = (title) => [{ severity: 'high', url: 'https://github.com/advisories/GHSA-test-0000-0000', title }];
const dirs = [];
function withFixture(audit, args = []) {
  const d = fixture({ audit });
  dirs.push(d);
  return run(d, args);
}

console.log('audit-scope.mjs');

// --- POSITIVE CONTROL ------------------------------------------------------
// If this ever passes with exit 0, every other test below is meaningless.
{
  const r = withFixture({ 'shipped-dep': high('in the published closure') });
  check('POSITIVE CONTROL: blocks an in-scope high (exit 1)', r.code === 1, `exit ${r.code}`);
  check('  and names it under BLOCKING', /BLOCKING \(in scope\): 1/.test(r.out));
}

// --- the private-workspace exclusion, both directions ----------------------
{
  const r = withFixture({ 'wip-framework': high('only reachable from a private workspace') });
  check('does not block on a private (never-published) workspace dep', r.code === 0, `exit ${r.code}`);
  check('  reports the exclusion by name', /packages\/wip/.test(r.out));
  check('  does not exclude the published workspace', !/packages\/shipped/.test(r.out));
}

// --- a published workspace's devDeps and transitives stay in scope ---------
{
  const r = withFixture({ 'tool-transitive': high('transitive of root build tooling') });
  check('blocks on a transitive dep of root build tooling', r.code === 1, `exit ${r.code}`);
}

// --- examples/* stays informational ---------------------------------------
{
  const r = withFixture({ 'demo-dep': high('demo app only') });
  check('does not block on an examples/* dep', r.code === 0, `exit ${r.code}`);
}

// --- severity band ---------------------------------------------------------
{
  const r = withFixture({
    'shipped-dep': [{ severity: 'moderate', url: 'https://github.com/advisories/GHSA-test-0000-0001', title: 'mod' }],
  });
  check('does not block below the high band', r.code === 0, `exit ${r.code}`);
}

// --- the ignore list -------------------------------------------------------
{
  const r = withFixture({ 'shipped-dep': high('ignorable') }, ['--ignore=GHSA-test-0000-0000']);
  check('an explicit --ignore suppresses an in-scope high', r.code === 0, `exit ${r.code}`);
  check('  and still lists it as ignored, not silently dropped', /ignored \(in scope[^)]*\): 1/.test(r.out));
}

// --- fail closed on an unreadable manifest ---------------------------------
{
  const d = fixture({ audit: { 'wip-framework': high('private manifest removed') } });
  dirs.push(d);
  rmSync(join(d, 'packages/wip/package.json'));
  const r = run(d);
  check('treats an unreadable workspace manifest as published (fails closed)', r.code === 1, `exit ${r.code}`);
}

for (const d of dirs) rmSync(d, { recursive: true, force: true });
console.log(`\nResults: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
