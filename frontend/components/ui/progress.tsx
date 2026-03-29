import * as React from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps {
  value: number; // 0–100
  className?: string;
  color?: string;
  label?: string;
  showValue?: boolean;
}

export function Progress({ value, className, color, label, showValue }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center text-xs text-[#8B90B8]">
          {label && <span>{label}</span>}
          {showValue && <span>{Math.round(clamped)}%</span>}
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-[#1E2240] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${clamped}%`,
            background: color ?? 'var(--accent-primary)',
          }}
        />
      </div>
    </div>
  );
}
