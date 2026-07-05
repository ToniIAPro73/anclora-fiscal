import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileDropzone } from './file-dropzone';

describe('FileDropzone', () => {
  it('exposes a keyboard-operable dropzone with an accessible label', () => {
    render(<FileDropzone label="Archivos de evidencia" onFiles={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Seleccionar archivos de evidencia' })).toBeInTheDocument();
    expect(screen.getByLabelText('Archivos de evidencia', { selector: 'input' })).toBeInTheDocument();
  });

  it('shows a hint when provided', () => {
    render(<FileDropzone label="Archivos" onFiles={vi.fn()} hint="CSV o XLSX hasta 10MB" />);
    expect(screen.getByText('CSV o XLSX hasta 10MB')).toBeInTheDocument();
  });

  it('is focusable and activates the file picker on Enter', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<FileDropzone label="Archivos" onFiles={vi.fn()} />);
    const dropzone = screen.getByRole('button', { name: 'Seleccionar archivos' });
    dropzone.focus();
    expect(dropzone).toHaveFocus();
    dropzone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
