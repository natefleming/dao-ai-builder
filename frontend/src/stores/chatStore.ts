import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO string for serialization
}

export interface LogEntry {
  timestamp: string; // ISO string for serialization
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
}

interface ChatState {
  // Conversation state
  conversationId: string;
  messages: ChatMessage[];
  logs: LogEntry[];
  
  // Actions
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  updateLastMessage: (content: string) => void;
  addLog: (level: LogEntry['level'], message: string) => void;
  clearLogs: () => void;
  startNewSession: () => void;
  removeEmptyMessages: () => void;
}

// Generate a unique conversation ID
const generateConversationId = (): string => {
  return `conv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      conversationId: generateConversationId(),
      messages: [],
      logs: [],
      
      addMessage: (role, content) => {
        set((state) => ({
          messages: [
            ...state.messages,
            {
              role,
              content,
              timestamp: new Date().toISOString()
            }
          ]
        }));
      },
      
      updateLastMessage: (content) => {
        set((state) => {
          const messages = [...state.messages];
          if (messages.length > 0) {
            messages[messages.length - 1] = {
              ...messages[messages.length - 1],
              content
            };
          }
          return { messages };
        });
      },
      
      addLog: (level, message) => {
        set((state) => ({
          logs: [
            ...state.logs,
            {
              timestamp: new Date().toISOString(),
              level,
              message
            }
          ]
        }));
      },
      
      clearLogs: () => {
        set({ logs: [] });
      },
      
      startNewSession: () => {
        set({
          conversationId: generateConversationId(),
          messages: [],
          logs: []
        });
      },
      
      removeEmptyMessages: () => {
        set((state) => ({
          messages: state.messages.filter(m => m.content || m.role === 'user')
        }));
      }
    }),
    {
      name: 'dao-chat-storage',
      // Only persist messages and conversationId, not logs
      partialize: (state) => ({
        conversationId: state.conversationId,
        messages: state.messages
      })
    }
  )
);

