// Core types based on dao-ai schema
export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARNING" | "ERROR";

// Variable types for dao-ai configuration
export type VariableType = "primitive" | "env" | "secret" | "composite";

export interface PrimitiveVariableModel {
  type: "primitive";
  value: string | number | boolean;
}

export interface EnvironmentVariableModel {
  type: "env";
  env: string;
  default_value?: string | number | boolean;
}

export interface SecretVariableModel {
  type: "secret";
  scope: string;
  secret: string;
  default_value?: string | number | boolean;
}

export interface CompositeVariableModel {
  type: "composite";
  options: (EnvironmentVariableModel | SecretVariableModel | PrimitiveVariableModel)[];
  default_value?: string | number | boolean;
}

export type VariableModel =
  | PrimitiveVariableModel
  | EnvironmentVariableModel
  | SecretVariableModel
  | CompositeVariableModel;

// Variable value type - can be a VariableModel or primitive value
export type VariableValue = VariableModel | string | number | boolean;

export interface ServicePrincipalModel {
  client_id: VariableValue;
  client_secret: VariableValue;
}

export interface SchemaModel {
  catalog_name: VariableValue;
  schema_name: VariableValue;
  permissions?: PermissionModel[];
}

// dao-ai 0.1.72+: opt-in best-of-N + LLM-as-judge wrapper for an InferenceEndpointModel.
// Fans out N parallel generations at elevated temperature, then asks the
// judge model to pick the winner. Effective generator temperature is
// max(InferenceEndpointModel.temperature, 0.7) unless `temperature_override` is set.
export interface BestOfNConfig {
  /** Number of parallel candidate generations. 1..16. Default 8. */
  n?: number;
  /** Judge model: a serving endpoint name (string) or a full InferenceEndpointModel. */
  judge: string | InferenceEndpointModel;
  /** Override the generator temperature for candidate calls. */
  temperature_override?: number | null;
}

/**
 * Configuration for a Databricks Model Serving endpoint used for inference.
 *
 * The same shape is reused everywhere dao-ai calls a serving endpoint —
 * chat LLMs, embedding models, judge / extraction / reflection / query
 * models, and custom agent endpoints. Renamed from `LLMModel` in
 * dao-ai 0.1.75 to reflect the broader scope; the legacy name remains
 * exported as a type alias for backward compatibility.
 */
export interface InferenceEndpointModel {
  name: string;
  description?: string;
  temperature?: number;
  max_tokens?: number;
  on_behalf_of_user?: boolean;
  use_responses_api?: boolean;  // Use Responses API for ResponsesAgent endpoints
  /** Required when the Foundation Model endpoint has output guardrails enabled */
  disable_streaming?: boolean;
  /**
   * dao-ai 0.1.77+: route through the Databricks AI Gateway
   * (`/ai-gateway/mlflow/v1/chat/completions`) instead of
   * `/serving-endpoints/<name>/invocations`. When true, `name` is sent
   * as the OpenAI-style model id in the request body. AI Gateway is
   * OpenAI-compatible chat completions only — not for embeddings,
   * Responses API, or non-chat endpoints. Incompatible with
   * `use_responses_api`.
   */
  ai_gateway?: boolean;
  fallbacks?: (string | InferenceEndpointModel)[];
  /** dao-ai 0.1.72+: best-of-N + LLM-as-judge wrapper. */
  best_of_n?: BestOfNConfig;
  // Authentication fields
  service_principal?: ServicePrincipalModel | string;
  client_id?: VariableValue;
  client_secret?: VariableValue;
  workspace_host?: VariableValue;
  pat?: VariableValue;
}

/**
 * Backward-compatible alias. Customer code importing `LLMModel` keeps
 * working — both names point at the same shape. Will be removed in a
 * future major release.
 */
export type LLMModel = InferenceEndpointModel;

// VectorStoreModel supports two configuration modes:
// 1. Use Existing Index: Provide only 'index' to reference a pre-built vector search index
// 2. Provision New Index: Provide 'source_table' and 'embedding_source_column' to create a new index
export interface VectorStoreModel {
  on_behalf_of_user?: boolean;
  // Required for use_existing mode, optional (auto-generated) for provision mode
  index?: IndexModel;
  // Required for provision mode only
  source_table?: TableModel;
  embedding_source_column?: string;  // Required for provision mode, omitted for use_existing
  embedding_model?: InferenceEndpointModel;        // Optional, defaults to databricks-gte-large-en for provision mode
  endpoint?: VectorSearchEndpoint;   // Optional, auto-discovered for provision mode
  // Optional for both modes
  source_path?: VolumePathModel;
  checkpoint_path?: VolumePathModel;
  primary_key?: string;
  columns?: string[];
  doc_uri?: string;
  // Authentication fields
  service_principal?: ServicePrincipalModel | string;
  client_id?: VariableValue;
  client_secret?: VariableValue;
  workspace_host?: VariableValue;
  pat?: VariableValue;
}

export interface IndexModel {
  on_behalf_of_user?: boolean;
  schema?: SchemaModel;
  name: string;
}

export interface VectorSearchEndpoint {
  name: string;
  type?: "STANDARD" | "OPTIMIZED_STORAGE";
}

export interface TableModel {
  on_behalf_of_user?: boolean;
  schema?: SchemaModel;
  name?: string;
  // Authentication fields
  service_principal?: ServicePrincipalModel | string;
  client_id?: VariableValue;
  client_secret?: VariableValue;
  workspace_host?: VariableValue;
  pat?: VariableValue;
}

export interface VolumePathModel {
  volume?: VolumeModel;
  path?: string;
}

export interface VolumeModel {
  on_behalf_of_user?: boolean;
  schema?: SchemaModel;
  name: string;
}

