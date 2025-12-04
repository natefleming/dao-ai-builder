import { SelectHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, options, placeholder, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const hasNoOptions = options.length === 0;
    
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-slate-300">
            {label}
            {props.required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          {hasNoOptions ? (
            // Show a div styled like the select when no options are available
            <div
              className={clsx(
                'w-full px-3 py-2 bg-slate-800/50 border rounded-lg appearance-none',
                'transition-all duration-200',
                'border-slate-700 text-sm text-slate-500',
                className
              )}
            >
              No options available
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          ) : (
            <>
              <select
                ref={ref}
                id={selectId}
                className={clsx(
                  'w-full px-3 py-2 bg-slate-800/50 border rounded-lg text-slate-200 appearance-none',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500',
                  'transition-all duration-200 cursor-pointer',
                  error ? 'border-red-500/50' : 'border-slate-700',
                  className
                )}
                {...props}
              >
                {placeholder && (
                  <option value="" className="text-slate-500">{placeholder}</option>
                )}
                {options.map((option) => (
                  <option key={option.value} value={option.value} className="bg-slate-800">
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </>
          )}
        </div>
        {hint && !error && (
          <p className="text-xs text-slate-500">{hint}</p>
        )}
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;

