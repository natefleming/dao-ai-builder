import { useState, ChangeEvent } from 'react';
import { Plus, Trash2, Edit2, FileText, Sparkles, Loader2 } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import { PromptModel } from '@/types/dao-ai-types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import { normalizeRefName, normalizeRefNameWhileTyping } from '@/utils/name-utils';
import { safeDelete } from '@/utils/safe-delete';
import { useYamlScrollStore } from '@/stores/yamlScrollStore';

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

// Common template parameters for prompts
const COMMON_TEMPLATE_PARAMS = [
  { value: 'user_id', label: 'User ID' },
  { value: 'store_num', label: 'Store Number' },
  { value: 'session_id', label: 'Session ID' },
  { value: 'context', label: 'Context' },
  { value: 'current_date', label: 'Current Date' },
  { value: 'user_name', label: 'User Name' },
  { value: 'location', label: 'Location' },
];

const DEFAULT_PROMPT_TEMPLATE = `### User Information
- **User Id**: {user_id}
- **Store Number**: {store_num}

You are a helpful assistant. Your role is to provide accurate and useful information.

#### Response Guidelines
- Be clear and concise
- Provide helpful examples when appropriate
- Always prioritize user safety
`;

// Helper function to generate a reference name from a prompt name
function generateRefName(name: string): string {
  return normalizeRefName(name);
}

