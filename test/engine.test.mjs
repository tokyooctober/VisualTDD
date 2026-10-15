import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, buildModel, readSpecs, summary, colorWarnings, makeColorLib, DEFAULT_CATEGORIES } from '../visualtdd.mjs';
import { REPO, fixture, model, row, scratch, project, build } from './helpers.mjs';

// ---------- finding tests and their names ----------

// spec: FR-1, FR-2; cat: logic
test('JS: test() and it() are found, nested or not, with string titles kept as written', () => {
  const { model: m } = model('js');
  assert.equal(m.uniqueTests, 5);
  assert.deepEqual(row(m, 'LOGIN').tests.map((t) => t.name), ['shows the sign-in form', 'rejects an empty password', 'keeps the user signed in after reload']);
});

// spec: FR-1, FR-3; cat: logic
test('Kotlin: @Test above or beside the function, annotations between tag and test, @BeforeTest ignored', () => {
  const { model: m, problems } = model('kotlin');
  assert.deepEqual(problems, []);
  assert.equal(m.uniqueTests, 3);
  assert.deepEqual(row(m, 'US-1').tests.map((t) => t.name), ['saves an imported file', 'a broken file shows an error']);
  assert.deepEqual(row(m, 'US-2').tests.map((t) => [t.name, t.cat, t.tier]), [['exports the report as csv', 'integ', 'data']]);
});

// spec: FR-1, FR-7; cat: logic
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

// spec: FR-1, FR-2; cat: logic
test('Java, Swift and Go: tests are found and helpers are not', () => {
  const dir = project({
    'src/test/java/FooTest.java': ['class FooTest {', '  // cat: logic', '  @Test', '  public void addsTwoNumbers() {}', '  void helper() {}', '}'],
    'Tests/BarTests.swift': [
      'final class BarTests: XCTestCase {', '  // cat: logic', '  func testOpensTheFile() {}',
      '  // cat: ui', '  @Test', '  func showsTheBadge() {}', '  func helper() {}', '}',
    ],
    'pkg/parse_test.go': ['package pkg', '// cat: logic', 'func TestParsesInput(t *testing.T) {}', 'func helper(t *testing.T) {}'],
  });
  const { model: m, problems } = build(dir, { languages: ['java', 'swift', 'go'], tiers: ['all'] });
  assert.deepEqual(problems, []);
  assert.deepEqual(m.rows.flatMap((r) => r.tests).map((t) => [t.file, t.name]), [
    ['Tests/BarTests.swift', 'opens the file'], ['Tests/BarTests.swift', 'shows the badge'],
    ['pkg/parse_test.go', 'parses input'],
    ['src/test/java/FooTest.java', 'adds two numbers'],
  ]);
  rmSync(dir, { recursive: true });
});

// spec: FR-1; cat: logic
test('node_modules, build output and dot-folders are skipped, and a single file can be a test root', () => {
  const t = ['// cat: logic', "test('x', () => {});"];
  const dir = project({ 'a.test.js': t, 'node_modules/p/b.test.js': t, 'dist/c.test.js': t, '.cache/d.test.js': t, 'src/e.test.js': t, 'other/f.test.js': t });
  const all = build(dir, { languages: ['js'], tiers: ['all'] });
  assert.deepEqual(all.model.rows.map((r) => r.id), ['.', 'other', 'src']);
  const one = build(dir, { languages: ['js'], tiers: ['all'], testRoots: ['src/e.test.js', 'src'] });
  assert.equal(one.model.uniqueTests, 1, 'a file listed twice is read once');
  rmSync(dir, { recursive: true });
});

// spec: FR-2; cat: logic
test('function names become words: snake_case, camelCase, acronyms and the test prefix; JS titles stay as written', () => {
  const dir = project({
    'tests/test_names.py': [
      '# cat: logic', 'def test_saves_the_file():', '    pass',
      '# cat: logic', 'def testLoadsTheFile():', '    pass',
      '# cat: logic', 'def test_HTTPServerStarts():', '    pass',
    ],
    'src/names.test.js': ['// cat: logic', "test('keeps snake_case_words and CamelCase', () => {});"],
  });
  const { model: m } = build(dir, { languages: ['python', 'js'], tiers: ['all'] });
  assert.deepEqual(m.rows.flatMap((r) => r.tests).map((t) => t.name), [
    'keeps snake_case_words and CamelCase', 'saves the file', 'loads the file', 'http server starts',
  ]);
  rmSync(dir, { recursive: true });
});

