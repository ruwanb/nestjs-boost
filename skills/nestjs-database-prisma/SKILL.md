---
name: nestjs-database-prisma
description: Integrates Prisma ORM 7 with NestJS 12 — installing prisma@7 with a driver adapter (better-sqlite3, pg, mariadb, mssql), prisma init with a generated client inside src, ESM vs CJS moduleFormat, schema models and prisma migrate dev, prisma generate in CI, a PrismaService extending PrismaClient with the adapter and $connect/$disconnect lifecycle hooks, a PrismaModule, typed CRUD services with generated Prisma types, sequential and interactive $transaction, and mocking PrismaService in tests. Use when the project uses or wants Prisma, when adding a model, migration, query or transaction with Prisma, or when hitting Prisma 7 setup errors (missing adapter, wrong prisma CLI version, generated client not found, import.meta in CommonJS, beforeExit hooks). Not for TypeORM, Drizzle, Mongoose, MikroORM or Sequelize (their own skills).
compatibility: NestJS 12.x; prisma@7 and @prisma/client@7 with an @prisma/adapter-* package; @nestjs/config
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS + Prisma 7

Prisma has no Nest package: you wrap the generated client in a provider.

## Install (pin Prisma 7)

```bash
npm i -D prisma@7 dotenv
npm i @prisma/client@7 @prisma/adapter-pg          # or adapter-better-sqlite3 | adapter-mariadb | adapter-mssql
npx prisma init --datasource-provider postgresql --output ../src/generated/prisma
```

- **Install `prisma@7` explicitly**: `latest` may point at a Prisma 8 pre-release without `migrate`/`generate`.
- `init` creates `prisma/schema.prisma`, the Prisma config file in the project root (`prisma7.config.ts`; `prisma.config.ts` before 7.10) and `.env`, and git-ignores the generated client.
- The client is generated into `src/generated/prisma` and compiled with the app. ESM projects (the v12 default) need nothing else; CommonJS projects set `moduleFormat = "cjs"` in the generator (the ESM client uses `import.meta`).
- The connection URL lives in `DATABASE_URL`, read by the Prisma config file; the app reads it through `ConfigService` (`ConfigModule.forRoot({ isGlobal: true })`).

## Models and migrations

```groovy
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
datasource db { provider = "postgresql" }

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}
model Post {
  id       Int   @id @default(autoincrement())
  title    String
  author   User? @relation(fields: [authorId], references: [id])
  authorId Int?
}
```

- `npx prisma migrate dev --name init` creates and applies SQL migrations (development). Deploy with `npx prisma migrate deploy` in the release step.
- `npx prisma generate` after every schema change — `migrate dev` doesn't run it — and **in CI/fresh checkouts before `nest build`**, since the client isn't committed. Add it to a `prebuild` script.

## PrismaService and PrismaModule

```typescript
// src/prisma/prisma.service.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }) });   // adapter is required in v7
  }
  async onModuleInit() { await this.$connect(); }        // fail at startup, not on first request
  async onModuleDestroy() { await this.$disconnect(); }  // also closes the adapter's pool
}

// src/prisma/prisma.module.ts
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

- Call `app.enableShutdownHooks()` in `main.ts`; Prisma 7 has no `$on('beforeExit')`.
- Import `PrismaModule` where needed, or mark it `@Global()` if nearly every module uses it.

## Queries and transactions

```typescript
import { Prisma, User } from '../generated/prisma/client.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  user(where: Prisma.UserWhereUniqueInput): Promise<User | null> { return this.prisma.user.findUnique({ where }); }

  async page(skip: number, take: number) {
    const [posts, total] = await this.prisma.$transaction([                // sequential, one transaction
      this.prisma.post.findMany({ skip, take }), this.prisma.post.count(),
    ]);
    return { posts, total };
  }
  deleteWithPosts(id: number) {
    return this.prisma.$transaction(async (tx) => {                       // interactive: use tx for every query
      await tx.post.deleteMany({ where: { authorId: id } });
      return tx.user.delete({ where: { id } });
    });
  }
}
```

- Nested writes are transactional automatically. `$transaction(…, { maxWait, timeout, isolationLevel })`.
- Generated types are compile-time only: validate request bodies with DTOs or schemas (nestjs-validation-serialization), not Prisma types.
- Map known errors (unique violation `P2002`, not found `P2025`) to HTTP exceptions in the service or an exception filter.
- Decorator-based transactions across services: `nestjs-cls` transactional plugin with the Prisma adapter.
- Packages with stores (`@nestjs/outbox`, `@nestjs/webhooks`) use `fromPrisma(prisma)` and need the driver adapter client.

## Testing

```typescript
const moduleRef = await Test.createTestingModule({
  providers: [UsersService, { provide: PrismaService, useValue: { user: { findUnique: vi.fn() } } }],
}).compile();
```

The mock replaces the class, so `onModuleInit` never connects. For module-level tests use `.overrideProvider(PrismaService)`. Run integration tests against a real database with `prisma migrate deploy` applied.

## Workflow

- [ ] 1. Install pinned Prisma 7 + adapter; `prisma init` with `--output ../src/generated/prisma`.
- [ ] 2. Write models; `prisma migrate dev`; `prisma generate`; add `prisma generate` to the build pipeline.
- [ ] 3. Add `PrismaService` (adapter + lifecycle) and `PrismaModule`; `enableShutdownHooks()`.
- [ ] 4. Services with generated types; transactions via `$transaction`.
- [ ] 5. Tests with a `PrismaService` mock. Build, lint, run tests, start the app.

Sources: [Prisma](https://docs.nestjs.com/data/prisma)