// dao-ai 0.2.6 cleaned up PromptModel to just name/description/template — the
// MLflow Prompt Registry and its vestiges (schema, tags, aliases, versions) are
// gone. A prompt is a name + an inline template; nothing else to configure.
export default function PromptsSection() {
  const { config, addPrompt, updatePrompt, removePrompt } = useConfigStore();
  const { scrollToAsset } = useYamlScrollStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [refNameManuallyEdited, setRefNameManuallyEdited] = useState(false);

  const [formData, setFormData] = useState({
    refName: '',
    name: '',
    description: '',
    template: DEFAULT_PROMPT_TEMPLATE,
  });

  // AI Assistant state
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [aiContext, setAiContext] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);
  const [templateParams, setTemplateParams] = useState<string[]>(['user_id', 'store_num']);
  const [customParam, setCustomParam] = useState('');

  const prompts = config.prompts || {};

  const handleGeneratePrompt = async (improveExisting = false) => {
    setIsGeneratingPrompt(true);
    try {
      const prompt = await generatePromptWithAI({
        context: aiContext || undefined,
        agent_name: formData.name || undefined,
        agent_description: formData.description || undefined,
        existing_prompt: improveExisting ? formData.template : undefined,
        template_parameters: templateParams.length > 0 ? templateParams : undefined,
      });

      setFormData({ ...formData, template: prompt });
      setShowAiInput(false);
      setAiContext('');
    } catch (error) {
      console.error('Failed to generate prompt:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate prompt');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const addCustomParam = () => {
    if (customParam && !templateParams.includes(customParam)) {
      setTemplateParams([...templateParams, customParam]);
      setCustomParam('');
    }
  };

  const resetForm = () => {
    setFormData({
      refName: '',
      name: '',
      description: '',
      template: DEFAULT_PROMPT_TEMPLATE,
    });
    setEditingKey(null);
    setRefNameManuallyEdited(false);
    setShowAiInput(false);
    setAiContext('');
  };

  const handleEdit = (key: string) => {
    scrollToAsset(key);
    const prompt = prompts[key];

    setRefNameManuallyEdited(true); // When editing, consider refName as manually set
    setFormData({
      refName: key,
      name: prompt.name,
      description: prompt.description || '',
      template: prompt.template || '',
    });
    setEditingKey(key);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.refName || !formData.name) return;

    // Finalize the name - clean up any trailing underscores
    const finalName = normalizeRefName(formData.name);
    if (!finalName) return;

    const prompt: PromptModel = {
      name: finalName,
      description: formData.description || undefined,
      template: formData.template || '',
    };

    if (editingKey) {
      // If key changed, remove old and add new
      if (editingKey !== formData.refName) {
        removePrompt(editingKey);
      }
      updatePrompt(formData.refName, prompt);
    } else {
      addPrompt(formData.refName, prompt);
    }

    resetForm();
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Prompts</h2>
          <p className="text-slate-400 mt-1">
            Configure reusable, first-class prompt templates for agents
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
          <Plus className="w-4 h-4" />
          Add Prompt
        </Button>
      </div>

      {/* Prompt List */}
      {Object.keys(prompts).length === 0 ? (
        <Card className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">No prompts configured</h3>
          <p className="text-slate-500 mb-4 max-w-md mx-auto">
            Prompts define agent behavior. Define a reusable template once and reference it from any agent.
          </p>
          <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
            <Plus className="w-4 h-4" />
            Add Your First Prompt
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {Object.entries(prompts).map(([key, prompt]) => (
            <Card
              key={key}
              variant="interactive"
              className="group cursor-pointer"
              onClick={() => handleEdit(key)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium text-white">{key}</h3>
                    </div>
                    <p className="text-sm text-slate-400 mt-1">{prompt.name}</p>
                    {prompt.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {prompt.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(key)}
                    title="Edit prompt"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      safeDelete('Prompt', key, () => removePrompt(key));
                    }}
                    title="Delete prompt"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Prompt Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { resetForm(); setIsModalOpen(false); }}
        title={editingKey ? 'Edit Prompt' : 'Add Prompt'}
        description="Configure a reusable prompt for agents"
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Reference Name */}
          <Input
            label="Reference Name"
            placeholder="e.g., General Prompt"
            value={formData.refName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setFormData({ ...formData, refName: normalizeRefNameWhileTyping(e.target.value) });
              setRefNameManuallyEdited(true);
            }}
            hint="Type naturally - spaces become underscores"
            required
          />

          {/* Prompt Name */}
          <div className="space-y-1.5">
            <Input
              label="Prompt Name"
              placeholder="e.g., My New Prompt"
              value={formData.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const rawValue = e.target.value;
                const name = normalizeRefNameWhileTyping(rawValue);
                const shouldAutoGenerateRef = !editingKey && !refNameManuallyEdited;
                setFormData({
                  ...formData,
                  name,
                  refName: shouldAutoGenerateRef ? generateRefName(name) : formData.refName,
                });
              }}
              hint="Type naturally - spaces become underscores"
              required
            />
            {formData.name && formData.name.endsWith('_') && (
              <p className="text-xs text-slate-400">
                Continue typing to complete the name...
              </p>
            )}
          </div>

          {/* Description */}
          <Input
            label="Description"
            placeholder="e.g., General retail store assistant prompt"
            value={formData.description}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, description: e.target.value })}
            hint="Optional human-readable description"
          />

          {/* Template */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Template</label>

            {/* AI Assistant Controls */}
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
              {formData.template && formData.template !== DEFAULT_PROMPT_TEMPLATE && (
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

            {/* AI Context Input */}
            {showAiInput && (
              <div className="p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30 space-y-3">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">Generate Prompt with AI</span>
                </div>
                <p className="text-xs text-slate-400">
                  Describe what this prompt should do and I&apos;ll generate an optimized template for you.
                </p>
                <Textarea
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  rows={3}
                  placeholder="e.g., This prompt is for a product specialist agent that helps customers find and compare products. It should include instructions for tool usage and customer service best practices..."
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
              value={formData.template}
              onChange={(e) => setFormData({ ...formData, template: e.target.value })}
              rows={10}
              hint="The inline prompt template. Use {variable_name} for substitutions."
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => { resetForm(); setIsModalOpen(false); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formData.refName || !formData.name}>
              {editingKey ? 'Update Prompt' : 'Add Prompt'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
