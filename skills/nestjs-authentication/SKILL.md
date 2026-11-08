---
name: nestjs-authentication
description: Adds sign-in to NestJS 12 with the first-party @nestjs/authentication package — global AuthenticationGuard with @Public(), credential providers (SessionCookieProvider, JwtBearerProvider, ApiKeyProvider) registered on AuthenticationRegistry, scrypt PasswordHasher, SignInService sessions in __Host- cookies, TokenService access and rotating refresh tokens, @CurrentUser/@Authenticate/AuthenticationContext, email verification, password reset, TOTP two-factor, magic links, OpenID Connect (Google, GitHub, Microsoft), session management, API keys, database stores and the production guard. Use when building sign-up/sign-in, sessions or JWTs, protecting routes, reading the current user, adding 2FA, social login, passwordless login or API keys, in a project that has or can add @nestjs/authentication. Not for role/permission checks (nestjs-authorization), the Passport recipe (nestjs-passport-auth) or CSRF/rate-limit setup in general (nestjs-security-hardening).
compatibility: NestJS 12.x (12.1+ for enableCsrfProtection); @nestjs/authentication; optional @nestjs/throttler, @nestjs/mail, @nestjs/drizzle or TypeORM for stores
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS authentication (@nestjs/authentication)

Detect first: if the project already uses `@nestjs/passport`, keep it and use nestjs-passport-auth unless the user asks to migrate. For new auth, prefer `@nestjs/authentication`: it ships sessions, hashing, tokens, 2FA, OIDC and API keys built on Node built-ins. Don't hand-roll bcrypt + `@nestjs/jwt` guards.

```bash
npm i @nestjs/authentication
```

## Core setup

```typescript
// auth/session-auth.provider.ts — a credential provider: request → user or null
@Injectable()
export class SessionAuth extends SessionCookieProvider<User> {
  constructor(private readonly users: UsersRepository, registry: AuthenticationRegistry) {
    super();
    registry.registerProvider(this);             // order 0; JwtAuth { order: 1 }, ApiKeyAuth { order: 2 }
  }
  validate(session: SessionRecord) { return this.users.findById(session.userId); }   // null ends the session
}

// app.module.ts — options are plain values; classes register themselves
AuthenticationModule.forRoot({ session: { absoluteTtl: '14d', idleTtl: '3d' } }),
```

- The module registers a **global guard: every route needs a user** (401 `missing_credentials`). Mark open routes/controllers with `@Public()` (health checks, sign-in, catalog).
- Lifetimes are ms or strings (`'15m'`, `'14d'`). Unlike `@nestjs/jwt`, numbers are **milliseconds**: `3600` is 3.6 s.
- Your user store stays yours: providers and handlers call your repository. Never return password hashes from it.
- Type the user once: `declare module '@nestjs/authentication' { interface AuthenticationTypes { user: User } }`.

## Sign-up and sign-in (password → session cookie)

```typescript
// credentials.service.ts
async verify(email: string, password: string) {
  const found = await this.users.findCredentials(email);
  const valid = await this.passwordHasher.verify(password, found?.passwordHash);   // dummy hash when unknown: no timing leak
  if (!valid || !found?.passwordHash) return null;
  if (this.passwordHasher.needsRehash(found.passwordHash))
    await this.users.updatePasswordHash(found.user.id, await this.passwordHasher.hash(password));
  return found.user;
}

// auth.controller.ts
@Public() @Controller('auth')
export class AuthController {
  @Post('sign-in') @HttpCode(200)
  async signIn(@Body() body: SignInDto) {
    const user = await this.credentials.verify(body.email, body.password);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    const { session } = await this.signInService.signIn(user.id, { method: 'password' });
    return { mfaRequired: session.mfa === 'pending' };
  }
}
```

`signIn()` sets the `__Host-sid` cookie (HttpOnly, Secure, SameSite=Lax; hash stored), replaces the previous session (fixation defence) and rejects cross-origin posts (login CSRF). `http://localhost` accepts Secure cookies in development.

## Reading the user and route options

