import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { createStorage } from '../storage.js';
import { runCleanup } from './cleanup.js';

const config = loadConfig();
const db = createDb(config.databaseUrl);
try {
    const result = await runCleanup(db, createStorage(config), { reconcile: true });
    console.log(JSON.stringify({ event: 'cleanup_complete', ...result }));
} catch {
    console.error('Cleanup failed; check database/storage connectivity.');
    process.exitCode = 1;
} finally { await db.$disconnect(); }
