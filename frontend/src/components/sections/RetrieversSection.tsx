import { useState, ChangeEvent } from 'react';
import { Plus, Trash2, Edit2, Search, Layers, Filter, RefreshCw } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import { RetrieverModel, SearchParametersModel, RerankParametersModel } from '@/types/dao-ai-types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';

// Helper function to generate a reference name from a display name
function generateRefName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// Common reranking models available in FlashRank
const RERANK_MODELS = [
  { value: 'ms-marco-TinyBERT-L-2-v2', label: 'TinyBERT L-2 (fastest)' },
  { value: 'ms-marco-MiniLM-L-6-v2', label: 'MiniLM L-6' },
  { value: 'ms-marco-MiniLM-L-12-v2', label: 'MiniLM L-12 (balanced)' },
  { value: 'rank-T5-flan', label: 'T5-flan (most accurate)' },
];

// Query type options
const QUERY_TYPES = [
  { value: 'ANN', label: 'ANN (Approximate Nearest Neighbor)' },
  { value: 'HYBRID', label: 'Hybrid' },
];

interface FormData {
  refName: string;
  vectorStoreRef: string;
  columns: string;
  numResults: string;
  queryType: string;
  enableRerank: boolean;
  rerankModel: string;
  rerankTopN: string;
  rerankCacheDir: string;
  rerankColumns: string;
}

