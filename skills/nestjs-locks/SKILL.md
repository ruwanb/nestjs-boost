---
name: nestjs-locks
description: Coordinates multiple NestJS 12 instances with the first-party @nestjs/locks package — leases in a shared store (PostgreSQL, MySQL or Redis LockStore you register), @OnOneInstance to run @Cron/@Interval jobs on one instance with sticky ownership and handover, @WithoutOverlapping to skip ticks while a run is in progress, fencing tokens and LocksContext.signal to stop stale writes after pauses, Locks.acquire/withLock for ad-hoc mutual exclusion with wait and await using, @LeaderElection with onLeadershipAcquired/Lost, LockLostError and storeTimeout handling, events, the store contract and testing with ManualLockClock. Use when scheduled jobs run once per pod instead of once overall, long jobs overlap, an admin action must not run alongside a job, one instance should hold a connection or role (leader election), or when replacing Redis SET NX locks. Not for idempotent request handling (nestjs-idempotency), queue job concurrency (nestjs-queues) or workflow concurrency limits (nestjs-workflows).
compatibility: NestJS 12.x; @nestjs/locks; @nestjs/schedule for job decorators; a shared store (PostgreSQL/MySQL table or Redis)
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS distributed locks (@nestjs/locks)

Hand-rolled `SET NX` keys or `RUN_JOBS=true` flags fail on GC pauses, rolling deploys and crashes. `@nestjs/locks` uses renewed leases, sticky job ownership and fencing tokens.

```bash
npm i @nestjs/locks
```

## Register with a shared store

The default in-memory store only excludes callers within one process (useless with several pods; production refuses it). The package defines `LockStore`; you implement it with your database or Redis and register it:

```typescript
LocksModule.forRoot({ ttl: '30s', storeTimeout: '10s' }),
// providers: DrizzleLockStore — constructor(@InjectDrizzle() db, storage: LocksStorage) { storage.registerSource(this); }

// schema (PostgreSQL)
export const locks = pgTable('locks', {
  key: text('key').primaryKey(),
  owner: text('owner'),                                                  // null once released
  fencingToken: bigint('fencing_token', { mode: 'number' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),  // on the DB clock
});
export const locksFencingTokenSeq = pgSequence('locks_fencing_token_seq');   // tokens never go back
```

Store methods, all atomic: `acquire(key, owner, ttl)` (one `INSERT … ON CONFLICT (key) DO UPDATE … WHERE owner IS NULL OR expires_at <= clock_timestamp() RETURNING fencing_token` with a token greater than any before), `renew(key, owner, ttl)` and `release(key, owner)` (compare-and-set on owner + live expiry; never reset tokens). Redis: Lua scripts, persistence on, `maxmemory-policy noeviction`. Verify with `lockStoreContract()` from `@nestjs/locks/testing` (`concurrent: true`) against a pooled server.

## Scheduled jobs on one instance, without overlap

```typescript
@Cron('0 2 * * *', { name: 'invoice-export', timeZone: 'Europe/Warsaw' })
@OnOneInstance({ key: 'invoices:nightly-export' })        // set key explicitly: renames would change the default
async exportInvoices() { … }

@Cron(CronExpression.EVERY_5_MINUTES)
@OnOneInstance({ key: 'inventory:stock-reconciliation' })
@WithoutOverlapping()                                     // shares the key; skip ticks while a run holds it, on any instance
async reconcileStock() {
  const { fencingToken, signal } = this.locksContext;     // inject LocksContext
  const counts = await this.warehouse.stockCounts({ signal });              // aborts when the lock is lost
  await this.stock.writeStock(counts, fencingToken!);                      // fenced write
}
```

- The first instance to fire takes the `<key>:owner` lease and keeps it (renewed every ttl/3); others skip ticks. On crash, another takes over after `ttl`; on clean shutdown, handover is immediate (`enableShutdownHooks()`).
- **Missed ticks aren't caught up**: write jobs that process everything due, not "this tick's" work.
- Fence irreversible writes in the same statement: `UPDATE products SET in_stock = $1, stock_fencing_token = $2 WHERE id = $3 AND stock_fencing_token <= $2`. A paused holder's late write is then refused.
- Skipped ticks log at `debug`.

## Ad-hoc locks

```typescript
try {
  return await this.locks.withLock(INVOICE_EXPORT_LOCK, () => this.job.export(), { wait: '2s' });   // same key as the job's @WithoutOverlapping
} catch (e) {
  if (e instanceof LockNotAcquiredError) throw new ConflictException('An export is already running.');
  throw e;
}

await using lock = await this.locks.acquire('reports:rebuild', { ttl: '1m' });   // null if taken (wait defaults to 0)
```

`Lock`: `key`, `owner`, `fencingToken`, `signal`, `held`, `release()`.

## Leader election

```typescript
@Injectable()
@LeaderElection('inventory:warehouse-feed')
export class WarehouseFeed implements OnLeadershipAcquired, OnLeadershipLost {
  onLeadershipAcquired(lock: Lock) { this.client.subscribe(onAlert, { signal: lock.signal }); }   // ends with leadership
  onLeadershipLost() { this.logger.log('Disconnected'); }
}
```

Singleton providers only; every instance retries every ttl/3 from `onApplicationBootstrap`.

## Operations

- `ttl` well above store round trip and acceptable event-loop stalls (30 s fits most); `storeTimeout` above the slowest healthy store answer (`LockStoreTimeoutError` otherwise).
- Alert on `lock-lost` (`LocksEvents.events$`, channel `nestjs:locks:lock-lost`, `detectedBy: 'renewal' | 'deadline'`).
- Close Redis clients in `onApplicationShutdown()` (locks are released before that).
- Size the DB pool for one renewal per held lock per beat plus ticks; keep NTP on.

## Testing

`ManualLockClock` stops renewals (simulates a dead/paused instance): boot several apps on one database, call job methods directly, `await clock.advance('5m')` to fire renewals, assert one run and the skip logs. Expiry is measured on the store's clock, so real-time sleeps of just over `ttl` test handover.

## Workflow

- [ ] 1. Install; implement + register the store (table + sequence migration, or Redis scripts); contract tests.
- [ ] 2. Add `@OnOneInstance({ key })` to every scheduled job; `@WithoutOverlapping()` to long ones.
- [ ] 3. Pass `LocksContext.signal` to I/O; fence irreversible writes with `fencingToken`.
- [ ] 4. `withLock` for manual triggers (409 on contention); `@LeaderElection` for singleton roles.
- [ ] 5. Shutdown hooks, alerts; multi-instance tests. Build, lint, run tests, start the app.

Sources: [Distributed locks](https://docs.nestjs.com/reliability/locks)
