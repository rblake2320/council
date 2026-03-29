'use client';

import * as React from 'react';
import { cn, agentColor, confidenceBorderColor, positionColor, positionLabel, roleColor } from '@/lib/utils';
import type { AgentPosition, AgentStatus } from '@/lib/types';
import { AgentAvatar } from './AgentAvatar';
import { Badge } from '@/components/ui/badge';

interface AgentCardProps {
  agentId: string;
  name: string;
  role: string;
  model: string;
  status: AgentStatus;
  currentPosition: AgentPosition;
  previousPosition?: AgentPosition;
  positionChangedAt?: number;
  messageCount: number;
  isSpeaking: boolean;
  isThinking: boolean;
  isTwin?: boolean;
  twinOf?: string;
  confidence?: number;
  className?: string;
  onClick?: () => void;
}

const THINKING_PHRASES = ['Reviewing positions...', 'Evaluating evidence...', 'Composing response...'];

function useThinkingPhrase(isThinking: boolean) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    if (!isThinking) return;
    const interval = setInterval(() => {
      setIdx((i) => (i + 1) % THINKING_PHRASES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [isThinking]);
  return THINKING_PHRASES[idx];
}

export function AgentCard({
  name,
  role,
  model,
  status,
  currentPosition,
  previousPosition,
  positionChangedAt,
  messageCount,
  isSpeaking,
  isThinking,
  isTwin = false,
  twinOf,
  confidence,
  className,
  onClick,
}: AgentCardProps) {
  const thinkingPhrase = useThinkingPhrase(isThinking);
  const color = agentColor(name);
  const rColor = roleColor(role);

  // Flash animation for position changes
  const [showFlash, setShowFlash] = React.useState(false);
  const prevChangedAt = React.useRef<number | undefined>(undefined);
  React.useEffect(() => {
    if (positionChangedAt && positionChangedAt !== prevChangedAt.current) {
      prevChangedAt.current = positionChangedAt;
      setShowFlash(true);
      const t = setTimeout(() => setShowFlash(false), 3000);
      return () => clearTimeout(t);
    }
  }, [positionChangedAt]);

  const borderStyle: React.CSSProperties = {
    borderColor: isSpeaking
      ? '#7C6BF2'
      : isThinking
      ? '#5BBCF7'
      : confidenceBorderColor(confidence),
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative rounded-lg border p-3 transition-all duration-200',
        'bg-[#0B0D14]',
        showFlash && 'animate-flash-changed',
        isSpeaking && 'animate-pulse-violet',
        isThinking && 'scan-line-container',
        onClick && 'cursor-pointer hover:bg-[#111320]',
        className,
      )}
      style={borderStyle}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <AgentAvatar name={name} size="sm" isTwin={isTwin} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="font-mono text-sm font-medium truncate"
              style={{ color }}
            >
              {name}
            </span>
            {isTwin && (
              <Badge variant="twin" className="text-[10px] py-0 px-1.5">
                Twin
              </Badge>
            )}
          </div>

          {/* Role */}
          <span
            className="text-xs mt-0.5 block"
            style={{ color: rColor.text }}
          >
            {role}
          </span>

          {/* Twin of */}
          {twinOf && (
            <span className="text-[10px] text-[#4A5070] mt-0.5 block">
              {twinOf}
            </span>
          )}

          {/* Model chip */}
          <span className="text-[10px] text-[#4A5070] mt-1 font-mono block truncate">
            {model}
          </span>
        </div>

        {/* Right side: position + msg count */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {currentPosition && (
            <span
              className="text-xs font-bold font-mono"
              style={{ color: positionColor(currentPosition) }}
            >
              {positionLabel(currentPosition)}
            </span>
          )}
          {messageCount > 0 && (
            <span className="text-[10px] text-[#4A5070]">{messageCount}m</span>
          )}
        </div>
      </div>

      {/* Position changed badge */}
      {currentPosition === 'CHANGED' && previousPosition && (
        <div className="mt-2 flex items-center gap-1 text-[10px] font-mono">
          <span style={{ color: positionColor(previousPosition) }}>
            {previousPosition}
          </span>
          <span className="text-[#4A5070]">→</span>
          <span style={{ color: positionColor(currentPosition) }}>CHANGED</span>
        </div>
      )}

      {/* Thinking indicator */}
      {isThinking && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5BBCF7] animate-blink shrink-0" />
          <span className="text-[10px] text-[#5BBCF7] truncate">{thinkingPhrase}</span>
        </div>
      )}

      {/* Speaking indicator */}
      {isSpeaking && !isThinking && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#7C6BF2] animate-pulse shrink-0" />
          <span className="text-[10px] text-[#7C6BF2]">Speaking</span>
        </div>
      )}
    </div>
  );
}
