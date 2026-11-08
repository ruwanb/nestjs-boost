---
name: nestjs-deployment
description: Ships NestJS 12 applications to production — build and run (npm run build, node dist/main.js, NODE_ENV=production, PORT), Node.js 20.19+/22.12+ requirements, Dockerfile and .dockerignore with multi-stage builds, graceful shutdown with enableShutdownHooks, health checks, JSON logging and Observe instrumentation, vertical vs horizontal scaling behind load balancers, nest deploy with Mau on AWS, serverless functions on AWS Lambda (@codegenie/serverless-express, cached bootstrap, webpack bundling, lazy-loaded modules, standalone contexts, Swagger trailing-slash fix) and cold-start optimisation, and systemd socket activation with idle exit. Use when containerising or deploying an app, preparing it for production, running it on Lambda or another serverless platform, reducing cold starts, or setting up zero-downtime restarts. Not for health-check details (nestjs-health-checks), telemetry (nestjs-observability) or security headers and rate limits (nestjs-security-hardening).
compatibility: NestJS 12.x; Node.js 20.19+ or 22.12+ (prefer active LTS); Docker, AWS Lambda/Serverless Framework, systemd as applicable
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# Deploying NestJS

## Production baseline

```bash
npm run build                  # → dist/
NODE_ENV=production node dist/main.js     # not `nest start` (it rebuilds) and not npm in containers (signals)
```

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();                         // SIGTERM → onModuleDestroy/beforeApplicationShutdown/onApplicationShutdown
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
await bootstrap();
```

- **Node.js:** NestJS 12 requires Node.js 20.19+ or 22.12+; prefer an active LTS. Pin the version in the Docker base image and in `engines`.
- **`NODE_ENV=production`:** some libraries behave differently with it.
- **Config:** read config from the environment or a secrets manager, never hard-coded (see nestjs-configuration). Validate it at startup so a missing variable fails the deploy, not the first request.
- **Health:** expose liveness and readiness probes (nestjs-health-checks) and point the load balancer or orchestrator at them.
- **Logging:** use JSON logs in production (nestjs-logging).
- **Telemetry:** `NestFactory.create(AppModule, { instrument: ObserveInstrument })` for NestJS Observe, or OpenTelemetry (nestjs-observability).
- **Security:** helmet, CORS, rate limiting and body limits (nestjs-security-hardening).
- **Process:** automate deploys with CI/CD and back up your data.

## Scaling

| Strategy | When | Requirements on the app |
| --- | --- | --- |
| Vertical (bigger machine) | Moderate traffic; simplest | — |
| Horizontal (more instances behind a load balancer such as Nginx, ELB or Kubernetes) | High traffic, redundancy | **Stateless instances.** Sessions and cache go in Redis, not memory. Schedulers need distributed locks (nestjs-locks) or a single runner. WebSockets need the Redis adapter plus sticky sessions (nestjs-websockets). Uploads go to object storage (nestjs-file-storage). Run migrations once per deploy, not on every instance boot |

## Docker

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim AS build                # match your project's Node version
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY package*.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main"]                 # exec form: node is PID 1 and receives SIGTERM
```

`.dockerignore`: `node_modules`, `dist`, `*.log`, `*.md`, `.git`, `.env*`.

Build with `docker build -t my-app .` and run with `docker run -p 3000:3000 my-app`. Push to Docker Hub, ECR or Artifact Registry.

The docs' sample is a single stage (`npm install`, `npm run build`, `CMD ["node", "dist/main"]`). The multi-stage version above follows the same steps, ships without dev dependencies or sources, and runs as a non-root user.

## Mau (official AWS platform)

`nest deploy` (v12 CLI) offers to add `@nestjs/mau` and forwards options to `mau deploy`. In CI, use `npm i -g @nestjs/mau && mau deploy`, which doesn't prompt. Mau provisions databases (PostgreSQL, MySQL, DocumentDB, Redis) and brokers (RabbitMQ, Kafka, NATS). It also manages environment variables, horizontal scaling, health-check-based instance replacement, CloudWatch metrics and backups.

## Serverless (AWS Lambda)

