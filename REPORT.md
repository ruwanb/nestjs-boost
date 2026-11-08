# NestJS Skill Pack — Build Report

**Status:** Markdown phase complete. All 45 skills are written and validated, and coverage is complete (159 pages, 136/136 requested URLs). Deferred: evals for the 37 new skills, trigger evaluation, and the npm publish.
**Docs snapshot:** `nestjs/docs.nestjs.com` @ `05c1fdfac8cf` (2026-11-04), describing **NestJS 12**.

## Step 1 results

| Measure | Result |
| --- | --- |
| Sidebar pages crawled | 153, in 21 sections; every page resolved to its Markdown source |
| Source lines read | ~58,300 |
| Owners | 1 core-guidelines file + 44 skills (8 foundation, 36 conditional) |
| Coverage | **153/153 pages owned by exactly one owner**; 0 unowned, 0 double-owned (`tools/check_coverage.py`) |
| Excluded | 3 non-technical pages (who-uses, enterprise, support) |
| Gotcha candidates | 201 documentation warning boxes, sourced, grouped by skill |
| Skills needing `references/` | 38 of 44 (source material > 600 lines) |

## What changed from the Master Prompt's starting taxonomy

The live docs have moved well past what the starting taxonomy assumed. It grew from 29 skills to 44.

**Added: whole new doc sections and first-party packages**
- Reliability: `nestjs-resilience`, `nestjs-idempotency`, `nestjs-outbox`, `nestjs-workflows`, `nestjs-locks`
- Messaging and content: `nestjs-mail`, `nestjs-i18n`, `nestjs-file-storage`, `nestjs-webhooks`
- Integration: `nestjs-http-client`, `nestjs-mcp-server`, `nestjs-database-drizzle`

**Split**
- Auth became three skills, because the docs now cover three packages:
    - `nestjs-authentication` (`@nestjs/authentication`)
    - `nestjs-authorization` (`@nestjs/authorization`)
    - `nestjs-passport-auth` (the Passport/JWT recipe)
- Observability became two skills:
    - `nestjs-logging` (foundation)
    - conditional `nestjs-observability` (`@nestjs/observe` + OpenTelemetry), plus `nestjs-health-checks` (Terminus)

**Renamed or regrouped**
- `nestjs-cli-workspaces` → `nestjs-cli-tooling` (adds SWC, hot reload, REPL, Devtools)
- HTTP extras regrouped into `nestjs-http-platform` (adapters, versioning, transport-level options) and `nestjs-http-web-features` (cookies, session, uploads, SSE, MVC, static files)

## Findings that shape every skill

1. **Many first-party packages postdate typical model training.** A no-pack agent will likely default to Passport, Axios, nodemailer and hand-written retry or idempotency logic. These are the highest-value skills, and Phase 3 baselines should confirm this.
2. **v12 changed defaults:**
    - ESM-only packages; Vitest and oxlint for new projects
    - Standard Schema validation alongside `class-validator`
    - Zod-first config validation
    - the Node adapter
    - Rspack in place of webpack
    Skills will *detect* the project's choices rather than present menus (`coverage/domain-brief.md` §6).
3. **Recall risk.** A typical REST + ORM + auth + Swagger project installs about 13 skills. A project using the reliability, mail and observability packages can reach 20+. That exceeds the Claude API's 20-skills-per-request cap and strains recall in any agent. Decision needed (question 3 below).

## Files

| File | Purpose |
| --- | --- |
| `coverage/pages.json` | Every page: URL, section, source file, packages installed, imports, decorators, CLI commands, warning/hint boxes, headings |
| `coverage/taxonomy.json` | Skill owners, layer, install conditions, owned pages (source of truth for the coming `manifest.json`) |
| `coverage/coverage-matrix.md` | Owner summary + page → owner table + exclusions |
| `coverage/gotcha-candidates.md` | 201 sourced warning boxes by skill |
| `coverage/domain-brief.md` | v12 facts, terminology, request lifecycle, DI rules, detection defaults, open questions |
| `tools/build_pages.py`, `tools/check_coverage.py`, `tools/gotcha_candidates.py` | Re-runnable crawl, coverage check and extraction (rerun after each docs update) |

## Checkpoint decisions (2026-11-05)

| Question | Decision |
| --- | --- |
| Supported NestJS majors | **v12 only.** `nestjs-upgrading` covers moving v11 projects up. |
| Target agents | **Claude Code, Codex/`AGENTS.md`, Cursor, GitHub Copilot.** The installer writes to all four. |
| Reliability packages | **Five separate skills**, each installed only with its own package. |
| Pack name and distribution | **`nestjs-boost`, npm package** (`npx nestjs-boost install`). |

## Step 2 results: foundation skills, installer, evaluation

### What was built

| Item | State |
| --- | --- |
| `manifest.json` | 44 skills with install conditions, generated from `coverage/taxonomy.json` (`tools/build_manifest.py`) |
| `guidelines/core.md` | 65-line always-loaded template; the installer fills in the detected project facts and the skill map |
| Foundation skills | 8 `SKILL.md` files (75–138 lines each) + 9 reference files. All pass `tools/validate_skills.py`, which was itself checked against a deliberately broken skill. |
| `bin/install.mjs` | `install` / `update` / `list`, plus `--dry-run`, `--include`, `--exclude`, `--all` and `--yes`. Handles package detection, four agent targets, marker-based guideline blocks, `.ai/skills` overrides and custom skills, `.ai/guidelines` additions and a lock file. Tested on the fixture: idempotent, keeps existing `AGENTS.md` text, and `update` removes skills whose packages are gone. |
| Fixture | `nest new` output on NestJS 12.3.3 (ESM, Vitest, oxlint, Express) + 5 starting-code overlays |
| Evals | 24 output evals (3 per skill) with hidden graders that build, lint, run the tests, boot `dist/main.js` and probe over HTTP; 96 labelled trigger queries split 59 train / 37 validation |

