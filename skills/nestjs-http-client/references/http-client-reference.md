# @nestjs/http-client reference

## Contents
- Interceptors
- Streaming responses
- Dispatchers: pools, proxies, mTLS
- Redirects
- Async configuration variants
- RxJS
- Migrating from @nestjs/axios

## Interceptors

Function form:

```typescript
export function apiKeyInterceptor(apiKey: string): HttpClientInterceptorFn {
  return (request, next) => { request.headers.set('x-api-key', apiKey); return next(request); };
}
```

Class form (DI):

```typescript
@Injectable()
export class GithubAuthInterceptor implements HttpClientInterceptor {
  constructor(private readonly tokens: GithubTokenService) {}
  async intercept(request: HttpRequest, next: HttpHandler): Promise<Response> {
    request.headers.set('authorization', `Bearer ${await this.tokens.getToken()}`);
    return next(request);
  }
}
```

- `HttpRequest`: `method`, `url` (URL), `headers` (Headers), `body`, `signal`, `attempt`, `context` (from the request's `context` option).
- Listed first = outermost; `forRoot()` interceptors run before the client's. They run **once per attempt** (fresh tokens on retry). They see the raw `Response` before the client throws for non-2xx.
- Class interceptors resolve at app init; an existing provider instance is reused.
- Logging interceptor: log `method origin+pathname status ms attempt` — not the query string (PII/keys). Tracing needs no interceptor with `@nestjs/observe`.

## Streaming responses

```typescript
@Get(':id/pdf')
async download(@Param('id') id: string) {
  const { data, headers } = await this.billing.get('/invoices/:id/pdf', { params: { id }, responseType: 'stream' });
  return new StreamableFile(data, { type: headers.get('content-type') ?? 'application/pdf' });
}
```

Timeout stops once headers arrive; the `signal` still cancels. Don't forward upstream `content-length` (fetch decompresses).

## Dispatchers: pools, proxies, mTLS

```typescript
import { Agent, ProxyAgent } from 'undici';   // install undici yourself, matching your Node's bundled major

HttpClientModule.register({
  name: 'partner',
  baseUrl: 'https://partner.example.com',
  dispatcher: new Agent({ connections: 20, connect: { ca, cert, key } }),
});
// proxy: dispatcher: new ProxyAgent('http://proxy.internal:3128')
```

Node `http.Agent` instances don't work with fetch.

## Redirects

Default with `baseUrl`: follow same-origin only, cross-origin → `HttpNetworkError`. `'follow'` anywhere, `'error'` on any redirect, `'manual'` returns 3xx (combine with `throwOnHttpError: false`).

## Async configuration variants

- `registerAsync({ name, imports, inject, useFactory, interceptors, isGlobal })` — factory returns `HttpClientFactoryOptions` (no name/isGlobal/imports/interceptor classes).
- `useClass: GithubClientConfig` implementing `HttpClientOptionsFactory.createHttpClientOptions()`; `useExisting` with the exporting module in `imports`.
- `forRootAsync()` with `HttpClientModuleOptionsFactory`.
- Outside Nest (scripts): `new HttpClient(options)`.

## RxJS

`defer(() => this.http.get('/cats'))` starts on subscribe; neither `defer` nor `from` cancels on unsubscribe. For cancellation:

```typescript
function fromRequest<T>(send: (signal: AbortSignal) => Promise<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    const controller = new AbortController();
    send(controller.signal).then((v) => { subscriber.next(v); subscriber.complete(); }, (e) => subscriber.error(e));
    return () => controller.abort();
  });
}
```

## Migrating from @nestjs/axios

| `@nestjs/axios` | `@nestjs/http-client` |
| --- | --- |
| `HttpModule.register({ baseURL })` | `HttpClientModule.register({ baseUrl })` |
| `HttpModule.registerAsync()` | `HttpClientModule.registerAsync()` (also takes `name`) |
| `HttpModuleOptionsFactory.createHttpOptions()` | `HttpClientOptionsFactory.createHttpClientOptions()` |
| `extraProviders` | a module exporting the providers, in `imports` |
| one `HttpService` per module | named clients, `@InjectHttpClient(name)` |
| Observables + `firstValueFrom(...)` | `await this.http.get(url)` |
| `post(url, data)` | `post(url, { json: data })` |
| `params` (query) | `query` (arrays repeat keys); `params` = path segments |
| `response.headers['etag']` | `response.headers.get('etag')` |
| `AxiosError` / `error.response?.status` | `HttpResponseError` / `error.status`, `error.body` |
| `error.code === 'ECONNABORTED'` | `HttpTimeoutError` |
| `validateStatus: () => true` | `throwOnHttpError: false` |
| `axiosRef` | none; options or a custom `fetch` |
| `axiosRef.interceptors.*.use()` | `interceptors` (one function for request + response) |
| `httpsAgent` / `proxy` | `dispatcher` (undici `Agent` / `ProxyAgent`) |
| `maxRedirects: 0` | `redirect: 'manual'` |
| no retries | retries on by default; `retry: false` to match old behaviour |
| `timeout` whole request | `timeout` per attempt (`'5s'`) |
| `onUploadProgress` / `onDownloadProgress` | none; count stream bytes |

Both packages can coexist during migration. Update tests: mock `fetch` instead of `HttpService`.
