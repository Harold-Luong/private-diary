import { z } from 'zod';
import { Prisma } from '../db.js';
import { ApiError, invalid, notFound } from '../common/errors.js';
import { id, status, dateOnly, pageFields, diaryParams, todayIn, toDate, formatDate, monthRange } from '../common/validation.js';
import { diaryInclude, summaryInclude, publicDiary, publicDiarySummary, pagination } from '../common/serializers.js';
import { literalLike } from '../common/search.js';
import { lockDiary } from '../common/diary-access.js';

const fields = {
    title: z.string().trim().max(255).transform(v => v || null).nullable().optional(),
    content: z.string().max(100000).optional(), diaryDate: dateOnly.optional(),
    status: status.optional(), moodId: id.nullable().optional(),
    tagIds: z.array(id).max(20).refine(ids => new Set(ids).size === ids.length).optional(),
};
const createSchema = z.strictObject(fields);
const updateSchema = createSchema.refine(v => Object.keys(v).length > 0);
const listSchema = z.strictObject({
    ...pageFields, keyword: z.string().trim().min(1).max(200).optional(), status: status.optional(),
    moodId: id.optional(), tagId: id.optional(), fromDate: dateOnly.optional(), toDate: dateOnly.optional(),
    sort: z.enum(['diaryDate:asc', 'diaryDate:desc', 'createdAt:asc', 'createdAt:desc', 'updatedAt:asc', 'updatedAt:desc']).default('diaryDate:desc'),
}).refine(v => !v.fromDate || !v.toDate || v.fromDate <= v.toDate, { path: ['fromDate'] });
const calendarSchema = z.strictObject({
    year: z.string().regex(/^\d{1,4}$/).transform(Number).pipe(z.number().int().min(1).max(9999)),
    month: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(12)),
    status: status.optional(),
});
const statisticsSchema = z.strictObject({
    fromDate: dateOnly.optional(), toDate: dateOnly.optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'ALL']).default('PUBLISHED'),
}).refine(v => Boolean(v.fromDate) === Boolean(v.toDate), { path: ['fromDate'] });

async function validateReferences(tx, userId, input) {
    if (input.moodId && !await tx.mood.findUnique({ where: { id: input.moodId } })) throw new ApiError(400, 'INVALID_MOOD', 'Cảm xúc không hợp lệ');
    if (input.tagIds?.length) {
        // Shared row locks keep tags alive until DiaryTag changes commit.
        const tags = await tx.$queryRaw`SELECT id FROM tags WHERE user_id = ${userId}::uuid AND id IN (${Prisma.join(input.tagIds.map(value => Prisma.sql`${value}::uuid`))}) ORDER BY id FOR SHARE`;
        if (tags.length !== input.tagIds.length) throw new ApiError(400, 'INVALID_TAGS', 'Danh sách thẻ không hợp lệ');
    }
}
function validatePublished(value, timezone) {
    if (value.status !== 'PUBLISHED') return;
    if (!value.content.trim()) throw invalid('content', 'REQUIRED_WHEN_PUBLISHED');
    if (value.diaryDate > todayIn(timezone)) throw invalid('diaryDate', 'FUTURE_DATE_NOT_ALLOWED');
}
async function settings(tx, userId) {
    return tx.userSetting.findUniqueOrThrow({ where: { userId } });
}

