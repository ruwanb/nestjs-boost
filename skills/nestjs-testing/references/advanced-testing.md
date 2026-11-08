# Advanced testing

Sources: [Testing](https://docs.nestjs.com/fundamentals/testing) · [SWC](https://docs.nestjs.com/recipes/swc) · [HTTP adapters](https://docs.nestjs.com/http/performance)

## Contents
- TestingModule methods
- Request-scoped providers
- Auto mocking with useMocker
- Fastify inject()
- Vitest/Jest with SWC
- Coverage

## TestingModule methods

| Method | Use |
| --- | --- |
| `get(Token)` | Get a static (singleton) instance |
| `resolve(Token, contextId?)` | Get a request-scoped or transient instance |
| `select(Module).get(Token, { strict: true })` | Navigate to a module in the graph and get its instance |
| `createNestApplication(adapter?)` | Full HTTP app; call `await app.init()` |
| `createNestMicroservice(options)` | Microservice app for transport tests |

## Request-scoped providers

```typescript
const contextId = ContextIdFactory.create();
vi.spyOn(ContextIdFactory, 'getByRequest').mockImplementation(() => contextId);
// …perform the request…
const scoped = await moduleRef.resolve(CatsService, contextId);   // same sub-tree the request used
```

## Auto mocking with useMocker

```typescript
const moduleRef = await Test.createTestingModule({ controllers: [CatsController] })
  .useMocker((token) => {
    if (token === CatsService) return { findAll: vi.fn().mockResolvedValue(['a']) };
  })
  .compile();
```

Retrieve mocks with `moduleRef.get(CatsService)`. A reusable mock factory can be passed directly to `useMocker()`. `REQUEST` and `INQUIRER` cannot be auto-mocked.

## Fastify inject()

```typescript
app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
await app.init();
await app.getHttpAdapter().getInstance().ready();
const res = await app.inject({ method: 'GET', url: '/cats' });
expect(res.statusCode).toBe(200);
```

## Vitest/Jest with SWC

- Vitest projects that use the SWC builder: `npm i -D vitest unplugin-swc @swc/core @vitest/coverage-v8`, then add `swc.vite()` to the Vitest plugins so decorator metadata is emitted. See the SWC recipe's Vitest section for the exact config, including the e2e config.
- Jest with SWC: `npm i -D jest @swc/core @swc/jest`, and use `@swc/jest` as the transform.
- In ESM e2e tests, import supertest's default export (`import request from 'supertest'`).

## Coverage

Vitest: `npm run test:cov` (`vitest run --coverage`, using `@vitest/coverage-v8` in generated projects).
