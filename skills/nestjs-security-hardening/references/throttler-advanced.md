# @nestjs/throttler: advanced usage

Source: [Rate limiting](https://docs.nestjs.com/security/rate-limiting)

## Contents
- Configuration forms
- Multiple named throttlers
- Real client IP behind proxies
- WebSockets
- GraphQL
- Async configuration and storage

## Configuration forms

Both forms are valid in v12:

```typescript
ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 10 }] })   // object form; needed with `storage`
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])                    // array shorthand
```

`ttl` is in milliseconds. Helpers: `seconds()`, `minutes()`, `hours()`, `days()`, `weeks()`.

## Multiple named throttlers

```typescript
ThrottlerModule.forRoot([
  { name: 'short', ttl: 1000, limit: 3 },
  { name: 'medium', ttl: 10_000, limit: 20 },
  { name: 'long', ttl: 60_000, limit: 100 },
]);

@Throttle({ short: { limit: 1, ttl: 1000 } })       // override one set
@SkipThrottle({ short: true })                      // skip one set
```

Every request must satisfy all sets.

## Real client IP behind proxies

First, trust the proxy in the adapter:
- Express: `app.set('trust proxy', 'loopback')`
- Fastify: `new FastifyAdapter({ trustProxy: 'loopback' })`
- Node adapter: `new NodeAdapter({ trustProxy: 'loopback' })`

With Fastify ≥ 5.12.1 and the Node adapter, a numeric hop count trusts **no** proxy; pass addresses or CIDRs instead.

Custom tracker:

```typescript
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.ips.length ? req.ips[0] : req.ip;   // Express/Node adapter order: client first
  }
}
```

On Fastify, `request.ips` is ordered closest-first, so `ips[0]` is the proxy. Pick the entry accordingly.

## WebSockets

Extend `ThrottlerGuard` and override `handleRequest()`. Read the client address from `client._socket.remoteAddress` (platform-ws) or `client.conn.remoteAddress` (socket.io), build the key with `generateKey(context, tracker, throttler.name)`, call `this.storageService.increment(...)`, and `throwThrottlingException()` when blocked. Bind this guard on gateways only, never as `APP_GUARD`, because it handles WS contexts only. Clients receive an `exception` event when limited.

## GraphQL

Extend `ThrottlerGuard` and override `getRequestResponse(context)`: get `{ req, res }` from `GqlExecutionContext.create(context).getContext()`.

## Async configuration and storage

```typescript
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({ throttlers: [{ ttl: config.getOrThrow('THROTTLE_TTL'), limit: config.getOrThrow('THROTTLE_LIMIT') }] }),
});
```

The default storage is in-memory per process. For several instances, pass `storage:` with a `ThrottlerStorage` implementation, e.g. the community Redis storage from the `jmcdo29/nest-lab` repository (`throttler-storage-redis`).