// ---------- tags ----------

// spec: FR-3; cat: logic
test('a test that cites two specs is counted in both rows but once in the total', () => {
  const { model: m } = model('js');
  assert.equal(row(m, 'CART').tests.length, 2);
  assert.equal(row(m, 'PAY').tests.length, 1);
  assert.equal(m.uniqueTests, 5);
});

// spec: FR-3; cat: input
test('tag fields may come in any order and with any spacing', () => {
  const dir = project({ 'src/domain/a.test.js': ['  //tier:data ;cat :  logic;  spec:  A ,B  ', "  test('x', () => {});"] });
  const { model: m, problems } = build(dir, { languages: ['js'], specs: { source: 'list', items: [{ id: 'A' }, { id: 'B' }] }, tiers: ['domain', 'data'] });
  assert.deepEqual(problems, []);
  assert.deepEqual(m.rows.map((r) => [r.id, r.tests.map((t) => [t.cat, t.tier])]), [['A', [['logic', 'data']]], ['B', [['logic', 'data']]]]);
  rmSync(dir, { recursive: true });
});

// spec: FR-3, FR-4; cat: err
test('a tag must sit directly above the test: a blank line or code in between counts as no tag', () => {
  const dir = project({ 'a.test.js': ['// cat: logic', '', "test('after a blank line', () => {});", '// cat: logic', 'const x = 1;', "test('after code', () => {});"] });
  const { model: m, problems } = build(dir, { languages: ['js'], tiers: ['all'] });
  assert.equal(m.uniqueTests, 0);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /^a\.test\.js:3 .*"after a blank line"/);
  assert.match(problems[1], /^a\.test\.js:6 .*"after code"/);
  rmSync(dir, { recursive: true });
});

// spec: FR-4; cat: err
test('an untagged test is reported with its file and line, and left out', () => {
  const { model: m, problems } = model('js');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /src\/domain\/cart\.spec\.ts:7 .*no "\/\/ spec: \.\.\.; cat: \.\.\." line above "has no tag"/);
  assert.ok(!m.rows.flatMap((r) => r.tests).some((t) => t.name === 'has no tag'));
});

// spec: FR-4; cat: input
test('unknown category, unknown tier and unknown spec id are each reported', () => {
  const dir = scratch('js');
  writeFileSync(join(dir, 'src', 'ui', 'bad.test.js'), [
    '// spec: LOGIN; cat: speed', "test('a', () => {});",
    '// spec: LOGIN; cat: ui; tier: cloud', "test('b', () => {});",
    '// spec: NOPE; cat: ui', "test('c', () => {});",
  ].join('\n'));
  const { cfg } = loadConfig(JSON.parse(readFileSync(join(dir, 'visualtdd.config.json'), 'utf8')), dir);
  const { problems } = buildModel(cfg);
  assert.ok(problems.some((p) => /unknown cat "speed"/.test(p)));
  assert.ok(problems.some((p) => /unknown tier "cloud"/.test(p)));
  assert.ok(problems.some((p) => /"NOPE" is not a known spec id/.test(p)));
  rmSync(dir, { recursive: true });
});

// spec: FR-4; cat: input
test('with a spec list, a tag with no spec id is reported; without one, a spec id is optional', () => {
  const dir = project({ 'a.test.js': ['// cat: logic', "test('x', () => {});"] });
  const withList = build(dir, { languages: ['js'], tiers: ['all'], specs: { source: 'list', items: [{ id: 'A' }] } });
  assert.match(withList.problems[0], /a\.test\.js:2 +no spec id/);
  assert.deepEqual(build(dir, { languages: ['js'], tiers: ['all'] }).problems, []);
  rmSync(dir, { recursive: true });
});

// ---------- tiers ----------

// spec: FR-5; cat: logic
test('JS: the tier comes from the path, the category from the tag', () => {
  const { model: m } = model('js');
  assert.deepEqual(row(m, 'LOGIN').tests.map((t) => [t.tier, t.cat]), [['ui', 'ui'], ['ui', 'input'], ['ui', 'data']]);
  assert.deepEqual(row(m, 'CART').tests.map((t) => t.tier), ['domain', 'domain']);
});

