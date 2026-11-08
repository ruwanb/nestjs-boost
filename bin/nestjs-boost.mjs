#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_IDS, AGENT_LIST, BoostError, DEFAULT_AGENTS, clean, MANIFEST, PACK_VERSION, sync, uninstall } from '../lib/installer.mjs';
import { PromptCancelled, canPrompt } from '../lib/prompt.mjs';
import { interactiveInstall } from '../lib/setup.mjs';

const HELP = `nestjs-boost ${PACK_VERSION}: Agent Skills for NestJS ${MANIFEST.nestjs.targetMajor}

Usage: nestjs-boost <command> [options]

Commands:
  install     Choose your AI coding agents, then install or refresh skills and guidelines (default)
  list        Show detected facts and the skills that would be installed (writes nothing)
  agents      Show the supported agents and where each one reads skills
  uninstall   Remove installed skills, guideline blocks and the lock file

Options:
  --agents <list>    Skip the picker: ${AGENT_IDS.join(',')}
                     (default: last choice, else detected, else ${DEFAULT_AGENTS.join(',')})
  -y, --yes          Don't ask anything; use the last choice or detected agents
  --include <list>   Add skills whose packages aren't detected (e.g. nestjs-deployment)
  --exclude <list>   Skip skills
  --all              Install every skill
  --no-guidelines    Don't write the guidelines block into CLAUDE.md / AGENTS.md / ...
  --force            Overwrite or remove skill folders you edited
  --dry-run          Show the plan without writing
  --root <dir>       Project root (default: current directory)
  -v, --version      Print the version
  -h, --help         Print this help

\`install\` asks which agents you use when run in an interactive terminal. It never asks in CI,
when output is piped, with --yes or --agents, or when agents are set in config.

Config: a "nestjs-boost" key in package.json (or .ai/nestjs-boost.json) accepts
{ "agents": [], "include": [], "exclude": [], "all": false, "guidelines": true }.`;

const COMMANDS = ['install', 'update', 'list', 'agents', 'uninstall'];

export function parseArgs(argv) {
  const flags = new Set(['dry-run', 'all', 'force', 'help', 'version', 'no-guidelines', 'yes', 'no-interactive']);
  const short = { '-h': 'help', '-v': 'version', '-y': 'yes' };
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (short[a]) { args[short[a]] = true; continue; }
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const [key, inline] = a.slice(2).split('=', 2);
    if (flags.has(key)) args[key] = true;
    else if (inline !== undefined) args[key] = inline;
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith('-')) throw new BoostError(`--${key} needs a value`);
    else args[key] = argv[++i];
  }
  return args;
}

const SIGN = { add: '+', update: '~', remove: '-' };

// Skill-folder changes are grouped per folder ("+ .claude/skills/ 12 skills: a, b, c, …") so a
// full install stays readable; other changes (guideline files) are listed one per line.
export function formatChanges(changes) {
  const groups = new Map();
  const lines = [];
  for (const c of changes) {
    const m = c.path.match(/^(.+\/skills)\/([a-z0-9-]+)$/);
    if (!m) { lines.push(`  ${SIGN[c.action]} ${c.path}`); continue; }
    const key = `${c.action} ${m[1]}`;
    if (!groups.has(key)) groups.set(key, { action: c.action, dir: m[1], names: [] });
    groups.get(key).names.push(m[2]);
  }
  const grouped = [...groups.values()].map(({ action, dir, names }) => {
    const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? ', …' : '');
    return `  ${SIGN[action]} ${dir}/ ${names.length} skill${names.length === 1 ? '' : 's'}: ${shown}`;
  });
  return [...grouped, ...lines];
}

