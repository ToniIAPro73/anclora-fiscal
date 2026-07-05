'use client';

import { useEffect, useRef } from 'react';
import { Button } from './button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return <dialog
    ref={dialogRef}
    className="confirm-dialog"
    aria-labelledby="confirm-dialog-title"
    aria-describedby="confirm-dialog-description"
    onCancel={(event) => { event.preventDefault(); onCancel(); }}
    onClose={onCancel}
  >
    <h2 id="confirm-dialog-title">{title}</h2>
    <p id="confirm-dialog-description">{description}</p>
    <div className="confirm-dialog-actions">
      <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
      <Button variant="primary" onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  </dialog>;
}
