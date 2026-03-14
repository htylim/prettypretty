import type { editor } from 'monaco-editor';
import type { IndentSize } from '../../shared/preferences';

export const OUTPUT_EDITOR_FONT_FAMILY = 'SFMono-Regular, Menlo, Consolas, monospace';
export const OUTPUT_EDITOR_FONT_SIZE = 15;
export const OUTPUT_EDITOR_LINE_HEIGHT = 23;

export const getLineNumbersOption = (): editor.LineNumbersType => 'on';

const getSharedEditorOptions = (
  indentSize: IndentSize,
): editor.IStandaloneEditorConstructionOptions => ({
  minimap: { enabled: true },
  lineNumbers: getLineNumbersOption(),
  glyphMargin: true,
  folding: true,
  showFoldingControls: 'always',
  guides: {
    indentation: true,
    bracketPairs: true,
    bracketPairsHorizontal: false,
    highlightActiveIndentation: false,
  },
  bracketPairColorization: {
    enabled: true,
    independentColorPoolPerBracketType: true,
  },
  renderValidationDecorations: 'off',
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: 'off',
  parameterHints: { enabled: false },
  hover: { enabled: false },
  contextmenu: false,
  wordWrap: 'off',
  fontFamily: OUTPUT_EDITOR_FONT_FAMILY,
  fontSize: OUTPUT_EDITOR_FONT_SIZE,
  lineHeight: OUTPUT_EDITOR_LINE_HEIGHT,
  tabSize: indentSize,
  insertSpaces: true,
  detectIndentation: false,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  scrollbar: {
    horizontal: 'auto',
    vertical: 'auto',
  },
});

export const getOutputEditorOptions = (
  indentSize: IndentSize,
): editor.IStandaloneEditorConstructionOptions => ({
  ...getSharedEditorOptions(indentSize),
  glyphMargin: false,
  showFoldingControls: 'never',
  readOnly: true,
  domReadOnly: true,
});

export const getInputEditorOptions = (
  indentSize: IndentSize,
): editor.IStandaloneEditorConstructionOptions => ({
  ...getSharedEditorOptions(indentSize),
  readOnly: false,
  domReadOnly: false,
});
