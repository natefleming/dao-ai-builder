/**
 * Databricks connection status indicator component.
 * Shows auto-detected status when running inside a Databricks App.
 * 
 * Reference: https://apps-cookbook.dev/docs/streamlit/authentication/users_get_current
 */
import { useState, useCallback, useEffect } from 'react';
import { Settings, Zap, Shield, LogIn } from 'lucide-react';
import { useConnectionStatus, useAutoDetectConfig } from '../../hooks/useDatabricks';
import DatabricksConfigModal from './DatabricksConfigModal';

export function ConnectionStatus() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { detecting, detected, autoDetectedHost, inDatabricksApp, hasToken, oauthInfo, redetect } = useAutoDetectConfig();
  const { data: status, loading, error, refetch, configured } = useConnectionStatus();

  const handleConfigured = useCallback(() => {
    console.log('[ConnectionStatus] Config changed, re-detecting and refetching...');
    redetect(); // Re-run auto-detection
    refetch();  // Re-fetch connection status
  }, [refetch, redetect]);

  // Refetch after auto-detection completes
  useEffect(() => {
    if (!detecting && detected) {
      refetch();
    }
  }, [detecting, detected, refetch]);

  // Show detecting state
  if (detecting) {
    return (
      <div className="flex items-center space-x-2 text-slate-400">
        <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
        <span className="text-sm">Detecting...</span>
      </div>
    );
  }

  if (!configured) {
    return (
      <>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-slate-500" />
          <span className="text-sm">
            {autoDetectedHost ? 'Token required' : 'Not connected'}
          </span>
          <Settings className="w-4 h-4" />
        </button>
        <DatabricksConfigModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfigured={handleConfigured}
          autoDetectedHost={autoDetectedHost}
          oauthInfo={oauthInfo}
        />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-2 text-slate-400"
        >
          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span className="text-sm">Connecting...</span>
          <Settings className="w-4 h-4" />
        </button>
        <DatabricksConfigModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfigured={handleConfigured}
          autoDetectedHost={autoDetectedHost}
          oauthInfo={oauthInfo}
        />
      </>
    );
  }

  if (error || !status?.connected) {
    console.log('[ConnectionStatus] Showing failed state - error:', error, 'status:', status);
    return (
      <>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-2 text-red-400 hover:text-red-300 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-sm">Connection failed{status?.error ? `: ${status.error}` : ''}</span>
          <Settings className="w-4 h-4" />
        </button>
        <DatabricksConfigModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfigured={handleConfigured}
          autoDetectedHost={autoDetectedHost}
          oauthInfo={oauthInfo}
        />
      </>
    );
  }

  // Determine auth type for display
  const authType = status.source === 'oauth' ? 'OAuth' :
                   status.source === 'obo' ? 'On-Behalf-Of User' : 
                   status.source === 'sdk' ? 'SDK Config' :
                   status.source === 'env' ? 'Environment' : 
                   'Manual';
  const authIcon = status.source === 'oauth' ? LogIn :
                   status.source === 'obo' ? Shield : Zap;
  const AuthIcon = authIcon;

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center space-x-2 hover:bg-slate-800 px-2 py-1 rounded transition-colors"
        title={`Connected via ${authType} authentication`}
      >
        <div className="w-2 h-2 rounded-full bg-green-500" />
        {status.isAutoDetected && (
          <AuthIcon className={`w-3 h-3 ${status.source === 'obo' ? 'text-blue-400' : 'text-yellow-400'}`} />
        )}
        <span className="text-sm text-slate-300">
          <span className="text-white font-medium">{status.display_name || status.user}</span>
        </span>
        <Settings className="w-4 h-4 text-slate-500" />
      </button>
      <DatabricksConfigModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfigured={handleConfigured}
        autoDetectedHost={autoDetectedHost}
        inDatabricksApp={inDatabricksApp}
        hasOboToken={hasToken}
        oauthInfo={oauthInfo}
      />
    </>
  );
}

export default ConnectionStatus;
