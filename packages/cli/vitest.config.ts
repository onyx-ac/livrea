import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Each pack type-checks a theme with a fresh TypeScript program: seconds, not milliseconds.
  test: { include: ['test/**/*.test.ts'], testTimeout: 30_000 }
});
