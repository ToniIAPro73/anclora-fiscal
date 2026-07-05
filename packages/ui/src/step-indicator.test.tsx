import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepIndicator } from './step-indicator';

describe('StepIndicator', () => {
  it('marks the current step with aria-current', () => {
    render(<StepIndicator steps={['Subir', 'Revisar', 'Confirmar']} currentStep={1} />);
    const current = screen.getByText('Revisar').closest('li');
    expect(current).toHaveAttribute('aria-current', 'step');
  });

  it('does not mark other steps as current', () => {
    render(<StepIndicator steps={['Subir', 'Revisar', 'Confirmar']} currentStep={1} />);
    expect(screen.getByText('Subir').closest('li')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Confirmar').closest('li')).not.toHaveAttribute('aria-current');
  });
});
