import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(here, '..', 'api', '_handler.mjs');

function fail(message) {
  console.error(`verify:vercel-bundle FAILED — ${message}`);
  process.exit(1);
}

if (!existsSync(bundlePath)) fail(`${bundlePath} does not exist`);

const stats = statSync(bundlePath);
if (stats.size === 0) fail(`${bundlePath} is zero bytes`);

const source = readFileSync(bundlePath, 'utf8');
const forbidden = [
  /from\s+['"]@anclora\/core['"]/,
  /from\s+['"]@anclora\/db['"]/,
  /from\s+['"]@anclora\/connectors['"]/,
  /from\s+['"]@anclora\/tax-engine['"]/,
  /import\(\s*['"]@anclora\//,
  /require\(\s*['"]@anclora\//,
];
for (const pattern of forbidden) {
  if (pattern.test(source)) fail(`bundle still contains a bare workspace-package reference matching ${pattern}`);
}

let mod;
try {
  mod = await import(pathToFileURL(bundlePath).href);
} catch (error) {
  fail(`bundle could not be imported by Node: ${error instanceof Error ? error.message : String(error)}`);
}

if (typeof mod.default !== 'function') fail('bundle default export is not a function');

console.log(`verify:vercel-bundle OK — ${bundlePath} (${(stats.size / 1024).toFixed(1)} KB), no bare @anclora/* references, imports cleanly, default export is a function`);
