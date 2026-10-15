// Scenario tests: each folder in test/scenarios is a small project plus expected.json, which says what the
// dashboard must draw for it. Each requirement gets its own test below, checking its part of the generated
// page, so it shows in the Page column of VisualTDD's own map. To cover a new case, add tests to a scenario
// project, then update its expected.json by hand. See test/scenarios/README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, buildModel, render } from '../visualtdd.mjs';
import { HERE, run, openPage } from './helpers.mjs';

const SCENARIOS = join(HERE, 'scenarios');
const CHECKED = ['happy', 'negative'];
const UNIT = 10; // px per test, as in template.html
// UPDATE_SCENARIOS=1 npm test rewrites each expected.json from what is drawn now. Review the git diff before committing.
const UPDATE = process.env.UPDATE_SCENARIOS === '1';

const text = (html) => String(html).replace(/<[^>]+>/g, '');
const catOf = (seg) => seg.style.background.match(/^var\(--c-(.+)\)$/)[1];

/** Reads back what the page drew, in the shape of expected.json. Also checks every bar's width against the one scale. */
function drawn(page, model, tooltipsWanted) {
  const G = page.$('G');
  const head = G.innerHTML;
  const ruler = [...head.matchAll(/<span style="left:\d+px">(\d+)<\/span>/g)].map((m) => Number(m[1]));
  const rulerMax = ruler.at(-1);
  const segsOf = (bar) => bar.children.map((seg) => {
    assert.equal(seg.style.width, `${Number(seg.innerHTML) * UNIT}px`, 'a segment is n tests times one unit wide');
    return seg;
  });
  const label = (segs) => segs.map((s) => `${catOf(s)} ${s.innerHTML}`);
  const hover = (seg) => { seg.dispatch('mouseenter'); return page.$('tip').textContent.split('\n'); };

  const rows = [], cells = {}, names = {};
  let group = null;
  for (const tr of G.children.filter((c) => c.tagName === 'TR' && c.children.length)) {
    if (tr.className === 'grp') { group = text(tr.children[0].innerHTML); continue; }
    const [specTd, allTd, ...tierTds] = tr.children;
    const spec = text(specTd.innerHTML);
    const id = specTd.innerHTML.match(/<b>(.*?)<\/b>/)[1];
    const inner = allTd.children[0].children;
    if (inner[0].className === 'gapbar') {
      assert.equal(tierTds.length, model.tiers.length > 1 ? 1 : 0, 'an empty spec has one blank cell across the tier columns');
      rows.push({ group, spec, total: 0, all: text(inner[0].innerHTML), tiers: null });
      names[id] = [];
      continue;
    }
    const [track, count] = inner;
    assert.equal(track.style.width, `${rulerMax * UNIT}px`, 'every track is as wide as the ruler');
    const all = segsOf(track.children[0]);
    cells[`${id}|all tiers`] = all;
    // Every test name the page shows for this row: the tooltips of its All-tiers segments, in drawing order.
    names[id] = all.flatMap((seg) => hover(seg).slice(1).map((l) => l.replace(/^• /, '')));
    const tiers = {};
    model.tiers.forEach((t, i) => {
      const td = tierTds[i];
      if (td.className.includes('zero')) { tiers[t.name] = td.textContent; return; }
      tiers[t.name] = label(cells[`${id}|${t.name}`] = segsOf(td.children[0]));
    });
    rows.push({ group, spec, total: Number(count.innerHTML), all: label(all), tiers: model.tiers.length > 1 ? tiers : null });
  }

  const tooltips = tooltipsWanted.map(({ spec, column, cat }) => {
    const seg = (cells[`${spec}|${column}`] ?? []).find((s) => catOf(s) === cat);
    assert.ok(seg, `no ${cat} segment drawn for ${spec} in "${column}"`);
    const lines = hover(seg);
    assert.equal(seg.getAttribute('aria-label'), lines.join(', '), 'screen readers get the same text');
    return { spec, column, cat, lines };
  });

  return {
    stats: [...page.$('stats').innerHTML.matchAll(/<span>(.*?)<\/span>/g)].map((m) => text(m[1])),
    rulerMax,
    tierHeaders: [...head.matchAll(/<th[^>]*>([^<]*) · (\d+)<small>/g)].map(([, name, n]) => [name, Number(n)]),
    names,
    rows,
    tooltips,
  };
}

