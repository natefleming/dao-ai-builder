import { Download, Eye, EyeOff, Upload, RotateCcw } from 'lucide-react';
import Button from '../ui/Button';
import { useConfigStore } from '@/stores/configStore';
import { downloadYAML } from '@/utils/yaml-generator';
import { useRef, useState, useEffect } from 'react';
import yaml from 'js-yaml';
import { extractYamlReferences, setYamlReferences, clearYamlReferences } from '@/utils/yaml-references';
import { AppConfig } from '@/types/dao-ai-types';
import ConnectionStatus from '../ui/ConnectionStatus';

interface HeaderProps {
  showPreview: boolean;
  onTogglePreview: () => void;
}

export default function Header({ showPreview, onTogglePreview }: HeaderProps) {
  const { config, setConfig, reset } = useConfigStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [daoAiVersion, setDaoAiVersion] = useState<string | null>(null);

  // Fetch dao-ai version on mount
  useEffect(() => {
    fetch('/api/version')
      .then(res => res.json())
      .then(data => setDaoAiVersion(data.dao_ai))
      .catch(() => setDaoAiVersion(null));
  }, []);

  const handleExport = () => {
    const appName = config.app?.name || 'model_config';
    downloadYAML(config, `${appName}.yaml`);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        
        // Extract anchor/alias relationships BEFORE parsing
        // This preserves the reference structure for later export
        const references = extractYamlReferences(content);
        setYamlReferences(references);
        console.log('[Import] Extracted YAML references:', references);
        
        // Now parse the YAML (which will resolve aliases)
        const parsed = yaml.load(content) as AppConfig;
        setConfig(parsed);
      } catch (error) {
        console.error('Failed to parse YAML:', error);
        alert('Failed to parse YAML file. Please check the format.');
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all configuration? This cannot be undone.')) {
      clearYamlReferences();
      reset();
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
      </div>

      <div className="flex items-center space-x-3">
        <ConnectionStatus />
        
        <div className="w-px h-6 bg-slate-700" />
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          onChange={handleImport}
          className="hidden"
        />
        
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => fileInputRef.current?.click()}
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
      </div>
    </header>
  );
}

