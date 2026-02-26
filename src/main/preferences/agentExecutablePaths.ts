import { existsSync } from 'node:fs';

export const CODEX_APP_EXECUTABLE_PATH = '/Applications/Codex.app/Contents/Resources/codex';

export const AMP_APP_EXECUTABLE_PATH = '/Applications/Amp.app/Contents/Resources/amp';

type ExecutableResolutionInput = {
  agentId: string;
  executable: string;
};

const hasPathSeparator = (value: string): boolean => {
  return value.includes('/');
};

export const resolvePreferredAgentExecutable = ({
  agentId,
  executable,
}: ExecutableResolutionInput): string => {
  if (hasPathSeparator(executable)) {
    return executable;
  }

  if (process.platform !== 'darwin') {
    return executable;
  }

  if (agentId === 'codex' && executable === 'codex' && existsSync(CODEX_APP_EXECUTABLE_PATH)) {
    return CODEX_APP_EXECUTABLE_PATH;
  }

  if (agentId === 'amp' && executable === 'amp' && existsSync(AMP_APP_EXECUTABLE_PATH)) {
    return AMP_APP_EXECUTABLE_PATH;
  }

  return executable;
};
