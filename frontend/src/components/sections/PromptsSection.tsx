import { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Plus, Trash2, Edit2, FileText, Tag, GitBranch, Hash, RefreshCw, Download, Sparkles, Loader2 } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import { useCatalogs, useSchemas, usePrompts, usePromptDetails } from '@/hooks/useDatabricks';
import { databricksNativeApi } from '@/services/databricksNativeApi';
import { SchemaModel, PromptModel, VariableValue } from '@/types/dao-ai-types';
import Button from '../ui/Button';

/**
 * Get the display string from a VariableValue.
 */
function getVariableDisplayValue(value: VariableValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    if ('value' in obj) return String(obj.value);
    if ('env' in obj && obj.default_value !== undefined) return String(obj.default_value);
    if ('env' in obj) return `$${obj.env}`;
    if ('scope' in obj && 'secret' in obj) return `{{secrets/${obj.scope}/${obj.secret}}}`;
  }
  return '';
}
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';

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

import { normalizeRefName, normalizeRefNameWhileTyping } from '@/utils/name-utils';
import { safeDelete } from '@/utils/safe-delete';
import { useYamlScrollStore } from '@/stores/yamlScrollStore';

// Helper function to generate a reference name from a prompt name
function generateRefName(name: string): string {
  return normalizeRefName(name);
}

type SchemaSource = 'reference' | 'direct';
type PromptSource = 'new' | 'existing';

