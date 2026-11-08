# @nestjs/authentication flows and reference

## Contents
- Handler pattern
- Email verification
- Password reset
- Two-factor authentication (TOTP)
- OpenID Connect (Google, GitHub, Microsoft)
- Magic links
- Session management
- API keys
- GraphQL and WebSockets
- Database store contract
- Testing
- Module options
- Events and errors

## Handler pattern

Features with side effects (sending mail, finding accounts) need a handler registered under the feature's name. Handlers are your `@Injectable()` classes:

```typescript
@Injectable()
export class EmailVerificationMailer extends EmailVerificationHandler {
  constructor(private readonly users: UsersRepository, private readonly mailer: Mailer, registry: AuthenticationRegistry) {
    super();
    registry.registerHandler('emailVerification', this);
  }
  async send(link: EmailVerificationLink) { await this.mailer.send(VerifyEmailMail, { to: link.email, data: link }); }
  markVerified(userId: string, email: string) { return this.users.markEmailVerified(userId, email); }   // conditional: only if email unchanged
}
```

Names: `emailVerification`, `passwordReset`, `magicLink`, `oidc`. Option without handler (or vice versa) fails startup. Mail through `@nestjs/mail` (nestjs-mail).

## Email verification

- Options: `emailVerification: { url: `${APP_URL}/verify-email`, ttl? ('24h') }`.
- `EmailVerificationService.send(user)` after sign-up (or a resend route); `verify(token)` from a POST route the page calls.
- `markVerified()` must update only while the stored email still matches (`UPDATE … WHERE id = $1 AND email = $2`).
- `@Authenticate({ verifiedEmail: true })` gates routes on it.

## Password reset

- Options: `passwordReset: { url: `${APP_URL}/reset-password`, ttl? ('1h') }`.
- Handler (`PasswordResetHandler`): `findUser(email)` → `{ id, email (stored), passwordHash } | null`, `send(link)`, `updatePassword(userId, passwordHash)`.
- `forgot` route: call `passwordResetService.request(email)` **without awaiting** and answer 202 every time (no account enumeration).
- `reset` route: `passwordResetService.reset(token, password, { signIn: true })` → `null` for invalid links; result has `signedIn?.session.mfa`.
- A reset revokes the user's sessions and refresh tokens. Links stop working after any password or email change.

## Two-factor authentication (TOTP)

```typescript
mfa: { issuer: 'example.com', encryption: { keys: [process.env.TOTP_ENCRYPTION_KEY!] } },   // ≥32 random chars; newest key first
```

- Enroll: `mfaService.enroll(user.id, user.email)` (QR/otpauth data); `{ replace: true }` to swap authenticators (else `MfaAlreadyEnrolledError` 409).
- Confirm: `signInService.confirmMfa(userId, code)`, then show `mfaService.generateRecoveryCodes(userId)` once.
- Sign-in with an enrolled user creates a **pending** session: protected routes answer 401 `mfa_required`. A `@Public()` `verify` route calls `signInService.completeMfa({ code, recoveryCode })`, which rotates to `mfa: 'verified'`. Pending sessions expire after `mfa.pendingTtl` (10m).
- Disable: verify a code with `mfaService.verifyTotp(userId, code)`, `mfaService.disable(userId)`, then `sessionService.revokeAll(userId, { except: current.id })` and `tokenService.revokeAll(userId)`.
- Tokens: `tokenService.issue()` answers `mfa_required` for enrolled users until a code is given; put `amr` claims in tokens so `@Authenticate({ mfa: true })` works for bearer clients.
- Every app sharing the user database must configure `mfa`, or users bypass it via another app.
- Lockout: `maxAttempts` (5) per `lockoutWindow` (15m).

## OpenID Connect (Google, GitHub, Microsoft)

