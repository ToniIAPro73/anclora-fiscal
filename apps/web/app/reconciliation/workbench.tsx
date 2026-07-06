'use client';
import { useEffect, useState } from 'react';
import { StatusBadge } from '@anclora/ui';

interface LinkRecord { id: string; linkType: string; state: string; confidence: string; explanationJson: { shopifyOrderName?: string; transactionAmount?: number; ledgerNetAmount?: number; platformFeeAmount?: number; payoutStatus?: string; externalPayoutId?: string | null; bankVerified?: boolean }; }
export function ReconciliationWorkbench() {
  const [links, setLinks] = useState<LinkRecord[]>(); const [error, setError] = useState(''); const [state, setState] = useState('');
  const load = () => fetch(`/api/v1/shopify/evidence-links${state ? `?state=${state}` : ''}`, { credentials: 'include' }).then(async r => { if (!r.ok) throw new Error('No se pudieron obtener los enlaces de evidencia'); return r.json(); }).then(setLinks).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, [state]);
  const decide = async (id: string, decision: 'CONFIRMED' | 'REJECTED') => { await fetch(`/api/v1/shopify/evidence-links/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: decision }) }); load(); };
  if (error) return <p className="workbench-notice workbench-notice-error">{error}</p>;
  return <section className="reconciliation-workbench"><p className="workbench-notice">Esta pantalla concilia evidencias internas de Shopify. “Payout identificado” significa que existe una referencia de liquidación; no implica que el banco la haya confirmado.</p>
    <div className="reconciliation-filters"><label>Estado<select value={state} onChange={e => setState(e.target.value)}><option value="">Todos</option><option value="PROPOSED">Pendiente de revisión</option><option value="AUTO_LINKED">Enlace exacto</option><option value="CONFIRMED">Confirmado</option><option value="REJECTED">Rechazado</option></select></label></div>
    {!links ? <p className="workbench-notice">Cargando enlaces…</p> : links.length === 0 ? <p className="workbench-notice">No hay enlaces para este filtro. Importa pedidos, transacciones y ledger para construir la cadena de evidencia.</p> : <div className="reconciliation-table-panel"><table><thead><tr><th>Pedido</th><th>Enlace</th><th>Importes</th><th>Liquidación</th><th>Estado</th><th>Revisión</th></tr></thead><tbody>{links.map(link => <tr key={link.id}><td>{link.explanationJson.shopifyOrderName ?? '—'}</td><td>{link.linkType === 'TRANSACTION_TO_LEDGER' ? 'Transacción → ledger' : link.linkType}</td><td>{link.explanationJson.transactionAmount ?? '—'} / neto {link.explanationJson.ledgerNetAmount ?? '—'} / comisión {link.explanationJson.platformFeeAmount ?? '—'}</td><td><StatusBadge tone={link.explanationJson.externalPayoutId ? 'info' : 'warning'}>{link.explanationJson.externalPayoutId ? 'Payout identificado' : 'Payout pendiente'}</StatusBadge></td><td>{link.state} · {(Number(link.confidence) * 100).toFixed(0)}%</td><td>{link.state === 'PROPOSED' ? <><button onClick={() => decide(link.id, 'CONFIRMED')}>Confirmar</button> <button onClick={() => decide(link.id, 'REJECTED')}>Rechazar</button></> : '—'}</td></tr>)}</tbody></table></div>}
  </section>;
}
