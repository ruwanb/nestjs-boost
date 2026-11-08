---
name: nestjs-webhooks
description: Sends and receives webhooks in NestJS 12 with @nestjs/webhooks — outgoing Standard Webhooks dispatched in your database transaction through @nestjs/outbox, signed and retried by a worker with backoff, endpoint subscriptions per tenant, secret rotation and encryption at rest, the delivery log and replay, SSRF protection; and incoming webhooks verified on the raw body with @VerifyWebhook (standard, Stripe-style, GitHub or custom schemes), deduplicated and processed exactly once with processInTransaction(). Use when the user wants to notify partners or customers of events by webhook, let them register endpoints, retry or replay deliveries, or accept and verify webhooks from Stripe, GitHub, a payment provider or any signed sender. Not for raw body setup alone (nestjs-http-platform), the outbox itself (nestjs-outbox) or calling third-party APIs (nestjs-http-client).
compatibility: NestJS 12.x; @nestjs/webhooks + @nestjs/outbox; PostgreSQL or MySQL 8.4+ via Drizzle, TypeORM, Prisma (driver adapter), Kysely, pg or mysql2
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS webhooks (@nestjs/webhooks)

Don't hand-roll HMAC signing, retry loops or `crypto.timingSafeEqual` checks when `@nestjs/webhooks` is installed or acceptable: it implements the Standard Webhooks spec, at-least-once delivery after commit, SSRF guards and an inbox for exactly-once processing.

```bash
npm i @nestjs/webhooks @nestjs/outbox
```

## Setup (outgoing + incoming)

```typescript
@Module({
  imports: [
    DrizzleModule.forRootAsync({ useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }) }),
    OutboxModule.forRootAsync({ useFactory: () => ({ relay: { enabled: process.env.OUTBOX_RELAY !== 'off', pollInterval: '1s' } }) }),
    WebhooksModule.forRootAsync({
      useFactory: () => ({
        eventTypes: ['order.shipped', 'order.cancelled'],            // dispatch() refuses others
        retry: { attempts: 10, backoff: { delay: '5s', factor: 4, maxDelay: '1d' } },
        worker: { enabled: process.env.WEBHOOKS_WORKER !== 'off' },
        encryption: { keys: process.env.WEBHOOKS_ENCRYPTION_KEYS!.split(',') },   // seal endpoint secrets
        receivers: {
          payments: { scheme: 'standard', secret: process.env.PAYMENTS_WEBHOOK_SECRET! },
          carrier: { scheme: 'stripe', header: 'Carrier-Signature', secret: process.env.CARRIER_WEBHOOK_SECRET! },
        },
      }),
    }),
  ],
  providers: [
    { provide: PostgresOutboxStore, inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db, s: OutboxStorage) => new PostgresOutboxStore({ executor: fromDrizzle(db) }, s) },
    { provide: PostgresWebhookStore, inject: [getDrizzleToken(), WebhooksStorage],
      useFactory: (db, s: WebhooksStorage) => new PostgresWebhookStore({ executor: fromDrizzle(db) }, s) },
  ],
})
export class AppModule {}

// main.ts
const app = await NestFactory.create(AppModule, { rawBody: true });   // required to verify incoming webhooks
app.enableShutdownHooks();
```

- `WebhooksModule` requires `OutboxModule`; startup fails without it.
- Stores create and migrate their own schemas (`nest_webhooks`, `nest_outbox`); no entities to write. With `NODE_ENV=production` they don't auto-migrate (run `npx @nestjs/webhooks migrate` and `npx @nestjs/outbox migrate`, check with `status` in CI) and startup fails with no store registered.
- Import `fromDrizzle`/`fromTypeOrm`/`fromPrisma`/`fromKysely`/`fromPg` from the store's subpath (`@nestjs/webhooks/postgres` or `/mysql`).
- Load secrets through validated config (nestjs-configuration) in real code.

## Send: dispatch inside the transaction

