'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { FieldLabel, StatusBadge, TextField } from '@anclora/ui';

interface Snapshot {
  readiness: { ready: boolean; missing: string[] };
  emisorFiscal?: {
    tipoEmisor: 'PERSONA_FISICA';
    nombreLegal: string;
    nombreComercial: string | null;
    nifConfigurado: boolean;
    direccionFiscal: string | null;
    emailContacto: string | null;
    pais: string;
    moneda: string;
    epigrafeIAE: string | null;
    regimenIVA: 'REGIMEN_REDUCIDO_LIBROS_ES';
    oss: { activo: boolean; vigenteDesde: string | null };
    estadoConfiguracion: 'COMPLETA' | 'INCOMPLETA';
  } | null;
  legalEntity?: {
    legalName?: string;
    tradeName?: string | null;
    countryCode?: string;
    currencyCode?: string;
    address?: string | null;
    contactEmail?: string | null;
    taxIdentityConfigured?: boolean;
  } | null;
}

const missingLabels: Record<string, string> = {
  ISSUER: 'emisor fiscal',
  INVOICE_SERIES: 'series fiscales',
  PRODUCT_TAX_PROFILE: 'perfil fiscal del producto',
  KDP_POLICY: 'política Amazon KDP',
};

function defaultDate() {
  return `${new Date().getFullYear()}-01-01`;
}

export function FiscalConfigurationForm() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch('/api/v1/fiscal-configuration', { credentials: 'include' }).then(async (response) => {
      if (response.ok) setSnapshot(await response.json() as Snapshot);
    });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    const payload = {
      datosEmisor: {
        tipoEmisor: 'PERSONA_FISICA',
        nombreLegal: data.get('nombreLegal'),
        nombreComercial: data.get('nombreComercial') || null,
        nifNie: data.get('nifNie') || null,
        direccionFiscal: data.get('direccionFiscal'),
        emailContacto: data.get('emailContacto') || null,
        pais: data.get('pais'),
        moneda: data.get('moneda'),
        epigrafeIAE: data.get('epigrafeIAE'),
        regimenIVA: data.get('regimenIVA'),
      },
      oss: {
        activo: data.get('ossActivo') === 'on',
        vigenteDesde: data.get('ossVigenteDesde') || null,
      },
      perfilProducto: {
        selector: data.get('selector'),
        naturalezaProducto: data.get('naturalezaProducto'),
        descripcionFactura: data.get('descripcionFactura'),
        codigoIVA: data.get('codigoIVA'),
        tipoIVA: data.get('tipoIVA'),
        elegibleOSS: data.get('elegibleOSS') === 'on',
        requiereEnvio: data.get('requiereEnvio') === 'on',
        vigenteDesde: data.get('vigenteDesde'),
      },
      ejercicio: Number(data.get('ejercicio')),
    };
    const response = await fetch('/api/v1/fiscal-configuration', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json() as Snapshot & { message?: string };
    if (response.ok) {
      setSnapshot(body);
      setMessage('Configuración fiscal guardada y auditada.');
    } else {
      setMessage(body.message ?? 'No se pudo guardar la configuración fiscal.');
    }
    setSaving(false);
  }

  const issuer = snapshot?.emisorFiscal;
  const legacyIssuer = snapshot?.legalEntity;
  const nifConfigured = issuer?.nifConfigurado ?? legacyIssuer?.taxIdentityConfigured ?? false;

  return <section className="settings-config fiscal-settings-panel">
    <div className="settings-readiness">
      <span className="section-index">CONFIGURACIÓN FISCAL REAL</span>
      <StatusBadge tone={snapshot?.readiness.ready ? 'info' : 'warning'}>{snapshot?.readiness.ready ? 'Lista para emitir' : 'Incompleta'}</StatusBadge>
    </div>
    {snapshot && !snapshot.readiness.ready ? <p>Falta: {snapshot.readiness.missing.map((item) => missingLabels[item] ?? item).join(', ')}.</p> : null}
    <form onSubmit={save} className="fiscal-settings-form">
      <fieldset><legend>Datos fiscales del emisor</legend>
        <TextField label="Nombre legal" name="nombreLegal" defaultValue={issuer?.nombreLegal ?? legacyIssuer?.legalName ?? ''} required />
        <TextField label="Nombre comercial" name="nombreComercial" defaultValue={issuer?.nombreComercial ?? legacyIssuer?.tradeName ?? ''} />
        <TextField label={nifConfigured ? 'NIF/NIE configurado (escribe uno nuevo para sustituirlo)' : 'NIF/NIE'} name="nifNie" autoComplete="off" />
        <TextField label="Domicilio fiscal" name="direccionFiscal" defaultValue={issuer?.direccionFiscal ?? legacyIssuer?.address ?? ''} required />
        <TextField label="Email de contacto" name="emailContacto" type="email" defaultValue={issuer?.emailContacto ?? legacyIssuer?.contactEmail ?? ''} />
        <TextField label="País (ISO 2)" name="pais" defaultValue={issuer?.pais ?? legacyIssuer?.countryCode ?? 'ES'} required />
        <TextField label="Moneda (ISO 3)" name="moneda" defaultValue={issuer?.moneda ?? legacyIssuer?.currencyCode ?? 'EUR'} required />
        <TextField label="Epígrafe IAE" name="epigrafeIAE" defaultValue={issuer?.epigrafeIAE ?? ''} required />
        <div className="field">
          <FieldLabel htmlFor="regimenIVA" required>Régimen de IVA</FieldLabel>
          <select id="regimenIVA" name="regimenIVA" defaultValue={issuer?.regimenIVA ?? 'REGIMEN_REDUCIDO_LIBROS_ES'} required>
            <option value="REGIMEN_REDUCIDO_LIBROS_ES">Régimen reducido para libros electrónicos en España</option>
          </select>
        </div>
      </fieldset>
      <fieldset><legend>OSS y series fiscales</legend>
        <TextField label="Ejercicio fiscal" name="ejercicio" type="number" defaultValue={String(new Date().getFullYear())} required />
        <TextField label="OSS vigente desde" name="ossVigenteDesde" type="date" defaultValue={issuer?.oss.vigenteDesde ?? defaultDate()} />
        <label className="checkbox-field"><input name="ossActivo" type="checkbox" defaultChecked={issuer?.oss.activo ?? false} /> Alta OSS activa</label>
        <p>Series: FS · factura simplificada, F · factura completa, FR · factura rectificativa.</p>
      </fieldset>
      <fieldset><legend>Perfil fiscal del producto</legend>
        <TextField label="SKU o selector" name="selector" defaultValue="ebook-*" required />
        <TextField label="Naturaleza del producto" name="naturalezaProducto" defaultValue="LIBRO_ELECTRONICO" required />
        <TextField label="Descripción en factura" name="descripcionFactura" defaultValue="Libro electrónico" required />
        <TextField label="Código de IVA" name="codigoIVA" defaultValue="ES_IVA_4" required />
        <TextField label="Tipo de IVA" name="tipoIVA" type="number" step="0.000001" defaultValue="0.04" required />
        <TextField label="Vigente desde" name="vigenteDesde" type="date" defaultValue={defaultDate()} required />
        <label className="checkbox-field"><input name="elegibleOSS" type="checkbox" defaultChecked /> Elegible para OSS</label>
        <label className="checkbox-field"><input name="requiereEnvio" type="checkbox" /> Requiere envío físico</label>
      </fieldset>
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  </section>;
}
