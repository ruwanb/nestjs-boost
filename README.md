# nestjs-boost

Agent Skills and project guidelines for AI-assisted **NestJS 12** development, for Claude Code, GitHub Copilot, Cursor, OpenAI Codex, Gemini CLI, Windsurf, Cline, Roo Code, Kiro, JetBrains Junie and OpenCode.

Install it in a NestJS project. It detects which Nest packages you use, then copies in **only the skills you need**, and lets you add any of the others: 45 skills built from the official docs, covering everything from DI and testing to TypeORM, BullMQ, GraphQL, microservices, MCP and `@nestjs/ai`. It also adds a short guidelines block describing your project to each agent's instructions file (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, ...).

```bash
npm install -D nestjs-boost
npx nestjs-boost install
```

`install` asks which agents you use and which extra skills you want, shows what it will write, and installs after you confirm:

```text
? Which AI coding agents do you use?
  ↑/↓ move · space select · a all/none · enter confirm · esc cancel
❯ ◉ Claude Code                 .claude/skills/ · CLAUDE.md
  ◯ OpenAI Codex                .agents/skills/ · AGENTS.md
  ◯ GitHub Copilot              .github/skills/ · .github/copilot-instructions.md
  ◉ Cursor          (detected)  .cursor/skills/ · AGENTS.md
  ◯ Gemini CLI                  .gemini/skills/ · GEMINI.md
  ...

? Which skills do you want?
  ↑/↓ move · enter confirm · esc cancel
❯ Only matching skills (recommended)  14 skills: foundation + your packages
  All skills                          45 skills, including packages you don't use
  Choose skills                       pick from the full list

Skills: 14 skills (8 foundation, 6 for your packages)
  .claude/skills/      read by Claude Code, Cursor
Guidelines block: CLAUDE.md, AGENTS.md
Changes: 16 new
? Install now? (Y/n)
```

Agents already used in the repo are detected and pre-selected. For skills, press Enter to install only those matching your packages, pick **All skills**, or pick **Choose skills** to tick and untick from the full list (matching ones start ticked). Your choices are saved in `.ai/nestjs-boost.lock.json`, so later runs reuse them. Run `npx nestjs-boost install` again whenever you want to change them.

Installing the package runs no scripts and writes nothing to your project. Only `nestjs-boost install` does. Adding it as a dev dependency is optional: it pins the version for your team, so everyone's `npx nestjs-boost install` gives the same skills.

Commit the skill folders, instruction files and `.ai/nestjs-boost.lock.json` so the whole team and CI agents get the same skills.

## Supported agents

