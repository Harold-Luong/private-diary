import './src/env.js';
import { defineConfig, env } from 'prisma/config';
import { migrationUrl } from './src/migration-url.js';
export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
        seed: 'node prisma/seed.js'
    },
    datasource: {
        url: migrationUrl(process.env.DATABASE_URL_UNPOOLED || env('DATABASE_URL'))
    }
});
