import type { IndentSize } from './preferences';

const getIndentColumns = (leadingWhitespace: string, tabSize: IndentSize): number => {
  let columns = 0;

  for (const character of leadingWhitespace) {
    columns += character === '\t' ? tabSize : 1;
  }

  return columns;
};

/**
 * Remaps leading indentation while preserving any irregular remainder columns.
 * This keeps user-selected indentation consistent across formatters that emit
 * a canonical indent width internally.
 */
export const reindentText = (
  text: string,
  fromIndentSize: IndentSize,
  toIndentSize: IndentSize,
): string => {
  if (!text || fromIndentSize === toIndentSize) {
    return text;
  }

  return text.replace(/^[ \t]+/gm, (leadingWhitespace) => {
    const totalColumns = getIndentColumns(leadingWhitespace, fromIndentSize);
    const indentLevels = Math.floor(totalColumns / fromIndentSize);
    const remainingColumns = totalColumns % fromIndentSize;
    const remappedColumns = indentLevels * toIndentSize + remainingColumns;

    return ' '.repeat(remappedColumns);
  });
};
