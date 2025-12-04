import { useState, useEffect, useCallback, useRef } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { validateConfig, ValidationResult, preloadSchema } from '@/utils/schema-validator';

/**
 * Hook to validate the current configuration against the dao-ai JSON schema.
 * Validates automatically when the config changes (debounced).
 */
export function useConfigValidation(debounceMs: number = 500) {
  const { config } = useConfigStore();
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [schemaReady, setSchemaReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preload schema on mount
  useEffect(() => {
    preloadSchema().then(() => {
      setSchemaReady(true);
    });
  }, []);

  // Validate when config changes (debounced)
  useEffect(() => {
    if (!schemaReady) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsValidating(true);
      try {
        const result = await validateConfig(config);
        setValidationResult(result);
      } catch (error) {
        setValidationResult({
          valid: false,
          errors: [],
          schemaError: error instanceof Error ? error.message : 'Validation failed',
        });
      } finally {
        setIsValidating(false);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [config, schemaReady, debounceMs]);

  // Manual validation trigger
  const validate = useCallback(async () => {
    setIsValidating(true);
    try {
      const result = await validateConfig(config);
      setValidationResult(result);
      return result;
    } catch (error) {
      const result: ValidationResult = {
        valid: false,
        errors: [],
        schemaError: error instanceof Error ? error.message : 'Validation failed',
      };
      setValidationResult(result);
      return result;
    } finally {
      setIsValidating(false);
    }
  }, [config]);

  return {
    validationResult,
    isValidating,
    schemaReady,
    validate,
    isValid: validationResult?.valid ?? null,
    errors: validationResult?.errors ?? [],
    schemaError: validationResult?.schemaError,
  };
}

/**
 * Get validation errors for a specific path in the config.
 */
export function getErrorsForPath(errors: ValidationResult['errors'], path: string): ValidationResult['errors'] {
  return errors.filter(error => {
    // Exact match or child path
    return error.path === path || error.path.startsWith(`${path}/`) || error.path.startsWith(`${path}[`);
  });
}

/**
 * Check if a path has any validation errors.
 */
export function hasErrorsAtPath(errors: ValidationResult['errors'], path: string): boolean {
  return getErrorsForPath(errors, path).length > 0;
}

