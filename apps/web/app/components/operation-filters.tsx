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

export function OperationFilters({
  value,
  onChange,
  showPlatform = true,
}: {
  value: OperationFilterValues;
  onChange: (next: OperationFilterValues) => void;
  showPlatform?: boolean;
}) {
  function set(field: keyof OperationFilterValues, fieldValue: string) {
    onChange({ ...value, [field]: fieldValue });
  }

  const clearedFilters = showPlatform ? emptyOperationFilters : { ...emptyOperationFilters, sourceChannel: value.sourceChannel };

  return <div className={`operation-filters${showPlatform ? '' : ' operation-filters-compact'}`} role="group" aria-label="Filtros de operaciones">
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
    {showPlatform ? <SelectField
      label="Plataforma"
      placeholder="Todas"
      options={sourceChannelOptions}
      value={value.sourceChannel}
      onChange={(event) => set('sourceChannel', event.target.value)}
    /> : null}
    <Button variant="secondary" onClick={() => onChange(clearedFilters)}>Limpiar filtros</Button>
  </div>;
}
