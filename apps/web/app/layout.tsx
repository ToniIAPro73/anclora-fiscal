import type { Metadata } from 'next';
import { EB_Garamond, Montserrat, Playfair_Display } from 'next/font/google';
import '@anclora/ui/tokens.css';
import './styles.css';
import './ux-overrides.css';

const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-display' });
const garamond = EB_Garamond({ subsets: ['latin'], variable: '--font-editorial' });
const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-ui' });

export const metadata: Metadata = {
  title: { default: 'Anclora Fiscal', template: '%s · Anclora Fiscal' },
  description: 'Sistema operativo fiscal trazable para ventas digitales.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${playfair.variable} ${garamond.variable} ${montserrat.variable}`}>{children}</body></html>;
}
