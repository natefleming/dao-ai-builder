import { create } from 'zustand';
import { 
  AppConfig, 
  AgentModel, 
  ToolModel, 
  LLMModel, 
  SchemaModel, 
  GuardrailModel, 
  PromptModel, 
  VariableModel, 
  MemoryModel, 
  DatabaseModel,
  GenieRoomModel,
  TableModel,
  VolumeModel,
  FunctionModel,
  WarehouseModel,
  ConnectionModel,
  VectorStoreModel,
  RetrieverModel,
  ServicePrincipalModel,
} from '@/types/dao-ai-types';

interface ConfigState {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  updateConfig: (updates: Partial<AppConfig>) => void;
  
  // Variables
  addVariable: (name: string, variable: VariableModel) => void;
  updateVariable: (name: string, variable: VariableModel) => void;
  removeVariable: (name: string) => void;
  
  // Memory
  updateMemory: (memory: MemoryModel | undefined) => void;
  
  // Databases
  addDatabase: (name: string, database: DatabaseModel) => void;
  updateDatabase: (name: string, updates: Partial<DatabaseModel>) => void;
  removeDatabase: (name: string) => void;
  
  // Schemas
  addSchema: (name: string, schema: SchemaModel) => void;
  updateSchema: (name: string, updates: Partial<SchemaModel>) => void;
  removeSchema: (name: string) => void;
  
  // LLMs
  addLLM: (name: string, llm: LLMModel) => void;
  updateLLM: (name: string, updates: Partial<LLMModel>) => void;
  removeLLM: (name: string) => void;
  
  // Genie Rooms
  addGenieRoom: (name: string, genieRoom: GenieRoomModel) => void;
  updateGenieRoom: (name: string, updates: Partial<GenieRoomModel>) => void;
  removeGenieRoom: (name: string) => void;
  
  // Tables
  addTable: (name: string, table: TableModel) => void;
  updateTable: (name: string, updates: Partial<TableModel>) => void;
  removeTable: (name: string) => void;
  
  // Volumes
  addVolume: (name: string, volume: VolumeModel) => void;
  updateVolume: (name: string, updates: Partial<VolumeModel>) => void;
  removeVolume: (name: string) => void;
  
  // Functions
  addFunction: (name: string, func: FunctionModel) => void;
  updateFunction: (name: string, updates: Partial<FunctionModel>) => void;
  removeFunction: (name: string) => void;
  
  // Warehouses
  addWarehouse: (name: string, warehouse: WarehouseModel) => void;
  updateWarehouse: (name: string, updates: Partial<WarehouseModel>) => void;
  removeWarehouse: (name: string) => void;
  
  // Connections
  addConnection: (name: string, connection: ConnectionModel) => void;
  updateConnection: (name: string, updates: Partial<ConnectionModel>) => void;
  removeConnection: (name: string) => void;
  
  // Service Principals
  addServicePrincipal: (name: string, sp: ServicePrincipalModel) => void;
  updateServicePrincipal: (name: string, updates: Partial<ServicePrincipalModel>) => void;
  removeServicePrincipal: (name: string) => void;
  
  // Vector Stores
  addVectorStore: (name: string, vectorStore: VectorStoreModel) => void;
  updateVectorStore: (name: string, updates: Partial<VectorStoreModel>) => void;
  removeVectorStore: (name: string) => void;
  
  // Retrievers (top-level, not in resources)
  addRetriever: (name: string, retriever: RetrieverModel) => void;
  updateRetriever: (name: string, updates: Partial<RetrieverModel>) => void;
  removeRetriever: (name: string) => void;
  
  // Tools
  addTool: (tool: ToolModel) => void;
  updateTool: (name: string, updates: Partial<ToolModel>) => void;
  removeTool: (name: string) => void;
  
  // Guardrails
  addGuardrail: (guardrail: GuardrailModel) => void;
  updateGuardrail: (name: string, updates: Partial<GuardrailModel>) => void;
  removeGuardrail: (name: string) => void;
  
  // Prompts
  addPrompt: (refName: string, prompt: PromptModel) => void;
  updatePrompt: (refName: string, updates: Partial<PromptModel>) => void;
  removePrompt: (refName: string) => void;
  
  // Agents
  addAgent: (refName: string, agent: AgentModel) => void;
  updateAgent: (refName: string, updates: Partial<AgentModel>) => void;
  removeAgent: (refName: string) => void;
  
  // App config
  updateApp: (updates: Partial<AppConfig['app']>) => void;
  
  reset: () => void;
}

