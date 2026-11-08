---
name: nestjs-upgrading
description: Migrates NestJS applications from v11 to v12 and keeps them current — nest upgrade, Node.js floors for running (20.19+/22.12+) vs CLI schematics (22.22.3+/24.15+/26+), ESM-only packages consumed via require(esm) and the Lambda NODE_OPTIONS flag, Jest on Node 24.9+ vs Vitest, TypeScript 6, lifecycle hook ordering by hierarchy, @Optional no longer inherited, Standard Schema in @Body/@Query/@Param and @nestjs/config (Joi 18 libraryOptions), Terminus HealthIndicatorService, graphql-ws and GraphiQL defaults, NATS v3, Rspack replacing webpack flags, routeConflictPolicy, errorCode, structured logging, and the optional CommonJS-to-ESM switch (type module, nodenext, .js extensions, import.meta.dirname). Use when upgrading Nest majors, fixing ERR_REQUIRE_ESM / ERR_REQUIRE_ASYNC_MODULE or UnknownDependenciesException after an upgrade, or converting a project to ESM. Not for adopting new v12 packages (use their own skills).
compatibility: Upgrading from NestJS 11.x to 12.x; TypeScript 6
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# Upgrading NestJS (v11 → v12)

```bash
npm i -g @nestjs/cli@latest @nestjs/schematics@latest            # global binary first: `nest upgrade` ships with it
npm i -D @nestjs/cli@latest @nestjs/schematics@latest typescript@^6
nest upgrade                                                      # bumps every @nestjs/* package to the same major
```

Upgrade on a branch with a green test suite. Move **all** `@nestjs/*` packages together, then fix compile errors, then go through the checklist below.

## Node.js

| Task | Minimum |
| --- | --- |
| Run a v12 app | **20.19+** or **22.12+** (21.x unsupported) |
| `nest new` / `generate` / `upgrade` | **22.22.3+**, **24.15+** or **26+** |
| Jest loading v12 packages | **24.9+** (otherwise `ERR_REQUIRE_ASYNC_MODULE`) |

The packages are ESM-only. CommonJS apps load them through `require(esm)`. **AWS Lambda disables it** on its Node 20/22/24 runtimes, so set `NODE_OPTIONS=--experimental-require-module` there (appended to any existing flags). Simplest path: the latest active LTS everywhere (CI, Docker, dev machines).

Your app **may stay CommonJS**. `nest upgrade` doesn't change module format.

## Breaking or behavioural changes

| Area | What to do |
| --- | --- |
| Lifecycle hooks | Now called by component hierarchy level, so the order of `onModuleInit`/`onApplicationBootstrap`/shutdown hooks may change. Review code that depends on ordering between related providers, and its tests |
| `@Optional()` | No longer inherited when a subclass redeclares its constructor (`UnknownDependenciesException`). Repeat `@Optional()` on the subclass constructor parameters |
| `@nestjs/config` | `validationSchema` takes any Standard Schema (Zod recommended). Joi needs **v18+**, and Joi settings move to `validationOptions.libraryOptions` (defaults stay `allowUnknown: true`, `abortEarly: false`) |
| `@nestjs/terminus` | `HealthIndicator`/`HealthCheckError` are removed. Inject `HealthIndicatorService` and use `check(key).up()/.down()`, or `.attempt(fn).withTimeout(ms)` |
| `@nestjs/graphql` | `subscriptions-transport-ws` is removed; use `subscriptions: { 'graphql-ws': true }`. GraphiQL is the default IDE; customise it with a `graphiql: { … }` object |
| NATS | Run `npm uninstall nats && npm i @nats-io/transport-node`. Headers come from `@nats-io/nats-core` |
| Testing | Jest needs Node 24.9+ (`nest upgrade` bumps Jest to v30), or migrate to Vitest (the default for ESM projects): update the test scripts and globals, and check `supertest` default imports |
| CLI bundling | `--webpack`/`--webpackPath` (and `webpack`/`webpackConfigPath` in `nest-cli.json`) are deprecated; use `--builder rspack` and `--rspackPath`. Rspack is the monorepo default. The `angular` schematic is removed |
| Custom pipes | Transform signatures are stricter and `ArgumentMetadata` is generic; fix hand-written types |
| Adapters | HTTP error mapping was reworked, and Express now drains in-flight requests on shutdown. Re-run e2e tests |

## New, opt-in (adopt deliberately)

- Standard Schema validation: `@Body({ schema })`, `@Param('id', { schema: z.coerce.number() })`, `StandardSchemaValidationPipe`, `StandardSchemaSerializerInterceptor` + `@SerializeOptions({ schema })`. `ValidationPipe`/`ClassSerializerInterceptor` remain supported (nestjs-validation-serialization).
- `ValidationPipe({ errorFormat: 'list' | 'grouped' })`.
- `NestFactory.create(AppModule, { routeConflictPolicy: { duplicate: 'error', shadow: 'warn' }, routeResolutionStrategy: 'specificity' })`. Shadowing such as `@Get(':id')` before `@Get('me')` is common, so turn on `warn` during the upgrade.
- `new BadRequestException('…', { errorCode: 'WEAK_PASSWORD' })`.
- Structured logging: `logger.log('User created', { userId })` attaches the object to the same entry.
- Observability: `createObserveModule()` + `instrument: ObserveInstrument`.
- gRPC `GrpcExceptionFilter`, Kafka `RegExp` patterns, request-scoped gateways, `handleDisconnect(client, reason)`, microservice pre-request hooks.
- CLI: `nest deploy` (Mau), `--emit-declarations` (SWC), `--no-type-check`, `--silent`, `nest build --all --parallel`, `includeLibraryAssets`, `bun` as package manager, oxlint for new projects, decorators generated as `Reflector.createDecorator()`.

## Optional: switch the project to ESM

Steps:
1. Add `"type": "module"` to `package.json`.
2. Ensure `tsconfig` has `"module": "nodenext"`, `"moduleResolution": "nodenext"`, `"resolvePackageJsonExports": true`, `"target": "ES2023"`. Projects from v11 schematics 11.0.6+ already have these.
3. Fix every relative import to end in `.js`.
4. Replace `__dirname` with `import.meta.dirname`, and `require` with `createRequire(import.meta.url)`.
5. Use top-level `await bootstrap()`.

The whole project switches at once. See `references/esm-switch.md`.

## Workflow

- [ ] 1. Raise Node.js in CI, Docker, `engines` and Lambda (`NODE_OPTIONS`). Upgrade the global CLI, then run `nest upgrade` and update TypeScript to 6.
- [ ] 2. Fix compile errors (pipe types, removed Terminus API, config `libraryOptions`, NATS imports, GraphQL subscription transport).
- [ ] 3. Check lifecycle-ordering assumptions and `@Optional()` subclasses. Enable `routeConflictPolicy` warnings and fix shadowed routes.
- [ ] 4. Fix the test runner (Jest 30 on Node 24.9+, or Vitest). Run unit and e2e tests, especially error responses and graceful shutdown.
- [ ] 5. Replace deprecated webpack flags with Rspack where used. Build, lint, run tests, start the app. Then optionally plan the ESM switch as a separate change.

## Reference files

- `references/esm-switch.md`: the complete ESM `tsconfig`, Jest vs Vitest `types`, import-extension and global replacements, and before/after snippets for the Terminus, config and NATS changes. Read when editing code for the upgrade or converting to ESM.

Sources: [Migration guide](https://docs.nestjs.com/migration-guide)
