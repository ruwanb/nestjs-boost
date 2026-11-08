# GraphQL schema features

## Contents
- Schema first
- Scalars
- Directives
- Interfaces
- Unions and enums
- Field middleware and extensions
- Mapped types and inheritance
- Complexity plugin and other Apollo plugins
- CLI plugin
- Generating SDL without running the app
- Sharing models with the browser
- Multiple endpoints
- Mercurius

## Schema first

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
  definitions: { path: join(process.cwd(), 'src/graphql.ts'), outputAs: 'class' },   // generated at startup
});
```

On-demand typings: a `generate-typings.ts` script with `new GraphQLDefinitionsFactory().generate({ typePaths, path, outputAs: 'class', watch: true })`. Resolver classes use `@Resolver('Author')`, `@Query()`, `@ResolveField()` matching SDL names; interfaces/unions need a `__resolveType` resolver. Add a `ValidationPipe` for argument validation.

## Scalars

- Built-ins: `ID`, `String`, `Boolean`, `Int`, `Float`, `GraphQLISODateTime` (default for `Date`), `GraphQLTimestamp`.
- `buildSchemaOptions: { dateScalarMode: 'timestamp', numberScalarMode: 'integer' }`.
- Code-first custom scalar class: `@Scalar('Date', () => Date) class DateScalar implements CustomScalar<number, Date> { parseValue, serialize, parseLiteral }` registered as a provider.
- Imported scalars (e.g. `graphql-type-json`): `resolvers: { JSON: GraphQLJSON }` and `@Field(() => GraphQLJSON)`.
- `new GraphQLScalarType({ name: 'UUID', serialize, parseValue, parseLiteral })` + `resolvers: { UUID: CustomUuidScalar }`.

## Directives

```typescript
@Directive('@upper') @Field() title: string;          // also @Directive('@deprecated(reason: "…")')

GraphQLModule.forRoot({
  transformSchema: (schema) => upperDirectiveTransformer(schema, 'upper'),   // mapSchema/getDirective from @graphql-tools/utils
  buildSchemaOptions: { directives: [new GraphQLDirective({ name: 'upper', locations: [DirectiveLocation.FIELD_DEFINITION] })] },
});
```

Directives added with `@Directive()` aren't reflected in the generated schema file.

## Interfaces

- `@InterfaceType() abstract class Character { @Field(() => ID) id: string }` (TypeScript interfaces can't be used).
- `@ObjectType({ implements: () => [Character] }) class Human implements Character`.
- Default `resolveType` needs class instances; otherwise `@InterfaceType({ resolveType(value) { return value.pages ? Book : Author; } })`.
- Shared field resolvers: `@Resolver(() => Character)` class with `@ResolveField` + `inheritResolversFromInterfaces: true`.

## Unions and enums

```typescript
export const ResultUnion = createUnionType({ name: 'ResultUnion', types: () => [Author, Book] as const, resolveType(v) { … } });   // `as const` required
@Query(() => [ResultUnion]) search(): Array<typeof ResultUnion> { … }

export enum AllowedColor { RED, GREEN }
registerEnumType(AllowedColor, { name: 'AllowedColor', description: '…', valuesMap: { RED: { deprecationReason: '…' } } });
```

## Field middleware and extensions

```typescript
const loggerMiddleware: FieldMiddleware = async (ctx: MiddlewareContext, next: NextFn) => { const value = await next(); return value; };
@Field({ middleware: [loggerMiddleware] }) title: string;
GraphQLModule.forRoot({ buildSchemaOptions: { fieldMiddleware: [loggerMiddleware] } });   // global, runs before local
```

- Code first only; no DI; keep them cheap; only on `ObjectType` classes. With `fieldResolverEnhancers`, interceptors/guards also wrap them.
- Metadata: `@Extensions({ role: Role.ADMIN })` on fields/classes/methods; read in middleware via `ctx.info.parentType.getFields()[ctx.info.fieldName].extensions` (field-level permissions).

## Mapped types and inheritance

`PartialType`, `PickType`, `OmitType`, `IntersectionType` from `@nestjs/graphql`, composable; pass the target decorator as the 2nd arg (`PartialType(CreateUserInput, InputType)`) when deriving between kinds. Abstract base classes with `@ObjectType({ isAbstract: true })` / generic resolvers via a factory function returning a class. Custom mapped helpers: treat returned field metadata as read-only.

## Complexity plugin and other Apollo plugins

```typescript
@Plugin()
export class ComplexityPlugin implements ApolloServerPlugin {
  constructor(private gqlSchemaHost: GraphQLSchemaHost) {}
  async requestDidStart(): Promise<GraphQLRequestListener<BaseContext>> {
    const { schema } = this.gqlSchemaHost;
    return {
      async didResolveOperation({ request, document }) {
        const complexity = getComplexity({ schema, operationName: request.operationName, query: document, variables: request.variables,
          estimators: [fieldExtensionsEstimator(), simpleEstimator({ defaultComplexity: 1 })] });
        if (complexity > 20) throw new GraphQLError(`Query is too complex: ${complexity}`);
      },
    };
  }
}
```

`npm i graphql-query-complexity`; register as a provider; `@Field({ complexity: 3 })` or an estimator function; `@Query(() => T, { complexity: … })`. External plugins: `plugins: [ApolloServerPluginCacheControl({ defaultMaxAge: 5 })]`. Mercurius: register Fastify plugins via `plugins: [{ plugin, options }]` (mercurius-upload in `main.ts`).

## CLI plugin

`nest-cli.json`: `"plugins": [{ "name": "@nestjs/graphql", "options": { "typeFileNameSuffix": [".input.ts", ".args.ts", ".entity.ts", ".model.ts"], "introspectComments": true } }]`. Infers `@Field()` from types/optionality; override with explicit `@Field()`. SWC needs `--type-check`; ts-jest needs the `@nestjs/graphql/plugin` AST transformer (same pattern as the Swagger plugin).

## Generating SDL without running the app

```typescript
const app = await NestFactory.create(GraphQLSchemaBuilderModule);
await app.init();
const schema = await app.get(GraphQLSchemaFactory).create([RecipesResolver], [DateScalar], { skipCheck: false, orphanedTypes: [] });
console.log(printSchema(schema));
```

`GraphQLSchemaHost#schema` gives the built schema after `onModuleInit`. Federation entities only referenced through `_entities` go into `orphanedTypes`.

## Sharing models with the browser

`@nestjs/graphql` exposes a decorator shim via the `browser` export condition; bundlers without it can alias `@nestjs/graphql` to `node_modules/@nestjs/graphql/dist/extra/graphql-model-shim`.

## Multiple endpoints

`GraphQLModule.forRoot({ path: '/cats', include: [CatsModule] })` per endpoint. In code first, `include` limits resolvers; types are global unless `@ObjectType({ registerIn: () => CatsModule })` (also on `@InputType`, `@InterfaceType`, `@ArgsType`, `registerEnumType`, `createUnionType`). Prefer the factory form to avoid circular references.

## Mercurius

```typescript
GraphQLModule.forRoot<MercuriusDriverConfig>({ driver: MercuriusDriver, graphiql: true, subscription: true });   // Fastify only
```

GraphiQL at `/graphiql`. Subscriptions: `PubSub` from `mercurius` (`mqemitter`; use `mqemitter-redis` in production), auth via `subscription.onConnect`. Async config with `forRootAsync`. Access the schema with `GraphQLSchemaHost`.
