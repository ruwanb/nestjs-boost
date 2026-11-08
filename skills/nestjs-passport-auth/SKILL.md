---
name: nestjs-passport-auth
description: Implements and maintains Passport-based authentication in NestJS 12 with @nestjs/passport and @nestjs/jwt — PassportStrategy subclasses (passport-local, passport-jwt, OAuth and other strategies), AuthGuard('local'|'jwt') and custom guard subclasses, issuing JWTs with JwtService, a global JWT guard with @Public() metadata, named and multiple strategies, request-scoped strategy dependencies via ModuleRef, PassportModule options and sessions, and GraphQL guards. Use when a project already uses @nestjs/passport or passport-* strategies, when the user explicitly asks for Passport or a specific passport strategy, or when fixing "Unknown authentication strategy", empty req.user or AuthGuard errors. Not for new projects using the first-party @nestjs/authentication (nestjs-authentication) or for permissions (nestjs-authorization).
compatibility: NestJS 12.x; @nestjs/passport, passport, a passport-* strategy; @nestjs/jwt for tokens
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS Passport authentication

Use this skill when the project already depends on `@nestjs/passport` (or the user asks for a passport strategy). For new projects with no auth yet, suggest `@nestjs/authentication` (nestjs-authentication), which ships sessions, hashing, refresh tokens, 2FA and OIDC.

```bash
npm i @nestjs/passport passport passport-local @nestjs/jwt passport-jwt
npm i -D @types/passport-local @types/passport-jwt
```

Every strategy needs `@nestjs/passport` + `passport` + the strategy package.

## How it fits together

1. A **strategy** extends `PassportStrategy(Strategy, name?)`; options go to `super()`; `validate(...)` returns the user (attached to `req.user`) or throws `UnauthorizedException`.
2. A **guard** `AuthGuard('local' | 'jwt' | name)` runs the strategy. Wrap it in a named class (`LocalAuthGuard`, `JwtAuthGuard`) instead of passing magic strings around.
3. The module imports `PassportModule` and provides the strategies (they must be providers to register with Passport).

## Recipe: login with a password, protect routes with JWT

```typescript
// auth/local.strategy.ts
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) { super({ usernameField: 'email' }); }
  async validate(email: string, password: string) {
    const user = await this.authService.validateUser(email, password);   // compare a stored hash, never plaintext
    if (!user) throw new UnauthorizedException();
    return user;
  }
}

// auth/jwt.strategy.ts — import { ExtractJwt, Strategy as JwtPassportStrategy } from 'passport-jwt';
@Injectable()
export class JwtStrategy extends PassportStrategy(JwtPassportStrategy) {
  constructor(config: ConfigService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: config.getOrThrow('JWT_SECRET') });
  }
  validate(payload: { sub: string; username: string }) { return { userId: payload.sub, username: payload.username }; }
}

// auth/auth.service.ts
login(user: User) { return { access_token: this.jwtService.sign({ sub: user.id, username: user.username }) }; }

// auth/auth.module.ts
@Module({
  imports: [UsersModule, PassportModule, JwtModule.registerAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({ secret: config.getOrThrow('JWT_SECRET'), signOptions: { expiresIn: '15m' } }),
  })],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}

// auth.controller.ts
@Public() @UseGuards(LocalAuthGuard) @Post('auth/login')
login(@Request() req) { return this.authService.login(req.user); }
```

- Hash passwords (bcrypt or argon2; see nestjs-security-hardening). The docs' in-memory plaintext users are illustration only.
- Keep the JWT secret in validated config, never in a constants file.
- `@nestjs/jwt` `expiresIn` numbers are **seconds**; strings like `'15m'` also work.

## Global guard with public routes

```typescript
providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) { super(); }
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    return isPublic ? true : super.canActivate(context);
  }
}
```

`Public = () => SetMetadata(IS_PUBLIC_KEY, true)`. Mark login, health and other open routes. With `@nestjs/authorization`, register this guard via `APP_GUARD` so it runs before the authorization guard.

## Customizing

- Override `handleRequest(err, user, info)` in the guard to change errors or allow anonymous users (return `user ?? null`).
- Several strategies in order: `AuthGuard(['jwt', 'api-key'])`.
- Name strategies: `PassportStrategy(Strategy, 'myjwt')` → `AuthGuard('myjwt')`.
- `PassportModule.register({ defaultStrategy: 'jwt', property: 'user', session: true })`; other options pass to `passport.authenticate()`.
- Sessions + logout need `express-session` with Passport session support; logout: `await new Promise((res, rej) => req.logout((e) => (e ? rej(e) : res())))`. Not applicable to JWTs.
- Request-scoped dependencies: strategies are global singletons; use `super({ passReqToCallback: true })` and resolve with `moduleRef.resolve(AuthService, ContextIdFactory.getByRequest(request))` in `validate(request, ...)`.

## GraphQL

```typescript
@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) { return GqlExecutionContext.create(context).getContext().req; }
}
export const CurrentUser = createParamDecorator((_d, ctx: ExecutionContext) => GqlExecutionContext.create(ctx).getContext().req.user);
```

For a local strategy over GraphQL, copy the args into `req.body` in `getRequest()`. Configure the GraphQL `context: ({ req }) => ({ req })`.

## Gotchas

- "Unknown authentication strategy": strategy not listed in `providers`, or its module not imported, or the name differs from the guard string.
- `req.user` undefined in a handler: the guard isn't applied, or a global guard skipped the route as public.
- `passport` and the `@nestjs/passport` guards work on the Express and Node adapters ([Node adapter compatibility](https://docs.nestjs.com/http/performance)).

## Workflow

- [ ] 1. Detect existing strategies/guards; extend them rather than adding a parallel auth system.
- [ ] 2. Add strategy + guard class + module wiring; config-driven secrets.
- [ ] 3. Decide global (APP_GUARD + `@Public()`) vs per-route guards; update e2e tests to obtain a token first.
- [ ] 4. Build, lint, run unit and e2e tests (login → token → protected route → 401 without token), start the app.

Sources: [Passport recipe](https://docs.nestjs.com/recipes/passport) · [Guards](https://docs.nestjs.com/guards)
