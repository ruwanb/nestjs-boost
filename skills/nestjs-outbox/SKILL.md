---
name: nestjs-outbox
description: Publishes events reliably from NestJS 12 with the first-party transactional outbox package @nestjs/outbox — OutboxModule.forRoot/forRootAsync with a PostgresOutboxStore or MySqlOutboxStore and migrations, Outbox.add(tx, message) in the same transaction as your data, keys for per-entity ordering, delays, the relay (polling, leases, publishTimeout, notify), in-process @OnOutboxMessage handlers with per-consumer inboxes and processInTransaction for exactly-once writes, ClientProxyTransport to microservices, retries with backoff, NonRetryableMessageError and the dead-letter queue (list, requeue, purge), events and stats, and testing with PGlite and relay.runOnce(). Use when an event, message, email or webhook must be sent if and only if a database transaction commits (the dual-write problem), when replacing emit-after-save code, or when adding retries/dead letters for outgoing messages. Not for in-memory events (nestjs-events), job queues (nestjs-queues) or webhooks specifics (nestjs-webhooks builds on this).
compatibility: NestJS 12.x; @nestjs/outbox; PostgreSQL (READ COMMITTED) or MySQL 8.4/9.x
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS transactional outbox (@nestjs/outbox)

`ClientProxy.emit()`, `EventEmitter2` and the CQRS `EventBus` publish from memory: save-then-publish loses events on crashes, publish-then-save announces things that never happened. The outbox makes the message a row in your transaction and relays it afterwards (at least once; inboxes dedupe).

```bash
npm i @nestjs/outbox
```

## Register (with a store on your database)

```typescript
OutboxModule.forRootAsync({
  imports: [ClientsModule.registerAsync([{ name: ANALYTICS_SERVICE, useFactory: () => ({ transport: Transport.TCP, options: { host, port } }) }])],
  transports: { analytics: ClientProxyTransport(ANALYTICS_SERVICE) },     // classes beside useFactory
  useFactory: () => ({
    route: (m) => (m.topic.startsWith('analytics.') ? 'analytics' : 'local'),   // exactly one transport per message
    relay: { enabled: process.env.OUTBOX_RELAY !== 'off', pollInterval: '1s', lease: '30s', publishTimeout: '10s' },
    retry: { attempts: 10, backoff: { delay: '1s', maxDelay: '1m' } },
  }),
}),
// providers of AppModule:
{ provide: PostgresOutboxStore, inject: [getDrizzleToken(), OutboxStorage],
  useFactory: (db, storage: OutboxStorage) => new PostgresOutboxStore({ executor: fromDrizzle(db) }, storage) },
```

- The store creates and migrates its own schema (`nest_outbox`). With `NODE_ENV=production` it doesn't auto-migrate (run `npx @nestjs/outbox migrate`, check `status` in CI) and startup fails without a store. The in-memory store **can't join transactions** (it warns) — never rely on it.
- Executors: `fromDrizzle(db)`, `fromTypeOrm(dataSource)`, `fromPrisma(prisma)` (driver adapter), `fromKysely(db)`, `fromPg(pool)`, `fromMysql2(pool)` — from `@nestjs/outbox/postgres` or `/mysql`.
- Global services: `Outbox`, `OutboxRelay`, `OutboxEvents`, `OutboxDeadLetters`, `OutboxInbox`, `OutboxStorage`.

## Add messages in the transaction

```typescript
constructor(@InjectDrizzle() private readonly db: Database, private readonly outbox: Outbox<Transaction>) {}

const order = await this.db.transaction(async (tx) => {
  await tx.insert(orders).values(order);
  await this.outbox.add(tx, [
    { topic: 'order.placed', payload: order },                                   // in-process handlers (local)
    { topic: 'analytics.order.placed', key: order.id, payload: order },          // ordered per order
  ]);
  return order;
});
this.outbox.notify();                                                            // publish now, not at next poll
```

