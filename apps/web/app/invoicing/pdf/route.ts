import { NextResponse, type NextRequest } from 'next/server';
import { buildDemoInvoices } from '../demo';

export async function GET(request: NextRequest) {
  const number = request.nextUrl.searchParams.get('number');
  const { original, rectified } = await buildDemoInvoices();
  const document = [original, rectified].find((candidate) => candidate.number === number);
  if (!document) return NextResponse.json({ code: 'DOCUMENT_NOT_FOUND', message: 'Documento de demostración no encontrado' }, { status: 404 });
  return new NextResponse(Buffer.from(document.pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${document.number}.pdf"`,
    },
  });
}
