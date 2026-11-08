# @nestjs/mcp reference

## Contents
- Module options
- Decorator options
- HTTP endpoint hardening
- stdio client configuration
- Observability
- Production checklist
- Testing
- Migrating from @rekog/mcp-nest

## Module options

| Option | Default | Notes |
| --- | --- | --- |
| `name`, `version` | | Required; the server's identity |
| `title`, `description`, `websiteUrl`, `icons` | | Shown by clients |
| `instructions` | | How the model should use the server |
| `include` | every module | Modules scanned for primitives |
| `path` | `'mcp'` | `false` = no HTTP endpoint. Must be at the top level of `forRootAsync()` |
| `endpointVersion` | | With versioning on; `VERSION_NEUTRAL` keeps `/mcp`. Top level of `forRootAsync()` |
| `decorators` | `[]` | Class decorators on the endpoint controller (`Public()`, `UseGuards(...)`). Top level of `forRootAsync()` |
| `imports` | `[]` | Modules a verifier class injects from. Top level of `forRootAsync()` |
| `http.legacy` | `'stateless'` | `'reject'` serves 2026-07-28 only |
| `http.responseMode` | `'auto'` | `'json'` (drops progress notifications) / `'sse'` |
| `http.allowedOrigins` | localhost, 127.0.0.1, [::1] | Hostnames allowed in `Origin`; requests without `Origin` pass; `false` turns the check off |
| `http.allowedHosts` | not checked | Required `Host` names (DNS-rebinding defence) |
| `http.maxRequestBodySize` | 4 MiB | For bodies the platform didn't parse |
| `auth.verifier` | | A class or instance with `verifyAccessToken(token)` |
| `auth.resource` | | Canonical URL and token audience |
| `auth.authorizationServers` | | Accepted issuers |
| `auth.scopesSupported`, `auth.requiredScopes` | | Advertised scopes / scopes every request needs |
| `auth.resourceName`, `auth.resourceDocumentation` | | Extra protected-resource metadata |
| `stdio.legacy` | `'serve'` | `'reject'` refuses connections that use the 2025 handshake |

`forRootAsync()` accepts `useFactory`, `useClass` or `useExisting`. A verifier returned from the factory must be an instance.

## Decorator options

| Decorator | Options |
| --- | --- |
| `@Tool()` | `name`, `title`, `description`, `inputSchema`, `outputSchema`, `annotations`, `icons`, `_meta`, `scopes` |
| `@Resource()` | `uri`, `name`, `title`, `description`, `mimeType`, `size`, `annotations`, `icons`, `_meta`, `cacheHint`, `scopes` |
| `@ResourceTemplate()` | `uriTemplate` (RFC 6570) plus the `@Resource()` options |
| `@Prompt()` | `name`, `title`, `description`, `argsSchema`, `icons`, `_meta`, `scopes` |

## HTTP endpoint hardening

```typescript
McpModule.forRoot({
  name: 'cat-store', version: '1.0.0',
  http: { allowedOrigins: ['support.catstore.example'], allowedHosts: ['api.catstore.example'] },
});

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.useBodyParser('json', { limit: '4mb' });             // Express defaults to 100 KB
app.enableCors({
  origin: ['https://support.catstore.example'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Mcp-Protocol-Version', 'Mcp-Method', 'Mcp-Name'],
  exposedHeaders: ['WWW-Authenticate'],
});
```

- If a browser-based client is served from another origin, list it in **both** `allowedOrigins` (by hostname) and CORS.
- Global prefix: `app.setGlobalPrefix('api')` puts the endpoint at `/api/mcp`. Use `exclude: ['mcp']` to keep it at `/mcp`.
- API-key guards in `decorators` reject requests with 403 before any MCP message is read.

## stdio client configuration

```json
{ "mcpServers": { "cat-store": { "command": "node", "args": ["/path/to/cat-store/dist/stdio.js"], "env": { "CAT_STORE_API_KEY": "..." } } } }
```

One build can serve both transports: `main.ts` (HTTP) and `stdio.ts`. Set `path: false` if the app serves stdio only. `listen()` resolves when the client closes stdin.

## Observability

With `@nestjs/observe`, MCP calls are named by operation (`tools/call find-order`, `resources/read orders://{orderId}`) instead of `POST /mcp`. No configuration is needed.

## Production checklist

