---
name: nestjs-caching
description: Adds caching to NestJS 12 with @nestjs/cache-manager and cache-manager (Keyv) — CacheModule.register/registerAsync, in-memory and Redis (@keyv/redis) or multi-store setups, the CACHE_MANAGER Cache API (get/set/del/clear, TTL in milliseconds), CacheInterceptor auto-caching of GET responses, @CacheKey/@CacheTTL overrides, custom trackBy keys (per user or header), and caching WebSocket and microservice handlers. Use when the user wants to cache responses or query results, add Redis caching, set TTLs, invalidate entries, or debug stale or shared cached responses. Not for HTTP response compression or rate limiting (nestjs-http-platform, nestjs-security-hardening), queues (nestjs-queues) or distributed locks (nestjs-locks).
compatibility: NestJS 12.x; @nestjs/cache-manager, cache-manager (v7, Keyv-based); optional @keyv/redis, cacheable
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS caching

```bash
npm i @nestjs/cache-manager cache-manager
npm i @keyv/redis cacheable          # for Redis + a fast in-memory layer
```

## Choose a strategy

| Need | Use |
| --- | --- |
| Cache an expensive query or external call inside a service | Inject `CACHE_MANAGER`, read-through `get` → compute → `set` (default choice: explicit keys, explicit invalidation) |
| Cache whole public GET responses | `CacheInterceptor` on the controller or globally |
| Responses differ per user/tenant | `CacheInterceptor` subclass overriding `trackBy()`, or don't cache at the HTTP layer |
| Several instances | Redis store (shared); memory-only caches diverge per instance |

## Setup

```typescript
CacheModule.registerAsync({
  isGlobal: true,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const redis = createKeyv(config.getOrThrow<string>('REDIS_URL'));              // from '@keyv/redis'
    redis.on('error', (err) => logger.error('Redis cache error', err));           // required: unhandled errors crash the app
    return {
      ttl: 60_000,                                                                 // ms; unset/0 = never expires
      stores: [new Keyv({ store: new KeyvCacheableMemory({ ttl: 60_000, lruSize: 5000 }) }), redis],
    };
  },
}),
```

`CacheModule.register()` alone gives an in-memory cache. `isGlobal: true` avoids importing it in each module.

## Service-level caching

```typescript
constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache, private readonly repo: ProductsRepository) {}

async findOne(id: string) {
  const key = `product:${id}`;
  const cached = await this.cache.get<Product>(key);
  if (cached !== undefined && cached !== null) return cached;     // v7 returns undefined on miss (v6: null)
  const product = await this.repo.findOne(id);
  await this.cache.set(key, product, 30_000);                     // TTL in ms; 0 = never expires
  return product;
}

async update(id: string, dto: UpdateProductDto) {
  const product = await this.repo.update(id, dto);
  await this.cache.del(`product:${id}`);                          // invalidate on write
  return product;
}
```

The memory store returns the **same object** you stored: treat cached values as read-only or clone before mutating.

## Response caching with CacheInterceptor

```typescript
@Controller('catalog')
@UseInterceptors(CacheInterceptor)
@CacheTTL(5000)
export class CatalogController {
  @Get() findAll() { … }                          // key = request URL
  @CacheKey('catalog_featured') @CacheTTL(2000) @Get('featured') featured() { … }
}
```

- Only GET routes are cached (unless a route has an explicit `@CacheKey()`); routes using `@Res()` can't be cached.
- Global: `{ provide: APP_INTERCEPTOR, useClass: CacheInterceptor }`.
- The URL key ignores the user: **never** put it on routes whose response depends on who asks (orders, profiles, anything behind record-level authorization). Override `trackBy(context)` to include the user/tenant, or return `undefined` to skip caching.
- Doesn't work in GraphQL (interceptors run per field resolver).
- WebSockets/microservices: `@CacheKey('events')` is **required** (and `@CacheTTL` needs it). Don't cache handlers that perform business operations.

```typescript
@Injectable()
export class UserAwareCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    const req = context.switchToHttp().getRequest();
    if (req.method !== 'GET' || !req.user) return undefined;
    return `${req.user.id}:${req.originalUrl ?? req.url}`;
  }
}
```

## Testing

Unit: `{ provide: CACHE_MANAGER, useValue: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }`. Integration: real `CacheModule.register()` (memory) and assert the second call skips the repository.

## Workflow

- [ ] 1. Decide service-level vs interceptor caching and the store (Redis for multi-instance).
- [ ] 2. Register `CacheModule` (global, TTL, Redis `error` listener).
- [ ] 3. Implement read-through + invalidation, or add the interceptor with per-user `trackBy` where needed.
- [ ] 4. Test hits, misses and invalidation. Build, lint, run tests, start the app.

Sources: [Caching](https://docs.nestjs.com/data/caching)
