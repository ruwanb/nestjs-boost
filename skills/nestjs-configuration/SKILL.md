---
name: nestjs-configuration
description: Configures NestJS 12 applications with @nestjs/config — loading .env files and environment variables, fail-fast validation with a Standard Schema (Zod/Valibot/ArkType) validationSchema or validate() function, typed namespaced config with registerAs/ConfigType, global ConfigModule, reading config in main.ts and in async module factories (forRootAsync), env-specific files and variable expansion. Use when the user wants settings from env/.env, required variables, typed config, per-environment config, configuring another module from config, or when ConfigService is undefined, a variable is missing at startup, or Joi validation options stopped working after upgrading. Not for request validation (nestjs-validation-serialization).
compatibility: NestJS 12.x; @nestjs/config; zod (or valibot/arktype) for validation
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-04"
---

# NestJS configuration

## Default recipe

```bash
npm i @nestjs/config zod
```

```typescript
// config/env.schema.ts
import { z } from 'zod';
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),     // env values are strings: coerce
  DATABASE_URL: z.url(),                           // no default → required: startup fails if missing
});
export type Env = z.infer<typeof envSchema>;
```

```typescript
// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,                  // inject ConfigService anywhere without importing ConfigModule
      validationSchema: envSchema,     // any Standard Schema; ConfigService serves the schema's OUTPUT (coerced, defaulted)
      load: [databaseConfig],          // namespaced, typed config (below)
    }),
  ],
})
export class AppModule {}
```

```typescript
// main.ts
const app = await NestFactory.create(AppModule);
const config = app.get(ConfigService);
await app.listen(config.getOrThrow<number>('PORT'));
```

Validation runs during bootstrap. Unknown variables (`PATH`, `HOME`) are ignored, and every failing variable is reported as `NAME: message`. In v12, Zod (or another Standard Schema library) is the recommended choice for new code ([Configuration](https://docs.nestjs.com/application/configuration)).

## Typed, namespaced config (preferred over string keys)

```typescript
// config/database.config.ts
export const databaseConfig = registerAs('database', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
}));

// any provider
constructor(@Inject(databaseConfig.KEY) private readonly db: ConfigType<typeof databaseConfig>) {}
this.db.port; // number, fully typed

// configure another module from it
TypeOrmModule.forRootAsync(databaseConfig.asProvider())
```

- `ConfigModule.forFeature(databaseConfig)` registers a namespace from a feature module (partial registration). Values loaded this way may only be ready in `onModuleInit()`, not the constructor.
- `configService.get('database.host')` also works; prefer `.KEY` injection for types.
- In `registerAs` factories, `process.env` is fully resolved (`.env` merged) and has already passed validation.

## Reading values

| Need | Use |
| --- | --- |
| Optional value with fallback | `config.get<string>('FEATURE_GREETING', 'Hello')` |
| Required value | `config.getOrThrow<string>('API_KEY')`: throws if undefined |
| Typed keys from a schema | `ConfigService<Env, true>` + `get('PORT', { infer: true })` |
| Another module's async config | `forRootAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: (c: ConfigService) => ({ ... }) })`. Omit `imports` when `isGlobal: true`. |

## Decision points

- **Several env files** → `envFilePath: ['.env.development.local', '.env.development']` (the first match wins per key). `ignoreEnvFile: true` uses `process.env` only, e.g. with `node --env-file=.env`.
- **`${VAR}` references in `.env`** → `expandVariables: true`.
- **Load a module only when an env flag is set** → `ConditionalModule.registerWhen(FooModule, 'USE_FOO')`.
- **Env needed before `AppModule` is imported** (e.g. microservice options in `createMicroservice()`) → `nest start --env-file .env`, or `process.loadEnvFile()` in a file imported first in `main.ts`.
- **Hot paths reading config often** → `cache: true`.
- **Custom rules beyond a schema** → a **synchronous** `validate: (raw) => parsed`: return the validated object, or throw.

## Gotchas

- **Joi in v12** needs **Joi v18+**, and Joi settings (`allowUnknown`, `abortEarly`) move under `validationOptions.libraryOptions`. Top-level `validationOptions.allowUnknown` no longer applies. For new code, use Zod.
- **`ConfigService` undefined or not found in a feature module:** `ConfigModule` isn't global and isn't imported there. Set `isGlobal: true` once in `AppModule`.
- **Env values are strings:** a schema without `z.coerce.number()` rejects `PORT=3000`, and a manual `process.env.PORT` read gives a string. Rely on the schema output via `ConfigService`.
- **Tests and required vars:** e2e tests importing `AppModule` fail validation without the required variables. Provide test values in the test runner config (e.g. `test.env` in `vitest.config.e2e.ts`) or a `.env.test` file via `envFilePath`. Never weaken the schema for tests.
- **Never commit `.env`** with real secrets. Commit `.env.example` and add `.env` to `.gitignore`.
- **`process.loadEnvFile()` inside `main.ts`'s body runs too late**, because `forRoot()` already read `process.env` when `app.module` was imported. Node's native `.env` parser isn't fully dotenv-compatible.

## Workflow

- [ ] 1. `npm i @nestjs/config zod` (skip zod if the project already uses another Standard Schema library).
- [ ] 2. Write the env schema; mark required variables by leaving out defaults.
- [ ] 3. `ConfigModule.forRoot({ isGlobal: true, validationSchema })` in `AppModule`; add `registerAs` namespaces for grouped settings.
- [ ] 4. Read `PORT` etc. in `main.ts` with `app.get(ConfigService)`.
- [ ] 5. Add `.env.example`, make tests supply required variables, and run build, lint and tests. Start the app once **with and without** a required variable to confirm fail-fast.

Sources: [Configuration](https://docs.nestjs.com/application/configuration) · [Migration guide](https://docs.nestjs.com/migration-guide)