export interface GenieRoomModel {
  on_behalf_of_user?: boolean;
  name?: string;  // Optional - auto-populated from GenieSpace.title if not provided
  description?: string;
  space_id?: VariableValue;  // Optional - can configure by name only. Can be string or variable reference (env, secret, etc.)
  warehouse?: WarehouseModel | string;  // SQL warehouse the Genie space queries; required for provisioning
  // Provisioning + advanced Genie metric-view fields (new in dao-ai 0.1.70).
  // The UI only edits the simple ones; the rest are preserved on round-trip.
  parent_path?: VariableValue;  // Workspace folder path used when provisioning a new space
  sample_questions?: string[];  // Suggested sample questions surfaced in the Genie UI
  text_instructions?: string[];  // Free-form instructions Genie always considers
  table_sources?: GenieTableSource[];
  function_sources?: GenieSqlFunctionSource[];
  metric_view_sources?: GenieMetricViewSource[];
  join_specs?: GenieJoinSpec[];
  example_sqls?: GenieExampleSql[];
  sql_filters?: GenieSqlSnippet[];
  sql_measures?: GenieSqlSnippet[];
  sql_expressions?: GenieSqlSnippet[];
  benchmarks?: GenieBenchmarkQuestion[];
  entitlements?: GenieEntitlement[];
  // Authentication fields
  service_principal?: ServicePrincipalModel | string;
  client_id?: VariableValue;
  client_secret?: VariableValue;
  workspace_host?: VariableValue;
  pat?: VariableValue;
}

// New in dao-ai 0.1.70: rich Genie space configuration. Most users only set
// the simple fields above; these advanced types exist so a YAML imported
// from a hand-edited config round-trips cleanly without dropping fields.
export type GenieRelationshipType = 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
export type GenieEntitlementLevel = 'CAN_RUN' | 'CAN_VIEW' | 'CAN_EDIT' | 'CAN_MANAGE';

export interface GenieColumnConfig {
  name?: string;
  description?: string;
  synonyms?: string[];
  excluded?: boolean;
  sample_values?: string[];
  build_value_dictionary?: boolean;
}

export interface GenieTableSource {
  table: string;
  description?: string;
  pii?: boolean;
  primary_key?: string[];
  columns?: GenieColumnConfig[];
}

export interface GenieSqlParameter {
  name: string;
  type?: string;
  description?: string;
  default?: any;
}

export interface GenieSqlFunctionSource {
  name: string;
  sql?: string;
  description?: string;
  parameters?: GenieSqlParameter[];
  returns?: string;
}

export interface GenieMetricViewSource {
  table: string;
  description?: string;
}

export interface GenieJoinSpec {
  left: string;
  left_alias?: string;
  right: string;
  right_alias?: string;
  sql?: string;
  comment?: string;
  type?: GenieRelationshipType;
}

export interface GenieExampleSql {
  question: string;
  sql: string;
  parameters?: GenieSqlParameter[];
  usage_guidance?: string;
}

export interface GenieSqlSnippet {
  name: string;
  sql: string;
  description?: string;
}

export interface GenieBenchmarkQuestion {
  question: string;
  expected_sql?: string;
}

export interface GenieEntitlement {
  principals: string[];
  permission_level: GenieEntitlementLevel;
}

// dao-ai 0.1.70+: top-level `parameters:` block declares load-time
// substitution inputs referenced via ${param.NAME} or ${var.NAME}.
// Schema is intentionally minimal — just description + optional default.
// A parameter with no default is required at load time.
export interface ParameterDeclarationModel {
  description?: string;
  default?: string | null;
}

export interface FunctionModel {
  on_behalf_of_user?: boolean;
  schema?: SchemaModel;
  name?: string;
}

export interface WarehouseModel {
  on_behalf_of_user?: boolean;
  name?: string;  // Optional - can configure by name only (resolved via warehouse API)
  description?: string;
  warehouse_id?: VariableValue;  // Optional - can configure by name only
  // Authentication fields
  service_principal?: ServicePrincipalModel | string;
  client_id?: VariableValue;
  client_secret?: VariableValue;
  workspace_host?: VariableValue;
  pat?: VariableValue;
}

// Genie Caching Models
export interface GenieLRUCacheParametersModel {
  capacity?: number;  // Default: 1000
  time_to_live_seconds?: number | null;  // Default: 86400 (1 day), null = never expires
  warehouse: WarehouseModel | string;  // Can be inline or reference
}

export interface GenieContextAwareCacheParametersModel {
  time_to_live_seconds?: number | null;  // Default: 86400 (1 day), null = never expires
  similarity_threshold?: number;  // Default: 0.85 - Minimum similarity for question matching
  context_similarity_threshold?: number;  // Default: 0.80 - Minimum similarity for context matching
  question_weight?: number | null;  // Default: 0.6 - Weight for question similarity (0-1)
  context_weight?: number | null;  // Default: computed as 1 - question_weight
  embedding_model?: string | InferenceEndpointModel;  // Default: "databricks-gte-large-en"
  embedding_dims?: number | null;  // Auto-detected if null
  database: DatabaseModel | string;  // Can be inline or reference
  warehouse: WarehouseModel | string;  // Can be inline or reference
  table_name?: string;  // Default: "genie_context_aware_cache"
  context_window_size?: number;  // Default: 4 - Number of previous turns to include for context
  max_context_tokens?: number;  // Default: 2000 - Maximum context length to prevent extremely long embeddings
  /**
   * When true, cached SQL that returns an empty result set is invalidated
   * and the question is re-sent to Genie. New in dao-ai 0.1.55. Default: false.
   */
  invalidate_on_empty_result?: boolean;
  // Prompt history fields
  prompt_history_table?: string;  // Default: "genie_prompt_history"
  max_prompt_history_length?: number;  // Default: 50
  use_genie_api_for_history?: boolean;  // Default: false
  prompt_history_ttl_seconds?: number | null;  // Optional TTL for prompt history (null = use cache TTL)
  // IVFFlat index tuning for pg_vector similarity search
  ivfflat_lists?: number | null;  // Number of IVF lists (null = auto-computed as max(100, sqrt(row_count)))
  ivfflat_probes?: number | null;  // Number of lists to probe per query (null = auto-computed as max(10, sqrt(lists)))
  ivfflat_candidates?: number;  // Top-K candidates before Python-side reranking (default: 20)
}

