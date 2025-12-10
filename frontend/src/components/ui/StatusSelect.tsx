import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type StatusType = 'ready' | 'transitioning' | 'stopped' | 'unknown';

export interface StatusSelectOption {
  value: string;
  label: string;
  status?: StatusType;
  group?: string;
  disabled?: boolean;
}

interface StatusSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: StatusSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const statusColors: Record<StatusType, string> = {
  ready: 'bg-green-500',
  transitioning: 'bg-yellow-500',
  stopped: 'bg-red-500',
  unknown: 'bg-slate-500',
};

export function StatusSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className = '',
}: StatusSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const selectedOption = options.find(opt => opt.value === value);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Close on escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = (optionValue: string) => {
    if (optionValue && !optionValue.startsWith('__header')) {
      onChange(optionValue);
      setIsOpen(false);
    }
  };

  // Group options
  const groupedOptions: { group: string; items: StatusSelectOption[] }[] = [];
  let currentGroup = '';
  
  options.forEach(opt => {
    if (opt.value.startsWith('__header')) {
      currentGroup = opt.label;
      groupedOptions.push({ group: currentGroup, items: [] });
    } else if (groupedOptions.length > 0) {
      groupedOptions[groupedOptions.length - 1].items.push(opt);
    } else {
      if (groupedOptions.length === 0) {
        groupedOptions.push({ group: '', items: [] });
      }
      groupedOptions[0].items.push(opt);
    }
  });

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between px-3 py-2
          bg-slate-800 border border-slate-700 rounded-lg
          text-left text-sm
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-600 cursor-pointer'}
          focus:outline-none focus:ring-2 focus:ring-blue-500
          transition-colors
        `}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.status && (
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[selectedOption.status]}`} />
          )}
          <span className={selectedOption ? 'text-white' : 'text-slate-400'}>
            {selectedOption?.label || placeholder}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-auto">
          {groupedOptions.map((group, groupIndex) => (
            <div key={groupIndex}>
              {group.group && (
                <div className="px-3 py-1.5 text-xs font-semibold text-slate-500 bg-slate-900/50 sticky top-0">
                  {group.group.replace(/^──\s*/, '').replace(/\s*──$/, '')}
                </div>
              )}
              {group.items.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  disabled={option.disabled}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                    ${option.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700/50 cursor-pointer'}
                    ${option.value === value ? 'bg-blue-500/20 text-blue-400' : 'text-slate-200'}
                    transition-colors
                  `}
                >
                  {option.status && (
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[option.status]}`} />
                  )}
                  <span className="truncate flex-1">{option.label}</span>
                  {option.value === value && (
                    <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}






