import { NextResponse } from 'next/server';
import { buildDemoDossier } from '../demo';

export async function GET() {
  const dossier = await buildDemoDossier();
  return new NextResponse(Buffer.from(dossier.zipBytes), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="expediente-${dossier.period}.zip"`,
    },
  });
}
