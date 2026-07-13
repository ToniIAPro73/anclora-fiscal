'use client';
import { useState } from 'react';
import { Button, FieldLabel, StatusBadge } from '@anclora/ui';

type Result = { period: string; status: 'RED'|'AMBER'|'GREEN'|'CLOSED'; reasons: Array<{ code: string; severity: string; count: number; action: string }> };
const labels = { RED: 'Bloqueado', AMBER: 'Con advertencias', GREEN: 'Listo', CLOSED: 'Cerrado' } as const;

export function PeriodReadinessPanel() {
  const [period, setPeriod] = useState('');
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');

  async function check() {
    setError('');
    const response = await fetch(`/api/v1/periods/${encodeURIComponent(period)}/readiness`, { credentials: 'include' });
    if (!response.ok) { setError('No se pudo calcular la preparación del periodo'); return; }
    setResult(await response.json() as Result);
  }

  return <section className="evidence-panel period-readiness-panel">
    <span className="section-index">Semáforo de cierre</span>
    <h2>Semáforo de cierre</h2>
    <div className="inline-lookup-form">
      <div className="field">
        <FieldLabel htmlFor="readiness-period" required>Periodo</FieldLabel>
        <input id="readiness-period" value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="2026-06" />
      </div>
      <Button type="button" disabled={!period} onClick={() => void check()}>Comprobar preparación</Button>
    </div>
    {error ? <p role="status" className="import-error">{error}</p> : null}
    {result ? <div aria-live="polite" className="period-readiness-result">
      <StatusBadge tone={result.status === 'RED' ? 'blocking' : result.status === 'AMBER' ? 'warning' : 'info'}>{labels[result.status]}</StatusBadge>
      {result.reasons.length ? <ul>{result.reasons.map((reason) => <li key={reason.code}><strong>{reason.code}</strong>: {reason.action} ({reason.count})</li>)}</ul> : <p className="workbench-notice">El flujo operativo está completo.</p>}
    </div> : null}
  </section>;
}
