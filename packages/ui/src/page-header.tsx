import type { ReactNode } from 'react';

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, backHref, backLabel = 'Volver al centro de control', actions }: PageHeaderProps) {
  return <header className="imports-header">
    <div>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
    <div className="topbar-actions">
      {actions}
      {backHref ? <a href={backHref}>{backLabel}</a> : null}
    </div>
  </header>;
}
