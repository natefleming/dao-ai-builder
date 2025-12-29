import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Bot, Pencil, FileText, Sparkles, Loader2 } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import MultiSelect from '../ui/MultiSelect';
import { AgentModel, AppConfig, PromptModel } from '@/types/dao-ai-types';
import { normalizeRefNameWhileTyping } from '@/utils/name-utils';
import { safeDelete } from '@/utils/safe-delete';
import { useYamlScrollStore } from '@/stores/yamlScrollStore';

/**
 * Check if a reference name already exists in the config.
 * Returns true if the refName is a duplicate (exists and is not the editingKey).
 */
function isRefNameDuplicate(refName: string, config: AppConfig, editingKey: string | null): boolean {
  if (!refName) return false;
  
  // Check resources
  const resources = config.resources || {};
  const resourceTypes = ['llms', 'genie_rooms', 'tables', 'volumes', 'functions', 'warehouses', 'connections', 'databases', 'vector_stores'] as const;
  for (const type of resourceTypes) {
    const items = resources[type] || {};
    if (refName in items && refName !== editingKey) {
      return true;
    }
  }
  
  // Check agents
  const agents = config.agents || {};
  if (refName in agents && refName !== editingKey) {
    return true;
  }
  
  // Check tools
  const tools = config.tools || {};
  if (refName in tools && refName !== editingKey) {
    return true;
  }
  
  // Check guardrails
  const guardrails = config.guardrails || {};
  if (refName in guardrails && refName !== editingKey) {
    return true;
  }
  
  // Check retrievers
  const retrievers = config.retrievers || {};
  if (refName in retrievers && refName !== editingKey) {
    return true;
  }
  
  // Check schemas
  const schemas = config.schemas || {};
  if (refName in schemas && refName !== editingKey) {
    return true;
  }
  
  // Check prompts
  const prompts = config.prompts || {};
  if (refName in prompts && refName !== editingKey) {
    return true;
  }
  
  // Check variables
  const variables = config.variables || {};
  if (refName in variables && refName !== editingKey) {
    return true;
  }
  
  return false;
}

