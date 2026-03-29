import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'default'
  | 'yes'
  | 'no'
  | 'changed'
  | 'thinking'
  | 'twin'
  | 'secondary'
  | 'outline'
  | 'success'
  | 'warning'
  | 'error';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[rgba(124,107,242,0.15)] text-[#7C6BF2] border border-[rgba(124,107,242,0.3)]',
  yes: 'bg-[rgba(34,211,135,0.12)] text-[#22D387] border border-[rgba(34,211,135,0.3)]',
  no: 'bg-[rgba(240,90,90,0.12)] text-[#F05A5A] border border-[rgba(240,90,90,0.3)]',
  changed: 'bg-[rgba(245,166,35,0.12)] text-[#F5A623] border border-[rgba(245,166,35,0.3)]',
  thinking: 'bg-[rgba(91,188,247,0.12)] text-[#5BBCF7] border border-[rgba(91,188,247,0.3)]',
  twin: 'bg-[rgba(167,139,250,0.12)] text-[#A78BFA] border border-[rgba(167,139,250,0.3)]',
  secondary: 'bg-[rgba(139,144,184,0.1)] text-[#8B90B8] border border-[rgba(139,144,184,0.2)]',
  outline: 'bg-transparent text-[#8B90B8] border border-[#1E2240]',
  success: 'bg-[rgba(34,211,135,0.12)] text-[#22D387] border border-[rgba(34,211,135,0.3)]',
  warning: 'bg-[rgba(245,166,35,0.12)] text-[#F5A623] border border-[rgba(245,166,35,0.3)]',
  error: 'bg-[rgba(240,90,90,0.12)] text-[#F05A5A] border border-[rgba(240,90,90,0.3)]',
};

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
