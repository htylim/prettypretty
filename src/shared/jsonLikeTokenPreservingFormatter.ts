import type { IndentSize } from './preferences';

type PunctuationToken = '{' | '}' | '[' | ']' | ':' | ',';
type QuoteCharacter = '"' | "'";

type Token =
  | {
      kind: 'punctuation';
      raw: PunctuationToken;
    }
  | {
      kind: 'quoted';
      raw: string;
      quote: QuoteCharacter;
    }
  | {
      kind: 'atom';
      raw: string;
    };

const PUNCTUATION_CHARACTERS = new Set<PunctuationToken>(['{', '}', '[', ']', ':', ',']);

const isPunctuationCharacter = (character: string): character is PunctuationToken => {
  return PUNCTUATION_CHARACTERS.has(character as PunctuationToken);
};

const isWhitespaceCharacter = (character: string): boolean => /\s/u.test(character);

const scanQuotedToken = (
  inputText: string,
  startIndex: number,
  quote: QuoteCharacter,
): { token: Token; nextIndex: number } | null => {
  let raw = quote;
  let index = startIndex + 1;
  let escapeNextCharacter = false;

  while (index < inputText.length) {
    const currentCharacter = inputText[index];
    if (currentCharacter === undefined) {
      break;
    }

    raw += currentCharacter;

    // Reindent only remaps leading whitespace, so any raw newline inside a
    // token-preserved quoted payload would be unsafe to rewrite later.
    if (currentCharacter === '\n' || currentCharacter === '\r') {
      return null;
    }

    if (escapeNextCharacter) {
      escapeNextCharacter = false;
      index += 1;
      continue;
    }

    if (currentCharacter === '\\') {
      escapeNextCharacter = true;
      index += 1;
      continue;
    }

    if (currentCharacter === quote) {
      return {
        token: {
          kind: 'quoted',
          raw,
          quote,
        },
        nextIndex: index + 1,
      };
    }

    index += 1;
  }

  return {
    token: {
      kind: 'quoted',
      raw,
      quote,
    },
    nextIndex: inputText.length,
  };
};

const scanTokens = (inputText: string): Token[] | null => {
  const tokens: Token[] = [];
  let index = 0;

  while (index < inputText.length) {
    const currentCharacter = inputText[index];
    if (currentCharacter === undefined) {
      break;
    }

    if (isWhitespaceCharacter(currentCharacter)) {
      index += 1;
      continue;
    }

    if (
      currentCharacter === '/' &&
      (inputText[index + 1] === '/' || inputText[index + 1] === '*')
    ) {
      return null;
    }

    if (isPunctuationCharacter(currentCharacter)) {
      tokens.push({
        kind: 'punctuation',
        raw: currentCharacter,
      });
      index += 1;
      continue;
    }

    if (currentCharacter === '"' || currentCharacter === "'") {
      const quotedToken = scanQuotedToken(inputText, index, currentCharacter);
      if (!quotedToken) {
        return null;
      }

      tokens.push(quotedToken.token);
      index = quotedToken.nextIndex;
      continue;
    }

    if (currentCharacter === '`') {
      return null;
    }

    let atomEnd = index + 1;
    while (atomEnd < inputText.length) {
      const atomCharacter = inputText[atomEnd];
      if (
        atomCharacter === undefined ||
        isWhitespaceCharacter(atomCharacter) ||
        isPunctuationCharacter(atomCharacter) ||
        atomCharacter === '"' ||
        atomCharacter === "'" ||
        atomCharacter === '`' ||
        (atomCharacter === '/' &&
          (inputText[atomEnd + 1] === '/' || inputText[atomEnd + 1] === '*'))
      ) {
        break;
      }

      atomEnd += 1;
    }

    tokens.push({
      kind: 'atom',
      raw: inputText.slice(index, atomEnd),
    });
    index = atomEnd;
  }

  return tokens;
};

const isPunctuationToken = (
  token: Token | undefined,
  punctuation: PunctuationToken,
): token is Extract<Token, { kind: 'punctuation' }> => {
  return token?.kind === 'punctuation' && token.raw === punctuation;
};

class JsonLikeTokenPreservingFormatter {
  private readonly tokens: Token[];

  private readonly indentSize: IndentSize;

  private index = 0;

  constructor(tokens: Token[], indentSize: IndentSize) {
    this.tokens = tokens;
    this.indentSize = indentSize;
  }

  format(): string | null {
    const rootToken = this.peek();
    if (!rootToken) {
      return null;
    }

    const outputText =
      isPunctuationToken(rootToken, '{') || isPunctuationToken(rootToken, '[')
        ? this.formatValue(0)
        : null;

    if (outputText === null || this.index !== this.tokens.length) {
      return null;
    }

    return outputText;
  }

