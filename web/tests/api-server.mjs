import { fileURLToPath } from 'node:url'
import { testDatabase } from '../../api/tests/helpers.js'
import { createDb } from '../../api/src/db.js'
import { loadConfig } from '../../api/src/config.js'
import { createStorage } from '../../api/src/storage.js'
import { createApp } from '../../api/src/app.js'
import { seedMoods } from '../../api/prisma/seed.js'

// Reuse the API's isolated PostgreSQL fixture, never the user's .env database.
process.chdir(fileURLToPath(new URL('../../api/', import.meta.url)))
const fixture = await testDatabase()
const config = loadConfig({ NODE_ENV: 'test', PORT: '4180', FRONTEND_URL: 'http://localhost:4173', DATABASE_URL: fixture.url, JWT_SECRET: 'browser-tests-only-never-use-in-production', STORAGE_DRIVER: 'local', LOCAL_STORAGE_PATH: fixture.storagePath })
const db = createDb(fixture.url)
await seedMoods(db)
const server = createApp({ db, config, storage: createStorage(config) }).listen(4180, '127.0.0.1')
let closing = false
async function stop() {
  if (closing) return
  closing = true
  server.closeAllConnections()
  server.close()
  await db.$disconnect()
  await fixture.stop()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
