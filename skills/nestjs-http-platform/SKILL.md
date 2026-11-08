---
name: nestjs-http-platform
description: Chooses and configures the NestJS 12 HTTP platform — the Node (@nestjs/platform-node), Fastify and Express adapters and their differences, adapter options (trustProxy, maxParamLength, querystringParser), body parsers and size limits, raw body for signature checks, HTTPS and multiple servers, keep-alive and forceCloseConnections, HttpAdapterHost, API versioning (URI, header, media type, custom) and response compression. Use when switching adapters, tuning HTTP performance, raising a body limit, reading the raw request body, serving HTTPS, adding v1/v2 endpoints, enabling gzip/brotli, or when the app won't exit on shutdown or req.ip shows the proxy address. Not for cookies, sessions, uploads, SSE, views or static files (nestjs-http-web-features), or for receiving webhooks (nestjs-webhooks).
compatibility: NestJS 12.x; @nestjs/platform-express (default), @nestjs/platform-fastify or @nestjs/platform-node (12.3+)
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS HTTP platform

## Choosing an adapter

| Adapter | Package | Choose when |
| --- | --- | --- |
| `NodeAdapter` | `@nestjs/platform-node` | **Recommended from v12.3.** Fastest, runs on `node:http`, Express-style `req`/`res` helpers, so most Express middleware works unchanged |
| `FastifyAdapter` | `@nestjs/platform-fastify` | You need Fastify plugins, `@RouteConfig()` / `@RouteConstraints()`, or the Mercurius GraphQL driver |
| `ExpressAdapter` | `@nestjs/platform-express` | Used when no adapter is passed. Stay on it if you rely on Express APIs the Node adapter lacks, or on an Express-only package |

Detect the adapter from `package.json` and `main.ts` before changing anything. The adapter is a small part of each request's cost; it matters most for light routes at high request rates.

```typescript
// main.ts — Node adapter
import { NestFactory } from '@nestjs/core';
import { NestNodeApplication, NodeAdapter } from '@nestjs/platform-node';
import { AppModule } from './app.module.js';

const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter({ trustProxy: 'loopback' }));
await app.listen(process.env.PORT ?? 3000);
```

Always pass the application type generic (`NestNodeApplication`, `NestFastifyApplication`, `NestExpressApplication`): without it, `useBodyParser()`, `register()`, `useStaticAssets()` and `setViewEngine()` don't type-check.

## Switching adapters: checklist of differences

Node adapter vs Express (read `references/adapters.md` for the full list and Fastify specifics):
- Routes are matched by **specificity**, not registration order, and paths are **case-sensitive** (routes, middleware and `exclude()`).
- A returned string is sent as `text/plain`; no automatic `ETag` / `304`.
- Route params longer than 100 chars don't match (`maxParamLength`). JSON bodies with `__proto__` keys get 400 (`onProtoPoisoning`).
- Not available: `res.render()` (use `@Render()`), `res.download()`, `res.format()`, `req.accepts()`, `req.fresh`, mounting an Express app, Express settings (use adapter options).
- Upload interceptors and `MulterModule` are imported from `@nestjs/platform-node`.

Fastify:
- Listens on localhost only by default: in containers call `app.listen(port, '0.0.0.0')`.
- Middleware receives raw `req`/`res`; filters send with `response.send()`.
- Plugins are registered with `await app.register(plugin, options)`.

## E2E tests must use the same adapter

```typescript
app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
// Fastify: createNestApplication<NestFastifyApplication>(new FastifyAdapter()); await app.init(); await app.getHttpAdapter().getInstance().ready();
```

Without an adapter argument, the testing module creates an Express app, so tests don't run on your adapter and fail if `@nestjs/platform-express` isn't installed.

## Body parsing and raw body

