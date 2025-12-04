import { useState } from 'react';
import { useConfigStore } from './stores/configStore';
import Sidebar from './components/layout/Sidebar';
import ConfigPanel from './components/layout/ConfigPanel';
import PreviewPanel from './components/layout/PreviewPanel';
import Header from './components/layout/Header';

export type ActiveSection = 'overview' | 'variables' | 'schemas' | 'resources' | 'retrievers' | 'tools' | 'guardrails' | 'memory' | 'prompts' | 'agents' | 'app';

function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  const [showPreview, setShowPreview] = useState(true);
  const { config } = useConfigStore();

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <Header 
        showPreview={showPreview} 
        onTogglePreview={() => setShowPreview(!showPreview)} 
      />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar 
          activeSection={activeSection} 
          onSectionChange={setActiveSection}
          config={config}
        />
        
        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Config Panel */}
          <div className={`flex-1 overflow-hidden ${showPreview ? 'border-r border-slate-800' : ''}`}>
            <ConfigPanel activeSection={activeSection} onNavigate={setActiveSection} />
          </div>
          
          {/* Preview Panel */}
          {showPreview && (
            <div className="w-[500px] overflow-hidden">
              <PreviewPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