```typescript
constructor(@InjectDrizzle() private readonly db: Database, private readonly webhooks: Webhooks<Transaction>) {}

await this.db.transaction(async (tx) => {
  await tx.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, id));
  await this.webhooks.dispatch(tx, { type: 'order.cancelled', tenant: partnerId, data: { orderId: id, reason } });
});
```

- Pass the **transaction** (Drizzle `tx`, TypeORM `EntityManager` from `dataSource.transaction()`, Prisma interactive tx client), never the database: rollback means nothing is sent.
- Delivery is **at least once and unordered**; receivers dedupe by `webhook-id`. Payload `timestamp` is dispatch time.
- Version payloads: only add fields; for breaking changes add `order.shipped.v2` and dispatch both.

## Let partners subscribe and inspect deliveries

Inject `WebhookEndpoints` (`create({ url, eventTypes, tenant })`, `list`, `update`, `delete`, `getSecret`, `rotateSecret(id, { tenant, overlap })`) and `WebhookDeliveries` (`list`, `get`, `retry(idOrFilter, scope)`, `stats()`, `prune('30d')`). Always pass the caller's tenant as scope. Map `WebhooksError` (has `status`) to HTTP responses with a small `BaseExceptionFilter` subclass.

## Receive: verify, dedupe, process once

```typescript
@Post() @HttpCode(HttpStatus.OK)
@VerifyWebhook('payments')
async receive(@IncomingWebhook() webhook: IncomingWebhook<PaymentEvent>) {
  if (webhook.payload.type !== 'payment.succeeded') return;
  const result = await this.db.transaction((tx) =>
    webhook.processInTransaction(tx, () => this.orders.markPaid(tx, webhook.payload.data.orderId)));
  if (result.duplicate) return;
}
```

- `@VerifyWebhook()` answers 401 on bad signatures (400 for non-JSON); missing `rawBody: true` → 500.
- GitHub (`scheme: 'github'`) signs no timestamp or id: set `id: (payload) => sha256(JSON.stringify(payload))` so replays dedupe.
- During a sender's rotation, list both secrets: `secret: [newSecret, oldSecret]`.
- A service that only receives: `WebhooksModule.forRootAsync({ outgoing: false, useFactory: () => ({ receivers }) })` plus `OutboxModule.forRoot({ relay: { enabled: false } })`. The outbox inbox does the deduplication, so register the outbox store on your database in production; no webhook store is needed.

## Gotchas

- Leave `delivery.allowHttp` / `allowPrivateNetworks` off outside development; partner URLs are untrusted (SSRF). Use `allowedAddresses` for a specific private range.
- Run the worker in a few instances (`worker.enabled: false` elsewhere), not every API pod.
- PostgreSQL default isolation must stay READ COMMITTED; the stores refuse stricter defaults.
- Nothing prunes the log for you: schedule `deliveries.prune('30d')` and `OutboxInbox.prune()` (nestjs-scheduling).
- Rotate endpoint secrets with the default 24h overlap; `overlap: 0` only after a leak.

## Workflow

- [ ] 1. Install both packages; register Drizzle/TypeORM/Prisma, `OutboxModule`, `WebhooksModule`, and both stores.
- [ ] 2. Set `rawBody: true` and `enableShutdownHooks()` in `main.ts` (and in e2e `createNestApplication({ rawBody: true })`).
- [ ] 3. Dispatch inside the transaction that changes state; declare every type in `eventTypes`.
- [ ] 4. For incoming webhooks, add a receiver per sender and `@VerifyWebhook()` + `processInTransaction()`.
- [ ] 5. E2E test with PGlite, `InMemoryWebhookTransport`, relay/worker off and driven by `runOnce()`, `signWebhook()` for incoming (see reference).
- [ ] 6. Build, lint, run unit and e2e tests, start the app.

## Reference files

- `references/webhooks-reference.md`: module and receiver options, store executors and migrations, services, testing recipe, events, errors, custom transports and production checklist. Read when configuring options beyond the example, writing tests, or preparing production.

Sources: [Webhooks](https://docs.nestjs.com/http/webhooks)
