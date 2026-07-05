import { PageHeader } from '@anclora/ui';
import { AppShell } from '../components/app-shell';
import { FiscalConfigurationForm } from './fiscal-configuration-form';

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  FISCAL_OPERATOR: 'Operador fiscal',
  REVIEWER: 'Revisor',
  ADVISOR_READONLY: 'Solo-lectura/Asesoría',
};

const availableRoles = ['ADMIN', 'FISCAL_OPERATOR', 'REVIEWER', 'ADVISOR_READONLY'];

// This page previously rendered demoSpainConfig (the versioned tax rule
// set from @anclora/tax-engine) as if it were the tenant's real live fiscal
// configuration. There is no config API yet, so that was fabricated data
// presented as real — removed per the "no permitido" clause. The role list
// below is real (backed by /api/v1/session), so it stays.
export default function SettingsPage() {
  return <AppShell>
    <PageHeader
      eyebrow="07 / CONFIGURACIÓN"
      title="Configuración"
      description="Configura el emisor, la numeración, los perfiles fiscales y la política KDP del tenant."
      backHref="/"
    />
    <FiscalConfigurationForm />
    <section className="settings-config">
      <span className="section-index">Roles disponibles (/api/v1/session)</span>
      <ul className="role-list">{availableRoles.map((role) => <li key={role}><strong>{roleLabels[role]}</strong><span> ({role})</span></li>)}</ul>
    </section>
  </AppShell>;
}