- `@CurrentUser()` / `@CurrentUser('id')`, `@CurrentSession()` in handlers; `AuthenticationContext.requireUser()` in services (AsyncLocalStorage-backed singleton).
- `@Authenticate({ optional: true })` lets guests through with `null`; `{ verifiedEmail: true }` → 403 `email_unverified`; `{ mfa: true }` requires a verified second factor; `{ providers: [ApiKeyAuth] }` restricts providers.
- `globalGuard: false` makes routes open until `@UseGuards(AuthenticationGuard)`.

## Bearer tokens for mobile/API clients

`accessToken: { key: JWT_SECRET (≥32 bytes, or an ES256/RS256/EdDSA private key), issuer, audience, ttl: '15m' }`, a `JwtBearerProvider` subclass whose `validate({ sub })` loads the user, and `TokenService.issue(user.id, { method: 'password', claims: { amr: ['pwd'] } })` / `refresh(refreshToken)` behind `@Public()` routes. Refresh tokens rotate and reuse revokes the family. `refreshToken: false` issues access tokens only (declare `refreshTokens: false` in `AuthenticationTypes` too).

## More flows

Each needs its options **and** a registered handler of the same name (`registry.registerHandler('emailVerification', this)`), or startup fails:
- email verification and password reset (`EmailVerificationHandler`, `PasswordResetHandler` + `@nestjs/mail`)
- TOTP 2FA (`MfaService`, `SignInService.confirmMfa/completeMfa`, `mfa.encryption.keys`)
- OIDC (`OidcAccountResolver`, `OidcService.start/finish`, `google()`/`github()`/`microsoft()`)
- magic links (`MagicLinkHandler`, `MagicLinkService`)
- sessions list/sign-out everywhere (`SessionService`, `signOut()`, `signOutEverywhere()`)
- API keys (`ApiKeyProvider` with `findKey(id)`)

Read `references/flows.md` for each.

## Production rules

- Register a database store implementing the six contracts (`sessions`, `refreshTokens`, `mfa`, `magicLinks`, `oidcStates`, `emailTokens`) via `AuthenticationStorage.registerSource()`. With `NODE_ENV=production` the module refuses in-memory storage for configured features.
- HTTPS; list other web origins in `session.trustedOrigins`; call `app.enableCsrfProtection()` (12.1+) with the same origins.
- Rate-limit sign-in with `@nestjs/throttler` using a per-IP and a per-email+IP definition (shared Redis storage in clusters).
- Rotate on privilege change (`SignInService.rotateSession()`); after password/2FA changes revoke other sessions and tokens.
- Import `AuthenticationModule` **before** `AuthorizationModule`.
- Never use `LogMailTransport` in production: it logs sign-in links.
- Reset/verify pages must POST the token (mail scanners follow GET links).
- scrypt uses 128 MiB per hash on the libuv pool: size servers and in tests use `new PasswordHasher({ logN: 10 })`.

## Workflow

- [ ] 1. Install; define the `User` type and repository; add `SessionAuth` (and `JwtAuth`/`ApiKeyAuth` if needed).
- [ ] 2. Register `AuthenticationModule.forRoot[Async]()` with config from `ConfigService`; add `@Public()` to routes that must stay open.
- [ ] 3. Add sign-up/sign-in controllers with validated DTOs or schemas; add each extra flow with its handler.
- [ ] 4. Add the database store and migrations; throttler; `enableCsrfProtection()`.
- [ ] 5. E2E tests: real `AppModule`, PGlite for the DB, `InMemoryMailTransport`, cheap `PasswordHasher`; assert cookies, 401s, `mfa_required`. Existing e2e tests now need credentials or `@Public()`.
- [ ] 6. Build, lint, run unit and e2e tests, start the app.

## Reference files

- `references/flows.md`: email verification, password reset, 2FA, OIDC, magic link, session management, API keys, GraphQL/WebSocket use, store contract, testing, module options, events and errors. Read when adding any flow beyond password sign-in or writing the store.

Sources: [Authentication](https://docs.nestjs.com/security/authentication)
