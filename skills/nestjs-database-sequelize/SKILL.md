---
name: nestjs-database-sequelize
description: Integrates Sequelize with NestJS 12 through @nestjs/sequelize and sequelize-typescript — SequelizeModule.forRoot/forRootAsync, Active Record models with @Table/@Column extending Model, associations (@HasMany, @BelongsTo, @BelongsToMany), forFeature with @InjectModel(User) typed as typeof User, autoLoadModels and synchronize, managed transactions with sequelize.transaction(), migrations with the Sequelize CLI, multiple named connections, connection retries and mocking models with getModelToken. Use when the project uses or wants Sequelize, when adding a model, association, transaction or migration, or when models aren't registered or injected. Not for TypeORM, Drizzle, Prisma, Mongoose or MikroORM (their own skills).
compatibility: NestJS 12.x; @nestjs/sequelize, sequelize, sequelize-typescript, a dialect driver (mysql2, pg, …)
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS + Sequelize

```bash
npm i @nestjs/sequelize sequelize sequelize-typescript pg     # or mysql2, …
npm i -D @types/sequelize
```

## Setup

```typescript
SequelizeModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    dialect: 'postgres',
    uri: config.getOrThrow<string>('DATABASE_URL'),
    autoLoadModels: true,          // models registered with forFeature()
    synchronize: false,            // default true with autoLoadModels — turn off outside throwaway dev databases
  }),
}),
```

Extra options beside the Sequelize constructor's: `retryAttempts` (10), `retryDelay` (3000), `autoLoadModels` (false), `autoCloseConnection` (true), `synchronize` (true). Inject `Sequelize` (from `sequelize-typescript`) anywhere.

## Models (Active Record)

```typescript
@Table
export class User extends Model {
  @Column firstName: string;
  @Column({ defaultValue: true }) isActive: boolean;
  @HasMany(() => Photo) photos: Photo[];
}

@Module({ imports: [SequelizeModule.forFeature([User])], providers: [UsersService] })
export class UsersModule {}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User) private readonly userModel: typeof User) {}
  findOne(id: string) { return this.userModel.findOne({ where: { id }, include: [Photo] }); }
}
```

- Keep models in their domain module. To use a model in another module, export `SequelizeModule` from the owning module.
- `autoLoadModels` skips models only referenced through associations: register every model via `forFeature()` (or list them in `models`).

## Transactions (managed)

```typescript
await this.sequelize.transaction(async (t) => {
  const opts = { transaction: t };
  await this.userModel.create({ firstName: 'Ada' }, opts);
  await this.photoModel.create({ userId: 1 }, opts);
});   // commits when the callback resolves, rolls back on throw
```

Pass `{ transaction: t }` to every call. For testability, hide `sequelize.transaction` behind a small injectable factory instead of mocking `Sequelize`.

## Migrations

Sequelize CLI migrations live outside the Nest app (no DI). Use them instead of `synchronize` for anything with data you care about; keep CLI config reading the same env vars.

## Multiple databases

Name every non-default connection (`name: 'albumsConnection'`, beside `useFactory` for async), then `forFeature([Album], 'albumsConnection')`, `@InjectModel(Album, 'albumsConnection')`, `@InjectConnection('albumsConnection')`, `getConnectionToken('albumsConnection')`. Unnamed connections override each other.

## Testing

`{ provide: getModelToken(User), useValue: { findAll: vi.fn(), findOne: vi.fn() } }`.

## Workflow

- [ ] 1. Install; `forRootAsync` from validated config; decide `synchronize: false` + CLI migrations.
- [ ] 2. Model class with decorators; `forFeature` in its module; `@InjectModel(Model)` typed `typeof Model`.
- [ ] 3. Wrap multi-step writes in `sequelize.transaction`.
- [ ] 4. Tests with `getModelToken` mocks. Build, lint, run tests, start the app.

Sources: [Sequelize](https://docs.nestjs.com/data/sequelize)
