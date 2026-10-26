import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const envPaths = ['../../.env.local', '../../.env', '../.env.local', '../.env']
    .map(path => fileURLToPath(new URL(path, import.meta.url)));

// Neon writes env files at the repo root. Explicit runtime variables win;
// root files then override the API's older, local-only configuration.
export function loadEnvironment({ env = process.env, paths = envPaths } = {}) {
    const explicitDatabase = env.DATABASE_URL !== undefined;
    for (const path of paths) {
        let values;
        try { values = parseEnv(readFileSync(path, 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        for (const [key, value] of Object.entries(values)) {
            // An injected test/deployment database must never pick up the
            // production migration URL from a developer's root env file.
            if (key === 'DATABASE_URL_UNPOOLED' && explicitDatabase) continue;
            if (env[key] === undefined) env[key] = value;
        }
    }
    return env;
}

loadEnvironment();
