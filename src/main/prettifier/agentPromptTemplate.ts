import { AGENT_PROMPT_TOKEN_INDENT_SIZE, AGENT_PROMPT_TOKEN_INPUT } from '../../shared/preferences';

export const renderAgentPromptTemplate = (
  promptTemplate: string,
  inputText: string,
  indentSize: number,
): string => {
  return promptTemplate
    .replaceAll(AGENT_PROMPT_TOKEN_INPUT, inputText)
    .replaceAll(AGENT_PROMPT_TOKEN_INDENT_SIZE, indentSize.toString());
};
