export interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return <ol className="step-indicator" aria-label="Progreso">
    {steps.map((step, index) => {
      const isCurrent = index === currentStep;
      const isDone = index < currentStep;
      return <li
        key={step}
        aria-current={isCurrent ? 'step' : undefined}
        className={`step${isCurrent ? ' step-current' : ''}${isDone ? ' step-done' : ''}`}
      >
        <span aria-hidden="true">{index + 1}</span>{step}
      </li>;
    })}
  </ol>;
}
