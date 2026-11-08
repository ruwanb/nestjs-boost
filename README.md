# nestjs-boost

Agent Skills and project guidelines for AI-assisted **NestJS 12** development, for Claude Code, GitHub Copilot, Cursor, OpenAI Codex, Gemini CLI, Windsurf, Cline, Roo Code, Kiro, JetBrains Junie and OpenCode.

Install it in a NestJS project. It detects which Nest packages you use, then copies in **only the skills you need**: 45 skills built from the official docs, covering everything from DI and testing to TypeORM, BullMQ, GraphQL, microservices, MCP and `@nestjs/ai`. It also adds a short guidelines block describing your project to each agent's instructions file (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, ...).

```bash
npm install -D nestjs-boost
npx nestjs-boost install
```

`install` asks which agents you use, shows what it will write, and installs after you confirm:

```text
? Which AI coding agents do you use?
  ↑/↓ move · space select · a all/none · enter confirm · esc cancel
❯ ◉ Claude Code                 .claude/skills/ · CLAUDE.md
  ◯ OpenAI Codex                .agents/skills/ · AGENTS.md
  ◯ GitHub Copilot              .github/skills/ · .github/copilot-instructions.md
  ◉ Cursor          (detected)  .cursor/skills/ · AGENTS.md
  ◯ Gemini CLI                  .gemini/skills/ · GEMINI.md
  ...

Skills: 14 skills (8 foundation, 6 for your packages)
  .claude/skills/      read by Claude Code, Cursor
Guidelines block: CLAUDE.md, AGENTS.md
Changes: 16 new
? Install now? (Y/n)
```

Agents already used in the repo are detected and pre-selected. Your choice is saved in `.ai/nestjs-boost.lock.json`, so later runs and `npm install` reuse it. Run `npx nestjs-boost install` again whenever you want to change it.

The first `nestjs-boost install` is an explicit opt-in: installing the package alone never adds agent instructions to your project. After that, every `npm install` keeps the skills in sync.

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

- **Selection:** the 8 foundation skills always install. Package skills install when their package is in `package.json` (for example `@nestjs/typeorm` → `nestjs-database-typeorm`). Monorepo `apps/*`, `libs/*` and `packages/*` are included. Run `npx nestjs-boost list` to see what was picked and why.
- **Agents:** you pick them in `install`. Without a terminal to ask in (CI, piped output, `--yes`, the `postinstall` hook), nestjs-boost uses, in order: `--agents`, the `agents` config, your last choice from the lock file, then agents detected from repo files (`.claude/`, `.cursor/`, `.gemini/`, `.windsurf/`, `AGENTS.md`, ...). If nothing applies, it uses Claude Code + Codex, whose folders most agents read.
- **Switching agents** removes what was installed for the agents you dropped: their skill folders, and the guidelines block in their instructions file. Files nestjs-boost created are deleted if nothing else is left in them. Folders you edited are kept.
- **Updates:** once the project has opted in (it has `.ai/nestjs-boost.lock.json` from a first `nestjs-boost install`, or a `"nestjs-boost"` key in `package.json`), every `npm install` / `npm ci` re-syncs the skills:
  - New packages get their skills.
  - Upgrading `nestjs-boost` refreshes the skill text.
  - Skills for removed packages are deleted.
- **Your edits are safe.**
  - A skill folder you changed is never overwritten or deleted. Changes are tracked by hash in the lock file.
  - Text outside the `<!-- nestjs-boost:start/end -->` markers is never touched.
  - It runs offline, has no dependencies, and writes only inside your project.

## Package managers

After the first `nestjs-boost install`, a `postinstall` script keeps the skills in sync. It runs only when `nestjs-boost` is a direct dependency of the project, never under `npx`. Some setups don't run dependency scripts. In that case, run the CLI again after adding Nest packages:

```bash
npx nestjs-boost install
```

