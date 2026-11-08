---
name: nestjs-http-client
description: Calls external HTTP APIs from NestJS 12 with the first-party fetch-based @nestjs/http-client — HttpClientModule.register/registerAsync named clients with baseUrl, headers and timeouts, forRoot app-wide defaults, typed get/post/put/patch/delete with params, query, json and responseType, per-attempt timeouts and AbortSignal deadlines, retries on by default for idempotent methods with backoff and Retry-After, idempotency keys for POST, HttpResponseError/HttpTimeoutError/HttpNetworkError handling and toHttpException 502/504 mapping, function and class interceptors, streaming responses, undici dispatchers, testing with a stub fetch, and migrating from @nestjs/axios. Use when a service must call another service or third-party API, when adding auth headers, retries or timeouts to outbound calls, or when replacing HttpModule/HttpService (Axios). Not for receiving webhooks (nestjs-webhooks), circuit breakers and bulkheads around calls (nestjs-resilience) or microservice transports (nestjs-microservices).
compatibility: NestJS 12.x; @nestjs/http-client (no runtime deps); optional undici for custom dispatchers
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS HTTP client (@nestjs/http-client)

Prefer `@nestjs/http-client` for new outbound calls; it replaces `@nestjs/axios`'s `HttpService`. If the project uses `@nestjs/axios`, keep it unless asked to migrate (map in `references/http-client-reference.md`). Every method returns a Promise — no `firstValueFrom`.

```bash
npm i @nestjs/http-client
```

## Register clients

```typescript
// app.module.ts — shared defaults (always global; no baseUrl here)
HttpClientModule.forRoot({ headers: { 'user-agent': 'orders-service/1.0' }, timeout: '10s' }),

// github/github.module.ts — one named client per upstream
HttpClientModule.registerAsync({
  name: 'github',
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    baseUrl: config.getOrThrow<string>('GITHUB_API_URL'),
    headers: { authorization: `Bearer ${config.getOrThrow<string>('GITHUB_TOKEN')}` },
    timeout: '5s',
  }),
  interceptors: [GithubAuthInterceptor],      // classes go beside useFactory
}),
```

- `register()` scopes the client to the importing module (`isGlobal: true` to share). Unnamed = default client injected as `HttpClient`; named clients with `@InjectHttpClient('github')`; token `getHttpClientToken(name)`.
- Client settings override `forRoot()` defaults, except headers (merged; `null` removes), retry (merged per field) and interceptors (forRoot's run first).

## Make requests

```typescript
@Injectable()
export class ReposService {
  constructor(@InjectHttpClient('github') private readonly github: HttpClient) {}

  async findAll(org: string) {
    const { data } = await this.github.get<Repo[]>('/orgs/:org/repos', {
      params: { org },                                   // fills :org, URI-encoded; '..' or missing throws
      query: { type: 'public', topic: ['nest', 'ts'] },  // arrays repeat the key
    });
    return data;                                         // type arg is NOT validated at runtime
  }

  async createIssue(owner: string, repo: string, issue: CreateIssueDto) {
    const { data } = await this.github.post<Issue>('/repos/:owner/:repo/issues', { params: { owner, repo }, json: issue });
    return data;
  }
}
```

- Relative URLs append to `baseUrl` with one `/` (the `/v1` prefix is kept). Never interpolate user input into paths — use `params`/`query`.
- `json` (sets content-type) or `body` (string, Buffer, FormData, stream…), not both. `responseType`: `'auto'` (default), `'json'`, `'text'`, `'arrayBuffer'`, `'stream'`, `'response'`.
- Response: `{ status, statusText, ok, headers (web Headers: .get()), data, url, request }`.
- Validate responses from APIs you don't control (e.g. a Standard Schema `parse`).

## Timeouts, retries, idempotency

- `timeout` applies **per attempt**; a call can take `attempts × timeout` + waits. Cap the whole call with `signal: AbortSignal.timeout(10_000)`.
- Retries are **on by default**: 3 attempts for GET/HEAD/OPTIONS/PUT/DELETE on network errors, timeouts and 408/429/500/502/503/504, exponential backoff with full jitter (honours `Retry-After`). Configure with `retry: { attempts, backoff: { delay, factor, maxDelay, jitter }, retryIf, methods, statusCodes }` or `retry: false`; `methods`/`statusCodes` **replace** the defaults.
- POST/PATCH aren't retried. With an upstream that supports idempotency keys: `headers: { 'idempotency-key': \`charge-${order.id}\` }, retry: { methods: ['POST'] }` on that request only.
- Retry at one layer of a service chain only (retries multiply).

## Errors

```typescript
try {
  return (await this.github.get<Repo>('/repos/:owner/:repo', { params: { owner, repo } })).data;
} catch (error) {
  if (error instanceof HttpResponseError && error.status === 404) throw new NotFoundException();
  throw toHttpException(error);       // upstream non-2xx/network/parse → 502, timeouts → 504 (logged)
}
```

- Errors extend `HttpClientError`: `HttpResponseError` (`status`, `body`), `HttpTimeoutError`, `HttpNetworkError` (`cause.code`), `HttpParseError`. `throwOnHttpError: false` returns non-2xx as values.
- Or map centrally: `@Catch(HttpClientError, DOMException) class F extends BaseExceptionFilter { catch(e, h) { super.catch(toHttpException(e), h); } }`.
- `toHttpException(error, { forward: [422] })` passes selected upstream statuses/bodies through; `log: false` if you log elsewhere. In RPC/WS handlers convert to `RpcException`/`WsException` yourself.

## Security defaults

A client with `baseUrl` only talks to its origin (other hosts and cross-origin redirects throw), credentials in URLs are refused, and error messages mask query values. Keep `redirect` default unless the API intentionally redirects off-origin (`'follow'`).

## Testing

```typescript
const fetch = vi.fn<typeof globalThis.fetch>();
const moduleRef = await Test.createTestingModule({ imports: [HttpClientModule.forRoot({ fetch }), ReposModule] }).compile();
await moduleRef.init();
fetch.mockResolvedValueOnce(Response.json([{ name: 'nest' }]));    // one Response per call (bodies read once)
```

E2E: `.overrideProvider(HTTP_CLIENT_MODULE_OPTIONS).useValue({ fetch })`, or replace a client via `getHttpClientToken('github')`. Test retries with `retry: false` or several queued responses.

## Workflow

- [ ] 1. Install; `forRoot()` defaults; one named client per upstream with `registerAsync` + `ConfigService`.
- [ ] 2. Service methods with `params`/`query`/`json`; validate responses.
- [ ] 3. Set timeouts, a deadline for user-facing calls, retry policy and idempotency keys for unsafe methods.
- [ ] 4. Map errors with `toHttpException` or a filter; add a logging interceptor if no tracing.
- [ ] 5. Stub-fetch tests. Build, lint, run tests, start the app.

## Reference files

- `references/http-client-reference.md`: interceptors (function and class, per-attempt), streaming to `StreamableFile`, undici `Agent`/`ProxyAgent` dispatchers, redirect modes, RxJS wrapping with cancellation, and the `@nestjs/axios` migration table. Read when going beyond the basics or migrating.

Sources: [HTTP client](https://docs.nestjs.com/application/http-client)
