import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('Usage: node postbuild-dist-extensionless.js <dist-directory>');
  process.exit(1);
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.js')) continue;

    const targetPath = path.join(directory, entry.name.slice(0, -3));
    if (targetPath === fullPath) continue;

    try {
      await fs.copyFile(fullPath, targetPath);
    } catch (error) {
      console.error(`Failed to create extensionless copy for ${fullPath}:`, error);
      process.exit(1);
    }
  }
}

await walk(root);
