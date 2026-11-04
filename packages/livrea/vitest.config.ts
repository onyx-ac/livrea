import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (file: string) => fileURLToPath(new URL(`./src/${file}`, import.meta.url));

export default defineConfig({
  // Tests write themes in TSX, compiled against this package's own JSX runtime.
  esbuild: { jsx: 'automatic', jsxImportSource: 'livrea' },
  resolve: {
    alias: [
      { find: /^livrea\/jsx-(dev-)?runtime$/, replacement: source('jsx-runtime.ts') },
      { find: /^livrea$/, replacement: source('index.ts') }
    ]
  },
  test: { include: ['test/**/*.test.{ts,tsx}'] }
});
