import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './helpers.mjs';
import { syncedSkill } from '../scripts/sync-skill.mjs';

// spec: FR-24; cat: integ
test('skill/SKILL.md carries the same tagging procedure as README.md', () => {
  const readme = readFileSync(join(REPO, 'README.md'), 'utf8');
  const skill = readFileSync(join(REPO, 'skill', 'SKILL.md'), 'utf8');
  assert.equal(syncedSkill(readme, skill), skill, 'run npm run sync:skill');
});
