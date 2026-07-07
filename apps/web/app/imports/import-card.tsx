"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, FileDropzone, StatusBadge } from "@anclora/ui";
import { recordGroupLabel } from "../lib/display-labels";
import {
  isBlockingIssue,
  issueKey,
  statusLabel,
  type ConfirmResponse,
  type ConnectorId,
  type ImportIssue,
  type PreviewResponse,
  type RejectResponse,
} from "./types";

type Phase =
  | "idle"
  | "analyzing"
  | "preview"
  | "confirming"
  | "confirmed"
  | "rejecting"
  | "rejected"
  | "error";

const phaseAnnouncements: Record<Phase, string> = {
  idle: "",
  analyzing: "Detectando formato y analizando el archivo…",
  preview: "Vista previa lista para revisar.",
  confirming: "Confirmando importación…",
  confirmed: "Importación confirmada.",
  rejecting: "Rechazando importación…",
  rejected: "Importación rechazada.",
  error: "Se produjo un error.",
};

export interface ImportCardProps {
  connectorId: ConnectorId;
  title: string;
  description: string;
  accept: string;
  fileFieldId: string;
  fileFieldLabel: string;
  hint: string;
  disabled?: boolean;
  disabledReason?: string;
  renderPreviewTable: (
    preview: PreviewResponse,
    issuesByPosition: Map<number, ImportIssue[]>,
  ) => ReactNode;
  nextStepsNote?: string;
}

