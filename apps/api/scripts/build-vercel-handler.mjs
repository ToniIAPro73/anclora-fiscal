import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '../..');

// Packages that must be bundled (inlined) rather than left as external
// runtime dependencies, because their own resolution is fragile in ways
// Vercel's dependency tracer has failed to handle correctly: pdf-parse's
// `pdf-parse/lib/pdf-parse.js` is reached via a dynamic createRequire() call
// (see packages/connectors/src/shopify-pdf.ts) rather than a plain package
// entry, and that subpath was not included in the deployed function's
// node_modules ("Cannot find module 'pdf-parse/lib/pdf-parse.js'").
const forceBundle = new Set(['pdf-parse']);

const apiPackageJson = JSON.parse(readFileSync(path.join(apiRoot, 'package.json'), 'utf8'));
const externalDeps = Object.keys(apiPackageJson.dependencies ?? {})
  .filter((name) => !name.startsWith('@anclora/') && !forceBundle.has(name));

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
  // @anclora/* workspace packages (via alias, above) and anything in
  // forceBundle are inlined; every other direct dependency of apps/api is
  // left external (derived from package.json rather than hardcoded, so
  // adding a dependency doesn't silently leave it unbundled or un-external).
  external: externalDeps,
  alias: workspaceAlias,
  plugins: [jsToTsPlugin],
  logLevel: 'info',
});

const outputPath = path.join(apiRoot, 'api/_handler.mjs');
const bytes = result.metafile.outputs[path.relative(process.cwd(), outputPath).replace(/\\/g, '/')]?.bytes
  ?? Object.values(result.metafile.outputs).find((o) => o.entryPoint)?.bytes;
console.log(`\n@anclora/api build:vercel-handler — wrote ${outputPath}${bytes ? ` (${(bytes / 1024).toFixed(1)} KB)` : ''}`);
