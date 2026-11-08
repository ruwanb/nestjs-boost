---
name: nestjs-authorization
description: Adds permissions to NestJS 12 with the first-party @nestjs/authorization package — @Policy() classes whose type-checked ability methods decide what a user may do, a deny-by-default global AuthorizationGuard with @Can(Policy, 'ability', argsFn) and @Can.Anyone(), record-level checks in services with AuthorizationService.authorize()/can(), before() admin bypass, policies that inject services, 401 vs 403 mapping, permission flags for the frontend, denial events, and testing policies. Use when the user asks for roles, permissions, ownership checks ("users can only see their own orders"), admin overrides, RBAC/ABAC, or when a route returns 403 unexpectedly after adding @nestjs/authorization. Not for signing users in (nestjs-authentication, nestjs-passport-auth).
compatibility: NestJS 12.x; @nestjs/authorization; works with @nestjs/authentication or any guard that sets request.user
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS authorization (@nestjs/authorization)

Prefer policies from `@nestjs/authorization` over hand-written `RolesGuard` + `@Roles()` metadata when the package is installed or the project uses `@nestjs/authentication`. For a tiny role check in a project without it, the guard + `Reflector` pattern in nestjs-request-pipeline is fine.

```bash
npm i @nestjs/authorization
```

## Register (after authentication)

```typescript
@Module({
  imports: [
    AuthenticationModule.forRootAsync({ ... }),   // FIRST: its guard sets request.user
    AuthorizationModule.forRoot(),                 // global, deny-by-default guard
    ProductsModule,
  ],
})
export class AppModule {}
```

- Global guards run in module scan order. With `@nestjs/authentication` the wrong order fails at startup; with other auth guards (Passport `AuthGuard`) it only logs an error and **every user looks like a guest** — register those with `APP_GUARD` before the module and cover it with an e2e test.
- **Deny by default:** a handler with no `@Can()`, `@Can.Anyone()` or `@Public()` gets 403 (user) / 401 (guest). The startup log lists every such handler: start migrations from that list.
- Custom user source: `AuthorizationModule.forRoot({ getUser: (ctx) => ... })`.

## Write a policy

```typescript
@Policy()
export class OrderPolicy implements PolicyBefore<User> {
  constructor(private readonly limits: RefundLimitsService) {}            // policies are providers

  before(user: User | null, ability: string) {                            // true allow, false deny, undefined → ability decides
    if (user?.roles.includes('admin') && ability !== 'refund') return true;
  }
  viewAll(user: User) { return user.roles.includes('staff'); }
  view(user: User, order: Order) { return order.userId === user.id || user.roles.includes('staff'); }
  viewOrdersOf(user: User | null, customerId: string) { return !!user && (user.id === customerId || user.roles.includes('staff')); }
  async refund(user: User, order: Order) {
    return user.roles.includes('staff') && order.status === 'paid' && order.total <= (await this.limits.maxRefundFor(user));
  }
}
```

- An ability's first parameter is the user; `User | null` means it also runs for guests. Only a literal `true` allows.
- Register the policy as a provider of its feature module (discovered automatically), or in `forRoot({ policies, imports })`.
- Keep policies stateless (singletons).
- `before()` skips every ability of the policy — don't use it where a rule must bind admins too (e.g. "never refund shipped orders"); check the ability name.

## Where each check goes

| Check depends on | Put it | How |
| --- | --- | --- |
| Only the user (create product, admin page) | Route | `@Can(ProductPolicy, 'create')` |
| A route param, no record load | Route | `@Can(OrderPolicy, 'viewOrdersOf', (ctx) => [ctx.switchToHttp().getRequest().params.customerId] as const)` |
| A loaded record | Service, after loading | `await this.authz.authorize(OrderPolicy, 'view', user, order)` + `@Can.Anyone()` on the route |
| A list | Query | `can(OrderPolicy, 'viewAll', user)` then filter in the DB, never per row |
| A UI flag | Response | `canRefund: await this.authz.can(OrderPolicy, 'refund', user, order)` (never throws) |

- `@Can()` is type-checked: misspelled abilities, missing args or wrong arg types don't compile. Route abilities must accept `null`.
- The args function runs in the guard **before pipes**: values are raw strings and unvalidated. Pass ids, not records.
- Other transports: `GqlExecutionContext.create(ctx).getArgs()`, `ctx.switchToWs().getData()`, `ctx.switchToRpc().getData()`.
- Guests on public routes: combine `@Authenticate({ optional: true })` with `@Can.Anyone()` and pass `@CurrentUser() user: User | null` to the service.

## 401 vs 403

- Guest on a route requiring sign-in → 401 from authentication. Guest denied by a policy on an optional route → 401. Signed-in user denied → 403.
- `authorize()` throws `AuthorizationError` (`reason: 'unauthenticated' | 'forbidden'`, `status`, `policy`, `ability`), mapped to HTTP/GraphQL/WS/RPC errors when it leaves a handler. Thrown in your own guard or middleware it becomes a **500**: use `can()` there.

## Gotchas

- Hybrid apps: `connectMicroservice(opts, { inheritAppConfig: true })` or `@Can()` isn't enforced on message handlers.
- GraphQL field resolvers aren't guarded unless `fieldResolverEnhancers: ['guards']`; then each `@ResolveField()` needs a declaration (class-level covers it).
- Don't put `CacheInterceptor` (URL cache) on routes with record checks; it answers before the policy.
- Race: re-check state in the write (`UPDATE … WHERE status = 'paid'`).
- Choose 404 over 403 where record existence is sensitive.
- Each `can()` flag runs the ability per row, async work included; cache slow lookups.

## Testing

- Unit-test policies as plain classes: `new OrderPolicy(fakeLimits).view(alice, order)`. Direct calls skip `before()`.
- Service tests: `Test.createTestingModule({ imports: [AuthorizationModule.forRoot()], providers: [OrdersService, OrderPolicy, RefundLimitsService] })` and expect `rejects.toThrow(AuthorizationError)` / `toMatchObject({ reason: 'forbidden', ability: 'refund' })`.
- E2E: sign in through the real endpoint (cheap `PasswordHasher({ logN: 11 })`), assert 401/403/200. Replace a policy with `.overrideProvider(OrderPolicy).useValue(...)`.

## Workflow

- [ ] 1. Install; import `AuthorizationModule` after the authentication module.
- [ ] 2. Write one policy per resource; register it in the feature module.
- [ ] 3. Add `@Can()` to user-only routes, `@Can.Anyone()` + `authorize()` in services for record checks; fix every handler in the startup "denied" log.
- [ ] 4. Subscribe to `AuthorizationEvents.events$` (`denied`: policy, ability, reason, user id) for auditing.
- [ ] 5. Add policy unit tests and e2e 401/403 tests.
- [ ] 6. Build, lint, run unit and e2e tests, start the app.

Sources: [Authorization](https://docs.nestjs.com/security/authorization)