// In-Memory Semantic Cache for Genie (no database required)
// New in dao-ai 0.1.21 - useful for single-instance deployments
export interface GenieInMemoryContextAwareCacheParametersModel {
  time_to_live_seconds?: number | null;  // Default: 604800 (1 week), null = never expires
  similarity_threshold?: number;  // Default: 0.85 - Minimum similarity for question matching
  context_similarity_threshold?: number;  // Default: 0.80 - Minimum similarity for context matching
  question_weight?: number | null;  // Default: 0.6 - Weight for question similarity (0-1)
  context_weight?: number | null;  // Default: computed as 1 - question_weight
  embedding_model?: string | InferenceEndpointModel;  // Default: "databricks-gte-large-en"
  embedding_dims?: number | null;  // Auto-detected if null
  warehouse: WarehouseModel | string;  // Can be inline or reference - required for re-executing cached SQL
  capacity?: number | null;  // Default: 10000 - Max cache entries with LRU eviction, null = unlimited
  context_window_size?: number;  // Default: 3 - Number of previous turns to include for context
  max_context_tokens?: number;  // Default: 2000 - Maximum context length to prevent extremely long embeddings
}

// Database connection type is inferred from fields:
// - project provided → Autoscaling Lakebase
// - instance_name provided → Provisioned Lakebase
// - host provided → PostgreSQL
// NOTE: type field removed in dao-ai 0.1.2, type is inferred from project/instance_name/host
export type DatabaseType = "postgres" | "lakebase";
export type LakebaseMode = "provisioned" | "autoscaling";

export interface DatabaseModel {
  on_behalf_of_user?: boolean;
  name?: string;  // Optional - auto-populated from project or instance_name for Lakebase
  // NOTE: _ui fields are for UI only, not included in YAML output
  _uiType?: DatabaseType;
  _uiLakebaseMode?: LakebaseMode;
  // --- Autoscaling Lakebase fields (mutually exclusive with instance_name) ---
  project?: string;  // Autoscaling Lakebase project name
  branch?: string;  // Autoscaling Lakebase branch (auto-resolved if omitted)
  autoscaling_min_cu?: number;  // Min compute units (default: 2)
  autoscaling_max_cu?: number;  // Max compute units (default: 4)
  // --- Provisioned Lakebase fields (mutually exclusive with project) ---
  instance_name?: string;  // Provisioned Lakebase instance name
  capacity?: "CU_1" | "CU_2";
  node_count?: number;  // Horizontal scaling node count
  // --- Common fields ---
  description?: string;
  host?: VariableValue;  // PostgreSQL hostname (can be variable or string)
  database?: VariableValue;  // Database name (default: "databricks_postgres")
  port?: VariableValue;  // Port number (default: 5432)
  connection_kwargs?: Record<string, any>;
  max_pool_size?: number;
  /**
   * Pool-level timeout: how long to wait for a free connection from the pool.
   * Defaults (dao-ai 0.1.55): 120s for autoscaling Lakebase, 30s otherwise.
   */
  timeout_seconds?: number | null;
  /**
   * TCP-level libpq connection timeout (new in dao-ai 0.1.55).
   * Defaults: 30s for autoscaling Lakebase, 10s otherwise.
   */
  connect_timeout?: number | null;
  /** Autoscaling Lakebase: seconds of inactivity before suspend (60–604800; 0 or negative disables) */
  suspend_timeout_seconds?: number | null;
  user?: VariableValue;
  password?: VariableValue;
  service_principal?: ServicePrincipalModel | string;  // Can be inline or reference
  client_id?: VariableValue;
  client_secret?: VariableValue;
  workspace_host?: VariableValue;
  pat?: VariableValue;
}

export interface ConnectionModel {
  on_behalf_of_user?: boolean;
  name: string;
  // Authentication fields
  service_principal?: ServicePrincipalModel | string;
  client_id?: VariableValue;
  client_secret?: VariableValue;
  workspace_host?: VariableValue;
  pat?: VariableValue;
}

// Databricks App Model - represents a Databricks App resource
export interface DatabricksAppModel {
  on_behalf_of_user?: boolean;
  name: string;  // The unique instance name of the Databricks App (URL is retrieved dynamically)
  // Authentication fields
  service_principal?: ServicePrincipalModel | string;
  client_id?: VariableValue;
  client_secret?: VariableValue;
  workspace_host?: VariableValue;
  pat?: VariableValue;
}

export interface RetrieverModel {
  vector_store: VectorStoreModel;
  columns?: string[];
  search_parameters?: SearchParametersModel;
  rerank?: RerankParametersModel | boolean;  // FlashRank/Databricks reranking only
  instructed?: InstructedRetrieverModel;
}

// Router for selecting standard vs instructed execution mode
export interface RouterModel {
  model?: InferenceEndpointModel | string;  // Reference to LLM resource
  default_mode?: "standard" | "instructed";
  auto_bypass?: boolean;  // Skip Instruction Reranker and Verifier for standard mode
}

// Query decomposition settings for instructed retrieval
export interface DecompositionModel {
  model?: InferenceEndpointModel | string;  // Reference to LLM resource (fast model recommended)
  max_subqueries?: number;  // Default: 3
  rrf_k?: number;  // Default: 60
  examples?: InstructedRetrieverExample[];
  normalize_filter_case?: "uppercase" | "lowercase";
}

// Instructed retrieval with query decomposition, reranking, routing, and verification
// In dao-ai 0.1.24+, columns is the single source of truth for schema context.
// Each pipeline component (decomposition, routing, verification, reranking)
// generates the specific context it needs from the structured column metadata.
export interface InstructedRetrieverModel {
  columns: ColumnInfo[];  // Required - structured column metadata for all pipeline components
  constraints?: string[];
  decomposition?: DecompositionModel;  // Query decomposition and RRF merging
  rerank?: InstructionAwareRerankModel;  // LLM-based instruction-aware reranking
  router?: RouterModel;  // Query routing between standard/instructed modes
  verifier?: VerifierModel;  // Result validation with retry support
}

// Column metadata for dynamic schema generation in instructed retrieval
export interface ColumnInfo {
  name: string;
  type?: "string" | "number" | "boolean" | "datetime";
  operators?: string[];  // Default: ["", "NOT", "<", "<=", ">", ">=", "LIKE", "NOT LIKE"]
  description?: string;  // Human-readable description for LLM context (e.g. "Brand/manufacturer (MILWAUKEE, DEWALT, etc.)")
}

