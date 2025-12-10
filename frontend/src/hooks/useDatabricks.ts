/**
 * React hooks for Databricks API integration.
 * 
 * All Databricks API calls are made directly from the browser.
 * 
 * When running as a Databricks App:
 * - Host is detected from window.location.origin
 * - Token is obtained from X-Forwarded-Access-Token header (via /api/auth/token)
 * 
 * When running locally:
 * - User must configure credentials manually
 * 
 * Reference: https://apps-cookbook.dev/docs/streamlit/authentication/users_obo
 */
import { useState, useEffect, useCallback, useSyncExternalStore, useRef } from 'react';
import {
  databricksNativeApi,
  isDatabricksConfigured,
  tryAutoDetectConfig,
  isRunningInDatabricksApp,
  setConfigChangeCallback,
  ConnectionStatus,
  Catalog,
  Schema,
  Table,
  TableColumn,
  UCFunction,
  Volume,
  ServingEndpoint,
  SQLWarehouse,
  GenieSpace,
  UCConnection,
  VectorSearchEndpoint,
  VectorSearchIndex,
  RegisteredModel,
  LakebaseDatabase,
  MLflowPrompt,
  PromptDetails,
} from '../services/databricksNativeApi';

// Track config changes for reactive updates
let configVersion = 0;
const configListeners = new Set<() => void>();

function notifyConfigChange() {
  configVersion++;
  console.log('[Hooks] Config change notified, new version:', configVersion, 'listeners:', configListeners.size);
  configListeners.forEach(listener => listener());
}

// Connect the callback
console.log('[Hooks] Registering config change callback');
setConfigChangeCallback(notifyConfigChange);

function subscribeToConfig(callback: () => void) {
  configListeners.add(callback);
  return () => configListeners.delete(callback);
}

function getConfigSnapshot() {
  return configVersion;
}

/**
 * Hook to reactively track Databricks configuration changes.
 */
export function useConfigVersion() {
  return useSyncExternalStore(subscribeToConfig, getConfigSnapshot);
}

interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function useAsync<T>(
  fetchFn: () => Promise<T>,
  deps: unknown[] = [],
  additionalSkip: boolean = false
): UseAsyncState<T> {
  // Subscribe to config changes to trigger re-fetches
  const configVer = useConfigVersion();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Serialize deps for stable comparison (handles objects/arrays)
  // This prevents infinite loops when object deps have same content but different reference
  const depsKey = JSON.stringify(deps);
  
  // Track if we're currently fetching to prevent duplicate fetches
  const fetchingRef = useRef(false);

  const fetch = useCallback(async () => {
    // Prevent duplicate concurrent fetches
    if (fetchingRef.current) {
      return;
    }
    
    // Always check isDatabricksConfigured() fresh - don't rely on captured values
    const isConfigured = isDatabricksConfigured();
    if (additionalSkip || !isConfigured) {
      setLoading(false);
      setData(null);
      return;
    }
    
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      console.error('[useAsync] Fetch error:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [additionalSkip, configVer, depsKey]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

/**
 * Hook to try auto-detecting Databricks configuration.
 * 
 * When running as a Databricks App:
 * - Gets host from window.location.origin
 * - Gets token from X-Forwarded-Access-Token header via backend
 * - OAuth info for authentication options
 */
export function useAutoDetectConfig() {
  const [detecting, setDetecting] = useState(true);
  const [detected, setDetected] = useState(false);
  const [autoDetectedHost, setAutoDetectedHost] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [inDatabricksApp, setInDatabricksApp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthInfo, setOauthInfo] = useState<{ configured: boolean; authenticated: boolean; scopes: string[] } | undefined>(undefined);
  const [detectCount, setDetectCount] = useState(0);

  // Function to manually trigger re-detection
  const redetect = useCallback(() => {
    setDetectCount(c => c + 1);
  }, []);

  useEffect(() => {
    const detect = async () => {
      console.log('[useAutoDetectConfig] Starting detection...');
      setDetecting(true);
      const result = await tryAutoDetectConfig();
      console.log('[useAutoDetectConfig] Detection result:', result);
      setDetected(result.success);
      setAutoDetectedHost(result.host);
      setHasToken(result.hasToken);
      setInDatabricksApp(result.inDatabricksApp);
      setError(result.error || null);
      setOauthInfo(result.oauth);
      setDetecting(false);
    };
    detect();
  }, [detectCount]); // Only re-run when explicitly triggered

  return { 
    detecting, 
    detected, 
    autoDetectedHost,
    hasToken,
    inDatabricksApp,
    error,
    oauthInfo,
    redetect,
  };
}

/**
 * Hook to get Databricks connection status.
 */
export function useConnectionStatus(): UseAsyncState<ConnectionStatus> & { 
  configured: boolean;
} {
  // Use config version to make `configured` reactive
  const configVer = useConfigVersion();
  const configured = isDatabricksConfigured();
  console.log('[useConnectionStatus] configured:', configured, 'configVer:', configVer);
  const result = useAsync(
    async () => {
      console.log('[useConnectionStatus] Calling getConnectionStatus...');
      const status = await databricksNativeApi.getConnectionStatus();
      console.log('[useConnectionStatus] Got status:', status);
      return status;
    },
    [configured, configVer],
    false
  );
  console.log('[useConnectionStatus] Returning:', { ...result, configured });
  return { ...result, configured };
}

/**
 * Hook to list all catalogs.
 */
export function useCatalogs(): UseAsyncState<Catalog[]> {
  return useAsync(
    () => databricksNativeApi.listCatalogs(),
    []
  );
}

/**
 * Hook to list schemas in a catalog.
 */
export function useSchemas(catalog: string | null): UseAsyncState<Schema[]> {
  return useAsync(
    async () => {
      if (!catalog) return [];
      return databricksNativeApi.listSchemas(catalog);
    },
    [catalog],
    !catalog // Only skip if no catalog provided
  );
}

/**
 * Hook to list tables in a schema.
 */
export function useTables(catalog: string | null, schema: string | null): UseAsyncState<Table[]> {
  return useAsync(
    async () => {
      if (!catalog || !schema) return [];
      return databricksNativeApi.listTables(catalog, schema);
    },
    [catalog, schema],
    !catalog || !schema
  );
}

/**
 * Hook to get columns for a specific table.
 */
export function useTableColumns(
  catalog: string | null,
  schema: string | null,
  table: string | null
): UseAsyncState<TableColumn[]> {
  return useAsync(
    async () => {
      if (!catalog || !schema || !table) return [];
      return databricksNativeApi.getTableColumns(catalog, schema, table);
    },
    [catalog, schema, table],
    !catalog || !schema || !table
  );
}

/**
 * Hook to list functions in a schema.
 */
export function useFunctions(catalog: string | null, schema: string | null): UseAsyncState<UCFunction[]> {
  return useAsync(
    async () => {
      if (!catalog || !schema) return [];
      return databricksNativeApi.listFunctions(catalog, schema);
    },
    [catalog, schema],
    !catalog || !schema
  );
}

/**
 * Hook to list volumes in a schema.
 */
export function useVolumes(catalog: string | null, schema: string | null): UseAsyncState<Volume[]> {
  return useAsync(
    async () => {
      if (!catalog || !schema) return [];
      return databricksNativeApi.listVolumes(catalog, schema);
    },
    [catalog, schema],
    !catalog || !schema
  );
}

/**
 * Hook to list serving endpoints.
 */
export function useServingEndpoints(): UseAsyncState<ServingEndpoint[]> {
  return useAsync(
    () => databricksNativeApi.listServingEndpoints(),
    []
  );
}

/**
 * Hook to list Lakebase databases.
 */
export function useDatabases(): UseAsyncState<LakebaseDatabase[]> {
  return useAsync(
    () => databricksNativeApi.listDatabases(),
    []
  );
}

/**
 * Hook to list SQL warehouses.
 */
export function useSQLWarehouses(): UseAsyncState<SQLWarehouse[]> {
  return useAsync(
    () => databricksNativeApi.listSQLWarehouses(),
    []
  );
}

/**
 * Hook to list Genie spaces.
 */
export function useGenieSpaces(): UseAsyncState<GenieSpace[]> {
  return useAsync(
    () => databricksNativeApi.listGenieSpaces(),
    []
  );
}

/**
 * Hook to list Unity Catalog connections.
 */
export function useUCConnections(): UseAsyncState<UCConnection[]> {
  return useAsync(
    () => databricksNativeApi.listUCConnections(),
    []
  );
}

/**
 * Hook to list vector search endpoints.
 */
export function useVectorSearchEndpoints(): UseAsyncState<VectorSearchEndpoint[]> {
  return useAsync(
    () => databricksNativeApi.listVectorSearchEndpoints(),
    []
  );
}

/**
 * Hook to list vector search indexes.
 * If endpoint is null, returns all indexes.
 * If endpoint is provided, returns only indexes for that endpoint.
 */
export function useVectorSearchIndexes(endpoint: string | null): UseAsyncState<VectorSearchIndex[]> {
  return useAsync(
    async () => {
      return databricksNativeApi.listVectorSearchIndexes(endpoint);
    },
    [endpoint]
  );
}

/**
 * Hook to list ALL vector search indexes (across all endpoints).
 */
export function useAllVectorSearchIndexes(): UseAsyncState<VectorSearchIndex[]> {
  return useAsync(
    async () => {
      return databricksNativeApi.listVectorSearchIndexes(null);
    },
    []
  );
}

/**
 * Hook to list registered models.
 */
export function useRegisteredModels(): UseAsyncState<RegisteredModel[]> {
  return useAsync(
    () => databricksNativeApi.listRegisteredModels(),
    []
  );
}

/**
 * Combined hook for catalog/schema selection pattern.
 */
export function useCatalogSchemaSelector() {
  const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);

  const catalogs = useCatalogs();
  const schemas = useSchemas(selectedCatalog);

  // Reset schema when catalog changes
  useEffect(() => {
    setSelectedSchema(null);
  }, [selectedCatalog]);

  return {
    catalogs: catalogs.data || [],
    schemas: schemas.data || [],
    selectedCatalog,
    selectedSchema,
    setSelectedCatalog,
    setSelectedSchema,
    loading: catalogs.loading || schemas.loading,
    error: catalogs.error || schemas.error,
  };
}

/**
 * Hook to list MLflow prompts in a catalog/schema.
 * 
 * @param catalog - The catalog name
 * @param schema - The schema name
 * @param servicePrincipal - Optional service principal config for authentication
 */
export function usePrompts(
  catalog: string | null, 
  schema: string | null,
  servicePrincipal?: { client_id: unknown; client_secret: unknown } | null
): UseAsyncState<MLflowPrompt[]> {
  return useAsync(
    async () => {
      if (!catalog || !schema) return [];
      return databricksNativeApi.listPrompts(catalog, schema, servicePrincipal);
    },
    [catalog, schema, servicePrincipal],
    !catalog || !schema
  );
}

/**
 * Hook to get prompt details (versions, aliases, template).
 * 
 * @param fullName - The full prompt name (catalog.schema.name)
 * @param servicePrincipal - Optional service principal config for authentication
 */
export function usePromptDetails(
  fullName: string | null,
  servicePrincipal?: { client_id: unknown; client_secret: unknown } | null
): UseAsyncState<PromptDetails | null> {
  return useAsync(
    async () => {
      if (!fullName) return null;
      return databricksNativeApi.getPromptDetails(fullName, servicePrincipal);
    },
    [fullName, servicePrincipal],
    !fullName
  );
}

// Re-export for convenience
export { isRunningInDatabricksApp };

// Re-export types
export type {
  ConnectionStatus,
  Catalog,
  Schema,
  Table,
  UCFunction,
  Volume,
  ServingEndpoint,
  SQLWarehouse,
  GenieSpace,
  VectorSearchEndpoint,
  VectorSearchIndex,
  RegisteredModel,
  LakebaseDatabase,
  MLflowPrompt,
  PromptDetails,
};
