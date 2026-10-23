import { literalLike } from '../common/search.js';
import { z } from 'zod';
import { Prisma } from '../db.js';
import { ApiError, notFound } from '../common/errors.js';
import { id, pageFields } from '../common/validation.js';
import { pagination } from '../common/serializers.js';
const body = z.strictObject({
    name: z.string().trim().transform((v) => v.normalize('NFC')).pipe(z.string().min(1).max(50))
});
const params = z.strictObject({
    tagId: id
});
const query = z.strictObject({
    ...pageFields,
    keyword: z.string().trim().min(1).max(50).optional()
});
function conflict(error) {
    if (error.code === 'P2002') throw new ApiError(409, 'TAG_ALREADY_EXISTS', 'Tên thẻ đã tồn tại');
    throw error;
}

export function createTagsController(db) {
  async function listTags(req, res) {
      const input = query.parse(req.query);
      const where = {
          userId: res.locals.auth.userId,
          ...input.keyword ? {
              name: {
                  contains: literalLike(input.keyword),
                  mode: 'insensitive'
              }
          } : {}
      };
      const [tags, total] = await db.$transaction([
          db.tag.findMany({
              where,
              select: {
                  id: true,
                  name: true
              },
              orderBy: [
                  {
                      name: 'asc'
                  },
                  {
                      id: 'asc'
                  }
              ],
              skip: (input.page - 1) * input.limit,
              take: input.limit
          }),
          db.tag.count({
              where
          })
      ], {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
      });
      res.json({
          success: true,
          data: tags,
          meta: pagination(input.page, input.limit, total)
      });
  }

  async function createTag(req, res) {
      const input = body.parse(req.body);
      const tag = await db.tag.create({
          data: {
              userId: res.locals.auth.userId,
              name: input.name
          },
          select: {
              id: true,
              name: true
          }
      }).catch(conflict);
      res.location(`/api/v1/tags/${tag.id}`).status(201).json({
          success: true,
          data: tag
      });
  }

  async function updateTag(req, res) {
      const { tagId } = params.parse(req.params);
      const input = body.parse(req.body);
      try {
          const tag = await db.tag.update({
              where: {
                  id: tagId,
                  userId: res.locals.auth.userId
              },
              data: input,
              select: {
                  id: true,
                  name: true
              }
          });
          res.json({
              success: true,
              data: tag
          });
      } catch (error) {
          if (error.code === 'P2025') throw notFound();
          conflict(error);
      }
  }

  async function deleteTag(req, res) {
      const { tagId } = params.parse(req.params);
      const result = await db.tag.deleteMany({
          where: {
              id: tagId,
              userId: res.locals.auth.userId
          }
      });
      if (!result.count) throw notFound();
      res.status(204).end();
  }

  return { listTags, createTag, updateTag, deleteTag };
}
