import { redirect } from 'next/navigation';

// Legacy path — content moved to /tax-periods. Kept as a thin redirect so
// bookmarks and external links to /vat-dossier keep working.
export default function VatDossierLegacyPage() {
  redirect('/tax-periods');
}