```typescript
oidc: {
  callbackUrl: `${process.env.APP_URL}/auth/oidc/:provider/callback`,
  providers: { google: google({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! }) },
},

@Public() @Controller('auth/oidc')
export class OidcController {
  @Get(':provider/login') @Redirect()
  login(@Param('provider') p: string, @Query('redirectTo') redirectTo?: string, @Query('link') link?: string) {
    return this.oidcService.start(p, { redirectTo, link: link === 'true' });
  }
  @Get(':provider/callback') @Redirect()
  callback(@Param('provider') p: string, @Query() query: Record<string, string>) { return this.oidcService.finish(p, query); }
}
```

Resolver (`OidcAccountResolver`, registered as `'oidc'`): `resolveUser(profile, tokens, { linkTo })`.
- With `linkTo` (a "Connect Google" link flow): link to that user unless the identity belongs to someone else.
- Known identity → its user.
- New identity: only trust `profile.email` if `profile.emailVerified`; link to an existing account only if **that account's** email is verified (prevents pre-hijacking); otherwise return `null` (403) or throw `ForbiddenException`.
- `redirectTo` must be relative; `microsoft()` takes a `tenant`. Errors: 400 forged callback, 502 provider unreachable.

## Magic links

- Options: `magicLink: { url: `${APP_URL}/sign-in/magic`, ttl? ('15m'), bindToBrowser? (true) }`.
- Handler (`MagicLinkHandler`): `send(link)`, `resolveUser(email)` (create the account on first use; refuse unverified password accounts with 403).
- `magicLinkService.create(email, { redirectTo })` → always answer 202. `consume(token)` → `null` or `{ session, redirectTo }`.
- A link works only in the browser that requested it (`__Host-magic_link_tx`); otherwise 401 `not_this_browser`.

## Session management

- `session.metadata: (req) => ({ userAgent: req.headers['user-agent'] })` stores data with each session.
- `sessionService.list(userId)`, `sessionService.revoke(id, { userId })`, `signInService.signOut()`, `signInService.signOutEverywhere(userId)`, `tokenService.revoke(refreshToken)`.

## API keys

```typescript
@Injectable()
export class ApiKeyAuth extends ApiKeyProvider<User> {
  constructor(@InjectDrizzle() private readonly db: NodePgDatabase, private readonly users: UsersRepository, registry: AuthenticationRegistry) {
    super({ prefix: 'cat', realm: 'store' });          // keys: cat_<16-hex id>_<secret>
    registry.registerProvider(this, { order: 2 });
  }
  async findKey(id: string) {
    const [key] = await this.db.select().from(apiKeys).where(eq(apiKeys.id, id));
    const user = key && (await this.users.findById(key.userId));
    return user ? { hash: key.hash, user, expiresAt: key.expiresAt } : null;
  }
}
```

- Your table stores `id`, `userId`, `hash` (SHA-256), `createdAt`, `expiresAt`. `generate()` returns `{ key, id, hash }`: show `key` once.
- Keys never satisfy `@Authenticate({ mfa: true })`; requests with keys emit no events (log `keyId` from `@CurrentSession()`).
- Password reset / sign-out everywhere leave keys alone; revoke them yourself if needed. Add the prefix to secret scanning.

## GraphQL and WebSockets

- GraphQL: `context: ({ req, res, extra }) => ({ req: req ?? extra?.request, res })` (must be a function), `fieldResolverEnhancers: ['guards', 'interceptors']` if field resolvers need it.
- Gateways: no guards on `handleConnection()`; call `wsAuthenticator.authenticateConnection(client, request)` (closes with 1008; pass `{ required: false }` as third arg to allow guests).

## Database store contract

One `@Injectable()` class (or several) calling `storage.registerSource({ sessions: this, refreshTokens: this, mfa: this, magicLinks: this, oidcStates: this, emailTokens: this })` with `AuthenticationStorage` injected. Contracts used by configured features are mandatory in production.

