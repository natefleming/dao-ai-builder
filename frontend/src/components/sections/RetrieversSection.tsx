import { useState, ChangeEvent } from 'react';
import { Plus, Trash2, Edit2, Search, Layers, Filter, RefreshCw, X } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import { RetrieverModel, SearchParametersModel, RerankParametersModel } from '@/types/dao-ai-types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';

// Filter operators supported by Databricks Vector Search
const FILTER_OPERATORS = [
  { value: '', label: '= (equals)' },
  { value: ' NOT', label: '!= (not equals)' },
  { value: ' <', label: '< (less than)' },
  { value: ' <=', label: '<= (less or equal)' },
  { value: ' >', label: '> (greater than)' },
  { value: ' >=', label: '>= (greater or equal)' },
  { value: ' LIKE', label: 'LIKE (pattern match)' },
];

// Column source type for filters
type ColumnSource = 'select' | 'manual';

// Interface for a single filter entry
interface FilterEntry {
  id: string;
  columnSource: ColumnSource;
  column: string;
  operator: string;
  value: string;
}

// Generate unique ID for filter entries
function generateFilterId(): string {
  return `filter_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

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
  filters: FilterEntry[];
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
    filters: [],
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
      filters: [],
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
    
    // Parse existing filters from search_parameters
    // First, get available columns from the vector store to determine column source
    const vs = vectorStoreRef ? vectorStores[vectorStoreRef] : null;
    const vsColumns: Set<string> = new Set();
    if (vs) {
      if (vs.columns && Array.isArray(vs.columns)) {
        vs.columns.forEach(col => vsColumns.add(col));
      }
      if (vs.embedding_source_column) vsColumns.add(vs.embedding_source_column);
      if (vs.primary_key) vsColumns.add(vs.primary_key);
      if (vs.doc_uri) vsColumns.add(vs.doc_uri);
    }
    
    const filters: FilterEntry[] = [];
    if (retriever.search_parameters?.filters) {
      Object.entries(retriever.search_parameters.filters).forEach(([filterKey, value]) => {
        // Parse the filter key to extract column name and operator
        // Format: "column_name" or "column_name OPERATOR"
        let column = filterKey;
        let operator = '';
        
        // Check for known operators in the key
        const operatorPatterns = [' NOT', ' <=', ' >=', ' <', ' >', ' LIKE'];
        for (const op of operatorPatterns) {
          if (filterKey.endsWith(op)) {
            column = filterKey.slice(0, -op.length);
            operator = op;
            break;
          }
        }
        
        // Determine if column is from the available list or manual
        const columnSource: ColumnSource = vsColumns.has(column) ? 'select' : 'manual';
        
        filters.push({
          id: generateFilterId(),
          columnSource,
          column,
          operator,
          value: String(value),
        });
      });
    }
    
    setFormData({
      refName: key,
      vectorStoreRef,
      columns: retriever.columns?.join(', ') || '',
      numResults: retriever.search_parameters?.num_results?.toString() || '10',
      queryType: retriever.search_parameters?.query_type || 'ANN',
      filters,
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

    // Build filters object from filter entries
    const filtersObj: Record<string, string | number | boolean> = {};
    formData.filters.forEach(filter => {
      if (filter.column && filter.value) {
        // Build the filter key: "column_name" or "column_name OPERATOR"
        const filterKey = filter.operator ? `${filter.column}${filter.operator}` : filter.column;
        // Try to parse value as number or boolean
        let parsedValue: string | number | boolean = filter.value;
        if (filter.value === 'true') {
          parsedValue = true;
        } else if (filter.value === 'false') {
          parsedValue = false;
        } else if (!isNaN(Number(filter.value)) && filter.value.trim() !== '') {
          parsedValue = Number(filter.value);
        }
        filtersObj[filterKey] = parsedValue;
      }
    });

    // Build search parameters
    const searchParameters: SearchParametersModel = {
      num_results: parseInt(formData.numResults) || 10,
      filters: Object.keys(filtersObj).length > 0 ? filtersObj : undefined,
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

  // Get available columns from the selected vector store
  const getAvailableColumns = (): string[] => {
    if (!formData.vectorStoreRef) return [];
    const vs = vectorStores[formData.vectorStoreRef];
    if (!vs) return [];
    
    // Collect columns from various sources in the vector store
    const columns: Set<string> = new Set();
    
    // Add configured columns
    if (vs.columns && Array.isArray(vs.columns)) {
      vs.columns.forEach(col => columns.add(col));
    }
    
    // Add embedding source column
    if (vs.embedding_source_column) {
      columns.add(vs.embedding_source_column);
    }
    
    // Add primary key
    if (vs.primary_key) {
      columns.add(vs.primary_key);
    }
    
    // Add doc_uri if present
    if (vs.doc_uri) {
      columns.add(vs.doc_uri);
    }
    
    return Array.from(columns).sort();
  };

  const availableColumns = getAvailableColumns();
  const hasAvailableColumns = availableColumns.length > 0;

  // Filter management functions
  const addFilter = () => {
    setFormData(prev => ({
      ...prev,
      filters: [...prev.filters, { 
        id: generateFilterId(), 
        columnSource: hasAvailableColumns ? 'select' : 'manual',
        column: '', 
        operator: '', 
        value: '' 
      }],
    }));
  };

  const updateFilter = (id: string, field: keyof FilterEntry, value: string) => {
    setFormData(prev => ({
      ...prev,
      filters: prev.filters.map(f => {
        if (f.id !== id) return f;
        // When changing source, clear the column value
        if (field === 'columnSource') {
          return { ...f, columnSource: value as ColumnSource, column: '' };
        }
        return { ...f, [field]: value };
      }),
    }));
  };

  const removeFilter = (id: string) => {
    setFormData(prev => ({
      ...prev,
      filters: prev.filters.filter(f => f.id !== id),
    }));
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
                  {retriever.search_parameters?.filters && Object.keys(retriever.search_parameters.filters).length > 0 && (
                    <Badge variant="warning">
                      {Object.keys(retriever.search_parameters.filters).length} filter{Object.keys(retriever.search_parameters.filters).length !== 1 ? 's' : ''}
                    </Badge>
                  )}
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
                  {retriever.search_parameters?.filters && Object.keys(retriever.search_parameters.filters).length > 0 && (
                    <p>
                      <span className="text-slate-500">Filters:</span>{' '}
                      {Object.entries(retriever.search_parameters.filters).slice(0, 2).map(([k, v]) => `${k}=${v}`).join(', ')}
                      {Object.keys(retriever.search_parameters.filters).length > 2 && ` +${Object.keys(retriever.search_parameters.filters).length - 2} more`}
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

          {/* Filters */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-2">
              <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filters (Optional)
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addFilter}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Filter
              </Button>
            </div>
            
            {formData.filters.length === 0 ? (
              <div className="text-xs text-slate-500 italic py-2">
                No filters configured. Add filters to narrow down search results based on column values.
              </div>
            ) : (
              <div className="space-y-3">
                {formData.filters.map((filter) => (
                  <div key={filter.id} className="flex items-start gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex-1 space-y-3">
                      {/* Row 1: Column (with toggle) and Operator */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Column field with source toggle */}
                        <div className="flex flex-col">
                          <div className="flex items-center justify-between h-5 mb-1">
                            <label className="text-xs font-medium text-slate-400">Column</label>
                            <div className="flex">
                              <button
                                type="button"
                                onClick={() => updateFilter(filter.id, 'columnSource', 'select')}
                                className={`px-2 py-0.5 text-[10px] rounded-l border transition-colors ${
                                  filter.columnSource === 'select'
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'
                                } ${!hasAvailableColumns ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={!hasAvailableColumns}
                                title={hasAvailableColumns ? 'Select from available columns' : 'No columns available'}
                              >
                                Select
                              </button>
                              <button
                                type="button"
                                onClick={() => updateFilter(filter.id, 'columnSource', 'manual')}
                                className={`px-2 py-0.5 text-[10px] rounded-r border-t border-r border-b transition-colors ${
                                  filter.columnSource === 'manual'
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'
                                }`}
                              >
                                Manual
                              </button>
                            </div>
                          </div>
                          {filter.columnSource === 'select' && hasAvailableColumns ? (
                            <select
                              value={filter.column}
                              onChange={(e) => updateFilter(filter.id, 'column', e.target.value)}
                              className="w-full h-[38px] px-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Select column...</option>
                              {availableColumns.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={filter.column}
                              onChange={(e) => updateFilter(filter.id, 'column', e.target.value)}
                              placeholder="column_name"
                              className="w-full h-[38px] px-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          )}
                        </div>
                        
                        {/* Operator field - matching height with Column header */}
                        <div className="flex flex-col">
                          <div className="flex items-center justify-between h-5 mb-1">
                            <label className="text-xs font-medium text-slate-400">Operator</label>
                          </div>
                          <select
                            value={filter.operator}
                            onChange={(e) => updateFilter(filter.id, 'operator', e.target.value)}
                            className="w-full h-[38px] px-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {FILTER_OPERATORS.map(op => (
                              <option key={op.value} value={op.value}>{op.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      {/* Row 2: Value field */}
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Value</label>
                        <input
                          type="text"
                          value={filter.value}
                          onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
                          placeholder="filter value"
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-slate-500">Strings, numbers, or booleans (true/false)</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFilter(filter.id)}
                      className="mt-4 p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                      title="Remove filter"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <p className="text-xs text-slate-500">
              Filters restrict search results to rows matching the specified conditions.
              Use column names from your source table. Values are automatically parsed as numbers or booleans when applicable.
            </p>
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
                
                {/* Rerank Columns - populated from selected vector store */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">
                    Columns to Rerank
                  </label>
                  {availableColumns.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 bg-slate-900/50 rounded-lg border border-slate-600">
                      {availableColumns.map((col) => {
                        const selectedCols = formData.rerankColumns.split(',').map(c => c.trim()).filter(c => c);
                        const isSelected = selectedCols.includes(col);
                        return (
                          <label key={col} className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                let newCols: string[];
                                if (e.target.checked) {
                                  newCols = [...selectedCols, col];
                                } else {
                                  newCols = selectedCols.filter(c => c !== col);
                                }
                                setFormData(prev => ({
                                  ...prev,
                                  rerankColumns: newCols.join(', ')
                                }));
                              }}
                              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                            />
                            <span className="text-sm text-slate-300">{col}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-600 text-slate-500 text-sm">
                      {formData.vectorStoreRef 
                        ? "No columns found in selected vector store" 
                        : "Select a vector store to see available columns"}
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    Select columns from the vector store to use for reranking. 
                    {formData.rerankColumns && ` Selected: ${formData.rerankColumns}`}
                  </p>
                </div>
                
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

