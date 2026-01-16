import { useState, ChangeEvent } from 'react';
import { Plus, Trash2, Key, Lock, FileCode, Layers, Pencil } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useConfigStore } from '@/stores/configStore';
import { safeDelete } from '@/utils/safe-delete';
import { useYamlScrollStore } from '@/stores/yamlScrollStore';
import { normalizeRefNameWhileTyping } from '@/utils/name-utils';
import {
  VariableModel,
  VariableType,
  PrimitiveVariableModel,
  EnvironmentVariableModel,
  SecretVariableModel,
} from '@/types/dao-ai-types';

interface VariableFormData {
  name: string;
  type: VariableType;
  // Primitive
  primitiveValue: string;
  // Environment
  envName: string;
  envDefault: string;
  // Secret
  secretScope: string;
  secretKey: string;
  secretDefault: string;
  // Composite options
  compositeOptions: Array<{
    type: 'env' | 'secret' | 'primitive';
    envName?: string;
    scope?: string;
    secret?: string;
    value?: string;
  }>;
  compositeDefault: string;
}

const defaultFormData: VariableFormData = {
  name: '',
  type: 'primitive',
  primitiveValue: '',
  envName: '',
  envDefault: '',
  secretScope: '',
  secretKey: '',
  secretDefault: '',
  compositeOptions: [],
  compositeDefault: '',
};

const variableTypeOptions = [
  { value: 'primitive', label: 'Primitive Value' },
  { value: 'env', label: 'Environment Variable' },
  { value: 'secret', label: 'Databricks Secret' },
  { value: 'composite', label: 'Composite (Fallback Chain)' },
];

const getVariableIcon = (type: VariableType) => {
  switch (type) {
    case 'primitive':
      return FileCode;
    case 'env':
      return Key;
    case 'secret':
      return Lock;
    case 'composite':
      return Layers;
    default:
      return Key;
  }
};

const getVariableTypeFromModel = (variable: VariableModel): VariableType => {
  // Cast to unknown record for flexible property checking
  // YAML imports may not have explicit 'type' field
  const varObj = variable as unknown as Record<string, unknown>;
  
  // First check for explicit type field
  if (varObj.type && typeof varObj.type === 'string') {
    return varObj.type as VariableType;
  }
  
  // Infer type from structure (YAML imports may not have explicit type)
  // Check for composite (has 'options' array)
  if ('options' in varObj && Array.isArray(varObj.options)) {
    return 'composite';
  }
  
  // Check for secret (has 'scope' and 'secret')
  if ('scope' in varObj && 'secret' in varObj) {
    return 'secret';
  }
  
  // Check for environment variable (has 'env')
  if ('env' in varObj) {
    return 'env';
  }
  
  // Check for primitive (has 'value')
  if ('value' in varObj) {
    return 'primitive';
  }
  
  // Default to primitive
  return 'primitive';
};

const getVariableDescription = (variable: VariableModel): string => {
  const type = getVariableTypeFromModel(variable);
  const varObj = variable as unknown as Record<string, unknown>;
  
  switch (type) {
    case 'primitive':
      return `Value: ${varObj.value ?? ''}`;
    case 'env':
      return `Env: ${varObj.env ?? ''}`;
    case 'secret':
      return `Secret: ${varObj.scope ?? ''}/${varObj.secret ?? ''}`;
    case 'composite':
      const options = (varObj.options as unknown[]) || [];
      return `${options.length} fallback option(s)`;
    default:
      return '';
  }
};

