---
name: nestjs-queues
description: Runs background jobs in NestJS 12 with Redis-backed queues via @nestjs/bullmq (and legacy @nestjs/bull) — BullModule.forRoot/forRootAsync and registerQueue, named Redis configurations, producers with @InjectQueue and Queue.add job options (attempts, backoff, delay, priority, jobId dedupe, removeOnComplete), repeatable jobs with upsertJobScheduler, consumers extending WorkerHost with process() and a switch on job.name, request-scoped consumers with JOB_REF, @OnWorkerEvent and @QueueEventsListener/@OnQueueEvent listeners, flows, sandboxed processors, pause/resume, manual registration, and observing queues. Use when work should happen outside the request (emails, transcoding, imports, webhooks to slow APIs), needs retries with backoff, must be spread across workers, or when jobs don't process, run twice or pile up. Not for in-process events (nestjs-events), transactional outbox delivery (nestjs-outbox), multi-step durable processes (nestjs-workflows) or cron schedules alone (nestjs-scheduling).
compatibility: NestJS 12.x; @nestjs/bullmq + bullmq (recommended) or @nestjs/bull + bull (maintenance mode); Redis
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS queues (BullMQ)

Use `@nestjs/bullmq` for new code; `@nestjs/bull` is in maintenance mode. If the project already uses Bull, read `references/bull-legacy.md` before editing — the APIs differ.

```bash
npm i @nestjs/bullmq bullmq
```

## Setup

```typescript
// app.module.ts
BullModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    connection: { url: config.getOrThrow<string>('REDIS_URL') },
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 },
  }),
}),

// media/media.module.ts
@Module({
  imports: [BullModule.registerQueue({ name: 'audio' })],
  providers: [AudioService, AudioConsumer, AudioEventsListener],   // consumers and listeners MUST be providers
})
export class MediaModule {}
```

- Shared options: `connection`, `prefix` (`bull`), `defaultJobOptions` (not applied to `FlowProducer` jobs), `settings`, `extraOptions`.
- Per queue overrides in `registerQueue({ name, connection, … })`; async: `registerQueueAsync({ name, useFactory })` (name outside the factory).
- Another Redis: `BullModule.forRoot('alt', { connection })` + `registerQueue({ name: 'video', configKey: 'alt' })`.

## Producer

```typescript
@Injectable()
export class AudioService {
  constructor(@InjectQueue('audio') private readonly audioQueue: Queue) {}
  enqueue(fileId: string) {
    return this.audioQueue.add('transcode', { fileId }, { jobId: `transcode:${fileId}`, priority: 2, delay: 3000 });
  }
}
```

- Job data must be JSON-serializable: pass ids, not entities.
- `jobId` dedupes (an existing id isn't added again). Other options: `attempts` (default 1), `backoff`, `lifo`, `removeOnComplete`, `removeOnFail`, `stackTraceLimit`.
- Repeating jobs: `queue.upsertJobScheduler(id, { pattern: '0 2 * * *' }, { name, data })` — BullMQ no longer accepts `repeat` in `add()`.
- Enqueue **after** the DB transaction commits, or use the outbox (nestjs-outbox) when the job must exist iff the transaction commits.

## Consumer

```typescript
@Processor('audio', { concurrency: 5 })
export class AudioConsumer extends WorkerHost {
  private readonly logger = new Logger(AudioConsumer.name);

  async process(job: Job<{ fileId: string }>): Promise<unknown> {
    switch (job.name) {                                  // BullMQ has no @Process('name')
      case 'transcode':
        await this.transcoder.run(job.data.fileId, (p) => job.updateProgress(p));
        return { done: true };
      default:
        throw new Error(`Unknown job ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) { this.logger.error(`Job ${job.id} failed (attempt ${job.attemptsMade})`, err.stack); }
}
```

- Make handlers **idempotent**: jobs are retried and can run more than once after a stalled worker.
- Throw to fail (retried per `attempts`/`backoff`); return a value to store as the result.
- Queue-level listeners: `@QueueEventsListener('audio') class X extends QueueEventsHost { @OnQueueEvent('completed') … }` (receive `{ jobId, … }`, not jobs).
- Request-scoped: `@Processor({ name: 'audio', scope: Scope.REQUEST })` + `@Inject(JOB_REF) job`.
- MikroORM users: decorate `process()` with `@CreateRequestContext()` (below other decorators).
- Pause/resume: `queue.pause()` / `queue.resume()`; counts and cleanup on the `Queue` API.
- Flows (parent/child jobs): `BullModule.registerFlowProducer({ name })` + `@InjectFlowProducer(name)`.

## Separate processes and workers

- Sandboxed processors: `registerQueue({ name, processors: [join(import.meta.dirname, 'processor.js')] })` — runs in a fork, **no DI**.
- Dedicated worker deployment: a standalone app (nestjs-standalone-apps) importing the consumer modules; API pods only produce.
- `extraOptions: { manualRegistration: true }` + `BullRegistrar.register()` to start workers conditionally (e.g. only when `ROLE=worker`).

## Observability

Watch wait time vs run time, attempts, failures and "job hasn't run" silence. `@nestjs/observe` instruments `@Processor()` classes automatically (nestjs-observability).

## Testing

- Producer: `{ provide: getQueueToken('audio'), useValue: { add: vi.fn() } }`.
- Consumer: instantiate and call `process({ name: 'transcode', data, updateProgress: vi.fn() } as any)`.
- Integration: real Redis (Testcontainers) and wait for `completed` via `QueueEvents`.

## Workflow

- [ ] 1. Install; `forRootAsync` with Redis from config and sensible `defaultJobOptions`.
- [ ] 2. `registerQueue` in the feature module; producer service with `@InjectQueue`.
- [ ] 3. Consumer extending `WorkerHost` with a `switch` on `job.name`; listeners; all registered as providers.
- [ ] 4. Idempotency, retries, removal policies; worker placement (in-process vs worker deployment).
- [ ] 5. Tests. Build, lint, run tests, start the app with Redis.

## Reference files

- `references/bull-legacy.md`: `@nestjs/bull` API (named `@Process()`, `@OnQueue*` events, `Queue` from bull, options) and a migration map to BullMQ. Read when the project uses `@nestjs/bull`.

Sources: [Queues](https://docs.nestjs.com/application/queues)