- `auth` is configured on network-reachable servers, with `resource` set to the public URL.
- `allowedHosts` is set on servers bound to localhost.
- Browser clients are listed in `allowedOrigins` and in CORS.
- The body parser limit exceeds your largest tool arguments.
- Descriptions are written for the model; `readOnlyHint` is set on non-mutating tools.
- The stdio entry point uses `McpStdioLogger`.

## Testing

```typescript
// test/test-token.verifier.ts: tokens need the server's resource and a future expiresAt
@Injectable()
export class TestTokenVerifier implements McpTokenVerifier {
  async verifyAccessToken(token: string): Promise<AuthInfo | null> {
    const t = TOKENS[token];
    return t ? { token, clientId: t.clientId, scopes: t.scopes, resource: new URL(RESOURCE), expiresAt: Math.floor(Date.now() / 1000) + 3600, extra: { team: t.team } } : null;
  }
}

moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(IdentityProviderTokenVerifier).useClass(TestTokenVerifier).compile();
client = await connectMcpClient(moduleRef, { token: 'support-token' });      // from '@nestjs/mcp/testing'; no HTTP server
const { tools } = await client.listTools();
const result = await client.callTool({ name: 'change-address', arguments: { orderId: 'ord_123', address: '12 Whisker Lane, Leeds' } });
expect(result.structuredContent).toEqual({ orderId: 'ord_123', address: '12 Whisker Lane, Leeds', status: 'pending' });
// afterAll: await client.close(); await moduleRef.close();
```

- **Tool failures** come back as results: `isError: true`, with text such as `Input validation error` or `Forbidden resource`.
- **Resource and prompt failures** throw: `await expect(client.readResource({ uri: 'orders://ord_404' })).rejects.toThrow()`.
- **Scopes:** a missing scope throws `InsufficientScopeError` (`requiredScope`), and connecting without a token rejects with `SdkHttpError`. Both come from `@modelcontextprotocol/client`.
- **Options:**
  - `headers` sends extra headers; guards read them lowercased from `ctx.request.headers`.
  - `era: 'legacy'` tests a 2025-revision client (`client.getProtocolEra()`).
- **In-memory limits:** the in-memory client skips middleware and the endpoint's `decorators` guards, and `ctx.request` is a plain `{ method, url, headers }`. Test the route itself (401 + `resource_metadata=` challenge, 403 for a foreign `Origin`) over a socket. Use `app.listen(0)` and `fetch` to POST a `tools/list` JSON-RPC request with `accept: 'application/json, text/event-stream'`.
- **Registry rules:** `moduleRef.get(McpRegistry).tools` lets you enforce rules such as minimum description length. Call `moduleRef.init()` first if you haven't connected a client.
- **stdio:** build the app, then launch `dist/stdio.js` with the SDK's stdio client transport.

## Migrating from @rekog/mcp-nest

```bash
npm uninstall @rekog/mcp-nest @modelcontextprotocol/sdk     # 2.x: also @modelcontextprotocol/core, @modelcontextprotocol/node, @rekog/mcp-nest-auth
npm i @nestjs/mcp @modelcontextprotocol/server zod
```

| @rekog/mcp-nest | @nestjs/mcp |
| --- | --- |
| `transport` | HTTP unless `path: false`; stdio via `McpStdioServer` |
| `mcpEndpoint`, `apiPrefix` | `path` (under the global prefix) |
| `guards` | `decorators: [UseGuards(...)]` |
| `streamableHttp` | nothing to set (stateless); `http.responseMode` |
| `forFeature()` | one server per application |
| 2.x `McpStrategy` + `connectMicroservice` + `setHttpAdapter` | remove; `app.listen()` serves the route |
| `@McpController()` classes in `controllers` | `@Injectable()` providers in `providers`; remove `MCP_STRATEGY` |
| `parameters` | `inputSchema` (tools) / `argsSchema` (prompts) |
| `(args, context, request)` / `@Payload()` `@Ctx()` | `(input, ctx)`: `ctx.request`, `ctx.authInfo` |
| `context.reportProgress({ progress, total })` | `ctx.reportProgress(progress, total)` |
| `context.mcpServer.server.elicitInput()` | return `inputRequired()` |
| resource `({ uri })` | `ctx.uri`; templates receive their variables as input |
| `{ contents: [...] }` boilerplate | return the value; the module builds the result |
| `Scope.REQUEST` providers | singletons; read per-call data from `ctx` |
| `McpRegistryService.registerTool()` | not supported; use decorators |

Types such as `CallToolResult` now come from `@modelcontextprotocol/server`.
