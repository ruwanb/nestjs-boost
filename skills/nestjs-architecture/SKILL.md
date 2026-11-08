---
name: nestjs-architecture
description: Structures NestJS 12 applications with feature modules, providers and dependency injection — custom and async providers, injection tokens, dynamic modules (ConfigurableModuleBuilder), injection scopes, circular dependencies, ModuleRef, lazy-loaded modules and lifecycle hooks. Use when adding a feature module, sharing a provider between modules, injecting a value/config/third-party client, building a reusable forRoot/forRootAsync module, or when the app fails at startup with "Nest can't resolve dependencies", a circular-dependency or "undefined at index" error, even if the user doesn't mention DI. Not for guards/pipes/interceptors (nestjs-request-pipeline) or ConfigModule specifics (nestjs-configuration).
compatibility: NestJS 12.x; Node 20.19+ to run, 22.22.3+/24.15+ for CLI generators
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-04"
---

# NestJS architecture and dependency injection

## Default approach

One **feature module** per feature: its controller, providers and DTOs live together, and only what other modules need is exported. Scaffold, then wire:

```bash
npx nest g resource billing --no-spec   # or: nest g module|service|controller billing
```

A provider used by another module must be **exported by its own module**, and the consumer **imports that module**:

```typescript
@Module({ providers: [UsersService, UsersRepository], exports: [UsersService] })
export class UsersModule {}

@Module({ imports: [UsersModule], providers: [OrdersService] })
export class OrdersModule {}
```

Never add another module's provider to your own `providers` to "fix" a resolution error. That creates a second, independent instance, and the provider's own dependencies usually fail to resolve next.

## Workflow

- [ ] 1. Scaffold with `nest g` in the feature folder (`--dry-run` first if unsure where files will go).
- [ ] 2. Implement providers. Inject classes by type; inject anything that is not a class with `@Inject(TOKEN)` (see "Tokens").
- [ ] 3. Wire the modules: `providers` for what the module owns, `exports` for what others may inject, `imports` for modules whose exports it uses.
- [ ] 4. Build, then **start the app once**. Resolution errors appear only at bootstrap, never at compile time.
- [ ] 5. Run the unit and e2e tests; e2e tests that import `AppModule` catch wiring errors too.

## Tokens: injecting things that are not classes

Interfaces and type aliases are erased at runtime, so they cannot be tokens. Choose by what you have:

| You have | Register | Inject |
| --- | --- | --- |
| A class | `providers: [MyService]` | `constructor(private s: MyService)` |
| An interface-typed value (config object, client instance) | `{ provide: PAYMENT_OPTIONS, useValue: {...} }` with `export const PAYMENT_OPTIONS = Symbol('PAYMENT_OPTIONS')` | `@Inject(PAYMENT_OPTIONS) private opts: PaymentOptions` |
| A contract with swappable implementations | `{ provide: LoggerService, useClass: PinoLogger }` where `LoggerService` is an **abstract class** | `constructor(private logger: LoggerService)`, no `@Inject()` needed |
| A value built from other providers / async setup | `{ provide: DB, useFactory: async (cfg: ConfigService) => connect(cfg.get('DB_URL')), inject: [ConfigService] }` | `@Inject(DB)` |
| An alias of an existing provider | `{ provide: 'AliasedLogger', useExisting: LoggerService }` | `@Inject('AliasedLogger')` |

Put tokens in their own file (e.g. `payments.constants.ts`), not in the module file: a module file that both declares a token and imports the provider using it causes a circular file import.

## Decision points

- **Reusable module configured by its consumer** (`forRoot`/`forRootAsync`/`register`) → use `ConfigurableModuleBuilder`; read `references/dynamic-modules.md`.
- **Per-request state** (tenant, user) → `Scope.REQUEST` or `@Inject(REQUEST)`. Scope bubbles up: every consumer of a request-scoped provider becomes request-scoped. Read `references/scopes-lifecycle.md` first and prefer `AsyncLocalStorage` (see the nestjs-logging skill) when only context needs to travel.
- **Two providers need each other** → refactor first (extract a third provider). If unavoidable, use `forwardRef()` on **both** sides; see `references/troubleshooting.md`.
- **Startup or shutdown work** (connect, warm caches, close connections) → `onModuleInit` / `onApplicationBootstrap` / `onModuleDestroy` / `onApplicationShutdown`. Shutdown hooks run only after `app.close()`, or on a signal if `app.enableShutdownHooks()` was called in `main.ts`.
- **Load a heavy module only when needed** → `LazyModuleLoader`; lifecycle hooks do not run in lazy-loaded modules.
- **Resolve providers dynamically** → `ModuleRef.get()` for singletons; `ModuleRef.resolve()` for request-scoped/transient ones (`get()` can't retrieve them).

## Gotchas

- **`Nest can't resolve dependencies ... argument X at index [n] is available in the Y module`:** X is neither in Y's `providers` nor exported by a module Y imports. Fix the export/import; don't duplicate the provider. Full procedure in `references/troubleshooting.md` ([Common errors](https://docs.nestjs.com/faq/common-errors)).
- **`... the argument at index [n] is available in the current module` (no token name):** the dependency is `undefined` at runtime. The usual causes are an interface/type used as the parameter type, an `import type` of an injectable class, or a circular file import.
- **Barrel files** (`index.ts`) re-exporting modules and providers cause circular-import errors. Import from the concrete file ([Circular dependency](https://docs.nestjs.com/fundamentals/circular-dependency)).
- **ESM projects** (`"type": "module"`) import local files with a `.js` extension: `import { UsersService } from './users.service.js'`.
- **`@Global()`** is for app-wide infrastructure only (config, logging, database). Making feature modules global hides dependencies and is "not a good design decision" ([Modules](https://docs.nestjs.com/modules)).
- **Lifecycle hooks** do not run for request-scoped providers, and in v12 they are called by component hierarchy level. Don't rely on the order between sibling providers ([Migration guide](https://docs.nestjs.com/migration-guide)).
- **`@Optional()` is not inherited** by a subclass that declares its own constructor (v12); repeat it on the subclass parameter.
- **Passport strategies and cron jobs must stay singletons**; never make their dependencies request-scoped ([Injection scopes](https://docs.nestjs.com/fundamentals/injection-scopes)).
- **SWC/ESM and circular DI:** wrap the type of a `forwardRef()` dependency in a `WrapperType<T> = T` alias (or the ORM's `Relation<T>`), so its type isn't emitted into decorator metadata ([SWC](https://docs.nestjs.com/recipes/swc)).
- **Debugging:** set `NEST_DEBUG=1` to log how each dependency is resolved and in which module Nest looks for it.

## Reference files

- `references/troubleshooting.md`: step-by-step diagnosis of resolution, undefined-dependency and circular-dependency errors, `forwardRef` patterns, monorepo duplicate `@nestjs/core`. Read when the app fails at startup or a dependency is `undefined`.
- `references/dynamic-modules.md`: `ConfigurableModuleBuilder`, `forRoot`/`forRootAsync`, custom method keys, extra options. Read when building a configurable module.
- `references/scopes-lifecycle.md`: injection scopes, `REQUEST`/`INQUIRER`, durable providers, lifecycle hook order, shutdown hooks, lazy loading, `ModuleRef`, `DiscoveryService`. Read before making anything request-scoped or relying on hook order.

Sources: [Providers](https://docs.nestjs.com/providers) · [Modules](https://docs.nestjs.com/modules) · [Custom providers](https://docs.nestjs.com/fundamentals/custom-providers) · [Common errors](https://docs.nestjs.com/faq/common-errors)
