import { useId, type ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  const titleId = useId();
  return <section className="empty-state" aria-labelledby={titleId}>
    <h2 id={titleId}>{title}</h2>
    <p>{description}</p>
    {action ? <div className="empty-state-action">{action}</div> : null}
  </section>;
}
