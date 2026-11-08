# Domain Knowledge Brief — NestJS 12

Working notes for skill authoring (Phase 0). Not shipped to agents. Every fact below links to the page it comes from.

**Source snapshot:** `nestjs/docs.nestjs.com` commit `05c1fdfac8cf` (2026-11-04). 153 sidebar pages, ~58,300 lines. Sidebar order from `src/app/shared/nav/nav-items.ts`. Facts per page: `coverage/pages.json`. Warning boxes per skill: `coverage/gotcha-candidates.md` (201).

## 1. Version facts every skill must respect

The current documentation describes **NestJS 12** ([Migration guide](https://docs.nestjs.com/migration-guide)).

| Fact | Detail | Source |
| --- | --- | --- |
| Packages are ESM-only | CommonJS apps still work through `require(esm)`. Migrating your own app to ESM is optional. | [Migration guide](https://docs.nestjs.com/migration-guide) |
| Node to run an app | v20.19+, or v22.12+ on the 22.x line. 21.x is unsupported. | [First steps](https://docs.nestjs.com/first-steps) |
| Node for CLI generators | `nest new`, `nest generate` and `nest upgrade` need v22.22.3+, v24.15+, or v26+. | [First steps](https://docs.nestjs.com/first-steps) |
| TypeScript | `@nestjs/schematics` v12 requires TypeScript 6. | [Migration guide](https://docs.nestjs.com/migration-guide) |
| `nest new` | Asks CommonJS or ESM. ESM projects default to Vitest; CommonJS projects to Jest. All projects use oxlint. | [Migration guide](https://docs.nestjs.com/migration-guide) |
| Jest with v12 | Loads the ESM-only packages only on Node v24.9+. Otherwise it fails with `ERR_REQUIRE_ASYNC_MODULE`. | [Migration guide](https://docs.nestjs.com/migration-guide) |
| HTTP adapters | Express is the default. Fastify. `NodeAdapter` (`@nestjs/platform-node`) is recommended from 12.3 and becomes the default in v13. | [HTTP adapters](https://docs.nestjs.com/http/performance) |
| Validation flows (both supported) | Class-based DTOs: `ValidationPipe` + `class-validator`. Schema-first: route decorator `schema` option + `StandardSchemaValidationPipe` (Zod, Valibot, ArkType). Responses: `ClassSerializerInterceptor` or `StandardSchemaSerializerInterceptor`. | [Migration guide](https://docs.nestjs.com/migration-guide), [Validation](https://docs.nestjs.com/application/validation) |
| Config validation | Standard Schema; Zod recommended for new projects. Joi needs v18+, and its options move under `validationOptions.libraryOptions`. | [Configuration](https://docs.nestjs.com/application/configuration) |
| HTTP client | `@nestjs/http-client` (fetch-based, Promise API) replaces the Axios-based `@nestjs/axios`, which remains available. | [HTTP client](https://docs.nestjs.com/application/http-client) |
| CLI bundler | Rspack is the default for monorepos. webpack flags are deprecated (use `--builder rspack`). | [Migration guide](https://docs.nestjs.com/migration-guide) |
| New CLI commands | `nest upgrade`, `nest deploy` (Mau), `nest build --parallel`. | [CLI usage](https://docs.nestjs.com/cli/usages) |
| `@Optional()` | No longer inherited by a subclass that redeclares its constructor. | [Migration guide](https://docs.nestjs.com/migration-guide) |
| Lifecycle hooks | Now ordered by component hierarchy level. | [Migration guide](https://docs.nestjs.com/migration-guide) |
| Route conflicts | Opt-in detection: `routeConflictPolicy`, `routeResolutionStrategy: 'specificity'`. On Express, `@Get(':id')` can shadow a later `@Get('me')`. | [Controllers](https://docs.nestjs.com/controllers) |
| Error codes | `errorCode` option on HTTP exceptions, serialized into the response body. | [Exception filters](https://docs.nestjs.com/exception-filters) |
| Logging | `ConsoleLogger` structured params are on by default. | [Logger](https://docs.nestjs.com/application/logger) |
| Observability | First-class through `@nestjs/observe`, using the `instrument` option of `NestFactory.create()`. | [Observability](https://docs.nestjs.com/observability/overview) |

New first-party packages documented (an agent trained on v10/v11 will not know them):

- `@nestjs/platform-node`
- `@nestjs/http-client`
- `@nestjs/authentication`, `@nestjs/authorization`
- `@nestjs/mail`, `@nestjs/i18n`, `@nestjs/storage`
- `@nestjs/drizzle`
- `@nestjs/webhooks`
- `@nestjs/observe`
- `@nestjs/resilience`, `@nestjs/idempotency`, `@nestjs/outbox`, `@nestjs/workflows`, `@nestjs/locks`
- `@nestjs/mcp`

This is the single biggest source of expected baseline failure. Without the pack, an agent will reach for Passport and JWT, Axios, nodemailer, `nestjs-i18n` (community), and hand-rolled retry and idempotency code.

## 2. Canonical terminology (one term per concept, pack-wide)

| Use | Not | Meaning |
| --- | --- | --- |
| provider | service (when generic), injectable | Anything registered in a module's `providers` |
| feature module | domain module, sub-module | A module grouping one feature's controllers and providers |
| enhancer | middleware-like, hook | Collective term for guards, interceptors, pipes and exception filters ([Testing](https://docs.nestjs.com/fundamentals/testing)) |
| binding scope: global / controller / route | level, layer | Where an enhancer is bound ([Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle)) |
| injection scope: `DEFAULT` / `REQUEST` / `TRANSIENT` | lifetime | Provider instance lifetime ([Injection scopes](https://docs.nestjs.com/fundamentals/injection-scopes)) |
| HTTP adapter | platform, server | Express / Fastify / Node adapter ([HTTP adapters](https://docs.nestjs.com/http/performance)) |
| route handler | endpoint method, action | Controller method bound to a route |

## 3. Request lifecycle (cross-cutting rule, goes in core guidelines)

The order, from [Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle):

1. Middleware: global (`app.use()`), then module-bound.
2. Guards: global → controller → route.
3. Interceptors, pre-handler: global → controller → route.
4. Pipes: global → controller → route → route-parameter. With several parameters, pipes process the last parameter first.
5. Route handler.
6. Interceptors, post-handler: route → controller → global.
7. Exception filters: route → controller → global. Only the first matching filter handles an exception; it is not passed on.

Exceptions to this flow, and binding caveats:
- Exceptions thrown in middleware are caught only by **global** filters ([Exception filters](https://docs.nestjs.com/exception-filters)).
- `useGlobalFilters()` does not set up filters for gateways or hybrid applications ([Exception filters](https://docs.nestjs.com/exception-filters)).
- In a hybrid application, `useGlobalPipes()` and `useGlobalGuards()` don't cover connected microservices by default ([Pipes](https://docs.nestjs.com/pipes), [Guards](https://docs.nestjs.com/guards), [Hybrid application](https://docs.nestjs.com/faq/hybrid-application)).
- Enhancers registered with `app.useGlobal*()` cannot inject dependencies, because they are bound outside any module. Register them as `APP_GUARD`, `APP_PIPE`, `APP_INTERCEPTOR` or `APP_FILTER` providers when they need DI ([Pipes](https://docs.nestjs.com/pipes), [Guards](https://docs.nestjs.com/guards), [Interceptors](https://docs.nestjs.com/interceptors)). The testing module can override such providers ([Testing](https://docs.nestjs.com/fundamentals/testing)).

## 4. DI rules (go in core guidelines; detail in `nestjs-architecture`)

- **Injection tokens must exist at runtime.** Type-based injection needs a class; interfaces and type aliases are erased. Use a token with `@Inject()` otherwise ([Providers](https://docs.nestjs.com/providers)).
- **Export what other modules inject.** Use `@Global()` sparingly; the docs call making everything global a poor design decision ([Modules](https://docs.nestjs.com/modules)).
- **Avoid barrel files** for module and provider classes. They cause circular dependencies ([Circular dependency](https://docs.nestjs.com/fundamentals/circular-dependency)).
- **Request scope bubbles up the injection chain.**
    - Lifecycle hooks don't fire for request-scoped classes.
    - `moduleRef.get()` can't return scoped providers.
    - Passport strategies and cron jobs must stay singletons.
    ([Injection scopes](https://docs.nestjs.com/fundamentals/injection-scopes), [Module reference](https://docs.nestjs.com/fundamentals/module-ref))
- **Lazy-loaded modules** don't run lifecycle hooks ([Lazy-loading modules](https://docs.nestjs.com/fundamentals/lazy-loading-modules)).
- **"Cannot resolve dependency"** has a documented diagnostic procedure ([Common errors](https://docs.nestjs.com/faq/common-errors)). The `nestjs-architecture` skill should turn it into a numbered troubleshooting workflow.

## 5. Interfaces and tooling

- **CLI:** `nest new`, `nest generate` (`nest g`), `nest build`, `nest start`, `nest add`, `nest upgrade`, `nest deploy`, `nest info`. Generators support `--dry-run` ([CLI usage](https://docs.nestjs.com/cli/usages)).
- **Testing:** `@nestjs/testing` is runner-agnostic. `Test.createTestingModule` and `overrideProvider` / `overrideGuard` / etc. In e2e tests, pass the same HTTP adapter the app uses, otherwise the testing module creates an Express app ([HTTP adapters](https://docs.nestjs.com/http/performance), [Testing](https://docs.nestjs.com/fundamentals/testing)).
- **Deterministic script candidates:**
    - module wiring check (providers injected but not provided or exported);
    - route map with bound guards and route-conflict detection;
    - `package.json` detection for the installer.

## 6. Defaults the pack will use (detect first, then fall back)

| Choice | Detection | Fallback when nothing is detected |
| --- | --- | --- |
| HTTP adapter | `@nestjs/platform-*` in deps | Express (docs default). Mention the Node adapter for new projects. |
| Validation | `zod` / `valibot` / `arktype` → Standard Schema flow; `class-validator` → `ValidationPipe` | Follow the generated project. Validation chapter order otherwise. |
| Test runner | `vitest` vs `jest` in devDependencies | Vitest for ESM, Jest for CommonJS (v12 scaffolding) |
| Module format | `"type": "module"` in package.json | CommonJS |
| Package manager | lockfile | npm |
| Linter | `oxlint` / `eslint` in devDependencies | oxlint |

## 7. Open questions for the user

1. **Supported NestJS majors:** v12 only (the current docs), or v11 too? v11 support needs the v11 docs crawled separately, plus an "Older versions" section in every affected skill.
2. **Target agents:** Claude Code only, or also Cursor, Codex / `AGENTS.md`, Copilot? This decides where the installer writes skills and guidelines.
3. **Reliability packages:** keep five separate skills (resilience, idempotency, outbox, workflows, locks), or merge them into one `nestjs-reliability` skill with a reference file per package?
4. **Pack name**, and where it will be published (npm package vs. Git repository).
