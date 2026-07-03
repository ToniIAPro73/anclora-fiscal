import { hashPassword } from './auth-service';

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const password = Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
if (!password) throw new Error('Debe proporcionar la contraseña por stdin');
process.stdout.write(`${await hashPassword(password)}\n`);
