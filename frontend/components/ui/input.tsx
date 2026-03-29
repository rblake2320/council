import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[#8B90B8]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-9 w-full rounded-md px-3 text-sm',
            'bg-[#0B0D14] border border-[#1E2240]',
            'text-[#E8E8F0] placeholder:text-[#4A5070]',
            'transition-colors duration-150',
            'focus:outline-none focus:border-[#7C6BF2] focus:ring-1 focus:ring-[rgba(124,107,242,0.3)]',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            error && 'border-[#F05A5A] focus:border-[#F05A5A] focus:ring-[rgba(240,90,90,0.3)]',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-[#F05A5A]">{error}</p>}
        {hint && !error && <p className="text-xs text-[#4A5070]">{hint}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';
