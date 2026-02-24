import { describe, expect, it } from 'vitest';
import {
  getInputEditorOptions,
  OUTPUT_INDENT_SIZE,
  OUTPUT_EDITOR_FONT_FAMILY,
  OUTPUT_EDITOR_FONT_SIZE,
  OUTPUT_EDITOR_LINE_HEIGHT,
  getLineNumbersOption,
  getOutputEditorOptions,
} from '../../../../src/renderer/output/outputEditorConfig';

describe('outputEditorConfig', () => {
  it('enables line numbers through a dedicated seam', () => {
    expect(getLineNumbersOption()).toBe('on');
  });

  it('returns read-only Monaco options for output mode', () => {
    const options = getOutputEditorOptions();

    expect(options.readOnly).toBe(true);
    expect(options.minimap?.enabled).toBe(true);
    expect(options.folding).toBe(true);
    expect(options.showFoldingControls).toBe('mouseover');
    expect(options.wordWrap).toBe('off');
    expect(options.renderValidationDecorations).toBe('off');
    expect(options.lineNumbers).toBe('on');
    expect(options.guides?.bracketPairsHorizontal).toBe(false);
    expect(options.tabSize).toBe(OUTPUT_INDENT_SIZE);
    expect(options.insertSpaces).toBe(true);
    expect(options.detectIndentation).toBe(false);
    expect(options.fontFamily).toBe(OUTPUT_EDITOR_FONT_FAMILY);
    expect(options.fontSize).toBe(OUTPUT_EDITOR_FONT_SIZE);
    expect(options.lineHeight).toBe(OUTPUT_EDITOR_LINE_HEIGHT);
  });

  it('returns editable Monaco options for input mode with shared visual settings', () => {
    const inputOptions = getInputEditorOptions();
    const outputOptions = getOutputEditorOptions();

    expect(inputOptions.readOnly).toBe(false);
    expect(inputOptions.domReadOnly).toBe(false);
    expect(inputOptions.lineNumbers).toBe(outputOptions.lineNumbers);
    expect(inputOptions.minimap).toEqual(outputOptions.minimap);
    expect(inputOptions.folding).toBe(outputOptions.folding);
    expect(inputOptions.wordWrap).toBe(outputOptions.wordWrap);
    expect(inputOptions.tabSize).toBe(OUTPUT_INDENT_SIZE);
    expect(inputOptions.insertSpaces).toBe(true);
    expect(inputOptions.detectIndentation).toBe(false);
    expect(inputOptions.fontFamily).toBe(OUTPUT_EDITOR_FONT_FAMILY);
    expect(inputOptions.fontSize).toBe(OUTPUT_EDITOR_FONT_SIZE);
    expect(inputOptions.lineHeight).toBe(OUTPUT_EDITOR_LINE_HEIGHT);
  });
});
