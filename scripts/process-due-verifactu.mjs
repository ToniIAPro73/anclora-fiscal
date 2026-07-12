const baseUrl = process.env.ANCLORA_API_URL?.replace(/\/$/, '');
const token = process.env.VERIFACTU_INTERNAL_TOKEN ?? process.env.CRON_SECRET;

if (!baseUrl || !token) {
  throw new Error('ANCLORA_API_URL y VERIFACTU_INTERNAL_TOKEN/CRON_SECRET son obligatorios');
}

const response = await fetch(`${baseUrl}/api/v1/internal/verifactu/process-due`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
});
const payload = await response.json();
if (!response.ok) {
  throw new Error(`VERIFACTU_PROCESS_DUE_FAILED:${response.status}`);
}
process.stdout.write(`${JSON.stringify(payload)}\n`);
