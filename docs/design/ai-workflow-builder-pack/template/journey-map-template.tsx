import React from 'react';

export type StepStatus = 'locked' | 'available' | 'current' | 'completed';

export type StepKey = 'identify' | 'map' | 'envision' | 'refine' | 'deploy';

export interface JourneyStep {
  id: number;
  key: StepKey;
  title: string;
  subtitle: string;
  status: StepStatus;
  accentClass: string;
}

export const steps: JourneyStep[] = [
  { id: 1, key: 'identify', title: 'Identify', subtitle: 'Define the problem worth solving.', status: 'available', accentClass: 'accent-identify' },
  { id: 2, key: 'map', title: 'Map', subtitle: 'Break the process into real steps.', status: 'locked', accentClass: 'accent-map' },
  { id: 3, key: 'envision', title: 'Envision', subtitle: 'Imagine the ideal version.', status: 'locked', accentClass: 'accent-envision' },
  { id: 4, key: 'refine', title: 'Refine', subtitle: 'Sharpen ideas into specifics.', status: 'locked', accentClass: 'accent-refine' },
  { id: 5, key: 'deploy', title: 'Deploy', subtitle: 'Turn it into action.', status: 'locked', accentClass: 'accent-deploy' },
];

export function JourneyMap() {
  return (
    <section className="journey-map">
      <header className="journey-header">
        <div className="eyebrow">AI WORKFLOW BUILDER</div>
        <h1>Turn Ideas Into Impact</h1>
        <p>A guided 5-step experience to help you design, refine, and deploy effective AI workflows for real work.</p>
      </header>

      <div className="journey-stage-grid">
        {steps.map((step) => (
          <StageCard key={step.id} step={step} />
        ))}
        <TimelinePath />
      </div>

      <StepStateProgression />
    </section>
  );
}

function StageCard({ step }: { step: JourneyStep }) {
  return (
    <article className={`stage-card ${step.status} ${step.accentClass}`}>
      <div className="step-num">{String(step.id).padStart(2, '0')}</div>
      <div className="icon-tile" aria-hidden="true" />
      {step.status === 'completed' && (
        <div className="completion-overlay" aria-hidden="true">
          <div className="completion-check">✓</div>
        </div>
      )}
      <div className="card-copy">
        <h3>{step.title}</h3>
        <p>{step.subtitle}</p>
      </div>
      <button className="card-arrow" aria-label={`Open ${step.title}`}>
        ›
      </button>
    </article>
  );
}

function TimelinePath() {
  return <div className="timeline-path" aria-hidden="true" />;
}

function StepStateProgression() {
  return (
    <div className="step-state-progression">
      <h2>Step State Progression</h2>
      <p>How a step changes throughout the workflow.</p>
      <div className="state-strip">
        <div className="state-demo locked">Locked</div>
        <div className="arrow">→</div>
        <div className="state-demo available">Available</div>
        <div className="arrow">→</div>
        <div className="state-demo current">Current</div>
        <div className="arrow">→</div>
        <div className="state-demo completed">Completed</div>
      </div>
    </div>
  );
}
