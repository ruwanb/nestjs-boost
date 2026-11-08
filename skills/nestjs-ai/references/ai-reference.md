# @nestjs/ai reference

## Contents
- Module options and setting precedence
- Resilience presets and events
- The agent loop and conversations
- Streaming to the browser
- Durable agent runs
- Testing

## Module options and setting precedence

| Option | Default | Notes |
| --- | --- | --- |
| `models` | | Required. Each value is a `LanguageModel` or `{ model, fallback, pricing, timeout, retry, resilience, maxOutputTokens, … }` |
| `defaults.timeout` / `retry` / `resilience` | `'60s'` / 3 attempts from `'1s'` / | `retry` = `RetryPolicy` options (`attempts`, `backoff` {`delay`, `factor`, `maxDelay`, `jitter`}, `retryIf`); `false` disables |
| `defaults.maxSteps` | `10` | Also caps durable runs (whose own default is 25) |
| `defaults.budget` | | `maxTokens`, `maxCost` |
| `defaults.maxOutputTokens`, `temperature`, `providerOptions`, `headers` | | Sent to the model |
| `onUsage` | | Usage event: `label`, `model`, `step`, `attempt`, `fallback`, `stream`, `usage`, `cost`, `durationMs`, `finishReason` |
| `include` | all modules | Where agent functions are searched |
| `isGlobal` | `false` | Top level of `forRootAsync()` |
| `modelNames` | | Extra names `@InjectModel()` may inject (lazy-loaded classes). Top level of `forRootAsync()` |

| Setting | Where it can be set |
| --- | --- |
| `timeout`, `retry`, `resilience`, generation settings | call, model, `defaults` |
| `maxSteps`, `budget` | call, `defaults` |
| `fallback` | call, model |
| `pricing` | model (per million tokens, in your unit) |
| `topP`, `topK`, `seed`, `stopSequences`, penalties, `toolChoice`, `fallbackIf`, `abortSignal` | call only |

`forRootAsync()` accepts `useFactory`, `useClass` (`AiOptionsFactory.createAiOptions()`) or `useExisting`. `@InjectModel('typo')` fails at startup and names the class that asked.

## Resilience presets and events

```typescript
ResilienceModule.forRoot({ presets: { anthropic: { retry: { attempts: 3 }, timeout: '30s', circuitBreaker: { name: 'anthropic', failureRateThreshold: 50 } } } }),
AiModule.forRoot({ models: { default: { model: anthropic('claude-opus-5-5'), resilience: 'anthropic', fallback: 'backup' }, backup: openai('gpt-5') } }),
```

- A preset replaces the model's `retry` and `timeout`. A preset without a timeout means **no timeout**.
- `CircuitOpenError` or `BulkheadFullError` reaches the caller as-is when no fallback takes over.
- Events are published on the `nestjs:resilience:retry|timeout|fallback` diagnostics channels, named `ai:<model> retry`, with `source` = the call's label: `subscribe('nestjs:resilience:retry', …)`.
- `@nestjs/observe` ≥ 0.3.20 records the model and tokens on the outbound span. For AI Gateway ids, add `ai-gateway.vercel.sh` to `outgoing.llm.hosts`.

## The agent loop and conversations

- Each model call is a **step** (`result.steps[i]`: `index`, `text`, `toolCalls`, `toolResults` (`output` or `error`), `finishReason`, `usage`, `cost`, `model`, `attempts`).
- If `maxSteps` runs out: `generateText` resolves with `finishReason: 'tool-calls'`, and `generateObject` rejects with `AiOutputError`.
- `toolChoice`: `'auto'` (default), `'none'`, `'required'`, or `{ type: 'tool', toolName }`. Not every model supports the last two.
- Conversations: send `messages: ModelMessage[]` and append `responseMessages` after each call. Store conversations in a database, not in memory. `instructions` aren't part of the conversation and are sent on every call.
- A failed agent function call is a tool result the model reads, not a failed call.

## Streaming to the browser

```typescript
@Post('chat')
async chat(@Body() { messages }: { messages: UIMessage[] }, @Req() request: Request, @Res() response: Response) {
  const answer = this.ai.streamText({
    label: 'assistant', instructions: '…',
    messages: await convertToModelMessages(messages),        // from 'ai'
    tools: ['find-order', 'change-address'], caller: { request },
  });
  await answer.pipeUIMessageStreamToResponse(response, {
    keepAlive: '10s',                                         // default 15 s comment lines; false disables
    errorText: (e) => (e instanceof AiModelError ? 'The assistant is unavailable. Try again in a minute.' : 'Something went wrong.'),
  });
}
// browser: useChat({ transport: new DefaultChatTransport({ api: '/assistant/chat' }), onData: (p) => p.type === 'data-tool-progress' && … })
```

