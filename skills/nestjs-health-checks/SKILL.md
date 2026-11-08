---
name: nestjs-health-checks
description: Adds liveness and readiness health checks to NestJS 12 with @nestjs/terminus — TerminusModule.forRoot options, HealthCheckService with @HealthCheck() controllers, built-in indicators (HTTP ping/response checks, TypeORM, Mongoose, Sequelize, MikroORM, Prisma, microservice, gRPC, memory heap/RSS, disk), custom indicators with HealthIndicatorService attempt()/up()/down()/degraded(), withTimeout() and cacheFor() on attempts, the shutting_down status and gracefulShutdownTimeoutMs for zero-downtime Kubernetes rollouts, and custom Terminus logging. Use when adding /health, /health/live or /health/ready endpoints, Kubernetes probes, dependency checks for databases or upstream APIs, or when pods are killed or kept in rotation wrongly. Not for metrics, tracing or alerting (nestjs-observability) or retries/circuit breakers (nestjs-resilience).
compatibility: NestJS 12.x; @nestjs/terminus; @nestjs/axios for HttpHealthIndicator
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS health checks (@nestjs/terminus)

```bash
npm i @nestjs/terminus
npm i @nestjs/axios axios        # only for HttpHealthIndicator
nest g module health && nest g controller health
```

## Liveness vs readiness

| Probe | Checks | Failing means |
| --- | --- | --- |
| Liveness `/health/live` | The process works (event loop answers; optionally heap/RSS limits) | Restart the container — so **no dependency checks** here |
| Readiness `/health/ready` | Dependencies it needs to serve (DB, required upstreams) | Stop routing traffic; also reports `shutting_down` during shutdown |

## Setup

```typescript
@Module({
  imports: [TerminusModule.forRoot({ gracefulShutdownTimeoutMs: 5000, errorLogStyle: 'json' }), HttpModule],
  controllers: [HealthController],
  providers: [CacheHealthIndicator],
})
export class HealthModule {}

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly cacheIndicator: CacheHealthIndicator,
  ) {}

  @Get('live') @HealthCheck()
  live() { return this.health.check([() => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024)]); }

  @Get('ready') @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database').withTimeout(1500).cacheFor(5000),
      () => this.cacheIndicator.isHealthy('cache'),
    ]);
  }
}
```

- Enable `app.enableShutdownHooks()` — required for the `shutting_down` status and the graceful delay.
- Make health routes public and unthrottled: `@Public()` (nestjs-authentication / request-pipeline), `@SkipThrottle()`, exclude from the global prefix/versioning if your probes expect `/health` (`setGlobalPrefix('api', { exclude: ['health/(.*)'] })` or `VERSION_NEUTRAL`).
- Response: `{ status: 'ok' | 'error' | 'degraded' | 'shutting_down', info, error, details }` (`HealthCheckResult`); failures return **503**.

## Built-in indicators

- HTTP: `http.pingCheck('docs', url)`, `http.responseCheck('svc', url, (res) => res.status === 204)`.
- Databases: `TypeOrmHealthIndicator`, `MongooseHealthIndicator`, `SequelizeHealthIndicator`, `MikroOrmHealthIndicator`, `PrismaHealthIndicator` (`pingCheck(key, …)`). Multiple TypeORM data sources: inject each and pass `{ connection }`.
- `MicroserviceHealthIndicator`, `GRPCHealthIndicator`.
- `memory.checkHeap(key, bytes)`, `memory.checkRSS(key, bytes)`, `disk.checkStorage(key, { path: '/', thresholdPercent: 0.9 })` or `{ threshold: bytes }`.
- Use `.withTimeout(ms)` (the `timeout` option is deprecated) and `.cacheFor(ms)` for expensive checks; cached results carry `cachedResponse: true`.

## Custom indicators

```typescript
@Injectable()
export class PaymentsApiHealthIndicator {
  constructor(private readonly indicators: HealthIndicatorService, private readonly http: HttpClient) {}
  isHealthy(key: string) {
    return this.indicators.check(key).attempt(async ({ signal }) => {        // up on resolve, down on throw
      const { data } = await this.http.get<{ version: string }>('/status', { signal, retry: false });
      return { version: data.version };                                       // appended to the result
    }).withTimeout(1000);
  }
}

@Injectable()
export class CacheHealthIndicator {
  constructor(private readonly indicators: HealthIndicatorService, private readonly cache: CacheService) {}
  async isHealthy(key: string) {
    const indicator = this.indicators.check(key);
    return (await this.cache.isConnected()) ? indicator.up() : indicator.degraded('serving without cache');   // degraded ≠ fail
  }
}
```

- Pass the `signal` to the operation so timeouts cancel it.
- With `up()/down()/degraded()`, return the state — a thrown error is treated as a bug (500 instead of 503); wrap risky code in try/catch and return `down()`.
- Any `down` → overall `error`; `degraded` only if none are down.

## Zero-downtime shutdown

`gracefulShutdownTimeoutMs` (applied on SIGTERM only): readiness answers 503 `shutting_down` while the app keeps serving for the delay — set it slightly longer than the readiness probe period, and keep the pod's termination grace period longer than delay + drain time.

## Logging

`TerminusModule.forRoot({ logger: TerminusLogger })` (a transient `ConsoleLogger` subclass), `logger: false` to silence, `errorLogStyle: 'pretty' | 'json'`.

## Workflow

- [ ] 1. Install; `HealthModule` with `TerminusModule.forRoot()`; shutdown hooks on.
- [ ] 2. Separate live and ready routes; public, unthrottled, outside prefix/versioning as probes require.
- [ ] 3. Add indicators for required dependencies with timeouts (and caching); degraded for optional ones.
- [ ] 4. E2E test: 200 when healthy, 503 when an indicator is overridden to fail.
- [ ] 5. Build, lint, run tests, start the app and curl both endpoints; wire the probes in the deployment manifest.

Sources: [Health checks (Terminus)](https://docs.nestjs.com/reliability/terminus)
