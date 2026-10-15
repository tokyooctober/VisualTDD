import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, buildModel, colorWarnings, makeColorLib, DEFAULT_CATEGORIES, initConfig } from '../tddmap.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'tddmap.mjs');
const fixture = (name) => join(HERE, 'fixtures', name);

function model(name, overrides = {}) {
  const dir = fixture(name);
  const raw = { ...JSON.parse(readFileSync(join(dir, 'tddmap.config.json'), 'utf8')), ...overrides };
  const { cfg, problems } = loadConfig(raw, dir);
  assert.deepEqual(problems, []);
  return buildModel(cfg);
}
const row = (m, id) => m.rows.find((r) => r.id === id);
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

/** Copies a fixture to a temp dir so a run can write its page there. */
function scratch(name) {
  const dir = mkdtempSync(join(tmpdir(), 'tddmap-'));
  cpSync(fixture(name), dir, { recursive: true });
  return dir;
}

// spec: CLI; cat: logic
test('JS: test() and it() are found, nested or not, with string titles kept as written', () => {
  const { model: m } = model('js');
  assert.equal(m.uniqueTests, 5);
  assert.deepEqual(row(m, 'LOGIN').tests.map((t) => t.name), ['shows the sign-in form', 'rejects an empty password', 'keeps the user signed in after reload']);
});

// spec: CLI; cat: logic
test('JS: the tier comes from the path, the category from the tag', () => {
  const { model: m } = model('js');
  assert.deepEqual(row(m, 'LOGIN').tests.map((t) => [t.tier, t.cat]), [['ui', 'ui'], ['ui', 'input'], ['ui', 'data']]);
  assert.deepEqual(row(m, 'CART').tests.map((t) => t.tier), ['domain', 'domain']);
});

// spec: CLI; cat: logic
test('a test that cites two specs is counted in both rows but once in the total', () => {
  const { model: m } = model('js');
  assert.equal(row(m, 'CART').tests.length, 2);
  assert.equal(row(m, 'PAY').tests.length, 1);
  assert.equal(m.uniqueTests, 5);
});

// spec: CLI; cat: err
test('an untagged test is reported with its file and line, and left out', () => {
  const { model: m, problems } = model('js');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /src\/domain\/cart\.spec\.ts:7 .*no "\/\/ spec: \.\.\.; cat: \.\.\." line above "has no tag"/);
  assert.ok(!m.rows.flatMap((r) => r.tests).some((t) => t.name === 'has no tag'));
});

// spec: CLI; cat: input
test('unknown category, unknown tier and unknown spec id are each reported', () => {
  const dir = scratch('js');
  writeFileSync(join(dir, 'src', 'ui', 'bad.test.js'), [
    '// spec: LOGIN; cat: speed', "test('a', () => {});",
    '// spec: LOGIN; cat: ui; tier: cloud', "test('b', () => {});",
    '// spec: NOPE; cat: ui', "test('c', () => {});",
  ].join('\n'));
  const { cfg } = loadConfig(JSON.parse(readFileSync(join(dir, 'tddmap.config.json'), 'utf8')), dir);
  const { problems } = buildModel(cfg);
  assert.ok(problems.some((p) => /unknown cat "speed"/.test(p)));
  assert.ok(problems.some((p) => /unknown tier "cloud"/.test(p)));
  assert.ok(problems.some((p) => /"NOPE" is not a known spec id/.test(p)));
  rmSync(dir, { recursive: true });
});

// spec: CLI; cat: logic
test('Kotlin: @Test above or beside the function, annotations between tag and test, @BeforeTest ignored', () => {
  const { model: m, problems } = model('kotlin');
  assert.deepEqual(problems, []);
  assert.equal(m.uniqueTests, 3);
  assert.deepEqual(row(m, 'US-1').tests.map((t) => t.name), ['saves an imported file', 'a broken file shows an error']);
  assert.deepEqual(row(m, 'US-2').tests.map((t) => [t.name, t.cat, t.tier]), [['exports the report as csv', 'integ', 'data']]);
});

