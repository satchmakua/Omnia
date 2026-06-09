import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Cover the deterministic simulation core. The renderer (src/render) and
      // the soak entry-point are excluded: the renderer is DOM/Canvas glue that
      // needs a browser harness (deferred), and soak.ts is a CLI wrapper around
      // already-tested code.
      include: ['src/sim/**/*.ts', 'src/content/**/*.ts', 'src/capability/**/*.ts', 'src/world/**/*.ts'],
      exclude: ['src/sim/soak.ts'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
