# Uploads, streaming and cookie details

## Contents
- Validators
- Multer configuration (Express / Node adapter)
- Fastify multipart (12.1+)
- Streaming uploads (Fastify only)
- Downloads with StreamableFile
- Cookie options and rejected input

## Validators

`ParseFilePipe({ validators: [...], errorHttpStatusCode, fileIsRequired })` or `ParseFilePipeBuilder().addFileTypeValidator().addMaxSizeValidator().build({...})`.

Built-in:
- `MaxFileSizeValidator({ maxSize })`: bytes, size must be less than the value.
- `FileTypeValidator({ fileType })`: string or RegExp; checks the **magic number** of the content by default (`skipMagicNumbersValidation: true` to trust the client MIME type).

Custom validator:

```typescript
export class ImageDimensionsValidator extends FileValidator<{ maxWidth: number }> {
  async isValid(file?: Express.Multer.File) { /* inspect file.buffer */ return true; }
  buildErrorMessage() { return `Image wider than ${this.validationOptions.maxWidth}px`; }
}
```

For arrays, pass the pipe to `@UploadedFiles()`; validators run on each file.

## Multer configuration (Express / Node adapter)

```typescript
MulterModule.registerAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({ dest: config.get<string>('UPLOAD_DIR'), limits: { fileSize: 10 * 1024 * 1024 } }),
  inject: [ConfigService],
});
// or useClass: MulterConfigService implements MulterOptionsFactory { createMulterOptions(): MulterModuleOptions }
```

Disk storage with safe names:

```typescript
import { diskStorage } from 'multer';
FileInterceptor('file', {
  storage: diskStorage({
    destination: './uploads',
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});
```

A `destination` function (instead of a string) means you must create the directory. `FileInterceptor()` may not work on some cloud platforms such as Firebase.

## Fastify multipart (12.1+)

- `npm i @fastify/multipart`. The adapter registers the plugin automatically when an upload interceptor is used.
- Import from `@nestjs/platform-fastify/multipart` (also re-exported from the package root). Types: `UploadedMultipartFile`, `MultipartOptions`, `MultipartModule`, `MultipartOptionsFactory.createMultipartOptions()`; `memoryStorage()` / `diskStorage()` from the same path.
- Stricter defaults than Multer: `fileSize` = Fastify `bodyLimit` (1 MiB), max 1000 parts; oversize → `413`.
- Raise limits per route (`limits`), per module (`MultipartModule.register()`), or app-wide: `new FastifyAdapter({ multipart: { limits: { fileSize: 10 * 1024 * 1024 } } })`. Route limits merge over module over app (except `fieldNameSize`).
- `multipart: true` (or options) is required when an interceptor is created outside DI (`app.useGlobalInterceptors(new (FileInterceptor('f'))())`) or only used in lazy-loaded modules.
- Register the plugin yourself with `app.register(multipart, opts)`, not on the raw Fastify instance after `init()` (`FST_ERR_DEC_ALREADY_PRESENT`).
- Differs from Multer: rejects prototype-polluting field names; JSON text parts arrive parsed; `attachFieldsToBody` unsupported.

## Streaming uploads (Fastify only)

```typescript
import { FileStreamInterceptor, MultipartFileStream } from '@nestjs/platform-fastify/multipart';

@Post('upload')
@UseInterceptors(FileStreamInterceptor('file', { limits: { fileSize: 1024 * 1024 * 1024 } }))
async upload(@UploadedFile() file: MultipartFileStream, @Body() body) {
  const path = join('uploads', randomUUID());
  await pipeline(file.stream, createWriteStream(path));
  return { path };
}
```

Rules: text fields must come **before** the file; one file only; `MaxFileSizeValidator` and magic-number checks don't apply (the `fileSize` limit still does, raising `PayloadTooLargeException`); unread data is discarded before responding.

## Downloads with StreamableFile

```typescript
@Get('report')
report(): StreamableFile {
  return new StreamableFile(createReadStream(join(process.cwd(), 'report.pdf')), {
    type: 'application/pdf',
    disposition: 'attachment; filename="report.pdf"',
  }).setErrorHandler((err, res) => {
    if (res.headersSent) { res.end(); return; }
    res.statusCode = 400;
    res.end(err.message);
  });
}
```

Headers can also come from `@Header()` or `@Res({ passthrough: true })`. The error handler applies on Express and Node; on Fastify, stream errors go to exception filters (500 by default). Not for GraphQL or microservices.

## Cookie options and rejected input

Options: `maxAge` (seconds), `expires`, `domain`, `path` (default `/`), `secure`, `httpOnly`, `sameSite` (`'strict' | 'lax' | 'none'`), `priority`, `partitioned`, `signed`. Only `path` has a default; set `httpOnly`, `secure`, `sameSite` explicitly for credentials.

`setCookie()` / `clearCookie()` throw `TypeError` instead of escaping when the name or attributes are invalid (e.g. contain `;`, CR, LF), when `sameSite`/`priority` has an unknown value, or when `sameSite: 'none'` or `partitioned: true` is used without `secure: true`.

`clearCookie()` must receive the same `path`/`domain` as when the cookie was set.

Secret rotation: `cookies: { secret: ['current', 'previous'] }` signs with the first and verifies with all.
