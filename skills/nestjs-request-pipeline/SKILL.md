---
name: nestjs-request-pipeline
description: Builds and debugs the NestJS 12 HTTP request pipeline — controllers and routing, middleware, guards, interceptors, pipes, exception filters and custom decorators — including their execution order, global vs controller vs route binding, metadata decorators read with Reflector, machine-readable errorCode responses, and route conflict detection. Use when adding cross-cutting behaviour (auth checks, roles, public routes, response wrapping, timing, error formatting), when a guard/pipe/interceptor/filter isn't running or runs in the wrong order, when a route like /users/me is matched by /users/:id, or when designing controller routes. Not for validation DTOs/schemas (nestjs-validation-serialization), authentication strategies (nestjs-authentication, nestjs-passport-auth) or GraphQL/WebSocket/microservice enhancers.
compatibility: NestJS 12.x
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-04"
---

# NestJS request pipeline

## Which component for which job

| Job | Component | Why |
| --- | --- | --- |
| Raw request/response work before routing (logging, headers, body parsing) | Middleware | Runs before a handler is chosen; no `ExecutionContext` |
| Allow or deny a request (auth, roles, API keys) | Guard (`CanActivate`) | Knows the target handler and its metadata; runs before interceptors and pipes |
| Transform or validate one argument | Pipe (`PipeTransform`) | Runs per parameter, right before the handler |
| Wrap the handler (map the response, timing, caching, timeouts) | Interceptor (`NestInterceptor`) | Sees before *and* after the handler, as an Observable |
| Shape error responses | Exception filter (`@Catch`) | Runs only for uncaught exceptions |
| Pull a value into a handler parameter (`@CurrentUser()`) | `createParamDecorator` | Reads from `ExecutionContext` |
| Attach per-route metadata (`@Public()`, `@Roles()`) | `Reflector.createDecorator<T>()`, or `SetMetadata` for argument-less flags | Read in guards/interceptors with `Reflector` |

Scaffold with the CLI: `npx nest g guard auth/api-key`, `nest g interceptor`, `nest g filter`, `nest g pipe`, `nest g decorator`. In v12, `nest g decorator` generates the `Reflector.createDecorator()` form.

## Execution order

1. Middleware: `app.use()`-bound first, then module-bound, in binding order.
2. Guards: global → controller → route.
3. Interceptors, before the handler: global → controller → route.
4. Pipes: global → controller → route → parameter. With several parameters, the **last parameter is processed first**.
5. The handler.
6. Interceptors, after the handler: route → controller → global.
7. Exception filters: **route → controller → global**. The first filter that catches the exception handles it; it is not passed on.

Two exceptions to this order:
- Exceptions thrown in middleware reach **global filters only**.
- Exceptions you catch yourself never reach a filter.

([Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle))

## Binding globally: use APP_* providers

Default to registering global enhancers as providers in a module. This gives them DI, and they are active wherever the module is loaded, including in tests built from `AppModule`:

```typescript
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

@Module({
  providers: [
    { provide: APP_GUARD, useExisting: ApiKeyGuard }, ApiKeyGuard,   // useExisting lets tests overrideProvider(ApiKeyGuard)
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
```

`app.useGlobalGuards(new X())` in `main.ts` cannot inject dependencies. It does not apply to connected microservices in hybrid apps (guards, pipes), and for filters it does not apply to gateways or hybrid apps. Multiple global guards run in registration order.

## Pattern: guard with public routes (metadata + Reflector)

```typescript
// auth/public.decorator.ts — a flag with no arguments: SetMetadata + exported key
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// auth/api-key.guard.ts
import { createHash, timingSafeEqual } from 'node:crypto';
const digest = (value: string) => createHash('sha256').update(value).digest();   // equal length for timingSafeEqual

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest();
    const expected = this.config.get<string>('API_KEY');
    const given = req.headers['x-api-key'];
    if (!expected || typeof given !== 'string' || !timingSafeEqual(digest(given), digest(expected))) throw new UnauthorizedException();
    return true;
  }
}

// usage
@Public() @Get('health') health() { return { status: 'ok' }; }
```

