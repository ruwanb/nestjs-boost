# Contributing to nestjs-boost

## Repository layout

```text
bin/nestjs-boost.mjs      CLI (install | list | agents | uninstall): argument parsing and output only
lib/agents.mjs            agent registry: skills folder, instructions file and markers per agent
lib/installer.mjs         detection, selection, hash-protected sync, uninstall (used by the CLI)
lib/setup.mjs             interactive install flow: pick agents → pick extra skills → show plan → confirm → sync
lib/prompt.mjs            dependency-free terminal prompts (multi-select, confirm)
scripts/validate.mjs      skill + manifest validation (runs in `npm test` and before publish)
test/                     node:test suite (no dependencies)
skills/<name>/            SKILL.md + references/*.md: the shipped content
guidelines/core.md        guidelines template ({{placeholders}} filled from detected facts)
manifest.json             generated from coverage/taxonomy.json; never hand-edit
coverage/                 docs crawl, page ownership, requested-URL map (not published)
tools/                    Python maintenance scripts (not published)
evals/                    output evals, graders, fixtures, trigger queries (not published)
```

Only `bin/`, `lib/`, `guidelines/`, `skills/`, `manifest.json`, `README.md`, `CHANGELOG.md`, `NOTICE.md` and `LICENSE` are published (see `files` in `package.json`). Run `npm pack --dry-run` to check.

## Workflow

```bash
npm test                                   # validate skills + run the test suite
node bin/nestjs-boost.mjs list --root evals/fixtures/rest-app
```

Changing skills:

1. Edit `skills/<name>/SKILL.md` or its references. Check every API against the docs source.
2. If ownership or install conditions change, edit `coverage/taxonomy.json`, then:
   ```bash
   python3 -I tools/build_manifest.py .
   python3 -I tools/check_coverage.py coverage/pages.json coverage/taxonomy.json coverage/coverage-matrix.md
   python3 -I tools/map_requested_urls.py .
   ```
3. Bump `metadata.docs-crawled` when the skill was re-checked against a newer docs snapshot.
4. Run `npm test`.

## Adding an agent

Everything agent-specific lives in one entry in [lib/agents.mjs](lib/agents.mjs). The picker, `--agents`, detection, the install plan, lock-file validation and `nestjs-boost agents` all read it. Only agents that load the open Agent Skills format (`<name>/SKILL.md` folders) fit the current model.

1. Find the agent's **official docs** for:
   - the project skills folder;
   - every other skills folder it also loads (for sharing);
   - its always-loaded project instructions file;
   - files or folders that show a project uses it.
2. Add an entry to `AGENT_LIST`:
   ```js
   {
     id: 'my-agent',                         // lowercase-with-hyphens; never rename once released
     name: 'My Agent',
     skills: { dir: '.my-agent/skills', reads: ['.my-agent/skills', '.agents/skills'] }, // native first
     instructions: 'AGENTS.md',
     markers: ['.my-agent'],                 // be specific: never a folder most repos have (.github)
     docs: 'https://…',                      // the page you took the paths from
   },
   ```
3. Add the id to the `agents` list in `tools/build_manifest.py` and `manifest.json`. `npm test` fails until they match.
4. Add the agent to the "Supported agents" table in `README.md`, and add a test in `test/agents.test.mjs` if it shares folders in a new way.
5. Run `npm test`. The registry tests check ids, path safety, and that every agent is covered by the folder plan.

Adding an agent is a **minor** release. Changing an existing agent's folder is **major**: the next sync moves the user's installed skills.

## Releasing

1. Update `CHANGELOG.md`, then run `npm version <patch|minor|major>`. This creates the commit and the `vX.Y.Z` tag.
2. `git push --follow-tags`. The release workflow runs the tests and publishes to npm with provenance.

Versioning follows semver, applied to what users see:
- **patch**: wording fixes in skills.
- **minor**: new skills or new options.
- **major**: a new NestJS major target, removed skills, or changed install paths.
