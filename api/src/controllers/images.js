import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Busboy from 'busboy';
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { ApiError, invalid, notFound, tooLarge, unsupported } from '../common/errors.js';
import { id, diaryParams, imageParams } from '../common/validation.js';
import { publicImage } from '../common/serializers.js';
import { activeDiary, lockDiary } from '../common/diary-access.js';
import { storageError } from '../storage.js';

const MAX_FILE = 10000000, MAX_REQUEST = 10100000;
const quota = () => new ApiError(409, 'IMAGE_LIMIT_EXCEEDED', 'Mỗi nhật ký có tối đa 10 ảnh');
const orderSchema = z.strictObject({ imageIds: z.array(id).max(10).refine(values => new Set(values).size === values.length) });

export async function parseUpload(req) {
  if (!req.is('multipart/form-data')) throw unsupported();
  if (Number(req.headers['content-length'] ?? 0) > MAX_REQUEST) throw tooLarge();
  return new Promise((resolve, reject) => {
    let parser;
    try { parser = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE + 1, files: 1, fields: 0, parts: 2, headerPairs: 100 } }); }
    catch { reject(invalid('file')); return; }
    let total = 0, bytes = 0, file, settled = false;
    const chunks = [];
    const counter = new Transform({ transform(chunk, _encoding, callback) {
      total += chunk.length;
      callback(total > MAX_REQUEST ? tooLarge() : null, chunk);
    } });
    const fail = error => {
      if (settled) return;
      settled = true;
      req.unpipe(counter); counter.unpipe(parser);
      req.resume();
      reject(error);
    };
    req.once('aborted', () => fail(invalid('file', 'UPLOAD_ABORTED')));
    req.once('error', () => fail(invalid('file')));
    counter.on('error', fail);
    parser.on('error', () => fail(invalid('file')));
    parser.on('filesLimit', () => fail(invalid('file', 'EXACTLY_ONE_FILE')));
    parser.on('fieldsLimit', () => fail(invalid('file', 'UNEXPECTED_FIELD')));
    parser.on('partsLimit', () => fail(invalid('file', 'UNEXPECTED_PART')));
    parser.on('file', (name, stream, info) => {
      if (name !== 'file' || file) { stream.resume(); fail(invalid('file')); return; }
      file = { originalName: typeof info.filename === 'string' ? basename(info.filename.replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 255) || null : null, mimeType: info.mimeType };
      stream.on('limit', () => fail(tooLarge()));
      stream.on('error', () => fail(invalid('file')));
      stream.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_FILE) { fail(tooLarge()); return; }
        if (!settled) chunks.push(chunk);
      });
    });
    parser.on('close', () => {
      if (settled) return;
      settled = true;
      if (!file || !bytes) reject(invalid('file', 'EMPTY_FILE'));
      else resolve({ ...file, bytes: Buffer.concat(chunks), sizeBytes: bytes });
    });
    req.pipe(counter).pipe(parser);
  });
}

