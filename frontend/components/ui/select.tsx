import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, className, id, onChange, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[#8B90B8]">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={cn(
            'h-9 w-full rounded-md px-3 text-sm appearance-none cursor-pointer',
            'bg-[#0B0D14] border border-[#1E2240]',
            'text-[#E8E8F0]',
            'transition-colors duration-150',
            'focus:outline-none focus:border-[#7C6BF2] focus:ring-1 focus:ring-[rgba(124,107,242,0.3)]',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            error && 'border-[#F05A5A]',
            className,
          )}
          {...props}
        >
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={opt.disabled}
              style={{ background: '#0B0D14', color: '#E8E8F0' }}
            >
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-[#F05A5A]">{error}</p>}
        {hint && !error && <p className="text-xs text-[#4A5070]">{hint}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';
