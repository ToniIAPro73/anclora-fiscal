import type { ComponentProps, ReactNode } from 'react';

export function FieldLabel({ children, required, ...props }: ComponentProps<'label'> & { required?: boolean }) {
  return <label {...props}>{children}{required ? <span aria-hidden="true"> *</span> : null}</label>;
}

export function StatusBadge({ tone, children }: { tone: 'info' | 'warning' | 'high' | 'blocking'; children: ReactNode }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric-card"><p>{label}</p><strong>{value}</strong><small>{detail}</small></article>;
}