// spec: CLI; cat: logic
test('Markdown specs: read from table rows, sorted by group then number, empty specs kept as gaps', () => {
  const { model: m } = model('kotlin');
  assert.deepEqual(m.rows.map((r) => [r.id, r.name, r.group, r.tests.length]), [
    ['US-1', 'Import', 'User stories', 2], ['US-2', 'Export', 'User stories', 1], ['US-10', 'Undo', 'User stories', 0],
  ]);
});

// spec: CLI; cat: logic
test('Python: def and async def test_ functions, decorators skipped, helpers ignored, no spec list needed', () => {
  const { model: m, problems } = model('python');
  assert.deepEqual(problems, []);
  assert.equal(m.uniqueTests, 3);
  assert.equal(m.specMode, 'none');
  assert.deepEqual(m.rows.map((r) => r.id), ['tests']);
  assert.deepEqual(m.rows[0].tests.map((t) => [t.name, t.cat, t.tier]), [
    ['rejects negative numbers', 'input', 'all'], ['parses two numbers', 'logic', 'all'], ['large file', 'perf', 'all'],
  ]);
});

// spec: CLI; cat: err
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

// spec: CLI; cat: logic
test('--check passes on a fully tagged project', () => {
  const r = run(['--check'], fixture('kotlin'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /3 tagged tests/);
});

// spec: CLI; cat: data
test('the page carries the model, the title and the colour checks, and has no placeholders left', () => {
  const dir = scratch('kotlin');
  run([], dir);
  const html = readFileSync(join(dir, 'docs', 'test-map.html'), 'utf8');
  assert.match(html, /<title>Kotlin fixture<\/title>/);
  assert.ok(!html.includes('/*__DATA__*/') && !html.includes('/*__COLOR_LIB__*/'));
  assert.match(html, /var makeColorLib = function makeColorLib\(\)/);
  const data = JSON.parse(html.match(/var DATA = (.*);\n/)[1]);
  assert.equal(data.uniqueTests, 3);
  rmSync(dir, { recursive: true });
});

// spec: CLI; cat: data
test('--init detects the languages and test folders and never overwrites a config', () => {
  const dir = scratch('python');
  rmSync(join(dir, 'tddmap.config.json'));
  const first = run(['--init'], dir);
  assert.equal(first.status, 0, first.stderr);
  const cfg = JSON.parse(readFileSync(join(dir, 'tddmap.config.json'), 'utf8'));
  assert.deepEqual(cfg.languages, ['python']);
  assert.deepEqual(cfg.testRoots, ['tests']);
  assert.equal(run(['--init'], dir).status, 1);
  assert.deepEqual(initConfig(fixture('js')).languages, ['js']);
  rmSync(dir, { recursive: true });
});

// spec: COLORS; cat: ui
test('the default colours raise no warning in either theme', () => {
  assert.deepEqual(colorWarnings(DEFAULT_CATEGORIES), []);
});

// spec: COLORS; cat: ui
test('a configured colour replaces the default, keeps its name, and gets readable text', () => {
  const { cfg } = loadConfig({ categories: ['ui', { k: 'logic', color: '#ffee00' }] }, fixture('js'));
  const logic = cfg.categories.find((c) => c.k === 'logic');
  assert.equal(logic.name, 'Functional / Logic');
  assert.equal(logic.color, '#ffee00');
  assert.equal(logic.colorDark, '#ffee00');
  assert.equal(logic.text, '#0b0b0b');
  assert.equal(makeColorLib().textOn('#101060'), '#ffffff');
});

// spec: COLORS; cat: err
test('two neighbouring colours that are too close are named in a warning', () => {
  const { cfg } = loadConfig({ categories: [{ k: 'ui', color: '#2a78d6' }, { k: 'logic', color: '#2f7fd9' }] }, fixture('js'));
  const w = colorWarnings(cfg.categories);
  assert.equal(w.length, 2); // light and dark
  assert.match(w[0], /light theme: "UI \/ Visual" and "Functional \/ Logic"/);
});

// spec: COLORS; cat: input
test('a new category without a colour, or with a bad one, is a config problem', () => {
  const { problems } = loadConfig({ categories: [{ k: 'a11y', name: 'Accessibility' }, { k: 'ui', color: 'blue' }] }, fixture('js'));
  assert.ok(problems.some((p) => /"a11y" needs a "color"/.test(p)));
  assert.ok(problems.some((p) => /"ui" color "blue" is not a hex colour/.test(p)));
});