Atomicity rules (one conditional statement, never read-then-write):
- `touchSession()`: conditional UPDATE moving `lastActiveAt` forward only.
- `deleteSession()`: DELETE resolving whether a row was deleted.
- `markRefreshTokenUsed()`: `UPDATE … WHERE used_at IS NULL`, count rows.
- `saveTotp()`: upsert keeping the larger `lastUsedStep` (`GREATEST`, raw SQL on Prisma).
- `claimTotpStep()`, `consumeRecoveryCode()`: conditional UPDATE/DELETE.
- `recordMfaFailure()`: insert, then count, each committed separately.
- `saveRecoveryCodes()`: one transaction (delete + insert).
- `consumeMagicLink()`, `consumeOidcState()`, `consumeEmailToken()`: `DELETE … RETURNING`.

`getSession()` may return the user in `extra` (one query per request). Test with `authenticationStoreContract()` from `@nestjs/authentication/testing`, `{ concurrent: true }`, against PostgreSQL with a pool.

## Testing

```typescript
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(getDrizzleToken()).useValue(drizzle({ client: new PGlite() }))
  .overrideProvider(MailTransport).useValue(mailbox)                       // InMemoryMailTransport
  .overrideProvider(PasswordHasher).useValue(new PasswordHasher({ logN: 10 }))
  .compile();
```

Read the session cookie from `res.headers['set-cookie'][0].split(';')[0]`; read links with `mailbox.assertSent({ to, mail: VerifyEmailMail }).link('/verify-email').searchParams.get('token')`. Set test env vars (JWT secret ≥32 bytes, TOTP key) in the test runner config.

## Module options

`forRootAsync()` factory returns everything except `isGlobal` and `globalGuard`. Lifetimes up to 100 years; every clocked group takes `now` for tests.

| Option | Default |
| --- | --- |
| `globalGuard` / `isGlobal` / `allowInMemoryStorage` | `true` / `true` / `false` |
| `session.cookieName` | `__Host-sid` (`sid` without the prefix rules) |
| `session.absoluteTtl` / `idleTtl` / `touchInterval` | `'7d'` / `'1d'` / `'1m'` (shorter than `idleTtl`) |
| `session.cookie` | `secure: true, sameSite: 'lax', path: '/'`, always HttpOnly |
| `session.trustedOrigins`, `session.metadata` | none |
| `password.logN` (`r`, `p`, `keyLength`, `saltLength`) | 17 (8, 1, 32, 16) |
| `accessToken.key` / `alg` / `issuer` / `audience` / `ttl` / `kid` / `type` | required / from key / – / – / `'15m'` / – / `JWT` |
| `refreshToken` (`ttl`, `absoluteTtl`) / `false` | on (`'30d'`, `'90d'`) |
| `mfa.encryption` / `issuer` / `window` / `maxAttempts` / `lockoutWindow` / `recoveryCodes` / `pendingTtl` | required / – / 1 / 5 / `'15m'` / 10 / `'10m'` |
| `emailVerification.url` / `passwordReset.url` / `magicLink.url` | required when enabled |
| `oidc.callbackUrl`, `providers`, `redirectAfterLogin` (`/`), `transactionTtl` (`'10m'`), `discoveryTtl` (`'1h'`), `clockTolerance` (`'30s'`) | |

A value outside its range (including `NaN` from an unset env var) fails startup.

## Events and errors

`AuthenticationEvents.events$` and diagnostics channels `nestjs:authentication:<type>`: `sign-in`, `sign-out`, `mfa-verified`, `mfa-failed` (`locked`), `mfa-enabled`, `mfa-disabled`, `recovery-codes-generated`, `refresh-token-reused`, `password-reset-requested`, `password-reset`, `email-verified`, `magic-link-refused`, `session-touch-failed`. Keep them as an audit trail and alert on locked MFA failures and touch failures.

Errors: `AuthenticationError` (base; `status`, `code` → `errorCode`, `details`, `challenge`), `JwtError` 401, `RefreshTokenError` 401 (`reason`), `MagicLinkError` 401 `not_this_browser`, `MfaAlreadyEnrolledError` 409. Guard codes: `missing_credentials` 401, `mfa_required` 401, `email_unverified` 403. Errors are converted for GraphQL (`UNAUTHENTICATED`), WebSockets (`WsException`) and microservices (`RpcException`).
