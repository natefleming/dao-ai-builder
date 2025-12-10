import { ReactNode } from 'react';

interface ToggleOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface ToggleButtonGroupProps<T extends string> {
  options: ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

/**
 * A reusable toggle button group component for selecting between modes/options.
 * 
 * Example usage:
 * ```tsx
 * <ToggleButtonGroup
 *   options={[
 *     { value: 'variable', label: 'Variable' },
 *     { value: 'manual', label: 'Manual' },
 *   ]}
 *   value={mode}
 *   onChange={setMode}
 * />
 * ```
 */
export default function ToggleButtonGroup<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  fullWidth = false,
  className = '',
}: ToggleButtonGroupProps<T>) {
  const sizeClasses = size === 'sm' 
    ? 'px-4 py-1.5 text-xs' 
    : 'px-4 py-2 text-sm';
  
  return (
    <div className={`inline-flex rounded-lg bg-slate-900/50 p-1 ${fullWidth ? 'w-full' : ''} ${className}`}>
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`
              ${sizeClasses}
              ${fullWidth ? 'flex-1' : ''}
              rounded-md font-medium transition-all duration-150 ease-in-out
              flex items-center justify-center gap-1.5
              ${isSelected
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40 shadow-sm'
                : 'text-slate-400 border border-transparent hover:text-slate-300 hover:bg-slate-800/50'
              }
            `}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Pre-configured common toggle groups for reuse
export const VARIABLE_MANUAL_OPTIONS = [
  { value: 'variable' as const, label: 'Variable' },
  { value: 'manual' as const, label: 'Manual' },
];

export const CONFIGURED_SELECT_OPTIONS = [
  { value: 'configured' as const, label: 'Configured' },
  { value: 'select' as const, label: 'Select' },
];

export const REFERENCE_DIRECT_OPTIONS = [
  { value: 'reference' as const, label: 'Reference' },
  { value: 'direct' as const, label: 'Direct' },
];

export const EXISTING_NEW_OPTIONS = [
  { value: 'existing' as const, label: 'Existing' },
  { value: 'new' as const, label: 'New' },
];

