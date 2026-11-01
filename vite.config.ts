import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const projectRoot = process.cwd();
const outputDirectory = resolve(projectRoot, 'dist');
const classicRuntimeDirectory = resolve(projectRoot, 'assets/js');

function classicRuntimeVersion(): string {
  const hash = createHash('sha256');
  readdirSync(classicRuntimeDirectory)
    .filter((fileName) => fileName.endsWith('.js'))
    .sort()
    .forEach((fileName) => {
      hash.update(fileName);
      hash.update('\0');
      hash.update(readFileSync(resolve(classicRuntimeDirectory, fileName)));
      hash.update('\0');
    });
  return hash.digest('hex').slice(0, 16);
}

function copyClassicRuntime(): Plugin {
  return {
    name: 'matcha-luna-classic-runtime',
    apply: 'build',
    async writeBundle() {
      const destination = resolve(outputDirectory, 'assets/js');
      await mkdir(destination, { recursive: true });
      await cp(classicRuntimeDirectory, destination, { recursive: true });
    },
  };
}

export default defineConfig({
  base: '/Scoopies/',
  publicDir: false,
  appType: 'mpa',
  plugins: [copyClassicRuntime()],
  define: {
    __MATCHA_LUNA_CLASSIC_RUNTIME_VERSION__: JSON.stringify(classicRuntimeVersion()),
  },
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: [resolve(projectRoot, 'index.html'), resolve(projectRoot, 'tests/costing.test.html')],
    },
  },
});
