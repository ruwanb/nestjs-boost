# Serverless and systemd details

## Contents
- serverless.yml
- Bundling with webpack
- Standalone handlers
- Runtime optimisations
- systemd units
- Idle exit and compile cache

## serverless.yml

```yaml
service: serverless-example
plugins:
  - serverless-offline
provider:
  name: aws
  runtime: nodejs22.x
functions:
  main:
    handler: dist/main.handler
    events:
      - http: { method: ANY, path: / }
      - http: { method: ANY, path: '{proxy+}' }
```

Test locally with `npm run build && npx serverless offline`, then open `http://localhost:3000/dev/<route>`. Set `"esModuleInterop": true` in `tsconfig.json`. Use CLI monorepo mode for several functions that share modules.

## Bundling with webpack

`webpack.config.js` in the project root; build with `nest build --webpack`:

```javascript
const TerserPlugin = require('terser-webpack-plugin');   // optional; slows the build

module.exports = (options, webpack) => {
  const lazyImports = ['@nestjs/microservices/microservices-module', '@nestjs/websockets/socket-module'];
  return {
    ...options,
    externals: [],                                         // bundle node_modules
    output: { ...options.output, libraryTarget: 'commonjs2' },
    optimization: { minimizer: [new TerserPlugin({ terserOptions: { keep_classnames: true } })] },   // class-validator needs class names
    plugins: [
      ...options.plugins,
      new webpack.IgnorePlugin({
        checkResource(resource) {
          if (lazyImports.includes(resource)) {
            try { require.resolve(resource); } catch { return true; }
          }
          return false;
        },
      }),
    ],
  };
};
```

Docs benchmarks (starter app): Express ~7 ms; Nest/Express 197 ms unbundled → 81.5 ms bundled; standalone context 112 ms → 32 ms. An app with 10 resources takes ~130 ms bundled.

## Standalone handlers

```typescript
export const handler: Handler = async (event, context, callback) => {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  return appContext.get(EventsService).process(event);    // no guards/interceptors/pipes (no HTTP layer)
};
```

Cache the context in a module-level variable, as with the HTTP handler, to reuse it on warm invocations.

## Runtime optimisations

- Async providers that connect on boot add their latency to every cold start. A 2 s DB connection means at least 2 s extra on the first response.
- Load rarely used modules lazily:

```typescript
if (request.method === RequestMethod[RequestMethod.GET]) {
  const { CacheModule } = await import('./cache.module.js');
  const moduleRef = await this.lazyModuleLoader.load(() => CacheModule);
  const { CacheService } = await import('./cache.service.js');
  return moduleRef.get(CacheService).get(ENDPOINT_KEY);
}
```

- Use the same pattern for workers or webhooks that branch on input (load `WorkerAModule` or `WorkerBModule` on demand).
- Swagger UI behind API Gateway: `app.use((req, res, next) => { if (req.originalUrl === '/swagger') req.originalUrl = '/swagger/'; next(); })` before `SwaggerModule.setup()`.

## systemd units

```ini
# /etc/systemd/system/my-app.socket
[Socket]
ListenStream=3000
[Install]
WantedBy=sockets.target

# /etc/systemd/system/my-app.service
[Service]
WorkingDirectory=/srv/my-app
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now my-app.socket       # the service starts on the first connection
systemd-socket-activate --listen=3000 --setenv=NODE_ENV node dist/main.js   # quick local trial (starts once)
```

systemd passes fd 3 and sets `LISTEN_FDS`/`LISTEN_PID`. Connections that arrive during a start or restart wait in the socket backlog instead of being refused. Express and the Node adapter pass `{ fd: 3 }` straight to `server.listen()`, but their typings need `as any`.

## Idle exit and compile cache

```typescript
export function exitWhenIdle(app: INestApplication, idleMs: number) {
  const server: Server = app.getHttpServer();
  let inFlight = 0;
  let timer: NodeJS.Timeout | undefined;
  const scheduleExit = () => { timer = setTimeout(async () => { await app.close(); process.exit(0); }, idleMs); };
  server.on('request', (req, res) => {
    inFlight++; clearTimeout(timer);
    res.once('close', () => { if (--inFlight === 0) scheduleExit(); });
  });
  scheduleExit();
}
// if (activated) { await app.listen({ fd: 3 } as any); exitWhenIdle(app, 5 * 60_000); }
```

- Use `Restart=on-failure`. With `Restart=always`, the app restarts immediately after an idle exit.
- Uptime monitors and health probes keep the app awake.
- Cron jobs and queue consumers don't run while the app is stopped.
- The first request waits for the full bootstrap. Speed up restarts with Node's compile cache: add `Environment=NODE_COMPILE_CACHE=/var/cache/my-app` and `CacheDirectory=my-app` to the service unit. The cache is written on exit, so `enableShutdownHooks()` is required for SIGTERM.
