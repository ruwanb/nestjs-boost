---
name: nestjs-idempotency
description: Makes NestJS 12 operations safe to retry with the first-party @nestjs/idempotency package — IdempotencyModule.forRoot with per-user scope, @Idempotent({ required }) on HTTP routes, GraphQL mutations (idempotencyKey argument) and microservice event handlers (keyFrom payload), Idempotency-Key fingerprinting, 409 in-flight / 422 reused / Idempotent-Replayed replay semantics, storeIf for which outcomes are stored, ttl/lockTtl/retryAfter tuning, AES-GCM encryption of stored responses, writing an IdempotencyStore for PostgreSQL (Drizzle/TypeORM/Prisma) or Redis with registerSource and the contract test suite, client retry rules, events, and testing duplicate and concurrent requests. Use when payments, orders or other side effects must not happen twice on client retries, when deduplicating redelivered messages/events, or when implementing Idempotency-Key headers. Not for server-side retries (nestjs-resilience), outbox delivery (nestjs-outbox) or distributed locks (nestjs-locks).
compatibility: NestJS 12.x; @nestjs/idempotency; a database or Redis for the store
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS idempotency keys (@nestjs/idempotency)

Don't hand-roll "check then insert" key tables: they race. `@nestjs/idempotency` claims keys atomically, renews locks, stores the final response and replays it.

```bash
npm i @nestjs/idempotency
```

## Register and mark handlers

```typescript
IdempotencyModule.forRootAsync({
  useFactory: () => ({
    scope: (req: { user?: User }) => req.user?.id,          // per-user namespace (runs after guards)
    ttl: '48h',                                             // > client retry window (default 24h)
    lockTtl: '45s',                                         // crash recovery; renewed every lockTtl/3 (default 60s)
    retryAfter: '2s',                                       // Retry-After on 409 (default 1s)
    encryption: { keys: process.env.IDEMPOTENCY_KEYS!.split(',') },   // newest first; when responses hold PII/payment data
  }),
}),

@Post(':id/pay')
@Idempotent({ required: true })                              // 400 IDEMPOTENCY_KEY_REQUIRED without a key
pay(@Param('id') id: string, @Body() dto: PayOrderDto, @CurrentUser() user: User) {
  return this.orders.pay(id, user, dto);
}
```

- Import `IdempotencyModule` **before** `ResilienceModule` and keep its interceptor outermost (the module warns otherwise).
- Behaviour per key (fingerprint = scope + method + URL + body):

| Situation | Response |
| --- | --- |
| First call still running | 409 `IDEMPOTENCY_KEY_IN_USE` + `Retry-After` |
| First call completed | stored status/body + `Idempotent-Replayed: true`; handler not run |
| Same key, different request | 422 `IDEMPOTENCY_KEY_REUSED` |

- Stored by default: 2xx and 4xx (replayed). Not stored: 5xx/unknown errors (key released), streams/`@Res()`. Change with `storeIf: (status, error) => status < 500 || error instanceof ChargeCapturedError`.
- Replayed errors come back as plain `HttpException`s (custom `instanceof` checks in filters see the base class).
- Per-handler overrides: `required`, `ttl`, `lockTtl`, `retryAfter`, `keyFrom`, `scope`, `fingerprint` (e.g. ignore a client timestamp), `storeIf`.
- Still keep the state check in the service (conditional update): two taps with two keys are two attempts. Pass downstream providers a key derived from user id + idempotency key.

## GraphQL and messages

```typescript
@Mutation(() => PaymentReceipt)
@Idempotent({ required: true })
payOrder(@Args('orderId', { type: () => ID }) orderId: string, @Args('input') input: PayOrderDto,
         @Args('idempotencyKey') _key: string, @CurrentUser() user: User) { … }   // errors in extensions: code, httpStatus, retryAfter

@EventPattern('order.paid')
@Idempotent({ required: true, keyFrom: { payload: 'eventId' } })                  // id derived from data: `order-paid:${orderId}`
async onOrderPaid(@Payload() event: OrderPaidEvent) { … }
```

- Message consumers: no `scope` needed for globally unique event ids; longer `ttl` (e.g. `'7d'`) for redeliveries from DLQs. Record keys include the handler, so several handlers for one event each run once. On 409 with ack-based brokers, don't ack — let it redeliver.
- Scope per context: `scope: { http: (req) => …, graphql: (req) => …, rpc: (payload) => … }`.

## Store (required in production)

In-memory records vanish on restart and aren't shared; production refuses to start without a store (unless `allowInMemoryStorage`). Implement `IdempotencyStore` in your app and register it:

```typescript
@Injectable()
export class DrizzleIdempotencyStore implements IdempotencyStore {
  constructor(@InjectDrizzle() private readonly db: Database, storage: IdempotencyStorage) { storage.registerSource(this); }
  acquire(key, owner, fingerprint, lockTtl) { /* one INSERT … ON CONFLICT (key_hash) DO UPDATE … WHERE expires_at <= now RETURNING; else read record */ }
  complete(key, owner, response, ttl) { /* UPDATE … WHERE key_hash = ? AND owner = ? AND expires_at > now */ }
  release(key, owner) { /* DELETE with the same owner/expiry guard */ }
  extend(key, owner, lockTtl) { /* UPDATE expiry with the same guard */ }
}
// table idempotency_keys: key_hash (sha256, PK), key, fingerprint, owner (null when complete), response json (not jsonb), expires_at bigint
```

- All four methods must be atomic compare-and-set (owner = fencing token). Redis: one Lua script per method, no pruning needed. Prisma: `$queryRaw` for acquire, `updateMany/deleteMany` with owner+expiry in `where`.
- Database stores: migrations for the table, scheduled `prune()`, synced clocks. Redis shared by services: prefix per service.
- Verify with `idempotencyStoreContract()` from `@nestjs/idempotency/testing`, `{ concurrent: true }`, against PostgreSQL with a pool.

## Clients

Create the key when the user decides (tap Pay), persist it with the pending action, reuse it on every retry; new key only for a new decision. Retry on network errors, 409 `IDEMPOTENCY_KEY_IN_USE` (after Retry-After), 5xx, 429; never on 422 or other 4xx. Check `code`, not just status. Browsers: allow `Idempotency-Key` in CORS `allowedHeaders`, expose `Idempotent-Replayed` and `Retry-After`.

## Testing

```typescript
.overrideProvider(DrizzleIdempotencyStore).useValue(new InMemoryIdempotencyStore())
// slow fake side effect (await setTimeout(100)) so concurrent duplicates overlap
const [a, b] = await Promise.all([pay('key-2'), pay('key-2')]);
expect([a.status, b.status].sort()).toEqual([201, 409]);
```

`app.get(IdempotencyStorage).source.peek('usr_alice:key-1')` inspects raw records.

## Workflow

- [ ] 1. Install; `forRootAsync` with `scope`, TTLs, encryption; import before resilience.
- [ ] 2. `@Idempotent({ required: true })` on money-moving/creating endpoints, mutations and event handlers.
- [ ] 3. Implement and register the store + migration; run the contract suite.
- [ ] 4. Decide `storeIf` for post-side-effect failures; derive downstream provider keys.
- [ ] 5. Tests for replay, 409 overlap and 422 reuse. Build, lint, run tests, start the app.

Sources: [Idempotency keys](https://docs.nestjs.com/reliability/idempotency)
