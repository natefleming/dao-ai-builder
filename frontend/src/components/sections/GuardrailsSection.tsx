import { useState } from 'react';
import { Plus, Trash2, Shield, Sparkles, Loader2 } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';

// AI Guardrail prompt generation API
async function generateGuardrailPromptWithAI(params: {
  context?: string;
  guardrail_name?: string;
  evaluation_criteria?: string[];
  existing_prompt?: string;
}): Promise<string> {
  const response = await fetch('/api/ai/generate-guardrail-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate guardrail prompt');
  }
  
  const data = await response.json();
  return data.prompt;
}

// Common evaluation criteria for guardrails
const COMMON_CRITERIA = [
  { value: 'accuracy', label: 'Accuracy' },
  { value: 'completeness', label: 'Completeness' },
  { value: 'clarity', label: 'Clarity' },
  { value: 'helpfulness', label: 'Helpfulness' },
  { value: 'safety', label: 'Safety' },
  { value: 'relevance', label: 'Relevance' },
  { value: 'tone', label: 'Professional Tone' },
  { value: 'no_hallucination', label: 'No Hallucination' },
  { value: 'pii_protection', label: 'PII Protection' },
  { value: 'bias_free', label: 'Bias-Free' },
];

const DEFAULT_GUARDRAIL_PROMPT = `You are an expert judge evaluating AI responses. Your task is to critique the AI assistant's latest response in the conversation below.

Evaluate the response based on these criteria:
1. Accuracy - Is the information correct and factual?
2. Completeness - Does it fully address the user's query?
3. Clarity - Is the explanation clear and well-structured?
4. Helpfulness - Does it provide actionable and useful information?
5. Safety - Does it avoid harmful or inappropriate content?

If the response meets ALL criteria satisfactorily, set pass to True.

If you find ANY issues with the response, do NOT set pass to True. Instead, provide specific and constructive feedback in the comment key and set pass to False.

### Inputs:
{inputs}

### Response:
{outputs}`;

