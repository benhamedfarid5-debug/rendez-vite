#!/usr/bin/env node
/**
 * Lancement de développement : serveur API (4000) + Vite (5173) en parallèle.
 * Vite proxifie /api vers le serveur, donc une seule URL à ouvrir.
 */
import { spawn } from 'node:child_process';

const procs = [];
function run(name, cmd, args, color) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env, shell: process.platform === 'win32' });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  p.stdout.on('data', (d) => process.stdout.write(String(d).split('\n').filter(Boolean).map((l) => prefix + l).join('\n') + '\n'));
  p.stderr.on('data', (d) => process.stderr.write(String(d).split('\n').filter(Boolean).map((l) => prefix + l).join('\n') + '\n'));
  p.on('exit', (code) => {
    console.log(`${prefix}processus terminé (code ${code})`);
    shutdown();
  });
  procs.push(p);
  return p;
}

function shutdown() {
  for (const p of procs) if (!p.killed) p.kill('SIGTERM');
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('api', process.execPath, ['--watch', 'server/index.js'], '36');
run('web', process.execPath, ['node_modules/vite/bin/vite.js'], '35');
