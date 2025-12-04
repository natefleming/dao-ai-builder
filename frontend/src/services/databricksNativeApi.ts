/**
 * Native Databricks API service - calls Databricks REST APIs directly from the browser.
 * 
 * Authentication resolution:
 * 1. X-Forwarded-Access-Token header (Databricks App with user auth)
 * 2. DATABRICKS_TOKEN environment variable (via backend)
 * 3. Manual configuration (user enters in UI)
 * 
 * Host resolution:
 * 1. window.location.origin (when running in Databricks App)
 * 2. DATABRICKS_HOST environment variable (via backend, for local dev)
 * 3. Manual configuration (user enters in UI)
 * 
 * Reference: https://apps-cookbook.dev/docs/streamlit/authentication/users_obo
 */

export interface DatabricksConfig {
  host: string;
  token: string;
  isAutoDetected?: boolean;
  source?: 'oauth' | 'obo' | 'sdk' | 'header' | 'env' | 'manual';
}

// Store configuration in memory
let config: DatabricksConfig | null = null;

const CONFIG_STORAGE_KEY = 'databricks_config';

/**
 * Check if we're running inside a Databricks App environment.
 */
export function isRunningInDatabricksApp(): boolean {
  const hostname = window.location.hostname;
  return (
    hostname.includes('.databricks') ||
    hostname.includes('.azuredatabricks.') ||
    hostname.endsWith('.databricks.com') ||
    hostname.endsWith('.gcp.databricks.com') ||
    hostname.endsWith('.cloud.databricks.com')
  );
}

/**
 * Get the Databricks workspace host from the current URL.
 */
export function getWorkspaceHost(): string {
  return window.location.origin;
}

// Config change notification callback - set by useDatabricks hook
let configChangeCallback: (() => void) | null = null;

export function setConfigChangeCallback(callback: () => void) {
  configChangeCallback = callback;
}

/**
 * Initialize the Databricks configuration.
 * Always persists to localStorage so auth state survives page refreshes.
 */
export function setDatabricksConfig(newConfig: DatabricksConfig): void {
  console.log('[Config] Setting config:', { host: newConfig.host, source: newConfig.source, isAutoDetected: newConfig.isAutoDetected });
  config = newConfig;
  // Always persist to localStorage so auth state is available across components
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
    console.log('[Config] Saved to localStorage');
  } catch (e) {
    console.error('[Config] Failed to save to localStorage:', e);
  }
  // Notify listeners of config change
  if (configChangeCallback) {
    console.log('[Config] Notifying listeners of config change');
    configChangeCallback();
  } else {
    console.warn('[Config] No config change callback registered');
  }
}

/**
 * Get the current Databricks configuration.
 */
export function getDatabricksConfig(): DatabricksConfig | null {
  if (config) return config;
  
  // Try to load from localStorage
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      config = JSON.parse(stored);
      return config;
    }
  } catch {
    // localStorage might not be available
  }
  
  return null;
}

/**
 * Clear the Databricks configuration.
 */
export function clearDatabricksConfig(): void {
  config = null;
  try {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
  } catch {
    // localStorage might not be available
  }
  // Notify listeners of config change
  if (configChangeCallback) {
    configChangeCallback();
  }
}

/**
 * Check if Databricks is configured.
 */
export function isDatabricksConfigured(): boolean {
  return getDatabricksConfig() !== null;
}

/**
 * Response from /api/auth/context endpoint.
 */
interface AuthContextResponse {
  is_databricks_app: boolean;
  has_token: boolean;
  user: {
    email: string | null;
    username: string | null;
    user_id: string | null;
    ip: string | null;
  } | null;
  host: string | null;
  host_source: 'oauth' | 'header' | 'sdk' | 'env' | null;
  auth_method: 'oauth' | 'obo' | 'sdk' | 'env' | 'manual';
  token_source: 'oauth' | 'manual' | 'obo' | 'sdk' | 'env' | null;
  oauth: {
    configured: boolean;
    authenticated: boolean;
    scopes: string[];
  };
}

