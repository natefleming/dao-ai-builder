import { useState, ChangeEvent } from 'react';
import { Plus, Trash2, Wrench, RefreshCw, Database, MessageSquare, Search, Clock, Bot, Link2, UserCheck, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { ToolFunctionModel, McpFunctionModel, HumanInTheLoopModel, UnityCatalogFunctionModel } from '@/types/dao-ai-types';
import { CatalogSelect, SchemaSelect, GenieSpaceSelect, VectorSearchEndpointSelect, UCConnectionSelect } from '../ui/DatabricksSelect';
import { useFunctions, useVectorSearchIndexes } from '@/hooks/useDatabricks';
import { normalizeRefNameWhileTyping } from '@/utils/name-utils';
import { safeDelete } from '@/utils/safe-delete';
import { useYamlScrollStore } from '@/stores/yamlScrollStore';
import { getYamlReferences } from '@/utils/yaml-references';

// Resource source toggle type
type ResourceSource = 'configured' | 'select';

// Helper component for resource selection with toggle between configured and direct selection
interface ResourceSelectorProps {
  label: string;
  resourceType: string;
  configuredOptions: { value: string; label: string }[];
  configuredValue: string;
  onConfiguredChange: (value: string) => void;
  source: ResourceSource;
  onSourceChange: (source: ResourceSource) => void;
  children: React.ReactNode; // The direct selection component
  hint?: string;
}

function ResourceSelector({ 
  label, 
  resourceType, 
  configuredOptions, 
  configuredValue, 
  onConfiguredChange, 
  source, 
  onSourceChange, 
  children,
  hint 
}: ResourceSelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-300">{label}</label>
        <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
          <button
            type="button"
            onClick={() => onSourceChange('configured')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
              source === 'configured'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                : 'text-slate-400 border border-transparent hover:text-slate-300'
            }`}
          >
            Configured
          </button>
          <button
            type="button"
            onClick={() => onSourceChange('select')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
              source === 'select'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                : 'text-slate-400 border border-transparent hover:text-slate-300'
            }`}
          >
            Select
          </button>
        </div>
      </div>
      
      {source === 'configured' ? (
        <div className="space-y-1">
          <Select
            options={[
              { value: '', label: `Select configured ${resourceType}...` },
              ...configuredOptions
            ]}
            value={configuredValue}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => onConfiguredChange(e.target.value)}
          />
          {configuredOptions.length === 0 && (
            <p className="text-xs text-amber-400">
              No {resourceType}s configured. Add one in Resources section or switch to "Select".
            </p>
          )}
        </div>
      ) : (
        children
      )}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const TOOL_TYPES = [
  { value: 'factory', label: 'Factory Function' },
  { value: 'python', label: 'Python Function' },
  { value: 'unity_catalog', label: 'Unity Catalog Function' },
  { value: 'mcp', label: 'MCP Server' },
];

// Factory tools available in dao_ai.tools
const FACTORY_TOOLS = [
  { 
    value: 'dao_ai.tools.create_genie_tool', 
    label: 'Genie Tool',
    description: 'Query data using natural language via Databricks Genie',
    icon: MessageSquare,
  },
  { 
    value: 'dao_ai.tools.create_vector_search_tool', 
    label: 'Vector Search Tool',
    description: 'Semantic search over documents using vector embeddings',
    icon: Search,
  },
  { 
    value: 'dao_ai.tools.create_send_slack_message_tool', 
    label: 'Slack Message Tool',
    description: 'Send messages to Slack channels',
    icon: MessageSquare,
  },
  { 
    value: 'dao_ai.tools.create_agent_endpoint_tool', 
    label: 'Agent Endpoint Tool',
    description: 'Call another deployed agent endpoint',
    icon: Bot,
  },
  { 
    value: 'custom', 
    label: 'Custom Factory...',
    description: 'Specify a custom factory function path',
    icon: Wrench,
  },
];

// Python tools (decorated with @tool, used directly without factory args)
const PYTHON_TOOLS = [
  { 
    value: 'dao_ai.tools.current_time_tool', 
    label: 'Current Time Tool',
    description: 'Get the current date and time',
    icon: Clock,
  },
  { 
    value: 'dao_ai.tools.time_in_timezone_tool', 
    label: 'Time in Timezone Tool',
    description: 'Get time in a specific timezone',
    icon: Clock,
  },
  { 
    value: 'dao_ai.tools.search_tool', 
    label: 'Web Search Tool',
    description: 'Search the web using DuckDuckGo',
    icon: Search,
  },
  { 
    value: 'custom', 
    label: 'Custom Python Function...',
    description: 'Specify a custom Python function path',
    icon: Wrench,
  },
];

// Partial argument entry for Unity Catalog tools
type PartialArgSource = 'manual' | 'variable' | 'service_principal';
interface PartialArgEntry {
  id: string;
  name: string;
  source: PartialArgSource;
  value: string; // For manual: the value, for variable/sp: the ref name
}

// MCP tool source types
const MCP_SOURCE_TYPES = [
  { value: 'url', label: 'Direct URL', description: 'Connect to any MCP server via URL' },
  { value: 'genie', label: 'Genie Room', description: 'Databricks Genie MCP server' },
  { value: 'vector_search', label: 'Vector Search', description: 'Databricks Vector Search MCP server' },
  { value: 'functions', label: 'UC Functions', description: 'Unity Catalog Functions MCP server' },
  { value: 'sql', label: 'SQL (DBSQL)', description: 'Databricks SQL MCP server' },
  { value: 'connection', label: 'UC Connection', description: 'External MCP server via UC Connection' },
];

interface MCPFormData {
  sourceType: 'url' | 'genie' | 'vector_search' | 'functions' | 'sql' | 'connection';
  // URL source
  url: string;
  // Genie source
  genieSource: ResourceSource;
  genieRefName: string; // Reference to configured genie room
  genieSpaceId: string;
  genieName: string;
  genieDescription: string;
  // Vector Search source
  vectorStoreSource: ResourceSource;
  vectorStoreRefName: string; // Reference to configured vector store
  vectorEndpoint: string;
  vectorIndex: string;
  vectorCatalog: string;
  vectorSchema: string;
  // Functions source
  schemaSource: ResourceSource;
  schemaRefName: string; // Reference to configured schema
  functionsCatalog: string;
  functionsSchema: string;
  // Connection source
  connectionSource: ResourceSource;
  connectionRefName: string; // Reference to configured connection
  connectionName: string;
  // Warehouse (for SQL)
  warehouseSource: ResourceSource;
  warehouseRefName: string; // Reference to configured warehouse
  warehouseId: string;
  // Auth credentials (shared)
  useCredentials: boolean;
  credentialsMode: 'service_principal' | 'manual';  // Configured SP or manual credentials
  servicePrincipalRef: string;  // Reference to configured service principal
  // Client ID - variable or manual
  clientIdSource: 'variable' | 'manual';
  clientIdVar: string;
  clientIdManual: string;
  // Client Secret - variable or manual
  clientSecretSource: 'variable' | 'manual';
  clientSecretVar: string;
  clientSecretManual: string;
  // Workspace Host - variable or manual (optional)
  workspaceHostSource: 'variable' | 'manual';
  workspaceHostVar: string;
  workspaceHostManual: string;
}

const defaultMCPFormData: MCPFormData = {
  sourceType: 'url',
  url: '',
  genieSource: 'select',
  genieRefName: '',
  genieSpaceId: '',
  genieName: '',
  genieDescription: '',
  vectorStoreSource: 'select',
  vectorStoreRefName: '',
  vectorEndpoint: '',
  vectorIndex: '',
  vectorCatalog: '',
  vectorSchema: '',
  schemaSource: 'select',
  schemaRefName: '',
  functionsCatalog: '',
  functionsSchema: '',
  connectionSource: 'select',
  connectionRefName: '',
  connectionName: '',
  warehouseSource: 'select',
  warehouseRefName: '',
  warehouseId: '',
  useCredentials: true,
  credentialsMode: 'service_principal',  // Default to configured service principal
  servicePrincipalRef: '',
  clientIdSource: 'variable',
  clientIdVar: '',
  clientIdManual: '',
  clientSecretSource: 'variable',
  clientSecretVar: '',
  clientSecretManual: '',
  workspaceHostSource: 'variable',
  workspaceHostVar: '',
  workspaceHostManual: '',
};

interface HITLFormData {
  enabled: boolean;
  reviewPrompt: string;
  allowApprove: boolean;
  allowEdit: boolean;
  allowReject: boolean;
}

const defaultHITLFormData: HITLFormData = {
  enabled: false,
  reviewPrompt: 'Please review the tool call',
  allowApprove: true,
  allowEdit: true,
  allowReject: true,
};

// Helper function to generate a tool name from a function name
function generateToolName(functionName: string): string {
  // Extract the last part of the function name (after the last dot)
  const parts = functionName.split('.');
  let baseName = parts[parts.length - 1];
  
  // Remove common prefixes like 'create_' and suffixes like '_tool'
  baseName = baseName
    .replace(/^create_/, '')
    .replace(/_tool$/, '');
  
  // Normalize: lowercase, replace spaces/special chars with underscores
  const normalized = baseName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  
  // Append _tool suffix
  return normalized ? `${normalized}_tool` : '';
}

