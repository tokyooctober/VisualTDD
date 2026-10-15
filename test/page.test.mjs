import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { render, loadConfig } from '../visualtdd.mjs';
import { REPO, run, scratch, project, build, openPage, dataOf } from './helpers.mjs';

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

// ---------- the page's script, run in node:vm against a small DOM stub ----------

const flush = () => new Promise((r) => setTimeout(r, 0));

/** A page with the default categories, built from a one-test project. */
function defaultPage(opts) {
  const dir = project({ 'a.test.js': ['// cat: logic', "test('x', () => {});"] });
  const { model: m } = build(dir, { languages: ['js'], tiers: ['all'], title: 'Colours' });
  rmSync(dir, { recursive: true });
  return { m, page: openPage(render(m), opts), cat: (k) => m.categories.find((c) => c.k === k) };
}
const lightBlock = (css) => css.match(/^:root\{([^}]*)\}/)[1];
const darkBlock = (css) => css.match(/:root\[data-theme="dark"\]\{([^}]*)\}/)[1];

// spec: FR-18; cat: ui
test('a legend swatch changes its category colour for the light theme only, and the bars use it', () => {
  const { page, cat } = defaultPage();
  assert.equal(page.$('pick-ui').value, cat('ui').color, 'the swatch starts at the config colour');
  page.pick('ui', '#123456');
  assert.match(lightBlock(page.css()), /--c-ui:#123456;--on-ui:#ffffff;/);
  assert.match(darkBlock(page.css()), new RegExp(`--c-ui:${cat('ui').colorDark};`), 'the dark theme keeps its colour');
});

// spec: FR-18; cat: ui
test('in the dark theme the swatch shows and changes the dark colour, leaving the light one alone', () => {
  const { page, cat } = defaultPage();
  page.theme('dark');
  assert.equal(page.$('pick-ui').value, cat('ui').colorDark);
  page.pick('ui', '#ddeeff');
  assert.match(darkBlock(page.css()), /--c-ui:#ddeeff;--on-ui:#0b0b0b;/);
  assert.match(lightBlock(page.css()), new RegExp(`--c-ui:${cat('ui').color};`));
  page.theme('light');
  assert.equal(page.$('pick-ui').value, cat('ui').color, 'switching back shows the light colour again');
});

// spec: FR-18; cat: ui
test('with no theme chosen on the page, the swatch follows the system dark setting', () => {
  const { page, cat } = defaultPage({ dark: true });
  assert.equal(page.$('pick-ui').value, cat('ui').colorDark);
  page.pick('ui', '#ddeeff');
  assert.deepEqual(JSON.parse(page.storage.get(page.key)), { ui: { colorDark: '#ddeeff' } });
});

// spec: FR-18; cat: data
test('a changed colour is saved in localStorage and comes back when the page is opened again', () => {
  const { m, page } = defaultPage();
  page.pick('sec', '#abcdef');
  assert.deepEqual(JSON.parse(page.storage.get(page.key)), { sec: { color: '#abcdef' } });
  const again = openPage(render(m), { storage: page.storage });
  assert.equal(again.$('pick-sec').value, '#abcdef');
  assert.match(lightBlock(again.css()), /--c-sec:#abcdef;/);
});

// spec: FR-18; cat: err
test('a broken saved value or blocked storage falls back to the config colours without failing', () => {
  const { m, page: first, cat } = defaultPage();
  const broken = openPage(render(m), { storage: new Map([[first.key, '{not json']]) });
  assert.equal(broken.$('pick-ui').value, cat('ui').color);
  const blocked = new Map();
  blocked.set = () => { throw new Error('QuotaExceededError'); };
  const page = openPage(render(m), { storage: blocked });
  page.pick('ui', '#123456');
  assert.match(lightBlock(page.css()), /--c-ui:#123456;/, 'the change still applies until reload');
});

// spec: FR-18, NFR-2; cat: ui
test('the clash warning appears live when two neighbouring colours get too close, and clears when fixed', () => {
  const { m, page } = defaultPage();
  const [first, second, third] = m.categories;
  assert.equal(page.$('clash').hidden, true, 'the default colours raise no warning');
  page.pick(second.k, first.color);
  assert.equal(page.$('clash').hidden, false);
  assert.match(page.$('clash').textContent, new RegExp(`light theme: ${first.name} and ${second.name}`));
  assert.equal(page.$(`flag-${first.k}`).hidden, false);
  assert.equal(page.$(`flag-${second.k}`).hidden, false);
  assert.equal(page.$(`flag-${third.k}`).hidden, true, 'categories not in a clash are not flagged');
  page.pick(second.k, second.color);
  assert.equal(page.$('clash').hidden, true);
  assert.equal(page.$('clash').textContent, '');
  assert.equal(page.$(`flag-${first.k}`).hidden, true);
});

// spec: FR-18; cat: ui
test('the clash warning names the dark theme when the clash is in the dark colours', () => {
  const { m, page } = defaultPage();
  const [first, second] = m.categories;
  page.theme('dark');
  page.pick(second.k, first.colorDark);
  assert.match(page.$('clash').textContent, /dark theme/);
  page.theme('light');
  assert.equal(page.$('clash').hidden, true, 'the light colours do not clash');
});

// spec: FR-18; cat: logic
test('Copy as config copies every category with its light and dark colour, including changes', async () => {
  const { m, page } = defaultPage();
  page.pick('ui', '#123456');
  page.theme('dark');
  page.pick('logic', '#654321');
  page.$('copy').dispatch('click');
  await flush();
  const expected = m.categories.map(({ k, name, what, color, colorDark }) => ({ k, name, what, color, colorDark }));
  expected.find((c) => c.k === 'ui').color = '#123456';
  expected.find((c) => c.k === 'logic').colorDark = '#654321';
  assert.deepEqual(JSON.parse(page.copied[0]), { categories: expected });
  assert.match(page.$('status').textContent, /^Copied\./);
  assert.equal(page.$('copybox').hidden, true);
});

// spec: FR-18; cat: err
test('when the clipboard is refused, Copy as config shows the JSON in a box to copy by hand', async () => {
  const { m, page } = defaultPage({ clipboard: 'denied' });
  page.$('copy').dispatch('click');
  await flush();
  assert.equal(page.$('copybox').hidden, false);
  assert.deepEqual(JSON.parse(page.$('copybox').value).categories.map((c) => c.k), m.categories.map((c) => c.k));
  assert.match(page.$('status').textContent, /Copy the text below/);
});

// spec: FR-18; cat: data
test('Reset colors clears the saved colours and goes back to the config colours', async () => {
  const { m, page, cat } = defaultPage({ clipboard: 'denied' });
  const before = page.css();
  page.pick('ui', '#123456');
  page.$('copy').dispatch('click');
  await flush();
  page.$('reset').dispatch('click');
  assert.equal(page.storage.has(page.key), false);
  assert.equal(page.css(), before);
  assert.equal(page.$('pick-ui').value, cat('ui').color);
  assert.equal(page.$('copybox').hidden, true);
  assert.equal(page.$('status').textContent, 'Colours reset to the config.');
  assert.equal(openPage(render(m), { storage: page.storage }).$('pick-ui').value, cat('ui').color, 'still reset after reload');
});

// spec: FR-11; cat: logic
test('each tier header counts unique tests, so a test citing two specs is counted once', () => {
  const dir = project({
    'domain/a.test.js': ['// spec: A, B; cat: logic', "test('both', () => {});", '// spec: A; cat: ui', "test('only A', () => {});"],
    'data/b.test.js': ['// spec: B; cat: data', "test('data B', () => {});"],
  });
  const { model: m } = build(dir, {
    languages: ['js'], tiers: ['domain', 'data', 'ui'], specs: { source: 'list', items: [{ id: 'A' }, { id: 'B' }] },
    tierFromPath: [{ pattern: '^domain/', tier: 'domain' }, { pattern: '^data/', tier: 'data' }],
  });
  rmSync(dir, { recursive: true });
  assert.equal(m.rows.flatMap((r) => r.tests).filter((t) => t.tier === 'domain').length, 3, 'the rows hold the shared test twice');
  const heads = [...openPage(render(m)).$('G').innerHTML.matchAll(/<th[^>]*>([^<]*) · (\d+)<small>/g)].map(([, name, n]) => [name, Number(n)]);
  assert.deepEqual(heads, m.tiers.map((t, i) => [t.name, [2, 1, 0][i]]));
});

// ---------- theme ----------

/** A page built with the given config theme (undefined = the default, auto). */
function themedPage(theme, opts) {
  const dir = project({ 'a.test.js': ['// cat: logic', "test('x', () => {});"] });
  const { model: m } = build(dir, { languages: ['js'], tiers: ['all'], title: 'Themes', ...(theme ? { theme } : {}) });
  rmSync(dir, { recursive: true });
  const html = render(m);
  return { m, html, page: openPage(html, opts) };
}

// spec: FR-19; cat: ui
test('the config theme is set on <html> for light and dark, and left off for auto', () => {
  assert.match(themedPage('dark').html, /^<!doctype html>\s*<html lang="en" data-theme="dark">/);
  assert.match(themedPage('light').html, /<html lang="en" data-theme="light">/);
  for (const t of [undefined, 'auto']) {
    const { m, html, page } = themedPage(t);
    assert.equal(m.theme, 'auto');
    assert.match(html, /<html lang="en">/);
    assert.equal(page.themeAttr(), null);
    assert.equal(page.$('theme').value, 'auto');
  }
});

// spec: FR-19; cat: input
test('a theme other than auto, light or dark is a config problem', () => {
  const { problems } = loadConfig({ theme: 'sepia' }, REPO);
  assert.deepEqual(problems, ['config: theme must be "auto", "light" or "dark"']);
});

// spec: FR-19; cat: ui
test('the theme picker switches the page between light, dark and auto, and the colours follow', () => {
  const { m, page } = themedPage('light');
  assert.equal(page.$('theme').value, 'light');
  assert.equal(page.themeAttr(), 'light');
  page.chooseTheme('dark');
  assert.equal(page.themeAttr(), 'dark');
  assert.equal(page.$('pick-ui').value, m.categories.find((c) => c.k === 'ui').colorDark, 'the swatches show the dark colours');
  page.chooseTheme('auto');
  assert.equal(page.themeAttr(), null, 'auto hands the choice back to the system setting');
});

// spec: FR-19; cat: data
test("the viewer's theme choice is saved in this browser and wins over the config; choosing the config's theme clears it", () => {
  const { m, page } = themedPage('dark');
  page.chooseTheme('light');
  const key = 'visualtdd-theme:/docs/test-map.html:Themes';
  assert.equal(page.storage.get(key), 'light');
  const again = openPage(render(m), { storage: page.storage });
  assert.equal(again.themeAttr(), 'light');
  assert.equal(again.$('theme').value, 'light');
  again.chooseTheme('dark');
  assert.equal(page.storage.has(key), false);
});

// spec: FR-19; cat: err
test('with storage blocked, the theme picker still switches the page', () => {
  const blocked = new Map();
  blocked.get = () => { throw new Error('SecurityError'); };
  blocked.set = () => { throw new Error('SecurityError'); };
  const { page } = themedPage('auto', { storage: blocked });
  assert.equal(page.$('theme').value, 'auto');
  page.chooseTheme('dark');
  assert.equal(page.themeAttr(), 'dark');
});

// ---------- generation time ----------

// spec: FR-21; cat: data
test('the page records when it was generated: exact UTC in the data and on <time>, local time as the text', () => {
  const dir = project({ 'a.test.js': ['// cat: logic', "test('x', () => {});"] });
  const { model: m } = build(dir, { languages: ['js'], tiers: ['all'] });
  rmSync(dir, { recursive: true });
  const iso = '2026-10-15T05:03:00.000Z';
  const html = render(m, { now: new Date(iso) });
  assert.equal(dataOf(html).generatedAt, iso);
  const stamp = openPage(html).$('generated');
  assert.equal(stamp.tagName, 'TIME');
  assert.equal(stamp.getAttribute('datetime'), iso);
  assert.equal(stamp.title, iso);
  const local = new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  assert.equal(stamp.textContent, local);
  assert.match(stamp.textContent, /2026/);
  assert.equal(m.generatedAt, undefined, 'the model itself has no time, so --json output stays the same between runs');
});

// spec: FR-21, FR-13; cat: integ
test('a real run stamps the page with the time it ran', () => {
  const dir = scratch('kotlin');
  const before = Date.now();
  assert.equal(run([], dir).status, 0);
  const after = Date.now();
  const stamp = Date.parse(dataOf(readFileSync(join(dir, 'docs', 'test-map.html'), 'utf8')).generatedAt);
  assert.ok(stamp >= before - 1000 && stamp <= after, `stamp ${new Date(stamp).toISOString()} is outside the run`);
  rmSync(dir, { recursive: true });
});
