import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useConfigValidation } from '@/hooks/useValidation';
import { ValidationError } from '@/utils/schema-validator';

interface ValidationStatusProps {
  /** Show detailed error list */
  showDetails?: boolean;
  /** Compact display mode */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export default function ValidationStatus({ 
  showDetails = false, 
  compact = false,
  className = '' 
}: ValidationStatusProps) {
  const { isValid, errors, schemaError, isValidating, schemaReady } = useConfigValidation();

  if (!schemaReady) {
    return (
      <div className={`flex items-center space-x-2 text-slate-400 ${className}`}>
        <Loader2 className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} animate-spin`} />
        {!compact && <span className="text-xs">Loading schema...</span>}
      </div>
    );
  }

  if (isValidating) {
    return (
      <div className={`flex items-center space-x-2 text-slate-400 ${className}`}>
        <Loader2 className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} animate-spin`} />
        {!compact && <span className="text-xs">Validating...</span>}
      </div>
    );
  }

  if (schemaError) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center space-x-2 text-amber-400">
          <AlertCircle className={`${compact ? 'w-3 h-3' : 'w-4 h-4'}`} />
          {!compact && <span className="text-xs">Schema unavailable</span>}
        </div>
        {showDetails && (
          <p className="text-xs text-amber-500 mt-1">{schemaError}</p>
        )}
      </div>
    );
  }

  if (isValid === true) {
    return (
      <div className={`flex items-center space-x-2 text-emerald-400 ${className}`}>
        <CheckCircle className={`${compact ? 'w-3 h-3' : 'w-4 h-4'}`} />
        {!compact && <span className="text-xs">Configuration valid</span>}
      </div>
    );
  }

  if (isValid === false) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center space-x-2 text-red-400">
          <XCircle className={`${compact ? 'w-3 h-3' : 'w-4 h-4'}`} />
          {!compact && <span className="text-xs">{errors.length} validation error{errors.length !== 1 ? 's' : ''}</span>}
        </div>
        {showDetails && errors.length > 0 && (
          <ValidationErrorList errors={errors} className="mt-2" />
        )}
      </div>
    );
  }

  return null;
}

interface ValidationErrorListProps {
  errors: ValidationError[];
  className?: string;
  maxErrors?: number;
}

export function ValidationErrorList({ errors, className = '', maxErrors = 10 }: ValidationErrorListProps) {
  const displayErrors = errors.slice(0, maxErrors);
  const hasMore = errors.length > maxErrors;

  return (
    <div className={`space-y-1 ${className}`}>
      {displayErrors.map((error, i) => (
        <div key={i} className="text-xs flex items-start space-x-2 p-2 bg-red-950/30 rounded border border-red-900/30">
          <span className="text-red-400 font-mono shrink-0 mt-0.5">
            {error.path || '/'}
          </span>
          <span className="text-red-300">
            {error.message}
          </span>
        </div>
      ))}
      {hasMore && (
        <p className="text-xs text-red-400/70 pl-2">
          ...and {errors.length - maxErrors} more error{errors.length - maxErrors !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

/**
 * Inline validation indicator for form fields.
 */
interface FieldValidationProps {
  path: string;
  className?: string;
}

export function FieldValidation({ path, className = '' }: FieldValidationProps) {
  const { errors, isValid, schemaReady } = useConfigValidation();
  
  if (!schemaReady || isValid === null) return null;
  
  // Find errors for this path
  const fieldErrors = errors.filter(e => 
    e.path === path || 
    e.path.startsWith(`${path}/`) || 
    e.path.startsWith(`${path}[`)
  );
  
  if (fieldErrors.length === 0) return null;
  
  return (
    <div className={`text-xs text-red-400 mt-1 ${className}`}>
      {fieldErrors.map((err, i) => (
        <p key={i}>{err.message}</p>
      ))}
    </div>
  );
}

