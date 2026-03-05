/**
 * Utility functions to check for dependencies between components.
 * Prevents deletion of components that are referenced by other components.
 */

import { AppConfig } from '@/types/dao-ai-types';

export interface DependencyInfo {
  type: string;       // e.g., "agent", "tool", "guardrail"
  name: string;       // The name/key of the dependent component
  field: string;      // Which field references the deleted component
}

/**
 * Check if a value contains a reference to the given key.
 * Handles __REF__ markers, * prefixes, and direct key matching.
 */
function valueContainsRef(value: unknown, refKey: string): boolean {
  if (typeof value === 'string') {
    // Check for __REF__ marker or * prefix
    if (value === `__REF__${refKey}` || value === `*${refKey}`) {
      return true;
    }
    // Also check for direct string match (for string references)
    if (value === refKey) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an object matches a configured resource by key.
 * This handles the case where YAML references are expanded to full objects.
 * 
 * IMPORTANT: We use deep equality comparison to avoid false positives
 * when multiple resources have the same `name` property (e.g., different LLMs
 * using the same model endpoint name like "databricks-claude-3-7-sonnet").
 */
function objectMatchesKey(obj: unknown, refKey: string, config: AppConfig, resourceType: string): boolean {
  if (!obj || typeof obj !== 'object') return false;
  
  // Get the configured resource to compare against
  let configuredResource: unknown = null;
  
  switch (resourceType) {
    case 'llm':
      configuredResource = config.resources?.llms?.[refKey];
      break;
    case 'schema':
      configuredResource = config.schemas?.[refKey];
      break;
    case 'genie_room':
      configuredResource = config.resources?.genie_rooms?.[refKey];
      break;
    case 'retriever':
      configuredResource = config.retrievers?.[refKey];
      break;
    case 'vector_store':
      configuredResource = config.resources?.vector_stores?.[refKey];
      break;
    case 'function':
      configuredResource = config.resources?.functions?.[refKey];
      break;
    case 'warehouse':
      configuredResource = config.resources?.warehouses?.[refKey];
      break;
    case 'connection':
      configuredResource = config.resources?.connections?.[refKey];
      break;
    case 'database':
      configuredResource = config.resources?.databases?.[refKey];
      break;
    case 'tool':
      configuredResource = config.tools?.[refKey];
      break;
    case 'guardrail':
      configuredResource = config.guardrails?.[refKey];
      break;
    case 'agent':
      configuredResource = config.agents?.[refKey];
      break;
    case 'prompt':
      configuredResource = config.prompts?.[refKey];
      break;
    case 'variable':
      configuredResource = config.variables?.[refKey];
      break;
    case 'service_principal':
      configuredResource = config.service_principals?.[refKey];
      break;
  }
  
  if (!configuredResource) return false;
  
  // Use deep equality comparison to avoid false positives
  // when multiple resources share the same `name` property
  try {
    return JSON.stringify(obj) === JSON.stringify(configuredResource);
  } catch {
    // Fall back to reference equality if JSON serialization fails
    return obj === configuredResource;
  }
}

/**
 * Recursively search an object for references to a key.
 */
function findRefsInObject(obj: unknown, refKey: string, path: string = ''): string[] {
  const refs: string[] = [];
  
  if (obj === null || obj === undefined) return refs;
  
  if (typeof obj === 'string') {
    if (valueContainsRef(obj, refKey)) {
      refs.push(path);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      refs.push(...findRefsInObject(item, refKey, `${path}[${index}]`));
    });
  } else if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      // Check if the key itself is a reference (e.g., in tools array for agents)
      if (typeof value === 'string' && valueContainsRef(value, refKey)) {
        refs.push(`${path}.${key}`);
      } else {
        refs.push(...findRefsInObject(value, refKey, `${path}.${key}`));
      }
    }
  }
  
  return refs;
}

/**
 * Find all components that depend on a given schema.
 */
