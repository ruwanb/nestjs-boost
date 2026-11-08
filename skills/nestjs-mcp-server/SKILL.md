---
name: nestjs-mcp-server
description: Turns a NestJS 12 application into a Model Context Protocol server with @nestjs/mcp — McpModule.forRoot/forRootAsync, @Tool with Zod or Standard Schema inputSchema/outputSchema and annotations, @Resource and @ResourceTemplate, @Prompt, McpContext (authInfo, signal, reportProgress, inputRequired elicitation), guards, interceptors, pipes and filters with McpExecutionContext, tool errors vs JSON-RPC errors, OAuth 2.1 resource-server auth with McpTokenVerifier, scopes and @nestjs/authentication integration, the Streamable HTTP endpoint (Origin/Host checks, CORS, body size), stdio with McpStdioServer and McpStdioLogger, in-memory testing with connectMcpClient, and migration from @rekog/mcp-nest. Use when exposing app features to AI assistants (Claude, IDEs, agents) as tools, resources or prompts, securing or testing an MCP endpoint, or porting an existing MCP integration. Not for calling LLMs from the app (nestjs-ai) or general HTTP auth (nestjs-authentication).
compatibility: NestJS 12.x; @nestjs/mcp with @modelcontextprotocol/server (SDK v2) and zod 4.2+ (or another Standard Schema library with JSON Schema output)
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS MCP server

```bash
npm i @nestjs/mcp @modelcontextprotocol/server zod
npm i -D @modelcontextprotocol/client          # in-memory test client
```

Zod 4.2+ and ArkType work directly; Valibot through `toStandardJsonSchema()`; an existing JSON Schema via `fromJsonSchema()`. **Zod 3 schemas are refused at startup.**

```typescript
McpModule.forRoot({
  name: 'cat-store', version: '1.0.0',
  instructions: 'Look orders up with find-order before changing them.',   // tells the model how to use the server
}),
```

`app.listen(3000)` then serves the endpoint at `/mcp`. Inspect it with `npx @modelcontextprotocol/inspector`. At startup the module scans providers (all modules, or only `include`) for decorated methods. It fails fast on duplicate names, invalid schemas, or `scopes` declared without `auth`.

## Primitives: methods on providers

| Primitive | Decorator | Who uses it | Called with |
| --- | --- | --- | --- |
| Tool (an action) | `@Tool({ name, description, inputSchema, outputSchema?, annotations?, scopes? })` | the model | validated input, `ctx` |
| Resource (data) | `@Resource({ uri, mimeType })` / `@ResourceTemplate({ uriTemplate: 'orders://{orderId}' })` | the client, often attached by the user | `{}` or the template variables, `ctx` (`ctx.uri`) |
| Prompt (a template) | `@Prompt({ name, description, argsSchema })` | the user picks one | validated args, `ctx` |

```typescript
@Injectable()                                          // a plain provider, listed in a module's providers
export class OrdersTools {
  constructor(private readonly orders: OrdersService) {}

  @Tool({
    name: 'find-order',
    description: 'Find an order by its id, or the latest orders of a customer by email',
    inputSchema: z.object({
      orderId: z.string().optional().describe('The order id, such as ord_123'),
      email: z.email().optional().describe("The customer's email address"),
    }),
    annotations: { readOnlyHint: true },               // client may run it without asking the user
  })
  async find({ orderId, email }: { orderId?: string; email?: string }) {
    const found = orderId ? [await this.orders.findById(orderId)] : await this.orders.latestFor(email!);
    if (!found[0]) throw new NotFoundException('No such order');   // → tool result with isError: true
    return found;
  }

  @Tool({
    name: 'change-address',
    description: 'Change the delivery address of an order that has not shipped yet',
    inputSchema: z.object({ orderId: z.string(), address: z.string().min(10) }),
    outputSchema: z.object({ orderId: z.string(), address: z.string(), status: z.string() }),
    scopes: ['orders:write'],
  })
  async changeAddress({ orderId, address }: { orderId: string; address: string }, ctx: McpContext) {
    const o = await this.orders.changeAddress(orderId, address, ctx.authInfo?.clientId);
    return { orderId: o.id, address: o.address, status: o.status };   // → structuredContent + JSON text
  }
}
```

Return values: a tool's string becomes a text block. An object becomes `structuredContent` if there's an `outputSchema`, and JSON text otherwise. Return a `CallToolResult` yourself for images, audio or embedded resources; `undefined` gives an empty result. A resource's string is sent as text, a `Buffer`/`Uint8Array` as a blob, an object as JSON. A prompt's string becomes one user message; an array returns `PromptMessage[]`. Tool names are 1–128 characters from `A-Z a-z 0-9 _ - .` and default to the method name.

**Write names, descriptions and `.describe()` texts for the model.** They're all it knows: say what the tool does, when to use it, whether it changes something, and give an example value for each argument. Use resources for content loaded as-is; use tools for lookups that take arguments.

## Call context

`ctx: McpContext` has these properties:
- `kind`, `name`, `uri`
- `authInfo` (`clientId`, `scopes`, `expiresAt`, `extra`)
- `request` (the platform request; `undefined` over stdio)
- `requestInfo`
- `transport` (`'http' | 'stdio'`)
- `era` (`'modern'` 2026-07-28 / `'legacy'` 2025)
- `signal`: pass it to `fetch` and DB calls; call `throwIfAborted()` in loops
- `reportProgress(progress, total?, message?)`
- `server` (SDK context)

To ask the user (confirmations, missing values), return `inputRequired({ inputRequests: { confirm: inputRequired.elicit({ message, requestedSchema }) } })`. On the retry, read the answer with `acceptedContent(ctx.server.mcpReq.inputResponses, 'confirm', Schema)`. Over HTTP this only works for 2026-07-28 clients, because the endpoint is stateless. Over stdio it works for both eras.

