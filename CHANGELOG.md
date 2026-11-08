# Changelog

## 1.2.0 — 2026-11-08

First release after the package was republished (versions 1.0.0 and 1.1.0 can't be reused on npm). It includes everything below.

### Repository security
- `SECURITY.md` with private vulnerability reporting, CodeQL code scanning (JavaScript and workflows), Dependabot updates for the pinned Actions, `CODEOWNERS`, and LF line endings via `.gitattributes`.

### Added
- **Interactive setup.** `npx nestjs-boost install` asks which AI coding agents you use (detected ones pre-selected), shows the plan (skills, folders, which agents read each folder, instructions files, change counts) and installs after you confirm. The choice is saved in the lock file and reused by later runs and `npm install`.
- **Seven more agents:** Gemini CLI, Windsurf, Cline, Roo Code, Kiro, JetBrains Junie and OpenCode, alongside Claude Code, OpenAI Codex, GitHub Copilot and Cursor. Each installs into the skills folder its own docs specify, with the guidelines block in its instructions file (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md` or `.github/copilot-instructions.md`).
- **Shared folders without duplicates:** with several agents selected, each skill is installed once into the folders that cover all of them (for example Claude Code + Cursor + Copilot share `.claude/skills/`).
- `nestjs-boost agents` lists the supported agents and their folders. `-y` / `--yes` skips all questions.
- Agent registry in `lib/agents.mjs`: adding an agent is one entry (see CONTRIBUTING.md).

### Changed
- **Install paths for Cursor and Copilot on their own:** selected alone (or without an agent that shares a folder with them), Cursor now uses `.cursor/skills/` and Copilot `.github/skills/`, their native folders, instead of `.agents/skills/`. The next sync moves the skills there and removes the old copies unless you edited them. With Claude Code or Codex also selected, nothing moves.
- Deselecting an agent now also removes the guidelines block from its instructions file (and the file, if nestjs-boost created it and nothing else is left).
- Install output groups skill changes per folder.
- `install` never prompts in CI, with piped output, with `--yes`/`--agents`, or when `agents` is set in config, so scripted runs behave as before.

### Security
- **Lock file entries are validated.** Only skill folders under `.claude/skills/` / `.agents/skills/` and the known guideline files are honoured. Before this, a crafted `.ai/nestjs-boost.lock.json` could make `install` (and so `npm install`) delete any project folder whose hash it listed, and `uninstall --force` could target the project root.
- **Symbolic links are never followed.** Writes and deletes refuse a link anywhere on the path. Links inside skill folders, `.ai/skills/` and `.ai/guidelines/` are skipped when hashing, copying or reading, so link loops and device files can't hang an install.
- **Postinstall is opt-in and refresh-only.** It syncs only when the project has a lock file or a `"nestjs-boost"` config key, only when `nestjs-boost` is a direct dependency, and never under `npx`. Installing the package no longer adds agent instructions on its own; run `npx nestjs-boost install` once.
- Block markers are stripped from project-supplied guideline text and skill descriptions, so they can't shift the managed block over user content.
- Custom skill names in `.ai/skills/` must be lowercase-with-hyphens.
- `scripts/validate.mjs` now runs on Windows. Before, it exited 0 without validating, which skipped the `npm test` / `prepublishOnly` gate there.
- Release workflow: actions pinned to commit SHAs, npm pinned instead of `@latest`, publish job runs in an `npm-publish` environment, and the tag must match `package.json` and `manifest.json`.
- `nestjs-openapi`: the Fastify helmet CSP example for Swagger UI now applies only when docs are enabled and no longer allows bare `https:` scripts.

### Fixed
- `manifest.json` version now follows `package.json` (it was `0.1.0`), and the validator checks they match.

## 0.2.0 — 2026-11-06

### npm package
- `npm install -D nestjs-boost` installs the matching skills through a `postinstall` hook. The hook never fails an install, skips in CI (`NESTJS_BOOST_CI=1` opts in) and with `NESTJS_BOOST_SKIP=1`, and re-syncs on every install.
- Hash-protected sync: skill folders you edited are never overwritten or deleted without `--force`, and skills for removed packages are pruned.
- Agent detection from repository files; the default is Claude Code + Codex, which covers all four agents.
- Config through a `"nestjs-boost"` key in `package.json` or `.ai/nestjs-boost.json`.
- CLI: `install`, `list`, `uninstall`, plus `--dry-run`, `--force`, `--no-guidelines`, `--version`.
- Zero dependencies, Node 20.19+, 18 tests (`node:test`), a Node skill validator run before publish, and CI plus trusted-publishing release workflows.
- Per-skill evals moved from `skills/*/evals/` to `evals/skills/`, so they're no longer shipped or installed.

### Skills

- All **45 skills** written: 8 foundation + 37 package/operational skills, with 29 reference files (74 Markdown files under `skills/`).
- Coverage: 159 documentation pages, every one owned by exactly one skill (or the core guidelines). All 136 requested URLs map to an owner (`coverage/requested-url-map.md`).
- New in this release:
  - HTTP and auth: http-platform, http-web-features, openapi, webhooks, authentication, authorization, passport-auth
  - Data: TypeORM, Drizzle, Mongoose, Prisma, MikroORM, Sequelize, caching
  - Application packages: events, scheduling, queues, http-client, mail, i18n, file-storage, cqrs, standalone-apps
  - Reliability: resilience, idempotency, outbox, workflows, locks, health-checks, observability
  - APIs: graphql, websockets, microservices
  - AI: mcp-server, ai
  - Operations: deployment, upgrading
- Every skill passes `tools/validate_skills.py`, and every API claim was checked against the docs source.
- New tool: `tools/condense.py` (per-skill digest of owned pages, used to ground skill writing).
- Deferred: evals for the new skills, and the npm publish of the installer.

## 0.1.0 — 2026-11-05

- First build, from docs.nestjs.com @ `05c1fdfac8cf` (2026-11-04, NestJS 12).
- Core guidelines template with detected project facts and a skill map.
- 8 foundation skills: architecture, request-pipeline, validation-serialization, configuration, testing, cli-tooling, logging, security-hardening.
- Installer prototype: `install` / `update` / `list`, with package-based skill selection, four agent targets, marker-based guideline blocks, `.ai/skills` and `.ai/guidelines` overrides, and a lock file.
