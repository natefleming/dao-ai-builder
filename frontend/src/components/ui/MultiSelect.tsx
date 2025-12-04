import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { clsx } from 'clsx';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label?: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  hint?: string;
}

export default function MultiSelect({ label, options, value, onChange, placeholder, hint }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const removeOption = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== optionValue));
  };

  const selectedLabels = value.map((v) => options.find((o) => o.value === v)?.label || v);

  return (
    <div className="space-y-1.5" ref={ref}>
      {label && (
        <label className="block text-sm font-medium text-slate-300">{label}</label>
      )}
      
      <div className="relative">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={clsx(
            'w-full min-h-[42px] px-3 py-2 bg-slate-800/50 border rounded-lg cursor-pointer',
            'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500',
            'transition-all duration-200 flex flex-wrap gap-1.5 items-center',
            isOpen ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-slate-700'
          )}
        >
          {value.length === 0 ? (
            <span className="text-slate-500">{placeholder || 'Select options...'}</span>
          ) : (
            selectedLabels.map((label, i) => (
              <span
                key={value[i]}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-sm"
              >
                {label}
                <X
                  className="w-3 h-3 cursor-pointer hover:text-blue-300"
                  onClick={(e) => removeOption(value[i], e)}
                />
              </span>
            ))
          )}
          <ChevronDown className={clsx(
            'w-4 h-4 text-slate-500 ml-auto transition-transform',
            isOpen && 'rotate-180'
          )} />
        </div>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">No options available</div>
            ) : (
              options.map((option) => (
                <div
                  key={option.value}
                  onClick={() => toggleOption(option.value)}
                  className={clsx(
                    'px-3 py-2 flex items-center justify-between cursor-pointer transition-colors',
                    value.includes(option.value)
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-slate-300 hover:bg-slate-700'
                  )}
                >
                  <span>{option.label}</span>
                  {value.includes(option.value) && <Check className="w-4 h-4" />}
                </div>
              ))
            )}
          </div>
        )}
      </div>
      
      {hint && (
        <p className="text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

