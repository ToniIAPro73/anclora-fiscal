'use client';

import { Button, DateRangeField, SelectField } from '@anclora/ui';

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

const productNatureOptions = [
  { value: 'ebook', label: 'eBook' },
  { value: 'general', label: 'Tapa blanda / general' },
];

const sourceChannelOptions = [
  { value: 'SHOPIFY', label: 'Shopify' },
  { value: 'AMAZON_KDP', label: 'Amazon KDP' },
];

export function OperationFilters({ value, onChange }: { value: OperationFilterValues; onChange: (next: OperationFilterValues) => void }) {
  function set(field: keyof OperationFilterValues, fieldValue: string) {
    onChange({ ...value, [field]: fieldValue });
  }

  return <div className="operation-filters" role="group" aria-label="Filtros de operaciones">
    <DateRangeField
      label="Rango de fechas"
      value={{ from: value.dateFrom, to: value.dateTo }}
      onChange={(range) => onChange({ ...value, dateFrom: range.from, dateTo: range.to })}
    />
    <SelectField
      label="Tipo de producto"
      placeholder="Todos"
      options={productNatureOptions}
      value={value.productNature}
      onChange={(event) => set('productNature', event.target.value)}
    />
    <SelectField
      label="Plataforma"
      placeholder="Todas"
      options={sourceChannelOptions}
      value={value.sourceChannel}
      onChange={(event) => set('sourceChannel', event.target.value)}
    />
    <Button variant="secondary" onClick={() => onChange(emptyOperationFilters)}>Limpiar filtros</Button>
  </div>;
}
