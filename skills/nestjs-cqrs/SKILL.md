---
name: nestjs-cqrs
description: Implements CQRS in NestJS 12 with @nestjs/cqrs — CqrsModule.forRoot options and custom publishers, typed Command/Query classes with CommandBus/QueryBus execute, @CommandHandler/@QueryHandler/@EventsHandler providers, AggregateRoot apply/commit with EventPublisher.mergeObjectContext, WithAggregateRoot mixin and IAggregateRoot, passing a transaction as dispatcher context to commit/publish (12.1+), RxJS @Saga with ofType, durable sagas via @nestjs/workflows/cqrs (@StartOn, @SignalOn), the UnhandledExceptionBus, subscribing to all events, and request-scoped handlers with AsyncContext. Use when the user asks for CQRS, commands and queries, domain events from aggregates, sagas, event sourcing foundations, or when event handler errors disappear or saga commands are lost on restart. Not for simple in-process notifications (nestjs-events), durable delivery to other services (nestjs-outbox) or long-running processes on their own (nestjs-workflows).
compatibility: NestJS 12.x; @nestjs/cqrs (12.1+ for awaited commit/dispatcher context); @nestjs/workflows for durable sagas
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS CQRS (@nestjs/cqrs)

Use CQRS where separate read/write models or domain events pay off; for plain CRUD, services are simpler. Follow the project's existing structure (e.g. `orders/commands`, `orders/queries`, `orders/events`, `orders/sagas`).

```bash
npm i @nestjs/cqrs
```

```typescript
@Module({ imports: [CqrsModule.forRoot()] })   // options: commandPublisher, eventPublisher, queryPublisher, unhandledExceptionPublisher, eventIdProvider, rethrowUnhandled
export class AppModule {}
```

## Commands and queries

```typescript
export class PlaceOrderCommand extends Command<{ orderId: string }> {     // generic = typed result
  constructor(readonly customerId: string, readonly items: OrderItem[]) { super(); }
}

@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand> {
  constructor(private readonly repo: OrdersRepository, private readonly publisher: EventPublisher) {}
  async execute({ customerId, items }: PlaceOrderCommand) {
    const order = this.publisher.mergeObjectContext(Order.place(customerId, items));   // aggregate can publish
    await this.repo.save(order);
    order.commit();                                                                   // dispatch applied events
    return { orderId: order.id };
  }
}

export class GetOrderQuery extends Query<OrderView> { constructor(readonly id: string) { super(); } }
@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery> {
  constructor(private readonly views: OrderViewsRepository) {}
  execute({ id }: GetOrderQuery) { return this.views.find(id); }
}

// controller
const { orderId } = await this.commandBus.execute(new PlaceOrderCommand(user.id, dto.items));
const order = await this.queryBus.execute(new GetOrderQuery(id));                   // typed as OrderView
```

- Register every handler, event handler and saga class in `providers`.
- Command handler errors reach exception filters; return values go back to the caller.
- One handler per command/query; many handlers per event.

## Aggregates and events

```typescript
export class Order extends AggregateRoot {
  static place(customerId: string, items: OrderItem[]) {
    const order = new Order(randomUUID(), customerId, items);
    order.apply(new OrderPlacedEvent(order.id, customerId));     // queued until commit()
    return order;
  }
}

@EventsHandler(OrderPlacedEvent)
export class OrderPlacedHandler implements IEventHandler<OrderPlacedEvent> {
  async handle(event: OrderPlacedEvent) { try { … } catch (e) { this.logger.error(…); } }
}
```

- `autoCommit = true` publishes on `apply()`. `mergeClassContext(Order)` merges into a class. Existing base classes: `class Dragon extends WithAggregateRoot(Monster)`; framework-free domain: implement `IAggregateRoot`.
- Direct publishing: `eventBus.publish(event)` / `publishAll`.
- **Event handlers run outside the request**: exception filters don't see their errors and they can't write HTTP responses. Handle errors inside, or subscribe to `UnhandledExceptionBus` (`UnhandledExceptionBus.ofType(X)`); `rethrowUnhandled: true` rethrows instead.
- 12.1+: `commit()`/`publish()` return what the publisher returns and accept a dispatcher context: `await order.commit({ transaction: tx })` — for publishers that write through the transaction (outbox, workflows). `commit()` clears events immediately; on failure roll back and re-run the command with a fresh aggregate.
- The default event bus is in-memory: events are lost on crash. For cross-service or must-happen reactions, publish through the outbox (nestjs-outbox).

## Sagas

```typescript
@Injectable()
export class OrderSagas {
  @Saga()
  orderPlaced = (events$: Observable<any>): Observable<ICommand> =>
    events$.pipe(ofType(OrderPlacedEvent), map((e) => new ReserveStockCommand(e.orderId)));
}
```

Sagas are in-memory singletons. For processes that must survive restarts (wait for payment, timeouts), use a durable workflow:

```typescript
@Module({ imports: [CqrsModule.forRoot(), WorkflowsModule.forRoot(), WorkflowsCqrsModule], providers: [PlaceOrderHandler, OrderFulfilmentWorkflow] })

@Workflow('order-fulfilment')
@StartOn(OrderPlacedEvent, { id: (e) => `order-${e.order.id}`, input: (e) => e.order })
@SignalOn(OrderDeliveredEvent, { signal: shipmentDelivered, key: (e) => e.delivery.reference })
export class OrderFulfilmentWorkflow implements WorkflowRunner<Order, FulfilmentResult> { … }

// in the command handler's transaction, so the workflow exists iff the order does
await this.eventBus.publish(new OrderPlacedEvent(order), { transaction: tx });
```

See nestjs-workflows for steps, signals and stores.

## Request scope

Handlers can be `@CommandHandler(X, { scope: Scope.REQUEST })`. Pass context explicitly: `commandBus.execute(cmd, new MyRequest(user))` where `MyRequest extends AsyncContext`, inject with `@Inject(REQUEST)`. Sagas stay singletons: carry context with `AsyncContext.of(event)` + `AsyncContext.merge(ctx, command)`.

## Testing

Unit-test handlers by instantiating them with fake repositories and `{ mergeObjectContext: (o) => o }` as publisher; assert `aggregate.getUncommittedEvents()`. Test sagas by feeding `of(new OrderPlacedEvent(…))` into the saga function and collecting emitted commands.

## Workflow

- [ ] 1. Install; `CqrsModule.forRoot()`.
- [ ] 2. Command/query classes with typed results; handlers registered as providers.
- [ ] 3. Aggregates apply events; command handlers merge context and commit after persisting (with the transaction as context when needed).
- [ ] 4. Event handlers with their own error handling; `UnhandledExceptionBus` subscriber; durable workflows instead of sagas for must-survive processes.
- [ ] 5. Tests. Build, lint, run tests, start the app.

Sources: [CQRS](https://docs.nestjs.com/recipes/cqrs)
