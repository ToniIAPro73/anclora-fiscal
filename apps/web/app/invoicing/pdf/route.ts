import { NextResponse, type NextRequest } from 'next/server';

// No backend endpoint currently exposes fiscal-document PDF bytes for
// download — `apps/api/src/build-app.ts` only registers POST
// `/api/v1/operations/:id/invoices` (issue) and POST
// `/api/v1/fiscal-documents/:id/rectify`, neither of which streams the
// stored PDF back to the client, and there is no GET route reading from
// `StoragePort`. Rather than fabricate a download from hardcoded data (the
// old `buildDemoInvoices()` behavior), this route honestly reports that
// downloading is not available yet until a real download endpoint ships.
export async function GET(request: NextRequest) {
  const number = request.nextUrl.searchParams.get('number');
  return NextResponse.json(
    {
      code: 'DOCUMENT_DOWNLOAD_UNAVAILABLE',
      message: number
        ? `La descarga del PDF para el documento ${number} todavía no está disponible: el backend aún no expone un endpoint de descarga.`
        : 'La descarga de PDF todavía no está disponible: el backend aún no expone un endpoint de descarga.',
    },
    { status: 404 },
  );
}