function printFacts({ facts, skills, custom, opts }) {
  const target = MANIFEST.nestjs.targetMajor;
  console.log(`nestjs-boost ${PACK_VERSION}: NestJS ${facts.coreVersion}${facts.nestMajor && facts.nestMajor !== target ? ` (skills target ${target}; see nestjs-upgrading)` : ''}`);
  console.log(`  ${facts.adapter} | ${facts.esm ? 'ESM' : 'CommonJS'} | tests: ${facts.testRunner} | lint: ${facts.linter} | ${facts.pm}${facts.monorepo ? ' | monorepo' : ''}`);
  console.log(`  agents: ${opts.agents.join(', ')} (${opts.agentSource})`);
  console.log(`Skills (${skills.length}${custom.length ? ` + ${custom.length} project` : ''}):`);
  for (const s of skills) console.log(`  ${s.name.padEnd(34)} ${s.reason}`);
  for (const n of custom) console.log(`  ${n.padEnd(34)} .ai/skills (project)`);
}

function print(result, { verbose = true } = {}) {
  const { facts, changes, warnings, dryRun } = result;
  if (facts && verbose) printFacts(result);
  if (changes.length) {
    console.log(dryRun ? 'Would change:' : 'Changed:');
    for (const line of formatChanges(changes)) console.log(line);
  } else if (verbose) console.log(dryRun ? 'Nothing would change.' : 'Already up to date.');
  for (const w of warnings) console.warn(`  ! ${w}`);
}

function printAgents() {
  const w = Math.max(...AGENT_LIST.map((a) => a.id.length)) + 2;
  const n = Math.max(...AGENT_LIST.map((a) => a.name.length)) + 2;
  console.log(`${'id'.padEnd(w)}${'agent'.padEnd(n)}${'skills folder'.padEnd(20)}instructions file`);
  for (const a of AGENT_LIST) console.log(`${a.id.padEnd(w)}${a.name.padEnd(n)}${`${a.skills.dir}/`.padEnd(20)}${a.instructions}`);
  console.log('\nWhen several agents read the same folder, skills are installed once and shared.');
}

export async function main(argv = process.argv.slice(2), io) {
  const args = parseArgs(argv);
  if (args.version) return console.log(PACK_VERSION);
  const command = args._[0] ?? 'install';
  if (args.help || !COMMANDS.includes(command)) {
    console.log(HELP);
    process.exitCode = args.help ? 0 : 2;
    return;
  }
  if (command === 'agents') return printAgents();
  const root = resolve(args.root ?? process.cwd());
  const run = { dryRun: Boolean(args['dry-run']) || command === 'list', force: Boolean(args.force) };
  if (command === 'uninstall') return print(uninstall(root, run));
  const explicit = {
    agents: args.agents, include: args.include, exclude: args.exclude,
    all: args.all || undefined, guidelines: args['no-guidelines'] ? false : undefined,
  };

  const interactive = command !== 'list' && !run.dryRun && !args.yes && !args['no-interactive']
    && args.agents === undefined && !process.env.CI && canPrompt(io);
  if (!interactive) return print(sync(root, explicit, run));

  const result = await interactiveInstall(root, explicit, run, io);
  if (!result) { console.log('Nothing installed.'); return; }
  if (!result.changes.length) { console.log('Already up to date.'); return; }
  print(result, { verbose: false });
  console.log('\nDone. Commit the files above and .ai/nestjs-boost.lock.json so your team gets the same skills.');
  console.log('Run `npx nestjs-boost install` again any time to change agents.');
}

// Run only when executed as the CLI (directly, via npx or a node_modules/.bin link), not when
// imported by tests. Real paths, because bin links and Windows drive-letter case differ.
const invokedDirectly = () => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};
if (invokedDirectly()) {
  main().catch((err) => {
    if (err instanceof PromptCancelled) { console.log('\nCancelled; nothing was changed.'); process.exitCode = 130; return; }
    console.error(`nestjs-boost: ${err instanceof BoostError ? err.message : String(err.stack).split('\n').map(clean).join('\n')}`);
    process.exitCode = 1;
  });
}
