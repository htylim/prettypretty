import { format } from 'prettier/standalone';
import * as graphqlPlugin from 'prettier/plugins/graphql';
import type { IndentSize } from './preferences';

/**
 * GraphQL formatting must preserve comments and block-string contents.
 * Prettier's GraphQL printer does both and applies the requested indentation
 * directly, so no post-format indentation remap is needed.
 */
export const prettifyGraphql = async (
  inputText: string,
  indentSize: IndentSize,
): Promise<string> => {
  const formatted = await format(inputText, {
    parser: 'graphql',
    plugins: [graphqlPlugin],
    tabWidth: indentSize,
    useTabs: false,
  });

  return formatted.replace(/\n$/, '');
};
