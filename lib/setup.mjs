// Interactive `nestjs-boost install`: pick agents, pick skills, review the plan, confirm, install.
// All writing goes through installer.sync(); this module only asks questions and reports.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS, AGENT_LIST, MANIFEST, PACK_DIR, selectSkills, sync } from './installer.mjs';
import { confirm, multiSelect, select } from './prompt.mjs';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const EXTRA = new Set(['include', 'all']);
const available = () => MANIFEST.skills.filter((s) => existsSync(join(PACK_DIR, 'skills', s.name, 'SKILL.md')));

// Picker entries: every registry agent, pre-checking the current choice (lock, detection or default).
export function agentChoices(current, found) {
  return AGENT_LIST.map((a) => ({
    value: a.id,
    label: a.name,
    tag: found.includes(a.id) ? '(detected)' : '',
    hint: `${a.skills.dir}/ · ${a.instructions}${a.hint ? ` · ${a.hint}` : ''}`,
    checked: current.includes(a.id),
  }));
}

// What makes a skill install on its own, for the picker hint.
function trigger(w = {}) {
  if (w.always) return 'foundation';
  if (w.anyDependency) return `for ${w.anyDependency.join(', ')}`;
  if (w.anyFile) return `for projects with ${w.anyFile.join(', ')}`;
  if (w.nestjsMajorBelow) return `for upgrading from NestJS < ${w.nestjsMajorBelow}`;
  return '';
}

// Every skill in the pack, for "Choose skills". Skills matching the project are tagged; the
// names in `selected` start ticked.
export function skillChoices(facts, selected) {
  const auto = new Set(selectSkills(facts).map((s) => s.name));
  return available().map((s) => ({
    value: s.name,
    label: s.name,
    tag: auto.has(s.name) ? '(matches)' : '',
    hint: trigger(s.installWhen),
    checked: selected.includes(s.name),
  }));
}

// A ticked list as options: ticked non-matching skills are included, unticked matching ones excluded.
export function choiceToOptions(facts, chosen) {
  const auto = selectSkills(facts).map((s) => s.name);
  return { all: false, include: chosen.filter((n) => !auto.includes(n)), exclude: auto.filter((n) => !chosen.includes(n)) };
}

// The three-way skill question. Returns the skill options to sync with.
async function askSkills(current, explicit, io) {
  const { facts, opts } = current;
  const matching = selectSkills(facts, { exclude: opts.configExclude }).length;
  const total = available().length;
  const keepExclude = explicit.exclude ?? opts.configExclude;   // --exclude / config still apply
  // Start on the mode used last time (from the lock), else "Only matching".
  const custom = opts.include.length || opts.exclude.some((n) => !opts.configExclude.includes(n));
  const initial = opts.all ? 'all' : custom ? 'choose' : 'matching';
  const mode = await select({
    message: 'Which skills do you want?',
    initial,
    choices: [
      { value: 'matching', label: 'Only matching skills (recommended)', hint: `${plural(matching, 'skill')}: foundation + your packages` },
      { value: 'all', label: 'All skills', hint: `${plural(total, 'skill')}, including packages you don't use` },
      { value: 'choose', label: 'Choose skills', hint: 'pick from the full list' },
    ],
  }, io);
  if (mode === 'matching') return { all: false, include: [], exclude: keepExclude };
  if (mode === 'all') return { all: true, include: [], exclude: keepExclude };
  const chosen = await multiSelect({
    message: 'Choose skills',
    choices: skillChoices(facts, current.skills.map((s) => s.name)),
  }, io);
  return choiceToOptions(facts, chosen);
}

// A short, human description of what an install will do, built from a dry-run report.
export function describePlan(report) {
  const { skills, custom, skillDirs, guidelineFiles, changes, opts } = report;
  const lines = [];
  const foundation = skills.filter((s) => s.reason === 'foundation').length;
  const added = skills.filter((s) => EXTRA.has(s.reason)).length;
  const extra = [
    `${foundation} foundation`,
    `${skills.length - foundation - added} for your packages`,
    ...(added ? [`${added} added by you`] : []),
    ...(custom.length ? [`${custom.length} project`] : []),
  ];
  lines.push(`Skills: ${plural(skills.length + custom.length, 'skill')} (${extra.join(', ')})`);
  for (const { dir, agents } of skillDirs) {
    lines.push(`  ${`${dir}/`.padEnd(20)} read by ${agents.map((id) => AGENTS[id].name).join(', ')}`);
  }
  if (guidelineFiles.length) lines.push(`Guidelines block: ${guidelineFiles.join(', ')}`);
  const count = (action) => changes.filter((c) => c.action === action).length;
  const summary = ['add', 'update', 'remove'].map((a) => (count(a) ? `${count(a)} ${a === 'add' ? 'new' : a === 'update' ? 'updated' : 'removed'}` : '')).filter(Boolean);
  lines.push(summary.length ? `Changes: ${summary.join(', ')}` : 'Changes: none, already up to date');
  for (const [what, source] of [['agents', opts.agentSource], ['skills', opts.skillSource]]) {
    if (source === 'package.json' || source === '.ai/nestjs-boost.json') lines.push(`(${what} come from ${source}; edit it there to change them)`);
  }
  return lines;
}

// Returns the final sync report, or null when the user declines.
export async function interactiveInstall(root, explicit, run, io, log = console.log) {
  // Dry run first: fails early outside a NestJS project and tells us the current agents.
  const current = sync(root, explicit, { ...run, dryRun: true });
  const pinned = ['package.json', '.ai/nestjs-boost.json'].includes(current.opts.agentSource);
  let agents = current.opts.agents;
  if (!pinned) {
    agents = await multiSelect({
      message: 'Which AI coding agents do you use?',
      choices: agentChoices(current.opts.agents, current.foundAgents),
    }, io);
  }
  let choice = { ...explicit, agents };

  // Skills: skipped when the command line (--include / --all) or config already decides.
  const skillsGiven = explicit.include !== undefined || explicit.all !== undefined || current.opts.skillSource;
  if (!skillsGiven) choice = { ...choice, ...(await askSkills(current, explicit, io)) };

  const plan = sync(root, choice, { ...run, dryRun: true });
  log('');
  for (const line of describePlan(plan)) log(line);
  for (const w of plan.warnings) log(`  ! ${w}`);
  if (!plan.changes.length) return plan;
  log('');
  if (!(await confirm({ message: 'Install now?' }, io))) return null;
  return sync(root, choice, run);
}
