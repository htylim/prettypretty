import { detectOutputLanguage } from '../output/detectOutputLanguage';

const PYTHON_TOKEN_HINT = /\b(True|False|None|def|class|import|from|lambda)\b/;
const PYTHON_DICT_KEY_HINT = /'[^'\n]+'\s*:/;
const GRAPHQL_OPERATION_HINT = /^\s*(query|mutation|subscription|fragment)\b/i;
const GRAPHQL_DISTINCT_SCHEMA_HINT =
  /^\s*(schema|type|input|scalar|enum|union|directive|extend)\b/m;
const GRAPHQL_AMBIGUOUS_SCHEMA_HINT = /^\s*interface\b/m;
const GRAPHQL_TYPE_ALIAS_HINT = /^\s*type\s+[A-Za-z_]\w*\s*=/m;
const GRAPHQL_SCHEMA_ONLY_SIGNAL =
  /!\s*(?:[#\n\r)}]|$)|@[A-Za-z_]\w*|^\s*[A-Za-z_][\w]*\s*\([^)]*\)\s*:/m;

const looksLikeGraphqlForFallback = (trimmedText: string): boolean => {
  const detectedLanguage = detectOutputLanguage(trimmedText);
  const startsWithAmbiguousSchemaKeyword = GRAPHQL_AMBIGUOUS_SCHEMA_HINT.test(trimmedText);

  if (detectedLanguage === 'graphql' && !startsWithAmbiguousSchemaKeyword) {
    return true;
  }

  if (GRAPHQL_OPERATION_HINT.test(trimmedText)) {
    return true;
  }

  if (GRAPHQL_TYPE_ALIAS_HINT.test(trimmedText)) {
    return false;
  }

  if (GRAPHQL_DISTINCT_SCHEMA_HINT.test(trimmedText)) {
    return true;
  }

  if (!startsWithAmbiguousSchemaKeyword) {
    return false;
  }

  return GRAPHQL_SCHEMA_ONLY_SIGNAL.test(trimmedText);
};

export const detectFallbackFormatLabel = (inputText: string): string => {
  const trimmedText = inputText.trim();
  if (!trimmedText) {
    return 'text';
  }

  if (PYTHON_TOKEN_HINT.test(trimmedText) || PYTHON_DICT_KEY_HINT.test(trimmedText)) {
    return 'Python';
  }

  if (looksLikeGraphqlForFallback(trimmedText)) {
    return 'GraphQL';
  }

  if (GRAPHQL_AMBIGUOUS_SCHEMA_HINT.test(trimmedText)) {
    return 'TypeScript';
  }

  if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
    return 'JSON';
  }

  const detectedLanguage = detectOutputLanguage(trimmedText);

  switch (detectedLanguage) {
    case 'json':
      return 'JSON';
    case 'graphql':
      return 'GraphQL';
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
