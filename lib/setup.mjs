// Interactive `nestjs-boost install`: pick agents, review the plan, confirm, install.
// All writing goes through installer.sync(); this module only asks questions and reports.
import { AGENTS, AGENT_LIST, sync } from './installer.mjs';
import { confirm, multiSelect } from './prompt.mjs';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

// A short, human description of what an install will do, built from a dry-run report.
export function describePlan(report) {
  const { skills, custom, skillDirs, guidelineFiles, changes, opts } = report;
  const lines = [];
  const foundation = skills.filter((s) => s.reason === 'foundation').length;
  const extra = [`${foundation} foundation`, `${skills.length - foundation} for your packages`, ...(custom.length ? [`${custom.length} project`] : [])];
  lines.push(`Skills: ${plural(skills.length + custom.length, 'skill')} (${extra.join(', ')})`);
  for (const { dir, agents } of skillDirs) {
    lines.push(`  ${`${dir}/`.padEnd(20)} read by ${agents.map((id) => AGENTS[id].name).join(', ')}`);
  }
  if (guidelineFiles.length) lines.push(`Guidelines block: ${guidelineFiles.join(', ')}`);
  const count = (action) => changes.filter((c) => c.action === action).length;
  const summary = ['add', 'update', 'remove'].map((a) => (count(a) ? `${count(a)} ${a === 'add' ? 'new' : a === 'update' ? 'updated' : 'removed'}` : '')).filter(Boolean);
  lines.push(summary.length ? `Changes: ${summary.join(', ')}` : 'Changes: none, already up to date');
  if (opts.agentSource === 'package.json' || opts.agentSource === '.ai/nestjs-boost.json') {
    lines.push(`(agents come from ${opts.agentSource}; edit it there to change them)`);
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
  const choice = { ...explicit, agents };
  const plan = sync(root, choice, { ...run, dryRun: true });
  log('');
  for (const line of describePlan(plan)) log(line);
  for (const w of plan.warnings) log(`  ! ${w}`);
  if (!plan.changes.length) return plan;
  log('');
  if (!(await confirm({ message: 'Install now?' }, io))) return null;
  return sync(root, choice, run);
}
