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

export interface SchemaModel {
  catalog_name: string;
  schema_name: string;
  permissions?: PermissionModel[];
}

export interface LLMModel {
  name: string;
  temperature?: number;
  max_tokens?: number;
  on_behalf_of_user?: boolean;
  fallbacks?: (string | LLMModel)[];
}

export interface VectorStoreModel {
  on_behalf_of_user?: boolean;
  embedding_model?: LLMModel;
  index?: IndexModel;
  endpoint?: VectorSearchEndpoint;
  source_table: TableModel;
  source_path?: VolumePathModel;
  checkpoint_path?: VolumePathModel;
  primary_key?: string;
  columns?: string[];
  doc_uri?: string;
  embedding_source_column: string;
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
  name: string;
  description?: string;
  space_id: string;
}

export interface FunctionModel {
  on_behalf_of_user?: boolean;
  schema?: SchemaModel;
  name?: string;
}

export interface WarehouseModel {
  on_behalf_of_user?: boolean;
  name: string;
  description?: string;
  warehouse_id: string;
}

export interface DatabaseModel {
  on_behalf_of_user?: boolean;
  name: string;
  instance_name?: string;
  description?: string;
  host?: string;
  database?: string;
  port?: number;
  connection_kwargs?: Record<string, any>;
  max_pool_size?: number;
  timeout_seconds?: number;
  capacity?: "CU_1" | "CU_2";
  node_count?: number;
  user?: string;
  password?: string;
  client_id?: string;
  client_secret?: string;
  workspace_host?: string;
}

export interface ConnectionModel {
  on_behalf_of_user?: boolean;
  name: string;
}

export interface RetrieverModel {
  vector_store: VectorStoreModel;
  columns?: string[];
  search_parameters?: SearchParametersModel;
  rerank?: RerankParametersModel | boolean;
}

export interface SearchParametersModel {
  num_results?: number;
  filters?: Record<string, any>;
  query_type?: string;
}

export interface RerankParametersModel {
  model?: string;
  top_n?: number;
  cache_dir?: string;
  columns?: string[];
}

export type ToolFunctionType = "python" | "factory" | "unity_catalog" | "mcp";

export interface PythonFunctionModel {
  type: "python";
  name: string;
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
  name?: string; // Optional when using __MERGE__
  schema?: SchemaModel;
  partial_args?: Record<string, any>;
  human_in_the_loop?: HumanInTheLoopModel;
  __MERGE__?: string; // For YAML merge syntax (<<: *func_ref)
}

export interface McpFunctionModel {
  type: "mcp";
  name: string;
  transport?: "streamable_http" | "stdio";
  command?: string;
  url?: string;
  headers?: Record<string, any>;
  args?: string[];
  pat?: string;
  client_id?: string;
  client_secret?: string;
  workspace_host?: string;
  connection?: ConnectionModel;
  functions?: SchemaModel;
  genie_room?: GenieRoomModel;
  sql?: boolean;
  vector_search?: VectorStoreModel;
  human_in_the_loop?: HumanInTheLoopModel;
}

export type ToolFunctionModel =
  | PythonFunctionModel
  | FactoryFunctionModel
  | UnityCatalogFunctionModel
  | McpFunctionModel
  | string;

export interface ToolModel {
  name: string;
  function: ToolFunctionModel;
}

export interface HumanInTheLoopModel {
  review_prompt?: string;
  interrupt_config?: Record<string, any>;
  decline_message?: string;
  custom_actions?: Record<string, string>;
}

export interface GuardrailModel {
  name: string;
  model: LLMModel;
  prompt: string;
  num_retries?: number;
}

export interface AgentModel {
  name: string;
  description?: string;
  model: LLMModel;
  tools?: ToolModel[];
  guardrails?: GuardrailModel[];
  prompt?: string | PromptModel;
  handoff_prompt?: string;
  create_agent_hook?: string | PythonFunctionModel | FactoryFunctionModel;
  pre_agent_hook?: string | PythonFunctionModel | FactoryFunctionModel;
  post_agent_hook?: string | PythonFunctionModel | FactoryFunctionModel;
}

export interface PromptModel {
  schema?: SchemaModel;
  name: string;
  description?: string;
  default_template?: string;
  alias?: string;
  version?: number;
  tags?: Record<string, any>;
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
  model: LLMModel;
  tools?: ToolModel[];
  prompt?: string;
}

export interface SwarmModel {
  model: LLMModel;
  default_agent?: AgentModel | string;
  handoffs?: Record<string, (AgentModel | string)[] | null>;
}

export interface MemoryModel {
  checkpointer?: CheckpointerModel;
  store?: StoreModel;
}

export interface CheckpointerModel {
  name: string;
  type?: "postgres" | "memory";
  database?: DatabaseModel;
}

export interface StoreModel {
  name: string;
  embedding_model?: LLMModel;
  type?: "postgres" | "memory";
  dims?: number;
  database?: DatabaseModel;
  namespace?: string;
}

export interface OrchestrationModel {
  supervisor?: SupervisorModel;
  swarm?: SwarmModel;
  memory?: MemoryModel;
}

export interface RegisteredModelModel {
  schema?: SchemaModel;
  name: string;
}

export interface AppModel {
  name: string;
  description?: string;
  log_level?: LogLevel;
  registered_model: RegisteredModelModel;
  endpoint_name?: string;
  tags?: Record<string, any>;
  scale_to_zero?: boolean;
  environment_vars?: Record<string, any>;
  budget_policy_id?: string;
  workload_size?: "Small" | "Medium" | "Large";
  permissions?: AppPermissionModel[];
  agents: AgentModel[];
  orchestration?: OrchestrationModel;
  alias?: string;
  initialization_hooks?: (string | PythonFunctionModel | FactoryFunctionModel)[];
  shutdown_hooks?: (string | PythonFunctionModel | FactoryFunctionModel)[];
  message_hooks?: (string | PythonFunctionModel | FactoryFunctionModel)[];
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
  model: LLMModel;
  max_tokens?: number;
  max_tokens_before_summary?: number;
  max_messages_before_summary?: number;
  max_summary_tokens?: number;
}

export interface EvaluationModel {
  model: LLMModel;
  table: TableModel;
  num_evals: number;
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
  llms?: Record<string, LLMModel>;
  vector_stores?: Record<string, VectorStoreModel>;
  genie_rooms?: Record<string, GenieRoomModel>;
  tables?: Record<string, TableModel>;
  volumes?: Record<string, VolumeModel>;
  functions?: Record<string, FunctionModel>;
  warehouses?: Record<string, WarehouseModel>;
  databases?: Record<string, DatabaseModel>;
  connections?: Record<string, ConnectionModel>;
}

export interface AppConfig {
  variables?: Record<string, any>;
  schemas?: Record<string, SchemaModel>;
  resources?: ResourcesModel;
  retrievers?: Record<string, RetrieverModel>;
  tools?: Record<string, ToolModel>;
  guardrails?: Record<string, GuardrailModel>;
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

