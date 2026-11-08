---
name: nestjs-microservices
description: Builds message-based services with NestJS 12 @nestjs/microservices — NestFactory.createMicroservice, hybrid apps with connectMicroservice with inheritAppConfig, @MessagePattern request-response and @EventPattern events, @Payload/@Ctx with transport contexts, ClientsModule/ClientProxy send and emit, timeouts, TCP with TLS, Redis, MQTT, NATS v3 (@nats-io/transport-node), RabbitMQ with manual acks, Kafka (reply topics, retriable exceptions, offset commits), gRPC (protos, @GrpcMethod, streaming, GrpcException status codes, reflection, health), custom transporters and serializers, RpcException filters, pipes, guards, interceptors and pre-request hooks. Use when splitting a system into services, consuming or producing messages on a broker, exposing gRPC, connecting a microservice to an HTTP app, or debugging lost messages, missing replies, UNKNOWN gRPC errors or enhancers not running on message handlers. Not for reliable publish-after-commit (nestjs-outbox) or job queues (nestjs-queues).
compatibility: NestJS 12.x; @nestjs/microservices plus the transport driver (ioredis, mqtt, @nats-io/transport-node, amqplib + amqp-connection-manager, kafkajs, @grpc/grpc-js + @grpc/proto-loader)
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS microservices

```bash
npm i @nestjs/microservices          # + the driver for your transport (see table)
```

| Transport | Driver | Pick when |
| --- | --- | --- |
| TCP (default) | built in | simple service-to-service RPC in a private network; TLS via `tlsOptions` |
| Redis | `ioredis` | already have Redis; fire-and-forget pub/sub (no persistence) |
| NATS | `@nats-io/transport-node` (v12 targets NATS v3; remove `nats`) | low-latency messaging, queue groups, wildcards |
| MQTT | `mqtt` | IoT, QoS levels |
| RabbitMQ | `amqplib amqp-connection-manager` | durable queues, acks, work distribution |
| Kafka | `kafkajs` | event streams, partitions, replay |
| gRPC | `@grpc/grpc-js @grpc/proto-loader` | typed contracts, streaming, polyglot clients |

TCP, Redis and core NATS deliver at most once ("published" = left the process). For must-not-lose events, use the outbox (nestjs-outbox) and/or an acknowledging broker.

## Server

```typescript
// standalone microservice — config from DI
const app = await NestFactory.createMicroservice<AsyncMicroserviceOptions>(AppModule, {
  useFactory: (config: ConfigService) => ({ transport: Transport.NATS, options: { servers: [config.getOrThrow('NATS_URL')] } }),
  inject: [ConfigService],
});
app.enableShutdownHooks();
await app.listen();

// hybrid: HTTP + transport
const app = await NestFactory.create(AppModule);
app.useGlobalPipes(new ValidationPipe({ transform: true }));               // BEFORE connectMicroservice when inheriting
app.connectMicroservice<MicroserviceOptions>({ transport: Transport.TCP, options: { port: 3001 } }, { inheritAppConfig: true });
await app.listen(3000);                                                    // run lifecycle hooks first…
await app.startAllMicroservices();                                         // …then start consuming
```

- Without `inheritAppConfig: true`, global pipes/guards/interceptors/filters (including `APP_*` providers) don't apply to connected microservices.
- `startAllMicroservices()` before `listen()/init()` consumes messages before `onModuleInit/onApplicationBootstrap` finish.
- Bind a handler to one transport in hybrids: `@MessagePattern('time.us.*', Transport.NATS)`.

## Handlers (in controllers)

```typescript
@Controller()
export class MathController {
  @MessagePattern({ cmd: 'sum' })                                          // request-response; may return value, Promise or Observable
  sum(@Payload() data: number[]): number { return data.reduce((a, b) => a + b, 0); }

  @EventPattern('user_created')                                            // fire-and-forget; several handlers run in parallel
  async onUserCreated(@Payload() event: UserCreatedEvent, @Ctx() ctx: NatsContext) { … }
}
```

- `@Payload('id')`, transport contexts (`NatsContext.getSubject()`, `RmqContext`, `KafkaContext`, `MqttContext`, `RedisContext`, `TcpContext`).
- Request-scoped providers: `@Inject(CONTEXT) ctx: RequestContext` (`pattern`, `data`, `context`).
- Make event handlers idempotent; brokers redeliver (`@Idempotent({ keyFrom: { payload: 'eventId' } })` — nestjs-idempotency).

