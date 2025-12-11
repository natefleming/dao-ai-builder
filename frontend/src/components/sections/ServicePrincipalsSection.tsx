import { useState, ChangeEvent } from 'react';
import { Key, Plus, Edit2, Trash2 } from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import { ServicePrincipalModel, AppConfig } from '@/types/dao-ai-types';
import { normalizeRefNameWhileTyping } from '@/utils/name-utils';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

// Helper to safely check if a value starts with a prefix
function safeStartsWith(value: unknown, prefix: string): boolean {
  return typeof value === 'string' && value.startsWith(prefix);
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Check for duplicate reference names across all config sections
function isRefNameDuplicate(refName: string, config: AppConfig, editingKey: string | null): boolean {
  if (!refName) return false;
  
  // Check resources
  const resources = config.resources || {};
  const resourceTypes = ['llms', 'genie_rooms', 'tables', 'volumes', 'functions', 'warehouses', 'connections', 'databases', 'vector_stores'] as const;
  for (const type of resourceTypes) {
    const items = resources[type] || {};
    if (refName in items && refName !== editingKey) {
      return true;
    }
  }
  
  // Check top-level service_principals
  const servicePrincipals = config.service_principals || {};
  if (refName in servicePrincipals && refName !== editingKey) {
    return true;
  }
  
  // Check agents
  const agents = config.agents || {};
  if (refName in agents && refName !== editingKey) {
    return true;
  }
  
  // Check tools
  const tools = config.tools || {};
  if (refName in tools && refName !== editingKey) {
    return true;
  }
  
  // Check schemas
  const schemas = config.schemas || {};
  if (refName in schemas && refName !== editingKey) {
    return true;
  }
  
  // Check variables
  const variables = config.variables || {};
  if (refName in variables && refName !== editingKey) {
    return true;
  }
  
  return false;
}

type SPCredentialSource = 'manual' | 'variable';

interface SPFormData {
  refName: string;
  clientIdSource: SPCredentialSource;
  clientSecretSource: SPCredentialSource;
  client_id: string;
  client_secret: string;
  clientIdVariable: string;
  clientSecretVariable: string;
}

const defaultSPForm: SPFormData = {
  refName: '',
  clientIdSource: 'variable',
  clientSecretSource: 'variable',
  client_id: '',
  client_secret: '',
  clientIdVariable: '',
  clientSecretVariable: '',
};

export default function ServicePrincipalsSection() {
  const { config, addServicePrincipal, updateServicePrincipal, removeServicePrincipal } = useConfigStore();
  const servicePrincipals = config.service_principals || {};
  const variables = config.variables || {};
  const variableNames = Object.keys(variables);
  
  const [showForm, setShowForm] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formData, setFormData] = useState<SPFormData>(defaultSPForm);

  const handleEdit = (key: string) => {
    const sp = servicePrincipals[key];
    if (sp) {
      const isVariableRef = (val?: unknown): boolean => safeStartsWith(val, '*');
      const getVarSlice = (val?: unknown): string => {
        const str = safeString(val);
        return str.startsWith('*') ? str.slice(1) : '';
      };
      
      setFormData({
        refName: key,
        clientIdSource: isVariableRef(sp.client_id) ? 'variable' : 'manual',
        clientSecretSource: isVariableRef(sp.client_secret) ? 'variable' : 'manual',
        client_id: isVariableRef(sp.client_id) ? '' : safeString(sp.client_id),
        client_secret: isVariableRef(sp.client_secret) ? '' : safeString(sp.client_secret),
        clientIdVariable: isVariableRef(sp.client_id) ? getVarSlice(sp.client_id) : '',
        clientSecretVariable: isVariableRef(sp.client_secret) ? getVarSlice(sp.client_secret) : '',
      });
      setEditingKey(key);
      setShowForm(true);
    }
  };

  const handleSave = () => {
    const sp: ServicePrincipalModel = {
      client_id: formData.clientIdSource === 'variable' && formData.clientIdVariable
        ? `*${formData.clientIdVariable}`
        : formData.client_id,
      client_secret: formData.clientSecretSource === 'variable' && formData.clientSecretVariable
        ? `*${formData.clientSecretVariable}`
        : formData.client_secret,
    };
    
    if (editingKey) {
      if (editingKey !== formData.refName) {
        removeServicePrincipal(editingKey);
        addServicePrincipal(formData.refName, sp);
      } else {
        updateServicePrincipal(formData.refName, sp);
      }
    } else {
      addServicePrincipal(formData.refName, sp);
    }
    
    setFormData(defaultSPForm);
    setShowForm(false);
    setEditingKey(null);
  };

  const handleCancel = () => {
    setFormData(defaultSPForm);
    setShowForm(false);
    setEditingKey(null);
  };

  const handleDelete = (key: string) => {
    removeServicePrincipal(key);
  };

  const isClientIdValid = formData.clientIdSource === 'variable' ? !!formData.clientIdVariable : !!formData.client_id;
  const isClientSecretValid = formData.clientSecretSource === 'variable' ? !!formData.clientSecretVariable : !!formData.client_secret;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Service Principals</h2>
        <p className="text-slate-400 mt-1">
          Configure OAuth credentials for database connections, MCP tools, and other services that require authentication.
        </p>
      </div>

      {/* Info Box */}
      <Card className="p-4 bg-blue-500/10 border-blue-500/30">
        <div className="flex items-start space-x-3">
          <Key className="w-5 h-5 text-blue-400 mt-0.5" />
          <div className="text-sm text-blue-200">
            <p className="font-medium">About Service Principals</p>
            <p className="text-blue-300 mt-1">
              Service principals provide OAuth client credentials (client_id and client_secret) that can be referenced 
              throughout your configuration using <code className="bg-blue-900/50 px-1 rounded">*reference_name</code> syntax.
              They're commonly used for database connections, external API authentication, and MCP tool configuration.
            </p>
          </div>
        </div>
      </Card>

      {/* Main Card */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Key className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-slate-100">Configured Service Principals</h3>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setFormData(defaultSPForm); setEditingKey(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" />
            Add Service Principal
          </Button>
        </div>

        {/* Existing Resources */}
        {Object.keys(servicePrincipals).length > 0 && (
          <div className="space-y-2 mb-4">
            {Object.entries(servicePrincipals).map(([key, sp]) => (
              <div key={key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center space-x-3">
                  <Key className="w-4 h-4 text-amber-400" />
                  <div>
                    <p className="font-medium text-slate-200">{key}</p>
                    <p className="text-xs text-slate-500">
                      Client ID: {safeStartsWith(sp.client_id, '*') ? `Variable (${safeString(sp.client_id).slice(1)})` : '••••••••'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(key)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(key)}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {Object.keys(servicePrincipals).length === 0 && !showForm && (
          <p className="text-slate-500 text-sm">No service principals configured. Click "Add Service Principal" to create one.</p>
        )}

        {/* Form */}
        {showForm && (
          <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
            <h4 className="font-medium text-slate-200">{editingKey ? 'Edit' : 'New'} Service Principal</h4>
            
            <Input
              label="Reference Name"
              value={formData.refName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, refName: normalizeRefNameWhileTyping(e.target.value) })}
              placeholder="My Service Principal"
              hint="Type naturally - spaces become underscores"
              required
            />
            
            {/* Client ID */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Client ID *</label>
                <div className="flex space-x-2">
                  <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, clientIdSource: 'variable', client_id: '' })}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                        formData.clientIdSource === 'variable'
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                          : 'text-slate-400 border border-transparent hover:text-slate-300'
                      }`}
                    >
                      Variable
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, clientIdSource: 'manual', clientIdVariable: '' })}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                        formData.clientIdSource === 'manual'
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                          : 'text-slate-400 border border-transparent hover:text-slate-300'
                      }`}
                    >
                      Manual
                    </button>
                  </div>
                </div>
              </div>
              {formData.clientIdSource === 'variable' ? (
                <Select
                  value={formData.clientIdVariable}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, clientIdVariable: e.target.value })}
                  options={[
                    { value: '', label: 'Select a variable...' },
                    ...variableNames.map((v) => ({ value: v, label: v })),
                  ]}
                  hint="Reference a configured variable for the client ID"
                />
              ) : (
                <Input
                  type="password"
                  value={formData.client_id}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, client_id: e.target.value })}
                  placeholder="Enter client ID..."
                  hint="OAuth client ID for the service principal"
                />
              )}
            </div>
            
            {/* Client Secret */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Client Secret *</label>
                <div className="flex space-x-2">
                  <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, clientSecretSource: 'variable', client_secret: '' })}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                        formData.clientSecretSource === 'variable'
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                          : 'text-slate-400 border border-transparent hover:text-slate-300'
                      }`}
                    >
                      Variable
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, clientSecretSource: 'manual', clientSecretVariable: '' })}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
                        formData.clientSecretSource === 'manual'
                          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                          : 'text-slate-400 border border-transparent hover:text-slate-300'
                      }`}
                    >
                      Manual
                    </button>
                  </div>
                </div>
              </div>
              {formData.clientSecretSource === 'variable' ? (
                <Select
                  value={formData.clientSecretVariable}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, clientSecretVariable: e.target.value })}
                  options={[
                    { value: '', label: 'Select a variable...' },
                    ...variableNames.map((v) => ({ value: v, label: v })),
                  ]}
                  hint="Reference a configured variable for the client secret"
                />
              ) : (
                <Input
                  type="password"
                  value={formData.client_secret}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, client_secret: e.target.value })}
                  placeholder="Enter client secret..."
                  hint="OAuth client secret for the service principal"
                />
              )}
            </div>
            
            {/* Duplicate reference name warning */}
            {formData.refName && isRefNameDuplicate(formData.refName, config, editingKey) && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                A resource with reference name "{formData.refName}" already exists. Please choose a unique name.
              </div>
            )}
            
            <div className="flex justify-end space-x-3">
              <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
              <Button 
                onClick={handleSave} 
                disabled={!formData.refName || !isClientIdValid || !isClientSecretValid || isRefNameDuplicate(formData.refName, config, editingKey)}
              >
                {editingKey ? 'Update' : 'Add'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Usage Examples */}
      <Card className="p-4">
        <h4 className="font-medium text-slate-200 mb-3">Usage Examples</h4>
        <div className="text-sm text-slate-400 space-y-2">
          <p>Once configured, reference service principals in your YAML using the asterisk notation:</p>
          <pre className="bg-slate-800 p-3 rounded text-xs overflow-x-auto">
{`databases:
  my_database:
    service_principal: *my_service_principal
    host: ...

tools:
  mcp_tool:
    function:
      type: mcp
      service_principal: *my_service_principal
      ...`}
          </pre>
        </div>
      </Card>
    </div>
  );
}


