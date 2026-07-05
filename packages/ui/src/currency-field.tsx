import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import { FieldLabel } from './field-label';

export interface CurrencyFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  currency?: string;
  error?: string;
  required?: boolean;
}

export function CurrencyField({ label, currency = 'EUR', error, required, ...props }: CurrencyFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return <div className="field currency-field">
    <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
    <div className="currency-field-input">
      <input
        id={id}
        type="number"
        step="0.01"
        inputMode="decimal"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      <span aria-hidden="true" className="currency-suffix">{currency}</span>
    </div>
    {error ? <p id={errorId} role="alert" className="field-error">{error}</p> : null}
  </div>;
}
