import { EmptyState, PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';

// No real VERI*FACTU adapter exists server-side (confirmed by reading
// apps/api/src/build-app.ts — the only VERI*FACTU-related code is the
// VERIFACTU_ENABLED flag on GET /health) and there is no endpoint exposing
// fiscal_documents/integrity-chain data to the web app yet. This page
// previously rendered a MockVerifactuAdapter demo-issuance flow disguised
// as a working integration; that has been removed entirely. Until a real
// adapter and a fiscal-documents list endpoint ship, this is an honest
// "not available yet" state rather than fabricated data — no redirect,
// preparation-only per spec.
export default function VerifactuPage() {
  return <AppShell>
    <PageHeader
      eyebrow="05 / INTEGRIDAD"
      title="VERI*FACTU"
      description="Todavía no hay integración real con la AEAT ni un endpoint que exponga los documentos fiscales emitidos."
      backHref="/"
    />
    <EmptyState
      title="Sin datos disponibles"
      description="No hay documentos fiscales emitidos todavía. Esta vista se completará cuando exista una decisión fiscal, una factura emitida y una integración real con VERI*FACTU."
    />
  </AppShell>;
}
