import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import { FieldLabel } from './field-label';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  required?: boolean;
}

export function TextField({ label, error, required, ...props }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return <div className="field">
    <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
    <input
      id={id}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      {...props}
    />
    {error ? <p id={errorId} role="alert" className="field-error">{error}</p> : null}
  </div>;
}
