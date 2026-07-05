import { redirect } from 'next/navigation';

// Legacy path — content moved to /sales/shopify. Kept as a thin redirect so
// bookmarks and external links to /operations keep working.
export default function OperationsLegacyPage() {
  redirect('/sales/shopify');
}
