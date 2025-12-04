import yaml from 'js-yaml';
import { AppConfig, VariableModel, CompositeVariableModel, EnvironmentVariableModel, SecretVariableModel, PrimitiveVariableModel, DatabaseModel, OrchestrationModel, ToolFunctionModel, HumanInTheLoopModel } from '@/types/dao-ai-types';
import { getYamlReferences } from './yaml-references';

/**
 * Add YAML anchors (&anchor_name) to resource definitions.
 * This allows resources to be referenced later using aliases (*anchor_name).
 * 
 * Pattern: "  key_name:" becomes "  key_name: &key_name"
 * 
 * Only adds anchors to DIRECT children of each section, not nested keys.
 * Uses a two-pass approach to avoid state tracking issues with nested sections.
 */
function addYamlAnchors(yamlString: string): string {
  // Top-level sections where we want to add anchors to their direct children
  const topLevelAnchorSections = [
    'variables',
    'schemas', 
    'retrievers',
    'tools',
    'guardrails',
    'prompts',
    'agents',
  ];
  
  // Sections nested under 'resources:' that need anchors
  const resourceAnchorSections = [
    'llms',
    'vector_stores',
    'genie_rooms',
    'tables',
    'volumes',
    'functions',
    'warehouses',
    'connections',
    'databases',
  ];
  
  // Sections that should NOT have anchors
  const noAnchorSections = [
    'memory',
    'app',
  ];
  
  const lines = yamlString.split('\n');
  
  // First pass: Find all section boundaries
  interface SectionInfo {
    name: string;
    startLine: number;
    indent: number;
    childIndent: number;
    endLine: number;
  }
  
  const sections: SectionInfo[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionMatch = line.match(/^(\s*)(\w[\w_-]*):\s*$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[2];
      const sectionIndent = sectionMatch[1].length;
      
      // Check if this is a top-level anchor section
      if (sectionIndent === 0 && topLevelAnchorSections.includes(sectionName)) {
        sections.push({
          name: sectionName,
          startLine: i,
          indent: sectionIndent,
          childIndent: sectionIndent + 2,
          endLine: -1, // Will be set later
        });
      }
      // Check if this is 'resources:' section - we'll look for nested sections
      else if (sectionIndent === 0 && sectionName === 'resources') {
        // Look for nested resource sections
        for (let j = i + 1; j < lines.length; j++) {
          const nestedLine = lines[j];
          const nestedMatch = nestedLine.match(/^(\s*)(\w[\w_-]*):\s*$/);
          if (nestedMatch) {
            const nestedName = nestedMatch[2];
            const nestedIndent = nestedMatch[1].length;
            
            // If we hit another top-level section, stop
            if (nestedIndent === 0) break;
            
            // Check if this is a resource section at indent 2
            if (nestedIndent === 2 && resourceAnchorSections.includes(nestedName)) {
              sections.push({
                name: nestedName,
                startLine: j,
                indent: nestedIndent,
                childIndent: nestedIndent + 2,
                endLine: -1,
              });
            }
          }
        }
      }
    }
  }
  
  // Calculate end lines for each section
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    // Find where this section ends (next line at same or less indentation)
    for (let j = section.startLine + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      const lineIndent = line.search(/\S/);
      if (lineIndent !== -1 && lineIndent <= section.indent) {
        section.endLine = j;
        break;
      }
    }
    if (section.endLine === -1) {
      section.endLine = lines.length;
    }
  }
  
  // Second pass: Add anchors to direct children of each section
  for (const section of sections) {
    // Skip if this section is in noAnchorSections
    if (noAnchorSections.includes(section.name)) continue;
    
    for (let i = section.startLine + 1; i < section.endLine; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const lineIndent = line.search(/\S/);
      
      // Only process lines at exactly the child indent level
      if (lineIndent !== section.childIndent) continue;
      
      // Check if this line is a direct child key (ends with : and no value)
      const childKeyMatch = line.match(new RegExp(`^( {${section.childIndent}})(\\w[\\w_-]*):\\s*$`));
      if (childKeyMatch) {
        const indent = childKeyMatch[1];
        const keyName = childKeyMatch[2];
        
        // Add anchor if not already present
        if (!line.includes('&')) {
          lines[i] = `${indent}${keyName}: &${keyName}`;
        }
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Convert reference markers to YAML aliases.
 * Replaces "__REF__key_name" with "*key_name" (unquoted).
 * Replaces "__MERGE__: key_name" with "<<: *key_name" for YAML merge.
 * Handles both quoted and unquoted occurrences.
 */
function convertReferencesToAliases(yamlString: string): string {
  // Replace YAML merge markers (e.g., __MERGE__: "func_name") with <<: *func_name
  let result = yamlString.replace(/__MERGE__: "(\w+)"/g, '<<: *$1');
  result = result.replace(/__MERGE__: (\w+)/g, '<<: *$1');
  
  // Replace quoted reference markers with unquoted aliases
  result = result.replace(/"__REF__(\w+)"/g, '*$1');
  // Replace unquoted reference markers (e.g., in arrays: - __REF__name)
  result = result.replace(/- __REF__(\w+)/g, '- *$1');
  // Replace any remaining unquoted occurrences
  result = result.replace(/__REF__(\w+)/g, '*$1');
  return result;
}

/**
 * Create a reference marker for a resource that will be converted to a YAML alias.
 * Use this when you want to reference a previously defined resource.
 */
function createReference(refName: string): string {
  return `__REF__${refName}`;
}

/**
 * Check if a value was originally a reference in the imported YAML.
 * Returns the reference name if found, null otherwise.
 * 
 * Uses multiple strategies:
 * 1. Path-based matching using stored alias usage
 * 2. Value-based matching for known patterns
 * 
 * @param path - The YAML path to check (e.g., "tools.genie_tool.function.args.genie_room")
 * @param value - The resolved value to check
 */
function findOriginalReference(path: string, value: any): string | null {
  const refs = getYamlReferences();
  if (!refs) return null;
  
  // Normalize path for comparison
  const normalizedPath = path.toLowerCase().replace(/-/g, '_');
  const pathParts = path.split('.');
  const lastKey = pathParts[pathParts.length - 1] || '';
  const lastTwoKeys = pathParts.slice(-2).join('.');
  
  // Strategy 1: Exact path match in aliasUsage
  for (const [anchorName, usagePaths] of Object.entries(refs.aliasUsage)) {
    for (const usagePath of usagePaths) {
      const normalizedUsagePath = usagePath.toLowerCase().replace(/-/g, '_');
      
      // Exact match
      if (normalizedPath === normalizedUsagePath) {
        if (refs.anchorPaths[anchorName]) {
          return anchorName;
        }
      }
      
      // Path ends with alias path
      if (normalizedPath.endsWith('.' + normalizedUsagePath) || normalizedUsagePath.endsWith('.' + normalizedPath)) {
        if (refs.anchorPaths[anchorName]) {
          return anchorName;
        }
      }
      
      // Last key matches (e.g., both end with "schema")
      const aliasLastKey = usagePath.split('.').pop() || '';
      if (lastKey === aliasLastKey && lastKey !== '') {
        // Additional check: make sure the context is similar
        const aliasLastTwo = usagePath.split('.').slice(-2).join('.');
        if (lastTwoKeys.endsWith(aliasLastTwo) || aliasLastTwo.endsWith(lastTwoKeys)) {
          if (refs.anchorPaths[anchorName]) {
            return anchorName;
          }
        }
      }
    }
  }
  
  // Strategy 2: Check pathSuffixToAnchor for quick lookups
  if (refs.pathSuffixToAnchor) {
    const normalizedLastTwo = lastTwoKeys.toLowerCase().replace(/-/g, '_');
    for (const [suffix, anchorName] of Object.entries(refs.pathSuffixToAnchor)) {
      const normalizedSuffix = suffix.toLowerCase().replace(/-/g, '_');
      if (normalizedLastTwo === normalizedSuffix || normalizedLastTwo.endsWith('.' + normalizedSuffix)) {
        if (refs.anchorPaths[anchorName]) {
          return anchorName;
        }
      }
    }
  }
  
  // Strategy 3: Value-based matching for objects
  if (value && typeof value === 'object') {
    // For schema objects, try to match by catalog_name + schema_name
    if (value.catalog_name && value.schema_name) {
      for (const [anchorName, anchorPath] of Object.entries(refs.anchorPaths)) {
        if (anchorPath.includes('schema')) {
          // This might be a schema reference
          return anchorName;
        }
      }
    }
    
    // For objects with a name property, try to match
    const valueName = value.name || value.refName;
    if (valueName) {
      for (const [anchorName, anchorPath] of Object.entries(refs.anchorPaths)) {
        const anchorKey = anchorPath.split('.').pop() || '';
        if (anchorName === valueName || anchorKey === valueName) {
          return anchorName;
        }
      }
    }
  }
  
  return null;
}

/**
 * Recursively process an object and replace values with references where appropriate.
 * This is the main function for ensuring all references are preserved.
 * 
 * @param obj - The object to process
 * @param basePath - The base YAML path for this object
 * @param definedResources - Map of defined resources that can be referenced
 * @returns The processed object with references
 */
export function processObjectWithReferences(
  obj: any, 
  basePath: string, 
  definedResources: Record<string, Record<string, any>>
): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  
  // Check if this entire object should be a reference
  const objRef = findOriginalReference(basePath, obj);
  if (objRef) {
    return createReference(objRef);
  }
  
  // If it's an array, process each element
  if (Array.isArray(obj)) {
    return obj.map((item, idx) => processObjectWithReferences(item, `${basePath}.${idx}`, definedResources));
  }
  
  // Process each key in the object
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyPath = basePath ? `${basePath}.${key}` : key;
    
    // Check if this specific value should be a reference
    const valueRef = findOriginalReference(keyPath, value);
    if (valueRef) {
      result[key] = createReference(valueRef);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively process nested objects
      result[key] = processObjectWithReferences(value, keyPath, definedResources);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Format a model reference - either as a YAML alias if it matches a defined LLM,
 * or as an inline object if it's a custom definition.
 */
function formatModelReference(model: any, definedLLMs: Record<string, any>): any {
  if (typeof model === 'string') {
    // If it's a string, check if it's a defined LLM reference
    if (definedLLMs[model]) {
      return createReference(model);
    }
    return model;
  }
  
  if (model && typeof model === 'object' && model.name) {
    // Check if this model matches a defined LLM by checking if any LLM key's model name matches
    for (const [llmKey, llm] of Object.entries(definedLLMs)) {
      if ((llm as any).name === model.name) {
        return createReference(llmKey);
      }
    }
    
    // Not a reference, return the full model object
    return {
      name: model.name,
      ...(model.temperature !== undefined && { temperature: model.temperature }),
      ...(model.max_tokens !== undefined && { max_tokens: model.max_tokens }),
      ...(model.on_behalf_of_user !== undefined && { on_behalf_of_user: model.on_behalf_of_user }),
      ...(model.fallbacks && model.fallbacks.length > 0 && { fallbacks: model.fallbacks }),
    };
  }
  
  return model;
}

/**
 * Format a schema reference - either as a YAML alias if it matches a defined schema,
 * or as an inline object if it's a custom definition.
 * @param schema - The schema object
 * @param definedSchemas - Map of defined schemas
 * @param path - Optional YAML path for checking original references
 */
function formatSchemaReference(
  schema: { catalog_name: string; schema_name: string } | undefined, 
  definedSchemas: Record<string, any>,
  path?: string
): any {
  if (!schema) return undefined;
  
  // First, check if this was originally a reference in imported YAML
  if (path) {
    const originalRef = findOriginalReference(path, schema);
    if (originalRef) {
      return createReference(originalRef);
    }
  }
  
  // Check if this schema matches a defined schema
  for (const [schemaKey, s] of Object.entries(definedSchemas)) {
    if (s.catalog_name === schema.catalog_name && s.schema_name === schema.schema_name) {
      return createReference(schemaKey);
    }
  }
  
  // Not a reference, return the full schema object
  return {
    catalog_name: schema.catalog_name,
    schema_name: schema.schema_name,
  };
}

/**
 * Format a VolumePathModel - handles volume references, schema references, and inline definitions.
 * @param volumePath - The VolumePathModel object
 * @param definedVolumes - Map of defined volumes
 */
function formatVolumePath(
  volumePath: { volume?: any; path?: string } | undefined,
  definedVolumes: Record<string, any>
): any {
  if (!volumePath) return undefined;
  
  const result: any = {};
  
  if (volumePath.volume) {
    // Check if volume is a string reference (e.g., "*volume_ref")
    if (typeof volumePath.volume === 'string') {
      if (volumePath.volume.startsWith('*')) {
        // It's a reference - create reference marker
        result.volume = createReference(volumePath.volume.substring(1));
      } else {
        // Plain string - treat as reference name
        result.volume = createReference(volumePath.volume);
      }
    } else {
      // Volume is an object - check if it matches a defined volume
      let foundRef: string | undefined;
      for (const [volumeKey, v] of Object.entries(definedVolumes)) {
        if (v.name === volumePath.volume.name && 
            v.schema?.catalog_name === volumePath.volume.schema?.catalog_name &&
            v.schema?.schema_name === volumePath.volume.schema?.schema_name) {
          foundRef = volumeKey;
          break;
        }
      }
      
      if (foundRef) {
        result.volume = createReference(foundRef);
      } else {
        // Check if volume has a schema reference (_schemaRef) - use *ref format
        if (volumePath.volume._schemaRef) {
          result.volume = {
            schema: createReference(volumePath.volume._schemaRef),
            name: volumePath.volume.name,
          };
        } else {
          // Output inline volume definition with full schema
          result.volume = {
            ...(volumePath.volume.schema && {
              schema: {
                catalog_name: volumePath.volume.schema.catalog_name,
                schema_name: volumePath.volume.schema.schema_name,
              }
            }),
            name: volumePath.volume.name,
          };
        }
      }
    }
  }
  
  if (volumePath.path) {
    result.path = volumePath.path;
  }
  
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Format orchestration configuration for YAML output.
 * Handles swarm handoffs where null means "any agent" and [] means "no handoffs".
 */
function formatOrchestration(orchestration: OrchestrationModel, definedLLMs: Record<string, any>): any {
  const result: any = {};
  
  if (orchestration.supervisor) {
    result.supervisor = {
      model: formatModelReference(orchestration.supervisor.model, definedLLMs),
      ...(orchestration.supervisor.tools && orchestration.supervisor.tools.length > 0 && { 
        tools: orchestration.supervisor.tools 
      }),
      ...(orchestration.supervisor.prompt && { prompt: orchestration.supervisor.prompt }),
    };
  }
  
  if (orchestration.swarm) {
    result.swarm = {
      model: formatModelReference(orchestration.swarm.model, definedLLMs),
    };
    
    // Handle default_agent - can be string or AgentModel
    if (orchestration.swarm.default_agent) {
      const defaultAgent = orchestration.swarm.default_agent;
      if (typeof defaultAgent === 'string') {
        result.swarm.default_agent = defaultAgent;
      } else if ('name' in defaultAgent) {
        // Reference by name for YAML anchors
        result.swarm.default_agent = defaultAgent.name;
      }
    }
    
    // Handle handoffs - null means any, [] means none, array means specific
    if (orchestration.swarm.handoffs && Object.keys(orchestration.swarm.handoffs).length > 0) {
      result.swarm.handoffs = {};
      Object.entries(orchestration.swarm.handoffs).forEach(([agentName, targets]) => {
        if (targets === null || targets === undefined) {
          // null means can hand off to any agent - use YAML null (~)
          result.swarm.handoffs[agentName] = null;
        } else if (Array.isArray(targets)) {
          if (targets.length === 0) {
            // Empty array means no handoffs (terminal agent)
            result.swarm.handoffs[agentName] = [];
          } else {
            // Specific targets - convert AgentModel to string names
            result.swarm.handoffs[agentName] = targets.map(t => 
              typeof t === 'string' ? t : (t as any).name
            );
          }
        }
      });
    }
  }
  
  if (orchestration.memory) {
    result.memory = orchestration.memory;
  }
  
  return result;
}

/**
 * Format Human In The Loop configuration for YAML output.
 */
function formatHITL(hitl: HumanInTheLoopModel): any {
  return {
    review_prompt: hitl.review_prompt,
    ...(hitl.interrupt_config && { interrupt_config: hitl.interrupt_config }),
    ...(hitl.decline_message && { decline_message: hitl.decline_message }),
    ...(hitl.custom_actions && Object.keys(hitl.custom_actions).length > 0 && { 
      custom_actions: hitl.custom_actions 
    }),
  };
}

/**
 * Format a tool function for YAML output.
 * Handles all function types: python, factory, unity_catalog, mcp, and string references.
 * @param func - The tool function model
 * @param toolKey - Optional tool key for looking up original references
 */
function formatToolFunction(func: ToolFunctionModel, toolKey?: string): any {
  if (typeof func === 'string') {
    return func;
  }

  const result: any = {
    type: func.type,
  };

  // Add name only if not using YAML merge
  if (!('__MERGE__' in func)) {
    result.name = func.name;
  }

  // Add type-specific fields
  if (func.type === 'factory' && 'args' in func) {
    if (func.args && Object.keys(func.args).length > 0) {
      // Check each arg for original references
      const processedArgs: Record<string, any> = {};
      for (const [argKey, argValue] of Object.entries(func.args)) {
        // Check if this arg was originally a reference
        const argRef = toolKey ? findOriginalReference(`tools.${toolKey}.function.args.${argKey}`, argValue) : null;
        if (argRef) {
          processedArgs[argKey] = createReference(argRef);
        } else {
          processedArgs[argKey] = argValue;
        }
      }
      result.args = processedArgs;
    }
  }

  if (func.type === 'unity_catalog') {
    // If using YAML merge reference (<<: *func_ref)
    if ('__MERGE__' in func && (func as any).__MERGE__) {
      result.__MERGE__ = (func as any).__MERGE__;
    } else if ('schema' in func && func.schema) {
      // Inline schema and name
      result.schema = func.schema;
      result.name = func.name;
    }
    if ('partial_args' in func && func.partial_args) {
      result.partial_args = func.partial_args;
    }
  }

  if (func.type === 'mcp') {
    // MCP-specific fields
    if ('transport' in func && func.transport) result.transport = func.transport;
    if ('command' in func && func.command) result.command = func.command;
    if ('url' in func && func.url) result.url = func.url;
    if ('headers' in func && func.headers) result.headers = func.headers;
    if ('args' in func && func.args) result.args = func.args;
    if ('pat' in func && func.pat) result.pat = formatCredential(func.pat as string);
    if ('client_id' in func && func.client_id) result.client_id = formatCredential(func.client_id as string);
    if ('client_secret' in func && func.client_secret) result.client_secret = formatCredential(func.client_secret as string);
    if ('workspace_host' in func && func.workspace_host) result.workspace_host = formatCredential(func.workspace_host as string);
    if ('connection' in func && func.connection) {
      // Handle connection reference (string starting with *) or inline object
      const conn = func.connection as any;
      if (typeof conn === 'string' && conn.startsWith('*')) {
        result.connection = createReference(conn.slice(1));
      } else {
        result.connection = conn;
      }
    }
    if ('functions' in func && func.functions) result.functions = func.functions;
    
    // Check for original references for genie_room
    if ('genie_room' in func && func.genie_room) {
      const genieRef = toolKey ? findOriginalReference(`tools.${toolKey}.function.genie_room`, func.genie_room) : null;
      result.genie_room = genieRef ? createReference(genieRef) : func.genie_room;
    }
    
    if ('sql' in func && func.sql) result.sql = func.sql;
    
    // Check for original references for vector_search/retriever
    if ('vector_search' in func && func.vector_search) {
      const vsRef = toolKey ? findOriginalReference(`tools.${toolKey}.function.vector_search`, func.vector_search) : null;
      if (vsRef) {
        result.vector_search = createReference(vsRef);
      } else if ('retriever' in (func.vector_search as any)) {
        // Also check retriever reference
        const retrieverRef = toolKey ? findOriginalReference(`tools.${toolKey}.function.vector_search.retriever`, (func.vector_search as any).retriever) : null;
        result.vector_search = {
          ...(func.vector_search as any),
          retriever: retrieverRef ? createReference(retrieverRef) : (func.vector_search as any).retriever,
        };
      } else {
        result.vector_search = func.vector_search;
      }
    }
  }

  // Add Human In The Loop if present (applies to all types)
  if ('human_in_the_loop' in func && func.human_in_the_loop) {
    result.human_in_the_loop = formatHITL(func.human_in_the_loop);
  }

  return result;
}

/**
 * Format a DatabaseModel for YAML output.
 * This creates a properly structured database configuration.
 */
function formatDatabaseRef(database: DatabaseModel): any {
  const db: any = {
    name: database.name,
  };
  
  if (database.instance_name) db.instance_name = database.instance_name;
  if (database.description) db.description = database.description;
  if (database.capacity) db.capacity = database.capacity;
  if (database.max_pool_size) db.max_pool_size = database.max_pool_size;
  if (database.timeout_seconds) db.timeout_seconds = database.timeout_seconds;
  
  // OAuth credentials
  if (database.client_id) db.client_id = formatCredential(database.client_id);
  if (database.client_secret) db.client_secret = formatCredential(database.client_secret);
  if (database.workspace_host) db.workspace_host = formatCredential(database.workspace_host);
  
  // User credentials
  if (database.user) db.user = formatCredential(database.user);
  if (database.password) db.password = formatCredential(database.password);
  
  return db;
}

/**
 * Format a credential that might be a raw value, env variable, secret reference, or variable reference.
 */
function formatCredential(value: string): any {
  // Handle variable references (e.g., *client_id) - output as YAML alias
  if (value.startsWith('*')) {
    return createReference(value.slice(1));
  }
  if (value.startsWith('env:')) {
    return { env: value.slice(4) };
  }
  if (value.startsWith('secret:')) {
    const parts = value.slice(7).split('/');
    if (parts.length === 2) {
      return { scope: parts[0], secret: parts[1] };
    }
  }
  // Plain value - return as env variable reference
  if (value) {
    return { env: value };
  }
  return value;
}

/**
 * Convert internal VariableModel to YAML-compatible format.
 * Removes the 'type' field and formats according to dao-ai schema.
 */
function formatVariable(variable: VariableModel): any {
  switch (variable.type) {
    case 'primitive':
      return { value: (variable as PrimitiveVariableModel).value };
    case 'env':
      const envVar = variable as EnvironmentVariableModel;
      return {
        env: envVar.env,
        ...(envVar.default_value !== undefined && { default_value: envVar.default_value }),
      };
    case 'secret':
      const secretVar = variable as SecretVariableModel;
      return {
        scope: secretVar.scope,
        secret: secretVar.secret,
        ...(secretVar.default_value !== undefined && { default_value: secretVar.default_value }),
      };
    case 'composite':
      const compVar = variable as CompositeVariableModel;
      return {
        options: compVar.options.map((opt) => formatVariable(opt)),
        ...(compVar.default_value !== undefined && { default_value: compVar.default_value }),
      };
    default:
      return variable;
  }
}

export function generateYAML(config: AppConfig): string {
  const yamlConfig: any = {};
  
  // Define shared references for use throughout generation
  const definedSchemas = config.schemas || {};

  // Variables (at the top of the config)
  if (config.variables && Object.keys(config.variables).length > 0) {
    yamlConfig.variables = {};
    Object.entries(config.variables).forEach(([key, variable]) => {
      yamlConfig.variables[key] = formatVariable(variable as VariableModel);
    });
  }

  // Schemas
  if (config.schemas && Object.keys(config.schemas).length > 0) {
    yamlConfig.schemas = {};
    Object.entries(config.schemas).forEach(([key, schema]) => {
      yamlConfig.schemas[key] = {
        catalog_name: schema.catalog_name,
        schema_name: schema.schema_name,
        ...(schema.permissions && { permissions: schema.permissions }),
      };
    });
  }

  // Resources - only add if there's at least one resource configured
  const hasResources = config.resources && (
    (config.resources.llms && Object.keys(config.resources.llms).length > 0) ||
    (config.resources.vector_stores && Object.keys(config.resources.vector_stores).length > 0) ||
    (config.resources.genie_rooms && Object.keys(config.resources.genie_rooms).length > 0) ||
    (config.resources.tables && Object.keys(config.resources.tables).length > 0) ||
    (config.resources.volumes && Object.keys(config.resources.volumes).length > 0) ||
    (config.resources.functions && Object.keys(config.resources.functions).length > 0) ||
    (config.resources.warehouses && Object.keys(config.resources.warehouses).length > 0) ||
    (config.resources.connections && Object.keys(config.resources.connections).length > 0) ||
    (config.resources.databases && Object.keys(config.resources.databases).length > 0)
  );

  if (hasResources) {
    yamlConfig.resources = {};
    
    if (config.resources!.llms && Object.keys(config.resources!.llms).length > 0) {
      yamlConfig.resources.llms = {};
      Object.entries(config.resources!.llms).forEach(([key, llm]) => {
        // Format fallbacks - convert ref: prefixed values to YAML aliases
        let formattedFallbacks: string[] | undefined;
        if (llm.fallbacks && llm.fallbacks.length > 0) {
          formattedFallbacks = llm.fallbacks.map(f => {
            if (typeof f === 'string' && f.startsWith('ref:')) {
              // Reference to another configured LLM - use YAML alias
              return createReference(f.slice(4));
            }
            return typeof f === 'string' ? f : f.name;
          });
        }
        
        yamlConfig.resources.llms[key] = {
          name: llm.name,
          ...(llm.temperature !== undefined && { temperature: llm.temperature }),
          ...(llm.max_tokens !== undefined && { max_tokens: llm.max_tokens }),
          ...(llm.on_behalf_of_user !== undefined && { on_behalf_of_user: llm.on_behalf_of_user }),
          ...(formattedFallbacks && formattedFallbacks.length > 0 && { fallbacks: formattedFallbacks }),
        };
      });
    }

    if (config.resources!.vector_stores && Object.keys(config.resources!.vector_stores).length > 0) {
      const definedVolumes = config.resources!.volumes || {};
      yamlConfig.resources.vector_stores = {};
      Object.entries(config.resources!.vector_stores).forEach(([key, vs]) => {
        
        // Format source_table with schema reference
        let sourceTable: any = undefined;
        if (vs.source_table) {
          const sourceTableSchema = formatSchemaReference(
            vs.source_table.schema, 
            definedSchemas, 
            `resources.vector_stores.${key}.source_table.schema`
          );
          sourceTable = {
            ...(sourceTableSchema && { schema: sourceTableSchema }),
            ...(vs.source_table.name && { name: vs.source_table.name }),
          };
        }
        
        // Format index with schema reference
        let index: any = undefined;
        if (vs.index && vs.index.name) {
          const indexSchema = formatSchemaReference(
            vs.index.schema, 
            definedSchemas, 
            `resources.vector_stores.${key}.index.schema`
          );
          index = {
            ...(indexSchema && { schema: indexSchema }),
            name: vs.index.name,
          };
        }
        
        // Format embedding_model - check for original reference
        let embeddingModel: any = undefined;
        if (vs.embedding_model) {
          const embeddingRef = findOriginalReference(`resources.vector_stores.${key}.embedding_model`, vs.embedding_model);
          if (embeddingRef) {
            embeddingModel = createReference(embeddingRef);
          } else {
            embeddingModel = vs.embedding_model;
          }
        }
        
        yamlConfig.resources.vector_stores[key] = {
          // Required fields
          ...(sourceTable && { source_table: sourceTable }),
          embedding_source_column: vs.embedding_source_column,
          // Optional fields - only include if specified
          ...(embeddingModel && { embedding_model: embeddingModel }),
          ...(index && { index: index }),
          ...(vs.endpoint && vs.endpoint.name && { endpoint: vs.endpoint }),
          ...(vs.primary_key && { primary_key: vs.primary_key }),
          ...(vs.columns && vs.columns.length > 0 && { columns: vs.columns }),
          ...(vs.doc_uri && { doc_uri: vs.doc_uri }),
          ...(vs.source_path && { source_path: formatVolumePath(vs.source_path, definedVolumes) }),
          ...(vs.checkpoint_path && { checkpoint_path: formatVolumePath(vs.checkpoint_path, definedVolumes) }),
          ...(vs.on_behalf_of_user !== undefined && { on_behalf_of_user: vs.on_behalf_of_user }),
        };
      });
    }

    if (config.resources!.genie_rooms && Object.keys(config.resources!.genie_rooms).length > 0) {
      yamlConfig.resources.genie_rooms = {};
      Object.entries(config.resources!.genie_rooms).forEach(([key, room]) => {
        // Check if space_id is a variable reference (starts with *)
        let spaceIdValue: string = room.space_id;
        if (room.space_id.startsWith('*')) {
          // Convert to reference marker for proper YAML alias handling
          spaceIdValue = createReference(room.space_id.substring(1));
        }
        
        yamlConfig.resources.genie_rooms[key] = {
          name: room.name,
          space_id: spaceIdValue,
          ...(room.description && { description: room.description }),
          ...(room.on_behalf_of_user !== undefined && { on_behalf_of_user: room.on_behalf_of_user }),
        };
      });
    }

    if (config.resources!.tables && Object.keys(config.resources!.tables).length > 0) {
      yamlConfig.resources.tables = {};
      Object.entries(config.resources!.tables).forEach(([key, table]) => {
        const schemaRef = formatSchemaReference(table.schema, definedSchemas, `resources.tables.${key}.schema`);
        yamlConfig.resources.tables[key] = {
          ...(schemaRef && { schema: schemaRef }),
          ...(table.name && { name: table.name }),
          ...(table.on_behalf_of_user !== undefined && { on_behalf_of_user: table.on_behalf_of_user }),
        };
      });
    }

    if (config.resources!.volumes && Object.keys(config.resources!.volumes).length > 0) {
      yamlConfig.resources.volumes = {};
      Object.entries(config.resources!.volumes).forEach(([key, volume]) => {
        const schemaRef = formatSchemaReference(volume.schema, definedSchemas, `resources.volumes.${key}.schema`);
        yamlConfig.resources.volumes[key] = {
          name: volume.name,
          ...(schemaRef && { schema: schemaRef }),
          ...(volume.on_behalf_of_user !== undefined && { on_behalf_of_user: volume.on_behalf_of_user }),
        };
      });
    }

    if (config.resources!.functions && Object.keys(config.resources!.functions).length > 0) {
      yamlConfig.resources.functions = {};
      Object.entries(config.resources!.functions).forEach(([key, func]) => {
        const schemaRef = formatSchemaReference(func.schema, definedSchemas, `resources.functions.${key}.schema`);
        yamlConfig.resources.functions[key] = {
          ...(schemaRef && { schema: schemaRef }),
          ...(func.name && { name: func.name }),
          ...(func.on_behalf_of_user !== undefined && { on_behalf_of_user: func.on_behalf_of_user }),
        };
      });
    }

    if (config.resources!.warehouses && Object.keys(config.resources!.warehouses).length > 0) {
      yamlConfig.resources.warehouses = {};
      Object.entries(config.resources!.warehouses).forEach(([key, warehouse]) => {
        // Check if warehouse_id is a variable reference (starts with *)
        let warehouseIdValue: string = warehouse.warehouse_id;
        if (warehouse.warehouse_id.startsWith('*')) {
          warehouseIdValue = createReference(warehouse.warehouse_id.substring(1));
        }
        
        yamlConfig.resources.warehouses[key] = {
          name: warehouse.name,
          warehouse_id: warehouseIdValue,
          ...(warehouse.description && { description: warehouse.description }),
          ...(warehouse.on_behalf_of_user !== undefined && { on_behalf_of_user: warehouse.on_behalf_of_user }),
        };
      });
    }

    if (config.resources!.connections && Object.keys(config.resources!.connections).length > 0) {
      yamlConfig.resources.connections = {};
      Object.entries(config.resources!.connections).forEach(([key, connection]) => {
        yamlConfig.resources.connections[key] = {
          name: connection.name,
          ...(connection.on_behalf_of_user !== undefined && { on_behalf_of_user: connection.on_behalf_of_user }),
        };
      });
    }

    if (config.resources!.databases && Object.keys(config.resources!.databases).length > 0) {
      yamlConfig.resources.databases = {};
      Object.entries(config.resources!.databases).forEach(([key, database]) => {
        yamlConfig.resources.databases[key] = formatDatabaseRef(database);
      });
    }
  }

  // Retrievers
  if (config.retrievers && Object.keys(config.retrievers).length > 0) {
    yamlConfig.retrievers = {};
    Object.entries(config.retrievers).forEach(([key, retriever]) => {
      // First check if vector_store was originally a reference in imported YAML
      let vectorStoreRef: string | undefined;
      const originalVsRef = findOriginalReference(`retrievers.${key}.vector_store`, retriever.vector_store);
      if (originalVsRef) {
        vectorStoreRef = createReference(originalVsRef);
      } else {
        // Try to find a matching vector store reference by matching properties
        const vectorStores = config.resources?.vector_stores || {};
        const matchedVsKey = Object.entries(vectorStores).find(
          ([, vs]) => 
            vs.embedding_source_column === retriever.vector_store?.embedding_source_column &&
            vs.source_table?.name === retriever.vector_store?.source_table?.name
        )?.[0];
        
        if (matchedVsKey) {
          vectorStoreRef = createReference(matchedVsKey);
        }
      }
      
      const retrieverConfig: Record<string, any> = {
        vector_store: vectorStoreRef || retriever.vector_store,
      };
      
      if (retriever.columns && retriever.columns.length > 0) {
        retrieverConfig.columns = retriever.columns;
      }
      
      if (retriever.search_parameters) {
        retrieverConfig.search_parameters = {
          num_results: retriever.search_parameters.num_results || 10,
          filters: retriever.search_parameters.filters || {},
          query_type: retriever.search_parameters.query_type || 'ANN',
        };
      }
      
      if (retriever.rerank) {
        if (typeof retriever.rerank === 'boolean') {
          retrieverConfig.rerank = retriever.rerank;
        } else {
          retrieverConfig.rerank = {
            ...(retriever.rerank.model && { model: retriever.rerank.model }),
            ...(retriever.rerank.top_n !== undefined && { top_n: retriever.rerank.top_n }),
            ...(retriever.rerank.cache_dir && { cache_dir: retriever.rerank.cache_dir }),
            ...(retriever.rerank.columns && retriever.rerank.columns.length > 0 && { columns: retriever.rerank.columns }),
          };
        }
      }
      
      yamlConfig.retrievers[key] = retrieverConfig;
    });
  }

  // Tools
  if (config.tools && Object.keys(config.tools).length > 0) {
    yamlConfig.tools = {};
    Object.entries(config.tools).forEach(([key, tool]) => {
      yamlConfig.tools[key] = {
        name: tool.name,
        function: formatToolFunction(tool.function, key),
      };
    });
  }

  // Guardrails
  if (config.guardrails && Object.keys(config.guardrails).length > 0) {
    const definedLLMs = config.resources?.llms || {};
    yamlConfig.guardrails = {};
    Object.entries(config.guardrails).forEach(([key, guardrail]) => {
      yamlConfig.guardrails[key] = {
        name: guardrail.name,
        model: formatModelReference(guardrail.model, definedLLMs),
        prompt: guardrail.prompt,
        ...(guardrail.num_retries !== undefined && { num_retries: guardrail.num_retries }),
      };
    });
  }

  // Memory
  if (config.memory) {
    yamlConfig.memory = {};
    
    if (config.memory.checkpointer) {
      yamlConfig.memory.checkpointer = {
        name: config.memory.checkpointer.name,
        type: config.memory.checkpointer.type || 'memory',
        ...(config.memory.checkpointer.database && { database: formatDatabaseRef(config.memory.checkpointer.database) }),
      };
    }
    
    if (config.memory.store) {
      yamlConfig.memory.store = {
        name: config.memory.store.name,
        type: config.memory.store.type || 'memory',
        ...(config.memory.store.embedding_model && { embedding_model: config.memory.store.embedding_model }),
        ...(config.memory.store.dims && { dims: config.memory.store.dims }),
        ...(config.memory.store.database && { database: formatDatabaseRef(config.memory.store.database) }),
        ...(config.memory.store.namespace && { namespace: config.memory.store.namespace }),
      };
    }
  }

  // Prompts
  if (config.prompts && Object.keys(config.prompts).length > 0) {
    yamlConfig.prompts = {};
    Object.entries(config.prompts).forEach(([key, prompt]) => {
      yamlConfig.prompts[key] = {
        name: prompt.name,
        ...(prompt.schema && { schema: formatSchemaReference(prompt.schema, definedSchemas) }),
        ...(prompt.description && { description: prompt.description }),
        ...(prompt.default_template && { default_template: prompt.default_template }),
        ...(prompt.alias && { alias: prompt.alias }),
        ...(prompt.version !== undefined && { version: prompt.version }),
        ...(prompt.tags && Object.keys(prompt.tags).length > 0 && { tags: prompt.tags }),
      };
    });
  }

  // Agents
  if (config.agents && Object.keys(config.agents).length > 0) {
    const definedLLMs = config.resources?.llms || {};
    const definedPrompts = config.prompts || {};
    const definedTools = config.tools || {};
    const definedGuardrails = config.guardrails || {};
    yamlConfig.agents = {};
    Object.entries(config.agents).forEach(([key, agent]) => {
      // Format prompt - either inline string or reference to configured prompt
      let promptValue: any = agent.prompt;
      if (agent.prompt && typeof agent.prompt === 'object' && 'name' in agent.prompt) {
        // It's a PromptModel - check if it matches a configured prompt
        const promptModel = agent.prompt;
        const matchedPromptKey = Object.entries(definedPrompts).find(
          ([, p]) => p.name === promptModel.name
        )?.[0];
        if (matchedPromptKey) {
          promptValue = createReference(matchedPromptKey);
        }
      }
      
      // Format tools as references - tools should be referenced using *tool_name
      let toolsValue: string[] | undefined;
      if (agent.tools && agent.tools.length > 0) {
        toolsValue = agent.tools.map((tool, idx) => {
          // First check if this was originally a reference in imported YAML
          const originalRef = findOriginalReference(`agents.${key}.tools.${idx}`, tool);
          if (originalRef) {
            return createReference(originalRef);
          }
          
          // Tools are stored as ToolModel objects - find the key by matching the name
          const toolName = typeof tool === 'string' ? tool : tool.name;
          // Find the key in definedTools that matches this tool's name
          const matchedEntry = Object.entries(definedTools).find(
            ([, t]) => t.name === toolName
          );
          const toolKey = matchedEntry ? matchedEntry[0] : toolName;
          return createReference(toolKey);
        });
      }
      
      // Format guardrails as references - guardrails should be referenced using *guardrail_name
      let guardrailsValue: string[] | undefined;
      if (agent.guardrails && agent.guardrails.length > 0) {
        guardrailsValue = agent.guardrails.map((guardrail, idx) => {
          // First check if this was originally a reference in imported YAML
          const originalRef = findOriginalReference(`agents.${key}.guardrails.${idx}`, guardrail);
          if (originalRef) {
            return createReference(originalRef);
          }
          
          // Guardrails are stored as GuardrailModel objects - find the key by matching the name
          const guardrailName = typeof guardrail === 'string' ? guardrail : guardrail.name;
          // Find the key in definedGuardrails that matches this guardrail's name
          const matchedEntry = Object.entries(definedGuardrails).find(
            ([, g]) => g.name === guardrailName
          );
          const guardrailKey = matchedEntry ? matchedEntry[0] : guardrailName;
          return createReference(guardrailKey);
        });
      }
      
      yamlConfig.agents[key] = {
        name: agent.name,
        model: formatModelReference(agent.model, definedLLMs),
        ...(agent.description && { description: agent.description }),
        ...(toolsValue && toolsValue.length > 0 && { tools: toolsValue }),
        ...(guardrailsValue && guardrailsValue.length > 0 && { guardrails: guardrailsValue }),
        ...(promptValue && { prompt: promptValue }),
        ...(agent.handoff_prompt && { handoff_prompt: agent.handoff_prompt }),
      };
    });
  }

  // App configuration - only include if it has meaningful content
  if (config.app && config.app.name && config.app.registered_model?.name) {
    // Format app.agents as references to defined agents
    const definedAgents = config.agents || {};
    let appAgentsValue: string[] | undefined;
    if (config.app.agents && config.app.agents.length > 0) {
      appAgentsValue = config.app.agents.map((agent, idx) => {
        // First check if this was originally a reference in imported YAML
        const originalRef = findOriginalReference(`app.agents.${idx}`, agent);
        if (originalRef) {
          return createReference(originalRef);
        }
        
        // Find the agent key by matching the name
        const agentName = typeof agent === 'string' ? agent : agent.name;
        const matchedEntry = Object.entries(definedAgents).find(
          ([, a]) => a.name === agentName
        );
        const agentKey = matchedEntry ? matchedEntry[0] : agentName;
        return createReference(agentKey);
      });
    }
    
    // Format registered_model with schema reference
    let registeredModel: any = { name: config.app.registered_model.name };
    if (config.app.registered_model.schema) {
      const regModelSchema = formatSchemaReference(
        config.app.registered_model.schema,
        definedSchemas,
        'app.registered_model.schema'
      );
      if (regModelSchema) {
        registeredModel.schema = regModelSchema;
      }
    }
    
    yamlConfig.app = {
      name: config.app.name,
      registered_model: registeredModel,
      ...(config.app.description && { description: config.app.description }),
      ...(config.app.log_level && { log_level: config.app.log_level }),
      ...(config.app.endpoint_name && { endpoint_name: config.app.endpoint_name }),
      ...(config.app.tags && { tags: config.app.tags }),
      ...(config.app.permissions && { permissions: config.app.permissions }),
      ...(appAgentsValue && appAgentsValue.length > 0 && { agents: appAgentsValue }),
    };
    
    // Format orchestration separately to handle swarm handoffs properly
    if (config.app.orchestration) {
      const definedLLMs = config.resources?.llms || {};
      yamlConfig.app.orchestration = formatOrchestration(config.app.orchestration, definedLLMs);
    }
  }

  // Generate YAML string
  let yamlString = yaml.dump(yamlConfig, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  });

  // Add YAML anchors (&anchor_name) to resource definitions
  yamlString = addYamlAnchors(yamlString);
  
  // Convert reference markers to YAML aliases (*alias_name)
  yamlString = convertReferencesToAliases(yamlString);

  return yamlString;
}

export function downloadYAML(config: AppConfig, filename: string = 'model_config.yaml') {
  const yamlContent = generateYAML(config);
  const blob = new Blob([yamlContent], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

