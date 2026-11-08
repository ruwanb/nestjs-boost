---
name: nestjs-logging
description: Sets up logging in NestJS 12 — the built-in Logger/ConsoleLogger, JSON logs for production, v12 structured log params (logger.log('msg', { userId })) and flattenParams, log levels, custom or extended loggers that use DI (bufferLogs + app.useLogger(app.get(...))), request/correlation IDs and per-request context with AsyncLocalStorage (custom store or nestjs-cls), and plugging in Pino/Winston. Use when the user wants JSON or structured logs, a log aggregator format, a request ID on every log line, a custom/prefixed logger including bootstrap logs, quieter production logs, or per-request user/tenant context without passing it through every method. Not for traces/APM/error monitoring (nestjs-observability).
compatibility: NestJS 12.x
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-04"
---

# NestJS logging and request context

## Application logging: always the Nest Logger

```typescript
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);   // context = class name

  capture(order: Order) {
    this.logger.log('Payment captured', { orderId: order.id, amount: order.total });   // v12 structured params
  }
}
```

- **Structured params (v12, on by default):** plain objects passed **after** the message are attached to the same entry. In text mode they're appended inline; in JSON mode they go under `params`, or at the root with `flattenParams: true`. Several objects are merged. Don't interpolate data into the message string.
- Arrays, primitives, class instances and `null` are not treated as params, and a trailing **string** is treated as the context. Pass IDs inside an object.
- Never use `console.log`: it bypasses levels, JSON mode and any custom logger.
- `logger.error(message, stack?)`: pass `err.stack` for exceptions.

## Production: JSON, one object per line

```typescript
// main.ts
const isProd = process.env.NODE_ENV === 'production';
const app = await NestFactory.create(AppModule, {
  logger: isProd
    ? new ConsoleLogger({ json: true, flattenParams: true, logLevels: ['log', 'warn', 'error', 'fatal'] })
    : undefined,                                     // default colored text in development
});
```

- JSON fields: `level`, `pid`, `timestamp` (epoch ms), `message`, `context`, `stack`, `params`. With `json: true`, colors are off and `compact` is on, so each entry is valid single-line JSON.
- Use `flattenParams: true` when the aggregator indexes top-level fields only. A param whose key collides with a record key (`message`, `level`) is dropped.
- Log to stdout and let the platform (Docker, Kubernetes, ECS) ship the logs; no file rotation in the app.

## Custom logger that uses DI and also captures bootstrap logs

```typescript
@Injectable()
export class AppLogger extends ConsoleLogger {          // extend rather than reimplement; it can inject providers
  log(message: unknown, ...optionalParams: unknown[]) {
    super.log(`[api] ${String(message)}`, ...optionalParams);
  }
  // override error/warn/debug/verbose/fatal the same way
}

@Module({ providers: [AppLogger], exports: [AppLogger] })
export class LoggerModule {}

// main.ts
const app = await NestFactory.create(AppModule, { bufferLogs: true });   // hold startup logs…
app.useLogger(app.get(AppLogger));                                      // …until the DI-managed logger is attached
```

- `bufferLogs: true` + `app.useLogger(app.get(X))` is the documented way to route bootstrap logs through a DI-managed logger.
- If startup can call `process.exit()` or hang, buffered logs are never printed. When startup logs must always show, pass a logger **instance** as `logger` instead.
- For a per-consumer context, make the logger `@Injectable({ scope: Scope.TRANSIENT })` and call `setContext()` in each consumer's constructor.
- To change only the timestamp, override the protected `getTimestamp()` (text mode only). Keep calling `super` in overridden level methods.

## Request ID / per-request context (AsyncLocalStorage)

Keep providers singletons and carry request data in an `AsyncLocalStorage` store, opened by middleware:

```typescript
// request-context.ts
export interface RequestStore { requestId: string }
export const requestContext = new AsyncLocalStorage<RequestStore>();   // from 'node:async_hooks'

// app.module.ts
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply((req, res, next) => {
      const requestId = (req.headers['x-request-id'] as string) || randomUUID();
      res.setHeader('x-request-id', requestId);
      requestContext.run({ requestId }, () => next());     // everything downstream sees the store
    }).forRoutes('{*splat}');
  }
}

// logger: add the ID to every line written inside a request
export class RequestAwareLogger extends ConsoleLogger {
  log(message: unknown, ...rest: unknown[]) {
    const id = requestContext.getStore()?.requestId;
    super.log(message, ...(id ? [{ requestId: id }] : []), ...rest);   // structured param → JSON field
  }
  // same for warn/error/debug/verbose
}
```

- Prefer adding the ID as a **structured param** (`{ requestId }`) over prefixing message text, so it stays a field in JSON mode.
- Library alternative: `nestjs-cls`, with `ClsModule.forRoot({ middleware: { mount: true, setup: (cls, req) => cls.set('requestId', ...) } })` and `ClsService.get('requestId')` to read it. If `@nestjs/observe` is installed, its store and trace IDs already correlate logs (see nestjs-observability).
- The store also replaces request-scoped providers for the current user, tenant or locale.

## External loggers (Pino, Winston)

The built-in logger covers most needs. If a dedicated library is required, wrap it in a class implementing `LoggerService` (`log`, `error`, `warn`, `debug`, `verbose`, `fatal`), provide it from a module, and attach it with `bufferLogs` + `app.useLogger(app.get(...))` as above.

## Gotchas

- Text-mode options such as `timestamp` and `prefix` don't apply in JSON mode; JSON `timestamp` is always epoch milliseconds.
- `structuredParams: false` restores pre-v12 behaviour, where each object was logged as a separate entry.
- `logger: false` disables Nest's logging entirely, including errors. Prefer `logLevels` (levels cascade: listing `'log'` also enables the more severe levels), or `logger: filterLogLevels(process.env.LOG_LEVEL ?? '>=warn')`.
- The ALS middleware must wrap `next()` inside `run()`. Setting a store after `next()` returns is too late.

## Workflow

- [ ] 1. Replace `console.*` with `new Logger(Class.name)`, passing data as structured params.
- [ ] 2. Configure the app logger in `main.ts` (JSON in production; custom logger via `bufferLogs` + `useLogger(app.get())`).
- [ ] 3. For correlation, add the ALS middleware and a logger that reads the store.
- [ ] 4. Build, run the tests, then start the built app (with `NODE_ENV=production` for JSON) and check real output lines, including a request that logs from a service.

Sources: [Logger](https://docs.nestjs.com/application/logger) · [Async local storage](https://docs.nestjs.com/recipes/async-local-storage)
