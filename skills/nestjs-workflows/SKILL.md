---
name: nestjs-workflows
description: Builds durable, long-running processes in NestJS 12 with the first-party @nestjs/workflows package — @Workflow classes whose run() replays from a journal, ctx.step with idempotency keys, retries, timeouts, heartbeats and compensations (sagas with rollback), ctx.commit points of no return, durable timers and sleeps, typed WorkflowSignal waits and waitForAny races, run timeouts, WorkflowClient start (in your DB transaction), signal, getStatus, cancel, terminate, retry, purge, startAndWait, children, limits, priorities, schedules, versioning and deterministic replay rules, CQRS @StartOn/@SignalOn, Postgres/MySQL stores, and testing with ManualWorkflowClock and worker.drain(). Use when a business process spans minutes to weeks or multiple systems (order fulfilment, onboarding), must survive restarts and deploys, wait for webhooks or time, or undo completed steps on failure. Not for single background jobs (nestjs-queues), simple crons (nestjs-scheduling) or in-memory sagas (nestjs-cqrs).
compatibility: NestJS 12.x; @nestjs/workflows; PostgreSQL or MySQL 8.4/9.x store
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS durable workflows (@nestjs/workflows)

Choose: one unit of background work → BullMQ (nestjs-queues); in-process reactions where losing state on restart is fine → CQRS sagas; a multi-step process that waits, spans systems and must undo on failure → a workflow.

```bash
npm i @nestjs/workflows
```

## Register with a database store

```typescript
WorkflowsModule.forRoot({ worker: { concurrency: 10, leaseDuration: '30s', shutdownTimeout: '10s' } }),
// providers:
{ provide: PostgresWorkflowStore, inject: [getDrizzleToken(), WorkflowStorage],
  useFactory: (db, storage: WorkflowStorage) => new PostgresWorkflowStore({ executor: fromDrizzle(db) }, storage) },
OrderFulfilmentWorkflow,                               // workflow classes are providers
```

Store creates its own schema (`nest_workflows`); in production run `npx @nestjs/workflows migrate` and check `status` in CI. Executors: `fromDrizzle`, `fromTypeOrm`, `fromPg`/`fromMysql2`, `fromPrisma`, `fromKysely`. `app.enableShutdownHooks()`; keep `shutdownTimeout` below the platform grace period.

## Write the workflow

```typescript
export const shipmentDelivered = new WorkflowSignal<CarrierEvent>('shipment.delivered');
export const shipmentReturned = new WorkflowSignal<CarrierEvent>('shipment.returned');

@Workflow('order-fulfilment', { timeout: '30d', concurrency: { limit: 1, key: (o: Order) => o.userId }, rateLimit: { max: 10, duration: '1s' } })
export class OrderFulfilmentWorkflow implements WorkflowRunner<Order, FulfilmentResult> {
  constructor(private readonly payments: PaymentsService, private readonly inventory: InventoryService, private readonly mail: MailService) {}

  async run(ctx: WorkflowContext, order: Order): Promise<FulfilmentResult> {
    const charge = await ctx.step('charge-payment', ({ idempotencyKey }) => this.payments.charge(order, idempotencyKey), {
      retry: { attempts: 5, backoff: { delay: '2s' } },
      compensate: (c, { idempotencyKey }) => this.payments.refund(c.chargeId, idempotencyKey),
    });
    await ctx.step('reserve-stock', ({ idempotencyKey }) => this.inventory.reserve(order.items, idempotencyKey),
      { compensate: ({ reservationId }) => this.inventory.release(reservationId) });
    ctx.setStatus('awaiting-delivery');

    const outcome = await ctx.waitForAny('await-delivery', {
      delivered: ctx.signalWait(shipmentDelivered, { key: order.id }),
      returned: ctx.signalWait(shipmentReturned, { key: order.id }),
      timedOut: ctx.timer('3d'),
    });
    if (outcome.key !== 'delivered') ctx.fail(`Order ${order.id} was not delivered.`);   // compensations run in reverse

    ctx.commit('delivered');                              // point of no return: discards compensations
    await ctx.sleep('before-review-request', '7d');       // durable; holds no memory or worker
    await ctx.step('send-review-request', ({ idempotencyKey }) => this.mail.sendReviewRequest(order, idempotencyKey));
    return { chargeId: charge.chargeId, trackingNumber: outcome.value.trackingNumber };
  }
}
```