export function ImportCard({
  connectorId,
  title,
  description,
  accept,
  fileFieldId,
  fileFieldLabel,
  hint,
  disabled = false,
  disabledReason,
  renderPreviewTable,
  nextStepsNote,
}: ImportCardProps) {
  const previewDialogRef = useRef<HTMLDialogElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<PreviewResponse>();
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse>();
  const [rejectResult, setRejectResult] = useState<RejectResponse>();
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const issuesByPosition = useMemo(() => {
    const map = new Map<number, ImportIssue[]>();

    for (const issue of preview?.issues ?? []) {
      map.set(issue.position, [...(map.get(issue.position) ?? []), issue]);
    }

    return map;
  }, [preview]);

  const blockingIssues = (preview?.issues ?? []).filter(isBlockingIssue);

  const unacknowledgedBlocking = blockingIssues.filter(
    (issue) => !acknowledged.has(issueKey(issue)),
  );

  const confirmDisabled =
    phase !== "preview" || unacknowledgedBlocking.length > 0;

  const busy =
    phase === "analyzing" || phase === "confirming" || phase === "rejecting";

  useEffect(() => {
    const dialog = previewDialogRef.current;

    if (!dialog) return;

    const shouldOpen =
      phase === "preview" && preview !== undefined && isPreviewOpen;

    if (shouldOpen) {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          // JSDOM no implementa showModal() completamente.
        }

        if (!dialog.open) {
          dialog.setAttribute("open", "");
        }
      }

      return;
    }

    if (dialog.open) {
      try {
        dialog.close();
      } catch {
        // JSDOM puede no implementar close().
      }

      if (dialog.open) {
        dialog.removeAttribute("open");
      }
    }
  }, [isPreviewOpen, phase, preview]);

  function openPreviewDialog() {
    setIsPreviewOpen(true);
  }

  function closePreviewDialog() {
    setIsPreviewOpen(false);
  }

  function resetImportFlow() {
    setPhase("idle");
    setPreview(undefined);
    setConfirmResult(undefined);
    setRejectResult(undefined);
    setError("");
    setAcknowledged(new Set());
    setIsPreviewOpen(false);
  }

  async function submit(formData: FormData) {
    formData.set("connectorId", connectorId);

    setPhase("analyzing");
    setError("");
    setPreview(undefined);
    setConfirmResult(undefined);
    setRejectResult(undefined);
    setAcknowledged(new Set());
    setIsPreviewOpen(false);

    try {
      const response = await fetch("/api/v1/imports/preview", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("El archivo no supera la validación estructural");
      }

      const data = (await response.json()) as PreviewResponse;

      setPreview(data);
      setPhase("preview");
      setIsPreviewOpen(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo procesar el archivo",
      );
      setPhase("error");
    }
  }

  function handleSubmitStart() {
    setPhase("analyzing");
    setError("");
    setPreview(undefined);
    setConfirmResult(undefined);
    setRejectResult(undefined);
    setAcknowledged(new Set());
    setIsPreviewOpen(false);
  }

  function toggleAcknowledge(issue: ImportIssue) {
    setAcknowledged((current) => {
      const next = new Set(current);
      const key = issueKey(issue);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  async function handleConfirm() {
    if (!preview) return;

    setPhase("confirming");
    setError("");

    try {
      const response = await fetch(`/api/v1/imports/${preview.jobId}/confirm`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acknowledgedIssueIds: [...acknowledged],
        }),
      });

      if (response.status === 422) {
        throw new Error("Quedan incidencias bloqueantes sin confirmar");
      }

      if (response.status === 409) {
        throw new Error("Esta importación ya fue confirmada o rechazada");
      }

      if (!response.ok) {
        throw new Error("No se pudo confirmar la importación");
      }

      const data = (await response.json()) as ConfirmResponse;

      setConfirmResult(data);
      setPhase("confirmed");
      setIsPreviewOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo confirmar la importación",
      );
      setPhase("preview");
      setIsPreviewOpen(true);
    }
  }

  async function handleReject() {
    if (!preview) return;

    setPhase("rejecting");
    setError("");

    try {
      const response = await fetch(`/api/v1/imports/${preview.jobId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (response.status === 409) {
        throw new Error("Esta importación ya fue confirmada o rechazada");
      }

      if (!response.ok) {
        throw new Error("No se pudo rechazar la importación");
      }

      const data = (await response.json()) as RejectResponse;

      setRejectResult(data);
      setPhase("rejected");
      setIsPreviewOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo rechazar la importación",
      );
      setPhase("preview");
      setIsPreviewOpen(true);
    }
  }

  async function handleRetry() {
    if (!preview) return;

    setPhase("analyzing");
    setError("");
    setIsPreviewOpen(false);

    try {
      const response = await fetch(`/api/v1/imports/${preview.jobId}/retry`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error("No se pudo reintentar el análisis");
      }

      const data = (await response.json()) as PreviewResponse;

      setPreview(data);
      setAcknowledged(new Set());
      setPhase("preview");
      setIsPreviewOpen(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo reintentar el análisis",
      );
      setPhase("preview");
      setIsPreviewOpen(true);
    }
  }

  return (
    <article className="import-card" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <p>{description}</p>

        {disabled ? <StatusBadge tone="info">Próximamente</StatusBadge> : null}
      </header>

      <p role="status" aria-live="polite" className="visually-hidden">
        {phaseAnnouncements[phase]}
      </p>

      {disabled ? (
        <p className="import-card-disabled-reason">
          {disabledReason ?? "Este conector aún no está disponible."}
        </p>
      ) : null}

      {!disabled &&
      (phase === "idle" || phase === "analyzing" || phase === "error") ? (
        <form
          action={submit}
          onSubmit={handleSubmitStart}
          className={`drop-panel${phase === "analyzing" ? " drop-panel-busy" : ""}`}
          aria-busy={phase === "analyzing"}
        >
          <FileDropzone
            label={fileFieldLabel}
            name={fileFieldId}
            accept={accept}
            required
            onFiles={() => undefined}
            hint={hint}
          />

          {error ? <p className="import-error">{error}</p> : null}

          <Button type="submit" disabled={busy}>
            {phase === "analyzing" ? "Analizando…" : "Generar vista previa"}
          </Button>
        </form>
      ) : null}

      {!disabled && phase === "preview" && preview && !isPreviewOpen ? (
        <section
          className="preview-pending-panel"
          aria-label={`Vista previa pendiente de ${title}`}
        >
          <StatusBadge tone={blockingIssues.length > 0 ? "warning" : "info"}>
            {statusLabel(preview.status)}
          </StatusBadge>

          <div>
            <strong>Vista previa pendiente de decisión</strong>
            <p>
              {preview.summary.records} registros analizados. Revisa el detalle
              antes de confirmar o rechazar la importación.
            </p>
          </div>

          {error ? <p className="import-error">{error}</p> : null}

          <div className="import-actions">
            <Button
              type="button"
              variant="primary"
              onClick={openPreviewDialog}
              disabled={busy}
            >
              Abrir vista previa
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={handleReject}
              disabled={busy}
            >
              Rechazar
            </Button>
          </div>
        </section>
      ) : null}

      {phase === "confirmed" && confirmResult ? (
        <section
          className="result-panel"
          aria-label="Resultado de la importación"
        >
          <StatusBadge tone="info">
            {statusLabel(confirmResult.status)}
          </StatusBadge>

          <ul>
            {Object.entries(confirmResult.createdRecordIds).map(
              ([kind, ids]) => (
                <li key={kind}>
                  {recordGroupLabel(kind)}: {ids.length} registro(s)
                </li>
              ),
            )}
          </ul>

          {nextStepsNote ? (
            <p className="next-steps-note">{nextStepsNote}</p>
          ) : null}

          <div className="import-actions">
            <Button type="button" variant="primary" onClick={resetImportFlow}>
              Nueva importación
            </Button>
          </div>
        </section>
      ) : null}

      {phase === "rejected" && rejectResult ? (
        <section
          className="result-panel"
          aria-label="Resultado de la importación"
        >
          <StatusBadge tone="warning">
            {statusLabel(rejectResult.status)}
          </StatusBadge>

          <p>
            Importación rechazada. El archivo original se conserva como
            evidencia.
          </p>

          <div className="import-actions">
            <Button type="button" variant="primary" onClick={resetImportFlow}>
              Nueva importación
            </Button>
          </div>
        </section>
      ) : null}

      {phase === "preview" && preview ? (
        <dialog
          ref={previewDialogRef}
          className="preview-dialog"
          aria-labelledby={`preview-title-${connectorId}`}
          onCancel={(event) => {
            event.preventDefault();
            closePreviewDialog();
          }}
          onClose={closePreviewDialog}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closePreviewDialog();
            }
          }}
        >
          <div className="preview-dialog-shell">
            <header className="preview-dialog-header">
              <div>
                <span className="eyebrow">Importación pendiente</span>

                <h2 id={`preview-title-${connectorId}`}>
                  Vista previa · {title}
                </h2>

                <p>
                  Revisa los datos antes de confirmar su persistencia fiscal.
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={closePreviewDialog}
              >
                Cerrar
              </Button>
            </header>

            <div className="preview-dialog-body">
              <section
                className="preview-panel"
                aria-label={`Vista previa de ${title}`}
              >
                <div className="preview-heading">
                  <StatusBadge
                    tone={blockingIssues.length > 0 ? "warning" : "info"}
                  >
                    {statusLabel(preview.status)}
                  </StatusBadge>

                  <strong>
                    {preview.summary.records}
                    <small> registros</small>
                  </strong>
                </div>

                {error ? <p className="import-error">{error}</p> : null}

                <div className="preview-table-scroll">
                  {renderPreviewTable(preview, issuesByPosition)}
                </div>

                {blockingIssues.length > 0 ? (
                  <fieldset className="issue-acknowledgements">
                    <legend>
                      Incidencias bloqueantes — confírmalas para poder importar
                    </legend>

                    {blockingIssues.map((issue) => {
                      const key = issueKey(issue);
                      const descriptionId = `issue-desc-${connectorId}-${key}`;

                      return (
                        <div key={key} className="issue-ack-row">
                          <input
                            type="checkbox"
                            id={`issue-ack-${connectorId}-${key}`}
                            checked={acknowledged.has(key)}
                            aria-describedby={descriptionId}
                            onChange={() => toggleAcknowledge(issue)}
                          />

                          <label htmlFor={`issue-ack-${connectorId}-${key}`}>
                            Fila {issue.position} — {issue.code}
                          </label>

                          <p id={descriptionId}>
                            {issue.message} {issue.suggestedAction}
                          </p>
                        </div>
                      );
                    })}
                  </fieldset>
                ) : null}
              </section>
            </div>

            <footer className="preview-dialog-footer">
              <Button
                type="button"
                variant="secondary"
                onClick={handleRetry}
                disabled={busy}
              >
                Reintentar análisis
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={handleReject}
                disabled={busy}
              >
                Rechazar
              </Button>

              <Button
                type="button"
                variant="primary"
                onClick={handleConfirm}
                disabled={confirmDisabled}
              >
                Confirmar importación
              </Button>
            </footer>
          </div>
        </dialog>
      ) : null}
    </article>
  );
}