| Setup | What to do |
| --- | --- |
| npm 11 (warns about unapproved install scripts) | `npm install-scripts approve nestjs-boost` (adds it to `allowScripts`) |
| pnpm 10+ (blocks scripts by default) | `pnpm approve-builds`, or add `"pnpm": { "onlyBuiltDependencies": ["nestjs-boost"] }` |
| Bun | add `"trustedDependencies": ["nestjs-boost"]` |
| Yarn, npm ≤ 10 | nothing; scripts run |
| `--ignore-scripts` | run `npx nestjs-boost install` |
| CI (`CI` set) | skipped on purpose; set `NESTJS_BOOST_CI=1` to sync in CI |
| Opt out temporarily | `NESTJS_BOOST_SKIP=1 npm install` |

## Commands

```bash
npx nestjs-boost install               # pick agents, review the plan, install (opts the project in)
npx nestjs-boost install --yes         # no questions: reuse the last choice (scripts, CI)
npx nestjs-boost install --agents cursor,gemini   # choose agents without the picker
npx nestjs-boost install --dry-run     # show the plan
npx nestjs-boost install --force       # also overwrite skills you edited
npx nestjs-boost list                  # detected facts + selected skills (writes nothing)
npx nestjs-boost agents                # supported agents and their folders
npx nestjs-boost uninstall             # remove skills, guideline blocks and the lock file
```

Options: `--agents <ids>` (see [Supported agents](#supported-agents)), `-y, --yes`, `--include <skills>`, `--exclude <skills>`, `--all`, `--no-guidelines`, `--root <dir>`.

The picker appears only in an interactive terminal. It never appears in CI (`CI` set), when output is piped, with `--yes` or `--agents`, or when `agents` is set in config. Those runs never wait for input.

## Configuration

Settings persist in `package.json`, and the postinstall step uses them too. Adding this key also opts the project in to syncing on `npm install`, even before the first `nestjs-boost install`:

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

You can put the same object in `.ai/nestjs-boost.json` instead. CLI flags override both. When `agents` is set here, `install` uses it and doesn't show the picker. Leave it out to choose interactively.

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

`nestjs-standalone-apps`, `nestjs-deployment` and `nestjs-upgrading` install only when their condition is met (`nest-commander`, a `Dockerfile`/`serverless.yml`, NestJS < 12) or when you `include` them.

## Requirements

- NestJS 12 projects. On older majors, the `list` command points you to `nestjs-upgrading`.
- Node.js 20.19+.

## Security

The package has no dependencies and makes no network calls. It reads `package.json`, lockfile names, `nest-cli.json` and `.ai/`, and writes only the paths shown above, inside the project root. The install script never fails your install, and it never writes to a project that hasn't opted in. Source and skills are plain text you can review in `node_modules/nestjs-boost`.

Hardening against a hostile repository or a tampered lock file:

- **Lock file entries are not trusted.** Only `<agent skills folder>/<name>` folders (the folders in [Supported agents](#supported-agents)) and the agents' instructions files are honoured. Any other entry is ignored with a warning, so a lock file can't be used to delete other project files, even with `--force`.
- **Symbolic links are never followed.** A link or junction on any path nestjs-boost writes to or deletes (for example a symlinked `.claude/`) stops the sync with an error. Links inside skill folders, `.ai/skills/` and `.ai/guidelines/` are skipped, never copied or read.
- **The guideline block can't be hijacked.** Marker comments inside `.ai/guidelines/*.md` or a custom skill's description are stripped, so text outside the block stays yours.

Report vulnerabilities privately through GitHub security advisories, not public issues.

## License

MIT. The skills are distilled from the [NestJS documentation](https://github.com/nestjs/docs.nestjs.com) (MIT); see `NOTICE.md`. This is a community project, not affiliated with the NestJS team.

## Credits

Thanks to the NestJS team, with appreciation and love, for their clean and clear [documentation](https://github.com/nestjs/docs.nestjs.com).
