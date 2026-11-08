// Create a fresh, isolated workdir for one eval run.
// Usage: node prepare.mjs <eval-id> <dest-dir>
// Copies the fixture app (including node_modules, so runs don't reinstall) and
// applies the eval's overlay from evals/files/<overlay>/ when the eval has one.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK_DIR = join(EVALS_DIR, '..');

export function findEval(evalId) {
  for (const skill of readdirSync(join(PACK_DIR, 'skills'))) {
    const file = join(PACK_DIR, 'evals', 'skills', skill, 'evals.json');
    if (!existsSync(file)) continue;
    const suite = JSON.parse(readFileSync(file, 'utf8'));
    const found = suite.evals.find((e) => e.id === evalId);
    if (found) return { skill, ...found };
  }
  throw new Error(`Eval "${evalId}" not found in evals/skills/*/evals.json`);
}

function main() {
  const [evalId, dest] = process.argv.slice(2);
  if (!evalId || !dest) {
    console.error('Usage: node prepare.mjs <eval-id> <dest-dir>');
    process.exit(2);
  }
  const ev = findEval(evalId);
  const fixture = join(EVALS_DIR, 'fixtures', ev.fixture ?? 'rest-app');
  rmSync(dest, { recursive: true, force: true });
  // The app's own top-level dist/ is excluded so a stale build can never make a
  // broken run look green (node_modules/*/dist must still be copied).
  const ownDist = join(fixture, 'dist');
  cpSync(fixture, dest, { recursive: true, filter: (src) => src !== ownDist && !src.startsWith(ownDist + '/') });
  if (ev.overlay) {
    const overlay = join(EVALS_DIR, 'files', ev.overlay);
    if (!existsSync(overlay)) throw new Error(`Overlay not found: ${overlay}`);
    cpSync(overlay, dest, { recursive: true });
  }
  console.log(JSON.stringify({ evalId, skill: ev.skill, dest, overlay: ev.overlay ?? null }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