/**
 * OAuth login response.
 */
interface OAuthLoginResponse {
  auth_url?: string;
  redirect?: boolean;
  error?: string;
  message?: string;
  oauth_required?: boolean;
  host?: string;
}

/**
 * Initiate OAuth login flow.
 * Returns the authorization URL to redirect to.
 */
export async function initiateOAuthLogin(host?: string): Promise<OAuthLoginResponse> {
  const url = host ? `/api/auth/login?host=${encodeURIComponent(host)}` : '/api/auth/login';
  const response = await fetch(url, { credentials: 'include' });
  return response.json();
}

/**
 * Log out from OAuth session.
 */
export async function oauthLogout(): Promise<void> {
  await fetch('/api/auth/logout', { credentials: 'include' });
  clearDatabricksConfig();
}

/**
 * Try to auto-detect Databricks configuration.
 * 
 * Authentication resolution order:
 * 1. OAuth session (from OAuth flow)
 * 2. X-Forwarded-Access-Token header (Databricks App OBO auth)
 * 3. Databricks SDK Config (handles env vars, profiles, Azure CLI, etc.)
 * 4. DATABRICKS_TOKEN environment variable
 * 5. Manual configuration
 * 
 * The backend proxies all API requests and automatically includes the token.
 * 
 * Reference: https://apps-cookbook.dev/docs/streamlit/authentication/users_get_current
 */
export async function tryAutoDetectConfig(): Promise<{
  success: boolean;
  host: string | null;
  hasToken: boolean;
  inDatabricksApp: boolean;
  user?: { email: string | null; username: string | null } | null;
  source?: 'oauth' | 'obo' | 'sdk' | 'env' | 'manual' | null;
  oauth?: { configured: boolean; authenticated: boolean; scopes: string[] };
  error?: string;
}> {
  const inDatabricksApp = isRunningInDatabricksApp();
  
  // If already configured, return current state without modifying anything
  const existingConfig = getDatabricksConfig();
  if (existingConfig) {
    console.log('[AutoDetect] Already configured, returning existing config');
    return { 
      success: true, 
      host: existingConfig.host, 
      hasToken: true,
      inDatabricksApp,
      source: existingConfig.source as 'oauth' | 'obo' | 'sdk' | 'env' | 'manual',
    };
  }

  // Try to get auth context from backend
  try {
    console.log('[AutoDetect] Fetching /api/auth/context...');
    const response = await fetch('/api/auth/context', {
      credentials: 'include',
    });
    
    console.log('[AutoDetect] Response status:', response.status, response.ok);
    
    if (response.ok) {
      const data: AuthContextResponse = await response.json();
      console.log('[AutoDetect] Auth context data:', data);
      
      // If we have a host and token from any method, set up auto-config
      if (data.host && data.has_token) {
        const source = data.auth_method;
        setDatabricksConfig({
          host: data.host,
          token: `__${source.toUpperCase()}_TOKEN__`, // Marker - backend handles auth
          isAutoDetected: true,
          source: source,
        });
        return { 
          success: true, 
          host: data.host, 
          hasToken: true,
          inDatabricksApp: data.is_databricks_app,
          user: data.user,
          source: source,
          oauth: data.oauth,
        };
      }
      
      // Have host but no token - check if OAuth is available
      if (data.host && !data.has_token) {
        return { 
          success: false, 
          host: data.host, 
          hasToken: false,
          inDatabricksApp: data.is_databricks_app,
          user: data.user,
          source: null,
          oauth: data.oauth,
          error: data.oauth?.configured 
            ? 'Not authenticated. Click "Login with Databricks" to authenticate.'
            : data.is_databricks_app 
              ? 'On-behalf-of-user authentication is not enabled. Please configure manual credentials or enable OBO auth for this app.'
              : 'Token not found. Configure credentials manually or set DATABRICKS_TOKEN environment variable.',
        };
      }
      
      // No host - return OAuth info
      return {
        success: false,
        host: null,
        hasToken: false,
        inDatabricksApp: data.is_databricks_app,
        oauth: data.oauth,
        error: 'No Databricks host configured.',
      };
    }
  } catch {
    // Backend not available
  }

  // Fallback for Databricks App without backend
  if (inDatabricksApp) {
    return { 
      success: false, 
      host: getWorkspaceHost(), 
      hasToken: false,
      inDatabricksApp: true,
      error: 'Could not connect to backend. Please ensure the app is running correctly.',
    };
  }

  // Not in Databricks App and no env vars
  return { 
    success: false, 
    host: null, 
    hasToken: false,
    inDatabricksApp: false,
    error: 'Configure Databricks credentials manually.',
  };
}

class DatabricksApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public errorCode?: string
  ) {
    super(message);
    this.name = 'DatabricksApiError';
  }
}

/**
 * Make an authenticated request to the Databricks API via backend proxy.
 * This avoids CORS issues by routing all requests through our Flask backend.
 * 
 * Authentication is handled by the backend:
 * - If running as Databricks App: uses X-Forwarded-Access-Token header
 * - If DATABRICKS_TOKEN env var is set: uses that
 * - Otherwise: uses the token from manual configuration (sent in Authorization header)
 */
export async function fetchDatabricks<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const cfg = getDatabricksConfig();
  if (!cfg) {
    throw new DatabricksApiError('Databricks not configured. Please set host and token.');
  }

  // Use the backend proxy to avoid CORS issues
  // The proxy endpoint is: /api/databricks/api/2.1/...
  const proxyUrl = `/api/databricks/api/2.1${endpoint}`;
  
  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Databricks-Host': cfg.host,
  };
  
  // Only send Authorization header for manual tokens
  // For auto-detected tokens (OBO or env), the backend handles authentication
  const isManualToken = cfg.token && !cfg.token.startsWith('__') && cfg.source === 'manual';
  if (isManualToken) {
    headers['Authorization'] = `Bearer ${cfg.token}`;
    console.log(`[fetchDatabricks] Using manual token for ${endpoint}`);
  } else {
    console.log(`[fetchDatabricks] Using auto auth (${cfg.source}) for ${endpoint}`);
  }
  
  const response = await fetch(proxyUrl, {
    ...options,
    credentials: 'include', // Include cookies for session handling
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.statusText}`;
    let errorCode: string | undefined;
    
    try {
      const errorBody = await response.json();
      errorMessage = errorBody.message || errorBody.error || errorMessage;
      errorCode = errorBody.error_code;
    } catch {
      // Couldn't parse error body
    }
    
    throw new DatabricksApiError(errorMessage, response.status, errorCode);
  }

  return response.json();
}

// ============================================================================
// Unity Catalog APIs
// ============================================================================

export interface Catalog {
  name: string;
  comment?: string;
  owner?: string;
}

export interface Schema {
  name: string;
  catalog_name: string;
  full_name: string;
  comment?: string;
  owner?: string;
}

export interface Table {
  name: string;
  catalog_name: string;
  schema_name: string;
  full_name: string;
  table_type?: string;
  comment?: string;
}

export interface TableColumn {
  name: string;
  type_name?: string;
  type_text?: string;
  comment?: string;
  nullable?: boolean;
}

export interface UCFunction {
  name: string;
  catalog_name: string;
  schema_name: string;
  full_name: string;
  comment?: string;
  input_params?: { parameters?: Array<{ name: string; type_name?: string }> };
}

export interface Volume {
  name: string;
  catalog_name: string;
  schema_name: string;
  full_name: string;
  volume_type?: string;
  comment?: string;
}

export interface RegisteredModel {
  name: string;
  full_name: string;
  catalog_name?: string;
  schema_name?: string;
  comment?: string;
}

// ============================================================================
// MLflow Prompts
// ============================================================================

export interface MLflowPrompt {
  name: string;
  full_name: string;
  description?: string;
  aliases?: string[];
  tags?: Record<string, string>;
  latest_version?: string;
  owner?: string;
}

export interface PromptVersion {
  version: string;
  description?: string;
  tags?: Record<string, string>;
  creation_timestamp?: number;
  aliases?: string[];
}

export interface PromptDetails {
  name: string;
  full_name: string;
  description?: string;
  versions: PromptVersion[];
  aliases: string[];
  tags: Record<string, string>;
  latest_version?: string;
  template?: string;
}

// ============================================================================
// Serving & Compute APIs
// ============================================================================

export interface ServingEndpoint {
  name: string;
  state?: { ready?: string; config_update?: string };
  creator?: string;
}

export interface SQLWarehouse {
  id: string;
  name: string;
  state?: string;
  cluster_size?: string;
  num_clusters?: number;
}

// ============================================================================
// Genie & Vector Search APIs
// ============================================================================

export interface GenieSpace {
  space_id: string;
  title: string;
  description?: string;
  owner?: string;
}

export interface LakebaseDatabase {
  name: string;
  state?: string;
  creator?: string;
  owner?: string;
  read_write_dns?: string;
}

export interface UCConnection {
  name: string;
  connection_type?: string;
  owner?: string;
  comment?: string;
  full_name?: string;
}

export interface VectorSearchEndpoint {
  name: string;
  endpoint_type?: string;
  endpoint_status?: { state?: string };
}

export interface VectorSearchIndex {
  name: string;
  endpoint_name: string;
  index_type?: string;
  primary_key?: string;
  status?: string;
  delta_sync_index_spec?: {
    source_table?: string;
    pipeline_type?: string;
    embedding_source_columns?: Array<{
      name: string;
      embedding_model_endpoint_name?: string;
    }>;
    columns_to_sync?: string[];
  };
  direct_access_index_spec?: {
    embedding_source_columns?: Array<{
      name: string;
      embedding_model_endpoint_name?: string;
    }>;
    schema_json?: string;
  };
}

// ============================================================================
// MLflow Prompts APIs
// ============================================================================

export interface MLflowPrompt {
  name: string;
  full_name: string;
  description?: string;
  aliases?: string[];
  tags?: Record<string, string>;
  latest_version?: string;
  owner?: string;
}

// ============================================================================
// Connection Status
// ============================================================================

export interface ConnectionStatus {
  connected: boolean;
  user?: string;
  display_name?: string;
  host?: string;
  error?: string;
  isAutoDetected?: boolean;
  source?: 'oauth' | 'obo' | 'sdk' | 'header' | 'env' | 'manual';
}

// ============================================================================
// API Methods
// ============================================================================

export const databricksNativeApi = {
  /**
   * Get connection status by fetching current user.
   */
  async getConnectionStatus(): Promise<ConnectionStatus> {
    const cfg = getDatabricksConfig();
    console.log('[getConnectionStatus] Current config:', cfg);
    if (!cfg) {
      console.log('[getConnectionStatus] No config found, returning not connected');
      return { connected: false, error: 'Not configured' };
    }

    try {
      // Use /api/auth/verify which handles both manual tokens and OBO auth
      console.log('[getConnectionStatus] Fetching /api/auth/verify...');
      
      // Build headers for the verify request
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Databricks-Host': cfg.host,
      };
      
      // Send Authorization header for manual tokens (real tokens, not placeholders)
      const isManualToken = cfg.token && !cfg.token.startsWith('__') && cfg.source === 'manual';
      if (isManualToken) {
        console.log('[getConnectionStatus] Using manual token for verification');
        headers['Authorization'] = `Bearer ${cfg.token}`;
      } else {
        console.log('[getConnectionStatus] Using auto-detected auth (no Authorization header)');
      }
      
      const response = await fetch('/api/auth/verify', {
        credentials: 'include',
        headers,
      });
      
      const data = await response.json();
      console.log('[getConnectionStatus] Verify response:', data);
      
      if (data.authenticated && data.user) {
        return {
          connected: true,
          user: data.user.userName,
          display_name: data.user.displayName,
          host: data.host || cfg.host,
          isAutoDetected: cfg.isAutoDetected,
          source: data.token_source || cfg.source,
        };
      } else {
        return {
          connected: false,
          error: data.error || data.message || 'Authentication failed',
        };
      }
    } catch (err) {
      console.error('[getConnectionStatus] Error:', err);
      return {
        connected: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },

  /**
   * List all accessible catalogs.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listCatalogs(): Promise<Catalog[]> {
    // Use the /api/uc/ endpoint which uses WorkspaceClient
    const response = await fetch('/api/uc/catalogs', { credentials: 'include' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new DatabricksApiError(error.error || 'Failed to list catalogs');
    }
    const data = await response.json();
    return data.catalogs || [];
  },

  /**
   * List all schemas in a catalog.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listSchemas(catalogName: string): Promise<Schema[]> {
    const response = await fetch(`/api/uc/schemas?catalog=${encodeURIComponent(catalogName)}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new DatabricksApiError(error.error || 'Failed to list schemas');
    }
    const data = await response.json();
    return data.schemas || [];
  },

  /**
   * List all tables in a schema.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listTables(catalogName: string, schemaName: string): Promise<Table[]> {
    const response = await fetch(
      `/api/uc/tables?catalog=${encodeURIComponent(catalogName)}&schema=${encodeURIComponent(schemaName)}`,
      { credentials: 'include' }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new DatabricksApiError(error.error || 'Failed to list tables');
    }
    const data = await response.json();
    return data.tables || [];
  },

  /**
   * Get columns for a specific table.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async getTableColumns(catalogName: string, schemaName: string, tableName: string): Promise<TableColumn[]> {
    const response = await fetch(
      `/api/uc/table-columns?catalog=${encodeURIComponent(catalogName)}&schema=${encodeURIComponent(schemaName)}&table=${encodeURIComponent(tableName)}`,
      { credentials: 'include' }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new DatabricksApiError(error.error || 'Failed to get table columns');
    }
    const data = await response.json();
    return data.columns || [];
  },

  /**
   * List all functions in a schema.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listFunctions(catalogName: string, schemaName: string): Promise<UCFunction[]> {
    const response = await fetch(
      `/api/uc/functions?catalog=${encodeURIComponent(catalogName)}&schema=${encodeURIComponent(schemaName)}`,
      { credentials: 'include' }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new DatabricksApiError(error.error || 'Failed to list functions');
    }
    const data = await response.json();
    return data.functions || [];
  },

  /**
   * List all volumes in a schema.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listVolumes(catalogName: string, schemaName: string): Promise<Volume[]> {
    const response = await fetch(
      `/api/uc/volumes?catalog=${encodeURIComponent(catalogName)}&schema=${encodeURIComponent(schemaName)}`,
      { credentials: 'include' }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new DatabricksApiError(error.error || 'Failed to list volumes');
    }
    const data = await response.json();
    return data.volumes || [];
  },

  /**
   * List all Lakebase/PostgreSQL databases.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listDatabases(): Promise<LakebaseDatabase[]> {
    try {
      const response = await fetch('/api/uc/databases', { credentials: 'include' });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        console.error('[listDatabases] Error:', error);
        return [];
      }
      const data = await response.json();
      return data.databases || [];
    } catch (err) {
      console.error('[listDatabases] Error:', err);
      return [];
    }
  },

  /**
   * List all model serving endpoints.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listServingEndpoints(): Promise<ServingEndpoint[]> {
    try {
      const response = await fetch('/api/uc/serving-endpoints', { credentials: 'include' });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new DatabricksApiError(error.error || 'Failed to list serving endpoints');
      }
      const data = await response.json();
      return data.endpoints || [];
    } catch (err) {
      console.error('[listServingEndpoints] Error:', err);
      return [];
    }
  },

  /**
   * List all SQL warehouses.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listSQLWarehouses(): Promise<SQLWarehouse[]> {
    try {
      const response = await fetch('/api/uc/sql-warehouses', { credentials: 'include' });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new DatabricksApiError(error.error || 'Failed to list SQL warehouses');
      }
      const data = await response.json();
      return data.warehouses || [];
    } catch (err) {
      console.error('[listSQLWarehouses] Error:', err);
      return [];
    }
  },

  /**
   * List all Genie spaces.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listGenieSpaces(): Promise<GenieSpace[]> {
    try {
      const response = await fetch('/api/uc/genie-spaces', { credentials: 'include' });
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      // Map the response to match the GenieSpace interface
      return (data.spaces || []).map((s: { id?: string; space_id?: string; name?: string; title?: string; description?: string; owner?: string }) => ({
        space_id: s.id || s.space_id || '',
        title: s.name || s.title || '',
        description: s.description,
        owner: s.owner,
      }));
    } catch {
      return [];
    }
  },

  /**
   * List all vector search endpoints.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listVectorSearchEndpoints(): Promise<VectorSearchEndpoint[]> {
    try {
      const response = await fetch('/api/uc/vector-search-endpoints', { credentials: 'include' });
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.endpoints || [];
    } catch {
      return [];
    }
  },

  /**
   * List all vector search indexes for an endpoint.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listVectorSearchIndexes(endpointName: string): Promise<VectorSearchIndex[]> {
    try {
      const response = await fetch(
        `/api/uc/vector-search-indexes?endpoint=${encodeURIComponent(endpointName)}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.vector_indexes || [];
    } catch {
      return [];
    }
  },

  /**
   * List all Unity Catalog connections.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listUCConnections(): Promise<UCConnection[]> {
    try {
      const response = await fetch('/api/uc/connections', { credentials: 'include' });
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.connections || [];
    } catch {
      return [];
    }
  },

  /**
   * List all registered models.
   * Uses WorkspaceClient with default auth (not OBO scopes).
   */
  async listRegisteredModels(): Promise<RegisteredModel[]> {
    try {
      const response = await fetch('/api/uc/registered-models', { credentials: 'include' });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new DatabricksApiError(error.error || 'Failed to list registered models');
      }
      const data = await response.json();
      return data.models || [];
    } catch (err) {
      console.error('[listRegisteredModels] Error:', err);
      return [];
    }
  },

  /**
   * List all MLflow prompts in a catalog.schema.
   * Uses MLflow SDK to search for prompts.
   */
  async listPrompts(catalogName: string, schemaName: string): Promise<MLflowPrompt[]> {
    try {
      const response = await fetch(
        `/api/uc/prompts?catalog=${encodeURIComponent(catalogName)}&schema=${encodeURIComponent(schemaName)}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        console.error('[listPrompts] Error:', error);
        return [];
      }
      const data = await response.json();
      return data.prompts || [];
    } catch (err) {
      console.error('[listPrompts] Error:', err);
      return [];
    }
  },

  /**
   * Get detailed information about a specific prompt including versions, aliases, and template.
   */
  async getPromptDetails(fullName: string): Promise<PromptDetails | null> {
    try {
      const response = await fetch(
        `/api/uc/prompt-details?name=${encodeURIComponent(fullName)}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        console.error('[getPromptDetails] Error:', error);
        return null;
      }
      return await response.json();
    } catch (err) {
      console.error('[getPromptDetails] Error:', err);
      return null;
    }
  },

  /**
   * Get the template content for a specific prompt version or alias.
   */
  async getPromptTemplate(fullName: string, version?: string, alias?: string): Promise<{ template: string; version: string } | null> {
    try {
      let url = `/api/uc/prompt-template?name=${encodeURIComponent(fullName)}`;
      if (version) {
        url += `&version=${encodeURIComponent(version)}`;
      } else if (alias) {
        url += `&alias=${encodeURIComponent(alias)}`;
      }
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        console.error('[getPromptTemplate] Error:', error);
        return null;
      }
      return await response.json();
    } catch (err) {
      console.error('[getPromptTemplate] Error:', err);
      return null;
    }
  },
};

export default databricksNativeApi;
