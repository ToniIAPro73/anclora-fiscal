import { NextResponse, type NextRequest } from 'next/server';

// No backend endpoint currently streams the stored VAT-dossier ZIP archive
// back to the client — `apps/api/src/vat-dossier-controller.ts`'s
// `GET /api/v1/periods/:period/vat-dossier` returns the dossier's metadata
// (including `storageKey`) but `StoragePort` has no signed-URL mechanism and
// there is no route reading the archive bytes from storage. Rather than
// fabricate a ZIP from hardcoded demo data (the old `buildDemoDossier()`
// behavior), this route honestly reports that downloading is not available
// yet until a real archive-download endpoint ships.
export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get('period');
  return NextResponse.json(
    {
      code: 'DOSSIER_DOWNLOAD_UNAVAILABLE',
      message: period
        ? `La descarga del expediente ZIP para el periodo ${period} todavía no está disponible: el backend aún no expone un endpoint de descarga.`
        : 'La descarga del expediente ZIP todavía no está disponible: el backend aún no expone un endpoint de descarga.',
    },
    { status: 404 },
  );
}
