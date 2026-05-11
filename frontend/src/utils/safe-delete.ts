/**
 * Utility for safely deleting components with dependency validation.
 * Validates that removing a component doesn't break YAML references.
 */
import yaml from 'js-yaml';
import { generateYAML } from './yaml-generator';
import { AppConfig } from '@/types/dao-ai-types';
import { useNotificationStore } from '@/stores/notificationStore';
import { useConfigStore } from '@/stores/configStore';

/**
 * Validates that the config can be serialized to valid YAML.
 * Returns an error message if validation fails, null if successful.
 */
export function validateConfig(config: AppConfig): string | null {
  try {
    // Generate YAML from the config
    const yamlString = generateYAML(config);
    
    // Try to parse it back - this will catch undefined aliases
    yaml.load(yamlString);
    
    return null; // Valid
  } catch (error) {
    if (error instanceof Error) {
      // Extract meaningful error message
      const message = error.message;
      
      // Check for undefined alias errors
      const aliasMatch = message.match(/undefined alias "([^"]+)"/i);
      if (aliasMatch) {
        return `This component is referenced by "${aliasMatch[1]}". Remove that reference first.`;
      }
      
      return `Validation failed: ${message}`;
    }
    return 'Unknown validation error';
  }
}

/**
 * Validates a hypothetical config without actually changing anything.
 * Creates a deep copy, applies the deletion, and validates.
 */
export function validateDeletion(
  config: AppConfig,
  componentType: string,
  componentKey: string
): string | null {
  // Create a deep copy of the config
  const testConfig = JSON.parse(JSON.stringify(config)) as AppConfig;
  
  // Apply the deletion to the test config based on component type
  switch (componentType.toLowerCase()) {
    case 'tool':
      if (testConfig.tools) delete testConfig.tools[componentKey];
      break;
    case 'guardrail':
      if (testConfig.guardrails) delete testConfig.guardrails[componentKey];
      break;
    case 'schema':
      if (testConfig.schemas) delete testConfig.schemas[componentKey];
      break;
    case 'variable':
      if (testConfig.variables) delete testConfig.variables[componentKey];
      break;
    case 'agent':
      if (testConfig.agents) delete testConfig.agents[componentKey];
      break;
    case 'service principal':
      if (testConfig.service_principals) delete testConfig.service_principals[componentKey];
      break;
    case 'prompt':
      if (testConfig.prompts) delete testConfig.prompts[componentKey];
      break;
    case 'retriever':
      if (testConfig.retrievers) delete testConfig.retrievers[componentKey];
      break;
    case 'llm':
    case 'model':
      if (testConfig.resources?.models) delete testConfig.resources.models[componentKey];
      break;
    case 'genie room':
      if (testConfig.resources?.genie_rooms) delete testConfig.resources.genie_rooms[componentKey];
      break;
    case 'warehouse':
      if (testConfig.resources?.warehouses) delete testConfig.resources.warehouses[componentKey];
      break;
    case 'function':
      if (testConfig.resources?.functions) delete testConfig.resources.functions[componentKey];
      break;
    case 'connection':
      if (testConfig.resources?.connections) delete testConfig.resources.connections[componentKey];
      break;
    case 'database':
      if (testConfig.resources?.databases) delete testConfig.resources.databases[componentKey];
      break;
    case 'vector store':
      if (testConfig.resources?.vector_stores) delete testConfig.resources.vector_stores[componentKey];
      break;
    case 'middleware':
      if (testConfig.middleware) delete testConfig.middleware[componentKey];
      break;
    default:
      return null; // Unknown type, allow deletion
  }
  
  // Validate the test config
  return validateConfig(testConfig);
}

/**
 * Attempts to delete a component after validating that it won't break references.
 * If validation fails, shows an error notification and does NOT delete.
 * 
 * @param componentType - Type of component being deleted (for display)
 * @param componentKey - The key/name of the component
 * @param deleteAction - Function that performs the actual deletion
 * @returns true if deletion was successful, false if blocked
 */
export function safeDelete(
  componentType: string,
  componentKey: string,
  deleteAction: () => void
): boolean {
  const { addNotification } = useNotificationStore.getState();
  const config = useConfigStore.getState().config;
  
  // Validate BEFORE deleting
  const error = validateDeletion(config, componentType, componentKey);
  
  if (error) {
    // Validation failed - don't delete
    addNotification(
      'error',
      `Cannot delete ${componentType} "${componentKey}"`,
      error
    );
    return false;
  }
  
  try {
    // Validation passed - safe to delete
    deleteAction();
    
    // Deletion successful
    addNotification(
      'success',
      `${componentType} "${componentKey}" deleted`
    );
    return true;
    
  } catch (error) {
    addNotification(
      'error',
      `Failed to delete ${componentType} "${componentKey}"`,
      error instanceof Error ? error.message : 'Unknown error'
    );
    return false;
  }
}

/**
 * Simple notification helper for showing deletion errors.
 */
export function showDeletionError(componentType: string, componentKey: string, details: string) {
  const { addNotification } = useNotificationStore.getState();
  addNotification(
    'error',
    `Cannot delete ${componentType} "${componentKey}"`,
    details
  );
}

/**
 * Show success notification for deletion.
 */
export function showDeletionSuccess(componentType: string, componentKey: string) {
  const { addNotification } = useNotificationStore.getState();
  addNotification(
    'success',
    `${componentType} "${componentKey}" deleted`
  );
}

