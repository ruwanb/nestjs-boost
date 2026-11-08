# @nestjs/storage reference

## Contents
- Module options
- Keys
- Disk methods
- Disks
- HTTP helpers
- Errors
- Notes

## Module options

`StorageModule.forRoot()` / `forRootAsync()` (factory returns `default` + disk instances; disk classes, `imports`, `isGlobal` beside `useFactory`). Token: `STORAGE_MODULE_OPTIONS`.

| Option | Default | Notes |
| --- | --- | --- |
| `disks` | required | name → instance or injectable `StorageDisk` class |
| `default` | the only disk | required with more than one disk |
| `imports` | none | for disk classes |
| `isGlobal` | `true` | registers `Storage`, `StorageDisk`, named disks |

## Keys

Relative `/`-separated paths ≤1024 UTF-8 bytes; no empty, `.` or `..` segments, backslashes or control characters. Enforced on every disk, so user input can't escape a disk — but it can name any file on it.

## Disk methods

| Method | Notes |
| --- | --- |
| `put(key, body, { contentType, cacheControl, contentDisposition, metadata (≤2 KB strings), contentLength, signal })` | atomic; body: Buffer, string, Uint8Array, Node/web stream, async iterable → `{ key, size, contentType, etag }` |
| `get(key, { range: { start, end } \| { suffix } })` | metadata + `body` (Node stream) |
| `getBuffer(key)`, `getText(key)` | whole file |
| `stat(key)`, `exists(key)` | metadata only / boolean |
| `delete(key \| keys[])` | missing keys ignored |
| `list({ prefix, cursor, limit ≤1000 })`, `listAll(opts)` | pages of `key`, `size`, `lastModified`, `etag` |
| `copy(from, to)`, `move(from, to)` | within the disk, metadata included |
| `url(key)` | public URL; throws without `publicUrl` |
| `signedUrl(key, { expiresIn, filename, disposition })` | default 15 min, max 7 days |
| `signedUpload(key, { contentType, contentLength, expiresIn })` | `{ url, method, headers, expiresAt }`; signed for exact type and length |

## Disks

| Disk | Options |
| --- | --- |
| `LocalDisk` | `root` (created at startup), `publicUrl`, `signedUrls`; `path(key)` |
| `S3Disk` | `bucket`, `region` (`AWS_REGION` → `AWS_DEFAULT_REGION` → `us-east-1`), `endpoint`, `forcePathStyle`, `credentials` (object or function), `prefix`, `serverSideEncryption` (`'aws:kms'`), `kmsKeyId`, `multipart`, `retry`, `timeout`, `batchDelete`, `fetch`, `publicUrl` |
| `InMemoryDisk` | `publicUrl`, `signedUrls`; `keys()`, `clear()` |

`signedUrls: { baseUrl, keys }` — keys ≥32 chars, first signs, all verify (rotate by prepending). S3 uploads >8 MiB (or unknown length) go multipart (8 MiB parts, 4 at a time), aborted on failure. SigV4 implemented on `node:crypto`.

## HTTP helpers

| Helper | Options |
| --- | --- |
| `uploadToDisk(opts)` | `disk`, `contentTypes`, `detectContentType`, `contentTypeSampleBytes` (4 KiB default, 1 B–64 KiB), `cacheControl`, `key(file, req)`, `metadata(file, req)` → `StoredUpload` (`key`, `disk`, `contentType`, `etag` + multer fields) |
| `serveFile(disk, key, { res, req, disposition, filename, cacheControl })` | Range and If-None-Match with `req`; sets `X-Content-Type-Options: nosniff` |
| `serveSignedUrl(disk, { req, res, cacheControl })` | verifies signature, expiry, method |
| `receiveSignedUpload(disk, { req, res, maxSize })` | verifies and streams the PUT body |
| `detectContentType(bytes)` | JPEG, PNG, GIF, WebP, AVIF, HEIC, PDF from first 16 bytes |

Fastify: the upload body must reach `receiveSignedUpload` unparsed — register a catch-all content-type parser that leaves the body alone.

## Errors

All extend `StorageError` (not `HttpException` outside the helpers — map them yourself):

| Error | status |
| --- | --- |
| `StorageFileNotFoundError` (`key`) | 404 |
| `StorageInvalidKeyError` (`reason`) | 400 |
| `StorageBodyLengthError` (`expected`, `received`) | 400 |
| `StorageRangeNotSatisfiableError` (`size`) | 416 |
| `StorageKeyConflictError` (local disk `a` vs `a/b`) | 409 |
| `StorageSignedUrlError` (`missing`, `invalid`, `expired`, `method`) | 403 |
| `StorageServiceError` (`code`, `upstreamStatus`, `requestId`, `operation`) | — |

## Notes

- IAM: keep `s3:ListBucket`, or missing files return 403 and `exists()` throws.
- Local disks keep temp files and metadata in `.nest-storage`.
- To test real S3 behaviour (presigned URLs, multipart) point `S3Disk` at a local MinIO.
