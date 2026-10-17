// Запуск для разработки: API-сервер (порт 3000) + Vite с горячей перезагрузкой (порт 5173).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const procs = [
  spawn(process.execPath, ['--watch', 'server/index.ts'], { stdio: 'inherit', env: { ...process.env, PORT: '3000', HOST: '127.0.0.1' } }),
  spawn(process.execPath, [vite], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => { if (code) { stop(); process.exit(code); } }));
