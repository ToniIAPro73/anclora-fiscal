import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@anclora/core': '@anclora/core',
      '@anclora/db': '@anclora/db',
      '@anclora/connectors': '@anclora/connectors',
    },
  },
});
