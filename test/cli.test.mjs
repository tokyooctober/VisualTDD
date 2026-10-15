import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initConfig } from '../visualtdd.mjs';
import { REPO, fixture, run, scratch, project } from './helpers.mjs';

// spec: FR-4, FR-13, FR-14; cat: err
test('the normal run warns and writes the page (exit 0); --check fails (exit 1) and writes nothing', () => {
  const dir = scratch('js');
  const normal = run([], dir);
  assert.equal(normal.status, 0);
  assert.match(normal.stderr, /WARNING: 1 test tag problem/);
  assert.ok(existsSync(join(dir, 'docs', 'test-map.html')));
  rmSync(join(dir, 'docs'), { recursive: true });
  const strict = run(['--check'], dir);
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /1 problem\(s\)/);
  assert.ok(!existsSync(join(dir, 'docs')));
  rmSync(dir, { recursive: true });
});

// spec: FR-12, FR-14; cat: logic
test('--check passes on a fully tagged project and prints the summary', () => {
  const r = run(['--check'], fixture('kotlin'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /3 tagged tests/);
  assert.match(r.stdout, /2 of 3 specs have at least one test/);
});

// spec: FR-14; cat: integ
test("VisualTDD's own tests are all tagged with a spec from docs/spec.md", () => {
  const r = run(['--check'], REPO);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\d+ tagged tests/);
});

// spec: FR-13; cat: data
test('the page goes to "output" under the project root, and missing folders are created', () => {
  const dir = scratch('kotlin');
  writeFileSync(join(dir, 'visualtdd.config.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(dir, 'visualtdd.config.json'), 'utf8')), output: 'site/reports/map.html' }));
  const r = run([], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(dir, 'site', 'reports', 'map.html')));
  assert.match(r.stdout, /wrote .*map\.html/);
  rmSync(dir, { recursive: true });
});

// spec: FR-15; cat: data
test('--init detects the languages and test folders and never overwrites a config', () => {
  const dir = scratch('python');
  rmSync(join(dir, 'visualtdd.config.json'));
  const first = run(['--init'], dir);
  assert.equal(first.status, 0, first.stderr);
  const cfg = JSON.parse(readFileSync(join(dir, 'visualtdd.config.json'), 'utf8'));
  assert.deepEqual(cfg.languages, ['python']);
  assert.deepEqual(cfg.testRoots, ['tests']);
  const before = readFileSync(join(dir, 'visualtdd.config.json'), 'utf8');
  const second = run(['--init'], dir);
  assert.equal(second.status, 1);
  assert.match(second.stderr, /already exists; not overwriting it/);
  assert.equal(readFileSync(join(dir, 'visualtdd.config.json'), 'utf8'), before);
  assert.deepEqual(initConfig(fixture('js')).languages, ['js']);
  rmSync(dir, { recursive: true });
});

// spec: FR-15; cat: logic
test('--init in a folder with no tests falls back to every language and the whole folder', () => {
  const dir = project({ 'README.md': '# nothing to test' });
  const cfg = initConfig(dir);
  assert.deepEqual(cfg.testRoots, ['.']);
  assert.deepEqual(cfg.languages, ['js', 'kotlin', 'java', 'python', 'swift', 'go']);
  rmSync(dir, { recursive: true });
});

// spec: FR-16; cat: integ
test('--json prints the model and writes no page', () => {
  const dir = scratch('kotlin');
  const r = run(['--json'], dir);
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(r.stdout);
  assert.equal(m.title, 'Kotlin fixture');
  assert.equal(m.uniqueTests, 3);
  assert.deepEqual(m.rows.map((x) => x.id), ['US-1', 'US-2', 'US-10']);
  assert.ok(!existsSync(join(dir, 'docs')));
  rmSync(dir, { recursive: true });
});

// spec: FR-17; cat: logic
test('--config reads another file, and its folder is the project root', () => {
  const dir = project({ 'elsewhere/x.txt': '' });
  const r = run(['--config', join(fixture('kotlin'), 'visualtdd.config.json'), '--check'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /3 tagged tests/);
  rmSync(dir, { recursive: true });
});

// spec: FR-17; cat: err
test('a missing config ends with a hint to run --init', () => {
  const dir = project({});
  const r = run([], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no visualtdd\.config\.json; run with --init to create one/);
  rmSync(dir, { recursive: true });
});

// spec: FR-17; cat: err
test('an unreadable config or a missing spec file ends with one line and exit 1, not a stack trace', () => {
  const bad = project({ 'visualtdd.config.json': '{ "title": ' });
  const r1 = run([], bad);
  assert.equal(r1.status, 1);
  assert.match(r1.stderr, /visualtdd\.config\.json/);
  assert.doesNotMatch(r1.stderr, /\n\s+at /);
  const noSpec = project({ 'visualtdd.config.json': { specs: { source: 'markdown', files: ['docs/missing.md'] } } });
  const r2 = run([], noSpec);
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /missing\.md/);
  assert.doesNotMatch(r2.stderr, /\n\s+at /);
  rmSync(bad, { recursive: true });
  rmSync(noSpec, { recursive: true });
});

// spec: FR-9; cat: err
test('a config mistake stops the run with exit 1 and writes no page', () => {
  const dir = project({ 'visualtdd.config.json': { languages: ['cobol'] } });
  const r = run([], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown language preset "cobol"/);
  assert.ok(!existsSync(join(dir, 'docs')));
  rmSync(dir, { recursive: true });
});

// spec: FR-10; cat: err
test('a colour clash is printed as a warning but does not fail --check', () => {
  const dir = project({
    'visualtdd.config.json': { tiers: ['all'], categories: [{ k: 'ui', color: '#2a78d6' }, { k: 'logic', color: '#2f7fd9' }] },
    'a.test.js': ['// cat: ui', "test('x', () => {});"],
  });
  const r = run(['--check'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /WARNING: light theme: "UI \/ Visual" and "Functional \/ Logic"/);
  rmSync(dir, { recursive: true });
});