Every agent below supports the open [Agent Skills](https://agentskills.io) format (one `<name>/SKILL.md` folder per skill), so skills are copied unchanged into the folder that agent documents. Run `npx nestjs-boost agents` for the same table.

| Agent | `--agents` id | Skills folder | Guidelines block in |
| --- | --- | --- | --- |
| Claude Code | `claude-code` | `.claude/skills/` | `CLAUDE.md` |
| OpenAI Codex | `codex` | `.agents/skills/` | `AGENTS.md` |
| GitHub Copilot | `copilot` | `.github/skills/` | `.github/copilot-instructions.md` |
| Cursor | `cursor` | `.cursor/skills/` | `AGENTS.md` |
| Gemini CLI | `gemini` | `.gemini/skills/` | `GEMINI.md` |
| Windsurf | `windsurf` | `.windsurf/skills/` | `AGENTS.md` |
| Cline | `cline` | `.cline/skills/` | `AGENTS.md` |
| Roo Code | `roo` | `.roo/skills/` | `AGENTS.md` |
| Kiro | `kiro` | `.kiro/skills/` | `AGENTS.md` |
| JetBrains Junie | `junie` | `.junie/skills/` | `AGENTS.md` |
| OpenCode | `opencode` | `.opencode/skills/` | `AGENTS.md` |

**Shared folders.** Several agents also read other agents' folders. Cursor, Copilot and OpenCode read `.claude/skills/`; Gemini CLI, Roo Code, Cursor, Copilot and OpenCode read `.agents/skills/`. When you pick more than one agent, nestjs-boost installs each skill once into the folders that cover all of them, so no agent sees duplicates. For example, Claude Code + Cursor + Copilot share `.claude/skills/`. A single agent always gets its own folder. The install plan shows which agents read each folder.

Using another agent that supports Agent Skills and `AGENTS.md`? Pick **OpenAI Codex**: `.agents/skills/` + `AGENTS.md` is the cross-agent convention.

## How it works

- **Selection:** the 8 foundation skills always install. Package skills install when their package is in `package.json` (for example `@nestjs/typeorm` → `nestjs-database-typeorm`). Monorepo `apps/*`, `libs/*` and `packages/*` are included. Change this in the `install` skill menu, with `--include` / `--exclude`, or install all of them with `--all`. Run `npx nestjs-boost list` to see what was picked and why.
- **Agents:** you pick them in `install`. Without a terminal to ask in (CI, piped output, `--yes`), nestjs-boost uses, in order: `--agents`, the `agents` config, your last choice from the lock file, then agents detected from repo files (`.claude/`, `.cursor/`, `.gemini/`, `.windsurf/`, `AGENTS.md`, ...). If nothing applies, it uses Claude Code + Codex, whose folders most agents read.
- **Switching agents** removes what was installed for the agents you dropped: their skill folders, and the guidelines block in their instructions file. Files nestjs-boost created are deleted if nothing else is left in them. Folders you edited are kept.
- **Updates:** run `npx nestjs-boost install` (or `install --yes` to reuse your last choices without questions) after adding Nest packages or upgrading nestjs-boost:
  - New packages get their skills.
  - Upgrading `nestjs-boost` refreshes the skill text.
  - Skills for removed packages are deleted.
- **Your edits are safe.**
  - A skill folder you changed is never overwritten or deleted. Changes are tracked by hash in the lock file.
  - Text outside the `<!-- nestjs-boost:start/end -->` markers is never touched.
  - It runs offline, has no dependencies, and writes only inside your project.

## Keeping skills in sync

nestjs-boost has no install script, so `npm install` never runs it and package managers never ask you to approve it. Re-run the CLI when your dependencies change:

```bash
npx nestjs-boost install --yes
```

To do this automatically, add it to your own scripts, for example `"prepare": "nestjs-boost install --yes"` in `package.json` (with nestjs-boost as a dev dependency).

## Commands

```bash
npx nestjs-boost install               # pick agents, review the plan, install (opts the project in)
npx nestjs-boost install --yes         # no questions: reuse the last choices (scripts, CI)
npx nestjs-boost install --include nestjs-graphql,nestjs-cqrs   # add skills without the menu
npx nestjs-boost install --all         # every skill
npx nestjs-boost install --agents cursor,gemini   # choose agents without the picker
npx nestjs-boost install --dry-run     # show the plan
npx nestjs-boost install --force       # also overwrite skills you edited
npx nestjs-boost list                  # detected facts + selected skills (writes nothing)
npx nestjs-boost agents                # supported agents and their folders
npx nestjs-boost uninstall             # remove skills, guideline blocks and the lock file
```

Options: `--agents <ids>` (see [Supported agents](#supported-agents)), `-y, --yes`, `--include <skills>`, `--exclude <skills>`, `--all`, `--no-guidelines`, `--root <dir>`.

The questions appear only in an interactive terminal. They never appear in CI (`CI` set), when output is piped, with `--yes` or `--agents`, or when `agents` is set in config. Those runs never wait for input.

## Configuration

Settings can live in `package.json`, so the whole team shares them:

```json
{
  "nestjs-boost": {
    "agents": ["claude-code"],
    "include": ["nestjs-deployment", "nestjs-upgrading"],
    "exclude": ["nestjs-passport-auth"],
    "guidelines": true
  }
}
```

You can put the same object in `.ai/nestjs-boost.json` instead. CLI flags override both. When `agents` is set here, `install` uses it and doesn't show the agent picker; when `include` or `all` is set, it doesn't show the skill menu. Leave them out to choose interactively.

## Customizing

| Want to… | Do this |
| --- | --- |
| Change a pack skill for your team | Copy it to `.ai/skills/<skill-name>/` and edit it. Your version replaces the pack's on every sync |
| Add your own skill | Create `.ai/skills/<new-name>/SKILL.md`. It's installed and listed in the guidelines skill map |
| Add project rules to the guidelines | Add `.ai/guidelines/*.md`. These files are appended to the guidelines block |

## Skills

| Area | Skills |
| --- | --- |
| **Foundation** (always) | `nestjs-architecture`, `nestjs-request-pipeline`, `nestjs-validation-serialization`, `nestjs-configuration`, `nestjs-testing`, `nestjs-cli-tooling`, `nestjs-logging`, `nestjs-security-hardening` |
| HTTP and API | `nestjs-http-platform`, `nestjs-http-web-features`, `nestjs-openapi`, `nestjs-graphql`, `nestjs-websockets`, `nestjs-webhooks` |
| Auth | `nestjs-authentication`, `nestjs-authorization`, `nestjs-passport-auth` |
| Data | `nestjs-database-typeorm`, `nestjs-database-drizzle`, `nestjs-database-prisma`, `nestjs-database-mongoose`, `nestjs-database-mikro-orm`, `nestjs-database-sequelize`, `nestjs-caching` |
| Application | `nestjs-events`, `nestjs-scheduling`, `nestjs-queues`, `nestjs-http-client`, `nestjs-mail`, `nestjs-i18n`, `nestjs-file-storage`, `nestjs-cqrs`, `nestjs-standalone-apps`, `nestjs-microservices` |
| Reliability and ops | `nestjs-resilience`, `nestjs-idempotency`, `nestjs-outbox`, `nestjs-workflows`, `nestjs-locks`, `nestjs-health-checks`, `nestjs-observability`, `nestjs-deployment`, `nestjs-upgrading` |
| AI | `nestjs-mcp-server`, `nestjs-ai` |

`nestjs-standalone-apps`, `nestjs-deployment` and `nestjs-upgrading` install only when their condition is met (`nest-commander`, a `Dockerfile`/`serverless.yml`, NestJS < 12) or when you add them in the skill menu or with `include`.

## Requirements

- NestJS 12 projects. On older majors, the `list` command points you to `nestjs-upgrading`.
- Node.js 20.19+.

## Security

The package has no dependencies and makes no network calls. It reads `package.json`, lockfile names, `nest-cli.json` and `.ai/`, and writes only the paths shown above, inside the project root. It has no install scripts: nothing runs on `npm install`, and nothing is written until you run `nestjs-boost install`. Source and skills are plain text you can review in `node_modules/nestjs-boost`.

Hardening against a hostile repository or a tampered lock file:

- **Lock file entries are not trusted.** Only `<agent skills folder>/<name>` folders (the folders in [Supported agents](#supported-agents)) and the agents' instructions files are honoured. Any other entry is ignored with a warning, so a lock file can't be used to delete other project files, even with `--force`.
- **Symbolic links are never followed.** A link or junction on any path nestjs-boost writes to or deletes (for example a symlinked `.claude/`) stops the sync with an error. Links inside skill folders, `.ai/skills/` and `.ai/guidelines/` are skipped, never copied or read.
- **The guideline block can't be hijacked.** Marker comments inside `.ai/guidelines/*.md` or a custom skill's description are stripped, so text outside the block stays yours.

Report vulnerabilities privately through GitHub security advisories, not public issues.

## License

MIT. The skills are distilled from the [NestJS documentation](https://github.com/nestjs/docs.nestjs.com) (MIT); see `NOTICE.md`. This is a community project, not affiliated with the NestJS team.

## Credits

Thanks to the NestJS team, with appreciation and love, for their clean and clear [documentation](https://github.com/nestjs/docs.nestjs.com).
