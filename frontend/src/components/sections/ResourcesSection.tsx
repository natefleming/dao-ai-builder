/**
 * Resources Section - Configure Databricks resources that can be referenced throughout the configuration.
 * 
 * Supports:
 * - LLMs (Language Models)
 * - Genie Rooms (with space_id selector)
 * - Tables (with catalog/schema/table selector)
 * - Volumes (with catalog/schema/volume selector)  
 * - Functions (with catalog/schema/function selector)
 * - Warehouses (with warehouse_id selector)
 * - Connections (UC connections)
 */
import { useState, ChangeEvent } from 'react';
import { 
  MessageSquare, 
  Table2, 
  FolderOpen, 
  Code2, 
  Database, 
  Link,
  Plus, 
  Trash2, 
  Edit2,
  Info,
  UserCheck,
  Cpu,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Layers,
  User,
  Server,
  CloudCog,
  Key,
  Loader2,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { StatusSelect, StatusSelectOption, StatusType } from '@/components/ui/StatusSelect';
import { useConfigStore } from '@/stores/configStore';
import { 
  GenieRoomModel, 
  TableModel, 
  VolumeModel, 
  FunctionModel, 
  WarehouseModel, 
  ConnectionModel,
  LLMModel,
  DatabaseModel,
  VariableModel,
  VectorStoreModel,
} from '@/types/dao-ai-types';
import { 
  useGenieSpaces, 
  useSQLWarehouses,
  useCatalogs,
  useSchemas,
  useTables,
  useTableColumns,
  useFunctions,
  useVolumes,
  useServingEndpoints,
  useUCConnections,
  useDatabases,
  useVectorSearchEndpoints,
  useVectorSearchIndexes,
} from '@/hooks/useDatabricks';

type ResourceType = 'llms' | 'genie_rooms' | 'tables' | 'volumes' | 'functions' | 'warehouses' | 'connections' | 'databases' | 'vector_stores';

interface ResourceTab {
  id: ResourceType;
  label: string;
  icon: typeof MessageSquare;
  description: string;
}

const RESOURCE_TABS: ResourceTab[] = [
  { id: 'llms', label: 'LLMs', icon: Cpu, description: 'Language models' },
  { id: 'genie_rooms', label: 'Genie Rooms', icon: MessageSquare, description: 'AI-powered data assistants' },
  { id: 'warehouses', label: 'SQL Warehouses', icon: Database, description: 'SQL compute resources' },
  { id: 'tables', label: 'Tables', icon: Table2, description: 'Unity Catalog tables' },
  { id: 'volumes', label: 'Volumes', icon: FolderOpen, description: 'Unity Catalog volumes' },
  { id: 'functions', label: 'Functions', icon: Code2, description: 'Unity Catalog functions' },
  { id: 'connections', label: 'Connections', icon: Link, description: 'External connections' },
  { id: 'databases', label: 'Databases', icon: Server, description: 'Lakebase/PostgreSQL backends' },
  { id: 'vector_stores', label: 'Vector Stores', icon: Layers, description: 'Vector search indexes' },
];

const COMMON_MODELS = [
  { value: 'databricks-claude-3-7-sonnet', label: 'Claude 3.7 Sonnet' },
  { value: 'databricks-claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'databricks-meta-llama-3-3-70b-instruct', label: 'Llama 3.3 70B Instruct' },
  { value: 'databricks-meta-llama-3-1-405b-instruct', label: 'Llama 3.1 405B Instruct' },
  { value: 'databricks-meta-llama-3-1-8b-instruct', label: 'Llama 3.1 8B Instruct' },
  { value: 'databricks-dbrx-instruct', label: 'DBRX Instruct' },
  { value: 'databricks-gte-large-en', label: 'GTE Large (Embeddings)' },
];

/**
 * Generate a normalized reference name from an asset name.
 * - Converts to lowercase
 * - Replaces consecutive whitespace/special chars with single underscore
 * - Removes leading/trailing underscores
 */
function generateRefName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric chars with underscore
    .replace(/_+/g, '_')          // Collapse multiple underscores
    .replace(/^_|_$/g, '');       // Remove leading/trailing underscores
}

export function ResourcesSection() {
  const { config } = useConfigStore();
  const resources = config.resources;
  
  const [activeTab, setActiveTab] = useState<ResourceType>('llms');
  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingKey(null);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'llms':
        return <LLMsPanel />;
      case 'genie_rooms':
        return <GenieRoomsPanel showForm={showForm} setShowForm={setShowForm} editingKey={editingKey} setEditingKey={setEditingKey} onClose={handleCloseForm} />;
      case 'warehouses':
        return <WarehousesPanel showForm={showForm} setShowForm={setShowForm} editingKey={editingKey} setEditingKey={setEditingKey} onClose={handleCloseForm} />;
      case 'tables':
        return <TablesPanel showForm={showForm} setShowForm={setShowForm} editingKey={editingKey} setEditingKey={setEditingKey} onClose={handleCloseForm} />;
      case 'volumes':
        return <VolumesPanel showForm={showForm} setShowForm={setShowForm} editingKey={editingKey} setEditingKey={setEditingKey} onClose={handleCloseForm} />;
      case 'functions':
        return <FunctionsPanel showForm={showForm} setShowForm={setShowForm} editingKey={editingKey} setEditingKey={setEditingKey} onClose={handleCloseForm} />;
      case 'connections':
        return <ConnectionsPanel showForm={showForm} setShowForm={setShowForm} editingKey={editingKey} setEditingKey={setEditingKey} onClose={handleCloseForm} />;
      case 'databases':
        return <DatabasesPanel showForm={showForm} setShowForm={setShowForm} editingKey={editingKey} setEditingKey={setEditingKey} onClose={handleCloseForm} />;
      case 'vector_stores':
        return <VectorStoresPanel showForm={showForm} setShowForm={setShowForm} editingKey={editingKey} setEditingKey={setEditingKey} onClose={handleCloseForm} />;
      default:
        return null;
    }
  };

  const getResourceCount = (type: ResourceType): number => {
    switch (type) {
      case 'llms': return Object.keys(resources?.llms || {}).length;
      case 'genie_rooms': return Object.keys(resources?.genie_rooms || {}).length;
      case 'tables': return Object.keys(resources?.tables || {}).length;
      case 'volumes': return Object.keys(resources?.volumes || {}).length;
      case 'functions': return Object.keys(resources?.functions || {}).length;
      case 'warehouses': return Object.keys(resources?.warehouses || {}).length;
      case 'connections': return Object.keys(resources?.connections || {}).length;
      case 'databases': return Object.keys(resources?.databases || {}).length;
      case 'vector_stores': return Object.keys(resources?.vector_stores || {}).length;
      default: return 0;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Resources</h2>
        <p className="text-slate-400 mt-1">
          Configure Databricks resources that can be referenced in tools, agents, and other parts of your configuration.
        </p>
      </div>

      {/* Info Card */}
      <Card className="p-4 bg-blue-900/20 border-blue-500/30">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-300">
            <p className="font-medium">Resource References</p>
            <p className="mt-1 text-blue-400/80">
              Resources defined here can be referenced by their <strong>reference name</strong> (the key) 
              in tools and other configuration sections. For example, a Genie room named "retail_genie" 
              can be used in tools to create Genie-powered assistants.
            </p>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-700 pb-4">
        {RESOURCE_TABS.map((tab) => {
          const Icon = tab.icon;
          const count = getResourceCount(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setShowForm(false);
                setEditingKey(null);
              }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {count > 0 && (
                <Badge variant="default" className="ml-1">{count}</Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {renderTabContent()}
      </div>
    </div>
  );
}

// =============================================================================
// Panel Props Interface
// =============================================================================
interface PanelProps {
  showForm: boolean;
  setShowForm: (show: boolean) => void;
  editingKey: string | null;
  setEditingKey: (key: string | null) => void;
  onClose: () => void;
}

// =============================================================================
// Fallback Item Component
// =============================================================================
type FallbackSource = 'reference' | 'endpoint';

interface FallbackItemProps {
  index: number;
  fallback: string;
  isReference: boolean;
  refKey: string | null;
  hasConfiguredLLMs: boolean;
  llms: Record<string, LLMModel>;
  endpoints: { name: string; state?: { ready?: string; config_update?: string } }[];
  editingKey: string | null;
  formDataName: string;
  onUpdate: (value: string) => void;
  onRemove: () => void;
  getEndpointStatus: (state: { ready?: string; config_update?: string } | undefined) => StatusType;
}

function FallbackItem({
  index,
  fallback,
  isReference,
  refKey,
  hasConfiguredLLMs,
  llms,
  endpoints,
  editingKey,
  formDataName,
  onUpdate,
  onRemove,
  getEndpointStatus,
}: FallbackItemProps) {
  const [source, setSource] = useState<FallbackSource>(isReference ? 'reference' : 'endpoint');
  
  // Available configured LLMs (excluding the one being edited)
  const availableLLMs = Object.entries(llms)
    .filter(([key]) => key !== editingKey && key !== formDataName)
    .map(([key, llm]) => ({
      value: `ref:${key}`,
      label: `*${key} → ${llm.name}`,
    }));
  
  // Available endpoints with status
  const availableEndpoints: StatusSelectOption[] = endpoints.map((e) => ({
    value: e.name,
    label: e.name,
    status: getEndpointStatus(e.state),
  }));

  const handleSourceChange = (newSource: FallbackSource) => {
    setSource(newSource);
    onUpdate(''); // Clear selection when switching source
  };

  return (
    <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 font-medium">Fallback #{index + 1}</span>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onRemove}
        >
          <Trash2 className="w-3 h-3 text-red-400" />
        </Button>
      </div>

      {/* Source Toggle */}
      {hasConfiguredLLMs && (
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => handleSourceChange('reference')}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              source === 'reference'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
            }`}
          >
            Use Configured LLM
          </button>
          <button
            type="button"
            onClick={() => handleSourceChange('endpoint')}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              source === 'endpoint'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
            }`}
          >
            Select Endpoint
          </button>
        </div>
      )}

      {/* Selection based on source */}
      {source === 'reference' && hasConfiguredLLMs ? (
        <div className="space-y-2">
          <Select
            value={fallback}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => onUpdate(e.target.value)}
            options={[
              { value: '', label: 'Select a configured LLM...' },
              ...availableLLMs,
            ]}
          />
          {isReference && refKey && llms[refKey] && (
            <div className="p-2 bg-slate-800/50 rounded text-xs">
              <span className="text-blue-400">YAML output:</span>{' '}
              <code className="text-slate-300">*{refKey}</code>
              <span className="text-slate-500 ml-2">→ {llms[refKey].name}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <StatusSelect
            value={fallback.startsWith('ref:') ? '' : fallback}
            onChange={onUpdate}
            options={[
              { value: '', label: 'Select an endpoint...' },
              ...availableEndpoints,
            ]}
            placeholder="Select an endpoint..."
          />
          {fallback && !fallback.startsWith('ref:') && (
            <div className="p-2 bg-slate-800/50 rounded text-xs">
              <span className="text-green-400">YAML output:</span>{' '}
              <code className="text-slate-300">{fallback}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// LLMs Panel
// =============================================================================
type ModelSource = 'preset' | 'endpoint' | 'custom';

function LLMsPanel() {
  const { config, addLLM, removeLLM, updateLLM } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [modelSource, setModelSource] = useState<ModelSource>('preset');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    modelName: '',
    customModelName: '',
    temperature: '0.1',
    maxTokens: '8192',
    onBehalfOfUser: false,
    fallbacks: [] as string[],
  });

  const { data: endpoints, loading: endpointsLoading, refetch: refetchEndpoints } = useServingEndpoints();

  const llms = config.resources?.llms || {};

  const resetForm = () => {
    setFormData({
      name: '',
      modelName: '',
      customModelName: '',
      temperature: '0.1',
      maxTokens: '8192',
      onBehalfOfUser: false,
      fallbacks: [],
    });
    setModelSource('preset');
    setShowAdvanced(false);
    setEditingKey(null);
  };

  const handleEdit = (key: string, llm: LLMModel) => {
    setEditingKey(key);
    // Convert fallbacks: if it matches a configured LLM key, prefix with ref:
    const convertedFallbacks = (llm.fallbacks || []).map(f => {
      const fallbackName = typeof f === 'string' ? f : f.name;
      // Check if this fallback matches a configured LLM key
      if (Object.keys(llms).includes(fallbackName) && fallbackName !== key) {
        return `ref:${fallbackName}`;
      }
      return fallbackName;
    });
    
    setFormData({
      name: key,
      modelName: llm.name,
      customModelName: llm.name,
      temperature: String(llm.temperature ?? 0.1),
      maxTokens: String(llm.max_tokens ?? 8192),
      onBehalfOfUser: llm.on_behalf_of_user ?? false,
      fallbacks: convertedFallbacks,
    });
    
    // Detect model source
    if (COMMON_MODELS.some(m => m.value === llm.name)) {
      setModelSource('preset');
    } else if (endpoints?.some(e => e.name === llm.name)) {
      setModelSource('endpoint');
    } else {
      setModelSource('custom');
    }
    
    setShowAdvanced(!!(llm.on_behalf_of_user || (llm.fallbacks && llm.fallbacks.length > 0)));
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let modelName = '';
    
    switch (modelSource) {
      case 'preset':
        modelName = formData.modelName;
        break;
      case 'endpoint':
        modelName = formData.modelName;
        break;
      case 'custom':
        modelName = formData.customModelName;
        break;
    }
    
    if (formData.name && modelName) {
      const llmConfig: LLMModel = {
        name: modelName,
        temperature: parseFloat(formData.temperature),
        max_tokens: parseInt(formData.maxTokens),
      };

      if (formData.onBehalfOfUser) {
        llmConfig.on_behalf_of_user = true;
      }

      if (formData.fallbacks.length > 0) {
        llmConfig.fallbacks = formData.fallbacks;
      }

      if (editingKey) {
        // If key changed, remove old and add new
        if (editingKey !== formData.name) {
          removeLLM(editingKey);
          addLLM(formData.name, llmConfig);
        } else {
          updateLLM(editingKey, llmConfig);
        }
      } else {
        addLLM(formData.name, llmConfig);
      }

      resetForm();
      setIsModalOpen(false);
    }
  };

  const addFallback = () => {
    setFormData({
      ...formData,
      fallbacks: [...formData.fallbacks, ''],
    });
  };

  const updateFallback = (index: number, value: string) => {
    const newFallbacks = [...formData.fallbacks];
    newFallbacks[index] = value;
    setFormData({ ...formData, fallbacks: newFallbacks });
  };

  const removeFallback = (index: number) => {
    setFormData({
      ...formData,
      fallbacks: formData.fallbacks.filter((_, i) => i !== index),
    });
  };

  // Status mapper for serving endpoints
  const getEndpointStatus = (state: { ready?: string; config_update?: string } | undefined): StatusType => {
    const readyState = state?.ready?.toUpperCase();
    switch (readyState) {
      case 'READY':
        return 'ready';
      case 'NOT_READY':
        return 'transitioning';
      default:
        return 'unknown';
    }
  };

  const endpointOptions: StatusSelectOption[] = [
    { value: '', label: endpointsLoading ? 'Loading endpoints...' : 'Select an endpoint...' },
    ...(endpoints || []).map((e) => ({
      value: e.name,
      label: e.name,
      status: getEndpointStatus(e.state),
    })),
  ];


  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Cpu className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-slate-100">Language Models</h3>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Add LLM
        </Button>
      </div>

      {/* LLM List */}
      {Object.keys(llms).length > 0 ? (
        <div className="space-y-2">
          {Object.entries(llms).map(([key, llm]) => (
            <div 
              key={key} 
              className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-800/70 transition-colors"
              onClick={() => handleEdit(key, llm)}
            >
              <div className="flex items-center space-x-3">
                <Cpu className="w-4 h-4 text-purple-400" />
                <div>
                  <p className="font-medium text-slate-200">{key}</p>
                  <p className="text-xs text-slate-500">{llm.name}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {llm.on_behalf_of_user && (
                  <Badge variant="success" title="On Behalf of User">
                    <User className="w-3 h-3 mr-1" />
                    OBO
                  </Badge>
                )}
                {llm.fallbacks && llm.fallbacks.length > 0 && (
                  <Badge variant="warning" title={`${llm.fallbacks.length} fallback(s)`}>
                    <Layers className="w-3 h-3 mr-1" />
                    {llm.fallbacks.length}
                  </Badge>
                )}
                <Badge variant="info">temp: {llm.temperature ?? 0.1}</Badge>
                <Badge variant="default">tokens: {llm.max_tokens ?? 8192}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLLM(key);
                  }}
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-slate-500 text-sm">No LLMs configured. Add language models that will power your AI agents.</p>
      )}

      {/* Add/Edit LLM Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={editingKey ? 'Edit Language Model' : 'Add Language Model'}
        description="Configure an LLM for your agents to use"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Reference Name"
            placeholder="e.g., default_llm"
            value={formData.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })}
            hint={editingKey ? "Changing this will update all references in the YAML" : "A unique identifier for this LLM in your config"}
            required
          />

          {/* Model Source Selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Model Source</label>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setModelSource('preset')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  modelSource === 'preset'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                }`}
              >
                Preset Models
              </button>
              <button
                type="button"
                onClick={() => setModelSource('endpoint')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  modelSource === 'endpoint'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                }`}
              >
                Serving Endpoint
              </button>
              <button
                type="button"
                onClick={() => setModelSource('custom')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  modelSource === 'custom'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                }`}
              >
                Custom
              </button>
            </div>
          </div>

          {modelSource === 'preset' && (
            <Select
              label="Model"
              options={[{ value: '', label: 'Select a model...' }, ...COMMON_MODELS]}
              value={formData.modelName}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ 
                ...formData, 
                modelName: e.target.value,
                name: formData.name || generateRefName(e.target.value),
              })}
              required
            />
          )}

          {modelSource === 'endpoint' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-300">Serving Endpoint</label>
                <button
                  type="button"
                  onClick={() => refetchEndpoints()}
                  className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                  disabled={endpointsLoading}
                >
                  <RefreshCw className={`w-3 h-3 ${endpointsLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
              <StatusSelect
                options={endpointOptions}
                value={formData.modelName}
                onChange={(value) => setFormData({ 
                  ...formData, 
                  modelName: value,
                  name: formData.name || generateRefName(value),
                })}
                disabled={endpointsLoading}
                placeholder="Select an endpoint..."
              />
              {endpointsLoading && (
                <p className="text-xs text-slate-500">Loading endpoints from Databricks...</p>
              )}
            </div>
          )}

          {modelSource === 'custom' && (
            <Input
              label="Custom Model Name"
              placeholder="e.g., my-custom-endpoint"
              value={formData.customModelName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, customModelName: e.target.value })}
              hint="Enter the name of your custom model endpoint"
              required
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={formData.temperature}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, temperature: e.target.value })}
              hint="0.0 = deterministic, 2.0 = creative"
            />
            <Input
              label="Max Tokens"
              type="number"
              min="1"
              max="128000"
              value={formData.maxTokens}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, maxTokens: e.target.value })}
              hint="Maximum response length"
            />
          </div>

          {/* Advanced Options Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <span>Advanced Options</span>
            {(formData.onBehalfOfUser || formData.fallbacks.length > 0) && (
              <Badge variant="info" className="ml-2">
                {(formData.onBehalfOfUser ? 1 : 0) + (formData.fallbacks.length > 0 ? 1 : 0)} configured
              </Badge>
            )}
          </button>

          {showAdvanced && (
            <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              {/* On Behalf of User */}
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  id="onBehalfOfUser"
                  checked={formData.onBehalfOfUser}
                  onChange={(e) => setFormData({ ...formData, onBehalfOfUser: e.target.checked })}
                  className="mt-1 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <label htmlFor="onBehalfOfUser" className="block text-sm font-medium text-slate-300 cursor-pointer">
                    On Behalf of User
                  </label>
                  <p className="text-xs text-slate-500 mt-1">
                    When enabled, API calls will use the requesting user's credentials.
                  </p>
                </div>
              </div>

              {/* Fallbacks */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Fallback Models</label>
                    <p className="text-xs text-slate-500 mt-1">
                      Alternative models to try if the primary model fails.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={addFallback}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Fallback
                  </Button>
                </div>

                {formData.fallbacks.length > 0 ? (
                  <div className="space-y-3">
                    {formData.fallbacks.map((fallback, index) => {
                      const isReference = fallback.startsWith('ref:');
                      const refKey = isReference ? fallback.slice(4) : null;
                      const hasConfiguredLLMs = Object.keys(llms).filter(k => k !== editingKey && k !== formData.name).length > 0;
                      
                      return (
                        <FallbackItem
                          key={index}
                          index={index}
                          fallback={fallback}
                          isReference={isReference}
                          refKey={refKey}
                          hasConfiguredLLMs={hasConfiguredLLMs}
                          llms={llms}
                          endpoints={endpoints || []}
                          editingKey={editingKey}
                          formDataName={formData.name}
                          onUpdate={(value) => updateFallback(index, value)}
                          onRemove={() => removeFallback(index)}
                          getEndpointStatus={getEndpointStatus}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No fallbacks configured.</p>
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
            <Button type="submit">
              {editingKey ? 'Save Changes' : 'Add LLM'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

// =============================================================================
// Genie Rooms Panel
// =============================================================================
type SpaceIdSource = 'select' | 'manual' | 'variable';

function GenieRoomsPanel({ showForm, setShowForm, editingKey, setEditingKey, onClose }: PanelProps) {
  const { config, addGenieRoom, updateGenieRoom, removeGenieRoom } = useConfigStore();
  const genieRooms = config.resources?.genie_rooms || {};
  const variables = config.variables || {};
  const { data: genieSpaces, loading, refetch: refetchSpaces } = useGenieSpaces();
  
  const [spaceIdSource, setSpaceIdSource] = useState<SpaceIdSource>('select');
  const [formData, setFormData] = useState({
    refName: '',
    name: '',
    description: '',
    space_id: '',
    space_id_variable: '', // For variable reference
    on_behalf_of_user: false,
  });

  const handleEdit = (key: string) => {
    const room = genieRooms[key];
    const spaceId = room.space_id || '';
    
    // Detect if space_id is a variable reference (starts with *)
    const isVariable = spaceId.startsWith('*');
    const isInList = genieSpaces?.some(s => s.space_id === spaceId);
    
    setSpaceIdSource(isVariable ? 'variable' : (isInList ? 'select' : 'manual'));
    setFormData({
      refName: key,
      name: room.name,
      description: room.description || '',
      space_id: isVariable ? '' : spaceId,
      space_id_variable: isVariable ? spaceId.substring(1) : '',
      on_behalf_of_user: room.on_behalf_of_user || false,
    });
    setEditingKey(key);
    setShowForm(true);
  };

  const handleSave = () => {
    // Determine space_id value based on source
    let spaceIdValue = formData.space_id;
    if (spaceIdSource === 'variable' && formData.space_id_variable) {
      spaceIdValue = `*${formData.space_id_variable}`;
    }
    
    const genieRoom: GenieRoomModel = {
      name: formData.name,
      description: formData.description || undefined,
      space_id: spaceIdValue,
      on_behalf_of_user: formData.on_behalf_of_user,
    };
    
    if (editingKey) {
      // If key changed, remove old and add new
      if (editingKey !== formData.refName) {
        removeGenieRoom(editingKey);
      }
      updateGenieRoom(formData.refName, genieRoom);
    } else {
      addGenieRoom(formData.refName, genieRoom);
    }
    
    setSpaceIdSource('select');
    setFormData({ refName: '', name: '', description: '', space_id: '', space_id_variable: '', on_behalf_of_user: false });
    onClose();
  };

  const handleDelete = (key: string) => {
    removeGenieRoom(key);
  };

  const genieSpaceOptions = [
    { value: '', label: loading ? 'Loading Genie spaces...' : 'Select a Genie space...' },
    ...(genieSpaces || []).map((s) => ({
      value: s.space_id,
      label: `${s.title}${s.description ? ` - ${s.description.substring(0, 50)}${s.description.length > 50 ? '...' : ''}` : ''}`,
    })),
  ];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <MessageSquare className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-slate-100">Genie Rooms</h3>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { setSpaceIdSource('select'); setFormData({ refName: '', name: '', description: '', space_id: '', space_id_variable: '', on_behalf_of_user: false }); setEditingKey(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" />
          Add Genie Room
        </Button>
      </div>

      {/* Existing Resources */}
      {Object.keys(genieRooms).length > 0 && (
        <div className="space-y-2 mb-4">
          {Object.entries(genieRooms).map(([key, room]) => (
            <div key={key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center space-x-3">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                <div>
                  <p className="font-medium text-slate-200">{key}</p>
                  <p className="text-xs text-slate-500">
                    {room.name} • Space ID: {room.space_id?.substring(0, 12)}...
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {room.on_behalf_of_user && (
                  <Badge variant="success" title="On Behalf of User">
                    <User className="w-3 h-3 mr-1" />
                    OBO
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleEdit(key)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(key)}>
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(genieRooms).length === 0 && !showForm && (
        <p className="text-slate-500 text-sm">No Genie rooms configured.</p>
      )}

      {/* Form */}
      {showForm && (
        <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
          <h4 className="font-medium text-slate-200">{editingKey ? 'Edit' : 'New'} Genie Room</h4>
          
          <Input
            label="Reference Name"
            value={formData.refName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, refName: e.target.value })}
            placeholder="retail_genie"
            hint={editingKey ? "Changing this will update all references in the YAML" : "Unique key to reference this resource"}
            required
          />
          
          {/* Space ID Source Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">Genie Space</label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setSpaceIdSource('select');
                    setFormData({ ...formData, space_id: '', space_id_variable: '', name: '', description: '' });
                  }}
                  className={`px-2 py-1 text-xs rounded ${
                    spaceIdSource === 'select' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  Select
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpaceIdSource('manual');
                    setFormData({ ...formData, space_id: '', space_id_variable: '', name: '', description: '' });
                  }}
                  className={`px-2 py-1 text-xs rounded ${
                    spaceIdSource === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpaceIdSource('variable');
                    setFormData({ ...formData, space_id: '', space_id_variable: '', name: '', description: '' });
                  }}
                  className={`px-2 py-1 text-xs rounded flex items-center space-x-1 ${
                    spaceIdSource === 'variable' ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  <Key className="w-3 h-3" />
                  <span>Variable</span>
                </button>
              </div>
            </div>
            
            {spaceIdSource === 'select' && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="flex-1">
                    <Select
                      value={formData.space_id}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                        const selectedSpaceId = e.target.value;
                        const space = genieSpaces?.find(s => s.space_id === selectedSpaceId);
                        const spaceName = space?.title || '';
                        const spaceDesc = space?.description || '';
                        
                        setFormData({ 
                          ...formData, 
                          space_id: selectedSpaceId,
                          space_id_variable: '',
                          refName: editingKey ? formData.refName : generateRefName(spaceName),
                          name: spaceName,
                          description: spaceDesc,
                        });
                      }}
                      options={genieSpaceOptions}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => refetchSpaces()}
                    className="p-2 text-slate-400 hover:text-white"
                    disabled={loading}
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Select from {genieSpaces?.length || 0} available Genie spaces. Display Name and Description will auto-fill.
                </p>
              </div>
            )}
            
            {spaceIdSource === 'manual' && (
              <div className="space-y-2">
                <Input
                  value={formData.space_id}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const spaceId = e.target.value;
                    setFormData({ 
                      ...formData, 
                      space_id: spaceId,
                      space_id_variable: '',
                      refName: editingKey ? formData.refName : generateRefName(spaceId),
                    });
                  }}
                  placeholder="01f0d05d42ed11eeae85802c1d5bcccd"
                />
                <p className="text-xs text-slate-500">
                  Enter the Genie space ID directly. You can find this in the Genie room URL.
                </p>
              </div>
            )}
            
            {spaceIdSource === 'variable' && (
              <div className="space-y-2">
                {Object.keys(variables).length > 0 ? (
                  <Select
                    value={formData.space_id_variable}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      const varName = e.target.value;
                      setFormData({ 
                        ...formData, 
                        space_id_variable: varName,
                        space_id: '',
                        refName: editingKey ? formData.refName : generateRefName(varName || 'genie'),
                      });
                    }}
                    options={[
                      { value: '', label: 'Select a variable...' },
                      ...Object.keys(variables).map(name => ({
                        value: name,
                        label: name,
                      })),
                    ]}
                  />
                ) : (
                  <Input
                    value={formData.space_id_variable}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const varName = e.target.value;
                      setFormData({ 
                        ...formData, 
                        space_id_variable: varName,
                        space_id: '',
                        refName: editingKey ? formData.refName : generateRefName(varName || 'genie'),
                      });
                    }}
                    placeholder="genie_space_id"
                  />
                )}
                <p className="text-xs text-slate-500">
                  Reference a variable containing the Genie space ID. The value will be resolved at runtime.
                </p>
              </div>
            )}
          </div>
          
          <Input
            label="Display Name"
            value={formData.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Retail Analytics Genie"
            required
          />
          
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Query retail data using natural language"
              rows={3}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
          
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.on_behalf_of_user}
              onChange={(e) => setFormData({ ...formData, on_behalf_of_user: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <UserCheck className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-slate-300">On Behalf of User</span>
            <span className="text-xs text-slate-500">(Use requesting user's credentials)</span>
          </label>
          
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button 
              onClick={handleSave} 
              disabled={
                !formData.refName || 
                !formData.name || 
                (spaceIdSource === 'select' && !formData.space_id) ||
                (spaceIdSource === 'manual' && !formData.space_id) ||
                (spaceIdSource === 'variable' && !formData.space_id_variable)
              }
            >
              {editingKey ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// Warehouses Panel
// =============================================================================
type WarehouseIdSource = 'select' | 'manual' | 'variable';

function WarehousesPanel({ showForm, setShowForm, editingKey, setEditingKey, onClose }: PanelProps) {
  const { config, addWarehouse, updateWarehouse, removeWarehouse } = useConfigStore();
  const warehouses = config.resources?.warehouses || {};
  const variables = config.variables || {};
  const { data: sqlWarehouses, loading, refetch: refetchWarehouses } = useSQLWarehouses();
  
  const [warehouseIdSource, setWarehouseIdSource] = useState<WarehouseIdSource>('select');
  const [formData, setFormData] = useState({
    refName: '',
    name: '',
    description: '',
    warehouse_id: '',
    warehouse_id_variable: '',
    on_behalf_of_user: false,
  });

  const handleEdit = (key: string) => {
    const wh = warehouses[key];
    // Detect if the warehouse_id is a variable reference
    const isVariableRef = wh.warehouse_id.startsWith('__REF__');
    const variableName = isVariableRef ? wh.warehouse_id.substring(7) : '';
    const directId = isVariableRef ? '' : wh.warehouse_id;
    
    // Determine source: if variable ref -> variable, if matches a known warehouse -> select, else manual
    let source: WarehouseIdSource = 'manual';
    if (isVariableRef) {
      source = 'variable';
    } else if (sqlWarehouses?.some(w => w.id === wh.warehouse_id)) {
      source = 'select';
    }
    
    setWarehouseIdSource(source);
    setFormData({
      refName: key,
      name: wh.name,
      description: wh.description || '',
      warehouse_id: directId,
      warehouse_id_variable: variableName,
      on_behalf_of_user: wh.on_behalf_of_user || false,
    });
    setEditingKey(key);
    setShowForm(true);
  };

  const handleSave = () => {
    // Determine the final warehouse_id value
    let finalWarehouseId = formData.warehouse_id;
    if (warehouseIdSource === 'variable' && formData.warehouse_id_variable) {
      finalWarehouseId = `__REF__${formData.warehouse_id_variable}`;
    }
    
    const warehouse: WarehouseModel = {
      name: formData.name,
      description: formData.description || undefined,
      warehouse_id: finalWarehouseId,
      on_behalf_of_user: formData.on_behalf_of_user,
    };
    
    if (editingKey) {
      if (editingKey !== formData.refName) {
        removeWarehouse(editingKey);
      }
      updateWarehouse(formData.refName, warehouse);
    } else {
      addWarehouse(formData.refName, warehouse);
    }
    
    setFormData({ refName: '', name: '', description: '', warehouse_id: '', warehouse_id_variable: '', on_behalf_of_user: false });
    setWarehouseIdSource('select');
    onClose();
  };

  const handleDelete = (key: string) => {
    removeWarehouse(key);
  };

  // Status mapper for warehouses
  const getWarehouseStatus = (state: string | undefined): StatusType => {
    switch (state?.toUpperCase()) {
      case 'RUNNING':
        return 'ready';
      case 'STARTING':
      case 'STOPPING':
      case 'RESTARTING':
        return 'transitioning';
      case 'STOPPED':
      case 'DELETED':
      case 'DELETING':
        return 'stopped';
      default:
        return 'unknown';
    }
  };

  const warehouseOptions: StatusSelectOption[] = [
    { value: '', label: loading ? 'Loading...' : 'Select a SQL warehouse...' },
    ...(sqlWarehouses || []).map((wh) => ({
      value: wh.id,
      label: wh.name,
      status: getWarehouseStatus(wh.state),
    })),
  ];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Database className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold text-slate-100">SQL Warehouses</h3>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { setFormData({ refName: '', name: '', description: '', warehouse_id: '', warehouse_id_variable: '', on_behalf_of_user: false }); setWarehouseIdSource('select'); setEditingKey(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" />
          Add Warehouse
        </Button>
      </div>

      {/* Existing Resources */}
      {Object.keys(warehouses).length > 0 && (
        <div className="space-y-2 mb-4">
          {Object.entries(warehouses).map(([key, wh]) => {
            const isVariableRef = wh.warehouse_id.startsWith('__REF__');
            const displayId = isVariableRef 
              ? `$${wh.warehouse_id.substring(7)}` 
              : `${wh.warehouse_id?.substring(0, 12)}...`;
            return (
              <div key={key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center space-x-3">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="font-medium text-slate-200">{key}</p>
                    <p className="text-xs text-slate-500">
                      {wh.name} • {isVariableRef ? 'Var: ' : 'ID: '}{displayId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {wh.on_behalf_of_user && (
                    <Badge variant="success" title="On Behalf of User">
                      <User className="w-3 h-3 mr-1" />
                      OBO
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(key)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(key)}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {Object.keys(warehouses).length === 0 && !showForm && (
        <p className="text-slate-500 text-sm">No SQL warehouses configured.</p>
      )}

      {/* Form */}
      {showForm && (
        <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
          <h4 className="font-medium text-slate-200">{editingKey ? 'Edit' : 'New'} SQL Warehouse</h4>
          
          <Input
            label="Reference Name"
            value={formData.refName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, refName: e.target.value })}
            placeholder="main_warehouse"
            hint={editingKey ? "Changing this will update all references in the YAML" : "Unique key to reference this resource"}
            required
          />
          
          {/* Warehouse ID Source Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">Warehouse ID</label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setWarehouseIdSource('select');
                    setFormData({ ...formData, warehouse_id_variable: '' });
                  }}
                  className={`px-2 py-1 text-xs rounded ${
                    warehouseIdSource === 'select' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  Select
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWarehouseIdSource('manual');
                    setFormData({ ...formData, warehouse_id_variable: '' });
                  }}
                  className={`px-2 py-1 text-xs rounded ${
                    warehouseIdSource === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWarehouseIdSource('variable');
                    setFormData({ ...formData, warehouse_id: '' });
                  }}
                  className={`px-2 py-1 text-xs rounded flex items-center space-x-1 ${
                    warehouseIdSource === 'variable' ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  <Key className="w-3 h-3" />
                  <span>Variable</span>
                </button>
              </div>
            </div>
            
            {warehouseIdSource === 'select' && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="flex-1">
                    <StatusSelect
                      value={formData.warehouse_id}
                      onChange={(value) => {
                        const wh = sqlWarehouses?.find(w => w.id === value);
                        const whName = wh?.name || '';
                        setFormData({ 
                          ...formData, 
                          warehouse_id: value,
                          warehouse_id_variable: '',
                          refName: editingKey ? formData.refName : generateRefName(whName),
                          name: whName || formData.name || '',
                        });
                      }}
                      options={warehouseOptions}
                      placeholder="Select a SQL warehouse..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => refetchWarehouses()}
                    className="p-2 text-slate-400 hover:text-white"
                    disabled={loading}
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Select from {sqlWarehouses?.length || 0} available SQL warehouses. Display Name will auto-fill.
                </p>
              </div>
            )}
            
            {warehouseIdSource === 'manual' && (
              <div className="space-y-2">
                <Input
                  value={formData.warehouse_id}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const warehouseId = e.target.value;
                    setFormData({ 
                      ...formData, 
                      warehouse_id: warehouseId,
                      warehouse_id_variable: '',
                      refName: editingKey ? formData.refName : generateRefName(warehouseId),
                    });
                  }}
                  placeholder="abc123def456"
                />
                <p className="text-xs text-slate-500">
                  Enter the warehouse ID directly. You can find this in the SQL warehouse settings.
                </p>
              </div>
            )}
            
            {warehouseIdSource === 'variable' && (
              <div className="space-y-2">
                {Object.keys(variables).length > 0 ? (
                  <Select
                    value={formData.warehouse_id_variable}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      const varName = e.target.value;
                      setFormData({ 
                        ...formData, 
                        warehouse_id_variable: varName,
                        warehouse_id: '',
                        refName: editingKey ? formData.refName : generateRefName(varName || 'warehouse'),
                      });
                    }}
                    options={[
                      { value: '', label: 'Select a variable...' },
                      ...Object.keys(variables).map(name => ({
                        value: name,
                        label: name,
                      })),
                    ]}
                  />
                ) : (
                  <Input
                    value={formData.warehouse_id_variable}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const varName = e.target.value;
                      setFormData({ 
                        ...formData, 
                        warehouse_id_variable: varName,
                        warehouse_id: '',
                        refName: editingKey ? formData.refName : generateRefName(varName || 'warehouse'),
                      });
                    }}
                    placeholder="warehouse_id"
                  />
                )}
                <p className="text-xs text-slate-500">
                  Reference a variable containing the warehouse ID. The value will be resolved at runtime.
                </p>
              </div>
            )}
          </div>
          
          <Input
            label="Display Name"
            value={formData.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Main Analytics Warehouse"
            required
          />
          
          <Input
            label="Description"
            value={formData.description}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Primary warehouse for analytics queries"
          />
          
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.on_behalf_of_user}
              onChange={(e) => setFormData({ ...formData, on_behalf_of_user: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <UserCheck className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-slate-300">On Behalf of User</span>
            <span className="text-xs text-slate-500">(Use requesting user's credentials)</span>
          </label>
          
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button 
              onClick={handleSave} 
              disabled={
                !formData.refName || 
                !formData.name || 
                (warehouseIdSource === 'select' && !formData.warehouse_id) ||
                (warehouseIdSource === 'manual' && !formData.warehouse_id) ||
                (warehouseIdSource === 'variable' && !formData.warehouse_id_variable)
              }
            >
              {editingKey ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// Tables Panel
// =============================================================================
type SchemaSource = 'reference' | 'direct';

function TablesPanel({ showForm, setShowForm, editingKey, setEditingKey, onClose }: PanelProps) {
  const { config, addTable, updateTable, removeTable } = useConfigStore();
  const tables = config.resources?.tables || {};
  const configuredSchemas = config.schemas || {};
  const { data: catalogs } = useCatalogs();
  
  // Default to 'reference' (Use Configured Schema) initially
  const [schemaSource, setSchemaSource] = useState<SchemaSource>('reference');
  // Track last used schema to retain between adds
  const [lastUsedSchema, setLastUsedSchema] = useState({ schemaRef: '', catalog_name: '', schema_name: '', source: 'reference' as SchemaSource });
  const [formData, setFormData] = useState({
    refName: '',
    schemaRef: '', // Reference to configured schema
    catalog_name: '',
    schema_name: '',
    name: '',
    on_behalf_of_user: false,
  });

  const { data: schemas, loading: schemasLoading } = useSchemas(formData.catalog_name || null);
  const { data: tablesList, loading: tablesLoading } = useTables(
    schemaSource === 'reference' && formData.schemaRef ? configuredSchemas[formData.schemaRef]?.catalog_name : formData.catalog_name || null,
    schemaSource === 'reference' && formData.schemaRef ? configuredSchemas[formData.schemaRef]?.schema_name : formData.schema_name || null
  );

  const handleEdit = (key: string) => {
    const table = tables[key];
    // Detect if using schema reference
    const isSchemaRef = table.schema && Object.entries(configuredSchemas).some(
      ([, s]) => s.catalog_name === table.schema?.catalog_name && s.schema_name === table.schema?.schema_name
    );
    const schemaRefKey = isSchemaRef ? Object.entries(configuredSchemas).find(
      ([, s]) => s.catalog_name === table.schema?.catalog_name && s.schema_name === table.schema?.schema_name
    )?.[0] : '';
    
    setSchemaSource(schemaRefKey ? 'reference' : 'direct');
    setFormData({
      refName: key,
      schemaRef: schemaRefKey || '',
      catalog_name: table.schema?.catalog_name || '',
      schema_name: table.schema?.schema_name || '',
      name: table.name || '',
      on_behalf_of_user: table.on_behalf_of_user || false,
    });
    setEditingKey(key);
    setShowForm(true);
  };

  const handleSave = () => {
    const table: TableModel = {
      name: formData.name || undefined,
      on_behalf_of_user: formData.on_behalf_of_user,
    };
    
    if (schemaSource === 'reference' && formData.schemaRef) {
      const ref = configuredSchemas[formData.schemaRef];
      if (ref) {
        table.schema = {
          catalog_name: ref.catalog_name,
          schema_name: ref.schema_name,
        };
      }
    } else if (formData.catalog_name && formData.schema_name) {
      table.schema = {
        catalog_name: formData.catalog_name,
        schema_name: formData.schema_name,
      };
    }
    
    if (editingKey) {
      if (editingKey !== formData.refName) {
        removeTable(editingKey);
      }
      updateTable(formData.refName, table);
    } else {
      addTable(formData.refName, table);
    }
    
    // Remember last used schema for convenience (including the source type)
    setLastUsedSchema({
      schemaRef: formData.schemaRef,
      catalog_name: formData.catalog_name,
      schema_name: formData.schema_name,
      source: schemaSource,
    });
    
    // Reset form but retain schema selection
    setFormData({ 
      refName: '', 
      schemaRef: formData.schemaRef, 
      catalog_name: formData.catalog_name, 
      schema_name: formData.schema_name, 
      name: '', 
      on_behalf_of_user: false 
    });
    // Keep schemaSource as is
    onClose();
  };

  const handleDelete = (key: string) => {
    removeTable(key);
  };

  const hasConfiguredSchemas = Object.keys(configuredSchemas).length > 0;
  const isSchemaSelected = schemaSource === 'reference' ? !!formData.schemaRef : (!!formData.catalog_name && !!formData.schema_name);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Table2 className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-slate-100">Tables</h3>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { 
          setFormData({ 
            refName: '', 
            schemaRef: lastUsedSchema.schemaRef, 
            catalog_name: lastUsedSchema.catalog_name, 
            schema_name: lastUsedSchema.schema_name, 
            name: '', 
            on_behalf_of_user: false 
          }); 
          // Use last used schema source (defaults to 'reference')
          setSchemaSource(lastUsedSchema.source);
          setEditingKey(null); 
          setShowForm(true); 
        }}>
          <Plus className="w-4 h-4 mr-1" />
          Add Table
        </Button>
      </div>

      {/* Existing Resources */}
      {Object.keys(tables).length > 0 && (
        <div className="space-y-2 mb-4">
          {Object.entries(tables).map(([key, table]) => (
            <div key={key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center space-x-3">
                <Table2 className="w-4 h-4 text-cyan-400" />
                <div>
                  <p className="font-medium text-slate-200">{key}</p>
                  <p className="text-xs text-slate-500">
                    {table.schema ? `${table.schema.catalog_name}.${table.schema.schema_name}${table.name ? `.${table.name}` : '.*'}` : table.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {table.on_behalf_of_user && (
                  <Badge variant="success" title="On Behalf of User">
                    <User className="w-3 h-3 mr-1" />
                    OBO
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleEdit(key)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(key)}>
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(tables).length === 0 && !showForm && (
        <p className="text-slate-500 text-sm">No tables configured.</p>
      )}

      {/* Form */}
      {showForm && (
        <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
          <h4 className="font-medium text-slate-200">{editingKey ? 'Edit' : 'New'} Table</h4>
          
          <Input
            label="Reference Name"
            value={formData.refName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, refName: e.target.value })}
            placeholder="sales_data"
            hint={editingKey ? "Changing this will update all references in the YAML" : "Unique key to reference this resource"}
            required
          />
          
          {/* Schema Source Toggle */}
          {hasConfiguredSchemas && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Schema Source</label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => { setSchemaSource('reference'); setFormData({ ...formData, catalog_name: '', schema_name: '' }); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    schemaSource === 'reference'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  Use Configured Schema
                </button>
                <button
                  type="button"
                  onClick={() => { setSchemaSource('direct'); setFormData({ ...formData, schemaRef: '' }); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    schemaSource === 'direct'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  Select Catalog/Schema
                </button>
              </div>
            </div>
          )}
          
          {schemaSource === 'reference' && hasConfiguredSchemas ? (
            <Select
              label="Schema Reference"
              value={formData.schemaRef}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                const schemaKey = e.target.value;
                const schema = configuredSchemas[schemaKey];
                const refName = schema ? generateRefName(`${schema.catalog_name}_${schema.schema_name}_tables`) : '';
                setFormData({ 
                  ...formData, 
                  schemaRef: schemaKey, 
                  name: '',
                  refName: formData.refName || refName,
                });
              }}
              options={[
                { value: '', label: 'Select a configured schema...' },
                ...Object.entries(configuredSchemas).map(([key, s]) => ({
                  value: key,
                  label: `${key} (${s.catalog_name}.${s.schema_name})`,
                })),
              ]}
              hint="Reference a schema defined in the Schemas section"
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Catalog"
                value={formData.catalog_name}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, catalog_name: e.target.value, schema_name: '', name: '' })}
                options={[
                  { value: '', label: 'Select catalog...' },
                  ...(catalogs || []).map((c) => ({ value: c.name, label: c.name })),
                ]}
              />
              <Select
                label="Schema"
                value={formData.schema_name}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const schemaName = e.target.value;
                  const refName = schemaName ? generateRefName(`${formData.catalog_name}_${schemaName}_tables`) : '';
                  setFormData({ 
                    ...formData, 
                    schema_name: schemaName, 
                    name: '',
                    refName: formData.refName || refName,
                  });
                }}
                options={[
                  { value: '', label: schemasLoading ? 'Loading schemas...' : 'Select schema...' },
                  ...(schemas || []).map((s) => ({ value: s.name, label: s.name })),
                ]}
                disabled={!formData.catalog_name || schemasLoading}
              />
            </div>
          )}
          
          {/* Show selected schema info when using reference */}
          {schemaSource === 'reference' && formData.schemaRef && configuredSchemas[formData.schemaRef] && (
            <div className="p-2 bg-slate-900/50 rounded text-xs text-slate-400">
              Using schema: <span className="text-slate-300">{configuredSchemas[formData.schemaRef].catalog_name}.{configuredSchemas[formData.schemaRef].schema_name}</span>
            </div>
          )}
          
          <Select
            label="Table"
            value={formData.name}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              const tableName = e.target.value;
              // Use functional update to ensure we have the latest state
              setFormData(prev => {
                // Generate refName based on table name or schema if "all tables"
                let newRefName = '';
                if (tableName) {
                  newRefName = generateRefName(tableName);
                } else if (schemaSource === 'reference' && prev.schemaRef) {
                  const schema = configuredSchemas[prev.schemaRef];
                  if (schema) {
                    newRefName = generateRefName(`${schema.catalog_name}_${schema.schema_name}_tables`);
                  }
                } else if (prev.catalog_name && prev.schema_name) {
                  newRefName = generateRefName(`${prev.catalog_name}_${prev.schema_name}_tables`);
                }
                
                // Only preserve refName if editing existing entry or user has manually typed something
                // For new entries, always update the refName when table selection changes
                const shouldPreserveRefName = editingKey && prev.refName;
                
                return { 
                  ...prev, 
                  name: tableName,
                  refName: shouldPreserveRefName ? prev.refName : newRefName,
                };
              });
            }}
            options={[
              { value: '', label: tablesLoading ? 'Loading tables...' : 'All tables (*)' },
              ...(tablesList || []).map((t) => ({ value: t.name, label: t.name })),
            ]}
            disabled={!isSchemaSelected || tablesLoading}
            hint="Leave empty for all tables in schema"
          />
          
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.on_behalf_of_user}
              onChange={(e) => setFormData({ ...formData, on_behalf_of_user: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <UserCheck className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-slate-300">On Behalf of User</span>
          </label>
          
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.refName || !isSchemaSelected}>
              {editingKey ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// Volumes Panel
// =============================================================================
function VolumesPanel({ showForm, setShowForm, editingKey, setEditingKey, onClose }: PanelProps) {
  const { config, addVolume, updateVolume, removeVolume } = useConfigStore();
  const volumes = config.resources?.volumes || {};
  const configuredSchemas = config.schemas || {};
  const { data: catalogs } = useCatalogs();
  
  // Default to 'reference' (Use Configured Schema) initially
  const [schemaSource, setSchemaSource] = useState<SchemaSource>('reference');
  // Track last used schema to retain between adds
  const [lastUsedSchema, setLastUsedSchema] = useState({ schemaRef: '', catalog_name: '', schema_name: '', source: 'reference' as SchemaSource });
  const [formData, setFormData] = useState({
    refName: '',
    schemaRef: '',
    catalog_name: '',
    schema_name: '',
    name: '',
    on_behalf_of_user: false,
  });

  const { data: schemas, loading: schemasLoading } = useSchemas(formData.catalog_name || null);
  const { data: volumesList, loading: volumesLoading } = useVolumes(
    schemaSource === 'reference' && formData.schemaRef ? configuredSchemas[formData.schemaRef]?.catalog_name : formData.catalog_name || null,
    schemaSource === 'reference' && formData.schemaRef ? configuredSchemas[formData.schemaRef]?.schema_name : formData.schema_name || null
  );

  const handleEdit = (key: string) => {
    const volume = volumes[key];
    const isSchemaRef = volume.schema && Object.entries(configuredSchemas).some(
      ([, s]) => s.catalog_name === volume.schema?.catalog_name && s.schema_name === volume.schema?.schema_name
    );
    const schemaRefKey = isSchemaRef ? Object.entries(configuredSchemas).find(
      ([, s]) => s.catalog_name === volume.schema?.catalog_name && s.schema_name === volume.schema?.schema_name
    )?.[0] : '';
    
    setSchemaSource(schemaRefKey ? 'reference' : 'direct');
    setFormData({
      refName: key,
      schemaRef: schemaRefKey || '',
      catalog_name: volume.schema?.catalog_name || '',
      schema_name: volume.schema?.schema_name || '',
      name: volume.name || '',
      on_behalf_of_user: volume.on_behalf_of_user || false,
    });
    setEditingKey(key);
    setShowForm(true);
  };

  const handleSave = () => {
    const volume: VolumeModel = {
      name: formData.name,
      on_behalf_of_user: formData.on_behalf_of_user,
    };
    
    if (schemaSource === 'reference' && formData.schemaRef) {
      const ref = configuredSchemas[formData.schemaRef];
      if (ref) {
        volume.schema = {
          catalog_name: ref.catalog_name,
          schema_name: ref.schema_name,
        };
      }
    } else if (formData.catalog_name && formData.schema_name) {
      volume.schema = {
        catalog_name: formData.catalog_name,
        schema_name: formData.schema_name,
      };
    }
    
    if (editingKey) {
      if (editingKey !== formData.refName) {
        removeVolume(editingKey);
      }
      updateVolume(formData.refName, volume);
    } else {
      addVolume(formData.refName, volume);
    }
    
    // Remember last used schema for convenience (including the source type)
    setLastUsedSchema({
      schemaRef: formData.schemaRef,
      catalog_name: formData.catalog_name,
      schema_name: formData.schema_name,
      source: schemaSource,
    });
    
    // Reset form but retain schema selection
    setFormData({ 
      refName: '', 
      schemaRef: formData.schemaRef, 
      catalog_name: formData.catalog_name, 
      schema_name: formData.schema_name, 
      name: '', 
      on_behalf_of_user: false 
    });
    // Keep schemaSource as is
    onClose();
  };

  const handleDelete = (key: string) => {
    removeVolume(key);
  };

  const hasConfiguredSchemas = Object.keys(configuredSchemas).length > 0;
  const isSchemaSelected = schemaSource === 'reference' ? !!formData.schemaRef : (!!formData.catalog_name && !!formData.schema_name);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <FolderOpen className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-slate-100">Volumes</h3>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { 
          setFormData({ 
            refName: '', 
            schemaRef: lastUsedSchema.schemaRef, 
            catalog_name: lastUsedSchema.catalog_name, 
            schema_name: lastUsedSchema.schema_name, 
            name: '', 
            on_behalf_of_user: false 
          }); 
          // Use last used schema source (defaults to 'reference')
          setSchemaSource(lastUsedSchema.source);
          setEditingKey(null); 
          setShowForm(true); 
        }}>
          <Plus className="w-4 h-4 mr-1" />
          Add Volume
        </Button>
      </div>

      {/* Existing Resources */}
      {Object.keys(volumes).length > 0 && (
        <div className="space-y-2 mb-4">
          {Object.entries(volumes).map(([key, volume]) => (
            <div key={key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center space-x-3">
                <FolderOpen className="w-4 h-4 text-amber-400" />
                <div>
                  <p className="font-medium text-slate-200">{key}</p>
                  <p className="text-xs text-slate-500">
                    {volume.schema ? `${volume.schema.catalog_name}.${volume.schema.schema_name}.${volume.name}` : volume.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {volume.on_behalf_of_user && (
                  <Badge variant="success" title="On Behalf of User">
                    <User className="w-3 h-3 mr-1" />
                    OBO
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleEdit(key)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(key)}>
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(volumes).length === 0 && !showForm && (
        <p className="text-slate-500 text-sm">No volumes configured.</p>
      )}

      {/* Form */}
      {showForm && (
        <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
          <h4 className="font-medium text-slate-200">{editingKey ? 'Edit' : 'New'} Volume</h4>
          
          <Input
            label="Reference Name"
            value={formData.refName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, refName: e.target.value })}
            placeholder="data_volume"
            hint={editingKey ? "Changing this will update all references in the YAML" : "Unique key to reference this resource"}
            required
          />
          
          {/* Schema Source Toggle */}
          {hasConfiguredSchemas && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Schema Source</label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => { setSchemaSource('reference'); setFormData({ ...formData, catalog_name: '', schema_name: '' }); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    schemaSource === 'reference'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  Use Configured Schema
                </button>
                <button
                  type="button"
                  onClick={() => { setSchemaSource('direct'); setFormData({ ...formData, schemaRef: '' }); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    schemaSource === 'direct'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  Select Catalog/Schema
                </button>
              </div>
            </div>
          )}
          
          {schemaSource === 'reference' && hasConfiguredSchemas ? (
            <Select
              label="Schema Reference"
              value={formData.schemaRef}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                const schemaKey = e.target.value;
                setFormData({ ...formData, schemaRef: schemaKey, name: '' });
              }}
              options={[
                { value: '', label: 'Select a configured schema...' },
                ...Object.entries(configuredSchemas).map(([key, s]) => ({
                  value: key,
                  label: `${key} (${s.catalog_name}.${s.schema_name})`,
                })),
              ]}
              hint="Reference a schema defined in the Schemas section"
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Catalog"
                value={formData.catalog_name}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, catalog_name: e.target.value, schema_name: '', name: '' })}
                options={[
                  { value: '', label: 'Select catalog...' },
                  ...(catalogs || []).map((c) => ({ value: c.name, label: c.name })),
                ]}
              />
              <Select
                label="Schema"
                value={formData.schema_name}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, schema_name: e.target.value, name: '' })}
                options={[
                  { value: '', label: schemasLoading ? 'Loading schemas...' : 'Select schema...' },
                  ...(schemas || []).map((s) => ({ value: s.name, label: s.name })),
                ]}
                disabled={!formData.catalog_name || schemasLoading}
              />
            </div>
          )}
          
          {/* Show selected schema info when using reference */}
          {schemaSource === 'reference' && formData.schemaRef && configuredSchemas[formData.schemaRef] && (
            <div className="p-2 bg-slate-900/50 rounded text-xs text-slate-400">
              Using schema: <span className="text-slate-300">{configuredSchemas[formData.schemaRef].catalog_name}.{configuredSchemas[formData.schemaRef].schema_name}</span>
            </div>
          )}
          
          <Select
            label="Volume"
            value={formData.name}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              const volumeName = e.target.value;
              setFormData({ 
                ...formData, 
                name: volumeName,
                refName: formData.refName || generateRefName(volumeName),
              });
            }}
            options={[
              { value: '', label: volumesLoading ? 'Loading volumes...' : 'Select volume...' },
              ...(volumesList || []).map((v) => ({ value: v.name, label: v.name })),
            ]}
            disabled={!isSchemaSelected || volumesLoading}
          />
          
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.on_behalf_of_user}
              onChange={(e) => setFormData({ ...formData, on_behalf_of_user: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <UserCheck className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-slate-300">On Behalf of User</span>
          </label>
          
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.refName || !formData.name || !isSchemaSelected}>
              {editingKey ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// Functions Panel
// =============================================================================
function FunctionsPanel({ showForm, setShowForm, editingKey, setEditingKey, onClose }: PanelProps) {
  const { config, addFunction, updateFunction, removeFunction } = useConfigStore();
  const functions = config.resources?.functions || {};
  const configuredSchemas = config.schemas || {};
  const { data: catalogs } = useCatalogs();
  
  // Default to 'reference' (Use Configured Schema) initially
  const [schemaSource, setSchemaSource] = useState<SchemaSource>('reference');
  // Track last used schema to retain between adds
  const [lastUsedSchema, setLastUsedSchema] = useState({ schemaRef: '', catalog_name: '', schema_name: '', source: 'reference' as SchemaSource });
  const [formData, setFormData] = useState({
    refName: '',
    schemaRef: '',
    catalog_name: '',
    schema_name: '',
    name: '',
    on_behalf_of_user: false,
  });

  const { data: schemas, loading: schemasLoading } = useSchemas(formData.catalog_name || null);
  
  // Get current schema info for filtering
  const currentCatalog = schemaSource === 'reference' && formData.schemaRef 
    ? configuredSchemas[formData.schemaRef]?.catalog_name 
    : formData.catalog_name;
  const currentSchema = schemaSource === 'reference' && formData.schemaRef 
    ? configuredSchemas[formData.schemaRef]?.schema_name 
    : formData.schema_name;
  
  const { data: functionsList, loading: functionsLoading } = useFunctions(
    currentCatalog || null,
    currentSchema || null
  );
  
  // Filter out functions that have already been added from the same schema
  const alreadyAddedFunctions = Object.values(functions)
    .filter(f => f.schema?.catalog_name === currentCatalog && f.schema?.schema_name === currentSchema)
    .map(f => f.name)
    .filter(Boolean);
  
  const availableFunctions = (functionsList || []).filter(f => 
    // When editing, include the current function being edited
    editingKey ? !alreadyAddedFunctions.includes(f.name) || f.name === functions[editingKey]?.name : !alreadyAddedFunctions.includes(f.name)
  );

  const handleEdit = (key: string) => {
    const func = functions[key];
    const isSchemaRef = func.schema && Object.entries(configuredSchemas).some(
      ([, s]) => s.catalog_name === func.schema?.catalog_name && s.schema_name === func.schema?.schema_name
    );
    const schemaRefKey = isSchemaRef ? Object.entries(configuredSchemas).find(
      ([, s]) => s.catalog_name === func.schema?.catalog_name && s.schema_name === func.schema?.schema_name
    )?.[0] : '';
    
    setSchemaSource(schemaRefKey ? 'reference' : 'direct');
    setFormData({
      refName: key,
      schemaRef: schemaRefKey || '',
      catalog_name: func.schema?.catalog_name || '',
      schema_name: func.schema?.schema_name || '',
      name: func.name || '',
      on_behalf_of_user: func.on_behalf_of_user || false,
    });
    setEditingKey(key);
    setShowForm(true);
  };

  const handleSave = () => {
    const func: FunctionModel = {
      name: formData.name || undefined,
      on_behalf_of_user: formData.on_behalf_of_user,
    };
    
    if (schemaSource === 'reference' && formData.schemaRef) {
      const ref = configuredSchemas[formData.schemaRef];
      if (ref) {
        func.schema = {
          catalog_name: ref.catalog_name,
          schema_name: ref.schema_name,
        };
      }
    } else if (formData.catalog_name && formData.schema_name) {
      func.schema = {
        catalog_name: formData.catalog_name,
        schema_name: formData.schema_name,
      };
    }
    
    if (editingKey) {
      if (editingKey !== formData.refName) {
        removeFunction(editingKey);
      }
      updateFunction(formData.refName, func);
    } else {
      addFunction(formData.refName, func);
    }
    
    // Remember last used schema for convenience (including the source type)
    setLastUsedSchema({
      schemaRef: formData.schemaRef,
      catalog_name: formData.catalog_name,
      schema_name: formData.schema_name,
      source: schemaSource,
    });
    
    // Reset form but retain schema selection
    setFormData({ 
      refName: '', 
      schemaRef: formData.schemaRef, 
      catalog_name: formData.catalog_name, 
      schema_name: formData.schema_name, 
      name: '', 
      on_behalf_of_user: false 
    });
    // Keep schemaSource as is
    onClose();
  };

  const handleDelete = (key: string) => {
    removeFunction(key);
  };

  const hasConfiguredSchemas = Object.keys(configuredSchemas).length > 0;
  const isSchemaSelected = schemaSource === 'reference' ? !!formData.schemaRef : (!!formData.catalog_name && !!formData.schema_name);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Code2 className="w-5 h-5 text-pink-400" />
          <h3 className="text-lg font-semibold text-slate-100">Functions</h3>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { 
          setFormData({ 
            refName: '', 
            schemaRef: lastUsedSchema.schemaRef, 
            catalog_name: lastUsedSchema.catalog_name, 
            schema_name: lastUsedSchema.schema_name, 
            name: '', 
            on_behalf_of_user: false 
          }); 
          // Use last used schema source (defaults to 'reference')
          setSchemaSource(lastUsedSchema.source);
          setEditingKey(null); 
          setShowForm(true); 
        }}>
          <Plus className="w-4 h-4 mr-1" />
          Add Function
        </Button>
      </div>

      {/* Existing Resources */}
      {Object.keys(functions).length > 0 && (
        <div className="space-y-2 mb-4">
          {Object.entries(functions).map(([key, func]) => (
            <div key={key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center space-x-3">
                <Code2 className="w-4 h-4 text-pink-400" />
                <div>
                  <p className="font-medium text-slate-200">{key}</p>
                  <p className="text-xs text-slate-500">
                    {func.schema ? `${func.schema.catalog_name}.${func.schema.schema_name}${func.name ? `.${func.name}` : '.*'}` : func.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {func.on_behalf_of_user && (
                  <Badge variant="success" title="On Behalf of User">
                    <User className="w-3 h-3 mr-1" />
                    OBO
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleEdit(key)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(key)}>
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(functions).length === 0 && !showForm && (
        <p className="text-slate-500 text-sm">No functions configured.</p>
      )}

      {/* Form */}
      {showForm && (
        <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
          <h4 className="font-medium text-slate-200">{editingKey ? 'Edit' : 'New'} Function</h4>
          
          <Input
            label="Reference Name"
            value={formData.refName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, refName: e.target.value })}
            placeholder="uc_functions"
            hint={editingKey ? "Changing this will update all references in the YAML" : "Unique key to reference this resource"}
            required
          />
          
          {/* Schema Source Toggle */}
          {hasConfiguredSchemas && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Schema Source</label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => { setSchemaSource('reference'); setFormData({ ...formData, catalog_name: '', schema_name: '' }); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    schemaSource === 'reference'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  Use Configured Schema
                </button>
                <button
                  type="button"
                  onClick={() => { setSchemaSource('direct'); setFormData({ ...formData, schemaRef: '' }); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    schemaSource === 'direct'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  Select Catalog/Schema
                </button>
              </div>
            </div>
          )}
          
          {schemaSource === 'reference' && hasConfiguredSchemas ? (
            <Select
              label="Schema Reference"
              value={formData.schemaRef}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                // Don't set refName here - let function selection set it
                setFormData({ 
                  ...formData, 
                  schemaRef: e.target.value, 
                  name: '',
                });
              }}
              options={[
                { value: '', label: 'Select a configured schema...' },
                ...Object.entries(configuredSchemas).map(([key, s]) => ({
                  value: key,
                  label: `${key} (${s.catalog_name}.${s.schema_name})`,
                })),
              ]}
              hint="Reference a schema defined in the Schemas section"
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Catalog"
                value={formData.catalog_name}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, catalog_name: e.target.value, schema_name: '', name: '' })}
                options={[
                  { value: '', label: 'Select catalog...' },
                  ...(catalogs || []).map((c) => ({ value: c.name, label: c.name })),
                ]}
              />
              <Select
                label="Schema"
                value={formData.schema_name}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  // Don't set refName here - let function selection set it
                  setFormData({ 
                    ...formData, 
                    schema_name: e.target.value, 
                    name: '',
                  });
                }}
                options={[
                  { value: '', label: schemasLoading ? 'Loading schemas...' : 'Select schema...' },
                  ...(schemas || []).map((s) => ({ value: s.name, label: s.name })),
                ]}
                disabled={!formData.catalog_name || schemasLoading}
              />
            </div>
          )}
          
          {/* Show selected schema info when using reference */}
          {schemaSource === 'reference' && formData.schemaRef && configuredSchemas[formData.schemaRef] && (
            <div className="p-2 bg-slate-900/50 rounded text-xs text-slate-400">
              Using schema: <span className="text-slate-300">{configuredSchemas[formData.schemaRef].catalog_name}.{configuredSchemas[formData.schemaRef].schema_name}</span>
            </div>
          )}
          
          <Select
            label="Function"
            value={formData.name}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              const funcName = e.target.value;
              // Use functional update to ensure we have the latest state
              setFormData(prev => {
                // Generate refName based on function name or schema if "all functions"
                let newRefName = '';
                if (funcName) {
                  newRefName = generateRefName(funcName);
                } else if (schemaSource === 'reference' && prev.schemaRef) {
                  const schema = configuredSchemas[prev.schemaRef];
                  if (schema) {
                    newRefName = generateRefName(`${schema.catalog_name}_${schema.schema_name}_functions`);
                  }
                } else if (prev.catalog_name && prev.schema_name) {
                  newRefName = generateRefName(`${prev.catalog_name}_${prev.schema_name}_functions`);
                }
                
                // Only preserve refName if editing existing entry
                const shouldPreserveRefName = editingKey && prev.refName;
                
                return { 
                  ...prev, 
                  name: funcName,
                  refName: shouldPreserveRefName ? prev.refName : newRefName,
                };
              });
            }}
            options={[
              { value: '', label: functionsLoading ? 'Loading functions...' : 'All functions (*)' },
              ...availableFunctions.map((f) => ({ value: f.name, label: f.name })),
            ]}
            disabled={!isSchemaSelected || functionsLoading}
            hint="Leave empty for all functions in schema"
          />
          
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.on_behalf_of_user}
              onChange={(e) => setFormData({ ...formData, on_behalf_of_user: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <UserCheck className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-slate-300">On Behalf of User</span>
          </label>
          
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.refName || !isSchemaSelected}>
              {editingKey ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// Connections Panel
// =============================================================================
function ConnectionsPanel({ showForm, setShowForm, editingKey, setEditingKey, onClose }: PanelProps) {
  const { config, addConnection, updateConnection, removeConnection } = useConfigStore();
  const connections = config.resources?.connections || {};
  const { data: ucConnections, loading } = useUCConnections();
  
  const [formData, setFormData] = useState({
    refName: '',
    name: '',
    on_behalf_of_user: false,
  });

  const handleEdit = (key: string) => {
    const conn = connections[key];
    setFormData({
      refName: key,
      name: conn.name,
      on_behalf_of_user: conn.on_behalf_of_user || false,
    });
    setEditingKey(key);
    setShowForm(true);
  };

  const handleSave = () => {
    const connection: ConnectionModel = {
      name: formData.name,
      on_behalf_of_user: formData.on_behalf_of_user,
    };
    
    if (editingKey) {
      if (editingKey !== formData.refName) {
        removeConnection(editingKey);
      }
      updateConnection(formData.refName, connection);
    } else {
      addConnection(formData.refName, connection);
    }
    
    setFormData({ refName: '', name: '', on_behalf_of_user: false });
    onClose();
  };

  const handleDelete = (key: string) => {
    removeConnection(key);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Link className="w-5 h-5 text-indigo-400" />
          <h3 className="text-lg font-semibold text-slate-100">Connections</h3>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { setFormData({ refName: '', name: '', on_behalf_of_user: false }); setEditingKey(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" />
          Add Connection
        </Button>
      </div>

      {/* Existing Resources */}
      {Object.keys(connections).length > 0 && (
        <div className="space-y-2 mb-4">
          {Object.entries(connections).map(([key, conn]) => (
            <div key={key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center space-x-3">
                <Link className="w-4 h-4 text-indigo-400" />
                <div>
                  <p className="font-medium text-slate-200">{key}</p>
                  <p className="text-xs text-slate-500">
                    UC Connection: {conn.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {conn.on_behalf_of_user && (
                  <Badge variant="success" title="On Behalf of User">
                    <User className="w-3 h-3 mr-1" />
                    OBO
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleEdit(key)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(key)}>
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(connections).length === 0 && !showForm && (
        <p className="text-slate-500 text-sm">No connections configured.</p>
      )}

      {/* Form */}
      {showForm && (
        <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
          <h4 className="font-medium text-slate-200">{editingKey ? 'Edit' : 'New'} Connection</h4>
          
          <Input
            label="Reference Name"
            value={formData.refName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, refName: e.target.value })}
            placeholder="external_api"
            hint={editingKey ? "Changing this will update all references in the YAML" : "Unique key to reference this resource"}
            required
          />
          
          <Select
            label="Unity Catalog Connection"
            value={formData.name}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              setFormData({ 
                ...formData, 
                name: e.target.value,
                refName: formData.refName || generateRefName(e.target.value),
              });
            }}
            options={[
              { value: '', label: loading ? 'Loading connections...' : 'Select a connection...' },
              ...(ucConnections || []).map((c) => ({
                value: c.name,
                label: `${c.name}${c.connection_type ? ` (${c.connection_type})` : ''}`,
              })),
            ]}
            hint="Select from available Unity Catalog connections"
            required
          />
          
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.on_behalf_of_user}
              onChange={(e) => setFormData({ ...formData, on_behalf_of_user: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <UserCheck className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-slate-300">On Behalf of User</span>
          </label>
          
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.refName || !formData.name}>
              {editingKey ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// Databases Panel (Lakebase/PostgreSQL)
// =============================================================================
type CredentialSource = 'manual' | 'variable';

interface DatabaseFormData {
  refName: string;
  name: string;
  instanceSource: 'existing' | 'new';
  instance_name: string;
  description: string;
  capacity: 'CU_1' | 'CU_2';
  max_pool_size: number;
  timeout_seconds: number;
  authMethod: 'oauth' | 'user';
  clientIdSource: CredentialSource;
  clientSecretSource: CredentialSource;
  workspaceHostSource: CredentialSource;
  client_id: string;
  client_secret: string;
  workspace_host: string;
  clientIdVariable: string;
  clientSecretVariable: string;
  workspaceHostVariable: string;
  userSource: CredentialSource;
  passwordSource: CredentialSource;
  user: string;
  password: string;
  userVariable: string;
  passwordVariable: string;
  on_behalf_of_user: boolean;
}

const defaultDatabaseForm: DatabaseFormData = {
  refName: '',
  name: '',
  instanceSource: 'existing',
  instance_name: '',
  description: '',
  capacity: 'CU_2',
  max_pool_size: 10,
  timeout_seconds: 10,
  authMethod: 'oauth',
  clientIdSource: 'variable',
  clientSecretSource: 'variable',
  workspaceHostSource: 'variable',
  client_id: '',
  client_secret: '',
  workspace_host: '',
  clientIdVariable: '',
  clientSecretVariable: '',
  workspaceHostVariable: '',
  userSource: 'manual',
  passwordSource: 'variable',
  user: '',
  password: '',
  userVariable: '',
  passwordVariable: '',
  on_behalf_of_user: false,
};

const capacityOptions = [
  { value: 'CU_1', label: 'CU_1 (Small)' },
  { value: 'CU_2', label: 'CU_2 (Large)' },
];

const authMethodOptions = [
  { value: 'oauth', label: 'OAuth2 (Service Principal)' },
  { value: 'user', label: 'User/Password' },
];

// Helper to format variable reference for YAML
const formatVariableRef = (variableName: string): string => {
  return `*${variableName}`;
};

// Helper to get display name for variable
const getVariableDisplayName = (variable: VariableModel): string => {
  if ('env' in variable) return `env: ${variable.env}`;
  if ('scope' in variable && 'secret' in variable) return `secret: ${variable.scope}/${variable.secret}`;
  if ('value' in variable) return `value: ${String(variable.value)}`;
  if ('options' in variable) return `composite (${variable.options.length} options)`;
  return 'unknown';
};

// Credential input component with variable selection - defined outside to prevent re-creation on render
interface CredentialInputProps {
  label: string;
  source: CredentialSource;
  onSourceChange: (source: CredentialSource) => void;
  manualValue: string;
  onManualChange: (value: string) => void;
  variableValue: string;
  onVariableChange: (value: string) => void;
  placeholder?: string;
  isPassword?: boolean;
  hint?: string;
  variableNames: string[];
  variables: Record<string, VariableModel>;
}

function CredentialInput({
  label,
  source,
  onSourceChange,
  manualValue,
  onManualChange,
  variableValue,
  onVariableChange,
  placeholder,
  isPassword = false,
  hint,
  variableNames,
  variables,
}: CredentialInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-300">{label}</label>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => onSourceChange('variable')}
            className={`px-2 py-1 text-xs rounded flex items-center space-x-1 ${source === 'variable' ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-700 text-slate-400'}`}
          >
            <Key className="w-3 h-3" />
            <span>Variable</span>
          </button>
          <button
            type="button"
            onClick={() => onSourceChange('manual')}
            className={`px-2 py-1 text-xs rounded ${source === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'}`}
          >
            Manual
          </button>
        </div>
      </div>
      
      {source === 'variable' ? (
        <Select
          value={variableValue}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onVariableChange(e.target.value)}
          options={[
            { value: '', label: 'Select a variable...' },
            ...variableNames.map((name) => ({
              value: name,
              label: `${name} (${getVariableDisplayName(variables[name] as VariableModel)})`,
            })),
          ]}
          hint={variableNames.length === 0 ? 'Define variables in the Variables section first' : hint}
        />
      ) : (
        <Input
          value={manualValue}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onManualChange(e.target.value)}
          placeholder={placeholder}
          type={isPassword ? 'password' : 'text'}
          hint={hint}
        />
      )}
    </div>
  );
}

function DatabasesPanel({ showForm, setShowForm, editingKey, setEditingKey, onClose }: PanelProps) {
  const { config, addDatabase, updateDatabase, removeDatabase } = useConfigStore();
  const databases = config.resources?.databases || {};
  const variables = config.variables || {};
  const variableNames = Object.keys(variables);
  
  const { data: lakebaseInstances, loading: loadingInstances, refetch: refetchInstances } = useDatabases();

  // Status mapper for Lakebase instances (same pattern as SQL warehouses)
  const getDatabaseStatus = (state: string | undefined): StatusType => {
    switch (state?.toUpperCase()) {
      case 'AVAILABLE':
      case 'RUNNING':
        return 'ready';
      case 'CREATING':
      case 'STARTING':
      case 'STOPPING':
      case 'PROVISIONING':
      case 'UPDATING':
        return 'transitioning';
      case 'STOPPED':
      case 'FAILED':
      case 'DELETED':
      case 'DELETING':
        return 'stopped';
      default:
        return 'unknown';
    }
  };

  const databaseOptions: StatusSelectOption[] = [
    { value: '', label: loadingInstances ? 'Loading...' : 'Select an instance...' },
    ...(lakebaseInstances || []).map((inst) => ({
      value: inst.name,
      label: inst.name,
      status: getDatabaseStatus(inst.state),
    })),
  ];
  
  const [formData, setFormData] = useState<DatabaseFormData>(defaultDatabaseForm);

  const handleEdit = (key: string) => {
    const db = databases[key];
    if (db) {
      const isVariableRef = (val?: string): boolean => val ? val.startsWith('*') : false;
      const getVarSlice = (val?: string): string => val && val.startsWith('*') ? val.slice(1) : '';
      
      setFormData({
        refName: key,
        name: db.name,
        instanceSource: 'existing',
        instance_name: db.instance_name || '',
        description: db.description || '',
        capacity: db.capacity || 'CU_2',
        max_pool_size: db.max_pool_size || 10,
        timeout_seconds: db.timeout_seconds || 10,
        authMethod: db.client_id ? 'oauth' : 'user',
        clientIdSource: isVariableRef(db.client_id) ? 'variable' : 'manual',
        clientSecretSource: isVariableRef(db.client_secret) ? 'variable' : 'manual',
        workspaceHostSource: isVariableRef(db.workspace_host) ? 'variable' : 'manual',
        client_id: isVariableRef(db.client_id) ? '' : (db.client_id || ''),
        client_secret: isVariableRef(db.client_secret) ? '' : (db.client_secret || ''),
        workspace_host: isVariableRef(db.workspace_host) ? '' : (db.workspace_host || ''),
        clientIdVariable: getVarSlice(db.client_id),
        clientSecretVariable: getVarSlice(db.client_secret),
        workspaceHostVariable: getVarSlice(db.workspace_host),
        userSource: isVariableRef(db.user) ? 'variable' : 'manual',
        passwordSource: isVariableRef(db.password) ? 'variable' : 'manual',
        user: isVariableRef(db.user) ? '' : (db.user || ''),
        password: isVariableRef(db.password) ? '' : (db.password || ''),
        userVariable: getVarSlice(db.user),
        passwordVariable: getVarSlice(db.password),
        on_behalf_of_user: db.on_behalf_of_user || false,
      });
      setEditingKey(key);
      setShowForm(true);
    }
  };

  const handleDelete = (key: string) => {
    removeDatabase(key);
  };

  const getCredentialValue = (source: CredentialSource, manualValue: string, variableName: string): string => {
    if (source === 'variable' && variableName) {
      return formatVariableRef(variableName);
    }
    return manualValue;
  };

  const handleSave = () => {
    const db: DatabaseModel = {
      name: formData.name,
      instance_name: formData.instance_name || undefined,
      description: formData.description || undefined,
      capacity: formData.capacity,
      max_pool_size: formData.max_pool_size,
      timeout_seconds: formData.timeout_seconds,
      on_behalf_of_user: formData.on_behalf_of_user || undefined,
    };
    
    if (formData.authMethod === 'oauth') {
      const clientId = getCredentialValue(formData.clientIdSource, formData.client_id, formData.clientIdVariable);
      const clientSecret = getCredentialValue(formData.clientSecretSource, formData.client_secret, formData.clientSecretVariable);
      const workspaceHost = getCredentialValue(formData.workspaceHostSource, formData.workspace_host, formData.workspaceHostVariable);
      
      if (clientId) db.client_id = clientId;
      if (clientSecret) db.client_secret = clientSecret;
      if (workspaceHost) db.workspace_host = workspaceHost;
    } else {
      const user = getCredentialValue(formData.userSource, formData.user, formData.userVariable);
      const password = getCredentialValue(formData.passwordSource, formData.password, formData.passwordVariable);
      
      if (user) db.user = user;
      if (password) db.password = password;
    }
    
    if (editingKey) {
      if (editingKey !== formData.refName) {
        removeDatabase(editingKey);
        addDatabase(formData.refName, db);
      } else {
        updateDatabase(editingKey, db);
      }
    } else {
      addDatabase(formData.refName, db);
    }
    
    setShowForm(false);
    setEditingKey(null);
    setFormData(defaultDatabaseForm);
    onClose();
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Server className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold text-slate-100">Databases (Lakebase/PostgreSQL)</h3>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { setFormData(defaultDatabaseForm); setEditingKey(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" />
          Add Database
        </Button>
      </div>

      {/* Existing Resources */}
      {Object.keys(databases).length > 0 && (
        <div className="space-y-2 mb-4">
          {Object.entries(databases).map(([key, db]) => (
            <div key={key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center space-x-3">
                <Server className="w-4 h-4 text-emerald-400" />
                <div>
                  <p className="font-medium text-slate-200">{key}</p>
                  <p className="text-xs text-slate-500">
                    {db.instance_name || db.name || 'Default instance'} • {db.capacity || 'CU_2'}
                    {db.client_id ? ' • OAuth' : db.user ? ' • User auth' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {db.on_behalf_of_user && (
                  <Badge variant="success" title="On Behalf of User">
                    <User className="w-3 h-3 mr-1" />
                    OBO
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleEdit(key)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(key)}>
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(databases).length === 0 && !showForm && (
        <p className="text-slate-500 text-sm">No databases configured. Add a database for PostgreSQL/Lakebase memory storage.</p>
      )}

      {/* Form */}
      {showForm && (
        <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
          <h4 className="font-medium text-slate-200">{editingKey ? 'Edit' : 'New'} Database</h4>
          
          <Input
            label="Reference Name"
            value={formData.refName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, refName: e.target.value })}
            placeholder="retail_database"
            hint={editingKey ? "Changing this will update all references in the YAML" : "Unique key to reference this resource"}
            required
          />
          
          {/* Lakebase Instance Selection */}
          <div className="space-y-3 p-3 bg-slate-900/50 rounded border border-slate-600">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-300 font-medium flex items-center">
                <CloudCog className="w-4 h-4 mr-2 text-emerald-400" />
                Lakebase Instance
              </p>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, instanceSource: 'existing' })}
                  className={`px-2 py-1 text-xs rounded ${formData.instanceSource === 'existing' ? 'bg-emerald-500/30 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}
                >
                  Use Existing
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, instanceSource: 'new' })}
                  className={`px-2 py-1 text-xs rounded ${formData.instanceSource === 'new' ? 'bg-emerald-500/30 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}
                >
                  Create New
                </button>
              </div>
            </div>
            
            {formData.instanceSource === 'existing' ? (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Select Lakebase Instance</label>
                    <StatusSelect
                      value={formData.instance_name}
                      onChange={(value) => {
                        setFormData({ 
                          ...formData, 
                          instance_name: value,
                          name: value || formData.name,
                          refName: editingKey ? formData.refName : generateRefName(value),
                        });
                      }}
                      options={databaseOptions}
                      placeholder="Select an instance..."
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetchInstances()}
                    disabled={loadingInstances}
                    className="mt-6"
                  >
                    {loadingInstances ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">Or enter instance name manually:</p>
                <Input
                  value={formData.instance_name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, instance_name: e.target.value })}
                  placeholder="my-lakebase-instance"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  label="New Instance Name"
                  value={formData.instance_name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const instanceName = e.target.value;
                    setFormData({ 
                      ...formData, 
                      instance_name: instanceName,
                      name: instanceName || formData.name,
                      refName: editingKey ? formData.refName : generateRefName(instanceName),
                    });
                  }}
                  placeholder="my-new-lakebase"
                  hint="Name for the new Lakebase instance to create"
                />
                <Select
                  label="Capacity"
                  value={formData.capacity}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, capacity: e.target.value as 'CU_1' | 'CU_2' })}
                  options={capacityOptions}
                  hint="CU_1 = Small (dev/test), CU_2 = Large (production)"
                />
                <p className="text-xs text-amber-400">
                  Note: Instance will be created when the agent is deployed with this configuration.
                </p>
              </div>
            )}
          </div>
          
          <Input
            label="Display Name"
            value={formData.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Retail Database"
          />
          
          <Input
            label="Description"
            value={formData.description}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Database for agent memory and checkpoints"
          />
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Max Pool Size"
              type="number"
              value={formData.max_pool_size}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, max_pool_size: parseInt(e.target.value) || 10 })}
            />
            <Input
              label="Timeout (seconds)"
              type="number"
              value={formData.timeout_seconds}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, timeout_seconds: parseInt(e.target.value) || 10 })}
            />
          </div>
          
          <Select
            label="Authentication Method"
            value={formData.authMethod}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, authMethod: e.target.value as 'oauth' | 'user' })}
            options={authMethodOptions}
          />
          
          {formData.authMethod === 'oauth' ? (
            <div className="space-y-4 p-3 bg-slate-900/50 rounded border border-slate-600">
              <p className="text-xs text-slate-400 font-medium">OAuth2 / Service Principal Credentials</p>
              
              <CredentialInput
                label="Client ID"
                source={formData.clientIdSource}
                onSourceChange={(s) => setFormData({ ...formData, clientIdSource: s })}
                manualValue={formData.client_id}
                onManualChange={(v) => setFormData({ ...formData, client_id: v })}
                variableValue={formData.clientIdVariable}
                onVariableChange={(v) => setFormData({ ...formData, clientIdVariable: v })}
                placeholder="your-service-principal-client-id"
                variableNames={variableNames}
                variables={variables}
              />
              
              <CredentialInput
                label="Client Secret"
                source={formData.clientSecretSource}
                onSourceChange={(s) => setFormData({ ...formData, clientSecretSource: s })}
                manualValue={formData.client_secret}
                onManualChange={(v) => setFormData({ ...formData, client_secret: v })}
                variableValue={formData.clientSecretVariable}
                onVariableChange={(v) => setFormData({ ...formData, clientSecretVariable: v })}
                placeholder="your-client-secret"
                isPassword
                variableNames={variableNames}
                variables={variables}
              />
              
              <CredentialInput
                label="Workspace Host (Optional)"
                source={formData.workspaceHostSource}
                onSourceChange={(s) => setFormData({ ...formData, workspaceHostSource: s })}
                manualValue={formData.workspace_host}
                onManualChange={(v) => setFormData({ ...formData, workspace_host: v })}
                variableValue={formData.workspaceHostVariable}
                onVariableChange={(v) => setFormData({ ...formData, workspaceHostVariable: v })}
                placeholder="https://your-workspace.cloud.databricks.com"
                hint="Only required if connecting from outside the workspace"
                variableNames={variableNames}
                variables={variables}
              />
            </div>
          ) : (
            <div className="space-y-4 p-3 bg-slate-900/50 rounded border border-slate-600">
              <p className="text-xs text-slate-400 font-medium">User/Password Credentials</p>
              
              <CredentialInput
                label="Username"
                source={formData.userSource}
                onSourceChange={(s) => setFormData({ ...formData, userSource: s })}
                manualValue={formData.user}
                onManualChange={(v) => setFormData({ ...formData, user: v })}
                variableValue={formData.userVariable}
                onVariableChange={(v) => setFormData({ ...formData, userVariable: v })}
                placeholder="postgres"
                variableNames={variableNames}
                variables={variables}
              />
              
              <CredentialInput
                label="Password"
                source={formData.passwordSource}
                onSourceChange={(s) => setFormData({ ...formData, passwordSource: s })}
                manualValue={formData.password}
                onManualChange={(v) => setFormData({ ...formData, password: v })}
                variableValue={formData.passwordVariable}
                onVariableChange={(v) => setFormData({ ...formData, passwordVariable: v })}
                placeholder="your-password"
                isPassword
                variableNames={variableNames}
                variables={variables}
              />
            </div>
          )}
          
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.on_behalf_of_user}
              onChange={(e) => setFormData({ ...formData, on_behalf_of_user: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <UserCheck className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-slate-300">On Behalf of User</span>
          </label>
          
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.refName || !formData.name}>
              {editingKey ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// =============================================================================
// Vector Stores Panel
// =============================================================================
interface VectorStoreFormData {
  refName: string;
  // Endpoint (optional - auto-detected if not specified)
  endpoint_name: string;
  endpoint_type: 'STANDARD' | 'OPTIMIZED_STORAGE';
  // Index - schema source (uses SchemaSource type defined earlier)
  // Index is optional - auto-generated from source_table name if not specified
  indexSchemaSource: SchemaSource;
  indexSchemaRefName: string;
  index_catalog: string;
  index_schema: string;
  indexNameSource: 'select' | 'manual';
  index_name: string;
  // Source Table - schema source (REQUIRED)
  sourceSchemaSource: SchemaSource;
  sourceSchemaRefName: string;
  source_catalog: string;
  source_schema: string;
  source_table: string;
  // Fields
  primary_key: string;  // Optional - auto-detected from table
  embedding_source_column: string;  // REQUIRED
  columns: string[];  // Optional
  doc_uri: string;  // Optional
  // Embedding model (optional - defaults to databricks-gte-large-en)
  embedding_model: string;
  // Optional volume paths (VolumePathModel)
  // Source path - schema source (similar to table/function schema selection)
  sourcePathEnabled: boolean;
  sourcePathSchemaSource: SchemaSource;  // 'reference' or 'direct'
  sourcePathSchemaRef: string;  // Reference to configured schema
  sourcePathVolumeCatalog: string;  // For direct schema selection
  sourcePathVolumeSchema: string;  // For direct schema selection
  sourcePathVolumeName: string;  // Volume name within the selected schema
  sourcePathPath: string;  // Path within the volume
  // Checkpoint path - schema source (similar to table/function schema selection)
  checkpointPathEnabled: boolean;
  checkpointPathSchemaSource: SchemaSource;  // 'reference' or 'direct'
  checkpointPathSchemaRef: string;  // Reference to configured schema
  checkpointPathVolumeCatalog: string;  // For direct schema selection
  checkpointPathVolumeSchema: string;  // For direct schema selection
  checkpointPathVolumeName: string;  // Volume name within the selected schema
  checkpointPathPath: string;  // Path within the volume
  on_behalf_of_user: boolean;
}

const defaultVectorStoreForm: VectorStoreFormData = {
  refName: '',
  endpoint_name: '',
  endpoint_type: 'STANDARD',
  indexSchemaSource: 'direct',
  indexSchemaRefName: '',
  index_catalog: '',
  index_schema: '',
  indexNameSource: 'select',
  index_name: '',
  sourceSchemaSource: 'direct',
  sourceSchemaRefName: '',
  source_catalog: '',
  source_schema: '',
  source_table: '',
  primary_key: '',
  embedding_source_column: '',
  columns: [],
  doc_uri: '',
  embedding_model: 'databricks-gte-large-en',
  sourcePathEnabled: false,
  sourcePathSchemaSource: 'direct',
  sourcePathSchemaRef: '',
  sourcePathVolumeCatalog: '',
  sourcePathVolumeSchema: '',
  sourcePathVolumeName: '',
  sourcePathPath: '',
  checkpointPathEnabled: false,
  checkpointPathSchemaSource: 'direct',
  checkpointPathSchemaRef: '',
  checkpointPathVolumeCatalog: '',
  checkpointPathVolumeSchema: '',
  checkpointPathVolumeName: '',
  checkpointPathPath: '',
  on_behalf_of_user: false,
};

// Volume Paths Section Component
interface VolumePathsSectionProps {
  formData: VectorStoreFormData;
  setFormData: React.Dispatch<React.SetStateAction<VectorStoreFormData>>;
  configuredSchemas: Record<string, { catalog_name: string; schema_name: string }>;
  configuredSchemaOptions: { value: string; label: string }[];
  catalogs: { name: string }[] | null;
  sourcePathSchemas: { name: string }[] | null;
  sourcePathVolumes: { name: string }[] | null;
  sourcePathVolumesLoading: boolean;
  checkpointPathSchemas: { name: string }[] | null;
  checkpointPathVolumes: { name: string }[] | null;
  checkpointPathVolumesLoading: boolean;
}

function VolumePathsSection({
  formData,
  setFormData,
  configuredSchemas,
  configuredSchemaOptions,
  catalogs,
  sourcePathSchemas,
  sourcePathVolumes,
  sourcePathVolumesLoading,
  checkpointPathSchemas,
  checkpointPathVolumes,
  checkpointPathVolumesLoading,
}: VolumePathsSectionProps) {
  const hasConfiguredSchemas = Object.keys(configuredSchemas).length > 0;
  
  return (
    <div className="space-y-4 p-3 bg-slate-900/50 rounded border border-slate-600">
      <p className="text-sm text-slate-300 font-medium">Volume Paths <span className="text-slate-500 font-normal">(Optional)</span></p>
      
      {/* Source Path */}
      <div className="space-y-3 p-3 bg-slate-800/30 rounded border border-slate-700">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">Source Path</label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.sourcePathEnabled}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                sourcePathEnabled: e.target.checked,
                sourcePathSchemaSource: hasConfiguredSchemas ? 'reference' : 'direct',
              }))}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-400">Enable</span>
          </label>
        </div>
        
        {formData.sourcePathEnabled && (
          <>
            {/* Schema Source Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400">Schema</label>
              <div className="flex items-center space-x-2">
                {hasConfiguredSchemas && (
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ 
                      ...prev, 
                      sourcePathSchemaSource: 'reference',
                      sourcePathVolumeCatalog: '',
                      sourcePathVolumeSchema: '',
                      sourcePathVolumeName: '',
                    }))}
                    className={`px-2 py-1 text-xs rounded ${
                      formData.sourcePathSchemaSource === 'reference' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    Configured
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    sourcePathSchemaSource: 'direct',
                    sourcePathSchemaRef: '',
                    sourcePathVolumeName: '',
                  }))}
                  className={`px-2 py-1 text-xs rounded ${
                    formData.sourcePathSchemaSource === 'direct' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  Select
                </button>
              </div>
            </div>
            
            {/* Schema Selection */}
            {formData.sourcePathSchemaSource === 'reference' ? (
              <Select
                value={formData.sourcePathSchemaRef}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const schemaRef = e.target.value;
                  const schema = configuredSchemas[schemaRef];
                  setFormData(prev => ({ 
                    ...prev, 
                    sourcePathSchemaRef: schemaRef,
                    sourcePathVolumeCatalog: schema?.catalog_name || '',
                    sourcePathVolumeSchema: schema?.schema_name || '',
                    sourcePathVolumeName: '',
                  }));
                }}
                options={[
                  { value: '', label: 'Select configured schema...' },
                  ...configuredSchemaOptions,
                ]}
                hint="Select a previously configured schema"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={formData.sourcePathVolumeCatalog}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData(prev => ({ 
                    ...prev, 
                    sourcePathVolumeCatalog: e.target.value,
                    sourcePathVolumeSchema: '',
                    sourcePathVolumeName: '',
                  }))}
                  options={[
                    { value: '', label: 'Catalog...' },
                    ...(catalogs || []).map(c => ({ value: c.name, label: c.name })),
                  ]}
                />
                <Select
                  value={formData.sourcePathVolumeSchema}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData(prev => ({ 
                    ...prev, 
                    sourcePathVolumeSchema: e.target.value,
                    sourcePathVolumeName: '',
                  }))}
                  options={[
                    { value: '', label: 'Schema...' },
                    ...(sourcePathSchemas || []).map(s => ({ value: s.name, label: s.name })),
                  ]}
                  disabled={!formData.sourcePathVolumeCatalog}
                />
              </div>
            )}
            
            {/* Volume Selection */}
            <Select
              label="Volume"
              value={formData.sourcePathVolumeName}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData(prev => ({ ...prev, sourcePathVolumeName: e.target.value }))}
              options={[
                { value: '', label: sourcePathVolumesLoading ? 'Loading volumes...' : 'Select volume...' },
                ...(sourcePathVolumes || []).map(v => ({ value: v.name, label: v.name })),
              ]}
              disabled={!formData.sourcePathVolumeSchema || sourcePathVolumesLoading}
              hint="Select a volume from the schema"
            />
            
            {/* Path Input */}
            <Input
              label="Path"
              value={formData.sourcePathPath}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, sourcePathPath: e.target.value }))}
              placeholder="/path/to/source/data"
              hint="Path within the volume for source data files"
            />
          </>
        )}
      </div>
      
      {/* Checkpoint Path */}
      <div className="space-y-3 p-3 bg-slate-800/30 rounded border border-slate-700">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">Checkpoint Path</label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.checkpointPathEnabled}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                checkpointPathEnabled: e.target.checked,
                checkpointPathSchemaSource: hasConfiguredSchemas ? 'reference' : 'direct',
              }))}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-400">Enable</span>
          </label>
        </div>
        
        {formData.checkpointPathEnabled && (
          <>
            {/* Schema Source Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400">Schema</label>
              <div className="flex items-center space-x-2">
                {hasConfiguredSchemas && (
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ 
                      ...prev, 
                      checkpointPathSchemaSource: 'reference',
                      checkpointPathVolumeCatalog: '',
                      checkpointPathVolumeSchema: '',
                      checkpointPathVolumeName: '',
                    }))}
                    className={`px-2 py-1 text-xs rounded ${
                      formData.checkpointPathSchemaSource === 'reference' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    Configured
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    checkpointPathSchemaSource: 'direct',
                    checkpointPathSchemaRef: '',
                    checkpointPathVolumeName: '',
                  }))}
                  className={`px-2 py-1 text-xs rounded ${
                    formData.checkpointPathSchemaSource === 'direct' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  Select
                </button>
              </div>
            </div>
            
            {/* Schema Selection */}
            {formData.checkpointPathSchemaSource === 'reference' ? (
              <Select
                value={formData.checkpointPathSchemaRef}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const schemaRef = e.target.value;
                  const schema = configuredSchemas[schemaRef];
                  setFormData(prev => ({ 
                    ...prev, 
                    checkpointPathSchemaRef: schemaRef,
                    checkpointPathVolumeCatalog: schema?.catalog_name || '',
                    checkpointPathVolumeSchema: schema?.schema_name || '',
                    checkpointPathVolumeName: '',
                  }));
                }}
                options={[
                  { value: '', label: 'Select configured schema...' },
                  ...configuredSchemaOptions,
                ]}
                hint="Select a previously configured schema"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={formData.checkpointPathVolumeCatalog}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData(prev => ({ 
                    ...prev, 
                    checkpointPathVolumeCatalog: e.target.value,
                    checkpointPathVolumeSchema: '',
                    checkpointPathVolumeName: '',
                  }))}
                  options={[
                    { value: '', label: 'Catalog...' },
                    ...(catalogs || []).map(c => ({ value: c.name, label: c.name })),
                  ]}
                />
                <Select
                  value={formData.checkpointPathVolumeSchema}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData(prev => ({ 
                    ...prev, 
                    checkpointPathVolumeSchema: e.target.value,
                    checkpointPathVolumeName: '',
                  }))}
                  options={[
                    { value: '', label: 'Schema...' },
                    ...(checkpointPathSchemas || []).map(s => ({ value: s.name, label: s.name })),
                  ]}
                  disabled={!formData.checkpointPathVolumeCatalog}
                />
              </div>
            )}
            
            {/* Volume Selection */}
            <Select
              label="Volume"
              value={formData.checkpointPathVolumeName}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData(prev => ({ ...prev, checkpointPathVolumeName: e.target.value }))}
              options={[
                { value: '', label: checkpointPathVolumesLoading ? 'Loading volumes...' : 'Select volume...' },
                ...(checkpointPathVolumes || []).map(v => ({ value: v.name, label: v.name })),
              ]}
              disabled={!formData.checkpointPathVolumeSchema || checkpointPathVolumesLoading}
              hint="Select a volume from the schema"
            />
            
            {/* Path Input */}
            <Input
              label="Path"
              value={formData.checkpointPathPath}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, checkpointPathPath: e.target.value }))}
              placeholder="/path/to/checkpoints"
              hint="Path within the volume for vector index checkpoints"
            />
          </>
        )}
      </div>
    </div>
  );
}

function VectorStoresPanel({ showForm, setShowForm, editingKey, setEditingKey, onClose }: PanelProps) {
  const { config, addVectorStore, updateVectorStore, removeVectorStore } = useConfigStore();
  const vectorStores = config.resources?.vector_stores || {};
  const configuredLLMs = config.resources?.llms || {};
  const configuredSchemas = config.schemas || {};
  const configuredVolumes = config.resources?.volumes || {};
  
  // Fetch data from Databricks
  const { data: vsEndpoints, loading: endpointsLoading, refetch: refetchEndpoints } = useVectorSearchEndpoints();
  const { data: catalogs } = useCatalogs();
  
  const [formData, setFormData] = useState<VectorStoreFormData>(defaultVectorStoreForm);
  const [columnsInput, setColumnsInput] = useState('');
  
  // Schema selection for index and source table
  const { data: indexSchemas } = useSchemas(formData.index_catalog || null);
  const { data: sourceSchemas } = useSchemas(formData.source_catalog || null);
  const { data: sourceTables, loading: tablesLoading } = useTables(
    formData.source_catalog || null,
    formData.source_schema || null
  );
  
  // Tables for index schema (used for index name selection)
  const { data: indexTables, loading: indexTablesLoading } = useTables(
    formData.index_catalog || null,
    formData.index_schema || null
  );
  
  // Fetch table columns when a source table is selected
  const { data: tableColumns, loading: columnsLoading, refetch: refetchColumns } = useTableColumns(
    formData.source_catalog || null,
    formData.source_schema || null,
    formData.source_table || null
  );
  
  // Build column options from table columns
  const columnOptions = (tableColumns || []).map(col => ({
    value: col.name,
    label: `${col.name}${col.type_text ? ` (${col.type_text})` : ''}`,
  }));
  
  // Vector search indexes for selected endpoint
  const { data: vsIndexes, loading: indexesLoading, refetch: refetchIndexes } = useVectorSearchIndexes(formData.endpoint_name || null);
  
  // Volume path selection - schemas and volumes for source path
  const { data: sourcePathSchemas } = useSchemas(formData.sourcePathVolumeCatalog || null);
  const { data: sourcePathVolumes, loading: sourcePathVolumesLoading } = useVolumes(
    formData.sourcePathVolumeCatalog || null,
    formData.sourcePathVolumeSchema || null
  );
  
  // Volume path selection - schemas and volumes for checkpoint path
  const { data: checkpointPathSchemas } = useSchemas(formData.checkpointPathVolumeCatalog || null);
  const { data: checkpointPathVolumes, loading: checkpointPathVolumesLoading } = useVolumes(
    formData.checkpointPathVolumeCatalog || null,
    formData.checkpointPathVolumeSchema || null
  );

  // Build configured schema options
  const configuredSchemaOptions = Object.entries(configuredSchemas).map(([key, schema]) => ({
    value: key,
    label: `${key} (${schema.catalog_name}.${schema.schema_name})`,
  }));

  const handleEdit = (key: string) => {
    const vs = vectorStores[key];
    if (vs) {
      // Check if the index schema matches a configured schema
      const indexSchemaRef = Object.entries(configuredSchemas).find(
        ([_, schema]) => 
          schema.catalog_name === vs.index?.schema?.catalog_name && 
          schema.schema_name === vs.index?.schema?.schema_name
      );
      // Check if the source table schema matches a configured schema
      const sourceSchemaRef = Object.entries(configuredSchemas).find(
        ([_, schema]) => 
          schema.catalog_name === vs.source_table?.schema?.catalog_name && 
          schema.schema_name === vs.source_table?.schema?.schema_name
      );
      
      // Parse source_path VolumePathModel
      const sourcePath = vs.source_path as any;
      let sourcePathEnabled = false;
      let sourcePathSchemaSource: SchemaSource = 'direct';
      let sourcePathSchemaRef = '';
      let sourcePathVolumeCatalog = '';
      let sourcePathVolumeSchema = '';
      let sourcePathVolumeName = '';
      let sourcePathPath = '';
      if (sourcePath?.volume) {
        sourcePathEnabled = true;
        sourcePathPath = sourcePath.path || '';
        // Get volume schema info
        let volumeCatalog = '';
        let volumeSchema = '';
        let volumeName = '';
        
        if (typeof sourcePath.volume === 'string') {
          // It's a reference - find the volume to get schema info
          const refName = sourcePath.volume.startsWith('*') ? sourcePath.volume.slice(1) : sourcePath.volume;
          const referencedVolume = configuredVolumes[refName];
          if (referencedVolume) {
            volumeCatalog = referencedVolume.schema?.catalog_name || '';
            volumeSchema = referencedVolume.schema?.schema_name || '';
            volumeName = referencedVolume.name;
          }
        } else {
          volumeCatalog = sourcePath.volume?.schema?.catalog_name || '';
          volumeSchema = sourcePath.volume?.schema?.schema_name || '';
          volumeName = sourcePath.volume?.name || '';
        }
        
        // Check if the schema matches a configured schema
        const schemaRef = Object.entries(configuredSchemas).find(
          ([_, s]) => s.catalog_name === volumeCatalog && s.schema_name === volumeSchema
        );
        if (schemaRef) {
          sourcePathSchemaSource = 'reference';
          sourcePathSchemaRef = schemaRef[0];
        } else {
          sourcePathSchemaSource = 'direct';
        }
        sourcePathVolumeCatalog = volumeCatalog;
        sourcePathVolumeSchema = volumeSchema;
        sourcePathVolumeName = volumeName;
      }
      
      // Parse checkpoint_path VolumePathModel
      const checkpointPath = vs.checkpoint_path as any;
      let checkpointPathEnabled = false;
      let checkpointPathSchemaSource: SchemaSource = 'direct';
      let checkpointPathSchemaRef = '';
      let checkpointPathVolumeCatalog = '';
      let checkpointPathVolumeSchema = '';
      let checkpointPathVolumeName = '';
      let checkpointPathPath = '';
      if (checkpointPath?.volume) {
        checkpointPathEnabled = true;
        checkpointPathPath = checkpointPath.path || '';
        let volumeCatalog = '';
        let volumeSchema = '';
        let volumeName = '';
        
        if (typeof checkpointPath.volume === 'string') {
          const refName = checkpointPath.volume.startsWith('*') ? checkpointPath.volume.slice(1) : checkpointPath.volume;
          const referencedVolume = configuredVolumes[refName];
          if (referencedVolume) {
            volumeCatalog = referencedVolume.schema?.catalog_name || '';
            volumeSchema = referencedVolume.schema?.schema_name || '';
            volumeName = referencedVolume.name;
          }
        } else {
          volumeCatalog = checkpointPath.volume?.schema?.catalog_name || '';
          volumeSchema = checkpointPath.volume?.schema?.schema_name || '';
          volumeName = checkpointPath.volume?.name || '';
        }
        
        const schemaRef = Object.entries(configuredSchemas).find(
          ([_, s]) => s.catalog_name === volumeCatalog && s.schema_name === volumeSchema
        );
        if (schemaRef) {
          checkpointPathSchemaSource = 'reference';
          checkpointPathSchemaRef = schemaRef[0];
        } else {
          checkpointPathSchemaSource = 'direct';
        }
        checkpointPathVolumeCatalog = volumeCatalog;
        checkpointPathVolumeSchema = volumeSchema;
        checkpointPathVolumeName = volumeName;
      }
      
      setFormData({
        refName: key,
        endpoint_name: vs.endpoint?.name || '',
        endpoint_type: vs.endpoint?.type || 'STANDARD',
        indexSchemaSource: indexSchemaRef ? 'reference' : 'direct',
        indexSchemaRefName: indexSchemaRef ? indexSchemaRef[0] : '',
        index_catalog: vs.index?.schema?.catalog_name || '',
        index_schema: vs.index?.schema?.schema_name || '',
        indexNameSource: 'select', // Default to select, will switch to manual if needed
        index_name: vs.index?.name || '',
        sourceSchemaSource: sourceSchemaRef ? 'reference' : 'direct',
        sourceSchemaRefName: sourceSchemaRef ? sourceSchemaRef[0] : '',
        source_catalog: vs.source_table?.schema?.catalog_name || '',
        source_schema: vs.source_table?.schema?.schema_name || '',
        source_table: vs.source_table?.name || '',
        primary_key: vs.primary_key || '',
        embedding_source_column: vs.embedding_source_column || '',
        columns: vs.columns || [],
        doc_uri: vs.doc_uri || '',
        embedding_model: vs.embedding_model?.name || 'databricks-gte-large-en',
        sourcePathEnabled,
        sourcePathSchemaSource,
        sourcePathSchemaRef,
        sourcePathVolumeCatalog,
        sourcePathVolumeSchema,
        sourcePathVolumeName,
        sourcePathPath,
        checkpointPathEnabled,
        checkpointPathSchemaSource,
        checkpointPathSchemaRef,
        checkpointPathVolumeCatalog,
        checkpointPathVolumeSchema,
        checkpointPathVolumeName,
        checkpointPathPath,
        on_behalf_of_user: vs.on_behalf_of_user || false,
      });
      setColumnsInput((vs.columns || []).join(', '));
      setEditingKey(key);
      setShowForm(true);
    }
  };

  const handleDelete = (key: string) => {
    removeVectorStore(key);
  };

  const handleSave = () => {
    // Parse columns from input
    const columns = columnsInput.split(',').map(c => c.trim()).filter(c => c);
    
    const vs: VectorStoreModel = {
      // Source table is required
      source_table: {
        schema: {
          catalog_name: formData.source_catalog,
          schema_name: formData.source_schema,
        },
        name: formData.source_table,
      },
      // Embedding source column is required
      embedding_source_column: formData.embedding_source_column,
      // Optional fields
      primary_key: formData.primary_key || undefined,
      columns: columns.length > 0 ? columns : undefined,
      doc_uri: formData.doc_uri || undefined,
      on_behalf_of_user: formData.on_behalf_of_user || undefined,
    };
    
    // Add endpoint only if specified (optional - auto-detected if not provided)
    if (formData.endpoint_name) {
      vs.endpoint = {
        name: formData.endpoint_name,
        type: formData.endpoint_type,
      };
    }
    
    // Add index only if specified (optional - auto-generated from source_table if not provided)
    if (formData.index_name || formData.index_catalog || formData.index_schema) {
      vs.index = {
        schema: {
          catalog_name: formData.index_catalog || formData.source_catalog,
          schema_name: formData.index_schema || formData.source_schema,
        },
        name: formData.index_name || `${formData.source_table}_index`,
      };
    }
    
    // Add embedding model if specified
    if (formData.embedding_model) {
      vs.embedding_model = { name: formData.embedding_model };
    }
    
    // Add optional path fields as VolumePathModel
    if (formData.sourcePathEnabled && formData.sourcePathVolumeName) {
      const sourcePathModel: any = {
        volume: {
          // If using a configured schema reference, include it for YAML generation
          ...(formData.sourcePathSchemaSource === 'reference' && formData.sourcePathSchemaRef
            ? { _schemaRef: formData.sourcePathSchemaRef }
            : { schema: {
                catalog_name: formData.sourcePathVolumeCatalog,
                schema_name: formData.sourcePathVolumeSchema,
              }
            }
          ),
          name: formData.sourcePathVolumeName,
        },
      };
      if (formData.sourcePathPath) {
        sourcePathModel.path = formData.sourcePathPath;
      }
      vs.source_path = sourcePathModel;
    }
    
    if (formData.checkpointPathEnabled && formData.checkpointPathVolumeName) {
      const checkpointPathModel: any = {
        volume: {
          // If using a configured schema reference, include it for YAML generation
          ...(formData.checkpointPathSchemaSource === 'reference' && formData.checkpointPathSchemaRef
            ? { _schemaRef: formData.checkpointPathSchemaRef }
            : { schema: {
                catalog_name: formData.checkpointPathVolumeCatalog,
                schema_name: formData.checkpointPathVolumeSchema,
              }
            }
          ),
          name: formData.checkpointPathVolumeName,
        },
      };
      if (formData.checkpointPathPath) {
        checkpointPathModel.path = formData.checkpointPathPath;
      }
      vs.checkpoint_path = checkpointPathModel;
    }
    
    if (editingKey) {
      if (editingKey !== formData.refName) {
        removeVectorStore(editingKey);
        addVectorStore(formData.refName, vs);
      } else {
        updateVectorStore(editingKey, vs);
      }
    } else {
      addVectorStore(formData.refName, vs);
    }
    
    setShowForm(false);
    setEditingKey(null);
    setFormData(defaultVectorStoreForm);
    setColumnsInput('');
    onClose();
  };

  // Build endpoint options with status indicators
  const endpointOptions: StatusSelectOption[] = [
    { value: '', label: endpointsLoading ? 'Loading...' : 'Select an endpoint...' },
    ...(vsEndpoints || []).map((ep) => {
      const state = ep.endpoint_status?.state;
      let status: StatusType = 'unknown';
      if (state === 'ONLINE') status = 'ready';
      else if (state === 'PROVISIONING' || state === 'SCALING') status = 'transitioning';
      else if (state === 'OFFLINE' || state === 'FAILED') status = 'stopped';
      return {
        value: ep.name,
        label: ep.name,
        status,
      };
    }),
  ];

  // Build embedding model options (from configured LLMs or common embedding models)
  const embeddingModelOptions = [
    { value: '', label: 'Select embedding model...' },
    { value: 'databricks-gte-large-en', label: 'GTE Large (Embeddings)' },
    { value: 'databricks-bge-large-en', label: 'BGE Large (Embeddings)' },
    ...Object.entries(configuredLLMs).map(([key, llm]) => ({
      value: llm.name,
      label: `${key} (${llm.name})`,
    })),
  ];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Layers className="w-5 h-5 text-violet-400" />
          <h3 className="text-lg font-semibold text-slate-100">Vector Stores</h3>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { 
          // Default to 'reference' mode if there are configured schemas
          const hasConfiguredSchemas = Object.keys(configuredSchemas).length > 0;
          setFormData({
            ...defaultVectorStoreForm,
            indexSchemaSource: hasConfiguredSchemas ? 'reference' : 'direct',
            sourceSchemaSource: hasConfiguredSchemas ? 'reference' : 'direct',
            sourcePathSchemaSource: hasConfiguredSchemas ? 'reference' : 'direct',
            checkpointPathSchemaSource: hasConfiguredSchemas ? 'reference' : 'direct',
          }); 
          setColumnsInput(''); 
          setEditingKey(null); 
          setShowForm(true); 
        }}>
          <Plus className="w-4 h-4 mr-1" />
          Add Vector Store
        </Button>
      </div>

      {/* Existing Resources */}
      {Object.keys(vectorStores).length > 0 && (
        <div className="space-y-2 mb-4">
          {Object.entries(vectorStores).map(([key, vs]) => (
            <div key={key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center space-x-3">
                <Layers className="w-4 h-4 text-violet-400" />
                <div>
                  <p className="font-medium text-slate-200">{key}</p>
                  <p className="text-xs text-slate-500">
                    {vs.endpoint?.name || 'No endpoint'} • {vs.index?.name || 'No index'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {vs.on_behalf_of_user && (
                  <Badge variant="success" title="On Behalf of User">
                    <User className="w-3 h-3 mr-1" />
                    OBO
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleEdit(key)}>
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(key)}>
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(vectorStores).length === 0 && !showForm && (
        <p className="text-slate-500 text-sm">No vector stores configured. Add a vector store to enable semantic search.</p>
      )}

      {/* Form */}
      {showForm && (
        <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
          <h4 className="font-medium text-slate-200">{editingKey ? 'Edit' : 'New'} Vector Store</h4>
          
          <Input
            label="Reference Name"
            value={formData.refName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, refName: e.target.value })}
            placeholder="products_vector_store"
            hint={editingKey ? "Changing this will update all references in the YAML" : "Unique key to reference this resource"}
            required
          />
          
          {/* Vector Search Endpoint (Optional) */}
          <div className="space-y-3 p-3 bg-slate-900/50 rounded border border-slate-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300 font-medium">Vector Search Endpoint <span className="text-slate-500 font-normal">(Optional)</span></p>
                <p className="text-xs text-slate-500">Auto-detected if not specified</p>
              </div>
              <button
                type="button"
                onClick={() => refetchEndpoints()}
                className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                disabled={endpointsLoading}
              >
                <RefreshCw className={`w-3 h-3 ${endpointsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
            <StatusSelect
              options={endpointOptions}
              value={formData.endpoint_name}
              onChange={(value) => {
                // Find the selected endpoint to get its type
                const selectedEndpoint = vsEndpoints?.find(ep => ep.name === value);
                const detectedType = selectedEndpoint?.endpoint_type === 'OPTIMIZED_STORAGE' 
                  ? 'OPTIMIZED_STORAGE' 
                  : 'STANDARD';
                
                setFormData({ 
                  ...formData, 
                  endpoint_name: value,
                  // Auto-set endpoint type from selected endpoint
                  endpoint_type: value ? detectedType : formData.endpoint_type,
                });
              }}
              placeholder="Select an endpoint (or leave empty for auto-detection)..."
            />
            <Select
              label="Endpoint Type"
              value={formData.endpoint_type}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, endpoint_type: e.target.value as 'STANDARD' | 'OPTIMIZED_STORAGE' })}
              options={[
                { value: 'STANDARD', label: 'Standard' },
                { value: 'OPTIMIZED_STORAGE', label: 'Optimized Storage' },
              ]}
              hint={formData.endpoint_name ? 'Auto-detected from selected endpoint' : 'Only used if endpoint is specified'}
              disabled={!!formData.endpoint_name}
            />
          </div>
          
          {/* Index Configuration (Optional) */}
          <div className="space-y-3 p-3 bg-slate-900/50 rounded border border-slate-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300 font-medium">Vector Search Index <span className="text-slate-500 font-normal">(Optional)</span></p>
                <p className="text-xs text-slate-500">Auto-generated from source table name if not specified</p>
              </div>
              {formData.endpoint_name && (
                <button
                  type="button"
                  onClick={() => refetchIndexes()}
                  className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                  disabled={indexesLoading}
                >
                  <RefreshCw className={`w-3 h-3 ${indexesLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              )}
            </div>
            
            {/* Option to select existing index or configure new one */}
            {formData.endpoint_name && vsIndexes && vsIndexes.length > 0 && (
              <Select
                label="Select Existing Index (Optional)"
                value={vsIndexes.some(idx => idx.name === `${formData.index_catalog}.${formData.index_schema}.${formData.index_name}`) ? `${formData.index_catalog}.${formData.index_schema}.${formData.index_name}` : ''}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const idxName = e.target.value;
                  if (idxName) {
                    // Find the selected index to get its details
                    const selectedIndex = vsIndexes.find(idx => idx.name === idxName);
                    
                    // Parse index name (catalog.schema.index)
                    const parts = idxName.split('.');
                    if (parts.length >= 3) {
                      // Get the index name (last part after catalog.schema)
                      const indexNamePart = parts.slice(2).join('_');
                      
                      // Use functional update to ensure we get latest formData
                      setFormData(prev => {
                        const newFormData: VectorStoreFormData = {
                          ...prev,
                          indexSchemaSource: 'direct',
                          indexSchemaRefName: '',
                          index_catalog: parts[0],
                          index_schema: parts[1],
                          index_name: parts.slice(2).join('.'),
                          // Always generate refName from index name for new entries, preserve for editing
                          refName: editingKey ? prev.refName : generateRefName(indexNamePart),
                        };
                        
                        // Auto-populate from delta_sync_index_spec if available
                        if (selectedIndex?.delta_sync_index_spec) {
                          const spec = selectedIndex.delta_sync_index_spec;
                          
                          // Parse source table (format: catalog.schema.table)
                          if (spec.source_table) {
                            const tableParts = spec.source_table.split('.');
                            if (tableParts.length >= 3) {
                              newFormData.sourceSchemaSource = 'direct';
                              newFormData.sourceSchemaRefName = '';
                              newFormData.source_catalog = tableParts[0];
                              newFormData.source_schema = tableParts[1];
                              newFormData.source_table = tableParts.slice(2).join('.');
                            }
                          }
                          
                          // Auto-populate embedding source column
                          if (spec.embedding_source_columns && spec.embedding_source_columns.length > 0) {
                            const embeddingCol = spec.embedding_source_columns[0];
                            newFormData.embedding_source_column = embeddingCol.name || '';
                            // Also set the embedding model if available
                            if (embeddingCol.embedding_model_endpoint_name) {
                              newFormData.embedding_model = embeddingCol.embedding_model_endpoint_name;
                            }
                          }
                          
                          // Auto-populate columns to sync
                          if (spec.columns_to_sync && spec.columns_to_sync.length > 0) {
                            newFormData.columns = spec.columns_to_sync;
                            setColumnsInput(spec.columns_to_sync.join(', '));
                          }
                        }
                        
                        // Auto-populate primary key if available
                        if (selectedIndex?.primary_key) {
                          newFormData.primary_key = selectedIndex.primary_key;
                        }
                        
                        return newFormData;
                      });
                    }
                  }
                }}
                options={[
                  { value: '', label: indexesLoading ? 'Loading...' : 'Or configure manually below...' },
                  ...(vsIndexes || []).map((idx) => ({
                    value: idx.name,
                    label: `${idx.name}${idx.delta_sync_index_spec?.source_table ? ` (→ ${idx.delta_sync_index_spec.source_table})` : ''}`,
                  })),
                ]}
              />
            )}
            
            {/* Schema Source Toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Index Schema</label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, indexSchemaSource: 'reference' })}
                    className={`px-2 py-1 text-xs rounded flex items-center space-x-1 ${
                      formData.indexSchemaSource === 'reference' ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    <Layers className="w-3 h-3" />
                    <span>Configured</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, indexSchemaSource: 'direct' })}
                    className={`px-2 py-1 text-xs rounded ${
                      formData.indexSchemaSource === 'direct' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    Select
                  </button>
                </div>
              </div>
              
              {formData.indexSchemaSource === 'reference' ? (
                <div className="space-y-2">
                  <Select
                    value={formData.indexSchemaRefName}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      const schemaKey = e.target.value;
                      const schema = configuredSchemas[schemaKey];
                      setFormData({
                        ...formData,
                        indexSchemaRefName: schemaKey,
                        index_catalog: schema?.catalog_name || '',
                        index_schema: schema?.schema_name || '',
                      });
                    }}
                    options={[
                      { value: '', label: 'Select configured schema...' },
                      ...configuredSchemaOptions,
                    ]}
                  />
                  {configuredSchemaOptions.length === 0 && (
                    <p className="text-xs text-amber-400">
                      No schemas configured. Add one in Schemas section or switch to "Select".
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Catalog"
                    value={formData.index_catalog}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, index_catalog: e.target.value, index_schema: '', indexSchemaRefName: '' })}
                    options={[
                      { value: '', label: 'Select catalog...' },
                      ...(catalogs || []).map((c) => ({ value: c.name, label: c.name })),
                    ]}
                  />
                  <Select
                    label="Schema"
                    value={formData.index_schema}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, index_schema: e.target.value, indexSchemaRefName: '' })}
                    options={[
                      { value: '', label: 'Select schema...' },
                      ...(indexSchemas || []).map((s) => ({ value: s.name, label: s.name })),
                    ]}
                    disabled={!formData.index_catalog}
                  />
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Index Name</label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, indexNameSource: 'select', index_name: '' })}
                    className={`px-2 py-1 text-xs rounded ${
                      formData.indexNameSource === 'select' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    Select
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, indexNameSource: 'manual' })}
                    className={`px-2 py-1 text-xs rounded ${
                      formData.indexNameSource === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    Manual
                  </button>
                </div>
              </div>
              
              {formData.indexNameSource === 'select' ? (
                <Select
                  value={formData.index_name}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    const indexName = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      index_name: indexName,
                      refName: editingKey ? prev.refName : (indexName ? generateRefName(indexName) : prev.refName),
                    }));
                  }}
                  options={[
                    { value: '', label: indexTablesLoading ? 'Loading tables...' : 'Select a table...' },
                    ...(indexTables || []).map((t) => ({ value: t.name, label: t.name })),
                  ]}
                  disabled={(!formData.index_catalog || !formData.index_schema) || indexTablesLoading}
                  hint="Select a table from the index schema"
                />
              ) : (
                <Input
                  value={formData.index_name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, index_name: e.target.value })}
                  placeholder="products_index"
                  hint="Enter a custom index name"
                />
              )}
            </div>
          </div>
          
          {/* Source Table */}
          <div className="space-y-3 p-3 bg-slate-900/50 rounded border border-slate-600">
            <p className="text-sm text-slate-300 font-medium">Source Table</p>
            
            {/* Schema Source Toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Source Schema</label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, sourceSchemaSource: 'reference' })}
                    className={`px-2 py-1 text-xs rounded flex items-center space-x-1 ${
                      formData.sourceSchemaSource === 'reference' ? 'bg-purple-500/30 text-purple-300' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    <Layers className="w-3 h-3" />
                    <span>Configured</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, sourceSchemaSource: 'direct' })}
                    className={`px-2 py-1 text-xs rounded ${
                      formData.sourceSchemaSource === 'direct' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    Select
                  </button>
                </div>
              </div>
              
              {formData.sourceSchemaSource === 'reference' ? (
                <div className="space-y-2">
                  <Select
                    value={formData.sourceSchemaRefName}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      const schemaKey = e.target.value;
                      const schema = configuredSchemas[schemaKey];
                      // Clear table and column selections when schema changes
                      setFormData({
                        ...formData,
                        sourceSchemaRefName: schemaKey,
                        source_catalog: schema?.catalog_name || '',
                        source_schema: schema?.schema_name || '',
                        source_table: '',
                        embedding_source_column: '',
                        primary_key: '',
                        doc_uri: '',
                        columns: [],
                      });
                      setColumnsInput('');
                    }}
                    options={[
                      { value: '', label: 'Select configured schema...' },
                      ...configuredSchemaOptions,
                    ]}
                  />
                  {configuredSchemaOptions.length === 0 && (
                    <p className="text-xs text-amber-400">
                      No schemas configured. Add one in Schemas section or switch to "Select".
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Catalog"
                    value={formData.source_catalog}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      // Clear schema, table, and column selections when catalog changes
                      setFormData({ 
                        ...formData, 
                        source_catalog: e.target.value, 
                        source_schema: '', 
                        source_table: '', 
                        sourceSchemaRefName: '',
                        embedding_source_column: '',
                        primary_key: '',
                        doc_uri: '',
                        columns: [],
                      });
                      setColumnsInput('');
                    }}
                    options={[
                      { value: '', label: 'Select catalog...' },
                      ...(catalogs || []).map((c) => ({ value: c.name, label: c.name })),
                    ]}
                  />
                  <Select
                    label="Schema"
                    value={formData.source_schema}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      // Clear table and column selections when schema changes
                      setFormData({ 
                        ...formData, 
                        source_schema: e.target.value, 
                        source_table: '', 
                        sourceSchemaRefName: '',
                        embedding_source_column: '',
                        primary_key: '',
                        doc_uri: '',
                        columns: [],
                      });
                      setColumnsInput('');
                    }}
                    options={[
                      { value: '', label: 'Select schema...' },
                      ...(sourceSchemas || []).map((s) => ({ value: s.name, label: s.name })),
                    ]}
                    disabled={!formData.source_catalog}
                  />
                </div>
              )}
            </div>
            
            {/* Table Selection */}
            <div className="flex items-center space-x-2">
              <div className="flex-1">
                <Select
                  label="Table"
                  value={formData.source_table}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    // Clear column selections when table changes
                    setFormData({ 
                      ...formData, 
                      source_table: e.target.value,
                      embedding_source_column: '',
                      primary_key: '',
                      doc_uri: '',
                      columns: [],
                    });
                    setColumnsInput('');
                  }}
                  options={[
                    { value: '', label: tablesLoading ? 'Loading...' : 'Select table...' },
                    ...(sourceTables || []).map((t) => ({ value: t.name, label: t.name })),
                  ]}
                  disabled={(!formData.source_schema && !formData.sourceSchemaRefName) || tablesLoading}
                />
              </div>
              {formData.source_table && (
                <button
                  type="button"
                  onClick={() => refetchColumns()}
                  className="mt-6 text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                  disabled={columnsLoading}
                >
                  <RefreshCw className={`w-3 h-3 ${columnsLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              )}
            </div>
          </div>
          
          {/* Embedding and Column Configuration */}
          <div className="space-y-3 p-3 bg-slate-900/50 rounded border border-slate-600">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-300 font-medium">Embedding Configuration</p>
              {columnsLoading && (
                <span className="text-xs text-slate-400 flex items-center space-x-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading columns...</span>
                </span>
              )}
            </div>
            <Select
              label="Embedding Model"
              value={formData.embedding_model}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, embedding_model: e.target.value })}
              options={embeddingModelOptions}
              hint="Model used to create embeddings"
            />
            <Select
              label="Embedding Source Column"
              value={formData.embedding_source_column}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, embedding_source_column: e.target.value })}
              options={[
                { value: '', label: columnsLoading ? 'Loading columns...' : (columnOptions.length > 0 ? 'Select column...' : 'Select a table first...') },
                ...columnOptions,
              ]}
              hint="Column containing text to embed (typically text/string columns)"
              disabled={!formData.source_table || columnsLoading}
            />
            <Select
              label="Primary Key"
              value={formData.primary_key}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, primary_key: e.target.value })}
              options={[
                { value: '', label: columnsLoading ? 'Loading columns...' : (columnOptions.length > 0 ? 'Select primary key column...' : 'Select a table first...') },
                ...columnOptions,
              ]}
              hint="Primary key column for the source table"
              disabled={!formData.source_table || columnsLoading}
            />
          </div>
          
          {/* Columns to Include */}
          <div className="space-y-3 p-3 bg-slate-900/50 rounded border border-slate-600">
            <p className="text-sm text-slate-300 font-medium">Columns to Include</p>
            {formData.source_table && columnOptions.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-slate-800/50 rounded border border-slate-700">
                  {columnOptions.map((col) => {
                    const isSelected = columnsInput.split(',').map(c => c.trim()).includes(col.value);
                    return (
                      <button
                        key={col.value}
                        type="button"
                        onClick={() => {
                          const currentCols = columnsInput.split(',').map(c => c.trim()).filter(c => c);
                          if (isSelected) {
                            setColumnsInput(currentCols.filter(c => c !== col.value).join(', '));
                          } else {
                            setColumnsInput([...currentCols, col.value].join(', '));
                          }
                        }}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          isSelected 
                            ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50' 
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        }`}
                      >
                        {col.value}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">
                  Click columns to select/deselect. Selected: {columnsInput.split(',').filter(c => c.trim()).length || 0}
                </p>
              </div>
            ) : (
              <Input
                label=""
                value={columnsInput}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setColumnsInput(e.target.value)}
                placeholder="id, name, description, category"
                hint="Select a table to see available columns, or enter comma-separated column names"
              />
            )}
          </div>
          
          <Select
            label="Document URI Column (Optional)"
            value={formData.doc_uri}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, doc_uri: e.target.value })}
            options={[
              { value: '', label: columnOptions.length > 0 ? 'None (no document URIs)' : 'Select a table first...' },
              ...columnOptions,
            ]}
            hint="Column containing document URIs for linking"
            disabled={!formData.source_table || columnsLoading}
          />
          
          {/* Optional Volume Paths */}
          <VolumePathsSection
            formData={formData}
            setFormData={setFormData}
            configuredSchemas={configuredSchemas}
            configuredSchemaOptions={configuredSchemaOptions}
            catalogs={catalogs}
            sourcePathSchemas={sourcePathSchemas}
            sourcePathVolumes={sourcePathVolumes}
            sourcePathVolumesLoading={sourcePathVolumesLoading}
            checkpointPathSchemas={checkpointPathSchemas}
            checkpointPathVolumes={checkpointPathVolumes}
            checkpointPathVolumesLoading={checkpointPathVolumesLoading}
          />
          
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.on_behalf_of_user}
              onChange={(e) => setFormData({ ...formData, on_behalf_of_user: e.target.checked })}
              className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <UserCheck className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-slate-300">On Behalf of User</span>
          </label>
          
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.refName || !formData.source_table || !formData.embedding_source_column}>
              {editingKey ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default ResourcesSection;

