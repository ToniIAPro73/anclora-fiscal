import type { ComponentProps } from 'react';

export function FieldLabel({ children, required, ...props }: ComponentProps<'label'> & { required?: boolean | undefined }) {
  return <label {...props}>{children}{required ? <span aria-hidden="true"> *</span> : null}</label>;
}