export default function GuardrailsSection() {
  const { config, addGuardrail, removeGuardrail } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    modelKey: '',
    prompt: DEFAULT_GUARDRAIL_PROMPT,
    numRetries: '3',
  });
  
  // AI Assistant state
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [aiContext, setAiContext] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>(['accuracy', 'completeness', 'clarity', 'helpfulness', 'safety']);
  const [customCriterion, setCustomCriterion] = useState('');

  const handleGeneratePrompt = async (improveExisting = false) => {
    setIsGeneratingPrompt(true);
    try {
      const prompt = await generateGuardrailPromptWithAI({
        context: aiContext || undefined,
        guardrail_name: formData.name || undefined,
        evaluation_criteria: selectedCriteria.length > 0 ? selectedCriteria : undefined,
        existing_prompt: improveExisting ? formData.prompt : undefined,
      });
      
      setFormData({ ...formData, prompt });
      setShowAiInput(false);
      setAiContext('');
    } catch (error) {
      console.error('Failed to generate guardrail prompt:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate guardrail prompt');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const addCustomCriterion = () => {
    if (customCriterion && !selectedCriteria.includes(customCriterion)) {
      setSelectedCriteria([...selectedCriteria, customCriterion]);
      setCustomCriterion('');
    }
  };

  const guardrails = config.guardrails || {};
  const llms = config.resources?.llms || {};

  const llmOptions = Object.entries(llms).map(([key, llm]) => ({
    value: key,
    label: `${key} (${llm.name})`,
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.name && formData.modelKey && llms[formData.modelKey]) {
      addGuardrail({
        name: formData.name,
        model: llms[formData.modelKey],
        prompt: formData.prompt,
        num_retries: parseInt(formData.numRetries),
      });
      
      setFormData({
        name: '',
        modelKey: '',
        prompt: DEFAULT_GUARDRAIL_PROMPT,
        numRetries: '3',
      });
      setIsModalOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Guardrails</h2>
          <p className="text-slate-400 mt-1">
            Configure safety checks and quality controls for agent responses
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4" />
          Add Guardrail
        </Button>
      </div>

      {/* Guardrail List */}
      {Object.keys(guardrails).length === 0 ? (
        <Card className="text-center py-12">
          <Shield className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">No guardrails configured</h3>
          <p className="text-slate-500 mb-4">
            Guardrails help ensure agent responses are safe, accurate, and helpful.
          </p>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Your First Guardrail
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {Object.entries(guardrails).map(([key, guardrail]) => (
            <Card key={key} variant="interactive" className="group">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{guardrail.name}</h3>
                    <p className="text-sm text-slate-400">
                      Model: {guardrail.model.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2 font-mono">
                      {guardrail.prompt.substring(0, 100)}...
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge variant="success">retries: {guardrail.num_retries ?? 3}</Badge>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => removeGuardrail(key)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Guardrail Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Guardrail"
        description="Configure a safety check for agent responses"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {llmOptions.length === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-400 text-sm">
              You need to add an LLM first before creating a guardrail.
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Guardrail Name"
              placeholder="e.g., llm_judge_guardrail"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Select
              label="Judge LLM"
              options={llmOptions}
              value={formData.modelKey}
              onChange={(e) => setFormData({ ...formData, modelKey: e.target.value })}
              placeholder="Select an LLM..."
              required
            />
          </div>

          {/* Evaluation Prompt with AI Assistant */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-300">Evaluation Prompt</label>
            </div>
            
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
              {formData.prompt && formData.prompt !== DEFAULT_GUARDRAIL_PROMPT && (
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
                  <span className="text-sm font-medium text-purple-300">Generate Guardrail Prompt with AI</span>
                </div>
                <p className="text-xs text-slate-400">
                  Describe what this guardrail should evaluate and I'll generate an optimized evaluation prompt.
                </p>
                <Textarea
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  rows={2}
                  placeholder="e.g., This guardrail should check that responses don't contain harmful content and are factually accurate for a retail customer service agent..."
                />
                
                {/* Evaluation Criteria */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400">Evaluation Criteria</label>
                  <p className="text-xs text-slate-500">
                    Select what aspects the guardrail should evaluate
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_CRITERIA.map(criterion => (
                      <button
                        key={criterion.value}
                        type="button"
                        onClick={() => {
                          if (selectedCriteria.includes(criterion.value)) {
                            setSelectedCriteria(selectedCriteria.filter(c => c !== criterion.value));
                          } else {
                            setSelectedCriteria([...selectedCriteria, criterion.value]);
                          }
                        }}
                        className={`px-2 py-1 text-xs rounded-md transition-all ${
                          selectedCriteria.includes(criterion.value)
                            ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        {criterion.label}
                      </button>
                    ))}
                  </div>
                  {/* Custom criteria */}
                  {selectedCriteria.filter(c => !COMMON_CRITERIA.map(cc => cc.value).includes(c)).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedCriteria.filter(c => !COMMON_CRITERIA.map(cc => cc.value).includes(c)).map(criterion => (
                        <span
                          key={criterion}
                          className="px-2 py-1 text-xs rounded-md bg-blue-500/30 text-blue-300 border border-blue-500/50 flex items-center space-x-1"
                        >
                          <span>{criterion}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedCriteria(selectedCriteria.filter(c => c !== criterion))}
                            className="hover:text-red-300"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Add custom criterion */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={customCriterion}
                      onChange={(e) => setCustomCriterion(e.target.value.replace(/[^a-z0-9_\s]/gi, '').toLowerCase())}
                      placeholder="Add custom criterion..."
                      className="flex-1 px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-300 placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCriterion(); } }}
                    />
                    <button
                      type="button"
                      onClick={addCustomCriterion}
                      disabled={!customCriterion}
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
                    disabled={isGeneratingPrompt || (selectedCriteria.length === 0 && !aiContext)}
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
              rows={12}
              hint="Use {inputs} and {outputs} placeholders for conversation context"
              required
            />
          </div>

          <Input
            label="Number of Retries"
            type="number"
            min="0"
            max="10"
            value={formData.numRetries}
            onChange={(e) => setFormData({ ...formData, numRetries: e.target.value })}
            hint="How many times to retry if evaluation fails"
          />

          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={llmOptions.length === 0}>
              Add Guardrail
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

