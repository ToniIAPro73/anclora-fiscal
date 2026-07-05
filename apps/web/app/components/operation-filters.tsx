'use client';

import { FieldLabel } from '@anclora/ui';

export interface OperationFilterValues {
  dateFrom: string;
  dateTo: string;
  productNature: string;
  sourceChannel: string;
}

export const emptyOperationFilters: OperationFilterValues = {
  dateFrom: '',
  dateTo: '',
  productNature: '',
  sourceChannel: '',
};

export function operationFiltersQuery(filters: OperationFilterValues): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function OperationFilters({ value, onChange }: { value: OperationFilterValues; onChange: (next: OperationFilterValues) => void }) {
  function set(field: keyof OperationFilterValues, fieldValue: string) {
    onChange({ ...value, [field]: fieldValue });
  }

  return <div className="operation-filters" aria-label="Filtros de operaciones">
    <div>
      <FieldLabel htmlFor="filter-date-from">Fecha desde</FieldLabel>
      <input id="filter-date-from" type="date" value={value.dateFrom} onChange={(event) => set('dateFrom', event.target.value)} />
    </div>
    <div>
      <FieldLabel htmlFor="filter-date-to">Fecha hasta</FieldLabel>
      <input id="filter-date-to" type="date" value={value.dateTo} onChange={(event) => set('dateTo', event.target.value)} />
    </div>
    <div>
      <FieldLabel htmlFor="filter-product">Tipo de producto</FieldLabel>
      <select id="filter-product" value={value.productNature} onChange={(event) => set('productNature', event.target.value)}>
        <option value="">Todos</option>
        <option value="ebook">eBook</option>
        <option value="general">Tapa blanda / general</option>
      </select>
    </div>
    <div>
      <FieldLabel htmlFor="filter-platform">Plataforma</FieldLabel>
      <select id="filter-platform" value={value.sourceChannel} onChange={(event) => set('sourceChannel', event.target.value)}>
        <option value="">Todas</option>
        <option value="SHOPIFY">Shopify</option>
        <option value="AMAZON_KDP">Amazon KDP</option>
      </select>
    </div>
    <button type="button" onClick={() => onChange(emptyOperationFilters)}>Limpiar filtros</button>
  </div>;
}
