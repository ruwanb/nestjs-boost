---
name: nestjs-ai
description: Brings language models into NestJS 12 apps with @nestjs/ai on the AI SDK — AiModule.forRoot/forRootAsync with named models (Anthropic, OpenAI, Google and other @ai-sdk providers), AiService generateText, generateObject with Zod schemas and streamText to the browser (pipeUIMessageStreamToResponse, useChat), per-call/model/module timeouts, retries and fallback models on @nestjs/resilience, pricing, onUsage, budgets, AiModelError/AiOutputError/AiBudgetExceededError, @AgentFunction tools with caller, scopes, guards and AiExecutionContext, the agent loop (maxSteps, conversations), durable agent runs with human approval on @nestjs/workflows, @InjectModel and AiTools for raw AI SDK calls, and FakeModel testing. Use when adding LLM features (classification, extraction, drafting, chat assistants, agents with tools), making model calls reliable and cost-bounded, or testing code that calls models without a provider. Not for exposing the app to external assistants (nestjs-mcp-server).
compatibility: NestJS 12.x; @nestjs/ai, @nestjs/resilience, ai (AI SDK), an @ai-sdk/* provider package, zod 4.2+; @nestjs/workflows for durable runs
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS AI (@nestjs/ai)

```bash
npm i @nestjs/ai @nestjs/resilience ai @ai-sdk/anthropic zod     # any @ai-sdk/* provider works the same way
```

The schema rules are the same as for `@nestjs/mcp`: Zod 4.2+, ArkType, or Valibot via `toStandardJsonSchema()`.

```typescript
AiModule.forRootAsync({
  isGlobal: true,                                       // otherwise AiService is injectable only where AiModule is imported
  imports: [ConfigModule], inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const anthropic = createAnthropic({ apiKey: config.getOrThrow('ANTHROPIC_API_KEY') });
    return {
      models: {
        default: { model: anthropic('claude-opus-5-5'), pricing: { input: 4, output: 20, cachedInput: 0.2 }, fallback: 'backup' },
        fast: { model: anthropic('claude-haiku-5-5'), timeout: '15s', fallback: 'default' },
        backup: openai('gpt-5'),
      },
      defaults: { timeout: '30s', retry: { attempts: 3 }, maxOutputTokens: 1_000 },
    };
  },
}),
```

Calls that name no model use `default`. In the module, a string such as `'openai/gpt-5'` is an AI Gateway model id; in a call, a string always names one of the module's models. Without a factory, the provider reads its key from the environment (`ANTHROPIC_API_KEY`). A setting resolves from the call first, then the model definition, then `defaults`.

## Calls

```typescript
@Injectable()
export class TriageService {
  constructor(private readonly ai: AiService) {}

  async draft(email: string) {
    const { text } = await this.ai.generateText({
      model: 'fast', label: 'draft-reply',                // label names the call in usage and policy events
      instructions: 'Draft a short, friendly reply. Sign it "The Cat Store".',
      prompt: email,                                      // or messages: ModelMessage[] (not both)
      maxOutputTokens: 400,
    });
    return text;
  }

  async triage(email: string) {
    const { object } = await this.ai.generateObject({
      model: 'fast', label: 'triage',
      schema: z.object({
        category: z.enum(['shipping', 'billing', 'product', 'other']).describe('What the email is about'),
        orderId: z.string().nullable().describe('The order id it mentions, such as ord_123, or null'),
        urgent: z.boolean().describe('Whether the customer needs an answer today'),
      }),
      prompt: email,
    });
    return object;                                         // typed and validated; schema transforms run on the answer
  }
}
```

- Results include `text`, `finishReason` (`stop`, `length`, or `tool-calls` when `maxSteps` ran out), `usage`, `cost`, `steps`, `toolCalls`, `toolResults`, `responseMessages` and `model`.
- `streamText()` returns a stream immediately. In a route, call `await answer.pipeUIMessageStreamToResponse(res)` with `@Res()`, then use `useChat()` from `@ai-sdk/react` in the browser. Use `pipeTextStreamToResponse()` for plain text. Details: reference.
- `.describe()` texts reach the model: say what each field means and give an example value.

## Reliability and cost

| Setting | Default | Notes |
| --- | --- | --- |
| `timeout` | `'60s'` per attempt | Until the full answer (until the first chunk for streams). Tool time doesn't count. `false` = no limit |
| `retry` | 3 attempts, backoff from `'1s'` doubling to `'30s'` with jitter | Retries 408/409/429/5xx, connection failures and timeouts; honours `retry-after` |
| `fallback` | the model's | Models tried in order after retries run out. Only the call's own model's `fallback` is followed, so list every model. Narrow with `fallbackIf` (skip on 400). Each fallback is logged as a warning |
| `resilience` | | A policy or a `ResilienceService` preset name (circuit breaker, bulkhead) in place of `retry`+`timeout` |
| `budget` | | `{ maxTokens, maxCost }` per call, checked before each model call → `AiBudgetExceededError` |
| `maxSteps` | 10 | Model calls per call while tools are requested |
| `onUsage` | | On the module and/or the call (both run). `event.cost` needs `pricing`. A listener that throws is logged and never fails the call |

Errors (all extend `AiError`):
- `AiModelError`: every attempt on every model failed. It has `attempts` and `cause`; map it to 503 in a filter.
- `AiOutputError`: the answer isn't valid for the schema, or tools were still being called at `maxSteps`. It carries `text` and is **never retried or sent to a fallback**.
- `AiBudgetExceededError`.
- `AiConfigurationError`: an unknown model, tool or option, raised before anything is sent.
- `AiToolError`.

Once a chunk has streamed or tools have started, the outcome is committed: no retry or fallback can replay it. An `abortSignal` (for example `AbortSignal.timeout(120_000)`) cancels the call immediately, without retries.

`@InjectModel('fast') model: LanguageModel` gives the raw provider model for direct AI SDK calls. These calls get **none** of the timeouts, fallbacks, budgets or usage events. Pass agent functions to them with `this.tools.select(['find-order'], { caller: { request } })` from `AiTools`.

## Agent functions (tools)

```typescript
@Injectable()                                      // singleton: agent functions on request-scoped providers fail at startup
export class AssistantTools {
  constructor(private readonly orders: OrdersService) {}

  @AgentFunction({
    name: 'change-address',                        // 1–64 chars [A-Za-z0-9_-]; defaults to the method name
    description: 'Change the delivery address of an order that has not shipped yet',
    inputSchema: z.object({ orderId: z.string().describe('The order id, such as ord_123'), address: z.string().min(10) }),
    scopes: ['orders:write'],                      // checked against caller.scopes before guards
  })
  @UseGuards(OrderOwnerGuard)
  changeAddress({ orderId, address }: { orderId: string; address: string }, ctx: AgentFunctionContext) {
    return this.orders.changeAddress(orderId, address, { signal: ctx.signal });
  }
}

// in a route: tools by name or provider class; caller = who the agent acts for
await this.ai.generateText({ prompt: body.question, tools: ['find-order', AssistantTools], caller: { request }, maxSteps: 5 });
// in a job: caller: { user: { id: 'refund-bot' }, scopes: ['orders:refund'] }
```

- **Order of a call:** schema validation → `scopes` → guards (global first) → interceptors → pipes → method.
- **Context:** the type is `'ai'`. Read it with `AiExecutionContext.create(context)`, which provides `getInput()`, `getContext()`, `getName()` and `getRequest()`. HTTP-only global enhancers must check `context.getType()`.
- **`AgentFunctionContext`:** `name`, `request`, `user`, `scopes`, `toolCallId`, `idempotencyKey` (durable runs), `messages`, `signal` and `reportProgress()`.
- **Errors:** thrown errors are fed back to the model. `HttpException` messages pass through; other errors become `Internal server error`.
- **Results:** return values are serialized as JSON for the model.
- **Calls with no `caller`** run with no request, no user and no scopes.
- **MCP:** one method can carry both `@Tool()` (`@nestjs/mcp`) and `@AgentFunction()`. Branch on `'mcp'` vs `'ai'` in guards.
- **With `@nestjs/authentication` ≥ 0.1.4 and `@nestjs/authorization` ≥ 0.1.2:**
  - `@CurrentUser()` and `@Can()` work in agent functions.
  - Providers that jobs call need `@Public()`.

## Workflow

- [ ] 1. Install the provider package; register named models (`default` plus cheaper `fast`, with a fallback) from config; set `defaults`.
- [ ] 2. Use `generateObject` for classification and extraction (schemas with `.describe()`), `generateText`/`streamText` for prose and chat.
- [ ] 3. Set timeouts, retries and fallbacks; add `pricing` + `onUsage` metering and `budget` on agentic calls; map `AiModelError` to 503.
- [ ] 4. Agent functions: model-oriented descriptions, `caller`, scopes and guards, `signal` passthrough, idempotent side effects.
- [ ] 5. Tests with `FakeModel` / `overrideModels()` / `callTool()`, never a real provider. Build, lint, run tests, start the app.

## Reference files

- `references/ai-reference.md`: module options, the agent loop and conversations, streaming (errors, keep-alive, progress chunks, other stream readers), durable agent runs with approvals (`AiWorkflowsModule`, `AiAgents.run` options, `idempotencyKey`), resilience presets and diagnostics channels, Observe integration, and testing (FakeModel answers, `providerError`, `overrideModels`, `callTool`, stream and durable-run tests). Read when building chat or agents, durable flows, or tests.

Sources: [Overview](https://docs.nestjs.com/ai/overview) · [Models](https://docs.nestjs.com/ai/models) · [Tools](https://docs.nestjs.com/ai/tools) · [Agents](https://docs.nestjs.com/ai/agents) · [Testing](https://docs.nestjs.com/ai/testing)
