import { migrateRemoteDatabase } from './migrations';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria para migraciones remotas');

const result = await migrateRemoteDatabase(process.env.DATABASE_URL);
process.stdout.write(`${JSON.stringify(result)}\n`);
