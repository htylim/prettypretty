export type OutputLanguageId =
  | 'json'
  | 'javascript'
  | 'typescript'
  | 'yaml'
  | 'xml'
  | 'sql'
  | 'markdown'
  | 'plaintext';

const SQL_START = /^\s*(select|insert|update|delete|create|alter|drop|truncate|with|merge)\b/i;
const XML_START = /^\s*<(\?xml\b|[a-zA-Z_][\w:.-]*)(\s|>|\/>)/;
const MARKDOWN_HINT = /^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|```|~~~)|\[[^\]]+\]\([^)]+\)/m;
const YAML_HINT = /^(\s*---\s*$|\s*[a-zA-Z0-9_-]+\s*:\s*.+)$/m;

const looksLikeJsonByParse = (trimmedText: string): boolean => {
  try {
    const parsed = JSON.parse(trimmedText);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
};

const looksLikeNdjson = (trimmedText: string): boolean => {
  const lines = trimmedText.split(/\r?\n/u).filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return false;
  }

  try {
    for (const line of lines) {
      JSON.parse(line) as unknown;
    }

    return true;
  } catch {
    return false;
  }
};

const hasJsonStructuralHints = (trimmedText: string): boolean => {
  const hasQuotes = /"/.test(trimmedText);
  const hasColon = /:/.test(trimmedText);
  const hasComma = /,/.test(trimmedText);
  const hasClosing = /[\]}]/.test(trimmedText);
  return hasClosing && (hasQuotes || hasColon || hasComma);
};

const looksLikeJsonHeuristic = (trimmedText: string): boolean => {
  const startsWithObjectOrArray = trimmedText.startsWith('{') || trimmedText.startsWith('[');
  return startsWithObjectOrArray && hasJsonStructuralHints(trimmedText);
};

const looksLikeTypeScript = (trimmedText: string): boolean => {
  if (/\b(interface|type|enum|implements|readonly|namespace)\b/.test(trimmedText)) {
    return true;
  }

  return (
    /\b(const|let|function)\b[\s\S]*:\s*[A-Za-z_$][\w$<>,[\] |]*/.test(trimmedText) ||
    /\bas\s+[A-Za-z_$][\w$<>,[\] |]*/.test(trimmedText)
  );
};

const looksLikeJavaScript = (trimmedText: string): boolean =>
  /\b(const|let|var|function|=>|import|export|class|new)\b/.test(trimmedText);

const looksLikeYaml = (trimmedText: string): boolean =>
  YAML_HINT.test(trimmedText) && !/[{};]/.test(trimmedText);

const looksLikeXml = (trimmedText: string): boolean =>
  XML_START.test(trimmedText) && /<\/?[a-zA-Z_][\w:.-]*/.test(trimmedText);

const looksLikeSql = (trimmedText: string): boolean =>
  SQL_START.test(trimmedText) && /(\bfrom\b|\bwhere\b|;|\bvalues\b)/i.test(trimmedText);

const looksLikeMarkdown = (trimmedText: string): boolean => MARKDOWN_HINT.test(trimmedText);

export const detectOutputLanguage = (text: string): OutputLanguageId => {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return 'plaintext';
  }

  // Precedence is explicit so ambiguity is easy to change later.
  if (
    looksLikeJsonByParse(trimmedText) ||
    looksLikeNdjson(trimmedText) ||
    looksLikeJsonHeuristic(trimmedText)
  ) {
    return 'json';
  }

  if (looksLikeXml(trimmedText)) {
    return 'xml';
  }

  if (looksLikeSql(trimmedText)) {
    return 'sql';
  }

  if (looksLikeTypeScript(trimmedText)) {
    return 'typescript';
  }

  if (looksLikeJavaScript(trimmedText)) {
    return 'javascript';
  }

  if (looksLikeYaml(trimmedText)) {
    return 'yaml';
  }

  if (looksLikeMarkdown(trimmedText)) {
    return 'markdown';
  }

  return 'plaintext';
};
