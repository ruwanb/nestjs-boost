---
name: nestjs-validation-serialization
description: Validates and transforms NestJS 12 request input (body, query, params) and shapes responses — StandardSchemaValidationPipe with Zod/Valibot/ArkType schemas via the decorator `schema` option, or ValidationPipe with class-validator DTOs; coercing query strings to numbers with defaults; rejecting unknown fields; mapped/derived DTOs; and hiding fields such as passwords with StandardSchemaSerializerInterceptor or ClassSerializerInterceptor. Use when adding or fixing request validation, pagination/query parsing, DTOs, "strip/forbid unknown properties", validation error format, or when a sensitive field leaks in responses, even if the user only says "make sure the input is valid" or "don't return X". Not for config/env validation (nestjs-configuration) or OpenAPI docs (nestjs-openapi).
compatibility: NestJS 12.x; zod (or valibot/arktype) for schema validation, or class-validator + class-transformer for DTO classes
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-04"
---

# NestJS validation and serialization

NestJS 12 ships two equally supported validation flows. Both pipes can be registered together; each validates only the parameters it understands.

| | Schema-first | Class-based DTOs |
| --- | --- | --- |
| Pipe | `StandardSchemaValidationPipe` | `ValidationPipe` |
| Rules live in | A Zod/Valibot/ArkType schema; the type is inferred | Decorators on a DTO class |
| Attach with | `@Body({ schema })`, `@Query({ schema })`, `@Param('id', { schema })` | Parameter typed with the DTO class |
| Unknown fields | `z.strictObject()` rejects, `z.object()` strips | `whitelist: true` strips, plus `forbidNonWhitelisted: true` rejects |
| Responses | `StandardSchemaSerializerInterceptor` + `@SerializeOptions({ schema })` | `ClassSerializerInterceptor` + `@Exclude()` |

**Pick the flow by detection:** `zod`/`valibot`/`arktype` in dependencies → schema-first. `class-validator` → class-based. Neither → schema-first with Zod: no reflection metadata, and the same library `@nestjs/config` uses for env validation in v12. Don't mix flows inside one feature.

## Default recipe: schema-first

```typescript
// main.ts — global, safe: only parameters that declare a schema are validated
app.useGlobalPipes(new StandardSchemaValidationPipe());
```

```typescript
// products/create-product.schema.ts
export const createProductSchema = z.strictObject({           // strictObject: unknown keys → 400
  name: z.string().trim().min(1),
  price: z.number().positive(),                               // body numbers are NOT coerced: "5" → 400
  tags: z.array(z.string()).optional(),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

// products/list-products.query.ts — query strings ARE strings: coerce + defaults + bounds
export const listProductsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListProductsQuery = z.infer<typeof listProductsQuery>;
```

```typescript
@Post() create(@Body({ schema: createProductSchema }) dto: CreateProductDto) {}
@Get() list(@Query({ schema: listProductsQuery }) query: ListProductsQuery) {}
@Get(':id') findOne(@Param('id', { schema: z.coerce.number().int().positive() }) id: number) {}
```

The handler receives the schema's **output** (coerced, defaulted, trimmed). Invalid input returns `400` with `message: ["price: ...", ...]`.

## Class-based recipe

```typescript
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

export class CreateProductDto {
  @IsString() @IsNotEmpty() name: string;
  @IsNumber() @IsPositive() price: number;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

// query values: documented per-parameter conversion with defaults
@Get() list(
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,   // range check: throw BadRequestException, or use a schema
) {}
```

- `transform: true` turns payloads into DTO instances and converts primitive path/query params from their declared types. With it off, convert explicitly with `ParseIntPipe`/`ParseBoolPipe`.
- Arrays of DTOs in a body: `@Body(new ParseArrayPipe({ items: CreateUserDto })) dtos: CreateUserDto[]`. Arrays in a query (`?ids=1,2`): `new ParseArrayPipe({ items: Number, separator: ',' })`.
- For bounded query numbers (min/max), a schema (`z.coerce.number().int().min(1).max(100)`) is the least code; `StandardSchemaValidationPipe` and `ValidationPipe` can coexist.
- Derive DTOs with `PartialType`, `PickType`, `OmitType`, `IntersectionType` from `@nestjs/mapped-types` (or `@nestjs/swagger` when using OpenAPI). With schemas, use `.partial()`, `.pick()`, `.omit()`, `.extend()`.
- v12 adds `errorFormat: 'grouped'` (errors keyed by property path) next to the default `'list'`.

## Never hand-parse input in services

Validation belongs in the pipe layer. Parsing `page`/`limit` strings or checking `typeof body.price` inside a service bypasses the shared 400 format and OpenAPI generation, and repeats work in every handler. Use the schema/DTO recipes above, or the `Parse*Pipe` + `DefaultValuePipe` pair for a single param: `@Query('page', new DefaultValuePipe(1), ParseIntPipe)`.

## Hiding response fields

Enforce it once, centrally, so future endpoints are covered too:

- **Schema allowlist (default):** a response schema lists exactly what may leave the API; `z.object()` strips everything else.

  ```typescript
  export const userResponseSchema = z.object({ id: z.number(), email: z.string(), name: z.string() });

  @Controller('users')
  @UseInterceptors(StandardSchemaSerializerInterceptor)
  @SerializeOptions({ schema: userResponseSchema })        // class level: every handler; arrays → per element
  export class UsersController {}
  ```

  App-wide: `{ provide: APP_INTERCEPTOR, useClass: StandardSchemaSerializerInterceptor }` (Nest injects `Reflector`). Handlers without a schema pass through unchanged.

- **Class-based:** `@Exclude() passwordHash` on the entity, plus `ClassSerializerInterceptor` (global via `APP_INTERCEPTOR`). It only applies to **class instances**. If services return plain objects, add `@SerializeOptions({ type: UserEntity })` so they are converted first; otherwise the field still leaks.

## Gotchas

- Zod requires `strictNullChecks` in `tsconfig.json`.
- `ValidationPipe` validates only class-typed parameters. Interfaces are erased (`metatype` is `Object`), so nothing is validated.
- `ValidationPipe` skips custom param decorators unless `validateCustomDecorators: true`.
- Global pipes in a hybrid app don't cover connected microservices by default. For WebSockets/microservices, return `WsException`/`RpcException` from `exceptionFactory`.
- Path and query values always arrive as strings: coerce them explicitly (`z.coerce.number()`, `ParseIntPipe`, or `transform: true` for primitive params).

## Workflow

- [ ] 1. Detect the flow (dependencies), and install what's missing (`npm i zod`, or `npm i class-validator class-transformer`).
- [ ] 2. Register the pipe once, globally.
- [ ] 3. Write the schema/DTO next to the feature; attach it to the parameter.
- [ ] 4. For responses with sensitive or internal fields, add a response schema (or `@Exclude` + `type`).
- [ ] 5. Add e2e cases for the 400s (missing field, wrong type, unknown field) and for hidden fields; run build, lint and tests.

## Reference files

- `references/validation-options.md`: every `ValidationPipe` and `StandardSchemaValidationPipe` option, Valibot/ArkType equivalents, arrays and custom decorators, and schema serialization errors. Read when tuning options or using a library other than Zod.

Sources: [Validation](https://docs.nestjs.com/application/validation) · [Serialization](https://docs.nestjs.com/application/serialization) · [Pipes](https://docs.nestjs.com/pipes)
