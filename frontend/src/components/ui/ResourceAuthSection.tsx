import { ChangeEvent } from 'react';
import { User } from 'lucide-react';
import Select from './Select';
import Input from './Input';

// Type for credential source
export type CredentialSource = 'variable' | 'manual';

// Type for authentication method
export type AuthMethod = 'default' | 'service_principal' | 'oauth' | 'pat';

// Helper to format variable reference for YAML
export const formatVariableRef = (variableName: string): string => {
  return `*${variableName}`;
};

// Helper to get display name for variable
export const getVariableDisplayName = (variable: any): string => {
  if (!variable) return 'unknown';
  if (typeof variable === 'string' || typeof variable === 'number' || typeof variable === 'boolean') {
    return `value: ${String(variable)}`;
  }
  if ('env' in variable) return `env: ${variable.env}`;
  if ('scope' in variable && 'secret' in variable) return `secret: ${variable.scope}/${variable.secret}`;
  if ('value' in variable) return `value: ${String(variable.value)}`;
  if ('options' in variable) return `composite (${variable.options.length} options)`;
  return 'unknown';
};

// Credential input component with variable selection
interface CredentialInputProps {
  label: string;
  source: CredentialSource;
  onSourceChange: (source: CredentialSource) => void;
  manualValue: string;
  onManualChange: (value: string) => void;
  variableValue: string;
  onVariableChange: (value: string) => void;
  placeholder?: string;
  isPassword?: boolean;
  hint?: string;
  variableNames: string[];
  variables: Record<string, any>;
  disabled?: boolean;
}

