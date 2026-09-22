import React from 'react';

export type StepStatus = 'locked' | 'available' | 'current' | 'completed';

type StepKey = 'identify' | 'map' | 'envision' | 'refine' | 'deploy';

interface Step {
  id: number;
  key: StepKey;
  title: string;
  status: StepStatus;
  icon: React.ReactNode;
  accentClass: string;
}

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  timestamp?: string;
}

const steps: Step[] = [
  { id: 1, key: 'identify', title: 'Identify', status: 'current', icon: '🔎', accentClass: 'accent-identify' },
  { id: 2, key: 'map', title: 'Map', status: 'locked', icon: '🧩', accentClass: 'accent-map' },
  { id: 3, key: 'envision', title: 'Envision', status: 'locked', icon: '💡', accentClass: 'accent-envision' },
  { id: 4, key: 'refine', title: 'Refine', status: 'locked', icon: '⚙', accentClass: 'accent-refine' },
  { id: 5, key: 'deploy', title: 'Deploy', status: 'locked', icon: '🚀', accentClass: 'accent-deploy' },
];

const messages: ChatMessage[] = [
  {
    id: 'm1',
    role: 'assistant',
    text: "Let's start with the big picture. What's the problem you want to solve? You can describe it in your own words.",
    timestamp: '9:14 AM',
  },
  {
    id: 'm2',
    role: 'user',
    text: 'I want to automate our weekly status reporting. Right now it takes too long and a lot of manual work.',
    timestamp: '9:16 AM',
  },
];

export function ChatStagePage() {
  return (
    <section className="chat-stage-page">
      <header className="chat-topbar">
        <button className="back-button">← Back to Journey</button>
        <nav className="mini-node-strip" aria-label="Stage progression">
          {steps.map((step) => <TopMiniNode key={step.id} step={step} />)}
        </nav>
        <button className="resources-button">Resources</button>
      </header>

      <div className="chat-stage-body">
        <aside className="context-rail">
          <div className="stage-kicker">Stage 01</div>
          <h1>Identify</h1>
          <p>Define the problem worth solving.</p>
          <div className="context-illustration" aria-hidden="true" />
          <div className="focus-card">
            <strong>Current focus</strong>
            <p>Get clear on the problem, goal, and who it impacts.</p>
          </div>
        </aside>

        <section className="coach-chat-panel">
          <div className="coach-header">
            <div>
              <strong>AI Workflow Coach</strong>
              <p>Your guide for turning ideas into real workflows.</p>
            </div>
            <span className="working-chip">Working on: Identify</span>
          </div>

          <div className="message-list">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            <div className="coaching-card coaching-card-specificity">
              <strong>Try making this more specific</strong>
              <p>Consider who needs the report, what information is included, and where the data comes from.</p>
            </div>
          </div>

          <form className="chat-composer">
            <button type="button" aria-label="Add context">+</button>
            <input aria-label="Message the AI Workflow Coach" placeholder="Message the AI Workflow Coach..." />
            <button type="submit" className="send-button" aria-label="Send message">→</button>
          </form>
        </section>
      </div>
    </section>
  );
}

function TopMiniNode({ step }: { step: Step }) {
  return (
    <button
      className={`mini-node ${step.status} ${step.accentClass}`}
      aria-current={step.status === 'current' ? 'step' : undefined}
    >
      <span className="mini-node-icon" aria-hidden="true">
        {step.status === 'completed' ? '★' : step.icon}
      </span>
      <span>{String(step.id).padStart(2, '0')} {step.title}</span>
    </button>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`message-row ${message.role}`}>
      {message.role === 'assistant' && <div className="assistant-avatar" aria-hidden="true">AI</div>}
      <div className="message-stack">
        {message.timestamp && <div className="message-meta">{message.timestamp}</div>}
        <div className="message-bubble">{message.text}</div>
      </div>
    </div>
  );
}
