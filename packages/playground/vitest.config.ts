import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const uiEntry = fileURLToPath(new URL('../ui/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@livrea\/ui$/, replacement: uiEntry }]
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}']
  }
});
