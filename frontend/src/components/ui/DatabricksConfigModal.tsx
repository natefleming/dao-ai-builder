/**
 * Modal for configuring Databricks connection settings.
 * 
 * Authentication methods:
 * - OAuth2 Authorization Code flow (recommended)
 * - X-Forwarded-Access-Token header (on-behalf-of-user auth in Databricks Apps)
 * - Environment variables (DATABRICKS_HOST, DATABRICKS_TOKEN)
 * - Manual PAT entry
 * 
 * Reference: https://apps-cookbook.dev/docs/streamlit/authentication/users_get_current
 */
import { useState, useEffect } from 'react';
import { Zap, Server, AlertCircle, Shield, LogIn, ExternalLink } from 'lucide-react';
import Modal from './Modal';
import Input from './Input';
import Button from './Button';
import {
  getDatabricksConfig,
  setDatabricksConfig,
  clearDatabricksConfig,
  initiateOAuthLogin,
  oauthLogout,
} from '../../services/databricksNativeApi';

interface DatabricksConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigured: () => void;
  autoDetectedHost?: string | null;
  inDatabricksApp?: boolean;
  hasOboToken?: boolean;
  oauthInfo?: { configured: boolean; authenticated: boolean; scopes: string[] };
}

export default function DatabricksConfigModal({
  isOpen,
  onClose,
  onConfigured,
  autoDetectedHost,
  inDatabricksApp = false,
  hasOboToken = false,
  oauthInfo,
}: DatabricksConfigModalProps) {
  const [host, setHost] = useState('');
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ 
    success: boolean; 
    message: string;
    requiredScopes?: string[];
    tokenSource?: string;
  } | null>(null);
  
  const currentConfig = getDatabricksConfig();

  // Load existing config on open
  useEffect(() => {
    if (isOpen) {
      const config = getDatabricksConfig();
      if (config) {
        setHost(config.host);
        setToken(config.token);
      } else if (autoDetectedHost) {
        setHost(autoDetectedHost);
      }
      setTestResult(null);
    }
  }, [isOpen, autoDetectedHost]);

  const handleTest = async () => {
    // If we have a manual token, use the verify endpoint with the manual token
    if (token) {
      setTesting(true);
      setTestResult(null);

      try {
        console.log('[DatabricksConfigModal] Testing manual token...');
        
        // Use /api/auth/verify with Authorization header
        const response = await fetch('/api/auth/verify', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Databricks-Host': (host || autoDetectedHost || '').replace(/\/$/, ''),
          },
          credentials: 'include',
        });

        const data = await response.json();
        console.log('[DatabricksConfigModal] Verify response:', data);

        if (data.authenticated && data.user) {
          const sourceLabel = data.token_source === 'manual' ? 'Personal Access Token' :
                              data.token_source === 'obo' ? 'On-Behalf-Of User' :
                              data.token_source === 'oauth' ? 'OAuth' :
                              data.token_source === 'sdk' ? 'SDK Config' :
                              data.token_source === 'env' ? 'Environment Variable' : data.token_source;
          
          // Save the config now that we know it works
          setDatabricksConfig({ 
            host: data.host || host || autoDetectedHost || '', 
            token, 
            source: 'manual' 
          });
          
          setTestResult({
            success: true,
            message: `Connected as ${data.user.displayName || data.user.userName}`,
            tokenSource: sourceLabel,
          });
        } else {
          const errorMsg = data.error || data.message || data.help ||
            `Connection failed (${response.status}): ${response.statusText || 'Unknown error'}`;
          setTestResult({
            success: false,
            message: errorMsg,
            requiredScopes: data.required_scopes,
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error 
          ? `${err.name}: ${err.message}` 
          : 'Connection failed - unknown error';
        setTestResult({
          success: false,
          message: errorMessage,
        });
      } finally {
        setTesting(false);
      }
    } else {
      // Test using auto-detected auth (OBO or SDK)
      setTesting(true);
      setTestResult(null);

      try {
        const response = await fetch('/api/auth/verify', {
          credentials: 'include',
        });

        const data = await response.json();

        if (data.authenticated && data.user) {
          // Auto-auth works, set the config marker
          setDatabricksConfig({
            host: data.host || autoDetectedHost || '',
            token: `__${(data.token_source || 'AUTO').toUpperCase()}_TOKEN__`,
            isAutoDetected: true,
            source: data.token_source,
          });
          setTestResult({
            success: true,
            message: `Connected as ${data.user.displayName || data.user.userName}`,
          });
        } else {
          setTestResult({
            success: false,
            message: data.error || data.help || 'Authentication failed',
            requiredScopes: data.required_scopes,
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error 
          ? `${err.name}: ${err.message}` 
          : 'Connection failed - unknown error';
        setTestResult({
          success: false,
          message: errorMessage,
        });
      } finally {
        setTesting(false);
      }
    }
  };

  const handleSave = () => {
    // If manual token is provided, save it
    if (token) {
      setDatabricksConfig({ 
        host: host || autoDetectedHost || '', 
        token, 
        source: 'manual' 
      });
    } else if (testResult?.success) {
      // For auto-detected auth (OBO, SDK, etc.), the config was already set during test
      // Just ensure it's saved properly
      const currentCfg = getDatabricksConfig();
      if (currentCfg) {
        setDatabricksConfig(currentCfg);
      }
    } else {
      // No valid config to save
      return;
    }
    onConfigured();
    onClose();
  };

  const handleDisconnect = async () => {
    // If OAuth authenticated, also logout from OAuth
    if (currentConfig?.source === 'oauth') {
      await oauthLogout();
    }
    clearDatabricksConfig();
    setHost(autoDetectedHost || '');
    setToken('');
    setTestResult(null);
    onConfigured();
    onClose();
  };

  const handleOAuthLogin = async () => {
    setOauthLoading(true);
    setTestResult(null);
    
    try {
      const targetHost = host || autoDetectedHost;
      const response = await initiateOAuthLogin(targetHost || undefined);
      
      if (response.auth_url && response.redirect) {
        // Redirect to Databricks OAuth authorization
        window.location.href = response.auth_url;
      } else if (response.error) {
        setTestResult({
          success: false,
          message: response.message || response.error,
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'OAuth login failed',
      });
    } finally {
      setOauthLoading(false);
    }
  };

  const getSourceLabel = (source?: string) => {
    switch (source) {
      case 'oauth': return 'OAuth';
      case 'obo': return 'On-Behalf-Of User';
      case 'header': return 'On-Behalf-Of User Auth';
      case 'sdk': return 'Databricks SDK Config';
      case 'env': return 'Environment Variables';
      case 'manual': return 'Manual Configuration';
      default: return 'Unknown';
    }
  };

  const getSourceIcon = (source?: string) => {
    switch (source) {
      case 'oauth':
        return LogIn;
      case 'obo':
      case 'header':
        return Shield;
      case 'sdk':
      case 'env':
        return Server;
      default:
        return Zap;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Databricks Connection"
      description="Configure your Databricks workspace connection."
    >
      <div className="space-y-4">
        {/* OBO Auth Status when in Databricks App */}
        {inDatabricksApp && hasOboToken && currentConfig?.source === 'obo' && (
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-start space-x-2">
              <Shield className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-blue-300 font-medium">
                  On-Behalf-Of User Authentication Active
                </p>
                <p className="text-blue-400/80 mt-1">
                  API calls are authenticated using your Databricks session. 
                  No manual token required.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* In Databricks App but no OBO token */}
        {inDatabricksApp && !hasOboToken && !currentConfig && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-amber-300 font-medium">
                  On-Behalf-Of User Auth Not Enabled
                </p>
                <p className="text-amber-400/80 mt-1">
                  This app is running in Databricks but OBO auth is not enabled. 
                  You can still configure a Personal Access Token manually.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Current connection info for non-OBO */}
        {currentConfig?.isAutoDetected && currentConfig.source !== 'obo' && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-start space-x-2">
              {(() => {
                const Icon = getSourceIcon(currentConfig.source);
                return <Icon className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />;
              })()}
              <div className="text-sm">
                <p className="text-green-300 font-medium">
                  Connected via {getSourceLabel(currentConfig.source)}
                </p>
                <p className="text-green-400/80 mt-1">
                  {currentConfig.source === 'oauth'
                    ? 'Authenticated via OAuth. Your session is secure.'
                    : currentConfig.source === 'sdk'
                    ? 'Using Databricks SDK Config (~/.databrickscfg or environment variables).'
                    : currentConfig.source === 'env'
                    ? 'Using DATABRICKS_HOST and DATABRICKS_TOKEN environment variables.'
                    : 'Using X-Forwarded-Access-Token from Databricks App proxy.'}
                </p>
                {currentConfig.host && (
                  <p className="text-green-400/60 mt-1 font-mono text-xs">
                    Host: {currentConfig.host}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* OAuth Login Option */}
        {oauthInfo?.configured && !currentConfig && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-start space-x-3">
                <LogIn className="w-6 h-6 text-blue-400 mt-0.5" />
                <div>
                  <p className="text-blue-300 font-medium">
                    Login with Databricks
                  </p>
                  <p className="text-blue-400/80 text-sm mt-1">
                    Securely authenticate with OAuth to access Databricks APIs.
                  </p>
                  {oauthInfo.scopes && oauthInfo.scopes.length > 0 && (
                    <p className="text-blue-400/60 text-xs mt-2">
                      Scopes: {oauthInfo.scopes.slice(0, 3).join(', ')}
                      {oauthInfo.scopes.length > 3 && ` +${oauthInfo.scopes.length - 3} more`}
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                onClick={handleOAuthLogin}
                disabled={oauthLoading || !host}
                className="flex items-center space-x-2"
              >
                {oauthLoading ? (
                  'Redirecting...'
                ) : (
                  <>
                    <span>Login</span>
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Auto-detected host info */}
        {autoDetectedHost && !currentConfig && (
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-start space-x-2">
              <Zap className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-blue-300 font-medium">Workspace Detected</p>
                <p className="text-blue-400/80 mt-1">
                  Host auto-detected. Enter your Personal Access Token or set <code className="text-xs bg-blue-900/50 px-1 rounded">DATABRICKS_TOKEN</code> env var.
                </p>
              </div>
            </div>
          </div>
        )}

        <Input
          label="Workspace URL"
          placeholder="https://your-workspace.cloud.databricks.com"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          hint={autoDetectedHost ? "Auto-detected from URL (editable)" : "Your Databricks workspace URL"}
          required
        />
        <Input
          label="Personal Access Token"
          type="password"
          placeholder="dapi..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          hint="Or set DATABRICKS_TOKEN environment variable"
          required
        />

        {/* Help text */}
        {!currentConfig?.isAutoDetected && (
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-slate-400">
                <p className="font-medium text-slate-300">Authentication Options</p>
                <ul className="mt-2 space-y-1 list-disc list-inside text-xs">
                  <li><strong>On-behalf-of-user auth</strong> - Automatic in Databricks Apps</li>
                  <li><strong>Personal Access Token</strong> - Enter manually below</li>
                  <li><strong>Environment variable</strong> - Set <code className="bg-slate-700 px-1 rounded">DATABRICKS_TOKEN</code></li>
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  <strong>Scope errors?</strong> If using OBO auth, try signing out of Databricks 
                  and signing back in to re-authorize the app with updated scopes.
                </p>
              </div>
            </div>
          </div>
        )}

        {testResult && (
          <div
            className={`p-3 rounded-lg text-sm ${
              testResult.success
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>{testResult.message}</span>
              {testResult.success && testResult.tokenSource && (
                <span className="text-xs bg-green-900/30 px-2 py-0.5 rounded">
                  via {testResult.tokenSource}
                </span>
              )}
            </div>
            {testResult.requiredScopes && testResult.requiredScopes.length > 0 && (
              <div className="mt-2 pt-2 border-t border-red-500/20">
                <p className="font-medium mb-1">Required scopes:</p>
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  {testResult.requiredScopes.map((scope: string) => (
                    <li key={scope}><code className="bg-red-900/30 px-1 rounded">{scope}</code></li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-red-300/80">
                  Add these to <code className="bg-red-900/30 px-1 rounded">user_api_scopes</code> in databricks.yml and redeploy.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-4">
          <Button
            variant="danger"
            type="button"
            onClick={handleDisconnect}
            disabled={!getDatabricksConfig()}
          >
            Disconnect
          </Button>
          <div className="flex space-x-3">
            <Button 
              variant="secondary" 
              type="button" 
              onClick={handleTest} 
              disabled={testing || (!token && !hasOboToken && !inDatabricksApp)}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!testResult?.success}
            >
              Save
            </Button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-700">
          <p className="text-xs text-slate-500">
            Credentials are stored in browser localStorage and sent only to your Databricks workspace.
          </p>
        </div>
      </div>
    </Modal>
  );
}
