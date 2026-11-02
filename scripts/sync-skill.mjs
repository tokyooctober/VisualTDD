// Copies the tagging procedure from README.md into skill/SKILL.md, so it is written once.
// node scripts/sync-skill.mjs          rewrites skill/SKILL.md
// node scripts/sync-skill.mjs --check  exits 1 if skill/SKILL.md is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const START = '<!-- sync:tagging:start -->';
const END = '<!-- sync:tagging:end -->';

function block(text, name) {
  const s = text.indexOf(START);
  const e = text.indexOf(END);
  if (s < 0 || e < s) throw new Error(`${name}: missing ${START} ... ${END}`);
  return { s: s + START.length, e };
}

export function syncedSkill(readme, skill) {
  const from = block(readme, 'README.md');
  const to = block(skill, 'skill/SKILL.md');
  return skill.slice(0, to.s) + readme.slice(from.s, from.e) + skill.slice(to.e);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const readme = readFileSync(`${REPO}README.md`, 'utf8');
  const skillPath = `${REPO}skill/SKILL.md`;
  const skill = readFileSync(skillPath, 'utf8');
  const next = syncedSkill(readme, skill);
  if (process.argv.includes('--check')) {
    if (next !== skill) {
      console.error('skill/SKILL.md is out of date: run npm run sync:skill');
      process.exit(1);
    }
  } else if (next !== skill) {
    writeFileSync(skillPath, next);
    console.log('updated skill/SKILL.md');
  }
}
