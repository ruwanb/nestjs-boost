# GraphQL federation

## Contents
- Packages and drivers
- Users subgraph (owns the entity)
- Posts subgraph (references and extends it)
- Federation 2
- Gateway
- Mercurius federation
- Subscriptions and hiding operations

## Packages and drivers

| Role | Apollo | Mercurius |
| --- | --- | --- |
| Subgraph | `npm i @apollo/subgraph`; `ApolloFederationDriver` / `ApolloFederationDriverConfig` from `@nestjs/apollo` | `npm i @apollo/subgraph @nestjs/mercurius`; `MercuriusFederationDriver` |
| Gateway | `npm i @apollo/gateway`; `ApolloGatewayDriver` / `ApolloGatewayDriverConfig` | `npm i @mercuriusjs/gateway`; `MercuriusGatewayDriver` |

## Users subgraph (owns the entity)

```typescript
@ObjectType()
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID) id: number;
  @Field() name: string;
}

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly users: UsersService) {}
  @Query(() => User) getUser(@Args('id') id: number) { return this.users.findById(id); }
  @ResolveReference()
  resolveReference(reference: { __typename: string; id: number }) { return this.users.findById(reference.id); }   // called by the gateway
}

GraphQLModule.forRoot<ApolloFederationDriverConfig>({ driver: ApolloFederationDriver, autoSchemaFile: true }),
```

Schema first: `type User @key(fields: "id") { … }` and `extend type Query { … }` with `typePaths`.

## Posts subgraph (references and extends it)

```typescript
@ObjectType()
@Directive('@extends')                       // Federation 1 only
@Directive('@key(fields: "id")')
export class User {
  @Field(() => ID) @Directive('@external') id: number;   // Federation 1 only
  @Field(() => [Post]) posts?: Post[];
}

@Resolver(() => User)
export class UsersResolver {
  @ResolveField(() => [Post]) posts(@Parent() user: User) { return this.posts.forAuthor(user.id); }
}

@Resolver(() => Post)
export class PostsResolver {
  @ResolveField(() => User) user(@Parent() post: Post) { return { __typename: 'User', id: post.authorId }; }   // reference, resolved by the Users subgraph
}

GraphQLModule.forRoot<ApolloFederationDriverConfig>({
  driver: ApolloFederationDriver,
  autoSchemaFile: true,
  buildSchemaOptions: { orphanedTypes: [User] },      // entity only reachable via _entities
}),
```

## Federation 2

- Code first: `autoSchemaFile: { federation: 2 }` — Nest adds the `@link` directive.
- Schema first: `extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])`.
- Entities have no originating subgraph: drop `extend`, `@extends`, `@external`, and no need to extend `Query`.
- Mercurius doesn't fully support Federation 2.

## Gateway

```typescript
GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
  driver: ApolloGatewayDriver,
  server: { /* Apollo Server options, e.g. context */ },
  gateway: {
    supergraphSdl: new IntrospectAndCompose({
      subgraphs: [
        { name: 'users', url: 'http://user-service/graphql' },
        { name: 'posts', url: 'http://post-service/graphql' },
      ],
    }),
  },
}),
```

Other gateway options (header forwarding, polling) come from `@apollo/gateway`'s own API; pass them in `gateway`.

## Mercurius federation

```typescript
GraphQLModule.forRoot<MercuriusFederationDriverConfig>({ driver: MercuriusFederationDriver, autoSchemaFile: true });   // subgraph (or typePaths)
GraphQLModule.forRoot<MercuriusGatewayDriverConfig>({
  driver: MercuriusGatewayDriver,
  gateway: { services: [{ name: 'users', url: 'http://user-service/graphql' }, { name: 'posts', url: 'http://post-service/graphql' }] },
});
```

## Subscriptions and hiding operations

- Subgraphs support subscriptions (`subscriptions` for Apollo, `subscription: true` for Mercurius), but `ApolloGatewayDriver` doesn't forward them: use Apollo Router with federated subscriptions, or the Mercurius gateway (`subscription: true` and `wsUrl` per service).
- Keep a field/operation out of the public supergraph with Federation 2 `@inaccessible`: `@Directive('@inaccessible')`. It stays executable on the subgraph.
- Generate SDL offline for federation with `GraphQLSchemaFactory`, passing entity stubs in `orphanedTypes`.
