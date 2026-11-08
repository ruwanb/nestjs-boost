# @nestjs/swagger reference

## Contents
- Document options
- Setup options
- Security schemes
- File uploads
- Composition: oneOf, extra models, generic responses
- Enums, examples, raw definitions
- Global parameters and responses
- Multiple specifications
- OpenAPI 3.2 tags
- CLI plugin options and test integration
- Fastify helmet CSP

## Document options

`SwaggerModule.createDocument(app, config, options: SwaggerDocumentOptions)`:

| Option | Purpose |
| --- | --- |
| `include` | Modules to include (multiple specs) |
| `deepScanRoutes` | Also scan modules imported by `include` modules |
| `extraModels` | Models not referenced by any route |
| `ignoreGlobalPrefix` | Ignore `setGlobalPrefix()` |
| `operationIdFactory(controllerKey, methodKey, version)` | Custom `operationId` (default `Controller_method[_version]`) |
| `linkNameFactory` | Names for response `links` |
| `autoTagControllers` | Tag by controller name (default `true`) |
| `onlyIncludeDecoratedEndpoints` | Only routes with `@ApiIncludeEndpoint()` |
| `excludeDynamicDefaults` | Drop non-plain runtime defaults (e.g. `new Date()`) so the doc is stable |
| `standardSchemaConverter(schema, { schemaType })` | Convert Standard Schemas; return `undefined` to fall back |

Standard Schema converters:

```typescript
standardSchemaConverter: (schema, { schemaType }) => {
  if (hasVendor(schema, 'zod')) {
    const converted = createSchema(schema as never, { io: schemaType, openapiVersion: '3.0.0' });   // zod-openapi
    return { schema: converted.schema, components: converted.components };
  }
  if (hasVendor(schema, 'valibot')) {
    return { schema: toJsonSchema(schema as never, { target: 'openapi-3.0', typeMode: schemaType }) };   // @valibot/to-json-schema
  }
  return undefined;
},
// hasVendor = (s, v) => (s as any)?.['~standard']?.vendor === v
```

Always narrow by vendor; passing the wrong library's schema throws at generation time. Pass `schemaType` through (input = what clients send, output = after parsing).

## Setup options

`SwaggerModule.setup(path, app, documentOrFactory, options: SwaggerCustomOptions)`: `useGlobalPrefix`, `ui` (replaces deprecated `swaggerUiEnabled`), `raw` (`true | false | ['json' | 'yaml']`), `swaggerUrl`, `jsonDocumentUrl`, `yamlDocumentUrl`, `patchDocumentOnRequest(req, res, doc)` (per-request edits, e.g. hide admin paths), `explorer`, `swaggerOptions` (Swagger UI options such as `persistAuthorization`, `urls`), `customCss`, `customCssUrl`, `customJs`, `customJsStr`, `customfavIcon`, `customSiteTitle`.

## Security schemes

| Builder | Decorator |
| --- | --- |
| `addBasicAuth()` | `@ApiBasicAuth()` |
| `addBearerAuth()` | `@ApiBearerAuth()` |
| `addOAuth2()` | `@ApiOAuth2(['pets:write'])` |
| `addCookieAuth('optional-session-id')` | `@ApiCookieAuth()` |
| `addSecurity('name', scheme)` | `@ApiSecurity('name')` |

`@nestjs/authentication` sessions use the `__Host-sid` cookie by default: `addCookieAuth('__Host-sid')`.

## File uploads

```typescript
class FileUploadDto { @ApiProperty({ type: 'string', format: 'binary' }) file: any; }
class FilesUploadDto { @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } }) files: any[]; }

@UseInterceptors(FileInterceptor('file'))
@ApiConsumes('multipart/form-data')
@ApiBody({ description: 'Avatar', type: FileUploadDto })
upload(@UploadedFile() file: Express.Multer.File) {}
```

## Composition: oneOf, extra models, generic responses

```typescript
@ApiExtraModels(Cat, Dog, PaginatedDto)
@Controller('pets')
export class PetsController {
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedDto) },
        { properties: { results: { type: 'array', items: { $ref: getSchemaPath(CatDto) } } } },
      ],
    },
  })
  findAll() {}
}

@ApiProperty({ oneOf: [{ $ref: getSchemaPath(Cat) }, { $ref: getSchemaPath(Dog) }] }) pet: Cat | Dog;
```