export function CredentialInput({
  label,
  source,
  onSourceChange,
  manualValue,
  onManualChange,
  variableValue,
  onVariableChange,
  placeholder,
  isPassword = false,
  hint,
  variableNames,
  variables,
  disabled = false,
}: CredentialInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-300">{label}</label>
        <div className="inline-flex rounded-lg bg-slate-900/50 p-0.5">
          <button
            type="button"
            onClick={() => !disabled && onSourceChange('variable')}
            disabled={disabled}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 flex items-center gap-1 ${
              source === 'variable'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                : 'text-slate-400 border border-transparent hover:text-slate-300'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Variable
          </button>
          <button
            type="button"
            onClick={() => !disabled && onSourceChange('manual')}
            disabled={disabled}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
              source === 'manual'
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40'
                : 'text-slate-400 border border-transparent hover:text-slate-300'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Manual
          </button>
        </div>
      </div>
      
      {source === 'variable' ? (
        <Select
          value={variableValue}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onVariableChange(e.target.value)}
          options={[
            { value: '', label: 'Select a variable...' },
            ...variableNames.map((name) => ({
              value: name,
              label: `${name} (${getVariableDisplayName(variables[name])})`,
            })),
          ]}
          hint={variableNames.length === 0 ? 'Define variables in the Variables section first' : hint}
          disabled={disabled}
        />
      ) : (
        <Input
          value={manualValue}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onManualChange(e.target.value)}
          placeholder={placeholder}
          type={isPassword ? 'password' : 'text'}
          hint={hint}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// Form data interface for authentication
export interface ResourceAuthFormData {
  authMethod: AuthMethod;
  servicePrincipalRef: string;
  clientIdSource: CredentialSource;
  clientSecretSource: CredentialSource;
  workspaceHostSource: CredentialSource;
  patSource: CredentialSource;
  client_id: string;
  client_secret: string;
  workspace_host: string;
  pat: string;
  clientIdVariable: string;
  clientSecretVariable: string;
  workspaceHostVariable: string;
  patVariable: string;
  on_behalf_of_user: boolean;
}

// Default auth form data
export const defaultResourceAuthFormData: ResourceAuthFormData = {
  authMethod: 'default',
  servicePrincipalRef: '',
  clientIdSource: 'variable',
  clientSecretSource: 'variable',
  workspaceHostSource: 'variable',
  patSource: 'variable',
  client_id: '',
  client_secret: '',
  workspace_host: '',
  pat: '',
  clientIdVariable: '',
  clientSecretVariable: '',
  workspaceHostVariable: '',
  patVariable: '',
  on_behalf_of_user: false,
};

// Props for ResourceAuthSection
interface ResourceAuthSectionProps {
  formData: ResourceAuthFormData;
  setFormData: (data: ResourceAuthFormData) => void;
  servicePrincipals: Record<string, any>;
  variables: Record<string, any>;
  variableNames: string[];
  showUserAuth?: boolean;  // For databases that support user/password
}

const authMethodOptions = [
  { value: 'default', label: 'Use Ambient/Default Credentials' },
  { value: 'service_principal', label: 'Configured Service Principal' },
  { value: 'oauth', label: 'OAuth2 / M2M Credentials' },
  { value: 'pat', label: 'Personal Access Token' },
];

export function ResourceAuthSection({
  formData,
  setFormData,
  servicePrincipals,
  variables,
  variableNames,
}: ResourceAuthSectionProps) {
  const isOnBehalfOfUser = formData?.on_behalf_of_user || false;
  
  return (
    <div className="space-y-4 p-4 bg-slate-900/30 rounded-lg border border-slate-600">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">Authentication</h4>
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.on_behalf_of_user}
            onChange={(e) => setFormData({ ...formData, on_behalf_of_user: e.target.checked })}
            className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
          />
          <User className="w-4 h-4 text-blue-400" />
          <span className="text-sm text-slate-300">On Behalf of User</span>
        </label>
      </div>
      
      {isOnBehalfOfUser && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-300 text-xs">
          When enabled, the resource will use the calling user's credentials for authentication.
          Other authentication options are disabled.
        </div>
      )}
      
      <Select
        label="Authentication Method"
        value={formData?.authMethod || 'default'}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => 
          setFormData({ ...formData, authMethod: e.target.value as AuthMethod })
        }
        options={authMethodOptions}
        disabled={isOnBehalfOfUser}
        hint={isOnBehalfOfUser ? 'Disabled when "On Behalf of User" is enabled' : undefined}
      />
      
      {!isOnBehalfOfUser && (formData?.authMethod === 'default' || !formData?.authMethod) && (
        <div className="p-3 bg-slate-800/50 rounded border border-slate-600 text-slate-300 text-xs">
          Will use ambient credentials from the environment (DATABRICKS_HOST, DATABRICKS_TOKEN, etc.)
          or the default Databricks SDK configuration.
        </div>
      )}
      
      {!isOnBehalfOfUser && formData?.authMethod === 'service_principal' && (
        <div className="space-y-4 p-3 bg-slate-900/50 rounded border border-slate-600">
          <p className="text-xs text-slate-400 font-medium">Select Configured Service Principal</p>
          
          <Select
            label="Service Principal"
            value={formData?.servicePrincipalRef || ''}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => 
              setFormData({ ...formData, servicePrincipalRef: e.target.value })
            }
            options={[
              { value: '', label: 'Select a service principal...' },
              ...Object.keys(servicePrincipals).map((sp) => ({
                value: sp,
                label: sp,
              })),
            ]}
            hint="Reference a pre-configured service principal"
          />
          
          {Object.keys(servicePrincipals).length === 0 && (
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-400 text-xs">
              No service principals configured. Add one in the Service Principals section first.
            </div>
          )}
        </div>
      )}
      
      {!isOnBehalfOfUser && formData?.authMethod === 'oauth' && (
        <div className="space-y-4 p-3 bg-slate-900/50 rounded border border-slate-600">
          <p className="text-xs text-slate-400 font-medium">OAuth2 / M2M Credentials</p>
          
          <CredentialInput
            label="Client ID"
            source={formData?.clientIdSource || 'variable'}
            onSourceChange={(s) => setFormData({ ...formData, clientIdSource: s })}
            manualValue={formData?.client_id || ''}
            onManualChange={(v) => setFormData({ ...formData, client_id: v })}
            variableValue={formData?.clientIdVariable || ''}
            onVariableChange={(v) => setFormData({ ...formData, clientIdVariable: v })}
            placeholder="your-service-principal-client-id"
            variableNames={variableNames}
            variables={variables}
          />
          
          <CredentialInput
            label="Client Secret"
            source={formData?.clientSecretSource || 'variable'}
            onSourceChange={(s) => setFormData({ ...formData, clientSecretSource: s })}
            manualValue={formData?.client_secret || ''}
            onManualChange={(v) => setFormData({ ...formData, client_secret: v })}
            variableValue={formData?.clientSecretVariable || ''}
            onVariableChange={(v) => setFormData({ ...formData, clientSecretVariable: v })}
            placeholder="your-client-secret"
            isPassword
            variableNames={variableNames}
            variables={variables}
          />
          
          <CredentialInput
            label="Workspace Host (Optional)"
            source={formData.workspaceHostSource}
            onSourceChange={(s) => setFormData({ ...formData, workspaceHostSource: s })}
            manualValue={formData.workspace_host}
            onManualChange={(v) => setFormData({ ...formData, workspace_host: v })}
            variableValue={formData.workspaceHostVariable}
            onVariableChange={(v) => setFormData({ ...formData, workspaceHostVariable: v })}
            placeholder="https://your-workspace.cloud.databricks.com"
            hint="Only required if connecting from outside the workspace"
            variableNames={variableNames}
            variables={variables}
          />
        </div>
      )}
      
      {!isOnBehalfOfUser && formData?.authMethod === 'pat' && (
        <div className="space-y-4 p-3 bg-slate-900/50 rounded border border-slate-600">
          <p className="text-xs text-slate-400 font-medium">Personal Access Token</p>
          
          <CredentialInput
            label="PAT Token"
            source={formData?.patSource || 'variable'}
            onSourceChange={(s) => setFormData({ ...formData, patSource: s })}
            manualValue={formData?.pat || ''}
            onManualChange={(v) => setFormData({ ...formData, pat: v })}
            variableValue={formData?.patVariable || ''}
            onVariableChange={(v) => setFormData({ ...formData, patVariable: v })}
            placeholder="dapi..."
            isPassword
            hint="Databricks Personal Access Token"
            variableNames={variableNames}
            variables={variables}
          />
          
          <CredentialInput
            label="Workspace Host (Optional)"
            source={formData?.workspaceHostSource || 'variable'}
            onSourceChange={(s) => setFormData({ ...formData, workspaceHostSource: s })}
            manualValue={formData?.workspace_host || ''}
            onManualChange={(v) => setFormData({ ...formData, workspace_host: v })}
            variableValue={formData?.workspaceHostVariable || ''}
            onVariableChange={(v) => setFormData({ ...formData, workspaceHostVariable: v })}
            placeholder="https://your-workspace.cloud.databricks.com"
            hint="Only required if connecting from outside the workspace"
            variableNames={variableNames}
            variables={variables}
          />
        </div>
      )}
    </div>
  );
}

