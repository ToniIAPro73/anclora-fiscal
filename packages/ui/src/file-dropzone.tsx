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
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) onFiles(event.target.files);
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
      onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      onClick={() => inputRef.current?.click()}
    >
      <p>Arrastra archivos aquí o pulsa para seleccionar</p>
      {hint ? <small>{hint}</small> : null}
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
