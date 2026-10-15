#!/usr/bin/env node
// VisualTDD: count the tests that cover each spec, by test category and by tier, and build an HTML dashboard.
//
//   node visualtdd.mjs                write the dashboard and print a summary; a bad or missing tag prints a
//                                  WARNING and that test is left out (exit 0)
//   node visualtdd.mjs --check        validate the tags only (exit 1 on any problem)
//   node visualtdd.mjs --init         write a starter visualtdd.config.json for the current directory
//   node visualtdd.mjs --json         print the model as JSON instead of writing the page
//   --config <file>                use another config file (default: ./visualtdd.config.json)
//
// Every test carries one comment line directly above it (above its annotations or decorators):
//
//   // spec: FR-3; cat: logic
//   // spec: NFR-3, FR-12; cat: perf; tier: tooling
//   #  spec: FR-7; cat: input                         (Python)
//
// No dependencies. Needs Node 22+.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------- defaults ----------

/** Categories and their colours. The colours are a set checked for colour-blind separation in this order. */
export const DEFAULT_CATEGORIES = [
  { k: 'ui', name: 'UI / Visual', what: 'Colours, shapes, layout, navigation, accessibility, screen sizes', color: '#2a78d6', colorDark: '#3987e5', text: '#ffffff', textDark: '#ffffff' },
  { k: 'input', name: 'Input validation', what: 'What the user types: valid, invalid and boundary values', color: '#eb6834', colorDark: '#d95926', text: '#0b0b0b', textDark: '#ffffff' },
  { k: 'logic', name: 'Functional / Logic', what: 'Rules and behaviour are correct', color: '#1baf7a', colorDark: '#199e70', text: '#0b0b0b', textDark: '#ffffff' },
  { k: 'perf', name: 'Performance', what: 'Rate limit, cache, response time, large lists', color: '#eda100', colorDark: '#c98500', text: '#0b0b0b', textDark: '#0b0b0b' },
  { k: 'data', name: 'Data / Persistence', what: 'Saved, read back, survives restart', color: '#e87ba4', colorDark: '#d55181', text: '#0b0b0b', textDark: '#ffffff' },
  { k: 'integ', name: 'Integration / Contract', what: 'Components and external services working together', color: '#008300', colorDark: '#008300', text: '#ffffff', textDark: '#ffffff' },
  { k: 'sec', name: 'Security', what: 'Secrets, permissions, privacy, what is reachable', color: '#6250d6', colorDark: '#9085e9', text: '#ffffff', textDark: '#ffffff' },
  { k: 'err', name: 'Error handling', what: 'Offline, timeouts, server errors, empty states, retry', color: '#e34948', colorDark: '#e66767', text: '#ffffff', textDark: '#ffffff' },
];

export const DEFAULT_TIERS = [
  { k: 'ui', name: 'UI', what: 'Screens, components, view models' },
  { k: 'domain', name: 'Domain', what: 'Rules and policies' },
  { k: 'data', name: 'Data', what: 'Repositories, storage, external APIs' },
];

export const DEFAULT_TIER_RULES = [
  { pattern: '(^|/)(ui|view|views|screens?|components?|presentation)/', tier: 'ui' },
  { pattern: '(^|/)(domain|core|model|logic|usecases?)/', tier: 'domain' },
  { pattern: '(^|/)(data|db|repository|repositories|storage|api|infra)/', tier: 'data' },
];

/** How tests are found per language. `marker` matches the line that starts a test; the name comes from
 *  capture group `nameGroup`, or else from the first line within the next three that matches `next`. */
export const LANGUAGE_PRESETS = {
  js: { files: '\\.(test|spec)\\.[cm]?[jt]sx?$', marker: "^\\s*(?:test|it)(?:\\.(?:only|skip|todo))?\\(\\s*(['\"`])((?:\\\\.|(?!\\1).)*)\\1", nameGroup: 2, comment: '//' },
  kotlin: { files: 'Tests?\\.kt$', marker: '^\\s*@Test\\b', next: 'fun\\s+`?([^`(]+?)`?\\s*\\(', comment: '//' },
  java: { files: '(Tests?|IT)\\.java$', marker: '^\\s*@Test\\b', next: 'void\\s+(\\w+)\\s*\\(', comment: '//' },
  python: { files: '(^|/)(test_[^/]*|[^/]*_test)\\.py$', marker: '^\\s*(?:async\\s+)?def\\s+(test\\w*)\\s*\\(', nameGroup: 1, fnName: true, comment: '#' },
  swift: { files: 'Tests?\\.swift$', marker: '^\\s*(?:@MainActor\\s+)?(?:func\\s+(test\\w*)\\s*\\(|@Test\\b)', nameGroup: 1, fnName: true, next: 'func\\s+(\\w+)\\s*\\(', comment: '//' },
  go: { files: '_test\\.go$', marker: '^func\\s+(Test\\w+)\\s*\\(\\s*\\w+\\s+\\*testing\\.T', nameGroup: 1, fnName: true, comment: '//' },
};

