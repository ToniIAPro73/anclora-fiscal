import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(__dirname, '../../packages');

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: [
      { find: '@anclora/core/server', replacement: path.resolve(packagesRoot, 'core/src/server.ts') },
      { find: '@anclora/core', replacement: path.resolve(packagesRoot, 'core/src/index.ts') },
      { find: /^@anclora\/core\/(.*)/, replacement: path.resolve(packagesRoot, 'core/src/$1') },
      { find: '@anclora/db', replacement: path.resolve(packagesRoot, 'db/src/index.ts') },
      { find: /^@anclora\/db\/(.*)/, replacement: path.resolve(packagesRoot, 'db/src/$1') },
      { find: '@anclora/connectors', replacement: path.resolve(packagesRoot, 'connectors/src/index.ts') },
      { find: /^@anclora\/connectors\/(.*)/, replacement: path.resolve(packagesRoot, 'connectors/src/$1') },
    ],
  },
});
