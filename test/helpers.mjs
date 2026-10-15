// Shared helpers for the test files. Not a test file itself, so VisualTDD does not scan it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
