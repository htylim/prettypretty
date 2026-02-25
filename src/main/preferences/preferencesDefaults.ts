import {
  AGENT_PROMPT_TOKEN_INDENT_SIZE,
  AGENT_PROMPT_TOKEN_INPUT,
  CURRENT_PREFERENCES_VERSION,
  DEFAULT_INDENT_SIZE,
  type AgentConfig,
  type Preferences,
} from '../../shared/preferences';

const DEFAULT_AGENT_PROMPT_TEMPLATE = [
  'Prettify this text and make it more readable while preserving the original meaning and data.',
  `Use ${AGENT_PROMPT_TOKEN_INDENT_SIZE} spaces for indentation when indentation is needed.`,
  'The returned content must represent the exact same data as the input. Do not add, remove, rename, reorder, infer, translate, or normalize any values or keys; only change whitespace, line breaks, and indentation.',
  'Return only the prettified text with no explanations, wrappers, or markdown code fences.',
  '<TEXT>',
  AGENT_PROMPT_TOKEN_INPUT,
  '</TEXT>',
].join('\n');

const createDefaultAgents = (): AgentConfig[] => [
  {
    id: 'amp',
    name: 'Amp',
    executable: 'amp',
    argsTemplate: ['-x'],
    promptTemplate: DEFAULT_AGENT_PROMPT_TEMPLATE,
    promptDelivery: 'stdin',
    enabled: true,
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  },
  {
    id: 'codex',
    name: 'Codex',
    executable: 'codex',
    argsTemplate: ['exec', '--skip-git-repo-check', '-'],
    promptTemplate: DEFAULT_AGENT_PROMPT_TEMPLATE,
    promptDelivery: 'stdin',
    enabled: true,
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  },
];

export const createDefaultPreferences = (): Preferences => ({
  version: CURRENT_PREFERENCES_VERSION,
  themeMode: 'light',
  indentSize: DEFAULT_INDENT_SIZE,
  agents: createDefaultAgents(),
  fallbackAgentId: null,
});
