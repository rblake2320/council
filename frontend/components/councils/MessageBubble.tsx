'use client';

import * as React from 'react';
import { cn, agentColor, formatTime, positionColor, positionLabel } from '@/lib/utils';
import type { AgentPosition, Message } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { CornerDownRight } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  replyToAgent?: string | null;
}

function positionBadgeVariant(pos: AgentPosition) {
  switch (pos) {
    case 'YES': return 'yes' as const;
    case 'NO': return 'no' as const;
    case 'CHANGED': return 'changed' as const;
    case 'ABSTAIN': return 'secondary' as const;
    default: return 'secondary' as const;
  }
}

export function MessageBubble({ message, replyToAgent }: MessageBubbleProps) {
  const isHuman = message.role === 'human';
  const isSystem = message.role === 'system';
  const agentName = message.agent_name ?? 'Agent';
  const nameColor = isHuman ? '#E8E8F0' : agentColor(agentName);
  const position = message.metadata?.position as AgentPosition | undefined;
  const isChanged = position === 'CHANGED';
  const prevPos = message.metadata?.previous_position as AgentPosition | undefined;

  // Flash animation on mount for CHANGED positions
  const [flash, setFlash] = React.useState(isChanged);
  React.useEffect(() => {
    if (isChanged) {
      const t = setTimeout(() => setFlash(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isChanged]);

  if (isSystem) {
    return (
      <div className="flex justify-center py-2 animate-fade-in">
        <span className="text-xs text-[#4A5070] px-3 py-1 rounded-full bg-[#111320] border border-[#1E2240]">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-1 animate-fade-in',
        flash && 'animate-flash-changed',
        isHuman && 'items-end',
      )}
    >
      {/* Reply indicator */}
      {replyToAgent && (
        <div className="flex items-center gap-1.5 ml-10 text-xs text-[#4A5070]">
          <CornerDownRight size={10} />
          <span>replying to </span>
          <span
            className="font-mono"
            style={{ color: agentColor(replyToAgent) }}
          >
            {replyToAgent}
          </span>
        </div>
      )}

      <div className={cn('flex items-start gap-2.5', isHuman && 'flex-row-reverse')}>
        {/* Avatar dot */}
        <div
          className="mt-1 h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-mono font-medium"
          style={{
            background: `${nameColor}22`,
            border: `1.5px solid ${nameColor}55`,
            color: nameColor,
          }}
        >
          {agentName.slice(0, 2).toUpperCase()}
        </div>

        {/* Bubble */}
        <div
          className={cn(
            'max-w-[80%] rounded-xl px-4 py-3',
            isHuman
              ? 'rounded-tr-sm bg-[rgba(124,107,242,0.12)] border border-[rgba(124,107,242,0.25)]'
              : 'rounded-tl-sm bg-[#111320] border border-[#1E2240]',
          )}
        >
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span
              className="font-mono text-xs font-medium"
              style={{ color: nameColor }}
            >
              {agentName}
            </span>

            {message.agent_role && (
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                {message.agent_role}
              </Badge>
            )}

            {isHuman && (
              <Badge variant="default" className="text-[10px] py-0 px-1.5">
                You
              </Badge>
            )}

            {position && (
              <Badge variant={positionBadgeVariant(position)} className="text-[10px] py-0 px-1.5 font-mono">
                {positionLabel(position)}
              </Badge>
            )}

            <span className="text-[10px] text-[#4A5070] ml-auto">
              {formatTime(message.created_at)}
            </span>
          </div>

          {/* Changed position inline callout */}
          {isChanged && prevPos && (
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded bg-[rgba(245,166,35,0.08)] border border-[rgba(245,166,35,0.2)]">
              <span style={{ color: positionColor(prevPos) }}>[WAS: {prevPos}]</span>
              <span className="text-[#4A5070]">→</span>
              <span style={{ color: 'var(--state-changed)' }}>[NOW: CHANGED]</span>
            </div>
          )}

          {/* Content */}
          <p className="text-sm text-[#E8E8F0] leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
      </div>
    </div>
  );
}
