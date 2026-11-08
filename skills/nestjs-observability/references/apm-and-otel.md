# OpenTelemetry, Observe options and APM notes

## Contents
- OpenTelemetry zero-code setup
- OpenTelemetry NodeSDK in code
- What OpenTelemetry records on NestJS 12
- Custom OpenTelemetry spans
- Observe beside OpenTelemetry and OTLP export
- Observe configuration reference
- Using more than one tool

## OpenTelemetry zero-code setup

```bash
npm i @opentelemetry/api @opentelemetry/auto-instrumentations-node

# CommonJS build
OTEL_SERVICE_NAME=orders-api OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  node --require @opentelemetry/auto-instrumentations-node/register dist/main.js

# ES module build (nest new default on v12) — the loader hook is required
OTEL_SERVICE_NAME=orders-api OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  node --experimental-loader=@opentelemetry/instrumentation/hook.mjs \
  --import @opentelemetry/auto-instrumentations-node/register dist/main.js
```

Can't change the command? Put the flags in `NODE_OPTIONS`. Instrumentation must load before Nest and the patched libraries.

## OpenTelemetry NodeSDK in code

```bash
npm i @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http
```

```typescript
// src/instrumentation.ts
export const otelSdk = new NodeSDK({
  serviceName: 'orders-api',
  traceExporter: new OTLPTraceExporter(),            // OTEL_EXPORTER_OTLP_ENDPOINT, default http://localhost:4318
  instrumentations: [getNodeAutoInstrumentations()],
});
otelSdk.start();
```

Load it with `--require ./dist/instrumentation.js` (CJS) or `--experimental-loader=@opentelemetry/instrumentation/hook.mjs --import ./dist/instrumentation.js` (ESM). Importing it on the first line of `main.ts` only works for CommonJS builds. Call `otelSdk.shutdown()` after Nest shuts down (e.g. from `onApplicationShutdown()`).

## What OpenTelemetry records on NestJS 12

- Auto-instrumentations: incoming/outgoing HTTP (incl. `fetch`), Express, `pg`, `mysql2`, `mongodb`, Mongoose.
- `@opentelemetry/instrumentation-nestjs-core` emits `Create Nest App`, `<Controller>.<method>` and `<method>` spans — **but at the time of writing supports `@nestjs/core` < 12**, so on Nest 12 those spans are missing.
- Spans stop at the controller: services, repositories, guards, interceptors and pipes aren't traced automatically — add spans yourself.

## Custom OpenTelemetry spans

```typescript
const tracer = trace.getTracer('orders-api');
return tracer.startActiveSpan('PricingService.quote', async (span) => {
  try { span.setAttribute('cart.items', cart.items.length); return await this.calculate(cart); }
  catch (e) { span.recordException(e as Error); span.setStatus({ code: SpanStatusCode.ERROR }); throw e; }
  finally { span.end(); }
});
```

## Observe beside OpenTelemetry and OTLP export

```typescript
ObserveModule.forRoot({ /* … */ openTelemetry: true, otlp: { endpoint: 'http://localhost:4318' } });   // or otlp: true → OTEL_* env vars
```

- Incoming `traceparent` sets the trace id; outbound calls send `traceparent` (+ `x-request-id`), passing `tracestate` and sampling.
- An OTel SDK in the same process sets the trace; queue jobs and microservice messages stay in the request's trace in both tools (≥0.3.23).
- OTLP export (≥0.3.23) sends Observe's spans (requests as server spans, jobs as consumer spans, providers as internal, queries/calls as client spans) to any OTLP backend; paid plans export everything, Free exports what Observe keeps.
- Both hook DB drivers — tested with `pg`; verify other drivers in staging.

## Observe configuration reference

`createObserveModule({ … })`: `sourceContext` (`linesOfContext` 5, `maxFrames` 5, `sourceMaps` false, or `false`), `traceIdKey` (`'traceId'`), `traceIdGenerator` (adopts well-formed `x-request-id`, else UUIDv7), `attachTraceIdToLogs` (true), `skipInstrumentation`.

`ObserveModule.forRoot({ … })`:

| Option | Notes |
| --- | --- |
| `appKey`, `appSecret` | or `OBSERVE_APP_KEY`/`OBSERVE_APP_SECRET` (env read when options resolve) |
| `endpoint` | default `https://observe-api.nestjs.com` (or `OBSERVE_ENDPOINT`) |
| `enabled` | `false` = no recording, no network, no credentials needed |
| `serviceId`, `serviceVersion` | unique serviceId per instance helps the profiler; version inferred |
| `http`, `rpc`, `grpc`, `graphql`, `ws` | `tags`, `setAttributes`, `getUserId`, `ignore` per transport |
| `jobs` | `tags`, `setAttributes` for queue/cron jobs |
| `http.queryParamsObfuscateRegex`, `http.capture` (`headers`, `body.maxBytes` ≤16384, `slowerThanMs`) | |
| `outgoing` | `database`, `http` (`ignore`, `propagateTraceId`), `llm` (`hosts` for gateways) or `false` |
| `openTelemetry`, `otlp` | see above |
| `runtimeMetrics`, `runtimeMetricsInterval` | default true / 60000 ms; also the heartbeat for silence alerts |
| `forwardLogs`, `redaction` (`enabled`, `useDefaultPatterns`, `patterns`, `keys`, `replacement`) | logs streaming is a paid feature |
| `tracesSampleRate` | 1.0, or `(protocol, attributes) => boolean` |
| `maxTracesPerBatch`, `flushInterval` | 1000 / 5000 ms |
| `spanCollapse` | collapse >20 identical sibling spans, keep slowest 3 |
| `shutdownFlushTimeout` | default 2000 ms (0 in tests) |
| `debug` | SDK diagnostics |

Overhead: ~0.1 ms median per request, ~8 µs CPU per request + 1–2.5 µs per traced call.

## Using more than one tool

- Observe + OTel: `openTelemetry: true` (+ `otlp`) joins the shared traces.
- Observe + Datadog/New Relic: point `otlp` at the platform's OTLP endpoint.
- Observe + Sentry: Sentry on the frontend, Observe on the Nest backend.
