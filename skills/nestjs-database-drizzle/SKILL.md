---
name: nestjs-database-drizzle
description: Integrates Drizzle ORM with NestJS 12 through the first-party @nestjs/drizzle package — DrizzleModule.forRoot/forRootAsync with a driver's drizzle() function, per-application connection pools closed on shutdown, @InjectDrizzle and getDrizzleToken, pgTable/mysqlTable schemas with $inferSelect types, defineRelations and typed db.query relational reads, transactions with db.transaction(tx), hand-written repositories, drizzle-kit migrations or migrate() at startup, read replicas with withReplicas, multiple named databases, and mocking the database in tests. Use when the project uses or wants Drizzle (PostgreSQL, MySQL, SQLite, Neon, Turso, D1), when adding a table, query, relation, transaction or migration with Drizzle, or when e2e tests break because a shared db instance was closed. Not for TypeORM, Prisma, Mongoose, MikroORM or Sequelize (their own skills).
compatibility: NestJS 12.x; @nestjs/drizzle; drizzle-orm v1 (rc) or ≥0.35; drizzle-kit
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS + Drizzle (@nestjs/drizzle)

```bash
npm i @nestjs/drizzle drizzle-orm@rc pg
npm i -D drizzle-kit@rc @types/pg
```

The docs target Drizzle v1 (`rc` tag). With v0.x (≥0.35), only relations and relational queries differ. Detect the installed version before writing relations.

## Schema and types

```typescript
// src/db/schema.ts
export const users = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: text().notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
});
export const photos = pgTable('photos', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => users.id),   // FK constraint
});
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// src/db/relations.ts — drives db.query only (v1 API)
export const relations = defineRelations(schema, (r) => ({
  users: { photos: r.many.photos() },
  photos: { user: r.one.users({ from: r.photos.userId, to: r.users.id }) },
}));

// src/db/database.ts
export type Database = NodePgDatabase<typeof relations>;
```

No entity classes and no `forFeature()`: tables are plain objects you import where you query.

## Register (once, globally injectable)

```typescript
DrizzleModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    drizzle,                                              // from 'drizzle-orm/node-postgres'
    connection: config.getOrThrow<string>('DATABASE_URL'),
    relations,                                            // other drizzle() options (logger, casing) pass through
  }),
}),
```

- `DrizzleModule` creates the client **per application instance** and closes `db.$client` on `app.close()` / shutdown signal (`autoCloseConnection: true`). Enable `app.enableShutdownHooks()`.
- `forRoot()` options are evaluated at import time; prefer `forRootAsync` with `ConfigService`.
- Bring your own instance (replicas): `useFactory: () => ({ db: withReplicas(drizzle(primaryUrl), [drizzle(replicaUrl)]) })`. Avoid passing a module-level `db` singleton to `forRoot()`: every app shares it and the first `app.close()` breaks the other e2e suites.

## Queries, transactions, repositories

```typescript
@Injectable()
export class UsersService {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async findOne(id: number) { const [u] = await this.db.select().from(users).where(eq(users.id, id)); return u; }
  findWithPhotos(id: number) { return this.db.query.users.findFirst({ where: { id }, with: { photos: true } }); }
  async create(data: NewUser) { const [u] = await this.db.insert(users).values(data).returning(); return u; }

  async deactivate(id: number) {
    await this.db.transaction(async (tx) => {                      // every statement through tx
      await tx.update(users).set({ isActive: false }).where(eq(users.id, id));
      await tx.delete(photos).where(eq(photos.userId, id));
    });
  }
}
```

- A query runs when awaited. A thrown error or `tx.rollback()` rolls back.
- Optional repository layer: an `@Injectable()` class with named query methods; it uses the injected db, so **it is not part of a transaction started elsewhere** — accept `tx` as a parameter or propagate it with `nestjs-cls` transactional + Drizzle adapter (nestjs-logging covers CLS).
- `@nestjs/outbox`, `@nestjs/webhooks` and `@nestjs/authentication` stores use `fromDrizzle(db)` and take your `tx`.

## Migrations

```typescript
// drizzle.config.ts
export default defineConfig({ dialect: 'postgresql', schema: './src/db/schema.ts', out: './drizzle', dbCredentials: { url: process.env.DATABASE_URL! } });
```

- `npx drizzle-kit generate` → SQL files; `npx drizzle-kit migrate` applies them. Drizzle Kit runs outside Nest (no DI) and loads `.env` itself.
- Migrate at startup only for single-instance deployments: `useFactory: async () => { const db = drizzle(url, { relations }); await migrate(db, { migrationsFolder: './drizzle' }); return { db }; }`. With several instances, run `drizzle-kit migrate` as a release step.
- Custom SQL (e.g. other packages' store schemas): `npx drizzle-kit generate --custom --name=<name>`.

## Multiple databases

`DrizzleModule.forRoot({ name: 'analytics', drizzle, connection })` per extra database (one may stay unnamed = `default`); inject with `@InjectDrizzle('analytics')` or `getDrizzleToken('analytics')`. Drivers can differ.

## Testing

- Unit: `{ provide: getDrizzleToken(), useValue: mockDb }` — the chain (`select().from().where()`) must be mocked, so prefer mocking your repository class.
- Integration/e2e: override `getDrizzleToken()` with a PGlite database (`drizzle({ client: new PGlite() })` from `drizzle-orm/pglite`) after running `migrate(db, { migrationsFolder })` — in-process PostgreSQL, no server.

## Workflow

- [ ] 1. Install driver + `@nestjs/drizzle` + drizzle-kit; write `schema.ts` (+ `relations.ts`, `Database` type).
- [ ] 2. Register `DrizzleModule.forRootAsync`; enable shutdown hooks.
- [ ] 3. Inject with `@InjectDrizzle()`; wrap multi-statement writes in `db.transaction`.
- [ ] 4. `drizzle-kit generate`, review SQL, `drizzle-kit migrate`.
- [ ] 5. Tests (repository mocks; PGlite e2e). Build, lint, run tests, start the app.

Sources: [Drizzle](https://docs.nestjs.com/data/drizzle)