export default function RetrieversSection() {
  const { config, addRetriever, updateRetriever, removeRetriever } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    refName: '',
    vectorStoreRef: '',
    columns: '',
    numResults: '10',
    queryType: 'ANN',
    enableRerank: false,
    rerankModel: 'ms-marco-MiniLM-L-12-v2',
    rerankTopN: '',
    rerankCacheDir: '/tmp/flashrank_cache',
    rerankColumns: '',
  });

  const retrievers = config.retrievers || {};
  const vectorStores = config.resources?.vector_stores || {};
  
  const hasVectorStores = Object.keys(vectorStores).length > 0;

  // Get vector store options
  const vectorStoreOptions = Object.entries(vectorStores).map(([key, vs]) => ({
    value: key,
    label: `${key} (${vs.embedding_source_column || 'no column'})`,
  }));

  const resetForm = () => {
    setFormData({
      refName: '',
      vectorStoreRef: '',
      columns: '',
      numResults: '10',
      queryType: 'ANN',
      enableRerank: false,
      rerankModel: 'ms-marco-MiniLM-L-12-v2',
      rerankTopN: '',
      rerankCacheDir: '/tmp/flashrank_cache',
      rerankColumns: '',
    });
    setEditingKey(null);
  };

  const handleEdit = (key: string) => {
    const retriever = retrievers[key];
    
    // Find the vector store reference by checking for matching vector store
    let vectorStoreRef = '';
    if (retriever.vector_store) {
      // Try to find matching configured vector store
      const matchedKey = Object.entries(vectorStores).find(
        ([, vs]) => 
          vs.embedding_source_column === retriever.vector_store.embedding_source_column &&
          vs.source_table?.name === retriever.vector_store.source_table?.name
      );
      if (matchedKey) {
        vectorStoreRef = matchedKey[0];
      }
    }
    
    // Handle rerank settings
    let enableRerank = false;
    let rerankModel = 'ms-marco-MiniLM-L-12-v2';
    let rerankTopN = '';
    let rerankCacheDir = '/tmp/flashrank_cache';
    let rerankColumns = '';
    
    if (retriever.rerank) {
      enableRerank = true;
      if (typeof retriever.rerank === 'object') {
        rerankModel = retriever.rerank.model || rerankModel;
        rerankTopN = retriever.rerank.top_n?.toString() || '';
        rerankCacheDir = retriever.rerank.cache_dir || rerankCacheDir;
        rerankColumns = retriever.rerank.columns?.join(', ') || '';
      }
    }
    
    setFormData({
      refName: key,
      vectorStoreRef,
      columns: retriever.columns?.join(', ') || '',
      numResults: retriever.search_parameters?.num_results?.toString() || '10',
      queryType: retriever.search_parameters?.query_type || 'ANN',
      enableRerank,
      rerankModel,
      rerankTopN,
      rerankCacheDir,
      rerankColumns,
    });
    setEditingKey(key);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.refName || !formData.vectorStoreRef) return;

    // Get the referenced vector store
    const vectorStore = vectorStores[formData.vectorStoreRef];
    if (!vectorStore) return;

    // Build columns array
    const columns = formData.columns
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    // Build search parameters
    const searchParameters: SearchParametersModel = {
      num_results: parseInt(formData.numResults) || 10,
      filters: {},
      query_type: formData.queryType,
    };

    // Build rerank config
    let rerank: RerankParametersModel | boolean | undefined;
    if (formData.enableRerank) {
      const rerankColumns = formData.rerankColumns
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);
      
      rerank = {
        model: formData.rerankModel,
        top_n: formData.rerankTopN ? parseInt(formData.rerankTopN) : undefined,
        cache_dir: formData.rerankCacheDir || undefined,
        columns: rerankColumns.length > 0 ? rerankColumns : undefined,
      };
    }

    const retriever: RetrieverModel = {
      vector_store: vectorStore,
      columns: columns.length > 0 ? columns : undefined,
      search_parameters: searchParameters,
      rerank,
    };

    if (editingKey && editingKey !== formData.refName) {
      // Key changed - remove old and add new
      removeRetriever(editingKey);
      addRetriever(formData.refName, retriever);
    } else if (editingKey) {
      updateRetriever(formData.refName, retriever);
    } else {
      addRetriever(formData.refName, retriever);
    }

    resetForm();
    setIsModalOpen(false);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleVectorStoreChange = (value: string) => {
    setFormData(prev => {
      const newData = { ...prev, vectorStoreRef: value };
      
      // Auto-populate columns from vector store if empty
      if (!prev.columns && vectorStores[value]?.columns) {
        newData.columns = vectorStores[value].columns.join(', ');
      }
      
      // Generate refName if empty
      if (!prev.refName && value) {
        newData.refName = `${generateRefName(value)}_retriever`;
      }
      
      return newData;
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-400" />
            Retrievers
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Configure vector search retrievers for semantic search and information retrieval
          </p>
        </div>
      </div>

      {!hasVectorStores && (
        <Card className="bg-amber-500/10 border-amber-500/30">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-amber-200">No Vector Stores Configured</h3>
              <p className="text-xs text-amber-300/70 mt-1">
                Retrievers require a vector store. Configure at least one vector store in the Resources section first.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Button
        onClick={() => {
          resetForm();
          setIsModalOpen(true);
        }}
        variant="primary"
        size="sm"
        disabled={!hasVectorStores}
        className="self-start"
      >
        <Plus className="w-4 h-4 mr-1" />
        Add Retriever
      </Button>

      {/* Retrievers List */}
      <div className="space-y-3">
        {Object.entries(retrievers).map(([key, retriever]) => (
          <Card key={key} className="hover:border-slate-700 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-slate-200">{key}</h3>
                  <Badge variant="info">
                    <Filter className="w-3 h-3 mr-1" />
                    {retriever.search_parameters?.num_results || 10} results
                  </Badge>
                  {retriever.rerank && (
                    <Badge variant="success">
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Reranking
                    </Badge>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-400">
                  <p>
                    <span className="text-slate-500">Query Type:</span>{' '}
                    {retriever.search_parameters?.query_type || 'ANN'}
                  </p>
                  {retriever.columns && retriever.columns.length > 0 && (
                    <p>
                      <span className="text-slate-500">Columns:</span>{' '}
                      {retriever.columns.slice(0, 3).join(', ')}
                      {retriever.columns.length > 3 && ` +${retriever.columns.length - 3} more`}
                    </p>
                  )}
                  {retriever.rerank && typeof retriever.rerank === 'object' && (
                    <p>
                      <span className="text-slate-500">Rerank Model:</span>{' '}
                      {retriever.rerank.model}
                      {retriever.rerank.top_n && ` (top ${retriever.rerank.top_n})`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(key)}
                >
                  <Edit2 className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRetriever(key)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {Object.keys(retrievers).length === 0 && hasVectorStores && (
          <div className="text-center py-8 text-slate-500">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No retrievers configured yet</p>
            <p className="text-xs mt-1">
              Add a retriever to enable semantic search capabilities for your agents
            </p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          resetForm();
          setIsModalOpen(false);
        }}
        title={editingKey ? 'Edit Retriever' : 'Add Retriever'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-2">
              Basic Configuration
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Reference Name"
                name="refName"
                value={formData.refName}
                onChange={handleChange}
                placeholder="products_retriever"
                hint="Unique identifier for this retriever"
                required
              />
              
              <Select
                label="Vector Store"
                value={formData.vectorStoreRef}
                onChange={(e) => handleVectorStoreChange(e.target.value)}
                options={[
                  { value: '', label: 'Select a vector store...' },
                  ...vectorStoreOptions,
                ]}
                hint="Select a configured vector store"
                required
              />
            </div>

            <Input
              label="Return Columns"
              name="columns"
              value={formData.columns}
              onChange={handleChange}
              placeholder="product_id, name, description"
              hint="Comma-separated list of columns to return in search results"
            />
          </div>

          {/* Search Parameters */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-2">
              Search Parameters
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Number of Results"
                name="numResults"
                type="number"
                value={formData.numResults}
                onChange={handleChange}
                placeholder="10"
                hint="Maximum number of results to return"
              />
              
              <Select
                label="Query Type"
                value={formData.queryType}
                onChange={(e) => setFormData(prev => ({ ...prev, queryType: e.target.value }))}
                options={QUERY_TYPES}
                hint="Search algorithm to use"
              />
            </div>
          </div>

          {/* Reranking */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
              <h3 className="text-sm font-medium text-slate-300">
                Reranking (Optional)
              </h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enableRerank"
                  checked={formData.enableRerank}
                  onChange={handleChange}
                  className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
                />
                <span className="text-slate-400">Enable reranking</span>
              </label>
            </div>
            
            {formData.enableRerank && (
              <div className="space-y-4 pl-4 border-l-2 border-slate-700">
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Rerank Model"
                    value={formData.rerankModel}
                    onChange={(e) => setFormData(prev => ({ ...prev, rerankModel: e.target.value }))}
                    options={RERANK_MODELS}
                    hint="FlashRank model for reranking"
                  />
                  
                  <Input
                    label="Top N Results"
                    name="rerankTopN"
                    type="number"
                    value={formData.rerankTopN}
                    onChange={handleChange}
                    placeholder="5"
                    hint="Number of results after reranking (leave empty to use search num_results)"
                  />
                </div>
                
                <Input
                  label="Rerank Columns"
                  name="rerankColumns"
                  value={formData.rerankColumns}
                  onChange={handleChange}
                  placeholder="name, description, category"
                  hint="Columns to use for reranking (comma-separated)"
                />
                
                <Input
                  label="Cache Directory"
                  name="rerankCacheDir"
                  value={formData.rerankCacheDir}
                  onChange={handleChange}
                  placeholder="/tmp/flashrank_cache"
                  hint="Directory to cache downloaded model weights"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                resetForm();
                setIsModalOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingKey ? 'Update' : 'Add'} Retriever
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

