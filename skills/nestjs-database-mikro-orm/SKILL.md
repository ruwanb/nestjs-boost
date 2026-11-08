---
name: nestjs-database-mikro-orm
description: Integrates MikroORM v7 with NestJS 12 through @mikro-orm/nestjs — MikroOrmModule.forRoot/forRootAsync (driver beside useFactory), legacy decorators from @mikro-orm/decorators/legacy with ReflectMetadataProvider, entities and Rel relation wrappers, forFeature repositories and custom repositories, autoLoadEntities, the per-request EntityManager context middleware, @CreateRequestContext for queues and cron jobs, em.transactional and @Transactional, MikroORM serialization instead of ClassSerializerInterceptor, multiple contexts, shutdown hooks, and test mocks with getRepositoryToken. Use when the project uses or wants MikroORM, when adding entities, repositories, flush/transactions, or when the global EntityManager throws a ValidationError outside a request context, missing decorator exports after upgrading to v7, or broken relation JSON. Not for TypeORM, Drizzle, Prisma, Mongoose or Sequelize (their own skills).
compatibility: NestJS 12.x; MikroORM v7, @mikro-orm/nestjs v7 (third-party, maintained by the MikroORM team), a @mikro-orm driver package
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS + MikroORM v7

```bash
npm i @mikro-orm/nestjs @mikro-orm/core @mikro-orm/decorators @mikro-orm/postgresql   # or sqlite, mysql, mongodb…
```

`@mikro-orm/nestjs` is maintained by the MikroORM team. v7 changes: decorators moved to `@mikro-orm/decorators/legacy`, `ReflectMetadataProvider` is no longer the default, and `forRoot()` needs an explicit config.

## Configuration

```typescript
// mikro-orm.config.ts — shared with the MikroORM CLI
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { defineConfig } from '@mikro-orm/postgresql';
export default defineConfig({
  clientUrl: process.env.DATABASE_URL,
  entities: ['./dist/**/*.entity.js'],
  entitiesTs: ['./src/**/*.entity.ts'],
  metadataProvider: ReflectMetadataProvider,       // required with legacy decorators
});

// app.module.ts — async variant
MikroOrmModule.forRootAsync({
  driver: PostgreSqlDriver,                        // beside useFactory, not inside: registers driver-specific tokens
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({ clientUrl: config.getOrThrow('DATABASE_URL'), autoLoadEntities: true, metadataProvider: ReflectMetadataProvider }),
}),
```

- Nest-specific options: `autoLoadEntities`, `registerRequestContext` (true), `forRoutesPath`, `scope`, `contextName`.
- Inject `MikroORM` and `EntityManager` from **your driver package** (`@mikro-orm/postgresql`) for the driver-specific API.
- `autoLoadEntities` skips relation-only entities and doesn't affect the CLI (keep globs there). Base entities go in config, not `forFeature()`.
- Call `app.enableShutdownHooks()` so the ORM closes on SIGTERM.

## Entities and repositories

```typescript
@Entity({ repository: () => BookRepository })
export class Book {
  [EntityRepositoryType]?: BookRepository;
  @PrimaryKey() id: number;
  @Property() title: string;
  @ManyToOne(() => Author) author: Rel<Author>;                 // Rel<T>/Ref<T> avoids circular metadata at runtime
  @Property({ hidden: true }) internalNote?: string;            // excluded from JSON
}

export class BookRepository extends EntityRepository<Book> {
  findByTitle(title: string) { return this.findOne({ title }); }
}

@Module({ imports: [MikroOrmModule.forFeature([Book])], providers: [BooksService] })
export class BooksModule {}

@Injectable()
export class BooksService {
  constructor(private readonly books: BookRepository, private readonly em: EntityManager) {}   // custom repo injected by class
  async create(title: string, authorId: number) {
    const book = this.em.create(Book, { title, author: authorId });
    await this.em.flush();                                      // repositories have no persist/flush
    return book;
  }
}
```

Default repositories: `@InjectRepository(Photo) repo: EntityRepository<Photo>`.

## Request context (identity map per request)

- HTTP requests get a forked `EntityManager` from the module's middleware automatically.
- Outside HTTP (queue processors, `@Cron`, event listeners, microservice handlers) the global EM throws a `ValidationError` for `find()`/`flush()`. Decorate the method with `@CreateRequestContext()` (directly above the method, **below** `@Cron()`/`@Process()` etc.); the class needs an `orm` or `em` property. `@EnsureRequestContext()` reuses an existing context.
- Alternative: `registerRequestContext: false, scope: Scope.REQUEST` — makes every EM consumer request-scoped (slower).

## Transactions

- `em.flush()` already wraps queued writes in one transaction.
- Explicit: `await this.em.transactional(async (em) => { em.create(Photo, { name }); })` (forked EM; flushed and committed when the callback resolves; nested calls use savepoints).
- Decorator: `@Transactional()` on an async method of a class with `em`/`orm`.

## Serialization

Don't use `ClassSerializerInterceptor` (class-transformer) with MikroORM entities: it mangles relation wrappers. Use entity options (`hidden: true`, `persist: false`, serializers), `serialize(entity, { populate, exclude, fields, groups })`, or `wrap(entity).toObject()`.

## Multiple databases

One `forRoot()` per database with a unique `contextName` and `registerRequestContext: false` on each (with `forRootAsync`, `contextName` beside `useFactory`). Then `forFeature([Album], 'albums')`, `@InjectRepository(Album, 'albums')`, `@InjectEntityManager('albums')`, `@InjectMikroORM('albums')`, `@InjectMikroORMs()`.

## Testing

`{ provide: getRepositoryToken(Photo), useValue: mockRepo }` (or the custom repository class as token) and `{ provide: EntityManager, useValue: mockEm }`. For multiple contexts: `getRepositoryToken(Album, 'albums')`.

## Workflow

- [ ] 1. Install core, decorators, driver and `@mikro-orm/nestjs`; write `mikro-orm.config.ts` with `ReflectMetadataProvider`.
- [ ] 2. Register `forRoot(config)` or `forRootAsync({ driver, useFactory })`; enable shutdown hooks.
- [ ] 3. Entities with legacy decorators and `Rel<T>`; `forFeature` per module; writes through `em` + `flush`.
- [ ] 4. Add `@CreateRequestContext()` to every non-HTTP entry point that touches the EM.
- [ ] 5. Migrations via the MikroORM CLI using the same config. Build, lint, run tests, start the app.

Sources: [MikroORM](https://docs.nestjs.com/data/mikroorm)
