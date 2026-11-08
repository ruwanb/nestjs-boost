---
name: nestjs-openapi
description: Documents NestJS 12 HTTP APIs with @nestjs/swagger — SwaggerModule and DocumentBuilder setup with a lazy document factory, Swagger UI and JSON/YAML endpoints, @ApiProperty/@ApiBody/@ApiQuery/@ApiParam/@ApiResponse decorators, Standard Schema (Zod, Valibot) bodies converted to OpenAPI, enums, generics, oneOf/allOf, security schemes (bearer, basic, OAuth2, cookie), tags, file uploads, mapped types from @nestjs/swagger, the Swagger CLI plugin (comments introspection, SWC metadata), global parameters and responses, multiple specifications and OpenAPI 3.2 tags. Use when adding Swagger/OpenAPI docs, fixing missing or wrong schemas in the generated spec, exporting openapi.json for client generation, documenting auth, or when Swagger UI is blank/blocked by CSP. Not for GraphQL schemas (nestjs-graphql) or request validation itself (nestjs-validation-serialization).
compatibility: NestJS 12.x; @nestjs/swagger; @fastify/static on Fastify; zod 4.2+ converts natively
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS OpenAPI (Swagger)

```bash
npm i @nestjs/swagger          # Fastify: also npm i @fastify/static
```

## Setup

```typescript
// main.ts — after app.enableVersioning() / setGlobalPrefix()
const config = new DocumentBuilder()
  .setTitle('Store API').setDescription('Public API').setVersion('1.0')
  .addBearerAuth()
  .build();
const documentFactory = () => SwaggerModule.createDocument(app, config);   // lazy: built on first request
SwaggerModule.setup('api', app, documentFactory, { jsonDocumentUrl: 'api/json' });
```

- UI at `/api`, JSON at `/api-json` (or `jsonDocumentUrl`), YAML at `/api-yaml`. `ui: false` keeps raw definitions; `raw: []` keeps the UI only.
- Eager `createDocument()` must run after `enableVersioning()`, or paths lose the version prefix.
- Built-in `app.useSecurityHeaders()` CSP works with Swagger UI; prefer it. A Fastify `helmet` CSP needs `'unsafe-inline'` styles/scripts and `data:` images, which weakens XSS protection app-wide: relax it only when docs are enabled (not in production), and never allow bare `https:` (see reference).
- Gate docs in production if they shouldn't be public (only call `setup()` when enabled by config).

## Describing models: pick one approach per project

| Project validates with | Do this |
| --- | --- |
| class-validator DTOs | Enable the **CLI plugin** (`"plugins": ["@nestjs/swagger"]` in `nest-cli.json`) so `@ApiProperty()` is inferred from types, `?` and validator decorators; add `@ApiProperty()` only to override. Import `PartialType`/`PickType`/`OmitType`/`IntersectionType` from `@nestjs/swagger`, not `@nestjs/mapped-types` |
| Standard Schema (`@Body({ schema })`) | Nothing for Zod ≥4.2 (exposes `~standard.jsonSchema`). Other libraries: `standardSchemaConverter` in `SwaggerDocumentOptions` (zod-openapi, `@valibot/to-json-schema`), branching on `~standard.vendor` |
| No plugin, plain classes | `@ApiProperty()` / `@ApiPropertyOptional()` on every property |

TypeScript erases generics and interfaces: arrays of DTOs in bodies need `@ApiBody({ type: [CreateUserDto] })`; arrays in properties need `type: [String]` without the plugin; circular refs need `type: () => Node`.

## Operations

```typescript
@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  @Post()
  @ApiOperation({ summary: 'Place an order' })
  @ApiCreatedResponse({ type: OrderDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  create(@Body() dto: CreateOrderDto) {}

  @Get()
  @ApiQuery({ name: 'status', enum: OrderStatus, enumName: 'OrderStatus', required: false })
  @ApiOkResponse({ type: [OrderDto] })
  findAll(@Query('status') status?: OrderStatus) {}
}
```

- Shorthand response decorators exist for every common status (`@ApiOkResponse`, `@ApiNotFoundResponse`, `@ApiTooManyRequestsResponse`, … `@ApiDefaultResponse`).
- Enums: add `enumName` so a reusable schema is generated instead of inline values.
- Uploads: `@ApiConsumes('multipart/form-data')` + `@ApiBody` with `format: 'binary'` (see reference).
- Security: `addBearerAuth()` / `addBasicAuth()` / `addOAuth2()` / `addCookieAuth('sid')` in the builder, and the matching `@ApiBearerAuth()` / `@ApiBasicAuth()` / `@ApiOAuth2(['scope'])` / `@ApiCookieAuth()` on controllers or routes.
- Hide: `@ApiExcludeController()`, `@ApiExcludeEndpoint()`, `@ApiHideProperty()`. Rename a schema: `@ApiSchema({ name: 'CreateCatRequest' })`.
- Every route on the docs and generated clients uses `operationId` = `Controller_method`; customize with `operationIdFactory`.

## Plugin gotchas

- The plugin runs only through the Nest CLI compiler. With SWC: `nest start -b swc --type-check`; monorepos generate `metadata.ts` with `PluginMetadataGenerator` and call `await SwaggerModule.loadPluginMetadata(metadata)` before `createDocument()`.
- Test runners compile in memory without the plugin: for ts-jest add the `@nestjs/swagger/plugin` AST transformer (reference), or assert on the spec in a build-based test.
- `introspectComments: true` turns JSDoc into descriptions/summaries.
- The plugin documents but does not validate: keep the class-validator decorators.

## Workflow

- [ ] 1. Install; add the builder + lazy factory to `main.ts` after prefix/versioning.
- [ ] 2. Choose the model approach from the table; enable the CLI plugin for DTO projects.
- [ ] 3. Add tags, auth schemes, response types and enum names; hide internal routes.
- [ ] 4. Add an e2e test that GETs `/api-json` and checks a path and schema exist (or write the document to `openapi.json` in CI for client generation).
- [ ] 5. Build, lint, run tests, start the app and open `/api`.

## Reference files

- `references/swagger-reference.md`: document and setup options, security schemes, file upload schema, generic paginated responses, oneOf/getSchemaPath/extra models, global parameters/responses, multiple specs and dropdown, OpenAPI 3.2 tags, plugin options and ts-jest transformer, Fastify CSP. Read when going beyond the basics above.

Sources: [Introduction](https://docs.nestjs.com/openapi/introduction) · [Types and parameters](https://docs.nestjs.com/openapi/types-and-parameters) · [Operations](https://docs.nestjs.com/openapi/operations) · [Security](https://docs.nestjs.com/openapi/security) · [Mapped types](https://docs.nestjs.com/openapi/mapped-types) · [Decorators](https://docs.nestjs.com/openapi/decorators) · [CLI plugin](https://docs.nestjs.com/openapi/cli-plugin) · [Other features](https://docs.nestjs.com/openapi/other-features)
