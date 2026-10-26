import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = ['api', 'web'].map(directory => spawn('npm', [
  '--prefix', directory, 'run', 'dev',
  ...(directory === 'web' && process.env.WEB_PORT ? ['--', '--port', process.env.WEB_PORT] : []),
], {
  cwd: root, stdio: 'inherit', detached: process.platform !== 'win32',
}));
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const child of children) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 1); });
}