// Few-shot example for instructed retrieval
export interface InstructedRetrieverExample {
  query: string;
  filters: Record<string, any>;
}

// Verifier for result validation with retry support
export interface VerifierModel {
  model?: InferenceEndpointModel | string;  // Reference to LLM resource
  on_failure?: "warn" | "retry" | "warn_and_retry";
  max_retries?: number;  // Default: 1
}

export interface SearchParametersModel {
  num_results?: number;
  filters?: Record<string, any>;
  query_type?: string;
}

export interface RerankParametersModel {
  model?: string;  // FlashRank model name (optional - use columns for Databricks reranking)
  top_n?: number;
  cache_dir?: string;
  columns?: string[];
}

// LLM-based instruction-aware reranking (runs after FlashRank)
export interface InstructionAwareRerankModel {
  model?: InferenceEndpointModel | string;  // Reference to LLM resource
  instructions?: string;  // Custom reranking instructions
  top_n?: number;
}

// dao-ai 0.1.99 expands FunctionType with six first-class shortcut tool types.
// Each is equivalent to `type: factory + name: <dao_ai.tools.create_*>` but
// surfaces typed fields so users get autocomplete and the YAML stays terse.
// Authoritative source: src/dao_ai/config.py:4458 (FunctionType enum).
export type ToolFunctionType =
  | "python"
  | "factory"
  | "unity_catalog"
  | "mcp"
  | "inline"
  | "genie"
  | "vector_search"
  | "search"
  | "app"
  | "serving_endpoint"
  | "a2a";

export interface PythonFunctionModel {
  type: "python";
  name: string;
  human_in_the_loop?: HumanInTheLoopModel;
}

// Inline function model for defining tool code directly in YAML configuration
// New in dao-ai 0.1.21
export interface InlineFunctionModel {
  type: "inline";
  code: string;  // Python code defining a tool function decorated with @tool
  human_in_the_loop?: HumanInTheLoopModel;
}

export interface FactoryFunctionModel {
  type: "factory";
  name: string;
  args?: Record<string, any>;
  human_in_the_loop?: HumanInTheLoopModel;
}

export interface UnityCatalogFunctionModel {
  type: "unity_catalog";
  resource?: FunctionModel | string; // Reference to FunctionModel in resources.functions
  partial_args?: Record<string, any>;
  human_in_the_loop?: HumanInTheLoopModel;
}

export interface McpFunctionModel {
  type: "mcp";
  // NOTE: 'name' is NOT part of McpFunctionModel - it's in the parent ToolModel
  transport?: "streamable_http" | "stdio";
  command?: string;
  url?: VariableValue;
  headers?: Record<string, any>;
  args?: string[];
  pat?: VariableValue;
  service_principal?: ServicePrincipalModel | string;  // Can be inline or reference
  client_id?: VariableValue;
  client_secret?: VariableValue;
  workspace_host?: VariableValue;
  app?: DatabricksAppModel | string;  // Can be inline or reference to configured app
  connection?: ConnectionModel | string;  // Can be inline or reference
  functions?: SchemaModel;
  genie_room?: GenieRoomModel | string;  // Can be inline or reference
  sql?: boolean;
  vector_search?: VectorStoreModel | string;  // Can be inline or reference
  human_in_the_loop?: HumanInTheLoopModel;
  // Tool filtering - supports glob patterns (* for any chars, ? for single char)
  include_tools?: string[];  // Only include tools matching these patterns
  exclude_tools?: string[];  // Exclude tools matching these patterns (takes precedence over include)
}

// ---------------------------------------------------------------------------
// First-class shortcut tool types (dao-ai 0.1.99+).
// These are NOT factory wrappers — they are discriminated tool function types
// parsed directly by dao-ai's FunctionType enum. The dao-ai-side classes:
//   GenieToolModel             (config.py:5073)
//   VectorSearchToolModel      (config.py:5157)
//   SearchToolModel            (config.py:5212)
//   AppToolModel               (config.py:5231)
//   ServingEndpointToolModel   (config.py:5314)
//   A2AToolModel               (config.py:5420)
// ---------------------------------------------------------------------------

export interface GenieFunctionModel {
  type: "genie";
  genie_room: GenieRoomModel | string;
  name?: string;
  description?: string;
  persist_conversation?: boolean;          // default: true
  truncate_results?: boolean;              // default: false
  lru_cache?: GenieLRUCacheParametersModel;
  context_aware_cache?: GenieContextAwareCacheParametersModel;
  in_memory_context_aware_cache?: GenieInMemoryContextAwareCacheParametersModel;
  max_consecutive_cache_hits?: number;
  enable_feedback?: boolean;               // default: false
  human_in_the_loop?: HumanInTheLoopModel;
}

export interface VectorSearchFunctionModel {
  type: "vector_search";
  // Exactly one of retriever or vector_store is required.
  retriever?: RetrieverModel | string;
  vector_store?: VectorStoreModel | string;
  name?: string;
  description?: string;
  human_in_the_loop?: HumanInTheLoopModel;
}

// dao-ai 0.1.99 SearchToolModel uses `extra="forbid"` and only declares the
// `type` discriminator -- no name, description, or HITL fields. The parent
// `ToolModel.name` still applies (visible to the LLM); customization lives at
// the factory form for everything else.
export interface SearchFunctionModel {
  type: "search";
}

export interface AppFunctionModel {
  type: "app";
  app: DatabricksAppModel | string;
  api?: "responses" | "completions";       // default: lazy-probe /agent/info
  name?: string;
  description?: string;
  human_in_the_loop?: HumanInTheLoopModel;
}

export interface ServingEndpointFunctionModel {
  type: "serving_endpoint";
  // String shorthand (endpoint name) OR full InferenceEndpointModel.
  endpoint: InferenceEndpointModel | string;
  api?: "responses" | "completions";       // default: lazy-probe serving_endpoints.get(name).task
  name?: string;
  description?: string;
  on_behalf_of_user?: boolean;             // only honored when endpoint is a string
  human_in_the_loop?: HumanInTheLoopModel;
}

