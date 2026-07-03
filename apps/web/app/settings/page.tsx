import Link from 'next/link';
import { demoSpainConfig } from '@anclora/tax-engine';

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  FISCAL_OPERATOR: 'Operador fiscal',
  REVIEWER: 'Revisor',
  ADVISOR_READONLY: 'Solo-lectura/Asesoría',
};

const availableRoles = ['ADMIN', 'FISCAL_OPERATOR', 'REVIEWER', 'ADVISOR_READONLY'];

export default function SettingsPage() {
  return <main className="imports-page">
    <header className="imports-header">
      <div><span className="eyebrow">07 / DEMO_CONFIG</span><h1>Configuración</h1><p>DEMO_CONFIG — configuración de referencia, no editable en esta fase.</p></div>
      <Link href="/">Volver al centro de control</Link>
    </header>
    <section className="settings-config">
      <span className="section-index">Reglas fiscales versionadas ({demoSpainConfig.id})</span>
      <table>
        <thead><tr><th scope="col">Regla</th><th scope="col">Tipo</th><th scope="col">Naturaleza</th><th scope="col">País</th></tr></thead>
        <tbody>{demoSpainConfig.rates.map((rate) => <tr key={rate.id}><td>{rate.id}</td><td>{(rate.rate * 100).toFixed(0)} %</td><td>{rate.productNature}</td><td>{rate.customerCountry}</td></tr>)}</tbody>
      </table>
      <p>Versión {demoSpainConfig.version} · vigente desde {demoSpainConfig.effectiveFrom}</p>
      <span className="section-index">Roles disponibles (/api/v1/session)</span>
      <ul className="role-list">{availableRoles.map((role) => <li key={role}><strong>{roleLabels[role]}</strong><span> ({role})</span></li>)}</ul>
    </section>
  </main>;
}
