import { redirect } from 'next/navigation';

// Legacy path — content moved to /tax-rules. Kept as a thin redirect so
// bookmarks and external links to /tax-engine keep working.
export default function TaxEngineLegacyPage() {
  redirect('/tax-rules');
}
