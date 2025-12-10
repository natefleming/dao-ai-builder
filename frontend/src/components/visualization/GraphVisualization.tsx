import { useMemo } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Bot, Cpu, Shield, Wrench, GitBranch, Users } from 'lucide-react';
import { AppConfig } from '@/types/dao-ai-types';

interface GraphVisualizationProps {
  config: AppConfig;
}

// Custom node for agents
function AgentNode({ data }: { data: AgentNodeData }) {
  return (
    <div className={`px-4 py-3 rounded-xl border-2 shadow-lg min-w-[200px] ${data.isDefault ? 'border-amber-500 bg-amber-950/80' : 'border-blue-500 bg-slate-800/90'}`}>
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3" />
      
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${data.isDefault ? 'bg-amber-500/20' : 'bg-blue-500/20'}`}>
          <Bot className={`w-4 h-4 ${data.isDefault ? 'text-amber-400' : 'text-blue-400'}`} />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-100">{data.name}</div>
          {data.isDefault && (
            <div className="text-[10px] text-amber-400 font-medium">Default Agent</div>
          )}
        </div>
      </div>
      
      {data.description && (
        <p className="text-xs text-slate-400 mb-2 line-clamp-2">{data.description}</p>
      )}
      
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Cpu className="w-3 h-3 text-purple-400" />
          <span className="truncate">{data.modelName}</span>
        </div>
        
        {data.toolCount > 0 && (
          <div className="flex items-center gap-2 text-slate-300">
            <Wrench className="w-3 h-3 text-green-400" />
            <span>{data.toolCount} tool{data.toolCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        
        {data.guardrailCount > 0 && (
          <div className="flex items-center gap-2 text-slate-300">
            <Shield className="w-3 h-3 text-red-400" />
            <span>{data.guardrailCount} guardrail{data.guardrailCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        
        {data.handoffTargets && data.handoffTargets.length > 0 && (
          <div className="flex items-center gap-2 text-slate-300">
            <GitBranch className="w-3 h-3 text-cyan-400" />
            <span>→ {data.handoffTargets.join(', ')}</span>
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3" />
    </div>
  );
}

// Custom node for supervisor
function SupervisorNode({ data }: { data: SupervisorNodeData }) {
  return (
    <div className="px-4 py-3 rounded-xl border-2 border-purple-500 bg-purple-950/80 shadow-lg min-w-[180px]">
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-3 !h-3" />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-lg bg-purple-500/20">
          <Users className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-100">Supervisor</div>
          <div className="text-[10px] text-purple-400 font-medium">Orchestrator</div>
        </div>
      </div>
      
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Cpu className="w-3 h-3 text-purple-400" />
          <span className="truncate">{data.modelName}</span>
        </div>
        
        {data.toolCount > 0 && (
          <div className="flex items-center gap-2 text-slate-300">
            <Wrench className="w-3 h-3 text-green-400" />
            <span>{data.toolCount} tool{data.toolCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500 !w-3 !h-3" />
    </div>
  );
}

interface AgentNodeData extends Record<string, unknown> {
  name: string;
  description?: string;
  modelName: string;
  toolCount: number;
  guardrailCount: number;
  isDefault?: boolean;
  handoffTargets?: string[];
}

interface SupervisorNodeData extends Record<string, unknown> {
  modelName: string;
  toolCount: number;
}

const nodeTypes = {
  agent: AgentNode,
  supervisor: SupervisorNode,
};

export default function GraphVisualization({ config }: GraphVisualizationProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    return buildGraph(config);
  }, [config]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const orchestrationType = config.app?.orchestration?.supervisor ? 'supervisor' : 
                           config.app?.orchestration?.swarm ? 'swarm' : 'none';

  return (
    <div className="w-full h-full bg-slate-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-medium text-slate-200">Agent Graph</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Orchestration:</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              orchestrationType === 'supervisor' ? 'bg-purple-500/20 text-purple-300' :
              orchestrationType === 'swarm' ? 'bg-blue-500/20 text-blue-300' :
              'bg-slate-700 text-slate-400'
            }`}>
              {orchestrationType === 'supervisor' ? 'Supervisor' : 
               orchestrationType === 'swarm' ? 'Swarm' : 'Not Configured'}
            </span>
          </div>
        </div>
      </div>

      {/* Graph */}
      <div className="h-[calc(100%-52px)]">
        {initialNodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <div className="text-center">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No agents configured</p>
              <p className="text-xs mt-1">Add agents to visualize the graph</p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.3}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#64748b', strokeWidth: 2 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#64748b',
              },
            }}
          >
            <Background color="#334155" gap={20} size={1} />
            <Controls 
              className="!bg-slate-800 !border-slate-700 !rounded-lg [&>button]:!bg-slate-700 [&>button]:!border-slate-600 [&>button]:!text-slate-300 [&>button:hover]:!bg-slate-600"
            />
            <MiniMap 
              nodeColor={(node) => {
                if (node.type === 'supervisor') return '#a855f7';
                if (node.data?.isDefault) return '#f59e0b';
                return '#3b82f6';
              }}
              maskColor="rgba(15, 23, 42, 0.8)"
              className="!bg-slate-800 !border-slate-700 !rounded-lg"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

