import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, 
  Bot, 
  User, 
  Loader2, 
  XCircle,
  AlertTriangle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Terminal,
  Info,
  AlertCircle,
  Plus,
  Hash,
  Key
} from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import { useChatStore, LogEntry } from '@/stores/chatStore';
import { useCredentialStore } from '@/stores/credentialStore';
import { generateYAML } from '@/utils/yaml-generator';
import yaml from 'js-yaml';
import Button from '../ui/Button';
import VegaLiteChart from './VegaLiteChart';

/**
 * Remove internal-only fields (like refName) from a config object.
 * This ensures we don't send UI-specific fields to the backend.
 */
function sanitizeConfig(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeConfig);
  
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip internal-only fields
    if (key === 'refName') continue;
    result[key] = sanitizeConfig(value);
  }
  return result;
}

interface ChatPanelProps {
  onClose?: () => void;
}

export default function ChatPanel({ onClose }: ChatPanelProps) {
  const { config } = useConfigStore();
  const { 
    conversationId, 
    messages, 
    logs,
    addMessage,
    updateLastMessage,
    addLog,
    clearLogs,
    startNewSession,
    removeEmptyMessages
  } = useChatStore();
  
  const {
    credentialType,
    manualClientId,
    manualClientSecret,
    manualPat,
    setCredentialType,
    setManualClientId,
    setManualClientSecret,
    setManualPat,
    hasCredentials
  } = useCredentialStore();
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTrace, setErrorTrace] = useState<string | null>(null);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [credentialsExpanded, setCredentialsExpanded] = useState(false);
  const [customInputsExpanded, setCustomInputsExpanded] = useState(false);
  const [customInputsJson, setCustomInputsJson] = useState('');
  const [customInputsError, setCustomInputsError] = useState<string | null>(null);
  const [customInputsManuallySet, setCustomInputsManuallySet] = useState(false);
  const [customOutputs, setCustomOutputs] = useState<Record<string, unknown> | null>(null);
  const [customOutputsExpanded, setCustomOutputsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-scroll logs when expanded and new logs arrive
  useEffect(() => {
    if (logsExpanded) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, logsExpanded]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Check if config has agents
  const hasAgents = Object.keys(config.agents || {}).length > 0;
  const hasOrchestration = !!(config.app?.orchestration?.supervisor || config.app?.orchestration?.swarm);
  const canChat = hasAgents && hasOrchestration;

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !canChat) return;

    const userContent = input.trim();
    setInput('');
    setIsLoading(true);
    setError(null);
    setErrorTrace(null);

    // Add user message
    addMessage('user', userContent);
    addLog('info', `Sending message: "${userContent.substring(0, 50)}${userContent.length > 50 ? '...' : ''}"`);

    // Add empty assistant message for streaming
    addMessage('assistant', '');

    try {
      // Build messages for API
      const apiMessages = [...messages, { role: 'user' as const, content: userContent }].map(m => ({
        role: m.role,
        content: m.content
      }));

      addLog('debug', `Preparing request with ${apiMessages.length} messages`);
      addLog('info', 'Creating agent from configuration...');

      // Generate YAML and parse it back to get a clean config without internal fields
      const yamlContent = generateYAML(config);
      const cleanConfig = yaml.load(yamlContent) as Record<string, any>;
      const sanitizedConfig = sanitizeConfig(cleanConfig);
      
      // Get credentials from store
      const credentials = useCredentialStore.getState().getCredentials();
      addLog('debug', `Using ${credentials.type} authentication`);

      // Parse custom_inputs JSON if provided
      let customInputs: Record<string, unknown> = {};
      if (customInputsJson.trim()) {
        try {
          customInputs = JSON.parse(customInputsJson);
          setCustomInputsError(null);
          addLog('debug', `Custom inputs provided: ${Object.keys(customInputs).join(', ')}`);
        } catch (e) {
          setCustomInputsError('Invalid JSON format');
          throw new Error('Invalid custom_inputs JSON');
        }
      }

      // Reset custom outputs before new request
      setCustomOutputs(null);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: sanitizedConfig,
          messages: apiMessages,
          credentials,
          context: {
            thread_id: conversationId,
            user_id: 'builder-user'
          },
          custom_inputs: Object.keys(customInputs).length > 0 ? customInputs : undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Chat request failed');
      }

      // Handle SSE streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Process complete SSE messages
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                switch (data.type) {
                  case 'log':
                    addLog(data.level as LogEntry['level'], data.message);
                    break;
                    
                  case 'delta':
                    accumulatedContent += data.content;
                    updateLastMessage(accumulatedContent);
                    break;
                    
                  case 'custom_outputs':
                    setCustomOutputs(data.data);
                    setCustomOutputsExpanded(true);
                    // Auto-populate custom_inputs from custom_outputs if not manually set
                    if (!customInputsManuallySet && data.data && Object.keys(data.data).length > 0) {
                      setCustomInputsJson(JSON.stringify(data.data, null, 2));
                      addLog('info', 'Auto-populated custom_inputs from custom_outputs');
                    }
                    break;
                    
                  case 'done':
                    addLog('info', `Completed: ${data.response.length} characters`);
                    updateLastMessage(data.response || accumulatedContent);
                    break;
                    
                  case 'error':
                    addLog('error', data.error);
                    setError(data.error);
                    if (data.trace) {
                      setErrorTrace(data.trace);
                    }
                    removeEmptyMessages();
                    break;
                }
              } catch (parseErr) {
                console.warn('Failed to parse SSE message:', line);
              }
            }
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get response';
      setError(errorMsg);
      addLog('error', errorMsg);
      removeEmptyMessages();
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleNewSession = () => {
    startNewSession();
    setError(null);
    setErrorTrace(null);
    // Reset custom inputs/outputs for new session
    setCustomInputsJson('');
    setCustomInputsManuallySet(false);
    setCustomOutputs(null);
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatLogTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getLogIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return <XCircle className="w-3 h-3 text-red-400" />;
      case 'warning':
        return <AlertCircle className="w-3 h-3 text-amber-400" />;
      case 'debug':
        return <Terminal className="w-3 h-3 text-slate-500" />;
      default:
        return <Info className="w-3 h-3 text-blue-400" />;
    }
  };

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-amber-400';
      case 'debug':
        return 'text-slate-500';
      default:
        return 'text-slate-300';
    }
  };

  // Filter out empty assistant messages for display
  const displayMessages = messages.filter(m => m.content || m.role === 'user');
  const hasEmptyStreamingMessage = messages.length > 0 && 
    messages[messages.length - 1].role === 'assistant' && 
    !messages[messages.length - 1].content;

  return (
    <div className="flex flex-col h-[70vh]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
            <MessageSquare className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-100">Local Agent Chat</h3>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Testing {config.app?.name || 'your agent'} locally</span>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-1" title={`Conversation ID: ${conversationId}`}>
                <Hash className="w-3 h-3" />
                <span className="font-mono">{conversationId.slice(-8)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleNewSession}
            title="Start a new conversation"
          >
            <Plus className="w-4 h-4" />
            New Session
          </Button>
        </div>
      </div>

      {/* Credentials Configuration */}
      <div className="border-b border-slate-700">
        <button
          onClick={() => setCredentialsExpanded(!credentialsExpanded)}
          className="w-full flex items-center justify-between p-2 text-xs hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Authentication:</span>
            <span className="text-slate-300">
              {credentialType === 'obo' && 'On-Behalf-Of Token'}
              {credentialType === 'manual_sp' && 'Service Principal'}
              {credentialType === 'manual_pat' && 'Personal Access Token'}
            </span>
            {!hasCredentials() && credentialType !== 'obo' && (
              <span className="text-amber-400 text-xs">(not configured)</span>
            )}
          </div>
          {credentialsExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>
        
        {credentialsExpanded && (
          <div className="p-3 bg-slate-800/30 space-y-3">
            <div className="flex gap-2">
              {(['obo', 'manual_sp', 'manual_pat'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setCredentialType(type)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    credentialType === type
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'bg-slate-700/50 text-slate-400 border border-slate-600 hover:bg-slate-700'
                  }`}
                >
                  {type === 'obo' && 'OBO Token'}
                  {type === 'manual_sp' && 'Service Principal'}
                  {type === 'manual_pat' && 'PAT'}
                </button>
              ))}
            </div>
            
            {credentialType === 'obo' && (
              <p className="text-xs text-slate-500">
                Uses the On-Behalf-Of token from Databricks Apps. This may have limited scopes.
              </p>
            )}
            
            {credentialType === 'manual_sp' && (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Client ID"
                  value={manualClientId}
                  onChange={(e) => setManualClientId(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
                <input
                  type="password"
                  placeholder="Client Secret"
                  value={manualClientSecret}
                  onChange={(e) => setManualClientSecret(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            )}
            
            {credentialType === 'manual_pat' && (
              <input
                type="password"
                placeholder="Personal Access Token"
                value={manualPat}
                onChange={(e) => setManualPat(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            )}
          </div>
        )}
      </div>

      {/* Custom Inputs Configuration */}
      <div className="border-b border-slate-700">
        <button
          onClick={() => setCustomInputsExpanded(!customInputsExpanded)}
          className="w-full flex items-center justify-between p-2 text-xs hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Hash className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Custom Inputs:</span>
            <span className="text-slate-300">
              {customInputsJson.trim() ? 'Configured' : 'None'}
            </span>
            {customInputsError && (
              <span className="text-red-400 text-xs">({customInputsError})</span>
            )}
          </div>
          {customInputsExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>
        
        {customInputsExpanded && (
          <div className="p-3 bg-slate-800/30 space-y-2">
            <p className="text-xs text-slate-500">
              Optional JSON object to pass as custom_inputs to the agent.
              Example: {`{"genie_conversation_ids": {"my_room": "abc123"}}`}
            </p>
            <textarea
              value={customInputsJson}
              onChange={(e) => {
                setCustomInputsJson(e.target.value);
                setCustomInputsError(null);
                setCustomInputsManuallySet(true);
              }}
              placeholder='{"key": "value"}'
              rows={3}
              className={`w-full px-3 py-2 text-sm bg-slate-900 border rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 font-mono ${
                customInputsError
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-slate-600 focus:ring-cyan-500'
              }`}
            />
            {!customInputsManuallySet && customInputsJson && (
              <p className="text-xs text-cyan-400 mt-1">
                ↻ Auto-populated from previous response
              </p>
            )}
          </div>
        )}
      </div>

      {/* Not Ready Warning */}
      {!canChat && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-6 max-w-md">
            <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-100 mb-2">
              Configuration Required
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              To chat with your agent locally, you need to:
            </p>
            <ul className="text-sm text-slate-400 text-left space-y-2">
              {!hasAgents && (
                <li className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  Add at least one agent
                </li>
              )}
              {!hasOrchestration && (
                <li className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  Configure orchestration (Supervisor or Swarm)
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Messages Area */}
      {canChat && (
        <>
          <div className={`flex-1 overflow-y-auto py-4 space-y-4 min-h-0 ${logsExpanded ? 'max-h-[30vh]' : ''}`}>
            {displayMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="w-16 h-16 text-slate-600 mb-4" />
                <h4 className="text-lg font-medium text-slate-300 mb-2">
                  Start a Conversation
                </h4>
                <p className="text-sm text-slate-500 max-w-sm">
                  Test your agent configuration locally. Messages are processed 
                  using the dao-ai library without deploying to an endpoint.
                </p>
                <p className="text-xs text-slate-600 mt-4">
                  Your chat history will be preserved when you close this panel.
                </p>
              </div>
            ) : (
              displayMessages.map((message, index) => (
                <div
                  key={`${message.timestamp}-${index}`}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'flex-row-reverse' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                    message.role === 'user'
                      ? 'bg-blue-500/20'
                      : 'bg-gradient-to-br from-cyan-500/20 to-purple-500/20'
                  }`}>
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-blue-400" />
                    ) : (
                      <Bot className="w-4 h-4 text-cyan-400" />
                    )}
                  </div>
                  
                  {/* Message Bubble */}
                  <div className={`flex flex-col max-w-[80%] ${
                    message.role === 'user' ? 'items-end' : 'items-start'
                  }`}>
                    <div className={`px-4 py-3 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-slate-800 text-slate-100 rounded-bl-md border border-slate-700'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 px-1">
                      {formatTime(message.timestamp)}
                    </span>
                    {/* Render visualizations after the last assistant message */}
                    {message.role === 'assistant' &&
                      index === displayMessages.length - 1 &&
                      customOutputs &&
                      Array.isArray((customOutputs as Record<string, unknown>).visualizations) &&
                      ((customOutputs as Record<string, unknown>).visualizations as Array<{ spec: object }>).map((viz, vizIdx) => (
                        <VegaLiteChart key={vizIdx} spec={viz.spec as any} />
                      ))}
                  </div>
                </div>
              ))
            )}
            
            {/* Loading Indicator - show when streaming but no content yet */}
            {isLoading && hasEmptyStreamingMessage && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    <span className="text-sm text-slate-400">Generating response...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Error Display */}
          {error && (
            <div className="px-4 py-3 bg-red-950/30 border border-red-800 rounded-lg mb-4">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-300">{error}</span>
              </div>
              {errorTrace && (
                <details className="mt-2">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
                    Show details
                  </summary>
                  <pre className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-400 overflow-x-auto max-h-32">
                    {errorTrace}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Input Area */}
          <div className="pt-4 border-t border-slate-700">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  rows={1}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 resize-none disabled:opacity-50"
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                />
              </div>
              <Button
                variant="primary"
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="self-end bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-slate-600 mt-2 text-center">
              Press Enter to send • Shift+Enter for new line
            </p>
          </div>

          {/* Custom Outputs Display */}
          {customOutputs && Object.keys(customOutputs).length > 0 && (
            <div className="mt-4 border border-emerald-500/30 rounded-lg overflow-hidden">
              <button
                onClick={() => setCustomOutputsExpanded(!customOutputsExpanded)}
                className="w-full flex items-center justify-between px-4 py-2 bg-emerald-900/20 hover:bg-emerald-900/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-300">Custom Outputs</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-400 rounded">
                    {Object.keys(customOutputs).length} {Object.keys(customOutputs).length === 1 ? 'key' : 'keys'}
                  </span>
                </div>
                {customOutputsExpanded ? (
                  <ChevronDown className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-emerald-400" />
                )}
              </button>
              
              {customOutputsExpanded && (
                <div className="p-3 bg-emerald-900/10 max-h-40 overflow-y-auto">
                  <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap">
                    {JSON.stringify(customOutputs, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Collapsible Logs Panel */}
          <div className="mt-4 border border-slate-700 rounded-lg overflow-hidden">
            {/* Logs Header - Always Visible */}
            <button
              onClick={() => setLogsExpanded(!logsExpanded)}
              className="w-full flex items-center justify-between px-4 py-2 bg-slate-800/50 hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-300">Application Logs</span>
                {logs.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-700 text-slate-400 rounded">
                    {logs.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {logs.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      clearLogs();
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1"
                  >
                    Clear
                  </button>
                )}
                {logsExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {/* Logs Content - Collapsible */}
            {logsExpanded && (
              <div className="bg-slate-900/50 max-h-40 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <Terminal className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-600">No logs yet. Send a message to see activity.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {logs.map((log, index) => (
                      <div key={index} className="px-4 py-2 flex items-start gap-2 hover:bg-slate-800/30">
                        <span className="text-[10px] text-slate-600 font-mono whitespace-nowrap pt-0.5">
                          {formatLogTime(log.timestamp)}
                        </span>
                        <div className="pt-0.5">
                          {getLogIcon(log.level)}
                        </div>
                        <span className={`text-xs font-mono flex-1 ${getLogColor(log.level)}`}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      {onClose && (
        <div className="pt-4 mt-4 border-t border-slate-700 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