Providers stay singletons. Read per-call data from `ctx`, not from request-scoped providers.

## Enhancers and errors

- Guards, interceptors, pipes and filters run as on routes, with `context.getType() === 'mcp'`. `McpExecutionContext.create(context)` provides `getInput()`, `getContext()`, `getKind()`, `getName()`, `getRequest()` and `getAuthInfo()`.
- **Global enhancers run on MCP calls *and* on the carrying HTTP request.** HTTP-only enhancers must check `context.getType() === 'http'` before calling `switchToHttp()`.
- A global `ValidationPipe({ transform: true })` validates DTO-typed input. Custom param decorators go after `(input, ctx, @CurrentUser() user)`.
- Errors thrown by tools become `isError: true` results the model can recover from. An `HttpException` keeps its message; any other error becomes `Internal server error` and is logged.
- Resources and prompts answer with JSON-RPC errors: `NotFoundException` → resource not found, `BadRequestException` → invalid params.
- Filters: check `host.getType<McpContextType>() === 'mcp'`. Whatever the filter returns becomes the result; to send a JSON-RPC error, throw a `ProtocolError`.

## Authorization (network-reachable servers)

```typescript
McpModule.forRootAsync({
  imports: [ConfigModule, AuthModule],
  inject: [ConfigService, IdentityProviderTokenVerifier],
  useFactory: (config: ConfigService, verifier: IdentityProviderTokenVerifier) => ({
    name: 'cat-store', version: config.get('VERSION'),
    auth: {
      verifier,                                               // implements McpTokenVerifier.verifyAccessToken(token) → AuthInfo | null
      resource: config.get('MCP_RESOURCE'),                   // canonical public URL = token audience
      authorizationServers: [config.get('IDENTITY_PROVIDER_URL')],
      scopesSupported: ['orders:read', 'orders:write'],
    },
  }),
}),
```

- The server is an OAuth 2.1 **resource server**: it verifies tokens and never issues them.
- It serves RFC 9728 metadata at `/.well-known/oauth-protected-resource/mcp`. Requests without a token get a 401 with a `WWW-Authenticate: Bearer` challenge, which starts the client's sign-in.
- Verifiers:
  - JWTs: use `JwtVerifier` from `@nestjs/authentication` (checks signature, issuer, audience and expiry).
  - Opaque tokens: call the RFC 7662 introspection endpoint.
  - The returned `AuthInfo` must carry `resource === auth.resource` and a future `expiresAt`, otherwise the token is refused with 401.
  - Throw a 401 error to refuse a token; any other error becomes a 500.
- Missing `scopes` on a primitive → 403 with step-up challenge. `auth.requiredScopes` applies to every request.
- With `@nestjs/authentication` ≥ 0.1.3 and `@nestjs/authorization` ≥ 0.1.1:
  - Their global guards authenticate each call, and `@CurrentUser()` and `@Can(Policy, 'action')` work in tools.
  - Set `decorators: [Public()]` on the endpoint so `auth` handles the challenge.
  - A tool without `@Can()` is denied.
- Internal-only servers can skip OAuth and use `decorators: [UseGuards(ApiKeyGuard)]` on the endpoint.

## Transports

- **Streamable HTTP** is served by default; `path: false` disables it. The endpoint is a normal controller, so global prefix, versioning (`endpointVersion`), middleware and CORS all apply. It is stateless: no sticky sessions are needed. Both protocol eras are served (`http.legacy: 'reject'` serves 2026-07-28 only). `http.responseMode` can be `'auto'`, `'json'` or `'sse'`.
- **stdio**, for assistants that launch a local process: create `stdio.ts` with `NestFactory.createApplicationContext(AppModule, { logger: new McpStdioLogger() })`, then `await app.get(McpStdioServer).listen(); await app.close();`. Anything else written to stdout breaks the protocol. Credentials come from `process.env`; scopes aren't checked, but guards run.

See `references/mcp-reference.md` for the full options table, production settings, the stdio client config, testing patterns and the migration map.

## Workflow

- [ ] 1. Install; check for Zod 4.2+; `McpModule.forRoot` with `name`, `version`, `instructions`.
- [ ] 2. Add tools, resources and prompts on providers, with model-oriented descriptions, `.describe()` on every argument, `readOnlyHint` on read-only tools, and `outputSchema` where the result is structured.
- [ ] 3. Make sure HTTP-only global enhancers check `getType()`; add MCP guards and filters as needed.
- [ ] 4. Network-reachable servers: add `auth` (verifier, resource, authorization servers, scopes), `allowedHosts`/`allowedOrigins`, CORS headers and the body limit. Local servers: add `stdio.ts` with `McpStdioLogger`.
- [ ] 5. Tests: unit-test methods directly; run e2e with `connectMcpClient(moduleRef, { token })` against a test verifier; test the HTTP route over a socket. Build, lint, run tests, start the app and list tools with the Inspector.

## Reference files

- `references/mcp-reference.md`: module options, decorator options, HTTP hardening (Origin, Host, CORS headers, body size), the stdio client config, NestJS Observe naming, the production checklist, testing (tokens and scopes, protocol eras, McpRegistry checks, HTTP and stdio tests), and migration from `@rekog/mcp-nest` 1.x/2.x. Read when configuring production, writing tests or migrating.

Sources: [Overview](https://docs.nestjs.com/mcp/overview) · [Primitives](https://docs.nestjs.com/mcp/primitives) · [Transports](https://docs.nestjs.com/mcp/transports) · [Testing](https://docs.nestjs.com/mcp/testing) · [Migration](https://docs.nestjs.com/mcp/migration)
