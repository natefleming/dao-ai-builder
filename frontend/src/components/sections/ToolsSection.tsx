import { useState, ChangeEvent } from 'react';
import { Plus, Trash2, Wrench, RefreshCw, Globe, Database, MessageSquare, Search, Clock, Bot, Link2, UserCheck, ChevronDown, ChevronUp, Layers, Key } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { ToolFunctionModel, McpFunctionModel, HumanInTheLoopModel } from '@/types/dao-ai-types';
import { CatalogSelect, SchemaSelect, GenieSpaceSelect, VectorSearchEndpointSelect, UCConnectionSelect } from '../ui/DatabricksSelect';
import { useFunctions, useVectorSearchIndexes } from '@/hooks/useDatabricks';

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
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => onSourceChange('configured')}
            className={`px-2 py-1 text-xs rounded flex items-center space-x-1 ${
              source === 'configured' ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-700 text-slate-400'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Configured</span>
          </button>
          <button
            type="button"
            onClick={() => onSourceChange('select')}
            className={`px-2 py-1 text-xs rounded ${
              source === 'select' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
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
    value: 'dao_ai.tools.search_tool', 
    label: 'Web Search Tool',
    description: 'Search the web for information',
    icon: Globe,
  },
  { 
    value: 'dao_ai.tools.create_send_slack_message_tool', 
    label: 'Slack Message Tool',
    description: 'Send messages to Slack channels',
    icon: MessageSquare,
  },
  { 
    value: 'dao_ai.tools.create_uc_tools', 
    label: 'Unity Catalog Tools',
    description: 'Execute Unity Catalog functions',
    icon: Database,
  },
  { 
    value: 'dao_ai.tools.create_agent_endpoint_tool', 
    label: 'Agent Endpoint Tool',
    description: 'Call another deployed agent endpoint',
    icon: Bot,
  },
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
    value: 'databricks_langchain.vector_search_retriever_tool.VectorSearchRetrieverTool', 
    label: 'Databricks Vector Search Retriever',
    description: 'Native Databricks vector search retriever tool',
    icon: Search,
  },
  { 
    value: 'custom', 
    label: 'Custom Factory...',
    description: 'Specify a custom factory function path',
    icon: Wrench,
  },
];

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
  allowAccept: boolean;
  allowEdit: boolean;
  allowRespond: boolean;
  allowDecline: boolean;
  declineMessage: string;
  customActions: { key: string; value: string }[];
}

