---
name: nestjs-events
description: Decouples NestJS 12 modules with in-process events using @nestjs/event-emitter (EventEmitter2) — EventEmitterModule.forRoot options, emitting typed event classes with EventEmitter2.emit/emitAsync, @OnEvent listeners with async, prependListener and suppressErrors options, namespaces and wildcards (order.*, **), request-scoped listeners, avoiding lost events at startup with EventEmitterReadinessWatcher, and testing emitters and listeners. Use when one module should react to something another module did (send a welcome email after sign-up, update stats after an order) without a direct dependency, or when listeners don't fire, errors vanish or startup events are missed. Not for durable/cross-process messaging (nestjs-outbox, nestjs-queues, nestjs-microservices), CQRS buses (nestjs-cqrs) or real-time client push (nestjs-websockets, SSE in nestjs-http-web-features).
compatibility: NestJS 12.x; @nestjs/event-emitter
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS events (@nestjs/event-emitter)

In-process, fire-and-forget, **not durable**: events are lost if the process crashes or a listener throws. If the reaction must happen (emails, webhooks, other services), write it to the outbox (nestjs-outbox) or a queue (nestjs-queues) in the same transaction instead.

```bash
npm i @nestjs/event-emitter
```

## Setup

```typescript
@Module({ imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.', maxListeners: 20 })] })
export class AppModule {}
```

Registered globally. Listeners are registered in `onApplicationBootstrap`. Other options: `newListener`, `removeListener`, `verboseMemoryLeak`, `ignoreErrors`.

## Emit and listen

```typescript
// orders/events/order-created.event.ts
export class OrderCreatedEvent {
  static readonly name = 'order.created';     // keep event names in one place
  constructor(readonly orderId: string, readonly userId: string) {}
}

// orders/orders.service.ts
constructor(private readonly events: EventEmitter2) {}
async create(dto: CreateOrderDto) {
  const order = await this.repo.create(dto);
  this.events.emit(OrderCreatedEvent.name, new OrderCreatedEvent(order.id, dto.userId));
  return order;
}

// notifications/order-listener.ts
@Injectable()
export class OrderCreatedListener {
  private readonly logger = new Logger(OrderCreatedListener.name);
  @OnEvent(OrderCreatedEvent.name, { async: true })
  async handle(event: OrderCreatedEvent) { await this.mailer.sendReceipt(event.orderId); }
}
```

- Listener classes must be providers of a module that's loaded.
- `emit()` returns immediately with sync listeners run inline; `emitAsync()` returns a promise of all listener results (use when the caller must wait).
- `@OnEvent` options: `async`, `prependListener`, `suppressErrors` (default **true**: errors are logged, not rethrown), plus EventEmitter2 `OnOptions`.
- Emit after the transaction commits; emitting inside it notifies listeners about data that may roll back.
- Wildcards (with `wildcard: true`): `order.*` matches one segment; `**` matches all. Events can be arrays (`['order', 'created']`).
- Request-scoped listener providers get a new instance per event; `REQUEST` resolves to the payload.

## Startup events

Events emitted from constructors or `onModuleInit` can be lost. In `onApplicationBootstrap`, `await this.readiness.waitUntilReady()` (`EventEmitterReadinessWatcher`) before emitting.

## Testing

- Emitter: provide `{ provide: EventEmitter2, useValue: { emit: vi.fn() } }` and assert the event name and payload.
- Listener: call the method directly with an event instance.
- Integration: import `EventEmitterModule.forRoot()` in the testing module, call `app.init()` (listeners register on bootstrap), emit with `emitAsync()` and await.

## Workflow

- [ ] 1. Install; `EventEmitterModule.forRoot()` in `AppModule`.
- [ ] 2. Define event classes with a name constant; emit after commit.
- [ ] 3. Add listener providers with `@OnEvent`; decide `async` and error handling (log + metrics; don't rely on suppressed errors silently).
- [ ] 4. Tests for emit + listener. Build, lint, run tests, start the app.

Sources: [Events](https://docs.nestjs.com/application/events)
