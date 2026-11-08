# Transport reference

## Contents
- TCP (TLS)
- Redis
- MQTT
- NATS
- RabbitMQ
- Kafka
- gRPC
- Custom transporters

## TCP (TLS)

Default transport. Server: `{ transport: Transport.TCP, options: { host, port, tlsOptions: { key, cert } } }`. Client: same with `tlsOptions: { ca: [caCert] }`. Status: `TcpStatus`; events `TcpEvents`; `unwrap<net.Socket>()` / `unwrap<net.Server>()`. From v12.1.1 client `on()` listeners survive reconnects until `close()`.

## Redis

`npm i ioredis`. `{ transport: Transport.REDIS, options: { host, port, retryAttempts (0), retryDelay (5000), wildcards (false → psubscribe), …ioredis options } }`. Context: `RedisContext.getChannel()`. Pub/sub only — no persistence or acks; offline consumers miss messages.

## MQTT

`npm i mqtt`. `{ transport: Transport.MQTT, options: { url: 'mqtt://localhost:1883', subscribeOptions: { qos: 2 }, …MQTT.js options } }`. Per-pattern QoS: `@EventPattern('critical-events', { qos: 2 })`. Wildcards `+`/`#` in patterns. `MqttRecordBuilder` for QoS/retain/properties per message; `MqttContext.getTopic()`, `getPacket()`.

## NATS

`npm i @nats-io/transport-node` (v12 targets NATS v3; uninstall `nats`). Options: NATS connection options plus `queue` (queue group for load balancing), `gracefulShutdown` (unsubscribe, wait `gracePeriod` 10000 ms, close), `headers` (client default headers), custom `serializer`/`deserializer`.

```typescript
const headers = nats.headers();                                        // from '@nats-io/nats-core'
headers.set('x-version', '1.0.0');
this.client.send('replace-emoji', new NatsRecordBuilder(':cat:').setHeaders(headers).build());
// server: context.getHeaders()?.get('x-version'); context.getSubject()
```

Wildcards: `time.us.*`. Core NATS is at most once.

## RabbitMQ

`npm i amqplib amqp-connection-manager`.

| Option | Notes |
| --- | --- |
| `urls`, `queue`, `queueOptions` (`durable`, …) | |
| `prefetchCount`, `isGlobalPrefetchCount` | flow control |
| `noAck` | default `true`; set `false` for manual acks |
| `persistent` | survive broker restarts (with a durable queue) |
| `noAssert` | skip `assertQueue` |
| `wildcards`, `exchange`, `exchangeType` (`topic` default), `exchangeArguments`, `routingKey` | topic routing with `*`/`#` |
| `headers` (producer), `replyQueue` (`amq.rabbitmq.reply-to`), `socketOptions`, `consumerTag`, `maxConnectionAttempts` (-1) | |

Manual ack:

```typescript
@MessagePattern('notifications')
handle(@Payload() data: number[], @Ctx() ctx: RmqContext) {
  ctx.getChannelRef().ack(ctx.getMessage());     // nack/reject for failures
}
```

`RmqRecordBuilder(payload).setOptions({ headers, priority }).build()` for per-message options.

## Kafka

`npm i kafkajs`. Options: `client` (KafkaJS client: `clientId`, `brokers`, SSL/SASL), `consumer` (`groupId`, …), `run`, `subscribe` (not topics), `producer`, `send`, `producerOnlyMode`, `postfixId`.

- Naming: Nest appends `-server` / `-client` to `clientId` and `groupId` (change with `postfixId`).
- Request-response needs reply topics: `client.subscribeToResponseOf('hero.kill.dragon')` in `onModuleInit` before `connect()`. Messages without `kafka_correlationId`/`kafka_replyTopic` headers (other producers) are treated as events.
- Patterns may be `RegExp` (v12): `@EventPattern(/^hero\..+$/)`.
- `KafkaContext`: `getMessage()`, `getPartition()`, `getTopic()`, `getConsumer()`, `getProducer()`, `getHeartbeat()`.
- Errors: unhandled errors in **event** handlers are retriable by default (kafkajs retries); in message handlers throw `KafkaRetriableException` to retry. Build max-retry/skip logic in an exception filter that republishes with a retry header and commits the offset when exhausted.
- Manual commits: `await ctx.getConsumer().commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }])` (disable auto-commit in `run`).
- Key messages (`{ key, value }`) to keep per-entity order within a partition.

## gRPC

`npm i @grpc/grpc-js @grpc/proto-loader`; copy protos with `"assets": ["**/*.proto"], "watchAssets": true` in `nest-cli.json`.

```typescript
// server
{ transport: Transport.GRPC, options: { package: 'hero', protoPath: join(import.meta.dirname, 'hero/hero.proto'), url: '0.0.0.0:5000', loader: { keepCase: true } } }

@Controller()
export class HeroesController {
  @GrpcMethod('HeroesService', 'FindOne')
  findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero { … }
}

// client
ClientsModule.register([{ name: 'HERO_PACKAGE', transport: Transport.GRPC, options: { package: 'hero', protoPath } }]);
onModuleInit() { this.heroes = this.client.getService<HeroesService>('HeroesService'); }   // methods return Observables
```

- Without `loader.keepCase: true`, fields with underscores aren't sent.
- Errors: status exceptions (`GrpcNotFoundException`, `GrpcInvalidArgumentException`, `GrpcPermissionDeniedException`, `GrpcResourceExhaustedException`, `GrpcDeadlineExceededException`, …) or `new GrpcException(msg, GrpcStatus.X)` + `app.useGlobalFilters(new GrpcExceptionFilter())`. `RpcException` with a numeric `code`/`status` also maps.
- Streaming: `@GrpcStreamMethod()` receives an `Observable` of requests and returns an `Observable` (Subject strategy); `@GrpcStreamCall()` gets the raw duplex stream. Generate interfaces with `ts-proto`.
- Metadata: read the 2nd argument; send with `call.sendMetadata(new Metadata())`.
- Reflection: `npm i @grpc/reflection`; `onLoadPackageDefinition: (pkg, server) => new ReflectionService(pkg).addToServer(server)`.
- Health: `npm i grpc-health-check`; include its proto in `protoPath` and in `onLoadPackageDefinition` create `HealthImplementation`, `addToServer(server)`, `setStatus('', 'SERVING')`.
- Multiple packages: `package: ['hero', 'hero2']`, `protoPath: [...]`.

## Custom transporters

```typescript
class GoogleCloudPubSubServer extends Server implements CustomTransportStrategy {
  listen(callback: () => void) { /* subscribe; for each message: this.messageHandlers.get(pattern)?.(data, ctx) */ callback(); }
  close() {}
  on() { throw new Error('Method not implemented.'); }
  unwrap<T>(): T { throw new Error('Method not implemented.'); }
}
NestFactory.createMicroservice(AppModule, { strategy: new GoogleCloudPubSubServer() });
```

- `this.getHandlerByPattern(pattern)`, handler `isEventHandler` flag; report event handler errors yourself.
- Client side: extend `ClientProxy` (`connect`, `close`, `publish`, `dispatchEvent`, `unwrap`) and register with `ClientsModule.register([{ name, customClass: MyClientProxy, options }])`.
- Serialization: `serializer`/`deserializer` options, or override `serializeResponse()` / `serializeError()` in a `ClientProxy` subclass.
- If you don't need `@MessagePattern`/`@EventPattern`, a standalone app consuming the broker SDK directly may be simpler.
