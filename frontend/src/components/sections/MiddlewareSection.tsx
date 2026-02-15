import { useState, ChangeEvent } from 'react';
import { Plus, Trash2, Layers, Edit2, ChevronDown, ChevronUp, Sparkles, Loader2, FileText } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import MultiSelect from '../ui/MultiSelect';
import Textarea from '../ui/Textarea';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { MiddlewareModel, PromptModel } from '@/types/dao-ai-types';
import { normalizeRefNameWhileTyping } from '@/utils/name-utils';
import { safeDelete } from '@/utils/safe-delete';

// AI middleware prompt generation API
async function generateMiddlewarePromptWithAI(params: {
  middleware_type: string;
  context?: string;
  existing_prompt?: string;
  middleware_name?: string;
}): Promise<string> {
  const response = await fetch('/api/ai/generate-middleware-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate prompt');
  }
  
  const data = await response.json();
  return data.prompt;
}

// Detect if a value is a PromptModel object (as opposed to a plain string)
function isPromptModelObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && 'name' in value;
}

// Extract prompt source/ref/inline from a potentially PromptModel-typed arg
function parsePromptArg(
  value: unknown,
  prompts: Record<string, PromptModel>
): { source: PromptSource; ref: string; inline: string } {
  if (isPromptModelObject(value)) {
    const promptModel = value as unknown as PromptModel;
    const matchedKey = Object.entries(prompts).find(
      ([, p]) => p.name === promptModel.name
    )?.[0];
    if (matchedKey) {
      return { source: 'configured', ref: matchedKey, inline: '' };
    }
    // Fallback: PromptModel but not found in config, show default_template as inline
    return { source: 'inline', ref: '', inline: promptModel.default_template || '' };
  }
  return { source: 'inline', ref: '', inline: typeof value === 'string' ? value : '' };
}

// Build the prompt value for middleware args from source/ref/inline
function buildPromptValue(
  source: PromptSource,
  ref: string,
  inline: string
): string | undefined {
  if (source === 'configured' && ref) {
    return `__PROMPT_REF__${ref}`;
  }
  return inline || undefined;
}

