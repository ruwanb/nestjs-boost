# Pipes and custom decorators

Sources: [Pipes](https://docs.nestjs.com/pipes) · [Custom decorators](https://docs.nestjs.com/custom-decorators) · [Migration guide](https://docs.nestjs.com/migration-guide)

For DTO and schema validation (`ValidationPipe`, `StandardSchemaValidationPipe`), use the nestjs-validation-serialization skill.

## Contents
- Built-in pipes
- Binding pipes
- Custom pipe
- Param decorators
- Composing decorators

## Built-in pipes

All are exported from `@nestjs/common`:

| Pipe | Use |
| --- | --- |
| `ParseIntPipe`, `ParseFloatPipe`, `ParseBoolPipe` | Convert a param/query string; 400 if invalid |
| `ParseUUIDPipe` | Any UUID version by default; restrict with `{ version: '4' }` |
| `ParseEnumPipe` | `new ParseEnumPipe(Status)` |
| `ParseArrayPipe` | `new ParseArrayPipe({ items: Number, separator: ',' })` for `?ids=1,2,3` |
| `ParseDatePipe` | Parse a date string |
| `DefaultValuePipe` | Put **before** a Parse pipe: `@Query('page', new DefaultValuePipe(1), ParseIntPipe)` |
| `ParseFilePipe` | File uploads (see the nestjs-http-web-features skill) |
| `ValidationPipe`, `StandardSchemaValidationPipe` | Body/query validation (nestjs-validation-serialization) |

Customize the error: `new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE })`. Optional params: `new ParseIntPipe({ optional: true })`.

## Binding pipes

```typescript
@Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {}           // parameter (class → DI-instantiated)
@Get() find(@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number) {}
@UsePipes(SomePipe)                                                       // method or controller
{ provide: APP_PIPE, useClass: SomePipe }                                 // global, with DI
```

Order: global → controller → route → parameter. With several parameters, pipes run on the last parameter first.

## Custom pipe

```typescript
@Injectable()
export class TrimPipe implements PipeTransform<unknown, unknown> {
  transform(value: unknown, metadata: ArgumentMetadata) {
    return typeof value === 'string' ? value.trim() : value;
  }
}
```

- v12 refined pipe transform signatures, and `ArgumentMetadata` takes a generic parameter. Hand-written signatures from older code may need their types adjusted.
- `metadata.metatype` is `Object` when the parameter is typed with an interface, because interfaces are erased.
- Throw `BadRequestException` (with an `errorCode` if clients branch on it) for invalid input.

## Param decorators

```typescript
export const CurrentUser = createParamDecorator((data: keyof User | undefined, ctx: ExecutionContext) => {
  const user = ctx.switchToHttp().getRequest().user;
  return data ? user?.[data] : user;
});

@Get('me') me(@CurrentUser() user: User) {}
@Get('email') email(@CurrentUser('email') email: string) {}
```

- `ValidationPipe` skips custom decorators unless `validateCustomDecorators: true` is set.
- Custom decorators accept the v12 `schema` option for Standard Schema validation, e.g. `@CurrentUser('email', { schema: z.email() })`.

## Composing decorators

```typescript
export function Auth(...roles: Role[]) {
  return applyDecorators(SetMetadata('roles', roles), UseGuards(AuthGuard, RolesGuard));
}
```

`@ApiHideProperty()` from `@nestjs/swagger` is not composable with `applyDecorators()`.
