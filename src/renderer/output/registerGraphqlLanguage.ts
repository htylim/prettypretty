import type * as Monaco from 'monaco-editor';

let isGraphqlLanguageRegistered = false;

const GRAPHQL_KEYWORDS = [
  'query',
  'mutation',
  'subscription',
  'fragment',
  'on',
  'schema',
  'type',
  'interface',
  'input',
  'scalar',
  'enum',
  'union',
  'directive',
  'extend',
  'implements',
  'repeatable',
  'true',
  'false',
  'null',
] as const;

export const registerGraphqlLanguage = (monaco: typeof Monaco): void => {
  if (isGraphqlLanguageRegistered) {
    return;
  }

  if (
    !monaco.languages?.register ||
    !monaco.languages.setLanguageConfiguration ||
    !monaco.languages.setMonarchTokensProvider
  ) {
    return;
  }

  monaco.languages.register({ id: 'graphql' });
  monaco.languages.setLanguageConfiguration('graphql', {
    comments: { lineComment: '#' },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
  });
  monaco.languages.setMonarchTokensProvider('graphql', {
    keywords: [...GRAPHQL_KEYWORDS],
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/\s+/, 'white'],
        [/\.\.\./, 'keyword'],
        [/[{}()[\]]/, '@brackets'],
        [/[,:]/, 'delimiter'],
        [/[!&|=]/, 'operator'],
        [/@[A-Za-z_]\w*/, 'annotation'],
        [/\$[A-Za-z_]\w*/, 'variable'],
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
        [/\b(?:true|false|null)\b/, 'constant.language'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/[A-Z][\w]*/, 'type.identifier'],
        [
          /[A-Za-z_]\w*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier',
            },
          },
        ],
      ],
    },
  });

  isGraphqlLanguageRegistered = true;
};
