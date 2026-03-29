'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'default' | 'ghost' | 'destructive' | 'outline' | 'secondary';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  default: [
    'bg-[#7C6BF2] text-white border border-[#7C6BF2]',
    'hover:bg-[#9B8EF7] hover:border-[#9B8EF7]',
    'active:bg-[#6355D4]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[#8B90B8] border border-transparent',
    'hover:bg-[rgba(124,107,242,0.1)] hover:text-[#E8E8F0]',
    'active:bg-[rgba(124,107,242,0.2)]',
  ].join(' '),
  destructive: [
    'bg-[rgba(240,90,90,0.1)] text-[#F05A5A] border border-[rgba(240,90,90,0.3)]',
    'hover:bg-[rgba(240,90,90,0.2)] hover:border-[#F05A5A]',
    'active:bg-[rgba(240,90,90,0.3)]',
  ].join(' '),
  outline: [
    'bg-transparent text-[#E8E8F0] border border-[#1E2240]',
    'hover:border-[#7C6BF2] hover:text-[#7C6BF2]',
    'active:bg-[rgba(124,107,242,0.08)]',
  ].join(' '),
  secondary: [
    'bg-[#181B2E] text-[#E8E8F0] border border-[#1E2240]',
    'hover:bg-[#1E2240] hover:border-[#2A2F55]',
    'active:bg-[#252A48]',
  ].join(' '),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2.5',
  icon: 'h-9 w-9 p-0 justify-center',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', loading = false, className, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium rounded-md',
          'transition-all duration-150 cursor-pointer',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <span className="animate-spin h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent shrink-0" />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
