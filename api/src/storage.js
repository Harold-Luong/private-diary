import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { ApiError } from './common/errors.js';

export const storageError = () => new ApiError(503, 'STORAGE_UNAVAILABLE', 'Kho ảnh tạm thời không khả dụng');

export function createStorage(config) {
  if (config.storageDriver === 'local') {
    const pathFor = key => {
      const path = resolve(config.localStoragePath, key);
      if (!path.startsWith(config.localStoragePath + sep)) throw storageError();
      return path;
    };
    return {
      async put(key, bytes) {
        const path = pathFor(key);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
      },
      async get(key) {
        const path = pathFor(key);
        const info = await stat(path).catch(() => { throw storageError(); });
        return { stream: createReadStream(path), size: info.size };
      },
      async delete(key) {
        await unlink(pathFor(key)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      },
      async *list() {
        // Local orphan traversal shares the same bounded iterator contract as R2.
        const { opendir } = await import('node:fs/promises');
        const root = config.localStoragePath;
        async function* walk(dir) {
          let entries;
          try { entries = await opendir(dir); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
          for await (const entry of entries) {
            const path = resolve(dir, entry.name);
            if (entry.isDirectory()) yield* walk(path);
            else if (entry.isFile()) {
              const info = await stat(path);
              yield { key: path.slice(root.length + 1).split(sep).join('/'), lastModified: info.mtime };
            }
          }
        }
        yield* walk(root);
      },
    };
  }
  const client = new S3Client({ region: 'auto', endpoint: config.r2.endpoint,
    credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const Bucket = config.r2.bucket;
  return {
    async put(key, bytes, contentType) {
      try { await client.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: contentType }), { abortSignal: AbortSignal.timeout(60000) }); }
      catch { throw storageError(); }
    },
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket, Key: key }), { abortSignal: AbortSignal.timeout(60000) });
        return { stream: result.Body, size: result.ContentLength };
      } catch { throw storageError(); }
    },
    async delete(key) { await client.send(new DeleteObjectCommand({ Bucket, Key: key }), { abortSignal: AbortSignal.timeout(60000) }); },
    async *list() {
      let token;
      do {
        const result = await client.send(new ListObjectsV2Command({ Bucket, Prefix: 'diaries/', ContinuationToken: token }), { abortSignal: AbortSignal.timeout(60000) });
        for (const object of result.Contents ?? []) yield { key: object.Key, lastModified: object.LastModified };
        token = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (token);
    },
  };
}
