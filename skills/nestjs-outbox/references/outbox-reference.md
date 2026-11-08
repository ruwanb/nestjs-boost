# @nestjs/outbox reference

## Contents
- Module options
- Stores, executors, migrations
- Messages, handlers, envelope
- Services
- Events and errors
- Delivery guarantees
- Store contract

## Module options

`forRootAsync()`: `transports` classes, `imports`, `isGlobal` at the top level; the rest from the factory/`OutboxOptionsFactory`. Token `OUTBOX_MODULE_OPTIONS`.

| Option | Default |
| --- | --- |
| `transports` | none (`local` built in, reserved) |
| `route` | the only destination; required with handlers + transports |
| `relay.enabled` / `pollInterval` / `batchSize` / `lease` / `concurrency` / `publishTimeout` | `true` / `'1s'` / 100 / `'30s'` / 10 / lease ÷ 3 |
| `retry.attempts` | 20 (number shorthand; `false` = one attempt) |
| `retry.backoff` | `'1s'` doubling to `'5m'`, equal jitter; or `(attempt, error, message) => duration` |
| `retry.retryIf` | every error; `false` → dead-letter now |
| `allowInMemoryStorage` | `false` |
| `isGlobal` | `true` |

## Stores, executors, migrations

`new PostgresOutboxStore({ executor, schema = 'nest_outbox', migrate }, outboxStorage)` / `MySqlOutboxStore` (MySQL 8.4 LTS or 9.x, strict sql_mode; not MariaDB). Without `outboxStorage` the store registers nowhere (scripts/tests).

| Executor | Transaction object |
| --- | --- |
| `fromDrizzle(db)` | `tx` from `db.transaction()` |
| `fromTypeOrm(dataSource)` | `EntityManager` from `dataSource.transaction()` or started `QueryRunner` |
| `fromPrisma(prisma, { maxWait = '10s', timeout = '1m' })` | tx client from `prisma.$transaction()` |
| `fromKysely(db)` | tx from `db.transaction().execute()` |
| `fromPg(pool)` | client after `BEGIN` |
| `fromMysql2(pool)` | connection after `beginTransaction()` |

`store.migrate()`, `PostgresOutboxStore.migrationSql({ schema, from, to, statementBreakpoints })`, `MySqlOutboxStore.migrationStatements()`. CLI `npx @nestjs/outbox migrate | status | sql [--dialect mysql] [--statement-breakpoints]` with `--url`, `--schema`. TypeORM: run `migrationSql()` in a migration; drizzle-kit: `generate --custom` and paste `sql --statement-breakpoints`.

## Messages, handlers, envelope

- `outbox.add(tx, message | message[])`: `topic`, `payload`, `key?`, `headers?`, `id?`, `delay?` | `availableAt?`.
- `@OnOutboxMessage(topic, { consumer, inbox = true })` on singleton providers. Context: `message`, `consumer`, `attempt`, `signal`, `processInTransaction(tx, work)` → `{ duplicate, result? }`.
- `ClientProxyTransport(token, { toPacket?(message, envelope) })` emits the topic with `OutboxEnvelope` `{ id, topic, key, headers, createdAt, payload }`. Consumers process one key's events sequentially if order matters (handlers are async).

## Services

| Service | Methods |
| --- | --- |
| `Outbox` | `add(tx, messages)`, `notify()` |
| `OutboxRelay` | `stats()` (`pending`, `ready`, `leased`, `deadLetters`, `oldestDueAt`, `lagMs`, `inFlight`), `runOnce()` (`claimed`, `published`, `retried`, `deadLettered`, `released`, `leaseLost`), `notify()`, `start()`, `stop()` |
| `OutboxDeadLetters` | `list({ topic, key, limit, offset })`, `get(id)`, `requeue(target)`, `purge(target)`; target = id, ids, or `{ ids, topic, key, failedBefore, all: true }` |
| `OutboxInbox` | `process(consumer, id, work)`, `processInTransaction(tx, consumer, id, work)`, `prune(olderThan)` |

## Events and errors

`OutboxEvents.events$` + `nestjs:outbox:<type>`: `published` (`transport`, `durationMs`), `retry-scheduled` (`error`, `attempt`, `delayMs`), `dead-lettered` (`reason`: `exhausted` | `rejected`), `lease-lost`. Catch errors in subscribers (rethrown as uncaught).

Errors (`OutboxError` base, no HTTP status): `OutboxTransactionRequiredError`, `OutboxPublishTimeoutError` (`timeoutMs`), `OutboxNoHandlerError` (`topic`; retried), `OutboxSchemaError`; and `NonRetryableMessageError` (yours to throw).

## Delivery guarantees

- Rollback → never existed. Commit → published eventually or dead-lettered with history.
- Relay crash after claim → another relay after lease; after publish before record → published twice (inbox dedupes).
- Keyed messages publish in commit order; a retrying message holds back its key; a dead-lettered one unblocks it (later messages overtake).
- TCP/Redis/core NATS: "published" means it left the process; consumer crashes lose it — prefer acknowledging transports for critical consumers.

## Store contract

Implement `OutboxStore` (messages + dead letters) and `OutboxInboxStore`; register with `outboxStorage.registerSource({ messages: this, inbox: this })` (consumers may register `inbox` only). Requirements: number a key's messages in commit order; `claim()` never leases to two relays nor runs ahead of an older message of its key; writes fenced by lease; two deliveries of one message can't both run work. Verify with `outboxStoreContract()` / `outboxInboxStoreContract()` (`@nestjs/outbox/testing`, `concurrent: true`) against the production engine with a pool.

BullMQ's Postgres backend can't currently join your transaction, so it is not a substitute for the outbox.
