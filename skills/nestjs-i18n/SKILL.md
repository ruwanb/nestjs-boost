---
name: nestjs-i18n
description: Internationalizes NestJS 12 responses with the first-party @nestjs/i18n package — JSON catalogs per locale and namespace, typed keys via I18nTypes, I18nModule.forRoot/forRootAsync with ordered locale resolvers (query, header, Accept-Language, cookie, custom afterGuards resolvers from the user profile), region fallbacks, Content-Language/Vary headers, I18nService.t with placeholders and CLDR plural forms, the t() helper for exceptions and pipes, I18nValidationPipe and I18nStandardSchemaValidationPipe for translated class-validator/Zod messages, Intl number and date formatting, GraphQL fields, microservices and WebSockets, missingKey policies, hot-reloading catalogs, ICU formatters, I18nContext.run for jobs, and catalog tests. Use when the API must answer in the user's language, translate errors or validation messages, format prices/dates per locale, or test translations. Not for the content of emails by itself (nestjs-mail templates take a locale) or general validation (nestjs-validation-serialization).
compatibility: NestJS 12.x; @nestjs/i18n; resolveJsonModule for typed keys; optional intl-messageformat for ICU
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS i18n (@nestjs/i18n)

The first-party `@nestjs/i18n` resolves the locale once per request into AsyncLocalStorage, so singleton services translate without the request. If the project uses the community `nestjs-i18n` package, keep its APIs unless asked to migrate.

```bash
npm i @nestjs/i18n
```

## Catalogs, module, types

```text
src/i18n/en/orders.json   src/i18n/pl/orders.json   src/i18n/en/validation.json   src/i18n/translations.ts
```

```json
// src/i18n/en/orders.json — file name = namespace; key orders.notFound
{ "items": { "one": "{count} item", "other": "{count} items" }, "confirmed": "Order #{id} is confirmed: {items}.", "notFound": "Order #{id} was not found." }
```

```typescript
I18nModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    defaultLocale: 'en',
    supportedLocales: ['en', 'pl', 'de'],                   // pin: stray directories never become locales
    fallbacks: { 'de-AT': 'de' },                           // region keeps its own formatting, messages from de
    loader: new JsonI18nLoader({ path: join(import.meta.dirname, 'i18n'), watch: config.get('NODE_ENV') === 'development' }),
    missingKey: config.get('NODE_ENV') === 'production' ? 'fallback' : 'throw',
  }),
  resolvers: [new QueryLocaleResolver('lang'), new HeaderLocaleResolver('x-lang'), CustomerLocaleResolver, new AcceptLanguageLocaleResolver()],
  imports: [CustomersModule],                               // classes and imports stay at the top level
}),

// src/i18n/translations.ts — English catalog is the source of truth
import type orders from './en/orders.json';
export interface Translations { orders: typeof orders; validation: typeof validation }
declare module '@nestjs/i18n' { interface I18nTypes { translations: Translations } }
```

- Add `"assets": ["i18n/**/*.json"], "watchAssets": true` to `nest-cli.json`; enable `resolveJsonModule`.
- Resolvers run in order; first supported candidate wins; `pl-PL` → `pl` automatically; no match or no request → `defaultLocale`. Responses get `Content-Language` and `Vary`.
- Profile language: a `LocaleResolver` subclass with `readonly afterGuards = true` reading the authenticated user from `executionContext` (guards see the pre-guard locale).

## Translate

```typescript
constructor(private readonly i18n: I18nService) {}

confirm(order: Order) {
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  const items = this.i18n.t('orders.items', { args: { count } });       // plural chosen by count via Intl.PluralRules
  return this.i18n.t('orders.confirmed', { args: { id: order.id, items } });
}
findOne(id: number) {
  const order = this.repo.find(id);
  if (!order) throw new NotFoundException(this.i18n.t('orders.notFound', { args: { id } }));
  return order;
}
summary(order: Order) {
  return {
    total: this.i18n.formatNumber(order.total, { style: 'currency', currency: order.currency }),   // currency from data, never the locale
    placedAt: this.i18n.formatDate(order.createdAt, { dateStyle: 'long', timeZone: 'UTC' }),
  };
}
```

- Keys are type-checked; `translate()` takes runtime-built keys. Plural messages require a `count` arg; placeholders can't nest — compose messages.
- Without DI (pipes created with `new`): `t('orders.invalidId')`, e.g. `new ParseIntPipe({ exceptionFactory: () => new BadRequestException(t('orders.invalidId')) })`.
- `@CurrentLocale()` param, `I18nContext.locale`, `I18nContext.setLocale(l)` (returns matched locale or `undefined`).
- Outside requests (cron, queues, emails) the default locale applies and `t()` returns the key: wrap work in `i18nContext.run(customer.locale, () => …)`.
- Arguments are inserted raw: escape when the message goes into HTML.

## Validation messages

- class-validator: replace `ValidationPipe` with `{ provide: APP_PIPE, useValue: new I18nValidationPipe({ whitelist: true, transform: true }) }`. Constraints read `validation.<constraintName>` (`validation.isInt`); point one at a key with `@Max(10, { message: i18nValidationMessage('orders.tooManyItems') })`. Placeholders: `property`, `path`, `value`, `constraint1…`, `count`.
- Standard Schema (Zod/Valibot/ArkType): `new I18nStandardSchemaValidationPipe()`; custom keys with `i18nIssueMessage('orders.tooManyItems')`; issues resolve `validation.invalid_format.regex` → `validation.too_small.string` → `validation.too_small`.
- Untranslated constraints keep the library message.

## Other transports

- GraphQL: localized values via field resolvers with `I18nService`. With `setGlobalPrefix()`, set `useGlobalPrefix: true` on `GraphQLModule`, or the middleware doesn't cover it. Subscriptions aren't wrapped.
- Microservices/gateways: resolved in a global interceptor; add a resolver reading the locale from message data or `switchToRpc().getContext()`. For `ws`, store the upgrade request on the client in `handleConnection`.

## Testing

- E2E: send `Accept-Language`/`?lang=`/`x-lang` and assert translated bodies.
- Unit: `i18nContext.run('pl', () => service.describe(order))`.
- Swap catalogs: `.overrideProvider(I18nLoader).useValue(new InMemoryI18nLoader(catalogs))`.
- Catalog test in CI: same keys and placeholders as English, and every plural form `new Intl.PluralRules(lang).resolvedOptions().pluralCategories` needs.

## Production checklist

`dist/i18n` exists after build; `'fallback'` in production, `'throw'` elsewhere + catalog test; `watch` off; pinned `supportedLocales`; regions in `fallbacks`; locale set explicitly in background work; CDN honours `Vary`; GraphQL under the prefix; HTML-escape messages; currency/time zone from data.

## Workflow

- [ ] 1. Install; catalogs per locale; assets; typed `Translations`.
- [ ] 2. Register with resolvers in priority order and environment-based `missingKey`/`watch`.
- [ ] 3. Replace hard-coded strings in services/exceptions with `t()`; swap the validation pipe.
- [ ] 4. Format numbers/dates with `I18nService`; handle background jobs with `I18nContext.run`.
- [ ] 5. E2E + catalog tests. Build, lint, run tests, start the app.

Sources: [Internationalization](https://docs.nestjs.com/application/i18n)
