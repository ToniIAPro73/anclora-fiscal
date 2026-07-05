import type { SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { FieldLabel } from './field-label';

export interface SelectFieldOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  options: SelectFieldOption[];
  error?: string;
  required?: boolean;
  placeholder?: string;
}

export function SelectField({ label, options, error, required, placeholder, ...props }: SelectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return <div className="field">
    <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
    <select
      id={id}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {error ? <p id={errorId} role="alert" className="field-error">{error}</p> : null}
  </div>;
}
