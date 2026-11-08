# Adapter details

## Contents
- Node adapter: compatibility and options
- Fastify adapter
- Express adapter
- Multiple simultaneous servers
- Custom versioning extractor

## Node adapter: compatibility and options

Requests and responses are `NodeRequest` / `NodeResponse` (from `@nestjs/platform-node`), extending `IncomingMessage` / `ServerResponse` with Express-style helpers: `req.get()`, `req.is()`, `req.ip`, `req.ips`, `req.hostname`, `res.status()`, `res.send()`, `res.json()` and friends.

Express middleware that works unchanged: `helmet`, `compression`, `cookie-parser`, `express-session`, `express-rate-limit`, `csrf-csrf`, `morgan`, `passport` (and the `@nestjs/passport` guards). Where a docs chapter shows separate Express and Fastify instructions, follow the Express ones.

Deliberate differences from Express:
- Routes matched by specificity (like Fastify), not registration order.
- Case-sensitive paths for routes, middleware and `exclude()`.
- Returned strings are `text/plain`, not `text/html`.
- `req.path` is the decoded path the router matched.
- `res.set()` / `res.type()` don't append `; charset=utf-8`.
- No automatic `ETag`; conditional requests get the full response even if the handler sets `ETag`/`Last-Modified`. `res.sendFile()` and `useStaticAssets()` still answer 304.
- Route params over 100 chars don't match: falls through to another route, else `414`.
- JSON bodies with `__proto__` / `constructor.prototype` keys → 400.

Not available: `res.render()` (use `@Render()`), `res.download()`, `res.format()`, `req.accepts*()`, `req.fresh`/`req.stale`, `req.route`, mounting an Express app with `app.use()`, Express settings.

Options:

```typescript
new NodeAdapter({
  maxParamLength: 500,                         // default 100
  trustProxy: 'loopback',                      // true, addresses/CIDRs, or a function; a number trusts no proxy
  querystringParser: (str) => qs.parse(str),   // nested ?filter[where][name]=x; default is flat keys
});
app.useBodyParser('json', { onProtoPoisoning: 'remove' });   // or 'ignore'; also onConstructorPoisoning
```

Built-in `json`, `urlencoded`, `text`, `raw` parsers take `body-parser` options (`limit`, `inflate`, `strict`, `type`). `useStaticAssets()` uses `serve-static` options plus `prefix`. `setViewEngine()` takes an engine name or `@fastify/view` options.

Other packages: `@nestjs/serve-static` v12.1.1+ works without `express` (SPA fallback needs `@nestjs/platform-node` v12.3.1+). GraphQL: `@nestjs/apollo` v14.1.1+; Mercurius requires Fastify.

## Fastify adapter

```typescript
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: true }));
await app.listen(3000, '0.0.0.0');   // Fastify listens on localhost only by default
```

- Redirect inside a handler: `res.status(302).redirect('/login')`.
- Middleware gets raw objects: `use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void)` (via `@fastify/middie`).
- `@RouteConfig({ output: 'x' })` → `req.routeConfig.output`; `@RouteConstraints({ version: '1.2.x' })`. Both from `@nestjs/platform-fastify`.
- Plugins: `await app.register(plugin, opts)` (requires the `NestFastifyApplication` type).

## Express adapter

Default when no adapter is passed. To stay on Express once the Node adapter becomes the default (v13), pass `new ExpressAdapter()` explicitly with `NestExpressApplication`.

## Multiple simultaneous servers

```typescript
const server = express();
const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
await app.init();
const httpServer = http.createServer(server).listen(3000);
const httpsServer = https.createServer(httpsOptions, server).listen(443);
```

Nest doesn't close servers you created. Close them in a provider implementing `OnApplicationShutdown` that collects servers (`addHttpServer(server)`) and awaits `server.close()` for each; register them with `app.get(ShutdownObserver).addHttpServer(httpServer)`. Doesn't work with GraphQL subscriptions.

## Custom versioning extractor

```typescript
const extractor = (request: FastifyRequest): string | string[] =>
  [request.headers['custom-versioning-field'] ?? '']
    .flatMap((v) => v.split(','))
    .filter((v) => !!v)
    .sort()
    .reverse();

app.enableVersioning({ type: VersioningType.CUSTOM, extractor });
```

Versions are matched highest first. On Express, return one version only.

Middleware for one version (URI versioning): `consumer.apply(M).forRoutes({ path: 'cats', method: RequestMethod.GET, version: '2' })`.
