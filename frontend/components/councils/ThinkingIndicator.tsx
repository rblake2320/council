'use client';

import * as React from 'react';

const PHASES = [
  'Reviewing prior positions...',
  'Evaluating evidence...',
  'Composing response...',
];

interface ThinkingIndicatorProps {
  agentName: string;
}

export function ThinkingIndicator({ agentName }: ThinkingIndicatorProps) {
  const [phase, setPhase] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % PHASES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-start gap-3 py-2 px-1 animate-fade-in">
      {/* Scan-line block */}
      <div
        className="scan-line-container rounded-md shrink-0"
        style={{
          width: 32,
          height: 32,
          background: 'var(--state-thinking-glow)',
          border: '1px solid rgba(91,188,247,0.2)',
        }}
      />
      <div className="flex flex-col gap-0.5 pt-1">
        <span
          className="text-xs font-mono font-medium"
          style={{ color: 'var(--state-thinking)' }}
        >
          {agentName}
        </span>
        <span
          className="text-xs animate-blink"
          style={{ color: 'var(--text-muted)' }}
        >
          {PHASES[phase]}
        </span>
      </div>
    </div>
  );
}
