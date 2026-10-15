// Shared helpers for the test files. Not a test file itself, so VisualTDD does not scan it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { mkdtempSync, writeFileSync, readFileSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, buildModel } from '../visualtdd.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..');
export const CLI = join(REPO, 'visualtdd.mjs');
export const fixture = (name) => join(HERE, 'fixtures', name);

/** Builds the model of a fixture project, optionally with config keys replaced. */
export function model(name, overrides = {}) {
  const dir = fixture(name);
  const raw = { ...JSON.parse(readFileSync(join(dir, 'visualtdd.config.json'), 'utf8')), ...overrides };
  const { cfg, problems } = loadConfig(raw, dir);
  assert.deepEqual(problems, []);
  return buildModel(cfg);
}
export const row = (m, id) => m.rows.find((r) => r.id === id);
export const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

/** Copies a fixture to a temp dir so a run can write its page there. */
export function scratch(name) {
  const dir = mkdtempSync(join(tmpdir(), 'visualtdd-'));
  cpSync(fixture(name), dir, { recursive: true });
  return dir;
}

/** Writes a throwaway project: { 'path/file': string | string[] (lines) | object (JSON) }. Returns its folder. */
export function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'visualtdd-'));
  for (const [path, content] of Object.entries(files)) {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Array.isArray(content) ? content.join('\n') : typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

/** Loads a config object for a temp project and builds its model; config problems fail the test. */
export function build(dir, raw) {
  const { cfg, problems } = loadConfig(raw, dir);
  assert.deepEqual(problems, []);
  return buildModel(cfg);
}

/** The model embedded in a rendered page. The template may have CRLF line ends (a Windows checkout). */
export const dataOf = (html) => JSON.parse(html.match(/var DATA = (.*);\r?\n/)[1]);

/** Just enough DOM for template.html's script: elements found by id, and innerHTML that registers the ids it contains. */
export function openPage(html, { storage = new Map(), dark = false, clipboard = 'ok' } = {}) {
  const ids = new Map(), observers = [], copied = [];
  class Element {
    constructor(tag, attrs = '') {
      this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.attrs = {};
      this.style = { setProperty(k, v) { this[k] = v; } };
      this.className = ''; this.textContent = ''; this.value = ''; this.hidden = /\shidden[\s>/]|\shidden$/.test(attrs);
      this.html = '';
    }
    set innerHTML(s) { this.html = String(s); this.children = parse(this.html); }
    get innerHTML() { return this.html; }
    appendChild(c) { this.children.push(c); return c; }
    querySelector(tag) { return this.children.find((c) => c.tagName === tag.toUpperCase()) ?? null; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    dispatch(type, extra = {}) { for (const fn of this.listeners[type] ?? []) fn({ target: this, preventDefault() {}, ...extra }); }
    setAttribute(k, v) { this.attrs[k] = String(v); for (const fn of observers) fn([]); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; for (const fn of observers) fn([]); }
    focus() {} select() {}
  }
  function parse(s) {
    return [...s.matchAll(/<(\w+)([^>]*)>/g)].map(([, tag, attrs]) => {
      const e = new Element(tag, attrs), id = attrs.match(/\sid="([^"]*)"/)?.[1];
      if (id != null) { e.id = id; ids.set(id, e); }
      return e;
    });
  }
  parse(html.replace(/<script>[\s\S]*<\/script>/, ''));
  const media = { matches: dark, addEventListener() {} };
  const document = {
    documentElement: new Element('html'),
    getElementById: (id) => ids.get(id) ?? null,
    createElement: (tag) => new Element(tag),
  };
  const ctx = {
    document, location: { pathname: '/docs/test-map.html' }, innerWidth: 1200,
    matchMedia: () => media,
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe() { observers.push(this.fn); } },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    navigator: { clipboard: { writeText: (t) => (clipboard === 'ok' ? (copied.push(t), Promise.resolve()) : Promise.reject(new Error('denied'))) } },
  };
  ctx.window = ctx;
  vm.runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1], ctx);
  const $ = (id) => ids.get(id);
  return {
    $, storage, copied,
    key: 'visualtdd-colors:/docs/test-map.html:' + dataOf(html).title,
    pick(k, hex) { $(`pick-${k}`).value = hex; $(`pick-${k}`).dispatch('input'); },
    theme(t) { document.documentElement.setAttribute('data-theme', t); },
    themeAttr: () => document.documentElement.getAttribute('data-theme'),
    chooseTheme(t) { $('theme').value = t; $('theme').dispatch('change'); },
    css: () => $('cat-colors').textContent,
  };
}
