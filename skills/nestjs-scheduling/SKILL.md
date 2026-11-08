---
name: nestjs-scheduling
description: Schedules recurring and delayed work in NestJS 12 with @nestjs/schedule — ScheduleModule.forRoot (once), @Cron with 6-field patterns, CronExpression, Date one-offs and options (name, timeZone, utcOffset, waitForCompletion, disabled), @Interval and @Timeout, the SchedulerRegistry dynamic API to add, stop, list and delete cron jobs, intervals and timeouts at runtime, running a job on only one instance with @OnOneInstance from @nestjs/locks, and monitoring that jobs actually run. Use when the user wants nightly jobs, periodic cleanup, cron expressions, polling, delayed one-off tasks, runtime-configurable schedules, or when jobs run twice/three times, at the wrong hour, overlap, or stop silently. Not for durable background jobs with retries (nestjs-queues) or long multi-step processes (nestjs-workflows).
compatibility: NestJS 12.x; @nestjs/schedule (uses the cron package); @nestjs/locks for multi-instance
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS task scheduling

```bash
npm i @nestjs/schedule
```

## Setup — call forRoot() exactly once

```typescript
@Module({ imports: [ScheduleModule.forRoot(), TasksModule] })
export class AppModule {}
```

Importing `ScheduleModule.forRoot()` in several modules registers every job again: three imports → each job runs three times. Feature modules just provide the classes with decorators.

## Declarative jobs

```typescript
@Injectable()
export class CleanupTasks {
  private readonly logger = new Logger(CleanupTasks.name);

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'purge-sessions', timeZone: 'Europe/Paris', waitForCompletion: true })
  async purgeSessions() { await this.sessions.deleteExpired(); }

  @Cron('0 */30 9-17 * * 1-5')            // sec min hour dom month dow (seconds optional)
  syncDuringBusinessHours() {}

  @Interval('poll-inbox', 10_000)          // ms, setInterval under the hood
  pollInbox() {}

  @Timeout(5_000)                          // once, 5 s after startup
  warmUp() {}
}
```

- Patterns support `*`, ranges/lists (`1-3,5`), steps (`*/2`); a `Date` runs once at that time.
- Cron options: `name`, `timeZone` (IANA; invalid throws), `utcOffset` (not with `timeZone`), `waitForCompletion` (skip ticks while the previous run is still going), `disabled`.
- Handlers are wrapped in try/catch and errors are only logged: log context and add metrics/alerts yourself.
- Keep handlers thin: for heavy or retryable work, enqueue a job (nestjs-queues) from the cron handler.
- Provide the class in a module that's imported, or it never registers.

## Dynamic API (SchedulerRegistry)

```typescript
constructor(private readonly registry: SchedulerRegistry) {}

reschedule(name: string, pattern: string) {
  const job = this.registry.getCronJob(name);
  job.setTime(new CronTime(pattern));            // stop, set, start
}
addJob(name: string, pattern: string, fn: () => void) {
  const job = new CronJob(pattern, fn);          // from the 'cron' package
  this.registry.addCronJob(name, job);
  job.start();
}
```

- Cron: `getCronJob`, `addCronJob`, `deleteCronJob`, `getCronJobs()` (Map). `CronJob`: `start()`, `stop()`, `setTime()`, `lastDate()`, `nextDate()` (Luxon `DateTime`, `.toJSDate()`; throws if no future date), `nextDates(n)`.
- Intervals/timeouts: `getInterval/addInterval/deleteInterval/getIntervals`, `getTimeout/addTimeout/deleteTimeout/getTimeouts` with plain `setInterval`/`setTimeout` handles.
- Only **named** declarative jobs are reachable through the registry.

## Several instances

Every process runs every job. To run once per tick across instances:

```typescript
@Cron('0 2 * * *')
@OnOneInstance({ key: 'invoices:nightly-export' })   // from @nestjs/locks, shared PostgreSQL/Redis lock store
async exportInvoices() {}
```

See nestjs-locks for the store setup. Alternatively run schedules in a dedicated worker deployment (standalone app, nestjs-standalone-apps).

## Knowing jobs ran

Silent non-runs (crash, bad expression, descheduled container) go unnoticed. With `@nestjs/observe`, scheduled runs are reported as jobs and alert rules can fire when a job stops reporting (nestjs-observability). Otherwise record last-success timestamps and alert on staleness.

## Testing

Call handler methods directly in unit tests. Don't wait for real ticks; for registry logic, provide a real `ScheduleModule.forRoot()` and assert `registry.getCronJob(name).nextDate()`. Disable jobs in e2e tests with config-driven `disabled` or by not importing the tasks module.

## Workflow

- [ ] 1. Install; `ScheduleModule.forRoot()` in `AppModule` only.
- [ ] 2. Tasks class with `@Cron`/`@Interval`/`@Timeout`; name jobs you need to control; set `timeZone` explicitly.
- [ ] 3. Multi-instance: `@OnOneInstance` or a single worker deployment; long runs: `waitForCompletion`.
- [ ] 4. Logging/metrics for failures and missed runs. Build, lint, run tests, start the app.

Sources: [Task scheduling](https://docs.nestjs.com/application/task-scheduling)
