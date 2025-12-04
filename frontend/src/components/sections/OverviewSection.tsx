import { 
  Database, 
  Wrench, 
  Bot, 
  Settings, 
  Package,
  FileText,
  ArrowRight,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { ActiveSection } from '@/App';

interface OverviewSectionProps {
  onNavigate: (section: ActiveSection) => void;
}

interface StepConfig {
  id: ActiveSection;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  isComplete: (config: any) => boolean;
}

const GETTING_STARTED_STEPS: StepConfig[] = [
  {
    id: 'schemas',
    title: '1. Define Schemas',
    description: 'Set up Unity Catalog schemas for your resources',
    icon: Database,
    color: 'text-blue-400',
    isComplete: (config) => Object.keys(config.schemas || {}).length > 0,
  },
  {
    id: 'resources',
    title: '2. Configure Resources',
    description: 'Add LLMs, Genie rooms, tables, and other Databricks resources',
    icon: Package,
    color: 'text-emerald-400',
    isComplete: (config) => {
      const r = config.resources || {};
      return Object.keys(r.llms || {}).length > 0;
    },
  },
  {
    id: 'tools',
    title: '3. Create Tools',
    description: 'Define tools that agents can use to perform tasks',
    icon: Wrench,
    color: 'text-amber-400',
    isComplete: (config) => Object.keys(config.tools || {}).length > 0,
  },
  {
    id: 'agents',
    title: '4. Build Agents',
    description: 'Create AI agents with models, tools, and prompts',
    icon: Bot,
    color: 'text-violet-400',
    isComplete: (config) => Object.keys(config.agents || {}).length > 0,
  },
  {
    id: 'app',
    title: '5. Configure Application',
    description: 'Set up your application and deployment settings',
    icon: Settings,
    color: 'text-rose-400',
    isComplete: (config) => config.app?.name && config.app?.registered_model?.name,
  },
];

export default function OverviewSection({ onNavigate }: OverviewSectionProps) {
  const { config } = useConfigStore();

  // Calculate stats
  const stats = {
    schemas: Object.keys(config.schemas || {}).length,
    llms: Object.keys(config.resources?.llms || {}).length,
    tools: Object.keys(config.tools || {}).length,
    agents: Object.keys(config.agents || {}).length,
    prompts: Object.keys(config.prompts || {}).length,
  };

  const completedSteps = GETTING_STARTED_STEPS.filter(step => step.isComplete(config)).length;
  const totalSteps = GETTING_STARTED_STEPS.length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  const isConfigEmpty = completedSteps === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">DAO AI Configuration Builder</h2>
        <p className="text-slate-400 mt-1">
          Build and configure multi-agent AI systems for Databricks
        </p>
      </div>

      {/* Progress Card */}
      <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">
                {isConfigEmpty ? 'Get Started' : 'Configuration Progress'}
              </h3>
              <p className="text-sm text-slate-400">
                {isConfigEmpty 
                  ? 'Follow the steps below to build your agent configuration'
                  : `${completedSteps} of ${totalSteps} steps completed`
                }
              </p>
            </div>
          </div>
          {!isConfigEmpty && (
            <div className="text-right">
              <span className="text-2xl font-bold text-white">{progressPercent}%</span>
              <p className="text-xs text-slate-500">complete</p>
            </div>
          )}
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-slate-700/50 rounded-full h-2 mb-4">
          <div 
            className="bg-gradient-to-r from-blue-500 to-violet-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Quick Stats */}
        {!isConfigEmpty && (
          <div className="grid grid-cols-5 gap-4 pt-2">
            <div className="text-center">
              <p className="text-lg font-semibold text-white">{stats.schemas}</p>
              <p className="text-xs text-slate-500">Schemas</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white">{stats.llms}</p>
              <p className="text-xs text-slate-500">LLMs</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white">{stats.tools}</p>
              <p className="text-xs text-slate-500">Tools</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white">{stats.agents}</p>
              <p className="text-xs text-slate-500">Agents</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white">{stats.prompts}</p>
              <p className="text-xs text-slate-500">Prompts</p>
            </div>
          </div>
        )}
      </Card>

      {/* Getting Started Steps */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">
          {isConfigEmpty ? 'Getting Started' : 'Configuration Steps'}
        </h3>
        
        {GETTING_STARTED_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isComplete = step.isComplete(config);
          const isNext = !isComplete && GETTING_STARTED_STEPS.slice(0, index).every(s => s.isComplete(config));
          
          return (
            <Card 
              key={step.id}
              variant={isNext ? 'highlight' : 'default'}
              className={`transition-all duration-200 ${isNext ? 'ring-1 ring-blue-500/50' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isComplete 
                      ? 'bg-emerald-500/20' 
                      : isNext 
                        ? 'bg-blue-500/20' 
                        : 'bg-slate-700/50'
                  }`}>
                    {isComplete ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Icon className={`w-5 h-5 ${isNext ? step.color : 'text-slate-500'}`} />
                    )}
                  </div>
                  <div>
                    <h4 className={`font-medium ${isComplete ? 'text-slate-400' : 'text-white'}`}>
                      {step.title}
                    </h4>
                    <p className="text-sm text-slate-500">{step.description}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {isComplete && (
                    <Badge variant="success">Complete</Badge>
                  )}
                  {isNext && (
                    <Badge variant="info">Next Step</Badge>
                  )}
                  <Button 
                    variant={isNext ? 'primary' : 'secondary'} 
                    size="sm"
                    onClick={() => onNavigate(step.id)}
                  >
                    {isComplete ? 'Edit' : isNext ? 'Start' : 'Configure'}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <Card>
        <h3 className="font-semibold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => onNavigate('prompts')}
            className="flex items-center space-x-3 p-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors text-left"
          >
            <FileText className="w-5 h-5 text-violet-400" />
            <div>
              <p className="text-sm font-medium text-white">Manage Prompts</p>
              <p className="text-xs text-slate-500">MLflow registry</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate('memory')}
            className="flex items-center space-x-3 p-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors text-left"
          >
            <Database className="w-5 h-5 text-cyan-400" />
            <div>
              <p className="text-sm font-medium text-white">Configure Memory</p>
              <p className="text-xs text-slate-500">Persistence options</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate('app')}
            className="flex items-center space-x-3 p-3 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg transition-colors text-left"
          >
            <Bot className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-sm font-medium text-white">Configure Application</p>
              <p className="text-xs text-slate-500">Orchestration & deployment</p>
            </div>
          </button>
        </div>
      </Card>

      {/* Tip */}
      <div className="text-center text-sm text-slate-500 py-4">
        <p>💡 Tip: Use the YAML preview on the right to see your configuration in real-time</p>
      </div>
    </div>
  );
}

