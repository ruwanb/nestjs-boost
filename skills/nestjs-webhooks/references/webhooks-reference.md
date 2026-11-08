# @nestjs/webhooks reference

## Contents
- Module options
- Receiver options
- Stores, executors and migrations
- Services and decorators
- Testing recipe
- Events and errors
- Custom transports
- Production checklist

## Module options

`forRootAsync()` takes `outgoing`, `transport` (class), `imports`, `isGlobal` at the top level next to `useFactory`/`useClass`/`useExisting`; the factory returns the rest. Durations: ms or `'15s'`, `'24h'`, `'5d'`. Token: `WEBHOOKS_MODULE_OPTIONS`.

| Option | Default | Notes |
| --- | --- | --- |
| `eventTypes` | any | Types `dispatch()` and endpoints accept (endpoints also `*`) |
| `retry` | 10 attempts | `attempts`, `backoff`, `retryIf(error, attempt, delivery)`; number = attempts, `false` = one attempt |
| `retry.backoff` | `delay '5s'`, `factor 4`, `maxDelay '1d'`, `jitter 'equal'` | Or a function returning a duration |
| `disableEndpointAfter` | `'5d'` | Disable endpoints failing that long; `false` never |
| `secretRotationOverlap` | `'24h'` | Old secret keeps co-signing |
| `delivery.timeout` | `'15s'` | Must be shorter than `worker.lease` |
| `delivery.allowHttp` / `allowPrivateNetworks` | `false` | Development only; metadata addresses always blocked |
| `delivery.allowedAddresses` | none | CIDRs allowed despite blocking |
| `delivery.maxResponseSize` / `userAgent` | 4096 / `NestJS-Webhooks/1.0` | |
| `worker.enabled` / `pollInterval` / `batchSize` / `concurrency` / `lease` | `true` / `'1s'` / 50 / 10 / `'1m'` | |
| `encryption.keys` | off | 32-byte Buffers or ≥32-char strings, newest first |
| `receivers` | none | See below |
| `transport` | `HttpWebhookTransport` | Class (top level) or instance (factory) |
| `allowInMemoryStorage` | `false` | Allow production start without stores |
| `outgoing` | `true` | `false` for receive-only services |
| `isGlobal` | `true` | |

## Receiver options

| Option | Applies to | Default |
| --- | --- | --- |
| `scheme` | all | required: `'standard'`, `'stripe'`, `'github'`, or a `WebhookSignatureScheme` subclass instance |
| `secret` | all | required; array while rotating |
| `tolerance` | standard, stripe, custom | `'5m'` |
| `header` | stripe | `'stripe-signature'` |
| `id` | stripe, github | payload `id` / `X-GitHub-Delivery` (unsigned!) — `(payload, headers) => string` ≤255 chars |
| `dedupe` | all | `true` |
| `consumer` | all | `webhooks:<name>` — keep stable, ≤255 chars |

`WebhookVerifier.verify(receiver, { headers, rawBody })` verifies requests that didn't arrive over HTTP (e.g. from a queue).

## Stores, executors and migrations

`new PostgresWebhookStore({ executor, schema?, migrate? }, webhooksStorage)` from `@nestjs/webhooks/postgres`; `MySqlWebhookStore` from `@nestjs/webhooks/mysql` (MySQL 8.4 / 9.x). Outbox stores take the same options (`schema` default `nest_outbox`).

| Executor | Client | Transaction object for `dispatch()` / `processInTransaction()` |
| --- | --- | --- |
| `fromDrizzle(db)` | Drizzle (any PG driver; `drizzle-orm/mysql2` on MySQL) | `tx` from `db.transaction()` |
| `fromTypeOrm(dataSource)` | `DataSource` (postgres/mysql) | `EntityManager` from `dataSource.transaction()`, or a started `QueryRunner` |
| `fromPrisma(prisma, { maxWait, timeout })` | Prisma with a driver adapter (`@prisma/adapter-pg`, `@prisma/adapter-mariadb`) | tx client from `prisma.$transaction()` |
| `fromKysely(db)` | Kysely | tx from `db.transaction().execute()` |
| `fromPg(pool)` / `fromMysql2(pool)` | pool | connection after `BEGIN` / `beginTransaction()` |

The outbox store refuses the database itself (`OutboxTransactionRequiredError`).

Migrations:
- `migrate: true` except with `NODE_ENV=production`; a schema behind with `migrate: false` → `WebhookSchemaError` at startup and on every call.
- CLI (`--url`, default `DATABASE_URL`; `--schema`): `npx @nestjs/webhooks migrate | status | sql [--dialect mysql] [--statement-breakpoints]`; same for `npx @nestjs/outbox`.
- TypeORM migration: `queryRunner.query(PostgresOutboxStore.migrationSql())` then `PostgresWebhookStore.migrationSql()`; MySQL: loop over `migrationStatements()`.
- drizzle-kit: `npx drizzle-kit generate --custom --name=webhooks` and fill it with `npx @nestjs/webhooks sql --statement-breakpoints`.
- No down migrations. `CREATE SCHEMA` needs the CREATE privilege.

