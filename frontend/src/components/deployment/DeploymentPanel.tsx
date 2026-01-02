import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Rocket, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Zap,
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
import { useDeploymentStore, DeploymentStatus } from '@/stores/deploymentStore';
import { useCredentialStore, CredentialConfig } from '@/stores/credentialStore';
import { generateYAML } from '@/utils/yaml-generator';
import yaml from 'js-yaml';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

/**
 * Remove internal-only fields (like refName) from a config object.
 * This ensures we don't send UI-specific fields to the backend for validation.
 */
function sanitizeConfig(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeConfig);
  
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip internal-only fields
    if (key === 'refName') continue;
    result[key] = sanitizeConfig(value);
  }
  return result;
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
  const {
    deploymentId,
    deploymentStatus,
    isDeploying,
    isCancelling,
    startDeployment,
    setDeploymentId,
    setDeploymentStatus,
    failDeployment,
    setCancelling,
    reset: resetDeployment,
    canStartNewDeployment,
  } = useDeploymentStore();
  
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track the deployment ID being cancelled to prevent stale polling
  const cancellingDeploymentIdRef = useRef<string | null>(null);
  
  // Track if component is mounted for async operations
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  
  // Log initial state on mount for debugging
  useEffect(() => {
    console.log('[DeploymentPanel] Component mounted with state:', {
      isDeploying,
      isCancelling,
      deploymentId,
      deploymentStatus: deploymentStatus?.status,
    });
    
    // If we have a stuck cancelling state on mount, the regular polling will handle it.
    // Just set the ref so we track it properly.
    if (isCancelling && deploymentId) {
      cancellingDeploymentIdRef.current = deploymentId;
    }
  }, []); // Only run on mount
  
  // Use shared credential store (persisted and shared with ChatPanel)
  const {
    credentialType,
    manualClientId,
    manualClientSecret,
    manualPat,
    setCredentialType,
    setManualClientId,
    setManualClientSecret,
    setManualPat,
  } = useCredentialStore();
  
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
      // Generate YAML first to strip out internal-only fields like refName
      const yamlContent = generateYAML(config);
      // Parse the YAML to get a clean config object for validation
      const cleanConfig = yaml.load(yamlContent) as Record<string, any>;
      
      const sanitizedConfig = sanitizeConfig(cleanConfig);
      
      const response = await fetch('/api/deploy/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: sanitizedConfig }),
      });
      
      // Check content type to handle HTML error pages
      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');
      
      if (!response.ok) {
        if (isJson) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Validation failed');
        } else {
          // Server returned HTML (likely an error page)
          console.error('Server returned non-JSON response:', response.status, response.statusText);
          throw new Error(`Server error: ${response.status} ${response.statusText}. The server may be experiencing issues.`);
        }
      }
      
      if (!isJson) {
        throw new Error('Server returned unexpected response format');
      }
      
      const result = await response.json();
      setValidation(result);
    } catch (err) {
      console.error('Validation error:', err);
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
    if (!deploymentId) {
      console.log('[DeploymentPanel] Polling not started - no deploymentId');
      return;
    }
    
    console.log('[DeploymentPanel] Starting polling for deployment:', deploymentId);
    
    const pollStatus = async () => {
      console.log('[DeploymentPanel] Polling status for:', deploymentId);
      try {
        const response = await fetch(`/api/deploy/status/${deploymentId}`);
        if (!response.ok) {
          console.log('[DeploymentPanel] Poll failed - not OK:', response.status);
          return;
        }
        
        const status: DeploymentStatus = await response.json();
        console.log('[DeploymentPanel] Got status from backend:', status.status, 'id:', status.id);
        setDeploymentStatus(status);
      } catch (err) {
        console.error('Failed to poll deployment status:', err);
      }
    };
    
    // Poll immediately
    pollStatus();
    
    // Then poll every 2 seconds while deployment is active
    const interval = setInterval(pollStatus, 2000);
    
    return () => {
      console.log('[DeploymentPanel] Cleaning up polling for:', deploymentId);
      clearInterval(interval);
    };
  }, [deploymentId, setDeploymentStatus]);

  const handleCancel = async () => {
    console.log('[DeploymentPanel] handleCancel called:', {
      deploymentId,
      isCancelling,
    });
    
    if (!deploymentId || isCancelling) {
      console.log('[DeploymentPanel] handleCancel early return - no deploymentId or already cancelling');
      return;
    }
    
    // Track which deployment we're cancelling
    cancellingDeploymentIdRef.current = deploymentId;
    
    // Set cancelling state immediately for UI feedback
    console.log('[DeploymentPanel] Setting cancelling state...');
    setCancelling();
    
    try {
      // Send cancel request to backend
      console.log('[DeploymentPanel] Sending cancel request to backend...');
      const response = await fetch(`/api/deploy/cancel/${deploymentId}`, {
        method: 'POST',
      });
      console.log('[DeploymentPanel] Cancel request response:', response.status);
      
      const data = await response.json().catch(() => ({}));
      
      if (response.ok) {
        // Cancel succeeded - use the status from the response directly
        console.log('[DeploymentPanel] Cancel succeeded, status:', data.status?.status);
        if (data.status) {
          setDeploymentStatus(data.status as DeploymentStatus);
        } else {
          // Fallback: fetch the status if not included in response
          const statusResponse = await fetch(`/api/deploy/status/${deploymentId}`);
          if (statusResponse.ok) {
            const status: DeploymentStatus = await statusResponse.json();
            console.log('[DeploymentPanel] Got updated status after cancel:', status.status);
            setDeploymentStatus(status);
          }
        }
      } else {
        // Cancel failed - check why
        console.error('[DeploymentPanel] Cancel failed:', response.status, data);
        
        // If already cancelled/completed/failed, fetch current status to update UI
        const statusResponse = await fetch(`/api/deploy/status/${deploymentId}`);
        if (statusResponse.ok) {
          const status: DeploymentStatus = await statusResponse.json();
          console.log('[DeploymentPanel] Got status after cancel failure:', status.status);
          setDeploymentStatus(status);
        }
      }
    } catch (err) {
      console.error('Failed to send cancel request:', err);
      // On network error, still try to fetch status to sync UI
      try {
        const statusResponse = await fetch(`/api/deploy/status/${deploymentId}`);
        if (statusResponse.ok) {
          const status: DeploymentStatus = await statusResponse.json();
          setDeploymentStatus(status);
        }
      } catch {
        // Ignore - polling will eventually sync
      }
    }
  };

  const handleDeploy = async () => {
    console.log('[DeploymentPanel] handleDeploy called');
    
    if (!validation?.valid) {
      console.log('[DeploymentPanel] handleDeploy - validation not valid');
      return;
    }
    
    // Check if we can start a new deployment
    if (!canStartNewDeployment()) {
      console.log('[DeploymentPanel] handleDeploy - cannot start new deployment');
      setError('A deployment is already in progress. Please wait for it to complete.');
      return;
    }
    
    // Validate manual credentials if selected
    if (credentialType === 'manual_sp' && (!manualClientId || !manualClientSecret)) {
      setError('Please enter both Client ID and Client Secret');
      return;
    }
    if (credentialType === 'manual_pat' && !manualPat) {
      setError('Please enter a Personal Access Token');
      return;
    }
    
    setError(null);
    
    // Start deployment in the store (this persists across modal closes)
    startDeployment('quick');
    
    // Build credential configuration
    const credentials: CredentialConfig = { type: credentialType };
    if (credentialType === 'manual_sp') {
      credentials.client_id = manualClientId;
      credentials.client_secret = manualClientSecret;
    } else if (credentialType === 'manual_pat') {
      credentials.pat = manualPat;
    }
    
    try {
      const endpoint = '/api/deploy/quick';
      
      // Generate YAML and parse it back to get a clean config without internal fields
      const yamlContent = generateYAML(config);
      const cleanConfig = yaml.load(yamlContent) as Record<string, any>;
      const sanitizedConfig = sanitizeConfig(cleanConfig);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: sanitizedConfig, credentials }),
      });
      
      // Check content type to handle HTML error pages
      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');
      
      if (!response.ok) {
        if (isJson) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Deployment failed to start');
        } else {
          // Server returned HTML (likely an error page)
          console.error('Server returned non-JSON response:', response.status, response.statusText);
          throw new Error(`Server error: ${response.status} ${response.statusText}. Check server logs for details.`);
        }
      }
      
      if (!isJson) {
        throw new Error('Server returned unexpected response format');
      }
      
      const result = await response.json();
      setDeploymentId(result.deployment_id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start deployment';
      setError(errorMsg);
      failDeployment(errorMsg);
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
      case 'cancelled':
        return <Badge variant="warning">Cancelled</Badge>;
      case 'cancelling':
        return <Badge variant="warning">Cancelling...</Badge>;
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
              
              <div className="p-4 rounded-xl border bg-blue-950/40 border-blue-500 ring-1 ring-blue-500/50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/20">
                    <Zap className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="font-medium text-slate-100">Quick Deploy</span>
                  <CheckCircle2 className="w-4 h-4 text-blue-400 ml-auto" />
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
              </div>
            </div>
          )}

          {/* Deployment Progress */}
          {deploymentStatus && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Deployment Progress
                  </h4>
                  {isDeploying && !isCancelling && deploymentStatus.status !== 'cancelled' && (
                    <span className="text-[10px] text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded">
                      Running in background
                    </span>
                  )}
                </div>
                {getOverallStatusBadge()}
              </div>
              
              {/* Steps */}
              <div className="space-y-2">
                {deploymentStatus.steps.map((step) => {
                  // Compute effective status - if deployment is cancelled/cancelling, 
                  // show running steps as cancelled
                  const isCancelledOrCancelling = deploymentStatus.status === 'cancelled' || deploymentStatus.status === 'cancelling';
                  const effectiveStatus = (step.status === 'running' && isCancelledOrCancelling) 
                    ? 'failed' 
                    : step.status;
                  const effectiveError = (step.status === 'running' && isCancelledOrCancelling)
                    ? 'Cancelled by user'
                    : step.error;
                  
                  return (
                    <div 
                      key={step.name}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        effectiveStatus === 'running' 
                          ? 'bg-blue-950/30 border-blue-800' 
                          : effectiveStatus === 'completed'
                          ? 'bg-green-950/20 border-green-900'
                          : effectiveStatus === 'failed'
                          ? 'bg-red-950/20 border-red-900'
                          : 'bg-slate-800/30 border-slate-700'
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg ${
                        effectiveStatus === 'running' ? 'bg-blue-500/20' :
                        effectiveStatus === 'completed' ? 'bg-green-500/20' :
                        effectiveStatus === 'failed' ? 'bg-red-500/20' :
                        'bg-slate-700'
                      }`}>
                        {stepIcons[step.name] || <Settings className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-slate-200">
                          {stepLabels[step.name] || step.name}
                        </p>
                        {effectiveError && (
                          <p className="text-xs text-red-400 mt-1">{effectiveError}</p>
                        )}
                      </div>
                      {getStatusIcon(effectiveStatus)}
                    </div>
                  );
                })}
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

              {/* Cancelled */}
              {deploymentStatus.status === 'cancelled' && (
                <div className="p-4 bg-amber-950/30 border border-amber-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    <span className="font-medium text-amber-300">Deployment Cancelled</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-2">The deployment was cancelled by the user.</p>
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
            <div className="flex items-center gap-3">
              {/* Only show Revalidate when not deploying */}
              {!isDeploying && !isCancelling && (
                <Button variant="secondary" onClick={validateConfig} disabled={isValidating} className="min-w-[120px]">
                  <RefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} />
                  Revalidate
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {/* Show Cancel button when deployment is in progress */}
              {(isDeploying || isCancelling) && (
                <Button 
                  variant="secondary" 
                  onClick={handleCancel} 
                  disabled={isCancelling}
                  className="min-w-[120px]"
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      Cancel
                    </>
                  )}
                </Button>
              )}
              
              {onClose && (
                <Button variant="secondary" onClick={onClose} className="min-w-[120px]">
                  Close
                </Button>
              )}
              
              <Button
                variant="primary"
                onClick={async () => {
                  console.log('[DeploymentPanel] Primary button clicked:', {
                    status: deploymentStatus?.status,
                    isDeploying,
                    isCancelling,
                    deploymentId,
                  });
                  if (deploymentStatus?.status === 'completed') {
                    console.log('[DeploymentPanel] Closing dialog (completed)');
                    onClose?.();
                  } else if (deploymentStatus?.status === 'failed' || deploymentStatus?.status === 'cancelled') {
                    console.log('[DeploymentPanel] Resetting deployment state');
                    // Clear any pending cancellation polling
                    cancellingDeploymentIdRef.current = null;
                    // Reset state so user can deploy again
                    resetDeployment();
                  } else {
                    console.log('[DeploymentPanel] Starting new deployment');
                    handleDeploy();
                  }
                }}
                disabled={!validation.valid || isDeploying || isCancelling}
                className="min-w-[120px]"
              >
                {isDeploying && !isCancelling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deploying...
                  </>
                ) : deploymentStatus?.status === 'completed' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Done
                  </>
                ) : deploymentStatus?.status === 'failed' || deploymentStatus?.status === 'cancelled' ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4" />
                    Deploy
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

