import { useId } from 'react';
import { FieldLabel } from './field-label';

export interface DateRangeValue {
  from: string;
  to: string;
}

export interface DateRangeFieldProps {
  label: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  error?: string;
}

export function DateRangeField({ label, value, onChange, error }: DateRangeFieldProps) {
  const fromId = useId();
  const toId = useId();
  const errorId = `${fromId}-error`;
  return <div className="field date-range-field" role="group" aria-label={label}>
    <span className="field-group-label">{label}</span>
    <div className="date-range-inputs">
      <FieldLabel htmlFor={fromId}>Desde</FieldLabel>
      <input
        id={fromId}
        type="date"
        value={value.from}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange({ ...value, from: event.target.value })}
      />
      <FieldLabel htmlFor={toId}>Hasta</FieldLabel>
      <input
        id={toId}
        type="date"
        value={value.to}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange({ ...value, to: event.target.value })}
      />
    </div>
    {error ? <p id={errorId} role="alert" className="field-error">{error}</p> : null}
  </div>;
}
