// Durable jobs run in any number of processes: SKIP LOCKED + a lease avoids duplicate claims.
export async function runCleanup(db, storage, { reconcile = false } = {}) {
    const now = new Date();
    await db.$transaction(async tx => {
        const expired = await tx.$queryRaw`
      SELECT id, object_key AS "objectKey" FROM image_upload_intents
      WHERE status = 'PENDING' AND expires_at < ${now}
      ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED`;
        for (const intent of expired) {
            await tx.imageUploadIntent.update({ where: { id: intent.id }, data: { status: 'ABANDONED' } });
            await tx.storageDeleteJob.upsert({ where: { objectKey: intent.objectKey }, create: { objectKey: intent.objectKey }, update: {} });
        }
    });
    if (reconcile) {
        // Late PUTs and process crashes can leave objects after a previous delete completed.
        // Only our namespace, older than 24 hours, and no live metadata may be reconciled.
        for await (const object of storage.list()) {
            if (!/^diaries\/[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\.(jpg|png|webp)$/.test(object.key) || !object.lastModified || object.lastModified.getTime() > Date.now() - 86400000) continue;
            await db.$transaction(async tx => {
                const intents = await tx.$queryRaw`SELECT id, status, expires_at AS "expiresAt" FROM image_upload_intents WHERE object_key = ${object.key} FOR UPDATE`;
                const intent = intents[0];
                if (intent?.status === 'PENDING' && intent.expiresAt > new Date()) return;
                if (await tx.diaryImage.findUnique({ where: { objectKey: object.key } })) return;
                if (intent?.status === 'PENDING') await tx.imageUploadIntent.update({ where: { id: intent.id }, data: { status: 'ABANDONED' } });
                await tx.storageDeleteJob.upsert({ where: { objectKey: object.key }, create: { objectKey: object.key }, update: {} });
            });
        }
    }
    const jobs = await db.$queryRaw`
    UPDATE storage_delete_jobs SET attempts = attempts + 1, next_attempt_at = ${new Date(Date.now() + 5 * 60000)}
    WHERE id IN (SELECT id FROM storage_delete_jobs WHERE next_attempt_at <= ${new Date()}
      ORDER BY next_attempt_at LIMIT 20 FOR UPDATE SKIP LOCKED)
    RETURNING id, object_key AS "objectKey", attempts`;
    let completed = 0, failed = 0;
    for (const job of jobs) {
        try {
            await storage.delete(job.objectKey);
            await db.storageDeleteJob.deleteMany({ where: { id: job.id, attempts: job.attempts } });
            completed++;
        } catch {
            const delay = Math.min(86400000, 30000 * 2 ** Math.min(job.attempts, 12));
            await db.storageDeleteJob.updateMany({ where: { id: job.id, attempts: job.attempts }, data: { nextAttemptAt: new Date(Date.now() + delay) } });
            failed++;
            console.error(JSON.stringify({ event: 'storage_cleanup_failed', attempts: job.attempts }));
        }
    }
    await db.rateBucket.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.authSession.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.imageUploadIntent.deleteMany({ where: { status: { in: ['COMPLETED', 'ABANDONED'] }, createdAt: { lt: new Date(Date.now() - 7 * 86400000) } } });
    return { completed, failed };
}

export function startCleanup(db, storage) {
    let running = false, lastReconcile = 0;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const reconcile = Date.now() - lastReconcile > 3600000;
            await runCleanup(db, storage, { reconcile });
            if (reconcile) lastReconcile = Date.now();
        } catch { console.error(JSON.stringify({ event: 'cleanup_worker_failed' })); }
        finally { running = false; }
    };
    const timer = setInterval(tick, 60000);
    timer.unref();
    return () => clearInterval(timer);
}
