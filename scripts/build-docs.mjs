import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const rspressCli = resolve(projectRoot, 'node_modules/@rspress/core/bin/rspress.js');
const expectedArtifacts = [
  resolve(projectRoot, 'apps/docs/doc_build/index.html'),
  resolve(projectRoot, 'apps/docs/doc_build/next/index.html'),
  resolve(projectRoot, 'apps/docs/doc_build/guide/custom-nodes.html'),
];

const child = spawn(process.execPath, [rspressCli, 'build', '-c', 'apps/docs/rspress.config.ts'], {
  cwd: projectRoot,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let output = '';
let completed = false;
let settleTimer;

function observe(chunk, stream) {
  stream.write(chunk);
  output = `${output}${chunk}`.slice(-128_000);
  if ((output.match(/Total:/g) ?? []).length < 2) return;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    if (!expectedArtifacts.every(existsSync)) return;
    completed = true;
    child.kill();
  }, 750);
}

child.stdout.on('data', (chunk) => observe(chunk, process.stdout));
child.stderr.on('data', (chunk) => observe(chunk, process.stderr));

const timeout = setTimeout(() => {
  child.kill();
  console.error('Rspress build timed out before producing its final artifact summaries.');
}, 120_000);

const exitCode = await new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('close', (code) => resolveExit(code));
});

clearTimeout(timeout);
clearTimeout(settleTimer);

if (!completed && exitCode !== 0) {
  throw new Error(`Rspress build failed with exit code ${exitCode ?? 'unknown'}.`);
}

if (!expectedArtifacts.every(existsSync)) {
  throw new Error('Rspress exited without producing the expected documentation artifacts.');
}
