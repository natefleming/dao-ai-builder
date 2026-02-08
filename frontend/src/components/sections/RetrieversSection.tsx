import { useState, ChangeEvent } from 'react';
import { Plus, Trash2, Edit2, Search, Layers, Filter, X, ChevronDown, ChevronRight, Zap, CheckCircle, Route, ArrowUpDown, Sparkles } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import { RetrieverModel, SearchParametersModel, RerankParametersModel, RouterModel, InstructedRetrieverModel, DecompositionModel, VerifierModel, ColumnInfo, InstructionAwareRerankModel } from '@/types/dao-ai-types';
import Textarea from '../ui/Textarea';
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

import { normalizeRefName, normalizeRefNameWhileTyping } from '@/utils/name-utils';
import { safeDelete } from '@/utils/safe-delete';
import { useYamlScrollStore } from '@/stores/yamlScrollStore';

// Valid FlashRank reranking models - see https://github.com/PrithivirajDamodaran/FlashRank
const RERANK_MODELS = [
  { value: '', label: 'None (use Databricks columns reranking only)' },
  { value: 'ms-marco-TinyBERT-L-2-v2', label: 'TinyBERT L-2 (~4MB, fastest)' },
  { value: 'ms-marco-MiniLM-L-12-v2', label: 'MiniLM L-12 (~34MB, best cross-encoder, recommended)' },
  { value: 'rank-T5-flan', label: 'T5-flan (~110MB, best non cross-encoder)' },
  { value: 'ms-marco-MultiBERT-L-12', label: 'MultiBERT L-12 (~150MB, 100+ languages)' },
  { value: 'ce-esci-MiniLM-L12-v2', label: 'ESCI MiniLM L-12 (e-commerce optimized)' },
  { value: 'miniReranker_arabic_v1', label: 'Arabic Reranker (Arabic language)' },
];

// Query type options
const QUERY_TYPES = [
  { value: 'ANN', label: 'ANN (Approximate Nearest Neighbor)' },
  { value: 'HYBRID', label: 'Hybrid' },
];

// Column info entry for instructed retrieval
interface ColumnInfoEntry {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "datetime";
  operators: string;  // Comma-separated
}

// Example entry for instructed retrieval
interface ExampleEntry {
  id: string;
  query: string;
  filters: string;  // JSON string
}

interface FormData {
  refName: string;
  vectorStoreRef: string;
  columns: string;
  numResults: string;
  queryType: string;
  filters: FilterEntry[];
  // Router settings
  enableRouter: boolean;
  routerModelRef: string;
  routerDefaultMode: "standard" | "instructed";
  routerAutoBypass: boolean;
  // Instructed retrieval settings
  enableInstructed: boolean;
  instructedModelRef: string;
  instructedSchemaDescription: string;
  instructedColumns: ColumnInfoEntry[];
  instructedConstraints: string;  // Newline-separated
  instructedMaxSubqueries: string;
  instructedRrfK: string;
  instructedExamples: ExampleEntry[];
  instructedNormalizeFilterCase: "" | "uppercase" | "lowercase";
  // Verifier settings
  enableVerifier: boolean;
  verifierModelRef: string;
  verifierOnFailure: "warn" | "retry" | "warn_and_retry";
  verifierMaxRetries: string;
  // Rerank settings
  enableRerank: boolean;
  rerankMode: 'default' | 'custom';  // 'default' = rerank: true, 'custom' = full config
  rerankModel: string;
  rerankTopN: string;
  rerankCacheDir: string;
  rerankColumns: string;
  // Instruction-aware reranking
  enableInstructionAwareRerank: boolean;
  instructionAwareModelRef: string;
  instructionAwareInstructions: string;
  instructionAwareTopN: string;
}

