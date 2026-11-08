# nest-cli.json, REPL, hot reload and Devtools

Sources: [Workspaces](https://docs.nestjs.com/cli/monorepo) · [CLI usage](https://docs.nestjs.com/cli/usages) · [REPL](https://docs.nestjs.com/recipes/repl) · [Hot reload](https://docs.nestjs.com/recipes/hot-reload) · [Devtools](https://docs.nestjs.com/devtools/overview) · [CI/CD integration](https://docs.nestjs.com/devtools/ci-cd-integration)

## Contents
- compilerOptions
- generateOptions
- Assets
- Monorepo project entries
- REPL
- Hot reload
- Devtools

## compilerOptions

| Property | Type | Notes |
| --- | --- | --- |
| `builder` | `"tsc" \| "swc" \| "rspack"` or `{ type, options }` | Monorepos default to `rspack` in v12 |
| `typeCheck` | boolean | With `swc`: run type checking alongside (default `false`) |
| `emitDeclarations` | boolean | Emit `.d.ts` with SWC |
| `deleteOutDir` | boolean | Clean `dist` before each build |
| `assets` | array | Copy non-TS files (not on incremental watch compiles) |
| `watchAssets` | boolean | Watch all non-TS assets |
| `manualRestart` | boolean | Enable the `rs` shortcut to restart |
| `tsConfigPath` | string | Monorepo: tsconfig used when no project is given |
| `includeLibraryAssets` | array | Monorepo: library projects whose assets are copied into this app |
| `webpack`, `webpackConfigPath` | — | **Deprecated** in v12; use `builder` (`builder.options.configPath`) |

Builder object form: `{ "builder": { "type": "swc", "options": { "swcrcPath": "infrastructure/.swcrc" } } }`.

## generateOptions

```json
{ "generateOptions": { "spec": false, "flat": true } }
```

`spec` can also be an object per schematic, e.g. `{ "service": true, "controller": false }`. Command-line flags override it, and project-level `generateOptions` override the top-level ones.

## Assets

```json
{ "compilerOptions": { "assets": ["**/*.graphql", { "include": "i18n/**/*", "outDir": "dist/i18n", "watchAssets": true }] } }
```

## Monorepo project entries

```json
{
  "monorepo": true,
  "root": "apps/api",
  "sourceRoot": "apps/api/src",
  "compilerOptions": { "builder": "rspack", "tsConfigPath": "apps/api/tsconfig.app.json" },
  "projects": {
    "api":    { "type": "application", "root": "apps/api", "entryFile": "main", "sourceRoot": "apps/api/src", "compilerOptions": { "tsConfigPath": "apps/api/tsconfig.app.json" } },
    "common": { "type": "library", "root": "libs/common", "entryFile": "index", "sourceRoot": "libs/common/src", "compilerOptions": { "tsConfigPath": "libs/common/tsconfig.lib.json" } }
  }
}
```

A project's `compilerOptions` replace the top-level ones; they are not merged.

## REPL

```typescript
// src/repl.ts
import { repl } from '@nestjs/core';
import { AppModule } from './app.module.js';
await repl(AppModule);
```

Run it with `npm run start -- --entryFile repl`. Inside: `get(UsersService)` (alias `$`), `await $(UsersService).findAll()`, `debug()`, `methods(UsersService)`, `resolve()`, `select()`.

## Hot reload

The documented recipe targets **webpack-based CommonJS** projects (webpack is deprecated in v12, and Rspack is the monorepo default). For ESM or SWC projects, `nest start --watch` with the SWC builder is usually fast enough. Use the recipe only if the project still uses webpack.

## Devtools

```typescript
const app = await NestFactory.create(AppModule, { snapshot: true });   // main.ts
```

```bash
npm i @nestjs/devtools-integration
```

```typescript
@Module({ imports: [DevtoolsModule.register({ http: process.env.NODE_ENV !== 'production' })] })
```

Devtools offers a graph explorer, routes explorer, playground, bootstrap performance analyzer, audit, and help with "Cannot resolve dependency" errors. CI/CD integration publishes graph snapshots for pull requests (see the CI/CD integration page).
