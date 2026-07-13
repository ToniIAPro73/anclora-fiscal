"use client";
import { useEffect, useState } from "react";
import { Button, FieldLabel, StatusBadge } from "@anclora/ui";

type Readiness = {
  status: "RED" | "AMBER" | "GREEN" | "CLOSED";
  reasons: Array<{ code: string; action: string }>;
};
const steps = [
  "Importaciones",
  "Revisión",
  "Facturación y VERI*FACTU",
  "Dossier",
] as const;

export function MonthlyCloseWizard() {
  const [period, setPeriod] = useState("");
  const [step, setStep] = useState(0);
  const [readiness, setReadiness] = useState<Readiness>();
  const [message, setMessage] = useState("");
  const [canAct, setCanAct] = useState(false);
  useEffect(() => {
    fetch("/api/v1/session", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((session: { role?: string } | null) =>
        setCanAct(
          session?.role !== "ADVISOR_READONLY" && Boolean(session?.role),
        ),
      )
      .catch(() => undefined);
  }, []);
  async function refresh() {
    const response = await fetch(
      `/api/v1/periods/${encodeURIComponent(period)}/readiness`,
      { credentials: "include" },
    );
    if (response.ok) setReadiness((await response.json()) as Readiness);
  }
  async function execute(url: string, confirmation: string) {
    if (!window.confirm(confirmation)) return;
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
    });
    setMessage(
      response.ok ? "Acción completada" : "La acción no pudo completarse",
    );
    await refresh();
  }
  const blocked = readiness?.status === "RED";
  const actionsDisabled = blocked || !period || !canAct;
  return (
    <section className="evidence-panel monthly-close-wizard">
      <span className="section-index">Cierre de mes guiado</span>
      <h2>Cierre de mes guiado</h2>
      <div className="inline-lookup-form">
        <div className="field">
          <FieldLabel htmlFor="wizard-period" required>
            Periodo mensual
          </FieldLabel>
          <input
            id="wizard-period"
            placeholder="2026-06"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          />
        </div>
        <Button type="button" disabled={!period} onClick={() => void refresh()}>
          Iniciar revisión
        </Button>
      </div>
      <ol className="step-indicator wizard-steps" aria-label="Progreso del cierre">
        {steps.map((label, index) => {
          const isCurrent = index === step;
          const isDone = index < step;
          return (
            <li
              key={label}
              className={`step${isCurrent ? " step-current" : ""}${isDone ? " step-done" : ""}`}
            >
              <button
                type="button"
                className="btn btn-ghost"
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => setStep(index)}
              >
                {index + 1}. {label}
              </button>
            </li>
          );
        })}
      </ol>
      {readiness ? (
        <StatusBadge
          tone={
            blocked
              ? "blocking"
              : readiness.status === "AMBER"
                ? "warning"
                : "info"
          }
        >
          {readiness.status}
        </StatusBadge>
      ) : null}
      <div aria-live="polite" className="wizard-step-body">
        <h3>{steps[step]}</h3>
        {step === 0 ? (
          <p>
            Comprueba Shopify Orders, transacciones, ledger y KDP en
            Importaciones.
          </p>
        ) : null}
        {step === 1 ? (
          <>
            {readiness?.reasons.length ? (
              <ul>
                {readiness.reasons.map((reason) => (
                  <li key={reason.code}>{reason.action}</li>
                ))}
              </ul>
            ) : (
              <p className="workbench-notice">Sin incidencias pendientes.</p>
            )}
          </>
        ) : null}
        {step === 2 ? (
          <>
            <p>
              Previsualiza elegibles y emite de forma controlada. Los envíos los
              procesa exclusivamente la cola protegida.
            </p>
            <Button
              type="button"
              disabled={actionsDisabled}
              onClick={() =>
                void execute(
                  `/api/v1/periods/${encodeURIComponent(period)}/invoices/issue-eligible`,
                  "¿Emitir las facturas elegibles del periodo?",
                )
              }
            >
              Emitir elegibles
            </Button>
          </>
        ) : null}
        {step === 3 ? (
          <div className="dossier-actions">
            <Button
              type="button"
              disabled={actionsDisabled}
              onClick={() =>
                void execute(
                  `/api/v1/periods/${encodeURIComponent(period)}/close`,
                  "¿Cerrar fiscalmente este periodo?",
                )
              }
            >
              Cerrar periodo
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={actionsDisabled}
              onClick={() =>
                void execute(
                  `/api/v1/periods/${encodeURIComponent(period)}/vat-dossier`,
                  "¿Generar el expediente de IVA?",
                )
              }
            >
              Generar dossier
            </Button>
            <a
              className="btn btn-ghost"
              aria-disabled={!period}
              href={
                period
                  ? `/api/v1/periods/${encodeURIComponent(period)}/vat-dossier/archive`
                  : "#"
              }
            >
              Descargar dossier
            </a>
          </div>
        ) : null}
      </div>
      {message ? <p role="status">{message}</p> : null}
      <div className="reconciliation-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={step === 0}
          onClick={() => setStep((value) => value - 1)}
        >
          Anterior
        </Button>
        <Button
          type="button"
          disabled={step === steps.length - 1 || blocked || !readiness}
          onClick={() => setStep((value) => value + 1)}
        >
          Siguiente
        </Button>
      </div>
    </section>
  );
}
