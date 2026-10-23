import { mkdtemp, readdir, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

export async function testDatabase() {
  const root = await mkdtemp(join(tmpdir(), 'pd-test-'));
  let pgBin = process.env.PG_BIN;
  if (!pgBin && !process.env.TEST_DATABASE_URL) {
    const versions = await readdir('/usr/lib/postgresql').catch(() => []);
    pgBin = versions.sort((a, b) => Number(b) - Number(a)).map(v => `/usr/lib/postgresql/${v}/bin`)[0];
  }
  const data = join(root, 'pg');
  let started = false;
  let url = process.env.TEST_DATABASE_URL;
  const stop = async () => {
    if (started) execFileSync(join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
    await rm(root, { recursive: true, force: true });
  };
  try {
    if (!url) {
      if (!pgBin) throw new Error('Install PostgreSQL binaries/set PG_BIN, or set TEST_DATABASE_URL to an empty database ending in _test.');
      await access(join(pgBin, 'initdb'));
      execFileSync(join(pgBin, 'initdb'), ['-D', data, '-U', 'diary', '--auth=trust', '--locale=C.UTF-8', '--encoding=UTF8'], { stdio: 'pipe' });
      execFileSync(join(pgBin, 'pg_ctl'), ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-F -c listen_addresses='' -c unix_socket_directories='${root}'`, '-w', 'start'], { stdio: 'pipe' });
      started = true;
      const admin = new pg.Client({ host: root, user: 'diary', database: 'postgres' });
      await admin.connect();
      await admin.query('CREATE DATABASE diary_test');
      await admin.end();
      url = `postgresql://diary@localhost/diary_test?host=${encodeURIComponent(root)}`;
    } else {
      const parsed = new URL(url);
      if (!parsed.pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL database name must end with _test; never use a personal database.');
      const probe = new pg.Client({ connectionString: url });
      await probe.connect();
      try {
        const { rows } = await probe.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'");
        if (rows[0].count) throw new Error('TEST_DATABASE_URL must point to an empty, disposable database.');
      } finally { await probe.end(); }
    }
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: resolve('.'), env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe', timeout: 60000,
    });
    return { url, storagePath: join(root, 'images'), stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