// spec: FR-5; cat: logic
test('the tier comes from the tag first, then the first matching path rule, then defaultTier', () => {
  const tagged = (tier) => [tier ? `// cat: logic; tier: ${tier}` : '// cat: logic', "test('x', () => {});"];
  const dir = project({ 'api/a.test.js': tagged('ui'), 'api/ui/b.test.js': tagged(), 'lib/c.test.js': tagged() });
  const { model: m } = build(dir, {
    languages: ['js'], tiers: ['ui', 'data', 'domain'], defaultTier: 'domain',
    tierFromPath: [{ pattern: '(^|/)api/', tier: 'data' }, { pattern: '(^|/)ui/', tier: 'ui' }],
  });
  assert.deepEqual(m.rows.flatMap((r) => r.tests).map((t) => [t.file, t.tier]), [['api/a.test.js', 'ui'], ['api/ui/b.test.js', 'data'], ['lib/c.test.js', 'domain']]);
  rmSync(dir, { recursive: true });
});

// spec: FR-5; cat: err
test('with several tiers and no rule or default, a test without a tier is reported', () => {
  const dir = project({ 'lib/a.test.js': ['// cat: logic', "test('x', () => {});"] });
  const { problems } = build(dir, { languages: ['js'], tiers: ['ui', 'data'] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /lib\/a\.test\.js:2 +the path does not decide the tier; add "tier: \.\.\." \(ui, data\)/);
  rmSync(dir, { recursive: true });
});

// ---------- specs ----------

// spec: FR-6; cat: logic
test('Markdown specs: read from table rows, sorted by group then number, empty specs kept as gaps', () => {
  const { model: m } = model('kotlin');
  assert.deepEqual(m.rows.map((r) => [r.id, r.name, r.group, r.tests.length]), [
    ['US-1', 'Import', 'User stories', 2], ['US-2', 'Export', 'User stories', 1], ['US-10', 'Undo', 'User stories', 0],
  ]);
});

// spec: FR-6; cat: logic
test('Markdown specs: several files, a repeated id kept once, groups in config order, unknown prefixes last', () => {
  const dir = project({
    'a.md': ['| ID | x |', '|---|---|', '| NFR-1 Fast | ... |', '| FR-2 Second | ... |', 'FR-9 not in a table', '| TASK-1 Setup | ... |'],
    'b.md': ['| FR-1 First | ... |', '| FR-2 Second again | ... |'],
  });
  const { cfg } = loadConfig({ specs: { source: 'markdown', files: ['a.md', 'b.md'], idPattern: '(?<prefix>[A-Z]+)-(?<num>\\d+)', groups: { FR: 'Functional', NFR: 'Non-functional' } } }, dir);
  assert.deepEqual(readSpecs(cfg).map((s) => [s.id, s.name, s.group]), [
    ['FR-1', 'First', 'Functional'], ['FR-2', 'Second', 'Functional'], ['NFR-1', 'Fast', 'Non-functional'], ['TASK-1', 'Setup', 'TASK specs'],
  ]);
  rmSync(dir, { recursive: true });
});

// spec: FR-7; cat: logic
test('a spec list in the config keeps its order and groups, and specs with no tests stay as rows', () => {
  const dir = project({ 'a.test.js': ['// spec: B; cat: logic', "test('x', () => {});"] });
  const { model: m } = build(dir, { languages: ['js'], tiers: ['all'], specs: { source: 'list', items: [{ id: 'C', name: 'Third', group: 'G2' }, { id: 'A' }, { id: 'B', group: 'G2' }] } });
  assert.deepEqual(m.rows.map((r) => [r.id, r.name, r.group, r.tests.length]), [['C', 'Third', 'G2', 0], ['A', '', 'Specs', 0], ['B', '', 'G2', 1]]);
  rmSync(dir, { recursive: true });
});

// spec: FR-8; cat: logic
test('extra specs are accepted in tags and get a row only when a test cites them', () => {
  const dir = project({ 'a.test.js': ['// spec: SETUP; cat: logic', "test('x', () => {});"] });
  const { model: m, problems } = build(dir, {
    languages: ['js'], tiers: ['all'], specs: { source: 'list', items: [{ id: 'A' }] },
    extraSpecs: { group: 'No requirement', items: { SETUP: 'Tooling', SPIKE: 'Experiment' } },
  });
  assert.deepEqual(problems, []);
  assert.deepEqual(m.rows.map((r) => [r.id, r.name, r.group, r.kind, r.tests.length]), [['A', '', 'Specs', 'spec', 0], ['SETUP', 'Tooling', 'No requirement', 'extra', 1]]);
  rmSync(dir, { recursive: true });
});

// spec: FR-8; cat: input
test('an unknown spec id lists the extra specs that are allowed', () => {
  const dir = project({ 'a.test.js': ['// spec: NOPE; cat: logic', "test('x', () => {});"] });
  const { problems } = build(dir, { languages: ['js'], tiers: ['all'], specs: { source: 'list', items: [{ id: 'A' }] }, extraSpecs: { items: { SETUP: 'Tooling' } } });
  assert.match(problems[0], /"NOPE" is not a known spec id or extra spec \(SETUP\)/);
  rmSync(dir, { recursive: true });
});

// ---------- config ----------

// spec: FR-9; cat: logic
test('an empty config gets every default', () => {
  const { cfg, problems } = loadConfig({}, fixture('js'));
  assert.deepEqual(problems, []);
  assert.equal(cfg.title, 'Test map');
  assert.equal(cfg.output, 'docs/test-map.html');
  assert.deepEqual(cfg.testRoots, ['.']);
  assert.deepEqual(cfg.languages.map((l) => l.name), ['js', 'kotlin', 'java', 'python', 'swift', 'go']);
  assert.deepEqual(cfg.categories.map((c) => c.k), DEFAULT_CATEGORIES.map((c) => c.k));
  assert.deepEqual(cfg.tiers.map((t) => t.k), ['ui', 'domain', 'data']);
  assert.equal(cfg.tierFromPath.length, 3);
  assert.equal(cfg.specs.source, 'none');
});

// spec: FR-9; cat: input
test('config mistakes are reported: unknown preset, bad spec source, a tier rule naming an unknown tier', () => {
  const { problems } = loadConfig({ languages: ['cobol'], specs: { source: 'jira' }, tiers: ['ui'], tierFromPath: [{ pattern: 'x', tier: 'backend' }] }, fixture('js'));
  assert.equal(problems.length, 3);
  assert.match(problems[0], /unknown language preset "cobol"/);
  assert.match(problems[1], /tierFromPath names tier "backend", which is not in "tiers"/);
  assert.match(problems[2], /specs\.source must be "markdown", "list" or "none"/);
});

// spec: FR-9; cat: logic
test('a language object overrides its preset, and a custom language needs no preset', () => {
  const dir = project({
    'a.test.js': ['// cat: logic', "test('plain', () => {});"],
    'b.check.js': ['// cat: logic', "test('checked', () => {});"],
    'c.feature': ['# cat: ui', 'Scenario: signs in'],
  });
  const { model: m } = build(dir, {
    tiers: ['all'],
    languages: [
      { preset: 'js', files: '\\.check\\.js$' },
      { name: 'gherkin', files: '\\.feature$', marker: '^Scenario: (.*)$', nameGroup: 1, comment: '#' },
    ],
  });
  assert.deepEqual(m.rows.flatMap((r) => r.tests).map((t) => t.name), ['checked', 'signs in']);
  rmSync(dir, { recursive: true });
});

// ---------- colours ----------

// spec: NFR-2; cat: ui
test('the default colours raise no warning in either theme', () => {
  assert.deepEqual(colorWarnings(DEFAULT_CATEGORIES), []);
});

// spec: FR-10; cat: ui
test('a configured colour replaces the default, keeps its name, and gets readable text', () => {
  const { cfg } = loadConfig({ categories: ['ui', { k: 'logic', color: '#ffee00' }] }, fixture('js'));
  const logic = cfg.categories.find((c) => c.k === 'logic');
  assert.equal(logic.name, 'Functional / Logic');
  assert.equal(logic.color, '#ffee00');
  assert.equal(logic.colorDark, '#ffee00');
  assert.equal(logic.text, '#0b0b0b');
  assert.equal(makeColorLib().textOn('#101060'), '#ffffff');
});

// spec: FR-10; cat: err
test('two neighbouring colours that are too close are named in a warning', () => {
  const { cfg } = loadConfig({ categories: [{ k: 'ui', color: '#2a78d6' }, { k: 'logic', color: '#2f7fd9' }] }, fixture('js'));
  const w = colorWarnings(cfg.categories);
  assert.equal(w.length, 2); // light and dark
  assert.match(w[0], /light theme: "UI \/ Visual" and "Functional \/ Logic"/);
});

// spec: FR-10; cat: ui
test('a red-green pair that differs for normal vision is still flagged for colour-blind readers', () => {
  const c = makeColorLib();
  const found = c.clashes([{ k: 'red', hex: '#d73027' }, { k: 'green', hex: '#1a9850' }]);
  assert.equal(found.length, 1);
  assert.ok(found[0].normal >= 15, `normal vision ${found[0].normal}`);
  assert.ok(found[0].cvd < 8, `colour-blind ${found[0].cvd}`);
  assert.deepEqual(c.clashes([{ k: 'a', hex: '#2a78d6' }, { k: 'b', hex: '#eb6834' }]), [], 'blue and orange stay apart');
});

// spec: FR-10; cat: input
test('a new category without a colour, or with a bad one, is a config problem', () => {
  const { problems } = loadConfig({ categories: [{ k: 'a11y', name: 'Accessibility' }, { k: 'ui', color: 'blue' }] }, fixture('js'));
  assert.ok(problems.some((p) => /"a11y" needs a "color"/.test(p)));
  assert.ok(problems.some((p) => /"ui" color "blue" is not a hex colour/.test(p)));
});

// ---------- summary ----------

// spec: FR-12; cat: logic
test('the summary counts tests and covered specs, and lists only rows with tests', () => {
  const { model: m } = model('kotlin');
  const lines = summary(m).split('\n');
  assert.equal(lines[0], '3 tagged tests');
  assert.equal(lines[1], '2 of 3 specs have at least one test; 1 have none');
  assert.match(lines[3], /^ +ui +input +logic +perf +data +integ +sec +err +total$/);
  assert.deepEqual(lines.slice(4).map((l) => l.split(/ +/)), [
    ['US-1', 'Import', '.', '.', '.', '.', '1', '.', '.', '1', '2'],
    ['US-2', 'Export', '.', '.', '.', '.', '.', '1', '.', '.', '1'],
  ]);
});

// ---------- platform, dependencies and speed ----------

// spec: NFR-1; cat: integ
test('the tool has no package dependencies and imports only Node built-ins', () => {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.engines.node, '>=22');
  const imports = [...readFileSync(join(REPO, 'visualtdd.mjs'), 'utf8').matchAll(/^import .* from '([^']+)';/gm)].map((x) => x[1]);
  assert.ok(imports.length > 0);
  assert.deepEqual(imports.filter((s) => !s.startsWith('node:')), []);
});