- `getAllAndOverride` lets route metadata override controller metadata; `getAllAndMerge` combines arrays (e.g. roles).
- Fail closed: if the secret is not configured, deny.
- Compare secrets in constant time (`timingSafeEqual` over equal-length digests), never with `===`/`!==`, which leaks how many leading characters matched. Reject a header that isn't a single string.
- For decorators that take a value (e.g. `@Roles(['admin'])`), prefer the typed form `export const Roles = Reflector.createDecorator<string[]>()`, read with `this.reflector.get(Roles, context.getHandler())`.

## Pattern: consistent error responses with errorCode

Since v12, HTTP exceptions take a machine-readable `errorCode`, serialized into the default response body. Prefer this over a custom exception hierarchy:

```typescript
throw new BadRequestException('Order has no items', { errorCode: 'ORDER_EMPTY' });
// → { "message": "Order has no items", "error": "Bad Request", "statusCode": 400, "errorCode": "ORDER_EMPTY" }
```

When every response needs extra fields (path, timestamp), add one global catch-all filter that reads `exception.getResponse()`, keeps `errorCode`, and writes through `HttpAdapterHost`, so it works on every adapter. Read `references/filters-interceptors.md` for the full filter and for the non-HTTP-exception (500) branch.

## Routing gotchas

- **Route shadowing:** on Express (and the Node adapter), routes match in declaration order, so `@Get(':id')` declared before `@Get('me')` swallows `/me`. Pipes can't fix this, because routing happens first. Fix the order, and enable the v12 diagnostics in `main.ts` so it can't recur silently ([Controllers](https://docs.nestjs.com/controllers)):

  ```typescript
  const app = await NestFactory.create(AppModule, {
    routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },   // or 'error'; checked at app.init()/listen()
    routeResolutionStrategy: 'specificity',                        // literal segments before :params before wildcards
  });
  ```

  Fastify already ranks routes by specificity, so there only `duplicate` matters.
- **Wildcards** use named parameters: `'cats/*splat'` matches `/cats/x` but **not** `/cats`; `'cats/{*splat}'` matches both. For all routes including `/`, use `forRoutes('{*splat}')`. Bare `*` is deprecated.
- **`@Res()`** switches the route to library-specific mode: interceptors can't map the response, and you must send it yourself. Use `@Res({ passthrough: true })` to only set cookies or headers.
- **Fastify:** filters send with `response.send()`, not `.json()`. Middleware signatures differ from Express; the Node adapter uses the Express signature.
- **Global prefix:** `app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] })`.
- **Default status:** POST returns 201, everything else 200. Change it with `@HttpCode(204)`.

## Middleware binding

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).exclude({ path: 'health', method: RequestMethod.GET }).forRoutes('{*splat}');
  }
}
```

Express registers the `json`/`urlencoded` body parsers by default. Set `bodyParser: false` in `NestFactory.create()` before registering your own.

## Workflow

- [ ] 1. Pick the component from the table, and scaffold it with `nest g`.
- [ ] 2. Decide the binding scope (route, controller or global). Global means an `APP_*` provider.
- [ ] 3. For per-route behaviour, add a metadata decorator and read it in the guard or interceptor with `Reflector`.
- [ ] 4. Update e2e tests: global guards affect every existing test. Override them in tests with `overrideProvider` (nestjs-testing).
- [ ] 5. Build, lint, run unit and e2e tests, and start the app once if you changed `main.ts`.

## Reference files

- `references/filters-interceptors.md`: a catch-all exception filter with `HttpAdapterHost`, the `BaseExceptionFilter` extension, interceptor recipes (response mapping, timing, timeout, cache override), and `ExecutionContext` across HTTP/RPC/WS. Read when writing a filter or interceptor.
- `references/pipes-decorators.md`: built-in `Parse*Pipe` options, custom pipes, `createParamDecorator` with pipes, `applyDecorators` composition, and the `ArgumentMetadata` generic in v12. Read when writing a pipe or a decorator.

Sources: [Controllers](https://docs.nestjs.com/controllers) · [Middleware](https://docs.nestjs.com/middleware) · [Guards](https://docs.nestjs.com/guards) · [Interceptors](https://docs.nestjs.com/interceptors) · [Pipes](https://docs.nestjs.com/pipes) · [Exception filters](https://docs.nestjs.com/exception-filters) · [Custom decorators](https://docs.nestjs.com/custom-decorators) · [Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle)
