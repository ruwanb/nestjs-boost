---
name: nestjs-graphql
description: Builds GraphQL APIs with NestJS 12 and @nestjs/graphql v14 — Apollo Server 5 (@nestjs/apollo) or Mercurius drivers, code-first (@ObjectType, @Field, @Resolver, @Query, @Mutation, @ResolveField, @Args, @InputType, @ArgsType) or schema-first (typePaths, generated definitions), GraphiQL (playground removed), context with req/res, subscriptions over graphql-ws with PubSub, filters and onConnect auth, custom scalars, directives, interfaces, unions and enums, field middleware, mapped types, Apollo plugins and query complexity, extensions, the GraphQL CLI plugin, schema generation, sharing models, guards/interceptors/filters with GqlExecutionContext, fieldResolverEnhancers, and Apollo/Mercurius Federation 1 and 2 with subgraphs and gateways. Use when adding or debugging a GraphQL endpoint, resolvers, types, subscriptions, federation, or migrating from playground/subscriptions-transport-ws/Apollo Server 4. Not for REST/OpenAPI (nestjs-openapi) or WebSocket gateways (nestjs-websockets).
compatibility: NestJS 12.x; @nestjs/graphql v14, @nestjs/apollo v14 (Apollo Server v5) or @nestjs/mercurius; graphql
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS GraphQL

## Install and register

```bash
npm i @nestjs/graphql @nestjs/apollo @apollo/server @as-integrations/express5 graphql   # Express/Node adapter
# Fastify + Apollo: @as-integrations/fastify instead;  Fastify + Mercurius: @nestjs/graphql @nestjs/mercurius graphql mercurius
```

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    autoSchemaFile: join(process.cwd(), 'src/schema.gql'),   // code first; `true` = in memory
    sortSchema: true,
    graphiql: config.get('NODE_ENV') !== 'production',        // GraphiQL (playground was removed in v14)
    context: ({ req, res }) => ({ req, res }),                // a FUNCTION: per-request context
    subscriptions: { 'graphql-ws': true },
  }),
}),
```

- `@nestjs/apollo` v14 requires Apollo Server v5 (`@apollo/server`). `playground` is only a deprecated boolean alias for `graphiql`. `subscriptions-transport-ws` support is removed — use `graphql-ws`.
- Detect the project's approach (code first: `autoSchemaFile`; schema first: `typePaths`) and stay with it.
- Node adapter: use the Apollo driver; Mercurius requires Fastify.

## Code first essentials

```typescript
@ObjectType({ description: 'Author' })
export class Author {
  @Field(() => ID) id: string;
  @Field({ nullable: true }) firstName?: string;
  @Field(() => [Post]) posts: Post[];
}

@InputType()
export class CreatePostInput {
  @Field() @MinLength(3) title: string;
  @Field(() => Int, { nullable: true }) votes?: number;
}

@ArgsType()
export class GetAuthorArgs {
  @Field(() => ID) id: string;
}

@Resolver(() => Author)
export class AuthorsResolver {
  constructor(private readonly authors: AuthorsService, private readonly posts: PostsService) {}

  @Query(() => Author, { name: 'author', nullable: true })
  author(@Args() { id }: GetAuthorArgs) { return this.authors.findOne(id); }

  @Mutation(() => Post)
  createPost(@Args('input') input: CreatePostInput) { return this.posts.create(input); }

  @ResolveField('posts', () => [Post])
  posts(@Parent() author: Author) { return this.posts.findByAuthor(author.id); }   // batch with DataLoader to avoid N+1
}
```

- Types need explicit `() => Int | Float | ID | [Type]` where TypeScript reflection can't tell (numbers, arrays, nullables); or enable the GraphQL CLI plugin (`"plugins": ["@nestjs/graphql"]`, files `*.input.ts`, `*.args.ts`, `*.entity.ts`, `*.model.ts`).
- Arrays/nullability: `nullable: 'items' | 'itemsAndList'`.
- Validation: a global `ValidationPipe` (or `StandardSchemaValidationPipe`) validates `@Args` classes.
- Derive input types with `PartialType`, `PickType`, `OmitType`, `IntersectionType` from **`@nestjs/graphql`**.
- `@Resolver` on methods isn't supported in code first. Register resolvers as providers.
- Scaffold with `nest g resource` (GraphQL code first option).

## Subscriptions

```typescript
{ provide: PUB_SUB, useValue: new PubSub() }       // graphql-subscriptions; in-memory — use a Redis-backed PubSub with several instances

