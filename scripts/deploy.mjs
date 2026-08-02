import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const runtimeRoot = resolve(projectRoot, '.a3s-form');
const serverRuntime = process.env.A3S_FORM_RUNTIME?.trim() || process.execPath;
let port = 4176;
let startServer = true;

for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--no-start') startServer = false;
  else if (argument === '--port') {
    port = Number(process.argv[index + 1]);
    index += 1;
  } else throw new Error(`未知参数：${argument}`);
}
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('端口必须是 1 到 65535 之间的整数。');
}

function run(label, arguments_) {
  process.stdout.write(`\n==> ${label}\n`);
  const result = spawnSync(process.execPath, arguments_, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label}失败，退出码：${result.status ?? 'unknown'}`);
}

async function healthy() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/.well-known/a3s-health`, {
      signal: AbortSignal.timeout(2_000),
    });
    const payload = await response.json();
    return response.ok && payload.ok === true && payload.service === 'a3s-form-playground';
  } catch {
    return false;
  }
}

async function portInUse() {
  return new Promise((resolvePort) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (inUse) => {
      socket.destroy();
      resolvePort(inUse);
    };
    socket.setTimeout(1_000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

run('安装锁定依赖', ['install', '--frozen-lockfile']);
run('构建 A3S Form 包', ['run', 'build']);
run('构建中文体验站', ['run', 'playground:build']);

if (!startServer) {
  process.stdout.write(`\n构建完成：${resolve(projectRoot, 'playground-dist')}\n`);
  process.exit(0);
}
if (await healthy()) {
  process.stdout.write(`\nA3S Form 已在运行：http://127.0.0.1:${port}\n`);
  process.exit(0);
}
if (await portInUse()) {
  throw new Error(`端口 ${port} 已被其他服务占用，请使用 -Port 指定其他端口。`);
}

mkdirSync(runtimeRoot, { recursive: true });
const output = openSync(resolve(runtimeRoot, 'playground.out.log'), 'w');
const errorOutput = openSync(resolve(runtimeRoot, 'playground.err.log'), 'w');
const child = spawn(serverRuntime, ['scripts/serve-playground.mjs'], {
  cwd: projectRoot,
  detached: true,
  env: { ...process.env, A3S_FORM_HOST: '127.0.0.1', A3S_FORM_PORT: String(port) },
  stdio: ['ignore', output, errorOutput],
  windowsHide: true,
});
let serverError;
child.once('error', (error) => {
  serverError = error;
});
closeSync(output);
closeSync(errorOutput);
child.unref();
writeFileSync(resolve(runtimeRoot, 'playground.pid'), `${child.pid}\n`, 'ascii');

let ready = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  if (serverError) break;
  if (await healthy()) {
    ready = true;
    break;
  }
}
if (!ready) {
  child.kill();
  if (serverError) throw serverError;
  throw new Error(`体验站未能启动，请查看 ${resolve(runtimeRoot, 'playground.err.log')}`);
}

process.stdout.write(`\n部署完成：http://127.0.0.1:${port}\n`);
process.stdout.write('服务已在隐藏进程中运行，不会弹出 cmd 窗口。\n');
process.stdout.write('使用 scripts\\stop.ps1 停止本地服务。\n');
