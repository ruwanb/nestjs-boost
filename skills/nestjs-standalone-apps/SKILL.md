---
name: nestjs-standalone-apps
description: Builds NestJS 12 programs without an HTTP listener — standalone application contexts with NestFactory.createApplicationContext for scripts, seeders, migrations runners, cron or queue worker processes, retrieving providers with app.get/app.select (strict mode, dynamic modules), closing the context to run shutdown hooks, and command-line tools with the third-party nest-commander package (CommandFactory, @Command, @Option, CommandRunner, CommandTestFactory). Use when the user wants a CLI, a one-off or scheduled script that reuses the app's services, a database seed, a background worker process, or "run X without starting the server". Not for the Nest CLI itself (nestjs-cli-tooling), microservice transports (nestjs-microservices) or REPL debugging (nestjs-cli-tooling).
compatibility: NestJS 12.x; nest-commander (third-party) for CLIs
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS standalone applications and CLIs

## Scripts and workers: application context

```typescript
// src/scripts/seed.ts
import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module.js';
import { SeedService } from './seed.service.js';

const app = await NestFactory.createApplicationContext(SeedModule, { bufferLogs: true });
try {
  await app.get(SeedService).run();
} finally {
  await app.close();          // runs shutdown hooks (closes pools) and lets the process exit
}
```

- A context is the IoC container without network listeners: **middleware, guards, interceptors, pipes and filters don't run**, even if you `app.get()` a controller. Call services, not controllers.
- `app.get(Token)` searches all modules; `app.select(TasksModule).get(TasksService, { strict: true })` restricts to one module. For dynamic modules, keep the module object in a const and pass it to `select()`.
- Import a slim module for scripts (only what the script needs) to avoid booting HTTP-only or heavy modules.
- Workers that should keep running (queue consumers, schedulers): create the context and **don't** close it; call `app.enableShutdownHooks()` so SIGTERM closes connections cleanly.
- Run compiled scripts with `node dist/scripts/seed.js`, or add an entry in `nest-cli.json` (monorepo) / a `package.json` script. In ESM projects keep the `.js` extensions in imports.

## Command-line apps: nest-commander

```bash
npm i nest-commander
npm i -D nest-commander-testing
```

```typescript
@Command({ name: 'import-prices', description: 'Import a price list CSV' })
export class ImportPricesCommand extends CommandRunner {
  constructor(private readonly prices: PriceListsService) { super(); }

  async run(params: string[], options: { dryRun?: boolean; limit?: number }): Promise<void> {
    const [file] = params;
    await this.prices.import(file, options);
  }

  @Option({ flags: '-d, --dry-run [boolean]', description: 'Validate only' })
  parseDryRun(val: string): boolean { return JSON.parse(val); }

  @Option({ flags: '-l, --limit [number]', description: 'Max rows' })
  parseLimit(val: string): number { return Number(val); }
}

@Module({ imports: [PricesModule], providers: [ImportPricesCommand] })
export class CliModule {}

// src/cli.ts
await CommandFactory.run(CliModule, ['warn', 'error']);   // logger off by default; pass levels or a logger
```

- Commands are injectable providers; `CommandRunner.run(params, options)` returns `Promise<void>`. `--help` comes for free.
- `CommandFactory` calls `app.close()` when the command finishes. Wrap in try/catch (or `.catch()`) and set `process.exitCode = 1` on failure.
- Third-party (jmcdo29/nest-commander); see its docs for subcommands, questions and completion.
- Tests: `CommandTestFactory.createTestingCommand({ imports: [CliModule] })`, override providers, then `CommandTestFactory.run(command, ['import-prices', 'file.csv'])`.

## Workflow

- [ ] 1. Decide: one-off script (context + close), long-running worker (context + shutdown hooks), or user-facing CLI (nest-commander).
- [ ] 2. Create a slim module and entry file; reuse existing services.
- [ ] 3. Add a `package.json` script; document required env vars (load via `ConfigModule`).
- [ ] 4. Test the service directly (and the command with `CommandTestFactory`). Build, lint, run tests, run the script once.

Sources: [Standalone applications](https://docs.nestjs.com/standalone-applications) · [Nest Commander](https://docs.nestjs.com/recipes/nest-commander)
