import { useState, useEffect, useCallback } from 'react';
import { 
  Rocket, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Zap,
  Layers,
  RefreshCw,
  Server,
  Database,
  Search,
  Bot,
  Settings,
  Loader2,
  Key,
  User,
  Shield,
  Building2
} from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

type CredentialType = 'app' | 'obo' | 'manual_sp' | 'manual_pat';

interface CredentialConfig {
  type: CredentialType;
  client_id?: string;
  client_secret?: string;
  pat?: string;
}

interface DeploymentPanelProps {
  onClose?: () => void;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  requirements: {
    type: string;
    description: string;
    count: number;
  }[];
  app_name?: string;
  endpoint_name?: string;
  agent_count?: number;
  deployment_options?: {
    quick: {
      description: string;
      provisions: string[];
      available: boolean;
    };
    full: {
      description: string;
      provisions: string[];
      available: boolean;
      requires_bundle: boolean;
    };
  };
}

interface DeploymentStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

interface DeploymentStatus {
  id: string;
  status: 'starting' | 'creating_agent' | 'deploying' | 'completed' | 'failed';
  type: 'quick' | 'full';
  started_at: string;
  completed_at?: string;
  steps: DeploymentStep[];
  current_step: number;
  error?: string;
  error_trace?: string;
  result?: {
    endpoint_name: string;
    model_name: string;
    message: string;
  };
}

const stepIcons: Record<string, React.ReactNode> = {
  validate: <Settings className="w-4 h-4" />,
  create_agent: <Bot className="w-4 h-4" />,
  deploy_agent: <Server className="w-4 h-4" />,
};

const stepLabels: Record<string, string> = {
  validate: 'Validate Configuration',
  create_agent: 'Create Agent Model',
  deploy_agent: 'Deploy to Endpoint',
};