export function findSchemaDependencies(config: AppConfig, schemaKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check resources
  if (config.resources) {
    // Tables
    if (config.resources.tables) {
      for (const [key, table] of Object.entries(config.resources.tables)) {
        if (valueContainsRef(table.schema, schemaKey) ||
            objectMatchesKey(table.schema, schemaKey, config, 'schema')) {
          deps.push({ type: 'table', name: key, field: 'schema' });
        }
      }
    }
    
    // Volumes
    if (config.resources.volumes) {
      for (const [key, volume] of Object.entries(config.resources.volumes)) {
        if (valueContainsRef(volume.schema, schemaKey) ||
            objectMatchesKey(volume.schema, schemaKey, config, 'schema')) {
          deps.push({ type: 'volume', name: key, field: 'schema' });
        }
      }
    }
    
    // Functions
    if (config.resources.functions) {
      for (const [key, func] of Object.entries(config.resources.functions)) {
        if (valueContainsRef(func.schema, schemaKey) ||
            objectMatchesKey(func.schema, schemaKey, config, 'schema')) {
          deps.push({ type: 'function', name: key, field: 'schema' });
        }
      }
    }
    
    // Vector Stores
    if (config.resources.vector_stores) {
      for (const [key, vs] of Object.entries(config.resources.vector_stores)) {
        const refs = findRefsInObject(vs, schemaKey, '');
        if (refs.length > 0) {
          deps.push({ type: 'vector_store', name: key, field: refs[0] });
          continue;
        }
        // Check source_table.schema and index.schema
        if (vs.source_table?.schema && objectMatchesKey(vs.source_table.schema, schemaKey, config, 'schema')) {
          deps.push({ type: 'vector_store', name: key, field: 'source_table.schema' });
        }
        if (vs.index?.schema && objectMatchesKey(vs.index.schema, schemaKey, config, 'schema')) {
          deps.push({ type: 'vector_store', name: key, field: 'index.schema' });
        }
      }
    }
  }
  
  // Check prompts
  if (config.prompts) {
    for (const [key, prompt] of Object.entries(config.prompts)) {
      if (valueContainsRef(prompt.schema, schemaKey) ||
          objectMatchesKey(prompt.schema, schemaKey, config, 'schema')) {
        deps.push({ type: 'prompt', name: key, field: 'schema' });
      }
    }
  }
  
  // Check app registered_model
  if (config.app?.registered_model) {
    if (valueContainsRef(config.app.registered_model.schema, schemaKey)) {
      deps.push({ type: 'app', name: 'registered_model', field: 'schema' });
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given LLM.
 */
export function findLlmDependencies(config: AppConfig, llmKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check agents
  if (config.agents) {
    for (const [key, agent] of Object.entries(config.agents)) {
      if (valueContainsRef(agent.model, llmKey) || 
          objectMatchesKey(agent.model, llmKey, config, 'llm')) {
        deps.push({ type: 'agent', name: key, field: 'model' });
      }
    }
  }
  
  // Check guardrails
  if (config.guardrails) {
    for (const [key, guardrail] of Object.entries(config.guardrails)) {
      if (valueContainsRef(guardrail.model, llmKey) || 
          objectMatchesKey(guardrail.model, llmKey, config, 'llm')) {
        deps.push({ type: 'guardrail', name: key, field: 'model' });
      }
    }
  }
  
  // Check memory embedding_model
  if (config.memory?.store) {
    if (valueContainsRef(config.memory.store.embedding_model, llmKey) ||
        objectMatchesKey(config.memory.store.embedding_model, llmKey, config, 'llm')) {
      deps.push({ type: 'memory', name: 'store', field: 'embedding_model' });
    }
  }
  
  // Check memory extraction models
  if (config.memory?.extraction?.extraction_model) {
    if (valueContainsRef(config.memory.extraction.extraction_model, llmKey) ||
        objectMatchesKey(config.memory.extraction.extraction_model, llmKey, config, 'llm')) {
      deps.push({ type: 'memory', name: 'extraction', field: 'extraction_model' });
    }
  }
  if (config.memory?.extraction?.query_model) {
    if (valueContainsRef(config.memory.extraction.query_model, llmKey) ||
        objectMatchesKey(config.memory.extraction.query_model, llmKey, config, 'llm')) {
      deps.push({ type: 'memory', name: 'extraction', field: 'query_model' });
    }
  }
  
  // Check orchestration
  if (config.app?.orchestration?.supervisor) {
    if (valueContainsRef(config.app.orchestration.supervisor.model, llmKey) ||
        objectMatchesKey(config.app.orchestration.supervisor.model, llmKey, config, 'llm')) {
      deps.push({ type: 'orchestration', name: 'supervisor', field: 'model' });
    }
  }
  
  // Check vector stores embedding_model
  if (config.resources?.vector_stores) {
    for (const [key, vs] of Object.entries(config.resources.vector_stores)) {
      if (valueContainsRef(vs.embedding_model, llmKey) ||
          objectMatchesKey(vs.embedding_model, llmKey, config, 'llm')) {
        deps.push({ type: 'vector_store', name: key, field: 'embedding_model' });
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given variable.
 */
export function findVariableDependencies(config: AppConfig, varKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check environment_vars
  if (config.app?.environment_vars) {
    for (const [key, value] of Object.entries(config.app.environment_vars)) {
      if (valueContainsRef(value, varKey)) {
        deps.push({ type: 'environment_var', name: key, field: 'value' });
      }
    }
  }
  
  // Check tools for partial_args
  if (config.tools) {
    for (const [key, tool] of Object.entries(config.tools)) {
      if (typeof tool.function === 'object' && tool.function !== null) {
        const refs = findRefsInObject(tool.function, varKey, '');
        if (refs.length > 0) {
          deps.push({ type: 'tool', name: key, field: refs[0] });
        }
      }
    }
  }
  
  // Check databases for credential references
  if (config.resources?.databases) {
    for (const [key, db] of Object.entries(config.resources.databases)) {
      const refs = findRefsInObject(db, varKey, '');
      if (refs.length > 0) {
        deps.push({ type: 'database', name: key, field: refs[0] });
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given retriever.
 */
export function findRetrieverDependencies(config: AppConfig, retrieverKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check tools (vector search tools reference retrievers)
  if (config.tools) {
    for (const [key, tool] of Object.entries(config.tools)) {
      if (typeof tool.function === 'object' && tool.function !== null) {
        const func = tool.function as { args?: Record<string, unknown> };
        // Check for string reference
        const refs = findRefsInObject(tool.function, retrieverKey, '');
        if (refs.length > 0) {
          deps.push({ type: 'tool', name: key, field: 'retriever' });
          continue;
        }
        // Check for object match in args.retriever
        if (func.args?.retriever && objectMatchesKey(func.args.retriever, retrieverKey, config, 'retriever')) {
          deps.push({ type: 'tool', name: key, field: 'retriever' });
        }
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given genie room.
 */
export function findGenieRoomDependencies(config: AppConfig, genieKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check tools (genie tools reference genie rooms)
  if (config.tools) {
    for (const [key, tool] of Object.entries(config.tools)) {
      if (typeof tool.function === 'object' && tool.function !== null) {
        const func = tool.function as { args?: Record<string, unknown> };
        // Check for string reference
        const refs = findRefsInObject(tool.function, genieKey, '');
        if (refs.length > 0) {
          deps.push({ type: 'tool', name: key, field: 'genie_room' });
          continue;
        }
        // Check for object match in args.genie_room
        if (func.args?.genie_room && objectMatchesKey(func.args.genie_room, genieKey, config, 'genie_room')) {
          deps.push({ type: 'tool', name: key, field: 'genie_room' });
        }
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given vector store.
 */
export function findVectorStoreDependencies(config: AppConfig, vsKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check retrievers
  if (config.retrievers) {
    for (const [key, retriever] of Object.entries(config.retrievers)) {
      if (valueContainsRef(retriever.vector_store, vsKey) ||
          objectMatchesKey(retriever.vector_store, vsKey, config, 'vector_store')) {
        deps.push({ type: 'retriever', name: key, field: 'vector_store' });
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given function.
 */
export function findFunctionDependencies(config: AppConfig, funcKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check tools (UC tools can reference functions via merge keys)
  if (config.tools) {
    for (const [key, tool] of Object.entries(config.tools)) {
      if (typeof tool.function === 'object' && tool.function !== null) {
        const func = tool.function as { __MERGE__?: string };
        if (func.__MERGE__ === funcKey) {
          deps.push({ type: 'tool', name: key, field: 'function (merge key)' });
        }
        // Also check for direct references
        const refs = findRefsInObject(tool.function, funcKey, '');
        if (refs.length > 0) {
          deps.push({ type: 'tool', name: key, field: refs[0] });
        }
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given tool.
 */
export function findToolDependencies(config: AppConfig, toolKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check agents
  if (config.agents) {
    for (const [key, agent] of Object.entries(config.agents)) {
      if (agent.tools && Array.isArray(agent.tools)) {
        for (const toolRef of agent.tools) {
          // toolRef can be a string reference or an expanded object
          const ref = toolRef as unknown;
          if (typeof ref === 'string') {
            if (valueContainsRef(ref, toolKey)) {
              deps.push({ type: 'agent', name: key, field: 'tools' });
              break;
            }
          } else if (typeof ref === 'object' && ref !== null) {
            // Check if the object matches by name or key
            if (objectMatchesKey(ref, toolKey, config, 'tool')) {
              deps.push({ type: 'agent', name: key, field: 'tools' });
              break;
            }
          }
        }
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given guardrail.
 */
export function findGuardrailDependencies(config: AppConfig, guardrailKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check agents
  if (config.agents) {
    for (const [key, agent] of Object.entries(config.agents)) {
      if (agent.guardrails && Array.isArray(agent.guardrails)) {
        for (const guardrailRef of agent.guardrails) {
          // guardrailRef can be a string reference or an expanded object
          const ref = guardrailRef as unknown;
          if (typeof ref === 'string') {
            if (valueContainsRef(ref, guardrailKey)) {
              deps.push({ type: 'agent', name: key, field: 'guardrails' });
              break;
            }
          } else if (typeof ref === 'object' && ref !== null) {
            if (objectMatchesKey(ref, guardrailKey, config, 'guardrail')) {
              deps.push({ type: 'agent', name: key, field: 'guardrails' });
              break;
            }
          }
        }
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given prompt.
 */
export function findPromptDependencies(config: AppConfig, promptKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check agents
  if (config.agents) {
    for (const [key, agent] of Object.entries(config.agents)) {
      if (valueContainsRef(agent.prompt, promptKey)) {
        deps.push({ type: 'agent', name: key, field: 'prompt' });
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given agent.
 */
export function findAgentDependencies(config: AppConfig, agentKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check app agents list
  if (config.app?.agents && Array.isArray(config.app.agents)) {
    for (const agentItem of config.app.agents) {
      // agentItem can be a string reference or an expanded object
      const ref = agentItem as unknown;
      if (typeof ref === 'string') {
        if (valueContainsRef(ref, agentKey)) {
          deps.push({ type: 'app', name: 'agents', field: 'agents list' });
          break;
        }
      } else if (typeof ref === 'object' && ref !== null) {
        if (objectMatchesKey(ref, agentKey, config, 'agent')) {
          deps.push({ type: 'app', name: 'agents', field: 'agents list' });
          break;
        }
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given database.
 */
export function findDatabaseDependencies(config: AppConfig, dbKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check memory checkpointer
  if (config.memory?.checkpointer) {
    if (valueContainsRef(config.memory.checkpointer.database, dbKey) ||
        objectMatchesKey(config.memory.checkpointer.database, dbKey, config, 'database')) {
      deps.push({ type: 'memory', name: 'checkpointer', field: 'database' });
    }
  }
  
  // Check memory store
  if (config.memory?.store) {
    if (valueContainsRef(config.memory.store.database, dbKey) ||
        objectMatchesKey(config.memory.store.database, dbKey, config, 'database')) {
      deps.push({ type: 'memory', name: 'store', field: 'database' });
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given service principal.
 */
export function findServicePrincipalDependencies(config: AppConfig, spKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check tools for partial_args
  if (config.tools) {
    for (const [key, tool] of Object.entries(config.tools)) {
      if (typeof tool.function === 'object' && tool.function !== null) {
        const refs = findRefsInObject(tool.function, spKey, '');
        if (refs.length > 0) {
          deps.push({ type: 'tool', name: key, field: refs[0] });
        }
      }
    }
  }
  
  // Check databases
  if (config.resources?.databases) {
    for (const [key, db] of Object.entries(config.resources.databases)) {
      const refs = findRefsInObject(db, spKey, '');
      if (refs.length > 0) {
        deps.push({ type: 'database', name: key, field: refs[0] });
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given connection.
 */
export function findConnectionDependencies(config: AppConfig, connKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check tools
  if (config.tools) {
    for (const [key, tool] of Object.entries(config.tools)) {
      if (typeof tool.function === 'object' && tool.function !== null) {
        const refs = findRefsInObject(tool.function, connKey, '');
        if (refs.length > 0) {
          deps.push({ type: 'tool', name: key, field: 'connection' });
        }
      }
    }
  }
  
  return deps;
}

/**
 * Find all components that depend on a given warehouse.
 */
export function findWarehouseDependencies(config: AppConfig, whKey: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  
  // Check tools (genie tools may reference warehouses)
  if (config.tools) {
    for (const [key, tool] of Object.entries(config.tools)) {
      if (typeof tool.function === 'object' && tool.function !== null) {
        const refs = findRefsInObject(tool.function, whKey, '');
        if (refs.length > 0) {
          deps.push({ type: 'tool', name: key, field: 'warehouse' });
        }
      }
    }
  }
  
  return deps;
}

/**
 * Format dependency info into a user-friendly message.
 */
export function formatDependencyMessage(deps: DependencyInfo[]): string {
  if (deps.length === 0) return '';
  
  const lines = deps.map(d => `• ${d.type}: "${d.name}" (${d.field})`);
  return `This component is referenced by:\n${lines.join('\n')}\n\nPlease remove these references before deleting.`;
}

