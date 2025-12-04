import { useState, useEffect } from 'react';
import { Database, HardDrive, Info } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useConfigStore } from '@/stores/configStore';
import {
  MemoryModel,
  CheckpointerModel,
  StoreModel,
} from '@/types/dao-ai-types';

type StorageType = 'postgres' | 'memory';

const storageTypeOptions = [
  { value: 'memory', label: 'In-Memory' },
  { value: 'postgres', label: 'Lakebase/PostgreSQL' },
];

export function MemorySection() {
  const { config, updateMemory } = useConfigStore();
  const memory = config.memory;
  const databases = config.resources?.databases || {};
  
  const [checkpointerEnabled, setCheckpointerEnabled] = useState(!!memory?.checkpointer);
  const [storeEnabled, setStoreEnabled] = useState(!!memory?.store);
  
  const [checkpointerType, setCheckpointerType] = useState<StorageType>(
    memory?.checkpointer?.type || 'memory'
  );
  const [checkpointerName, setCheckpointerName] = useState(
    memory?.checkpointer?.name || 'default_checkpointer'
  );
  const [checkpointerDatabase, setCheckpointerDatabase] = useState(
    memory?.checkpointer?.database?.name || ''
  );
  
  const [storeType, setStoreType] = useState<StorageType>(
    memory?.store?.type || 'memory'
  );
  const [storeName, setStoreName] = useState(
    memory?.store?.name || 'default_store'
  );
  const [storeDatabase, setStoreDatabase] = useState(
    memory?.store?.database?.name || ''
  );
  const [storeDims, setStoreDims] = useState(memory?.store?.dims || 1536);
  const [storeNamespace, setStoreNamespace] = useState(
    memory?.store?.namespace || '{user_id}'
  );
  const [storeEmbeddingModel, setStoreEmbeddingModel] = useState(
    memory?.store?.embedding_model?.name || 'databricks-gte-large-en'
  );
  
  // Update state when config changes
  useEffect(() => {
    if (memory?.checkpointer) {
      setCheckpointerEnabled(true);
      setCheckpointerType(memory.checkpointer.type || 'memory');
      setCheckpointerName(memory.checkpointer.name || 'default_checkpointer');
      setCheckpointerDatabase(memory.checkpointer.database?.name || '');
    }
    if (memory?.store) {
      setStoreEnabled(true);
      setStoreType(memory.store.type || 'memory');
      setStoreName(memory.store.name || 'default_store');
      setStoreDatabase(memory.store.database?.name || '');
      setStoreDims(memory.store.dims || 1536);
      setStoreNamespace(memory.store.namespace || '{user_id}');
      setStoreEmbeddingModel(memory.store.embedding_model?.name || 'databricks-gte-large-en');
    }
  }, [memory]);
  
  const buildMemoryModel = (): MemoryModel | undefined => {
    const newMemory: MemoryModel = {};
    
    if (checkpointerEnabled) {
      const checkpointer: CheckpointerModel = {
        name: checkpointerName,
        type: checkpointerType,
      };
      
      // Only include database reference for postgres type
      if (checkpointerType === 'postgres' && checkpointerDatabase) {
        const db = databases[checkpointerDatabase];
        if (db) {
          checkpointer.database = db;
        }
      }
      
      newMemory.checkpointer = checkpointer;
    }
    
    if (storeEnabled) {
      const store: StoreModel = {
        name: storeName,
        type: storeType,
      };
      
      // Embedding config applies to both memory and postgres types
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
      
      // Only include database reference for postgres type
      if (storeType === 'postgres' && storeDatabase) {
        const db = databases[storeDatabase];
        if (db) {
          store.database = db;
        }
      }
      
      newMemory.store = store;
    }
    
    return (checkpointerEnabled || storeEnabled) ? newMemory : undefined;
  };
  
  const handleSaveMemory = () => {
    updateMemory(buildMemoryModel());
  };
  
  const databaseNames = Object.keys(databases);

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
        <Button onClick={handleSaveMemory}>
          Save Memory Config
        </Button>
      </div>

      {/* Info Card */}
      <Card className="p-4 bg-blue-900/20 border-blue-500/30">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-300">
            <p className="font-medium">Memory Components</p>
            <ul className="mt-2 space-y-1 text-blue-400/80">
              <li>• <strong>Checkpointer</strong>: Saves conversation state for resumable sessions</li>
              <li>• <strong>Store</strong>: Long-term semantic memory with embeddings for context</li>
            </ul>
            <p className="font-medium mt-3">Storage Options</p>
            <ul className="mt-2 space-y-1 text-blue-400/80">
              <li>• <strong>In-Memory</strong>: No database required. Fast but data lost on restart. Best for development.</li>
              <li>• <strong>Lakebase/PostgreSQL</strong>: Requires database backend. Persistent storage. Best for production.</li>
            </ul>
            {databaseNames.length === 0 && (
              <p className="mt-3 text-amber-400">
                ⚠️ No databases configured. Add a database in the <strong>Resources → Databases</strong> section to use persistent storage.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Checkpointer Section */}
      <Card className="p-5">
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
              Saves conversation state between messages for resumable sessions and multi-turn conversations.
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
                  <strong>In-Memory Storage:</strong> Conversation state will be stored in memory only. 
                  Data is lost when the agent restarts. Ideal for development and testing.
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
                    <strong>Persistent Storage:</strong> Conversation state will be stored in Lakebase/PostgreSQL. 
                    Data persists across agent restarts. Recommended for production.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Store Section */}
      <Card className="p-5">
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
              Semantic memory storage with embeddings for persistent context across sessions.
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
                  <strong>In-Memory Storage:</strong> Long-term memories will be stored in memory only. 
                  Data is lost when the agent restarts. Useful for development and testing.
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
                    <strong>Persistent Storage:</strong> Long-term memories will be stored in Lakebase/PostgreSQL with vector search. 
                    Data persists across agent restarts. Recommended for production.
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
      </Card>
    </div>
  );
}

export default MemorySection;