  private formatValue(depth: number): string | null {
    const nextToken = this.peek();
    if (!nextToken) {
      return null;
    }

    if (isPunctuationToken(nextToken, '{')) {
      return this.formatObject(depth);
    }

    if (isPunctuationToken(nextToken, '[')) {
      return this.formatArray(depth);
    }

    if (nextToken.kind === 'quoted' || nextToken.kind === 'atom') {
      this.index += 1;
      return nextToken.raw;
    }

    return null;
  }

  private formatObject(depth: number): string | null {
    if (!this.consumePunctuation('{')) {
      return null;
    }

    const fragments = ['{'];
    let hasMembers = false;

    while (true) {
      const nextToken = this.peek();
      if (!nextToken) {
        return fragments.join('');
      }

      if (isPunctuationToken(nextToken, '}')) {
        this.index += 1;
        if (hasMembers) {
          fragments.push(this.createIndentedLine(depth));
        }
        fragments.push('}');
        return fragments.join('');
      }

      if (!this.isObjectKeyToken(nextToken)) {
        return null;
      }

      fragments.push(this.createIndentedLine(depth + 1), nextToken.raw);
      this.index += 1;
      hasMembers = true;

      if (this.consumePunctuation(':')) {
        fragments.push(':');

        const valueStart = this.peek();
        if (
          valueStart !== undefined &&
          !isPunctuationToken(valueStart, ',') &&
          !isPunctuationToken(valueStart, '}')
        ) {
          const formattedValue = this.formatValue(depth + 1);
          if (formattedValue === null) {
            return null;
          }

          fragments.push(' ', formattedValue);
        }
      }

      const separator = this.peek();
      if (!separator) {
        return fragments.join('');
      }

      if (isPunctuationToken(separator, ',')) {
        this.index += 1;
        fragments.push(',');
        continue;
      }

      if (isPunctuationToken(separator, '}')) {
        continue;
      }

      // Missing separators stay missing. Keep the token stream intact and let
      // the next loop iteration reinterpret the next token as a sibling.
    }
  }

  private formatArray(depth: number): string | null {
    if (!this.consumePunctuation('[')) {
      return null;
    }

    const fragments = ['['];
    let hasValues = false;

    while (true) {
      const nextToken = this.peek();
      if (!nextToken) {
        return fragments.join('');
      }

      if (isPunctuationToken(nextToken, ']')) {
        this.index += 1;
        if (hasValues) {
          fragments.push(this.createIndentedLine(depth));
        }
        fragments.push(']');
        return fragments.join('');
      }

      const formattedValue = this.formatValue(depth + 1);
      if (formattedValue === null) {
        return null;
      }

      fragments.push(this.createIndentedLine(depth + 1), formattedValue);
      hasValues = true;

      const separator = this.peek();
      if (!separator) {
        return fragments.join('');
      }

      if (isPunctuationToken(separator, ',')) {
        this.index += 1;
        fragments.push(',');
        continue;
      }

      if (isPunctuationToken(separator, ']')) {
        continue;
      }

      // Missing commas stay missing. The next iteration starts a new line for
      // the next sibling without inventing separator punctuation.
    }
  }

  private consumePunctuation(punctuation: PunctuationToken): boolean {
    if (!isPunctuationToken(this.peek(), punctuation)) {
      return false;
    }

    this.index += 1;
    return true;
  }

  private createIndentedLine(depth: number): string {
    return `\n${' '.repeat(depth * this.indentSize)}`;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private peekAhead(offset: number): Token | undefined {
    return this.tokens[this.index + offset];
  }

  private isObjectKeyToken(
    token: Token | undefined,
  ): token is Extract<Token, { kind: 'quoted' | 'atom' }> {
    if (token?.kind === 'quoted') {
      return true;
    }

    return token?.kind === 'atom' && isPunctuationToken(this.peekAhead(1), ':');
  }
}

/**
 * Formats brace/bracket-delimited JSON-like input without changing the
 * non-whitespace token stream. Unsupported constructs return `null` so the
 * caller can keep the existing failed/fallback path.
 */
export const tryFormatJsonLikeTokenPreserving = (
  inputText: string,
  indentSize: IndentSize,
): string | null => {
  const trimmedInput = inputText.trim();
  if (!trimmedInput.startsWith('{') && !trimmedInput.startsWith('[')) {
    return null;
  }

  const tokens = scanTokens(trimmedInput);
  if (!tokens || tokens.length === 0) {
    return null;
  }

  const formattedOutput = new JsonLikeTokenPreservingFormatter(tokens, indentSize).format();
  if (formattedOutput === null) {
    return null;
  }

  const outputTokens = scanTokens(formattedOutput);
  if (!outputTokens) {
    return null;
  }

  const inputTokenStream = tokens.map((token) => token.raw).join('');
  const outputTokenStream = outputTokens.map((token) => token.raw).join('');

  return inputTokenStream === outputTokenStream ? formattedOutput : null;
};
