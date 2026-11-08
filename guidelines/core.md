## NestJS project guidelines (nestjs-boost)

This is a **NestJS {{nestjsVersion}}** project. Follow these rules on every task; load the skill named in the skill map for detail. The pack was built from the official docs at https://docs.nestjs.com (crawled {{docsCrawled}}). Where your training data disagrees with these files, these files win: NestJS 12 changed many defaults.

### Project facts (detected)

| Fact | Value |
| --- | --- |
| HTTP adapter | {{httpAdapter}} |
| Module format | {{moduleFormat}} |
| Test runner | {{testRunner}} |
| Linter | {{linter}} |
| Package manager | {{packageManager}} |
| Validation | {{validation}} |

{{esmNote}}

### Commands: verify before you report done

Run these after every change, and fix failures before saying a task is finished:

```bash
{{buildCommand}}
{{lintCommand}}
{{testCommand}}
{{e2eCommand}}
```

When a change affects startup (modules, DI, `main.ts`, configuration), also start the built app once (`{{startCommand}}`), because DI errors only appear at bootstrap, not at compile time.

### Scaffold with the CLI, then edit

Use `nest generate` instead of writing boilerplate by hand. It places files where Nest expects them, updates the parent module, and adds spec files. Preview with `--dry-run`.

```bash
npx nest g resource <name>      # module + controller + service + DTOs + entity + specs
npx nest g module|controller|service|guard|interceptor|pipe|filter|decorator <name>
```

### Rules that apply everywhere

- **Feature modules.** Group each feature's controller, providers and DTOs in its own module. A provider another module needs must be in its module's `exports`, and the consumer must import that module. Never re-register another module's provider in your own `providers`: that creates a second instance. Avoid `@Global()` except for truly app-wide infrastructure.
- **Injection tokens exist at runtime.** Constructor injection by type needs a class. Interfaces and type aliases are erased, so inject those with `@Inject(TOKEN)`, using a string, symbol or `InjectionToken`.
- **No barrel files** (`index.ts`) for module and provider classes; they cause circular-dependency errors.
- **Request lifecycle order:**
    1. middleware
    2. guards (global → controller → route)
    3. interceptors before the handler
    4. pipes (global → controller → route → parameter)
    5. the handler
    6. interceptors after the handler (route → controller → global)
    7. exception filters (route → controller → global; the first matching filter wins)
- **Global enhancers that need DI** are registered as providers: `{ provide: APP_GUARD | APP_PIPE | APP_INTERCEPTOR | APP_FILTER, useClass: X }`. `app.useGlobal*()` in `main.ts` cannot inject dependencies, and tests that build the app with `Test.createTestingModule()` never run `main.ts`, so they miss it.
- **Errors:** throw Nest's HTTP exceptions (`NotFoundException`, `BadRequestException`, ...). Give clients a stable code with the `errorCode` option, e.g. `new BadRequestException('Cart is empty', { errorCode: 'CART_EMPTY' })`.
- **Logging:** use `new Logger(MyService.name)` from `@nestjs/common`, never `console.log`. Pass structured fields as a plain object after the message: `logger.log('User created', { userId })`.
- **Configuration and secrets** come from `@nestjs/config` (`ConfigService`), never hard-coded values or committed `.env` files.
- **Tests** use `@nestjs/testing` (`Test.createTestingModule`) with the project's runner API ({{testRunnerApi}}).
- **Upgrades:** after changing NestJS packages, use `nest upgrade`, which moves all `@nestjs/*` packages together.

### Skill map

Load the matching skill before starting a task in its area:

{{skillMap}}
