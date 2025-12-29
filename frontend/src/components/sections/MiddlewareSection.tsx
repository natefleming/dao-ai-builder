import { useState, ChangeEvent } from 'react';
import { Plus, Trash2, Layers, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { MiddlewareModel } from '@/types/dao-ai-types';
import { normalizeRefNameWhileTyping } from '@/utils/name-utils';
import { safeDelete } from '@/utils/safe-delete';
import { useYamlScrollStore } from '@/stores/yamlScrollStore';
import { getYamlReferences } from '@/utils/yaml-references';

// Preconfigured middleware from dao_ai.middleware
const PRECONFIGURED_MIDDLEWARE = [
  {
    value: 'dao_ai.middleware.create_guardrail_middleware',
    label: 'Guardrail Middleware',
    description: 'LLM-based guardrail validation with retry logic',
    category: 'Guardrails',
  },
  {
    value: 'dao_ai.middleware.create_content_filter_middleware',
    label: 'Content Filter',
    description: 'Deterministic keyword-based content blocking',
    category: 'Guardrails',
  },
  {
    value: 'dao_ai.middleware.create_safety_guardrail_middleware',
    label: 'Safety Guardrail',
    description: 'Safety-focused response evaluation',
    category: 'Guardrails',
  },
  {
    value: 'dao_ai.middleware.create_user_id_validation_middleware',
    label: 'User ID Validation',
    description: 'Ensure user_id is present in context',
    category: 'Validation',
  },
  {
    value: 'dao_ai.middleware.create_thread_id_validation_middleware',
    label: 'Thread ID Validation',
    description: 'Ensure thread_id is present in context',
    category: 'Validation',
  },
  {
    value: 'dao_ai.middleware.create_custom_field_validation_middleware',
    label: 'Custom Field Validation',
    description: 'Validate custom required fields',
    category: 'Validation',
  },
  {
    value: 'dao_ai.middleware.create_filter_last_human_message_middleware',
    label: 'Filter Last Human Message',
    description: 'Keep only the last human message',
    category: 'Validation',
  },
  {
    value: 'dao_ai.middleware.create_summarization_middleware',
    label: 'Summarization',
    description: 'Summarize chat history when limits exceeded',
    category: 'Processing',
  },
  {
    value: 'dao_ai.middleware.create_human_in_the_loop_middleware',
    label: 'Human-in-the-Loop',
    description: 'Require human approval for tool execution',
    category: 'Human Approval',
  },
  {
    value: 'dao_ai.middleware.create_assert_middleware',
    label: 'Assert (DSPy)',
    description: 'Assert constraints with retry on failure',
    category: 'Assertions',
  },
  {
    value: 'dao_ai.middleware.create_suggest_middleware',
    label: 'Suggest (DSPy)',
    description: 'Provide suggestions when constraints fail',
    category: 'Assertions',
  },
  {
    value: 'dao_ai.middleware.create_refine_middleware',
    label: 'Refine (DSPy)',
    description: 'Iteratively refine outputs to meet constraints',
    category: 'Assertions',
  },
  {
    value: 'custom',
    label: 'Custom Factory...',
    description: 'Custom middleware factory function',
    category: 'Custom',
  },
];

// Group middleware by category
const MIDDLEWARE_CATEGORIES = Array.from(
  new Set(PRECONFIGURED_MIDDLEWARE.map(m => m.category))
);

interface CustomFieldEntry {
  id: string;
  name: string;
  description: string;
  required: boolean;
  exampleValue: string;
}

interface InterruptToolEntry {
  id: string;
  toolName: string;
  reviewPrompt: string;
  allowedDecisions: string[]; // approve, edit, reject
}

interface MiddlewareFormData {
  refName: string;
  selectedFactory: string;
  customFactory: string;
  
  // Guardrail parameters
  guardrailName: string;
  guardrailModel: string; // LLM ref key
  guardrailPrompt: string;
  guardrailRetries: number;
  
  // Content filter parameters
  bannedKeywords: string[]; // Array of keywords
  blockMessage: string;
  
  // Safety guardrail parameters
  safetyModel: string; // Optional LLM ref key
  
  // Custom field validation parameters
  customFields: CustomFieldEntry[];
  
  // Summarization parameters
  summaryModel: string; // LLM ref key
  summaryMaxTokens: number;
  summaryMaxTokensBefore: number;
  summaryMaxMessagesBefore: number;
  summaryUsesTokens: boolean; // true = tokens, false = messages
  
  // HITL parameters
  hitlInterruptTools: InterruptToolEntry[];
  hitlDescriptionPrefix: string;
  
  // Assert/Suggest/Refine common params
  assertConstraint: string; // Python reference
  assertMaxRetries: number;
  assertOnFailure: 'error' | 'warn' | 'ignore';
  assertFallbackMessage: string;
  assertMiddlewareName: string;
  
  suggestConstraint: string;
  suggestMaxRetries: number;
  suggestModel: string; // Optional LLM ref
  suggestMiddlewareName: string;
  
  refineConstraint: string;
  refineMaxIterations: number;
  refineModel: string; // Optional LLM ref
  refineMiddlewareName: string;
  
  // Generic args (only for custom)
  genericArgs: Record<string, any>;
}

const defaultFormData: MiddlewareFormData = {
  refName: '',
  selectedFactory: '',
  customFactory: '',
  guardrailName: '',
  guardrailModel: '',
  guardrailPrompt: '',
  guardrailRetries: 3,
  bannedKeywords: [],
  blockMessage: 'I cannot provide that response. Please rephrase your request.',
  safetyModel: '',
  customFields: [],
  summaryModel: '',
  summaryMaxTokens: 2048,
  summaryMaxTokensBefore: 20480,
  summaryMaxMessagesBefore: 10,
  summaryUsesTokens: true,
  hitlInterruptTools: [],
  hitlDescriptionPrefix: '',
  assertConstraint: '',
  assertMaxRetries: 3,
  assertOnFailure: 'error',
  assertFallbackMessage: 'Unable to generate a valid response.',
  assertMiddlewareName: '',
  suggestConstraint: '',
  suggestMaxRetries: 3,
  suggestModel: '',
  suggestMiddlewareName: '',
  refineConstraint: '',
  refineMaxIterations: 3,
  refineModel: '',
  refineMiddlewareName: '',
  genericArgs: {},
};

export default function MiddlewareSection() {
  const { config, addMiddleware, removeMiddleware, updateMiddleware } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMiddleware, setEditingMiddleware] = useState<string | null>(null);
  const [expandedMiddleware, setExpandedMiddleware] = useState<string | null>(null);
  const { scrollToSection } = useYamlScrollStore();
  const [formData, setFormData] = useState<MiddlewareFormData>(defaultFormData);

  const middleware = config.middleware || {};
  const llms = config.resources?.llms || {};
  const llmOptions = [
    { value: '', label: 'Select LLM...' },
    ...Object.keys(llms).map(key => ({ value: key, label: key })),
  ];

  const handleAdd = () => {
    setEditingMiddleware(null);
    setFormData(defaultFormData);
    setIsModalOpen(true);
  };

  const parseMiddlewareArgs = (mw: MiddlewareModel): Partial<MiddlewareFormData> => {
    const parsed: Partial<MiddlewareFormData> = {};
    const args = mw.args || {};
    
    // Guardrail middleware
    if (mw.name === 'dao_ai.middleware.create_guardrail_middleware') {
      parsed.guardrailName = args.name || '';
      parsed.guardrailModel = typeof args.model === 'string' && args.model.startsWith('*') 
        ? args.model.substring(1) 
        : '';
      parsed.guardrailPrompt = args.prompt || '';
      parsed.guardrailRetries = args.num_retries || 3;
    }
    
    // Content filter
    if (mw.name === 'dao_ai.middleware.create_content_filter_middleware') {
      parsed.bannedKeywords = Array.isArray(args.banned_keywords) ? args.banned_keywords : [];
      parsed.blockMessage = args.block_message || defaultFormData.blockMessage;
    }
    
    // Safety guardrail
    if (mw.name === 'dao_ai.middleware.create_safety_guardrail_middleware') {
      parsed.safetyModel = typeof args.safety_model === 'string' && args.safety_model.startsWith('*')
        ? args.safety_model.substring(1)
        : '';
    }
    
    // Custom field validation
    if (mw.name === 'dao_ai.middleware.create_custom_field_validation_middleware') {
      parsed.customFields = Array.isArray(args.fields) 
        ? args.fields.map((f: any, idx: number) => ({
            id: `field_${idx}`,
            name: f.name || '',
            description: f.description || '',
            required: f.required !== false,
            exampleValue: f.example_value || '',
          }))
        : [];
    }
    
    // Summarization
    if (mw.name === 'dao_ai.middleware.create_summarization_middleware') {
      const chatHistory = args.chat_history || {};
      const model = chatHistory.model || '';
      parsed.summaryModel = typeof model === 'string' && model.startsWith('*') 
        ? model.substring(1) 
        : '';
      parsed.summaryMaxTokens = chatHistory.max_tokens || 2048;
      parsed.summaryUsesTokens = !!chatHistory.max_tokens_before_summary;
      parsed.summaryMaxTokensBefore = chatHistory.max_tokens_before_summary || 20480;
      parsed.summaryMaxMessagesBefore = chatHistory.max_messages_before_summary || 10;
    }
    
    // HITL
    if (mw.name === 'dao_ai.middleware.create_human_in_the_loop_middleware') {
      const interruptOn = args.interrupt_on || {};
      parsed.hitlInterruptTools = Object.entries(interruptOn).map(([toolName, config]: [string, any], idx) => ({
        id: `tool_${idx}`,
        toolName,
        reviewPrompt: config.review_prompt || '',
        allowedDecisions: config.allowed_decisions || ['approve', 'edit', 'reject'],
      }));
      parsed.hitlDescriptionPrefix = args.description_prefix || '';
    }
    
    // Assert
    if (mw.name === 'dao_ai.middleware.create_assert_middleware') {
      parsed.assertConstraint = args.constraint || '';
      parsed.assertMaxRetries = args.max_retries || 3;
      parsed.assertOnFailure = args.on_failure || 'error';
      parsed.assertFallbackMessage = args.fallback_message || defaultFormData.assertFallbackMessage;
      parsed.assertMiddlewareName = args.name || '';
    }
    
    // Suggest
    if (mw.name === 'dao_ai.middleware.create_suggest_middleware') {
      parsed.suggestConstraint = args.constraint || '';
      parsed.suggestMaxRetries = args.max_retries || 3;
      parsed.suggestModel = typeof args.suggestion_model === 'string' && args.suggestion_model.startsWith('*')
        ? args.suggestion_model.substring(1)
        : '';
      parsed.suggestMiddlewareName = args.name || '';
    }
    
    // Refine
    if (mw.name === 'dao_ai.middleware.create_refine_middleware') {
      parsed.refineConstraint = args.constraint || '';
      parsed.refineMaxIterations = args.max_iterations || 3;
      parsed.refineModel = typeof args.refine_model === 'string' && args.refine_model.startsWith('*')
        ? args.refine_model.substring(1)
        : '';
      parsed.refineMiddlewareName = args.name || '';
    }
    
    // Custom - generic args
    if (mw.name === 'custom' || !PRECONFIGURED_MIDDLEWARE.find(pm => pm.value === mw.name)) {
      parsed.genericArgs = args;
    }
    
    return parsed;
  };

  const handleEdit = (key: string) => {
    const mw = middleware[key];
    setEditingMiddleware(key);
    
    const preconfigured = PRECONFIGURED_MIDDLEWARE.find(pm => pm.value === mw.name && pm.value !== 'custom');
    const parsedArgs = parseMiddlewareArgs(mw);
    
    setFormData({
      ...defaultFormData,
      ...parsedArgs,
      refName: key,
      selectedFactory: preconfigured ? mw.name : 'custom',
      customFactory: preconfigured ? '' : mw.name,
    });
    setIsModalOpen(true);
  };

  const buildMiddlewareArgs = (): Record<string, any> | undefined => {
    const factory = formData.selectedFactory;
    
    if (factory === 'dao_ai.middleware.create_guardrail_middleware') {
      return {
        name: formData.guardrailName,
        model: formData.guardrailModel ? `*${formData.guardrailModel}` : undefined,
        prompt: formData.guardrailPrompt,
        num_retries: formData.guardrailRetries,
      };
    }
    
    if (factory === 'dao_ai.middleware.create_content_filter_middleware') {
      return {
        banned_keywords: formData.bannedKeywords,
        block_message: formData.blockMessage,
      };
    }
    
    if (factory === 'dao_ai.middleware.create_safety_guardrail_middleware') {
      return formData.safetyModel ? { safety_model: `*${formData.safetyModel}` } : undefined;
    }
    
    if (factory === 'dao_ai.middleware.create_user_id_validation_middleware') {
      return undefined; // No args
    }
    
    if (factory === 'dao_ai.middleware.create_thread_id_validation_middleware') {
      return undefined; // No args
    }
    
    if (factory === 'dao_ai.middleware.create_custom_field_validation_middleware') {
      return {
        fields: formData.customFields.map(f => ({
          name: f.name,
          ...(f.description && { description: f.description }),
          required: f.required,
          ...(f.exampleValue && { example_value: f.exampleValue }),
        })),
      };
    }
    
    if (factory === 'dao_ai.middleware.create_filter_last_human_message_middleware') {
      return undefined; // No args
    }
    
    if (factory === 'dao_ai.middleware.create_summarization_middleware') {
      const chatHistory: any = {
        model: formData.summaryModel ? `*${formData.summaryModel}` : undefined,
        max_tokens: formData.summaryMaxTokens,
      };
      
      if (formData.summaryUsesTokens) {
        chatHistory.max_tokens_before_summary = formData.summaryMaxTokensBefore;
      } else {
        chatHistory.max_messages_before_summary = formData.summaryMaxMessagesBefore;
      }
      
      return { chat_history: chatHistory };
    }
    
    if (factory === 'dao_ai.middleware.create_human_in_the_loop_middleware') {
      const interruptOn: Record<string, any> = {};
      formData.hitlInterruptTools.forEach(tool => {
        interruptOn[tool.toolName] = {
          ...(tool.reviewPrompt && { review_prompt: tool.reviewPrompt }),
          allowed_decisions: tool.allowedDecisions,
        };
      });
      
      return {
        interrupt_on: interruptOn,
        ...(formData.hitlDescriptionPrefix && { description_prefix: formData.hitlDescriptionPrefix }),
      };
    }
    
    if (factory === 'dao_ai.middleware.create_assert_middleware') {
      return {
        constraint: formData.assertConstraint,
        max_retries: formData.assertMaxRetries,
        on_failure: formData.assertOnFailure,
        fallback_message: formData.assertFallbackMessage,
        ...(formData.assertMiddlewareName && { name: formData.assertMiddlewareName }),
      };
    }
    
    if (factory === 'dao_ai.middleware.create_suggest_middleware') {
      return {
        constraint: formData.suggestConstraint,
        max_retries: formData.suggestMaxRetries,
        ...(formData.suggestModel && { suggestion_model: `*${formData.suggestModel}` }),
        ...(formData.suggestMiddlewareName && { name: formData.suggestMiddlewareName }),
      };
    }
    
    if (factory === 'dao_ai.middleware.create_refine_middleware') {
      return {
        constraint: formData.refineConstraint,
        max_iterations: formData.refineMaxIterations,
        ...(formData.refineModel && { refine_model: `*${formData.refineModel}` }),
        ...(formData.refineMiddlewareName && { name: formData.refineMiddlewareName }),
      };
    }
    
    // Custom - generic args
    return Object.keys(formData.genericArgs).length > 0 ? formData.genericArgs : undefined;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.refName) return;
    
    const factoryName = formData.selectedFactory === 'custom' 
      ? formData.customFactory 
      : formData.selectedFactory;
    
    if (!factoryName) return;

    const args = buildMiddlewareArgs();
    const middlewareData: MiddlewareModel = {
      name: factoryName,
      ...(args && { args }),
    };

    if (editingMiddleware && editingMiddleware !== formData.refName) {
      removeMiddleware(editingMiddleware);
      addMiddleware(formData.refName, middlewareData);
    } else if (editingMiddleware) {
      updateMiddleware(formData.refName, middlewareData);
    } else {
      addMiddleware(formData.refName, middlewareData);
    }
    
    setIsModalOpen(false);
  };

  const handleCardClick = (key: string) => {
    scrollToSection(`middleware.${key}`);
  };

  const toggleExpanded = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedMiddleware(expandedMiddleware === key ? null : key);
  };

  const getMiddlewareInfo = (name: string) => {
    return PRECONFIGURED_MIDDLEWARE.find(pm => pm.value === name);
  };

  const getReferences = (key: string) => {
    return getYamlReferences(config, `middleware.${key}`);
  };

  const selectedMiddlewareInfo = PRECONFIGURED_MIDDLEWARE.find(
    m => m.value === formData.selectedFactory
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Middleware</h2>
          <p className="text-slate-400 mt-1">
            Configure reusable middleware to customize agent behavior
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="w-4 h-4" />
          Add Middleware
        </Button>
      </div>

      {/* Middleware List */}
      {Object.keys(middleware).length === 0 ? (
        <Card className="text-center py-12">
          <Layers className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">No middleware configured</h3>
          <p className="text-slate-500 mb-4">
            Middleware allows you to customize agent behavior at different stages of execution.
          </p>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4" />
            Add Your First Middleware
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {MIDDLEWARE_CATEGORIES.map(category => {
            // Filter middleware by category
            const categoryMiddleware = Object.entries(middleware).filter(([, mw]) => {
              const info = getMiddlewareInfo(mw.name);
              return info?.category === category;
            });
            
            if (categoryMiddleware.length === 0) return null;
            
            return (
              <div key={category}>
                <div className="flex items-center space-x-3 mb-3">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                    {category}
                  </h3>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {categoryMiddleware.map(([key, mw]) => {
                    const info = getMiddlewareInfo(mw.name);
                    const refs = getReferences(key);
                    const isExpanded = expandedMiddleware === key;
                    
                    return (
                      <Card 
                        key={key} 
                        variant="interactive"
                        className="group cursor-pointer"
                        onClick={() => handleCardClick(key)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                              <Layers className="w-5 h-5 text-purple-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 flex-wrap">
                                <p className="font-medium text-slate-200 truncate">{key}</p>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5 truncate">
                                {info?.label || 'Custom Factory'}
                              </p>
                              {refs.length > 0 && (
                                <Badge variant="warning" className="text-xs mt-1 inline-block">
                                  {refs.length} reference{refs.length !== 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                            {mw.args && Object.keys(mw.args).length > 0 && (
                              <button
                                onClick={(e) => toggleExpanded(key, e)}
                                className="p-1.5 text-slate-400 hover:text-slate-300 transition-colors"
                                title={isExpanded ? "Collapse" : "Expand"}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                handleEdit(key);
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                safeDelete('Middleware', key, () => removeMiddleware(key), refs);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {isExpanded && mw.args && Object.keys(mw.args).length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-700">
                            <p className="text-xs font-medium text-slate-400 mb-2">Parameters:</p>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {Object.entries(mw.args).map(([argKey, argValue]) => (
                                <div key={argKey} className="flex items-start space-x-2 text-xs">
                                  <span className="text-slate-500 font-mono">{argKey}:</span>
                                  <span className="text-slate-300 font-mono flex-1 break-all">
                                    {typeof argValue === 'object' ? JSON.stringify(argValue) : String(argValue)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Middleware Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingMiddleware ? 'Edit Middleware' : 'Add Middleware'}
        description="Configure middleware to customize agent execution behavior"
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Reference Name"
            placeholder="e.g., my_guardrail_middleware"
            value={formData.refName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setFormData({ ...formData, refName: normalizeRefNameWhileTyping(e.target.value) });
            }}
            hint="Unique identifier for this middleware (used in YAML anchors)"
            required
          />

          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-300">Middleware Type</label>
            
            {MIDDLEWARE_CATEGORIES.map(category => {
              const categoryMiddleware = PRECONFIGURED_MIDDLEWARE.filter(m => m.category === category);
              return (
                <div key={category} className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-slate-700 to-transparent"></div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">
                      {category}
                    </h4>
                    <div className="h-px flex-1 bg-gradient-to-l from-slate-700 to-transparent"></div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {categoryMiddleware.map((mw) => (
                      <button
                        key={mw.value}
                        type="button"
                        onClick={() => setFormData({ 
                          ...defaultFormData,
                          refName: formData.refName,
                          selectedFactory: mw.value,
                        })}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          formData.selectedFactory === mw.value
                            ? 'bg-purple-500/20 border-purple-500/50 ring-1 ring-purple-500/30'
                            : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white truncate">{mw.label}</p>
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{mw.description}</p>
                          </div>
                          {formData.selectedFactory === mw.value && (
                            <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {formData.selectedFactory === 'custom' && (
            <Input
              label="Custom Factory Function"
              placeholder="e.g., my_module.create_custom_middleware"
              value={formData.customFactory}
              onChange={(e: ChangeEvent<HTMLInputElement>) => 
                setFormData({ ...formData, customFactory: e.target.value })
              }
              hint="Fully qualified name of the factory function"
              required
            />
          )}

          {/* Parameter forms for each middleware type */}
          {selectedMiddlewareInfo && formData.selectedFactory !== 'custom' && (
            <div className="space-y-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <h3 className="text-sm font-medium text-slate-300">Parameters</h3>
              
              {/* Guardrail Middleware */}
              {formData.selectedFactory === 'dao_ai.middleware.create_guardrail_middleware' && (
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Guardrail Name"
                    value={formData.guardrailName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, guardrailName: e.target.value })
                    }
                    placeholder="e.g., tone_check"
                    required
                    hint="Name identifying this guardrail"
                  />
                  <Select
                    label="Model"
                    options={llmOptions}
                    value={formData.guardrailModel}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, guardrailModel: e.target.value })
                    }
                    required
                    hint="LLM to use for evaluation"
                  />
                  <div className="col-span-2">
                    <Textarea
                      label="Evaluation Prompt"
                      value={formData.guardrailPrompt}
                      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => 
                        setFormData({ ...formData, guardrailPrompt: e.target.value })
                      }
                      placeholder="e.g., Evaluate if the response is professional and helpful."
                      rows={3}
                      required
                      hint="Criteria for evaluating responses"
                    />
                  </div>
                  <Input
                    label="Max Retries"
                    type="number"
                    value={formData.guardrailRetries}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, guardrailRetries: parseInt(e.target.value) || 3 })
                    }
                    hint="Maximum retry attempts"
                  />
                </div>
              )}
              
              {/* Content Filter */}
              {formData.selectedFactory === 'dao_ai.middleware.create_content_filter_middleware' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Banned Keywords</label>
                    <div className="space-y-2">
                      {formData.bannedKeywords.map((keyword, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <Input
                            value={keyword}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                              const newKeywords = [...formData.bannedKeywords];
                              newKeywords[idx] = e.target.value;
                              setFormData({ ...formData, bannedKeywords: newKeywords });
                            }}
                            placeholder="e.g., password"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              const newKeywords = formData.bannedKeywords.filter((_, i) => i !== idx);
                              setFormData({ ...formData, bannedKeywords: newKeywords });
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setFormData({ ...formData, bannedKeywords: [...formData.bannedKeywords, ''] });
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Keyword
                      </Button>
                    </div>
                  </div>
                  <Input
                    label="Block Message"
                    value={formData.blockMessage}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, blockMessage: e.target.value })
                    }
                    placeholder="Message to return when content is blocked"
                  />
                </div>
              )}
              
              {/* Safety Guardrail */}
              {formData.selectedFactory === 'dao_ai.middleware.create_safety_guardrail_middleware' && (
                <Select
                  label="Safety Model (Optional)"
                  options={llmOptions}
                  value={formData.safetyModel}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                    setFormData({ ...formData, safetyModel: e.target.value })
                  }
                  hint="LLM for safety evaluation (optional)"
                />
              )}
              
              {/* User ID / Thread ID Validation - No params */}
              {(formData.selectedFactory === 'dao_ai.middleware.create_user_id_validation_middleware' ||
                formData.selectedFactory === 'dao_ai.middleware.create_thread_id_validation_middleware' ||
                formData.selectedFactory === 'dao_ai.middleware.create_filter_last_human_message_middleware') && (
                <p className="text-sm text-slate-400">This middleware requires no parameters.</p>
              )}
              
              {/* Custom Field Validation */}
              {formData.selectedFactory === 'dao_ai.middleware.create_custom_field_validation_middleware' && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-300">Required Fields</label>
                  {formData.customFields.map((field, idx) => (
                    <div key={field.id} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 space-y-2">
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="Field Name"
                          value={field.name}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            const newFields = [...formData.customFields];
                            newFields[idx] = { ...field, name: e.target.value };
                            setFormData({ ...formData, customFields: newFields });
                          }}
                          placeholder="e.g., store_num"
                          required
                        />
                        <Input
                          label="Description"
                          value={field.description}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            const newFields = [...formData.customFields];
                            newFields[idx] = { ...field, description: e.target.value };
                            setFormData({ ...formData, customFields: newFields });
                          }}
                          placeholder="e.g., Store number"
                        />
                        <Input
                          label="Example Value (Optional)"
                          value={field.exampleValue}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            const newFields = [...formData.customFields];
                            newFields[idx] = { ...field, exampleValue: e.target.value };
                            setFormData({ ...formData, customFields: newFields });
                          }}
                          placeholder="e.g., 12345"
                        />
                        <div className="flex items-center space-x-4">
                          <label className="flex items-center space-x-2 text-sm text-slate-300">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => {
                                const newFields = [...formData.customFields];
                                newFields[idx] = { ...field, required: e.target.checked };
                                setFormData({ ...formData, customFields: newFields });
                              }}
                              className="rounded border-slate-600 bg-slate-700"
                            />
                            <span>Required</span>
                          </label>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              const newFields = formData.customFields.filter(f => f.id !== field.id);
                              setFormData({ ...formData, customFields: newFields });
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const newField: CustomFieldEntry = {
                        id: `field_${Date.now()}`,
                        name: '',
                        description: '',
                        required: true,
                        exampleValue: '',
                      };
                      setFormData({ ...formData, customFields: [...formData.customFields, newField] });
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Field
                  </Button>
                </div>
              )}
              
              {/* Summarization */}
              {formData.selectedFactory === 'dao_ai.middleware.create_summarization_middleware' && (
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Summary Model"
                    options={llmOptions}
                    value={formData.summaryModel}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, summaryModel: e.target.value })
                    }
                    required
                    hint="LLM for chat history summarization"
                  />
                  <Input
                    label="Max Summary Tokens"
                    type="number"
                    value={formData.summaryMaxTokens}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, summaryMaxTokens: parseInt(e.target.value) || 2048 })
                    }
                    hint="Max tokens for the summary"
                  />
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Trigger Threshold</label>
                    <div className="flex items-center space-x-4 mb-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          checked={formData.summaryUsesTokens}
                          onChange={() => setFormData({ ...formData, summaryUsesTokens: true })}
                          className="text-purple-500"
                        />
                        <span className="text-sm text-slate-300">By Tokens</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          checked={!formData.summaryUsesTokens}
                          onChange={() => setFormData({ ...formData, summaryUsesTokens: false })}
                          className="text-purple-500"
                        />
                        <span className="text-sm text-slate-300">By Messages</span>
                      </label>
                    </div>
                    {formData.summaryUsesTokens ? (
                      <Input
                        label="Max Tokens Before Summary"
                        type="number"
                        value={formData.summaryMaxTokensBefore}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => 
                          setFormData({ ...formData, summaryMaxTokensBefore: parseInt(e.target.value) || 20480 })
                        }
                        hint="Trigger when history exceeds this token count"
                      />
                    ) : (
                      <Input
                        label="Max Messages Before Summary"
                        type="number"
                        value={formData.summaryMaxMessagesBefore}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => 
                          setFormData({ ...formData, summaryMaxMessagesBefore: parseInt(e.target.value) || 10 })
                        }
                        hint="Trigger when history exceeds this message count"
                      />
                    )}
                  </div>
                </div>
              )}
              
              {/* Human-in-the-Loop */}
              {formData.selectedFactory === 'dao_ai.middleware.create_human_in_the_loop_middleware' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Interrupt Tools</label>
                    {formData.hitlInterruptTools.map((tool, idx) => (
                      <div key={tool.id} className="p-3 mb-2 bg-slate-900/50 rounded-lg border border-slate-700 space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            label="Tool Name"
                            value={tool.toolName}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                              const newTools = [...formData.hitlInterruptTools];
                              newTools[idx] = { ...tool, toolName: e.target.value };
                              setFormData({ ...formData, hitlInterruptTools: newTools });
                            }}
                            placeholder="e.g., search_tool"
                            required
                          />
                          <Input
                            label="Review Prompt (Optional)"
                            value={tool.reviewPrompt}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                              const newTools = [...formData.hitlInterruptTools];
                              newTools[idx] = { ...tool, reviewPrompt: e.target.value };
                              setFormData({ ...formData, hitlInterruptTools: newTools });
                            }}
                            placeholder="e.g., Approve search?"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            {['approve', 'edit', 'reject'].map((decision) => (
                              <label key={decision} className="flex items-center space-x-2 text-sm text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={tool.allowedDecisions.includes(decision)}
                                  onChange={(e) => {
                                    const newTools = [...formData.hitlInterruptTools];
                                    const decisions = e.target.checked
                                      ? [...tool.allowedDecisions, decision]
                                      : tool.allowedDecisions.filter(d => d !== decision);
                                    newTools[idx] = { ...tool, allowedDecisions: decisions };
                                    setFormData({ ...formData, hitlInterruptTools: newTools });
                                  }}
                                  className="rounded border-slate-600 bg-slate-700"
                                />
                                <span className="capitalize">{decision}</span>
                              </label>
                            ))}
                          </div>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              const newTools = formData.hitlInterruptTools.filter(t => t.id !== tool.id);
                              setFormData({ ...formData, hitlInterruptTools: newTools });
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const newTool: InterruptToolEntry = {
                          id: `tool_${Date.now()}`,
                          toolName: '',
                          reviewPrompt: '',
                          allowedDecisions: ['approve', 'edit', 'reject'],
                        };
                        setFormData({ ...formData, hitlInterruptTools: [...formData.hitlInterruptTools, newTool] });
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Tool
                    </Button>
                  </div>
                  <Input
                    label="Description Prefix (Optional)"
                    value={formData.hitlDescriptionPrefix}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, hitlDescriptionPrefix: e.target.value })
                    }
                    placeholder="Prefix for interrupt descriptions"
                  />
                </div>
              )}
              
              {/* Assert Middleware */}
              {formData.selectedFactory === 'dao_ai.middleware.create_assert_middleware' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Input
                      label="Constraint"
                      value={formData.assertConstraint}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, assertConstraint: e.target.value })
                      }
                      placeholder="e.g., my_module.MyConstraint"
                      required
                      hint="Python reference to constraint (class or callable)"
                    />
                  </div>
                  <Input
                    label="Max Retries"
                    type="number"
                    value={formData.assertMaxRetries}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, assertMaxRetries: parseInt(e.target.value) || 3 })
                    }
                  />
                  <Select
                    label="On Failure"
                    options={[
                      { value: 'error', label: 'Error' },
                      { value: 'warn', label: 'Warn' },
                      { value: 'ignore', label: 'Ignore' },
                    ]}
                    value={formData.assertOnFailure}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, assertOnFailure: e.target.value as 'error' | 'warn' | 'ignore' })
                    }
                  />
                  <div className="col-span-2">
                    <Input
                      label="Fallback Message"
                      value={formData.assertFallbackMessage}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, assertFallbackMessage: e.target.value })
                      }
                      placeholder="Message on complete failure"
                    />
                  </div>
                  <Input
                    label="Middleware Name (Optional)"
                    value={formData.assertMiddlewareName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, assertMiddlewareName: e.target.value })
                    }
                    placeholder="Optional custom name"
                  />
                </div>
              )}
              
              {/* Suggest Middleware */}
              {formData.selectedFactory === 'dao_ai.middleware.create_suggest_middleware' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Input
                      label="Constraint"
                      value={formData.suggestConstraint}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, suggestConstraint: e.target.value })
                      }
                      placeholder="e.g., my_module.MyConstraint"
                      required
                      hint="Python reference to constraint"
                    />
                  </div>
                  <Input
                    label="Max Retries"
                    type="number"
                    value={formData.suggestMaxRetries}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, suggestMaxRetries: parseInt(e.target.value) || 3 })
                    }
                  />
                  <Select
                    label="Suggestion Model (Optional)"
                    options={llmOptions}
                    value={formData.suggestModel}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, suggestModel: e.target.value })
                    }
                    hint="LLM for generating suggestions"
                  />
                  <Input
                    label="Middleware Name (Optional)"
                    value={formData.suggestMiddlewareName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, suggestMiddlewareName: e.target.value })
                    }
                    placeholder="Optional custom name"
                  />
                </div>
              )}
              
              {/* Refine Middleware */}
              {formData.selectedFactory === 'dao_ai.middleware.create_refine_middleware' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Input
                      label="Constraint"
                      value={formData.refineConstraint}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, refineConstraint: e.target.value })
                      }
                      placeholder="e.g., my_module.MyConstraint"
                      required
                      hint="Python reference to constraint"
                    />
                  </div>
                  <Input
                    label="Max Iterations"
                    type="number"
                    value={formData.refineMaxIterations}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, refineMaxIterations: parseInt(e.target.value) || 3 })
                    }
                  />
                  <Select
                    label="Refine Model (Optional)"
                    options={llmOptions}
                    value={formData.refineModel}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, refineModel: e.target.value })
                    }
                    hint="LLM for refinement"
                  />
                  <Input
                    label="Middleware Name (Optional)"
                    value={formData.refineMiddlewareName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, refineMiddlewareName: e.target.value })
                    }
                    placeholder="Optional custom name"
                  />
                </div>
              )}
            </div>
          )}

          {/* Generic arguments for custom middleware */}
          {formData.selectedFactory === 'custom' && (
            <div className="space-y-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-300">Arguments</label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const newKey = `arg_${Object.keys(formData.genericArgs).length + 1}`;
                    setFormData({ ...formData, genericArgs: { ...formData.genericArgs, [newKey]: '' } });
                  }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Argument
                </Button>
              </div>
              
              {Object.keys(formData.genericArgs).length === 0 ? (
                <p className="text-xs text-slate-500">
                  No arguments. Click "Add Argument" to pass parameters to the factory function.
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(formData.genericArgs).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-3 gap-2">
                      <Input
                        placeholder="Key"
                        value={key}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const newKey = e.target.value;
                          if (newKey !== key) {
                            const newArgs = { ...formData.genericArgs };
                            newArgs[newKey] = newArgs[key];
                            delete newArgs[key];
                            setFormData({ ...formData, genericArgs: newArgs });
                          }
                        }}
                      />
                      <Input
                        placeholder="Value"
                        value={typeof value === 'string' ? value : JSON.stringify(value)}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => 
                          setFormData({ 
                            ...formData, 
                            genericArgs: { ...formData.genericArgs, [key]: e.target.value } 
                          })
                        }
                        className="col-span-2"
                      />
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          const newArgs = { ...formData.genericArgs };
                          delete newArgs[key];
                          setFormData({ ...formData, genericArgs: newArgs });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {editingMiddleware ? 'Save Changes' : 'Add Middleware'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
