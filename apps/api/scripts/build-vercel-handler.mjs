import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '../..');

// Resolves bare `@anclora/*` specifiers straight to workspace package
// TypeScript source (not their built dist/ output) so this bundle never
// depends on packages/*/dist existing or on Vercel resolving pnpm's
// workspace symlinks at runtime — the whole point of bundling is that
// nothing is left for Vercel's own dependency tracer to get wrong.
const workspaceAlias = {
  '@anclora/core': path.join(repoRoot, 'packages/core/src/index.ts'),
  '@anclora/core/server': path.join(repoRoot, 'packages/core/src/server.ts'),
  '@anclora/db': path.join(repoRoot, 'packages/db/src/index.ts'),
  '@anclora/connectors': path.join(repoRoot, 'packages/connectors/src/index.ts'),
  '@anclora/tax-engine': path.join(repoRoot, 'packages/tax-engine/src/index.ts'),
};

// Our TypeScript source writes explicit `.js` extensions on relative imports
// (required by Node's strict ESM resolution elsewhere in this project — see
// commit 54580dc) even though the files are `.ts`. esbuild's resolver, given
// `./storage.js`, doesn't know a sibling `./storage.ts` exists unless told;
// this plugin maps `.js` specifiers back to their real `.ts`/`.tsx` source
// when the literal `.js` file doesn't exist on disk (mirrors the
// `extensionAlias` fix already applied to apps/web/next.config.mjs).
const jsToTsPlugin = {
  name: 'js-to-ts-source-mapping',
  setup(buildApi) {
    buildApi.onResolve({ filter: /\.js$/ }, (args) => {
      if (!args.path.startsWith('.')) return undefined;
      const literalJs = path.resolve(args.resolveDir, args.path);
      if (existsSync(literalJs)) return undefined;
      const withoutExt = args.path.slice(0, -'.js'.length);
      for (const ext of ['.ts', '.tsx']) {
        const candidate = path.resolve(args.resolveDir, withoutExt + ext);
        if (existsSync(candidate)) return { path: candidate };
      }
      return undefined;
    });
  },
};

const result = await build({
  entryPoints: [path.join(apiRoot, 'src/vercel-handler.ts')],
  outfile: path.join(apiRoot, 'api/_handler.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  metafile: true,
  // Only @anclora/* workspace packages are forced to bundle via the alias
  // above; every other bare specifier (fastify, zod, drizzle-orm, etc.) is
  // left external — Vercel's tracer has never failed on regular hoisted npm
  // dependencies, only on pnpm workspace symlinks.
  packages: 'external',
  alias: workspaceAlias,
  plugins: [jsToTsPlugin],
  logLevel: 'info',
});

const outputPath = path.join(apiRoot, 'api/_handler.mjs');
const bytes = result.metafile.outputs[path.relative(process.cwd(), outputPath).replace(/\\/g, '/')]?.bytes
  ?? Object.values(result.metafile.outputs).find((o) => o.entryPoint)?.bytes;
console.log(`\n@anclora/api build:vercel-handler — wrote ${outputPath}${bytes ? ` (${(bytes / 1024).toFixed(1)} KB)` : ''}`);
