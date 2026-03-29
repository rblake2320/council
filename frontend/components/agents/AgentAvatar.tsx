import * as React from 'react';
import { cn } from '@/lib/utils';
import { agentColor, agentInitials } from '@/lib/utils';

interface AgentAvatarProps {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isTwin?: boolean;
  className?: string;
}

const sizeMap = {
  xs: { outer: 'h-6 w-6 text-[10px]', badge: 'h-3 w-3 text-[7px] -bottom-0.5 -right-0.5' },
  sm: { outer: 'h-8 w-8 text-xs', badge: 'h-3.5 w-3.5 text-[8px] -bottom-0.5 -right-0.5' },
  md: { outer: 'h-10 w-10 text-sm', badge: 'h-4 w-4 text-[9px] -bottom-1 -right-1' },
  lg: { outer: 'h-12 w-12 text-base', badge: 'h-5 w-5 text-[10px] -bottom-1 -right-1' },
};

export function AgentAvatar({ name, size = 'sm', isTwin = false, className }: AgentAvatarProps) {
  const color = agentColor(name);
  const initials = agentInitials(name);
  const { outer, badge } = sizeMap[size];

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-mono font-medium select-none',
          outer,
        )}
        style={{
          background: `${color}22`,
          border: `1.5px solid ${color}55`,
          color,
        }}
        title={name}
      >
        {initials}
      </div>
      {isTwin && (
        <span
          className={cn(
            'absolute rounded-full flex items-center justify-center font-bold',
            'bg-[rgba(167,139,250,0.9)] text-white border border-[#111320]',
            badge,
          )}
        >
          T
        </span>
      )}
    </div>
  );
}