- Works on Express, Fastify (`FastifyReply`, keeps pre-set headers) and the Node adapter.
- **Errors:** a failure before the first chunk rejects normally, so route filters answer it, and retries/fallbacks still apply. A failure after it ends the stream with `An error occurred.`; customise this with `errorText`.
- **Disconnects:** a browser disconnect aborts the model call and the tools' `signal`.
- **Headers:** `text/event-stream` with `x-accel-buffering: no`. Add your own with `status` and `headers`.
- **Progress:** `ctx.reportProgress()` in an agent function sends a transient `data-tool-progress` chunk `{ toolCallId, toolName, progress, total, message }`.
- **Other readers:**
  - `pipeTextStreamToResponse(res)` (text/plain)
  - `textStream`, `toUIMessageStream()`, `toUIMessageStreamResponse()`
  - promises: `text`, `usage`, `steps`, `finishReason`, `responseMessages`, `result`

## Durable agent runs

```bash
npm i @nestjs/workflows
```

```typescript
@Module({ imports: [AiWorkflowsModule], controllers: [ApprovalsController], providers: [RefundRequest, RefundTools] })   // from '@nestjs/ai/workflows'
export class RefundsModule {}

@Workflow('refund-request')
export class RefundRequest {
  constructor(private readonly agents: AiAgents) {}
  run(ctx: WorkflowContext, input: { email: string; customerId: string }) {
    return this.agents.run(ctx, {
      label: 'refund-request', instructions: '…', prompt: input.email,
      tools: ['find-order', 'refund'], approve: ['refund'],
      caller: { user: { id: input.customerId }, scopes: ['orders:refund'] },
    });
  }
}

await this.workflows.start(RefundRequest, input, { id: `refund-${ticket.id}` });   // WorkflowClient; same id → same run
this.agents.pendingApprovals(runId);  // [{ key, toolName, input }]
this.agents.approve(key);  this.agents.reject(key, { reason });   // both also accept `by` (who answered), kept with the answer
```

- The app also imports `WorkflowsModule` (with a DB store) and `AiModule`.
- Options are stored as data: models and tools by name, and `caller` as `user` + `scopes` only (there is no request after a restart). With authentication, mark the tool providers `@Public()`.
- Calls listed in `approve` suspend the instance until a person answers, or until `approvalTimeout` passes, in which case the call doesn't run. Rejected calls tell the model the reason.
- Agent function calls run **at least once**. Pass `ctx.idempotencyKey` to payment providers and other side effects.
- Failed model calls retry as workflow steps (3 attempts by default). After `stepsPerInstance` (10) model calls, the run continues in a child workflow to keep journals short.
- The output is the `generateText` result as JSON, also available via `WorkflowClient.getStatus(runId)`.
- `run()` options: `model`, `fallback`, `instructions`, `prompt`, `messages`, `tools`, `approve`, `approvalTimeout`, `caller`, `maxSteps` (25), `stepsPerInstance` (10), `budget`, `label`, `toolChoice`, `maxOutputTokens`, `temperature`, `providerOptions`.

## Testing

```typescript
import { FakeModel, providerError, overrideModels, callTool } from '@nestjs/ai/testing';

const model = new FakeModel([
  'Your order has shipped.',                                                   // text
  { toolCalls: [{ name: 'find-order', input: { orderId: 'ord_123' } }] },     // tool call
  (call) => `The order is ${JSON.stringify(call.toolResults[0].output)}`,      // function of the call
  { object: { category: 'shipping', orderId: 'ord_123', urgent: false } },     // generateObject
  providerError(529),                                                          // APICallError; retryable for 408/409/429/5xx
]);
```

- **Answer options:**
  - `usage` (10/10 tokens by default), `finishReason`
  - `delay`, which abort and timeout cut short
  - `chunkDelay`, for streams sent in word-sized chunks
  - `streamError`
- **Helpers:** `model.reply(...)` appends answers, and `fakeModel(...)` is a shorthand. When answers run out, the call fails with `no answer left for call N`.
- **Inspecting calls:** `model.calls` and `model.lastCall` expose `instructions`, `lastUserMessage`, `toolResults`, `tools`, `stream` and `options`.
- **Unit and service tests:** `AiModule.forRoot({ models: { default: new FakeModel(), fast } })` in a testing module. For retry tests, use `timeout: 50` and `retry: { attempts: 2, backoff: { delay: 0 } }`.
- **E2E:** `overrideModels(Test.createTestingModule({ imports: [AppModule] }), { default: model })` keeps pricing, fallbacks and policies, and replaces `@InjectModel()` models too. Agent functions run for real, and their failures appear in `model.lastCall.toolResults`.
- **Agent functions:** `callTool(moduleRef, 'change-address', input, { caller: { request: { user } } })` runs schema → scopes → enhancers → method, and rejects with `AiToolError`. A direct method call skips all of that.
- **Streams:** POST to the chat route with `UIMessage`s and expect a 200 `text/event-stream` response, then split the body on `\n\n`.
- **Durable runs:** use `WorkflowsModule` with the in-memory store, a `ManualWorkflowClock` and the worker off. `WorkflowWorker.drain()` advances the run. Journaled calls aren't repeated on resume.
