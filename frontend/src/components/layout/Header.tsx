import { Download, Eye, EyeOff, Upload, RotateCcw, GitBranch, Rocket, MessageSquare } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { useConfigStore } from '@/stores/configStore';
import { useChatStore } from '@/stores/chatStore';
import { downloadYAML } from '@/utils/yaml-generator';
import { useRef, useState } from 'react';
import yaml from 'js-yaml';
import { extractYamlReferences, setYamlReferences, clearYamlReferences, clearSectionAnchors } from '@/utils/yaml-references';
import { AppConfig } from '@/types/dao-ai-types';
import ConnectionStatus from '../ui/ConnectionStatus';
import GraphVisualization from '../visualization/GraphVisualization';
import DeploymentPanel from '../deployment/DeploymentPanel';
import ChatPanel from '../chat/ChatPanel';
import GitHubImportModal from '../ui/GitHubImportModal';

interface HeaderProps {
  showPreview: boolean;
  onTogglePreview: () => void;
}

export default function Header({ showPreview, onTogglePreview }: HeaderProps) {
  const { config, setConfig, reset, daoAiVersion, hasUnsavedAppChanges } = useConfigStore();
  const { startNewSession } = useChatStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showVisualization, setShowVisualization] = useState(false);
  const [showDeployment, setShowDeployment] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const hasAgents = Object.keys(config.agents || {}).length > 0;
  const hasApp = !!(config.app?.name);
  const hasOrchestration = !!(config.app?.orchestration?.supervisor || config.app?.orchestration?.swarm);
  // All actions require a saved app configuration with agents
  const hasValidConfig = hasAgents && hasApp && hasOrchestration;
  // Disable deploy and chat when there are unsaved changes
  const canDeploy = hasValidConfig && !hasUnsavedAppChanges;
  const canChat = hasValidConfig && !hasUnsavedAppChanges;
  const canVisualize = hasValidConfig;

  const handleExport = () => {
    const appName = config.app?.name || 'model_config';
    downloadYAML(config, `${appName}.yaml`);
  };

  // Core import logic - shared between file upload and GitHub import
  const importYamlContent = (content: string, source: string) => {
    try {
      // Extract anchor/alias relationships BEFORE parsing
      // This preserves the reference structure for later export
      const references = extractYamlReferences(content);
      setYamlReferences(references);
      console.log(`[Import from ${source}] Extracted YAML references:`, references);
      
      // Now parse the YAML (which will resolve aliases)
      const parsed = yaml.load(content) as AppConfig;
      
      // Populate refName for memory based on captured anchor
      if (parsed.memory && references.anchorPaths) {
        // Find the anchor that was defined at the 'memory' path
        const memoryAnchor = references.anchors.find(a => a.path === 'memory');
        if (memoryAnchor) {
          parsed.memory.refName = memoryAnchor.name;
          console.log('[Import] Set memory refName to:', memoryAnchor.name);
        }
      }
      
      // Clear section-level anchor overrides from previous config
      clearSectionAnchors();
      
      setConfig(parsed);
      
      // Start a new chat session since the imported config is different
      startNewSession();
      console.log(`[Import from ${source}] Started new chat session for imported config`);
    } catch (error) {
      console.error('Failed to parse YAML:', error);
      alert('Failed to parse YAML file. Please check the format.');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      importYamlContent(content, `file: ${file.name}`);
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGitHubImport = (content: string, fileName: string) => {
    importYamlContent(content, `GitHub: ${fileName}`);
  };

  const handleLocalUploadFromModal = () => {
    fileInputRef.current?.click();
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all configuration? This cannot be undone.')) {
      clearYamlReferences();
      clearSectionAnchors();
      reset();
      startNewSession(); // Clear chat history when resetting config
    }
  };

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-white">DAO AI Builder</h1>
              {daoAiVersion && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-700 text-slate-400 rounded">
                  v{daoAiVersion}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">Agent Configuration Studio</p>
          </div>
        </div>
        
        {/* Current App Name Indicator */}
        {config.app?.name && (
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-sm font-medium text-cyan-300">{config.app.name}</span>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-3">
        <ConnectionStatus />
        
        <div className="w-px h-6 bg-slate-700" />
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          onChange={handleFileUpload}
          className="hidden"
        />
        
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setShowImportModal(true)}
        >
          <Upload className="w-4 h-4" />
          Import
        </Button>
        
        <Button 
          variant="ghost" 
          size="sm"
          onClick={handleReset}
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </Button>
        
        <div className="w-px h-6 bg-slate-700" />
        
        <Button 
          variant="secondary" 
          size="sm"
          onClick={onTogglePreview}
        >
          {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showPreview ? 'Hide' : 'Show'} Preview
        </Button>
        
        <Button 
          variant="primary" 
          size="sm"
          onClick={handleExport}
        >
          <Download className="w-4 h-4" />
          Export YAML
        </Button>
        
        <div className="w-px h-6 bg-slate-700" />
        
        <Button 
          variant="secondary" 
          size="sm"
          onClick={() => setShowVisualization(true)}
          disabled={!canVisualize}
          title={canVisualize ? 'Visualize agent graph' : 'Save Application Configuration first'}
        >
          <GitBranch className="w-4 h-4" />
          Visualize
        </Button>
        
        <Button 
          variant="secondary" 
          size="sm"
          onClick={() => setShowChat(true)}
          disabled={!canChat}
          title={canChat ? 'Test agent locally' : 'Save Application Configuration first'}
          className="bg-gradient-to-r from-cyan-600/80 to-blue-600/80 hover:from-cyan-500 hover:to-blue-500 text-white border-0"
        >
          <MessageSquare className="w-4 h-4" />
          Chat
        </Button>
        
        <Button 
          variant="primary" 
          size="sm"
          onClick={() => setShowDeployment(true)}
          disabled={!canDeploy}
          title={canDeploy ? 'Deploy to Databricks' : 'Save Application Configuration first'}
          className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500"
        >
          <Rocket className="w-4 h-4" />
          Deploy
        </Button>
      </div>
      
      {/* Visualization Modal */}
      <Modal
        isOpen={showVisualization}
        onClose={() => setShowVisualization(false)}
        title="Application Visualization"
        description="Interactive graph showing agent relationships and orchestration flow"
        size="full"
      >
        <div className="h-[70vh]">
          <GraphVisualization config={config} />
        </div>
      </Modal>
      
      {/* Deployment Modal */}
      <Modal
        isOpen={showDeployment}
        onClose={() => setShowDeployment(false)}
        title={config.app?.deployment_target === 'apps' 
          ? 'Deploy to Databricks Apps' 
          : 'Deploy to Model Serving'}
        description={config.app?.deployment_target === 'apps'
          ? 'Deploy your agent as a Databricks App'
          : 'Deploy your agent to Databricks Model Serving'}
        size="lg"
      >
        <DeploymentPanel onClose={() => setShowDeployment(false)} />
      </Modal>
      
      {/* Chat Modal */}
      <Modal
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        title="Chat with Agent"
        description="Test your agent configuration locally without deploying"
        size="lg"
      >
        <ChatPanel onClose={() => setShowChat(false)} />
      </Modal>

      {/* GitHub Import Modal */}
      <GitHubImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportFile={handleGitHubImport}
        onLocalUpload={handleLocalUploadFromModal}
      />
    </header>
  );
}