function generateColumnInfoId(): string {
  return `col_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function generateExampleId(): string {
  return `ex_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export default function RetrieversSection() {
  const { config, addRetriever, updateRetriever, removeRetriever } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // Collapsible section states
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showInstructedSection, setShowInstructedSection] = useState(false);
  const [showRerankSection, setShowRerankSection] = useState(false);
  const [showInstructionAwareSection, setShowInstructionAwareSection] = useState(false);
  const [showRouterSection, setShowRouterSection] = useState(false);
  const [showVerifierSection, setShowVerifierSection] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    refName: '',
    vectorStoreRef: '',
    columns: '',
    numResults: '10',
    queryType: 'ANN',
    filters: [],
    // Router
    enableRouter: false,
    routerModelRef: '',
    routerDefaultMode: 'standard',
    routerAutoBypass: true,
    // Instructed
    enableInstructed: false,
    instructedModelRef: '',
    instructedSchemaDescription: '',
    instructedColumns: [],
    instructedConstraints: '',
    instructedMaxSubqueries: '3',
    instructedRrfK: '60',
    instructedExamples: [],
    instructedNormalizeFilterCase: '',
    // Verifier
    enableVerifier: false,
    verifierModelRef: '',
    verifierOnFailure: 'warn',
    verifierMaxRetries: '1',
    // Rerank
    enableRerank: false,
    rerankMode: 'default',
    rerankModel: 'ms-marco-MiniLM-L-12-v2',
    rerankTopN: '',
    rerankCacheDir: '~/.dao_ai/cache/flashrank',
    rerankColumns: '',
    // Instruction-aware rerank
    enableInstructionAwareRerank: false,
    instructionAwareModelRef: '',
    instructionAwareInstructions: '',
    instructionAwareTopN: '',
  });

  const retrievers = config.retrievers || {};
  const vectorStores = config.resources?.vector_stores || {};
  const llms = config.resources?.llms || {};
  
  const hasVectorStores = Object.keys(vectorStores).length > 0;

  // Get vector store options
  const vectorStoreOptions = Object.entries(vectorStores).map(([key, vs]) => ({
    value: key,
    label: `${key} (${vs.embedding_source_column || 'no column'})`,
  }));

  // Get LLM options for model selection
  const llmOptions = Object.entries(llms).map(([key, llm]) => ({
    value: key,
    label: `${key} (${llm.name})`,
  }));

  const resetForm = () => {
    setFormData({
      refName: '',
      vectorStoreRef: '',
      columns: '',
      numResults: '10',
      queryType: 'ANN',
      filters: [],
      // Router
      enableRouter: false,
      routerModelRef: '',
      routerDefaultMode: 'standard',
      routerAutoBypass: true,
      // Instructed
      enableInstructed: false,
      instructedModelRef: '',
      instructedSchemaDescription: '',
      instructedColumns: [],
      instructedConstraints: '',
      instructedMaxSubqueries: '3',
      instructedRrfK: '60',
      instructedExamples: [],
      instructedNormalizeFilterCase: '',
      // Verifier
      enableVerifier: false,
      verifierModelRef: '',
      verifierOnFailure: 'warn',
      verifierMaxRetries: '1',
      // Rerank
      enableRerank: false,
      rerankMode: 'default',
      rerankModel: 'ms-marco-MiniLM-L-12-v2',
      rerankTopN: '',
      rerankCacheDir: '~/.dao_ai/cache/flashrank',
      rerankColumns: '',
      // Instruction-aware rerank
      enableInstructionAwareRerank: false,
      instructionAwareModelRef: '',
      instructionAwareInstructions: '',
      instructionAwareTopN: '',
    });
    setEditingKey(null);
    // Reset section visibility
    setShowAdvanced(false);
    setShowInstructedSection(false);
    setShowRerankSection(false);
    setShowInstructionAwareSection(false);
    setShowRouterSection(false);
    setShowVerifierSection(false);
  };

  const { scrollToAsset } = useYamlScrollStore();

  // Helper to find LLM key by matching the model properties
  const findLLMKeyByModel = (model: any): string => {
    if (!model) return '';
    
    // If it's already a string reference, return it
    if (typeof model === 'string') {
      // Check if it's a YAML reference like "*fast_llm"
      if (model.startsWith('*')) return model.slice(1);
      return model;
    }
    
    // It's an expanded LLMModel object - find matching key in configured LLMs
    const modelName = model.name;
    if (!modelName) return '';
    
    // Search through configured LLMs to find matching key
    for (const [llmKey, llm] of Object.entries(llms)) {
      if (llm.name === modelName) {
        // Found a match - verify other properties match too for disambiguation
        const tempMatch = model.temperature === undefined || llm.temperature === undefined || 
                          model.temperature === llm.temperature;
        const tokensMatch = model.max_tokens === undefined || llm.max_tokens === undefined || 
                            model.max_tokens === llm.max_tokens;
        if (tempMatch && tokensMatch) {
          return llmKey;
        }
      }
    }
    
    // No match found in configured LLMs
    return '';
  };

  const handleEdit = (key: string) => {
    scrollToAsset(key);
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
    
    // Handle router settings (nested under instructed)
    let enableRouter = false;
    let routerModelRef = '';
    let routerDefaultMode: "standard" | "instructed" = 'standard';
    let routerAutoBypass = true;
    
    if (retriever.instructed?.router) {
      enableRouter = true;
      routerModelRef = findLLMKeyByModel(retriever.instructed.router.model);
      routerDefaultMode = retriever.instructed.router.default_mode || 'standard';
      routerAutoBypass = retriever.instructed.router.auto_bypass !== false;
    }
    
    // Handle instructed retrieval settings (decomposition is nested)
    let enableInstructed = false;
    let instructedModelRef = '';
    let instructedSchemaDescription = '';
    let instructedColumns: ColumnInfoEntry[] = [];
    let instructedConstraints = '';
    let instructedMaxSubqueries = '3';
    let instructedRrfK = '60';
    let instructedExamples: ExampleEntry[] = [];
    let instructedNormalizeFilterCase: "" | "uppercase" | "lowercase" = '';
    
    if (retriever.instructed) {
      enableInstructed = true;
      instructedSchemaDescription = retriever.instructed.schema_description || '';
      instructedColumns = (retriever.instructed.columns || []).map(col => ({
        id: generateColumnInfoId(),
        name: col.name,
        type: col.type || 'string',
        operators: col.operators?.join(', ') || '',
      }));
      instructedConstraints = (retriever.instructed.constraints || []).join('\n');
      // Decomposition fields are nested under instructed.decomposition
      const decomp = retriever.instructed.decomposition;
      instructedModelRef = findLLMKeyByModel(decomp?.model);
      instructedMaxSubqueries = decomp?.max_subqueries?.toString() || '3';
      instructedRrfK = decomp?.rrf_k?.toString() || '60';
      instructedExamples = (decomp?.examples || []).map(ex => ({
        id: generateExampleId(),
        query: ex.query,
        filters: JSON.stringify(ex.filters || {}),
      }));
      instructedNormalizeFilterCase = decomp?.normalize_filter_case || '';
    }
    
    // Handle verifier settings (nested under instructed)
    let enableVerifier = false;
    let verifierModelRef = '';
    let verifierOnFailure: "warn" | "retry" | "warn_and_retry" = 'warn';
    let verifierMaxRetries = '1';
    
    if (retriever.instructed?.verifier) {
      enableVerifier = true;
      verifierModelRef = findLLMKeyByModel(retriever.instructed.verifier.model);
      verifierOnFailure = retriever.instructed.verifier.on_failure || 'warn';
      verifierMaxRetries = retriever.instructed.verifier.max_retries?.toString() || '1';
    }
    
    // Handle rerank settings
    let enableRerank = false;
    let rerankMode: 'default' | 'custom' = 'default';
    let rerankModel = 'ms-marco-MiniLM-L-12-v2';
    let rerankTopN = '';
    let rerankCacheDir = '~/.dao_ai/cache/flashrank';
    let rerankColumns = '';
    let enableInstructionAwareRerank = false;
    let instructionAwareModelRef = '';
    let instructionAwareInstructions = '';
    let instructionAwareTopN = '';
    
    if (retriever.rerank) {
      enableRerank = true;
      if (typeof retriever.rerank === 'boolean') {
        // rerank: true - use defaults
        rerankMode = 'default';
      } else {
        // rerank: { ... } - custom configuration
        rerankMode = 'custom';
        rerankModel = retriever.rerank.model || '';
        rerankTopN = retriever.rerank.top_n?.toString() || '';
        rerankCacheDir = retriever.rerank.cache_dir || rerankCacheDir;
        rerankColumns = retriever.rerank.columns?.join(', ') || '';
      }
    }
    
    // Instruction-aware reranking is nested under instructed.rerank
    if (retriever.instructed?.rerank) {
      enableInstructionAwareRerank = true;
      instructionAwareModelRef = findLLMKeyByModel(retriever.instructed.rerank.model);
      instructionAwareInstructions = retriever.instructed.rerank.instructions || '';
      instructionAwareTopN = retriever.instructed.rerank.top_n?.toString() || '';
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
      // Router
      enableRouter,
      routerModelRef,
      routerDefaultMode,
      routerAutoBypass,
      // Instructed
      enableInstructed,
      instructedModelRef,
      instructedSchemaDescription,
      instructedColumns,
      instructedConstraints,
      instructedMaxSubqueries,
      instructedRrfK,
      instructedExamples,
      instructedNormalizeFilterCase,
      // Verifier
      enableVerifier,
      verifierModelRef,
      verifierOnFailure,
      verifierMaxRetries,
      // Rerank
      enableRerank,
      rerankMode,
      rerankModel,
      rerankTopN,
      rerankCacheDir,
      rerankColumns,
      // Instruction-aware rerank
      enableInstructionAwareRerank,
      instructionAwareModelRef,
      instructionAwareInstructions,
      instructionAwareTopN,
    });
    setEditingKey(key);
    // Auto-expand sections for enabled features
    setShowAdvanced(enableInstructed);
    setShowRerankSection(enableRerank);
    setShowInstructionAwareSection(enableInstructionAwareRerank);
    setShowRouterSection(enableRouter);
    setShowVerifierSection(enableVerifier);
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

    // Build rerank config (FlashRank/Databricks only - no instruction_aware here)
    let rerank: RerankParametersModel | boolean | undefined;
    if (formData.enableRerank) {
      if (formData.rerankMode === 'default') {
        // Simple mode: just enable with defaults
        rerank = true;
      } else {
        // Custom mode: full configuration
        const rerankColumns = formData.rerankColumns
          .split(',')
          .map(c => c.trim())
          .filter(c => c.length > 0);
        
        rerank = {
          model: formData.rerankModel || undefined,
          top_n: formData.rerankTopN ? parseInt(formData.rerankTopN) : undefined,
          cache_dir: formData.rerankCacheDir || undefined,
          columns: rerankColumns.length > 0 ? rerankColumns : undefined,
        };
      }
    }

    // Build instructed config with nested decomposition, rerank, router, verifier
    let instructed: InstructedRetrieverModel | undefined;
    if (formData.enableInstructed && formData.instructedSchemaDescription) {
      const instructedColumnsArr: ColumnInfo[] = formData.instructedColumns
        .filter(col => col.name.trim())
        .map(col => ({
          name: col.name.trim(),
          type: col.type,
          operators: col.operators
            ? col.operators.split(',').map(o => o.trim()).filter(o => o)
            : undefined,
        }));
      
      const constraintsArr = formData.instructedConstraints
        .split('\n')
        .map(c => c.trim())
        .filter(c => c.length > 0);
      
      const examplesArr = formData.instructedExamples
        .filter(ex => ex.query.trim())
        .map(ex => {
          let filters = {};
          try {
            filters = JSON.parse(ex.filters || '{}');
          } catch {
            filters = {};
          }
          return { query: ex.query.trim(), filters };
        });
      
      // Build nested decomposition config
      const hasDecompositionFields = formData.instructedModelRef || 
        examplesArr.length > 0 || 
        formData.instructedNormalizeFilterCase ||
        parseInt(formData.instructedMaxSubqueries) !== 3 ||
        parseInt(formData.instructedRrfK) !== 60;
      
      const decomposition: DecompositionModel | undefined = hasDecompositionFields ? {
        model: formData.instructedModelRef || undefined,
        max_subqueries: parseInt(formData.instructedMaxSubqueries) || 3,
        rrf_k: parseInt(formData.instructedRrfK) || 60,
        examples: examplesArr.length > 0 ? examplesArr : undefined,
        normalize_filter_case: formData.instructedNormalizeFilterCase || undefined,
      } : undefined;

      // Build instruction-aware rerank config (nested under instructed)
      let instructedRerank: InstructionAwareRerankModel | undefined;
      if (formData.enableInstructionAwareRerank) {
        instructedRerank = {
          model: formData.instructionAwareModelRef || undefined,
          instructions: formData.instructionAwareInstructions || undefined,
          top_n: formData.instructionAwareTopN ? parseInt(formData.instructionAwareTopN) : undefined,
        };
      }

      // Build router config (nested under instructed)
      let router: RouterModel | undefined;
      if (formData.enableRouter) {
        router = {
          model: formData.routerModelRef || undefined,
          default_mode: formData.routerDefaultMode,
          auto_bypass: formData.routerAutoBypass,
        };
      }

      // Build verifier config (nested under instructed)
      let verifier: VerifierModel | undefined;
      if (formData.enableVerifier) {
        verifier = {
          model: formData.verifierModelRef || undefined,
          on_failure: formData.verifierOnFailure,
          max_retries: parseInt(formData.verifierMaxRetries) || 1,
        };
      }

      instructed = {
        schema_description: formData.instructedSchemaDescription,
        columns: instructedColumnsArr.length > 0 ? instructedColumnsArr : undefined,
        constraints: constraintsArr.length > 0 ? constraintsArr : undefined,
        decomposition,
        rerank: instructedRerank,
        router,
        verifier,
      };
    }

    const retriever: RetrieverModel = {
      vector_store: vectorStore,
      columns: columns.length > 0 ? columns : undefined,
      search_parameters: searchParameters,
      rerank,
      instructed,
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
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => {
        const updated = { ...prev, [name]: checked };
        // Auto-enable Instructed Retrieval when enabling dependent features
        if (checked && (name === 'enableInstructionAwareRerank' || name === 'enableRouter' || name === 'enableVerifier')) {
          updated.enableInstructed = true;
          // Auto-expand the Instructed Retrieval section so user can fill in schema
          setShowAdvanced(true);
        }
        return updated;
      });
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleVectorStoreChange = (value: string) => {
    setFormData(prev => {
      const newData = { ...prev, vectorStoreRef: value };
      
      // Auto-select ALL columns from vector store when changing selection
      if (vectorStores[value]?.columns) {
        newData.columns = vectorStores[value].columns.join(', ');
      } else {
        // Clear columns if new vector store has no columns defined
        newData.columns = '';
      }
      
      // Generate refName if empty
      if (!prev.refName && value) {
        newData.refName = `${normalizeRefName(value)}_retriever`;
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
      {Object.keys(retrievers).length > 0 && (
        <div className="space-y-2">
          {Object.entries(retrievers).map(([key, retriever]) => (
            <div
              key={key}
              className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-800/70 transition-colors"
              onClick={() => handleEdit(key)}
            >
              <div className="flex items-center space-x-3">
                <Search className="w-4 h-4 text-blue-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-200">{key}</p>
                    <Badge variant="info">
                      {retriever.search_parameters?.num_results || 10} results
                    </Badge>
                    {retriever.search_parameters?.filters && Object.keys(retriever.search_parameters.filters).length > 0 && (
                      <Badge variant="warning">
                        {Object.keys(retriever.search_parameters.filters).length} filter{Object.keys(retriever.search_parameters.filters).length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    {retriever.rerank && (
                      <Badge variant="success">
                        Rerank
                      </Badge>
                    )}
                    {retriever.instructed && (
                      <Badge variant="info">
                        Instructed
                      </Badge>
                    )}
                    {retriever.instructed?.rerank && (
                      <Badge variant="info">
                        LLM Rerank
                      </Badge>
                    )}
                    {retriever.instructed?.router && (
                      <Badge variant="info">
                        Router
                      </Badge>
                    )}
                    {retriever.instructed?.verifier && (
                      <Badge variant="info">
                        Verifier
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {retriever.search_parameters?.query_type || 'ANN'}
                    {retriever.columns && retriever.columns.length > 0 && (
                      <> • {retriever.columns.slice(0, 2).join(', ')}{retriever.columns.length > 2 && ` +${retriever.columns.length - 2}`}</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(key);
                  }}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    safeDelete('Retriever', key, () => removeRetriever(key));
                  }}
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(retrievers).length === 0 && hasVectorStores && (
        <div className="text-center py-8 text-slate-500">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No retrievers configured yet</p>
          <p className="text-xs mt-1">
            Add a retriever to enable semantic search capabilities for your agents
          </p>
        </div>
      )}

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
                onChange={(e) => setFormData(prev => ({ ...prev, refName: normalizeRefNameWhileTyping(e.target.value) }))}
                placeholder="Products Retriever"
                hint="Type naturally - spaces become underscores"
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

            {/* Return Columns - selectable from vector store columns */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Return Columns</label>
              {(() => {
                const selectedVs = formData.vectorStoreRef ? vectorStores[formData.vectorStoreRef] : null;
                const availableColumns = selectedVs?.columns || [];
                
                if (availableColumns.length > 0) {
                  return (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-slate-800/50 rounded border border-slate-700">
                        {availableColumns.map((col: string) => {
                          const selectedCols = formData.columns.split(',').map(c => c.trim()).filter(c => c);
                          const isSelected = selectedCols.includes(col);
                          return (
                            <button
                              key={col}
                              type="button"
                              onClick={() => {
                                const currentCols = formData.columns.split(',').map(c => c.trim()).filter(c => c);
                                if (isSelected) {
                                  setFormData(prev => ({
                                    ...prev,
                                    columns: currentCols.filter(c => c !== col).join(', ')
                                  }));
                                } else {
                                  setFormData(prev => ({
                                    ...prev,
                                    columns: [...currentCols, col].join(', ')
                                  }));
                                }
                              }}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                isSelected 
                                  ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50' 
                                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                              }`}
                            >
                              {col}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500">
                          Click columns to select/deselect. Selected: {formData.columns.split(',').filter(c => c.trim()).length || 0}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              columns: availableColumns.join(', ')
                            }))}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, columns: '' }))}
                            className="text-xs text-slate-400 hover:text-slate-300"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <Input
                      name="columns"
                      value={formData.columns}
                      onChange={handleChange}
                      placeholder="product_id, name, description"
                      hint={formData.vectorStoreRef 
                        ? "Vector store has no columns defined. Enter comma-separated column names."
                        : "Select a vector store to see available columns, or enter comma-separated column names"
                      }
                    />
                  );
                }
              })()}
            </div>
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

          {/* ── Instructed Retrieval ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm font-medium text-slate-300 border-b border-slate-700 pb-2 flex-1 hover:text-slate-100 transition-colors"
              >
                {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <Zap className="w-4 h-4 text-amber-400" />
                Instructed Retrieval
                {formData.enableInstructed && (
                  <Badge variant="info" className="ml-2">
                    {[
                      'Enabled',
                      formData.enableInstructionAwareRerank && 'Rerank',
                      formData.enableRouter && 'Router',
                      formData.enableVerifier && 'Verifier',
                    ].filter(Boolean).join(', ')}
                  </Badge>
                )}
              </button>
              <label className="flex items-center gap-2 text-sm border-b border-slate-700 pb-2 pl-3">
                <input
                  type="checkbox"
                  name="enableInstructed"
                  checked={formData.enableInstructed}
                  onChange={handleChange}
                  className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
                />
                <span className="text-slate-400">Enable</span>
              </label>
            </div>

            {showAdvanced && formData.enableInstructed && (
              <div className="space-y-4 pl-4 border-l-2 border-amber-500/30">
                <p className="text-xs text-slate-500">
                  Schema-aware, LLM-driven features: query decomposition, instruction-aware reranking, query routing, and result verification.
                </p>

                {/* Schema Description (required) */}
                <Textarea
                  label="Schema Description"
                  name="instructedSchemaDescription"
                  value={formData.instructedSchemaDescription}
                  onChange={handleChange}
                  placeholder="Products table: product_id, brand_name, category, price&#10;Filter operators: {&quot;col&quot;: val}, {&quot;col >&quot;: val}, {&quot;col NOT&quot;: val}"
                  rows={4}
                  hint="Column names, types, and valid filter syntax for the LLM (required)"
                  required
                />

                <Textarea
                  label="Default Constraints"
                  name="instructedConstraints"
                  value={formData.instructedConstraints}
                  onChange={handleChange}
                  placeholder="Prefer recent products&#10;Prioritize exact brand matches"
                  rows={3}
                  hint="One constraint per line"
                />

                {/* Column Info Editor */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-300">Schema Columns (Optional)</label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        instructedColumns: [...prev.instructedColumns, {
                          id: generateColumnInfoId(),
                          name: '',
                          type: 'string',
                          operators: '',
                        }],
                      }))}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Column
                    </Button>
                  </div>
                  {formData.instructedColumns.length > 0 && (
                    <div className="space-y-2">
                      {formData.instructedColumns.map((col, idx) => (
                        <div key={col.id} className="flex items-center gap-2 p-2 bg-slate-900/50 rounded border border-slate-700/50">
                          <input
                            type="text"
                            value={col.name}
                            onChange={(e) => {
                              const updated = [...formData.instructedColumns];
                              updated[idx] = { ...col, name: e.target.value };
                              setFormData(prev => ({ ...prev, instructedColumns: updated }));
                            }}
                            placeholder="Column name"
                            className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500"
                          />
                          <select
                            value={col.type}
                            onChange={(e) => {
                              const updated = [...formData.instructedColumns];
                              updated[idx] = { ...col, type: e.target.value as any };
                              setFormData(prev => ({ ...prev, instructedColumns: updated }));
                            }}
                            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-100"
                          >
                            <option value="string">string</option>
                            <option value="number">number</option>
                            <option value="boolean">boolean</option>
                            <option value="datetime">datetime</option>
                          </select>
                          <input
                            type="text"
                            value={col.operators}
                            onChange={(e) => {
                              const updated = [...formData.instructedColumns];
                              updated[idx] = { ...col, operators: e.target.value };
                              setFormData(prev => ({ ...prev, instructedColumns: updated }));
                            }}
                            placeholder="Operators (comma-sep)"
                            className="w-32 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              instructedColumns: prev.instructedColumns.filter(c => c.id !== col.id),
                            }))}
                            className="p-1 text-slate-400 hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    Structured column info improves LLM filter accuracy. Operators: empty for equality, NOT, &lt;, &lt;=, &gt;, &gt;=, LIKE
                  </p>
                </div>

                {/* ── Query Decomposition (nested under instructed) ── */}
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowInstructedSection(!showInstructedSection)}
                    className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors"
                  >
                    {showInstructedSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <Layers className="w-4 h-4 text-amber-400" />
                    Query Decomposition
                  </button>

                  {showInstructedSection && (
                    <div className="space-y-4 pl-4 border-l-2 border-amber-500/20">
                      <p className="text-xs text-slate-500">
                        Decomposes user queries into multiple subqueries with metadata filters and merges results using RRF.
                      </p>

                      <div className="grid grid-cols-2 gap-3">
                        <Select
                          label="Decomposition Model"
                          value={formData.instructedModelRef}
                          onChange={(e) => setFormData(prev => ({ ...prev, instructedModelRef: e.target.value }))}
                          options={[
                            { value: '', label: 'Select LLM...' },
                            ...llmOptions,
                          ]}
                          hint="Fast model recommended"
                        />
                        <Select
                          label="Normalize Filter Case"
                          value={formData.instructedNormalizeFilterCase}
                          onChange={(e) => setFormData(prev => ({ ...prev, instructedNormalizeFilterCase: e.target.value as "" | "uppercase" | "lowercase" }))}
                          options={[
                            { value: '', label: 'No normalization' },
                            { value: 'uppercase', label: 'Uppercase' },
                            { value: 'lowercase', label: 'Lowercase' },
                          ]}
                          hint="Auto-normalize filter values"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="Max Subqueries"
                          name="instructedMaxSubqueries"
                          type="number"
                          value={formData.instructedMaxSubqueries}
                          onChange={handleChange}
                          placeholder="3"
                          hint="Maximum parallel subqueries"
                        />
                        <Input
                          label="RRF K Constant"
                          name="instructedRrfK"
                          type="number"
                          value={formData.instructedRrfK}
                          onChange={handleChange}
                          placeholder="60"
                          hint="Lower values weight top ranks more"
                        />
                      </div>

                      {/* Examples Editor */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-300">Few-Shot Examples (Optional)</label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              instructedExamples: [...prev.instructedExamples, {
                                id: generateExampleId(),
                                query: '',
                                filters: '{}',
                              }],
                            }))}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add Example
                          </Button>
                        </div>
                        {formData.instructedExamples.length > 0 && (
                          <div className="space-y-2">
                            {formData.instructedExamples.map((ex, idx) => (
                              <div key={ex.id} className="flex items-start gap-2 p-2 bg-slate-900/50 rounded border border-slate-700/50">
                                <div className="flex-1 space-y-2">
                                  <input
                                    type="text"
                                    value={ex.query}
                                    onChange={(e) => {
                                      const updated = [...formData.instructedExamples];
                                      updated[idx] = { ...ex, query: e.target.value };
                                      setFormData(prev => ({ ...prev, instructedExamples: updated }));
                                    }}
                                    placeholder="Query: e.g., cheap drills"
                                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500"
                                  />
                                  <input
                                    type="text"
                                    value={ex.filters}
                                    onChange={(e) => {
                                      const updated = [...formData.instructedExamples];
                                      updated[idx] = { ...ex, filters: e.target.value };
                                      setFormData(prev => ({ ...prev, instructedExamples: updated }));
                                    }}
                                    placeholder='Filters JSON: e.g., {"price <": 100}'
                                    className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 font-mono text-xs"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setFormData(prev => ({
                                    ...prev,
                                    instructedExamples: prev.instructedExamples.filter(e => e.id !== ex.id),
                                  }))}
                                  className="p-1 text-slate-400 hover:text-red-400"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-slate-500">
                          Domain-specific examples for better filter translation
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Instruction-Aware Reranking (nested under instructed) ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowInstructionAwareSection(!showInstructionAwareSection)}
                      className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors"
                    >
                      {showInstructionAwareSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      Instruction-Aware Reranking
                      {formData.enableInstructionAwareRerank && (
                        <Badge variant="info" className="ml-1">Enabled</Badge>
                      )}
                    </button>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="enableInstructionAwareRerank"
                        checked={formData.enableInstructionAwareRerank}
                        onChange={handleChange}
                        className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
                      />
                      <span className="text-slate-400">Enable</span>
                    </label>
                  </div>

                  {showInstructionAwareSection && formData.enableInstructionAwareRerank && (
                    <div className="space-y-3 pl-4 border-l-2 border-violet-500/30">
                      <p className="text-xs text-slate-500">
                        LLM-based reranking that considers user instructions and constraints. Runs after standard reranking.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Select
                          label="Reranking Model"
                          value={formData.instructionAwareModelRef}
                          onChange={(e) => setFormData(prev => ({ ...prev, instructionAwareModelRef: e.target.value }))}
                          options={[
                            { value: '', label: 'Select LLM...' },
                            ...llmOptions,
                          ]}
                          hint="Fast model recommended"
                        />
                        <Input
                          label="Top N Results"
                          name="instructionAwareTopN"
                          type="number"
                          value={formData.instructionAwareTopN}
                          onChange={handleChange}
                          placeholder="10"
                          hint="Number of results after instruction reranking"
                        />
                      </div>
                      <Textarea
                        label="Reranking Instructions"
                        name="instructionAwareInstructions"
                        value={formData.instructionAwareInstructions}
                        onChange={handleChange}
                        placeholder="Prioritize results matching price and brand constraints."
                        rows={3}
                        hint="Custom instructions for constraint prioritization"
                      />
                    </div>
                  )}
                </div>

                {/* ── Query Router (nested under instructed) ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowRouterSection(!showRouterSection)}
                      className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors"
                    >
                      {showRouterSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <Route className="w-4 h-4 text-blue-400" />
                      Query Router
                      {formData.enableRouter && (
                        <Badge variant="info" className="ml-1">Enabled</Badge>
                      )}
                    </button>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="enableRouter"
                        checked={formData.enableRouter}
                        onChange={handleChange}
                        className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
                      />
                      <span className="text-slate-400">Enable</span>
                    </label>
                  </div>

                  {showRouterSection && formData.enableRouter && (
                    <div className="space-y-3 pl-4 border-l-2 border-blue-500/30">
                      <p className="text-xs text-slate-500">
                        Routes queries to standard or instructed execution mode based on query characteristics.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Select
                          label="Router Model"
                          value={formData.routerModelRef}
                          onChange={(e) => setFormData(prev => ({ ...prev, routerModelRef: e.target.value }))}
                          options={[
                            { value: '', label: 'Select LLM...' },
                            ...llmOptions,
                          ]}
                          hint="Fast model recommended"
                        />
                        <Select
                          label="Default Mode"
                          value={formData.routerDefaultMode}
                          onChange={(e) => setFormData(prev => ({ ...prev, routerDefaultMode: e.target.value as "standard" | "instructed" }))}
                          options={[
                            { value: 'standard', label: 'Standard' },
                            { value: 'instructed', label: 'Instructed' },
                          ]}
                          hint="Fallback if routing fails"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="routerAutoBypass"
                          checked={formData.routerAutoBypass}
                          onChange={handleChange}
                          className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
                        />
                        <span className="text-slate-400">Auto-bypass instruction reranker and verifier for standard mode</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* ── Result Verifier (nested under instructed) ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowVerifierSection(!showVerifierSection)}
                      className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors"
                    >
                      {showVerifierSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      Result Verifier
                      {formData.enableVerifier && (
                        <Badge variant="info" className="ml-1">Enabled</Badge>
                      )}
                    </button>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="enableVerifier"
                        checked={formData.enableVerifier}
                        onChange={handleChange}
                        className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
                      />
                      <span className="text-slate-400">Enable</span>
                    </label>
                  </div>

                  {showVerifierSection && formData.enableVerifier && (
                    <div className="space-y-3 pl-4 border-l-2 border-green-500/30">
                      <p className="text-xs text-slate-500">
                        Validates search results against user constraints with structured feedback for retry.
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        <Select
                          label="Verifier Model"
                          value={formData.verifierModelRef}
                          onChange={(e) => setFormData(prev => ({ ...prev, verifierModelRef: e.target.value }))}
                          options={[
                            { value: '', label: 'Select LLM...' },
                            ...llmOptions,
                          ]}
                          hint="Fast model recommended"
                        />
                        <Select
                          label="On Failure"
                          value={formData.verifierOnFailure}
                          onChange={(e) => setFormData(prev => ({ ...prev, verifierOnFailure: e.target.value as "warn" | "retry" | "warn_and_retry" }))}
                          options={[
                            { value: 'warn', label: 'Warn' },
                            { value: 'retry', label: 'Retry' },
                            { value: 'warn_and_retry', label: 'Warn & Retry' },
                          ]}
                          hint="Behavior when verification fails"
                        />
                        <Input
                          label="Max Retries"
                          name="verifierMaxRetries"
                          type="number"
                          value={formData.verifierMaxRetries}
                          onChange={handleChange}
                          placeholder="1"
                          hint="Retry attempts before warning"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Standard Reranking ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowRerankSection(!showRerankSection)}
                className="flex items-center gap-2 text-sm font-medium text-slate-300 border-b border-slate-700 pb-2 flex-1 hover:text-slate-100 transition-colors"
              >
                {showRerankSection ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <ArrowUpDown className="w-4 h-4 text-slate-400" />
                Standard Reranking
                {formData.enableRerank && (
                  <Badge variant="success" className="ml-2">Enabled</Badge>
                )}
              </button>
              <label className="flex items-center gap-2 text-sm border-b border-slate-700 pb-2 pl-3">
                <input
                  type="checkbox"
                  name="enableRerank"
                  checked={formData.enableRerank}
                  onChange={handleChange}
                  className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
                />
                <span className="text-slate-400">Enable</span>
              </label>
            </div>
            
            {showRerankSection && formData.enableRerank && (
              <div className="space-y-4 pl-4 border-l-2 border-slate-600">
                {/* Mode selector */}
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="rerankMode"
                      value="default"
                      checked={formData.rerankMode === 'default'}
                      onChange={() => setFormData(prev => ({ ...prev, rerankMode: 'default' }))}
                      className="text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-300">Use defaults</span>
                    <span className="text-xs text-slate-500">(rerank: true)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="rerankMode"
                      value="custom"
                      checked={formData.rerankMode === 'custom'}
                      onChange={() => setFormData(prev => ({ ...prev, rerankMode: 'custom' }))}
                      className="text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-300">Custom configuration</span>
                  </label>
                </div>

                {formData.rerankMode === 'default' ? (
                  <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/50 text-sm text-slate-400">
                    Uses FlashRank with default settings (ms-marco-MiniLM-L-12-v2 model).
                    Switch to custom configuration for advanced options.
                  </div>
                ) : (
                  <>
                <p className="text-xs text-slate-500 mb-3">
                  Choose between FlashRank (local cross-encoder) and/or Databricks server-side column reranking.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="FlashRank Model (Local)"
                    value={formData.rerankModel}
                    onChange={(e) => setFormData(prev => ({ ...prev, rerankModel: e.target.value }))}
                    options={RERANK_MODELS}
                    hint="Cross-encoder model for semantic reranking"
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
                
                {/* Rerank Columns - Databricks server-side reranking */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">
                    Databricks Columns (Server-side Reranking)
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    Select columns for Databricks server-side reranking. Can be used with or without FlashRank.
                  </p>
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
                  {formData.rerankColumns && (
                    <p className="text-xs text-slate-400">
                      Selected: {formData.rerankColumns}
                    </p>
                  )}
                </div>
                
                <Input
                  label="Cache Directory"
                  name="rerankCacheDir"
                  value={formData.rerankCacheDir}
                  onChange={handleChange}
                  placeholder="~/.dao_ai/cache/flashrank"
                  hint="Directory to cache downloaded model weights"
                />
                  </>
                )}
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