export type A2AFunctionAuthType =
  | "bearer"
  | "gcp_service_account"
  | "none"
  | "forwarded_user_token"
  | "databricks_app_sp";

export interface A2AFunctionModel {
  type: "a2a";
  // Mode 1: endpoint (external A2A agent). Mode 2: app (Databricks App).
  endpoint?: VariableValue;
  app?: DatabricksAppModel | string;
  auth?: VariableValue;
  auth_type?: A2AFunctionAuthType;         // default: bearer (mode 1) / derived from app.on_behalf_of_user (mode 2)
  streaming?: boolean;                     // default: true
  timeout_seconds?: number;                // default: 300
  card_path?: string;
  card_fallback_path?: string;
  user_id?: VariableValue;
  extra_metadata?: Record<string, VariableValue>;
  name?: VariableValue;
  description?: VariableValue;
  human_in_the_loop?: HumanInTheLoopModel;
}

export type ToolFunctionModel =
  | PythonFunctionModel
  | FactoryFunctionModel
  | InlineFunctionModel
  | UnityCatalogFunctionModel
  | McpFunctionModel
  | GenieFunctionModel
  | VectorSearchFunctionModel
  | SearchFunctionModel
  | AppFunctionModel
  | ServingEndpointFunctionModel
  | A2AFunctionModel
  | string;

export interface ToolModel {
  name: string;
  function: ToolFunctionModel;
}

// ---------------------------------------------------------------------------
// Strongly typed args for first-class dao_ai.tools factories.
// These mirror the keyword arguments each factory accepts and are the canonical
// shape the UI serializes into FactoryFunctionModel.args. Keeping them here
// means any consumer of ToolsSection can typecheck factory-specific data.
// ---------------------------------------------------------------------------

/** Auth modes supported by dao_ai.tools.create_a2a_agent_tool */
export type A2AAuthType = "bearer" | "gcp_service_account" | "none";

export interface A2AAgentToolArgs {
  name?: string;
  description?: string;
  endpoint: VariableValue;
  auth?: VariableValue;
  auth_type?: A2AAuthType;          // default: "bearer"
  streaming?: boolean;              // default: true
  timeout_seconds?: number;         // default: 300
  card_path?: VariableValue;        // default: "/.well-known/agent-card.json"
  card_fallback_path?: VariableValue; // default: "/.well-known/agent.json"
  user_id?: VariableValue;
  extra_metadata?: Record<string, any>;
}

/** Auth modes supported by dao_ai.tools.create_vertex_agent_engine_tool */
export type VertexAuthType = "gcp_service_account" | "bearer" | "adc";

export interface VertexAgentEngineToolArgs {
  name?: string;
  description?: string;
  endpoint: VariableValue;
  /** Omit when auth_type === "adc" */
  credentials?: VariableValue;
  auth_type?: VertexAuthType;       // default: "gcp_service_account"
  user_id?: VariableValue;
  class_method?: string;            // default: "stream_query"
  http_method?: string;             // default: "streamQuery"
  timeout_seconds?: number;         // default: 300
}

/**
 * Args for dao_ai.tools.create_rest_api_tool. Exactly one of `connection`
 * or `base_url` must be provided.
 */
export interface RestApiToolArgs {
  name?: string;
  description?: string;
  connection?: ConnectionModel | string;
  base_url?: VariableValue;
  auth_token?: VariableValue;
  default_headers?: Record<string, VariableValue>;
}

export interface AppInfoAgentEntry {
  name: string;
  description?: string;
}

export interface AppInfoToolArgs {
  app_name: string;
  description: string;
  agents: AppInfoAgentEntry[];
  sample_prompts?: string[];
}

/**
 * Shared args shape for the three memory factories:
 *   - dao_ai.tools.create_search_memory_tool
 *   - dao_ai.tools.create_manage_memory_tool
 *   - dao_ai.tools.create_search_user_profile_tool
 * The BaseStore is injected at runtime from orchestration.memory.store;
 * only `namespace` is user-configurable from YAML.
 */
export interface MemoryToolArgs {
  namespace: string[];
}

export interface ExecuteStatementToolArgs {
  name?: string;
  description?: string;
  warehouse: WarehouseModel | string;
  statement: string;
}

/** Chart type literals supported by create_visualization_tool (dao-ai ChartType). */
export type VegaChartType = "bar" | "line" | "scatter" | "area" | "arc" | "heatmap";

export interface VisualizationToolArgs {
  name?: string;
  description?: string;
  default_chart_type?: VegaChartType;  // default: "bar"
  width?: number | "container";        // default: "container"
  height?: number;                     // default: 400
  color_scheme?: string;               // default: "tableau10"
}

export type HumanInTheLoopDecision = "approve" | "edit" | "reject";

export interface HumanInTheLoopModel {
  review_prompt?: string;
  allowed_decisions?: HumanInTheLoopDecision[];
}

export type GuardrailMode = 'llm_judge' | 'scorer';

export interface GuardrailModel {
  name: string;
  // LLM Judge mode fields (provide model + prompt)
  model?: InferenceEndpointModel | string;
  prompt?: string | PromptModel;
  // Scorer mode fields (provide scorer, optionally scorer_args + hub)
  scorer?: string;
  scorer_args?: Record<string, any>;
  hub?: string;
  // Common fields
  num_retries?: number;
  fail_on_error?: boolean;
  max_context_length?: number;
  apply_to?: 'input' | 'output' | 'both';
}

export interface MiddlewareModel {
  name: string;
  args?: Record<string, any>;
}

export interface ResponseFormatModel {
  use_tool?: boolean | null;
  response_schema?: string;
}

export interface AgentModel {
  name: string;
  description?: string;
  model: InferenceEndpointModel;
  tools?: ToolModel[];
  guardrails?: GuardrailModel[];
  prompt?: string | PromptModel;
  handoff_prompt?: string;
  middleware?: MiddlewareModel[];
  response_format?: ResponseFormatModel | string;
  /**
   * Max LangGraph supersteps (LLM + tool cycles) per agent invocation.
   * Added in dao-ai 0.1.55. Defaults to LangGraph's 25 when null/omitted.
   */
  recursion_limit?: number | null;
}