- Express and Node register `json` and `urlencoded` by default; add others with `app.useBodyParser('text')` (Fastify: `'text/plain'`).
- Size limits: Express default 100kb → `app.useBodyParser('json', { limit: '10mb' })`; Fastify default 1 MiB → `app.useBodyParser('application/json', { bodyLimit: 10_485_760 })`.
- Raw body (webhook signatures): `NestFactory.create(AppModule, { rawBody: true })`, then `@Req() req: RawBodyRequest<Request>` and `req.rawBody` (a `Buffer`). Works only with the built-in body parser, so don't pass `bodyParser: false`.

## Proxies, HTTPS, shutdown

- Behind a proxy or load balancer, set `trustProxy` (Node/Fastify adapter option; Express: `app.set('trust proxy', …)`) so `req.ip`, `req.protocol` and sub-domain routing see the client. Trust only proxies in front of you.
- HTTPS: `NestFactory.create(AppModule, { httpsOptions: { key, cert } })`; Fastify: `new FastifyAdapter({ https: httpsOptions })`. For HTTP + HTTPS at once, see `references/adapters.md` (doesn't work with GraphQL subscriptions).
- App doesn't exit on shutdown (often with `--watch` + `enableShutdownHooks()`): long keep-alive connections. Set `forceCloseConnections: true` in `NestFactory.create()` (Fastify needs v12.1+).
- Access the underlying server with `app.getHttpAdapter()` outside the app, or inject `HttpAdapterHost` (from `@nestjs/core`). Run code when listening via `httpAdapterHost.listen$`.

## Versioning

```typescript
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });   // /v1/cats
@Controller({ path: 'cats', version: '2' }) export class CatsV2Controller {}
@Version(['1', '2']) @Get() findAll() {}
@Controller({ version: VERSION_NEUTRAL }) export class HealthController {}
```

- URI versioning adds the version after the global prefix; the `v` prefix is configurable (`prefix: false` to drop it).
- Header (`type: VersioningType.HEADER, header: 'X-API-Version'`), media type (`MEDIA_TYPE, key: 'v='`) and custom (`CUSTOM, extractor`) types are available.
- With versioning on and no `defaultVersion`, unversioned routes behave as `VERSION_NEUTRAL`. Register neutral routes **after** versioned routes sharing the path.
- Custom extractors on Express must return a single version; highest-match selection from an array works reliably only on Fastify.
- With header/media/custom versioning, middleware runs for all versions of a path; use a guard or interceptor for version-specific logic.

## Compression

- Express/Node: `npm i compression` → `app.use(compression())`.
- Fastify: `npm i @fastify/compress` → `await app.register(compression, { encodings: ['gzip', 'deflate'] })`.
- Under heavy load, prefer compression at the reverse proxy (Nginx) instead of in Node.

## Workflow

- [ ] 1. Detect the current adapter and app type; keep it unless the user asked to switch.
- [ ] 2. When switching, update `main.ts`, the e2e `createNestApplication(...)`, platform-specific imports (Multer, middleware types), and dependencies.
- [ ] 3. Review routes for order/case-sensitivity changes; enable `routeConflictPolicy` (nestjs-request-pipeline).
- [ ] 4. Add versioning/compression/body limits in `main.ts`; mirror the setup in e2e tests.
- [ ] 5. Build, lint, run unit and e2e tests, start the app and hit one route.

## Reference files

- `references/adapters.md`: Node adapter compatibility list and options, Fastify options/middleware/route config, multiple simultaneous servers with shutdown handling, versioning extractor example. Read when switching adapters or running HTTP and HTTPS together.

Sources: [HTTP adapters and performance](https://docs.nestjs.com/http/performance) · [HTTP adapter](https://docs.nestjs.com/faq/http-adapter) · [Keep-alive](https://docs.nestjs.com/faq/keep-alive-connections) · [Raw body](https://docs.nestjs.com/faq/raw-body) · [HTTPS & multiple servers](https://docs.nestjs.com/faq/multiple-servers) · [Versioning](https://docs.nestjs.com/http/versioning) · [Compression](https://docs.nestjs.com/http/compression)
