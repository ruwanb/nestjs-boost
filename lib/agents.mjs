// Registry of supported AI coding agents. This is the only place that knows where each agent reads
// skills and project instructions; the installer, CLI picker, lock-file validation and docs all
// derive from it. To add an agent, add one entry (see CONTRIBUTING.md → "Adding an agent").
//
// Every agent here supports the open Agent Skills format (a `<name>/SKILL.md` folder per skill),
// so skills are copied unchanged; only the location differs.
//
// Fields:
//   id            stable key used in --agents, config and the lock file (never rename one)
//   name          display name in the picker
//   skills.dir    the agent's native project skills folder (its documented, recommended location)
//   skills.reads  every project skills folder the agent loads, native first. Used to avoid
//                 installing the same skills twice when several agents share a folder.
//   instructions  the always-loaded project instructions file the guidelines block goes into
//   markers       files/folders whose presence means the project already uses this agent
//   docs          where the conventions above are documented
export const AGENT_LIST = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    skills: { dir: '.claude/skills', reads: ['.claude/skills'] },
    instructions: 'CLAUDE.md',
    markers: ['.claude', 'CLAUDE.md'],
    docs: 'https://code.claude.com/docs/en/skills',
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    hint: 'also any tool using .agents/skills + AGENTS.md',
    skills: { dir: '.agents/skills', reads: ['.agents/skills'] },
    instructions: 'AGENTS.md',
    markers: ['.codex', '.agents', 'AGENTS.md'],
    docs: 'https://developers.openai.com/codex/skills',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    skills: { dir: '.github/skills', reads: ['.github/skills', '.claude/skills', '.agents/skills'] },
    instructions: '.github/copilot-instructions.md',
    markers: ['.github/copilot-instructions.md', '.github/instructions', '.github/skills'],
    docs: 'https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/create-skills',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    skills: { dir: '.cursor/skills', reads: ['.cursor/skills', '.agents/skills', '.claude/skills', '.codex/skills'] },
    instructions: 'AGENTS.md',
    markers: ['.cursor', '.cursorrules'],
    docs: 'https://cursor.com/docs/skills',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    skills: { dir: '.gemini/skills', reads: ['.gemini/skills', '.agents/skills'] },
    instructions: 'GEMINI.md',
    markers: ['.gemini', 'GEMINI.md'],
    docs: 'https://geminicli.com/docs/cli/creating-skills',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    skills: { dir: '.windsurf/skills', reads: ['.windsurf/skills'] },
    instructions: 'AGENTS.md',
    markers: ['.windsurf', '.windsurfrules'],
    docs: 'https://docs.windsurf.com/windsurf/cascade/skills',
  },
  {
    id: 'cline',
    name: 'Cline',
    skills: { dir: '.cline/skills', reads: ['.cline/skills'] },
    instructions: 'AGENTS.md',
    markers: ['.cline', '.clinerules'],
    docs: 'https://docs.cline.bot/customization/skills',
  },
  {
    id: 'roo',
    name: 'Roo Code',
    skills: { dir: '.roo/skills', reads: ['.roo/skills', '.agents/skills'] },
    instructions: 'AGENTS.md',
    markers: ['.roo', '.roorules'],
    docs: 'https://docs.roocode.com/features/skills',
  },
  {
    id: 'kiro',
    name: 'Kiro',
    skills: { dir: '.kiro/skills', reads: ['.kiro/skills'] },
    instructions: 'AGENTS.md',
    markers: ['.kiro'],
    docs: 'https://kiro.dev/docs/skills/',
  },
  {
    id: 'junie',
    name: 'JetBrains Junie',
    skills: { dir: '.junie/skills', reads: ['.junie/skills'] },
    instructions: 'AGENTS.md',
    markers: ['.junie'],
    docs: 'https://junie.jetbrains.com/docs/agent-skills.html',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    skills: { dir: '.opencode/skills', reads: ['.opencode/skills', '.claude/skills', '.agents/skills'] },
    instructions: 'AGENTS.md',
    markers: ['.opencode', 'opencode.json', 'opencode.jsonc'],
    docs: 'https://opencode.ai/docs/skills',
  },
];

export const AGENTS = Object.fromEntries(AGENT_LIST.map((a) => [a.id, a]));
export const AGENT_IDS = AGENT_LIST.map((a) => a.id);

// Used when nothing is detected and no one is asked (--yes, CI, non-interactive shells).
// Between them, .claude/skills and .agents/skills are read by most agents in the registry.
export const DEFAULT_AGENTS = ['claude-code', 'codex'];

// Every folder any agent loads skills from, and every instructions file: the only places
// nestjs-boost may ever write. The lock-file allowlist is built from these.
export const ALL_SKILL_DIRS = [...new Set(AGENT_LIST.flatMap((a) => a.skills.reads))];
export const ALL_INSTRUCTION_FILES = [...new Set(AGENT_LIST.map((a) => a.instructions))];

// Choose the fewest skills folders that every selected agent reads, so no agent sees each skill
// twice. Agents that read the fewest folders choose first (they have no alternative); an agent
// whose folders already include a chosen one is covered. A single agent always gets its native
// folder. Deterministic: the same selection always gives the same folders.
export function planSkillDirs(agentIds) {
  const agents = agentIds.map((id) => AGENTS[id]);
  const order = [...agents].sort((a, b) => a.skills.reads.length - b.skills.reads.length
    || AGENT_IDS.indexOf(a.id) - AGENT_IDS.indexOf(b.id));
  const dirs = [];
  for (const a of order) {
    if (!a.skills.reads.some((d) => dirs.includes(d))) dirs.push(a.skills.dir);
  }
  // Report which agents read each chosen folder (for the plan shown to the user).
  return dirs.map((dir) => ({ dir, agents: agents.filter((a) => a.skills.reads.includes(dir)).map((a) => a.id) }));
}

export const instructionFiles = (agentIds) => [...new Set(agentIds.map((id) => AGENTS[id].instructions))];
