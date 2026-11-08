---
name: nestjs-websockets
description: Builds real-time features with NestJS 12 WebSocket gateways — @WebSocketGateway, @SubscribeMessage handlers with @MessageBody, @ConnectedSocket, @Ack acknowledgements, WsResponse and Observable streaming, lifecycle hooks (afterInit, handleConnection, handleDisconnect), @WebSocketServer for broadcasting, request-scoped per-connection providers (v12), WsException with gateway-level filters (global filters don't apply), pipes, guards and interceptors, socket.io with the Redis adapter for multiple instances, the ws library WsAdapter with message parsers, and custom adapters. Use when adding chat, notifications, live dashboards, presence or any socket-based messaging, scaling sockets across pods, authenticating socket connections, or when gateway errors, validation or guards behave differently than HTTP. Not for SSE (nestjs-http-web-features), GraphQL subscriptions (nestjs-graphql) or microservice transports (nestjs-microservices).
compatibility: NestJS 12.x; @nestjs/websockets with @nestjs/platform-socket.io or @nestjs/platform-ws
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS WebSocket gateways

```bash
npm i @nestjs/websockets @nestjs/platform-socket.io     # or @nestjs/platform-ws (native WebSockets, faster, no namespaces/rooms)
nest g gateway events
```

Choose socket.io for rooms, namespaces, acks, reconnection and fallbacks; choose `ws` (`app.useWebSocketAdapter(new WsAdapter(app))`) for plain browser WebSockets and performance. Detect the existing adapter first.

## Gateway

```typescript
@WebSocketGateway({ namespace: 'events', cors: { origin: process.env.WEB_ORIGIN } })   // same port as HTTP by default
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;                     // Namespace when a namespace is set
  constructor(private readonly events: EventsService) {}

  afterInit(server: Server) {
    server.use((socket, next) => verifyToken(socket.handshake.auth.token) ? next() : next(new Error('unauthorized')));   // gate connections here
  }
  handleConnection(client: Socket) { /* not a gate: messages may arrive before an async check finishes */ }
  handleDisconnect(client: Socket) {}

  @SubscribeMessage('events')
  handle(@MessageBody() data: CreateEventDto, @ConnectedSocket() client: Socket): WsResponse<EventDto> {
    return { event: 'events', data: this.events.create(data) };     // or return a value → ack; or an Observable → stream
  }

  @SubscribeMessage('ping')
  ping(@MessageBody() data: string, @Ack() ack: (r: { status: string }) => void) { ack({ status: 'ok' }); }

  broadcastOrderUpdate(order: OrderDto) { this.server.to(`order:${order.id}`).emit('order.updated', order); }   // call from services
}

@Module({ providers: [EventsGateway, EventsService] })   // gateways only start when listed as providers
export class EventsModule {}
```

- `@MessageBody('id')` extracts a property. `handle(client, data)` positional style also works.
- Native WebSockets (`ws`) don't support acks; return `{ event, data }` (`WsResponse`) instead.
- With `ClassSerializerInterceptor`, return class instances (plain objects are ignored).
- Per-connection state: request-scoped providers (v12) get one instance per socket; `@Inject(REQUEST)` is the client socket. Use sparingly (overhead).
- Inject the gateway into services to emit from HTTP handlers or event listeners.

## Errors, pipes, guards, interceptors

| Enhancer | Global (`useGlobal*` / `APP_*`) applies? | Notes |
| --- | --- | --- |
| Filters | **No** | Bind with `@UseFilters()` on gateway/method; extend `BaseWsExceptionFilter` |
| Pipes | Yes | Throw `WsException`; set `exceptionFactory: (errors) => new WsException(errors)` on `ValidationPipe` / `StandardSchemaValidationPipe`, or other errors reach clients as "Internal server error" |
| Guards | Yes | `false` → `WsException('Forbidden resource')`; read the user from `context.switchToWs().getClient()` |
| Interceptors | Yes | Same API as HTTP |

- Throw `new WsException('Invalid credentials.')`; the client gets `{ status: 'error', message, cause: { pattern, data } }` on the `exception` event.
- Validation: `@MessageBody({ schema: createEventSchema })` with `StandardSchemaValidationPipe({ exceptionFactory: (issues) => new WsException(issues) })`.
- Auth: gate connections in `afterInit` middleware (socket.io) or `verifyClient` (ws options), and guard each message. With `@nestjs/authentication`, call `WsAuthenticator.authenticateConnection()` in `handleConnection` (see nestjs-authentication).
## Scaling across instances (socket.io)

```bash
npm i redis socket.io @socket.io/redis-adapter
```

```typescript
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  async connectToRedis(url: string) {
    const pub = createClient({ url }); const sub = pub.duplicate();
    await Promise.all([pub.connect(), sub.connect()]);
    this.adapterConstructor = createAdapter(pub, sub);
  }
  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
const adapter = new RedisIoAdapter(app); await adapter.connectToRedis(config.REDIS_URL); app.useWebSocketAdapter(adapter);
```

Also either force `transports: ['websocket']` on clients or enable sticky sessions on the load balancer — Redis alone isn't enough with polling.

## ws adapter specifics

`new WsAdapter(app, { messageParser: (data) => { const [event, payload] = JSON.parse(data.toString()); return { event, data: payload }; } })`. No namespaces (throws): use `@WebSocketGateway({ path: '/users' })` per gateway. Custom adapters implement `WebSocketAdapter` (`create`, `bindClientConnect`, `bindMessageHandlers`, `close`).

## Testing

Unit-test handlers by calling gateway methods directly. E2E: `app.listen(0)`, connect with `socket.io-client` (or `ws`) to the server URL, emit, await the response/ack, and disconnect in `afterEach`.

## Workflow

- [ ] 1. Pick the adapter; install; `nest g gateway`; add to a module's providers.
- [ ] 2. Define message DTOs/schemas + validation pipe with `WsException` factory.
- [ ] 3. Connection auth (middleware/verifyClient) + per-message guards; gateway-level filters.
- [ ] 4. Broadcasting via `@WebSocketServer()`; rooms/namespaces; Redis adapter + sticky sessions for multi-instance.
- [ ] 5. Socket client e2e tests. Build, lint, run tests, start the app.

Sources: [Gateways](https://docs.nestjs.com/websockets/gateways) · [Exception filters](https://docs.nestjs.com/websockets/exception-filters) · [Pipes](https://docs.nestjs.com/websockets/pipes) · [Guards](https://docs.nestjs.com/websockets/guards) · [Interceptors](https://docs.nestjs.com/websockets/interceptors) · [Adapters](https://docs.nestjs.com/websockets/adapter)