const defaultHITLFormData: HITLFormData = {
  enabled: false,
  reviewPrompt: 'Please review the tool call',
  allowAccept: true,
  allowEdit: true,
  allowRespond: true,
  allowDecline: true,
  declineMessage: 'Tool call declined by user',
  customActions: [],
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
  return baseName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export default function ToolsSection() {
  const { config, addTool, removeTool } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'factory' as 'factory' | 'python' | 'unity_catalog' | 'mcp',
    functionName: '',
    customFunctionName: '',
    args: '{}',
    // For Genie tool - with resource source
    genieSource: 'configured' as ResourceSource, // Default to configured
    genieRefName: '', // Reference to configured genie room
    genieSpaceId: '',
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
  });
  
  const [mcpForm, setMcpForm] = useState<MCPFormData>(defaultMCPFormData);
  const [hitlForm, setHitlForm] = useState<HITLFormData>(defaultHITLFormData);
  const [showHitlConfig, setShowHitlConfig] = useState(false);

  // Get configured resources from store
  const configuredGenieRooms = config.resources?.genie_rooms || {};
  const configuredVectorStores = config.resources?.vector_stores || {};
  const configuredRetrievers = config.retrievers || {};
  const configuredSchemas = config.schemas || {};
  const configuredFunctions = config.resources?.functions || {};
  const configuredConnections = config.resources?.connections || {};

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

  const tools = config.tools || {};
  const variables = config.variables || {};

  // Get available variable names for dropdowns
  const variableNames = Object.keys(variables);

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

    const config: HumanInTheLoopModel = {
      review_prompt: hitlForm.reviewPrompt,
      interrupt_config: {
        allow_accept: hitlForm.allowAccept,
        allow_edit: hitlForm.allowEdit,
        allow_respond: hitlForm.allowRespond,
        allow_decline: hitlForm.allowDecline,
      },
      decline_message: hitlForm.declineMessage,
    };

    if (hitlForm.customActions.length > 0) {
      config.custom_actions = {};
      hitlForm.customActions.forEach(action => {
        if (action.key && action.value) {
          config.custom_actions![action.key] = action.value;
        }
      });
    }

    return config;
  };

  const buildMcpFunction = (): McpFunctionModel => {
    const base: McpFunctionModel = {
      type: 'mcp',
      name: formData.name,
    };

    // Add credentials if enabled
    if (mcpForm.useCredentials) {
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
    
    if (!formData.name) return;

    let functionConfig: ToolFunctionModel;
    const hitlConfig = buildHITLConfig();

    if (formData.type === 'factory') {
      let parsedArgs: Record<string, unknown> = {};
      
      // Build args based on selected factory tool
      if (formData.functionName === 'dao_ai.tools.create_genie_tool') {
        // If using a configured genie room, reference it directly
        if (formData.genieSource === 'configured' && formData.genieRefName) {
          parsedArgs = {
            name: formData.name,
            description: `Tool for querying via Genie`,
            genie_room: `__REF__${formData.genieRefName}`,
          };
        } else {
          // Direct selection - use space_id object
          parsedArgs = {
            name: formData.name,
            description: `Tool for querying via Genie`,
            genie_room: {
              space_id: formData.genieSpaceId,
            },
          };
        }
      } else if (formData.functionName === 'dao_ai.tools.create_vector_search_tool' ||
                 formData.functionName === 'databricks_langchain.vector_search_retriever_tool.VectorSearchRetrieverTool') {
        // Vector search tool uses a retriever reference
        if (formData.retrieverSource === 'configured' && formData.retrieverRefName) {
          parsedArgs = {
            name: formData.name,
            description: `Search using vector embeddings`,
            retriever: `__REF__${formData.retrieverRefName}`,
          };
        } else {
          // Direct selection - use specific fields (index name from endpoint)
          parsedArgs = {
            name: formData.name,
            description: `Search using vector embeddings`,
            index_name: formData.vectorIndex,
          };
        }
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
      // If using a configured function resource, use YAML merge reference
      if (formData.functionSource === 'configured' && formData.functionRefName) {
        functionConfig = {
          type: 'unity_catalog',
          __MERGE__: formData.functionRefName, // Will be converted to <<: *ref in YAML
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

    addTool({
      name: formData.name,
      function: functionConfig,
    });
    
    resetForm();
    setIsModalOpen(false);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'factory',
      functionName: '',
      customFunctionName: '',
      args: '{}',
      genieSource: 'configured',
      genieRefName: '',
      genieSpaceId: '',
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
              <Card key={key} variant="interactive" className="group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">{tool.name}</h3>
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
                      variant="danger"
                      size="sm"
                      onClick={() => removeTool(key)}
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
        title="Add Tool"
        description="Configure a tool for your agents"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tool Name"
              placeholder="e.g., genie_tool"
              value={formData.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Select
              label="Tool Type"
              options={TOOL_TYPES}
              value={formData.type}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, type: e.target.value as 'factory' | 'python' | 'unity_catalog' | 'mcp' })}
            />
          </div>

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
                        onClick={() => setFormData({ 
                          ...formData, 
                          functionName: tool.value,
                          // Auto-generate tool name if not already set
                          name: formData.name || generateToolName(tool.value),
                        })}
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
                </div>
              )}

              {/* Vector Search Tool Configuration */}
              {(formData.functionName === 'dao_ai.tools.create_vector_search_tool' ||
                formData.functionName === 'databricks_langchain.vector_search_retriever_tool.VectorSearchRetrieverTool') && (
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

              {/* JSON args for custom or tools that need it */}
              {(formData.functionName === 'custom' || 
                formData.functionName === 'dao_ai.tools.search_tool' ||
                formData.functionName === 'dao_ai.tools.create_send_slack_message_tool' ||
                formData.functionName === 'dao_ai.tools.create_agent_endpoint_tool') && (
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
            <Input
              label="Python Function Path"
              placeholder="e.g., my_package.tools.my_function"
              value={formData.functionName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const funcName = e.target.value;
                setFormData({ 
                  ...formData, 
                  functionName: funcName,
                  // Auto-generate tool name if not already set
                  name: formData.name || generateToolName(funcName),
                });
              }}
              hint="Fully qualified Python function path"
              required
            />
          )}

          {/* Unity Catalog Function */}
          {formData.type === 'unity_catalog' && (
            <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <h4 className="text-sm font-medium text-slate-300">Unity Catalog Function</h4>
              
              {/* Function Source Toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-300">Function Source</label>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, functionSource: 'configured', ucCatalog: '', ucSchema: '', ucFunction: '' })}
                      className={`px-2 py-1 text-xs rounded flex items-center space-x-1 ${
                        formData.functionSource === 'configured' ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      <Layers className="w-3 h-3" />
                      <span>Configured</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, functionSource: 'select', functionRefName: '' })}
                      className={`px-2 py-1 text-xs rounded ${
                        formData.functionSource === 'select' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
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
                      setFormData({ 
                        ...formData, 
                        functionRefName: value, 
                        ucFunction: '',
                        ucCatalog: '',
                        ucSchema: '',
                        // Auto-generate tool name if not already set
                        name: formData.name || generateToolName(func?.name || value),
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
                        setFormData({ 
                          ...formData, 
                          ucFunction: funcFullName, 
                          functionRefName: '',
                          // Auto-generate tool name if not already set
                          name: formData.name || generateToolName(funcFullName),
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

                    {/* Interrupt Config */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Allowed Actions</label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hitlForm.allowAccept}
                            onChange={(e) => setHitlForm({ ...hitlForm, allowAccept: e.target.checked })}
                            className="rounded border-slate-600 bg-slate-800 text-green-500 focus:ring-green-500"
                          />
                          <span className="text-sm text-slate-400">Accept</span>
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
                            checked={hitlForm.allowRespond}
                            onChange={(e) => setHitlForm({ ...hitlForm, allowRespond: e.target.checked })}
                            className="rounded border-slate-600 bg-slate-800 text-yellow-500 focus:ring-yellow-500"
                          />
                          <span className="text-sm text-slate-400">Respond</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hitlForm.allowDecline}
                            onChange={(e) => setHitlForm({ ...hitlForm, allowDecline: e.target.checked })}
                            className="rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500"
                          />
                          <span className="text-sm text-slate-400">Decline</span>
                        </label>
                      </div>
                    </div>

                    {/* Decline Message */}
                    <Input
                      label="Decline Message"
                      value={hitlForm.declineMessage}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setHitlForm({ ...hitlForm, declineMessage: e.target.value })}
                      placeholder="Tool call declined by user"
                      hint="Message returned when the user declines"
                    />

                    {/* Custom Actions */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-slate-300">Custom Actions</label>
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() => setHitlForm({
                            ...hitlForm,
                            customActions: [...hitlForm.customActions, { key: '', value: '' }]
                          })}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Action
                        </Button>
                      </div>
                      {hitlForm.customActions.map((action, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <Input
                            placeholder="Action key"
                            value={action.key}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                              const newActions = [...hitlForm.customActions];
                              newActions[index].key = e.target.value;
                              setHitlForm({ ...hitlForm, customActions: newActions });
                            }}
                            className="flex-1"
                          />
                          <Input
                            placeholder="Action description"
                            value={action.value}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                              const newActions = [...hitlForm.customActions];
                              newActions[index].value = e.target.value;
                              setHitlForm({ ...hitlForm, customActions: newActions });
                            }}
                            className="flex-1"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => {
                              setHitlForm({
                                ...hitlForm,
                                customActions: hitlForm.customActions.filter((_, i) => i !== index)
                              });
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      ))}
                      <p className="text-xs text-slate-500">
                        Custom actions allow you to define additional buttons/responses for the reviewer.
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
                    {/* Client ID */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-300">Client ID</label>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setMcpForm({ ...mcpForm, clientIdSource: 'variable' })}
                            className={`px-2 py-1 text-xs rounded flex items-center space-x-1 ${
                              mcpForm.clientIdSource === 'variable' ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            <Key className="w-3 h-3" />
                            <span>Variable</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMcpForm({ ...mcpForm, clientIdSource: 'manual' })}
                            className={`px-2 py-1 text-xs rounded ${
                              mcpForm.clientIdSource === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
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
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setMcpForm({ ...mcpForm, clientSecretSource: 'variable' })}
                            className={`px-2 py-1 text-xs rounded flex items-center space-x-1 ${
                              mcpForm.clientSecretSource === 'variable' ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            <Key className="w-3 h-3" />
                            <span>Variable</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMcpForm({ ...mcpForm, clientSecretSource: 'manual' })}
                            className={`px-2 py-1 text-xs rounded ${
                              mcpForm.clientSecretSource === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
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
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setMcpForm({ ...mcpForm, workspaceHostSource: 'variable' })}
                            className={`px-2 py-1 text-xs rounded flex items-center space-x-1 ${
                              mcpForm.workspaceHostSource === 'variable' ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            <Key className="w-3 h-3" />
                            <span>Variable</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMcpForm({ ...mcpForm, workspaceHostSource: 'manual' })}
                            className={`px-2 py-1 text-xs rounded ${
                              mcpForm.workspaceHostSource === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
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
              Add Tool
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
