# NestJS documentation coverage matrix

Docs commit `f321ff1725d8` (2026-11-05), NestJS 12. 159 sidebar pages.

**Coverage: 159/159 pages owned; unowned: 0; owned twice: 0; unknown paths: 0.**

## Owners

| Owner | Layer | Install when | Pages | Source lines | Needs references/ |
| --- | --- | --- | --- | --- | --- |
| `core-guidelines` | guidelines | always | 2 | 61 | no |
| `nestjs-architecture` | foundation | always | 14 | 2860 | yes |
| `nestjs-request-pipeline` | foundation | always | 11 | 3521 | yes |
| `nestjs-validation-serialization` | foundation | always | 2 | 1018 | yes |
| `nestjs-configuration` | foundation | always | 1 | 698 | yes |
| `nestjs-testing` | foundation | always | 1 | 461 | no |
| `nestjs-cli-tooling` | foundation | always | 11 | 2262 | yes |
| `nestjs-logging` | foundation | always | 2 | 937 | yes |
| `nestjs-security-hardening` | foundation | always | 5 | 964 | yes |
| `nestjs-http-platform` | conditional | `@nestjs/platform-express` or `@nestjs/platform-fastify` or `@nestjs/platform-node` | 7 | 952 | yes |
| `nestjs-http-web-features` | conditional | `@nestjs/platform-express` or `@nestjs/platform-fastify` or `@nestjs/platform-node` | 6 | 1701 | yes |
| `nestjs-authentication` | conditional | `@nestjs/authentication` | 1 | 4017 | yes |
| `nestjs-passport-auth` | conditional | `@nestjs/passport` or `@nestjs/jwt` | 1 | 1015 | yes |
| `nestjs-authorization` | conditional | `@nestjs/authorization` | 1 | 1443 | yes |
| `nestjs-database-typeorm` | conditional | `@nestjs/typeorm` | 1 | 725 | yes |
| `nestjs-database-drizzle` | conditional | `@nestjs/drizzle` | 1 | 510 | no |
| `nestjs-database-mongoose` | conditional | `@nestjs/mongoose` | 1 | 703 | yes |
| `nestjs-database-prisma` | conditional | `@prisma/client` or `prisma` | 1 | 547 | no |
| `nestjs-database-mikro-orm` | conditional | `@mikro-orm/nestjs` | 1 | 636 | yes |
| `nestjs-database-sequelize` | conditional | `@nestjs/sequelize` | 1 | 548 | no |
| `nestjs-caching` | conditional | `@nestjs/cache-manager` | 1 | 348 | no |
| `nestjs-http-client` | conditional | `@nestjs/http-client` or `@nestjs/axios` | 1 | 631 | yes |
| `nestjs-events` | conditional | `@nestjs/event-emitter` | 1 | 164 | no |
| `nestjs-scheduling` | conditional | `@nestjs/schedule` | 1 | 456 | no |
| `nestjs-queues` | conditional | `@nestjs/bullmq` or `@nestjs/bull` | 1 | 989 | yes |
| `nestjs-mail` | conditional | `@nestjs/mail` | 1 | 1338 | yes |
| `nestjs-i18n` | conditional | `@nestjs/i18n` | 1 | 1364 | yes |
| `nestjs-file-storage` | conditional | `@nestjs/storage` | 1 | 833 | yes |
| `nestjs-webhooks` | conditional | `@nestjs/webhooks` | 1 | 1853 | yes |
| `nestjs-observability` | conditional | `@nestjs/observe` or `@opentelemetry/sdk-node` | 10 | 1996 | yes |
| `nestjs-health-checks` | conditional | `@nestjs/terminus` | 1 | 873 | yes |
| `nestjs-resilience` | conditional | `@nestjs/resilience` | 1 | 837 | yes |
| `nestjs-idempotency` | conditional | `@nestjs/idempotency` | 1 | 1474 | yes |
| `nestjs-outbox` | conditional | `@nestjs/outbox` | 1 | 1366 | yes |
| `nestjs-workflows` | conditional | `@nestjs/workflows` | 1 | 1826 | yes |
| `nestjs-locks` | conditional | `@nestjs/locks` | 1 | 1372 | yes |
| `nestjs-cqrs` | conditional | `@nestjs/cqrs` | 1 | 808 | yes |
| `nestjs-graphql` | conditional | `@nestjs/graphql` | 18 | 4589 | yes |
| `nestjs-websockets` | conditional | `@nestjs/websockets` | 6 | 695 | yes |
| `nestjs-mcp-server` | conditional | `@nestjs/mcp` | 5 | 1371 | yes |
| `nestjs-microservices` | conditional | `@nestjs/microservices` | 14 | 4046 | yes |
| `nestjs-openapi` | conditional | `@nestjs/swagger` | 8 | 2053 | yes |
| `nestjs-standalone-apps` | conditional | `nest-commander`; opt-in | 2 | 261 | no |
| `nestjs-deployment` | conditional | file `Dockerfile` / `serverless.yml` / `serverless.ts`; opt-in | 3 | 799 | yes |
| `nestjs-upgrading` | conditional | installed major < 12; opt-in | 1 | 538 | no |
| `nestjs-ai` | conditional | `@nestjs/ai` | 5 | 1820 | yes |