export default function DeploymentPanel({ onClose }: DeploymentPanelProps) {
  const { config } = useConfigStore();
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [selectedOption, setSelectedOption] = useState<'quick' | 'full'>('quick');
  const [error, setError] = useState<string | null>(null);
  
  // Credential selection state
  const [credentialType, setCredentialType] = useState<CredentialType>('manual_pat');
  const [manualClientId, setManualClientId] = useState('');
  const [manualClientSecret, setManualClientSecret] = useState('');
  const [manualPat, setManualPat] = useState('');
  const [availableCredentials, setAvailableCredentials] = useState<{
    hasAppCredentials: boolean;
    hasOboToken: boolean;
  }>({ hasAppCredentials: false, hasOboToken: false });
  
  // Check available credentials on mount
  useEffect(() => {
    const checkCredentials = async () => {
      try {
        const response = await fetch('/api/auth/context');
        if (response.ok) {
          const data = await response.json();
          setAvailableCredentials({
            hasAppCredentials: data.has_service_principal || false,
            hasOboToken: data.has_obo_token || false,
          });
          // Default to manual_pat - user can switch to other options if available
          setCredentialType('manual_pat');
        }
      } catch (err) {
        console.error('Failed to check credentials:', err);
      }
    };
    checkCredentials();
  }, []);

  // Validate configuration on mount
  const validateConfig = useCallback(async () => {
    setIsValidating(true);
    setError(null);
    
    try {
      const response = await fetch('/api/deploy/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Validation failed');
      }
      
      const result = await response.json();
      setValidation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate configuration');
    } finally {
      setIsValidating(false);
    }
  }, [config]);

  useEffect(() => {
    validateConfig();
  }, [validateConfig]);

  // Poll for deployment status
  useEffect(() => {
    if (!deploymentId) return;
    
    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/deploy/status/${deploymentId}`);
        if (!response.ok) return;
        
        const status = await response.json();
        setDeploymentStatus(status);
        
        // Stop polling if deployment is complete or failed
        if (status.status === 'completed' || status.status === 'failed') {
          setIsDeploying(false);
        }
      } catch (err) {
        console.error('Failed to poll deployment status:', err);
      }
    };
    
    // Poll immediately
    pollStatus();
    
    // Then poll every 2 seconds
    const interval = setInterval(pollStatus, 2000);
    
    return () => clearInterval(interval);
  }, [deploymentId]);

  const handleDeploy = async () => {
    if (!validation?.valid) return;
    
    // Validate manual credentials if selected
    if (credentialType === 'manual_sp' && (!manualClientId || !manualClientSecret)) {
      setError('Please enter both Client ID and Client Secret');
      return;
    }
    if (credentialType === 'manual_pat' && !manualPat) {
      setError('Please enter a Personal Access Token');
      return;
    }
    
    setIsDeploying(true);
    setError(null);
    
    // Show deployment progress screen immediately with "starting" status
    // This provides immediate feedback to the user
    setDeploymentStatus({
      id: 'pending',
      status: 'starting',
      type: selectedOption,
      started_at: new Date().toISOString(),
      steps: [
        { name: 'validate', status: 'running' },
        { name: 'create_agent', status: 'pending' },
        { name: 'deploy_agent', status: 'pending' },
      ],
      current_step: 0,
    });
    
    // Build credential configuration
    const credentials: CredentialConfig = { type: credentialType };
    if (credentialType === 'manual_sp') {
      credentials.client_id = manualClientId;
      credentials.client_secret = manualClientSecret;
    } else if (credentialType === 'manual_pat') {
      credentials.pat = manualPat;
    }
    
    try {
      const endpoint = selectedOption === 'quick' ? '/api/deploy/quick' : '/api/deploy/full';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, credentials }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Deployment failed to start');
      }
      
      const result = await response.json();
      setDeploymentId(result.deployment_id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start deployment';
      setError(errorMsg);
      setIsDeploying(false);
      // Update deployment status to show failure
      setDeploymentStatus(prev => prev ? {
        ...prev,
        status: 'failed',
        error: errorMsg,
        steps: prev.steps.map((step, idx) => 
          idx === 0 ? { ...step, status: 'failed', error: errorMsg } : step
        ),
      } : null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-slate-500" />;
    }
  };

  const getOverallStatusBadge = () => {
    if (!deploymentStatus) return null;
    
    switch (deploymentStatus.status) {
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'failed':
        return <Badge variant="danger">Failed</Badge>;
      case 'creating_agent':
        return <Badge variant="info">Creating Agent...</Badge>;
      case 'deploying':
        return <Badge variant="info">Deploying...</Badge>;
      default:
        return <Badge variant="warning">Starting...</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Validation Status */}
      {isValidating ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin mr-2" />
          <span className="text-slate-300">Validating configuration...</span>
        </div>
      ) : validation ? (
        <>
          {/* Validation Summary */}
          <div className={`p-4 rounded-lg border ${
            validation.valid 
              ? 'bg-green-950/30 border-green-800' 
              : 'bg-red-950/30 border-red-800'
          }`}>
            <div className="flex items-center gap-3">
              {validation.valid ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <XCircle className="w-6 h-6 text-red-400" />
              )}
              <div>
                <h3 className="text-sm font-medium text-slate-100">
                  {validation.valid ? 'Configuration Valid' : 'Configuration Invalid'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {validation.app_name && `App: ${validation.app_name}`}
                  {validation.agent_count !== undefined && ` • ${validation.agent_count} agent(s)`}
                </p>
              </div>
            </div>
            
            {/* Errors */}
            {validation.errors.length > 0 && (
              <div className="mt-3 space-y-1">
                {validation.errors.map((err, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-red-400">
                    <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Warnings */}
            {validation.warnings.length > 0 && (
              <div className="mt-3 space-y-1">
                {validation.warnings.map((warn, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-amber-400">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{warn}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Requirements */}
          {validation.requirements.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Resource Requirements
              </h4>
              <div className="flex flex-wrap gap-2">
                {validation.requirements.map((req, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    {req.type === 'vector_search' && <Search className="w-3 h-3 text-purple-400" />}
                    {req.type === 'database' && <Database className="w-3 h-3 text-blue-400" />}
                    {req.type === 'genie' && <Bot className="w-3 h-3 text-cyan-400" />}
                    {req.type === 'functions' && <Settings className="w-3 h-3 text-green-400" />}
                    <span className="text-xs text-slate-300">{req.description}</span>
                    <Badge variant="default" className="text-[10px]">{req.count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credential Selection */}
          {validation.valid && !deploymentStatus && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Deployment Credentials
              </h4>
              
              <div className="grid grid-cols-2 gap-2">
                {/* Manual PAT - Top Left (Default) */}
                <button
                  onClick={() => setCredentialType('manual_pat')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    credentialType === 'manual_pat'
                      ? 'bg-cyan-950/40 border-cyan-500 ring-1 ring-cyan-500/50'
                      : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-cyan-400" />
                    <span className={`text-sm font-medium ${credentialType === 'manual_pat' ? 'text-slate-100' : 'text-slate-300'}`}>
                      Manual PAT
                    </span>
                    {credentialType === 'manual_pat' && <CheckCircle2 className="w-3 h-3 text-cyan-400 ml-auto" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Enter personal access token</p>
                </button>
                
                {/* Manual Service Principal - Top Right */}
                <button
                  onClick={() => setCredentialType('manual_sp')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    credentialType === 'manual_sp'
                      ? 'bg-amber-950/40 border-amber-500 ring-1 ring-amber-500/50'
                      : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span className={`text-sm font-medium ${credentialType === 'manual_sp' ? 'text-slate-100' : 'text-slate-300'}`}>
                      Manual SP
                    </span>
                    {credentialType === 'manual_sp' && <CheckCircle2 className="w-3 h-3 text-amber-400 ml-auto" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Enter client ID & secret</p>
                </button>
                
                {/* User Token OBO - Bottom Left */}
                <button
                  onClick={() => setCredentialType('obo')}
                  disabled={!availableCredentials.hasOboToken}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    credentialType === 'obo'
                      ? 'bg-purple-950/40 border-purple-500 ring-1 ring-purple-500/50'
                      : availableCredentials.hasOboToken
                      ? 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                      : 'bg-slate-800/20 border-slate-800 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-purple-400" />
                    <span className={`text-sm font-medium ${credentialType === 'obo' ? 'text-slate-100' : 'text-slate-300'}`}>
                      User Token (OBO)
                    </span>
                    {credentialType === 'obo' && <CheckCircle2 className="w-3 h-3 text-purple-400 ml-auto" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Use your logged-in credentials</p>
                </button>
                
                {/* App Service Principal - Bottom Right */}
                <button
                  onClick={() => setCredentialType('app')}
                  disabled={!availableCredentials.hasAppCredentials}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    credentialType === 'app'
                      ? 'bg-green-950/40 border-green-500 ring-1 ring-green-500/50'
                      : availableCredentials.hasAppCredentials
                      ? 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                      : 'bg-slate-800/20 border-slate-800 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-green-400" />
                    <span className={`text-sm font-medium ${credentialType === 'app' ? 'text-slate-100' : 'text-slate-300'}`}>
                      App Service Principal
                    </span>
                    {credentialType === 'app' && <CheckCircle2 className="w-3 h-3 text-green-400 ml-auto" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Use application credentials</p>
                </button>
              </div>
              
              {/* Manual credential inputs */}
              {credentialType === 'manual_sp' && (
                <div className="space-y-2 p-3 bg-slate-800/30 rounded-lg border border-slate-700">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Client ID</label>
                    <input
                      type="text"
                      value={manualClientId}
                      onChange={(e) => setManualClientId(e.target.value)}
                      placeholder="Enter service principal client ID"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Client Secret</label>
                    <input
                      type="password"
                      value={manualClientSecret}
                      onChange={(e) => setManualClientSecret(e.target.value)}
                      placeholder="Enter service principal client secret"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}
              
              {credentialType === 'manual_pat' && (
                <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700">
                  <label className="block text-xs text-slate-400 mb-1">Personal Access Token</label>
                  <input
                    type="password"
                    value={manualPat}
                    onChange={(e) => setManualPat(e.target.value)}
                    placeholder="Enter Databricks personal access token"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* Deployment Options */}
          {validation.valid && validation.deployment_options && !deploymentStatus && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Deployment Options
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Quick Deploy */}
                <button
                  onClick={() => setSelectedOption('quick')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    selectedOption === 'quick'
                      ? 'bg-blue-950/40 border-blue-500 ring-1 ring-blue-500/50'
                      : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                  }`}
                  disabled={!validation.deployment_options.quick.available}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-lg bg-blue-500/20">
                      <Zap className="w-4 h-4 text-blue-400" />
                    </div>
                    <span className="font-medium text-slate-100">Quick Deploy</span>
                    {selectedOption === 'quick' && (
                      <CheckCircle2 className="w-4 h-4 text-blue-400 ml-auto" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    {validation.deployment_options.quick.description}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {validation.deployment_options.quick.provisions.map((item, idx) => (
                      <span 
                        key={idx}
                        className="px-2 py-0.5 text-[10px] bg-slate-700/50 rounded text-slate-300"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </button>

                {/* Full Deploy */}
                <button
                  onClick={() => setSelectedOption('full')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    selectedOption === 'full'
                      ? 'bg-purple-950/40 border-purple-500 ring-1 ring-purple-500/50'
                      : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                  } ${!validation.deployment_options.full.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={!validation.deployment_options.full.available}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-lg bg-purple-500/20">
                      <Layers className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="font-medium text-slate-100">Full Pipeline</span>
                    {selectedOption === 'full' && (
                      <CheckCircle2 className="w-4 h-4 text-purple-400 ml-auto" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    {validation.deployment_options.full.description}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {validation.deployment_options.full.provisions.slice(0, 4).map((item, idx) => (
                      <span 
                        key={idx}
                        className="px-2 py-0.5 text-[10px] bg-slate-700/50 rounded text-slate-300"
                      >
                        {item}
                      </span>
                    ))}
                    {validation.deployment_options.full.provisions.length > 4 && (
                      <span className="px-2 py-0.5 text-[10px] bg-slate-700/50 rounded text-slate-400">
                        +{validation.deployment_options.full.provisions.length - 4} more
                      </span>
                    )}
                  </div>
                  {validation.deployment_options.full.requires_bundle && (
                    <p className="text-[10px] text-amber-400 mt-2">
                      ⚠️ Requires Databricks Asset Bundle CLI
                    </p>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Deployment Progress */}
          {deploymentStatus && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Deployment Progress
                </h4>
                {getOverallStatusBadge()}
              </div>
              
              {/* Steps */}
              <div className="space-y-2">
                {deploymentStatus.steps.map((step) => (
                  <div 
                    key={step.name}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      step.status === 'running' 
                        ? 'bg-blue-950/30 border-blue-800' 
                        : step.status === 'completed'
                        ? 'bg-green-950/20 border-green-900'
                        : step.status === 'failed'
                        ? 'bg-red-950/20 border-red-900'
                        : 'bg-slate-800/30 border-slate-700'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${
                      step.status === 'running' ? 'bg-blue-500/20' :
                      step.status === 'completed' ? 'bg-green-500/20' :
                      step.status === 'failed' ? 'bg-red-500/20' :
                      'bg-slate-700'
                    }`}>
                      {stepIcons[step.name] || <Settings className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-200">
                        {stepLabels[step.name] || step.name}
                      </p>
                      {step.error && (
                        <p className="text-xs text-red-400 mt-1">{step.error}</p>
                      )}
                    </div>
                    {getStatusIcon(step.status)}
                  </div>
                ))}
              </div>

              {/* Success Result */}
              {deploymentStatus.status === 'completed' && deploymentStatus.result && (
                <div className="p-4 bg-green-950/30 border border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                    <span className="font-medium text-green-300">Deployment Successful!</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Endpoint:</span>
                      <code className="px-2 py-0.5 bg-slate-800 rounded text-green-300">
                        {deploymentStatus.result.endpoint_name}
                      </code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Model:</span>
                      <code className="px-2 py-0.5 bg-slate-800 rounded text-slate-300 text-xs">
                        {deploymentStatus.result.model_name}
                      </code>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {deploymentStatus.status === 'failed' && deploymentStatus.error && (
                <div className="p-4 bg-red-950/30 border border-red-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-5 h-5 text-red-400" />
                    <span className="font-medium text-red-300">Deployment Failed</span>
                  </div>
                  <p className="text-sm text-red-400">{deploymentStatus.error}</p>
                  {deploymentStatus.error_trace && (
                    <details className="mt-2">
                      <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
                        Show details
                      </summary>
                      <pre className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-400 overflow-x-auto max-h-40">
                        {deploymentStatus.error_trace}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-950/30 border border-red-800 rounded-lg">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" />
                <span className="text-red-300">{error}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-700">
            <Button variant="ghost" onClick={validateConfig} disabled={isValidating}>
              <RefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} />
              Revalidate
            </Button>
            
            <div className="flex items-center gap-3">
              {onClose && (
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
              )}
              
              <Button
                variant="primary"
                onClick={handleDeploy}
                disabled={!validation.valid || isDeploying || deploymentStatus?.status === 'completed'}
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deploying...
                  </>
                ) : deploymentStatus?.status === 'completed' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Deployed
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4" />
                    Deploy {selectedOption === 'quick' ? 'Quick' : 'Full Pipeline'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      ) : error ? (
        <div className="p-4 bg-red-950/30 border border-red-800 rounded-lg">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-300">{error}</span>
          </div>
          <Button variant="ghost" onClick={validateConfig} className="mt-3">
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}

