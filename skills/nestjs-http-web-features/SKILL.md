---
name: nestjs-http-web-features
description: Implements browser-facing HTTP features in NestJS 12 — built-in cookies (@Cookies, @SignedCookies, httpAdapter.setCookie/clearCookie, cookie signing with secret rotation), sessions (express-session, @fastify/secure-session), file uploads with Multer or @fastify/multipart (FileInterceptor, ParseFilePipe, size limits, disk vs memory storage, streaming uploads), file downloads with StreamableFile, Server-Sent Events (@Sse, @SseSignal, client disconnect cleanup), MVC template rendering (@Render, hbs, @fastify/view) and serving static files or an SPA (@nestjs/serve-static). Use when reading or setting cookies, storing session data, accepting or validating uploads, returning files, pushing live updates over SSE, rendering server-side views, or hosting a frontend build. Not for adapter choice, body limits or raw body (nestjs-http-platform), cloud object storage (nestjs-file-storage) or WebSockets (nestjs-websockets).
compatibility: NestJS 12.x; Express, Fastify (uploads 12.1+) or Node adapter
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS HTTP web features

Detect the adapter first: several features import from the platform package (`@nestjs/platform-express`, `@nestjs/platform-fastify`, `@nestjs/platform-node`).

## Cookies (built in, no cookie-parser needed)

```typescript
// main.ts — only needed for signed cookies; validate COOKIE_SECRET at startup
const app = await NestFactory.create(AppModule, { cookies: { secret: [process.env.COOKIE_SECRET!, process.env.COOKIE_SECRET_OLD!] } });

@Controller('session')
export class SessionController {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  @Post('login')
  login(@Res({ passthrough: true }) res: unknown) {
    this.adapterHost.httpAdapter.setCookie(res, 'uid', '42', { signed: true, httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 });
  }

  @Get('me')
  me(@SignedCookies('uid') uid?: string) {          // undefined if missing, unsigned or tampered
    if (!uid) throw new UnauthorizedException();
    return { uid };
  }

  @Delete('logout')
  logout(@Res({ passthrough: true }) res: unknown) { this.adapterHost.httpAdapter.clearCookie(res, 'uid'); }
}
```

- `@Cookies('name', ParseIntPipe)` reads unsigned values; missing → 400 unless the pipe is `optional`. A global `ValidationPipe` skips cookie params unless `validateCustomDecorators: true`.
- **`maxAge` is in seconds** (RFC 6265), unlike Express `res.cookie()` (milliseconds).
- Never trust `@Cookies()` for identity; use `@SignedCookies()`. Signing gives integrity, not confidentiality, and the cookie name isn't signed.
- An `undefined` secret counts as no secret: signed operations throw at request time (500). An empty secret throws at app creation.
- `__Host-` / `__Secure-` prefixes aren't enforced: set `secure: true` (+ `path: '/'`, no `domain` for `__Host-`) yourself.
- Existing `cookie-parser` / `@fastify/cookie` setups keep working alongside the decorators.

## Sessions

- Express/Node: `npm i express-session` → `app.use(session({ secret, resave: false, saveUninitialized: false }))`; read with `@Session() session`.
- The default memory store leaks and doesn't scale past one process: use a production store.
- `cookie.secure: true` needs HTTPS; behind a proxy, configure trust proxy.
- Fastify: `npm i @fastify/secure-session` → `await app.register(secureSession, { secret, salt })`; use `session.get()` / `session.set()`.

## File uploads

```typescript
@Post('avatar')
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))   // stop oversized uploads early
upload(
  @UploadedFile(new ParseFilePipeBuilder()
    .addFileTypeValidator({ fileType: /^image\/(jpeg|png)$/ })
    .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
    .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }))
  file: Express.Multer.File,
) { return { size: file.size }; }
```

- Import interceptors from the adapter's package: `@nestjs/platform-express` (+ `npm i -D @types/multer`), `@nestjs/platform-node`, or `@nestjs/platform-fastify/multipart` (12.1+, `npm i @fastify/multipart`, auto-registered; files typed `UploadedMultipartFile`). Fastify interceptors fail to start on Express.
- Multer keeps files in memory and has **no default size limit**: always set `limits.fileSize`. Validators run after the whole file is received; `limits` stops early. Fastify defaults to 1 MiB per file (413 above it).
- Large files: `diskStorage()` from `multer`, or `FileStreamInterceptor()` on Fastify to stream.
- Variants: `FilesInterceptor('files', 5)` + `@UploadedFiles()`, `FileFieldsInterceptor([...])`, `AnyFilesInterceptor()`, `NoFilesInterceptor()`.
- Defaults: `MulterModule.register({ dest })` / `registerAsync()`; Fastify: `MultipartModule.register()`.
- Files are required by default: `build({ fileIsRequired: false })`.
- Multer only handles `multipart/form-data`.

Read `references/uploads-streaming.md` for custom `FileValidator`s, Fastify setup and streaming uploads.

## Downloads

Return `new StreamableFile(createReadStream(path), { type: 'application/pdf', disposition: 'attachment; filename="report.pdf"' })`. It keeps interceptors working (unlike piping into `@Res()`). Handle stream errors with `.setErrorHandler()` (Express/Node; on Fastify errors go to exception filters).

## Server-Sent Events

```typescript
@Sse('events')
async events(@SseSignal() signal: AbortSignal): Promise<Observable<MessageEvent>> {
  return interval(1000).pipe(map((n) => ({ data: { n } })), finalize(() => this.logger.log('client gone')));
}
```

- Must return an `Observable` (or a Promise of one). Nest unsubscribes on client disconnect; release resources in `finalize`.
- For async setup, check `signal.aborted` before returning; make abort cleanup idempotent.
- Status/headers: `@Header()`, or set them on `@Res({ passthrough: true })` before the stream starts (12.1.3+).

## MVC and static files

- Views: `app.useStaticAssets(join(import.meta.dirname, '..', 'public'))`, `app.setBaseViewsDir(...)`, `app.setViewEngine('hbs')`, then `@Render('index')` returning locals. Node adapter supports `@Render()` but not `res.render()`. Fastify: `@fastify/view` + `@fastify/static`, `@Render('index.hbs')`.
- SPA: `npm i @nestjs/serve-static` → `ServeStaticModule.forRoot({ rootPath: join(import.meta.dirname, '..', 'client') })`. By default every unmatched path returns `index.html`; tune with `serveRoot`, `renderPath`, `exclude`. On Fastify set `serveStaticOptions.fallthrough: true`.

## Workflow

- [ ] 1. Detect the adapter and import platform-specific pieces from its package.
- [ ] 2. Configure secrets (cookie, session) through validated config (nestjs-configuration).
- [ ] 3. Set upload size limits in the interceptor and validators on the parameter.
- [ ] 4. Add e2e tests: cookies via `Set-Cookie` headers, uploads via supertest `.attach()`, SSE via a streamed request.
- [ ] 5. Build, lint, run unit and e2e tests, start the app.

## Reference files

- `references/uploads-streaming.md`: custom `FileValidator`, async Multer config, disk storage naming, Fastify multipart setup and `FileStreamInterceptor`, `StreamableFile` headers and error handling, cookie invalid-input rules. Read when building upload or download endpoints beyond the basic example.

Sources: [Cookies](https://docs.nestjs.com/http/cookies) · [Session](https://docs.nestjs.com/http/session) · [File upload](https://docs.nestjs.com/http/file-upload) · [Server-Sent Events](https://docs.nestjs.com/http/server-sent-events) · [MVC](https://docs.nestjs.com/http/mvc) · [Serve static](https://docs.nestjs.com/recipes/serve-static)
