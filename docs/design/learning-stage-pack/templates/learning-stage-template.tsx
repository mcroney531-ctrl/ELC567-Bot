import React from 'react';

export type StepStatus = 'locked' | 'available' | 'current' | 'completed';
export type StepKey = 'identify' | 'map' | 'envision' | 'refine' | 'deploy';

export interface LearningStep {
  id: number;
  key: StepKey;
  title: string;
  shortTitle: string;
  status: StepStatus;
  accentClass: string;
  icon: string;
}

export const learningSteps: LearningStep[] = [
  { id: 1, key: 'identify', shortTitle: 'Identify', title: 'Define the problem worth solving.', status: 'current', accentClass: 'accent-identify', icon: '🔎' },
  { id: 2, key: 'map', shortTitle: 'Map', title: 'Break the process into real steps.', status: 'locked', accentClass: 'accent-map', icon: '🧩' },
  { id: 3, key: 'envision', shortTitle: 'Envision', title: 'Imagine the ideal version.', status: 'locked', accentClass: 'accent-envision', icon: '💡' },
  { id: 4, key: 'refine', shortTitle: 'Refine', title: 'Sharpen ideas into specifics.', status: 'locked', accentClass: 'accent-refine', icon: '💬' },
  { id: 5, key: 'deploy', shortTitle: 'Deploy', title: 'Turn it into action.', status: 'locked', accentClass: 'accent-deploy', icon: '🚀' },
];

export function LearningStagePage() {
  const activeStep = learningSteps[0];

  return (
    <section className="learning-stage-page">
      <LearningStageTopBar steps={learningSteps} />
      <main className="learning-stage-body">
        <StageContextPanel step={activeStep} />
        <LessonWorkspace />
      </main>
    </section>
  );
}

function LearningStageTopBar({ steps }: { steps: LearningStep[] }) {
  return (
    <header className="learning-stage-topbar">
      <button className="back-button">← Back to Journey</button>
      <nav className="mini-node-strip" aria-label="Stage progression">
        {steps.map((step) => (
          <TopMiniNode key={step.id} step={step} />
        ))}
      </nav>
      <button className="resources-button">Resources</button>
    </header>
  );
}

function TopMiniNode({ step }: { step: LearningStep }) {
  return (
    <button className={`mini-node ${step.status} ${step.accentClass}`} aria-current={step.status === 'current' ? 'step' : undefined}>
      <span className="mini-node-icon" aria-hidden="true">
        {step.status === 'completed' ? '★' : step.icon}
      </span>
      <span className="mini-node-label">0{step.id} {step.shortTitle}</span>
    </button>
  );
}

function StageContextPanel({ step }: { step: LearningStep }) {
  return (
    <aside className="stage-context-panel">
      <div className="stage-kicker">Stage 1</div>
      <div className="stage-number">0{step.id}</div>
      <h1>{step.shortTitle}</h1>
      <p>{step.title}</p>
      <div className="stage-illustration" aria-hidden="true" />
      <div className="stage-meta">
        <span>Step 1 of 5</span>
        <p>“Clarity today. Impact tomorrow.”</p>
      </div>
    </aside>
  );
}

function LessonWorkspace() {
  return (
    <section className="lesson-workspace">
      <div className="lesson-eyebrow">Lesson 1</div>
      <h2>Let&apos;s find the right problem.</h2>
      <p className="lesson-intro">
        A clear, well-defined problem is the foundation for high-impact AI workflows.
      </p>

      <div className="prompt-card">
        <label htmlFor="problem">What problem do you want to solve?</label>
        <textarea id="problem" placeholder="Describe the problem in your own words..." rows={5} />
      </div>

      <div className="examples-row">
        <div className="example-card">Reduce manual work</div>
        <div className="example-card">Get better insights</div>
        <div className="example-card">Eliminate repetitive tasks</div>
      </div>

      <div className="info-strip">
        In this step, you&apos;ll define the problem, key stakeholders, and what success looks like.
      </div>

      <div className="workspace-actions">
        <button className="ghost-button">Save Draft</button>
        <button className="primary-button">Continue →</button>
      </div>
    </section>
  );
}
