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
  Hash
} from 'lucide-react';
import { useConfigStore } from '@/stores/configStore';
import { useChatStore, LogEntry } from '@/stores/chatStore';
import Button from '../ui/Button';

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
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTrace, setErrorTrace] = useState<string | null>(null);
  const [logsExpanded, setLogsExpanded] = useState(false);
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

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          messages: apiMessages,
          context: {
            thread_id: conversationId,
            user_id: 'builder-user'
          }
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