// AI Prompt generation API
async function generatePromptWithAI(params: {
  context?: string;
  agent_name?: string;
  agent_description?: string;
  tools?: string[];
  existing_prompt?: string;
  template_parameters?: string[];
}): Promise<string> {
  const response = await fetch('/api/ai/generate-prompt', {
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

// AI Handoff prompt generation API
async function generateHandoffPromptWithAI(params: {
  agent_name?: string;
  agent_description?: string;
  system_prompt?: string;
  existing_handoff?: string;
  other_agents?: string[];
}): Promise<string> {
  const response = await fetch('/api/ai/generate-handoff-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate handoff prompt');
  }
  
  const data = await response.json();
  return data.prompt;
}

// Common template parameters for agent prompts
const COMMON_TEMPLATE_PARAMS = [
  { value: 'user_id', label: 'User ID' },
  { value: 'store_num', label: 'Store Number' },
  { value: 'session_id', label: 'Session ID' },
  { value: 'context', label: 'Context' },
  { value: 'current_date', label: 'Current Date' },
  { value: 'user_name', label: 'User Name' },
  { value: 'location', label: 'Location' },
];

type PromptSource = 'inline' | 'configured';

export default function AgentsSection() {
  const { config, addAgent, removeAgent, updateAgent } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);

  const agents = config.agents || {};
  const llms = config.resources?.llms || {};
  const tools = config.tools || {};
  const guardrails = config.guardrails || {};
  const prompts = config.prompts || {};

  const llmOptions = Object.entries(llms).map(([key, llm]) => ({
    value: key,
    label: `${key} (${llm.name})`,
  }));

  const toolOptions = Object.entries(tools).map(([key, tool]) => ({
    value: key,
    label: tool.name,
  }));

  const guardrailOptions = Object.entries(guardrails).map(([key, gr]) => ({
    value: key,
    label: gr.name,
  }));

  const middleware = config.middleware || {};
  const middlewareOptions = Object.entries(middleware).map(([key, mw]) => ({
    value: key,
    label: key,
  }));

  const promptOptions = Object.entries(prompts).map(([key, prompt]) => ({
    value: key,
    label: `${key} (${prompt.name})`,
  }));

  const { scrollToAsset } = useYamlScrollStore();

  const handleEdit = (key: string) => {
    setEditingAgent(key);
    setIsModalOpen(true);
  };

  const handleCardClick = (key: string) => {
    // Scroll to the asset in YAML preview
    scrollToAsset(key);
    // Open edit modal
    handleEdit(key);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Agents</h2>
          <p className="text-slate-400 mt-1">
            Create and configure your AI agents
          </p>
        </div>
        <Button onClick={() => { setEditingAgent(null); setIsModalOpen(true); }}>
          <Plus className="w-4 h-4" />
          Add Agent
        </Button>
      </div>

      {/* Agent List */}
      {Object.keys(agents).length === 0 ? (
        <Card className="text-center py-12">
          <Bot className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">No agents configured</h3>
          <p className="text-slate-500 mb-4">
            Agents are the AI assistants that interact with users and use tools.
          </p>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Your First Agent
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(agents).map(([key, agent]) => (
            <Card 
              key={key} 
              variant="interactive"
              className="group cursor-pointer"
              onClick={() => handleCardClick(key)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">{key}</p>
                    <p className="text-xs text-slate-500">
                      {agent.name}{agent.description ? ` • ${agent.description}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge variant="info">
                    {typeof agent.model === 'object' ? agent.model.name : agent.model}
                  </Badge>
                  <Badge variant="default">{agent.tools?.length || 0} tools</Badge>
                  {agent.response_format && (
                    <Badge variant="success">Structured Output</Badge>
                  )}
                  
                  {/* Edit button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleEdit(key);
                    }}
                    title="Edit agent"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {/* Delete button */}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      safeDelete('Agent', key, () => removeAgent(key));
                    }}
                    title="Delete agent"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              {/* Additional info shown in the card */}
              {agent.description && (
                <p className="mt-2 text-sm text-slate-400 line-clamp-2">{agent.description}</p>
              )}
              
              {/* Tools badges */}
              {agent.tools && agent.tools.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {agent.tools.slice(0, 5).map((tool, i) => (
                    <Badge key={i} variant="warning" className="text-xs">{tool.name}</Badge>
                  ))}
                  {agent.tools.length > 5 && (
                    <Badge variant="default" className="text-xs">+{agent.tools.length - 5} more</Badge>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Agent Modal */}
      <AgentModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingAgent(null); }}
        editingAgent={editingAgent ? agents[editingAgent] : null}
        editingKey={editingAgent}
        llmOptions={llmOptions}
        toolOptions={toolOptions}
        guardrailOptions={guardrailOptions}
        middlewareOptions={middlewareOptions}
        promptOptions={promptOptions}
        llms={llms}
        tools={tools}
        guardrails={guardrails}
        middleware={middleware}
        prompts={prompts}
        onAdd={addAgent}
        onUpdate={updateAgent}
        onRemove={removeAgent}
      />
    </div>
  );
}

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingAgent: AgentModel | null;
  editingKey: string | null;
  llmOptions: { value: string; label: string }[];
  toolOptions: { value: string; label: string }[];
  guardrailOptions: { value: string; label: string }[];
  middlewareOptions: { value: string; label: string }[];
  promptOptions: { value: string; label: string }[];
  llms: Record<string, any>;
  tools: Record<string, any>;
  guardrails: Record<string, any>;
  middleware: Record<string, any>;
  prompts: Record<string, PromptModel>;
  onAdd: (refName: string, agent: AgentModel) => void;
  onUpdate: (refName: string, updates: Partial<AgentModel>) => void;
  onRemove: (refName: string) => void;
}

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

function AgentModal({
  isOpen,
  onClose,
  editingAgent,
  editingKey,
  llmOptions,
  toolOptions,
  guardrailOptions,
  middlewareOptions,
  promptOptions,
  llms,
  tools,
  guardrails,
  middleware,
  prompts,
  onAdd,
  onUpdate,
  onRemove,
}: AgentModalProps) {
  const { config } = useConfigStore();
  const [promptSource, setPromptSource] = useState<PromptSource>('inline');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isGeneratingHandoff, setIsGeneratingHandoff] = useState(false);
  const [aiContext, setAiContext] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);
  const [templateParams, setTemplateParams] = useState<string[]>(['user_id', 'store_num']);
  const [customParam, setCustomParam] = useState('');
  const [formData, setFormData] = useState({
    refName: '',  // Reference name used as the key in YAML
    name: '',
    description: '',
    modelKey: '',
    promptRef: '', // Reference to configured prompt
    prompt: 'You are a helpful assistant.',
    handoffPrompt: '',
    selectedTools: [] as string[],
    selectedGuardrails: [] as string[],
    selectedMiddleware: [] as string[],
    // Response format configuration
    enableResponseFormat: false,
    responseFormatType: 'simple' as 'simple' | 'advanced',
    responseSchema: '',
    useTool: null as boolean | null,
  });
  
  // Store initial form data for comparison (to detect changes)
  const [initialFormData, setInitialFormData] = useState<typeof formData | null>(null);
  const [initialPromptSource, setInitialPromptSource] = useState<PromptSource>('inline');

  const handleGeneratePrompt = async (improveExisting = false) => {
    setIsGeneratingPrompt(true);
    try {
      const toolNames = formData.selectedTools
        .map(key => tools[key]?.name)
        .filter(Boolean);
      
      const prompt = await generatePromptWithAI({
        context: aiContext || undefined,
        agent_name: formData.name || undefined,
        agent_description: formData.description || undefined,
        tools: toolNames.length > 0 ? toolNames : undefined,
        existing_prompt: improveExisting ? formData.prompt : undefined,
        template_parameters: templateParams.length > 0 ? templateParams : undefined,
      });
      
      setFormData({ ...formData, prompt });
      setShowAiInput(false);
      setAiContext('');
    } catch (error) {
      console.error('Failed to generate prompt:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate prompt');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleGenerateHandoff = async (improveExisting = false) => {
    setIsGeneratingHandoff(true);
    try {
      // Get other agent names for context
      const otherAgents = Object.values(config.agents || {})
        .map(a => a.name)
        .filter(name => name !== formData.name);
      
      const handoffPrompt = await generateHandoffPromptWithAI({
        agent_name: formData.name || undefined,
        agent_description: formData.description || undefined,
        system_prompt: formData.prompt || undefined,
        existing_handoff: improveExisting ? formData.handoffPrompt : undefined,
        other_agents: otherAgents.length > 0 ? otherAgents : undefined,
      });
      
      setFormData({ ...formData, handoffPrompt });
    } catch (error) {
      console.error('Failed to generate handoff prompt:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate handoff prompt');
    } finally {
      setIsGeneratingHandoff(false);
    }
  };

  const addCustomParam = () => {
    if (customParam && !templateParams.includes(customParam)) {
      setTemplateParams([...templateParams, customParam]);
      setCustomParam('');
    }
  };

  // Reset form when modal opens or editing agent changes
  useEffect(() => {
    // Only run when modal opens
    if (!isOpen) return;
    
    if (editingAgent && editingKey) {
      const modelKey = Object.entries(llms).find(
        ([, llm]) => llm.name === editingAgent.model?.name
      )?.[0] || '';
      
      // Detect if using a configured prompt
      let detectedPromptSource: PromptSource = 'inline';
      let promptRef = '';
      let inlinePrompt = '';
      
      if (typeof editingAgent.prompt === 'object' && editingAgent.prompt !== null) {
        // It's a PromptModel reference
        const promptModel = editingAgent.prompt as PromptModel;
        const matchedPromptKey = Object.entries(prompts).find(
          ([, p]) => p.name === promptModel.name
        )?.[0];
        if (matchedPromptKey) {
          detectedPromptSource = 'configured';
          promptRef = matchedPromptKey;
        }
      } else {
        inlinePrompt = typeof editingAgent.prompt === 'string' ? editingAgent.prompt : '';
      }
      
      const selectedToolsList = editingAgent.tools?.map((t) => 
        Object.entries(tools).find(([, tool]) => tool.name === t.name)?.[0] || ''
      ).filter(Boolean) || [];
      
      const selectedGuardrailsList = editingAgent.guardrails?.map((g) =>
        Object.entries(guardrails).find(([, gr]) => gr.name === g.name)?.[0] || ''
      ).filter(Boolean) || [];
      
      const selectedMiddlewareList = editingAgent.middleware?.map((m) =>
        Object.entries(middleware).find(([, mw]) => mw.name === m.name)?.[0] || ''
      ).filter(Boolean) || [];
      
      // Parse response_format if present
      let enableResponseFormat = false;
      let responseFormatType: 'simple' | 'advanced' = 'simple';
      let responseSchema = '';
      let useTool: boolean | null = null;
      
      if (editingAgent.response_format) {
        enableResponseFormat = true;
        if (typeof editingAgent.response_format === 'string') {
          responseFormatType = 'simple';
          responseSchema = editingAgent.response_format;
        } else if (typeof editingAgent.response_format === 'object') {
          responseFormatType = 'advanced';
          responseSchema = editingAgent.response_format.response_schema || '';
          useTool = editingAgent.response_format.use_tool ?? null;
        }
      }
      
      const newFormData = {
        refName: editingKey, // Use the existing key as refName
        name: editingAgent.name,
        description: editingAgent.description || '',
        modelKey,
        promptRef,
        prompt: inlinePrompt,
        handoffPrompt: editingAgent.handoff_prompt || '',
        selectedTools: selectedToolsList,
        selectedGuardrails: selectedGuardrailsList,
        selectedMiddleware: selectedMiddlewareList,
        enableResponseFormat,
        responseFormatType,
        responseSchema,
        useTool,
      };
      
      // Create a separate copy for initial state comparison
      const initialData = {
        refName: editingKey,
        name: editingAgent.name,
        description: editingAgent.description || '',
        modelKey,
        promptRef,
        prompt: inlinePrompt,
        handoffPrompt: editingAgent.handoff_prompt || '',
        selectedTools: [...selectedToolsList],
        selectedGuardrails: [...selectedGuardrailsList],
        selectedMiddleware: [...selectedMiddlewareList],
        enableResponseFormat,
        responseFormatType,
        responseSchema,
        useTool,
      };
      
      setPromptSource(detectedPromptSource);
      setFormData(newFormData);
      setInitialFormData(initialData);
      setInitialPromptSource(detectedPromptSource);
    } else {
      // Reset to default values for new agent
      const defaultFormData = {
        refName: '',
        name: '',
        description: '',
        modelKey: '',
        promptRef: '',
        prompt: 'You are a helpful assistant.',
        handoffPrompt: '',
        selectedTools: [] as string[],
        selectedGuardrails: [] as string[],
        selectedMiddleware: [] as string[],
        enableResponseFormat: false,
        responseFormatType: 'simple' as 'simple' | 'advanced',
        responseSchema: '',
        useTool: null as boolean | null,
      };
      setPromptSource('inline');
      setFormData(defaultFormData);
      setInitialFormData(null); // No initial data for new agents
      setInitialPromptSource('inline');
      setShowAiInput(false);
      setAiContext('');
    }
  }, [isOpen, editingAgent, editingKey, llms, prompts, tools, guardrails]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.refName || !formData.name || !formData.modelKey || !llms[formData.modelKey]) return;

    // Determine prompt value based on source
    let promptValue: string | PromptModel | undefined;
    if (promptSource === 'configured' && formData.promptRef && prompts[formData.promptRef]) {
      promptValue = prompts[formData.promptRef];
    } else {
      promptValue = formData.prompt || undefined;
    }

    // Build response_format if enabled
    let responseFormat: any = undefined;
    if (formData.enableResponseFormat && formData.responseSchema) {
      if (formData.responseFormatType === 'simple') {
        // Simple mode: just pass the schema string
        responseFormat = formData.responseSchema;
      } else {
        // Advanced mode: full ResponseFormatModel
        responseFormat = {
          response_schema: formData.responseSchema,
          use_tool: formData.useTool,
        };
      }
    }

    const agent: AgentModel = {
      name: formData.name,
      description: formData.description || undefined,
      model: llms[formData.modelKey],
      prompt: promptValue,
      handoff_prompt: formData.handoffPrompt || undefined,
      tools: formData.selectedTools.map((key) => tools[key]).filter(Boolean),
      guardrails: formData.selectedGuardrails.map((key) => guardrails[key]).filter(Boolean),
      middleware: formData.selectedMiddleware.map((key) => middleware[key]).filter(Boolean),
      response_format: responseFormat,
    };

    if (editingKey) {
      // If reference name changed, remove old and add new
      if (editingKey !== formData.refName) {
        onRemove(editingKey);
        onAdd(formData.refName, agent);
      } else {
        onUpdate(formData.refName, agent);
      }
    } else {
      onAdd(formData.refName, agent);
    }
    
    onClose();
  };

  // Check if form has changes compared to initial state (only for editing)
  const hasChanges = useMemo(() => {
    if (!editingKey || !initialFormData) return true; // Always allow submit for new agents
    
    // Compare all form fields
    if (formData.refName !== initialFormData.refName) return true;
    if (formData.name !== initialFormData.name) return true;
    if (formData.description !== initialFormData.description) return true;
    if (formData.modelKey !== initialFormData.modelKey) return true;
    if (formData.prompt !== initialFormData.prompt) return true;
    if (formData.handoffPrompt !== initialFormData.handoffPrompt) return true;
    if (formData.promptRef !== initialFormData.promptRef) return true;
    if (promptSource !== initialPromptSource) return true;
    
    // Compare response format fields
    if (formData.enableResponseFormat !== initialFormData.enableResponseFormat) return true;
    if (formData.responseFormatType !== initialFormData.responseFormatType) return true;
    if (formData.responseSchema !== initialFormData.responseSchema) return true;
    if (formData.useTool !== initialFormData.useTool) return true;
    
    // Compare arrays (tools and guardrails)
    if (formData.selectedTools.length !== initialFormData.selectedTools.length) return true;
    if (!formData.selectedTools.every((t, i) => t === initialFormData.selectedTools[i])) return true;
    
    if (formData.selectedGuardrails.length !== initialFormData.selectedGuardrails.length) return true;
    if (!formData.selectedGuardrails.every((g, i) => g === initialFormData.selectedGuardrails[i])) return true;
    
    if (formData.selectedMiddleware.length !== initialFormData.selectedMiddleware.length) return true;
    if (!formData.selectedMiddleware.every((m, i) => m === initialFormData.selectedMiddleware[i])) return true;
    
    return false;
  }, [formData, initialFormData, promptSource, initialPromptSource, editingKey]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingKey ? 'Edit Agent' : 'Add Agent'}
      description="Configure an AI agent with its model, tools, and prompts"
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {llmOptions.length === 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-400 text-sm">
            You need to add an LLM first before creating an agent.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Reference Name"
            placeholder="e.g., Customer Service Agent"
            value={formData.refName}
            onChange={(e) => setFormData({ ...formData, refName: normalizeRefNameWhileTyping(e.target.value) })}
            hint="Type naturally - spaces become underscores"
            required
          />
          <Select
            label="Model"
            options={llmOptions}
            value={formData.modelKey}
            onChange={(e) => setFormData({ ...formData, modelKey: e.target.value })}
            placeholder="Select an LLM..."
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Display Name"
            placeholder="e.g., Customer Service Agent"
            value={formData.name}
            onChange={(e) => {
              const name = e.target.value;
              // Auto-generate refName from name if refName is empty or was auto-generated
              const shouldAutoGenerate = !editingKey && (!formData.refName || formData.refName === generateRefName(formData.name));
              setFormData({ 
                ...formData, 
                name,
                refName: shouldAutoGenerate ? generateRefName(name) : formData.refName,
              });
            }}
            hint="Human-readable name for this agent"
            required
          />
          <Input
            label="Description"
            placeholder="Brief description of this agent's purpose"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        {/* System Prompt with Source Toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-300">System Prompt</label>
            <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
              <button
                type="button"
                onClick={() => { setPromptSource('inline'); setFormData({ ...formData, promptRef: '' }); }}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                  promptSource === 'inline'
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                    : 'text-slate-400 border border-transparent hover:text-slate-300'
                }`}
              >
                Inline
              </button>
              <button
                type="button"
                onClick={() => { setPromptSource('configured'); setFormData({ ...formData, prompt: '' }); }}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                  promptSource === 'configured'
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                    : 'text-slate-400 border border-transparent hover:text-slate-300'
                }`}
              >
                Configured
              </button>
            </div>
          </div>
          
          {promptSource === 'configured' ? (
            <div className="space-y-2">
              <Select
                value={formData.promptRef}
                onChange={(e) => setFormData({ ...formData, promptRef: e.target.value })}
                options={promptOptions}
                placeholder="Select a configured prompt..."
              />
              {formData.promptRef && prompts[formData.promptRef] && (
                <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                  <div className="flex items-center space-x-2 mb-2">
                    <FileText className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-medium text-slate-300">{prompts[formData.promptRef].name}</span>
                  </div>
                  {prompts[formData.promptRef].description && (
                    <p className="text-xs text-slate-400 mb-2">{prompts[formData.promptRef].description}</p>
                  )}
                  {prompts[formData.promptRef].default_template && (
                    <pre className="text-xs text-slate-500 bg-slate-900/50 p-2 rounded overflow-auto max-h-32">
                      {prompts[formData.promptRef].default_template?.substring(0, 300)}
                      {(prompts[formData.promptRef].default_template?.length || 0) > 300 ? '...' : ''}
                    </pre>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500">
                Reference a prompt defined in the Prompts section. The prompt will be resolved at runtime.
              </p>
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
                    disabled={isGeneratingPrompt}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Assistant</span>
                  </button>
                  {formData.prompt && formData.prompt !== 'You are a helpful assistant.' && (
                    <button
                      type="button"
                      onClick={() => handleGeneratePrompt(true)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 text-xs rounded-lg font-medium bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/30 hover:from-purple-500/30 hover:to-pink-500/30 transition-all"
                      disabled={isGeneratingPrompt}
                    >
                      {isGeneratingPrompt ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>Improve Prompt</span>
                    </button>
                  )}
                </div>
              </div>
              
              {/* AI Context Input */}
              {showAiInput && (
                <div className="p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30 space-y-3">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-purple-300">Generate Prompt with AI</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Describe what this agent should do and I'll generate an optimized prompt for you.
                  </p>
                  <Textarea
                    value={aiContext}
                    onChange={(e) => setAiContext(e.target.value)}
                    rows={3}
                    placeholder="e.g., This agent helps customers find products in a hardware store. It should be friendly and knowledgeable about tools and home improvement..."
                  />
                  
                  {/* Template Parameters */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">Template Parameters</label>
                    <p className="text-xs text-slate-500">
                      Select variables to include in the prompt (e.g., {'{user_id}'})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {COMMON_TEMPLATE_PARAMS.map(param => (
                        <button
                          key={param.value}
                          type="button"
                          onClick={() => {
                            if (templateParams.includes(param.value)) {
                              setTemplateParams(templateParams.filter(p => p !== param.value));
                            } else {
                              setTemplateParams([...templateParams, param.value]);
                            }
                          }}
                          className={`px-2 py-1 text-xs rounded-md transition-all ${
                            templateParams.includes(param.value)
                              ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          {param.label}
                        </button>
                      ))}
                    </div>
                    {/* Custom parameters */}
                    {templateParams.filter(p => !COMMON_TEMPLATE_PARAMS.map(c => c.value).includes(p)).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {templateParams.filter(p => !COMMON_TEMPLATE_PARAMS.map(c => c.value).includes(p)).map(param => (
                          <span
                            key={param}
                            className="px-2 py-1 text-xs rounded-md bg-blue-500/30 text-blue-300 border border-blue-500/50 flex items-center space-x-1"
                          >
                            <span>{param}</span>
                            <button
                              type="button"
                              onClick={() => setTemplateParams(templateParams.filter(p => p !== param))}
                              className="hover:text-red-300"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Add custom parameter */}
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={customParam}
                        onChange={(e) => setCustomParam(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
                        placeholder="Add custom parameter..."
                        className="flex-1 px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-300 placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomParam(); } }}
                      />
                      <button
                        type="button"
                        onClick={addCustomParam}
                        disabled={!customParam}
                        className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => { setShowAiInput(false); setAiContext(''); }}
                      disabled={isGeneratingPrompt}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleGeneratePrompt(false)}
                      disabled={isGeneratingPrompt || (!aiContext && !formData.name && !formData.description)}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    >
                      {isGeneratingPrompt ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-1.5" />
                          Generate Prompt
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
              
              <Textarea
                value={formData.prompt}
                onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                rows={8}
                hint="The main instructions for this agent"
                placeholder="You are a helpful assistant..."
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Handoff Prompt</label>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => handleGenerateHandoff(false)}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs rounded-lg font-medium bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/30 hover:from-purple-500/30 hover:to-pink-500/30 transition-all"
              disabled={isGeneratingHandoff || (!formData.prompt && !formData.description)}
              title={!formData.prompt && !formData.description ? 'Add a system prompt or description first' : 'Generate handoff prompt with AI'}
            >
              {isGeneratingHandoff ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>AI Assistant</span>
            </button>
            {formData.handoffPrompt && (
              <button
                type="button"
                onClick={() => handleGenerateHandoff(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs rounded-lg font-medium bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/30 hover:from-purple-500/30 hover:to-pink-500/30 transition-all"
                disabled={isGeneratingHandoff}
              >
                {isGeneratingHandoff ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Improve Prompt</span>
              </button>
            )}
          </div>
          <Textarea
            placeholder="Describe when this agent should be called in a multi-agent system..."
            value={formData.handoffPrompt}
            onChange={(e) => setFormData({ ...formData, handoffPrompt: e.target.value })}
            rows={3}
            hint="Used by the supervisor to decide when to route to this agent"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <MultiSelect
            label="Tools"
            options={toolOptions}
            value={formData.selectedTools}
            onChange={(value) => setFormData({ ...formData, selectedTools: value })}
            placeholder="Select tools..."
            hint="Tools this agent can use"
          />
          <MultiSelect
            label="Guardrails"
            options={guardrailOptions}
            value={formData.selectedGuardrails}
            onChange={(value) => setFormData({ ...formData, selectedGuardrails: value })}
            placeholder="Select guardrails..."
            hint="Safety checks for this agent"
          />
        </div>

        <MultiSelect
          label="Middleware"
          options={middlewareOptions}
          value={formData.selectedMiddleware}
          onChange={(value) => setFormData({ ...formData, selectedMiddleware: value })}
          placeholder="Select middleware..."
          hint="Middleware to customize agent execution behavior"
        />

        {/* Response Format Configuration */}
        <div className="space-y-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-slate-300">Response Format</label>
              <Badge variant="secondary" className="text-xs">Optional</Badge>
            </div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.enableResponseFormat}
                onChange={(e) => setFormData({ ...formData, enableResponseFormat: e.target.checked })}
                className="rounded border-slate-600 text-violet-500 focus:ring-violet-500 focus:ring-offset-slate-900"
              />
              <span className="text-xs text-slate-400">Enable</span>
            </label>
          </div>
          
          {formData.enableResponseFormat && (
            <div className="space-y-3 pt-2">
              <p className="text-xs text-slate-400">
                Configure structured response output. The response schema can be a fully qualified type name (e.g., <code className="px-1 py-0.5 bg-slate-900/50 rounded text-violet-400">myapp.models.MyModel</code>) or a JSON schema string.
              </p>
              
              {/* Response Format Type Toggle */}
              <div className="flex items-center space-x-2">
                <label className="text-xs font-medium text-slate-400">Mode:</label>
                <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, responseFormatType: 'simple' })}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                      formData.responseFormatType === 'simple'
                        ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                        : 'text-slate-400 border border-transparent hover:text-slate-300'
                    }`}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, responseFormatType: 'advanced' })}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                      formData.responseFormatType === 'advanced'
                        ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                        : 'text-slate-400 border border-transparent hover:text-slate-300'
                    }`}
                  >
                    Advanced
                  </button>
                </div>
              </div>

              {/* Response Schema Input */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400">Response Schema</label>
                <Textarea
                  value={formData.responseSchema}
                  onChange={(e) => setFormData({ ...formData, responseSchema: e.target.value })}
                  rows={3}
                  placeholder="myapp.models.ResponseModel or JSON schema string..."
                  hint={formData.responseFormatType === 'simple' 
                    ? "Fully qualified type name or JSON schema. Will auto-detect strategy." 
                    : "Type name or JSON schema with manual strategy control"}
                />
              </div>

              {/* Advanced Options */}
              {formData.responseFormatType === 'advanced' && (
                <div className="space-y-2 p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
                  <label className="text-xs font-medium text-slate-400">Strategy (use_tool)</label>
                  <Select
                    value={formData.useTool === null ? 'auto' : formData.useTool ? 'tool' : 'provider'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({ 
                        ...formData, 
                        useTool: val === 'auto' ? null : val === 'tool' ? true : false 
                      });
                    }}
                    options={[
                      { value: 'auto', label: 'Auto-detect (recommended)' },
                      { value: 'provider', label: 'Provider Strategy (native)' },
                      { value: 'tool', label: 'Tool Strategy (function calling)' },
                    ]}
                  />
                  <p className="text-xs text-slate-500">
                    Auto-detect lets LangChain choose the best strategy based on model capabilities. Provider uses native structured output, Tool uses function calling.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Duplicate reference name warning */}
        {formData.refName && isRefNameDuplicate(formData.refName, config, editingKey) && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            A resource with reference name "{formData.refName}" already exists. Please choose a unique name.
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={llmOptions.length === 0 || (!!editingKey && !hasChanges) || isRefNameDuplicate(formData.refName, config, editingKey)}
          >
            {editingKey ? 'Save Changes' : 'Add Agent'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

