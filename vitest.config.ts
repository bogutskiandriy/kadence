import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Ядро синхронне (ADR-005), тести теж — паралелізм лише між файлами.
    pool: 'forks',
  },
});
