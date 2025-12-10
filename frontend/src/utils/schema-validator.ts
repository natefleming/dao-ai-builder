import { AppConfig } from '@/types/dao-ai-types';
import { generateYAML } from './yaml-generator';

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationError[];
  schemaError?: string;
}

/**
 * Validate the current configuration against the dao_ai.config.AppConfig pydantic schema.
 * This uses the backend endpoint which validates using the actual pydantic model.
 */
export async function validateConfig(config: AppConfig): Promise<ValidationResult> {
  try {
    // Generate YAML from config
    const yamlContent = generateYAML(config);
    
    // Validate via backend pydantic validation
    return await validateYAML(yamlContent);
  } catch (error) {
    return {
      valid: false,
      errors: [],
      schemaError: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Validate a YAML string against the dao_ai.config.AppConfig pydantic schema.
 * Uses the backend endpoint for validation.
 */
export async function validateYAML(yamlString: string): Promise<ValidationResult> {
  try {
    const response = await fetch('/api/validate/schema', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ yaml_content: yamlString }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      return {
        valid: false,
        errors: [],
        schemaError: errorData.error || `Validation request failed: ${response.status}`,
      };
    }
    
    const result = await response.json();
    
    return {
      valid: result.valid,
      errors: (result.errors || []).map((err: { path: string; message: string; type: string }) => ({
        path: err.path || '/',
        message: err.message || 'Unknown validation error',
        keyword: err.type || 'validation',
      })),
      warnings: (result.warnings || []).map((warn: { path: string; message: string; type: string }) => ({
        path: warn.path || '/',
        message: warn.message || 'Unknown warning',
        keyword: warn.type || 'warning',
      })),
    };
  } catch (error) {
    return {
      valid: false,
      errors: [],
      schemaError: error instanceof Error ? error.message : 'Validation request failed',
    };
  }
}

/**
 * Check if the schema is loaded and ready.
 * With backend validation, this is always true.
 */
export function isSchemaLoaded(): boolean {
  return true;
}

/**
 * Get any schema loading error.
 * With backend validation, this is always null.
 */
export function getSchemaLoadError(): string | null {
  return null;
}

/**
 * Preload the schema (call on app startup).
 * With backend validation, this is a no-op.
 */
export async function preloadSchema(): Promise<void> {
  // No-op - backend handles schema
}








