import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { createStorage } from './storage.js';
import { startCleanup } from './jobs/cleanup.js';

let db, server, stopCleanup;
try {
  const config = loadConfig();
  db = createDb(config.databaseUrl);
  await db.$connect();
  // Fail early with a useful setup message instead of serving an unmigrated database.
  await db.mood.count();
  const storage = createStorage(config);
  server = createServer({ requestTimeout: 120000, headersTimeout: 15000 }, createApp({ db, config, storage }));
  server.listen(config.port, () => {
    console.log(`Private Diary API listening on port ${config.port}`);
    if (config.ephemeralJwtSecret) console.warn('Development JWT key generated in memory; access tokens expire on restart. Set JWT_SECRET for persistent sessions.');
  });
  server.on('error', async () => {
    console.error('HTTP server failed to listen; check PORT and permissions.');
    stopCleanup?.();
    await db.$disconnect();
    process.exitCode = 1;
  });
  stopCleanup = startCleanup(db, storage);
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopCleanup();
    const timeout = setTimeout(() => process.exit(1), 15000);
    timeout.unref();
    server.close(async () => { await db.$disconnect(); clearTimeout(timeout); });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch {
  console.error('API startup failed. Validate .env, PostgreSQL connection, then run npm run db:generate, npm run db:migrate and npm run db:seed.');
  await db?.$disconnect();
  process.exitCode = 1;
}
