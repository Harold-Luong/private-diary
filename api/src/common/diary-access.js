import { notFound } from './errors.js';

export async function activeDiary(db, userId, diaryId) {
    const diary = await db.diary.findFirst({ where: { id: diaryId, userId, deletedAt: null } });
    if (!diary) throw notFound();
    return diary;
}
export async function lockDiary(tx, userId, diaryId) {
    const rows = await tx.$queryRaw`SELECT id FROM diaries WHERE id = ${diaryId}::uuid AND user_id = ${userId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    if (!rows.length) throw notFound();
    return tx.diary.findUniqueOrThrow({ where: { id: diaryId } });
}
