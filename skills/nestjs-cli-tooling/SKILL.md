---
name: nestjs-cli-tooling
description: Uses the NestJS 12 CLI and build tooling — nest generate schematics (resource, module, controller, service, guard, …), the CRUD resource generator, converting to a monorepo with apps and libraries (@app/* path aliases), builders (tsc, swc, rspack), SWC with type checking, nest-cli.json options, nest upgrade/nest info/nest deploy, REPL, hot reload and Devtools. Use when scaffolding anything Nest-shaped, adding a second app or shared library, speeding up builds, changing the compiler/bundler, fixing nest-cli.json or path alias issues, or upgrading Nest packages together, even if the user doesn't mention the CLI. Not for runtime module design (nestjs-architecture).
compatibility: NestJS 12.x; @nestjs/cli 12; generators need Node 22.22.3+, 24.15+ or 26+
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-04"
---

# NestJS CLI and tooling

Use the project-local CLI: `npx nest …` (or the package manager's equivalent). Generators place files in Nest's conventional layout, register them in the closest module, and add spec files.

## Generate

```bash
npx nest g resource orders            # prompts for transport (REST/GraphQL/microservice/WS) and CRUD entry points
npx nest g resource orders --type rest --crud   # non-interactive (--crud generates CRUD entry points)
npx nest g module|controller|service|guard|interceptor|pipe|filter|middleware|decorator|gateway|resolver <name>
npx nest g service users/admin --flat     # no extra folder
```

| Option | Effect |
| --- | --- |
| `--dry-run` / `-d` | Preview the changes |
| `--no-spec` | Skip spec files (keep them by default) |
| `--skip-import` | Don't register in the closest module |
| `--flat` | Don't create a folder |
| `--project <name>` / `-p` | Target an app or library in a monorepo |
| `--type rest\|graphql-code-first\|graphql-schema-first\|microservice\|ws` | `resource` only |

`nest g resource` creates a module, controller, service, `dto/create-*.dto.ts`, `dto/update-*.dto.ts` (using `PartialType`, adding `@nestjs/mapped-types` if needed), `entities/*.entity.ts` and specs, and imports the module into the app module. It is TypeScript-only. Fill in the generated stubs (DTO fields, service logic) and replace the placeholder "should be defined" specs with real tests.

## Monorepo: apps and libraries

```bash
npx nest g app worker        # first run converts standard mode → monorepo (moves src/ to apps/<name>/)
npx nest g library common    # libs/common, aliased as @app/common in tsconfig paths
npx nest build worker        # build one project; `nest build --all --parallel` builds all
npx nest start worker --watch
```

- The conversion moves the existing app to `apps/<original-name>/` and sets `"monorepo": true` and the `projects` map in `nest-cli.json`. Update the `package.json` scripts (`start:prod` → `dist/apps/<name>/main`) and the lint/test globs.
- **v12 monorepos default to the Rspack builder** (`compilerOptions.builder: "rspack"`), which bundles each app into one file and already compiles with SWC.
- Import libraries through the alias: `import { CommonModule } from '@app/common'`. The alias lives only in `tsconfig.json` `paths`; **test runners resolve modules themselves**. Mirror the alias in Vitest (`resolve.tsconfigPaths: true` with Vite 8, as generated projects do) or in Jest `moduleNameMapper` for e2e configs.
- Project-level `compilerOptions` in `nest-cli.json` **replace** the top-level ones; they are not merged.
- Use `includeLibraryAssets` to copy a library's assets into an app build.

## Faster builds: SWC

Standard (non-monorepo) projects:

```bash
npm i -D @swc/cli @swc/core
```

```json
// nest-cli.json
{ "compilerOptions": { "builder": "swc", "typeCheck": true } }
```

- `typeCheck: true` runs `tsc --noEmit` alongside SWC, because SWC alone does not type-check.
- SWC emits ESM when `package.json` has `"type": "module"`, and CommonJS otherwise. A `.swcrc` overrides this; only add one for custom needs.
- Tests: Vitest needs `unplugin-swc` (the `swc.vite()` plugin) to emit decorator metadata; Jest needs `@swc/jest`.
- Circular imports under SWC: wrap property and constructor types in `Relation<T>` (TypeORM) or a `WrapperType<T> = T` alias.

## Upgrading and diagnostics

- `nest upgrade` (from the project root, after updating the global CLI): moves all `@nestjs/*` packages to the matching major at once, bumps TypeScript to v6, migrates `nest-cli.json` webpack options to Rspack, and prints a report. Run it with `--dry-run` first. It deliberately doesn't switch you to ESM, Vitest or oxlint.
- `nest info`: prints Node, CLI and `@nestjs/*` versions. Include it in bug reports.
- `nest add <lib>`: installs a library and runs its schematic.
- `nest deploy`: forwards to NestJS Mau (installs `@nestjs/mau` on first use).

## Gotchas

- **webpack is deprecated** in v12: `--webpack`, `--webpackPath` and `webpack`/`webpackConfigPath` in `nest-cli.json` → use `--builder rspack` (or `swc`/`tsc`). The hot-reload recipe still targets webpack-based CommonJS projects.
- **Generators need a newer Node** (22.22.3+, 24.15+ or 26+) than running the app (20.19+).
- `nest g decorator` generates the `Reflector.createDecorator()` form in v12.
- Run the generator from the project root; inside a monorepo, pass `--project`.
- Converting to a monorepo only works for the canonical Nest structure (`src/` + `test/` at the root); the schematic moves both folders into `apps/<name>/`.

## Workflow

- [ ] 1. Preview with `--dry-run`, then generate.
- [ ] 2. Check the module registration and imports the generator added; fill in the generated stubs.
- [ ] 3. After structural changes (monorepo, builder), update `package.json` scripts and test-runner aliases.
- [ ] 4. Build every affected project, run lint and both test suites, and start the built app.

## Reference files

- `references/nest-cli-json.md`: every `nest-cli.json` property (compilerOptions, generateOptions, assets, projects), REPL, hot reload, Devtools and CI integration. Read when editing `nest-cli.json` or setting up these tools.

Sources: [CLI usage](https://docs.nestjs.com/cli/usages) · [Workspaces](https://docs.nestjs.com/cli/monorepo) · [Libraries](https://docs.nestjs.com/cli/libraries) · [CRUD generator](https://docs.nestjs.com/recipes/crud-generator) · [SWC](https://docs.nestjs.com/recipes/swc) · [Migration guide](https://docs.nestjs.com/migration-guide)
