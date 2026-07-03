import { buildApp } from './app';

const app = await buildApp();
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
