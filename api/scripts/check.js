import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import SwaggerParser from '@apidevtools/swagger-parser';

let files = 0;
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.status) throw new Error(`Syntax check failed: ${path}`);
      files++;
    } else if (entry.name.endsWith('.ts')) throw new Error(`TypeScript source is not allowed: ${path}`);
  }
}
for (const dir of ['src', 'scripts', 'prisma', 'tests']) await check(dir);
const spec = await SwaggerParser.validate('docs/openapi.yaml');
console.log(`Checked ${files} JavaScript files and ${Object.values(spec.paths).reduce((sum, path) => sum + Object.keys(path).length, 0)} OpenAPI operations.`);
