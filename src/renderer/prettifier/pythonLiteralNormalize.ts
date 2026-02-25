const isIdentifierStart = (character: string): boolean => /[A-Za-z_]/.test(character);
const isIdentifierPart = (character: string): boolean => /[A-Za-z0-9_]/.test(character);

const normalizeIdentifier = (identifier: string): string => {
  if (identifier === 'True') {
    return 'true';
  }

  if (identifier === 'False') {
    return 'false';
  }

  if (identifier === 'None') {
    return 'null';
  }

  return identifier;
};

export const normalizePythonLiterals = (input: string): string => {
  let normalized = '';
  let index = 0;
  let inSingleQuotedString = false;
  let inDoubleQuotedString = false;
  let escapeNextCharacter = false;

  while (index < input.length) {
    const currentCharacter = input[index];
    if (currentCharacter === undefined) {
      break;
    }

    if (inSingleQuotedString || inDoubleQuotedString) {
      normalized += currentCharacter;

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

      if (inSingleQuotedString && currentCharacter === "'") {
        inSingleQuotedString = false;
      } else if (inDoubleQuotedString && currentCharacter === '"') {
        inDoubleQuotedString = false;
      }

      index += 1;
      continue;
    }

    if (currentCharacter === "'") {
      inSingleQuotedString = true;
      normalized += currentCharacter;
      index += 1;
      continue;
    }

    if (currentCharacter === '"') {
      inDoubleQuotedString = true;
      normalized += currentCharacter;
      index += 1;
      continue;
    }

    if (!isIdentifierStart(currentCharacter)) {
      normalized += currentCharacter;
      index += 1;
      continue;
    }

    let identifierEnd = index + 1;
    while (identifierEnd < input.length) {
      const identifierCharacter = input[identifierEnd];
      if (!identifierCharacter || !isIdentifierPart(identifierCharacter)) {
        break;
      }
      identifierEnd += 1;
    }

    const identifier = input.slice(index, identifierEnd);
    normalized += normalizeIdentifier(identifier);
    index = identifierEnd;
  }

  return normalized;
};