Every claim in the skills was checked against the crawled pages. Seven details were corrected or removed because the docs don't support them, including an undocumented `Reflector.createDecorator({ transform })` option, class-transformer's `@Type()`, and a nestjs-cls config shape.

### Benchmark (iteration 1: Sonnet, 1 run per eval, clean context per run)

| | Without pack | With pack | Delta |
| --- | --- | --- | --- |
| Assertion pass rate | 97.4% (σ 0.046) | **100%** (σ 0) | +2.6 pts |
| Tokens per task | 63.3k | 71.3k | +8.1k (+13%) |
| Time per task | 74 s | 93 s | +19 s (+26%) |

Assertions: 198 pass in both configurations, 6 pass only with the pack, 0 pass only without it, 0 fail in both.

**How to read this honestly:**
- **Functional correctness was already high without the pack.** The baseline agent finds NestJS 12 APIs by reading `node_modules` type definitions, and it passed every build, test and HTTP check. The output evals as first written did not separate the two configurations.
- **The pack's measured value is following the official v12 docs.** These six assertions pass only with the pack:

| Eval | Without the pack | With the pack (documented v12 approach) |
| --- | --- | --- |
| sec-2 | adds `helmet` | built-in `app.useSecurityHeaders()` |
| pipe-2 | custom exception class | `errorCode` exception option |
| pipe-3 | reorders routes and adds a test | also enables `routeConflictPolicy` / `'specificity'` |
| cfg-1 | Joi | Zod as the Standard Schema validator |
| val-2 | hand-written stripping interceptor | `StandardSchemaSerializerInterceptor` allowlist |
| val-3 | parses query strings by hand in the service | schema with coercion, defaults and bounds |

- **Caveats:**
    - The five `[docs]` assertions were added after reviewing the baseline outputs, as the methodology prescribes for non-discriminating suites. They were applied identically to both configurations and re-graded.
    - The results come from a single run per eval on a single model, so treat ±1 assertion as noise.
    - The cost (+13% tokens) is mostly the skill files being read.
- **Grader and harness bugs found and fixed during calibration:**
    - The copy filter excluded `node_modules/*/dist`.
    - A starting-code guard let requests through when no key was set.
    - The `e2e-spec.ts` regex missed files.
    - The readiness probe used up part of the rate limit.
    - `val-2` and `arch-2` checks rejected valid documented alternatives.

### Iteration fixes applied from the with-pack runs (Phase 7)

- `forRoutes('*splat')` doesn't match `/`. The logging and request-pipeline skills now use `'{*splat}'` and explain the difference (found by the log-2 run).

### Not yet done in this step

- **Trigger evaluation** (96 queries × 3 runs, confusion matrix) hasn't been run. It needs a scripted agent CLI with skills installed, and is scheduled for Step 5 (whole-pack validation), when all skills exist.
- **Model coverage:** only Sonnet has been tested so far.

## Markdown phase results (2026-11-06)

| Measure | Result |
| --- | --- |
| Requested URLs | 136 in 18 sections; **136/136 mapped to an owner**, 0 unresolved (`tools/map_requested_urls.py`) |
| Docs pages owned | 159 (24 beyond the requested list, e.g. sub-pages); 0 unowned, 0 double-owned |
| Skills | 45 (8 foundation, 37 conditional); 29 reference files; all pass `validate_skills.py` |
| Grounding | Each skill was written from a `tools/condense.py` digest plus targeted reads of the owned pages. Claims the docs don't support were removed (e.g. `ParseObjectIdPipe`, persisted queries, Mercurius `federationMetadata`, an invented counter API). Corrected: the Fastify multipart import path |
| Description budget | All descriptions ≤ 1024 chars (five shortened after the first validation run) |

The taxonomy grew from the Step 1 plan (153 pages, 44 skills) to 159 pages and 45 skills, to cover pages on the requested list that weren't in the original crawl (for example the `/ai/*` section). Devtools stays in `nestjs-cli-tooling` (`docs.nestjs.com/devtools/overview`, CI/CD integration).

### Still open

- Output evals and benchmarks exist only for the foundation skills. The highest-value next evals are for packages newer than typical training data: authentication, http-client, mail, the reliability packages, mcp and ai.
- Trigger evaluation (confusion matrix across 45 descriptions) hasn't been run.
- npm packaging and publishing of `bin/install.mjs` are deferred, as agreed.

## Next step (original plan)

Step 3: a checkpoint on these results, then conditional skills cluster by cluster (persistence → HTTP extras/auth/OpenAPI → async/messaging → real-time/APIs → the rest).

The baseline result suggests the conditional skills for **packages newer than typical training data** are where the pack should add the most: `@nestjs/authentication`, `@nestjs/http-client`, `@nestjs/mail`, the reliability packages and `@nestjs/mcp`. Their evals should be written around those packages first.
