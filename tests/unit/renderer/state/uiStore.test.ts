import { describe, expect, it } from 'vitest';
import { useUiStore } from '../../../../src/renderer/state/uiStore';

describe('uiStore', () => {
  it('toggles pane and theme modes', () => {
    useUiStore.setState({
      paneMode: 'input',
      themeMode: 'light',
      indentSize: 2,
      inputText: '',
    });

    useUiStore.getState().togglePaneMode();
    useUiStore.getState().toggleThemeMode();

    expect(useUiStore.getState().paneMode).toBe('output');
    expect(useUiStore.getState().themeMode).toBe('dark');
  });

  it('reset clears content and returns to input mode', () => {
    useUiStore.setState({
      paneMode: 'output',
      themeMode: 'dark',
      indentSize: 6,
      inputText: 'content',
    });

    useUiStore.getState().reset();

    expect(useUiStore.getState().paneMode).toBe('input');
    expect(useUiStore.getState().inputText).toBe('');
    expect(useUiStore.getState().indentSize).toBe(6);
  });
});