export interface PromptModel {
  schema?: SchemaModel;
  name: string;
  description?: string;
  default_template?: string;
  alias?: string;
  version?: number;
  tags?: Record<string, any>;
  auto_register?: boolean;  // Whether to automatically register the prompt in MLflow
}

export interface PermissionModel {
  principals?: string[];
  privileges: string[];
}

export interface AppPermissionModel {
  principals: string[];
  entitlements: string[];
}

export interface SupervisorModel {
  model: InferenceEndpointModel;
  tools?: ToolModel[];
  prompt?: string | PromptModel;
  middleware?: MiddlewareModel[];
}

export interface HandoffRouteModel {
  agent: AgentModel | string;
  is_deterministic?: boolean;
}

export interface SwarmModel {
  default_agent?: AgentModel | string;
  handoffs?: Record<string, (AgentModel | string | HandoffRouteModel)[] | null>;
  middleware?: MiddlewareModel[];
  /** Cross-agent hop ceiling for the parent swarm graph (new in dao-ai 0.1.70). Defaults to 25. */
  max_hops?: number;
}

export type OrchestrationOutputMode = 'full_history' | 'last_message';

export type MemorySchemaName = 'user_profile' | 'preference' | 'episode';

export interface MemoryExtractionModel {
  schemas?: MemorySchemaName[];
  instructions?: string;
  auto_inject?: boolean;
  auto_inject_limit?: number;
  supervisor_auto_inject?: boolean;
  background_extraction?: boolean;
  extraction_model?: InferenceEndpointModel | string;
  query_model?: InferenceEndpointModel | string;
}

export interface MemoryModel {
  refName?: string;  // Reference name for YAML anchor (e.g., &memory)
  checkpointer?: CheckpointerModel;
  store?: StoreModel;
  extraction?: MemoryExtractionModel;
}

export interface CheckpointerModel {
  name: string;
  // NOTE: type field removed in dao-ai 0.1.2
  // Storage type is inferred: database provided → postgres, no database → memory
  database?: DatabaseModel;
}

export interface StoreModel {
  name: string;
  embedding_model?: InferenceEndpointModel;
  // NOTE: type field removed in dao-ai 0.1.2
  // Storage type is inferred: database provided → postgres, no database → memory
  dims?: number;
  database?: DatabaseModel;
  namespace?: string;
}

// dao-ai 0.1.73+: a deepagents Skill — a directory of Markdown content
// (minimally SKILL.md) that teaches a deep_agent how to do a task. Skills
// can live as local paths (bundled via code_paths) or in Unity Catalog
// volumes (wired as deployment resources for governance).
export interface SkillModel {
  /** Unique skill identifier (used by deepagents' SkillsMiddleware). */
  name: string;
  /**
   * Source directory. Either a local relative path string (e.g.
   * `skills/research`) or a VolumePathModel referencing a UC volume.
   * A raw `/Volumes/...` string is auto-promoted to VolumePathModel.
   */
  path: string | VolumePathModel;
  description?: string;
}

// dao-ai 0.1.73+: filesystem permission rule for deepagents tools.
// Rules evaluate in declaration order; first match wins.
export interface FilesystemPermissionModel {
  /** Path patterns (e.g. ['/skills/**', '/tmp/*']). */
  paths: string[];
  mode?: 'allow' | 'deny';
  /** Defaults to both read+write when omitted. */
  operations?: Array<'read' | 'write'> | null;
}

// dao-ai 0.1.73+: storage/execution backend for a deep_agent.
// Wraps deepagents BackendProtocol factory pattern.
export interface BackendModel {
  /** Fully qualified backend class or factory (e.g. deepagents.backends.StateBackend). */
  name: string;
  args?: Record<string, any>;
}

// dao-ai 0.1.73+: deepagents human-in-the-loop interrupt config per tool.
// `true` enables defaults; an object customizes the review behaviour.
// Imported here from the existing tools shape if available; otherwise use loose type.
export type DeepAgentInterruptOn = Record<string, boolean | Record<string, any>>;

// dao-ai 0.1.73+: a deepagents sub-agent invoked via the `task` tool.
// Mirrors deepagents.SubAgent but lifted into the dao-ai object model so
// every field can accept dao-ai primitives (InferenceEndpointModel, PromptModel, etc).
export interface SubAgentModel {
  name: string;
  description: string;
  system_prompt: string | PromptModel;
  tools?: (ToolModel | string)[];
  model?: string | InferenceEndpointModel | null;
  middleware?: MiddlewareModel[];
  interrupt_on?: DeepAgentInterruptOn;
  /** Skill source paths or named SkillModel refs scoped to this sub-agent. */
  skills?: (SkillModel | string)[];
  /** Replace (not extend) parent permissions when present. */
  permissions?: FilesystemPermissionModel[];
  response_format?: ResponseFormatModel | string | null;
}

// dao-ai 0.1.73+: deep_agent orchestration pattern. Wraps
// deepagents.create_deep_agent so every parameter is declarative.
// Memory (checkpointer/store) layers over OrchestrationModel.memory.
export interface DeepAgentModel {
  /** Primary LLM. Defaults to deepagents' default (claude-sonnet-4-6). */
  model?: string | InferenceEndpointModel | null;
  /** Tools merged with deepagents' built-in suite. */
  tools?: (ToolModel | string)[];
  /** Prepended to deepagents' base system prompt. */
  system_prompt?: string | PromptModel | null;
  middleware?: MiddlewareModel[];
  /**
   * Sub-agents invoked via the `task` tool. Three forms accepted:
   * inline SubAgentModel, AgentModel, or a string name (lookup in app.agents).
   */
  subagents?: (SubAgentModel | AgentModel | string)[];
  /** Skill source paths or named SkillModel refs. */
  skills?: (SkillModel | string)[];
  /** AGENTS.md-style instruction files loaded into the prompt. */
  instruction_files?: string[];
  /** Filesystem permission rules applied to the main agent + inherited. */
  permissions?: FilesystemPermissionModel[];
  response_format?: ResponseFormatModel | string | null;
  /** Per-tool HITL config. */
  interrupt_on?: DeepAgentInterruptOn;
  backend?: BackendModel | null;
  /** Fully qualified class name of a TypedDict/dataclass for run-scoped context. */
  context_schema?: string | null;
  /** Per-run graph recursion limit. Defaults to LangGraph's 25 when null. */
  recursion_limit?: number | null;
  debug?: boolean;
  /** Human-readable name attached to the compiled graph. */
  name?: string | null;
}

