import type { editor } from 'monaco-editor';

export const PRETTYPRETTY_LIGHT_THEME = 'prettypretty-light';
export const PRETTYPRETTY_DARK_THEME = 'prettypretty-dark';

let areThemesRegistered = false;

export const registerMonacoThemes = (monaco: typeof import('monaco-editor')): void => {
  if (areThemesRegistered) {
    return;
  }

  const lightTheme: editor.IStandaloneThemeData = {
    base: 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: '333333', background: 'FFFFFF' },
      { token: 'string', foreground: 'A31515' },
      { token: 'number', foreground: '098658' },
      { token: 'keyword', foreground: '0000FF' },
      { token: 'type', foreground: '267F99' },
      { token: 'comment', foreground: '008000' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#333333',
      'editorLineNumber.foreground': '#237893',
      'editorLineNumber.activeForeground': '#0B216F',
      'editorGutter.background': '#FFFFFF',
      'editorIndentGuide.background1': '#D8C1AA',
      'editorIndentGuide.activeBackground1': '#AE6E3A',
      'editorBracketHighlight.foreground1': '#A55A20',
      'editorBracketHighlight.foreground2': '#176A7A',
      'editorBracketHighlight.foreground3': '#2E7D32',
      'editorBracketHighlight.foreground4': '#8A3FA8',
      'editorBracketHighlight.foreground5': '#B04A62',
      'editorBracketHighlight.foreground6': '#3568C0',
      'editorBracketPairGuide.background1': '#A55A2055',
      'editorBracketPairGuide.background2': '#176A7A55',
      'editorBracketPairGuide.background3': '#2E7D3255',
      'editorBracketPairGuide.background4': '#8A3FA855',
      'editorBracketPairGuide.background5': '#B04A6255',
      'editorBracketPairGuide.background6': '#3568C055',
      'editorBracketPairGuide.activeBackground1': '#A55A20B5',
      'editorBracketPairGuide.activeBackground2': '#176A7AB5',
      'editorBracketPairGuide.activeBackground3': '#2E7D32B5',
      'editorBracketPairGuide.activeBackground4': '#8A3FA8B5',
      'editorBracketPairGuide.activeBackground5': '#B04A62B5',
      'editorBracketPairGuide.activeBackground6': '#3568C0B5',
    },
  };

  const darkTheme: editor.IStandaloneThemeData = {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'D4D4D4', background: '1E1E1E' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'keyword', foreground: '569CD6' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'comment', foreground: '6A9955' },
    ],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#D4D4D4',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#C6C6C6',
      'editorGutter.background': '#1E1E1E',
      'editorIndentGuide.background1': '#3C3C3C',
      'editorIndentGuide.activeBackground1': '#3794FF',
      'editorBracketHighlight.foreground1': '#FFD700',
      'editorBracketHighlight.foreground2': '#DA70D6',
      'editorBracketHighlight.foreground3': '#87CEFA',
      'editorBracketHighlight.foreground4': '#7CFC00',
      'editorBracketHighlight.foreground5': '#FF7F50',
      'editorBracketHighlight.foreground6': '#40E0D0',
      'editorBracketPairGuide.background1': '#FFD70044',
      'editorBracketPairGuide.background2': '#DA70D644',
      'editorBracketPairGuide.background3': '#87CEFA44',
      'editorBracketPairGuide.background4': '#7CFC0044',
      'editorBracketPairGuide.background5': '#FF7F5044',
      'editorBracketPairGuide.background6': '#40E0D044',
      'editorBracketPairGuide.activeBackground1': '#FFD700AA',
      'editorBracketPairGuide.activeBackground2': '#DA70D6AA',
      'editorBracketPairGuide.activeBackground3': '#87CEFAAA',
      'editorBracketPairGuide.activeBackground4': '#7CFC00AA',
      'editorBracketPairGuide.activeBackground5': '#FF7F50AA',
      'editorBracketPairGuide.activeBackground6': '#40E0D0AA',
    },
  };

  monaco.editor.defineTheme(PRETTYPRETTY_LIGHT_THEME, lightTheme);
  monaco.editor.defineTheme(PRETTYPRETTY_DARK_THEME, darkTheme);
  areThemesRegistered = true;
};