## Services and decorators

- `Webhooks.dispatch(tx, message | message[])`: `{ type, data, tenant, id? }`; `TypeError` for unknown type, non-JSON data, invalid id. `notify()` runs the relay now.
- `WebhookEndpoints`: `create({ url, eventTypes, tenant, description?, secret? })`, `list(query)`, `get(id, scope)`, `update(id, changes, scope)`, `delete(id, scope)`, `getSecret(id, scope)`, `rotateSecret(id, { tenant, overlap, secret })`.
- `WebhookDeliveries`: `list(query)`, `get(id, scope)`, `retry(idOrFilter, scope)` (a replay keeps the same `webhook-id`), `stats()` (`lagMs`, `failed` …), `prune(olderThan)`.
- `WebhookWorker`: `start()`, `stop()`, `running`, `notify()`, `runOnce()` → `{ claimed, delivered, retried, failed, released, leaseLost }`.
- `@VerifyWebhook(receiver)` (method or controller), `@IncomingWebhook()` → `{ receiver, id, timestamp, payload, rawBody, processInTransaction(tx, fn) }` (result has `duplicate`), `@WebhookPayload()` (accepts pipes).
- `WEBHOOKS_OUTBOX_TOPIC` = `'nestjs.webhooks.message'`: route it to `local` if the outbox routes topics to several transports.

## Testing recipe

```typescript
const client = new PGlite();
const db = drizzle({ client });
const transport = new InMemoryWebhookTransport();
process.env.OUTBOX_RELAY = 'off';
process.env.WEBHOOKS_WORKER = 'off';

const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(getDrizzleToken()).useValue(db)          // stores follow, their factories inject it
  .overrideProvider(WebhookTransport).useValue(transport)
  .compile();
app = moduleRef.createNestApplication({ rawBody: true });
await app.init();

const deliver = async () => { await app.get(OutboxRelay).runOnce(); return app.get(WebhookWorker).runOnce(); };

// incoming
const paid = signWebhook({ scheme: 'standard', secret: PAYMENTS_SECRET, payload: { type: 'payment.succeeded', data } });
await request(app.getHttpServer()).post('/webhooks/payments').set(paid.headers).send(paid.body).expect(200);

// outgoing
await deliver();
const sent = transport.single({ type: 'order.shipped' });
expect(sent.isSignedWith(endpoint.secret)).toBe(true);
transport.respondWith(503);   // simulate failures; or a function of (request, attempt)
```

`signWebhook()` and the store contract suites (`webhookEndpointStoreContract()`, `webhookDeliveryStoreContract()`, run with `{ concurrent: true }`) come from `@nestjs/webhooks/testing`. Standard secrets look like `whsec_<base64 32 bytes>`.

## Events and errors

`WebhooksEvents.events$` (also diagnostics channel `nestjs:webhooks:<type>`): `delivered`, `retry-scheduled`, `delivery-failed` (`reason`: `exhausted | rejected | endpoint-disabled | endpoint-deleted`), `endpoint-disabled` (`failing | gone`), `destination-blocked`, `verification-failed` (`missing-header | malformed-header | invalid-signature | timestamp-out-of-tolerance | invalid-payload`).

Errors (all extend `WebhooksError` except `NonRetryableWebhookError`): `InvalidWebhookEndpointError` 400 (`field`), `WebhookEndpointNotFoundError` 404, `WebhookDeliveryNotFoundError` 404, `WebhookVerificationError` 401/400, `WebhookDestinationBlockedError`, `WebhookResponseError` (`statusCode`, `retryAfterMs`), `WebhookDeliveryTimeoutError`, `WebhookSchemaError`.

Outcomes: 2xx delivered; other statuses/timeouts retried with backoff, `Retry-After` honored up to `maxDelay`; 410 Gone fails and disables the endpoint; redirects never followed.

## Custom transports

`HttpWebhookTransport` resolves and pins checked addresses, never follows redirects, ignores env proxies. Extra constructor options: `ca` (private CAs) and `lookup`. Pass an instance with the same `allowHttp`/`allowPrivateNetworks`/`allowedAddresses` as `delivery`. A custom class extends `WebhookTransport`, implements `send(request, { signal, attempt })` returning `{ statusCode, headers, body }`, throws only without a response; it replaces the SSRF guard.

## Production checklist

- Database stores registered; migrations applied before deploy; `status` checked in CI.
- READ COMMITTED on PostgreSQL; retry MySQL deadlocks (1213).
- SSRF options off; alert on `destination-blocked`, `endpoint-disabled`, `lagMs`, `failed`.
- Worker in a few instances; `enableShutdownHooks()`.
- Versioned payloads; delivery log and replay exposed to partners.
- Encryption keys in a secret manager; rotation with overlap.
- Scheduled `deliveries.prune()` and `OutboxInbox.prune()` (inbox window longer than any sender's retry schedule).
- Receivers: `rawBody: true`, short idempotent handlers.
