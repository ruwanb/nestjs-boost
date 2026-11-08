---
name: nestjs-security-hardening
description: Hardens NestJS 12 HTTP apps — built-in security headers (app.useSecurityHeaders(), Helmet-8 defaults, no extra package), built-in CSRF protection (app.enableCsrfProtection(), Fetch-Metadata based), CORS (enableCors with origins, credentials, methods), rate limiting with @nestjs/throttler (global ThrottlerGuard, @Throttle/@SkipThrottle, proxies/trustProxy, storages), and encryption/password hashing (node:crypto, PasswordHasher, argon2/bcrypt). Use when asked for security headers, CORS for a frontend, CSRF protection for cookie sessions, rate limiting or brute-force protection, hashing or encrypting data, or when the rate limiter sees one IP for everyone behind a proxy. Not for sign-in/sessions/JWT (nestjs-authentication, nestjs-passport-auth) or permissions (nestjs-authorization).
compatibility: NestJS 12.1+ for useSecurityHeaders/enableCsrfProtection; @nestjs/throttler for rate limiting
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-04"
---

# NestJS security hardening

## Security headers: built in since v12.1

```typescript
// main.ts — call right after create(), before init()/listen()
const app = await NestFactory.create(AppModule);
app.useSecurityHeaders();            // Helmet 8 defaults on Express, Fastify and Node adapter; removes X-Powered-By
```

- Prefer this over adding `helmet` / `@fastify/helmet`. No dependency, the same behaviour on every adapter, and the headers are also set on 404s, errors, CSRF rejections and SSE.
- Configure per header: `app.useSecurityHeaders({ xFrameOptions: false, strictTransportSecurity: { maxAge: 63072000, preload: true }, contentSecurityPolicy: { directives: { ... } } })`. Unknown options throw at startup, and Helmet's legacy names (`hsts`) are rejected with a hint.
- Calling it after `init()`/`listen()`, or twice, throws. Middleware registered with `app.use()` *before* the call runs first, and responses it sends itself lack the headers.
- Override a header on one route with `@Header()`.
- e2e tests don't run `main.ts`: apply the same call in the test setup (see nestjs-testing).

## CORS

```typescript
app.enableCors({
  origin: ['https://app.example.com'],      // exact allowlist; never '*' together with credentials
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
});
```

- Express's `cors` and Fastify's `@fastify/cors` have different default methods: Fastify allows only `GET,HEAD,POST`, so cross-origin `PUT/PATCH/DELETE` fail preflight unless `methods` is set. Always set `methods` explicitly.
- `origin` also accepts a function, and the whole config can be computed per request. `NestFactory.create(AppModule, { cors: {...} })` is equivalent.

## CSRF: built in since v12.1

CSRF abuses credentials the browser attaches automatically (cookies), so enable it when browser sessions authenticate with cookies.

```typescript
app.enableCsrfProtection({
  trustedOrigins: ['https://admin.example.com'],
  exclude: [{ path: 'webhooks/stripe', method: RequestMethod.POST }],   // server-to-server callbacks
});
```

It rejects state-changing requests that the browser reports as cross-origin (`Sec-Fetch-Site`, falling back to `Origin` vs `Host`) with a 403. No tokens, cookies or client changes are needed. It runs before routing, so controller-scoped filters and guards don't see rejected requests. Call it before `init()`/`listen()`. WebSocket upgrade requests are not checked: gateways that authenticate with cookies must validate the handshake `Origin` themselves. Don't add `csrf-csrf`/`@fastify/csrf-protection` on v12.1+ unless you need token-based CSRF.

## Rate limiting

```bash
npm i @nestjs/throttler
```

```typescript
@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: minutes(1), limit: 10 }] })],   // ttl in milliseconds
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

@Throttle({ default: { limit: 3, ttl: minutes(1) } })   // stricter per route/class
@Post('login') login() {}

@SkipThrottle()                                          // e.g. health checks; @SkipThrottle({ default: false }) re-enables inside a skipped class
@Get('health') health() {}
```

- `ttl` is in **milliseconds** (use the `seconds`/`minutes`/`hours` helpers). Several named throttlers can coexist (`{ name: 'short', ... }, { name: 'long', ... }`); `@Throttle` and `@SkipThrottle` take objects keyed by throttler name.
- **Behind a proxy**, every client shares the proxy's IP unless you trust the proxy:
    - Express: `app.set('trust proxy', 'loopback')`.
    - Fastify: `new FastifyAdapter({ trustProxy: 'loopback' })`.
    - Node adapter: `new NodeAdapter({ trustProxy: 'loopback' })`.

  With Fastify v5.12.1+ (installed by platform-fastify v12) and the Node adapter, a **number** passed as `trustProxy` trusts no proxy at all. Use an address/CIDR list.
- Multiple instances need shared storage (`storage:` implementing `ThrottlerStorage`, e.g. the community Redis storage). The default is in-memory per process.
- WebSockets and GraphQL need a customized guard; read `references/throttler-advanced.md`.

## Hashing and encryption

- **Passwords:** if the project uses `@nestjs/authentication`, inject its `PasswordHasher` (scrypt at OWASP parameters, constant-time `verify()`, `needsRehash()`). Otherwise, don't import `AuthenticationModule` just to hash: it also registers a global guard that requires sign-in on every route. Use `node:crypto` scrypt with a random salt per password and `timingSafeEqual`, or the `argon2`/`bcrypt` packages (bcrypt reads only the first 72 bytes). Never use plain digests (sha256/md5).
- **Reversible encryption:** `node:crypto` (the docs' example: `createCipheriv('aes-256-ctr', key, iv)` with a 32-byte key derived via `scrypt` and a random 16-byte IV per message). Keys come from config, never from code.

## Workflow

- [ ] 1. In `main.ts`, right after `create()`: `useSecurityHeaders()`, `enableCors({...})`, and `enableCsrfProtection()` if cookies authenticate.
- [ ] 2. Rate limiting: `ThrottlerModule` + global `ThrottlerGuard`; tighten `login`/`password-reset` with `@Throttle`; skip health checks.
- [ ] 3. Mirror the `main.ts` security setup in e2e tests (shared `configureApp(app)`).
- [ ] 4. Verify with real requests against the built app: the headers present, a preflight from the allowed origin passes, other origins aren't echoed, and the N+1th request returns 429.

## Reference files

- `references/throttler-advanced.md`: named throttlers, `getTracker`/`generateKey` overrides, `X-Forwarded-For` handling, WebSockets and GraphQL guards, async configuration, storages. Read for anything beyond one global limit plus per-route overrides.

Sources: [Security headers](https://docs.nestjs.com/security/helmet) · [CORS](https://docs.nestjs.com/security/cors) · [CSRF protection](https://docs.nestjs.com/security/csrf) · [Rate limiting](https://docs.nestjs.com/security/rate-limiting) · [Encryption and hashing](https://docs.nestjs.com/security/encryption-and-hashing)
