---
name: nestjs-resilience
description: Hardens NestJS 12 against slow or failing dependencies with the first-party @nestjs/resilience package — ResilienceModule.forRoot defaults and named presets per dependency, entrypoint decorators @Resilience(preset), @Timeout, @Retry (safe methods only unless idempotent: true), @CircuitBreaker, @Bulkhead, @Fallback and @Signal for cooperative cancellation, outbound rate limits, ResilienceService.preset()/create() policy objects inside services and jobs, shared breakers, 504/503 error mapping with Retry-After on every transport, events, combining with @Idempotent, and testing with fake timers and breaker.trip(). Use when adding timeouts, retries with backoff, circuit breakers, fallbacks, bulkheads or concurrency caps around calls to external systems, or when retries pile up, requests hang or a dependency outage takes the app down. Not for the HTTP client's own per-request retries (nestjs-http-client), idempotency keys (nestjs-idempotency) or rate limiting your own API (nestjs-security-hardening).
compatibility: NestJS 12.x; @nestjs/resilience; optional @nestjs/idempotency
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS resilience (@nestjs/resilience)

Prefer `@nestjs/resilience` over hand-rolled `Promise.race` timeouts, retry loops or `opossum` wiring when the package is installed or acceptable.

```bash
npm i @nestjs/resilience
```

## Register once, one preset per dependency

```typescript
@Module({
  imports: [
    IdempotencyModule.forRoot({}),          // if used: BEFORE ResilienceModule (first global interceptor runs outermost)
    ResilienceModule.forRoot({
      defaults: { timeout: '5s', retry: { attempts: 3, backoff: { delay: '200ms', maxDelay: '2s' } } },   // fill fields, never turn stages on
      presets: {
        carrier: { timeout: '2s', retry: { attempts: 2 }, circuitBreaker: { failureRateThreshold: 50, minimumCalls: 10, openDuration: '30s' } },
      },
    }),
  ],
})
export class AppModule {}
```

A preset's breaker/bulkhead/outbound rate limit is **shared by name** across every route, handler and service policy using it. Invalid presets or durations fail at bootstrap.

## Entrypoints (controllers, resolvers, message handlers, gateways)

```typescript
@Get('quotes')
@Resilience('carrier')
@Timeout('1.5s')                                                       // per-stage override of the preset
@Fallback('flatRateQuotes', { handleIf: (e) => e instanceof CircuitOpenError })
getQuotes(@Query('orderId') orderId: string, @Signal() signal: AbortSignal) {
  return this.shipping.getQuotes(orderId, signal);                     // pass the signal down to fetch/HTTP client
}
flatRateQuotes() { return this.shipping.flatRateQuotes(); }           // cheap; never calls the failing dependency

@Post('shipments')
@Idempotent()                                                         // dedupes client retries (nestjs-idempotency)
@Resilience('carrier')
@Retry({ idempotent: true })                                          // allow server-side re-runs: carrier dedupes by reference
createShipment(@Body('orderId') orderId: string, @Signal() signal: AbortSignal) { … }

@Get('export') @Bulkhead({ maxConcurrent: 2, maxQueue: 3, queueTimeout: '10s' })
export() { return this.orders.exportCsv(); }
```

- Timeouts are **per attempt**; worst case ≈ attempts × timeout + backoff — keep it under client and load-balancer timeouts.
- Retries only re-run safe operations (GET/HEAD/OPTIONS, GraphQL queries). On message/event/WS handlers only a handler-level `@Retry()` applies. Guards and middleware run once; pipes, inner interceptors and the handler re-run.
- Client errors (4xx `HttpException`s) are not failures: not retried, not counted by breakers, not replaced by fallbacks.
- Responses: timeout → **504** `TIMEOUT`; open breaker → **503** `CIRCUIT_OPEN` + `Retry-After`; full bulkhead → 503 `BULKHEAD_FULL`; outbound limit → 503 `RATE_LIMITED`. RPC/WS get `RpcException`/`WsException` payloads; GraphQL gets `extensions.code/httpStatus/retryAfter`.
- Code that can't take the signal as a parameter can inject `ResilienceContext` (`signal`, `attempt`).
- Hybrid apps: `connectMicroservice(opts, { inheritAppConfig: true })`.

## Inside services and jobs: policy objects

Decorators on provider methods do nothing (bootstrap warns). Use a policy:

```typescript
private readonly carrier = this.resilience.preset('carrier');         // create once; shares the route's breaker

const quotes = await this.carrier.execute(({ signal }) => this.client.getQuotes(order, signal), { source: 'RepricingService' });
// catch CircuitOpenError → stop the batch instead of waiting on every item
```

Policy retries **always** apply (no HTTP method to check): only wrap repeatable calls. Ad-hoc: `resilience.create(options, name)`.

## Gotchas

- Retry at **one** layer: turn off retries in the HTTP client/SDK underneath (`retry: false` in `@nestjs/http-client`).
- Every breaker needs a timeout (hanging calls are never counted).
- State is per process: each instance has its own breakers, bulkheads and rate limits.
- Tune `minimumCalls`, `openDuration`, `recordIf` per dependency.
- Register an idempotency store in production when pairing with `@Idempotent()`.

## Observability

Subscribe to `ResilienceEvents.events$` (`retry`, `timeout`, `circuit-open/half-open/closed`, `circuit-rejected`, `bulkhead-rejected`, `rate-limited`, `fallback`) or diagnostics channels `nestjs:resilience:<type>`; log/alert on breaker transitions and bulkhead rejections. Inspect/force breakers with `resilience.circuitBreaker('carrier')` (`state`, `stats`, `trip()`, `reset()`).

## Testing

```typescript
vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });     // keep real I/O for supertest
carrier.getQuotes.mockImplementation((_o, signal) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(signal.reason))));
await vi.waitFor(() => expect(carrier.getQuotes).toHaveBeenCalled());
await vi.advanceTimersByTimeAsync(5_000);                                   // → 504, signal aborted, 2 calls
app.get(ResilienceService).circuitBreaker('carrier').trip();               // test open state directly
```

Override options with `overrideProvider(RESILIENCE_MODULE_OPTIONS)`. Each test app starts with fresh breaker state.

## Workflow

- [ ] 1. Install; one preset per external dependency with timeout + breaker (+ retry for safe calls).
- [ ] 2. Decorate entrypoints; pass `@Signal()` through every I/O call; add cheap fallbacks where degraded answers exist.
- [ ] 3. Mark only truly repeatable unsafe routes `idempotent: true`, combined with `@Idempotent()`.
- [ ] 4. Use policy objects in services/jobs; remove nested retries.
- [ ] 5. Event logging/alerts; fake-timer tests. Build, lint, run tests, start the app.

## Reference files

- `references/resilience-reference.md`: decorator options and defaults, module options, preset fields, outbound rate limit, events and errors tables, transport payloads. Read when tuning options.

Sources: [Resilience](https://docs.nestjs.com/reliability/resilience)