// spec: NFR-5; cat: logic
test('file paths in tests and problems use forward slashes on every platform', () => {
  const { model: m, problems } = model('kotlin');
  const { problems: jsProblems } = model('js');
  const paths = [...m.rows.flatMap((r) => r.tests.map((t) => t.file)), ...problems, ...jsProblems];
  assert.ok(paths.length > 0);
  for (const p of paths) assert.ok(!p.includes('\\'), p);
  assert.equal(row(m, 'US-2').tests[0].file, 'app/src/test/kotlin/data/RepoTest.kt');
});

// spec: NFR-6; cat: perf
test('scans 1,000 test files with 5,000 tests in under 2 seconds', () => {
  const dir = project({});
  const body = Array.from({ length: 5 }, (_, i) => `// spec: S${i}; cat: logic\ntest('case ${i}', () => {});`).join('\n');
  for (let d = 0; d < 20; d++) {
    mkdirSync(join(dir, `m${d}`));
    for (let f = 0; f < 50; f++) writeFileSync(join(dir, `m${d}`, `f${f}.test.js`), body);
  }
  assert.equal(readdirSync(dir).length, 20);
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `S${i}` }));
  const start = performance.now();
  const { model: m } = build(dir, { languages: ['js'], tiers: ['all'], specs: { source: 'list', items } });
  const ms = performance.now() - start;
  assert.equal(m.uniqueTests, 5000);
  assert.ok(ms < 2000, `took ${Math.round(ms)} ms`);
  rmSync(dir, { recursive: true });
});
