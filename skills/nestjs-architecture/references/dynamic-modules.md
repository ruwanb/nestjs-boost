# Dynamic modules with ConfigurableModuleBuilder

Source: [Dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules) (NestJS 12).

## Contents
- Naming: register vs forRoot vs forFeature
- Building a configurable module (default path)
- Consumer side: sync and async
- Options factory classes
- Extra options (e.g. isGlobal)
- Extending generated methods

## Naming: register vs forRoot vs forFeature

| Method | Meaning |
| --- | --- |
| `register()` | Configures the module for the calling module only. Each importer can pass different options. |
| `forRoot()` | Configured once (usually in `AppModule`), shared everywhere. |
| `forFeature()` | Uses the `forRoot()` configuration, adjusted for the calling module (e.g. which repositories it can inject). |

Each has an async twin (`registerAsync`, `forRootAsync`, `forFeatureAsync`) that resolves options through DI.

## Building a configurable module (default path)

Don't hand-write `static register()`/`registerAsync()`. Use the builder in a separate `*.module-definition.ts` file:

```typescript
// id-generator.module-definition.ts
import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { IdGeneratorModuleOptions } from './id-generator.interfaces.js';

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN, OPTIONS_TYPE, ASYNC_OPTIONS_TYPE } =
  new ConfigurableModuleBuilder<IdGeneratorModuleOptions>()
    .setClassMethodName('forRoot') // omit to get register()/registerAsync()
    .build();
```

```typescript
// id-generator.module.ts
@Module({ providers: [IdGenerator], exports: [IdGenerator] })
export class IdGeneratorModule extends ConfigurableModuleClass {}
```

```typescript
// id-generator.ts — inject the generated options token
@Injectable()
export class IdGenerator {
  constructor(@Inject(MODULE_OPTIONS_TOKEN) private readonly options: IdGeneratorModuleOptions) {}
}
```

The metadata returned by the generated methods is merged with the `@Module()` metadata, so `providers`/`exports` in the decorator still apply.

## Consumer side

```typescript
IdGeneratorModule.forRoot({ prefix: 'id' })

IdGeneratorModule.forRootAsync({
  imports: [ConfigModule],               // modules whose exports the factory needs
  useFactory: (config: ConfigService) => ({ prefix: config.getOrThrow<string>('ID_PREFIX') }),
  inject: [ConfigService],               // order matches the factory's parameters
})
```

Async options accept exactly one of `useFactory`, `useClass` or `useExisting`. `provideInjectionTokensFrom` lets a module forward providers it already has into the factory's `inject` list.

## Options factory classes

`useClass`/`useExisting` take a class implementing `ConfigurableModuleOptionsFactory<Options, 'create'>`, i.e. a `create()` method returning the options. Rename the expected method with `.setFactoryMethodName('createIdGeneratorOptions')`.

## Extra options (e.g. isGlobal)

Options that change the module definition but must not reach `MODULE_OPTIONS_TOKEN`:

```typescript
new ConfigurableModuleBuilder<IdGeneratorModuleOptions>()
  .setExtras({ isGlobal: false }, (definition, extras) => ({ ...definition, global: extras.isGlobal }))
  .build();
```

The injected options object does not contain `isGlobal`.

## Extending generated methods

```typescript
export class IdGeneratorModule extends ConfigurableModuleClass {
  static forRoot(options: typeof OPTIONS_TYPE): DynamicModule {
    return { ...super.forRoot(options) /* plus your additions */ };
  }
}
```
