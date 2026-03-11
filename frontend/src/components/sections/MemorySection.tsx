import { useState, useEffect } from 'react';
import { Database, HardDrive, Info, Plus, Edit2, Trash2, Sparkles } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { useConfigStore } from '@/stores/configStore';
import {
  MemoryModel,
  CheckpointerModel,
  StoreModel,
  MemoryExtractionModel,
  MemorySchemaName,
  LLMModel,
} from '@/types/dao-ai-types';
import { normalizeRefNameWhileTyping, normalizeRefName } from '@/utils/name-utils';
import { safeDelete } from '@/utils/safe-delete';
import { useYamlScrollStore } from '@/stores/yamlScrollStore';

type StorageType = 'postgres' | 'memory';

const storageTypeOptions = [
  { value: 'memory', label: 'In-Memory' },
  { value: 'postgres', label: 'Lakebase/PostgreSQL' },
];

const MEMORY_SCHEMA_OPTIONS: { value: MemorySchemaName; label: string; description: string }[] = [
  { value: 'user_profile', label: 'User Profile', description: 'Consolidated profile per user (name, preferences, goals)' },
  { value: 'preference', label: 'Preference', description: 'Individual preference records searchable by category' },
  { value: 'episode', label: 'Episode', description: 'Notable interaction records (situation, approach, outcome)' },
];