export function createDiariesController(db) {
  async function getCalendar(req, res) {
      const input = calendarSchema.parse(req.query);
      const { first, last, days } = monthRange(input.year, input.month);
      const data = await db.$transaction(async tx => {
          const { timezone } = await settings(tx, res.locals.auth.userId);
          const groups = await tx.diary.groupBy({
              by: ['diaryDate', 'status'], where: {
                  userId: res.locals.auth.userId, deletedAt: null, status: input.status,
                  diaryDate: { gte: toDate(first), lte: toDate(last) },
              }, _count: { _all: true }
          });
          const entries = Array.from({ length: days }, (_, index) => ({ date: first.slice(0, 8) + String(index + 1).padStart(2, '0'), total: 0, draftCount: 0, publishedCount: 0 }));
          for (const group of groups) {
              const day = entries[group.diaryDate.getUTCDate() - 1];
              day.total += group._count._all;
              day[group.status === 'DRAFT' ? 'draftCount' : 'publishedCount'] += group._count._all;
          }
          return { year: input.year, month: input.month, timezone, days: entries };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      res.json({ success: true, data });
  }

  async function getStatistics(req, res) {
      const input = statisticsSchema.parse(req.query);
      const data = await db.$transaction(async tx => {
          const { timezone } = await settings(tx, res.locals.auth.userId);
          const today = todayIn(timezone);
          const month = monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
          const fromDate = input.fromDate ?? month.first;
          const toDateValue = input.toDate ?? month.last;
          const duration = (toDate(toDateValue) - toDate(fromDate)) / 86400000 + 1;
          if (duration < 1 || duration > 366) throw invalid('fromDate', 'INVALID_DATE_RANGE');
          const where = { userId: res.locals.auth.userId, deletedAt: null, status: input.status === 'ALL' ? undefined : input.status, diaryDate: { gte: toDate(fromDate), lte: toDate(toDateValue) } };
          const statuses = await tx.diary.groupBy({ by: ['status'], where, _count: { _all: true } });
          const dates = await tx.diary.groupBy({ by: ['diaryDate'], where });
          const moods = await tx.diary.groupBy({ by: ['moodId'], where, _count: { _all: true } });
          const imageCount = await tx.diaryImage.count({ where: { diary: where } });
          const catalog = await tx.mood.findMany({ orderBy: [{ score: 'asc' }, { code: 'asc' }] });
          const draftCount = statuses.find(s => s.status === 'DRAFT')?._count._all ?? 0;
          const publishedCount = statuses.find(s => s.status === 'PUBLISHED')?._count._all ?? 0;
          let scoredCount = 0, scoreSum = 0;
          const moodDistribution = [];
          for (const mood of catalog) {
              const count = moods.find(m => m.moodId === mood.id)?._count._all ?? 0;
              if (count) moodDistribution.push({ moodId: mood.id, count });
              scoredCount += count;
              scoreSum += count * mood.score;
          }
          const unscored = moods.find(m => m.moodId === null)?._count._all ?? 0;
          if (unscored) moodDistribution.push({ moodId: null, count: unscored });
          return {
              fromDate, toDate: toDateValue, timezone, status: input.status, totalEntries: draftCount + publishedCount,
              draftCount, publishedCount, activeDays: dates.length, imageCount,
              averageMoodScore: scoredCount ? Math.round(scoreSum / scoredCount * 100) / 100 : null, moodDistribution
          };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      res.json({ success: true, data });
  }

  async function listDiaries(req, res) {
      const input = listSchema.parse(req.query);
      const where = {
          userId: res.locals.auth.userId, deletedAt: null, status: input.status, moodId: input.moodId,
          ...(input.tagId ? { tags: { some: { tagId: input.tagId, userId: res.locals.auth.userId } } } : {}),
          ...(input.fromDate || input.toDate ? { diaryDate: { gte: input.fromDate ? toDate(input.fromDate) : undefined, lte: input.toDate ? toDate(input.toDate) : undefined } } : {}),
          ...(input.keyword ? { OR: ['title', 'content'].map(field => ({ [field]: { contains: literalLike(input.keyword), mode: 'insensitive' } })) } : {}),
      };
      const [field, direction] = input.sort.split(':');
      const [diaries, total] = await db.$transaction([
          db.diary.findMany({ where, include: summaryInclude, orderBy: [{ [field]: direction }, { id: direction }], skip: (input.page - 1) * input.limit, take: input.limit }),
          db.diary.count({ where }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      res.json({ success: true, data: diaries.map(publicDiarySummary), meta: pagination(input.page, input.limit, total) });
  }

  async function createDiary(req, res) {
      const input = createSchema.parse(req.body);
      const userId = res.locals.auth.userId;
      const diary = await db.$transaction(async tx => {
          const { timezone } = await settings(tx, userId);
          const value = { title: input.title ?? null, content: input.content ?? '', diaryDate: input.diaryDate ?? todayIn(timezone), status: input.status ?? 'DRAFT' };
          validatePublished(value, timezone);
          await validateReferences(tx, userId, input);
          const diary = await tx.diary.create({ data: { ...value, diaryDate: toDate(value.diaryDate), userId, moodId: input.moodId ?? null } });
          if (input.tagIds?.length) await tx.diaryTag.createMany({ data: input.tagIds.map(tagId => ({ diaryId: diary.id, tagId, userId })) });
          return tx.diary.findUniqueOrThrow({ where: { id: diary.id }, include: diaryInclude });
      });
      res.location(`/api/v1/diaries/${diary.id}`).status(201).json({ success: true, data: publicDiary(diary) });
  }

  async function getDiary(req, res) {
      const { id } = diaryParams.parse(req.params);
      const diary = await db.diary.findFirst({ where: { id, userId: res.locals.auth.userId, deletedAt: null }, include: diaryInclude });
      if (!diary) throw notFound();
      res.json({ success: true, data: publicDiary(diary) });
  }

  async function updateDiary(req, res) {
      const { id } = diaryParams.parse(req.params);
      const input = updateSchema.parse(req.body);
      const userId = res.locals.auth.userId;
      const diary = await db.$transaction(async tx => {
          const old = await lockDiary(tx, userId, id);
          const { timezone } = await settings(tx, userId);
          const value = {
              title: input.title === undefined ? old.title : input.title,
              content: input.content ?? old.content, diaryDate: input.diaryDate ?? formatDate(old.diaryDate),
              status: input.status ?? old.status, moodId: input.moodId === undefined ? old.moodId : input.moodId
          };
          validatePublished(value, timezone);
          await validateReferences(tx, userId, input);
          if (input.tagIds !== undefined) {
              await tx.diaryTag.deleteMany({ where: { diaryId: id, userId } });
              if (input.tagIds.length) await tx.diaryTag.createMany({ data: input.tagIds.map(tagId => ({ diaryId: id, tagId, userId })) });
          }
          return tx.diary.update({ where: { id, userId, deletedAt: null }, data: { ...value, diaryDate: toDate(value.diaryDate), updatedAt: new Date() }, include: diaryInclude });
      });
      res.json({ success: true, data: publicDiary(diary) });
  }

  async function deleteDiary(req, res) {
      const { id } = diaryParams.parse(req.params);
      const userId = res.locals.auth.userId;
      await db.$transaction(async tx => {
          await lockDiary(tx, userId, id);
          const images = await tx.diaryImage.findMany({ where: { diaryId: id, userId } });
          if (images.length) await tx.storageDeleteJob.createMany({ data: images.map(({ objectKey }) => ({ objectKey })), skipDuplicates: true });
          await tx.diaryImage.deleteMany({ where: { diaryId: id, userId } });
          await tx.diary.update({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } });
      });
      res.status(204).end();
  }

  return { getCalendar, getStatistics, listDiaries, createDiary, getDiary, updateDiary, deleteDiary };
}
