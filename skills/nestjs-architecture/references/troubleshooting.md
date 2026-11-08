# Troubleshooting DI and module errors

Sources: [Common errors](https://docs.nestjs.com/faq/common-errors) · [Circular dependency](https://docs.nestjs.com/fundamentals/circular-dependency) · [SWC](https://docs.nestjs.com/recipes/swc)

## Contents
- Procedure for any startup DI error
- "Cannot resolve dependency" with a token name
- "... at index [n] is available in the current module" (no token name)
- Circular dependency between providers or modules
- Monorepo: ModuleRef cannot be resolved
- "File change detected" loops endlessly (Windows)

## Procedure for any startup DI error

1. Read the error: which **provider** is being built, which **token** at which **index** is missing, and in which **module** Nest looked.
2. Open that module. For the missing token, it must be either in the module's `providers`, or exported by a module listed in its `imports`.
3. If the token belongs to another feature module: add it to that module's `exports` and import that module. Do not copy the provider into the failing module's `providers`.
4. If it still fails, run once with `NEST_DEBUG=1` to see each resolution step and the module searched.
5. Rebuild and **start the app** to confirm. Compilation alone doesn't prove the fix.

## "Cannot resolve dependency" with a token name

```
Nest can't resolve dependencies of the OrdersService (?). Please make sure that the argument UsersService at index [0] is available in the OrdersModule module.
```

Causes, most common first:
- The provider isn't exported by its module, or that module isn't imported. Fix: `exports: [UsersService]` in `UsersModule`, and `imports: [UsersModule]` in `OrdersModule`.
- An `@Injectable()` class was put in `imports` instead of `providers`. Nest reports this explicitly; move it.
- The same provider is listed in both a feature module and the root module, so Nest instantiates it twice, the second time without its dependencies. Keep it in one module and export it.
- Self-injection: the missing token equals the provider being built.

## "... at index [n] is available in the current module" (no token name)

The dependency is `undefined` or `Object` at runtime. Causes:
1. **Circular file import**: two files import each other (e.g. a module file declares a token and imports a provider that imports the token back). Move shared constants to their own file.
2. **Injection by interface or type alias**: use a class, an abstract class, or `@Inject(TOKEN)`.
3. **`import type { X }`** for an injectable class: use a value import.

## Circular dependency between providers or modules

```
Nest cannot create the <module> instance.
The module at index [<n>] of the <module> "imports" array is undefined.
```

First try to break the cycle: extract the shared logic into a third provider or module that both depend on. If the cycle is genuine:

```typescript
// Providers: forwardRef on BOTH sides
@Injectable()
export class CatsService {
  constructor(@Inject(forwardRef(() => CommonService)) private readonly common: WrapperType<CommonService>) {}
}
@Injectable()
export class CommonService {
  constructor(@Inject(forwardRef(() => CatsService)) private readonly cats: WrapperType<CatsService>) {}
}

// Modules: forwardRef on BOTH sides
@Module({ imports: [forwardRef(() => CatsModule)] })
export class CommonModule {}
```

- `WrapperType<T> = T` (define it once, e.g. `src/common/wrapper-type.ts`) stops the type being stored in decorator metadata. It is required with SWC and ESM, where emitted types otherwise trigger circular-import errors. ORMs provide an equivalent, e.g. TypeORM's `Relation<T>`.
- Instantiation order is indeterminate: constructors must not call into the other side.
- Request-scoped providers in a cycle can end up `undefined`.
- Alternatively, inject `ModuleRef` and get the other provider lazily at call time.
- Barrel files (`index.ts`) importing modules and providers are a frequent hidden cause.

## Monorepo: ModuleRef cannot be resolved

`... the argument ModuleRef at index [n] is available ...` usually means two copies of `@nestjs/core` are installed (e.g. one nested under a workspace package). For pnpm, declare `@nestjs/core` as a peer dependency of the internal package and use `dependenciesMeta.<pkg>.injected: true`. For Yarn workspaces, use `nohoist`.

## "File change detected" loops endlessly (Windows)

Add to `tsconfig.json`: `"watchOptions": { "watchFile": "fixedPollingInterval" }`.
