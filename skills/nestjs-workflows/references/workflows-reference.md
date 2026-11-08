# @nestjs/workflows reference

## Contents
- Module options
- Retry options
- Call options
- Schedule options
- Stores and CLI
- Events
- Errors

## Module options

`WorkflowsModule.forRoot()` / `forRootAsync()` (`WorkflowsOptionsFactory`). Token `WORKFLOWS_MODULE_OPTIONS`. The store is registered via `WorkflowStorage`, not an option.

| Option | Default |
| --- | --- |
| `worker.enabled` (`worker: false` shorthand) | `true` |
| `worker.id` | `hostname:pid:random` |
| `worker.concurrency` | 10 |
| `worker.pollInterval` | `'1s'` |
| `worker.leaseDuration` | `'30s'` (keep host clocks in sync) |
| `worker.heartbeatInterval` | lease ÷ 3 |
| `worker.shutdownTimeout` | `'10s'` |
| `retry` | 3 attempts, `'1s'` ×2 up to `'5m'`, no jitter |
| `journal.warnEntries` / `warnBytes` | 1000 / 1 MB (`journal-large` event) |
| `journal.maxEntries` / `maxBytes` | 10000 / 10 MB (fail with `WorkflowJournalLimitError`) |
| `clock` | system (`ManualWorkflowClock` in tests) |
| `allowInMemoryStorage` | `false` |
| `codec` | none (`WorkflowPayloadCodec` or list; first encodes) |
| `isGlobal` | `true` |

## Retry options

Number, `false`, or `{ attempts: 3, backoff: { delay: '1s', factor: 2, maxDelay: '5m', jitter: 'none' | 'full' | 'equal' }, retryIf(error, attempt) }`; `backoff` may be `(attempt, error) => duration`. Step `retry` merges over the module's per field. `NonRetryableStepError` never retries.

## Call options

| Call | Options |
| --- | --- |
| `@Workflow(name, …)` | `version` (1), `timeout`, `concurrency` (`limit`, `key`), `rateLimit` (`max`, `duration`, `key`), `schedules` |
| `ctx.step(name, fn, …)` | `retry`, `timeout`, `heartbeatTimeout`, `compensate`, `compensateRetry`; fn gets `idempotencyKey`, `attempt`, `signal`, `progress`, `heartbeat()` |
| `ctx.waitForSignal(name, signal, …)` | `key`, `timeout` (→ `null`), `match` (pure filter) |
| `ctx.sleep(name, duration \| { until })` | |
| `ctx.waitForAny(name, { k: ctx.signalWait(sig, { key, match }) \| ctx.timer(d) \| childHandle })` | resolves `{ key, value }` |
| `ctx.startChild` / `ctx.executeChild(workflow, input, …)` | `id` (default `<parent>/<workflow>#<n>`), `version`, `timeout`, `parentClose`, `priority`, `concurrencyKey`, `rateLimitKey` |
| `ctx.setStatus(json ≤16 KiB \| undefined)`, `ctx.commit(label)`, `ctx.fail(message)`, `ctx.now()`, `ctx.schedule` | |
| `client.start(workflow, input, …)` | `id`, `version`, `timeout`, `transaction`, `priority` (1–2,097,151; none goes first), `concurrencyKey`, `rateLimitKey` |
| `client.signal(signal, payload, …)` | `key`, `id` (dedupe), `transaction` |
| `client.startAndWait(workflow, input, opts, { timeout, signal })`, `client.result(id, { timeout, signal })` | |
| `client.getStatus(id, { journal, children })` | |
| `client.cancel(id, reason)`, `terminate(id, reason)` | |
| `client.list({ status, workflow, version, parentId, scheduleId, limit = 100, offset })` | |
| `client.retry(id, { timeout })`, `client.delete(id, { force })` | |
| `client.purge({ olderThan, status, batchSize = 500 })` → `{ instances, signals, rateLimits }` | |
| `client.schedules` / `WorkflowSchedules`: `upsert`, `get`, `list`, `remove`, `pause`, `resume`, `trigger` | declared schedules can't be upserted/removed |
| `@StartOn(Event, { id, input, priority, concurrencyKey, rateLimitKey })`, `@SignalOn(Event, { signal, key, id, payload })` | with `WorkflowsCqrsModule` |

## Schedule options

`id` (letters, digits, `.:_-`), one of `cron` (5 or 6 fields) / `every` (≥1 s) / `rrule`, `tz` (`'UTC'`), `startAt`, `endAt`, `limit`, `missed` (`'skip'` | `'once'` | `'all'`), `overlap` (`'skip'` | `'allow'` | `'cancel-previous'` | `'buffer-one'`), `priority`, `input` (JSON or function of the occurrence). Instance ids: `<schedule id>@<ISO time>`. Every worker whose code declares the schedule participates; dropped schedules disappear ~5 minutes after the last declaring worker stops.

## Stores and CLI

- `PostgresWorkflowStore` (`@nestjs/workflows/postgres`): `executor`, `schema` (`nest_workflows`), `migrate`. Keep READ COMMITTED.
- `MySqlWorkflowStore` (`@nestjs/workflows/mysql`): MySQL 8.4/9.x, strict sql_mode, not MariaDB; key length limits (ids 255, schedule ids 230, journal names 512).
- `migrate()`, `migrationSql()`, `migrationStatements()` (MySQL); CLI `npx @nestjs/workflows migrate | status | sql`.
- Custom stores: implement `WorkflowStore`, `registerSource(this)`, test with `workflowStoreContract(factory, { concurrent: true, transaction })`.

## Events

`WorkflowEvents.events$` + `nestjs:workflows:<type>`; payload `type`, `id`, `workflow`, `version`, `at`:
`workflow-started`, `workflow-resumed` (`run`), `workflow-suspended` (`wakeAt`, `waits`), `step-completed` (`step`, `attempt`, `durationMs`), `step-failed` (`retryAt` null = gave up), `signal-received`, `signal-timed-out`, `workflow-compensating`, `step-compensated`, `workflow-completed` (`output`), `workflow-failed`, `workflow-cancelled`, `workflow-compensation-failed`, `journal-large`, `workflow-retried`, `workflow-deleted`, `custom-status`, `child-started`, `schedule-skipped`. One trace per instance id.

## Errors

| Error | HTTP |
| --- | --- |
| `WorkflowIdConflictError` (same id, different input/workflow) | 409 |
| `WorkflowNotFoundError` | 404 |
| `WorkflowStateError` (invalid retry/delete, races, declared schedule edits) | 409 |
| `NonRetryableStepError` (yours) | — |
| `ChildWorkflowFailedError` (`status`, `cause`) | — |
| `WorkflowNonDeterminismError` (deploy broke replay; no compensations run) | — |
| `WorkflowJournalLimitError`, `WorkflowSchemaError`, `WorkflowTerminatedError` | — |