export interface OrchestrationModel {
  supervisor?: SupervisorModel;
  swarm?: SwarmModel;
  /** dao-ai 0.1.73+: deep_agent pattern. */
  deep_agent?: DeepAgentModel;
  memory?: MemoryModel;
  /**
   * How an agent's response flows back into parent state (new in dao-ai 0.1.70).
   * full_history (default) returns the full local history including intermediate
   * AI/tool messages; last_message returns only the final AI response.
   */
  output_mode?: OrchestrationOutputMode;
}

export interface RegisteredModelModel {
  schema?: SchemaModel;
  name: string;
}

/**
 * dao-ai 0.1.99+ accepts a string shorthand `"catalog.schema"` for
 * `trace_location`, gained an optional `table_prefix` to namespace OTEL trace
 * tables when multiple agents share a single UC schema, and widened
 * `warehouse` to accept an `AnyVariable` (env/secret/composite/primitive) in
 * addition to a `WarehouseModel` reference or bare warehouse-id string.
 *
 * Authoritative source: src/dao_ai/config.py:7080.
 */
export interface TraceLocationModel {
  schema: SchemaModel;
  warehouse: WarehouseModel | VariableValue;
  table_prefix?: VariableValue;
}

export interface MonitoringModel {
  sample_rate?: number;
  scorers?: (string | GuardrailModel)[];
  guidelines?: GuidelineModel[];
  guidelines_sample_rate?: number;
}

/**
 * dao-ai 0.1.99+ renamed `LongRunningModel` -> `BackgroundModel`, the field
 * `default_background` -> `default_enabled`, and the AppModel field
 * `long_running` -> `background`. dao-ai's parser only accepts the new names
 * in 0.1.99. The builder emits the new shape; the legacy `LongRunningModel`
 * alias below is kept for round-trip-safe consumption of older configs.
 *
 * Authoritative source: src/dao_ai/config.py:7209.
 */
export interface BackgroundModel {
  database: DatabaseModel | string;
  default_enabled?: boolean;
  max_duration_seconds?: number;
  poll_interval_seconds?: number;
  responses_table_name?: string;
  messages_table_name?: string;
}

/** Deprecated alias for BackgroundModel. Kept so older imports keep working. */
export type LongRunningModel = BackgroundModel;

/**
 * dao-ai 0.1.80+: A2A protocol task-persistence configuration.
 *
 * Mirrors the dao-ai idiom shared by `CheckpointerModel` and `StoreModel`:
 * an optional `database` toggles the backing store. Absent -> in-memory
 * (tasks lost on restart); present -> Lakebase/Postgres, persisted in
 * `table`. Independent of `LongRunningModel` -- point both at the same
 * `DatabaseModel` to share a connection pool. Replaces the prior
 * `task_store: Literal["auto","in_memory","lakebase"]` selector + sibling
 * `tasks_table_name` field.
 */
export interface A2ATaskStoreModel {
  database?: DatabaseModel | string;  // Can be inline or a reference key
  table?: string;  // default "dao_ai_a2a_tasks"; ignored when database is unset
}

/**
 * dao-ai 0.1.80+: single skill advertised on the A2A Agent Card. When
 * `A2AModel.skills` is unset, dao-ai derives one skill per entry in
 * `app.agents`.
 */
export interface A2ASkillModel {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
  input_modes?: string[];
  output_modes?: string[];
}

/**
 * dao-ai 0.1.80+: Google A2A (Agent2Agent) protocol endpoint config.
 *
 * Every Databricks Apps deployment auto-mounts:
 *   - `GET /.well-known/agent-card.json` (Agent Card discovery)
 *   - `POST /a2a` (JSON-RPC 2.0: message/send, message/stream, tasks/get,
 *     tasks/list, tasks/cancel, tasks/subscribe)
 *
 * alongside the existing OpenAI Responses contract. Set `enabled: false`
 * to opt out. Ignored for Model Serving deployments (route mounting is
 * Apps-only).
 *
 * `security_schemes` is freeform here because dao-ai validates it against
 * a2a-sdk's `SecurityScheme` discriminated union at config load. See
 * `dao_ai.apps.a2a.security` for ready-made constants and factories;
 * YAML users can author equivalents inline with `${workspace.host}`
 * substitution.
 *
 * `on_behalf_of_user` is three-state:
 *   - undefined / null -> auto-derive from any resource carrying
 *     `on_behalf_of_user: true` (default).
 *   - true -> force-advertise OBO (Agent Card emits oauth2 + bearer).
 *   - false -> force-suppress (Agent Card emits PAT/M2M bearer only).
 */
export interface A2AModel {
  enabled?: boolean;  // default true
  server_url?: string;  // default: derived from $DATABRICKS_APP_URL at startup
  skills?: A2ASkillModel[];  // default: derived from app.agents
  security_schemes?: Record<string, Record<string, any>>;  // a2a-sdk SecurityScheme dicts
  default_input_modes?: string[];  // default ["text/plain", "application/json"]
  default_output_modes?: string[];  // default ["text/plain", "application/json"]
  task_store?: A2ATaskStoreModel;  // default {} -> InMemoryTaskStore
  on_behalf_of_user?: boolean | null;  // three-state (null = auto-derive)
}

