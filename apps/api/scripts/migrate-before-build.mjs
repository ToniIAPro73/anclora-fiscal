import { spawnSync } from 'node:child_process';

if (process.env.VERCEL !== '1') {
  console.log('prebuild:migrate — entorno no Vercel; migración remota omitida');
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error('prebuild:migrate FAILED — DATABASE_URL es obligatoria en Vercel');
  process.exit(1);
}

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(
  command,
  ['--filter', '@anclora/db', 'db:migrate'],
  {
    cwd: new URL('../../..', import.meta.url),
    env: process.env,
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(`prebuild:migrate FAILED — ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