// Helper function to get credential value (for YAML generation)
export const getCredentialValue = (
  source: CredentialSource,
  manualValue: string,
  variableName: string
): string | undefined => {
  if (!manualValue && !variableName) return undefined;
  if (source === 'variable' && variableName) {
    return formatVariableRef(variableName);
  }
  return manualValue || undefined;
};

// Helper to parse resource auth from model
export const parseResourceAuth = (
  resource: any,
  safeStartsWith: (val: unknown, prefix: string) => boolean,
  safeString: (val: unknown) => string
): ResourceAuthFormData => {
  const isVariableRef = (val?: unknown): boolean => safeStartsWith(val, '*');
  const getVarSlice = (val?: unknown): string => {
    const str = safeString(val);
    return str.startsWith('*') ? str.slice(1) : '';
  };
  
  // Determine auth method
  let authMethod: AuthMethod = 'default';
  if (resource.service_principal) {
    authMethod = 'service_principal';
  } else if (resource.client_id && resource.client_secret) {
    authMethod = 'oauth';
  } else if (resource.pat) {
    authMethod = 'pat';
  }
  
  return {
    authMethod,
    servicePrincipalRef: safeStartsWith(resource.service_principal, '*') 
      ? safeString(resource.service_principal).slice(1) 
      : '',
    clientIdSource: isVariableRef(resource.client_id) ? 'variable' : 'manual',
    clientSecretSource: isVariableRef(resource.client_secret) ? 'variable' : 'manual',
    workspaceHostSource: isVariableRef(resource.workspace_host) ? 'variable' : 'manual',
    patSource: isVariableRef(resource.pat) ? 'variable' : 'manual',
    client_id: isVariableRef(resource.client_id) ? '' : safeString(resource.client_id),
    client_secret: isVariableRef(resource.client_secret) ? '' : safeString(resource.client_secret),
    workspace_host: isVariableRef(resource.workspace_host) ? '' : safeString(resource.workspace_host),
    pat: isVariableRef(resource.pat) ? '' : safeString(resource.pat),
    clientIdVariable: getVarSlice(resource.client_id),
    clientSecretVariable: getVarSlice(resource.client_secret),
    workspaceHostVariable: getVarSlice(resource.workspace_host),
    patVariable: getVarSlice(resource.pat),
    on_behalf_of_user: resource.on_behalf_of_user || false,
  };
};

// Helper to apply auth to resource model
export const applyResourceAuth = (
  resource: any,
  authData: ResourceAuthFormData
): void => {
  // Set on_behalf_of_user
  if (authData.on_behalf_of_user) {
    resource.on_behalf_of_user = true;
    return; // Don't set other auth fields when on_behalf_of_user is true
  }
  
  // Apply based on auth method
  if (authData.authMethod === 'service_principal' && authData.servicePrincipalRef) {
    resource.service_principal = `*${authData.servicePrincipalRef}`;
  } else if (authData.authMethod === 'oauth') {
    const clientId = getCredentialValue(
      authData.clientIdSource,
      authData.client_id,
      authData.clientIdVariable
    );
    const clientSecret = getCredentialValue(
      authData.clientSecretSource,
      authData.client_secret,
      authData.clientSecretVariable
    );
    const workspaceHost = getCredentialValue(
      authData.workspaceHostSource,
      authData.workspace_host,
      authData.workspaceHostVariable
    );
    
    if (clientId) resource.client_id = clientId;
    if (clientSecret) resource.client_secret = clientSecret;
    if (workspaceHost) resource.workspace_host = workspaceHost;
  } else if (authData.authMethod === 'pat') {
    const pat = getCredentialValue(
      authData.patSource,
      authData.pat,
      authData.patVariable
    );
    const workspaceHost = getCredentialValue(
      authData.workspaceHostSource,
      authData.workspace_host,
      authData.workspaceHostVariable
    );
    
    if (pat) resource.pat = pat;
    if (workspaceHost) resource.workspace_host = workspaceHost;
  }
  // For 'default', don't set any auth fields
};

