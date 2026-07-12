'use client';
import { useEffect, useState } from 'react';
import { MetricCard, StatusBadge } from '@anclora/ui';
type Health = { period: string; status: string; metrics: Record<string, number|boolean|string> };
function currentPeriod() { const now = new Date(); return `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`; }
export function FiscalHealthPanel() {
  const [health, setHealth] = useState<Health>();
  useEffect(() => { const period = currentPeriod(); fetch(`/api/v1/periods/${period}/readiness`, { credentials: 'include' }).then((response) => response.ok ? response.json() : null).then((value: Health | null) => { if (value) setHealth(value); }).catch(() => undefined); }, []);
  if (!health) return null;
  const totalRisk = Number(health.metrics.blockingIssues ?? 0) + Number(health.metrics.rejectedSubmissions ?? 0);
  return <section className="fiscal-health" aria-label="Salud fiscal"><div><span className="section-index">SALUD FISCAL · {health.period}</span><h2>Estado operativo del periodo</h2><StatusBadge tone={health.status === 'RED' ? 'blocking' : health.status === 'AMBER' ? 'warning' : 'info'}>{health.status}</StatusBadge></div><div className="metrics"><MetricCard label="Bloqueos y rechazos" value={String(totalRisk)} detail="Requieren intervención" /><MetricCard label="Submissions pendientes" value={String(health.metrics.pendingSubmissions ?? 0)} detail="Cola VERI*FACTU" /><MetricCard label="Conciliación incompleta" value={String(health.metrics.incompleteReconciliation ?? 0)} detail="Operaciones" /><MetricCard label="Facturas sin huella" value={String(health.metrics.invoicesWithoutHash ?? 0)} detail="Integridad oficial" /></div></section>;
}
