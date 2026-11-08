---
name: nestjs-file-storage
description: Stores files in NestJS 12 with the first-party @nestjs/storage package — named disks (LocalDisk for development, S3Disk for AWS S3, Cloudflare R2, MinIO, Backblaze B2, GCS; InMemoryDisk for tests) behind one API (put/get/stat/list/delete/copy/move), StorageModule.forRootAsync from config, @InjectDisk and the Storage registry, streaming Multer uploads straight to a disk with uploadToDisk() and content sniffing, public URLs, short-lived signed download URLs, presigned direct uploads with signedUpload(), serveFile/serveSignedUrl/receiveSignedUpload helpers, key safety, and storage errors. Use when the user needs to save uploads, product images, invoices or user files, generate download links, upload directly from clients to S3/R2, or switch between local and cloud storage. Not for parsing multipart requests themselves (nestjs-http-web-features) or static frontend hosting (serve-static in nestjs-http-web-features).
compatibility: NestJS 12.x; @nestjs/storage (no AWS SDK needed); @nestjs/config
metadata:
  version: "0.1.0"
  nestjs-major: "12"
  docs-crawled: "2026-11-05"
---

# NestJS file storage (@nestjs/storage)

Use `@nestjs/storage` instead of hand-written `fs` writes or the AWS SDK: same code for local and S3, atomic writes, signed URLs, content sniffing.

```bash
npm i @nestjs/storage @nestjs/config
```

## Disks from configuration

```typescript
export function createStorageOptions(config: ConfigService): StorageModuleOptions {
  if (config.get('storage.driver') === 's3') {
    const s3 = { endpoint: config.get<string>('storage.s3.endpoint'), region: config.getOrThrow<string>('storage.s3.region') };
    return {
      default: 'private',
      disks: {
        photos: new S3Disk({ ...s3, bucket: config.getOrThrow('storage.s3.photosBucket'), publicUrl: config.getOrThrow('storage.s3.photosUrl') }),
        private: new S3Disk({ ...s3, bucket: config.getOrThrow('storage.s3.privateBucket') }),
      },
    };
  }
  const appUrl = config.getOrThrow<string>('appUrl');
  return {
    default: 'private',
    disks: {
      photos: new LocalDisk({ root: 'storage/photos', publicUrl: `${appUrl}/photos` }),
      private: new LocalDisk({ root: 'storage/private', signedUrls: { baseUrl: `${appUrl}/files`, keys: [config.getOrThrow('storage.signingKey')] } }),   // key ≥32 chars
    },
  };
}

StorageModule.forRootAsync({ inject: [ConfigService], useFactory: createStorageOptions }),
```

- Separate disks (buckets) for public and private files — there is no per-file public flag.
- Inject: `StorageDisk` (default disk), `@InjectDisk('photos') photos: StorageDisk`, or `Storage` (`storage.disk(name)`). Misnamed disks fail at startup.
- `S3Disk` reads `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN` (or `credentials`). R2: `endpoint: 'https://<account>.r2.cloudflarestorage.com', region: 'auto'`; MinIO: `forcePathStyle: true`; GCS: `batchDelete: false`.
- Never `LocalDisk` in production (container disks vanish, instances don't share).

## Stream uploads onto a disk

```typescript
@Post('products/:id/photo')
@UseInterceptors(FileInterceptor('photo', {
  storage: uploadToDisk({ disk: 'photos', contentTypes: ['image/jpeg', 'image/png', 'image/webp'], cacheControl: 'public, max-age=31536000, immutable' }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}))
async upload(@Param('id') id: string, @UploadedFile() file: StoredUpload | undefined) {
  if (!file) throw new BadRequestException('Attach the image as the "photo" field');
  return this.photosService.replace(id, file.key);      // delete file.key if the product doesn't exist
}
```

- `uploadToDisk()` sniffs the real type from the bytes (415 if not allowed), enforces the size without leaving partial files (413), and picks a random UUID key with the detected extension. Use `file.contentType`, not the client's `mimetype`.
- `ParseFilePipe`/`FileTypeValidator` run after the file is stored — validate in the engine instead.
- Formats without a signature (CSV): `detectContentType: (bytes) => …` returning a type in `contentTypes`; still validate the whole file afterwards.
- Custom keys: `key: (file) => \`price-lists/${randomUUID()}${file.extension}\``. Build keys from ids you control.

## Private files and signed URLs

```typescript
const key = `invoices/${order.id}.pdf`;
if (!(await this.disk.exists(key))) await this.disk.put(key, pdfBuffer, { contentType: 'application/pdf', metadata: { orderId: order.id } });
return { url: await this.disk.signedUrl(key, { expiresIn: '5m', filename: `invoice-${order.id}.pdf` }) };
```

- Check ownership/authorization before issuing links (nestjs-authorization). Signed URLs can't be revoked: keep them short (default 15 min, max 7 days).
- Local disks: add a `FilesController` with `@Get() serveSignedUrl(disk, { req, res })` and `@Put() receiveSignedUpload(disk, { req, res })` under the `signedUrls.baseUrl` route (404 with S3, which serves presigned URLs itself).
- Public files: `disk.url(key)` (under `publicUrl`, usually a CDN); dev route: `serveFile(disk, key, { req, res, disposition: 'inline' })`.

## Direct uploads from clients

1. `POST …/uploads` → `uploads.signedUpload(\`incoming/${productId}/${randomUUID()}\`, { contentType, contentLength: size, expiresIn: '10m' })` returns `{ url, method: 'PUT', headers, expiresAt }`.
2. Client `PUT`s the file.
3. `PUT …/photo { key }` → verify the key prefix you issued, `stat()` the size, ranged `get(key, { range: { start: 0, end: 15 } })` + `detectContentType()`, then stream `get()` → `put()` onto the public disk and delete the incoming file.

Expire `incoming/` and incomplete multipart uploads with bucket lifecycle rules; enable bucket CORS for browser PUTs.

## Testing

```typescript
const photos = new InMemoryDisk({ publicUrl: 'https://photos.example.com' });
const files = new InMemoryDisk({ signedUrls: { baseUrl: 'https://api.example.com/files', keys: ['test-signing-key-0123456789abcdef'] } });
// .overrideProvider(STORAGE_MODULE_OPTIONS).useValue({ default: 'private', disks: { photos, private: files } })
expect(photos.keys()).toHaveLength(1);   // photos.getBuffer(key), photos.clear()
```

## Workflow

- [ ] 1. Install; config file with driver/buckets/signing key; `createStorageOptions` factory; `StorageModule.forRootAsync`.
- [ ] 2. Uploads via `FileInterceptor` + `uploadToDisk()` with types, size and cache headers.
- [ ] 3. Private files with signed URLs after authorization; dev `FilesController`.
- [ ] 4. Direct uploads if clients send large files; lifecycle rules, CORS, least-privilege IAM (`GetObject`, `PutObject`, `DeleteObject`, `ListBucket`).
- [ ] 5. InMemoryDisk e2e tests. Build, lint, run tests, start the app.

## Reference files

- `references/storage-reference.md`: disk methods and key rules, disk options (S3 encryption, multipart, retries), HTTP helper options, errors with statuses, Fastify raw-body note. Read when using methods beyond the basics or mapping errors.

Sources: [File storage](https://docs.nestjs.com/application/file-storage)