export function createImagesController(db, storage) {
  async function listImages(req, res) {
    const { id } = diaryParams.parse(req.params);
    const diary = await db.diary.findFirst({ where: { id, userId: res.locals.auth.userId, deletedAt: null }, include: { images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } });
    if (!diary) throw notFound();
    res.json({ success: true, data: diary.images.map(publicImage) });
  }

  async function uploadImage(req, res) {
    const { id } = diaryParams.parse(req.params);
    const userId = res.locals.auth.userId;
    await activeDiary(db, userId, id);
    if (await db.diaryImage.count({ where: { diaryId: id, userId } }) >= 10) throw quota();
    const file = await parseUpload(req);
    let type;
    try { type = await fileTypeFromBuffer(file.bytes); } catch { throw unsupported(); }
    if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime) || type.mime !== file.mimeType) throw unsupported();
    const objectKey = `diaries/${userId}/${id}/${randomUUID()}.${type.ext}`;
    const intent = await db.imageUploadIntent.create({ data: { userId, diaryId: id, objectKey, expiresAt: new Date(Date.now() + 15 * 60000) } });
    let image;
    try {
      await storage.put(objectKey, file.bytes, type.mime);
      image = await db.$transaction(async tx => {
        await lockDiary(tx, userId, id);
        const claimed = await tx.imageUploadIntent.updateMany({ where: { id: intent.id, status: 'PENDING', expiresAt: { gt: new Date() } }, data: { status: 'COMPLETED' } });
        if (!claimed.count) throw storageError();
        const count = await tx.diaryImage.count({ where: { diaryId: id, userId } });
        if (count >= 10) throw quota();
        const created = await tx.diaryImage.create({ data: { diaryId: id, userId, objectKey, originalName: file.originalName, mimeType: type.mime, sizeBytes: file.sizeBytes, sortOrder: count } });
        await tx.diary.update({ where: { id, userId, deletedAt: null }, data: { updatedAt: new Date() } });
        return created;
      });
    } catch (error) {
      // Original intent remains durable if compensation or even the database is unavailable.
      const canClean = await db.$transaction(async tx => {
        const changed = await tx.imageUploadIntent.updateMany({ where: { id: intent.id, status: 'PENDING' }, data: { status: 'ABANDONED' } });
        // A lost commit acknowledgement must not cause deletion of a committed image.
        if (!changed.count) return false;
        await tx.storageDeleteJob.upsert({ where: { objectKey }, create: { objectKey }, update: {} });
        return true;
      }).catch(() => false);
      // Best-effort immediate cleanup; durable job remains to cover failures and late PUTs.
      if (canClean) await storage.delete(objectKey).catch(() => {});
      throw error;
    }
    const data = publicImage(image);
    res.location(data.contentUrl).status(201).json({ success: true, data });
  }

  async function reorderImages(req, res) {
    const { id } = diaryParams.parse(req.params);
    const { imageIds } = orderSchema.parse(req.body);
    const userId = res.locals.auth.userId;
    const images = await db.$transaction(async tx => {
      await lockDiary(tx, userId, id);
      const existing = await tx.diaryImage.findMany({ where: { diaryId: id, userId }, select: { id: true } });
      if (existing.length !== imageIds.length || existing.some(image => !imageIds.includes(image.id))) throw new ApiError(409, 'IMAGE_ORDER_CONFLICT', 'Danh sách ảnh đã thay đổi, vui lòng tải lại');
      for (let index = 0; index < imageIds.length; index++) await tx.diaryImage.update({ where: { id: imageIds[index], diaryId: id, userId }, data: { sortOrder: index } });
      await tx.diary.update({ where: { id, userId, deletedAt: null }, data: { updatedAt: new Date() } });
      return tx.diaryImage.findMany({ where: { diaryId: id, userId }, orderBy: { sortOrder: 'asc' } });
    });
    res.json({ success: true, data: images.map(publicImage) });
  }

  async function getImageContent(req, res) {
    const { id, imageId } = imageParams.parse(req.params);
    const image = await db.diaryImage.findFirst({ where: { id: imageId, diaryId: id, userId: res.locals.auth.userId, diary: { deletedAt: null, userId: res.locals.auth.userId } } });
    if (!image) throw notFound();
    const object = await storage.get(image.objectKey);
    if (!object.stream || object.size !== image.sizeBytes) { object.stream?.destroy(); throw storageError(); }
    res.status(200).set({ 'Content-Type': image.mimeType, 'Content-Length': image.sizeBytes, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
    await pipeline(object.stream, res);
  }

  async function deleteImage(req, res) {
    const { id, imageId } = imageParams.parse(req.params);
    const userId = res.locals.auth.userId;
    await db.$transaction(async tx => {
      await lockDiary(tx, userId, id);
      const image = await tx.diaryImage.findFirst({ where: { id: imageId, diaryId: id, userId } });
      if (!image) throw notFound();
      await tx.diaryImage.delete({ where: { id: imageId, diaryId: id, userId } });
      await tx.diaryImage.updateMany({ where: { diaryId: id, userId, sortOrder: { gt: image.sortOrder } }, data: { sortOrder: { decrement: 1 } } });
      await tx.storageDeleteJob.upsert({ where: { objectKey: image.objectKey }, create: { objectKey: image.objectKey }, update: {} });
      await tx.diary.update({ where: { id, userId, deletedAt: null }, data: { updatedAt: new Date() } });
    });
    res.status(204).end();
  }

  return { listImages, uploadImage, reorderImages, getImageContent, deleteImage };
}