const defaultConfig: AppConfig = {
  variables: {},
  schemas: {},
  resources: {
    llms: {},
    vector_stores: {},
    genie_rooms: {},
    tables: {},
    volumes: {},
    functions: {},
    warehouses: {},
    databases: {},
    connections: {},
  },
  retrievers: {},
  tools: {},
  guardrails: {},
  prompts: {},
  agents: {},
  // App starts undefined - user configures it in Application section
  app: undefined,
};

export const useConfigStore = create<ConfigState>((set) => ({
  config: defaultConfig,
  
  setConfig: (config) => set({ config }),
  
  updateConfig: (updates) =>
    set((state) => ({
      config: { ...state.config, ...updates },
    })),
  
  addVariable: (name, variable) =>
    set((state) => ({
      config: {
        ...state.config,
        variables: {
          ...state.config.variables,
          [name]: variable,
        },
      },
    })),
  
  updateVariable: (name, variable) =>
    set((state) => ({
      config: {
        ...state.config,
        variables: {
          ...state.config.variables,
          [name]: variable,
        },
      },
    })),
  
  removeVariable: (name) =>
    set((state) => {
      const variables = { ...state.config.variables };
      delete variables?.[name];
      return {
        config: {
          ...state.config,
          variables,
        },
      };
    }),
  
  updateMemory: (memory) =>
    set((state) => ({
      config: {
        ...state.config,
        memory,
      },
    })),
  
  addDatabase: (name, database) =>
    set((state) => ({
      config: {
        ...state.config,
        resources: {
          ...state.config.resources,
          databases: {
            ...state.config.resources?.databases,
            [name]: database,
          },
        },
      },
    })),
  
  updateDatabase: (name, updates) =>
    set((state) => {
      const databases = { ...state.config.resources?.databases };
      if (databases?.[name]) {
        databases[name] = { ...databases[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            databases: databases || {},
          },
        },
      };
    }),
  
  removeDatabase: (name) =>
    set((state) => {
      const databases = { ...state.config.resources?.databases };
      delete databases?.[name];
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            databases: databases || {},
          },
        },
      };
    }),
  
  addSchema: (name, schema) =>
    set((state) => ({
      config: {
        ...state.config,
        schemas: {
          ...state.config.schemas,
          [name]: schema,
        },
      },
    })),
  
  updateSchema: (name, updates) =>
    set((state) => {
      const schemas = { ...state.config.schemas };
      if (schemas?.[name]) {
        schemas[name] = { ...schemas[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          schemas,
        },
      };
    }),
  
  removeSchema: (name) =>
    set((state) => {
      const schemas = { ...state.config.schemas };
      delete schemas?.[name];
      return {
        config: {
          ...state.config,
          schemas,
        },
      };
    }),
  
  addLLM: (name, llm) =>
    set((state) => ({
      config: {
        ...state.config,
        resources: {
          ...state.config.resources,
          llms: {
            ...state.config.resources?.llms,
            [name]: llm,
          },
        },
      },
    })),
  
  updateLLM: (name, updates) =>
    set((state) => {
      const llms = { ...state.config.resources?.llms };
      if (llms?.[name]) {
        llms[name] = { ...llms[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            llms: llms || {},
          },
        },
      };
    }),
  
  removeLLM: (name) =>
    set((state) => {
      const llms = { ...state.config.resources?.llms };
      delete llms?.[name];
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            llms: llms || {},
          },
        },
      };
    }),
  
  // Genie Rooms
  addGenieRoom: (name, genieRoom) =>
    set((state) => ({
      config: {
        ...state.config,
        resources: {
          ...state.config.resources,
          genie_rooms: {
            ...state.config.resources?.genie_rooms,
            [name]: genieRoom,
          },
        },
      },
    })),
  
  updateGenieRoom: (name, updates) =>
    set((state) => {
      const genie_rooms = { ...state.config.resources?.genie_rooms };
      if (genie_rooms?.[name]) {
        genie_rooms[name] = { ...genie_rooms[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            genie_rooms: genie_rooms || {},
          },
        },
      };
    }),
  
  removeGenieRoom: (name) =>
    set((state) => {
      const genie_rooms = { ...state.config.resources?.genie_rooms };
      delete genie_rooms?.[name];
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            genie_rooms: genie_rooms || {},
          },
        },
      };
    }),
  
  // Tables
  addTable: (name, table) =>
    set((state) => ({
      config: {
        ...state.config,
        resources: {
          ...state.config.resources,
          tables: {
            ...state.config.resources?.tables,
            [name]: table,
          },
        },
      },
    })),
  
  updateTable: (name, updates) =>
    set((state) => {
      const tables = { ...state.config.resources?.tables };
      if (tables?.[name]) {
        tables[name] = { ...tables[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            tables: tables || {},
          },
        },
      };
    }),
  
  removeTable: (name) =>
    set((state) => {
      const tables = { ...state.config.resources?.tables };
      delete tables?.[name];
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            tables: tables || {},
          },
        },
      };
    }),
  
  // Volumes
  addVolume: (name, volume) =>
    set((state) => ({
      config: {
        ...state.config,
        resources: {
          ...state.config.resources,
          volumes: {
            ...state.config.resources?.volumes,
            [name]: volume,
          },
        },
      },
    })),
  
  updateVolume: (name, updates) =>
    set((state) => {
      const volumes = { ...state.config.resources?.volumes };
      if (volumes?.[name]) {
        volumes[name] = { ...volumes[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            volumes: volumes || {},
          },
        },
      };
    }),
  
  removeVolume: (name) =>
    set((state) => {
      const volumes = { ...state.config.resources?.volumes };
      delete volumes?.[name];
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            volumes: volumes || {},
          },
        },
      };
    }),
  
  // Functions
  addFunction: (name, func) =>
    set((state) => ({
      config: {
        ...state.config,
        resources: {
          ...state.config.resources,
          functions: {
            ...state.config.resources?.functions,
            [name]: func,
          },
        },
      },
    })),
  
  updateFunction: (name, updates) =>
    set((state) => {
      const functions = { ...state.config.resources?.functions };
      if (functions?.[name]) {
        functions[name] = { ...functions[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            functions: functions || {},
          },
        },
      };
    }),
  
  removeFunction: (name) =>
    set((state) => {
      const functions = { ...state.config.resources?.functions };
      delete functions?.[name];
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            functions: functions || {},
          },
        },
      };
    }),
  
  // Warehouses
  addWarehouse: (name, warehouse) =>
    set((state) => ({
      config: {
        ...state.config,
        resources: {
          ...state.config.resources,
          warehouses: {
            ...state.config.resources?.warehouses,
            [name]: warehouse,
          },
        },
      },
    })),
  
  updateWarehouse: (name, updates) =>
    set((state) => {
      const warehouses = { ...state.config.resources?.warehouses };
      if (warehouses?.[name]) {
        warehouses[name] = { ...warehouses[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            warehouses: warehouses || {},
          },
        },
      };
    }),
  
  removeWarehouse: (name) =>
    set((state) => {
      const warehouses = { ...state.config.resources?.warehouses };
      delete warehouses?.[name];
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            warehouses: warehouses || {},
          },
        },
      };
    }),
  
  // Connections
  addConnection: (name, connection) =>
    set((state) => ({
      config: {
        ...state.config,
        resources: {
          ...state.config.resources,
          connections: {
            ...state.config.resources?.connections,
            [name]: connection,
          },
        },
      },
    })),
  
  updateConnection: (name, updates) =>
    set((state) => {
      const connections = { ...state.config.resources?.connections };
      if (connections?.[name]) {
        connections[name] = { ...connections[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            connections: connections || {},
          },
        },
      };
    }),
  
  removeConnection: (name) =>
    set((state) => {
      const connections = { ...state.config.resources?.connections };
      delete connections?.[name];
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            connections: connections || {},
          },
        },
      };
    }),
  
  // Service Principals (top-level, like schemas)
  addServicePrincipal: (name, sp) =>
    set((state) => ({
      config: {
        ...state.config,
        service_principals: {
          ...state.config.service_principals,
          [name]: sp,
        },
      },
    })),
  
  updateServicePrincipal: (name, updates) =>
    set((state) => {
      const service_principals = { ...state.config.service_principals };
      if (service_principals?.[name]) {
        service_principals[name] = { ...service_principals[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          service_principals,
        },
      };
    }),
  
  removeServicePrincipal: (name) =>
    set((state) => {
      const service_principals = { ...state.config.service_principals };
      delete service_principals?.[name];
      return {
        config: {
          ...state.config,
          service_principals,
        },
      };
    }),
  
  // Vector Stores
  addVectorStore: (name, vectorStore) =>
    set((state) => ({
      config: {
        ...state.config,
        resources: {
          ...state.config.resources,
          vector_stores: {
            ...state.config.resources?.vector_stores,
            [name]: vectorStore,
          },
        },
      },
    })),
  
  updateVectorStore: (name, updates) =>
    set((state) => {
      const vector_stores = { ...state.config.resources?.vector_stores };
      if (vector_stores?.[name]) {
        vector_stores[name] = { ...vector_stores[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            vector_stores: vector_stores || {},
          },
        },
      };
    }),
  
  removeVectorStore: (name) =>
    set((state) => {
      const vector_stores = { ...state.config.resources?.vector_stores };
      delete vector_stores?.[name];
      return {
        config: {
          ...state.config,
          resources: {
            ...state.config.resources,
            vector_stores: vector_stores || {},
          },
        },
      };
    }),
  
  // Retrievers (top-level, not in resources)
  addRetriever: (name, retriever) =>
    set((state) => ({
      config: {
        ...state.config,
        retrievers: {
          ...state.config.retrievers,
          [name]: retriever,
        },
      },
    })),
  
  updateRetriever: (name, updates) =>
    set((state) => {
      const retrievers = { ...state.config.retrievers };
      if (retrievers?.[name]) {
        retrievers[name] = { ...retrievers[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          retrievers,
        },
      };
    }),
  
  removeRetriever: (name) =>
    set((state) => {
      const retrievers = { ...state.config.retrievers };
      delete retrievers?.[name];
      return {
        config: {
          ...state.config,
          retrievers,
        },
      };
    }),
  
  addTool: (tool) =>
    set((state) => ({
      config: {
        ...state.config,
        tools: {
          ...state.config.tools,
          [tool.name]: tool,
        },
      },
    })),
  
  updateTool: (name, updates) =>
    set((state) => {
      const tools = { ...state.config.tools };
      if (tools?.[name]) {
        tools[name] = { ...tools[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          tools,
        },
      };
    }),
  
  removeTool: (name) =>
    set((state) => {
      const tools = { ...state.config.tools };
      delete tools?.[name];
      return {
        config: {
          ...state.config,
          tools,
        },
      };
    }),
  
  addGuardrail: (guardrail) =>
    set((state) => ({
      config: {
        ...state.config,
        guardrails: {
          ...state.config.guardrails,
          [guardrail.name]: guardrail,
        },
      },
    })),
  
  updateGuardrail: (name, updates) =>
    set((state) => {
      const guardrails = { ...state.config.guardrails };
      if (guardrails?.[name]) {
        guardrails[name] = { ...guardrails[name], ...updates };
      }
      return {
        config: {
          ...state.config,
          guardrails,
        },
      };
    }),
  
  removeGuardrail: (name) =>
    set((state) => {
      const guardrails = { ...state.config.guardrails };
      delete guardrails?.[name];
      return {
        config: {
          ...state.config,
          guardrails,
        },
      };
    }),
  
  addPrompt: (refName, prompt) =>
    set((state) => ({
      config: {
        ...state.config,
        prompts: {
          ...state.config.prompts,
          [refName]: prompt,
        },
      },
    })),
  
  updatePrompt: (refName, updates) =>
    set((state) => {
      const prompts = { ...state.config.prompts };
      if (prompts?.[refName]) {
        prompts[refName] = { ...prompts[refName], ...updates };
      }
      return {
        config: {
          ...state.config,
          prompts,
        },
      };
    }),
  
  removePrompt: (refName) =>
    set((state) => {
      const prompts = { ...state.config.prompts };
      delete prompts?.[refName];
      return {
        config: {
          ...state.config,
          prompts,
        },
      };
    }),
  
  addAgent: (refName, agent) =>
    set((state) => {
      const agents = { ...state.config.agents, [refName]: agent };
      const appAgents = [...(state.config.app?.agents || []), agent];
      
      return {
        config: {
          ...state.config,
          agents,
          app: state.config.app
            ? {
                ...state.config.app,
                agents: appAgents,
              }
            : undefined,
        },
      };
    }),
  
  updateAgent: (name, updates) =>
    set((state) => {
      const agents = { ...state.config.agents };
      if (agents?.[name]) {
        agents[name] = { ...agents[name], ...updates };
        
        // Update in app.agents array too
        const appAgents = state.config.app?.agents?.map((a) =>
          a.name === name ? { ...a, ...updates } : a
        ) || [];
        
        return {
          config: {
            ...state.config,
            agents,
            app: state.config.app
              ? {
                  ...state.config.app,
                  agents: appAgents,
                }
              : undefined,
          },
        };
      }
      return { config: state.config };
    }),
  
  removeAgent: (name) =>
    set((state) => {
      const agents = { ...state.config.agents };
      delete agents?.[name];
      const appAgents = state.config.app?.agents?.filter((a) => a.name !== name) || [];
      
      return {
        config: {
          ...state.config,
          agents,
          app: state.config.app
            ? {
                ...state.config.app,
                agents: appAgents,
              }
            : undefined,
        },
      };
    }),
  
  updateApp: (updates) =>
    set((state) => ({
      config: {
        ...state.config,
        app: {
          // Provide defaults if app doesn't exist
          name: state.config.app?.name || '',
          registered_model: state.config.app?.registered_model || { name: '' },
          agents: state.config.app?.agents || [],
          ...state.config.app,
          ...updates,
        },
      },
    })),
  
  reset: () => set({ config: defaultConfig }),
}));