export default function PromptsSection() {
  const { config, addPrompt, updatePrompt, removePrompt } = useConfigStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [promptSource, setPromptSource] = useState<PromptSource>('new');
  const [schemaSource, setSchemaSource] = useState<SchemaSource>('reference');
  const [refNameManuallyEdited, setRefNameManuallyEdited] = useState(false);
  
  // Global service principal for all prompt registry operations
  type AuthMode = 'none' | 'configured' | 'manual';
  const [authMode, setAuthMode] = useState<AuthMode>('configured');
  const [globalServicePrincipal, setGlobalServicePrincipal] = useState<string>('');
  const [manualClientId, setManualClientId] = useState<string>('');
  const [manualClientSecret, setManualClientSecret] = useState<string>('');
  
  const [formData, setFormData] = useState({
    refName: '',
    name: '',
    description: '',
    default_template: DEFAULT_PROMPT_TEMPLATE,
    alias: '',
    version: '',
    schemaRef: '',
    catalog_name: '',
    schema_name: '',
    tags: {} as Record<string, string>,
    existingPromptFullName: '', // Full name of selected existing prompt
    autoRegister: false,
  });
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  
  // Registration state
  const [saveToRegistry, setSaveToRegistry] = useState(true); // Default to saving to registry
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null);
  
  // AI Assistant state
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [aiContext, setAiContext] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);
  const [templateParams, setTemplateParams] = useState<string[]>(['user_id', 'store_num']);
  const [customParam, setCustomParam] = useState('');

  const handleGeneratePrompt = async (improveExisting = false) => {
    setIsGeneratingPrompt(true);
    try {
      const prompt = await generatePromptWithAI({
        context: aiContext || undefined,
        agent_name: formData.name || undefined,
        agent_description: formData.description || undefined,
        existing_prompt: improveExisting ? formData.default_template : undefined,
        template_parameters: templateParams.length > 0 ? templateParams : undefined,
      });
      
      setFormData({ ...formData, default_template: prompt });
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

  const prompts = config.prompts || {};
  const configuredSchemas = config.schemas || {};
  const servicePrincipals = config.service_principals || {};
  const variables = config.variables || {};
  
  // Fetch catalogs and schemas from Databricks
  const { data: catalogs } = useCatalogs();
  const { data: dbSchemas, loading: schemasLoading } = useSchemas(formData.catalog_name || null);
  
  // Get the service principal config for prompt registry operations
  // Memoized to prevent infinite re-renders when passed to usePrompts hook
  const servicePrincipalConfig = useMemo(() => {
    // Helper to resolve variable references like "*var_name" from the variables config
    const resolveVariableRef = (value: unknown): unknown => {
      if (typeof value !== 'string') return value;
      if (!value.startsWith('*')) return value;
      
      const varName = value.slice(1);
      const variable = variables[varName];
      if (!variable) return value; // Can't resolve, return as-is
      
      // Return the variable definition so the backend can resolve env/secret refs
      return variable;
    };
    
    if (authMode === 'configured' && globalServicePrincipal && servicePrincipals[globalServicePrincipal]) {
      const sp = servicePrincipals[globalServicePrincipal];
      // Resolve any variable references in client_id and client_secret
      return {
        client_id: resolveVariableRef(sp.client_id),
        client_secret: resolveVariableRef(sp.client_secret),
      };
    }
    if (authMode === 'manual' && manualClientId && manualClientSecret) {
      return { client_id: manualClientId, client_secret: manualClientSecret };
    }
    return null;
  }, [authMode, globalServicePrincipal, servicePrincipals, variables, manualClientId, manualClientSecret]);
  
  // Fetch existing prompts from MLflow when catalog and schema are selected
  const { data: existingPrompts, loading: promptsLoading, refetch: refetchPrompts } = usePrompts(
    formData.catalog_name || null,
    formData.schema_name || null,
    servicePrincipalConfig
  );
  
  // Fetch prompt details when a prompt is selected
  const { data: promptDetails, loading: detailsLoading } = usePromptDetails(
    formData.existingPromptFullName || null,
    servicePrincipalConfig
  );
  
  // State for template loading errors
  const [templateError, setTemplateError] = useState<string | null>(null);
  
  // Build alias options - ordered: champion first, latest second, then others by version descending
  const aliasOptions = useMemo(() => {
    const existingAliases = promptDetails?.aliases || [];
    const aliasVersionMap = promptDetails?.alias_versions || {};
    
    if (existingAliases.length === 0) {
      return [{ value: '', label: 'No aliases available' }];
    }
    
    // Sort aliases: champion first, latest second, then others by version (descending)
    const sortedAliases = [...existingAliases].sort((a, b) => {
      if (a === 'champion') return -1;
      if (b === 'champion') return 1;
      if (a === 'latest') return -1;
      if (b === 'latest') return 1;
      
      // For other aliases, sort by version number descending
      const versionA = parseInt(aliasVersionMap[a] || '0');
      const versionB = parseInt(aliasVersionMap[b] || '0');
      return versionB - versionA;
    });
    
    return [
      { value: '', label: 'Select an alias...' },
      ...sortedAliases.map(alias => ({
        value: alias,
        label: alias,
      })),
    ];
  }, [promptDetails?.aliases, promptDetails?.alias_versions]);

  // Build version options from prompt details - only valid versions, descending order
  const versionOptions = useMemo(() => {
    const versions = promptDetails?.versions || [];
    
    if (versions.length === 0) {
      return [{ value: '', label: 'No versions available' }];
    }
    
    // Sort versions in descending order (highest first)
    const sortedVersions = [...versions].sort((a, b) => {
      const versionA = parseInt(a.version) || 0;
      const versionB = parseInt(b.version) || 0;
      return versionB - versionA;
    });
    
    return [
      { value: '', label: 'Select a version...' },
      ...sortedVersions.map(v => ({
        value: v.version,
        label: `v${v.version}${v.aliases && v.aliases.length > 0 ? ` (${v.aliases.join(', ')})` : ''}`,
      })),
    ];
  }, [promptDetails?.versions]);
  
  // Set default selection when prompt details load
  useEffect(() => {
    if (!promptDetails || !formData.existingPromptFullName) return;
    
    // IMPORTANT: Only set defaults if promptDetails is for the currently selected prompt
    // This prevents using stale data from a previously selected prompt
    if (promptDetails.full_name !== formData.existingPromptFullName) return;
    
    const existingAliases = promptDetails.aliases || [];
    const aliasVersionMap = promptDetails.alias_versions || {};
    const versions = promptDetails.versions || [];
    
    // Determine default selection
    let defaultAlias = '';
    let defaultVersion = '';
    
    if (existingAliases.includes('champion')) {
      // Champion exists - select it
      defaultAlias = 'champion';
      defaultVersion = aliasVersionMap['champion'] || '';
    } else if (existingAliases.includes('latest')) {
      // Latest exists - select it
      defaultAlias = 'latest';
      defaultVersion = aliasVersionMap['latest'] || '';
    } else if (versions.length > 0) {
      // No champion or latest - select highest version, leave alias empty
      const sortedVersions = [...versions].sort((a, b) => {
        return (parseInt(b.version) || 0) - (parseInt(a.version) || 0);
      });
      defaultVersion = sortedVersions[0]?.version || '';
      defaultAlias = ''; // No alias selected
    }
    
    // Only update if different from current selection to avoid loops
    if (defaultAlias !== formData.alias || defaultVersion !== formData.version) {
      setFormData(prev => ({
        ...prev,
        alias: defaultAlias,
        version: defaultVersion,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptDetails, formData.existingPromptFullName]);

  // Load template when version or alias changes
  useEffect(() => {
    if (!formData.existingPromptFullName) return;
    
    // Wait for promptDetails to load for this specific prompt before loading template
    // This prevents using stale version data from a previously selected prompt
    if (!promptDetails || promptDetails.full_name !== formData.existingPromptFullName) {
      return;
    }
    
    // Don't load template if no version or alias is selected yet
    if (!formData.version && !formData.alias) {
      return;
    }
    
    const loadTemplate = async () => {
      setLoadingTemplate(true);
      setTemplateError(null);
      
      try {
        // Use version number when available
        const versionToUse: string | undefined = formData.version || undefined;
        const aliasToUse: string | undefined = !versionToUse && formData.alias ? formData.alias : undefined;
        
        const result = await databricksNativeApi.getPromptTemplate(
          formData.existingPromptFullName,
          versionToUse,
          aliasToUse,
          servicePrincipalConfig  // Pass service principal for authentication
        );
        
        if (result?.error) {
          // Handle error from API
          if (result.alias_not_found) {
            setTemplateError(`Alias '${formData.alias}' does not exist for this prompt. Try 'latest' or select a specific version.`);
          } else if (result.version_not_found) {
            setTemplateError(`Version ${formData.version} does not exist for this prompt.`);
          } else {
            setTemplateError(result.error);
          }
        } else if (result?.template) {
          setFormData(prev => ({
            ...prev,
            default_template: result.template,
            version: result.version || prev.version || '',
          }));
        } else {
          setTemplateError('No template returned from server');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load prompt template';
        setTemplateError(errorMessage);
        console.error('[PromptsSection] Error loading prompt template:', error);
      } finally {
        setLoadingTemplate(false);
      }
    };
    
    loadTemplate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.existingPromptFullName, formData.version, formData.alias, promptDetails?.full_name]);

  // Update form when prompt details load
  useEffect(() => {
    if (promptDetails && formData.existingPromptFullName) {
      setFormData(prev => ({
        ...prev,
        tags: promptDetails.tags || {},
        description: promptDetails.description || prev.description,
        // Don't override version if user already selected one
        version: prev.version || '',
        // Set template from details if available
        default_template: promptDetails.template || prev.default_template,
      }));
    }
  }, [promptDetails, formData.existingPromptFullName]);

  const resetForm = () => {
    setFormData({
      refName: '',
      name: '',
      description: '',
      default_template: DEFAULT_PROMPT_TEMPLATE,
      alias: '',
      version: '',
      schemaRef: '',
      catalog_name: '',
      schema_name: '',
      tags: {},
      existingPromptFullName: '',
      autoRegister: false,
    });
    setPromptSource('new');
    setSchemaSource('reference');
    setNewTagKey('');
    setNewTagValue('');
    setEditingKey(null);
    setRefNameManuallyEdited(false);
    setRegistrationError(null);
    setRegistrationSuccess(null);
    setSaveToRegistry(true); // Reset to default
  };

  // Handle selecting a configured schema (for existing prompts)
  const handleSchemaRefSelect = (schemaKey: string) => {
    const schema = configuredSchemas[schemaKey];
    if (schema) {
      setFormData({
        ...formData,
        schemaRef: schemaKey,
        catalog_name: getVariableDisplayValue(schema.catalog_name),
        schema_name: getVariableDisplayValue(schema.schema_name),
        existingPromptFullName: '',
        name: '',
        refName: '',
      });
    }
  };

  // Handle selecting an existing prompt from MLflow
  const handleExistingPromptSelect = (fullName: string) => {
    const selectedPrompt = existingPrompts?.find(p => p.full_name === fullName);
    if (selectedPrompt) {
      // Only auto-generate refName if not manually edited
      const newRefName = refNameManuallyEdited ? formData.refName : generateRefName(selectedPrompt.name);
      // Clear version and alias - they will be populated by useEffect once promptDetails loads
      setFormData({
        ...formData,
        existingPromptFullName: fullName,
        name: selectedPrompt.name,
        refName: newRefName,
        description: selectedPrompt.description || '',
        alias: '',  // Clear - will be set by promptDetails useEffect
        version: '',  // Clear - will be set by promptDetails useEffect
        tags: selectedPrompt.tags || {},
      });
      // Clear any previous template error
      setTemplateError(null);
    }
  };

  const { scrollToAsset } = useYamlScrollStore();

  const handleEdit = (key: string) => {
    scrollToAsset(key);
    const prompt = prompts[key];
    
    // Detect if schema is a reference or direct
    let schemaRef = '';
    let catalog_name = '';
    let schema_name = '';
    let detectedSource: SchemaSource = 'direct';
    
    if (prompt.schema) {
      // Check if schema matches any configured schema
      const promptCatalogDisplay = getVariableDisplayValue(prompt.schema.catalog_name);
      const promptSchemaDisplay = getVariableDisplayValue(prompt.schema.schema_name);
      const matchedSchemaKey = Object.entries(configuredSchemas).find(
        ([, s]) => getVariableDisplayValue(s.catalog_name) === promptCatalogDisplay && 
          getVariableDisplayValue(s.schema_name) === promptSchemaDisplay
      );
      if (matchedSchemaKey) {
        schemaRef = matchedSchemaKey[0];
        detectedSource = 'reference';
      } else {
        catalog_name = promptCatalogDisplay;
        schema_name = promptSchemaDisplay;
        detectedSource = 'direct';
      }
    }
    
    setPromptSource('new'); // When editing, treat as manual entry
    setSchemaSource(detectedSource);
    setRefNameManuallyEdited(true); // When editing, consider refName as manually set
    setFormData({
      refName: key,
      name: prompt.name,
      description: prompt.description || '',
      default_template: prompt.default_template || '',
      alias: prompt.alias || '',
      version: prompt.version?.toString() || '',
      schemaRef,
      catalog_name,
      schema_name,
      tags: prompt.tags || {},
      existingPromptFullName: '',
      autoRegister: prompt.auto_register ?? false,
    });
    setEditingKey(key);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.refName || !formData.name) return;

    // Finalize the name - clean up any trailing underscores
    const finalName = normalizeRefName(formData.name);
    if (!finalName) return;

    // Clear previous messages
    setRegistrationError(null);
    setRegistrationSuccess(null);

    // Build schema
    let schema: SchemaModel | undefined;
    let catalogName = '';
    let schemaName = '';
    
    if (schemaSource === 'reference' && formData.schemaRef && configuredSchemas[formData.schemaRef]) {
      schema = configuredSchemas[formData.schemaRef];
      catalogName = getVariableDisplayValue(schema.catalog_name);
      schemaName = getVariableDisplayValue(schema.schema_name);
    } else if (formData.catalog_name && formData.schema_name) {
      schema = {
        catalog_name: formData.catalog_name,
        schema_name: formData.schema_name,
      };
      catalogName = formData.catalog_name;
      schemaName = formData.schema_name;
    }

    // For new prompts with a schema, register in MLflow Prompt Registry first
    // Only register if saveToRegistry is checked
    const shouldRegisterInRegistry = saveToRegistry && 
                                      promptSource === 'new' && 
                                      !editingKey && 
                                      catalogName && 
                                      schemaName && 
                                      formData.default_template;

    let registeredVersion: number | undefined;

    if (shouldRegisterInRegistry) {
      setIsRegistering(true);
      try {
        const result = await databricksNativeApi.registerPrompt(
          finalName,
          catalogName,
          schemaName,
          formData.default_template,
          formData.description || undefined,
          formData.alias || undefined,
          Object.keys(formData.tags).length > 0 ? formData.tags : undefined,
          servicePrincipalConfig
        );

        if (!result.success) {
          setRegistrationError(result.error || 'Failed to register prompt in registry');
          setIsRegistering(false);
          return; // Don't proceed if registration failed
        }

        registeredVersion = result.version;
        setRegistrationSuccess(result.message || `Registered prompt version ${result.version}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error during registration';
        setRegistrationError(errorMessage);
        setIsRegistering(false);
        return; // Don't proceed if registration failed
      }
      setIsRegistering(false);
    }

    const prompt: PromptModel = {
      name: finalName,
      schema,
      description: formData.description || undefined,
      default_template: formData.default_template || undefined,
      // Only include alias and version if saved to registry
      ...(saveToRegistry && {
        alias: formData.alias || undefined,
        // Use the registered version if we just registered, otherwise use form value
        version: registeredVersion ?? (formData.version ? parseInt(formData.version) : undefined),
      }),
      tags: Object.keys(formData.tags).length > 0 ? formData.tags : undefined,
      auto_register: formData.autoRegister || undefined,
      // Note: service_principal is used for authentication when fetching prompts,
      // but should not be saved as part of the prompt configuration
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

  const handleAddTag = () => {
    if (newTagKey && newTagValue) {
      setFormData({
        ...formData,
        tags: { ...formData.tags, [newTagKey]: newTagValue },
      });
      setNewTagKey('');
      setNewTagValue('');
    }
  };

  const handleRemoveTag = (key: string) => {
    const newTags = { ...formData.tags };
    delete newTags[key];
    setFormData({ ...formData, tags: newTags });
  };

  const hasServicePrincipals = Object.keys(servicePrincipals).length > 0;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Prompts</h2>
          <p className="text-slate-400 mt-1">
            Configure reusable prompts for agents with MLflow Prompt Registry integration
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
          <Plus className="w-4 h-4" />
          Add Prompt
        </Button>
      </div>

      {/* Prompt Registry Authentication */}
      <Card className="p-4 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-white mb-1">Prompt Registry Authentication</h3>
          <p className="text-xs text-slate-400">
            Service principal used for all prompt registry operations (browsing, fetching templates)
          </p>
        </div>
        
        {/* Auth Mode Toggle */}
        <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
          <button
            type="button"
            onClick={() => setAuthMode('configured')}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
              authMode === 'configured'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                : 'text-slate-400 border border-transparent hover:text-slate-300'
            }`}
          >
            Configured
          </button>
          <button
            type="button"
            onClick={() => setAuthMode('manual')}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
              authMode === 'manual'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                : 'text-slate-400 border border-transparent hover:text-slate-300'
            }`}
          >
            Manual
          </button>
        </div>
        
        {/* Configured Service Principal Selection */}
        {authMode === 'configured' && (
          <div className="space-y-2">
            <select
              value={globalServicePrincipal}
              onChange={(e) => setGlobalServicePrincipal(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">Select a service principal...</option>
              {Object.keys(servicePrincipals).map((sp) => (
                <option key={sp} value={sp}>{sp}</option>
              ))}
            </select>
            {!hasServicePrincipals && (
              <p className="text-xs text-amber-400/70">
                No service principals configured. Add them in Resources → Service Principals.
              </p>
            )}
          </div>
        )}
        
        {/* Manual Credentials Entry */}
        {authMode === 'manual' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Client ID</label>
              <input
                type="text"
                value={manualClientId}
                onChange={(e) => setManualClientId(e.target.value)}
                placeholder="Enter client ID..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400">Client Secret</label>
              <input
                type="password"
                value={manualClientSecret}
                onChange={(e) => setManualClientSecret(e.target.value)}
                placeholder="Enter client secret..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
        )}
        
        {/* Status indicator */}
        {servicePrincipalConfig && (
          <p className="text-xs text-emerald-400">
            ✓ Custom authentication configured
          </p>
        )}
      </Card>

      {/* Prompt List */}
      {Object.keys(prompts).length === 0 ? (
        <Card className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">No prompts configured</h3>
          <p className="text-slate-500 mb-4 max-w-md mx-auto">
            Prompts define agent behavior and can be version-controlled through MLflow Prompt Registry.
            Use aliases like &quot;production&quot; or &quot;staging&quot; for environment management.
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
                      {prompt.alias && (
                        <Badge variant="info">
                          <GitBranch className="w-3 h-3 mr-1" />
                          @{prompt.alias}
                        </Badge>
                      )}
                      {prompt.version && (
                        <Badge variant="default">
                          <Hash className="w-3 h-3 mr-1" />
                          v{prompt.version}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-1">
                      {prompt.schema ? `${getVariableDisplayValue(prompt.schema.catalog_name)}.${getVariableDisplayValue(prompt.schema.schema_name)}.${prompt.name}` : prompt.name}
                    </p>
                    {prompt.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {prompt.description}
                      </p>
                    )}
                    {prompt.tags && Object.keys(prompt.tags).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(prompt.tags).map(([tagKey, tagValue]) => (
                          <span key={tagKey} className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                            <Tag className="w-3 h-3 inline mr-1" />
                            {tagKey}: {tagValue}
                          </span>
                        ))}
                      </div>
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
          {/* Prompt Source Toggle (only show for new prompts) */}
          {!editingKey && (
            <div className="flex items-center justify-center space-x-4 p-3 bg-slate-800/50 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setPromptSource('new');
                  setFormData({ ...formData, existingPromptFullName: '' });
                }}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  promptSource === 'new'
                    ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                    : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>New Prompt</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPromptSource('existing');
                }}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  promptSource === 'existing'
                    ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                    : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>Existing Prompt</span>
              </button>
            </div>
          )}

          {/* Existing Prompt Selection */}
          {promptSource === 'existing' && !editingKey && (
            <div className="space-y-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700">
              <h4 className="text-sm font-medium text-slate-300">Select Existing Prompt from MLflow Registry</h4>
              
              {/* Schema Source Toggle (like Tables/Functions) */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300">Schema</label>
                <div className="flex space-x-2">
                  <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        setSchemaSource('reference');
                        setRefNameManuallyEdited(false);
                        setFormData({ ...formData, catalog_name: '', schema_name: '', existingPromptFullName: '', name: '', refName: '' });
                      }}
                      className={`flex-1 px-3 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
                        schemaSource === 'reference'
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                          : 'text-slate-400 border border-transparent hover:text-slate-300'
                      }`}
                    >
                      Configured
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSchemaSource('direct');
                        setRefNameManuallyEdited(false);
                        setFormData({ ...formData, schemaRef: '', existingPromptFullName: '', name: '', refName: '' });
                      }}
                      className={`flex-1 px-3 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
                        schemaSource === 'direct'
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                          : 'text-slate-400 border border-transparent hover:text-slate-300'
                      }`}
                    >
                      Select
                    </button>
                  </div>
                </div>

                {schemaSource === 'reference' ? (
                  <Select
                    label="Schema Reference"
                    value={formData.schemaRef}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => handleSchemaRefSelect(e.target.value)}
                    options={[
                      { value: '', label: 'Select a configured schema...' },
                      ...Object.entries(configuredSchemas).map(([key, s]) => ({
                        value: key,
                        label: `${key} (${getVariableDisplayValue(s.catalog_name)}.${getVariableDisplayValue(s.schema_name)})`,
                      })),
                    ]}
                    hint="Reference a schema defined in the Schemas section"
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Catalog"
                      value={formData.catalog_name}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ 
                        ...formData, 
                        catalog_name: e.target.value, 
                        schema_name: '',
                        existingPromptFullName: '',
                        name: '',
                        refName: '',
                      })}
                      options={[
                        { value: '', label: 'Select catalog...' },
                        ...(catalogs || []).map((c) => ({ value: c.name, label: c.name })),
                      ]}
                    />
                    <Select
                      label="Schema"
                      value={formData.schema_name}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ 
                        ...formData, 
                        schema_name: e.target.value,
                        existingPromptFullName: '',
                        name: '',
                        refName: '',
                      })}
                      options={[
                        { value: '', label: schemasLoading ? 'Loading...' : 'Select schema...' },
                        ...(dbSchemas || []).map((s) => ({ value: s.name, label: s.name })),
                      ]}
                      disabled={!formData.catalog_name || schemasLoading}
                    />
                  </div>
                )}
              </div>

              {/* Existing Prompt Dropdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">Available Prompts</label>
                  {(formData.catalog_name && formData.schema_name) || formData.schemaRef ? (
                    <button
                      type="button"
                      onClick={() => refetchPrompts()}
                      className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                      disabled={promptsLoading}
                    >
                      <RefreshCw className={`w-3 h-3 ${promptsLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                  ) : null}
                </div>
                <Select
                  value={formData.existingPromptFullName}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => handleExistingPromptSelect(e.target.value)}
                  options={[
                    { value: '', label: promptsLoading ? 'Loading prompts...' : 'Select a prompt...' },
                    ...(existingPrompts || []).map((p) => ({
                      value: p.full_name,
                      label: `${p.name}${p.description ? ` - ${p.description.substring(0, 50)}${p.description.length > 50 ? '...' : ''}` : ''}`,
                    })),
                  ]}
                  disabled={(!formData.catalog_name || !formData.schema_name) && !formData.schemaRef || promptsLoading}
                />
                {((formData.catalog_name && formData.schema_name) || formData.schemaRef) && !promptsLoading && (!existingPrompts || existingPrompts.length === 0) && (
                  <p className="text-xs text-amber-400">
                    No prompts found in this schema. Try selecting a different schema or create a new prompt.
                  </p>
                )}
              </div>

              {/* Version and Alias Selection (only when prompt is selected) */}
              {formData.existingPromptFullName && (
                <div className="space-y-3 pt-3 border-t border-slate-700">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-300">Version & Alias</p>
                    {(detailsLoading || loadingTemplate) && (
                      <span className="text-xs text-slate-400 flex items-center space-x-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>{loadingTemplate ? 'Loading template...' : 'Loading details...'}</span>
                      </span>
                    )}
                  </div>
                  
                  {/* Error message for template loading */}
                  {templateError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <p className="text-xs text-red-400">{templateError}</p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Alias"
                      value={formData.alias}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                        setTemplateError(null);
                        const selectedAlias = e.target.value;
                        
                        // Look up corresponding version for this alias
                        const aliasVersionMap = promptDetails?.alias_versions;
                        let correspondingVersion = '';
                        
                        if (selectedAlias && aliasVersionMap && aliasVersionMap[selectedAlias]) {
                          correspondingVersion = aliasVersionMap[selectedAlias];
                        } else if (selectedAlias === 'latest' && promptDetails?.latest_version) {
                          correspondingVersion = promptDetails.latest_version;
                        }
                        
                        setFormData({ 
                          ...formData, 
                          alias: selectedAlias, 
                          version: correspondingVersion 
                        });
                      }}
                      options={aliasOptions}
                      hint="Select an alias configured for this prompt"
                    />
                    <Select
                      label="Version"
                      value={formData.version}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                        setTemplateError(null);
                        const selectedVersion = e.target.value;
                        
                        // Look up corresponding alias for this version
                        const aliasVersionMap = promptDetails?.alias_versions;
                        let correspondingAlias = '';
                        
                        if (selectedVersion && aliasVersionMap) {
                          // Find alias that maps to this version
                          for (const [alias, ver] of Object.entries(aliasVersionMap)) {
                            if (ver === selectedVersion) {
                              correspondingAlias = alias;
                              break;
                            }
                          }
                        }
                        
                        setFormData({ 
                          ...formData, 
                          version: selectedVersion, 
                          alias: correspondingAlias 
                        });
                      }}
                      options={versionOptions}
                      hint="Pin to a specific version number"
                    />
                  </div>
                  
                  {/* Show current selection info */}
                  {(formData.alias || formData.version) && !templateError && !loadingTemplate && (
                    <p className="text-xs text-emerald-400">
                      ✓ Using {formData.alias && formData.version 
                        ? `alias: ${formData.alias} (v${formData.version})`
                        : formData.alias 
                          ? `alias: ${formData.alias}` 
                          : `version: v${formData.version}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

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
                // Normalize while typing - spaces become underscores, keeps case
                const name = normalizeRefNameWhileTyping(rawValue);
                // Only auto-generate refName if not manually edited and not editing existing
                const shouldAutoGenerateRef = !editingKey && !refNameManuallyEdited;
                setFormData({ 
                  ...formData, 
                  name,
                  refName: shouldAutoGenerateRef ? generateRefName(name) : formData.refName,
                });
              }}
              hint="Type naturally - spaces become underscores"
              required
              disabled={promptSource === 'existing' && !!formData.existingPromptFullName}
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
            hint="Used as commit message when syncing to MLflow registry"
          />

          {/* Save to Registry Checkbox - Only show for new prompts */}
          {promptSource === 'new' && !editingKey && (
            <div className="flex items-center space-x-3 p-3 bg-slate-800/50 rounded-lg">
              <input
                type="checkbox"
                id="saveToRegistry"
                checked={saveToRegistry}
                onChange={(e) => setSaveToRegistry(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500 focus:ring-offset-0"
              />
              <div>
                <label htmlFor="saveToRegistry" className="text-sm font-medium text-slate-300 cursor-pointer">
                  Save to Prompt Registry
                </label>
                <p className="text-xs text-slate-500">
                  {saveToRegistry 
                    ? 'Prompt will be registered in MLflow with versioning and the configured alias'
                    : 'Only the default_template will be saved to YAML (no registry, no alias)'}
                </p>
              </div>
            </div>
          )}

          {/* Auto Register Toggle */}
          <div className="flex items-center space-x-3 p-3 bg-slate-800/50 rounded-lg">
            <input
              type="checkbox"
              id="autoRegister"
              checked={formData.autoRegister}
              onChange={(e) => setFormData({ ...formData, autoRegister: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500 focus:ring-offset-0"
            />
            <div>
              <label htmlFor="autoRegister" className="text-sm font-medium text-slate-300 cursor-pointer">
                Auto Register
              </label>
              <p className="text-xs text-slate-500">
                Automatically register this prompt in MLflow when the application starts
              </p>
            </div>
          </div>

          {/* Schema Selection - Only show for new prompts */}
          {promptSource === 'new' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300">Schema (Optional)</label>
              <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5 w-full">
                <button
                  type="button"
                  onClick={() => { setSchemaSource('reference'); setFormData({ ...formData, catalog_name: '', schema_name: '' }); }}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
                    schemaSource === 'reference'
                      ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                      : 'text-slate-400 border border-transparent hover:text-slate-300'
                  }`}
                >
                  Configured
                </button>
                <button
                  type="button"
                  onClick={() => { setSchemaSource('direct'); setFormData({ ...formData, schemaRef: '' }); }}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
                    schemaSource === 'direct'
                      ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                      : 'text-slate-400 border border-transparent hover:text-slate-300'
                  }`}
                >
                  Select
                </button>
              </div>
              
              {schemaSource === 'reference' ? (
                <Select
                  label="Schema Reference"
                  value={formData.schemaRef}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, schemaRef: e.target.value })}
                  options={[
                    { value: '', label: 'Select a configured schema...' },
                    ...Object.entries(configuredSchemas).map(([key, s]) => ({
                      value: key,
                      label: `${key} (${getVariableDisplayValue(s.catalog_name)}.${getVariableDisplayValue(s.schema_name)})`,
                    })),
                  ]}
                  hint="Reference a schema defined in the Schemas section"
                />
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Catalog"
                      value={formData.catalog_name}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, catalog_name: e.target.value, schema_name: '' })}
                      options={[
                        { value: '', label: 'Select catalog...' },
                        ...(catalogs || []).map((c) => ({ value: c.name, label: c.name })),
                      ]}
                    />
                    <Select
                      label="Schema"
                      value={formData.schema_name}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, schema_name: e.target.value })}
                      options={[
                        { value: '', label: schemasLoading ? 'Loading schemas...' : 'Select schema...' },
                        ...(dbSchemas || []).map((s) => ({ value: s.name, label: s.name })),
                      ]}
                      disabled={!formData.catalog_name || schemasLoading}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Associate prompt with a Unity Catalog schema for the full name (catalog.schema.prompt_name)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* MLflow Registry Options - Only for new prompts when saving to registry */}
          {promptSource === 'new' && saveToRegistry && (
            <div>
              <Input
                label="Alias (Optional)"
                placeholder="e.g., champion, production, staging"
                value={formData.alias}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, alias: e.target.value })}
                hint="Set an alias for this prompt version (e.g., champion, default)"
              />
              <p className="text-xs text-slate-500 mt-1">
                Version is auto-assigned when registering a new prompt. Use alias to reference specific versions.
              </p>
            </div>
          )}

          {/* Default Template */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">
                {promptSource === 'existing' ? 'Template' : 'Default Template'}
              </label>
              <div className="flex items-center space-x-2">
                {loadingTemplate && (
                  <span className="text-xs text-slate-400 flex items-center space-x-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Loading template...</span>
                  </span>
                )}
              </div>
            </div>
            
            {/* AI Assistant Controls - only show for new prompts */}
            {promptSource === 'new' && (
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
                {formData.default_template && formData.default_template !== DEFAULT_PROMPT_TEMPLATE && (
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
            )}
            
            {/* AI Context Input - only show for new prompts */}
            {promptSource === 'new' && showAiInput && (
              <div className="p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30 space-y-3">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">Generate Prompt with AI</span>
                </div>
                <p className="text-xs text-slate-400">
                  Describe what this prompt should do and I'll generate an optimized template for you.
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
              value={formData.default_template}
              onChange={(e) => promptSource === 'new' && setFormData({ ...formData, default_template: e.target.value })}
              rows={10}
              readOnly={promptSource === 'existing'}
              className={promptSource === 'existing' ? 'bg-slate-800/50 cursor-not-allowed' : ''}
              hint={promptSource === 'existing' 
                ? "Template loaded from MLflow registry (read-only)."
                : "Fallback template if MLflow registry is unavailable. Use {variable_name} for substitutions."
              }
            />
          </div>

          {/* Tags */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-300">Tags</label>
            
            {/* Existing Tags */}
            {Object.keys(formData.tags).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(formData.tags).map(([tagKey, tagValue]) => (
                  <div key={tagKey} className="flex items-center space-x-1 px-2 py-1 bg-slate-700/50 rounded text-sm">
                    <Tag className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-300">{tagKey}:</span>
                    <span className="text-slate-400">{tagValue}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tagKey)}
                      className="ml-1 text-slate-500 hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {/* Add New Tag */}
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Key (e.g., environment)"
                value={newTagKey}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTagKey(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Value (e.g., production)"
                value={newTagValue}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTagValue(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddTag}
                disabled={!newTagKey || !newTagValue}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Metadata tags for organization and filtering in MLflow
            </p>
          </div>

          {/* Service Principal Info */}
          {servicePrincipalConfig && (
            <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
              <p className="text-xs text-violet-300">
                {authMode === 'configured' 
                  ? <>Using service principal: <span className="font-medium">{globalServicePrincipal}</span></>
                  : <>Using manual credentials</>
                }
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Change this in the Prompt Registry Authentication section above.
              </p>
            </div>
          )}

          {/* Registration Status Messages */}
          {registrationError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400 font-medium">Registration Failed</p>
              <p className="text-xs text-red-300 mt-1">{registrationError}</p>
            </div>
          )}
          
          {registrationSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <p className="text-sm text-emerald-400">✓ {registrationSuccess}</p>
            </div>
          )}

          {/* Registry Info for new prompts with schema */}
          {promptSource === 'new' && !editingKey && (formData.catalog_name || formData.schemaRef) && formData.name && formData.default_template && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-xs text-blue-300">
                <span className="font-medium">Registry:</span> This prompt will be registered in MLflow Prompt Registry at{' '}
                <span className="font-mono text-blue-200">
                  {formData.schemaRef && configuredSchemas[formData.schemaRef]
                    ? `${configuredSchemas[formData.schemaRef].catalog_name}.${configuredSchemas[formData.schemaRef].schema_name}.${formData.name}`
                    : `${formData.catalog_name}.${formData.schema_name}.${formData.name}`
                  }
                </span>
              </p>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => { resetForm(); setIsModalOpen(false); }} disabled={isRegistering}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formData.refName || !formData.name || isRegistering}>
              {isRegistering ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Registering...
                </>
              ) : (
                editingKey ? 'Update Prompt' : 'Add Prompt'
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
