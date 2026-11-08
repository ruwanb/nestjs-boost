# Injection scopes, lifecycle hooks, ModuleRef and lazy loading

Sources: [Injection scopes](https://docs.nestjs.com/fundamentals/injection-scopes) · [Lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events) · [Module reference](https://docs.nestjs.com/fundamentals/module-ref) · [Lazy-loading modules](https://docs.nestjs.com/fundamentals/lazy-loading-modules) · [Discovery service](https://docs.nestjs.com/fundamentals/discovery-service)

## Contents
- Choosing a scope
- How REQUEST scope spreads
- Accessing the request; INQUIRER
- Durable providers (multi-tenant)
- Lifecycle hooks and shutdown
- ModuleRef, lazy loading, discovery

## Choosing a scope

| Scope | Instance | Use when |
| --- | --- | --- |
| `DEFAULT` (singleton) | One per app, created at bootstrap | Almost always. Recommended by the docs. |
| `REQUEST` | One per request, garbage-collected after | The provider itself must hold per-request state |
| `TRANSIENT` | One per consumer | Stateful helpers each consumer needs its own copy of (e.g. a logger with context) |

```typescript
@Injectable({ scope: Scope.REQUEST })
export class TenantService {}

{ provide: 'CACHE_MANAGER', useClass: CacheManager, scope: Scope.TRANSIENT }   // long-hand form
@Controller({ path: 'cats', scope: Scope.REQUEST })                             // controller scope
```

**Prefer singletons plus `AsyncLocalStorage`** when a provider only needs to *read* per-request values (current user, tenant, locale). Every provider stays a singleton, and it works in HTTP, microservices and gateways (see the nestjs-logging skill).

## How REQUEST scope spreads

- REQUEST scope **bubbles up**: anything that injects a request-scoped provider becomes request-scoped, including the controller. Making a widely used provider (DB connection, logger) request-scoped makes most of the app request-scoped.
- TRANSIENT does **not** bubble up: a singleton injecting a transient provider stays a singleton.
- Request-scoped providers cost a new instance tree per request. The docs expect ≤ ~5% latency in a well-designed app.
- Must stay singletons: Passport strategies, cron jobs.
- Since v12, WebSocket gateways support request-scoped providers, scoped to the socket connection.

## Accessing the request; INQUIRER

```typescript
import { REQUEST, INQUIRER } from '@nestjs/core';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(REQUEST) private readonly request: Request) {}   // GraphQL: @Inject(CONTEXT) from @nestjs/graphql
}

@Injectable({ scope: Scope.TRANSIENT })
export class ScopedLogger {
  constructor(@Inject(INQUIRER) private readonly parent: object) {}   // the class that injected this provider
}
```

Injecting `REQUEST` makes the provider request-scoped automatically.

## Durable providers (multi-tenant)

With a few tenants, avoid rebuilding the tree per request: register a `ContextIdStrategy` that maps requests to one DI sub-tree per tenant, and mark providers `durable: true`. Durability bubbles up like request scope. Not suitable for very many tenants. See the docs section "Durable providers" for the strategy code.

## Lifecycle hooks and shutdown

| Hook | When |
| --- | --- |
| `onModuleInit()` | Host module's dependencies resolved |
| `onApplicationBootstrap()` | All modules initialized, before listening |
| `onModuleDestroy()` | Termination started (signal or `app.close()`) |
| `beforeApplicationShutdown(signal?)` | After all `onModuleDestroy()` complete |
| `onApplicationShutdown(signal?)` | After connections close; last step of `app.close()` |

- `onModuleInit`/`onApplicationBootstrap` may be `async`; bootstrap waits for them.
- Init hooks run module by module: the most deeply imported modules (and global modules) first, the root module last. In v12, hooks are ordered by component hierarchy level, so don't depend on the order between siblings.
- Shutdown hooks need `app.enableShutdownHooks()` in `main.ts` to react to `SIGTERM`/`SIGINT`. They are off by default because the listeners use memory; avoid enabling them in many parallel test apps. On Windows, `SIGTERM` never fires.
- Hooks are **not** called for request-scoped classes or in lazy-loaded modules.

## ModuleRef, lazy loading, discovery

```typescript
constructor(private readonly moduleRef: ModuleRef) {}

this.moduleRef.get(Service);                          // singleton, current module
this.moduleRef.get(Service, { strict: false });       // look in the whole app
await this.moduleRef.resolve(ScopedService);          // transient/request-scoped: new instance per call
const id = ContextIdFactory.create();
await this.moduleRef.resolve(ScopedService, id);      // same instance for the same contextId
await this.moduleRef.create(SomeClass);               // instantiate a class not registered as provider
```

Lazy loading (no lifecycle hooks run in the loaded module):

```typescript
constructor(private readonly lazyModuleLoader: LazyModuleLoader) {}
const { ReportsModule } = await import('./reports/reports.module.js');
const moduleRef = await this.lazyModuleLoader.load(() => ReportsModule);
const reports = moduleRef.get(ReportsService);
```

`DiscoveryService` (from `@nestjs/core`) lists providers and controllers at runtime, e.g. to find every provider carrying a custom decorator's metadata. See the docs chapter for its API.
