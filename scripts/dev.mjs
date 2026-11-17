import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['--watch', 'server/index.ts'], { stdio: 'inherit' });
const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' });

function stop() {
  server.kill('SIGTERM');
  web.kill('SIGTERM');
}

for (const child of [server, web]) {
  child.on('exit', (code, signal) => {
    if (signal) return;
    stop();
    process.exit(code ?? 0);
  });
}

process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});
