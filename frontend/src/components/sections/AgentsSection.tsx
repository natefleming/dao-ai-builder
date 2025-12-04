import { useState } from 'react';
import { Plus, Trash2, Bot, Edit2, ChevronDown, ChevronUp, FileText, Sparkles, Loader2 } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import MultiSelect from '../ui/MultiSelect';
import { AgentModel, PromptModel } from '@/types/dao-ai-types';

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
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

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

  const promptOptions = Object.entries(prompts).map(([key, prompt]) => ({
    value: key,
    label: `${key} (${prompt.name})`,
  }));

  const handleEdit = (key: string) => {
    setEditingAgent(key);
    setIsModalOpen(true);
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
            <Card key={key} className="overflow-hidden">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedAgent(expandedAgent === key ? null : key)}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{agent.name}</h3>
                    {agent.description && (
                      <p className="text-sm text-slate-400">{agent.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge variant="info">
                    {typeof agent.model === 'object' ? agent.model.name : agent.model}
                  </Badge>
                  <Badge variant="default">{agent.tools?.length || 0} tools</Badge>
                  {expandedAgent === key ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </div>

              {expandedAgent === key && (
                <div className="mt-4 pt-4 border-t border-slate-700 space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-slate-400 mb-2">System Prompt</h4>
                    {typeof agent.prompt === 'object' && agent.prompt !== null ? (
                      <div className="flex items-center space-x-2 bg-slate-800/50 p-3 rounded-lg">
                        <FileText className="w-4 h-4 text-violet-400" />
                        <span className="text-sm text-slate-300">
                          Using configured prompt: <span className="text-violet-400 font-medium">{(agent.prompt as PromptModel).name}</span>
                        </span>
                      </div>
                    ) : (
                      <pre className="text-sm text-slate-300 bg-slate-800/50 p-3 rounded-lg overflow-auto max-h-40">
                        {agent.prompt || 'No prompt configured'}
                      </pre>
                    )}
                  </div>

                  {agent.handoff_prompt && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-400 mb-2">Handoff Prompt</h4>
                      <pre className="text-sm text-slate-300 bg-slate-800/50 p-3 rounded-lg overflow-auto max-h-20">
                        {agent.handoff_prompt}
                      </pre>
                    </div>
                  )}

                  {agent.tools && agent.tools.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-400 mb-2">Tools</h4>
                      <div className="flex flex-wrap gap-2">
                        {agent.tools.map((tool, i) => (
                          <Badge key={i} variant="warning">{tool.name}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end space-x-2">
                    <Button variant="secondary" size="sm" onClick={() => handleEdit(key)}>
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => removeAgent(key)}>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                  </div>
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
        promptOptions={promptOptions}
        llms={llms}
        tools={tools}
        guardrails={guardrails}
        prompts={prompts}
        onAdd={addAgent}
        onUpdate={updateAgent}
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
  promptOptions: { value: string; label: string }[];
  llms: Record<string, any>;
  tools: Record<string, any>;
  guardrails: Record<string, any>;
  prompts: Record<string, PromptModel>;
  onAdd: (agent: AgentModel) => void;
  onUpdate: (key: string, updates: Partial<AgentModel>) => void;
}

function AgentModal({
  isOpen,
  onClose,
  editingAgent,
  editingKey,
  llmOptions,
  toolOptions,
  guardrailOptions,
  promptOptions,
  llms,
  tools,
  guardrails,
  prompts,
  onAdd,
  onUpdate,
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
    name: '',
    description: '',
    modelKey: '',
    promptRef: '', // Reference to configured prompt
    prompt: 'You are a helpful assistant.',
    handoffPrompt: '',
    selectedTools: [] as string[],
    selectedGuardrails: [] as string[],
  });

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

  // Reset form when modal opens
  useState(() => {
    if (editingAgent) {
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
        inlinePrompt = editingAgent.prompt || '';
      }
      
      setPromptSource(detectedPromptSource);
      setFormData({
        name: editingAgent.name,
        description: editingAgent.description || '',
        modelKey,
        promptRef,
        prompt: inlinePrompt,
        handoffPrompt: editingAgent.handoff_prompt || '',
        selectedTools: editingAgent.tools?.map((t) => 
          Object.entries(tools).find(([, tool]) => tool.name === t.name)?.[0] || ''
        ).filter(Boolean) || [],
        selectedGuardrails: editingAgent.guardrails?.map((g) =>
          Object.entries(guardrails).find(([, gr]) => gr.name === g.name)?.[0] || ''
        ).filter(Boolean) || [],
      });
    } else {
      setPromptSource('inline');
      setFormData({
        name: '',
        description: '',
        modelKey: '',
        promptRef: '',
        prompt: 'You are a helpful assistant.',
        handoffPrompt: '',
        selectedTools: [],
        selectedGuardrails: [],
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.modelKey || !llms[formData.modelKey]) return;

    // Determine prompt value based on source
    let promptValue: string | PromptModel | undefined;
    if (promptSource === 'configured' && formData.promptRef && prompts[formData.promptRef]) {
      promptValue = prompts[formData.promptRef];
    } else {
      promptValue = formData.prompt || undefined;
    }

    const agent: AgentModel = {
      name: formData.name,
      description: formData.description || undefined,
      model: llms[formData.modelKey],
      prompt: promptValue,
      handoff_prompt: formData.handoffPrompt || undefined,
      tools: formData.selectedTools.map((key) => tools[key]).filter(Boolean),
      guardrails: formData.selectedGuardrails.map((key) => guardrails[key]).filter(Boolean),
    };

    if (editingKey) {
      onUpdate(editingKey, agent);
    } else {
      onAdd(agent);
    }
    
    onClose();
  };

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
            label="Agent Name"
            placeholder="e.g., customer_service_agent"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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

        <Input
          label="Description"
          placeholder="Brief description of this agent's purpose"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />

        {/* System Prompt with Source Toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-300">System Prompt</label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => { setPromptSource('inline'); setFormData({ ...formData, promptRef: '' }); }}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  promptSource === 'inline'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                }`}
              >
                Write Inline
              </button>
              <button
                type="button"
                onClick={() => { setPromptSource('configured'); setFormData({ ...formData, prompt: '' }); }}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex items-center space-x-1 ${
                  promptSource === 'configured'
                    ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>Use Configured</span>
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

        <div className="flex justify-end space-x-3 pt-4">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={llmOptions.length === 0}>
            {editingKey ? 'Save Changes' : 'Add Agent'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

