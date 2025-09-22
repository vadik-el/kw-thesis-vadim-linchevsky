export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  attachments?: Attachment[];
}

export interface Attachment {
  name: string;
  size: number;
  type: string;
  url?: string;
}

import { ClaudeModel } from '../constants/models';

export interface ChatOptions {
  sessionId?: string;
  model?: ClaudeModel;
  temperature?: number;
  maxTokens?: number;
  enableMemory?: boolean;
  documentContext?: string;
  personaId?: string;
  enableDeepThinking?: boolean;
}

export interface Memory {
  id: string;
  type: 'fact' | 'context' | 'preference' | 'calculation';
  content: string;
  metadata: {
    confidence: number;
    source: string;
    timestamp: Date;
    references: string[];
  };
  embedding?: number[];
}

export interface SystemPrompt {
  id: string;
  name: string;
  content: string;
  isActive: boolean;
  category: 'trading' | 'analysis' | 'general' | 'custom';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ModelSettings {
  model: ClaudeModel;
  temperature: number;
  maxTokens: number;
}

export interface MemorySettings {
  enabled: boolean;
  ttl: number; // seconds
  maxMemories: number;
}

export interface UserSettings {
  systemPrompts: SystemPrompt[];
  activePromptId: string | null;
  modelSettings: ModelSettings;
  memorySettings: MemorySettings;
}

export interface ChatSession {
  id: string;
  userId?: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  settings?: UserSettings;
}