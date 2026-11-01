import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const projectRoot = process.cwd();
const outputDirectory = resolve(projectRoot, 'dist');

function copyClassicRuntime(): Plugin {
  return {
    name: 'matcha-luna-classic-runtime',
    apply: 'build',
    async writeBundle() {
      const source = resolve(projectRoot, 'assets/js');
      const destination = resolve(outputDirectory, 'assets/js');
      await mkdir(destination, { recursive: true });
      await cp(source, destination, { recursive: true });
    },
  };
}

export default defineConfig({
  base: '/Scoopies/',
  publicDir: false,
  appType: 'mpa',
  plugins: [copyClassicRuntime()],
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: [resolve(projectRoot, 'index.html'), resolve(projectRoot, 'tests/costing.test.html')],
    },
  },
});
