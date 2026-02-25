import type { ThemeMode } from './types';

export type PreferencesVersion = 2;

export const CURRENT_PREFERENCES_VERSION: PreferencesVersion = 2;
export type IndentSize = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const DEFAULT_INDENT_SIZE: IndentSize = 2;

export const AGENT_PROMPT_TOKEN_INPUT = '{input}' as const;
export const AGENT_PROMPT_TOKEN_INDENT_SIZE = '{indentSize}' as const;
export const AGENT_PROMPT_TOKENS = [
  AGENT_PROMPT_TOKEN_INPUT,
  AGENT_PROMPT_TOKEN_INDENT_SIZE,
] as const;

export type AgentPromptToken = (typeof AGENT_PROMPT_TOKENS)[number];
export type AgentPromptDelivery = 'arg' | 'stdin';

export type AgentConfig = {
  id: string;
  name: string;
  executable: string;
  argsTemplate: string[];
  promptTemplate: string;
  promptDelivery: AgentPromptDelivery;
  enabled: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
};

export type Preferences = {
  version: PreferencesVersion;
  themeMode: ThemeMode;
  indentSize: IndentSize;
  agents: AgentConfig[];
  fallbackAgentId: string | null;
};

export type PreferencesPatch = Partial<
  Pick<Preferences, 'themeMode' | 'indentSize' | 'agents' | 'fallbackAgentId'>
>;
