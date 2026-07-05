'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { FieldLabel, StatusBadge, TextField } from '@anclora/ui';

interface Snapshot { readiness: { ready: boolean; missing: string[] }; legalEntity?: { legalName?: string; tradeName?: string; countryCode?: string; currencyCode?: string; address?: string; contactEmail?: string } | null }

export function FiscalConfigurationForm() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { void fetch('/api/v1/fiscal-configuration', { credentials: 'include' }).then(async (response) => {
    if (response.ok) setSnapshot(await response.json() as Snapshot);
  }); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage('');
    const data = new FormData(event.currentTarget);
    const payload = {
      legalEntity: { legalName: data.get('legalName'), tradeName: data.get('tradeName') || null, countryCode: data.get('countryCode'), currencyCode: data.get('currencyCode'), address: data.get('address'), contactEmail: data.get('contactEmail') || null },
      series: { code: data.get('seriesCode'), fiscalYear: Number(data.get('fiscalYear')), documentType: 'FULL_INVOICE' },
      productProfile: { selector: data.get('selector'), productNature: data.get('productNature'), invoiceDescription: data.get('invoiceDescription'), domesticTaxCode: data.get('domesticTaxCode'), domesticTaxRate: data.get('domesticTaxRate'), ossEligible: data.get('ossEligible') === 'on', shippingRequired: data.get('shippingRequired') === 'on', effectiveFrom: data.get('effectiveFrom') },
      kdpPolicy: { version: data.get('kdpVersion'), effectiveFrom: data.get('effectiveFrom'), accountingPolicy: data.get('accountingPolicy'), embeddedCostTreatment: 'INCLUDED_IN_NET', reviewLevel: 'REVIEW_REQUIRED' },
    };
    const response = await fetch('/api/v1/fiscal-configuration', { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await response.json() as Snapshot & { message?: string };
    if (response.ok) { setSnapshot(body); setMessage('Configuración fiscal guardada y auditada.'); } else setMessage(body.message ?? 'No se pudo guardar la configuración.');
    setSaving(false);
  }

  const issuer = snapshot?.legalEntity;
  return <section className="settings-config fiscal-settings-panel">
    <div className="settings-readiness"><span className="section-index">CONFIGURACIÓN MÍNIMA</span><StatusBadge tone={snapshot?.readiness.ready ? 'info' : 'warning'}>{snapshot?.readiness.ready ? 'Lista para emitir' : 'Incompleta'}</StatusBadge></div>
    {snapshot && !snapshot.readiness.ready ? <p>Falta: {snapshot.readiness.missing.join(', ')}.</p> : null}
    <form onSubmit={save} className="fiscal-settings-form">
      <fieldset><legend>Entidad emisora</legend>
        <TextField label="Nombre legal" name="legalName" defaultValue={issuer?.legalName ?? ''} required />
        <TextField label="Nombre comercial" name="tradeName" defaultValue={issuer?.tradeName ?? ''} />
        <TextField label="Domicilio fiscal" name="address" defaultValue={issuer?.address ?? ''} required />
        <TextField label="Email de contacto" name="contactEmail" type="email" defaultValue={issuer?.contactEmail ?? ''} />
        <TextField label="País (ISO 2)" name="countryCode" defaultValue={issuer?.countryCode ?? 'ES'} required />
        <TextField label="Moneda (ISO 3)" name="currencyCode" defaultValue={issuer?.currencyCode ?? 'EUR'} required />
      </fieldset>
      <fieldset><legend>Serie y perfil fiscal</legend>
        <TextField label="Prefijo de serie" name="seriesCode" defaultValue="F" required />
        <TextField label="Ejercicio" name="fiscalYear" type="number" defaultValue={String(new Date().getFullYear())} required />
        <TextField label="SKU o selector" name="selector" defaultValue="ebook-*" required />
        <TextField label="Naturaleza de producto" name="productNature" defaultValue="ebook" required />
        <TextField label="Descripción en factura" name="invoiceDescription" defaultValue="Libro electrónico" required />
        <TextField label="Código de IVA" name="domesticTaxCode" defaultValue="ES_IVA_4" required />
        <TextField label="Tipo de IVA" name="domesticTaxRate" type="number" step="0.000001" defaultValue="0.04" required />
        <TextField label="Vigente desde" name="effectiveFrom" type="date" defaultValue={`${new Date().getFullYear()}-01-01`} required />
        <label className="checkbox-field"><input name="ossEligible" type="checkbox" /> Elegible para OSS</label>
        <label className="checkbox-field"><input name="shippingRequired" type="checkbox" /> Requiere envío</label>
      </fieldset>
      <fieldset><legend>Política Amazon KDP</legend>
        <TextField label="Versión de política" name="kdpVersion" defaultValue="1" required />
        <div className="field"><FieldLabel htmlFor="accountingPolicy" required>Tratamiento contable</FieldLabel><select id="accountingPolicy" name="accountingPolicy" defaultValue="NET_ROYALTY_ONLY" required><option value="NET_ROYALTY_ONLY">Regalía neta únicamente</option><option value="GROSS_AND_COST_REVIEW_REQUIRED">Bruto y coste — revisión requerida</option></select></div>
      </fieldset>
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  </section>;
}
