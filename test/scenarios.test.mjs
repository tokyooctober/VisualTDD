// Scenario tests: each folder in test/scenarios is a small project plus expected.json, which says what the
// dashboard must draw for it. To cover a new case, add tests to a scenario project (or add a scenario folder
// and a test line below), then update its expected.json by hand. See test/scenarios/README.md.
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

  const rows = [], cells = {};
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
      continue;
    }
    const [track, count] = inner;
    assert.equal(track.style.width, `${rulerMax * UNIT}px`, 'every track is as wide as the ruler');
    const all = segsOf(track.children[0]);
    cells[`${id}|all tiers`] = all;
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
    seg.dispatch('mouseenter');
    const lines = page.$('tip').textContent.split('\n');
    assert.equal(seg.getAttribute('aria-label'), lines.join(', '), 'screen readers get the same text');
    return { spec, column, cat, lines };
  });

  return {
    stats: [...page.$('stats').innerHTML.matchAll(/<span>(.*?)<\/span>/g)].map((m) => text(m[1])),
    rulerMax,
    tierHeaders: [...head.matchAll(/<th[^>]*>([^<]*) · (\d+)<small>/g)].map(([, name, n]) => [name, Number(n)]),
    rows,
    tooltips,
  };
}

function checkScenario(name) {
  const dir = join(SCENARIOS, name);
  const expectedFile = join(dir, 'expected.json');
  const expected = JSON.parse(readFileSync(expectedFile, 'utf8'));
  const { cfg, problems: configProblems } = loadConfig(JSON.parse(readFileSync(join(dir, 'visualtdd.config.json'), 'utf8')), dir);
  assert.deepEqual(configProblems, []);
  const { model, problems } = buildModel(cfg);
  const actual = { problems, ...drawn(openPage(render(model)), model, expected.tooltips ?? []) };

  if (UPDATE) { writeFileSync(expectedFile, JSON.stringify({ about: expected.about, ...actual }, null, 2) + '\n'); return; }
  const { about, ...want } = expected;
  assert.deepEqual(actual, want);
  // The CLI agrees: --check fails exactly when the scenario has problems.
  assert.equal(run(['--check'], dir).status, problems.length ? 1 : 0);
}

// spec: FR-20; cat: logic
test('happy scenario: every test is drawn in the right spec row, tier column and category segment', () => {
  checkScenario('happy');
});

// spec: FR-4, FR-20; cat: err
test('negative scenario: every bad tag is reported with file and line, and its test is left out of the dashboard', () => {
  checkScenario('negative');
});

// spec: FR-20; cat: integ
test('every scenario folder has an expected.json and is checked by a test above', () => {
  const folders = readdirSync(SCENARIOS).filter((f) => statSync(join(SCENARIOS, f)).isDirectory()).sort();
  assert.deepEqual(folders, [...CHECKED].sort(), 'add a test line for a new scenario folder and list it in CHECKED');
  for (const f of folders) assert.ok(statSync(join(SCENARIOS, f, 'expected.json')).isFile(), `${f}/expected.json`);
});