Rules for workflow code:
- `run()` **replays from the top** after every wait, sleep or crash; completed steps return journaled results. Put every side effect, random value or clock read in a step (use `ctx.now()`), never between steps.
- Steps run **at least once**: pass `idempotencyKey` to every side effect (and compensation). Throw `NonRetryableStepError` for permanent failures (declined card).
- The class is a shared singleton: per-instance state in local variables, never `this`.
- Step/sleep/wait names are a contract with running instances and part of the idempotency key. Renaming, removing, reordering or inserting earlier steps requires a **new version** (`@Workflow(name, { version: 2 })`, keep v1 registered until its instances finish). Safe without a version: changing a body's implementation, appending after the furthest point reached, changing retry/timeouts.
- Parallel steps: `Promise.all(items.map((it, i) => ctx.step(\`reserve-item-${i}\`, …)))`.
- Long steps: `({ progress, heartbeat, signal }: WorkflowStepContext<Checkpoint>)` with `heartbeat(checkpoint)` and `heartbeatTimeout`.
- Keep journals bounded (loops grow them).

## Start, signal, operate

```typescript
await this.db.transaction(async (tx) => {
  await tx.insert(orders).values(order);
  await this.workflows.start(OrderFulfilmentWorkflow, order, { id: `order-${order.id}`, transaction: tx, priority: order.express ? 1 : 2 });
});                                                       // exists iff the order does; same id+input is idempotent

await this.workflows.signal(shipmentDelivered, event, { key: event.reference, id: event.eventId, transaction: tx });   // from a verified webhook
const instance = await this.workflows.getStatus(`order-${id}`, { journal: true });   // status, customStatus, waits, wakeAt, error, output
await this.workflows.cancel(id, reason);   // runs compensations;  terminate(id, reason) skips them
await this.workflows.retry(id);            // failed/compensation_failed;  delete(id, { force })
await this.workflows.purge({ olderThan: '30d' });   // nightly, @OnOneInstance (nestjs-locks)
```

- Statuses: `pending`, `running`, `suspended`, `compensating`, `completed`, `cancelled`, `failed`, `compensation_failed` (needs a person).
- Children: `ctx.executeChild(ShipmentWorkflow, order)` (throws `ChildWorkflowFailedError`), `ctx.startChild(...)`, `parentClose: 'cancel' | 'terminate' | 'abandon'`.
- Schedules: `@Workflow('invoice-batch', { schedules: [{ id: 'monthly-invoices', cron: '0 2 1 * *', tz: 'America/New_York', missed: 'once', priority: 10 }] })`; runtime: `workflows.schedules.upsert/trigger/pause/resume/remove`.
- `startAndWait(workflow, input, options, { timeout })` for request/response callers.
- CQRS: `WorkflowsCqrsModule` + `@StartOn(Event, { id, input })` / `@SignalOn(Event, { signal, key })`, publish with `{ transaction: tx }` (nestjs-cqrs).
- Encrypt stored payloads with a `codec`; ids and keys stay readable.

## Testing

```typescript
const clock = new ManualWorkflowClock();
// .overrideProvider(getDrizzleToken()).useValue(pgliteDb)
// .overrideProvider(WORKFLOWS_MODULE_OPTIONS).useValue({ clock, worker: { enabled: false, shutdownTimeout: 50 } })
await orders.place(dto);
await worker.drain();          // charge, reserve, park
clock.advance('3d');
await worker.drain();          // timeout → compensations
expect(await workflows.getStatus(id)).toMatchObject({ status: 'failed' });
```

Test crash recovery by booting a second app on the same database and draining. Store authors: `workflowStoreContract()` from `@nestjs/workflows/testing`.

## Workflow

- [ ] 1. Install; register module + database store; migrations in the release step.
- [ ] 2. Model the process: steps with idempotency keys and compensations, signals, timers, commit point, run timeout.
- [ ] 3. Start in the business transaction with a deterministic id; signal from verified webhooks with ids.
- [ ] 4. Ops: status endpoint, staff cancel/retry, nightly purge, alerts on `compensation_failed` and non-determinism failures.
- [ ] 5. Manual-clock tests. Build, lint, run tests, start the app.

## Reference files

- `references/workflows-reference.md`: module and retry options, call options for every ctx/client method, schedule options, store/CLI details, events and errors. Read when using an option not shown above.

Sources: [Durable workflows](https://docs.nestjs.com/reliability/workflows)
