import { createProductionApp } from './create-production-app.js';

const app = await createProductionApp();
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
