# Exception filters and interceptors

Sources: [Exception filters](https://docs.nestjs.com/exception-filters) · [Interceptors](https://docs.nestjs.com/interceptors) · [Execution context](https://docs.nestjs.com/fundamentals/execution-context) · [HTTP adapter](https://docs.nestjs.com/faq/http-adapter)

## Contents
- Throwing errors
- Catch-all filter with a standard error shape (default recipe)
- Extending the built-in filter
- Filter rules
- Interceptor recipes
- ExecutionContext across transports

## Throwing errors

```typescript
throw new NotFoundException(`Order ${id} not found`);
throw new BadRequestException('Password is too weak', { errorCode: 'WEAK_PASSWORD' });   // v12: errorCode in body
throw new ConflictException('Email taken', { cause: err, errorCode: 'EMAIL_TAKEN' });    // cause is logged, never serialized
throw new HttpException('Forbidden', HttpStatus.FORBIDDEN, { errorCode: 'ACCOUNT_SUSPENDED' });
```

The built-in filter does not log `HttpException`s: they are normal flow. Log them yourself in a custom filter if you need to.

## Catch-all filter with a standard error shape (default recipe)

Platform-agnostic (works on Express, Fastify and the Node adapter) because it replies through `HttpAdapterHost`:

```typescript
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;   // resolve here, not in the constructor
    const ctx = host.switchToHttp();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const res = isHttp ? exception.getResponse() : undefined;
    const body = typeof res === 'object' && res !== null ? (res as Record<string, unknown>) : { message: res };

    if (!isHttp) this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));

    httpAdapter.reply(ctx.getResponse(), {
      statusCode: status,
      message: isHttp ? body.message : 'Internal server error',   // never leak internals on 500
      errorCode: body.errorCode ?? defaultCode(status),            // keep v12 errorCode when set
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
      timestamp: new Date().toISOString(),
    }, status);
  }
}
```

`defaultCode(status)` is a small project-owned map (e.g. `404 → 'NOT_FOUND'`), so every error carries a code. Register the filter with `{ provide: APP_FILTER, useClass: AllExceptionsFilter }`. Unknown routes (404) and body-parser errors (400) also pass through it.

## Extending the built-in filter

```typescript
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // custom handling for some cases, then:
    super.catch(exception, host);
  }
}
```

- Global use: `app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost).httpAdapter))`, or the `APP_FILTER` provider.
- Method- and controller-scoped filters extending `BaseExceptionFilter` must not be created with `new`; pass the class: `@UseFilters(MyFilter)`.

## Filter rules

- Filters resolve route → controller → global. The first one whose `@Catch()` matches handles the exception; it is not passed on (use inheritance to share logic).
- Registering a catch-all together with a typed filter (e.g. `@Catch(HttpException)`): declare the catch-all **first**, so the typed one still handles its type.
- Exceptions from middleware reach global filters only.
- `useGlobalFilters()` doesn't cover gateways or hybrid apps.
- On Fastify, use `response.send()` and Fastify types if you touch the response directly.

## Interceptor recipes

```typescript
@Injectable()
export class TimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const res = context.switchToHttp().getResponse();
    return next.handle().pipe(tap(() => res.setHeader('X-Response-Time', `${Date.now() - start}ms`)));
  }
}

// Wrap every response
next.handle().pipe(map((data) => ({ data })));

// Map errors
next.handle().pipe(catchError((err) => throwError(() => new BadGatewayException())));

// Timeout
next.handle().pipe(timeout(5000), catchError((err) => err instanceof TimeoutError ? throwError(() => new RequestTimeoutException()) : throwError(() => err)));

// Skip the handler (e.g. cache hit)
if (cached) return of(cached);
```

- Response mapping does not run for handlers that use `@Res()` without `passthrough: true`.
- Interceptors can inject dependencies. Register globally with `APP_INTERCEPTOR`.

## ExecutionContext across transports

`context.getType()` returns `'http' | 'rpc' | 'ws'` (GraphQL: `GqlExecutionContext.create(context).getType()` returns `'graphql'`). Branch on it in enhancers shared across transports, and use `switchToHttp()`, `switchToRpc()` or `switchToWs()` accordingly. `context.getHandler()` and `context.getClass()` are the targets for `Reflector` lookups.
