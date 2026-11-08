---
name: nestjs-testing
description: Writes and fixes NestJS 12 unit and end-to-end tests with @nestjs/testing — Test.createTestingModule, mocking providers (useValue/useFactory/useMocker), overrideProvider/overrideGuard/overrideModule, overriding globally registered guards/pipes/interceptors/filters (APP_GUARD with useExisting), supertest e2e against createNestApplication, request-scoped providers, and the project's runner (Vitest by default in v12, Jest in CommonJS projects). Use when adding tests for a service/controller/endpoint, mocking a repository or ConfigService, when e2e tests fail with 401 from a global guard or behave differently from the real app, or on "jest is not defined"/"vi is not defined" errors. Not for testing MCP servers (nestjs-mcp-server).
compatibility: NestJS 12.x; @nestjs/testing; Vitest or Jest; supertest for e2e
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-04"
---

# NestJS testing

## First: detect the runner

Read `package.json` before writing a test. New v12 projects are ESM + **Vitest**; CommonJS projects default to **Jest**. `@nestjs/testing` works the same with both; only the mocking API differs.

| | Vitest | Jest |
| --- | --- | --- |
| Mock fn | `vi.fn()` | `jest.fn()` |
| Spy | `vi.spyOn(obj, 'm')` | `jest.spyOn(obj, 'm')` |
| Import | `import { vi } from 'vitest'` (globals may also be enabled) | globals |
| Unit / e2e config | `vitest.config.ts` / `vitest.config.e2e.ts` | `jest` in package.json / `test/jest-e2e.json` |

Never mix them: `jest.fn` in a Vitest project fails. ESM imports use `.js` suffixes (`'./users.service.js'`). Jest can load the ESM-only v12 packages only on **Node 24.9+** (otherwise `ERR_REQUIRE_ASYNC_MODULE`).

## Unit test: provider with mocked dependencies

```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

describe('UsersService', () => {
  let service: UsersService;
  const repo = { findById: vi.fn(), insert: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: UsersRepository, useValue: repo }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('throws NotFoundException for an unknown id', () => {
    repo.findById.mockReturnValue(undefined);
    expect(() => service.findOne(42)).toThrow(NotFoundException);
  });
});
```

- Mock collaborators at the DI boundary (`{ provide: X, useValue: mock }`), not by patching imports.
- Many dependencies: use `.useMocker((token) => ...)` to auto-mock everything missing. `REQUEST`/`INQUIRER` can't be auto-mocked; override them instead.
- Assert behaviour (return values, thrown exception types, calls with arguments), not just "should be defined". A test that still passes when the code under test is broken is not testing it.

## E2E test: real module graph over HTTP

```typescript
import request from 'supertest';

let app: INestApplication;
beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(UsersRepository).useValue(fakeRepo)     // optional test doubles
    .compile();
  app = moduleRef.createNestApplication();                   // pass the app's adapter if it isn't Express
  configureApp(app);                                         // the same global setup main.ts applies
  await app.init();
});
afterAll(() => app.close());

it('GET /users/999 → 404', () => request(app.getHttpServer()).get('/users/999').expect(404));
```

**`main.ts` doesn't run in e2e tests.** Anything configured there (`useGlobalPipes`, `useSecurityHeaders`, `enableCors`, `setGlobalPrefix`, versioning) is missing unless you apply it again. Best fix: move global enhancers into modules (`APP_PIPE`/`APP_GUARD`/…), and put the remaining `app.*` setup in one exported `configureApp(app)` that both `main.ts` and tests call.

**Use the same HTTP adapter.** Without one, `createNestApplication()` builds an Express app, so a Fastify or Node-adapter app is tested on the wrong adapter, and fails if `@nestjs/platform-express` isn't installed: `moduleRef.createNestApplication(new NodeAdapter())`. With Fastify: `createNestApplication<NestFastifyApplication>(new FastifyAdapter())`, then `await app.getHttpAdapter().getInstance().ready()`.

## Overriding globally registered enhancers

`overrideProvider(APP_GUARD)` and `overrideGuard()` do not reach a guard registered with `useClass` under `APP_GUARD`. Register it through an existing provider, then override that provider in tests only:

```typescript
// app.module.ts (production behaviour unchanged)
providers: [{ provide: APP_GUARD, useExisting: ApiKeyGuard }, ApiKeyGuard]

// test
Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(ApiKeyGuard).useValue({ canActivate: () => true })
  .compile();
```

The same applies to `APP_PIPE`, `APP_INTERCEPTOR` and `APP_FILTER`. Don't bypass guards by putting real secrets in tests or by weakening the guard.

## Override API

`overrideProvider` / `overrideGuard` / `overrideInterceptor` / `overrideFilter` / `overridePipe` → `.useValue()` | `.useClass()` | `.useFactory({ factory, inject })`. Replace a whole module: `.overrideModule(CatsModule).useModule(FakeCatsModule)`. Quiet logs: `.setLogger(new TestLogger())`.

## Decision points

- **Request-scoped provider under test** → `moduleRef.resolve(Service, contextId)`, with `vi.spyOn(ContextIdFactory, 'getByRequest').mockImplementation(() => contextId)`. Read `references/advanced-testing.md`.
- **Needs `HttpAdapterHost.httpAdapter`** (e.g. a filter using it) → it's undefined after `compile()` alone; create the app with `createNestApplication()` + `init()`.
- **Config-dependent modules** → provide required env in the runner config (Vitest `test.env`, or a `.env.test`), or override `ConfigService` with `useValue`.
- **Databases** → prefer overriding the repository/provider in unit and e2e tests. For real-DB integration tests, see the project's ORM skill.

## Workflow

- [ ] 1. Detect runner, module format and HTTP adapter from `package.json`.
- [ ] 2. Unit-test providers with `Test.createTestingModule` and mocked collaborators; e2e-test endpoints through `AppModule`.
- [ ] 3. Mirror `main.ts` setup in e2e (or move it into modules); use the same adapter.
- [ ] 4. Cover failure paths (404/400/401), not only the happy path.
- [ ] 5. Run `npm test` and `npm run test:e2e`, and make sure each new test fails if you break the code it covers.

## Reference files

- `references/advanced-testing.md`: request-scoped instances, `useMocker` factories, `TestingModule` methods (`get`, `resolve`, `select`, `createNestApplication`, `createNestMicroservice`), Fastify `inject()`, coverage and SWC/Vitest setup. Read for anything beyond the recipes above.

Sources: [Testing](https://docs.nestjs.com/fundamentals/testing) · [HTTP adapters](https://docs.nestjs.com/http/performance) · [Migration guide](https://docs.nestjs.com/migration-guide)
