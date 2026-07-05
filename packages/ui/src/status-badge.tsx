import type { ReactNode } from 'react';

export function StatusBadge({ tone, children }: { tone: 'info' | 'warning' | 'high' | 'blocking'; children: ReactNode }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

// Alias kept for callers that refer to the concept as a "pill" rather than a
// "badge" — same component, no duplicated implementation.
export const StatusPill = StatusBadge;