```bash
npm i @codegenie/serverless-express
npm i -D @types/aws-lambda serverless-offline
```

```typescript
let server: Handler;
async function bootstrap(): Promise<Handler> {
  const app = await NestFactory.create(AppModule);
  await app.init();                                       // init, not listen
  return configure({ app: app.getHttpAdapter().getInstance() });
}
export const handler: Handler = async (event, context, callback) => {
  server = server ?? (await bootstrap());                 // reuse across warm invocations
  return server(event, context, callback);
};
```

- **`serverless.yml`:** `runtime: nodejs22.x`, `handler: dist/main.handler`, `http` events for `/` and `{proxy+}`. Run `npx serverless offline` and test at `/dev/<route>`.
- **TypeScript:** set `esModuleInterop: true`.
- **Bundle with webpack** (`externals: []`, `libraryTarget: 'commonjs2'`, Terser with `keep_classnames`). Mark the lazy optional imports (`@nestjs/microservices/microservices-module`, `@nestjs/websockets/socket-module`, …) with `IgnorePlugin`. Benchmarks: an Express-based Nest app drops from ~197 ms to ~81 ms, and a standalone context from ~112 ms to ~32 ms.
- **CommonJS apps on Lambda's Node 20/22/24 runtimes** need `NODE_OPTIONS=--experimental-require-module`, because the v12 packages are ESM-only (nestjs-upgrading).
- **Cold starts are dominated by your async providers** (for example DB connections). Load rarely used modules on demand with `LazyModuleLoader`, and split functions by job (monorepo mode).
- **Non-HTTP handlers:** use `NestFactory.createApplicationContext(AppModule)` and `appContext.get(Service)`. This is lighter, but **no enhancers run**.
- **Swagger behind API Gateway:** register middleware *before* `SwaggerModule.setup()` that rewrites `originalUrl` `/swagger` → `/swagger/`. Without it, the redirect loops forever.

Details in `references/serverless-and-systemd.md`.

## systemd socket activation (start on first connection, zero dropped connections across restarts)

```typescript
const activated = process.env.LISTEN_FDS === '1' && process.env.LISTEN_PID === String(process.pid);
if (activated) await app.listen({ fd: 3 } as any);        // Fastify: app.listen({ fd: 3 }) is typed
else await app.listen(process.env.PORT ?? 3000);
```

- Add a `.socket` unit (`ListenStream=3000`) and a `.service` unit (`ExecStart=/usr/bin/node dist/main.js`, `Restart=on-failure`).
- Enable the socket only: `systemctl enable --now my-app.socket`.
- **`ExecStart` must start `node` directly.** With npm, `nest start` or a shell wrapper, `LISTEN_PID` doesn't match, and the app fails with `EADDRINUSE`.
- Not supported on Windows.
- Optional idle exit frees memory (see the reference). Keep schedulers and queue consumers in an always-on process.

## Workflow

- [ ] 1. Validate config at startup, call `enableShutdownHooks()`, bind `0.0.0.0:$PORT`, use JSON logs, add health endpoints.
- [ ] 2. Make the app stateless for horizontal scaling (shared cache and sessions, locks for cron, WebSocket adapter).
- [ ] 3. Package: a multi-stage Docker image with a non-root `node` user and exec-form `CMD`, or the Lambda handler with a cached bootstrap and bundling, or systemd units.
- [ ] 4. CI/CD: build, lint, test, build the image, run migrations once, deploy (`nest deploy` / `mau deploy` or your platform), and smoke-test the health endpoint.
- [ ] 5. Locally: run the production build (`node dist/main.js` or `docker run`) and confirm graceful shutdown on SIGTERM.

## Reference files

- `references/serverless-and-systemd.md`: `serverless.yml`, the webpack config for Lambda, the standalone handler, the lazy-loading patterns, the systemd units, `systemd-socket-activate` for local trials, the idle-exit helper, and the compile-cache tip. Read when deploying to Lambda or systemd.

Sources: [Deployment](https://docs.nestjs.com/deployment) · [Serverless](https://docs.nestjs.com/faq/serverless) · [Socket activation](https://docs.nestjs.com/recipes/socket-activation)