export function MemorySection() {
  const { config, updateMemory } = useConfigStore();
  const memory = config.memory;
  const databases = config.resources?.databases || {};
  const llms = config.resources?.llms || {};
  const { scrollToAsset } = useYamlScrollStore();
  
  const llmOptions = Object.entries(llms).map(([key, llm]) => ({
    value: key,
    label: `${key} (${llm.name})`,
  }));
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Helper function to find database key by matching properties
  const findDatabaseKey = (db: { name?: string; instance_name?: string } | undefined): string => {
    if (!db) return '';
    
    for (const [key, configuredDb] of Object.entries(databases)) {
      if (db.instance_name && configuredDb.instance_name === db.instance_name) {
        return key;
      }
      if (db.name && configuredDb.name === db.name) {
        return key;
      }
    }
    
    return '';
  };
  
  // Form state
  const [refName, setRefName] = useState('memory');
  const [checkpointerEnabled, setCheckpointerEnabled] = useState(false);
  const [storeEnabled, setStoreEnabled] = useState(false);
  const [checkpointerType, setCheckpointerType] = useState<StorageType>('memory');
  const [checkpointerName, setCheckpointerName] = useState('default_checkpointer');
  const [checkpointerDatabase, setCheckpointerDatabase] = useState('');
  const [storeType, setStoreType] = useState<StorageType>('memory');
  const [storeName, setStoreName] = useState('default_store');
  const [storeDatabase, setStoreDatabase] = useState('');
  const [storeDims, setStoreDims] = useState(1536);
  const [storeNamespace, setStoreNamespace] = useState('{user_id}');
  const [storeEmbeddingModel, setStoreEmbeddingModel] = useState('databricks-gte-large-en');
  // Extraction state
  const [extractionEnabled, setExtractionEnabled] = useState(false);
  const [extractionSchemas, setExtractionSchemas] = useState<MemorySchemaName[]>([]);
  const [extractionInstructions, setExtractionInstructions] = useState('');
  const [extractionAutoInject, setExtractionAutoInject] = useState(true);
  const [extractionAutoInjectLimit, setExtractionAutoInjectLimit] = useState(5);
  const [extractionBackgroundExtraction, setExtractionBackgroundExtraction] = useState(true);
  const [extractionModelKey, setExtractionModelKey] = useState('');
  const [extractionQueryModelKey, setExtractionQueryModelKey] = useState('');
  
  // Helper to find LLM key by matching model name
  const findLlmKey = (model: LLMModel | string | undefined): string => {
    if (!model) return '';
    const modelName = typeof model === 'string' ? model : model.name;
    for (const [key, llm] of Object.entries(llms)) {
      if (llm.name === modelName) return key;
    }
    return '';
  };

  // Reset form to defaults
  const resetForm = () => {
    setRefName('memory');
    setCheckpointerEnabled(false);
    setStoreEnabled(false);
    setCheckpointerType('memory');
    setCheckpointerName('default_checkpointer');
    setCheckpointerDatabase('');
    setStoreType('memory');
    setStoreName('default_store');
    setStoreDatabase('');
    setStoreDims(1536);
    setStoreNamespace('{user_id}');
    setStoreEmbeddingModel('databricks-gte-large-en');
    setExtractionEnabled(false);
    setExtractionSchemas([]);
    setExtractionInstructions('');
    setExtractionAutoInject(true);
    setExtractionAutoInjectLimit(5);
    setExtractionBackgroundExtraction(true);
    setExtractionModelKey('');
    setExtractionQueryModelKey('');
  };
  
  // Load form from existing memory config
  const loadFormFromMemory = (mem: MemoryModel) => {
    setRefName(mem.refName || 'memory');
    
    if (mem.checkpointer) {
      setCheckpointerEnabled(true);
      // Infer type from database presence (dao-ai 0.1.2 pattern)
      const inferredCheckpointerType = mem.checkpointer.database ? 'postgres' : 'memory';
      setCheckpointerType(inferredCheckpointerType);
      setCheckpointerName(mem.checkpointer.name || 'default_checkpointer');
      setCheckpointerDatabase(findDatabaseKey(mem.checkpointer.database));
    } else {
      setCheckpointerEnabled(false);
      setCheckpointerType('memory');
      setCheckpointerName('default_checkpointer');
      setCheckpointerDatabase('');
    }
    
    if (mem.store) {
      setStoreEnabled(true);
      // Infer type from database presence (dao-ai 0.1.2 pattern)
      const inferredStoreType = mem.store.database ? 'postgres' : 'memory';
      setStoreType(inferredStoreType);
      setStoreName(mem.store.name || 'default_store');
      setStoreDatabase(findDatabaseKey(mem.store.database));
      setStoreDims(mem.store.dims || 1536);
      setStoreNamespace(mem.store.namespace || '{user_id}');
      setStoreEmbeddingModel(mem.store.embedding_model?.name || 'databricks-gte-large-en');
    } else {
      setStoreEnabled(false);
      setStoreType('memory');
      setStoreName('default_store');
      setStoreDatabase('');
      setStoreDims(1536);
      setStoreNamespace('{user_id}');
      setStoreEmbeddingModel('databricks-gte-large-en');
    }
    
    if (mem.extraction) {
      setExtractionEnabled(true);
      setExtractionSchemas(mem.extraction.schemas ?? []);
      setExtractionInstructions(mem.extraction.instructions || '');
      setExtractionAutoInject(mem.extraction.auto_inject ?? true);
      setExtractionAutoInjectLimit(mem.extraction.auto_inject_limit ?? 5);
      setExtractionBackgroundExtraction(mem.extraction.background_extraction ?? true);
      setExtractionModelKey(findLlmKey(mem.extraction.extraction_model));
      setExtractionQueryModelKey(findLlmKey(mem.extraction.query_model));
    } else {
      setExtractionEnabled(false);
      setExtractionSchemas([]);
      setExtractionInstructions('');
      setExtractionAutoInject(true);
      setExtractionAutoInjectLimit(5);
      setExtractionBackgroundExtraction(true);
      setExtractionModelKey('');
      setExtractionQueryModelKey('');
    }
  };
  
  // Sync form when memory changes externally (e.g., YAML import)
  const [lastMemoryJson, setLastMemoryJson] = useState<string | null>(null);
  
  useEffect(() => {
    const currentMemoryJson = JSON.stringify(memory);
    if (currentMemoryJson !== lastMemoryJson) {
      setLastMemoryJson(currentMemoryJson);
    }
  }, [memory, lastMemoryJson]);
  
  const buildMemoryModel = (): MemoryModel | undefined => {
    const normalizedRefName = normalizeRefName(refName);
    const newMemory: MemoryModel = {
      refName: normalizedRefName || 'memory',
    };
    
    if (checkpointerEnabled) {
      // NOTE: type field removed in dao-ai 0.1.2
      // Storage type is inferred from database presence
      const checkpointer: CheckpointerModel = {
        name: checkpointerName,
      };
      
      if (checkpointerType === 'postgres' && checkpointerDatabase) {
        const db = databases[checkpointerDatabase];
        if (db) {
          checkpointer.database = db;
        }
      }
      
      newMemory.checkpointer = checkpointer;
    }
    
    if (storeEnabled) {
      // NOTE: type field removed in dao-ai 0.1.2
      // Storage type is inferred from database presence
      const store: StoreModel = {
        name: storeName,
      };
      
      if (storeEmbeddingModel) {
        store.embedding_model = {
          name: storeEmbeddingModel,
          on_behalf_of_user: false,
        };
      }
      store.dims = storeDims;
      if (storeNamespace) {
        store.namespace = storeNamespace;
      }
      
      if (storeType === 'postgres' && storeDatabase) {
        const db = databases[storeDatabase];
        if (db) {
          store.database = db;
        }
      }
      
      newMemory.store = store;
    }
    
    if (extractionEnabled) {
      const extraction: MemoryExtractionModel = {};
      
      if (extractionSchemas.length > 0) {
        extraction.schemas = [...extractionSchemas];
      }
      if (extractionInstructions.trim()) {
        extraction.instructions = extractionInstructions.trim();
      }
      extraction.auto_inject = extractionAutoInject;
      extraction.auto_inject_limit = extractionAutoInjectLimit;
      extraction.background_extraction = extractionBackgroundExtraction;
      if (extractionModelKey && llms[extractionModelKey]) {
        extraction.extraction_model = llms[extractionModelKey];
      }
      if (extractionQueryModelKey && llms[extractionQueryModelKey]) {
        extraction.query_model = llms[extractionQueryModelKey];
      }
      
      newMemory.extraction = extraction;
    }
    
    return (checkpointerEnabled || storeEnabled) ? newMemory : undefined;
  };
  
  const handleAddClick = () => {
    resetForm();
    setIsEditing(false);
    setIsModalOpen(true);
  };
  
  const handleEditClick = () => {
    if (memory) {
      scrollToAsset(memory.refName || 'memory');
      loadFormFromMemory(memory);
      setIsEditing(true);
      setIsModalOpen(true);
    }
  };
  
  const handleDeleteClick = () => {
    if (memory) {
      safeDelete('Memory', memory.refName || 'memory', () => {
        updateMemory(undefined);
      });
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!checkpointerEnabled && !storeEnabled) {
      // Show validation message - at least one must be enabled
      return;
    }
    
    const newMemory = buildMemoryModel();
    updateMemory(newMemory);
    setIsModalOpen(false);
  };
  
  const databaseNames = Object.keys(databases);
  
  // Get summary info for display
  const getMemorySummary = (mem: MemoryModel): string => {
    const parts: string[] = [];
    if (mem.checkpointer) {
      // Infer type from database presence (dao-ai 0.1.2 pattern)
      const checkpointerType = mem.checkpointer.database ? 'postgres' : 'memory';
      parts.push(`Checkpointer: ${checkpointerType}`);
    }
    if (mem.store) {
      // Infer type from database presence (dao-ai 0.1.2 pattern)
      const storeType = mem.store.database ? 'postgres' : 'memory';
      parts.push(`Store: ${storeType}`);
    }
    if (mem.extraction) {
      parts.push('Extraction: enabled');
    }
    return parts.join(' • ') || 'No components configured';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Memory Configuration</h2>
          <p className="text-slate-400 mt-1">
            Configure conversation persistence and long-term memory storage
          </p>
        </div>
        {!memory && (
          <Button onClick={handleAddClick}>
            <Plus className="w-4 h-4" />
            Add Memory
          </Button>
        )}
      </div>

      {/* Empty State */}
      {!memory ? (
        <Card className="text-center py-12">
          <Database className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">No memory configured</h3>
          <p className="text-slate-500 mb-4 max-w-md mx-auto">
            Memory enables conversation persistence and long-term context storage for your agents.
          </p>
          <Button onClick={handleAddClick}>
            <Plus className="w-4 h-4" />
            Add Memory Configuration
          </Button>
        </Card>
      ) : (
        /* Memory Card */
        <Card 
          variant="interactive" 
          className="group cursor-pointer"
          onClick={handleEditClick}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Database className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="font-medium text-white">{memory.refName || 'memory'}</h3>
                <p className="text-sm text-slate-400">
                  {getMemorySummary(memory)}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {memory.checkpointer && (
                <Badge variant={memory.checkpointer.database ? 'success' : 'warning'}>
                  <HardDrive className="w-3 h-3 mr-1" />
                  Checkpointer
                </Badge>
              )}
              {memory.store && (
                <Badge variant={memory.store.database ? 'success' : 'warning'}>
                  <Database className="w-3 h-3 mr-1" />
                  Store
                </Badge>
              )}
              {memory.extraction && (
                <Badge variant="info">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Extraction
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditClick();
                }}
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick();
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? 'Edit Memory Configuration' : 'Add Memory Configuration'}
        description="Configure conversation persistence and long-term memory storage"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Reference Name */}
          <Input
            label="Reference Name"
            value={refName}
            onChange={(e) => setRefName(normalizeRefNameWhileTyping(e.target.value))}
            placeholder="memory"
            hint={`Used as the YAML anchor (e.g., &${refName || 'memory'}) for referencing this memory configuration`}
            disabled={isEditing}
          />

          {/* Info Card */}
          <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-300">
                <p className="font-medium">Memory Components</p>
                <ul className="mt-2 space-y-1 text-blue-400/80">
                  <li>• <strong>Checkpointer</strong>: Saves conversation state for resumable sessions</li>
                  <li>• <strong>Store</strong>: Long-term semantic memory with embeddings for context</li>
                  <li>• <strong>Extraction</strong>: Automatically extract and inject memories from conversations</li>
                </ul>
                {databaseNames.length === 0 && (
                  <p className="mt-3 text-amber-400">
                    ⚠️ No databases configured. Add a database in <strong>Resources → Databases</strong> for persistent storage.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Checkpointer Section */}
          <div className="p-5 bg-slate-800/50 border border-slate-700 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <HardDrive className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-slate-100">Checkpointer</h3>
              </div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkpointerEnabled}
                  onChange={(e) => setCheckpointerEnabled(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                />
                <span className="text-sm text-slate-300">Enable</span>
              </label>
            </div>
            
            {checkpointerEnabled && (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">
                  Saves conversation state between messages for resumable sessions.
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Name"
                    value={checkpointerName}
                    onChange={(e) => setCheckpointerName(e.target.value)}
                    placeholder="default_checkpointer"
                  />
                  <Select
                    label="Storage Type"
                    value={checkpointerType}
                    onChange={(e) => setCheckpointerType(e.target.value as StorageType)}
                    options={storageTypeOptions}
                  />
                </div>
                
                {checkpointerType === 'memory' && (
                  <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                    <p className="text-sm text-amber-300">
                      <strong>In-Memory Storage:</strong> Data lost on restart. Best for development.
                    </p>
                  </div>
                )}
                
                {checkpointerType === 'postgres' && (
                  <>
                    <Select
                      label="Database"
                      value={checkpointerDatabase}
                      onChange={(e) => setCheckpointerDatabase(e.target.value)}
                      options={[
                        { value: '', label: 'Select a database...' },
                        ...databaseNames.map((name) => ({ value: name, label: name })),
                      ]}
                      hint={databaseNames.length === 0 ? 'Add a database in Resources → Databases' : undefined}
                    />
                    <div className="p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
                      <p className="text-sm text-emerald-300">
                        <strong>Persistent Storage:</strong> Data persists across restarts. Recommended for production.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Store Section */}
          <div className="p-5 bg-slate-800/50 border border-slate-700 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Database className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-semibold text-slate-100">Long-Term Memory Store</h3>
              </div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={storeEnabled}
                  onChange={(e) => setStoreEnabled(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-sm text-slate-300">Enable</span>
              </label>
            </div>
            
            {storeEnabled && (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">
                  Semantic memory storage with embeddings for persistent context.
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Name"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="default_store"
                  />
                  <Select
                    label="Storage Type"
                    value={storeType}
                    onChange={(e) => setStoreType(e.target.value as StorageType)}
                    options={storageTypeOptions}
                  />
                </div>
                
                {storeType === 'memory' && (
                  <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                    <p className="text-sm text-amber-300">
                      <strong>In-Memory Storage:</strong> Data lost on restart. Best for development.
                    </p>
                  </div>
                )}
                
                {storeType === 'postgres' && (
                  <>
                    <Select
                      label="Database"
                      value={storeDatabase}
                      onChange={(e) => setStoreDatabase(e.target.value)}
                      options={[
                        { value: '', label: 'Select a database...' },
                        ...databaseNames.map((name) => ({ value: name, label: name })),
                      ]}
                      hint={databaseNames.length === 0 ? 'Add a database in Resources → Databases' : undefined}
                    />
                    <div className="p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
                      <p className="text-sm text-emerald-300">
                        <strong>Persistent Storage:</strong> Data persists across restarts. Recommended for production.
                      </p>
                    </div>
                  </>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Embedding Model"
                    value={storeEmbeddingModel}
                    onChange={(e) => setStoreEmbeddingModel(e.target.value)}
                    placeholder="databricks-gte-large-en"
                    hint="Databricks serving endpoint for embeddings"
                  />
                  <Input
                    label="Embedding Dimensions"
                    type="number"
                    value={storeDims}
                    onChange={(e) => setStoreDims(parseInt(e.target.value) || 1536)}
                    hint="Usually 1536 for GTE-Large"
                  />
                </div>
                
                <Input
                  label="Namespace Template"
                  value={storeNamespace}
                  onChange={(e) => setStoreNamespace(e.target.value)}
                  placeholder="{user_id}"
                  hint="Template for partitioning memories. Use {user_id}, {thread_id}, etc."
                />
              </div>
            )}
          </div>

          {/* Extraction Section */}
          <div className="p-5 bg-slate-800/50 border border-slate-700 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <Sparkles className="w-5 h-5 text-teal-400" />
                <h3 className="text-lg font-semibold text-slate-100">Memory Extraction</h3>
              </div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={extractionEnabled}
                  onChange={(e) => setExtractionEnabled(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500"
                />
                <span className="text-sm text-slate-300">Enable</span>
              </label>
            </div>
            
            {extractionEnabled && (
              <div className="space-y-4">
                <p className="text-sm text-slate-400">
                  Automatically extract memories from conversations and inject relevant context into prompts.
                </p>
                
                {!storeEnabled && (
                  <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                    <p className="text-sm text-amber-300">
                      <strong>Requires Store:</strong> Memory extraction needs a Store enabled to persist and retrieve memories.
                    </p>
                  </div>
                )}
                
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Schemas</label>
                  <div className="space-y-2">
                    {MEMORY_SCHEMA_OPTIONS.map((option) => (
                      <label key={option.value} className="flex items-start space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={extractionSchemas.includes(option.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExtractionSchemas([...extractionSchemas, option.value]);
                            } else {
                              setExtractionSchemas(extractionSchemas.filter((s) => s !== option.value));
                            }
                          }}
                          className="mt-0.5 rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500"
                        />
                        <div>
                          <span className="text-sm text-slate-200">{option.label}</span>
                          <p className="text-xs text-slate-500">{option.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Select schema types for structured extraction. Leave all unchecked for unstructured string memories.</p>
                </div>
                
                <Textarea
                  label="Extraction Instructions"
                  value={extractionInstructions}
                  onChange={(e) => setExtractionInstructions(e.target.value)}
                  placeholder="Extract the user's name, role, preferences, and any notable interaction patterns..."
                  hint="Custom instructions guiding what the system should remember. Leave empty for default behavior."
                  rows={4}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={extractionAutoInject}
                        onChange={(e) => setExtractionAutoInject(e.target.checked)}
                        className="rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500"
                      />
                      <span className="text-sm font-medium text-slate-300">Auto Inject</span>
                    </label>
                    <p className="text-xs text-slate-500">Inject relevant memories into prompts before each model call</p>
                  </div>
                  <Input
                    label="Auto Inject Limit"
                    type="number"
                    value={extractionAutoInjectLimit}
                    onChange={(e) => setExtractionAutoInjectLimit(parseInt(e.target.value) || 5)}
                    hint="Maximum memories to inject per turn"
                    disabled={!extractionAutoInject}
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={extractionBackgroundExtraction}
                      onChange={(e) => setExtractionBackgroundExtraction(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500"
                    />
                    <span className="text-sm font-medium text-slate-300">Background Extraction</span>
                  </label>
                  <p className="text-xs text-slate-500">Extract memories in a background thread after each turn (no latency impact)</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Extraction Model"
                    options={[
                      { value: '', label: 'Use agent primary model' },
                      ...llmOptions,
                    ]}
                    value={extractionModelKey}
                    onChange={(e) => setExtractionModelKey(e.target.value)}
                    hint="Separate LLM for memory extraction (can be smaller/cheaper)"
                  />
                  <Select
                    label="Query Model"
                    options={[
                      { value: '', label: 'Use raw message embedding' },
                      ...llmOptions,
                    ]}
                    value={extractionQueryModelKey}
                    onChange={(e) => setExtractionQueryModelKey(e.target.value)}
                    hint="LLM for optimizing memory search queries"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Validation message */}
          {!checkpointerEnabled && !storeEnabled && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">
                Please enable at least one memory component (Checkpointer or Store).
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-700">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!checkpointerEnabled && !storeEnabled}>
              {isEditing ? 'Save Changes' : 'Add Memory'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default MemorySection;
