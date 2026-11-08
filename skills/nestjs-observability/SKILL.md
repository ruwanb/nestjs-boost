---
name: nestjs-observability
description: Instruments NestJS 12 applications for production observability — the official @nestjs/observe SDK (createObserveModule, ObserveModule.forRoot/forRootAsync, the instrument option of NestFactory, npx @nestjs/observe link), automatic tracing of controllers, providers, guards, queues, database drivers, outbound HTTP and LLM calls, TracerService spans, captured errors, request-scoped attributes and custom metrics, trace propagation over HTTP, gRPC, microservices, GraphQL and BullMQ, users, tags, sampling, redaction and log correlation, @Objective SLOs, production rules, the Observe MCP server; and OpenTelemetry (zero-code auto-instrumentation, NodeSDK, OTLP export, W3C traceparent) and choosing an APM. Use when adding tracing, APM, error monitoring, metrics or SLOs, propagating trace ids between services, connecting OpenTelemetry/Jaeger/Tempo, or diagnosing slow requests in production. Not for application logging setup (nestjs-logging) or health endpoints (nestjs-health-checks).
compatibility: NestJS 12.x (@nestjs/core ≥11.1.4 for the instrument option); @nestjs/observe; optional @opentelemetry/* packages
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS observability

## Choose

| Situation | Use |
| --- | --- |
| Nest services, want traces in Nest's vocabulary (`OrdersService.create`) with no collector to run | `@nestjs/observe` (hosted; free tier) |
| Mixed-language system or vendor-neutral standard | OpenTelemetry (optionally beside Observe with `openTelemetry: true`) |
| Frontend + backend error tracking first | Sentry |
| One platform for many languages and infrastructure | Datadog / New Relic |
| Data must stay on your infrastructure | Elastic APM or OTel → self-hosted backend |

Detect what the project already uses before adding another agent. Read `references/apm-and-otel.md` for the OpenTelemetry setups.

## @nestjs/observe in three edits

```bash
npx @nestjs/observe link        # writes OBSERVE_APP_KEY/SECRET to .env, installs and wires the SDK (or do it by hand: npm i @nestjs/observe)
```

```typescript
// app.module.ts
export const { ObserveModule, ObserveInstrument } = createObserveModule();   // options: sourceContext, traceIdGenerator, skipInstrumentation…

@Module({
  imports: [
    ObserveModule.forRootAsync({                                             // FIRST import (before BullModule) so shutdown flushes running jobs
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        enabled: config.get('NODE_ENV') === 'production',                    // sends nothing in dev/CI; TracerService still injectable
        appKey: config.get('OBSERVE_APP_KEY', ''),
        appSecret: config.get('OBSERVE_APP_SECRET', ''),
        serviceId: 'orders-api',
        http: { getUserId: (req) => req.user?.id ?? 'anonymous', ignore: ['/health'] },
      }),
    }),
  ],
})
export class AppModule {}

// main.ts
const app = await NestFactory.create(AppModule, { instrument: ObserveInstrument });
// with an adapter, options move to the THIRD argument: NestFactory.create(AppModule, new FastifyAdapter(), { instrument: ObserveInstrument })
app.enableShutdownHooks();                                                   // flush the last batch on SIGTERM
```

- Works for `createMicroservice()` and application contexts too. Requires `@nestjs/graphql` ≥13.4.4 for GraphQL.
- Keys are credentials: env/secret manager only. `serviceVersion` is inferred from CI/platform/`.git`; in Docker pass `OBSERVE_SERVICE_VERSION=$GIT_SHA`.
- Automatic: requests (HTTP, GraphQL, gRPC, microservices, WebSockets), BullMQ/Bull jobs with queue wait and attempts, cron runs, provider methods, `pg`/`mysql2`/`mssql`/`mongodb` queries, `fetch`/undici/`node:http` calls (not billed), model calls via `fetch` (tokens only), runtime metrics, errors with source context.
- Tests booting with real credentials: `shutdownFlushTimeout: 0`.

## Manual instrumentation (TracerService)

```typescript
constructor(private readonly tracer: TracerService) {}

findOne(id: string) {
  return this.tracer.createSpan('orders.findOne', async (span) => {     // name the work, not the caller
    span.addTags({ orderId: id });
    return this.repo.findOne(id);
  });
}
catch (e) { await this.tracer.captureError(e as Error, { accountId }); }   // handled errors
this.tracer.setAttribute('tenantId', tenant.id);                         // request-scoped context store
this.tracer.counter('orders.placed', { description: 'Orders placed' }).increment();   // also gauge(), summary()
```

`currentTraceId()` works anywhere; `activeSpan()` tags the enclosing span.

## Propagation

- HTTP: automatic via `x-request-id` in and out (`fetch`, undici, `@nestjs/http-client`; `node:http` clients on Node ≥22.12). Older Node + axios: add the header in an interceptor with `tracer.currentTraceId()`.
- Microservices (TCP, Redis, NATS…), gRPC, GraphQL and BullMQ jobs inherit the trace (both sides need the SDK). Hybrid apps: write `traceIdGenerator` for both HTTP and RPC contexts.
- W3C `traceparent` interop and OTLP export: `openTelemetry: true`, `otlp: { endpoint }` or `otlp: true` (reads `OTEL_*`).

## Shaping data

`tracesSampleRate` (number or predicate; errors and slow traces matter most), `http.capture` (extra headers/body for failed/slow requests), `redaction` (on by default; add `keys`, `patterns`), `forwardLogs`, `attachTraceIdToLogs` (default true, `ConsoleLogger` lines carry the trace id), `tags`, `setAttributes`, per-transport `ignore`, `outgoing: { database, http: { ignore, propagateTraceId }, llm }`, `spanCollapse`.

## Objectives, rules, agents

- `@Objective({ availability: 99.9, latency: { underMs: 300, target: 99 } })` on a handler creates an SLO (targets 90–99.999, ≤10 per handler, `windowDays`).
- Production rules (dashboard): bound calls per execution, e.g. "`POST /checkout` calls `PaymentsService.charge` exactly once", "at most N LLM calls".
- MCP server for coding agents: `claude mcp add observe --transport http https://observe-api.nestjs.com/mcp` (Cursor/VS Code: same URL in `mcp.json`); query failures, traces and releases from the agent.

## Workflow

- [ ] 1. Detect existing APM/OTel; choose per the table.
- [ ] 2. Observe: link or install; `createObserveModule()`; `ObserveModule` first in imports; `instrument` in `main.ts` (third arg with adapters); `enabled` by environment; shutdown hooks.
- [ ] 3. Add `getUserId`, ignore health checks, redaction keys; custom spans/metrics only where auto-instrumentation lacks business meaning.
- [ ] 4. Propagation across services; `openTelemetry: true` if other services use OTel.
- [ ] 5. Objectives for key routes; alerts. Build, lint, run tests, start the app (with `debug: true` once to confirm the SDK attached).

## Reference files

- `references/apm-and-otel.md`: OpenTelemetry zero-code and NodeSDK setups for ESM/CJS, what OTel records on Nest 12, OTLP export details, Observe option reference, and APM comparison notes. Read when using OpenTelemetry or tuning SDK options.

Sources: [Overview](https://docs.nestjs.com/observability/overview) · [SDK](https://docs.nestjs.com/observability/sdk) · [Manual instrumentation](https://docs.nestjs.com/observability/manual-instrumentation) · [Distributed tracing](https://docs.nestjs.com/observability/distributed-tracing) · [Error monitoring](https://docs.nestjs.com/observability/error-monitoring) · [Dashboard](https://docs.nestjs.com/observability/dashboard) · [Production rules](https://docs.nestjs.com/observability/production-rules) · [MCP server](https://docs.nestjs.com/observability/mcp-server) · [OpenTelemetry](https://docs.nestjs.com/observability/opentelemetry) · [Choosing an APM](https://docs.nestjs.com/observability/choosing-an-apm)
