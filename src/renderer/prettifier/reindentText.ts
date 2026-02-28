import type { IndentSize } from '../../shared/preferences';

const getIndentColumns = (leadingWhitespace: string, tabSize: IndentSize): number => {
  let columns = 0;

  for (const character of leadingWhitespace) {
    columns += character === '\t' ? tabSize : 1;
  }

  return columns;
};

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
