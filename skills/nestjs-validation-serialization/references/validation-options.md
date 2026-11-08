# Validation and serialization options

Sources: [Validation](https://docs.nestjs.com/application/validation) · [Serialization](https://docs.nestjs.com/application/serialization)

## Contents
- ValidationPipe options
- StandardSchemaValidationPipe options
- Custom error shape
- Valibot and ArkType
- Custom param decorators
- StandardSchemaSerializerInterceptor options and errors
- Non-HTTP transports

## ValidationPipe options

`new ValidationPipe({ ... })`; it extends class-validator's `ValidatorOptions`.

| Option | Effect |
| --- | --- |
| `transform` | Convert payloads to DTO instances, and primitive params to their declared types |
| `whitelist` | Strip properties without validation decorators |
| `forbidNonWhitelisted` | With `whitelist`: reject such properties instead (400) |
| `forbidUnknownValues` | Fail validation of unknown objects |
| `skipMissingProperties` / `skipNullProperties` / `skipUndefinedProperties` | Skip validating missing / null / undefined properties |
| `stopAtFirstError` | Stop at the first failed constraint per property |
| `errorFormat` | `'list'` (default, array of strings) or `'grouped'` (object keyed by property path), v12 |
| `disableErrorMessages` | Omit details from 400 responses (production hardening) |
| `errorHttpStatusCode` | Status for failures (default 400) |
| `exceptionFactory` | `(errors: ValidationError[]) => any`: build your own exception |
| `groups`, `always`, `strictGroups` | class-validator groups |
| `dismissDefaultMessages` | Drop class-validator default messages |
| `validationError.target` / `.value` | Include target/value in `ValidationError` |
| `enableDebugMessages` | Warn when something is misconfigured |

## StandardSchemaValidationPipe options

| Option | Default | Effect |
| --- | --- | --- |
| `transform` | `true` | Handler gets the schema output (coercion, defaults, transforms); `false` passes the original input |
| `validateCustomDecorators` | `false` | Also validate `createParamDecorator()` params that declare a schema |
| `validateOptions` | — | Forwarded to `~standard.validate()` |
| `errorHttpStatusCode` | `400` | Status on failure |
| `exceptionFactory` | — | `(issues) => exception`; each issue has `message` and an optional `path` |

## Custom error shape

```typescript
new StandardSchemaValidationPipe({
  exceptionFactory: (issues) => new UnprocessableEntityException({
    message: 'Validation failed',
    errors: issues.map((i) => ({
      path: i.path?.map((s) => (typeof s === 'object' ? s.key : s)).join('.'),
      message: i.message,
    })),
  }),
});
```

To keep a global error format (e.g. `errorCode`), throw `new BadRequestException('Validation failed', { errorCode: 'VALIDATION_FAILED' })` from `exceptionFactory`, and let the app's global exception filter add the rest.

## Valibot and ArkType

Any Standard Schema library works the same way with the `schema` option:
- Valibot: `v.object({...})` strips, `v.strictObject({...})` rejects unknown keys. Use `v.pipe(v.string(), v.transform(Number))` for coercion.
- ArkType: `type({ ... })`.

Zod quick reference: `z.object` strips, `z.strictObject` rejects, `z.looseObject` keeps unknown keys. Use `z.coerce.number()` for query/path numbers, and `.default()` for defaults. Derive schemas with `.partial()`, `.pick()`, `.omit()`, `.extend()`.

## Custom param decorators

```typescript
@Get() find(@User('email', { schema: z.email() }) email: string) {}   // needs validateCustomDecorators: true on the pipe
```

## StandardSchemaSerializerInterceptor options and errors

- `@SerializeOptions({ schema })` on a handler or class; the handler-level setting wins. Arrays get the item schema applied per element.
- `null`, `undefined`, primitives and `StreamableFile` responses are not processed.
- Constructor defaults: `new StandardSchemaSerializerInterceptor(reflector, { schema, validateOptions })`. When registered via `APP_INTERCEPTOR`, Reflector is injected.
- A response that fails its schema (missing or mistyped property) is treated as a server bug: the client gets `500` instead of partial data, and the issues are logged.

## Non-HTTP transports

Both validation pipes throw HTTP exceptions by default. For WebSockets/microservices, return `new WsException(...)` / `new RpcException(...)` from `exceptionFactory`.