// Helper to generate default reference name from factory function
const generateDefaultRefName = (factoryFunction: string): string => {
  if (factoryFunction === 'custom') {
    return '';
  }
  
  // Extract the meaningful part from factory function name
  // e.g., "dao_ai.middleware.create_guardrail_middleware" -> "guardrail_middleware"
  const match = factoryFunction.match(/create_(.+)$/);
  if (match && match[1]) {
    return match[1];
  }
  
  // Fallback: use the last part of the function name
  const parts = factoryFunction.split('.');
  return parts[parts.length - 1] || 'middleware';
};

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
    value: 'dao_ai.middleware.create_veracity_guardrail_middleware',
    label: 'Veracity Guardrail',
    description: 'Groundedness check against tool/retrieval context',
    category: 'Guardrails',
  },
  {
    value: 'dao_ai.middleware.create_relevance_guardrail_middleware',
    label: 'Relevance Guardrail',
    description: 'Check if response addresses the user query',
    category: 'Guardrails',
  },
  {
    value: 'dao_ai.middleware.create_tone_guardrail_middleware',
    label: 'Tone Guardrail',
    description: 'Validate response matches a tone profile',
    category: 'Guardrails',
  },
  {
    value: 'dao_ai.middleware.create_conciseness_guardrail_middleware',
    label: 'Conciseness Guardrail',
    description: 'Length and verbosity checks with LLM evaluation',
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
    value: 'dao_ai.middleware.create_tool_call_limit_middleware',
    label: 'Tool Call Limit',
    description: 'Limit tool calls per thread or run',
    category: 'Limits',
  },
  {
    value: 'dao_ai.middleware.create_model_call_limit_middleware',
    label: 'Model Call Limit',
    description: 'Limit LLM API calls per thread or run',
    category: 'Limits',
  },
  {
    value: 'dao_ai.middleware.create_tool_retry_middleware',
    label: 'Tool Retry',
    description: 'Retry failed tool calls with exponential backoff',
    category: 'Retry',
  },
  {
    value: 'dao_ai.middleware.create_model_retry_middleware',
    label: 'Model Retry',
    description: 'Retry failed model calls with exponential backoff',
    category: 'Retry',
  },
  {
    value: 'dao_ai.middleware.create_context_editing_middleware',
    label: 'Context Editing',
    description: 'Clear older tool outputs when token limits reached',
    category: 'Processing',
  },
  {
    value: 'dao_ai.middleware.create_pii_middleware',
    label: 'PII Protection',
    description: 'Detect and handle personally identifiable information',
    category: 'Privacy',
  },
  {
    value: 'dao_ai.middleware.create_tool_call_observability_middleware',
    label: 'Tool Call Observability',
    description: 'Log tool calls with timing and argument tracking',
    category: 'Observability',
  },
  {
    value: 'dao_ai.middleware.create_todo_list_middleware',
    label: 'Todo List',
    description: 'Agent task planning and tracking with write_todos tool',
    category: 'Deep Agents',
  },
  {
    value: 'dao_ai.middleware.create_deep_summarization_middleware',
    label: 'Deep Summarization',
    description: 'Backend-offloading summarization with arg truncation',
    category: 'Processing',
  },
  {
    value: 'dao_ai.middleware.create_llm_tool_selector_middleware',
    label: 'LLM Tool Selector',
    description: 'Intelligently select relevant tools per query',
    category: 'Processing',
  },
  {
    value: 'dao_ai.middleware.create_filesystem_middleware',
    label: 'Filesystem',
    description: 'File operations (ls, read, write, edit, glob, grep)',
    category: 'Deep Agents',
  },
  {
    value: 'dao_ai.middleware.create_subagent_middleware',
    label: 'SubAgent',
    description: 'Spawn subagents for complex multi-step tasks',
    category: 'Deep Agents',
  },
  {
    value: 'dao_ai.middleware.create_agents_memory_middleware',
    label: 'Agents Memory',
    description: 'Load AGENTS.md context files into system prompt',
    category: 'Deep Agents',
  },
  {
    value: 'dao_ai.middleware.create_skills_middleware',
    label: 'Skills',
    description: 'Discover and expose SKILL.md agent skills',
    category: 'Deep Agents',
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

/**
 * Normalize a middleware factory name to its canonical short form.
 *
 * YAML configs may use fully-qualified module paths (e.g.,
 * "dao_ai.middleware.todo.create_todo_list_middleware") or the short
 * re-exported form ("dao_ai.middleware.create_todo_list_middleware").
 * This function maps the long form to the short canonical form used
 * in PRECONFIGURED_MIDDLEWARE so that lookups, parsing, and category
 * matching all work correctly regardless of which form was imported.
 */
const normalizeMiddlewareName = (name: string): string => {
  // Fast path: already matches a preconfigured value
  if (PRECONFIGURED_MIDDLEWARE.find(pm => pm.value === name)) {
    return name;
  }

  // Extract the terminal function name (e.g., "create_todo_list_middleware")
  const parts = name.split('.');
  const funcName = parts[parts.length - 1];

  // Find a preconfigured entry whose value ends with the same function name
  const match = PRECONFIGURED_MIDDLEWARE.find(pm => {
    const pmParts = pm.value.split('.');
    return pmParts[pmParts.length - 1] === funcName;
  });

  return match ? match.value : name;
};

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

// Entry for tool selection with choice between configured tools or manual input
interface ToolSelectionEntry {
  id: string;
  isManual: boolean;
  toolRef: string;   // Key reference to configured tool
  toolName: string;  // Manual tool name string
}

/**
 * Parse a tool reference from middleware args.
 * Handles multiple formats:
 * 1. String with __REF__ prefix (internal reference)
 * 2. String with * prefix (imported YAML reference - not usually seen after parsing)
 * 3. Plain string (tool name)
 * 4. Object (resolved YAML alias - the full ToolModel)
 */
function parseToolReference(
  toolArg: any, 
  configuredTools: Record<string, any>,
  id: string = 'tool_0'
): ToolSelectionEntry {
  // Case 1: String with __REF__ prefix (internal)
  if (typeof toolArg === 'string' && toolArg.startsWith('__REF__')) {
    const refName = toolArg.substring(7);
    return {
      id,
      isManual: false,
      toolRef: refName,
      toolName: '',
    };
  }
  
  // Case 2: String with * prefix (rarely seen after YAML parsing, but handle it)
  if (typeof toolArg === 'string' && toolArg.startsWith('*')) {
    const refName = toolArg.substring(1);
    return {
      id,
      isManual: false,
      toolRef: refName,
      toolName: '',
    };
  }
  
  // Case 3: Plain string (tool name)
  if (typeof toolArg === 'string') {
    // Check if this string matches a configured tool key
    if (configuredTools[toolArg]) {
      return {
        id,
        isManual: false,
        toolRef: toolArg,
        toolName: '',
      };
    }
    // Check if this string matches a configured tool's name field
    const matchedEntry = Object.entries(configuredTools).find(
      ([, tool]) => tool?.name === toolArg
    );
    if (matchedEntry) {
      return {
        id,
        isManual: false,
        toolRef: matchedEntry[0],
        toolName: '',
      };
    }
    // Manual tool name
    return {
      id,
      isManual: true,
      toolRef: '',
      toolName: toolArg,
    };
  }
  
  // Case 4: Object (resolved YAML alias - this is a ToolModel)
  if (typeof toolArg === 'object' && toolArg !== null) {
    // Try to find which configured tool key matches this object
    const toolName = toolArg.name;
    
    // First, try exact object match
    const exactMatch = Object.entries(configuredTools).find(
      ([, tool]) => JSON.stringify(tool) === JSON.stringify(toolArg)
    );
    if (exactMatch) {
      return {
        id,
        isManual: false,
        toolRef: exactMatch[0],
        toolName: '',
      };
    }
    
    // Next, try matching by tool name
    if (toolName) {
      const nameMatch = Object.entries(configuredTools).find(
        ([, tool]) => tool?.name === toolName
      );
      if (nameMatch) {
        return {
          id,
          isManual: false,
          toolRef: nameMatch[0],
          toolName: '',
        };
      }
      // Fall back to using the tool name as manual entry
      return {
        id,
        isManual: true,
        toolRef: '',
        toolName: toolName,
      };
    }
  }
  
  // Fallback: treat as manual with string representation
  return {
    id,
    isManual: true,
    toolRef: '',
    toolName: String(toolArg),
  };
}

type PromptSource = 'inline' | 'configured';

interface SubAgentEntry {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  systemPromptSource: PromptSource;
  systemPromptRef: string;
  model: string; // LLM ref key or empty
}

interface MiddlewareFormData {
  refName: string;
  selectedFactory: string;
  customFactory: string;
  
  // Guardrail parameters
  guardrailName: string;
  guardrailModel: string; // LLM ref key
  guardrailPrompt: string;
  guardrailPromptSource: PromptSource;
  guardrailPromptRef: string;
  guardrailRetries: number;
  guardrailFailOpen: boolean;
  guardrailMaxContextLength: number;
  
  // Content filter parameters
  bannedKeywords: string[]; // Array of keywords
  blockMessage: string;
  
  // Safety guardrail parameters
  safetyModel: string; // Optional LLM ref key
  safetyFailOpen: boolean;
  
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
  suggestAllowOneRetry: boolean;
  suggestLogLevel: string;
  suggestMiddlewareName: string;
  
  refineRewardFn: string;
  refineThreshold: number;
  refineMaxIterations: number;
  refineSelectBest: boolean;
  
  // Tool Call Limit parameters
  toolCallLimitTool: string; // Tool ref key, empty = global limit
  toolCallLimitThreadLimit: number | null;
  toolCallLimitRunLimit: number | null;
  toolCallLimitExitBehavior: 'continue' | 'error' | 'end';
  
  // Model Call Limit parameters
  modelCallLimitThreadLimit: number | null;
  modelCallLimitRunLimit: number | null;
  modelCallLimitExitBehavior: 'error' | 'end';
  
  // Tool Retry parameters
  toolRetryMaxRetries: number;
  toolRetryBackoffFactor: number;
  toolRetryInitialDelay: number;
  toolRetryMaxDelay: number | null;
  toolRetryJitter: boolean;
  toolRetryTools: string[]; // Array of tool ref keys
  toolRetryOnFailure: 'continue' | 'error';
  
  // Model Retry parameters
  modelRetryMaxRetries: number;
  modelRetryBackoffFactor: number;
  modelRetryInitialDelay: number;
  modelRetryMaxDelay: number | null;
  modelRetryJitter: boolean;
  modelRetryOnFailure: 'continue' | 'error';
  
  // Context Editing parameters
  contextEditingTrigger: number;
  contextEditingKeep: number;
  contextEditingClearAtLeast: number;
  contextEditingClearToolInputs: boolean;
  contextEditingExcludeTools: string[]; // Array of tool ref keys
  contextEditingPlaceholder: string;
  contextEditingTokenCountMethod: 'approximate' | 'model';
  
  // PII Middleware parameters
  piiType: string;
  piiStrategy: 'redact' | 'mask' | 'hash' | 'block';
  piiApplyToInput: boolean;
  piiApplyToOutput: boolean;
  piiApplyToToolResults: boolean;
  
  // Veracity Guardrail parameters
  veracityModel: string;
  veracityRetries: number;
  veracityFailOpen: boolean;
  veracityMaxContextLength: number;
  
  // Relevance Guardrail parameters
  relevanceModel: string;
  relevanceRetries: number;
  relevanceFailOpen: boolean;
  
  // Tone Guardrail parameters
  toneModel: string;
  toneProfile: string;
  toneCustomGuidelines: string;
  toneCustomGuidelinesSource: PromptSource;
  toneCustomGuidelinesRef: string;
  toneRetries: number;
  toneFailOpen: boolean;
  
  // Conciseness Guardrail parameters
  concisenessModel: string;
  concisenessMaxLength: number;
  concisenessMinLength: number;
  concisenessCheckVerbosity: boolean;
  concisenessRetries: number;
  concisenessFailOpen: boolean;
  
  // Tool Call Observability parameters
  observabilityLogLevel: string;
  observabilityIncludeArgs: boolean;
  observabilityTrackTiming: boolean;
  
  // Todo List parameters
  todoSystemPrompt: string;
  todoSystemPromptSource: PromptSource;
  todoSystemPromptRef: string;
  todoToolDescription: string;
  
  // Deep Summarization parameters
  deepSumModel: string;
  deepSumBackendType: string;
  deepSumRootDir: string;
  deepSumVolumePath: string;
  deepSumTriggerType: string;
  deepSumTriggerValue: number;
  deepSumKeepType: string;
  deepSumKeepValue: number;
  deepSumHistoryPathPrefix: string;
  deepSumTruncateArgsEnabled: boolean;
  deepSumTruncateArgsTriggerType: string;
  deepSumTruncateArgsTriggerValue: number;
  deepSumTruncateArgsKeepType: string;
  deepSumTruncateArgsKeepValue: number;
  deepSumTruncateArgsMaxLength: number;
  
  // LLM Tool Selector parameters
  toolSelectorModel: string;
  toolSelectorMaxTools: number;
  toolSelectorAlwaysInclude: string[];
  
  // Filesystem parameters
  filesystemBackendType: string;
  filesystemRootDir: string;
  filesystemVolumePath: string;
  filesystemEvictLimit: number | null;
  filesystemSystemPrompt: string;
  filesystemSystemPromptSource: PromptSource;
  filesystemSystemPromptRef: string;
  filesystemCustomToolDescs: string; // JSON string of { tool_name: description }
  
  // SubAgent parameters
  subagentBackendType: string;
  subagentRootDir: string;
  subagentVolumePath: string;
  subagentSystemPrompt: string;
  subagentSystemPromptSource: PromptSource;
  subagentSystemPromptRef: string;
  subagentTaskDescription: string;
  subagentEntries: SubAgentEntry[];
  
  // Agents Memory parameters
  agentsMemorySources: string[];
  agentsMemoryBackendType: string;
  agentsMemoryRootDir: string;
  agentsMemoryVolumePath: string;
  
  // Skills parameters
  skillsSources: string[];
  skillsBackendType: string;
  skillsRootDir: string;
  skillsVolumePath: string;
  
  // Shared volume source toggle for Deep Agents middleware
  // 'reference' = select from configured volumes, 'manual' = type path directly
  volumeSource: 'reference' | 'manual';
  volumeRef: string; // Key of the selected configured volume
  volumeSubPath: string; // Optional sub-path within the selected volume
  
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
  guardrailPromptSource: 'inline',
  guardrailPromptRef: '',
  guardrailRetries: 3,
  guardrailFailOpen: true,
  guardrailMaxContextLength: 8000,
  bannedKeywords: [],
  blockMessage: 'I cannot provide that response. Please rephrase your request.',
  safetyModel: '',
  safetyFailOpen: true,
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
  suggestAllowOneRetry: false,
  suggestLogLevel: 'warning',
  suggestMiddlewareName: '',
  refineRewardFn: '',
  refineThreshold: 0.8,
  refineMaxIterations: 3,
  refineSelectBest: true,
  
  // Tool Call Limit defaults
  toolCallLimitTool: '', // Empty = global limit
  toolCallLimitThreadLimit: null,
  toolCallLimitRunLimit: 10,
  toolCallLimitExitBehavior: 'continue',
  
  // Model Call Limit defaults
  modelCallLimitThreadLimit: null,
  modelCallLimitRunLimit: 50,
  modelCallLimitExitBehavior: 'end',
  
  // Tool Retry defaults
  toolRetryMaxRetries: 3,
  toolRetryBackoffFactor: 2.0,
  toolRetryInitialDelay: 1.0,
  toolRetryMaxDelay: null,
  toolRetryJitter: false,
  toolRetryTools: [] as string[],
  toolRetryOnFailure: 'continue',
  
  // Model Retry defaults
  modelRetryMaxRetries: 3,
  modelRetryBackoffFactor: 2.0,
  modelRetryInitialDelay: 1.0,
  modelRetryMaxDelay: null,
  modelRetryJitter: false,
  modelRetryOnFailure: 'continue',
  
  // Context Editing defaults
  contextEditingTrigger: 100000,
  contextEditingKeep: 3,
  contextEditingClearAtLeast: 0,
  contextEditingClearToolInputs: false,
  contextEditingExcludeTools: [] as string[],
  contextEditingPlaceholder: '[cleared]',
  contextEditingTokenCountMethod: 'approximate',
  
  // PII defaults
  piiType: 'email',
  piiStrategy: 'redact',
  piiApplyToInput: true,
  piiApplyToOutput: false,
  piiApplyToToolResults: false,
  
  // Veracity Guardrail defaults
  veracityModel: '',
  veracityRetries: 2,
  veracityFailOpen: true,
  veracityMaxContextLength: 8000,
  
  // Relevance Guardrail defaults
  relevanceModel: '',
  relevanceRetries: 2,
  relevanceFailOpen: true,
  
  // Tone Guardrail defaults
  toneModel: '',
  toneProfile: 'professional',
  toneCustomGuidelines: '',
  toneCustomGuidelinesSource: 'inline',
  toneCustomGuidelinesRef: '',
  toneRetries: 2,
  toneFailOpen: true,
  
  // Conciseness Guardrail defaults
  concisenessModel: '',
  concisenessMaxLength: 3000,
  concisenessMinLength: 20,
  concisenessCheckVerbosity: true,
  concisenessRetries: 2,
  concisenessFailOpen: true,
  
  // Tool Call Observability defaults
  observabilityLogLevel: 'INFO',
  observabilityIncludeArgs: false,
  observabilityTrackTiming: true,
  
  // Todo List defaults
  todoSystemPrompt: '',
  todoSystemPromptSource: 'inline',
  todoSystemPromptRef: '',
  todoToolDescription: '',
  
  // Deep Summarization defaults
  deepSumModel: '',
  deepSumBackendType: 'state',
  deepSumRootDir: '',
  deepSumVolumePath: '',
  deepSumTriggerType: 'tokens',
  deepSumTriggerValue: 100000,
  deepSumKeepType: 'messages',
  deepSumKeepValue: 20,
  deepSumHistoryPathPrefix: '/conversation_history',
  deepSumTruncateArgsEnabled: false,
  deepSumTruncateArgsTriggerType: 'messages',
  deepSumTruncateArgsTriggerValue: 50,
  deepSumTruncateArgsKeepType: 'messages',
  deepSumTruncateArgsKeepValue: 20,
  deepSumTruncateArgsMaxLength: 2000,
  
  // LLM Tool Selector defaults
  toolSelectorModel: '',
  toolSelectorMaxTools: 3,
  toolSelectorAlwaysInclude: [] as string[],
  
  // Filesystem defaults
  filesystemBackendType: 'state',
  filesystemRootDir: '',
  filesystemVolumePath: '',
  filesystemEvictLimit: 20000,
  filesystemSystemPrompt: '',
  filesystemSystemPromptSource: 'inline',
  filesystemSystemPromptRef: '',
  filesystemCustomToolDescs: '',
  
  // SubAgent defaults
  subagentBackendType: 'state',
  subagentRootDir: '',
  subagentVolumePath: '',
  subagentSystemPrompt: '',
  subagentSystemPromptSource: 'inline',
  subagentSystemPromptRef: '',
  subagentTaskDescription: '',
  subagentEntries: [] as SubAgentEntry[],
  
  // Agents Memory defaults
  agentsMemorySources: [] as string[],
  agentsMemoryBackendType: 'state',
  agentsMemoryRootDir: '',
  agentsMemoryVolumePath: '',
  
  // Skills defaults
  skillsSources: [] as string[],
  skillsBackendType: 'state',
  skillsRootDir: '',
  skillsVolumePath: '',
  
  volumeSource: 'reference',
  volumeRef: '',
  volumeSubPath: '',
  
  genericArgs: {},
};

// Middleware type to human-readable label mapping for AI generation
const MIDDLEWARE_TYPE_LABELS: Record<string, string> = {
  'dao_ai.middleware.create_guardrail_middleware': 'guardrail',
  'dao_ai.middleware.create_todo_list_middleware': 'todo',
  'dao_ai.middleware.create_filesystem_middleware': 'filesystem',
  'dao_ai.middleware.create_subagent_middleware': 'subagent',
  'dao_ai.middleware.create_tone_guardrail_middleware': 'tone',
};

// AI context placeholders by middleware type
const AI_CONTEXT_PLACEHOLDERS: Record<string, string> = {
  guardrail: 'e.g., "Evaluate responses for professional tone, factual accuracy, and no PII disclosure"',
  todo: 'e.g., "Manage engineering sprint tasks with priority levels and blocking dependencies"',
  filesystem: 'e.g., "Manage project files with read-only access to config files and write access to output directory"',
  subagent: 'e.g., "Coordinate between a research agent and a writing agent to produce comprehensive reports"',
  tone: 'e.g., "Maintain a warm, empathetic customer support tone while being technically accurate"',
};

interface MiddlewarePromptFieldProps {
  label: string;
  value: string;
  source: PromptSource;
  promptRef: string;
  middlewareType: string;
  middlewareName?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  rows?: number;
  promptOptions: { value: string; label: string }[];
  prompts: Record<string, PromptModel>;
  onValueChange: (value: string) => void;
  onSourceChange: (source: PromptSource) => void;
  onRefChange: (ref: string) => void;
}

function MiddlewarePromptField({
  label,
  value,
  source,
  promptRef,
  middlewareType,
  middlewareName,
  placeholder,
  hint,
  required,
  rows = 3,
  promptOptions,
  prompts,
  onValueChange,
  onSourceChange,
  onRefChange,
}: MiddlewarePromptFieldProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiContext, setAiContext] = useState('');

  const typeLabel = MIDDLEWARE_TYPE_LABELS[middlewareType] || middlewareType;
  const contextPlaceholder = AI_CONTEXT_PLACEHOLDERS[typeLabel] || 'Describe what this prompt should achieve...';

  const handleGenerate = async (improveExisting = false) => {
    setIsGenerating(true);
    try {
      const generated = await generateMiddlewarePromptWithAI({
        middleware_type: typeLabel,
        context: aiContext || undefined,
        existing_prompt: improveExisting ? value : undefined,
        middleware_name: middlewareName || undefined,
      });
      onValueChange(generated);
      setShowAiInput(false);
      setAiContext('');
    } catch (error) {
      console.error('Failed to generate middleware prompt:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate prompt');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="col-span-2 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-300">{label}</label>
        <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
          <button
            type="button"
            onClick={() => onSourceChange('inline')}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
              source === 'inline'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                : 'text-slate-400 border border-transparent hover:text-slate-300'
            }`}
          >
            Inline
          </button>
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
        </div>
      </div>

      {source === 'configured' ? (
        <div className="space-y-2">
          <Select
            value={promptRef}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => onRefChange(e.target.value)}
            options={promptOptions}
            placeholder="Select a configured prompt..."
          />
          {promptRef && prompts[promptRef] && (
            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="flex items-center space-x-2 mb-2">
                <FileText className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-medium text-slate-300">{prompts[promptRef].name}</span>
              </div>
              {prompts[promptRef].description && (
                <p className="text-xs text-slate-400 mb-2">{prompts[promptRef].description}</p>
              )}
              {prompts[promptRef].default_template && (
                <pre className="text-xs text-slate-500 bg-slate-900/50 p-2 rounded overflow-auto max-h-32">
                  {prompts[promptRef].default_template?.substring(0, 300)}
                  {(prompts[promptRef].default_template?.length || 0) > 300 ? '...' : ''}
                </pre>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* AI Assistant Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowAiInput(!showAiInput)}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs rounded-lg font-medium bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/30 hover:from-purple-500/30 hover:to-pink-500/30 transition-all"
                disabled={isGenerating}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Assistant</span>
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => handleGenerate(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs rounded-lg font-medium bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/30 hover:from-purple-500/30 hover:to-pink-500/30 transition-all"
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Improve Prompt</span>
                </button>
              )}
            </div>
          </div>

          {showAiInput && (
            <div className="p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30 space-y-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-purple-300">Generate {label} with AI</span>
              </div>
              <p className="text-xs text-slate-400">
                Describe what this {typeLabel} prompt should do. The AI will generate an optimized prompt based on your description.
              </p>
              <Textarea
                value={aiContext}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setAiContext(e.target.value)}
                placeholder={contextPlaceholder}
                rows={3}
              />
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => { setShowAiInput(false); setAiContext(''); }}
                  disabled={isGenerating}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleGenerate(false)}
                  disabled={isGenerating || !aiContext}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-1.5" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <Textarea
            value={value}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onValueChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            required={required}
            hint={hint}
          />
        </div>
      )}
    </div>
  );
}

export default function MiddlewareSection() {
  const { config, addMiddleware, removeMiddleware, updateMiddleware } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMiddleware, setEditingMiddleware] = useState<string | null>(null);
  const [expandedMiddleware, setExpandedMiddleware] = useState<string | null>(null);
  const [formData, setFormData] = useState<MiddlewareFormData>(defaultFormData);

  const middleware = config.middleware || {};
  const llms = config.resources?.llms || {};
  const llmOptions = [
    { value: '', label: 'Select LLM...' },
    ...Object.keys(llms).map(key => ({ value: key, label: key })),
  ];
  
  // Tools for middleware that reference tools
  const tools = config.tools || {};

  // Prompts for middleware that can reference configured prompts
  const prompts = config.prompts || {};
  const promptOptions = Object.entries(prompts).map(([key, p]) => ({ value: key, label: `${key} — ${p.name}` }));

  // Volumes for Deep Agents middleware that reference volume paths
  const volumes = config.resources?.volumes || {};
  const volumeOptions = Object.entries(volumes).map(([key, vol]) => {
    const catalog = vol.schema?.catalog_name || '';
    const schema = vol.schema?.schema_name || '';
    const path = catalog && schema ? `/Volumes/${catalog}/${schema}/${vol.name}` : vol.name;
    return { value: key, label: `${key} (${path})`, path };
  });

  // Helper: build a volume path from a configured volume key
  const getVolumePathFromKey = (volumeKey: string): string => {
    const vol = volumes[volumeKey];
    if (!vol) return '';
    const catalog = vol.schema?.catalog_name || '';
    const schema = vol.schema?.schema_name || '';
    return catalog && schema ? `/Volumes/${catalog}/${schema}/${vol.name}` : vol.name;
  };

  // Helper: find a volume key that matches a given volume path (supports sub-paths)
  // Returns { key, subPath } where subPath is the portion after the volume root (if any)
  const findVolumeKeyByPath = (volumePath: string): { key: string; subPath: string } => {
    // Try exact match first
    const exact = volumeOptions.find(opt => opt.path === volumePath);
    if (exact) return { key: exact.value, subPath: '' };
    // Try prefix match (longest match wins) for sub-paths like /Volumes/cat/schema/vol/sub/path
    let bestMatch: { key: string; subPath: string; len: number } | null = null;
    for (const opt of volumeOptions) {
      if (volumePath.startsWith(opt.path + '/')) {
        const subPath = volumePath.slice(opt.path.length + 1); // strip leading '/'
        if (!bestMatch || opt.path.length > bestMatch.len) {
          bestMatch = { key: opt.value, subPath, len: opt.path.length };
        }
      }
    }
    return bestMatch ? { key: bestMatch.key, subPath: bestMatch.subPath } : { key: '', subPath: '' };
  };

  const handleAdd = () => {
    setEditingMiddleware(null);
    setFormData(defaultFormData);
    setIsModalOpen(true);
  };

  // Helper: extract an LLM key from a middleware arg that may be a "*ref" string or a resolved LLM object
  const extractLlmKey = (modelArg: any): string => {
    if (typeof modelArg === 'string' && modelArg.startsWith('*')) {
      return modelArg.substring(1);
    }
    // When YAML aliases are resolved, modelArg becomes the LLM config object — find its key
    if (typeof modelArg === 'object' && modelArg !== null) {
      const llmEntries = Object.entries(llms);
      const match = llmEntries.find(([, llm]) =>
        (llm as any).name === modelArg.name
      );
      if (match) return match[0];
    }
    return typeof modelArg === 'string' ? modelArg : '';
  };

  const parseMiddlewareArgs = (mw: MiddlewareModel, configuredTools: Record<string, any>, configuredPrompts: Record<string, PromptModel>): Partial<MiddlewareFormData> => {
    const parsed: Partial<MiddlewareFormData> = {};
    const args = mw.args || {};
    // Normalize the name so fully-qualified paths (e.g. dao_ai.middleware.todo.create_todo_list_middleware)
    // match the same branches as the short canonical form
    const name = normalizeMiddlewareName(mw.name);
    
    // Guardrail middleware
    if (name === 'dao_ai.middleware.create_guardrail_middleware') {
      parsed.guardrailName = args.name || '';
      parsed.guardrailModel = extractLlmKey(args.model);
      const guardrailPromptParsed = parsePromptArg(args.prompt, configuredPrompts);
      parsed.guardrailPrompt = guardrailPromptParsed.inline;
      parsed.guardrailPromptSource = guardrailPromptParsed.source;
      parsed.guardrailPromptRef = guardrailPromptParsed.ref;
      parsed.guardrailRetries = args.num_retries || 3;
      parsed.guardrailFailOpen = args.fail_open !== false;
      parsed.guardrailMaxContextLength = args.max_context_length ?? 8000;
    }
    
    // Content filter
    if (name === 'dao_ai.middleware.create_content_filter_middleware') {
      parsed.bannedKeywords = Array.isArray(args.banned_keywords) ? args.banned_keywords : [];
      parsed.blockMessage = args.block_message || defaultFormData.blockMessage;
    }
    
    // Safety guardrail
    if (name === 'dao_ai.middleware.create_safety_guardrail_middleware') {
      parsed.safetyModel = extractLlmKey(args.safety_model);
      parsed.safetyFailOpen = args.fail_open !== false;
    }
    
    // Custom field validation
    if (name === 'dao_ai.middleware.create_custom_field_validation_middleware') {
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
    if (name === 'dao_ai.middleware.create_summarization_middleware') {
      const chatHistory = args.chat_history || {};
      parsed.summaryModel = extractLlmKey(chatHistory.model);
      parsed.summaryMaxTokens = chatHistory.max_tokens || 2048;
      parsed.summaryUsesTokens = !!chatHistory.max_tokens_before_summary;
      parsed.summaryMaxTokensBefore = chatHistory.max_tokens_before_summary || 20480;
      parsed.summaryMaxMessagesBefore = chatHistory.max_messages_before_summary || 10;
    }
    
    // HITL
    if (name === 'dao_ai.middleware.create_human_in_the_loop_middleware') {
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
    if (name === 'dao_ai.middleware.create_assert_middleware') {
      parsed.assertConstraint = args.constraint || '';
      parsed.assertMaxRetries = args.max_retries || 3;
      parsed.assertOnFailure = args.on_failure || 'error';
      parsed.assertFallbackMessage = args.fallback_message || defaultFormData.assertFallbackMessage;
      parsed.assertMiddlewareName = args.name || '';
    }
    
    // Suggest
    if (name === 'dao_ai.middleware.create_suggest_middleware') {
      parsed.suggestConstraint = args.constraint || '';
      parsed.suggestAllowOneRetry = args.allow_one_retry || false;
      parsed.suggestLogLevel = args.log_level || 'warning';
      parsed.suggestMiddlewareName = args.name || '';
    }
    
    // Refine
    if (name === 'dao_ai.middleware.create_refine_middleware') {
      parsed.refineRewardFn = args.reward_fn || '';
      parsed.refineThreshold = args.threshold ?? 0.8;
      parsed.refineMaxIterations = args.max_iterations || 3;
      parsed.refineSelectBest = args.select_best !== false;
    }
    
    // Tool Call Limit
    if (name === 'dao_ai.middleware.create_tool_call_limit_middleware') {
      if (args.tool) {
        const toolEntry = parseToolReference(args.tool, configuredTools);
        // Use toolRef if found, otherwise empty (global)
        parsed.toolCallLimitTool = toolEntry.toolRef || '';
      } else {
        parsed.toolCallLimitTool = '';
      }
      parsed.toolCallLimitThreadLimit = args.thread_limit ?? null;
      parsed.toolCallLimitRunLimit = args.run_limit ?? null;
      parsed.toolCallLimitExitBehavior = args.exit_behavior || 'continue';
    }
    
    // Model Call Limit
    if (name === 'dao_ai.middleware.create_model_call_limit_middleware') {
      parsed.modelCallLimitThreadLimit = args.thread_limit ?? null;
      parsed.modelCallLimitRunLimit = args.run_limit ?? null;
      parsed.modelCallLimitExitBehavior = args.exit_behavior || 'end';
    }
    
    // Tool Retry
    if (name === 'dao_ai.middleware.create_tool_retry_middleware') {
      parsed.toolRetryMaxRetries = args.max_retries || 3;
      parsed.toolRetryBackoffFactor = args.backoff_factor || 2.0;
      parsed.toolRetryInitialDelay = args.initial_delay || 1.0;
      parsed.toolRetryMaxDelay = args.max_delay ?? null;
      parsed.toolRetryJitter = args.jitter || false;
      parsed.toolRetryOnFailure = args.on_failure || 'continue';
      if (Array.isArray(args.tools)) {
        // Parse each tool reference and extract the toolRef key
        parsed.toolRetryTools = args.tools
          .map((t: any) => parseToolReference(t, configuredTools).toolRef)
          .filter(Boolean);
      } else {
        parsed.toolRetryTools = [];
      }
    }
    
    // Model Retry
    if (name === 'dao_ai.middleware.create_model_retry_middleware') {
      parsed.modelRetryMaxRetries = args.max_retries || 3;
      parsed.modelRetryBackoffFactor = args.backoff_factor || 2.0;
      parsed.modelRetryInitialDelay = args.initial_delay || 1.0;
      parsed.modelRetryMaxDelay = args.max_delay ?? null;
      parsed.modelRetryJitter = args.jitter || false;
      parsed.modelRetryOnFailure = args.on_failure || 'continue';
    }
    
    // Context Editing
    if (name === 'dao_ai.middleware.create_context_editing_middleware') {
      parsed.contextEditingTrigger = args.trigger || 100000;
      parsed.contextEditingKeep = args.keep || 3;
      parsed.contextEditingClearAtLeast = args.clear_at_least || 0;
      parsed.contextEditingClearToolInputs = args.clear_tool_inputs || false;
      parsed.contextEditingPlaceholder = args.placeholder || '[cleared]';
      parsed.contextEditingTokenCountMethod = args.token_count_method || 'approximate';
      if (Array.isArray(args.exclude_tools)) {
        // Parse each tool reference and extract the toolRef key
        parsed.contextEditingExcludeTools = args.exclude_tools
          .map((t: any) => parseToolReference(t, configuredTools).toolRef)
          .filter(Boolean);
      } else {
        parsed.contextEditingExcludeTools = [];
      }
    }
    
    // PII Middleware
    if (name === 'dao_ai.middleware.create_pii_middleware') {
      parsed.piiType = args.pii_type || 'email';
      parsed.piiStrategy = args.strategy || 'redact';
      parsed.piiApplyToInput = args.apply_to_input !== false;
      parsed.piiApplyToOutput = args.apply_to_output || false;
      parsed.piiApplyToToolResults = args.apply_to_tool_results || false;
    }
    
    // Veracity Guardrail
    if (name === 'dao_ai.middleware.create_veracity_guardrail_middleware') {
      parsed.veracityModel = extractLlmKey(args.model);
      parsed.veracityRetries = args.num_retries ?? 2;
      parsed.veracityFailOpen = args.fail_open !== false;
      parsed.veracityMaxContextLength = args.max_context_length ?? 8000;
    }
    
    // Relevance Guardrail
    if (name === 'dao_ai.middleware.create_relevance_guardrail_middleware') {
      parsed.relevanceModel = extractLlmKey(args.model);
      parsed.relevanceRetries = args.num_retries ?? 2;
      parsed.relevanceFailOpen = args.fail_open !== false;
    }
    
    // Tone Guardrail
    if (name === 'dao_ai.middleware.create_tone_guardrail_middleware') {
      parsed.toneModel = extractLlmKey(args.model);
      parsed.toneProfile = args.tone || 'professional';
      const toneParsed = parsePromptArg(args.custom_guidelines, configuredPrompts);
      parsed.toneCustomGuidelines = toneParsed.inline;
      parsed.toneCustomGuidelinesSource = toneParsed.source;
      parsed.toneCustomGuidelinesRef = toneParsed.ref;
      parsed.toneRetries = args.num_retries ?? 2;
      parsed.toneFailOpen = args.fail_open !== false;
    }
    
    // Conciseness Guardrail
    if (name === 'dao_ai.middleware.create_conciseness_guardrail_middleware') {
      parsed.concisenessModel = extractLlmKey(args.model);
      parsed.concisenessMaxLength = args.max_length ?? 3000;
      parsed.concisenessMinLength = args.min_length ?? 20;
      parsed.concisenessCheckVerbosity = args.check_verbosity !== false;
      parsed.concisenessRetries = args.num_retries ?? 2;
      parsed.concisenessFailOpen = args.fail_open !== false;
    }
    
    // Tool Call Observability
    if (name === 'dao_ai.middleware.create_tool_call_observability_middleware') {
      parsed.observabilityLogLevel = args.log_level || 'INFO';
      parsed.observabilityIncludeArgs = args.include_args || false;
      parsed.observabilityTrackTiming = args.track_timing !== false;
    }
    
    // Todo List
    if (name === 'dao_ai.middleware.create_todo_list_middleware') {
      const todoParsed = parsePromptArg(args.system_prompt, configuredPrompts);
      parsed.todoSystemPrompt = todoParsed.inline;
      parsed.todoSystemPromptSource = todoParsed.source;
      parsed.todoSystemPromptRef = todoParsed.ref;
      parsed.todoToolDescription = args.tool_description || '';
    }
    
    // Deep Summarization
    if (name === 'dao_ai.middleware.create_deep_summarization_middleware') {
      parsed.deepSumModel = extractLlmKey(args.model);
      parsed.deepSumBackendType = args.backend_type || 'state';
      parsed.deepSumRootDir = args.root_dir || '';
      const deepSumVolPath = args.volume_path || '';
      parsed.deepSumVolumePath = deepSumVolPath;
      const { key: deepSumVolKey, subPath: deepSumSubPath } = findVolumeKeyByPath(deepSumVolPath);
      parsed.volumeSource = deepSumVolKey ? 'reference' : (deepSumVolPath ? 'manual' : 'reference');
      parsed.volumeRef = deepSumVolKey;
      parsed.volumeSubPath = deepSumSubPath;
      if (Array.isArray(args.trigger) && args.trigger.length === 2) {
        parsed.deepSumTriggerType = args.trigger[0];
        parsed.deepSumTriggerValue = args.trigger[1];
      }
      if (Array.isArray(args.keep) && args.keep.length === 2) {
        parsed.deepSumKeepType = args.keep[0];
        parsed.deepSumKeepValue = args.keep[1];
      }
      parsed.deepSumHistoryPathPrefix = args.history_path_prefix || '/conversation_history';
      if (Array.isArray(args.truncate_args_trigger) && args.truncate_args_trigger.length === 2) {
        parsed.deepSumTruncateArgsEnabled = true;
        parsed.deepSumTruncateArgsTriggerType = args.truncate_args_trigger[0];
        parsed.deepSumTruncateArgsTriggerValue = args.truncate_args_trigger[1];
      }
      if (Array.isArray(args.truncate_args_keep) && args.truncate_args_keep.length === 2) {
        parsed.deepSumTruncateArgsKeepType = args.truncate_args_keep[0];
        parsed.deepSumTruncateArgsKeepValue = args.truncate_args_keep[1];
      }
      parsed.deepSumTruncateArgsMaxLength = args.truncate_args_max_length ?? 2000;
    }
    
    // LLM Tool Selector
    if (name === 'dao_ai.middleware.create_llm_tool_selector_middleware') {
      parsed.toolSelectorModel = extractLlmKey(args.model);
      parsed.toolSelectorMaxTools = args.max_tools ?? 3;
      if (Array.isArray(args.always_include)) {
        parsed.toolSelectorAlwaysInclude = args.always_include
          .map((t: any) => parseToolReference(t, configuredTools).toolRef)
          .filter(Boolean);
      } else {
        parsed.toolSelectorAlwaysInclude = [];
      }
    }
    
    // Filesystem
    if (name === 'dao_ai.middleware.create_filesystem_middleware') {
      parsed.filesystemBackendType = args.backend_type || 'state';
      parsed.filesystemRootDir = args.root_dir || '';
      const fsVolPath = args.volume_path || '';
      parsed.filesystemVolumePath = fsVolPath;
      const { key: fsVolKey, subPath: fsSubPath } = findVolumeKeyByPath(fsVolPath);
      parsed.volumeSource = fsVolKey ? 'reference' : (fsVolPath ? 'manual' : 'reference');
      parsed.volumeRef = fsVolKey;
      parsed.volumeSubPath = fsSubPath;
      parsed.filesystemEvictLimit = args.tool_token_limit_before_evict ?? 20000;
      const fsParsed = parsePromptArg(args.system_prompt, configuredPrompts);
      parsed.filesystemSystemPrompt = fsParsed.inline;
      parsed.filesystemSystemPromptSource = fsParsed.source;
      parsed.filesystemSystemPromptRef = fsParsed.ref;
      if (args.custom_tool_descriptions && typeof args.custom_tool_descriptions === 'object') {
        parsed.filesystemCustomToolDescs = JSON.stringify(args.custom_tool_descriptions, null, 2);
      }
    }
    
    // SubAgent
    if (name === 'dao_ai.middleware.create_subagent_middleware') {
      parsed.subagentBackendType = args.backend_type || 'state';
      parsed.subagentRootDir = args.root_dir || '';
      const subVolPath = args.volume_path || '';
      parsed.subagentVolumePath = subVolPath;
      const { key: subVolKey, subPath: subSubPath } = findVolumeKeyByPath(subVolPath);
      parsed.volumeSource = subVolKey ? 'reference' : (subVolPath ? 'manual' : 'reference');
      parsed.volumeRef = subVolKey;
      parsed.volumeSubPath = subSubPath;
      const subParsed = parsePromptArg(args.system_prompt, configuredPrompts);
      parsed.subagentSystemPrompt = subParsed.inline;
      parsed.subagentSystemPromptSource = subParsed.source;
      parsed.subagentSystemPromptRef = subParsed.ref;
      parsed.subagentTaskDescription = args.task_description || '';
      if (Array.isArray(args.subagents)) {
        parsed.subagentEntries = args.subagents.map((s: any, idx: number) => {
          const sParsed = parsePromptArg(s.system_prompt, configuredPrompts);
          return {
            id: `subagent_${idx}`,
            name: s.name || '',
            description: s.description || '',
            systemPrompt: sParsed.inline,
            systemPromptSource: sParsed.source,
            systemPromptRef: sParsed.ref,
            model: extractLlmKey(s.model),
          };
        });
      } else {
        parsed.subagentEntries = [];
      }
    }
    
    // Agents Memory
    if (name === 'dao_ai.middleware.create_agents_memory_middleware') {
      parsed.agentsMemorySources = Array.isArray(args.sources) ? args.sources : [];
      parsed.agentsMemoryBackendType = args.backend_type || 'state';
      parsed.agentsMemoryRootDir = args.root_dir || '';
      const amVolPath = args.volume_path || '';
      parsed.agentsMemoryVolumePath = amVolPath;
      const { key: amVolKey, subPath: amSubPath } = findVolumeKeyByPath(amVolPath);
      parsed.volumeSource = amVolKey ? 'reference' : (amVolPath ? 'manual' : 'reference');
      parsed.volumeRef = amVolKey;
      parsed.volumeSubPath = amSubPath;
    }
    
    // Skills
    if (name === 'dao_ai.middleware.create_skills_middleware') {
      parsed.skillsSources = Array.isArray(args.sources) ? args.sources : [];
      parsed.skillsBackendType = args.backend_type || 'state';
      parsed.skillsRootDir = args.root_dir || '';
      const skVolPath = args.volume_path || '';
      parsed.skillsVolumePath = skVolPath;
      const { key: skVolKey, subPath: skSubPath } = findVolumeKeyByPath(skVolPath);
      parsed.volumeSource = skVolKey ? 'reference' : (skVolPath ? 'manual' : 'reference');
      parsed.volumeRef = skVolKey;
      parsed.volumeSubPath = skSubPath;
    }
    
    // Custom - generic args
    if (name === 'custom' || !PRECONFIGURED_MIDDLEWARE.find(pm => pm.value === name)) {
      parsed.genericArgs = args;
    }
    
    return parsed;
  };

  const handleEdit = (key: string) => {
    const mw = middleware[key];
    setEditingMiddleware(key);
    
    const normalizedName = normalizeMiddlewareName(mw.name);
    const preconfigured = PRECONFIGURED_MIDDLEWARE.find(pm => pm.value === normalizedName && pm.value !== 'custom');
    const parsedArgs = parseMiddlewareArgs(mw, tools, prompts);
    
    setFormData({
      ...defaultFormData,
      ...parsedArgs,
      refName: key,
      selectedFactory: preconfigured ? normalizedName : 'custom',
      customFactory: preconfigured ? '' : mw.name,
    });
    setIsModalOpen(true);
  };

  const buildMiddlewareArgs = (): Record<string, any> | undefined => {
    const factory = formData.selectedFactory;
    
    if (factory === 'dao_ai.middleware.create_guardrail_middleware') {
      return {
        name: formData.guardrailName,
        model: formData.guardrailModel ? `__REF__${formData.guardrailModel}` : undefined,
        prompt: buildPromptValue(formData.guardrailPromptSource, formData.guardrailPromptRef, formData.guardrailPrompt),
        num_retries: formData.guardrailRetries,
        fail_open: formData.guardrailFailOpen,
        max_context_length: formData.guardrailMaxContextLength,
      };
    }
    
    if (factory === 'dao_ai.middleware.create_content_filter_middleware') {
      return {
        banned_keywords: formData.bannedKeywords,
        block_message: formData.blockMessage,
      };
    }
    
    if (factory === 'dao_ai.middleware.create_safety_guardrail_middleware') {
      const result: Record<string, any> = {
        fail_open: formData.safetyFailOpen,
      };
      if (formData.safetyModel) {
        result.safety_model = `__REF__${formData.safetyModel}`;
      }
      return result;
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
        model: formData.summaryModel ? `__REF__${formData.summaryModel}` : undefined,
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
        allow_one_retry: formData.suggestAllowOneRetry,
        log_level: formData.suggestLogLevel,
        ...(formData.suggestMiddlewareName && { name: formData.suggestMiddlewareName }),
      };
    }
    
    if (factory === 'dao_ai.middleware.create_refine_middleware') {
      return {
        reward_fn: formData.refineRewardFn,
        threshold: formData.refineThreshold,
        max_iterations: formData.refineMaxIterations,
        select_best: formData.refineSelectBest,
      };
    }
    
    // Tool Call Limit
    if (factory === 'dao_ai.middleware.create_tool_call_limit_middleware') {
      const result: Record<string, any> = {};
      
      // If a tool is selected, add it as a reference
      if (formData.toolCallLimitTool) {
        result.tool = `__REF__${formData.toolCallLimitTool}`;
      }
      
      if (formData.toolCallLimitThreadLimit !== null) {
        result.thread_limit = formData.toolCallLimitThreadLimit;
      }
      if (formData.toolCallLimitRunLimit !== null) {
        result.run_limit = formData.toolCallLimitRunLimit;
      }
      result.exit_behavior = formData.toolCallLimitExitBehavior;
      
      return Object.keys(result).length > 0 ? result : undefined;
    }
    
    // Model Call Limit
    if (factory === 'dao_ai.middleware.create_model_call_limit_middleware') {
      const result: Record<string, any> = {};
      
      if (formData.modelCallLimitThreadLimit !== null) {
        result.thread_limit = formData.modelCallLimitThreadLimit;
      }
      if (formData.modelCallLimitRunLimit !== null) {
        result.run_limit = formData.modelCallLimitRunLimit;
      }
      result.exit_behavior = formData.modelCallLimitExitBehavior;
      
      return Object.keys(result).length > 0 ? result : undefined;
    }
    
    // Tool Retry
    if (factory === 'dao_ai.middleware.create_tool_retry_middleware') {
      const result: Record<string, any> = {
        max_retries: formData.toolRetryMaxRetries,
        backoff_factor: formData.toolRetryBackoffFactor,
        initial_delay: formData.toolRetryInitialDelay,
        jitter: formData.toolRetryJitter,
        on_failure: formData.toolRetryOnFailure,
      };
      
      if (formData.toolRetryMaxDelay !== null) {
        result.max_delay = formData.toolRetryMaxDelay;
      }
      
      // Add tools as references
      if (formData.toolRetryTools.length > 0) {
        result.tools = formData.toolRetryTools.map(toolRef => `__REF__${toolRef}`);
      }
      
      return result;
    }
    
    // Model Retry
    if (factory === 'dao_ai.middleware.create_model_retry_middleware') {
      const result: Record<string, any> = {
        max_retries: formData.modelRetryMaxRetries,
        backoff_factor: formData.modelRetryBackoffFactor,
        initial_delay: formData.modelRetryInitialDelay,
        jitter: formData.modelRetryJitter,
        on_failure: formData.modelRetryOnFailure,
      };
      
      if (formData.modelRetryMaxDelay !== null) {
        result.max_delay = formData.modelRetryMaxDelay;
      }
      
      return result;
    }
    
    // Context Editing
    if (factory === 'dao_ai.middleware.create_context_editing_middleware') {
      const result: Record<string, any> = {
        trigger: formData.contextEditingTrigger,
        keep: formData.contextEditingKeep,
        clear_at_least: formData.contextEditingClearAtLeast,
        clear_tool_inputs: formData.contextEditingClearToolInputs,
        placeholder: formData.contextEditingPlaceholder,
        token_count_method: formData.contextEditingTokenCountMethod,
      };
      
      // Add excluded tools as references
      if (formData.contextEditingExcludeTools.length > 0) {
        result.exclude_tools = formData.contextEditingExcludeTools.map(toolRef => `__REF__${toolRef}`);
      }
      
      return result;
    }
    
    // PII Middleware
    if (factory === 'dao_ai.middleware.create_pii_middleware') {
      return {
        pii_type: formData.piiType,
        strategy: formData.piiStrategy,
        apply_to_input: formData.piiApplyToInput,
        apply_to_output: formData.piiApplyToOutput,
        apply_to_tool_results: formData.piiApplyToToolResults,
      };
    }
    
    // Veracity Guardrail
    if (factory === 'dao_ai.middleware.create_veracity_guardrail_middleware') {
      return {
        ...(formData.veracityModel && { model: `__REF__${formData.veracityModel}` }),
        num_retries: formData.veracityRetries,
        fail_open: formData.veracityFailOpen,
        max_context_length: formData.veracityMaxContextLength,
      };
    }
    
    // Relevance Guardrail
    if (factory === 'dao_ai.middleware.create_relevance_guardrail_middleware') {
      return {
        ...(formData.relevanceModel && { model: `__REF__${formData.relevanceModel}` }),
        num_retries: formData.relevanceRetries,
        fail_open: formData.relevanceFailOpen,
      };
    }
    
    // Tone Guardrail
    if (factory === 'dao_ai.middleware.create_tone_guardrail_middleware') {
      const toneGuidelinesValue = buildPromptValue(formData.toneCustomGuidelinesSource, formData.toneCustomGuidelinesRef, formData.toneCustomGuidelines);
      return {
        ...(formData.toneModel && { model: `__REF__${formData.toneModel}` }),
        tone: formData.toneProfile,
        ...(toneGuidelinesValue && { custom_guidelines: toneGuidelinesValue }),
        num_retries: formData.toneRetries,
        fail_open: formData.toneFailOpen,
      };
    }
    
    // Conciseness Guardrail
    if (factory === 'dao_ai.middleware.create_conciseness_guardrail_middleware') {
      return {
        ...(formData.concisenessModel && { model: `__REF__${formData.concisenessModel}` }),
        max_length: formData.concisenessMaxLength,
        min_length: formData.concisenessMinLength,
        check_verbosity: formData.concisenessCheckVerbosity,
        num_retries: formData.concisenessRetries,
        fail_open: formData.concisenessFailOpen,
      };
    }
    
    // Tool Call Observability
    if (factory === 'dao_ai.middleware.create_tool_call_observability_middleware') {
      return {
        log_level: formData.observabilityLogLevel,
        include_args: formData.observabilityIncludeArgs,
        track_timing: formData.observabilityTrackTiming,
      };
    }
    
    // Todo List
    if (factory === 'dao_ai.middleware.create_todo_list_middleware') {
      const result: Record<string, any> = {};
      const todoPromptValue = buildPromptValue(formData.todoSystemPromptSource, formData.todoSystemPromptRef, formData.todoSystemPrompt);
      if (todoPromptValue) result.system_prompt = todoPromptValue;
      if (formData.todoToolDescription) result.tool_description = formData.todoToolDescription;
      return Object.keys(result).length > 0 ? result : undefined;
    }
    
    // Deep Summarization
    if (factory === 'dao_ai.middleware.create_deep_summarization_middleware') {
      const result: Record<string, any> = {
        ...(formData.deepSumModel && { model: `__REF__${formData.deepSumModel}` }),
        backend_type: formData.deepSumBackendType,
        trigger: [formData.deepSumTriggerType, formData.deepSumTriggerValue],
        keep: [formData.deepSumKeepType, formData.deepSumKeepValue],
        history_path_prefix: formData.deepSumHistoryPathPrefix,
      };
      if (formData.deepSumBackendType === 'filesystem' && formData.deepSumRootDir) {
        result.root_dir = formData.deepSumRootDir;
      }
      if (formData.deepSumBackendType === 'volume' && formData.deepSumVolumePath) {
        const basePath = formData.deepSumVolumePath;
        result.volume_path = formData.volumeSource === 'reference' && formData.volumeSubPath
          ? `${basePath}/${formData.volumeSubPath}` : basePath;
      }
      if (formData.deepSumTruncateArgsEnabled) {
        result.truncate_args_trigger = [formData.deepSumTruncateArgsTriggerType, formData.deepSumTruncateArgsTriggerValue];
        result.truncate_args_keep = [formData.deepSumTruncateArgsKeepType, formData.deepSumTruncateArgsKeepValue];
        result.truncate_args_max_length = formData.deepSumTruncateArgsMaxLength;
      }
      return result;
    }
    
    // LLM Tool Selector
    if (factory === 'dao_ai.middleware.create_llm_tool_selector_middleware') {
      const result: Record<string, any> = {
        ...(formData.toolSelectorModel && { model: `__REF__${formData.toolSelectorModel}` }),
        max_tools: formData.toolSelectorMaxTools,
      };
      if (formData.toolSelectorAlwaysInclude.length > 0) {
        result.always_include = formData.toolSelectorAlwaysInclude.map(ref => `__REF__${ref}`);
      }
      return result;
    }
    
    // Filesystem
    if (factory === 'dao_ai.middleware.create_filesystem_middleware') {
      const result: Record<string, any> = {
        backend_type: formData.filesystemBackendType,
      };
      if (formData.filesystemBackendType === 'filesystem' && formData.filesystemRootDir) {
        result.root_dir = formData.filesystemRootDir;
      }
      if (formData.filesystemBackendType === 'volume' && formData.filesystemVolumePath) {
        const basePath = formData.filesystemVolumePath;
        result.volume_path = formData.volumeSource === 'reference' && formData.volumeSubPath
          ? `${basePath}/${formData.volumeSubPath}` : basePath;
      }
      if (formData.filesystemEvictLimit !== null) {
        result.tool_token_limit_before_evict = formData.filesystemEvictLimit;
      }
      const fsPromptValue = buildPromptValue(formData.filesystemSystemPromptSource, formData.filesystemSystemPromptRef, formData.filesystemSystemPrompt);
      if (fsPromptValue) {
        result.system_prompt = fsPromptValue;
      }
      if (formData.filesystemCustomToolDescs) {
        try {
          result.custom_tool_descriptions = JSON.parse(formData.filesystemCustomToolDescs);
        } catch {
          // Invalid JSON, skip
        }
      }
      return result;
    }
    
    // SubAgent
    if (factory === 'dao_ai.middleware.create_subagent_middleware') {
      const result: Record<string, any> = {
        backend_type: formData.subagentBackendType,
      };
      if (formData.subagentBackendType === 'filesystem' && formData.subagentRootDir) {
        result.root_dir = formData.subagentRootDir;
      }
      if (formData.subagentBackendType === 'volume' && formData.subagentVolumePath) {
        const basePath = formData.subagentVolumePath;
        result.volume_path = formData.volumeSource === 'reference' && formData.volumeSubPath
          ? `${basePath}/${formData.volumeSubPath}` : basePath;
      }
      const subPromptValue = buildPromptValue(formData.subagentSystemPromptSource, formData.subagentSystemPromptRef, formData.subagentSystemPrompt);
      if (subPromptValue) {
        result.system_prompt = subPromptValue;
      }
      if (formData.subagentTaskDescription) {
        result.task_description = formData.subagentTaskDescription;
      }
      if (formData.subagentEntries.length > 0) {
        result.subagents = formData.subagentEntries.map(s => {
          const sPromptValue = buildPromptValue(s.systemPromptSource, s.systemPromptRef, s.systemPrompt);
          return {
            name: s.name,
            description: s.description,
            ...(sPromptValue && { system_prompt: sPromptValue }),
            ...(s.model && { model: `__REF__${s.model}` }),
          };
        });
      }
      return result;
    }
    
    // Agents Memory
    if (factory === 'dao_ai.middleware.create_agents_memory_middleware') {
      const result: Record<string, any> = {
        sources: formData.agentsMemorySources,
        backend_type: formData.agentsMemoryBackendType,
      };
      if (formData.agentsMemoryBackendType === 'filesystem' && formData.agentsMemoryRootDir) {
        result.root_dir = formData.agentsMemoryRootDir;
      }
      if (formData.agentsMemoryBackendType === 'volume' && formData.agentsMemoryVolumePath) {
        const basePath = formData.agentsMemoryVolumePath;
        result.volume_path = formData.volumeSource === 'reference' && formData.volumeSubPath
          ? `${basePath}/${formData.volumeSubPath}` : basePath;
      }
      return result;
    }
    
    // Skills
    if (factory === 'dao_ai.middleware.create_skills_middleware') {
      const result: Record<string, any> = {
        sources: formData.skillsSources,
        backend_type: formData.skillsBackendType,
      };
      if (formData.skillsBackendType === 'filesystem' && formData.skillsRootDir) {
        result.root_dir = formData.skillsRootDir;
      }
      if (formData.skillsBackendType === 'volume' && formData.skillsVolumePath) {
        const basePath = formData.skillsVolumePath;
        result.volume_path = formData.volumeSource === 'reference' && formData.volumeSubPath
          ? `${basePath}/${formData.volumeSubPath}` : basePath;
      }
      return result;
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

  const toggleExpanded = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedMiddleware(expandedMiddleware === key ? null : key);
  };

  const getMiddlewareInfo = (name: string) => {
    return PRECONFIGURED_MIDDLEWARE.find(pm => pm.value === normalizeMiddlewareName(name));
  };

  const getReferences = (_key: string): string[] => {
    // TODO: Implement proper reference tracking for middleware
    // For now, return empty array since safeDelete handles validation
    return [];
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
          {/* Render middleware by known categories */}
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
                
                <div className="space-y-2">
                  {categoryMiddleware.map(([key, mw]) => {
                    const info = getMiddlewareInfo(mw.name);
                    const refs = getReferences(key);
                    const isExpanded = expandedMiddleware === key;
                    
                    return (
                      <div
                        key={key}
                        className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-800/70 transition-colors"
                        onClick={() => handleEdit(key)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-start space-x-3 flex-1 min-w-0">
                            <Layers className="w-4 h-4 text-purple-400 flex-shrink-0 mt-1" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 flex-wrap">
                                <p className="font-medium text-slate-200 truncate">{key}</p>
                                {refs.length > 0 && (
                                  <Badge variant="warning">
                                    {refs.length} ref{refs.length !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 truncate">
                                {info?.label || 'Custom Factory'}
                              </p>
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
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                safeDelete('Middleware', key, () => removeMiddleware(key));
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
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
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          
          {/* Render middleware that don't match any known category (custom/other) */}
          {(() => {
            const uncategorizedMiddleware = Object.entries(middleware).filter(([, mw]) => {
              const info = getMiddlewareInfo(mw.name);
              return !info || !info.category;
            });
            
            if (uncategorizedMiddleware.length === 0) return null;
            
            return (
              <div>
                <div className="flex items-center space-x-3 mb-3">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                    Other
                  </h3>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
                </div>
                
                <div className="space-y-2">
                  {uncategorizedMiddleware.map(([key, mw]) => {
                    const refs = getReferences(key);
                    const isExpanded = expandedMiddleware === key;
                    
                    // Extract a friendly label from the factory name
                    const factoryLabel = mw.name.split('.').pop()?.replace(/^create_/, '').replace(/_/g, ' ').replace(/middleware$/i, '').trim() || 'Custom Factory';
                    const displayLabel = factoryLabel.charAt(0).toUpperCase() + factoryLabel.slice(1);
                    
                    return (
                      <div
                        key={key}
                        className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-800/70 transition-colors"
                        onClick={() => handleEdit(key)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-start space-x-3 flex-1 min-w-0">
                            <Layers className="w-4 h-4 text-orange-400 flex-shrink-0 mt-1" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 flex-wrap">
                                <p className="font-medium text-slate-200 truncate">{key}</p>
                                <Badge variant="info">Custom</Badge>
                                {refs.length > 0 && (
                                  <Badge variant="warning">
                                    {refs.length} ref{refs.length !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 truncate">
                                {displayLabel}
                              </p>
                              <p className="text-xs text-slate-600 truncate font-mono">
                                {mw.name}
                              </p>
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
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                safeDelete('Middleware', key, () => removeMiddleware(key));
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
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
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
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
                        onClick={() => {
                          // Generate default reference name if not editing existing middleware
                          const newRefName = editingMiddleware 
                            ? formData.refName 
                            : generateDefaultRefName(mw.value);
                          setFormData({ 
                            ...defaultFormData,
                            refName: newRefName,
                            selectedFactory: mw.value,
                          });
                        }}
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
                  <MiddlewarePromptField
                    label="Evaluation Prompt"
                    value={formData.guardrailPrompt}
                    source={formData.guardrailPromptSource}
                    promptRef={formData.guardrailPromptRef}
                    middlewareType={formData.selectedFactory}
                    middlewareName={formData.guardrailName}
                    placeholder="e.g., Evaluate if the response is professional and helpful."
                    hint="Criteria for evaluating responses"
                    required
                    rows={3}
                    promptOptions={promptOptions}
                    prompts={prompts}
                    onValueChange={(v) => setFormData({ ...formData, guardrailPrompt: v })}
                    onSourceChange={(s) => setFormData({ ...formData, guardrailPromptSource: s, ...(s === 'configured' ? { guardrailPrompt: '' } : { guardrailPromptRef: '' }) })}
                    onRefChange={(r) => setFormData({ ...formData, guardrailPromptRef: r })}
                  />
                  <Input
                    label="Max Retries"
                    type="number"
                    value={formData.guardrailRetries}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, guardrailRetries: parseInt(e.target.value) || 3 })
                    }
                    hint="Maximum retry attempts"
                  />
                  <Input
                    label="Max Context Length"
                    type="number"
                    value={formData.guardrailMaxContextLength}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, guardrailMaxContextLength: parseInt(e.target.value) || 8000 })
                    }
                    hint="Max character length for extracted tool context"
                  />
                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="guardrailFailOpen"
                      checked={formData.guardrailFailOpen}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setFormData({ ...formData, guardrailFailOpen: e.target.checked })
                      }
                      className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                    />
                    <label htmlFor="guardrailFailOpen" className="text-sm text-slate-300">
                      Fail Open (let responses through when the judge call fails)
                    </label>
                  </div>
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
                <div className="space-y-4">
                  <Select
                    label="Safety Model (Optional)"
                    options={llmOptions}
                    value={formData.safetyModel}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, safetyModel: e.target.value })
                    }
                    hint="LLM for safety evaluation (optional)"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="safetyFailOpen"
                      checked={formData.safetyFailOpen}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setFormData({ ...formData, safetyFailOpen: e.target.checked })
                      }
                      className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                    />
                    <label htmlFor="safetyFailOpen" className="text-sm text-slate-300">
                      Fail Open (let responses through when the safety check fails)
                    </label>
                  </div>
                </div>
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
                    placeholder="Tool execution pending approval"
                    hint="Prefix for the human review description"
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
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="suggestAllowOneRetry"
                      checked={formData.suggestAllowOneRetry}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setFormData({ ...formData, suggestAllowOneRetry: e.target.checked })
                      }
                      className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                    />
                    <label htmlFor="suggestAllowOneRetry" className="text-sm text-slate-300">
                      Allow One Retry
                    </label>
                  </div>
                  <Select
                    label="Log Level"
                    options={[
                      { value: 'warning', label: 'Warning' },
                      { value: 'info', label: 'Info' },
                      { value: 'debug', label: 'Debug' },
                    ]}
                    value={formData.suggestLogLevel}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, suggestLogLevel: e.target.value })
                    }
                    hint="Log level for constraint feedback"
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
                      label="Reward Function"
                      value={formData.refineRewardFn}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, refineRewardFn: e.target.value })
                      }
                      placeholder="e.g., my_module.my_reward_fn"
                      required
                      hint="Python reference to a reward function that scores responses (0.0 to 1.0)"
                    />
                  </div>
                  <Input
                    label="Threshold"
                    type="number"
                    value={formData.refineThreshold}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, refineThreshold: parseFloat(e.target.value) || 0.8 })
                    }
                    placeholder="0.8"
                    hint="Score threshold to stop early (0.0 - 1.0)"
                  />
                  <Input
                    label="Max Iterations"
                    type="number"
                    value={formData.refineMaxIterations}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, refineMaxIterations: parseInt(e.target.value) || 3 })
                    }
                    hint="Maximum improvement iterations"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="refineSelectBest"
                      checked={formData.refineSelectBest}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setFormData({ ...formData, refineSelectBest: e.target.checked })
                      }
                      className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                    />
                    <label htmlFor="refineSelectBest" className="text-sm text-slate-300">
                      Select Best Response
                    </label>
                  </div>
                </div>
              )}
              
              {/* Tool Call Limit Middleware */}
              {formData.selectedFactory === 'dao_ai.middleware.create_tool_call_limit_middleware' && (
                <div className="space-y-4">
                  <Select
                    label="Tool to Limit"
                    options={[
                      { value: '', label: 'All Tools (Global Limit)' },
                      ...Object.entries(tools).map(([key, tool]) => ({
                        value: key,
                        label: `${key} (${tool.name})`,
                      })),
                    ]}
                    value={formData.toolCallLimitTool}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, toolCallLimitTool: e.target.value })
                    }
                    hint="Select a specific tool or leave empty for global limit"
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Thread Limit"
                      type="number"
                      value={formData.toolCallLimitThreadLimit ?? ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ 
                          ...formData, 
                          toolCallLimitThreadLimit: e.target.value ? parseInt(e.target.value) : null 
                        })
                      }
                      placeholder="No limit"
                      hint="Max calls per thread (requires checkpointer)"
                    />
                    <Input
                      label="Run Limit"
                      type="number"
                      value={formData.toolCallLimitRunLimit ?? ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ 
                          ...formData, 
                          toolCallLimitRunLimit: e.target.value ? parseInt(e.target.value) : null 
                        })
                      }
                      placeholder="No limit"
                      hint="Max calls per single run"
                    />
                  </div>
                  
                  <Select
                    label="Exit Behavior"
                    options={[
                      { value: 'continue', label: 'Continue - Log and skip further calls' },
                      { value: 'error', label: 'Error - Raise exception on limit' },
                      { value: 'end', label: 'End - Gracefully terminate agent' },
                    ]}
                    value={formData.toolCallLimitExitBehavior}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, toolCallLimitExitBehavior: e.target.value as 'continue' | 'error' | 'end' })
                    }
                    hint="What happens when limit is reached"
                  />
                </div>
              )}
              
              {/* Model Call Limit Middleware */}
              {formData.selectedFactory === 'dao_ai.middleware.create_model_call_limit_middleware' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Thread Limit"
                      type="number"
                      value={formData.modelCallLimitThreadLimit ?? ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ 
                          ...formData, 
                          modelCallLimitThreadLimit: e.target.value ? parseInt(e.target.value) : null 
                        })
                      }
                      placeholder="No limit"
                      hint="Max LLM calls per thread (requires checkpointer)"
                    />
                    <Input
                      label="Run Limit"
                      type="number"
                      value={formData.modelCallLimitRunLimit ?? ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ 
                          ...formData, 
                          modelCallLimitRunLimit: e.target.value ? parseInt(e.target.value) : null 
                        })
                      }
                      placeholder="No limit"
                      hint="Max LLM calls per single run"
                    />
                  </div>
                  
                  <Select
                    label="Exit Behavior"
                    options={[
                      { value: 'error', label: 'Error - Raise exception on limit' },
                      { value: 'end', label: 'End - Gracefully terminate agent' },
                    ]}
                    value={formData.modelCallLimitExitBehavior}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, modelCallLimitExitBehavior: e.target.value as 'error' | 'end' })
                    }
                    hint="What happens when limit is reached"
                  />
                </div>
              )}
              
              {/* Tool Retry Middleware */}
              {formData.selectedFactory === 'dao_ai.middleware.create_tool_retry_middleware' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Input
                      label="Max Retries"
                      type="number"
                      value={formData.toolRetryMaxRetries}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, toolRetryMaxRetries: parseInt(e.target.value) || 3 })
                      }
                      hint="Maximum retry attempts"
                    />
                    <Input
                      label="Backoff Factor"
                      type="number"
                      step="0.1"
                      value={formData.toolRetryBackoffFactor}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, toolRetryBackoffFactor: parseFloat(e.target.value) || 2.0 })
                      }
                      hint="Exponential backoff multiplier"
                    />
                    <Input
                      label="Initial Delay (s)"
                      type="number"
                      step="0.1"
                      value={formData.toolRetryInitialDelay}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, toolRetryInitialDelay: parseFloat(e.target.value) || 1.0 })
                      }
                      hint="First retry delay in seconds"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Max Delay (s)"
                      type="number"
                      step="0.1"
                      value={formData.toolRetryMaxDelay ?? ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ 
                          ...formData, 
                          toolRetryMaxDelay: e.target.value ? parseFloat(e.target.value) : null 
                        })
                      }
                      placeholder="No maximum"
                      hint="Cap on delay between retries"
                    />
                    <div className="flex items-end">
                      <label className="flex items-center space-x-2 text-sm text-slate-300 pb-2">
                        <input
                          type="checkbox"
                          checked={formData.toolRetryJitter}
                          onChange={(e) => setFormData({ ...formData, toolRetryJitter: e.target.checked })}
                          className="rounded border-slate-600 bg-slate-700"
                        />
                        <span>Add jitter to delays</span>
                      </label>
                    </div>
                  </div>
                  
                  <Select
                    label="On Failure"
                    options={[
                      { value: 'continue', label: 'Continue - Proceed with null result' },
                      { value: 'error', label: 'Error - Raise exception after retries' },
                    ]}
                    value={formData.toolRetryOnFailure}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, toolRetryOnFailure: e.target.value as 'continue' | 'error' })
                    }
                    hint="What happens after all retries fail"
                  />
                  
                  <MultiSelect
                    label="Tools to Retry"
                    options={Object.entries(tools).map(([key, tool]) => ({
                      value: key,
                      label: `${key} (${tool.name})`,
                    }))}
                    value={formData.toolRetryTools}
                    onChange={(value) => setFormData({ ...formData, toolRetryTools: value })}
                    placeholder="All tools (leave empty)"
                    hint="Select specific tools to retry, or leave empty for all tools"
                  />
                </div>
              )}
              
              {/* Model Retry Middleware */}
              {formData.selectedFactory === 'dao_ai.middleware.create_model_retry_middleware' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Input
                      label="Max Retries"
                      type="number"
                      value={formData.modelRetryMaxRetries}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, modelRetryMaxRetries: parseInt(e.target.value) || 3 })
                      }
                      hint="Maximum retry attempts"
                    />
                    <Input
                      label="Backoff Factor"
                      type="number"
                      step="0.1"
                      value={formData.modelRetryBackoffFactor}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, modelRetryBackoffFactor: parseFloat(e.target.value) || 2.0 })
                      }
                      hint="Exponential backoff multiplier"
                    />
                    <Input
                      label="Initial Delay (s)"
                      type="number"
                      step="0.1"
                      value={formData.modelRetryInitialDelay}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, modelRetryInitialDelay: parseFloat(e.target.value) || 1.0 })
                      }
                      hint="First retry delay in seconds"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Max Delay (s)"
                      type="number"
                      step="0.1"
                      value={formData.modelRetryMaxDelay ?? ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ 
                          ...formData, 
                          modelRetryMaxDelay: e.target.value ? parseFloat(e.target.value) : null 
                        })
                      }
                      placeholder="No maximum"
                      hint="Cap on delay between retries"
                    />
                    <div className="flex items-end">
                      <label className="flex items-center space-x-2 text-sm text-slate-300 pb-2">
                        <input
                          type="checkbox"
                          checked={formData.modelRetryJitter}
                          onChange={(e) => setFormData({ ...formData, modelRetryJitter: e.target.checked })}
                          className="rounded border-slate-600 bg-slate-700"
                        />
                        <span>Add jitter to delays</span>
                      </label>
                    </div>
                  </div>
                  
                  <Select
                    label="On Failure"
                    options={[
                      { value: 'continue', label: 'Continue - Return error message' },
                      { value: 'error', label: 'Error - Raise exception after retries' },
                    ]}
                    value={formData.modelRetryOnFailure}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, modelRetryOnFailure: e.target.value as 'continue' | 'error' })
                    }
                    hint="What happens after all retries fail"
                  />
                </div>
              )}
              
              {/* Context Editing Middleware */}
              {formData.selectedFactory === 'dao_ai.middleware.create_context_editing_middleware' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Input
                      label="Trigger Threshold"
                      type="number"
                      value={formData.contextEditingTrigger}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, contextEditingTrigger: parseInt(e.target.value) || 100000 })
                      }
                      hint="Token count that triggers clearing"
                    />
                    <Input
                      label="Keep Recent"
                      type="number"
                      value={formData.contextEditingKeep}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, contextEditingKeep: parseInt(e.target.value) || 3 })
                      }
                      hint="Number of recent tool results to keep"
                    />
                    <Input
                      label="Clear At Least"
                      type="number"
                      value={formData.contextEditingClearAtLeast}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, contextEditingClearAtLeast: parseInt(e.target.value) || 0 })
                      }
                      hint="Minimum tokens to reclaim"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Placeholder Text"
                      value={formData.contextEditingPlaceholder}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, contextEditingPlaceholder: e.target.value })
                      }
                      placeholder="[cleared]"
                      hint="Text to replace cleared content"
                    />
                    <Select
                      label="Token Count Method"
                      options={[
                        { value: 'approximate', label: 'Approximate (faster)' },
                        { value: 'model', label: 'Model (accurate)' },
                      ]}
                      value={formData.contextEditingTokenCountMethod}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, contextEditingTokenCountMethod: e.target.value as 'approximate' | 'model' })
                      }
                      hint="How to count tokens"
                    />
                  </div>
                  
                  <div className="flex items-center">
                    <label className="flex items-center space-x-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.contextEditingClearToolInputs}
                        onChange={(e) => setFormData({ ...formData, contextEditingClearToolInputs: e.target.checked })}
                        className="rounded border-slate-600 bg-slate-700"
                      />
                      <span>Also clear tool call arguments</span>
                    </label>
                  </div>
                  
                  <MultiSelect
                    label="Exclude Tools"
                    options={Object.entries(tools).map(([key, tool]) => ({
                      value: key,
                      label: `${key} (${tool.name})`,
                    }))}
                    value={formData.contextEditingExcludeTools}
                    onChange={(value) => setFormData({ ...formData, contextEditingExcludeTools: value })}
                    placeholder="None (clear all tool outputs)"
                    hint="Tool outputs that should never be cleared"
                  />
                </div>
              )}
              
              {/* PII Middleware */}
              {formData.selectedFactory === 'dao_ai.middleware.create_pii_middleware' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="PII Type"
                      options={[
                        { value: 'email', label: 'Email Addresses' },
                        { value: 'phone', label: 'Phone Numbers' },
                        { value: 'ssn', label: 'Social Security Numbers' },
                        { value: 'credit_card', label: 'Credit Card Numbers' },
                        { value: 'ip_address', label: 'IP Addresses' },
                        { value: 'custom', label: 'Custom (requires detector)' },
                      ]}
                      value={formData.piiType}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, piiType: e.target.value })
                      }
                      required
                      hint="Type of PII to detect"
                    />
                    <Select
                      label="Strategy"
                      options={[
                        { value: 'redact', label: 'Redact - Replace with [REDACTED]' },
                        { value: 'mask', label: 'Mask - Partial masking (e.g., ****1234)' },
                        { value: 'hash', label: 'Hash - Replace with hash value' },
                        { value: 'block', label: 'Block - Reject the request entirely' },
                      ]}
                      value={formData.piiStrategy}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, piiStrategy: e.target.value as 'redact' | 'mask' | 'hash' | 'block' })
                      }
                      hint="How to handle detected PII"
                    />
                  </div>
                  
                  <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                    <label className="block text-sm font-medium text-slate-300 mb-3">Apply To</label>
                    <div className="flex items-center space-x-6">
                      <label className="flex items-center space-x-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={formData.piiApplyToInput}
                          onChange={(e) => setFormData({ ...formData, piiApplyToInput: e.target.checked })}
                          className="rounded border-slate-600 bg-slate-700"
                        />
                        <span>User Input</span>
                      </label>
                      <label className="flex items-center space-x-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={formData.piiApplyToOutput}
                          onChange={(e) => setFormData({ ...formData, piiApplyToOutput: e.target.checked })}
                          className="rounded border-slate-600 bg-slate-700"
                        />
                        <span>Agent Output</span>
                      </label>
                      <label className="flex items-center space-x-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={formData.piiApplyToToolResults}
                          onChange={(e) => setFormData({ ...formData, piiApplyToToolResults: e.target.checked })}
                          className="rounded border-slate-600 bg-slate-700"
                        />
                        <span>Tool Results</span>
                      </label>
                    </div>
                  </div>
                  
                  {formData.piiType === 'custom' && (
                    <p className="text-xs text-amber-400 bg-amber-900/20 p-2 rounded-lg border border-amber-700/30">
                      ⚠️ Custom PII types require a Python detector function. Configure this through custom middleware or programmatically.
                    </p>
                  )}
                </div>
              )}
              
              {/* Veracity Guardrail */}
              {formData.selectedFactory === 'dao_ai.middleware.create_veracity_guardrail_middleware' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700/30">
                    Checks whether the agent's response is grounded in tool/retrieval context. Uses a built-in expert prompt — no custom prompt needed. Automatically skips when no tool context is present.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Judge Model"
                      options={llmOptions}
                      value={formData.veracityModel}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, veracityModel: e.target.value })
                      }
                      required
                      hint="LLM for veracity evaluation"
                    />
                    <Input
                      label="Max Retries"
                      type="number"
                      value={formData.veracityRetries}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, veracityRetries: parseInt(e.target.value) || 2 })
                      }
                      hint="Maximum retry attempts (default: 2)"
                    />
                    <Input
                      label="Max Context Length"
                      type="number"
                      value={formData.veracityMaxContextLength}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, veracityMaxContextLength: parseInt(e.target.value) || 8000 })
                      }
                      hint="Max chars for extracted tool context"
                    />
                    <div className="flex items-end">
                      <label className="flex items-center space-x-2 text-sm text-slate-300 pb-2">
                        <input
                          type="checkbox"
                          checked={formData.veracityFailOpen}
                          onChange={(e) => setFormData({ ...formData, veracityFailOpen: e.target.checked })}
                          className="rounded border-slate-600 bg-slate-700"
                        />
                        <span>Fail open (pass on error)</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Relevance Guardrail */}
              {formData.selectedFactory === 'dao_ai.middleware.create_relevance_guardrail_middleware' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700/30">
                    Checks whether the agent's response directly addresses the user's query. Uses a built-in expert prompt — no custom prompt needed.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Judge Model"
                      options={llmOptions}
                      value={formData.relevanceModel}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, relevanceModel: e.target.value })
                      }
                      required
                      hint="LLM for relevance evaluation"
                    />
                    <Input
                      label="Max Retries"
                      type="number"
                      value={formData.relevanceRetries}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, relevanceRetries: parseInt(e.target.value) || 2 })
                      }
                      hint="Maximum retry attempts (default: 2)"
                    />
                  </div>
                  <label className="flex items-center space-x-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={formData.relevanceFailOpen}
                      onChange={(e) => setFormData({ ...formData, relevanceFailOpen: e.target.checked })}
                      className="rounded border-slate-600 bg-slate-700"
                    />
                    <span>Fail open (pass on error)</span>
                  </label>
                </div>
              )}
              
              {/* Tone Guardrail */}
              {formData.selectedFactory === 'dao_ai.middleware.create_tone_guardrail_middleware' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700/30">
                    Validates the response matches a configurable tone profile. Select a preset or provide custom guidelines.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Judge Model"
                      options={llmOptions}
                      value={formData.toneModel}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, toneModel: e.target.value })
                      }
                      required
                      hint="LLM for tone evaluation"
                    />
                    <Select
                      label="Tone Profile"
                      options={[
                        { value: 'professional', label: 'Professional' },
                        { value: 'casual', label: 'Casual' },
                        { value: 'technical', label: 'Technical' },
                        { value: 'empathetic', label: 'Empathetic' },
                        { value: 'concise', label: 'Concise' },
                      ]}
                      value={formData.toneProfile}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, toneProfile: e.target.value })
                      }
                      hint="Preset tone profile"
                    />
                    <MiddlewarePromptField
                      label="Custom Guidelines (Optional)"
                      value={formData.toneCustomGuidelines}
                      source={formData.toneCustomGuidelinesSource}
                      promptRef={formData.toneCustomGuidelinesRef}
                      middlewareType={formData.selectedFactory}
                      middlewareName={formData.refName}
                      placeholder="Custom tone guidelines override the preset profile..."
                      hint="Overrides the preset profile if provided"
                      rows={3}
                      promptOptions={promptOptions}
                      prompts={prompts}
                      onValueChange={(v) => setFormData({ ...formData, toneCustomGuidelines: v })}
                      onSourceChange={(s) => setFormData({ ...formData, toneCustomGuidelinesSource: s, ...(s === 'configured' ? { toneCustomGuidelines: '' } : { toneCustomGuidelinesRef: '' }) })}
                      onRefChange={(r) => setFormData({ ...formData, toneCustomGuidelinesRef: r })}
                    />
                    <Input
                      label="Max Retries"
                      type="number"
                      value={formData.toneRetries}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, toneRetries: parseInt(e.target.value) || 2 })
                      }
                      hint="Maximum retry attempts (default: 2)"
                    />
                    <div className="flex items-end">
                      <label className="flex items-center space-x-2 text-sm text-slate-300 pb-2">
                        <input
                          type="checkbox"
                          checked={formData.toneFailOpen}
                          onChange={(e) => setFormData({ ...formData, toneFailOpen: e.target.checked })}
                          className="rounded border-slate-600 bg-slate-700"
                        />
                        <span>Fail open (pass on error)</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Conciseness Guardrail */}
              {formData.selectedFactory === 'dao_ai.middleware.create_conciseness_guardrail_middleware' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700/30">
                    Hybrid deterministic + LLM conciseness check. Performs a fast length check first, then optionally evaluates verbosity using the judge LLM.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Judge Model"
                      options={llmOptions}
                      value={formData.concisenessModel}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, concisenessModel: e.target.value })
                      }
                      required
                      hint="LLM for verbosity evaluation"
                    />
                    <Input
                      label="Max Retries"
                      type="number"
                      value={formData.concisenessRetries}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, concisenessRetries: parseInt(e.target.value) || 2 })
                      }
                      hint="Maximum retry attempts (default: 2)"
                    />
                    <Input
                      label="Max Length (chars)"
                      type="number"
                      value={formData.concisenessMaxLength}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, concisenessMaxLength: parseInt(e.target.value) || 3000 })
                      }
                      hint="Maximum response character length"
                    />
                    <Input
                      label="Min Length (chars)"
                      type="number"
                      value={formData.concisenessMinLength}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, concisenessMinLength: parseInt(e.target.value) || 20 })
                      }
                      hint="Minimum response character length"
                    />
                  </div>
                  <div className="flex items-center space-x-6">
                    <label className="flex items-center space-x-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.concisenessCheckVerbosity}
                        onChange={(e) => setFormData({ ...formData, concisenessCheckVerbosity: e.target.checked })}
                        className="rounded border-slate-600 bg-slate-700"
                      />
                      <span>Check verbosity (LLM evaluation)</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.concisenessFailOpen}
                        onChange={(e) => setFormData({ ...formData, concisenessFailOpen: e.target.checked })}
                        className="rounded border-slate-600 bg-slate-700"
                      />
                      <span>Fail open (pass on error)</span>
                    </label>
                  </div>
                </div>
              )}
              
              {/* Tool Call Observability */}
              {formData.selectedFactory === 'dao_ai.middleware.create_tool_call_observability_middleware' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Log Level"
                      options={[
                        { value: 'DEBUG', label: 'DEBUG' },
                        { value: 'INFO', label: 'INFO' },
                        { value: 'WARNING', label: 'WARNING' },
                      ]}
                      value={formData.observabilityLogLevel}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, observabilityLogLevel: e.target.value })
                      }
                      hint="Logging level for tool calls"
                    />
                  </div>
                  <div className="flex items-center space-x-6">
                    <label className="flex items-center space-x-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.observabilityIncludeArgs}
                        onChange={(e) => setFormData({ ...formData, observabilityIncludeArgs: e.target.checked })}
                        className="rounded border-slate-600 bg-slate-700"
                      />
                      <span>Include tool call arguments</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.observabilityTrackTiming}
                        onChange={(e) => setFormData({ ...formData, observabilityTrackTiming: e.target.checked })}
                        className="rounded border-slate-600 bg-slate-700"
                      />
                      <span>Track execution timing</span>
                    </label>
                  </div>
                </div>
              )}
              
              {/* Todo List */}
              {formData.selectedFactory === 'dao_ai.middleware.create_todo_list_middleware' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700/30">
                    Provides agents with a write_todos tool for task planning and tracking. Both fields are optional.
                  </p>
                  <MiddlewarePromptField
                    label="System Prompt (Optional)"
                    value={formData.todoSystemPrompt}
                    source={formData.todoSystemPromptSource}
                    promptRef={formData.todoSystemPromptRef}
                    middlewareType={formData.selectedFactory}
                    middlewareName={formData.refName}
                    placeholder="Custom system prompt to guide todo usage..."
                    hint="If empty, uses the built-in prompt"
                    rows={3}
                    promptOptions={promptOptions}
                    prompts={prompts}
                    onValueChange={(v) => setFormData({ ...formData, todoSystemPrompt: v })}
                    onSourceChange={(s) => setFormData({ ...formData, todoSystemPromptSource: s, ...(s === 'configured' ? { todoSystemPrompt: '' } : { todoSystemPromptRef: '' }) })}
                    onRefChange={(r) => setFormData({ ...formData, todoSystemPromptRef: r })}
                  />
                  <Input
                    label="Tool Description (Optional)"
                    value={formData.todoToolDescription}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, todoToolDescription: e.target.value })
                    }
                    placeholder="Custom description for the write_todos tool..."
                    hint="If empty, uses the built-in description"
                  />
                </div>
              )}
              
              {/* Deep Summarization */}
              {formData.selectedFactory === 'dao_ai.middleware.create_deep_summarization_middleware' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700/30">
                    Advanced summarization with backend offloading, tool argument truncation, and fraction-based triggers.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Summary Model"
                      options={llmOptions}
                      value={formData.deepSumModel}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, deepSumModel: e.target.value })
                      }
                      required
                      hint="LLM for generating summaries"
                    />
                    <Select
                      label="Backend Type"
                      options={[
                        { value: 'state', label: 'State (ephemeral)' },
                        { value: 'filesystem', label: 'Filesystem (disk)' },
                        { value: 'store', label: 'Store (persistent)' },
                        { value: 'volume', label: 'Volume (Databricks UC)' },
                      ]}
                      value={formData.deepSumBackendType}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, deepSumBackendType: e.target.value })
                      }
                      hint="Backend for storing offloaded history"
                    />
                  </div>
                  {formData.deepSumBackendType === 'filesystem' && (
                    <Input
                      label="Root Directory"
                      value={formData.deepSumRootDir}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, deepSumRootDir: e.target.value })
                      }
                      placeholder="/workspace"
                      required
                      hint="Required for filesystem backend"
                    />
                  )}
                  {formData.deepSumBackendType === 'volume' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-300">Volume Path</label>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, volumeSource: 'reference', deepSumVolumePath: '', volumeRef: '', volumeSubPath: '' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.volumeSource === 'reference' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            Select
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, volumeSource: 'manual', deepSumVolumePath: '', volumeRef: '', volumeSubPath: '' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.volumeSource === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            Manual
                          </button>
                        </div>
                      </div>
                      {formData.volumeSource === 'reference' ? (
                        <div className="space-y-2">
                          <Select
                            value={formData.volumeRef}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                              const key = e.target.value;
                              setFormData({ ...formData, volumeRef: key, deepSumVolumePath: getVolumePathFromKey(key) });
                            }}
                            options={[
                              { value: '', label: 'Select volume...' },
                              ...volumeOptions.map(v => ({ value: v.value, label: v.label })),
                            ]}
                          />
                          <p className="text-xs text-slate-500">
                            {volumeOptions.length === 0 ? 'No volumes configured — add one in the Resources section.' : `Select from ${volumeOptions.length} configured volume${volumeOptions.length !== 1 ? 's' : ''}.`}
                          </p>
                          <Input
                            value={formData.volumeSubPath}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, volumeSubPath: e.target.value })
                            }
                            placeholder="optional/sub/path"
                          />
                          <p className="text-xs text-slate-500">
                            Optional path within the volume (e.g., &quot;agents/workspace&quot;).
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            value={formData.deepSumVolumePath}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, deepSumVolumePath: e.target.value })
                            }
                            placeholder="/Volumes/catalog/schema/volume"
                            required
                          />
                          <p className="text-xs text-slate-500">
                            Enter the full UC Volumes path directly.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-300">Trigger Threshold</label>
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          options={[
                            { value: 'tokens', label: 'Tokens' },
                            { value: 'messages', label: 'Messages' },
                            { value: 'fraction', label: 'Fraction' },
                          ]}
                          value={formData.deepSumTriggerType}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                            setFormData({ ...formData, deepSumTriggerType: e.target.value })
                          }
                        />
                        <Input
                          type="number"
                          step={formData.deepSumTriggerType === 'fraction' ? '0.01' : '1'}
                          value={formData.deepSumTriggerValue}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => 
                            setFormData({ ...formData, deepSumTriggerValue: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-300">Keep After Summary</label>
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          options={[
                            { value: 'messages', label: 'Messages' },
                            { value: 'tokens', label: 'Tokens' },
                            { value: 'fraction', label: 'Fraction' },
                          ]}
                          value={formData.deepSumKeepType}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                            setFormData({ ...formData, deepSumKeepType: e.target.value })
                          }
                        />
                        <Input
                          type="number"
                          step={formData.deepSumKeepType === 'fraction' ? '0.01' : '1'}
                          value={formData.deepSumKeepValue}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => 
                            setFormData({ ...formData, deepSumKeepValue: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <Input
                    label="History Path Prefix"
                    value={formData.deepSumHistoryPathPrefix}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, deepSumHistoryPathPrefix: e.target.value })
                    }
                    placeholder="/conversation_history"
                    hint="Path prefix for stored conversation history"
                  />
                  <div className="space-y-3 p-3 bg-slate-900/30 rounded-lg border border-slate-700/30">
                    <label className="flex items-center space-x-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={formData.deepSumTruncateArgsEnabled}
                        onChange={(e) => setFormData({ ...formData, deepSumTruncateArgsEnabled: e.target.checked })}
                        className="rounded border-slate-600 bg-slate-700"
                      />
                      <span className="font-medium">Enable argument truncation</span>
                    </label>
                    {formData.deepSumTruncateArgsEnabled && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                          <Select
                            label="Trigger Type"
                            options={[
                              { value: 'messages', label: 'Messages' },
                              { value: 'tokens', label: 'Tokens' },
                              { value: 'fraction', label: 'Fraction' },
                            ]}
                            value={formData.deepSumTruncateArgsTriggerType}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                              setFormData({ ...formData, deepSumTruncateArgsTriggerType: e.target.value })
                            }
                          />
                          <Input
                            label="Trigger Value"
                            type="number"
                            step={formData.deepSumTruncateArgsTriggerType === 'fraction' ? '0.01' : '1'}
                            value={formData.deepSumTruncateArgsTriggerValue}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => 
                              setFormData({ ...formData, deepSumTruncateArgsTriggerValue: parseFloat(e.target.value) || 0 })
                            }
                          />
                          <Input
                            label="Max Arg Length"
                            type="number"
                            value={formData.deepSumTruncateArgsMaxLength}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => 
                              setFormData({ ...formData, deepSumTruncateArgsMaxLength: parseInt(e.target.value) || 2000 })
                            }
                            hint="Max chars per arg"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Select
                            label="Keep Type"
                            options={[
                              { value: 'messages', label: 'Messages' },
                              { value: 'tokens', label: 'Tokens' },
                            ]}
                            value={formData.deepSumTruncateArgsKeepType}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                              setFormData({ ...formData, deepSumTruncateArgsKeepType: e.target.value })
                            }
                            hint="Unit for keep threshold"
                          />
                          <Input
                            label="Keep Value"
                            type="number"
                            value={formData.deepSumTruncateArgsKeepValue}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => 
                              setFormData({ ...formData, deepSumTruncateArgsKeepValue: parseInt(e.target.value) || 20 })
                            }
                            hint="Recent items to preserve after truncation"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* LLM Tool Selector */}
              {formData.selectedFactory === 'dao_ai.middleware.create_llm_tool_selector_middleware' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700/30">
                    Uses an LLM to select the most relevant tools per query. Ideal for agents with many tools (10+).
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Selector Model"
                      options={llmOptions}
                      value={formData.toolSelectorModel}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, toolSelectorModel: e.target.value })
                      }
                      required
                      hint="Fast model recommended (e.g., gpt-4o-mini)"
                    />
                    <Input
                      label="Max Tools"
                      type="number"
                      min="1"
                      value={formData.toolSelectorMaxTools}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, toolSelectorMaxTools: parseInt(e.target.value) || 3 })
                      }
                      hint="Max tools selected per query"
                    />
                  </div>
                  <MultiSelect
                    label="Always Include Tools"
                    options={Object.entries(tools).map(([key, tool]) => ({
                      value: key,
                      label: `${key} (${tool.name})`,
                    }))}
                    value={formData.toolSelectorAlwaysInclude}
                    onChange={(value) => setFormData({ ...formData, toolSelectorAlwaysInclude: value })}
                    placeholder="None (all tools eligible for filtering)"
                    hint="Tools that should always be available regardless of LLM selection"
                  />
                </div>
              )}
              
              {/* Filesystem */}
              {formData.selectedFactory === 'dao_ai.middleware.create_filesystem_middleware' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700/30">
                    Provides agents with filesystem tools: ls, read_file, write_file, edit_file, glob, grep. Auto-evicts large tool results.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Backend Type"
                      options={[
                        { value: 'state', label: 'State (ephemeral)' },
                        { value: 'filesystem', label: 'Filesystem (disk)' },
                        { value: 'store', label: 'Store (persistent)' },
                        { value: 'volume', label: 'Volume (Databricks UC)' },
                      ]}
                      value={formData.filesystemBackendType}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, filesystemBackendType: e.target.value })
                      }
                      hint="Backend for file storage"
                    />
                    <Input
                      label="Eviction Token Limit"
                      type="number"
                      value={formData.filesystemEvictLimit ?? ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, filesystemEvictLimit: e.target.value ? parseInt(e.target.value) : null })
                      }
                      placeholder="20000"
                      hint="Token limit before evicting results to filesystem"
                    />
                  </div>
                  {formData.filesystemBackendType === 'filesystem' && (
                    <Input
                      label="Root Directory"
                      value={formData.filesystemRootDir}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, filesystemRootDir: e.target.value })
                      }
                      placeholder="/workspace"
                      required
                      hint="Required for filesystem backend"
                    />
                  )}
                  {formData.filesystemBackendType === 'volume' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-300">Volume Path</label>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, volumeSource: 'reference', filesystemVolumePath: '', volumeRef: '', volumeSubPath: '' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.volumeSource === 'reference' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            Select
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, volumeSource: 'manual', filesystemVolumePath: '', volumeRef: '', volumeSubPath: '' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.volumeSource === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            Manual
                          </button>
                        </div>
                      </div>
                      {formData.volumeSource === 'reference' ? (
                        <div className="space-y-2">
                          <Select
                            value={formData.volumeRef}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                              const key = e.target.value;
                              setFormData({ ...formData, volumeRef: key, filesystemVolumePath: getVolumePathFromKey(key) });
                            }}
                            options={[
                              { value: '', label: 'Select volume...' },
                              ...volumeOptions.map(v => ({ value: v.value, label: v.label })),
                            ]}
                          />
                          <p className="text-xs text-slate-500">
                            {volumeOptions.length === 0 ? 'No volumes configured — add one in the Resources section.' : `Select from ${volumeOptions.length} configured volume${volumeOptions.length !== 1 ? 's' : ''}.`}
                          </p>
                          <Input
                            value={formData.volumeSubPath}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, volumeSubPath: e.target.value })
                            }
                            placeholder="optional/sub/path"
                          />
                          <p className="text-xs text-slate-500">
                            Optional path within the volume (e.g., &quot;agents/workspace&quot;).
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            value={formData.filesystemVolumePath}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, filesystemVolumePath: e.target.value })
                            }
                            placeholder="/Volumes/catalog/schema/volume"
                            required
                          />
                          <p className="text-xs text-slate-500">
                            Enter the full UC Volumes path directly.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <MiddlewarePromptField
                    label="System Prompt (Optional)"
                    value={formData.filesystemSystemPrompt}
                    source={formData.filesystemSystemPromptSource}
                    promptRef={formData.filesystemSystemPromptRef}
                    middlewareType={formData.selectedFactory}
                    middlewareName={formData.refName}
                    placeholder="You have access to filesystem tools for reading, writing, and editing files. Use ls to explore directories, read_file to view contents, write_file to create new files, edit_file to modify existing files, glob to find files by pattern, and grep to search file contents."
                    hint="Overrides the default prompt that guides the agent on how to use filesystem tools (ls, read_file, write_file, edit_file, glob, grep). Leave empty to use the built-in guidance."
                    rows={3}
                    promptOptions={promptOptions}
                    prompts={prompts}
                    onValueChange={(v) => setFormData({ ...formData, filesystemSystemPrompt: v })}
                    onSourceChange={(s) => setFormData({ ...formData, filesystemSystemPromptSource: s, ...(s === 'configured' ? { filesystemSystemPrompt: '' } : { filesystemSystemPromptRef: '' }) })}
                    onRefChange={(r) => setFormData({ ...formData, filesystemSystemPromptRef: r })}
                  />
                  <Textarea
                    label="Custom Tool Descriptions (Optional)"
                    value={formData.filesystemCustomToolDescs}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => 
                      setFormData({ ...formData, filesystemCustomToolDescs: e.target.value })
                    }
                    placeholder={'{\n  "ls": "List directory contents",\n  "read_file": "Read a file"\n}'}
                    rows={3}
                    hint="JSON object mapping tool names to custom descriptions. Leave empty to use defaults."
                  />
                </div>
              )}
              
              {/* SubAgent */}
              {formData.selectedFactory === 'dao_ai.middleware.create_subagent_middleware' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700/30">
                    Provides a &quot;task&quot; tool for spawning subagents to handle complex, multi-step tasks with isolated context.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Backend Type"
                      options={[
                        { value: 'state', label: 'State (ephemeral)' },
                        { value: 'filesystem', label: 'Filesystem (disk)' },
                        { value: 'store', label: 'Store (persistent)' },
                        { value: 'volume', label: 'Volume (Databricks UC)' },
                      ]}
                      value={formData.subagentBackendType}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                        setFormData({ ...formData, subagentBackendType: e.target.value })
                      }
                      hint="Backend for subagent file storage"
                    />
                    <div />
                  </div>
                  {formData.subagentBackendType === 'filesystem' && (
                    <Input
                      label="Root Directory"
                      value={formData.subagentRootDir}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, subagentRootDir: e.target.value })
                      }
                      placeholder="/workspace"
                      required
                      hint="Required for filesystem backend"
                    />
                  )}
                  {formData.subagentBackendType === 'volume' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-300">Volume Path</label>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, volumeSource: 'reference', subagentVolumePath: '', volumeRef: '', volumeSubPath: '' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.volumeSource === 'reference' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            Select
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, volumeSource: 'manual', subagentVolumePath: '', volumeRef: '', volumeSubPath: '' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.volumeSource === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            Manual
                          </button>
                        </div>
                      </div>
                      {formData.volumeSource === 'reference' ? (
                        <div className="space-y-2">
                          <Select
                            value={formData.volumeRef}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                              const key = e.target.value;
                              setFormData({ ...formData, volumeRef: key, subagentVolumePath: getVolumePathFromKey(key) });
                            }}
                            options={[
                              { value: '', label: 'Select volume...' },
                              ...volumeOptions.map(v => ({ value: v.value, label: v.label })),
                            ]}
                          />
                          <p className="text-xs text-slate-500">
                            {volumeOptions.length === 0 ? 'No volumes configured — add one in the Resources section.' : `Select from ${volumeOptions.length} configured volume${volumeOptions.length !== 1 ? 's' : ''}.`}
                          </p>
                          <Input
                            value={formData.volumeSubPath}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, volumeSubPath: e.target.value })
                            }
                            placeholder="optional/sub/path"
                          />
                          <p className="text-xs text-slate-500">
                            Optional path within the volume (e.g., &quot;agents/workspace&quot;).
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            value={formData.subagentVolumePath}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, subagentVolumePath: e.target.value })
                            }
                            placeholder="/Volumes/catalog/schema/volume"
                            required
                          />
                          <p className="text-xs text-slate-500">
                            Enter the full UC Volumes path directly.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <MiddlewarePromptField
                    label="System Prompt (Optional)"
                    value={formData.subagentSystemPrompt}
                    source={formData.subagentSystemPromptSource}
                    promptRef={formData.subagentSystemPromptRef}
                    middlewareType={formData.selectedFactory}
                    middlewareName={formData.refName}
                    placeholder="Custom system prompt for guiding task tool usage..."
                    hint="Overrides built-in task guidance prompt"
                    rows={2}
                    promptOptions={promptOptions}
                    prompts={prompts}
                    onValueChange={(v) => setFormData({ ...formData, subagentSystemPrompt: v })}
                    onSourceChange={(s) => setFormData({ ...formData, subagentSystemPromptSource: s, ...(s === 'configured' ? { subagentSystemPrompt: '' } : { subagentSystemPromptRef: '' }) })}
                    onRefChange={(r) => setFormData({ ...formData, subagentSystemPromptRef: r })}
                  />
                  <Input
                    label="Task Description (Optional)"
                    value={formData.subagentTaskDescription}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => 
                      setFormData({ ...formData, subagentTaskDescription: e.target.value })
                    }
                    placeholder="Custom description for the task tool..."
                    hint="Overrides built-in task tool description"
                  />
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-300">Subagent Definitions</label>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const newEntry: SubAgentEntry = {
                            id: `subagent_${Date.now()}`,
                            name: '',
                            description: '',
                            systemPrompt: '',
                            systemPromptSource: 'inline',
                            systemPromptRef: '',
                            model: '',
                          };
                          setFormData({ ...formData, subagentEntries: [...formData.subagentEntries, newEntry] });
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Subagent
                      </Button>
                    </div>
                    {formData.subagentEntries.length === 0 && (
                      <p className="text-xs text-slate-500">
                        No subagents defined. A general-purpose subagent will be created automatically.
                      </p>
                    )}
                    {formData.subagentEntries.map((entry, idx) => (
                      <div key={entry.id} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-400">Subagent {idx + 1}</span>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              const newEntries = formData.subagentEntries.filter(e => e.id !== entry.id);
                              setFormData({ ...formData, subagentEntries: newEntries });
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            label="Name"
                            value={entry.name}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                              const newEntries = [...formData.subagentEntries];
                              newEntries[idx] = { ...entry, name: e.target.value };
                              setFormData({ ...formData, subagentEntries: newEntries });
                            }}
                            placeholder="e.g., code-reviewer"
                            required
                          />
                          <Select
                            label="Model (Optional)"
                            options={llmOptions}
                            value={entry.model}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                              const newEntries = [...formData.subagentEntries];
                              newEntries[idx] = { ...entry, model: e.target.value };
                              setFormData({ ...formData, subagentEntries: newEntries });
                            }}
                            hint="Override model for this subagent"
                          />
                          <div className="col-span-2">
                            <Input
                              label="Description"
                              value={entry.description}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                const newEntries = [...formData.subagentEntries];
                                newEntries[idx] = { ...entry, description: e.target.value };
                                setFormData({ ...formData, subagentEntries: newEntries });
                              }}
                              placeholder="What this subagent does (used for delegation)"
                              required
                            />
                          </div>
                          <MiddlewarePromptField
                            label="System Prompt"
                            value={entry.systemPrompt}
                            source={entry.systemPromptSource}
                            promptRef={entry.systemPromptRef}
                            middlewareType={formData.selectedFactory}
                            middlewareName={entry.name || `subagent-${idx + 1}`}
                            placeholder="Instructions for the subagent..."
                            hint="System prompt guiding this subagent's behavior"
                            required
                            rows={2}
                            promptOptions={promptOptions}
                            prompts={prompts}
                            onValueChange={(v) => {
                              const newEntries = [...formData.subagentEntries];
                              newEntries[idx] = { ...entry, systemPrompt: v };
                              setFormData({ ...formData, subagentEntries: newEntries });
                            }}
                            onSourceChange={(s) => {
                              const newEntries = [...formData.subagentEntries];
                              newEntries[idx] = {
                                ...entry,
                                systemPromptSource: s,
                                ...(s === 'configured' ? { systemPrompt: '' } : { systemPromptRef: '' }),
                              };
                              setFormData({ ...formData, subagentEntries: newEntries });
                            }}
                            onRefChange={(r) => {
                              const newEntries = [...formData.subagentEntries];
                              newEntries[idx] = { ...entry, systemPromptRef: r };
                              setFormData({ ...formData, subagentEntries: newEntries });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Agents Memory */}
              {formData.selectedFactory === 'dao_ai.middleware.create_agents_memory_middleware' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700/30">
                    Loads AGENTS.md context files at startup and injects content into the system prompt.
                  </p>
                  <Select
                    label="Backend Type"
                    options={[
                      { value: 'state', label: 'State (ephemeral)' },
                      { value: 'filesystem', label: 'Filesystem (disk)' },
                      { value: 'store', label: 'Store (persistent)' },
                      { value: 'volume', label: 'Volume (Databricks UC)' },
                    ]}
                    value={formData.agentsMemoryBackendType}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, agentsMemoryBackendType: e.target.value })
                    }
                    hint="Backend for file storage"
                  />
                  {formData.agentsMemoryBackendType === 'filesystem' && (
                    <Input
                      label="Root Directory"
                      value={formData.agentsMemoryRootDir}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, agentsMemoryRootDir: e.target.value })
                      }
                      placeholder="/"
                      required
                      hint="Required for filesystem backend"
                    />
                  )}
                  {formData.agentsMemoryBackendType === 'volume' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-300">Volume Path</label>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, volumeSource: 'reference', agentsMemoryVolumePath: '', volumeRef: '', volumeSubPath: '' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.volumeSource === 'reference' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            Select
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, volumeSource: 'manual', agentsMemoryVolumePath: '', volumeRef: '', volumeSubPath: '' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.volumeSource === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            Manual
                          </button>
                        </div>
                      </div>
                      {formData.volumeSource === 'reference' ? (
                        <div className="space-y-2">
                          <Select
                            value={formData.volumeRef}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                              const key = e.target.value;
                              setFormData({ ...formData, volumeRef: key, agentsMemoryVolumePath: getVolumePathFromKey(key) });
                            }}
                            options={[
                              { value: '', label: 'Select volume...' },
                              ...volumeOptions.map(v => ({ value: v.value, label: v.label })),
                            ]}
                          />
                          <p className="text-xs text-slate-500">
                            {volumeOptions.length === 0 ? 'No volumes configured — add one in the Resources section.' : `Select from ${volumeOptions.length} configured volume${volumeOptions.length !== 1 ? 's' : ''}.`}
                          </p>
                          <Input
                            value={formData.volumeSubPath}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, volumeSubPath: e.target.value })
                            }
                            placeholder="optional/sub/path"
                          />
                          <p className="text-xs text-slate-500">
                            Optional path within the volume (e.g., &quot;agents/workspace&quot;).
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            value={formData.agentsMemoryVolumePath}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, agentsMemoryVolumePath: e.target.value })
                            }
                            placeholder="/Volumes/catalog/schema/volume"
                            required
                          />
                          <p className="text-xs text-slate-500">
                            Enter the full UC Volumes path directly.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-300">Source Paths</label>
                    {formData.agentsMemorySources.map((source, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <Input
                          value={source}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            const newSources = [...formData.agentsMemorySources];
                            newSources[idx] = e.target.value;
                            setFormData({ ...formData, agentsMemorySources: newSources });
                          }}
                          placeholder="e.g., ~/.deepagents/AGENTS.md"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            const newSources = formData.agentsMemorySources.filter((_, i) => i !== idx);
                            setFormData({ ...formData, agentsMemorySources: newSources });
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
                        setFormData({ ...formData, agentsMemorySources: [...formData.agentsMemorySources, ''] });
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Source
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Skills */}
              {formData.selectedFactory === 'dao_ai.middleware.create_skills_middleware' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-700/30">
                    Discovers SKILL.md files from configured sources and injects skill listings into the system prompt. Later sources override earlier ones.
                  </p>
                  <Select
                    label="Backend Type"
                    options={[
                      { value: 'state', label: 'State (ephemeral)' },
                      { value: 'filesystem', label: 'Filesystem (disk)' },
                      { value: 'store', label: 'Store (persistent)' },
                      { value: 'volume', label: 'Volume (Databricks UC)' },
                    ]}
                    value={formData.skillsBackendType}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                      setFormData({ ...formData, skillsBackendType: e.target.value })
                    }
                    hint="Backend for file storage"
                  />
                  {formData.skillsBackendType === 'filesystem' && (
                    <Input
                      label="Root Directory"
                      value={formData.skillsRootDir}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => 
                        setFormData({ ...formData, skillsRootDir: e.target.value })
                      }
                      placeholder="/"
                      required
                      hint="Required for filesystem backend"
                    />
                  )}
                  {formData.skillsBackendType === 'volume' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-300">Volume Path</label>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, volumeSource: 'reference', skillsVolumePath: '', volumeRef: '', volumeSubPath: '' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.volumeSource === 'reference' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            Select
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, volumeSource: 'manual', skillsVolumePath: '', volumeRef: '', volumeSubPath: '' })}
                            className={`px-2 py-1 text-xs rounded ${
                              formData.volumeSource === 'manual' ? 'bg-blue-500/30 text-blue-300' : 'bg-slate-700 text-slate-400'
                            }`}
                          >
                            Manual
                          </button>
                        </div>
                      </div>
                      {formData.volumeSource === 'reference' ? (
                        <div className="space-y-2">
                          <Select
                            value={formData.volumeRef}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                              const key = e.target.value;
                              setFormData({ ...formData, volumeRef: key, skillsVolumePath: getVolumePathFromKey(key) });
                            }}
                            options={[
                              { value: '', label: 'Select volume...' },
                              ...volumeOptions.map(v => ({ value: v.value, label: v.label })),
                            ]}
                          />
                          <p className="text-xs text-slate-500">
                            {volumeOptions.length === 0 ? 'No volumes configured — add one in the Resources section.' : `Select from ${volumeOptions.length} configured volume${volumeOptions.length !== 1 ? 's' : ''}.`}
                          </p>
                          <Input
                            value={formData.volumeSubPath}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, volumeSubPath: e.target.value })
                            }
                            placeholder="optional/sub/path"
                          />
                          <p className="text-xs text-slate-500">
                            Optional path within the volume (e.g., &quot;agents/workspace&quot;).
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            value={formData.skillsVolumePath}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, skillsVolumePath: e.target.value })
                            }
                            placeholder="/Volumes/catalog/schema/volume"
                            required
                          />
                          <p className="text-xs text-slate-500">
                            Enter the full UC Volumes path directly.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-300">Skill Source Paths</label>
                    <p className="text-xs text-slate-500">Later sources have higher priority (last one wins for same-name skills)</p>
                    {formData.skillsSources.map((source, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <Input
                          value={source}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            const newSources = [...formData.skillsSources];
                            newSources[idx] = e.target.value;
                            setFormData({ ...formData, skillsSources: newSources });
                          }}
                          placeholder="e.g., /skills/base/"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            const newSources = formData.skillsSources.filter((_, i) => i !== idx);
                            setFormData({ ...formData, skillsSources: newSources });
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
                        setFormData({ ...formData, skillsSources: [...formData.skillsSources, ''] });
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Source
                    </Button>
                  </div>
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
