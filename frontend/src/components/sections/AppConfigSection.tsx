import { useState, useEffect } from 'react';
import { Settings, Save, GitBranch, Users, ArrowRightLeft, Plus, Trash2, Info, Bot, X, Tag } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { LogLevel } from '@/types/dao-ai-types';
import { clsx } from 'clsx';

const LOG_LEVELS = [
  { value: 'TRACE', label: 'TRACE' },
  { value: 'DEBUG', label: 'DEBUG' },
  { value: 'INFO', label: 'INFO' },
  { value: 'WARNING', label: 'WARNING' },
  { value: 'ERROR', label: 'ERROR' },
];

const WORKLOAD_SIZES = [
  { value: 'Small', label: 'Small' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Large', label: 'Large' },
];

type OrchestrationPattern = 'supervisor' | 'swarm' | 'none';
type HandoffType = 'any' | 'none' | 'specific';

interface HandoffConfig {
  agentName: string;
  type: HandoffType;
  targets: string[];
}

export default function AppConfigSection() {
  const { config, updateApp } = useConfigStore();
  const app = config.app;
  const schemas = config.schemas || {};
  const agents = config.agents || {};
  const llms = config.resources?.llms || {};

  // App settings form
  const [formData, setFormData] = useState({
    name: app?.name || '',
    description: app?.description || '',
    logLevel: app?.log_level || 'INFO',
    endpointName: app?.endpoint_name || '',
    modelName: app?.registered_model?.name || '',
    modelSchema: '',
    workloadSize: app?.workload_size || 'Small',
    scaleToZero: app?.scale_to_zero ?? true,
  });

  // Tags state - values can be strings, booleans, or numbers from YAML
  const [tags, setTags] = useState<Record<string, string | boolean | number>>(
    (app?.tags as Record<string, string | boolean | number>) || {}
  );
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');

  // Permissions state
  interface PermissionEntry {
    principals: string[];
    entitlements: string[];
  }
  const ENTITLEMENT_OPTIONS = [
    { value: 'CAN_MANAGE', label: 'Can Manage' },
    { value: 'CAN_QUERY', label: 'Can Query' },
    { value: 'CAN_VIEW', label: 'Can View' },
    { value: 'CAN_REVIEW', label: 'Can Review' },
    { value: 'NO_PERMISSIONS', label: 'No Permissions' },
  ];
  const [permissions, setPermissions] = useState<PermissionEntry[]>(
    app?.permissions?.map(p => ({
      principals: p.principals || [],
      entitlements: p.entitlements || [],
    })) || []
  );
  const [newPrincipal, setNewPrincipal] = useState('');

  // Selected agents for the app
  const [selectedAgents, setSelectedAgents] = useState<string[]>(() => {
    // Initialize from existing app.agents
    if (app?.agents && Array.isArray(app.agents)) {
      return app.agents.map(a => {
        // Find the key in config.agents that matches this agent's name
        const matchedKey = Object.entries(agents).find(([, agent]) => agent.name === a.name)?.[0];
        return matchedKey || '';
      }).filter(Boolean);
    }
    return [];
  });

  // Orchestration state
  const [pattern, setPattern] = useState<OrchestrationPattern>(
    config.app?.orchestration?.supervisor ? 'supervisor' :
    config.app?.orchestration?.swarm ? 'swarm' : 'none'
  );
  const [supervisorPrompt, setSupervisorPrompt] = useState(
    config.app?.orchestration?.supervisor?.prompt || ''
  );
  const [selectedLLM, setSelectedLLM] = useState(() => {
    const existingModel = config.app?.orchestration?.supervisor?.model?.name || 
                          config.app?.orchestration?.swarm?.model?.name;
    if (existingModel) {
      const found = Object.entries(llms).find(([, llm]) => llm.name === existingModel);
      return found ? found[0] : '';
    }
    return '';
  });
  const [defaultAgent, setDefaultAgent] = useState(() => {
    const existing = config.app?.orchestration?.swarm?.default_agent;
    if (typeof existing === 'string') return existing;
    if (existing && 'name' in existing) return existing.name;
    return '';
  });
  const [handoffs, setHandoffs] = useState<HandoffConfig[]>(() => {
    const existingHandoffs = config.app?.orchestration?.swarm?.handoffs;
    if (!existingHandoffs) return [];
    
    return Object.entries(existingHandoffs).map(([agentName, targets]) => {
      if (targets === null || targets === undefined) {
        return { agentName, type: 'any' as HandoffType, targets: [] };
      }
      if (Array.isArray(targets) && targets.length === 0) {
        return { agentName, type: 'none' as HandoffType, targets: [] };
      }
      const targetNames = (targets as (string | { name: string })[]).map(t => 
        typeof t === 'string' ? t : t.name
      );
      return { agentName, type: 'specific' as HandoffType, targets: targetNames };
    });
  });

  // Determine if there are unsaved changes
  const hasChanges = (() => {
    // Check basic form fields
    if (formData.name !== (app?.name || '')) return true;
    if (formData.description !== (app?.description || '')) return true;
    if (formData.logLevel !== (app?.log_level || 'INFO')) return true;
    if (formData.endpointName !== (app?.endpoint_name || '')) return true;
    if (formData.modelName !== (app?.registered_model?.name || '')) return true;
    if (formData.workloadSize !== (app?.workload_size || 'Small')) return true;
    if (formData.scaleToZero !== (app?.scale_to_zero ?? true)) return true;
    
    // Check selected agents
    const savedAgentKeys = (app?.agents || []).map(a => {
      const matchedKey = Object.entries(agents).find(([, agent]) => agent.name === a.name)?.[0];
      return matchedKey || '';
    }).filter(Boolean).sort();
    const currentAgentKeys = [...selectedAgents].sort();
    if (JSON.stringify(savedAgentKeys) !== JSON.stringify(currentAgentKeys)) return true;
    
    // Check orchestration pattern
    const savedPattern: OrchestrationPattern = 
      app?.orchestration?.supervisor ? 'supervisor' :
      app?.orchestration?.swarm ? 'swarm' : 'none';
    if (pattern !== savedPattern) return true;
    
    // Check orchestration details
    if (pattern === 'supervisor') {
      const savedLLMName = app?.orchestration?.supervisor?.model?.name;
      const currentLLMName = selectedLLM ? llms[selectedLLM]?.name : '';
      if (savedLLMName !== currentLLMName) return true;
      if (supervisorPrompt !== (app?.orchestration?.supervisor?.prompt || '')) return true;
    } else if (pattern === 'swarm') {
      const savedLLMName = app?.orchestration?.swarm?.model?.name;
      const currentLLMName = selectedLLM ? llms[selectedLLM]?.name : '';
      if (savedLLMName !== currentLLMName) return true;
      
      const savedDefaultAgent = app?.orchestration?.swarm?.default_agent;
      const savedDefaultAgentName = typeof savedDefaultAgent === 'string' ? savedDefaultAgent : savedDefaultAgent?.name || '';
      if (defaultAgent !== savedDefaultAgentName) return true;
      
      // Check handoffs (simplified comparison)
      const savedHandoffs = app?.orchestration?.swarm?.handoffs || {};
      const currentHandoffsDict: Record<string, string[] | null> = {};
      handoffs.forEach(h => {
        if (h.type === 'any') currentHandoffsDict[h.agentName] = null;
        else if (h.type === 'none') currentHandoffsDict[h.agentName] = [];
        else currentHandoffsDict[h.agentName] = h.targets;
      });
      if (JSON.stringify(savedHandoffs) !== JSON.stringify(currentHandoffsDict)) return true;
    }
    
    // Check tags
    const savedTags = (app?.tags as Record<string, string | boolean | number>) || {};
    if (JSON.stringify(savedTags) !== JSON.stringify(tags)) return true;
    
    // Check permissions
    const savedPermissions = app?.permissions || [];
    if (JSON.stringify(savedPermissions) !== JSON.stringify(permissions)) return true;
    
    return false;
  })();

  const schemaOptions = [
    { value: '', label: 'None' },
    ...Object.keys(schemas).map((key) => ({
      value: key,
      label: key,
    })),
  ];

  const llmOptions = [
    { value: '', label: 'Select an LLM...' },
    ...Object.entries(llms).map(([key, llm]) => ({
      value: key,
      label: `${key} (${llm.name})`,
    })),
  ];

  const agentNames = Object.keys(agents);
  
  // For swarm orchestration, only show agents that are selected for the app
  const availableAgentsForSwarm = selectedAgents.filter(key => agents[key]);
  
  const agentOptions = [
    { value: '', label: selectedAgents.length === 0 ? 'Select agents for app first...' : 'Select an agent...' },
    ...availableAgentsForSwarm.map((key) => ({
      value: key,
      label: agents[key].name,
    })),
  ];

  const handoffTypeOptions = [
    { value: 'any', label: 'Any Agent (can hand off to all)' },
    { value: 'specific', label: 'Specific Agents (select targets)' },
    { value: 'none', label: 'No Handoffs (terminal agent)' },
  ];

  // Only show agents selected for the app that don't have handoff rules yet
  const unusedAgentsForHandoffs = availableAgentsForSwarm.filter(
    name => !handoffs.some(h => h.agentName === name)
  );

  // Sync form data when config changes
  useEffect(() => {
    setFormData({
      name: app?.name || '',
      description: app?.description || '',
      logLevel: app?.log_level || 'INFO',
      endpointName: app?.endpoint_name || '',
      modelName: app?.registered_model?.name || '',
      modelSchema: '',
      workloadSize: app?.workload_size || 'Small',
      scaleToZero: app?.scale_to_zero ?? true,
    });
    
    // Sync selected agents
    if (app?.agents && Array.isArray(app.agents)) {
      const agentKeys = app.agents.map(a => {
        const matchedKey = Object.entries(agents).find(([, agent]) => agent.name === a.name)?.[0];
        return matchedKey || '';
      }).filter(Boolean);
      setSelectedAgents(agentKeys);
    } else {
      setSelectedAgents([]);
    }
    
    // Sync orchestration pattern and settings
    const newPattern: OrchestrationPattern = 
      app?.orchestration?.supervisor ? 'supervisor' :
      app?.orchestration?.swarm ? 'swarm' : 'none';
    setPattern(newPattern);
    
    // Sync orchestration model
    const existingModel = app?.orchestration?.supervisor?.model?.name || 
                          app?.orchestration?.swarm?.model?.name;
    if (existingModel) {
      const found = Object.entries(llms).find(([, llm]) => llm.name === existingModel);
      setSelectedLLM(found ? found[0] : '');
    } else {
      setSelectedLLM('');
    }
    
    // Sync supervisor prompt
    setSupervisorPrompt(app?.orchestration?.supervisor?.prompt || '');
    
    // Sync swarm default agent
    const existingDefault = app?.orchestration?.swarm?.default_agent;
    if (typeof existingDefault === 'string') {
      setDefaultAgent(existingDefault);
    } else if (existingDefault && 'name' in existingDefault) {
      setDefaultAgent(existingDefault.name);
    } else {
      setDefaultAgent('');
    }
    
    // Sync handoffs
    const existingHandoffs = app?.orchestration?.swarm?.handoffs;
    if (existingHandoffs) {
      const newHandoffs: HandoffConfig[] = Object.entries(existingHandoffs).map(([agentName, targets]) => {
        if (targets === null || targets === undefined) {
          return { agentName, type: 'any' as HandoffType, targets: [] };
        }
        if (Array.isArray(targets) && targets.length === 0) {
          return { agentName, type: 'none' as HandoffType, targets: [] };
        }
        const targetNames = (targets as (string | { name: string })[]).map(t => 
          typeof t === 'string' ? t : t.name
        );
        return { agentName, type: 'specific' as HandoffType, targets: targetNames };
      });
      setHandoffs(newHandoffs);
    } else {
      setHandoffs([]);
    }
    
    // Sync tags
    setTags((app?.tags as Record<string, string | boolean | number>) || {});
    
    // Sync permissions
    setPermissions(
      app?.permissions?.map(p => ({
        principals: p.principals || [],
        entitlements: p.entitlements || [],
      })) || []
    );
  }, [app, agents, llms]);

  const addHandoff = () => {
    if (unusedAgentsForHandoffs.length > 0) {
      setHandoffs([...handoffs, { 
        agentName: unusedAgentsForHandoffs[0], 
        type: 'any', 
        targets: [] 
      }]);
    }
  };

  const removeHandoff = (index: number) => {
    setHandoffs(handoffs.filter((_, i) => i !== index));
  };

  const updateHandoff = (index: number, updates: Partial<HandoffConfig>) => {
    setHandoffs(handoffs.map((h, i) => i === index ? { ...h, ...updates } : h));
  };

  const toggleTarget = (handoffIndex: number, targetAgent: string) => {
    const handoff = handoffs[handoffIndex];
    const newTargets = handoff.targets.includes(targetAgent)
      ? handoff.targets.filter(t => t !== targetAgent)
      : [...handoff.targets, targetAgent];
    updateHandoff(handoffIndex, { targets: newTargets });
  };

  const handleSave = () => {
    const selectedSchema = formData.modelSchema ? schemas[formData.modelSchema] : undefined;

    // Build orchestration config
    let orchestration: any = undefined;
    if (pattern === 'supervisor' && selectedLLM && llms[selectedLLM]) {
      orchestration = {
        supervisor: {
          model: llms[selectedLLM],
          ...(supervisorPrompt && { prompt: supervisorPrompt }),
        },
      };
    } else if (pattern === 'swarm' && selectedLLM && llms[selectedLLM]) {
      const handoffsDict: Record<string, string[] | null> = {};
      handoffs.forEach(h => {
        if (h.type === 'any') {
          handoffsDict[h.agentName] = null;
        } else if (h.type === 'none') {
          handoffsDict[h.agentName] = [];
        } else {
          handoffsDict[h.agentName] = h.targets;
        }
      });

      orchestration = {
        swarm: {
          model: llms[selectedLLM],
          ...(defaultAgent && agents[defaultAgent] && { default_agent: defaultAgent }),
          ...(Object.keys(handoffsDict).length > 0 && { handoffs: handoffsDict }),
        },
      };
    }

    // Build agents array from selected agent keys
    const appAgents = selectedAgents
      .map(key => agents[key])
      .filter(Boolean);

    updateApp({
      name: formData.name,
      description: formData.description || undefined,
      log_level: formData.logLevel as LogLevel,
      endpoint_name: formData.endpointName || undefined,
      registered_model: {
        name: formData.modelName,
        ...(selectedSchema && { schema: selectedSchema }),
      },
      workload_size: formData.workloadSize as 'Small' | 'Medium' | 'Large',
      scale_to_zero: formData.scaleToZero,
      orchestration,
      agents: appAgents.length > 0 ? appAgents : undefined,
      tags: Object.keys(tags).length > 0 ? tags : undefined,
      permissions: permissions.length > 0 ? permissions : undefined,
    });
  };

  const toggleAgent = (agentKey: string) => {
    setSelectedAgents(prev => 
      prev.includes(agentKey)
        ? prev.filter(k => k !== agentKey)
        : [...prev, agentKey]
    );
  };

  const selectAllAgents = () => {
    setSelectedAgents(Object.keys(agents));
  };

  const clearAllAgents = () => {
    setSelectedAgents([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Application</h2>
        <p className="text-slate-400 mt-1">
          Configure your application settings, orchestration, and deployment options
        </p>
      </div>

      {/* Main Config */}
      <Card className="space-y-4">
        <div className="flex items-center space-x-2 mb-4">
          <Settings className="w-5 h-5 text-slate-400" />
          <h3 className="font-medium text-white">Application Settings</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Application Name"
            placeholder="e.g., my_retail_app"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Select
            label="Log Level"
            options={LOG_LEVELS}
            value={formData.logLevel}
            onChange={(e) => setFormData({ ...formData, logLevel: e.target.value as LogLevel })}
          />
        </div>

        <Input
          label="Description"
          placeholder="Brief description of your application"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />

        <Input
          label="Endpoint Name"
          placeholder="e.g., my_agent_endpoint"
          value={formData.endpointName}
          onChange={(e) => setFormData({ ...formData, endpointName: e.target.value })}
          hint="The name of the model serving endpoint"
        />
      </Card>

      {/* Agent Selection - Must come before Orchestration */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bot className="w-5 h-5 text-slate-400" />
            <h3 className="font-medium text-white">Application Agents</h3>
          </div>
          <div className="flex items-center space-x-2">
            {agentNames.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllAgents}
                  disabled={selectedAgents.length === agentNames.length}
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllAgents}
                  disabled={selectedAgents.length === 0}
                >
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-400">
          Select the agents to include in this application. These agents will be available for orchestration.
        </p>

        {agentNames.length === 0 ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-400 text-sm">
            No agents configured. Add agents in the Agents section first.
          </div>
        ) : (
          <div className="space-y-2">
            {agentNames.map((key) => {
              const agent = agents[key];
              const isSelected = selectedAgents.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleAgent(key)}
                  className={clsx(
                    'w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left',
                    isSelected
                      ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/30'
                      : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <div className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      isSelected ? 'bg-blue-500/20' : 'bg-slate-700'
                    )}>
                      <Bot className={clsx('w-4 h-4', isSelected ? 'text-blue-400' : 'text-slate-400')} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{agent.name}</p>
                      {agent.description && (
                        <p className="text-xs text-slate-500 line-clamp-1">{agent.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {agent.tools && agent.tools.length > 0 && (
                      <Badge variant="default" className="text-[10px]">
                        {agent.tools.length} tools
                      </Badge>
                    )}
                    {isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-slate-600" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selectedAgents.length > 0 && (
          <div className="pt-3 border-t border-slate-700">
            <p className="text-xs text-slate-500 mb-2">Selected agents ({selectedAgents.length})</p>
            <div className="flex flex-wrap gap-2">
              {selectedAgents.map(key => (
                <span
                  key={key}
                  className="inline-flex items-center px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs"
                >
                  {agents[key]?.name || key}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleAgent(key); }}
                    className="ml-1.5 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Orchestration Configuration */}
      <Card className="space-y-4">
        <div className="flex items-center space-x-2 mb-2">
          <ArrowRightLeft className="w-5 h-5 text-slate-400" />
          <h3 className="font-medium text-white">Orchestration</h3>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Configure how agents work together in your multi-agent system
        </p>

        {/* Pattern Selection */}
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setPattern('none')}
            className={clsx(
              'p-4 rounded-lg border text-center transition-all',
              pattern === 'none'
                ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            )}
          >
            <div className="w-10 h-10 mx-auto rounded-lg bg-slate-700 flex items-center justify-center mb-2">
              <GitBranch className="w-5 h-5 text-slate-400" />
            </div>
            <h4 className="text-sm font-medium text-white">No Orchestration</h4>
            <p className="text-xs text-slate-500 mt-0.5">Single agent mode</p>
          </button>

          <button
            type="button"
            onClick={() => setPattern('supervisor')}
            className={clsx(
              'p-4 rounded-lg border text-center transition-all',
              pattern === 'supervisor'
                ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            )}
          >
            <div className="w-10 h-10 mx-auto rounded-lg bg-blue-500/20 flex items-center justify-center mb-2">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <h4 className="text-sm font-medium text-white">Supervisor</h4>
            <p className="text-xs text-slate-500 mt-0.5">Central routing agent</p>
          </button>

          <button
            type="button"
            onClick={() => setPattern('swarm')}
            className={clsx(
              'p-4 rounded-lg border text-center transition-all',
              pattern === 'swarm'
                ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            )}
          >
            <div className="w-10 h-10 mx-auto rounded-lg bg-purple-500/20 flex items-center justify-center mb-2">
              <ArrowRightLeft className="w-5 h-5 text-purple-400" />
            </div>
            <h4 className="text-sm font-medium text-white">Swarm</h4>
            <p className="text-xs text-slate-500 mt-0.5">Peer-to-peer handoffs</p>
          </button>
        </div>

        {/* Pattern Configuration */}
        {pattern !== 'none' && (
          <div className="space-y-4 pt-4 border-t border-slate-700">
            {Object.keys(llms).length === 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-400 text-sm">
                Add an LLM in Resources first to configure orchestration.
              </div>
            )}

            <Select
              label="Orchestration Model"
              options={llmOptions}
              value={selectedLLM}
              onChange={(e) => setSelectedLLM(e.target.value)}
              hint={pattern === 'supervisor' 
                ? 'The LLM that will route requests to appropriate agents'
                : 'The LLM used for agent handoff decisions'
              }
            />

            {pattern === 'supervisor' && (
              <Textarea
                label="Supervisor Prompt (Optional)"
                placeholder="Custom instructions for the supervisor agent..."
                value={supervisorPrompt}
                onChange={(e) => setSupervisorPrompt(e.target.value)}
                rows={4}
                hint="Override the default supervisor prompt"
              />
            )}

            {pattern === 'swarm' && (
              <>
                {selectedAgents.length === 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-400 text-sm">
                    Select agents for the application above before configuring swarm orchestration.
                  </div>
                )}

                <Select
                  label="Default Agent"
                  options={agentOptions}
                  value={defaultAgent}
                  onChange={(e) => setDefaultAgent(e.target.value)}
                  hint="The agent that handles initial requests (from selected application agents)"
                  disabled={selectedAgents.length === 0}
                />

                {/* Handoffs Configuration */}
                <div className="space-y-3 pt-3 border-t border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-slate-200">Agent Handoff Rules</h4>
                      <p className="text-xs text-slate-500">
                        Define which agents can hand off to which other agents
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={addHandoff}
                      disabled={unusedAgentsForHandoffs.length === 0 || selectedAgents.length === 0}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Rule
                    </Button>
                  </div>

                  {selectedAgents.length === 0 && (
                    <div className="bg-slate-800/50 rounded-lg p-3 text-slate-400 text-sm">
                      Select agents for the application first to configure handoff rules.
                    </div>
                  )}

                  {handoffs.length === 0 && selectedAgents.length > 0 && (
                    <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                      <div className="flex items-start space-x-2">
                        <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-blue-300">
                          <p className="font-medium">No handoff rules defined</p>
                          <p className="text-blue-400/80 mt-1 text-xs">
                            Without explicit rules, agents will use their <code className="bg-blue-900/50 px-1 rounded">handoff_prompt</code> to determine routing.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {handoffs.map((handoff, index) => (
                    <div
                      key={index}
                      className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/50 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <Select
                            label="From Agent"
                            value={handoff.agentName}
                            onChange={(e) => updateHandoff(index, { agentName: e.target.value })}
                            options={[
                              { value: handoff.agentName, label: agents[handoff.agentName]?.name || handoff.agentName },
                              ...unusedAgentsForHandoffs.map(name => ({
                                value: name,
                                label: agents[name]?.name || name,
                              })),
                            ]}
                          />
                          <Select
                            label="Can Hand Off To"
                            value={handoff.type}
                            onChange={(e) => updateHandoff(index, { 
                              type: e.target.value as HandoffType,
                              targets: e.target.value === 'specific' ? handoff.targets : []
                            })}
                            options={handoffTypeOptions}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeHandoff(index)}
                          className="ml-2 mt-6"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </div>

                      {handoff.type === 'specific' && (
                        <div className="pt-1">
                          <p className="text-xs text-slate-400 mb-2">Select target agents:</p>
                          <div className="flex flex-wrap gap-2">
                            {availableAgentsForSwarm
                              .filter(name => name !== handoff.agentName)
                              .map(name => (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => toggleTarget(index, name)}
                                  className={clsx(
                                    'px-2.5 py-1 rounded-lg text-xs transition-colors',
                                    handoff.targets.includes(name)
                                      ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                                      : 'bg-slate-700 text-slate-400 border border-slate-600 hover:border-slate-500'
                                  )}
                                >
                                  {agents[name]?.name || name}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}

                      {handoff.type === 'any' && (
                        <p className="text-xs text-emerald-400">
                          ✓ This agent can hand off to any other agent
                        </p>
                      )}

                      {handoff.type === 'none' && (
                        <p className="text-xs text-amber-400">
                          ⊘ This agent cannot hand off (terminal agent)
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Pattern Explanation - Compact */}
        <div className="bg-slate-800/30 rounded-lg p-3 text-xs text-slate-400 space-y-1.5">
          <div className="flex items-start space-x-2">
            <Badge variant="info" className="text-[10px] px-1.5 py-0">Supervisor</Badge>
            <span>Central agent analyzes requests and routes to appropriate specialized agents.</span>
          </div>
          <div className="flex items-start space-x-2">
            <Badge variant="info" className="text-[10px] px-1.5 py-0">Swarm</Badge>
            <span>Agents hand off conversations directly to each other based on handoff rules.</span>
          </div>
        </div>
      </Card>

      {/* Model Registration */}
      <Card className="space-y-4">
        <h3 className="font-medium text-white">Model Registration</h3>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Registered Model Name"
            placeholder="e.g., my_agent_model"
            value={formData.modelName}
            onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
            required
          />
          <Select
            label="Model Schema"
            options={schemaOptions}
            value={formData.modelSchema}
            onChange={(e) => setFormData({ ...formData, modelSchema: e.target.value })}
            hint="Unity Catalog schema for model registration"
          />
        </div>
      </Card>

      {/* Deployment Options */}
      <Card className="space-y-4">
        <h3 className="font-medium text-white">Deployment Options</h3>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Workload Size"
            options={WORKLOAD_SIZES}
            value={formData.workloadSize}
            onChange={(e) => setFormData({ ...formData, workloadSize: e.target.value as 'Small' | 'Medium' | 'Large' })}
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-300">Scale to Zero</label>
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, scaleToZero: true })}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  formData.scaleToZero
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                Enabled
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, scaleToZero: false })}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  !formData.scaleToZero
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                Disabled
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Tags */}
      <Card className="space-y-4">
        <div className="flex items-center space-x-2">
          <Tag className="w-5 h-5 text-slate-400" />
          <h3 className="font-medium text-white">Tags</h3>
        </div>
        <p className="text-sm text-slate-400">
          Add metadata tags to your application for organization and filtering
        </p>

        {/* Existing Tags */}
        {Object.keys(tags).length > 0 && (
          <div className="space-y-2">
            {Object.entries(tags).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-blue-400">{key}</span>
                  <span className="text-slate-500">=</span>
                  <span className="text-sm text-slate-300">{String(value)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newTags = { ...tags };
                    delete newTags[key];
                    setTags(newTags);
                  }}
                  className="text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add New Tag */}
        <div className="flex items-end space-x-2">
          <div className="flex-1">
            <Input
              label="Key"
              placeholder="e.g., environment"
              value={newTagKey}
              onChange={(e) => setNewTagKey(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Value"
              placeholder="e.g., production"
              value={newTagValue}
              onChange={(e) => setNewTagValue(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              if (newTagKey && newTagValue) {
                setTags({ ...tags, [newTagKey]: newTagValue });
                setNewTagKey('');
                setNewTagValue('');
              }
            }}
            disabled={!newTagKey || !newTagValue}
          >
            <Plus className="w-4 h-4" />
            Add
          </Button>
        </div>
      </Card>

      {/* Permissions */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-slate-400" />
            <h3 className="font-medium text-white">Permissions</h3>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPermissions([...permissions, { principals: [], entitlements: [] }])}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Permission
          </Button>
        </div>
        <p className="text-sm text-slate-400">
          Configure who can access this application and with what permissions
        </p>

        {permissions.length === 0 ? (
          <div className="bg-slate-800/50 rounded-lg p-3 text-slate-400 text-sm">
            No permissions configured. Add permissions to control access to this application.
          </div>
        ) : (
          <div className="space-y-3">
            {permissions.map((perm, index) => (
              <div key={index} className="p-3 bg-slate-800/30 rounded-lg border border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">Permission Rule {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => setPermissions(permissions.filter((_, i) => i !== index))}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Principals */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-400">Principals (users, groups, service principals)</label>
                  <div className="flex flex-wrap gap-2 min-h-[32px]">
                    {perm.principals.map((principal, pIdx) => (
                      <span
                        key={pIdx}
                        className="inline-flex items-center px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs"
                      >
                        {principal}
                        <button
                          type="button"
                          onClick={() => {
                            const newPerms = [...permissions];
                            newPerms[index].principals = perm.principals.filter((_, i) => i !== pIdx);
                            setPermissions(newPerms);
                          }}
                          className="ml-1.5 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex space-x-2">
                    <Input
                      placeholder="e.g., user@example.com or group_name"
                      value={newPrincipal}
                      onChange={(e) => setNewPrincipal(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (newPrincipal) {
                          const newPerms = [...permissions];
                          newPerms[index].principals = [...perm.principals, newPrincipal];
                          setPermissions(newPerms);
                          setNewPrincipal('');
                        }
                      }}
                      disabled={!newPrincipal}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                {/* Entitlements */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-400">Entitlements</label>
                  <div className="flex flex-wrap gap-2">
                    {ENTITLEMENT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          const newPerms = [...permissions];
                          if (perm.entitlements.includes(opt.value)) {
                            newPerms[index].entitlements = perm.entitlements.filter(e => e !== opt.value);
                          } else {
                            newPerms[index].entitlements = [...perm.entitlements, opt.value];
                          }
                          setPermissions(newPerms);
                        }}
                        className={clsx(
                          'px-2.5 py-1 rounded-lg text-xs transition-colors',
                          perm.entitlements.includes(opt.value)
                            ? 'bg-green-500/30 text-green-300 border border-green-500/50'
                            : 'bg-slate-700 text-slate-400 border border-slate-600 hover:border-slate-500'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Summary */}
      <Card variant="highlight">
        <h3 className="font-medium text-white mb-3">Configuration Summary</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-400">Application:</span>
            <span className="text-white ml-2">{formData.name || 'Not set'}</span>
          </div>
          <div>
            <span className="text-slate-400">Agents:</span>
            <Badge variant={selectedAgents.length > 0 ? 'success' : 'warning'} className="ml-2">
              {selectedAgents.length} selected
            </Badge>
          </div>
          <div>
            <span className="text-slate-400">Orchestration:</span>
            <Badge variant={pattern !== 'none' ? 'info' : 'default'} className="ml-2">
              {pattern === 'supervisor' ? 'Supervisor' : pattern === 'swarm' ? 'Swarm' : 'None'}
            </Badge>
          </div>
          <div>
            <span className="text-slate-400">Endpoint:</span>
            <span className="text-white ml-2">{formData.endpointName || 'Not set'}</span>
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end items-center space-x-3">
        {!hasChanges && (
          <span className="text-sm text-slate-500">No unsaved changes</span>
        )}
        <Button onClick={handleSave} size="lg" disabled={!hasChanges}>
          <Save className="w-4 h-4" />
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
