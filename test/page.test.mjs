import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '../visualtdd.mjs';
import { REPO, run, scratch, project, build } from './helpers.mjs';

const dataOf = (html) => JSON.parse(html.match(/var DATA = (.*);\n/)[1]);

// spec: FR-11; cat: data
test('the page carries the model, the title and the colour checks, and has no placeholders left', () => {
  const dir = scratch('kotlin');
  run([], dir);
  const html = readFileSync(join(dir, 'docs', 'test-map.html'), 'utf8');
  assert.match(html, /<title>Kotlin fixture<\/title>/);
  assert.ok(!html.includes('/*__DATA__*/') && !html.includes('/*__COLOR_LIB__*/'));
  assert.match(html, /var makeColorLib = function makeColorLib\(\)/);
  assert.equal(dataOf(html).uniqueTests, 3);
  rmSync(dir, { recursive: true });
});

// spec: FR-11; cat: integ
test('the page loads nothing from outside: no external scripts, styles or fonts', () => {
  const dir = project({ 'a.test.js': ['// cat: logic', "test('x', () => {});"] });
  const html = render(build(dir, { languages: ['js'], tiers: ['all'] }).model);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+href=/);
  assert.doesNotMatch(html, /https?:\/\//);
  rmSync(dir, { recursive: true });
});

// spec: FR-11, FR-7; cat: logic
test('the page data keeps empty specs and the categories in config order', () => {
  const dir = project({ 'a.test.js': ['// spec: A; cat: err', "test('x', () => {});"] });
  const { model: m } = build(dir, { languages: ['js'], tiers: ['all'], categories: ['err', 'ui'], specs: { source: 'list', items: [{ id: 'A' }, { id: 'B' }] } });
  const data = dataOf(render(m));
  assert.deepEqual(data.categories.map((c) => c.k), ['err', 'ui']);
  assert.deepEqual(data.rows.map((r) => [r.id, r.tests.length]), [['A', 1], ['B', 0]]);
  rmSync(dir, { recursive: true });
});

// spec: NFR-4; cat: sec
test('a test name, spec name or title with HTML in it cannot break out of the page', () => {
  const evil = '</script><script>alert(1)</script>';
  const dir = project({ 'a.test.js': ['// spec: A; cat: logic', `test('${evil}', () => {});`] });
  const { model: m } = build(dir, { languages: ['js'], tiers: ['all'], title: `<b>map</b>${evil}`, specs: { source: 'list', items: [{ id: 'A', name: evil }] } });
  const html = render(m);
  const template = readFileSync(join(REPO, 'template.html'), 'utf8');
  assert.equal(html.split('</script>').length, template.split('</script>').length, 'no extra </script> in the page');
  assert.equal(html.split('<script>').length, template.split('<script>').length, 'no extra <script> in the page');
  assert.match(html, /<title>&lt;b&gt;map&lt;\/b&gt;&lt;\/script&gt;/);
  const data = dataOf(html);
  assert.equal(data.rows[0].name, evil, 'the data still holds the exact text');
  assert.equal(data.rows[0].tests[0].name, evil);
  rmSync(dir, { recursive: true });
});

// spec: NFR-3; cat: ui
test('every bar segment is n tests times one fixed unit wide, so equal counts draw equal bars', () => {
  const template = readFileSync(join(REPO, 'template.html'), 'utf8');
  assert.match(template, /var UNIT = \d+;/);
  assert.match(template, /g\.style\.width = \(n \* UNIT\) \+ 'px'/);
  assert.equal((template.match(/style\.width = /g) || []).length, 2, 'segments and the shared track are the only sized elements');
  assert.match(template, /track\.style\.width = trackW \+ 'px'/);
});
