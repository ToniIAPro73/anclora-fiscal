import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './page';

// next/image requires static-import width/height metadata that Next.js's
// build-time loader normally injects; that loader doesn't run under Vitest,
// so the plain <Image> usage in app-shell.tsx (decorative brand medals,
// alt="") throws here. Stub it to a plain <img> for this test file only.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  }));
}

const populatedSummary = {
  openIssuesCount: 1,
  importsThisMonthCount: 3,
  reconciliationStatus: { matched: 1, unmatched: 1, total: 2 },
  documentsIssuedCount: 0,
  royalties: { statementsCount: 1, totalThisPeriod: '42.50', period: '2026-07' },
};

const emptySummary = {
  openIssuesCount: 0,
  importsThisMonthCount: 0,
  reconciliationStatus: { matched: 0, unmatched: 0, total: 0 },
  documentsIssuedCount: 0,
  royalties: { statementsCount: 0, totalThisPeriod: '0.00', period: '2026-07' },
};

describe('Dashboard', () => {
  it('muestra el llamado a la acción de primeros pasos cuando no hay datos', async () => {
    mockFetchOnce(emptySummary);
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText('Todavía no hay importaciones')).toBeInTheDocument());
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.queryByText(/operaciones$/)).not.toBeInTheDocument();
  });

  it('renderiza todas las secciones requeridas cuando existen datos, sin conciliación cuando total es 0', async () => {
    mockFetchOnce(emptySummary);
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText('Ventas facturables')).toBeInTheDocument());
    expect(screen.getByText('Pendientes de revisar')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Liquidaciones KDP' })).toBeInTheDocument();
    expect(screen.getByText('Estado del trimestre')).toBeInTheDocument();
    expect(screen.getByText('Incidencia bloqueante')).toBeInTheDocument();
    expect(screen.queryByLabelText('Conciliación')).not.toBeInTheDocument();
  });

  it('renderiza las métricas reales y la sección de conciliación cuando total > 0', async () => {
    mockFetchOnce(populatedSummary);
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
    expect(screen.getByText('50 %')).toBeInTheDocument();
    expect(screen.getByText('Periodo: julio 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Conciliación')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no hay importaciones')).not.toBeInTheDocument();
  });

  it('muestra un mensaje de error cuando la petición falla', async () => {
    mockFetchOnce({}, false);
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText('No se pudo obtener el resumen del panel')).toBeInTheDocument());
  });
});
