'use client';

import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { useId, useRef, useState } from 'react';
import { FieldLabel } from './field-label';

export interface FileDropzoneProps {
  label: string;
  name?: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  onFiles: (files: FileList) => void;
  hint?: string;
}

export function FileDropzone({ label, name, accept, multiple, required, onFiles, hint }: FileDropzoneProps) {
  const id = useId();
  const selectedFilesId = `${id}-selected-files`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Array<{ name: string; size: number }>>([]);

  function syncInputFiles(files: FileList) {
    if (!inputRef.current || typeof DataTransfer === 'undefined') return;

    const transfer = new DataTransfer();
    for (const file of Array.from(files)) {
      transfer.items.add(file);
      if (!multiple) break;
    }

    inputRef.current.files = transfer.files;
  }

  function selectFiles(files: FileList, syncInput = false) {
    const normalizedFiles = Array.from(files).slice(0, multiple ? undefined : 1);

    setSelectedFiles(normalizedFiles.map((file) => ({ name: file.name, size: file.size })));
    if (syncInput) syncInputFiles(files);
    onFiles(files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (event.dataTransfer.files.length > 0) selectFiles(event.dataTransfer.files, true);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) selectFiles(event.target.files);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  return <div className="field">
    <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
    <div
      className={`file-dropzone${isDragOver ? ' file-dropzone-active' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Seleccionar ${label.toLocaleLowerCase('es')}`}
      aria-describedby={selectedFiles.length > 0 ? selectedFilesId : undefined}
      onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      onClick={() => inputRef.current?.click()}
    >
      <p>Arrastra archivos aquí o pulsa para seleccionar</p>
      {hint ? <small>{hint}</small> : null}
      {selectedFiles.length > 0 ? (
        <div className="file-dropzone-selection" id={selectedFilesId} aria-live="polite">
          <strong>{selectedFiles.length === 1 ? 'Archivo seleccionado' : 'Archivos seleccionados'}</strong>
          <ul>
            {selectedFiles.map((file) => (
              <li key={`${file.name}-${file.size}`}>
                <span>{file.name}</span>
                <small>{formatFileSize(file.size)}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        required={required}
        onChange={handleChange}
        className="file-dropzone-input"
      />
    </div>
  </div>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