export function VariablesSection() {
  const { config, addVariable, updateVariable, removeVariable } = useConfigStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formData, setFormData] = useState<VariableFormData>(defaultFormData);

  const variables = config.variables || {};

  const { scrollToAsset } = useYamlScrollStore();

  // Handle editing an existing variable
  const handleEdit = (name: string, variable: VariableModel) => {
    scrollToAsset(name);
    setEditingKey(name);
    
    const varType = getVariableTypeFromModel(variable);
    
    const newFormData: VariableFormData = {
      ...defaultFormData,
      name,
      type: varType,
    };
    
    switch (varType) {
      case 'primitive':
        newFormData.primitiveValue = String((variable as PrimitiveVariableModel).value || '');
        break;
      case 'env':
        const envVar = variable as EnvironmentVariableModel;
        newFormData.envName = envVar.env || '';
        newFormData.envDefault = envVar.default_value !== undefined ? String(envVar.default_value) : '';
        break;
      case 'secret':
        const secretVar = variable as SecretVariableModel;
        newFormData.secretScope = secretVar.scope || '';
        newFormData.secretKey = secretVar.secret || '';
        newFormData.secretDefault = secretVar.default_value !== undefined ? String(secretVar.default_value) : '';
        break;
      case 'composite':
        // Cast to access options - may not have explicit 'type' field from YAML import
        const compVarObj = variable as unknown as { options?: unknown[]; default_value?: unknown };
        newFormData.compositeOptions = (compVarObj.options || []).map((opt) => {
          // Handle options that may or may not have explicit type field
          const optObj = opt as Record<string, unknown>;
          
          // Check for env variable (has 'env' field)
          if ('env' in optObj) {
            return { type: 'env' as const, envName: String(optObj.env || '') };
          }
          // Check for secret (has 'scope' and 'secret' fields)
          if ('scope' in optObj && 'secret' in optObj) {
            return { 
              type: 'secret' as const, 
              scope: String(optObj.scope || ''), 
              secret: String(optObj.secret || '') 
            };
          }
          // Check for primitive value
          if ('value' in optObj) {
            return { type: 'primitive' as const, value: String(optObj.value || '') };
          }
          // Default to primitive
          return { type: 'primitive' as const, value: '' };
        });
        newFormData.compositeDefault = compVarObj.default_value !== undefined ? String(compVarObj.default_value) : '';
        break;
    }
    
    setFormData(newFormData);
    setIsAdding(true);
  };

  const resetForm = () => {
    setFormData(defaultFormData);
    setEditingKey(null);
    setIsAdding(false);
  };

  const buildVariableModel = (): VariableModel => {
    switch (formData.type) {
      case 'primitive':
        return {
          type: 'primitive',
          value: formData.primitiveValue,
        };
      case 'env':
        return {
          type: 'env',
          env: formData.envName,
          ...(formData.envDefault && { default_value: formData.envDefault }),
        };
      case 'secret':
        return {
          type: 'secret',
          scope: formData.secretScope,
          secret: formData.secretKey,
          ...(formData.secretDefault && { default_value: formData.secretDefault }),
        };
      case 'composite':
        return {
          type: 'composite',
          options: formData.compositeOptions.map((opt) => {
            if (opt.type === 'env') {
              return { type: 'env', env: opt.envName || '' } as EnvironmentVariableModel;
            } else if (opt.type === 'secret') {
              return { type: 'secret', scope: opt.scope || '', secret: opt.secret || '' } as SecretVariableModel;
            } else {
              return { type: 'primitive', value: opt.value || '' } as PrimitiveVariableModel;
            }
          }),
          ...(formData.compositeDefault && { default_value: formData.compositeDefault }),
        };
      default:
        return { type: 'primitive', value: '' };
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) return;
    
    const variable = buildVariableModel();
    
    if (editingKey) {
      // When editing, handle name change
      if (editingKey !== formData.name) {
        // Name changed - remove old and add new
        removeVariable(editingKey);
        addVariable(formData.name, variable);
      } else {
        // Name unchanged - just update
        updateVariable(editingKey, variable);
      }
    } else {
      addVariable(formData.name, variable);
    }
    
    resetForm();
  };

  const addCompositeOption = (type: 'env' | 'secret' | 'primitive') => {
    setFormData({
      ...formData,
      compositeOptions: [
        ...formData.compositeOptions,
        { type, envName: '', scope: '', secret: '', value: '' },
      ],
    });
  };

  const updateCompositeOption = (index: number, updates: Partial<VariableFormData['compositeOptions'][0]>) => {
    const newOptions = [...formData.compositeOptions];
    newOptions[index] = { ...newOptions[index], ...updates };
    setFormData({ ...formData, compositeOptions: newOptions });
  };

  const removeCompositeOption = (index: number) => {
    setFormData({
      ...formData,
      compositeOptions: formData.compositeOptions.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Variables</h2>
          <p className="text-sm text-slate-400">
            Define reusable configuration variables (env vars, secrets, or values)
          </p>
        </div>
        <Button onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus className="w-4 h-4 mr-2" />
          Add Variable
        </Button>
      </div>

      {isAdding && (
        <Card className="p-4 space-y-4 border-blue-500/50">
          <h3 className="text-lg font-medium text-white">
            {editingKey ? 'Edit Variable' : 'Add Variable'}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Variable Name"
              placeholder="e.g., client_id, workspace_host"
              value={formData.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setFormData({ ...formData, name: normalizeRefNameWhileTyping(e.target.value) });
              }}
              hint="Type naturally - spaces become underscores"
            />
            <Select
              label="Variable Type"
              value={formData.type}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormData({ ...formData, type: e.target.value as VariableType })}
              options={variableTypeOptions}
            />
          </div>

          {formData.type === 'primitive' && (
            <Input
              label="Value"
              placeholder="Enter the value"
              value={formData.primitiveValue}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, primitiveValue: e.target.value })}
            />
          )}

          {formData.type === 'env' && (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Environment Variable Name"
                placeholder="e.g., DATABRICKS_HOST"
                value={formData.envName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, envName: e.target.value })}
              />
              <Input
                label="Default Value (optional)"
                placeholder="Fallback if env var not set"
                value={formData.envDefault}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, envDefault: e.target.value })}
              />
            </div>
          )}

          {formData.type === 'secret' && (
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Secret Scope"
                placeholder="e.g., retail_ai"
                value={formData.secretScope}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, secretScope: e.target.value })}
              />
              <Input
                label="Secret Key"
                placeholder="e.g., DATABRICKS_TOKEN"
                value={formData.secretKey}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, secretKey: e.target.value })}
              />
              <Input
                label="Default Value (optional)"
                placeholder="Fallback if secret not found"
                value={formData.secretDefault}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, secretDefault: e.target.value })}
              />
            </div>
          )}

          {formData.type === 'composite' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">
                  Fallback Options (tried in order)
                </label>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => addCompositeOption('env')}>
                    <Key className="w-3 h-3 mr-1" /> Add Env
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => addCompositeOption('secret')}>
                    <Lock className="w-3 h-3 mr-1" /> Add Secret
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => addCompositeOption('primitive')}>
                    <FileCode className="w-3 h-3 mr-1" /> Add Value
                  </Button>
                </div>
              </div>

              {formData.compositeOptions.length === 0 && (
                <p className="text-sm text-slate-500 italic">
                  Add fallback options. They will be tried in order until one succeeds.
                </p>
              )}

              {formData.compositeOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-xs text-slate-500 w-6">{idx + 1}.</span>
                  {opt.type === 'env' && (
                    <Input
                      className="flex-1"
                      placeholder="Environment variable name"
                      value={opt.envName || ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => updateCompositeOption(idx, { envName: e.target.value })}
                    />
                  )}
                  {opt.type === 'secret' && (
                    <>
                      <Input
                        className="flex-1"
                        placeholder="Scope"
                        value={opt.scope || ''}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => updateCompositeOption(idx, { scope: e.target.value })}
                      />
                      <Input
                        className="flex-1"
                        placeholder="Secret key"
                        value={opt.secret || ''}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => updateCompositeOption(idx, { secret: e.target.value })}
                      />
                    </>
                  )}
                  {opt.type === 'primitive' && (
                    <Input
                      className="flex-1"
                      placeholder="Value"
                      value={opt.value || ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => updateCompositeOption(idx, { value: e.target.value })}
                    />
                  )}
                  <span className="text-xs text-slate-500 capitalize">{opt.type}</span>
                  <button
                    onClick={() => removeCompositeOption(idx)}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <Input
                label="Default Value (optional)"
                placeholder="Final fallback if all options fail"
                value={formData.compositeDefault}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, compositeDefault: e.target.value })}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={resetForm}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formData.name.trim()}>
              {editingKey ? 'Save Changes' : 'Add Variable'}
            </Button>
          </div>
        </Card>
      )}

      {Object.keys(variables).length === 0 && !isAdding ? (
        <Card className="p-8 text-center">
          <div className="text-slate-400 mb-4">
            <Key className="w-12 h-12 mx-auto opacity-50" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No Variables Defined</h3>
          <p className="text-slate-400 text-sm mb-4">
            Variables let you configure values from environment variables, Databricks secrets, or
            fallback chains. Use them to keep sensitive data out of your config.
          </p>
          <Button onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Variable
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {Object.entries(variables).map(([name, variable]) => {
            const varType = getVariableTypeFromModel(variable as VariableModel);
            const Icon = getVariableIcon(varType);
            return (
              <Card 
                key={name} 
                className="p-4 cursor-pointer hover:border-blue-500/50 transition-colors"
                onClick={() => handleEdit(name, variable as VariableModel)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-700/50 rounded-lg">
                      <Icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="font-medium text-white">{name}</h4>
                      <p className="text-sm text-slate-400">
                        {getVariableDescription(variable as VariableModel)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 bg-slate-700/50 rounded text-slate-300 capitalize">
                      {varType}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(name, variable as VariableModel);
                      }}
                      className="text-slate-400 hover:text-blue-400 p-1"
                      title="Edit variable"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        safeDelete('Variable', name, () => removeVariable(name));
                      }}
                      className="text-slate-400 hover:text-red-400 p-1"
                      title="Delete variable"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {Object.keys(variables).length > 0 && (
        <Card className="p-4 bg-slate-800/30 border-slate-700/50">
          <h4 className="text-sm font-medium text-slate-300 mb-2">Usage in YAML</h4>
          <p className="text-xs text-slate-400 mb-2">
            Reference variables using YAML anchors:
          </p>
          <pre className="text-xs bg-slate-900/50 p-2 rounded overflow-x-auto">
            <code className="text-green-400">
{`variables:
  ${Object.keys(variables)[0] || 'my_var'}: &${Object.keys(variables)[0] || 'my_var'}
    ...

# Use in config:
tools:
  my_tool:
    function:
      client_id: *${Object.keys(variables)[0] || 'my_var'}`}
            </code>
          </pre>
        </Card>
      )}
    </div>
  );
}

