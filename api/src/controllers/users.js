import { z } from 'zod';
import { displayName, timezone, theme } from '../common/validation.js';
import { publicUser, userInclude } from '../common/serializers.js';
import { invalid } from '../common/errors.js';
const schema = z.strictObject({
    displayName: displayName.optional(),
    settings: z.strictObject({
        timezone: timezone.optional(),
        theme: theme.optional()
    }).refine((v) => Object.keys(v).length > 0).optional()
}).refine((v) => Object.keys(v).length > 0);

export function createUsersController(db) {
  async function getCurrentUser(_req, res) {
      const user = await db.user.findUniqueOrThrow({
          where: {
              id: res.locals.auth.userId
          },
          include: userInclude
      });
      res.json({
          success: true,
          data: publicUser(user)
      });
  }

  async function updateCurrentUser(req, res) {
      const input = schema.parse(req.body);
      if (!Object.keys(input).length) throw invalid();
      const user = await db.user.update({
          where: {
              id: res.locals.auth.userId
          },
          data: {
              displayName: input.displayName,
              updatedAt: new Date(),
              ...input.settings ? {
                  settings: {
                      update: input.settings
                  }
              } : {}
          },
          include: userInclude
      });
      res.json({
          success: true,
          data: publicUser(user)
      });
  }

  return { getCurrentUser, updateCurrentUser };
}