const cache = new Map();
/** Builds a scenario's project, renders and runs its page once, and returns { dir, expected, actual }. */
function scenario(name) {
  if (cache.has(name)) return cache.get(name);
  const dir = join(SCENARIOS, name);
  const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'));
  const { cfg, problems: configProblems } = loadConfig(JSON.parse(readFileSync(join(dir, 'visualtdd.config.json'), 'utf8')), dir);
  assert.deepEqual(configProblems, []);
  const { model, problems } = buildModel(cfg);
  const actual = { problems, ...drawn(openPage(render(model)), model, expected.tooltips ?? []) };
  const result = { dir, expected, actual };
  cache.set(name, result);
  return result;
}

/** Compares only the named parts of a scenario's page with its expected.json. */
function check(name, keys) {
  const { expected, actual } = scenario(name);
  for (const k of keys) assert.deepEqual(actual[k], expected[k], `${name}: "${k}" differs from expected.json`);
}

/** Compares the whole page with expected.json, or rewrites expected.json in update mode. */
function checkAll(name) {
  const { dir, expected, actual } = scenario(name);
  if (UPDATE) { writeFileSync(join(dir, 'expected.json'), JSON.stringify({ about: expected.about, ...actual }, null, 2) + '\n'); return; }
  const { about, ...want } = expected;
  assert.deepEqual(actual, want);
}

const order = (rows) => rows.map((r) => `${r.group} / ${r.spec}`);

// ---------- happy scenario: each requirement, checked in the generated page ----------

// spec: FR-1; cat: logic
test('happy page: every tagged test found in the JS, Python and Kotlin files is drawn, by name, and nothing else', () => {
  check('happy', ['stats', 'names']);
});

// spec: FR-2; cat: ui
test('happy page: tooltips show JS titles as written and Python and Kotlin function names as words', () => {
  check('happy', ['names', 'tooltips']);
});

// spec: FR-3; cat: logic
test('happy page: a test citing two specs is drawn in both rows but counted once in the totals', () => {
  const { actual } = scenario('happy');
  for (const id of ['FR-2', 'FR-3']) assert.ok(actual.names[id].includes('applies a discount before payment'), id);
  check('happy', ['tierHeaders', 'stats']);
});

// spec: FR-5; cat: logic
test('happy page: each test sits in the tier column its tag, its path or defaultTier gives', () => {
  check('happy', ['rows', 'tierHeaders']);
});

// spec: FR-6, FR-8; cat: logic
test("happy page: rows follow the spec file's groups and numbers, with only the cited extra spec added last", () => {
  const { expected, actual } = scenario('happy');
  assert.deepEqual(order(actual.rows), order(expected.rows));
  assert.ok(!order(actual.rows).some((r) => r.includes('SPIKE')), 'an extra spec no test cites gets no row');
});

// spec: FR-20, NFR-3; cat: ui
test('happy page: the whole dashboard matches expected.json, and every bar is drawn to one scale', () => {
  checkAll('happy');
  assert.equal(run(['--check'], scenario('happy').dir).status, 0);
});

// ---------- negative scenario ----------

// spec: FR-4; cat: err
test('negative page: every bad tag is reported with its file and line, and --check fails', () => {
  check('negative', ['problems']);
  assert.equal(run(['--check'], scenario('negative').dir).status, 1);
});

// spec: FR-1, FR-4; cat: err
test('negative page: badly tagged tests are found but drawn nowhere, so FR-2 shows no tests', () => {
  check('negative', ['names', 'stats', 'rows']);
});

// spec: FR-20; cat: err
test('negative page: the whole dashboard matches expected.json', () => {
  checkAll('negative');
});

// spec: FR-20; cat: integ
test('every scenario folder has an expected.json and is checked by the tests above', () => {
  const folders = readdirSync(SCENARIOS).filter((f) => statSync(join(SCENARIOS, f)).isDirectory()).sort();
  assert.deepEqual(folders, [...CHECKED].sort(), 'add tests for a new scenario folder and list it in CHECKED');
  for (const f of folders) assert.ok(statSync(join(SCENARIOS, f, 'expected.json')).isFile(), `${f}/expected.json`);
});