@Subscription(() => Comment, { filter: (payload, vars) => payload.commentAdded.postId === vars.postId })
commentAdded(@Args('postId') postId: string) { return this.pubSub.asyncIterableIterator('commentAdded'); }

// in a mutation
await this.pubSub.publish('commentAdded', { commentAdded: comment });   // payload shape: { <subscriptionName>: value } unless `resolve` is used
```

Authenticate in `subscriptions['graphql-ws'].onConnect(ctx)` (read `ctx.connectionParams`, store the user on `ctx.extra`) and build `context: ({ req, extra }) => …`. Custom server: pass `server: new WebSocketServer({ noServer: true, path })`.

## Guards, interceptors, filters

- Convert contexts: `GqlExecutionContext.create(context).getContext().req` in guards/interceptors/param decorators; `GqlArgumentsHost.create(host)` in filters implementing `GqlExceptionFilter` (return/throw the error; there is no response object).
- Global enhancers run on root resolvers (Query/Mutation/Subscription) only. `fieldResolverEnhancers: ['guards', 'interceptors', 'filters']` enables them for field resolvers — costly on large lists.
- `CacheInterceptor` doesn't work in GraphQL (runs per field).
- With `@nestjs/authentication` / `@nestjs/authorization`, see those skills for the context setup.

## Hardening

Limit query cost with an Apollo `@Plugin()` using `graphql-query-complexity` (`fieldExtensionsEstimator` + `simpleEstimator`, `complexity` on fields; see `references/schema-features.md`); disable GraphiQL on public non-production hosts.

## Workflow

- [ ] 1. Install the driver set for the adapter; register `GraphQLModule` with config-driven options.
- [ ] 2. Model types/inputs/args; resolvers + services per domain module; validation pipe.
- [ ] 3. Field resolvers with batching; subscriptions with a shared PubSub provider; auth in context/onConnect.
- [ ] 4. Complexity limits; error formatting; enhancers where needed.
- [ ] 5. E2E tests: `request(app.getHttpServer()).post('/graphql').send({ query, variables })` and assert `data`/`errors`. Build, lint, run tests, start the app and open GraphiQL.

## Reference files

- `references/schema-features.md`: schema first setup and typings generation, scalars (date/number modes, custom), directives, interfaces (`resolveType`, `inheritResolversFromInterfaces`), unions/enums, field middleware, extensions, mapped types, CLI plugin, SDL generation, sharing models, multiple endpoints, Mercurius. Read when using any of these.
- `references/federation.md`: Apollo and Mercurius federation (subgraph drivers, `@key`/`@ResolveReference`/`@extends`, Federation 2, gateway with `IntrospectAndCompose`, `@inaccessible`, subscriptions caveat). Read when building subgraphs or gateways.

Sources: [Quick start](https://docs.nestjs.com/graphql/quick-start) · [Resolvers](https://docs.nestjs.com/graphql/resolvers) · [Mutations](https://docs.nestjs.com/graphql/mutations) · [Subscriptions](https://docs.nestjs.com/graphql/subscriptions) · [Scalars](https://docs.nestjs.com/graphql/scalars) · [Directives](https://docs.nestjs.com/graphql/directives) · [Interfaces](https://docs.nestjs.com/graphql/interfaces) · [Unions and enums](https://docs.nestjs.com/graphql/unions-and-enums) · [Field middleware](https://docs.nestjs.com/graphql/field-middleware) · [Mapped types](https://docs.nestjs.com/graphql/mapped-types) · [Plugins](https://docs.nestjs.com/graphql/plugins) · [Complexity](https://docs.nestjs.com/graphql/complexity) · [Extensions](https://docs.nestjs.com/graphql/extensions) · [CLI plugin](https://docs.nestjs.com/graphql/cli-plugin) · [Generating SDL](https://docs.nestjs.com/graphql/generating-sdl) · [Sharing models](https://docs.nestjs.com/graphql/sharing-models) · [Other features](https://docs.nestjs.com/graphql/other-features) · [Federation](https://docs.nestjs.com/graphql/federation)