- Pass the **transaction** (Drizzle `tx`, TypeORM `EntityManager`, Prisma tx client) — the database itself is refused (`OutboxTransactionRequiredError`).
- Fields: `topic`, `payload` (snapshotted as JSON), optional `key` (ordering within the key, commit order), `headers`, `id` (UUIDv7 default), `delay` or `availableAt`.
- One message per destination. Don't share a key across transports (a failing destination would hold the others back).
- Keep these transactions short (per-key lock); retry MySQL deadlocks (1213).

## Handle messages

```typescript
@Injectable()
export class OrderEmailsHandler {                                                // singleton provider
  @OnOutboxMessage('order.placed', { consumer: 'order-confirmation-email' })    // stable consumer name = inbox
  async send(order: Order, { signal }: OutboxHandlerContext) { await this.mailer.sendConfirmation(order, { signal }); }
}

@OnOutboxMessage('order.placed', { consumer: 'stock-reservation' })
async reserve(order: Order, ctx: OutboxHandlerContext<Transaction>) {
  await this.db.transaction((tx) => ctx.processInTransaction(tx, async () => { /* writes via tx */ }));   // exactly once for same-DB writes
}
```

| Handler | Guarantee |
| --- | --- |
| default inbox | once, unless crash between handler and inbox record |
| `ctx.processInTransaction(tx, work)` | exactly once for writes in the same database |
| `inbox: false` | at least once |

- Throw to retry (backoff, then dead letter `exhausted`); throw `NonRetryableMessageError` to dead-letter at once (`rejected`), e.g. permanent mail errors.
- Pass `ctx.signal`; handlers slower than `publishTimeout` count as failed.
- Consumers in another service: `OutboxModule.forRoot({ relay: { enabled: false } })` + an outbox store for the inbox, then in the `@EventPattern` handler `inbox.processInTransaction(tx, 'analytics', envelope.id, work)` with `OutboxEnvelope<T>` payloads.

## Operations

- Dead letters: `OutboxDeadLetters.list({ topic, key, limit })`, `get(id)`, `requeue(target)`, `purge(target)` — protect any admin routes (full payloads).
- Health: `OutboxRelay.stats()` (`pending`, `lagMs`, `deadLetters`, …); alert on `dead-lettered` events (`nestjs:outbox:dead-lettered`) and lag.
- Several instances: relays coordinate with leases; turn the relay off in API-only pods via `relay.enabled`.
- Prune inboxes on a schedule: `inbox.prune('30d')` (nestjs-scheduling). Version payloads. `app.enableShutdownHooks()` to drain on deploys. PostgreSQL default isolation must stay READ COMMITTED.

## Testing

```typescript
process.env.OUTBOX_RELAY = 'off';
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(getDrizzleToken()).useValue(drizzle({ client: new PGlite() }))   // after migrate()
  .compile();
await moduleRef.init();
await service.placeOrder(dto);
await moduleRef.get(OutboxRelay).runOnce();          // publishes committed messages → handlers run
```

Assert that a rolled-back transaction publishes nothing. Store authors: `outboxStoreContract()` / `outboxInboxStoreContract()` from `@nestjs/outbox/testing` with `{ concurrent: true }`.

## Workflow

- [ ] 1. Install; register `OutboxModule` + database store; migrations in the release pipeline.
- [ ] 2. Replace emit-after-save with `outbox.add(tx, …)` + `notify()`.
- [ ] 3. Handlers with stable consumer names; `processInTransaction` for same-DB writes; `NonRetryableMessageError` for permanent failures.
- [ ] 4. Routes/transports for other services; retry policy sized to downstream outages; dead-letter tooling and alerts; inbox pruning.
- [ ] 5. PGlite tests with `runOnce()`. Build, lint, run tests, start the app.

## Reference files

- `references/outbox-reference.md`: module/store/message options, executors, CLI, services, events, errors, delivery guarantees and store contract. Read when tuning or writing a custom store.

Sources: [Outbox](https://docs.nestjs.com/reliability/outbox)
