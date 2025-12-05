import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';
import { AppConfig } from '@/types/dao-ai-types';
import { generateYAML } from './yaml-generator';

// Singleton AJV instance
let ajvInstance: Ajv | null = null;
let schemaLoaded = false;
let schemaLoadError: string | null = null;

/**
 * Initialize the AJV validator with the dao-ai JSON schema.
 */
async function getValidator(): Promise<Ajv> {
  if (ajvInstance && schemaLoaded) {
    return ajvInstance;
  }

  ajvInstance = new Ajv({
    allErrors: true,
    verbose: true,
    strict: false, // Allow additional keywords
  });
  addFormats(ajvInstance);

  try {
    // Load the schema from the public folder
    const response = await fetch('/model_config_schema.json');
    if (!response.ok) {
      throw new Error(`Failed to load schema: ${response.statusText}`);
    }
    const schema = await response.json();
    
    // Compile the schema
    ajvInstance.addSchema(schema, 'dao-ai-config');
    schemaLoaded = true;
    schemaLoadError = null;
  } catch (error) {
    schemaLoadError = error instanceof Error ? error.message : 'Failed to load schema';
    throw new Error(schemaLoadError);
  }

  return ajvInstance;
}

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  schemaError?: string;
}

/**
 * Format AJV errors into a more readable format.
 */
function formatErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
  if (!errors) return [];

  return errors.map((err) => ({
    path: err.instancePath || '/',
    message: err.message || 'Unknown validation error',
    keyword: err.keyword,
    params: err.params,
  }));
}

/**
 * Convert the internal AppConfig to the format expected by the JSON schema.
 * This handles differences between the UI model and the YAML/JSON schema model.
 */
function convertToSchemaFormat(config: AppConfig): Record<string, unknown> {
  // Generate YAML and parse it back to get the schema-compatible format
  const yamlString = generateYAML(config);
  
  // Remove the schema comment before parsing
  const cleanYaml = yamlString
    .split('\n')
    .filter(line => !line.startsWith('#'))
    .join('\n');
  
  return yaml.load(cleanYaml) as Record<string, unknown>;
}

/**
 * Validate the current configuration against the dao-ai JSON schema.
 */
export async function validateConfig(config: AppConfig): Promise<ValidationResult> {
  try {
    const ajv = await getValidator();
    const schemaData = convertToSchemaFormat(config);
    
    const validate = ajv.getSchema('dao-ai-config');
    if (!validate) {
      return {
        valid: false,
        errors: [],
        schemaError: 'Schema not loaded',
      };
    }

    const valid = validate(schemaData);
    
    return {
      valid: !!valid,
      errors: formatErrors(validate.errors),
    };
  } catch (error) {
    return {
      valid: false,
      errors: [],
      schemaError: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Validate a YAML string against the dao-ai JSON schema.
 */
export async function validateYAML(yamlString: string): Promise<ValidationResult> {
  try {
    const ajv = await getValidator();
    
    // Parse the YAML
    const cleanYaml = yamlString
      .split('\n')
      .filter(line => !line.startsWith('#'))
      .join('\n');
    
    const data = yaml.load(cleanYaml) as Record<string, unknown>;
    
    const validate = ajv.getSchema('dao-ai-config');
    if (!validate) {
      return {
        valid: false,
        errors: [],
        schemaError: 'Schema not loaded',
      };
    }

    const valid = validate(data);
    
    return {
      valid: !!valid,
      errors: formatErrors(validate.errors),
    };
  } catch (error) {
    if (error instanceof yaml.YAMLException) {
      return {
        valid: false,
        errors: [{
          path: '/',
          message: `YAML parse error: ${error.message}`,
          keyword: 'yaml-parse',
        }],
      };
    }
    return {
      valid: false,
      errors: [],
      schemaError: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Check if the schema is loaded and ready.
 */
export function isSchemaLoaded(): boolean {
  return schemaLoaded;
}

/**
 * Get any schema loading error.
 */
export function getSchemaLoadError(): string | null {
  return schemaLoadError;
}

/**
 * Preload the schema (call on app startup).
 */
export async function preloadSchema(): Promise<void> {
  try {
    await getValidator();
  } catch {
    // Error is stored in schemaLoadError
  }
}