const SKIP_DIRS = new Set(['node_modules', 'build', 'dist', 'out', 'target', 'vendor', 'Pods', 'venv', '__pycache__', 'DerivedData']);

// ---------- colour checks (also injected into the page, so keep it self-contained) ----------

export function makeColorLib() {
  function rgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return v / 255; });
  }
  function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  // Machado et al. 2009, full severity, applied in linear RGB.
  var SIM = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  };
  function oklab(c) {
    var l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
    var m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
    var s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function point(hex, type) {
    var c = rgb(hex).map(lin);
    if (type) c = SIM[type].map(function (r) { return Math.min(1, Math.max(0, r[0] * c[0] + r[1] * c[1] + r[2] * c[2])); });
    return oklab(c);
  }
  /** Perceptual distance (OKLab x 100); type is undefined for normal vision, or "protan" / "deutan". */
  function distance(a, b, type) {
    var p = point(a, type), q = point(b, type);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
  }
  function luminance(hex) { var c = rgb(hex).map(lin); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  /** Dark or white text, whichever reads better on this fill. */
  function textOn(hex) {
    var L = luminance(hex);
    return (L + 0.05) / (luminance('#0b0b0b') + 0.05) >= 1.05 / (L + 0.05) ? '#0b0b0b' : '#ffffff';
  }
  /** Neighbouring pairs (in stack order) that are hard to tell apart: normal vision below 15, or red-green colour blindness below 8. */
  function clashes(items) {
    var out = [];
    for (var i = 1; i < items.length; i++) {
      var a = items[i - 1], b = items[i];
      var normal = distance(a.hex, b.hex), cvd = Math.min(distance(a.hex, b.hex, 'protan'), distance(a.hex, b.hex, 'deutan'));
      if (normal < 15 || cvd < 8) out.push({ a: a, b: b, normal: Math.round(normal * 10) / 10, cvd: Math.round(cvd * 10) / 10 });
    }
    return out;
  }
  return { distance: distance, textOn: textOn, clashes: clashes };
}
const colors = makeColorLib();

// ---------- config ----------

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file}: ${e.message}`); }
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Fills in defaults. Returns { cfg, problems } where problems are config mistakes (always fatal). */
export function loadConfig(raw, root) {
  const problems = [];
  const cfg = {
    root: resolve(root, raw.root ?? '.'),
    title: raw.title ?? 'Test map',
    theme: raw.theme ?? 'auto',
    output: raw.output ?? 'docs/test-map.html',
    testRoots: raw.testRoots ?? ['.'],
    tierFromPath: (raw.tierFromPath ?? (raw.tiers ? [] : DEFAULT_TIER_RULES)).map((r) => ({ re: new RegExp(r.pattern), tier: r.tier })),
    defaultTier: raw.defaultTier ?? null,
    specs: raw.specs ?? { source: 'none' },
    extraSpecs: raw.extraSpecs ?? null,
  };

  const langs = raw.languages ?? Object.keys(LANGUAGE_PRESETS);
  cfg.languages = langs.map((l) => {
    const spec = typeof l === 'string' ? { preset: l } : l;
    const base = spec.preset ? LANGUAGE_PRESETS[spec.preset] : {};
    if (spec.preset && !base) { problems.push(`config: unknown language preset "${spec.preset}" (use ${Object.keys(LANGUAGE_PRESETS).join(', ')})`); return null; }
    const m = { name: spec.name ?? spec.preset ?? 'custom', ...base, ...spec };
    return { ...m, filesRe: new RegExp(m.files), markerRe: new RegExp(m.marker), nextRe: m.next ? new RegExp(m.next) : null };
  }).filter(Boolean);

  // Categories: a key list, or objects; a known key inherits the default name and colours.
  const byKey = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.k, c]));
  cfg.categories = (raw.categories ?? DEFAULT_CATEGORIES).map((c) => {
    const o = typeof c === 'string' ? { k: c } : c;
    const d = byKey[o.k] ?? {};
    const cat = { k: o.k, name: o.name ?? d.name ?? o.k, what: o.what ?? d.what ?? '', color: o.color ?? d.color, colorDark: o.colorDark ?? o.color ?? d.colorDark };
    for (const f of ['color', 'colorDark']) {
      if (!cat[f]) { problems.push(`config: category "${o.k}" needs a "${f}" (hex, like #2a78d6)`); cat[f] = '#898781'; }
      else if (!HEX.test(cat[f])) { problems.push(`config: category "${o.k}" ${f} "${cat[f]}" is not a hex colour`); cat[f] = '#898781'; }
    }
    // Text on the bar: given, the default for an unchanged colour, or worked out from the fill.
    cat.text = o.text ?? (cat.color === d.color ? d.text : colors.textOn(cat.color));
    cat.textDark = o.textDark ?? (cat.colorDark === d.colorDark ? d.textDark : colors.textOn(cat.colorDark));
    return cat;
  });

  cfg.tiers = (raw.tiers ?? DEFAULT_TIERS).map((t) => (typeof t === 'string' ? { k: t, name: t[0].toUpperCase() + t.slice(1), what: '' } : { what: '', ...t, name: t.name ?? t.k }));
  for (const r of cfg.tierFromPath) if (!cfg.tiers.some((t) => t.k === r.tier)) problems.push(`config: tierFromPath names tier "${r.tier}", which is not in "tiers"`);
  if (!['auto', 'light', 'dark'].includes(cfg.theme)) problems.push(`config: theme must be "auto", "light" or "dark"`);
  if (!['markdown', 'list', 'none'].includes(cfg.specs.source)) problems.push(`config: specs.source must be "markdown", "list" or "none"`);
  return { cfg, problems };
}

