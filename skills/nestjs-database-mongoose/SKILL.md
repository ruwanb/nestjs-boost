---
name: nestjs-database-mongoose
description: Integrates MongoDB with NestJS 12 through @nestjs/mongoose — MongooseModule.forRoot/forRootAsync, decorator schemas with @Schema/@Prop/SchemaFactory and HydratedDocument types, references and typed populate, raw() nested objects, subdocuments and DocumentArray types, @Virtual properties, forFeature models injected with @InjectModel, hooks and plugins via forFeatureAsync or connectionFactory, discriminators, transactions with connection.startSession(), multiple named connections, connection events with onConnectionCreate, and mocking models with getModelToken. Use when the project uses or wants MongoDB/Mongoose, when adding a schema, model, populate, middleware hook or transaction, or when seeing model injection errors. Not for SQL ORMs (TypeORM, Drizzle, Prisma, MikroORM, Sequelize skills) or MongoDB via TypeORM (nestjs-database-typeorm).
compatibility: NestJS 12.x; @nestjs/mongoose, mongoose
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS + Mongoose

```bash
npm i @nestjs/mongoose mongoose
```

## Setup

```typescript
// app.module.ts
MongooseModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    uri: config.getOrThrow<string>('MONGODB_URI'),
    onConnectionCreate: (connection: Connection) => {
      connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
      return connection;
    },
  }),
}),
```

`forRoot(uri, options)` takes `mongoose.connect()` options plus Nest extras (`connectionName`, `connectionFactory`, `onConnectionCreate`).

## Schema → model → service

```typescript
// cats/schemas/cat.schema.ts
export type CatDocument = HydratedDocument<Cat>;

@Schema({ timestamps: true })                                   // collection: "cats"
export class Cat {
  @Prop({ required: true }) name: string;
  @Prop() age: number;
  @Prop([String]) tags: string[];
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' }) owner: mongoose.Types.ObjectId;   // not always populated
  @Prop(raw({ firstName: { type: String }, lastName: { type: String } })) details: Record<string, any>;
  @Virtual({ get: function (this: Cat) { return `${this.name} (${this.age})`; } }) label: string;
}
export const CatSchema = SchemaFactory.createForClass(Cat);

// cats/cats.module.ts
@Module({ imports: [MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema }])], providers: [CatsService] })
export class CatsModule {}

// cats/cats.service.ts
@Injectable()
export class CatsService {
  constructor(@InjectModel(Cat.name) private readonly catModel: Model<Cat>) {}
  create(dto: CreateCatDto) { return new this.catModel(dto).save(); }
  findAll() { return this.catModel.find().lean().exec(); }
  findWithOwner(id: string) { return this.catModel.findById(id).populate<{ owner: Owner }>('owner').exec(); }
}
```

- Keep schemas next to their domain module. To share a model, export `MongooseModule` from the owning module (or export a service).
- Type references as `ObjectId` unless always populated, then populate with an explicit generic.
- Subdocuments: `@Prop(NameSchema) name: Name` with `HydratedDocument<Person, { name: Types.Subdocument<Types.ObjectId> & Name }>`; arrays: `@Prop([NameSchema])` with `Types.DocumentArray<Name>`.
- Validate request input with DTOs/schemas (nestjs-validation-serialization) — Mongoose validation is a second line, not the API contract. Validate id parameters (e.g. a 24-hex-character rule in your schema/DTO) before querying, so malformed ids get a 400 instead of a Mongoose `CastError` 500.

## Hooks, plugins, discriminators

```typescript
MongooseModule.forFeatureAsync([{
  name: Cat.name,
  imports: [ConfigModule], inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const schema = CatSchema;
    schema.pre('save', function () { /* … */ });
    schema.plugin(autopopulate);
    return schema;
  },
}]),
```

- Global plugins: `forRoot(uri, { connectionFactory: (conn) => { conn.plugin(p); return conn; } })` (before models are created).
- Discriminators: base schema with `discriminatorKey: 'kind'`, then `forFeature([{ name: Event.name, schema: EventSchema, discriminators: [{ name: SignUpEvent.name, schema: SignUpEventSchema }] }])`.
- `DefinitionsFactory.createForClass(Cat)` gives a raw definition to tweak by hand.

## Transactions

```typescript
constructor(@InjectConnection() private readonly connection: Connection) {}

async transfer() {
  const session = await this.connection.startSession();
  try {
    await session.withTransaction(async () => {
      await this.accounts.updateOne({ _id: a }, { $inc: { balance: -10 } }, { session });
      await this.accounts.updateOne({ _id: b }, { $inc: { balance: 10 } }, { session });
    });
  } finally { await session.endSession(); }
}
```

Start sessions from the injected connection, not `mongoose.startSession()`. Transactions need a replica set (or Atlas).

## Multiple connections

`forRoot(uri, { connectionName: 'cats' })` (names are mandatory with several connections), `forFeature([...], 'cats')`, `@InjectModel(Cat.name, 'cats')`, `@InjectConnection('cats')`, `getConnectionToken('cats')`, `getModelToken(Cat.name, 'cats')`.

## Testing

Unit: `{ provide: getModelToken(Cat.name), useValue: { find: vi.fn().mockReturnValue({ exec: vi.fn() }) } }`. Integration: `mongodb-memory-server` or a Testcontainers MongoDB (replica set if you use transactions).

## Workflow

- [ ] 1. Install; `forRootAsync` from validated config.
- [ ] 2. Schema class + `SchemaFactory`; `forFeature` in the feature module; inject the model.
- [ ] 3. Add indexes (`@Prop({ index: true })` / `schema.index()`), hooks, discriminators as needed.
- [ ] 4. Tests with `getModelToken` mocks; e2e against a real/in-memory MongoDB.
- [ ] 5. Build, lint, run tests, start the app.

Sources: [MongoDB](https://docs.nestjs.com/data/mongodb)
