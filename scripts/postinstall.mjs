// Runs on `npm install` / `npm ci` (and yarn, or pnpm/bun when allowed). It keeps skills in sync in
// a project that has opted in. It must never fail or slow down an install, so every problem is
// reported as a one-line note and the script always exits 0.
//
// Opt-in: the hook never adds agent instructions to a project on its own. It syncs only when the
// project already has `.ai/nestjs-boost.lock.json` (written by running `npx nestjs-boost install`
// once) or a "nestjs-boost" key in package.json. Otherwise it prints how to opt in.
//
// Skipped when:
//   - NESTJS_BOOST_SKIP=1, or CI is set (unless NESTJS_BOOST_CI=1)
//   - installing globally, through npx, or inside this package's own repository
//   - nestjs-boost isn't a direct dependency of the project (it was pulled in by another package)
//   - the project root can't be found or isn't a NestJS project
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const env = process.env;
const note = (msg) => console.log(`nestjs-boost: ${msg}`);

function projectRoot() {
  // npm sets npm_config_local_prefix to the project root; INIT_CWD is where the command ran (npm, yarn, pnpm).
  for (const dir of [env.npm_config_local_prefix, env.INIT_CWD]) {
    if (dir && existsSync(join(dir, 'package.json'))) return resolve(dir);
  }
  return null;
}

async function run() {
  if (env.NESTJS_BOOST_SKIP === '1' || env.NESTJS_BOOST_SKIP === 'true') return;
  if (env.CI && env.NESTJS_BOOST_CI !== '1') return;
  if (env.npm_config_global === 'true') return note('global install: run `nestjs-boost install` inside a NestJS project.');
  if (env.npm_command === 'exec') return; // `npx nestjs-boost ...`: the command itself decides what to write
  const root = projectRoot();
  if (!root) return;
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (pkg.name === 'nestjs-boost') return; // developing this package
  if (!{ ...pkg.devDependencies, ...pkg.dependencies }['nestjs-boost']) return; // transitive dependency

  const { LOCK, isNestProject, sync } = await import('../lib/installer.mjs');
  if (!isNestProject(root)) return note('no @nestjs/core in package.json; skills not installed.');
  if (!existsSync(join(root, LOCK)) && pkg['nestjs-boost'] === undefined) {
    return note('run `npx nestjs-boost install` once to add the skills; later installs keep them in sync.');
  }
  const { skills, changes, warnings } = sync(root, {}, { force: false });
  if (changes.length) note(`${skills.length} skills synced (${changes.length} change${changes.length === 1 ? '' : 's'}). Run \`npx nestjs-boost list\` for details.`);
  for (const w of warnings) note(w);
}

run().catch((err) => note(`skipped (${err.message}). Run \`npx nestjs-boost install\` to retry.`));