export default function ToolsSection() {
  const { config, addTool, updateTool, removeTool } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    refName: '', // YAML key (reference name) - independent of tool name
    name: '',    // Tool's internal name
    type: 'factory' as 'factory' | 'python' | 'unity_catalog' | 'mcp',
    functionName: '',
    customFunctionName: '',
    args: '{}',
    // For Genie tool - with resource source
    genieSource: 'configured' as ResourceSource, // Default to configured
    genieRefName: '', // Reference to configured genie room
    genieSpaceId: '',
    geniePersistConversation: true, // Default to true per factory function
    genieTruncateResults: false, // Default to false per factory function
    // Genie LRU Cache
    genieLruCacheEnabled: false,
    genieLruCacheCapacity: 1000,
    genieLruCacheTtl: 86400, // 1 day in seconds
    genieLruCacheTtlNeverExpires: false,
    genieLruCacheWarehouseSource: 'configured' as ResourceSource,
    genieLruCacheWarehouseRefName: '',
    genieLruCacheWarehouseId: '',
    // Genie Semantic Cache
    genieSemanticCacheEnabled: false,
    genieSemanticCacheTtl: 86400, // 1 day in seconds
    genieSemanticCacheTtlNeverExpires: false,
    genieSemanticCacheSimilarityThreshold: 0.85,
    genieSemanticCacheEmbeddingModelSource: 'configured' as ResourceSource,
    genieSemanticCacheEmbeddingModelRefName: '',
    genieSemanticCacheEmbeddingModelManual: 'databricks-gte-large-en',
    genieSemanticCacheTableName: 'genie_semantic_cache',
    genieSemanticCacheDatabaseSource: 'configured' as ResourceSource,
    genieSemanticCacheDatabaseRefName: '',
    genieSemanticCacheWarehouseSource: 'configured' as ResourceSource,
    genieSemanticCacheWarehouseRefName: '',
    genieSemanticCacheWarehouseId: '',
    // For Warehouse - with resource source
    warehouseSource: 'configured' as ResourceSource, // Default to configured
    warehouseRefName: '', // Reference to configured warehouse
    warehouseId: '',
    // For Vector Search tool - with retriever source
    retrieverSource: 'configured' as ResourceSource, // Default to configured
    retrieverRefName: '', // Reference to configured retriever
    vectorEndpoint: '',
    vectorIndex: '',
    // For Unity Catalog function - with resource source
    schemaSource: 'configured' as ResourceSource, // Default to configured
    schemaRefName: '', // Reference to configured schema
    ucCatalog: '',
    ucSchema: '',
    // For Function - with resource source
    functionSource: 'configured' as ResourceSource, // Default to configured
    functionRefName: '', // Reference to configured function
    ucFunction: '',
    // For Slack Message tool
    slackConnectionSource: 'configured' as ResourceSource,
    slackConnectionRefName: '',
    slackChannelId: '',
    slackChannelName: '',
    // For Agent Endpoint tool
    agentLlmSource: 'configured' as ResourceSource,
    agentLlmRefName: '',
    // For Vector Search tool - description is already handled via name
    vectorSearchDescription: '',
    // For Unity Catalog tool - partial args
    ucPartialArgs: [] as PartialArgEntry[],
  });
  
  const [mcpForm, setMcpForm] = useState<MCPFormData>(defaultMCPFormData);
  const [hitlForm, setHitlForm] = useState<HITLFormData>(defaultHITLFormData);
  const [showHitlConfig, setShowHitlConfig] = useState(false);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [refNameManuallyEdited, setRefNameManuallyEdited] = useState(false);

  // Get configured resources from store
  const configuredGenieRooms = config.resources?.genie_rooms || {};
  const configuredVectorStores = config.resources?.vector_stores || {};
  const configuredRetrievers = config.retrievers || {};
  const configuredSchemas = config.schemas || {};
  const configuredFunctions = config.resources?.functions || {};
  const configuredConnections = config.resources?.connections || {};
  const configuredLlms = config.resources?.llms || {};
  const configuredWarehouses = config.resources?.warehouses || {};
  const configuredDatabases = config.resources?.databases || {};

  // Helper functions to find configured resources by matching properties
  const findConfiguredGenieRoom = (genieRoom: { space_id?: string; name?: string }): string | null => {
    for (const [key, room] of Object.entries(configuredGenieRooms)) {
      if (genieRoom.space_id && room.space_id === genieRoom.space_id) return key;
      if (genieRoom.name && room.name === genieRoom.name) return key;
    }
    return null;
  };

  const findConfiguredRetriever = (retriever: { vector_store?: unknown }): string | null => {
    // Try to match by vector_store reference or properties
    for (const [key, ret] of Object.entries(configuredRetrievers)) {
      // Simple match by comparing the stringified objects or specific properties
      if (JSON.stringify(ret) === JSON.stringify(retriever)) return key;
    }
    return null;
  };

  const findConfiguredConnection = (connection: { name?: string }): string | null => {
    for (const [key, conn] of Object.entries(configuredConnections)) {
      if (connection.name && conn.name === connection.name) return key;
    }
    return null;
  };

  const findConfiguredLlm = (llm: { name?: string }): string | null => {
    for (const [key, l] of Object.entries(configuredLlms)) {
      if (llm.name && l.name === llm.name) return key;
    }
    return null;
  };

  const findConfiguredWarehouse = (warehouse: { warehouse_id?: string }): string | null => {
    for (const [key, wh] of Object.entries(configuredWarehouses)) {
      if (warehouse.warehouse_id && wh.warehouse_id === warehouse.warehouse_id) return key;
    }
    return null;
  };

  const findConfiguredDatabase = (database: { name?: string }): string | null => {
    for (const [key, db] of Object.entries(configuredDatabases)) {
      if (database.name && db.name === database.name) return key;
    }
    return null;
  };

  // Helper to find the original reference name for a path using YAML references
  const findOriginalReferenceForPath = (path: string): string | null => {
    const refs = getYamlReferences();
    if (!refs) return null;
    
    // Normalize path for comparison
    const normalizedPath = path.toLowerCase().replace(/-/g, '_');
    
    // Check aliasUsage to see if this path had a reference
    for (const [anchorName, usagePaths] of Object.entries(refs.aliasUsage)) {
      for (const usagePath of usagePaths) {
        const normalizedUsagePath = usagePath.toLowerCase().replace(/-/g, '_');
        // Check for exact match or suffix match
        if (normalizedPath === normalizedUsagePath || 
            normalizedPath.endsWith(normalizedUsagePath) ||
            normalizedUsagePath.endsWith(normalizedPath)) {
          return anchorName;
        }
      }
    }
    
    return null;
  };

  const findConfiguredFunction = (func: { name?: string; schema?: { catalog_name?: string; schema_name?: string } }): string | null => {
    for (const [key, f] of Object.entries(configuredFunctions)) {
      if (func.name && f.name === func.name) {
        // Also check schema match if both have schemas
        if (func.schema && f.schema) {
          const funcSchema = func.schema as { catalog_name?: string; schema_name?: string };
          const fSchema = f.schema as { catalog_name?: string; schema_name?: string };
          if (funcSchema.catalog_name === fSchema.catalog_name && funcSchema.schema_name === fSchema.schema_name) {
            return key;
          }
        } else {
          return key;
        }
      }
    }
    return null;
  };

  // Build options for configured resources
  const configuredGenieOptions = Object.entries(configuredGenieRooms).map(([key, room]) => ({
    value: key,
    label: `${key} (${room.name || room.space_id})`,
  }));
  const configuredVectorStoreOptions = Object.entries(configuredVectorStores).map(([key, vs]) => ({
    value: key,
    label: `${key} (${vs.embedding_source_column || key})`,
  }));
  const configuredRetrieverOptions = Object.entries(configuredRetrievers).map(([key, retriever]) => ({
    value: key,
    label: `${key} (${retriever.search_parameters?.num_results || 10} results)`,
  }));
  const configuredSchemaOptions = Object.entries(configuredSchemas).map(([key, schema]) => ({
    value: key,
    label: `${key} (${schema.catalog_name}.${schema.schema_name})`,
  }));
  const configuredFunctionOptions = Object.entries(configuredFunctions).map(([key, func]) => ({
    value: key,
    label: `${key} (${func.name})`,
  }));
  const configuredConnectionOptions = Object.entries(configuredConnections).map(([key, conn]) => ({
    value: key,
    label: `${key} (${conn.name})`,
  }));
  const configuredLlmOptions = Object.entries(configuredLlms).map(([key, llm]) => ({
    value: key,
    label: `${key} (${llm.name || key})`,
  }));
  const configuredWarehouseOptions = Object.entries(configuredWarehouses).map(([key, wh]) => ({
    value: key,
    label: `${key} (${wh.name || key})`,
  }));
  const configuredDatabaseOptions = Object.entries(configuredDatabases).map(([key, db]) => ({
    value: key,
    label: `${key} (${db.name || key})`,
  }));

  const tools = config.tools || {};
  const variables = config.variables || {};
  const servicePrincipals = config.service_principals || {};

  // Get available variable names for dropdowns
  const variableNames = Object.keys(variables);
  const servicePrincipalNames = Object.keys(servicePrincipals);

  // Options for variable and service principal selects
  const variableOptions = [
    { value: '', label: 'Select a variable...' },
    ...variableNames.map(v => ({ value: v, label: v })),
  ];
  const servicePrincipalOptions = [
    { value: '', label: 'Select a service principal...' },
    ...servicePrincipalNames.map(sp => ({ value: sp, label: sp })),
  ];

  // Fetch UC functions when catalog/schema selected
  const { data: ucFunctions, loading: ucFunctionsLoading, refetch: refetchFunctions } = useFunctions(
    formData.ucCatalog || null,
    formData.ucSchema || null
  );

  // Fetch vector search indexes when endpoint selected
  const { data: vectorIndexes, loading: vectorIndexesLoading, refetch: refetchIndexes } = useVectorSearchIndexes(
    formData.vectorEndpoint || null
  );

  // MCP-specific vector search indexes
  const { data: mcpVectorIndexes, loading: mcpVectorIndexesLoading, refetch: refetchMcpIndexes } = useVectorSearchIndexes(
    mcpForm.vectorEndpoint || null
  );

  const buildHITLConfig = (): HumanInTheLoopModel | undefined => {
    if (!hitlForm.enabled) return undefined;

    const allowedDecisions: ("approve" | "edit" | "reject")[] = [];
    if (hitlForm.allowApprove) allowedDecisions.push("approve");
    if (hitlForm.allowEdit) allowedDecisions.push("edit");
    if (hitlForm.allowReject) allowedDecisions.push("reject");

    const config: HumanInTheLoopModel = {
      review_prompt: hitlForm.reviewPrompt || undefined,
      allowed_decisions: allowedDecisions.length > 0 ? allowedDecisions : undefined,
    };

    return config;
  };

  const buildMcpFunction = (): McpFunctionModel => {
    const base: McpFunctionModel = {
      type: 'mcp',
      name: formData.name,
    };

    // Add credentials if enabled
    if (mcpForm.useCredentials) {
      if (mcpForm.credentialsMode === 'service_principal' && mcpForm.servicePrincipalRef) {
        // Use configured service principal reference
        base.service_principal = `*${mcpForm.servicePrincipalRef}` as any;
      } else if (mcpForm.credentialsMode === 'manual') {
        // Client ID
        if (mcpForm.clientIdSource === 'variable' && mcpForm.clientIdVar) {
          base.client_id = `*${mcpForm.clientIdVar}` as any; // YAML anchor reference
        } else if (mcpForm.clientIdSource === 'manual' && mcpForm.clientIdManual) {
          base.client_id = mcpForm.clientIdManual as any;
        }
        // Client Secret
        if (mcpForm.clientSecretSource === 'variable' && mcpForm.clientSecretVar) {
          base.client_secret = `*${mcpForm.clientSecretVar}` as any;
        } else if (mcpForm.clientSecretSource === 'manual' && mcpForm.clientSecretManual) {
          base.client_secret = mcpForm.clientSecretManual as any;
        }
        // Workspace Host (optional) - only include if a value is provided
        if (mcpForm.workspaceHostSource === 'variable' && mcpForm.workspaceHostVar) {
          base.workspace_host = `*${mcpForm.workspaceHostVar}` as any;
        } else if (mcpForm.workspaceHostSource === 'manual' && mcpForm.workspaceHostManual) {
          base.workspace_host = mcpForm.workspaceHostManual as any;
        }
      }
    }

    switch (mcpForm.sourceType) {
      case 'url':
        base.url = mcpForm.url;
        break;
      case 'genie':
        base.genie_room = {
          name: mcpForm.genieName || 'Genie Room',
          space_id: mcpForm.genieSpaceId,
          description: mcpForm.genieDescription || undefined,
        };
        break;
      case 'vector_search':
        base.vector_search = {
          source_table: {
            schema: {
              catalog_name: mcpForm.vectorCatalog,
              schema_name: mcpForm.vectorSchema,
            },
          },
          embedding_source_column: 'content', // Default, can be customized
          index: {
            name: mcpForm.vectorIndex,
          },
          endpoint: {
            name: mcpForm.vectorEndpoint,
          },
        };
        break;
      case 'functions':
        base.functions = {
          catalog_name: mcpForm.functionsCatalog,
          schema_name: mcpForm.functionsSchema,
        };
        break;
      case 'sql':
        base.sql = true;
        break;
      case 'connection':
        // Use reference format if from configured connection
        if (mcpForm.connectionSource === 'configured' && mcpForm.connectionRefName) {
          base.connection = `*${mcpForm.connectionRefName}` as any;
        } else if (mcpForm.connectionName) {
          base.connection = {
            name: mcpForm.connectionName,
          };
        }
        break;
    }

    return base;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const funcName = formData.functionName === 'custom' ? formData.customFunctionName : formData.functionName;
    
    // Require both refName and name
    if (!formData.refName.trim() || !formData.name.trim()) return;

    let functionConfig: ToolFunctionModel;
    const hitlConfig = buildHITLConfig();

    if (formData.type === 'factory') {
      let parsedArgs: Record<string, unknown> = {};
      
      // Build args based on selected factory tool
      if (formData.functionName === 'dao_ai.tools.create_genie_tool') {
        // Build base args
        const genieArgs: Record<string, unknown> = {
          name: formData.name,
          description: `Tool for querying via Genie`,
          persist_conversation: formData.geniePersistConversation,
          truncate_results: formData.genieTruncateResults,
        };

        // Add genie_room reference or inline
        if (formData.genieSource === 'configured' && formData.genieRefName) {
          genieArgs.genie_room = `__REF__${formData.genieRefName}`;
        } else {
          genieArgs.genie_room = {
          space_id: formData.genieSpaceId,
          };
        }

        // Add LRU cache parameters if enabled
        if (formData.genieLruCacheEnabled) {
          const lruCacheParams: Record<string, unknown> = {
            capacity: formData.genieLruCacheCapacity,
            time_to_live_seconds: formData.genieLruCacheTtlNeverExpires ? null : formData.genieLruCacheTtl,
          };
          // Add warehouse reference or inline
          if (formData.genieLruCacheWarehouseSource === 'configured' && formData.genieLruCacheWarehouseRefName) {
            lruCacheParams.warehouse = `__REF__${formData.genieLruCacheWarehouseRefName}`;
          } else if (formData.genieLruCacheWarehouseId) {
            lruCacheParams.warehouse = {
              name: 'lru_cache_warehouse',
              warehouse_id: formData.genieLruCacheWarehouseId,
            };
          }
          genieArgs.lru_cache_parameters = lruCacheParams;
        }

        // Add semantic cache parameters if enabled
        if (formData.genieSemanticCacheEnabled) {
          const semanticCacheParams: Record<string, unknown> = {
            time_to_live_seconds: formData.genieSemanticCacheTtlNeverExpires ? null : formData.genieSemanticCacheTtl,
            similarity_threshold: formData.genieSemanticCacheSimilarityThreshold,
            table_name: formData.genieSemanticCacheTableName,
          };
          // Add embedding model - configured LLM reference or manual string
          if (formData.genieSemanticCacheEmbeddingModelSource === 'configured' && formData.genieSemanticCacheEmbeddingModelRefName) {
            semanticCacheParams.embedding_model = `__REF__${formData.genieSemanticCacheEmbeddingModelRefName}`;
          } else if (formData.genieSemanticCacheEmbeddingModelManual) {
            semanticCacheParams.embedding_model = formData.genieSemanticCacheEmbeddingModelManual;
          }
          // Add database reference
          if (formData.genieSemanticCacheDatabaseSource === 'configured' && formData.genieSemanticCacheDatabaseRefName) {
            semanticCacheParams.database = `__REF__${formData.genieSemanticCacheDatabaseRefName}`;
          }
          // Add warehouse reference or inline
          if (formData.genieSemanticCacheWarehouseSource === 'configured' && formData.genieSemanticCacheWarehouseRefName) {
            semanticCacheParams.warehouse = `__REF__${formData.genieSemanticCacheWarehouseRefName}`;
          } else if (formData.genieSemanticCacheWarehouseId) {
            semanticCacheParams.warehouse = {
              name: 'semantic_cache_warehouse',
              warehouse_id: formData.genieSemanticCacheWarehouseId,
            };
          }
          genieArgs.semantic_cache_parameters = semanticCacheParams;
        }

        parsedArgs = genieArgs;
      } else if (formData.functionName === 'dao_ai.tools.create_vector_search_tool') {
        // Vector search tool uses a retriever reference
        if (formData.retrieverSource === 'configured' && formData.retrieverRefName) {
        parsedArgs = {
            name: formData.name,
            ...(formData.vectorSearchDescription && { description: formData.vectorSearchDescription }),
            retriever: `__REF__${formData.retrieverRefName}`,
          };
        } else {
          // Direct selection - use specific fields (index name from endpoint)
          parsedArgs = {
            name: formData.name,
            ...(formData.vectorSearchDescription && { description: formData.vectorSearchDescription }),
          index_name: formData.vectorIndex,
        };
        }
      } else if (formData.functionName === 'dao_ai.tools.create_send_slack_message_tool') {
        // Slack message tool configuration
        const slackArgs: Record<string, unknown> = {
          name: formData.name,
        };
        
        // Add connection reference
        if (formData.slackConnectionSource === 'configured' && formData.slackConnectionRefName) {
          slackArgs.connection = `__REF__${formData.slackConnectionRefName}`;
        }
        
        // Add channel configuration - prefer channel_id if provided, otherwise use channel_name
        if (formData.slackChannelId) {
          slackArgs.channel_id = formData.slackChannelId;
        } else if (formData.slackChannelName) {
          slackArgs.channel_name = formData.slackChannelName;
        }
        
        parsedArgs = slackArgs;
      } else if (formData.functionName === 'dao_ai.tools.create_agent_endpoint_tool') {
        // Agent endpoint tool configuration
        const agentArgs: Record<string, unknown> = {
          name: formData.name,
        };
        
        // Add LLM reference
        if (formData.agentLlmSource === 'configured' && formData.agentLlmRefName) {
          agentArgs.llm = `__REF__${formData.agentLlmRefName}`;
        }
        
        parsedArgs = agentArgs;
      } else {
        try {
          parsedArgs = JSON.parse(formData.args || '{}');
        } catch {
          // Keep empty object if parse fails
        }
      }
      
      functionConfig = {
        type: 'factory',
        name: funcName || formData.functionName,
        args: parsedArgs,
        ...(hitlConfig && { human_in_the_loop: hitlConfig }),
      };
    } else if (formData.type === 'python') {
      functionConfig = {
        type: 'python',
        name: funcName,
        ...(hitlConfig && { human_in_the_loop: hitlConfig }),
      };
    } else if (formData.type === 'unity_catalog') {
      // Build partial_args if any are configured
      let partialArgs: Record<string, string> | undefined;
      if (formData.ucPartialArgs.length > 0) {
        partialArgs = {};
        for (const arg of formData.ucPartialArgs) {
          if (arg.name && arg.value) {
            if (arg.source === 'manual') {
              partialArgs[arg.name] = arg.value;
            } else {
              // For variable or service_principal, use __REF__ marker
              partialArgs[arg.name] = `__REF__${arg.value}`;
            }
          }
        }
        if (Object.keys(partialArgs).length === 0) {
          partialArgs = undefined;
        }
      }

      // If using a configured function resource, use YAML merge reference
      if (formData.functionSource === 'configured' && formData.functionRefName) {
      functionConfig = {
        type: 'unity_catalog',
          __MERGE__: formData.functionRefName, // Will be converted to <<: *ref in YAML
          ...(partialArgs && { partial_args: partialArgs }),
          ...(hitlConfig && { human_in_the_loop: hitlConfig }),
      };
    } else {
        // Direct selection - include schema and name inline
      functionConfig = {
          type: 'unity_catalog',
          schema: {
            catalog_name: formData.ucCatalog,
            schema_name: formData.ucSchema,
          },
          name: formData.ucFunction.split('.').pop() || formData.ucFunction, // Extract just the function name
          ...(partialArgs && { partial_args: partialArgs }),
          ...(hitlConfig && { human_in_the_loop: hitlConfig }),
        };
      }
    } else if (formData.type === 'mcp') {
      // Validate MCP-specific requirements
      if (mcpForm.sourceType === 'connection') {
        const hasConnection = (mcpForm.connectionSource === 'configured' && mcpForm.connectionRefName) ||
                              (mcpForm.connectionSource === 'select' && mcpForm.connectionName);
        if (!hasConnection) {
          return; // Connection is required for connection type
        }
      }
      functionConfig = buildMcpFunction();
      if (hitlConfig) {
        (functionConfig as McpFunctionModel).human_in_the_loop = hitlConfig;
      }
    } else {
      functionConfig = funcName;
    }

    const toolConfig = {
      name: formData.name,
      function: functionConfig,
    };

    // Use refName as the YAML key (if provided), otherwise fall back to name
    const refName = formData.refName.trim() || formData.name;

    if (editingKey) {
      // When editing, we need to handle the case where the reference name changed
      if (editingKey !== refName) {
        // Reference name changed - remove old and add new
        removeTool(editingKey);
        addTool(refName, toolConfig);
      } else {
        // Reference name unchanged - just update
        updateTool(refName, toolConfig);
      }
    } else {
      addTool(refName, toolConfig);
    }
    
    resetForm();
    setIsModalOpen(false);
  };

  const resetForm = () => {
    setFormData({
      refName: '',
      name: '',
      type: 'factory',
      functionName: '',
      customFunctionName: '',
      args: '{}',
      genieSource: 'configured',
      genieRefName: '',
      genieSpaceId: '',
      geniePersistConversation: true,
      genieTruncateResults: false,
      // Genie LRU Cache
      genieLruCacheEnabled: false,
      genieLruCacheCapacity: 1000,
      genieLruCacheTtl: 86400,
      genieLruCacheTtlNeverExpires: false,
      genieLruCacheWarehouseSource: 'configured',
      genieLruCacheWarehouseRefName: '',
      genieLruCacheWarehouseId: '',
      // Genie Semantic Cache
      genieSemanticCacheEnabled: false,
      genieSemanticCacheTtl: 86400,
      genieSemanticCacheTtlNeverExpires: false,
      genieSemanticCacheSimilarityThreshold: 0.85,
      genieSemanticCacheEmbeddingModelSource: 'configured',
      genieSemanticCacheEmbeddingModelRefName: '',
      genieSemanticCacheEmbeddingModelManual: 'databricks-gte-large-en',
      genieSemanticCacheTableName: 'genie_semantic_cache',
      genieSemanticCacheDatabaseSource: 'configured',
      genieSemanticCacheDatabaseRefName: '',
      genieSemanticCacheWarehouseSource: 'configured',
      genieSemanticCacheWarehouseRefName: '',
      genieSemanticCacheWarehouseId: '',
      warehouseSource: 'configured',
      warehouseRefName: '',
      warehouseId: '',
      retrieverSource: 'configured',
      retrieverRefName: '',
      vectorEndpoint: '',
      vectorIndex: '',
      schemaSource: 'configured',
      schemaRefName: '',
      ucCatalog: '',
      ucSchema: '',
      functionSource: 'configured',
      functionRefName: '',
      ucFunction: '',
      slackConnectionSource: 'configured',
      slackConnectionRefName: '',
      slackChannelId: '',
      slackChannelName: '',
      agentLlmSource: 'configured',
      agentLlmRefName: '',
      vectorSearchDescription: '',
      ucPartialArgs: [],
    });
    // Set MCP form defaults with proper source defaults based on configured resources
    const hasConfiguredConnections = Object.keys(configuredConnections).length > 0;
    const hasConfiguredSchemas = Object.keys(configuredSchemas).length > 0;
    const hasConfiguredGenieRooms = Object.keys(configuredGenieRooms).length > 0;
    const hasConfiguredVectorStores = Object.keys(configuredVectorStores).length > 0;
    
    setMcpForm({
      ...defaultMCPFormData,
      connectionSource: hasConfiguredConnections ? 'configured' : 'select',
      schemaSource: hasConfiguredSchemas ? 'configured' : 'select',
      genieSource: hasConfiguredGenieRooms ? 'configured' : 'select',
      vectorStoreSource: hasConfiguredVectorStores ? 'configured' : 'select',
    });
    setHitlForm(defaultHITLFormData);
    setShowHitlConfig(false);
    setNameManuallyEdited(false);
    setRefNameManuallyEdited(false);
    setEditingKey(null);
  };

  const { scrollToAsset } = useYamlScrollStore();

  // Handle editing an existing tool
  const handleEdit = (key: string, tool: { name: string; function: string | ToolFunctionModel }) => {
    // Scroll to the asset in YAML preview
    scrollToAsset(key);
    
    setEditingKey(key);
    setNameManuallyEdited(true); // Preserve the name when editing
    setRefNameManuallyEdited(true); // Preserve the reference name when editing
    
    const func = tool.function;
    
    if (typeof func === 'string') {
      // Python function tool (string reference)
      const isPythonTool = PYTHON_TOOLS.some(pt => pt.value === func);
      const isFactoryTool = FACTORY_TOOLS.some(ft => ft.value === func);
      
      setFormData(prev => ({
        ...prev,
        refName: key, // YAML key (reference name)
        name: tool.name,
        type: isPythonTool ? 'python' : (isFactoryTool ? 'factory' : 'python'),
        functionName: isPythonTool || isFactoryTool ? func : 'custom',
        customFunctionName: isPythonTool || isFactoryTool ? '' : func,
      }));
    } else if (typeof func === 'object') {
      const funcType = func.type || 'factory';
      
      // Handle HITL config
      if (func.human_in_the_loop) {
        const hitl = func.human_in_the_loop;
        const allowedDecisions = hitl.allowed_decisions || ['approve', 'edit', 'reject'];
        setShowHitlConfig(true);
        setHitlForm({
          enabled: true,
          reviewPrompt: hitl.review_prompt || 'Please review the tool call',
          allowApprove: allowedDecisions.includes('approve'),
          allowEdit: allowedDecisions.includes('edit'),
          allowReject: allowedDecisions.includes('reject'),
        });
      }
      
      if (funcType === 'factory' && 'args' in func) {
        const factoryFunc = func as { name?: string; args?: Record<string, unknown> };
        const funcName = factoryFunc.name || '';
        const isKnownFactory = FACTORY_TOOLS.some(ft => ft.value === funcName);
        const args = factoryFunc.args || {};
        
        // Determine genie config from args
        let genieSource: ResourceSource = 'configured';
        let genieRefName = '';
        let genieSpaceId = '';
        if (args.genie_room) {
          if (typeof args.genie_room === 'string' && args.genie_room.startsWith('__REF__')) {
            genieRefName = args.genie_room.replace('__REF__', '');
            genieSource = 'configured';
          } else if (typeof args.genie_room === 'object' && args.genie_room !== null) {
            const genieRoom = args.genie_room as { space_id?: string; name?: string };
            // Try to find a matching configured genie room
            const matchingKey = findConfiguredGenieRoom(genieRoom);
            if (matchingKey) {
              genieRefName = matchingKey;
              genieSource = 'configured';
            } else if (genieRoom.space_id) {
              genieSpaceId = genieRoom.space_id;
              genieSource = 'select';
            }
          }
        }
        
        // Determine retriever config from args
        let retrieverSource: ResourceSource = 'configured';
        let retrieverRefName = '';
        let vectorIndex = '';
        if (args.retriever) {
          if (typeof args.retriever === 'string' && args.retriever.startsWith('__REF__')) {
            retrieverRefName = args.retriever.replace('__REF__', '');
            retrieverSource = 'configured';
          } else if (typeof args.retriever === 'object' && args.retriever !== null) {
            // Try to find a matching configured retriever
            const matchingKey = findConfiguredRetriever(args.retriever as { vector_store?: unknown });
            if (matchingKey) {
              retrieverRefName = matchingKey;
              retrieverSource = 'configured';
            } else {
              retrieverSource = 'select';
            }
          }
        }
        if (args.index_name && !retrieverRefName) {
          vectorIndex = args.index_name as string;
          retrieverSource = 'select';
        }
        
        // Slack tool config
        let slackConnectionSource: ResourceSource = 'configured';
        let slackConnectionRefName = '';
        if (args.connection) {
          if (typeof args.connection === 'string' && args.connection.startsWith('__REF__')) {
            slackConnectionRefName = args.connection.replace('__REF__', '');
            slackConnectionSource = 'configured';
          } else if (typeof args.connection === 'object' && args.connection !== null) {
            // Try to find a matching configured connection
            const matchingKey = findConfiguredConnection(args.connection as { name?: string });
            if (matchingKey) {
              slackConnectionRefName = matchingKey;
              slackConnectionSource = 'configured';
            } else {
              slackConnectionSource = 'select';
            }
          }
        }
        
        // Agent endpoint LLM config
        let agentLlmSource: ResourceSource = 'configured';
        let agentLlmRefName = '';
        if (args.llm) {
          if (typeof args.llm === 'string' && args.llm.startsWith('__REF__')) {
            agentLlmRefName = args.llm.replace('__REF__', '');
            agentLlmSource = 'configured';
          } else if (typeof args.llm === 'object' && args.llm !== null) {
            // Try to find a matching configured LLM
            const matchingKey = findConfiguredLlm(args.llm as { name?: string });
            if (matchingKey) {
              agentLlmRefName = matchingKey;
              agentLlmSource = 'configured';
            } else {
              agentLlmSource = 'select';
            }
          }
        }
        
        // Extract LRU cache parameters
        let genieLruCacheEnabled = false;
        let genieLruCacheCapacity = 1000;
        let genieLruCacheTtl = 86400;
        let genieLruCacheTtlNeverExpires = false;
        let genieLruCacheWarehouseSource: ResourceSource = 'configured';
        let genieLruCacheWarehouseRefName = '';
        let genieLruCacheWarehouseId = '';
        
        if (args.lru_cache_parameters) {
          genieLruCacheEnabled = true;
          const lruParams = args.lru_cache_parameters as Record<string, unknown>;
          genieLruCacheCapacity = (lruParams.capacity as number) ?? 1000;
          if (lruParams.time_to_live_seconds === null) {
            genieLruCacheTtlNeverExpires = true;
          } else {
            genieLruCacheTtl = (lruParams.time_to_live_seconds as number) ?? 86400;
          }
          // Extract warehouse reference - first check YAML references, then __REF__ marker, then match
          const lruWarehouseRefPath = `tools.${key}.function.args.lru_cache_parameters.warehouse`;
          const lruWarehouseOriginalRef = findOriginalReferenceForPath(lruWarehouseRefPath);
          
          if (lruWarehouseOriginalRef && configuredWarehouses[lruWarehouseOriginalRef]) {
            genieLruCacheWarehouseRefName = lruWarehouseOriginalRef;
            genieLruCacheWarehouseSource = 'configured';
          } else if (typeof lruParams.warehouse === 'string' && lruParams.warehouse.startsWith('__REF__')) {
            genieLruCacheWarehouseRefName = lruParams.warehouse.replace('__REF__', '');
            genieLruCacheWarehouseSource = 'configured';
          } else if (typeof lruParams.warehouse === 'object' && lruParams.warehouse !== null) {
            const wh = lruParams.warehouse as { warehouse_id?: string };
            // Try to find a matching configured warehouse
            const matchingKey = findConfiguredWarehouse(wh);
            if (matchingKey) {
              genieLruCacheWarehouseRefName = matchingKey;
              genieLruCacheWarehouseSource = 'configured';
            } else {
              genieLruCacheWarehouseId = wh.warehouse_id || '';
              genieLruCacheWarehouseSource = 'select';
            }
          }
        }

        // Extract semantic cache parameters
        let genieSemanticCacheEnabled = false;
        let genieSemanticCacheTtl = 86400;
        let genieSemanticCacheTtlNeverExpires = false;
        let genieSemanticCacheSimilarityThreshold = 0.85;
        let genieSemanticCacheEmbeddingModelSource: ResourceSource = 'configured';
        let genieSemanticCacheEmbeddingModelRefName = '';
        let genieSemanticCacheEmbeddingModelManual = 'databricks-gte-large-en';
        let genieSemanticCacheTableName = 'genie_semantic_cache';
        let genieSemanticCacheDatabaseSource: ResourceSource = 'configured';
        let genieSemanticCacheDatabaseRefName = '';
        let genieSemanticCacheWarehouseSource: ResourceSource = 'configured';
        let genieSemanticCacheWarehouseRefName = '';
        let genieSemanticCacheWarehouseId = '';

        if (args.semantic_cache_parameters) {
          genieSemanticCacheEnabled = true;
          const semParams = args.semantic_cache_parameters as Record<string, unknown>;
          if (semParams.time_to_live_seconds === null) {
            genieSemanticCacheTtlNeverExpires = true;
          } else {
            genieSemanticCacheTtl = (semParams.time_to_live_seconds as number) ?? 86400;
          }
          genieSemanticCacheSimilarityThreshold = (semParams.similarity_threshold as number) ?? 0.85;
          genieSemanticCacheTableName = (semParams.table_name as string) ?? 'genie_semantic_cache';
          
          // Extract embedding model - first check YAML references, then __REF__ marker, then match against configured LLMs
          const embeddingModelRefPath = `tools.${key}.function.args.semantic_cache_parameters.embedding_model`;
          const embeddingModelOriginalRef = findOriginalReferenceForPath(embeddingModelRefPath);
          
          if (embeddingModelOriginalRef && configuredLlms[embeddingModelOriginalRef]) {
            // Found original reference in YAML references - use it
            genieSemanticCacheEmbeddingModelRefName = embeddingModelOriginalRef;
            genieSemanticCacheEmbeddingModelSource = 'configured';
          } else if (typeof semParams.embedding_model === 'string') {
            if (semParams.embedding_model.startsWith('__REF__')) {
              genieSemanticCacheEmbeddingModelRefName = semParams.embedding_model.replace('__REF__', '');
              genieSemanticCacheEmbeddingModelSource = 'configured';
            } else {
              // Check if this string matches a configured LLM name directly
              const matchingLlm = Object.entries(configuredLlms).find(([, llm]) => llm.name === semParams.embedding_model);
              if (matchingLlm) {
                genieSemanticCacheEmbeddingModelRefName = matchingLlm[0];
                genieSemanticCacheEmbeddingModelSource = 'configured';
              } else {
                // Use as manual value
                genieSemanticCacheEmbeddingModelManual = semParams.embedding_model as string;
                genieSemanticCacheEmbeddingModelSource = 'select'; // 'select' represents manual entry here
              }
            }
          } else if (typeof semParams.embedding_model === 'object' && semParams.embedding_model !== null) {
            const embModel = semParams.embedding_model as { name?: string };
            // Try to find a matching configured LLM
            const matchingKey = findConfiguredLlm(embModel);
            if (matchingKey) {
              genieSemanticCacheEmbeddingModelRefName = matchingKey;
              genieSemanticCacheEmbeddingModelSource = 'configured';
            } else if (embModel.name) {
              genieSemanticCacheEmbeddingModelManual = embModel.name;
              genieSemanticCacheEmbeddingModelSource = 'select';
            }
          }
          
          // Extract database reference - first check YAML references, then __REF__ marker, then match
          const databaseRefPath = `tools.${key}.function.args.semantic_cache_parameters.database`;
          const databaseOriginalRef = findOriginalReferenceForPath(databaseRefPath);
          
          if (databaseOriginalRef && configuredDatabases[databaseOriginalRef]) {
            genieSemanticCacheDatabaseRefName = databaseOriginalRef;
            genieSemanticCacheDatabaseSource = 'configured';
          } else if (typeof semParams.database === 'string' && semParams.database.startsWith('__REF__')) {
            genieSemanticCacheDatabaseRefName = semParams.database.replace('__REF__', '');
            genieSemanticCacheDatabaseSource = 'configured';
          } else if (typeof semParams.database === 'object' && semParams.database !== null) {
            const db = semParams.database as { name?: string };
            // Try to find a matching configured database
            const matchingKey = findConfiguredDatabase(db);
            if (matchingKey) {
              genieSemanticCacheDatabaseRefName = matchingKey;
              genieSemanticCacheDatabaseSource = 'configured';
            }
          }
          
          // Extract warehouse reference - first check YAML references, then __REF__ marker, then match
          const semWarehouseRefPath = `tools.${key}.function.args.semantic_cache_parameters.warehouse`;
          const semWarehouseOriginalRef = findOriginalReferenceForPath(semWarehouseRefPath);
          
          if (semWarehouseOriginalRef && configuredWarehouses[semWarehouseOriginalRef]) {
            genieSemanticCacheWarehouseRefName = semWarehouseOriginalRef;
            genieSemanticCacheWarehouseSource = 'configured';
          } else if (typeof semParams.warehouse === 'string' && semParams.warehouse.startsWith('__REF__')) {
            genieSemanticCacheWarehouseRefName = semParams.warehouse.replace('__REF__', '');
            genieSemanticCacheWarehouseSource = 'configured';
          } else if (typeof semParams.warehouse === 'object' && semParams.warehouse !== null) {
            const wh = semParams.warehouse as { warehouse_id?: string };
            // Try to find a matching configured warehouse
            const matchingKey = findConfiguredWarehouse(wh);
            if (matchingKey) {
              genieSemanticCacheWarehouseRefName = matchingKey;
              genieSemanticCacheWarehouseSource = 'configured';
            } else {
              genieSemanticCacheWarehouseId = wh.warehouse_id || '';
              genieSemanticCacheWarehouseSource = 'select';
            }
          }
        }

        setFormData(prev => ({
          ...prev,
          refName: key, // YAML key (reference name)
          name: tool.name,
          type: 'factory',
          functionName: isKnownFactory ? funcName : 'custom',
          customFunctionName: isKnownFactory ? '' : funcName,
          genieSource,
          genieRefName,
          genieSpaceId,
          geniePersistConversation: args.persist_conversation as boolean ?? true,
          genieTruncateResults: args.truncate_results as boolean ?? false,
          // LRU Cache
          genieLruCacheEnabled,
          genieLruCacheCapacity,
          genieLruCacheTtl,
          genieLruCacheTtlNeverExpires,
          genieLruCacheWarehouseSource,
          genieLruCacheWarehouseRefName,
          genieLruCacheWarehouseId,
          // Semantic Cache
          genieSemanticCacheEnabled,
          genieSemanticCacheTtl,
          genieSemanticCacheTtlNeverExpires,
          genieSemanticCacheSimilarityThreshold,
          genieSemanticCacheEmbeddingModelSource,
          genieSemanticCacheEmbeddingModelRefName,
          genieSemanticCacheEmbeddingModelManual,
          genieSemanticCacheTableName,
          genieSemanticCacheDatabaseSource,
          genieSemanticCacheDatabaseRefName,
          genieSemanticCacheWarehouseSource,
          genieSemanticCacheWarehouseRefName,
          genieSemanticCacheWarehouseId,
          retrieverSource,
          retrieverRefName,
          vectorIndex,
          vectorSearchDescription: args.description as string || '',
          slackConnectionSource,
          slackConnectionRefName,
          slackChannelId: args.channel_id as string || '',
          slackChannelName: args.channel_name as string || '',
          agentLlmSource,
          agentLlmRefName,
        }));
      } else if (funcType === 'python') {
        const funcName = func.name || '';
        const isKnownPython = PYTHON_TOOLS.some(pt => pt.value === funcName);
        
        setFormData(prev => ({
          ...prev,
          refName: key, // YAML key (reference name)
          name: tool.name,
          type: 'python',
          functionName: isKnownPython ? funcName : 'custom',
          customFunctionName: isKnownPython ? '' : funcName,
        }));
      } else if (funcType === 'unity_catalog') {
        // Cast to proper type for unity_catalog
        const ucFunc = func as UnityCatalogFunctionModel & { __MERGE__?: string };
        
        // Determine if using a merge key or direct schema/name
        const mergeKey = ucFunc.__MERGE__;
        const partialArgs = ucFunc.partial_args || {};
        
        // Convert partial_args to PartialArgEntry array
        const ucPartialArgs: PartialArgEntry[] = Object.entries(partialArgs).map(([argName, argValue]) => {
          let source: PartialArgSource = 'manual';
          let value = String(argValue);
          
          if (typeof argValue === 'string') {
            if (argValue.startsWith('__REF__')) {
              const refName = argValue.replace('__REF__', '');
              // Check if it's a service principal or variable
              const servicePrincipals = config.service_principals || {};
              if (servicePrincipals[refName]) {
                source = 'service_principal';
                value = refName;
              } else {
                source = 'variable';
                value = refName;
              }
            }
          }
          
          return {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: argName,
            source,
            value,
          };
        });
        
        if (mergeKey) {
          setFormData(prev => ({
            ...prev,
            refName: key, // YAML key (reference name)
            name: tool.name,
            type: 'unity_catalog',
            functionSource: 'configured',
            functionRefName: mergeKey,
            ucPartialArgs,
          }));
        } else {
          // Direct schema/name - try to find a matching configured function first
          const schema = ucFunc.schema;
          const funcName = ucFunc.name || '';
          
          // Try to find a matching configured function
          const matchingFuncKey = findConfiguredFunction({
            name: funcName,
            schema: schema as { catalog_name?: string; schema_name?: string } | undefined,
          });
          
          if (matchingFuncKey) {
            // Found a matching configured function
            setFormData(prev => ({
              ...prev,
              refName: key, // YAML key (reference name)
              name: tool.name,
              type: 'unity_catalog',
              functionSource: 'configured',
              functionRefName: matchingFuncKey,
              ucPartialArgs,
            }));
          } else {
            // No match - use direct selection
            let fullFuncName = funcName;
            if (schema && typeof schema === 'object' && 'catalog_name' in schema && 'schema_name' in schema) {
              fullFuncName = `${(schema as { catalog_name: string }).catalog_name}.${(schema as { schema_name: string }).schema_name}.${funcName}`;
            }
            
            setFormData(prev => ({
              ...prev,
              refName: key, // YAML key (reference name)
              name: tool.name,
              type: 'unity_catalog',
              functionSource: 'select',
              ucFunction: fullFuncName,
              ucPartialArgs,
            }));
          }
        }
      } else if (funcType === 'mcp') {
        // MCP tool - this is complex, handle basic case
        const mcpFunc = func as McpFunctionModel;
        setFormData(prev => ({
          ...prev,
          refName: key, // YAML key (reference name)
          name: tool.name,
          type: 'mcp',
        }));
        // Set MCP form data
        if (mcpFunc.url) {
          setMcpForm(prev => ({
            ...prev,
            sourceType: 'url',
            url: mcpFunc.url || '',
          }));
        }
        // More MCP source types could be handled here
      }
    }
    
    setIsModalOpen(true);
  };

  const getToolType = (tool: { function: string | { type?: string } }): string => {
    if (typeof tool.function === 'string') return 'string';
    return tool.function?.type || 'unknown';
  };

  const hasHITL = (tool: { function: string | { human_in_the_loop?: HumanInTheLoopModel } }): boolean => {
    if (typeof tool.function === 'string') return false;
    return !!tool.function?.human_in_the_loop;
  };

  const getToolIcon = (tool: { function: string | { type?: string; name?: string } }) => {
    const type = getToolType(tool);
    if (type === 'mcp') return Link2;
    if (type === 'unity_catalog') return Database;
    if (typeof tool.function === 'object' && tool.function.name) {
      if (tool.function.name.includes('genie')) return MessageSquare;
      if (tool.function.name.includes('vector') || tool.function.name.includes('search')) return Search;
      if (tool.function.name.includes('time')) return Clock;
      if (tool.function.name.includes('agent')) return Bot;
    }
    return Wrench;
  };

  const ucFunctionOptions = [
    { value: '', label: 'Select a function...' },
    ...(ucFunctions || []).map((f) => ({
      value: f.full_name,
      label: `${f.name}${f.comment ? ` - ${f.comment}` : ''}`,
    })),
  ];

  const vectorIndexOptions = [
    { value: '', label: 'Select an index...' },
    ...(vectorIndexes || []).map((i) => ({
      value: i.name,
      label: `${i.name}${i.index_type ? ` (${i.index_type})` : ''}`,
    })),
  ];

  const mcpVectorIndexOptions = [
    { value: '', label: 'Select an index...' },
    ...(mcpVectorIndexes || []).map((i) => ({
      value: i.name,
      label: `${i.name}${i.index_type ? ` (${i.index_type})` : ''}`,
    })),
  ];

  // Helper to get display name for variable
  const getVariableDisplayName = (variable: typeof variables[string]): string => {
    if (!variable) return 'unknown';
    if ('env' in variable) return `env: ${variable.env}`;
    if ('scope' in variable && 'secret' in variable) return `secret: ${variable.scope}/${variable.secret}`;
    if ('value' in variable) return `value: ${String(variable.value)}`;
    if ('options' in variable) return `composite (${variable.options.length} options)`;
    return 'unknown';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Tools</h2>
          <p className="text-slate-400 mt-1">
            Configure tools that agents can use to perform tasks
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4" />
          Add Tool
        </Button>
      </div>

      {/* Tool List */}
      {Object.keys(tools).length === 0 ? (
        <Card className="text-center py-12">
          <Wrench className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">No tools configured</h3>
          <p className="text-slate-500 mb-4">
            Tools enable agents to interact with external systems and data.
          </p>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Your First Tool
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {Object.entries(tools).map(([key, tool]) => {
            const Icon = getToolIcon(tool);
            return (
              <Card 
                key={key} 
                variant="interactive" 
                className="group cursor-pointer"
                onClick={() => handleEdit(key, tool)}
              >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                      <h3 className="font-medium text-white">{key}</h3>
                      {key !== tool.name && (
                        <p className="text-xs text-slate-500">name: {tool.name}</p>
                      )}
                    <p className="text-sm text-slate-400 font-mono">
                      {typeof tool.function === 'object' ? tool.function.name : tool.function}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                    {hasHITL(tool) && (
                      <Badge variant="success" title="Human In The Loop Enabled">
                        <UserCheck className="w-3 h-3 mr-1" />
                        HITL
                      </Badge>
                    )}
                  <Badge variant="warning">{getToolType(tool)}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        handleEdit(key, tool);
                      }}
                      title="Edit tool"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  <Button
                    variant="danger"
                    size="sm"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        safeDelete('Tool', key, () => removeTool(key));
                      }}
                      title="Delete tool"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      )}

      {/* Add Tool Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={editingKey ? 'Edit Tool' : 'Add Tool'}
        description={editingKey ? 'Modify the tool configuration' : 'Configure a tool for your agents'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Reference Name"
              placeholder="e.g., find_product_by_sku_tool"
              value={formData.refName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setFormData({ ...formData, refName: normalizeRefNameWhileTyping(e.target.value) });
                setRefNameManuallyEdited(true);
              }}
              hint="YAML key (spaces become underscores)"
              required
            />
            <Select
              label="Tool Type"
              options={TOOL_TYPES}
              value={formData.type}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, type: e.target.value as 'factory' | 'python' | 'unity_catalog' | 'mcp' })}
            />
          </div>

          <Input
            label="Tool Name"
            placeholder="e.g., find_product_by_sku_uc"
            value={formData.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setFormData({ ...formData, name: e.target.value });
              setNameManuallyEdited(true);
            }}
            hint="The name property inside the tool config (can differ from reference name)"
                required
              />

          {/* Factory Tool Configuration */}
          {formData.type === 'factory' && (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">Factory Function</label>
                <div className="grid grid-cols-2 gap-2">
                  {FACTORY_TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    const isSelected = formData.functionName === tool.value;
                    return (
                      <button
                        key={tool.value}
                        type="button"
                        onClick={() => {
                          const generatedName = generateToolName(tool.value);
                          setFormData({ 
                            ...formData, 
                            functionName: tool.value,
                            // Auto-generate tool name if not manually edited
                            name: nameManuallyEdited ? formData.name : generatedName,
                            // Auto-generate ref name if not manually edited
                            refName: refNameManuallyEdited ? formData.refName : generatedName,
                          });
                        }}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                          <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                            {tool.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{tool.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Genie Tool Configuration */}
              {formData.functionName === 'dao_ai.tools.create_genie_tool' && (
                <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <h4 className="text-sm font-medium text-slate-300">Genie Tool Configuration</h4>
                  <ResourceSelector
                    label="Genie Room"
                    resourceType="Genie room"
                    configuredOptions={configuredGenieOptions}
                    configuredValue={formData.genieRefName}
                    onConfiguredChange={(value) => setFormData({ ...formData, genieRefName: value, genieSpaceId: '' })}
                    source={formData.genieSource}
                    onSourceChange={(source) => setFormData({ ...formData, genieSource: source })}
                  >
                  <GenieSpaceSelect
                    value={formData.genieSpaceId}
                      onChange={(value) => setFormData({ ...formData, genieSpaceId: value, genieRefName: '' })}
                    required
                  />
                  </ResourceSelector>
                  
                  {/* Genie Tool Options */}
                  <div className="space-y-3 pt-2 border-t border-slate-700">
                    <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Options</h5>
                    
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={formData.geniePersistConversation}
                        onChange={(e) => setFormData({ ...formData, geniePersistConversation: e.target.checked })}
                        className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500 focus:ring-offset-slate-900"
                      />
                      <div>
                        <span className="text-sm text-slate-200 group-hover:text-white">Persist Conversation</span>
                        <p className="text-xs text-slate-500">Keep conversation context across tool calls for multi-turn conversations within the same Genie space</p>
                      </div>
                    </label>
                    
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={formData.genieTruncateResults}
                        onChange={(e) => setFormData({ ...formData, genieTruncateResults: e.target.checked })}
                        className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500 focus:ring-offset-slate-900"
                      />
                      <div>
                        <span className="text-sm text-slate-200 group-hover:text-white">Truncate Results</span>
                        <p className="text-xs text-slate-500">Truncate large query results to fit within token limits</p>
                      </div>
                    </label>
                    
                    {/* LRU Cache */}
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={formData.genieLruCacheEnabled}
                          onChange={(e) => setFormData({ ...formData, genieLruCacheEnabled: e.target.checked })}
                          className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500 focus:ring-offset-slate-900"
                        />
                        <div>
                          <span className="text-sm text-slate-200 group-hover:text-white">Enable LRU Cache</span>
                          <p className="text-xs text-slate-500">Cache query results using Least Recently Used eviction policy</p>
                        </div>
                      </label>
                      
                      {formData.genieLruCacheEnabled && (
                        <div className="ml-7 space-y-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              label="Capacity"
                              type="number"
                              value={formData.genieLruCacheCapacity.toString()}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, genieLruCacheCapacity: parseInt(e.target.value) || 1000 })}
                              hint="Max cached entries"
                            />
                            <div className="space-y-2">
                              <label className="block text-sm font-medium text-slate-300">TTL (seconds)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={formData.genieLruCacheTtlNeverExpires ? '' : formData.genieLruCacheTtl}
                                  onChange={(e) => setFormData({ ...formData, genieLruCacheTtl: parseInt(e.target.value) || 86400 })}
                                  disabled={formData.genieLruCacheTtlNeverExpires}
                                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
                                />
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formData.genieLruCacheTtlNeverExpires}
                                  onChange={(e) => setFormData({ ...formData, genieLruCacheTtlNeverExpires: e.target.checked })}
                                  className="w-3 h-3 rounded border-slate-600 bg-slate-800 text-violet-500"
                                />
                                <span className="text-xs text-slate-400">Never expires</span>
                              </label>
                            </div>
                          </div>
                          <ResourceSelector
                            label="Warehouse"
                            resourceType="Warehouse"
                            configuredOptions={configuredWarehouseOptions}
                            configuredValue={formData.genieLruCacheWarehouseRefName}
                            onConfiguredChange={(value) => setFormData({ ...formData, genieLruCacheWarehouseRefName: value, genieLruCacheWarehouseId: '' })}
                            source={formData.genieLruCacheWarehouseSource}
                            onSourceChange={(source) => setFormData({ ...formData, genieLruCacheWarehouseSource: source })}
                            hint="SQL warehouse for cache operations"
                          >
                            <Input
                              label="Warehouse ID"
                              placeholder="Enter warehouse ID"
                              value={formData.genieLruCacheWarehouseId}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, genieLruCacheWarehouseId: e.target.value, genieLruCacheWarehouseRefName: '' })}
                            />
                          </ResourceSelector>
                        </div>
                      )}
                    </div>

                    {/* Semantic Cache */}
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={formData.genieSemanticCacheEnabled}
                          onChange={(e) => setFormData({ ...formData, genieSemanticCacheEnabled: e.target.checked })}
                          className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500 focus:ring-offset-slate-900"
                        />
                        <div>
                          <span className="text-sm text-slate-200 group-hover:text-white">Enable Semantic Cache</span>
                          <p className="text-xs text-slate-500">Cache results using vector similarity matching (requires Lakebase database)</p>
                        </div>
                      </label>
                      
                      {formData.genieSemanticCacheEnabled && (
                        <div className="ml-7 space-y-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              label="Similarity Threshold"
                              type="number"
                              step="0.01"
                              min="0"
                              max="1"
                              value={formData.genieSemanticCacheSimilarityThreshold.toString()}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, genieSemanticCacheSimilarityThreshold: parseFloat(e.target.value) || 0.85 })}
                              hint="Min similarity for cache hit (0-1)"
                            />
                            <div className="space-y-2">
                              <label className="block text-sm font-medium text-slate-300">TTL (seconds)</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={formData.genieSemanticCacheTtlNeverExpires ? '' : formData.genieSemanticCacheTtl}
                                  onChange={(e) => setFormData({ ...formData, genieSemanticCacheTtl: parseInt(e.target.value) || 86400 })}
                                  disabled={formData.genieSemanticCacheTtlNeverExpires}
                                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
                                />
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formData.genieSemanticCacheTtlNeverExpires}
                                  onChange={(e) => setFormData({ ...formData, genieSemanticCacheTtlNeverExpires: e.target.checked })}
                                  className="w-3 h-3 rounded border-slate-600 bg-slate-800 text-violet-500"
                                />
                                <span className="text-xs text-slate-400">Never expires</span>
                              </label>
                            </div>
                          </div>
                          <ResourceSelector
                            label="Embedding Model"
                            resourceType="LLM"
                            configuredOptions={configuredLlmOptions}
                            configuredValue={formData.genieSemanticCacheEmbeddingModelRefName}
                            onConfiguredChange={(value) => setFormData({ ...formData, genieSemanticCacheEmbeddingModelRefName: value, genieSemanticCacheEmbeddingModelManual: '' })}
                            source={formData.genieSemanticCacheEmbeddingModelSource}
                            onSourceChange={(source) => setFormData({ ...formData, genieSemanticCacheEmbeddingModelSource: source })}
                            hint="Model for computing embeddings"
                          >
                            <Input
                              label="Model Name"
                              placeholder="databricks-gte-large-en"
                              value={formData.genieSemanticCacheEmbeddingModelManual}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, genieSemanticCacheEmbeddingModelManual: e.target.value, genieSemanticCacheEmbeddingModelRefName: '' })}
                              hint="Enter embedding model name manually"
                            />
                          </ResourceSelector>
                          <Input
                            label="Cache Table Name"
                            placeholder="genie_semantic_cache"
                            value={formData.genieSemanticCacheTableName}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, genieSemanticCacheTableName: e.target.value })}
                            hint="Table to store cache entries"
                          />
                          <Select
                            label="Database (Lakebase)"
                            value={formData.genieSemanticCacheDatabaseRefName}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, genieSemanticCacheDatabaseRefName: e.target.value, genieSemanticCacheDatabaseSource: 'configured' })}
                            hint="Lakebase database for semantic cache storage"
                            options={configuredDatabaseOptions}
                            placeholder="Select configured database..."
                          />
                          <ResourceSelector
                            label="Warehouse"
                            resourceType="Warehouse"
                            configuredOptions={configuredWarehouseOptions}
                            configuredValue={formData.genieSemanticCacheWarehouseRefName}
                            onConfiguredChange={(value) => setFormData({ ...formData, genieSemanticCacheWarehouseRefName: value, genieSemanticCacheWarehouseId: '' })}
                            source={formData.genieSemanticCacheWarehouseSource}
                            onSourceChange={(source) => setFormData({ ...formData, genieSemanticCacheWarehouseSource: source })}
                            hint="SQL warehouse for cache operations"
                          >
                            <Input
                              label="Warehouse ID"
                              placeholder="Enter warehouse ID"
                              value={formData.genieSemanticCacheWarehouseId}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, genieSemanticCacheWarehouseId: e.target.value, genieSemanticCacheWarehouseRefName: '' })}
                            />
                          </ResourceSelector>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Vector Search Tool Configuration */}
              {formData.functionName === 'dao_ai.tools.create_vector_search_tool' && (
                <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <h4 className="text-sm font-medium text-slate-300">Vector Search Configuration</h4>
                  <ResourceSelector
                    label="Retriever"
                    resourceType="Retriever"
                    configuredOptions={configuredRetrieverOptions}
                    configuredValue={formData.retrieverRefName}
                    onConfiguredChange={(value) => setFormData({ 
                      ...formData, 
                      retrieverRefName: value, 
                      vectorEndpoint: '', 
                      vectorIndex: '' 
                    })}
                    source={formData.retrieverSource}
                    onSourceChange={(source) => setFormData({ ...formData, retrieverSource: source })}
                    hint={formData.retrieverSource === 'configured' ? 'Use a pre-configured retriever from the Retrievers section' : undefined}
                  >
                    <div className="space-y-4">
                  <VectorSearchEndpointSelect
                    label="Vector Search Endpoint"
                    value={formData.vectorEndpoint}
                        onChange={(value) => setFormData({ ...formData, vectorEndpoint: value, vectorIndex: '', retrieverRefName: '' })}
                    required
                  />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-300">Vector Index</label>
                      {formData.vectorEndpoint && (
                        <button
                          type="button"
                          onClick={() => refetchIndexes()}
                          className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                          disabled={vectorIndexesLoading}
                        >
                          <RefreshCw className={`w-3 h-3 ${vectorIndexesLoading ? 'animate-spin' : ''}`} />
                          <span>Refresh</span>
                        </button>
                      )}
                    </div>
                    <Select
                      options={vectorIndexOptions}
                      value={formData.vectorIndex}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, vectorIndex: e.target.value })}
                      disabled={!formData.vectorEndpoint || vectorIndexesLoading}
                      required
                        />
                      </div>
                    </div>
                  </ResourceSelector>
                  
                  {/* Vector Search Options */}
                  <div className="pt-2 border-t border-slate-700">
                    <Input
                      label="Description"
                      placeholder="e.g., Search product documentation for answers"
                      value={formData.vectorSearchDescription}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, vectorSearchDescription: e.target.value })}
                      hint="Optional description for the tool (defaults to generic description)"
                    />
                  </div>
                </div>
              )}

              {/* Slack Message Tool Configuration */}
              {formData.functionName === 'dao_ai.tools.create_send_slack_message_tool' && (
                <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <h4 className="text-sm font-medium text-slate-300">Slack Message Tool Configuration</h4>
                  
                  <ResourceSelector
                    label="Slack Connection"
                    resourceType="Connection"
                    configuredOptions={configuredConnectionOptions}
                    configuredValue={formData.slackConnectionRefName}
                    onConfiguredChange={(value) => setFormData({ ...formData, slackConnectionRefName: value })}
                    source={formData.slackConnectionSource}
                    onSourceChange={(source) => setFormData({ ...formData, slackConnectionSource: source })}
                    hint="Unity Catalog connection to Slack"
                  >
                    <p className="text-sm text-slate-400">
                      Select a configured connection or create one in the Resources section
                    </p>
                  </ResourceSelector>
                  
                  <div className="space-y-3 pt-2 border-t border-slate-700">
                    <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Channel Configuration</h5>
                    <p className="text-xs text-slate-500">Provide either a Channel ID or Channel Name. Channel ID is preferred if known.</p>
                    
                    <Input
                      label="Channel ID"
                      placeholder="e.g., C1234567890"
                      value={formData.slackChannelId}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, slackChannelId: e.target.value })}
                      hint="Slack channel ID (e.g., C1234567890). Takes precedence over channel name."
                    />
                    
                    <Input
                      label="Channel Name"
                      placeholder="e.g., general or #general"
                      value={formData.slackChannelName}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, slackChannelName: e.target.value })}
                      hint="Slack channel name. Used to lookup channel ID if not provided above."
                    />
                  </div>
                </div>
              )}

              {/* Agent Endpoint Tool Configuration */}
              {formData.functionName === 'dao_ai.tools.create_agent_endpoint_tool' && (
                <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <h4 className="text-sm font-medium text-slate-300">Agent Endpoint Tool Configuration</h4>
                  
                  <ResourceSelector
                    label="LLM / Agent Endpoint"
                    resourceType="LLM"
                    configuredOptions={configuredLlmOptions}
                    configuredValue={formData.agentLlmRefName}
                    onConfiguredChange={(value) => setFormData({ ...formData, agentLlmRefName: value })}
                    source={formData.agentLlmSource}
                    onSourceChange={(source) => setFormData({ ...formData, agentLlmSource: source })}
                    hint="Select the LLM or agent endpoint to call"
                  >
                    <p className="text-sm text-slate-400">
                      Configure an LLM in the Resources section, then select it here
                    </p>
                  </ResourceSelector>
                </div>
              )}

              {/* Custom Factory */}
              {formData.functionName === 'custom' && (
                <Input
                  label="Custom Factory Function"
                  placeholder="e.g., my_package.tools.my_factory"
                  value={formData.customFunctionName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, customFunctionName: e.target.value })}
                  required
                />
              )}

              {/* JSON args for custom factory tools only */}
              {formData.functionName === 'custom' && (
                <Textarea
                  label="Arguments (JSON)"
                  placeholder='{"key": "value"}'
                  value={formData.args}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, args: e.target.value })}
                  rows={6}
                  hint="JSON object passed to the factory function"
                />
              )}
            </>
          )}

          {/* Python Function */}
          {formData.type === 'python' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">Python Tool Function</label>
                <p className="text-xs text-slate-500">
                  Python functions decorated with @tool that can be used directly as tools
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {PYTHON_TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    const isSelected = formData.functionName === tool.value;
                    return (
                      <button
                        key={tool.value}
                        type="button"
                        onClick={() => {
                          const generatedName = tool.value !== 'custom' ? generateToolName(tool.value) : '';
                          setFormData({ 
                            ...formData, 
                            functionName: tool.value,
                            customFunctionName: '',
                            // Auto-generate tool name if not manually edited
                            name: nameManuallyEdited ? formData.name : generatedName,
                            // Auto-generate ref name if not manually edited
                            refName: refNameManuallyEdited ? formData.refName : generatedName,
                          });
                        }}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'border-violet-500 bg-violet-500/10'
                            : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-start space-x-2">
                          <Icon className={`w-4 h-4 mt-0.5 ${isSelected ? 'text-violet-400' : 'text-slate-400'}`} />
                          <div>
                            <div className={`text-sm font-medium ${isSelected ? 'text-violet-400' : 'text-slate-300'}`}>
                              {tool.label}
                            </div>
                            <div className="text-xs text-slate-500">{tool.description}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Python Function Path */}
              {formData.functionName === 'custom' && (
            <Input
                  label="Custom Python Function Path"
              placeholder="e.g., my_package.tools.my_function"
                  value={formData.customFunctionName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const funcName = e.target.value;
                    const generatedName = generateToolName(funcName);
                    setFormData({ 
                      ...formData, 
                      customFunctionName: funcName,
                      // Auto-generate tool name if not manually edited
                      name: nameManuallyEdited ? formData.name : generatedName,
                      // Auto-generate ref name if not manually edited
                      refName: refNameManuallyEdited ? formData.refName : generatedName,
                    });
                  }}
                  hint="Fully qualified path to a Python function decorated with @tool"
              required
            />
              )}
            </div>
          )}

          {/* Unity Catalog Function */}
          {formData.type === 'unity_catalog' && (
            <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <h4 className="text-sm font-medium text-slate-300">Unity Catalog Function</h4>
              
              {/* Function Source Toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-300">Function Source</label>
                  <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, functionSource: 'configured', ucCatalog: '', ucSchema: '', ucFunction: '' })}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                        formData.functionSource === 'configured'
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                          : 'text-slate-400 border border-transparent hover:text-slate-300'
                      }`}
                    >
                      Configured
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, functionSource: 'select', functionRefName: '' })}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                        formData.functionSource === 'select'
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                          : 'text-slate-400 border border-transparent hover:text-slate-300'
                      }`}
                    >
                      Select
                    </button>
                  </div>
                </div>
              </div>

              {/* Configured Function Selection */}
              {formData.functionSource === 'configured' && (
                <div className="space-y-2">
                  <Select
                    options={[
                      { value: '', label: 'Select a configured function...' },
                      ...configuredFunctionOptions
                    ]}
                    value={formData.functionRefName}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      const value = e.target.value;
                      const func = configuredFunctions[value];
                      const generatedName = generateToolName(func?.name || value);
                      setFormData({ 
                        ...formData, 
                        functionRefName: value, 
                        ucFunction: '',
                        ucCatalog: '',
                        ucSchema: '',
                        // Auto-generate tool name if not manually edited
                        name: nameManuallyEdited ? formData.name : generatedName,
                        // Auto-generate ref name if not manually edited
                        refName: refNameManuallyEdited ? formData.refName : generatedName,
                      });
                    }}
                  />
                  {configuredFunctionOptions.length === 0 && (
                    <p className="text-xs text-amber-400">
                      No functions configured. Add one in Resources → Functions or switch to "Select".
                    </p>
                  )}
                  <p className="text-xs text-slate-500">
                    Select a pre-configured function from the Resources section
                  </p>
                </div>
              )}

              {/* Direct Function Selection */}
              {formData.functionSource === 'select' && (
                <div className="space-y-4">
                  {/* Schema Selection */}
                  <ResourceSelector
                    label="Schema"
                    resourceType="schema"
                    configuredOptions={configuredSchemaOptions}
                    configuredValue={formData.schemaRefName}
                    onConfiguredChange={(value) => {
                      const schema = configuredSchemas[value];
                      setFormData({ 
                        ...formData, 
                        schemaRefName: value,
                        ucCatalog: schema?.catalog_name || '',
                        ucSchema: schema?.schema_name || '',
                        ucFunction: ''
                      });
                    }}
                    source={formData.schemaSource}
                    onSourceChange={(source) => setFormData({ ...formData, schemaSource: source })}
                  >
                    <div className="grid grid-cols-2 gap-4">
              <CatalogSelect
                label="Catalog"
                value={formData.ucCatalog}
                        onChange={(value) => setFormData({ ...formData, ucCatalog: value, ucSchema: '', ucFunction: '', schemaRefName: '' })}
                required
              />
              <SchemaSelect
                label="Schema"
                value={formData.ucSchema}
                        onChange={(value) => setFormData({ ...formData, ucSchema: value, ucFunction: '', schemaRefName: '' })}
                catalog={formData.ucCatalog || null}
                required
              />
                    </div>
                  </ResourceSelector>

                  {/* Function Selection from Schema */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-300">Function</label>
                      {(formData.ucCatalog && formData.ucSchema) || formData.schemaRefName ? (
                    <button
                      type="button"
                      onClick={() => refetchFunctions()}
                      className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                      disabled={ucFunctionsLoading}
                    >
                      <RefreshCw className={`w-3 h-3 ${ucFunctionsLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                      ) : null}
                </div>
                <Select
                  options={ucFunctionOptions}
                  value={formData.ucFunction}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                        const funcFullName = e.target.value;
                        const generatedName = generateToolName(funcFullName);
                        setFormData({ 
                          ...formData, 
                          ucFunction: funcFullName, 
                          functionRefName: '',
                          // Auto-generate tool name if not manually edited
                          name: nameManuallyEdited ? formData.name : generatedName,
                          // Auto-generate ref name if not manually edited
                          refName: refNameManuallyEdited ? formData.refName : generatedName,
                        });
                      }}
                      disabled={(!formData.ucCatalog || !formData.ucSchema) && !formData.schemaRefName || ucFunctionsLoading}
                  required
                />
                {ucFunctionsLoading && (
                  <p className="text-xs text-slate-500">Loading functions...</p>
                )}
                    {!formData.ucCatalog && !formData.ucSchema && !formData.schemaRefName && (
                      <p className="text-xs text-slate-500">Select a schema first to browse functions</p>
                )}
              </div>
            </div>
          )}

              {/* Partial Arguments Section */}
              <div className="space-y-3 pt-3 border-t border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-medium text-slate-300">Partial Arguments</h5>
                    <p className="text-xs text-slate-500">Pre-fill function parameters with static values or variable references</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      ucPartialArgs: [...formData.ucPartialArgs, { id: `arg_${Date.now()}`, name: '', source: 'manual', value: '' }]
                    })}
                    className="flex items-center space-x-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Argument</span>
                  </button>
                </div>

                {formData.ucPartialArgs.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No partial arguments configured. Click "Add Argument" to pre-fill function parameters.</p>
                ) : (
                  <div className="space-y-3">
                    {formData.ucPartialArgs.map((arg, index) => (
                      <div key={arg.id} className="p-3 bg-slate-900/50 rounded-lg border border-slate-600 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 grid grid-cols-2 gap-3">
                            <Input
                              label="Parameter Name"
                              value={arg.name}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                const newArgs = [...formData.ucPartialArgs];
                                newArgs[index] = { ...arg, name: e.target.value };
                                setFormData({ ...formData, ucPartialArgs: newArgs });
                              }}
                              placeholder="e.g., host, client_id"
                            />
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-slate-300">Value Source</label>
                                <div className="inline-flex rounded-lg bg-slate-800 p-0.5 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newArgs = [...formData.ucPartialArgs];
                                      newArgs[index] = { ...arg, source: 'manual', value: '' };
                                      setFormData({ ...formData, ucPartialArgs: newArgs });
                                    }}
                                    className={`px-2 py-1 rounded font-medium transition-all ${
                                      arg.source === 'manual'
                                        ? 'bg-violet-500/20 text-violet-400'
                                        : 'text-slate-400 hover:text-slate-300'
                                    }`}
                                  >
                                    Manual
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newArgs = [...formData.ucPartialArgs];
                                      newArgs[index] = { ...arg, source: 'variable', value: '' };
                                      setFormData({ ...formData, ucPartialArgs: newArgs });
                                    }}
                                    className={`px-2 py-1 rounded font-medium transition-all ${
                                      arg.source === 'variable'
                                        ? 'bg-violet-500/20 text-violet-400'
                                        : 'text-slate-400 hover:text-slate-300'
                                    }`}
                                  >
                                    Variable
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newArgs = [...formData.ucPartialArgs];
                                      newArgs[index] = { ...arg, source: 'service_principal', value: '' };
                                      setFormData({ ...formData, ucPartialArgs: newArgs });
                                    }}
                                    className={`px-2 py-1 rounded font-medium transition-all ${
                                      arg.source === 'service_principal'
                                        ? 'bg-violet-500/20 text-violet-400'
                                        : 'text-slate-400 hover:text-slate-300'
                                    }`}
                                  >
                                    SP
                                  </button>
                                </div>
                              </div>
                              {arg.source === 'manual' && (
                                <Input
                                  value={arg.value}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                    const newArgs = [...formData.ucPartialArgs];
                                    newArgs[index] = { ...arg, value: e.target.value };
                                    setFormData({ ...formData, ucPartialArgs: newArgs });
                                  }}
                                  placeholder="Enter value..."
                                />
                              )}
                              {arg.source === 'variable' && (
                                <Select
                                  value={arg.value}
                                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                                    const newArgs = [...formData.ucPartialArgs];
                                    newArgs[index] = { ...arg, value: e.target.value };
                                    setFormData({ ...formData, ucPartialArgs: newArgs });
                                  }}
                                  options={variableOptions}
                                />
                              )}
                              {arg.source === 'service_principal' && (
                                <Select
                                  value={arg.value}
                                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                                    const newArgs = [...formData.ucPartialArgs];
                                    newArgs[index] = { ...arg, value: e.target.value };
                                    setFormData({ ...formData, ucPartialArgs: newArgs });
                                  }}
                                  options={servicePrincipalOptions}
                                />
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newArgs = formData.ucPartialArgs.filter(a => a.id !== arg.id);
                              setFormData({ ...formData, ucPartialArgs: newArgs });
                            }}
                            className="mt-6 p-1 text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Human In The Loop Configuration - Available for all tool types */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowHitlConfig(!showHitlConfig)}
              className="flex items-center space-x-2 text-sm text-slate-400 hover:text-white transition-colors w-full"
            >
              {showHitlConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <UserCheck className="w-4 h-4" />
              <span>Human In The Loop</span>
              {hitlForm.enabled && (
                <Badge variant="success" className="ml-2">Enabled</Badge>
              )}
            </button>

            {showHitlConfig && (
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
                {/* Enable HITL */}
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="hitlEnabled"
                    checked={hitlForm.enabled}
                    onChange={(e) => setHitlForm({ ...hitlForm, enabled: e.target.checked })}
                    className="mt-1 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                  />
                  <div>
                    <label htmlFor="hitlEnabled" className="block text-sm font-medium text-slate-300 cursor-pointer">
                      Require Human Approval
                    </label>
                    <p className="text-xs text-slate-500 mt-1">
                      Pause execution and request human review before this tool runs.
                    </p>
                  </div>
                </div>

                {hitlForm.enabled && (
                  <>
                    {/* Review Prompt */}
                    <Input
                      label="Review Prompt"
                      value={hitlForm.reviewPrompt}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setHitlForm({ ...hitlForm, reviewPrompt: e.target.value })}
                      placeholder="Please review the tool call"
                      hint="Message shown to the reviewer"
                    />

                    {/* Allowed Decisions */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Allowed Decisions</label>
                      <p className="text-xs text-slate-500 mb-3">
                        Select which decision types the reviewer can choose from
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hitlForm.allowApprove}
                            onChange={(e) => setHitlForm({ ...hitlForm, allowApprove: e.target.checked })}
                            className="rounded border-slate-600 bg-slate-800 text-green-500 focus:ring-green-500"
                          />
                          <span className="text-sm text-slate-400">Approve</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hitlForm.allowEdit}
                            onChange={(e) => setHitlForm({ ...hitlForm, allowEdit: e.target.checked })}
                            className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-400">Edit</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hitlForm.allowReject}
                            onChange={(e) => setHitlForm({ ...hitlForm, allowReject: e.target.checked })}
                            className="rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500"
                          />
                          <span className="text-sm text-slate-400">Reject</span>
                        </label>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        <strong>Approve:</strong> Execute with original arguments • 
                        <strong> Edit:</strong> Modify arguments before execution • 
                        <strong> Reject:</strong> Skip execution
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* MCP Tool Configuration */}
          {formData.type === 'mcp' && (
            <div className="space-y-4">
              {/* MCP Source Type Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">MCP Server Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {MCP_SOURCE_TYPES.map((source) => {
                    const isSelected = mcpForm.sourceType === source.value;
                    return (
                      <button
                        key={source.value}
                        type="button"
                        onClick={() => setMcpForm({ ...mcpForm, sourceType: source.value as MCPFormData['sourceType'] })}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                        }`}
                      >
                        <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                          {source.label}
                        </span>
                        <p className="text-xs text-slate-500 mt-1">{source.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Source-specific configuration */}
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
                {mcpForm.sourceType === 'url' && (
            <Input
                    label="MCP Server URL"
                    placeholder="https://your-workspace.databricks.net/api/2.0/mcp/..."
                    value={mcpForm.url}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setMcpForm({ ...mcpForm, url: e.target.value })}
                    hint="Full URL to the MCP server endpoint"
              required
            />
                )}

                {mcpForm.sourceType === 'genie' && (
                  <>
                    <ResourceSelector
                      label="Genie Room"
                      resourceType="Genie room"
                      configuredOptions={configuredGenieOptions}
                      configuredValue={mcpForm.genieRefName}
                      onConfiguredChange={(value) => {
                        const room = configuredGenieRooms[value];
                        setMcpForm({ 
                          ...mcpForm, 
                          genieRefName: value, 
                          genieSpaceId: '',
                          genieName: room?.name || value,
                          genieDescription: room?.description || ''
                        });
                      }}
                      source={mcpForm.genieSource}
                      onSourceChange={(source) => setMcpForm({ ...mcpForm, genieSource: source })}
                    >
                      <GenieSpaceSelect
                        value={mcpForm.genieSpaceId}
                        onChange={(value) => setMcpForm({ ...mcpForm, genieSpaceId: value, genieRefName: '' })}
                        required
                      />
                    </ResourceSelector>
                    <Input
                      label="Display Name"
                      placeholder="e.g., Retail Genie"
                      value={mcpForm.genieName}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setMcpForm({ ...mcpForm, genieName: e.target.value })}
                    />
                    <Input
                      label="Description (optional)"
                      placeholder="Query retail data using natural language"
                      value={mcpForm.genieDescription}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setMcpForm({ ...mcpForm, genieDescription: e.target.value })}
                    />
                  </>
                )}

                {mcpForm.sourceType === 'vector_search' && (
                  <ResourceSelector
                    label="Vector Store"
                    resourceType="Vector store"
                    configuredOptions={configuredVectorStoreOptions}
                    configuredValue={mcpForm.vectorStoreRefName}
                    onConfiguredChange={(value) => {
                      setMcpForm({ 
                        ...mcpForm, 
                        vectorStoreRefName: value, 
                        vectorEndpoint: '',
                        vectorIndex: '',
                        vectorCatalog: '',
                        vectorSchema: ''
                      });
                    }}
                    source={mcpForm.vectorStoreSource}
                    onSourceChange={(source) => setMcpForm({ ...mcpForm, vectorStoreSource: source })}
                  >
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <CatalogSelect
                          label="Catalog"
                          value={mcpForm.vectorCatalog}
                          onChange={(value) => setMcpForm({ ...mcpForm, vectorCatalog: value, vectorSchema: '', vectorStoreRefName: '' })}
                          required
                        />
                        <SchemaSelect
                          label="Schema"
                          value={mcpForm.vectorSchema}
                          onChange={(value) => setMcpForm({ ...mcpForm, vectorSchema: value, vectorStoreRefName: '' })}
                          catalog={mcpForm.vectorCatalog || null}
                          required
                        />
                      </div>
                      <VectorSearchEndpointSelect
                        label="Vector Search Endpoint"
                        value={mcpForm.vectorEndpoint}
                        onChange={(value) => setMcpForm({ ...mcpForm, vectorEndpoint: value, vectorIndex: '', vectorStoreRefName: '' })}
                        required
                      />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium text-slate-300">Vector Index</label>
                          {mcpForm.vectorEndpoint && (
                            <button
                              type="button"
                              onClick={() => refetchMcpIndexes()}
                              className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                              disabled={mcpVectorIndexesLoading}
                            >
                              <RefreshCw className={`w-3 h-3 ${mcpVectorIndexesLoading ? 'animate-spin' : ''}`} />
                              <span>Refresh</span>
                            </button>
                          )}
                        </div>
                        <Select
                          options={mcpVectorIndexOptions}
                          value={mcpForm.vectorIndex}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => setMcpForm({ ...mcpForm, vectorIndex: e.target.value })}
                          disabled={!mcpForm.vectorEndpoint || mcpVectorIndexesLoading}
                          required
                        />
                      </div>
                    </div>
                  </ResourceSelector>
                )}

                {mcpForm.sourceType === 'functions' && (
                  <ResourceSelector
                    label="Schema"
                    resourceType="schema"
                    configuredOptions={configuredSchemaOptions}
                    configuredValue={mcpForm.schemaRefName}
                    onConfiguredChange={(value) => {
                      const schema = configuredSchemas[value];
                      setMcpForm({ 
                        ...mcpForm, 
                        schemaRefName: value,
                        functionsCatalog: schema?.catalog_name || '',
                        functionsSchema: schema?.schema_name || ''
                      });
                    }}
                    source={mcpForm.schemaSource}
                    onSourceChange={(source) => setMcpForm({ ...mcpForm, schemaSource: source })}
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <CatalogSelect
                        label="Catalog"
                        value={mcpForm.functionsCatalog}
                        onChange={(value) => setMcpForm({ ...mcpForm, functionsCatalog: value, functionsSchema: '', schemaRefName: '' })}
                        required
                      />
                      <SchemaSelect
                        label="Schema"
                        value={mcpForm.functionsSchema}
                        onChange={(value) => setMcpForm({ ...mcpForm, functionsSchema: value, schemaRefName: '' })}
                        catalog={mcpForm.functionsCatalog || null}
                        required
                      />
                    </div>
                  </ResourceSelector>
                )}

                {mcpForm.sourceType === 'sql' && (
                  <div className="p-3 bg-slate-900/50 rounded-lg">
                    <p className="text-sm text-slate-300">
                      <strong>Databricks SQL MCP</strong> - Enables serverless SQL execution without requiring a warehouse.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      The sql: true flag will be set automatically.
                    </p>
                  </div>
                )}

                {mcpForm.sourceType === 'connection' && (
                  <ResourceSelector
                    label="UC Connection"
                    resourceType="connection"
                    configuredOptions={configuredConnectionOptions}
                    configuredValue={mcpForm.connectionRefName}
                    onConfiguredChange={(value) => {
                      const conn = configuredConnections[value];
                      setMcpForm({ 
                        ...mcpForm, 
                        connectionRefName: value,
                        connectionName: conn?.name || ''
                      });
                    }}
                    source={mcpForm.connectionSource}
                    onSourceChange={(source) => setMcpForm({ ...mcpForm, connectionSource: source })}
                  >
                    <UCConnectionSelect
                      label="Select Connection"
                      value={mcpForm.connectionName}
                      onChange={(value) => setMcpForm({ ...mcpForm, connectionName: value, connectionRefName: '' })}
                      required
                    />
                  </ResourceSelector>
                )}
              </div>

              {/* Credentials Configuration */}
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-slate-300">Authentication</h4>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mcpForm.useCredentials}
                      onChange={(e) => setMcpForm({ ...mcpForm, useCredentials: e.target.checked })}
                      className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-400">Use credentials</span>
                  </label>
                </div>

                {mcpForm.useCredentials && (
                  <div className="space-y-4">
                    {/* Credentials Mode Toggle */}
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setMcpForm({ ...mcpForm, credentialsMode: 'service_principal' })}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                          mcpForm.credentialsMode === 'service_principal'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        Configured Service Principal
                      </button>
                      <button
                        type="button"
                        onClick={() => setMcpForm({ ...mcpForm, credentialsMode: 'manual' })}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                          mcpForm.credentialsMode === 'manual'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        Manual Credentials
                      </button>
                    </div>
                    
                    {mcpForm.credentialsMode === 'service_principal' ? (
                      <div className="space-y-2">
                        <Select
                          label="Service Principal"
                          options={[
                            { value: '', label: 'Select a service principal...' },
                            ...Object.keys(config.service_principals || {}).map((sp) => ({
                              value: sp,
                              label: sp,
                            })),
                          ]}
                          value={mcpForm.servicePrincipalRef}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => setMcpForm({ ...mcpForm, servicePrincipalRef: e.target.value })}
                          hint="Reference a pre-configured service principal"
                        />
                        {Object.keys(config.service_principals || {}).length === 0 && (
                          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-400 text-xs">
                            No service principals configured. Add one in Resources → Service Principals first.
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Client ID */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-300">Client ID</label>
                            <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
                              <button
                                type="button"
                                onClick={() => setMcpForm({ ...mcpForm, clientIdSource: 'variable' })}
                                className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                                  mcpForm.clientIdSource === 'variable'
                                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                                    : 'text-slate-400 border border-transparent hover:text-slate-300'
                                }`}
                              >
                                Variable
                              </button>
                              <button
                                type="button"
                                onClick={() => setMcpForm({ ...mcpForm, clientIdSource: 'manual' })}
                                className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                                  mcpForm.clientIdSource === 'manual'
                                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                                    : 'text-slate-400 border border-transparent hover:text-slate-300'
                                }`}
                              >
                                Manual
                              </button>
                            </div>
                          </div>
                          {mcpForm.clientIdSource === 'variable' ? (
                            <Select
                              options={[
                                { value: '', label: 'Select a variable...' },
                                ...variableNames.map((name) => ({
                                  value: name,
                                  label: `${name} (${getVariableDisplayName(variables[name])})`,
                                })),
                              ]}
                              value={mcpForm.clientIdVar}
                              onChange={(e: ChangeEvent<HTMLSelectElement>) => setMcpForm({ ...mcpForm, clientIdVar: e.target.value })}
                              hint={variableNames.length === 0 ? 'Define variables in the Variables section first' : undefined}
                            />
                          ) : (
                            <Input
                              placeholder="Enter client ID..."
                              value={mcpForm.clientIdManual}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => setMcpForm({ ...mcpForm, clientIdManual: e.target.value })}
                            />
                          )}
                        </div>

                    {/* Client Secret */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-300">Client Secret</label>
                        <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
                          <button
                            type="button"
                            onClick={() => setMcpForm({ ...mcpForm, clientSecretSource: 'variable' })}
                            className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                              mcpForm.clientSecretSource === 'variable'
                                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                                : 'text-slate-400 border border-transparent hover:text-slate-300'
                            }`}
                          >
                            Variable
                          </button>
                          <button
                            type="button"
                            onClick={() => setMcpForm({ ...mcpForm, clientSecretSource: 'manual' })}
                            className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                              mcpForm.clientSecretSource === 'manual'
                                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                                : 'text-slate-400 border border-transparent hover:text-slate-300'
                            }`}
                          >
                            Manual
                          </button>
                        </div>
                      </div>
                      {mcpForm.clientSecretSource === 'variable' ? (
                        <Select
                          options={[
                            { value: '', label: 'Select a variable...' },
                            ...variableNames.map((name) => ({
                              value: name,
                              label: `${name} (${getVariableDisplayName(variables[name])})`,
                            })),
                          ]}
                          value={mcpForm.clientSecretVar}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => setMcpForm({ ...mcpForm, clientSecretVar: e.target.value })}
                          hint={variableNames.length === 0 ? 'Define variables in the Variables section first' : undefined}
                        />
                      ) : (
                        <Input
                          type="password"
                          placeholder="Enter client secret..."
                          value={mcpForm.clientSecretManual}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setMcpForm({ ...mcpForm, clientSecretManual: e.target.value })}
                        />
                      )}
                    </div>

                        {/* Workspace Host (Optional) */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-300">
                              Workspace Host <span className="text-slate-500">(Optional)</span>
                            </label>
                            <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
                              <button
                                type="button"
                                onClick={() => setMcpForm({ ...mcpForm, workspaceHostSource: 'variable' })}
                                className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                                  mcpForm.workspaceHostSource === 'variable'
                                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                                    : 'text-slate-400 border border-transparent hover:text-slate-300'
                                }`}
                              >
                                Variable
                              </button>
                              <button
                                type="button"
                                onClick={() => setMcpForm({ ...mcpForm, workspaceHostSource: 'manual' })}
                                className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                                  mcpForm.workspaceHostSource === 'manual'
                                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                                    : 'text-slate-400 border border-transparent hover:text-slate-300'
                                }`}
                              >
                                Manual
                              </button>
                            </div>
                          </div>
                          {mcpForm.workspaceHostSource === 'variable' ? (
                            <Select
                              options={[
                                { value: '', label: 'Select a variable...' },
                                ...variableNames.map((name) => ({
                                  value: name,
                                  label: `${name} (${getVariableDisplayName(variables[name])})`,
                                })),
                              ]}
                              value={mcpForm.workspaceHostVar}
                              onChange={(e: ChangeEvent<HTMLSelectElement>) => setMcpForm({ ...mcpForm, workspaceHostVar: e.target.value })}
                              hint={variableNames.length === 0 ? 'Define variables in the Variables section first' : undefined}
                            />
                          ) : (
                            <Input
                              placeholder="https://your-workspace.cloud.databricks.com"
                              value={mcpForm.workspaceHostManual}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => setMcpForm({ ...mcpForm, workspaceHostManual: e.target.value })}
                            />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => {
              setIsModalOpen(false);
              resetForm();
            }}>
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={
                !formData.name ||
                (formData.type === 'mcp' && mcpForm.sourceType === 'connection' && 
                  !((mcpForm.connectionSource === 'configured' && mcpForm.connectionRefName) ||
                    (mcpForm.connectionSource === 'select' && mcpForm.connectionName)))
              }
            >
              {editingKey ? 'Save Changes' : 'Add Tool'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
