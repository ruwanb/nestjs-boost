---
name: nestjs-database-typeorm
description: Integrates TypeORM with NestJS 12 through @nestjs/typeorm — TypeOrmModule.forRoot/forRootAsync with ConfigService, entities and relations, autoLoadEntities, forFeature repositories with @InjectRepository, EntitySchema definitions, transactions with DataSource.transaction or QueryRunner, entity subscribers, migrations outside the Nest container, multiple named data sources, custom dataSourceFactory, connection retries, and mocking repositories with getRepositoryToken in tests. Use when the project uses or wants TypeORM (MySQL, PostgreSQL, SQLite, MariaDB, MSSQL), when adding an entity, repository, relation, transaction or migration, or when seeing "Nest can't resolve dependencies of XService (UserRepository)", missing entity metadata or data source naming problems. Not for Drizzle, Prisma, Mongoose, MikroORM or Sequelize (their own skills) or caching (nestjs-caching).
compatibility: NestJS 12.x; @nestjs/typeorm, typeorm and a driver (pg, mysql2, better-sqlite3, …)
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS + TypeORM

```bash
npm i @nestjs/typeorm typeorm pg     # or mysql2, better-sqlite3, …
```

## Default setup

```typescript
// app.module.ts
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    url: config.getOrThrow<string>('DATABASE_URL'),
    autoLoadEntities: true,                          // entities registered via forFeature()
    synchronize: false,                              // never true in production: can drop data
    migrations: ['dist/migrations/*.js'],
  }),
}),

// users/user.entity.ts
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) email: string;
  @OneToMany(() => Photo, (photo) => photo.user) photos: Photo[];
}

// users/users.module.ts
@Module({ imports: [TypeOrmModule.forFeature([User])], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}

// users/users.service.ts
@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}
  findOne(id: string) { return this.users.findOneBy({ id }); }
}
```

- Each feature module registers its own entities with `forFeature([...])`. To use a repository in another module, export `TypeOrmModule` from the owning module (or better, export a service).
- `autoLoadEntities` skips entities only referenced through relations: register every entity with some `forFeature()`.
- Extra module options: `retryAttempts` (10), `retryDelay` (3000 ms), `toRetry(err)`, `verboseRetryLog`, `manualInitialization`.
- Inject `DataSource` / `EntityManager` directly when needed (from `typeorm`).

## Transactions

```typescript
async transfer(from: string, to: string, amount: number) {
  await this.dataSource.transaction(async (manager) => {
    await manager.decrement(Account, { id: from }, 'balance', amount);
    await manager.increment(Account, { id: to }, 'balance', amount);
  });
}
```

Use the `manager` passed to the callback for every statement in the transaction (repositories injected with `@InjectRepository` are outside it; use `manager.getRepository(Entity)`). For manual control use `dataSource.createQueryRunner()` → `connect()` → `startTransaction()` → `commitTransaction()` / `rollbackTransaction()` → `release()` in `finally`. For unit-testability, wrap QueryRunner creation in a small injectable factory instead of mocking `DataSource`.

Packages that write in your transaction (`@nestjs/outbox`, `@nestjs/webhooks`) take the transaction's `EntityManager`, never `dataSource.manager`.

## Migrations

- Migrations run through TypeORM's CLI, outside the Nest container: no DI in migration classes.
- Keep a standalone `DataSource` file (e.g. `src/data-source.ts` exporting `new DataSource({...})`) that reads the same env vars, for the CLI to generate and run migrations; set `migrationsRun` or run them in CI/deploy, never `synchronize` in production.
- Review generated SQL before committing.

## Other features

- **Subscribers:** `@EventSubscriber()` class implementing `EntitySubscriberInterface<User>`, injecting `DataSource` and calling `dataSource.subscribers.push(this)`; add it to `providers`. Cannot be request-scoped.
- **EntitySchema:** `new EntitySchema<User>({ name: 'User', target: User, columns, relations })` then `forFeature([UserSchema])`; `name` must equal the target class name.
- **Multiple databases:** give each non-default data source a `name` (with `forRootAsync`, put `name` beside `useFactory`, not inside); `forFeature([Album], 'albumsConnection')`; `@InjectRepository(Album, 'albumsConnection')`, `@InjectDataSource('albumsConnection')`, `@InjectEntityManager('albumsConnection')`, `getDataSourceToken('albumsConnection')`. Unnamed data sources override each other.
- **Custom factory:** `dataSourceFactory: async (options) => new DataSource(options!).initialize()` beside `useFactory`.

## Testing

```typescript
const moduleRef = await Test.createTestingModule({
  providers: [UsersService, { provide: getRepositoryToken(User), useValue: { findOneBy: vi.fn() } }],
}).compile();
```

For integration/e2e tests, use a real database (Testcontainers, or SQLite only if queries are portable) with migrations applied, not `synchronize`.

## Gotchas

- "Nest can't resolve dependencies of UsersService (UserRepository at index [0])": `TypeOrmModule.forFeature([User])` is missing in that module.
- "No metadata for User was found": entity not registered (`forFeature` or `entities`), or a glob pointing at `.ts` files in `dist`.
- ESM projects: use `.js` extensions in relative imports and `() => Entity` lazy relation targets to avoid circular import crashes.
- Load related data explicitly (`relations: { photos: true }`) rather than enabling eager relations everywhere.

## Workflow

- [ ] 1. Install driver; configure `forRootAsync` from validated config (nestjs-configuration).
- [ ] 2. Create the entity, `forFeature` it in its module, inject the repository in a service.
- [ ] 3. Generate and review a migration; apply it locally.
- [ ] 4. Unit-test services with `getRepositoryToken` mocks; e2e against a real database.
- [ ] 5. Build, lint, run tests, start the app.

Sources: [TypeORM](https://docs.nestjs.com/data/typeorm) · [Database overview](https://docs.nestjs.com/data/overview)
