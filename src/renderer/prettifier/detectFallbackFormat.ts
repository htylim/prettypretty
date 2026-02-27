import { detectOutputLanguage } from '../output/detectOutputLanguage';

const PYTHON_TOKEN_HINT = /\b(True|False|None|def|class|import|from|lambda)\b/;
const PYTHON_DICT_KEY_HINT = /'[^'\n]+'\s*:/;

export const detectFallbackFormatLabel = (inputText: string): string => {
  const trimmedText = inputText.trim();
  if (!trimmedText) {
    return 'text';
  }

  if (PYTHON_TOKEN_HINT.test(trimmedText) || PYTHON_DICT_KEY_HINT.test(trimmedText)) {
    return 'Python';
  }

  if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
    return 'JSON';
  }

  const detectedLanguage = detectOutputLanguage(trimmedText);

  switch (detectedLanguage) {
    case 'json':
      return 'JSON';
    case 'javascript':
      return 'JavaScript';
    case 'typescript':
      return 'TypeScript';
    case 'yaml':
      return 'YAML';
    case 'xml':
      return 'XML';
    case 'sql':
      return 'SQL';
    case 'markdown':
      return 'Markdown';
    default:
      return 'text';
  }
};
