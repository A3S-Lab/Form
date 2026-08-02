import { copyFile, mkdir, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const outputRoot = resolve(projectRoot, 'dist');
if (dirname(outputRoot) !== projectRoot || basename(outputRoot) !== 'dist') {
  throw new Error(`Refusing to clean unexpected output path: ${outputRoot}`);
}
await rm(outputRoot, { recursive: true, force: true });

const library = await Bun.build({
  entrypoints: [
    resolve(projectRoot, 'src/cloud.ts'),
    resolve(projectRoot, 'src/core.ts'),
    resolve(projectRoot, 'src/index.ts'),
    resolve(projectRoot, 'src/react.tsx'),
    resolve(projectRoot, 'src/styles.css'),
    resolve(projectRoot, 'src/vue.ts'),
    resolve(projectRoot, 'src/web-component.tsx'),
    resolve(projectRoot, 'src/workflow.ts'),
    resolve(projectRoot, 'src/workers/compiler.worker.ts'),
  ],
  root: resolve(projectRoot, 'src'),
  outdir: outputRoot,
  target: 'browser',
  format: 'esm',
  splitting: true,
  minify: false,
  sourcemap: 'external',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'vue'],
  naming: {
    entry: '[dir]/[name].[ext]',
    chunk: 'chunks/[name]-[hash].[ext]',
    asset: 'assets/[name]-[hash].[ext]',
  },
});

const cli = await Bun.build({
  entrypoints: [resolve(projectRoot, 'src/cli.ts')],
  outdir: outputRoot,
  target: 'node',
  format: 'esm',
  minify: false,
  sourcemap: 'external',
  banner: '#!/usr/bin/env node',
  naming: '[name].[ext]',
});

for (const result of [library, cli]) {
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exitCode = 1;
  }
}

if (process.exitCode) throw new Error('A3S Form build failed.');
await mkdir(resolve(outputRoot, 'wasm'), { recursive: true });
await copyFile(
  resolve(projectRoot, 'src/wasm/sha256.wasm'),
  resolve(outputRoot, 'wasm/sha256.wasm'),
);
console.log(`Built ${library.outputs.length + cli.outputs.length} artifacts in ${outputRoot}`);