function buildGraph(config: AppConfig): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  // Get agents that are actually part of the application
  const allAgents = config.agents || {};
  const appAgents = config.app?.agents || [];
  
  // Filter to only include agents that are in the app's agent list
  // If app.agents is empty, fall back to showing all configured agents
  const agentKeys = appAgents.length > 0
    ? Object.keys(allAgents).filter(key => {
        const agent = allAgents[key];
        return appAgents.some(appAgent => {
          const appAgentName = typeof appAgent === 'string' ? appAgent : appAgent?.name;
          return agent.name === appAgentName;
        });
      })
    : Object.keys(allAgents);
  
  const agents = Object.fromEntries(
    agentKeys.map(key => [key, allAgents[key]])
  );
  
  if (agentKeys.length === 0) {
    return { nodes, edges };
  }

  // Get all agent names for handoff resolution
  const allAgentNames = agentKeys.map(key => agents[key].name);

  const orchestration = config.app?.orchestration;
  
  // Node dimensions and spacing - generous spacing to prevent overlap
  const nodeWidth = 240;   // Account for actual rendered width
  const nodeHeight = 180;  // Account for actual rendered height with all content
  const horizontalGap = 100; // Generous horizontal gap
  const verticalGap = 120;   // Generous vertical gap
  const horizontalSpacing = nodeWidth + horizontalGap;
  const verticalSpacing = nodeHeight + verticalGap;

  if (orchestration?.supervisor) {
    // Supervisor pattern - central supervisor with agents below in an arc
    const supervisor = orchestration.supervisor;
    const numAgents = agentKeys.length;
    
    // Calculate layout - max 3 per row for better readability
    const maxPerRow = Math.min(3, numAgents);
    
    // Calculate center based on widest row
    const agentsInWidestRow = Math.min(maxPerRow, numAgents);
    const totalWidth = agentsInWidestRow * horizontalSpacing;
    const centerX = totalWidth / 2;
    
    // Add supervisor node at the top center
    nodes.push({
      id: 'supervisor',
      type: 'supervisor',
      position: { x: centerX - 90, y: 40 },
      data: {
        modelName: supervisor.model?.name || 'Unknown',
        toolCount: supervisor.tools?.length || 0,
      } as SupervisorNodeData,
    });

    // Add agent nodes below supervisor in rows
    agentKeys.forEach((key, index) => {
      const agent = agents[key];
      const row = Math.floor(index / maxPerRow);
      const col = index % maxPerRow;
      const agentsInThisRow = Math.min(maxPerRow, numAgents - row * maxPerRow);
      const rowWidth = agentsInThisRow * horizontalSpacing;
      const rowStartX = centerX - rowWidth / 2;
      
      nodes.push({
        id: key,
        type: 'agent',
        position: { 
          x: rowStartX + col * horizontalSpacing, 
          y: 40 + verticalSpacing + row * verticalSpacing 
        },
        data: {
          name: agent.name,
          description: agent.description,
          modelName: agent.model?.name || 'Unknown',
          toolCount: agent.tools?.length || 0,
          guardrailCount: agent.guardrails?.length || 0,
        } as AgentNodeData,
      });

      // Connect supervisor to each agent
      edges.push({
        id: `supervisor-${key}`,
        source: 'supervisor',
        target: key,
        animated: true,
        style: { stroke: '#a855f7', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#a855f7',
        },
      });
    });
  } else if (orchestration?.swarm) {
    // Swarm pattern - use different layouts based on agent count
    const swarm = orchestration.swarm;
    const defaultAgentName = typeof swarm.default_agent === 'string' 
      ? swarm.default_agent 
      : swarm.default_agent?.name;
    
    const handoffs = swarm.handoffs || {};
    
    // Determine handoff targets for each agent based on swarm rules
    const getHandoffTargets = (agentName: string): string[] => {
      const hasHandoffEntry = Object.prototype.hasOwnProperty.call(handoffs, agentName);
      
      if (!hasHandoffEntry) {
        return allAgentNames.filter(name => name !== agentName);
      }
      
      const agentHandoffs = handoffs[agentName];
      
      if (agentHandoffs === null || agentHandoffs === undefined) {
        return allAgentNames.filter(name => name !== agentName);
      }
      
      if (Array.isArray(agentHandoffs) && agentHandoffs.length === 0) {
        return [];
      }
      
      if (Array.isArray(agentHandoffs)) {
        return agentHandoffs
          .map(h => typeof h === 'string' ? h : h?.name || '')
          .filter(name => name && name !== agentName && allAgentNames.includes(name));
      }
      
      return [];
    };

    const numAgents = agentKeys.length;
    
    // Helper to create agent node data
    const createAgentNodeData = (agent: any, isDefault: boolean): AgentNodeData => {
      const handoffTargets = getHandoffTargets(agent.name);
      const hasHandoffEntry = Object.prototype.hasOwnProperty.call(handoffs, agent.name);
      const canHandoffToAll = !hasHandoffEntry || handoffs[agent.name] === null || handoffs[agent.name] === undefined;
      const canHandoffToNone = hasHandoffEntry && Array.isArray(handoffs[agent.name]) && handoffs[agent.name]?.length === 0;
      
      return {
        name: agent.name,
        description: agent.description,
        modelName: agent.model?.name || 'Unknown',
        toolCount: agent.tools?.length || 0,
        guardrailCount: agent.guardrails?.length || 0,
        isDefault,
        handoffTargets: canHandoffToAll 
          ? ['(all agents)'] 
          : canHandoffToNone 
          ? ['(none)'] 
          : handoffTargets.length > 0 ? handoffTargets : undefined,
      };
    };
    
    if (numAgents === 2) {
      // Two agents: side by side with generous spacing
      const spacing = horizontalSpacing * 1.5;
      const startX = 50;
      
      agentKeys.forEach((key, index) => {
        const agent = agents[key];
        const isDefault = agent.name === defaultAgentName;
        
        nodes.push({
          id: key,
          type: 'agent',
          position: { x: startX + index * spacing, y: 100 },
          data: createAgentNodeData(agent, isDefault),
        });
      });
    } else if (numAgents === 3) {
      // Three agents: triangle layout
      const centerX = 300;
      const topY = 50;
      const bottomY = topY + verticalSpacing;
      const sideOffset = horizontalSpacing * 0.7;
      
      // First agent at top
      const agent0 = agents[agentKeys[0]];
      nodes.push({
        id: agentKeys[0],
        type: 'agent',
        position: { x: centerX - nodeWidth / 2, y: topY },
        data: createAgentNodeData(agent0, agent0.name === defaultAgentName),
      });
      
      // Second and third agents at bottom
      const agent1 = agents[agentKeys[1]];
      nodes.push({
        id: agentKeys[1],
        type: 'agent',
        position: { x: centerX - nodeWidth / 2 - sideOffset, y: bottomY },
        data: createAgentNodeData(agent1, agent1.name === defaultAgentName),
      });
      
      const agent2 = agents[agentKeys[2]];
      nodes.push({
        id: agentKeys[2],
        type: 'agent',
        position: { x: centerX - nodeWidth / 2 + sideOffset, y: bottomY },
        data: createAgentNodeData(agent2, agent2.name === defaultAgentName),
      });
    } else if (numAgents <= 6) {
      // 4-6 agents: Use a wider circular layout
      const radius = 280 + (numAgents * 30); // Much larger radius
      const centerX = radius + nodeWidth / 2 + 50;
      const centerY = radius + nodeHeight / 2 + 50;
      const angleStep = (2 * Math.PI) / numAgents;
      const startAngle = -Math.PI / 2; // Start from top
      
      agentKeys.forEach((key, index) => {
        const agent = agents[key];
        const angle = startAngle + index * angleStep;
        const x = centerX + radius * Math.cos(angle) - nodeWidth / 2;
        const y = centerY + radius * Math.sin(angle) - nodeHeight / 2;
        const isDefault = agent.name === defaultAgentName;
        
        nodes.push({
          id: key,
          type: 'agent',
          position: { x, y },
          data: createAgentNodeData(agent, isDefault),
        });
      });
    } else {
      // 7+ agents: Use grid layout with max 3 per row
      const maxPerRow = 3;
      const totalWidth = Math.min(maxPerRow, numAgents) * horizontalSpacing;
      const centerX = totalWidth / 2;
      
      agentKeys.forEach((key, index) => {
        const agent = agents[key];
        const col = index % maxPerRow;
        const row = Math.floor(index / maxPerRow);
        const agentsInThisRow = Math.min(maxPerRow, numAgents - row * maxPerRow);
        const rowWidth = agentsInThisRow * horizontalSpacing;
        const rowStartX = centerX - rowWidth / 2;
        const isDefault = agent.name === defaultAgentName;
        
        nodes.push({
          id: key,
          type: 'agent',
          position: { 
            x: rowStartX + col * horizontalSpacing,
            y: 50 + row * verticalSpacing
          },
          data: createAgentNodeData(agent, isDefault),
        });
      });
    }

    // Add edges for handoffs
    agentKeys.forEach((sourceKey) => {
      const sourceAgent = agents[sourceKey];
      const handoffTargets = getHandoffTargets(sourceAgent.name);
      
      handoffTargets.forEach((targetName, idx) => {
        const targetKey = agentKeys.find(key => agents[key].name === targetName);
        if (!targetKey || sourceKey === targetKey) return;

        edges.push({
          id: `${sourceKey}-${targetKey}-${idx}`,
          source: sourceKey,
          target: targetKey,
          animated: true,
          style: { stroke: '#22d3ee', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#22d3ee',
          },
        });
      });
    });
  } else {
    // No orchestration - arrange agents in clean rows
    const numAgents = agentKeys.length;
    const maxPerRow = Math.min(3, numAgents);
    const totalWidth = Math.min(maxPerRow, numAgents) * horizontalSpacing;
    const centerX = totalWidth / 2;
    
    agentKeys.forEach((key, index) => {
      const agent = agents[key];
      const row = Math.floor(index / maxPerRow);
      const col = index % maxPerRow;
      const agentsInThisRow = Math.min(maxPerRow, numAgents - row * maxPerRow);
      const rowWidth = agentsInThisRow * horizontalSpacing;
      const rowStartX = centerX - rowWidth / 2;
      
      nodes.push({
        id: key,
        type: 'agent',
        position: { 
          x: rowStartX + col * horizontalSpacing, 
          y: 50 + row * verticalSpacing 
        },
        data: {
          name: agent.name,
          description: agent.description,
          modelName: agent.model?.name || 'Unknown',
          toolCount: agent.tools?.length || 0,
          guardrailCount: agent.guardrails?.length || 0,
          isDefault: index === 0,
        } as AgentNodeData,
      });
    });
  }

  return { nodes, edges };
}

