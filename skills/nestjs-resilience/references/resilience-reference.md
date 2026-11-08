# @nestjs/resilience reference

## Contents
- Module options
- Decorators
- Presets and resolution order
- ResilienceService
- Events
- Errors and transport payloads

## Module options

`ResilienceModule.forRoot()` / `forRootAsync()` (factory, `ResilienceOptionsFactory` class, or existing provider). Token: `RESILIENCE_MODULE_OPTIONS`. Durations: ms or `'200ms'`, `'2s'`, `'15m'`.

| Option | Default | Notes |
| --- | --- | --- |
| `defaults` | none | field defaults for `retry`, `timeout`, `circuitBreaker`, `bulkhead`; never turn a stage on |
| `presets` | none | named sets: `retry`, `timeout`, `circuitBreaker`, `bulkhead`, `outboundRateLimit`, `fallback` |
| `mapErrors` | `true` | map resilience errors from any handler to transport errors |
| `isGlobal` | `true` | import once in the root module |

## Decorators

Handler or class level (except `@Signal()`).

| Decorator | Options (default) |
| --- | --- |
| `@Retry(opts \| n \| false)` | `attempts` (3 incl. first; `Infinity` until signal aborts), `backoff`, `retryIf(error, attempt)` (all but client errors), `idempotent` |
| backoff | `delay` (`'200ms'`), `factor` (2), `maxDelay` (`'30s'`), `jitter` `'full' \| 'equal' \| 'none'` (`'full'`; `'none'` when factor is 1), or a function → duration |
| `@Timeout(duration?)` | per-attempt budget; bare → preset/class, then `defaults.timeout` |
| `@CircuitBreaker(opts \| name)` | `name`, `failureRateThreshold` (50 %), `minimumCalls` (10), `slidingWindow` (`{ type: 'count' \| 'time', size }`, last 20 calls), `openDuration` (`'30s'`), `halfOpenMaxCalls` (1), `recordIf(error)` |
| `@Bulkhead(opts \| name)` | `name`, `maxConcurrent` (10), `maxQueue` (0), `queueTimeout` (none) |
| `@Fallback(methodOrFn, { handleIf })` | called with `(error, ExecutionContext)`; returns value, Promise or Observable |
| `@Resilience(preset)` | applies a preset stage by stage |
| `@Signal()` | current attempt's `AbortSignal` |

Preset `outboundRateLimit`: `limit` per `interval`, `maxWait` (0 = reject immediately).

## Presets and resolution order

Per stage: handler decorator → class decorator → preset → `defaults`. A handler `@Retry()` merges field by field into the preset's retry. Breakers: retry wraps the breaker, so rejections are not retried. Half-open state is evaluated on the next call against `Date` (no timers).

## ResilienceService

`preset(name)`, `create(options, name)`, `circuitBreaker(name)` (`state`, `stats`, `trip()`, `reset()`), `bulkhead(name)`, `circuitBreakers()`, `bulkheads()`. Policy `execute(fn({ signal, attempt }), { source })`. Standalone policies (`new RetryPolicy()`, etc.) also exist for code outside Nest.

## Events

`ResilienceEvents.events$` and channel `nestjs:resilience:<type>`; payloads have `type`, `policy`, `source?`.

| Type | Fields |
| --- | --- |
| `retry` | `attempt`, `delayMs`, `error` |
| `timeout` | `timeoutMs` |
| `circuit-open` / `circuit-half-open` / `circuit-closed` | `from`, `to` (`closed`, `open`, `half-open`) |
| `circuit-rejected` | `retryAfterMs` |
| `bulkhead-rejected` | `reason` (`full`, `queue-timeout`), `active`, `queued` |
| `rate-limited` | `retryAfterMs` |
| `fallback` | `error` |

## Errors and transport payloads

All extend `ResilienceError` (`code`, `policy`):

| Error | Code | HTTP | Client message |
| --- | --- | --- | --- |
| `ResilienceTimeoutError` (`timeoutMs`) | `TIMEOUT` | 504 | The operation timed out |
| `CircuitOpenError` (`retryAfterMs`) | `CIRCUIT_OPEN` | 503 + Retry-After | Service temporarily unavailable |
| `BulkheadFullError` (`reason`) | `BULKHEAD_FULL` | 503 | Server is at capacity |
| `OutboundRateLimitError` (`retryAfterMs`) | `RATE_LIMITED` | 503 + Retry-After | Rate limit of a dependency exceeded |

- Microservices/WebSockets: `RpcException`/`WsException` with `{ status: 'error', code, statusCode, message, retryAfter? }`.
- GraphQL: field error `extensions: { code, httpStatus, retryAfter }` (not `extensions.http`, which would affect the whole response).
- Why 504 not 408, and 503 not 429: 408/429 blame the client; these are server/dependency conditions.