## Client

```typescript
ClientsModule.registerAsync([{
  name: 'MATH_SERVICE', imports: [ConfigModule], inject: [ConfigService],
  useFactory: (config: ConfigService) => ({ transport: Transport.TCP, options: { host: config.get('MATH_HOST'), port: config.get('MATH_PORT') } }),
}]),

constructor(@Inject('MATH_SERVICE') private readonly client: ClientProxy) {}
sum(values: number[]) { return firstValueFrom(this.client.send<number>({ cmd: 'sum' }, values).pipe(timeout(5000))); }   // cold: runs on subscribe
publish(event: UserCreatedEvent) { this.client.emit('user_created', event); }                                              // hot: sent immediately
```

- Clients connect lazily; `await this.client.connect()` in `onApplicationBootstrap` to fail fast.
- Always add `timeout()` to `send()`.
- `client.status` / `server.status` streams, `client.on('error', …)`, `unwrap<T>()` for the driver.
- Custom error/response handling: `customClass: ErrorHandlingProxy` extending `ClientTCP` and overriding `serializeError` / `serializeResponse`.

## Errors, validation, enhancers

- Throw `RpcException('msg' | object)` → `{ status: 'error', message }`. RPC filters implement `RpcExceptionFilter` and **return an Observable** (`throwError(() => exception.getError())`); extend `BaseRpcExceptionFilter` to customize.
- Event handlers have no response channel: handle errors inside the filter.
- Pipes: `new ValidationPipe({ exceptionFactory: (errors) => new RpcException(errors) })`, or `@Payload({ schema })` + `StandardSchemaValidationPipe({ exceptionFactory: (issues) => new RpcException(issues) })`.
- Guards read metadata/user from `context.switchToRpc().getContext()` / `getData()`; throw `RpcException` (not `HttpException`).
- Pre-request hooks run before guards: `app.registerPreRequestHook((ctx, next) => new Observable((s) => als.run({ correlationId }, () => next().subscribe(s))))` — register before `listen()/init()` (hybrids: `connectMicroservice(opts, { deferInitialization: true })`).
- gRPC: throw `GrpcNotFoundException`, `GrpcAlreadyExistsException`, … or `new GrpcException(msg, GrpcStatus.X)`, and register `GrpcExceptionFilter`, otherwise clients get `UNKNOWN`.

## Workflow

- [ ] 1. Choose the transport by delivery guarantees; install driver; configure server (async options) and clients from config.
- [ ] 2. Message/event handlers in controllers with validated payloads (`RpcException` factories).
- [ ] 3. Hybrid: `inheritAppConfig`, global enhancers before connecting, start order.
- [ ] 4. Timeouts on `send()`, idempotent consumers, acks/commits for brokers, trace propagation (nestjs-observability).
- [ ] 5. Tests: unit-test controllers directly; integration with a real broker (Testcontainers) or a TCP client against `app.listen()`. Build, lint, run tests, start both services.

## Reference files

- `references/transports.md`: per-transport options, contexts, record builders, wildcards and quirks (Redis, MQTT QoS, NATS queue groups and headers, RabbitMQ acks and exchanges, Kafka reply topics, naming, retriable exceptions, offsets, regex patterns), gRPC protos/assets, client, streaming, reflection, health checks, metadata, TLS, and custom transporters. Read when configuring a specific transport.

Sources: [Overview](https://docs.nestjs.com/microservices/basics) · [Redis](https://docs.nestjs.com/microservices/redis) · [MQTT](https://docs.nestjs.com/microservices/mqtt) · [NATS](https://docs.nestjs.com/microservices/nats) · [RabbitMQ](https://docs.nestjs.com/microservices/rabbitmq) · [Kafka](https://docs.nestjs.com/microservices/kafka) · [gRPC](https://docs.nestjs.com/microservices/grpc) · [Custom transporters](https://docs.nestjs.com/microservices/custom-transport) · [Exception filters](https://docs.nestjs.com/microservices/exception-filters) · [Pipes](https://docs.nestjs.com/microservices/pipes) · [Pre-request hooks](https://docs.nestjs.com/microservices/pre-request-hooks) · [Guards](https://docs.nestjs.com/microservices/guards) · [Interceptors](https://docs.nestjs.com/microservices/interceptors) · [Hybrid application](https://docs.nestjs.com/faq/hybrid-application)