Wrap the paginated pattern in a reusable decorator with `applyDecorators(ApiExtraModels(PaginatedDto, model), ApiOkResponse({ schema: … }))` taking `model: Type<any>`.

## Enums, examples, raw definitions

- `@ApiProperty({ enum: Role, enumName: 'Role', isArray: true })`; `@ApiQuery`/`@ApiParam` accept `enumName` too. Plugin `autoFillEnumName` fills it.
- Examples: `@ApiProperty({ example: 'Kitty' })` or `examples: { a: { value: … } }`.
- Raw: `@ApiProperty({ type: 'array', items: { type: 'array', items: { type: 'number' } } })` for nested arrays.
- Circular: `@ApiProperty({ type: () => Node })`.

## Global parameters and responses

```typescript
new DocumentBuilder()
  .addGlobalParameters({ name: 'tenantId', in: 'header' })
  .addGlobalResponse({ status: 500, description: 'Internal server error' })
```

## Multiple specifications

```typescript
SwaggerModule.setup('api/cats', app, () => SwaggerModule.createDocument(app, catsConfig, { include: [CatsModule] }));
SwaggerModule.setup('api/dogs', app, () => SwaggerModule.createDocument(app, dogsConfig, { include: [DogsModule] }));
```

Dropdown in one UI: `explorer: true` and `swaggerOptions.urls: [{ name: 'Cats', url: 'api/cats/json' }, …]` pointing at each spec's JSON (`jsonDocumentUrl`).

## OpenAPI 3.2 tags

```typescript
new DocumentBuilder()
  .setOpenAPIVersion('3.2.0')
  .addTag('Animals', 'Everything about animals', undefined, { kind: 'nav' })
  .addTag('Cats', 'Cat operations', undefined, { parent: 'Animals' })
```

`parent`/`kind`/`summary` require `setOpenAPIVersion('3.2.0')` and only work via `addTag()` (`@ApiTags()` ignores them).

## CLI plugin options and test integration

```json
{ "compilerOptions": { "plugins": [{ "name": "@nestjs/swagger", "options": { "introspectComments": true, "classValidatorShim": true } }] } }
```

Options: `dtoFileNameSuffix` (`['.dto.ts', '.entity.ts']`), `controllerFileNameSuffix` (`['.controller.ts']`), `classValidatorShim` (true), `classTransformerShim` (false | true | `'exclusive'`), `dtoKeyOfComment` (`'description'`), `controllerKeyOfComment` (`'summary'`), `introspectComments` (false), `skipAutoHttpCode`, `skipDefaultValues`, `autoFillEnumName`, `esmCompatible` (detected per file).

Only files matching the suffixes are processed: name DTO files `*.dto.ts`.

ts-jest e2e: create a transformer file

```javascript
const transformer = require('@nestjs/swagger/plugin');
module.exports.name = 'nestjs-swagger-transformer';
module.exports.version = 1;   // bump when options change
module.exports.factory = (cs) => transformer.before({}, cs.program);
```

and reference it in `transform: { '^.+\\.(t|j)s$': ['ts-jest', { astTransformers: { before: ['<path>'] } }] }` (jest 29+). Clear the jest cache after changes.

SWC: `nest start -b swc --type-check`; monorepo: `PluginMetadataGenerator` → `metadata.ts`, then `await SwaggerModule.loadPluginMetadata(metadata)`.

## Fastify helmet CSP

Prefer Nest's built-in `app.useSecurityHeaders()`: it already works with Swagger UI, so no CSP needs relaxing.

If you register `@fastify/helmet` yourself, Swagger UI needs inline scripts and styles. **This weakens XSS protection for every route, not just the docs**, so only do it when the docs are served (typically not in production), and never copy it into an API-only app:

```typescript
if (config.get('SWAGGER_ENABLED') === 'true') {        // docs off in production
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        scriptSrc: [`'self'`, `'unsafe-inline'`],     // add a specific CDN origin only if you load Swagger UI from one; never bare `https:`
      },
    },
  });
} else {
  await app.register(helmet);                            // default strict CSP
}
```