## Page → owner

| Section | Page | Source | Lines | Owner |
| --- | --- | --- | --- | --- |
| Overview | [First steps](https://docs.nestjs.com/first-steps) | `content/first-steps.md` | 180 | nestjs-architecture |
| Overview | [Controllers](https://docs.nestjs.com/controllers) | `content/controllers.md` | 779 | nestjs-request-pipeline |
| Overview | [Providers](https://docs.nestjs.com/providers) | `content/components.md` | 225 | nestjs-architecture |
| Overview | [Modules](https://docs.nestjs.com/modules) | `content/modules.md` | 315 | nestjs-architecture |
| Overview | [Middleware](https://docs.nestjs.com/middleware) | `content/middlewares.md` | 346 | nestjs-request-pipeline |
| Overview | [Exception filters](https://docs.nestjs.com/exception-filters) | `content/exception-filters.md` | 468 | nestjs-request-pipeline |
| Overview | [Pipes](https://docs.nestjs.com/pipes) | `content/pipes.md` | 570 | nestjs-request-pipeline |
| Overview | [Guards](https://docs.nestjs.com/guards) | `content/guards.md` | 256 | nestjs-request-pipeline |
| Overview | [Interceptors](https://docs.nestjs.com/interceptors) | `content/interceptors.md` | 341 | nestjs-request-pipeline |
| Overview | [Custom decorators](https://docs.nestjs.com/custom-decorators) | `content/custom-decorators.md` | 231 | nestjs-request-pipeline |
| Fundamentals | [Custom providers](https://docs.nestjs.com/fundamentals/custom-providers) | `content/fundamentals/dependency-injection.md` | 477 | nestjs-architecture |
| Fundamentals | [Testing](https://docs.nestjs.com/fundamentals/testing) | `content/fundamentals/unit-testing.md` | 461 | nestjs-testing |
| Application | [Configuration](https://docs.nestjs.com/application/configuration) | `content/application/configuration.md` | 698 | nestjs-configuration |
| Application | [Validation](https://docs.nestjs.com/application/validation) | `content/application/validation.md` | 706 | nestjs-validation-serialization |
| Application | [Serialization](https://docs.nestjs.com/application/serialization) | `content/application/serialization.md` | 312 | nestjs-validation-serialization |
| Application | [Logging](https://docs.nestjs.com/application/logger) | `content/application/logger.md` | 557 | nestjs-logging |
| Application | [Events](https://docs.nestjs.com/application/events) | `content/application/events.md` | 164 | nestjs-events |
| Application | [Task scheduling](https://docs.nestjs.com/application/task-scheduling) | `content/application/task-scheduling.md` | 456 | nestjs-scheduling |
| Application | [Queues](https://docs.nestjs.com/application/queues) | `content/application/queues.md` | 989 | nestjs-queues |
| Application | [HTTP client](https://docs.nestjs.com/application/http-client) | `content/application/http-client.md` | 631 | nestjs-http-client |
| Application | [Internationalization](https://docs.nestjs.com/application/i18n) | `content/application/i18n.md` | 1364 | nestjs-i18n |
| Application | [Mail](https://docs.nestjs.com/application/mail) | `content/application/mail.md` | 1338 | nestjs-mail |
| Application | [File storage](https://docs.nestjs.com/application/file-storage) | `content/application/file-storage.md` | 833 | nestjs-file-storage |
| Data | [Overview](https://docs.nestjs.com/data/overview) | `content/data/overview.md` | 17 | core-guidelines |
| Data | [TypeORM](https://docs.nestjs.com/data/typeorm) | `content/data/typeorm.md` | 725 | nestjs-database-typeorm |
| Data | [Drizzle](https://docs.nestjs.com/data/drizzle) | `content/data/drizzle.md` | 510 | nestjs-database-drizzle |
| Data | [MongoDB](https://docs.nestjs.com/data/mongodb) | `content/data/mongo.md` | 703 | nestjs-database-mongoose |
| Data | [Prisma](https://docs.nestjs.com/data/prisma) | `content/data/prisma.md` | 547 | nestjs-database-prisma |
| Data | [MikroORM](https://docs.nestjs.com/data/mikroorm) | `content/data/mikroorm.md` | 636 | nestjs-database-mikro-orm |
| Data | [Sequelize](https://docs.nestjs.com/data/sequelize) | `content/data/sequelize.md` | 548 | nestjs-database-sequelize |
| Data | [Caching](https://docs.nestjs.com/data/caching) | `content/data/caching.md` | 348 | nestjs-caching |
| Security | [Authentication](https://docs.nestjs.com/security/authentication) | `content/security/authentication.md` | 4017 | nestjs-authentication |
| Security | [Authorization](https://docs.nestjs.com/security/authorization) | `content/security/authorization.md` | 1443 | nestjs-authorization |
| Security | [Security headers](https://docs.nestjs.com/security/helmet) | `content/security/helmet.md` | 237 | nestjs-security-hardening |
| Security | [CORS](https://docs.nestjs.com/security/cors) | `content/security/cors.md` | 37 | nestjs-security-hardening |
| Security | [CSRF Protection](https://docs.nestjs.com/security/csrf) | `content/security/csrf.md` | 202 | nestjs-security-hardening |
| Security | [Rate limiting](https://docs.nestjs.com/security/rate-limiting) | `content/security/rate-limiting.md` | 405 | nestjs-security-hardening |
| HTTP | [Versioning](https://docs.nestjs.com/http/versioning) | `content/http/versioning.md` | 311 | nestjs-http-platform |
| HTTP | [Cookies](https://docs.nestjs.com/http/cookies) | `content/http/cookies.md` | 321 | nestjs-http-web-features |
| HTTP | [Session](https://docs.nestjs.com/http/session) | `content/http/sessions.md` | 111 | nestjs-http-web-features |
| HTTP | [File upload and streaming](https://docs.nestjs.com/http/file-upload) | `content/http/file-upload.md` | 748 | nestjs-http-web-features |
| HTTP | [Compression](https://docs.nestjs.com/http/compression) | `content/http/compression.md` | 65 | nestjs-http-platform |
| HTTP | [Server-Sent Events](https://docs.nestjs.com/http/server-sent-events) | `content/http/server-sent-events.md` | 174 | nestjs-http-web-features |
| HTTP | [Model-View-Controller](https://docs.nestjs.com/http/mvc) | `content/http/mvc.md` | 300 | nestjs-http-web-features |
| HTTP | [HTTP adapters](https://docs.nestjs.com/http/performance) | `content/http/performance.md` | 279 | nestjs-http-platform |
| HTTP | [Webhooks](https://docs.nestjs.com/http/webhooks) | `content/http/webhooks.md` | 1853 | nestjs-webhooks |
| Observability | [Overview](https://docs.nestjs.com/observability/overview) | `content/observability/overview.md` | 117 | nestjs-observability |
| Observability | [SDK](https://docs.nestjs.com/observability/sdk) | `content/observability/sdk.md` | 581 | nestjs-observability |
| Observability | [Dashboard](https://docs.nestjs.com/observability/dashboard) | `content/observability/dashboard.md` | 163 | nestjs-observability |
| Observability | [MCP server](https://docs.nestjs.com/observability/mcp-server) | `content/observability/mcp-server.md` | 219 | nestjs-observability |
| Observability | [OpenTelemetry](https://docs.nestjs.com/observability/opentelemetry) | `content/observability/opentelemetry.md` | 227 | nestjs-observability |
| Reliability | [Resilience](https://docs.nestjs.com/reliability/resilience) | `content/reliability/resilience.md` | 837 | nestjs-resilience |
| Reliability | [Idempotency keys](https://docs.nestjs.com/reliability/idempotency) | `content/reliability/idempotency.md` | 1474 | nestjs-idempotency |
| Reliability | [Transactional outbox](https://docs.nestjs.com/reliability/outbox) | `content/reliability/outbox.md` | 1366 | nestjs-outbox |
| Reliability | [Durable workflows](https://docs.nestjs.com/reliability/workflows) | `content/reliability/workflows.md` | 1826 | nestjs-workflows |
| Reliability | [Distributed locks](https://docs.nestjs.com/reliability/locks) | `content/reliability/locks.md` | 1372 | nestjs-locks |
| Reliability | [Health checks](https://docs.nestjs.com/reliability/terminus) | `content/reliability/terminus.md` | 873 | nestjs-health-checks |
| GraphQL | [Quick start](https://docs.nestjs.com/graphql/quick-start) | `content/graphql/quick-start.md` | 508 | nestjs-graphql |
| GraphQL | [Resolvers](https://docs.nestjs.com/graphql/resolvers) | `content/graphql/resolvers-map.md` | 682 | nestjs-graphql |
| GraphQL | [Mutations](https://docs.nestjs.com/graphql/mutations) | `content/graphql/mutations.md` | 115 | nestjs-graphql |
| GraphQL | [Subscriptions](https://docs.nestjs.com/graphql/subscriptions) | `content/graphql/subscriptions.md` | 563 | nestjs-graphql |
| GraphQL | [Scalars](https://docs.nestjs.com/graphql/scalars) | `content/graphql/scalars.md` | 284 | nestjs-graphql |
| GraphQL | [Directives](https://docs.nestjs.com/graphql/directives) | `content/graphql/directives.md` | 117 | nestjs-graphql |
| GraphQL | [Interfaces](https://docs.nestjs.com/graphql/interfaces) | `content/graphql/interfaces.md` | 130 | nestjs-graphql |
| GraphQL | [Unions and Enums](https://docs.nestjs.com/graphql/unions-and-enums) | `content/graphql/unions-and-enums.md` | 266 | nestjs-graphql |
| GraphQL | [Field middleware](https://docs.nestjs.com/graphql/field-middleware) | `content/graphql/field-middleware.md` | 112 | nestjs-graphql |
| GraphQL | [Mapped types](https://docs.nestjs.com/graphql/mapped-types) | `content/graphql/mapped-types.md` | 178 | nestjs-graphql |
| GraphQL | [Plugins](https://docs.nestjs.com/graphql/plugins) | `content/graphql/plugins.md` | 79 | nestjs-graphql |
| GraphQL | [Complexity](https://docs.nestjs.com/graphql/complexity) | `content/graphql/complexity.md` | 104 | nestjs-graphql |
| GraphQL | [Extensions](https://docs.nestjs.com/graphql/extensions) | `content/graphql/extensions.md` | 57 | nestjs-graphql |
| GraphQL | [CLI Plugin](https://docs.nestjs.com/graphql/cli-plugin) | `content/graphql/cli-plugin.md` | 254 | nestjs-graphql |
| GraphQL | [Generating SDL](https://docs.nestjs.com/graphql/generating-sdl) | `content/graphql/schema-generator.md` | 81 | nestjs-graphql |
| GraphQL | [Sharing models](https://docs.nestjs.com/graphql/sharing-models) | `content/graphql/sharing-models.md` | 24 | nestjs-graphql |
| GraphQL | [Federation](https://docs.nestjs.com/graphql/federation) | `content/graphql/federation.md` | 895 | nestjs-graphql |
| WebSockets | [Gateways](https://docs.nestjs.com/websockets/gateways) | `content/websockets/gateways.md` | 334 | nestjs-websockets |
| WebSockets | [Exception filters](https://docs.nestjs.com/websockets/exception-filters) | `content/websockets/exception-filters.md` | 73 | nestjs-websockets |
| WebSockets | [Pipes](https://docs.nestjs.com/websockets/pipes) | `content/websockets/pipes.md` | 59 | nestjs-websockets |
| WebSockets | [Guards](https://docs.nestjs.com/websockets/guards) | `content/websockets/guards.md` | 27 | nestjs-websockets |
| WebSockets | [Interceptors](https://docs.nestjs.com/websockets/interceptors) | `content/websockets/interceptors.md` | 21 | nestjs-websockets |
| WebSockets | [Adapters](https://docs.nestjs.com/websockets/adapter) | `content/websockets/adapter.md` | 181 | nestjs-websockets |
| MCP | [Overview](https://docs.nestjs.com/mcp/overview) | `content/mcp/overview.md` | 136 | nestjs-mcp-server |
| MCP | [Primitives](https://docs.nestjs.com/mcp/primitives) | `content/mcp/primitives.md` | 536 | nestjs-mcp-server |
| MCP | [Transports](https://docs.nestjs.com/mcp/transports) | `content/mcp/transports.md` | 133 | nestjs-mcp-server |
| MCP | [Testing](https://docs.nestjs.com/mcp/testing) | `content/mcp/testing.md` | 388 | nestjs-mcp-server |
| MCP | [Migration](https://docs.nestjs.com/mcp/migration) | `content/mcp/migration.md` | 178 | nestjs-mcp-server |
| AI | [Overview](https://docs.nestjs.com/ai/overview) | `content/ai/overview.md` | 270 | nestjs-ai |
| AI | [Models](https://docs.nestjs.com/ai/models) | `content/ai/models.md` | 283 | nestjs-ai |
| AI | [Tools](https://docs.nestjs.com/ai/tools) | `content/ai/tools.md` | 432 | nestjs-ai |
| AI | [Agents](https://docs.nestjs.com/ai/agents) | `content/ai/agents.md` | 371 | nestjs-ai |
| AI | [Testing](https://docs.nestjs.com/ai/testing) | `content/ai/testing.md` | 464 | nestjs-ai |
| Microservices | [Overview](https://docs.nestjs.com/microservices/basics) | `content/microservices/basics.md` | 598 | nestjs-microservices |
| Microservices | [Redis](https://docs.nestjs.com/microservices/redis) | `content/microservices/redis.md` | 199 | nestjs-microservices |
| Microservices | [MQTT](https://docs.nestjs.com/microservices/mqtt) | `content/microservices/mqtt.md` | 302 | nestjs-microservices |
| Microservices | [NATS](https://docs.nestjs.com/microservices/nats) | `content/microservices/nats.md` | 297 | nestjs-microservices |
| Microservices | [RabbitMQ](https://docs.nestjs.com/microservices/rabbitmq) | `content/microservices/rabbitmq.md` | 402 | nestjs-microservices |
| Microservices | [Kafka](https://docs.nestjs.com/microservices/kafka) | `content/microservices/kafka.md` | 759 | nestjs-microservices |
| Microservices | [gRPC](https://docs.nestjs.com/microservices/grpc) | `content/microservices/grpc.md` | 682 | nestjs-microservices |
| Microservices | [Pipes](https://docs.nestjs.com/microservices/pipes) | `content/microservices/pipes.md` | 45 | nestjs-microservices |
| Microservices | [Guards](https://docs.nestjs.com/microservices/guards) | `content/microservices/guards.md` | 27 | nestjs-microservices |
| Microservices | [Interceptors](https://docs.nestjs.com/microservices/interceptors) | `content/microservices/interceptors.md` | 21 | nestjs-microservices |
| CLI | [Overview](https://docs.nestjs.com/cli/overview) | `content/cli/overview.md` | 115 | nestjs-cli-tooling |
| CLI | [Workspaces](https://docs.nestjs.com/cli/monorepo) | `content/cli/workspaces.md` | 322 | nestjs-cli-tooling |
| CLI | [Libraries](https://docs.nestjs.com/cli/libraries) | `content/cli/libraries.md` | 125 | nestjs-cli-tooling |
| CLI | [Usage](https://docs.nestjs.com/cli/usages) | `content/cli/usages.md` | 301 | nestjs-cli-tooling |
| CLI | [Scripts](https://docs.nestjs.com/cli/scripts) | `content/cli/scripts.md` | 79 | nestjs-cli-tooling |
| OpenAPI | [Introduction](https://docs.nestjs.com/openapi/introduction) | `content/openapi/introduction.md` | 486 | nestjs-openapi |
| OpenAPI | [Operations](https://docs.nestjs.com/openapi/operations) | `content/openapi/operations.md` | 354 | nestjs-openapi |
| OpenAPI | [Security](https://docs.nestjs.com/openapi/security) | `content/openapi/security.md` | 85 | nestjs-openapi |
| OpenAPI | [Mapped Types](https://docs.nestjs.com/openapi/mapped-types) | `content/openapi/mapped-types.md` | 131 | nestjs-openapi |
| OpenAPI | [Decorators](https://docs.nestjs.com/openapi/decorators) | `content/openapi/decorators.md` | 38 | nestjs-openapi |
| OpenAPI | [CLI Plugin](https://docs.nestjs.com/openapi/cli-plugin) | `content/openapi/cli-plugin.md` | 377 | nestjs-openapi |
| OpenAPI | [Other features](https://docs.nestjs.com/openapi/other-features) | `content/openapi/other-features.md` | 209 | nestjs-openapi |
| Recipes | [REPL](https://docs.nestjs.com/recipes/repl) | `content/recipes/repl.md` | 132 | nestjs-cli-tooling |
| Recipes | [CRUD generator](https://docs.nestjs.com/recipes/crud-generator) | `content/recipes/crud-generator.md` | 128 | nestjs-cli-tooling |
| Recipes | [SWC (fast compiler)](https://docs.nestjs.com/recipes/swc) | `content/recipes/swc.md` | 392 | nestjs-cli-tooling |
| Recipes | [Passport (auth)](https://docs.nestjs.com/recipes/passport) | `content/recipes/passport.md` | 1015 | nestjs-passport-auth |
| Recipes | [Hot reload](https://docs.nestjs.com/recipes/hot-reload) | `content/recipes/hot-reload.md` | 200 | nestjs-cli-tooling |
| Recipes | [Router module](https://docs.nestjs.com/recipes/router-module) | `content/recipes/router-module.md` | 58 | nestjs-request-pipeline |
| Recipes | [CQRS](https://docs.nestjs.com/recipes/cqrs) | `content/recipes/cqrs.md` | 808 | nestjs-cqrs |
| Recipes | [Serve static](https://docs.nestjs.com/recipes/serve-static) | `content/recipes/serve-static.md` | 47 | nestjs-http-web-features |
| Recipes | [Commander](https://docs.nestjs.com/recipes/nest-commander) | `content/recipes/nest-commander.md` | 160 | nestjs-standalone-apps |
| Recipes | [Async local storage](https://docs.nestjs.com/recipes/async-local-storage) | `content/recipes/async-local-storage.md` | 380 | nestjs-logging |
| Recipes | [Socket activation](https://docs.nestjs.com/recipes/socket-activation) | `content/recipes/socket-activation.md` | 133 | nestjs-deployment |
| FAQ | [Serverless](https://docs.nestjs.com/faq/serverless) | `content/faq/serverless.md` | 358 | nestjs-deployment |
| FAQ | [HTTP adapter](https://docs.nestjs.com/faq/http-adapter) | `content/faq/http-adapter.md` | 69 | nestjs-http-platform |
| FAQ | [Global path prefix](https://docs.nestjs.com/faq/global-prefix) | `content/faq/global-prefix.md` | 33 | nestjs-request-pipeline |
| FAQ | [Raw body](https://docs.nestjs.com/faq/raw-body) | `content/faq/raw-body.md` | 120 | nestjs-http-platform |
| FAQ | [Hybrid application](https://docs.nestjs.com/faq/hybrid-application) | `content/faq/hybrid-application.md` | 97 | nestjs-microservices |
| FAQ | [HTTPS & multiple servers](https://docs.nestjs.com/faq/multiple-servers) | `content/faq/multiple-servers.md` | 80 | nestjs-http-platform |
| FAQ | [Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle) | `content/faq/request-lifecycle.md` | 97 | nestjs-request-pipeline |
| FAQ | [Common errors](https://docs.nestjs.com/faq/common-errors) | `content/faq/errors.md` | 127 | nestjs-architecture |
| Devtools | [Overview](https://docs.nestjs.com/devtools/overview) | `content/devtools/overview.md` | 213 | nestjs-cli-tooling |
| Devtools | [CI/CD integration](https://docs.nestjs.com/devtools/ci-cd-integration) | `content/devtools/ci-cd.md` | 255 | nestjs-cli-tooling |
| Introduction | [Introduction](https://docs.nestjs.com) | `content/introduction.md` | 44 | core-guidelines |
| Fundamentals | [Asynchronous providers](https://docs.nestjs.com/fundamentals/async-providers) | `content/fundamentals/async-components.md` | 22 | nestjs-architecture |
| Fundamentals | [Dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules) | `content/fundamentals/dynamic-modules.md` | 580 | nestjs-architecture |
| Fundamentals | [Injection scopes](https://docs.nestjs.com/fundamentals/injection-scopes) | `content/fundamentals/provider-scopes.md` | 250 | nestjs-architecture |
| Fundamentals | [Circular dependency](https://docs.nestjs.com/fundamentals/circular-dependency) | `content/fundamentals/circular-dependency.md` | 82 | nestjs-architecture |
| Fundamentals | [Module reference](https://docs.nestjs.com/fundamentals/module-ref) | `content/fundamentals/module-reference.md` | 235 | nestjs-architecture |
| Fundamentals | [Lazy-loading modules](https://docs.nestjs.com/fundamentals/lazy-loading-modules) | `content/fundamentals/lazy-loading-modules.md` | 117 | nestjs-architecture |
| Fundamentals | [Execution context](https://docs.nestjs.com/fundamentals/execution-context) | `content/fundamentals/execution-context.md` | 342 | nestjs-request-pipeline |
| Fundamentals | [Lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events) | `content/fundamentals/lifecycle-events.md` | 118 | nestjs-architecture |
| Fundamentals | [Discovery service](https://docs.nestjs.com/fundamentals/discovery-service) | `content/fundamentals/discovery-service.md` | 118 | nestjs-architecture |
| Fundamentals | [Platform agnosticism](https://docs.nestjs.com/fundamentals/platform-agnosticism) | `content/fundamentals/platform-agnosticism.md` | 14 | nestjs-architecture |
| Security | [Encryption and Hashing](https://docs.nestjs.com/security/encryption-and-hashing) | `content/security/encryption-hashing.md` | 83 | nestjs-security-hardening |
| Observability | [Manual instrumentation](https://docs.nestjs.com/observability/manual-instrumentation) | `content/observability/manual-instrumentation.md` | 171 | nestjs-observability |
| Observability | [Distributed tracing](https://docs.nestjs.com/observability/distributed-tracing) | `content/observability/distributed-tracing.md` | 178 | nestjs-observability |
| Observability | [Error monitoring](https://docs.nestjs.com/observability/error-monitoring) | `content/observability/error-monitoring.md` | 94 | nestjs-observability |
| Observability | [Production rules](https://docs.nestjs.com/observability/production-rules) | `content/observability/production-rules.md` | 82 | nestjs-observability |
| Observability | [Choosing an APM](https://docs.nestjs.com/observability/choosing-an-apm) | `content/observability/choosing-an-apm.md` | 164 | nestjs-observability |
| GraphQL | [Other features](https://docs.nestjs.com/graphql/other-features) | `content/graphql/guards-interceptors.md` | 140 | nestjs-graphql |
| Microservices | [Custom transporters](https://docs.nestjs.com/microservices/custom-transport) | `content/microservices/custom-transport.md` | 320 | nestjs-microservices |
| Microservices | [Exception filters](https://docs.nestjs.com/microservices/exception-filters) | `content/microservices/exception-filters.md` | 102 | nestjs-microservices |
| Microservices | [Pre-request hooks](https://docs.nestjs.com/microservices/pre-request-hooks) | `content/microservices/pre-request-hooks.md` | 195 | nestjs-microservices |
| Deployment | [Deployment](https://docs.nestjs.com/deployment) | `content/deployment.md` | 308 | nestjs-deployment |
| Standalone apps | [Standalone apps](https://docs.nestjs.com/standalone-applications) | `content/application-context.md` | 101 | nestjs-standalone-apps |
| OpenAPI | [Types and Parameters](https://docs.nestjs.com/openapi/types-and-parameters) | `content/openapi/types-and-parameters.md` | 373 | nestjs-openapi |
| FAQ | [Keep-Alive connections](https://docs.nestjs.com/faq/keep-alive-connections) | `content/faq/keep-alive-connections.md` | 28 | nestjs-http-platform |
| Migration guide | [Migration guide](https://docs.nestjs.com/migration-guide) | `content/migration.md` | 538 | nestjs-upgrading |

## Deliberately excluded

| Source | Reason |
| --- | --- |
| `content/discover/who-uses.md` | Non-technical: list of companies using Nest |
| `content/enterprise.md` | Non-technical: commercial support offering, not in sidebar |
| `content/support.md` | Non-technical: sponsorship page |