export interface AppModel {
  name: string;
  description?: string;
  log_level?: LogLevel;
  service_principal?: ServicePrincipalModel | string;  // Can be inline or reference
  registered_model?: RegisteredModelModel;  // Optional in dao-ai 0.1.55+
  endpoint_name?: string;
  trace_location?: TraceLocationModel;
  monitoring?: MonitoringModel;
  /**
   * dao-ai 0.1.99+: opt-in background-agent persistence (Responses-API
   * kickoff/poll/cancel). Renamed from `long_running`. The legacy
   * `long_running` field is accepted on read for round-tripping older configs
   * but the builder always emits `background`.
   */
  background?: BackgroundModel;
  /** @deprecated Renamed to `background` in dao-ai 0.1.99. Read-only fallback. */
  long_running?: BackgroundModel;
  /**
   * dao-ai 0.1.99+: optional Databricks App Space name. Private Preview;
   * the space must pre-exist (Terraform or
   * `WorkspaceClient.apps.create_space()`). Groups apps that share runtime
   * SP / user_api_scopes / governance.
   */
  space?: string;
  /**
   * dao-ai 0.1.99+: when true, the deployment is MCP-only and the
   * agent-side validators (require at least one AgentModel, etc.) are
   * skipped. Pair with `dao-ai generate-mcp` to ship a tools-only server.
   */
  mcp_only?: boolean;
  /**
   * dao-ai 0.1.80+: A2A protocol configuration. Defaults to a fresh
   * `A2AModel()` -- enabled with sensible defaults (skills derived from
   * sub-agents, bearer scheme auto-derived from any resource OBO). Set
   * `a2a.enabled: false` to opt out. Ignored for Model Serving deployments.
   *
   * Note: the field-level `AppModel.on_behalf_of_user` advisory flag was
   * REMOVED in 0.1.80 (its only consumer was the A2A Agent Card). Use
   * `A2AModel.on_behalf_of_user` instead; leave it undefined to auto-
   * derive from resource-level `on_behalf_of_user` fields.
   */
  a2a?: A2AModel;
  tags?: Record<string, any>;
  scale_to_zero?: boolean;
  /**
   * Whether the MLflow AgentServer enables the chat proxy endpoint for
   * Databricks Apps. Added in dao-ai 0.1.55. Default: true.
   */
  enable_chat_proxy?: boolean | null;
  environment_vars?: Record<string, any>;
  budget_policy_id?: string;
  python_version?: string;  // Python version for the deployment environment
  workload_size?: "Small" | "Medium" | "Large";
  // "both" is intentionally unsupported in the builder — pick one target.
  deployment_target?: "model_serving" | "apps";
  permissions?: AppPermissionModel[];
  agents: AgentModel[];
  orchestration?: OrchestrationModel;
  alias?: string;
  initialization_hooks?: (string | PythonFunctionModel | FactoryFunctionModel)[];
  shutdown_hooks?: (string | PythonFunctionModel | FactoryFunctionModel)[];
  input_example?: ChatPayload;
  chat_history?: ChatHistoryModel;
  code_paths?: string[];
  pip_requirements?: string[];
}

export interface ChatPayload {
  input?: Message[];
  messages?: Message[];
  custom_inputs?: Record<string, any>;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatHistoryModel {
  model: InferenceEndpointModel;
  max_tokens?: number;
  max_tokens_before_summary?: number;
  max_messages_before_summary?: number;
}

export interface EvaluationModel {
  model: InferenceEndpointModel;
  table: TableModel;
  num_evals: number;
  replace?: boolean;
  agent_description?: string;
  question_guidelines?: string;
  custom_inputs?: Record<string, any>;
  guidelines?: GuidelineModel[];
}

export interface GuidelineModel {
  name: string;
  guidelines: string[];
}

export interface DatasetModel {
  table?: TableModel;
  ddl?: string | VolumeModel;
  data?: string | VolumePathModel;
  format?: "csv" | "delta" | "json" | "parquet" | "orc" | "sql" | "excel";
  read_options?: Record<string, any>;
  table_schema?: string;
  parameters?: Record<string, any>;
}

export interface UnityCatalogFunctionSqlModel {
  function: UnityCatalogFunctionModel;
  ddl: string;
  parameters?: Record<string, any>;
  test?: UnityCatalogFunctionSqlTestModel;
}

export interface UnityCatalogFunctionSqlTestModel {
  parameters?: Record<string, any>;
}

export interface ResourcesModel {
  /**
   * dao-ai 0.1.75+: renamed from `llms`. Configurations for Databricks
   * Model Serving endpoints — covers chat LLMs, embedding models,
   * judge / extraction / reflection / query models, and custom agent
   * endpoints. The yaml-generator emits `models:`; the config-store
   * import path migrates legacy `llms:` from imported YAML.
   */
  models?: Record<string, InferenceEndpointModel>;
  vector_stores?: Record<string, VectorStoreModel>;
  genie_rooms?: Record<string, GenieRoomModel>;
  tables?: Record<string, TableModel>;
  volumes?: Record<string, VolumeModel>;
  functions?: Record<string, FunctionModel>;
  warehouses?: Record<string, WarehouseModel>;
  databases?: Record<string, DatabaseModel>;
  connections?: Record<string, ConnectionModel>;
  apps?: Record<string, DatabricksAppModel>;
  /**
   * dao-ai 0.1.73+: reusable deepagents skills keyed by name. Local skills
   * ship via code_paths; volume-backed skills are wired as deployment
   * resources for permission grants. Referenced from
   * orchestration.deep_agent.skills and subagents[].skills.
   */
  skills?: Record<string, SkillModel>;
}

export interface AppConfig {
  version?: string;
  /**
   * dao-ai 0.1.70+: declared load-time parameters for ${param.NAME} /
   * ${var.NAME} substitution. Resolved by AppConfig.from_file from CLI
   * --param, process env, declared default, or inline ${var.NAME:-fallback}.
   */
  parameters?: Record<string, ParameterDeclarationModel>;
  variables?: Record<string, any>;
  schemas?: Record<string, SchemaModel>;
  service_principals?: Record<string, ServicePrincipalModel>;
  resources?: ResourcesModel;
  retrievers?: Record<string, RetrieverModel>;
  tools?: Record<string, ToolModel>;
  guardrails?: Record<string, GuardrailModel>;
  middleware?: Record<string, MiddlewareModel>;
  memory?: MemoryModel;
  prompts?: Record<string, PromptModel>;
  agents?: Record<string, AgentModel>;
  app?: AppModel;
  evaluation?: EvaluationModel;
  optimizations?: {
    training_datasets?: Record<string, any>;
    prompt_optimizations?: Record<string, any>;
  };
  datasets?: DatasetModel[];
  unity_catalog_functions?: UnityCatalogFunctionSqlModel[];
  providers?: Record<string, any>;
}