/** Colour warnings for the categories as configured (never fatal). */
export function colorWarnings(categories) {
  const out = [];
  for (const [theme, f] of [['light', 'color'], ['dark', 'colorDark']]) {
    for (const c of colors.clashes(categories.map((x) => ({ k: x.k, name: x.name, hex: x[f] })))) {
      out.push(`${theme} theme: "${c.a.name}" and "${c.b.name}" sit next to each other and are hard to tell apart (normal vision ${c.normal}, colour-blind ${c.cvd}; aim for 15 and 8 or more)`);
    }
  }
  return out;
}

// ---------- scanning ----------

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  if (statSync(dir).isFile()) return [dir];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function humanise(fn) {
  return fn.replace(/^[Tt]est_?(?=[A-Z_])/, '').replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').toLowerCase().trim();
}

const TAG = /^\s*(?:\/\/|#)\s*((?:spec|cat|tier)\s*:.*)$/;

/** Reads every test and the tag line above it. Returns { tests, problems }. */
export function scanTests(cfg) {
  const tests = [];
  const problems = [];
  const seen = new Set();
  const files = cfg.testRoots.flatMap((d) => walk(join(cfg.root, d)));
  for (const file of files) {
    const rel = relative(cfg.root, file).replaceAll('\\', '/');
    if (seen.has(rel)) continue;
    const lang = cfg.languages.find((l) => l.filesRe.test(rel));
    if (!lang) continue;
    seen.add(rel);
    const lines = readFileSync(file, 'utf8').split('\n');
    let usedUpTo = -1; // a line already read as the name of an earlier test (Swift "@Test" then "func testX")
    lines.forEach((line, i) => {
      if (i <= usedUpTo) return;
      const m = line.match(lang.markerRe);
      if (!m) return;
      // A string title (JS) is used as written; a function name is turned into words.
      let name = lang.nameGroup ? m[lang.nameGroup] : null;
      let fromFunction = Boolean(name && lang.fnName);
      if (!name && lang.nextRe) {
        const k = lines.slice(i, i + 4).findIndex((l) => lang.nextRe.test(l));
        name = k >= 0 ? lines[i + k].match(lang.nextRe)[1] : null;
        if (k > 0) usedUpTo = i + k;
        fromFunction = true;
      }
      name = name ? (fromFunction ? humanise(name) : name) : '(unnamed)';

      const where = `${rel}:${i + 1}`;
      // The tag sits above the test, above any annotations or decorators.
      let j = i - 1;
      while (j >= 0 && /^\s*@/.test(lines[j]) && !TAG.test(lines[j])) j--;
      const tag = (lines[j] ?? '').match(TAG);
      if (!tag) { problems.push(`${where}  no "${lang.comment} spec: ...; cat: ..." line above "${name}"`); return; }
      const fields = {};
      for (const part of tag[1].split(';')) {
        const k = part.indexOf(':');
        if (k > 0) fields[part.slice(0, k).trim()] = part.slice(k + 1).trim();
      }
      const before = problems.length;
      const specs = (fields.spec ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const cat = fields.cat;
      const tier = fields.tier ?? cfg.tierFromPath.find((r) => r.re.test(rel))?.tier ?? cfg.defaultTier ?? (cfg.tiers.length === 1 ? cfg.tiers[0].k : null);
      if (!specs.length && cfg.specs.source !== 'none') problems.push(`${where}  no spec id`);
      if (!cfg.categories.some((c) => c.k === cat)) problems.push(`${where}  unknown cat "${cat ?? ''}" (use ${cfg.categories.map((c) => c.k).join(', ')})`);
      if (!tier) problems.push(`${where}  the path does not decide the tier; add "tier: ..." (${cfg.tiers.map((t) => t.k).join(', ')})`);
      else if (!cfg.tiers.some((t) => t.k === tier)) problems.push(`${where}  unknown tier "${tier}"`);
      if (problems.length === before) tests.push({ name, file: rel, line: i + 1, specs, cat, tier });
    });
  }
  return { tests, problems };
}

/** The spec list: from Markdown tables, from the config, or none. */
export function readSpecs(cfg) {
  const s = cfg.specs;
  if (s.source === 'list') return (s.items ?? []).map((x, n) => ({ id: x.id, name: x.name ?? '', group: x.group ?? 'Specs', order: n }));
  if (s.source !== 'markdown') return [];
  // A table row whose first cell starts with an id, then the spec's name: "| FR-3 Current library | ...".
  const idPattern = s.idPattern ?? '(?<prefix>[A-Z]+)-(?<num>\\d+)';
  const row = new RegExp(`^\\|\\s*(?<id>${idPattern})\\s+(?<name>[^|]+?)\\s*\\|`);
  const groups = s.groups ?? {};
  const groupOrder = Object.keys(groups);
  const specs = [];
  let n = 0;
  for (const f of [].concat(s.files ?? s.file ?? [])) {
    for (const line of readFileSync(join(cfg.root, f), 'utf8').split('\n')) {
      const m = line.match(row);
      if (!m || specs.some((x) => x.id === m.groups.id)) continue;
      const prefix = m.groups.prefix ?? '';
      specs.push({ id: m.groups.id, name: m.groups.name, group: groups[prefix] ?? (prefix ? `${prefix} specs` : 'Specs'), g: groupOrder.indexOf(prefix), num: Number(m.groups.num ?? 0), order: n++ });
    }
  }
  if (groupOrder.length) specs.sort((a, b) => (a.g === -1 ? 1e6 : a.g) - (b.g === -1 ? 1e6 : b.g) || a.num - b.num || a.order - b.order);
  return specs;
}

export function buildModel(cfg) {
  let { tests, problems } = scanTests(cfg);
  const specs = readSpecs(cfg);
  const extras = cfg.extraSpecs?.items ?? {};
  let rows;
  if (cfg.specs.source === 'none') {
    // No spec list: one row per test folder.
    const dirs = [...new Set(tests.map((t) => dirname(t.file)))];
    rows = dirs.map((d) => ({ id: d, name: '', group: 'Test folders', kind: 'folder', tests: [] }));
    for (const t of tests) rows.find((r) => r.id === dirname(t.file)).tests.push({ name: t.name, file: t.file, line: t.line, tier: t.tier, cat: t.cat, specs: t.specs });
  } else {
    const known = new Set([...specs.map((s) => s.id), ...Object.keys(extras)]);
    const unknown = (t) => t.specs.filter((s) => !known.has(s));
    for (const t of tests) for (const s of unknown(t)) problems.push(`${t.file}:${t.line}  "${s}" is not a known spec id${Object.keys(extras).length ? ` or extra spec (${Object.keys(extras).join(', ')})` : ''}`);
    // Like any other bad tag, a test citing an unknown spec is left out entirely, even from the rows of its known specs.
    tests = tests.filter((t) => !unknown(t).length);
    rows = specs.map((s) => ({ id: s.id, name: s.name, group: s.group, kind: 'spec', tests: [] }));
    const used = new Set(tests.flatMap((t) => t.specs));
    for (const [id, name] of Object.entries(extras)) if (used.has(id)) rows.push({ id, name, group: cfg.extraSpecs.group ?? 'Other', kind: 'extra', tests: [] });
    for (const t of tests) for (const s of t.specs) rows.find((r) => r.id === s)?.tests.push({ name: t.name, file: t.file, line: t.line, tier: t.tier, cat: t.cat, specs: t.specs });
  }
  const model = { title: cfg.title, theme: cfg.theme, categories: cfg.categories, tiers: cfg.tiers, rows, uniqueTests: tests.length, specMode: cfg.specs.source };
  return { model, problems };
}

export function summary(model) {
  const lines = [`${model.uniqueTests} tagged tests`];
  const reqs = model.rows.filter((r) => r.kind === 'spec');
  if (model.specMode !== 'none') {
    const covered = reqs.filter((r) => r.tests.length);
    lines.push(`${covered.length} of ${reqs.length} specs have at least one test; ${reqs.length - covered.length} have none`);
  }
  lines.push('');
  const pad = (s, n) => String(s).padEnd(n);
  lines.push(pad('', 28) + model.categories.map((c) => pad(c.k, 6)).join('') + 'total');
  for (const r of model.rows.filter((x) => x.tests.length)) {
    const by = (k) => r.tests.filter((t) => t.cat === k).length;
    lines.push(pad(`${r.id} ${r.name}`.trim().slice(0, 27), 28) + model.categories.map((c) => pad(by(c.k) || '.', 6)).join('') + r.tests.length);
  }
  return lines.join('\n');
}

/** The page for a model. `now` is the generation time shown on the page (a parameter so tests can fix it). */
export function render(model, { now = new Date() } = {}) {
  const template = readFileSync(join(HERE, 'template.html'), 'utf8');
  const json = JSON.stringify({ ...model, generatedAt: now.toISOString() }).replaceAll('<', '\\u003c');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return template
    .replace('<title>VisualTDD</title>', `<title>${esc(model.title)}</title>`)
    // A fixed theme is set on <html> so the page never flashes the other theme while it loads.
    .replace('<html lang="en">', model.theme === 'light' || model.theme === 'dark' ? `<html lang="en" data-theme="${model.theme}">` : '<html lang="en">')
    .replace('/*__COLOR_LIB__*/', `var makeColorLib = ${makeColorLib.toString()};`)
    .replace('/*__DATA__*/null', json);
}

// ---------- init ----------

export function initConfig(root) {
  const found = {};
  for (const f of walk(root)) {
    const rel = relative(root, f).replaceAll('\\', '/');
    for (const [k, p] of Object.entries(LANGUAGE_PRESETS)) {
      if (new RegExp(p.files).test(rel)) (found[k] ??= new Set()).add(rel.split('/')[0]);
    }
  }
  const languages = Object.keys(found);
  const testRoots = [...new Set(Object.values(found).flatMap((s) => [...s]))].sort();
  return {
    title: 'Test map',
    output: 'docs/test-map.html',
    testRoots: testRoots.length ? testRoots : ['.'],
    languages: languages.length ? languages : Object.keys(LANGUAGE_PRESETS),
    specs: { source: 'none' },
    tiers: DEFAULT_TIERS,
    tierFromPath: DEFAULT_TIER_RULES,
    defaultTier: 'domain',
  };
}

// ---------- CLI ----------

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const configFile = resolve(arg('--config') ?? 'visualtdd.config.json');
  const root = dirname(configFile);

  if (argv.includes('--init')) {
    if (existsSync(configFile)) { console.error(`${relative(process.cwd(), configFile)} already exists; not overwriting it`); return 1; }
    const cfg = initConfig(root);
    writeFileSync(configFile, JSON.stringify(cfg, null, 2) + '\n');
    console.log(`wrote ${relative(process.cwd(), configFile)}: ${cfg.languages.join(', ')} tests under ${cfg.testRoots.join(', ')}. Edit "specs" and "tiers" to suit the project.`);
    return 0;
  }
  if (!existsSync(configFile)) { console.error(`no ${relative(process.cwd(), configFile) || configFile}; run with --init to create one`); return 1; }

  const { cfg, problems: configProblems } = loadConfig(readJson(configFile), root);
  if (configProblems.length) { console.error(configProblems.map((p) => '  ' + p).join('\n')); return 1; }
  const { model, problems } = buildModel(cfg);
  const strict = argv.includes('--check');

  for (const w of colorWarnings(cfg.categories)) console.warn(`WARNING: ${w}`);
  if (problems.length) {
    if (strict) {
      console.error(`${problems.length} problem(s):\n` + problems.map((p) => '  ' + p).join('\n'));
      return 1;
    }
    console.warn(
      `WARNING: ${problems.length} test tag problem(s). Those tests are left out of the page and its counts.\n` +
        problems.map((p) => '  ' + p).join('\n') +
        '\n  Fix them, or run with --check to make this an error.\n',
    );
  }
  if (argv.includes('--json')) { console.log(JSON.stringify(model, null, 2)); return 0; }
  console.log(summary(model));
  if (!strict) {
    const out = join(cfg.root, cfg.output); // relative to the project root, like every other path in the config
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, render(model));
    console.log(`\nwrote ${relative(process.cwd(), out)}`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // A config or spec file that cannot be read ends with its message, not a stack trace.
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1; }
}
