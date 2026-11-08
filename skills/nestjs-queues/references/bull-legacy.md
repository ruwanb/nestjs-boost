# @nestjs/bull (legacy Bull)

Bull is in maintenance mode (bug fixes only). Keep using it in projects that already do; plan migrations to BullMQ deliberately (job data in Redis is not shared between the two).

## Contents
- Setup
- Producers and job options
- Consumers
- Events
- Migration map to BullMQ

## Setup

```bash
npm i @nestjs/bull bull
```

```typescript
BullModule.forRoot({ redis: { host: 'localhost', port: 6379 } });     // also: limiter, prefix, defaultJobOptions, settings
BullModule.registerQueue({ name: 'audio' });                          // per-queue `redis` override; `configKey` for named configs
BullModule.forRoot('alternative-config', { redis: { port: 6381 } });
```

Async: `forRootAsync({ useFactory, inject })` (`useClass` implements `SharedBullConfigurationFactory`), `registerQueueAsync({ name, useFactory })`.

## Producers and job options

```typescript
constructor(@InjectQueue('audio') private readonly audioQueue: Queue) {}   // Queue from 'bull'
await this.audioQueue.add({ foo: 'bar' });                                  // unnamed
await this.audioQueue.add('transcode', { foo: 'bar' }, { delay: 3000 });    // named: needs a @Process('transcode') handler
```

Options: `priority` (1 = highest), `delay`, `attempts`, `repeat` (cron `RepeatOpts`), `backoff`, `lifo`, `timeout`, `jobId`, `removeOnComplete`, `removeOnFail`, `stackTraceLimit`.

With named jobs, every name added to a queue needs a processor, or the queue reports a missing processor.

## Consumers

```typescript
@Processor('audio')
export class AudioConsumer {
  @Process('transcode')
  async transcode(job: Job<unknown>) {
    await job.progress(50);
    return {};
  }
}
```

- Consumers must be providers. Request-scoped: `@Processor({ name: 'audio', scope: Scope.REQUEST })` + `@Inject(JOB_REF)`.
- Several consumers on one queue: `@Process({ concurrency: 1 })` doesn't take effect; minimum concurrency = number of consumers.
- Sandboxed: `registerQueue({ name: 'audio', processors: [join(import.meta.dirname, 'processor.js')] })` (no DI).

## Events

Declared inside the `@Processor()` class:
- Local: `@OnQueueError`, `@OnQueueWaiting`, `@OnQueueActive`, `@OnQueueStalled`, `@OnQueueProgress`, `@OnQueueCompleted`, `@OnQueueFailed`, `@OnQueuePaused`, `@OnQueueResumed`, `@OnQueueCleaned`, `@OnQueueDrained`, `@OnQueueRemoved`.
- Global (events from other processes): the same with `@OnGlobalQueue…()`; handlers get a `jobId` instead of a `job` (fetch with `queue.getJob(jobId)`).
- Generic: `@OnQueueEvent(BullQueueEvents.COMPLETED)` / `BullQueueGlobalEvents`.

## Migration map to BullMQ

| Bull (`@nestjs/bull`) | BullMQ (`@nestjs/bullmq`) |
| --- | --- |
| `redis: {...}` | `connection: {...}` |
| `queue.add(data)` / `add(name, data)` | `queue.add(name, data)` (name required) |
| `@Process('name')` methods | `class X extends WorkerHost { process(job) { switch (job.name) … } }` |
| `job.progress(n)` | `job.updateProgress(n)` |
| `repeat` option | `queue.upsertJobScheduler()` |
| `timeout` option | handle timeouts in the processor (e.g. AbortSignal) |
| `@OnQueueActive()` etc. in the processor | `@OnWorkerEvent('active')` in the processor; `@QueueEventsListener` + `@OnQueueEvent` for queue-wide events |
| `priority` 1 = highest | `priority` 0 = none, then lower = higher |

Drain the Bull queues (or run both workers side by side) before switching producers.
