import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EditorShell } from '../../../../src/renderer/components/EditorShell';
import type { OutputPaneViewModel } from '../../../../src/renderer/components/OutputPaneStrip';
import type { InputEditorHandle } from '../../../../src/renderer/components/InputEditor';

vi.mock('../../../../src/renderer/components/InputEditor', async () => {
  const React = await import('react');

  return {
    InputEditor: React.forwardRef(
      (
        { value, onChange }: { value: string; onChange: (value: string) => void },
        ref: React.ForwardedRef<unknown>,
      ) => {
        void ref;
        return React.createElement('textarea', {
          'data-testid': 'input-editor',
          value,
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
        });
      },
    ),
  };
});

vi.mock('../../../../src/renderer/components/OutputPaneStrip', async () => {
  const React = await import('react');

  return {
    OutputPaneStrip: ({ panes }: { panes: OutputPaneViewModel[] }) =>
      React.createElement(
        'div',
        { 'data-testid': 'output-pane-strip' },
        panes
          .map(
            (pane) =>
              `${pane.testId}:${pane.viewRange?.startLineNumber ?? 'root'}:${pane.viewRange?.endLineNumber ?? 'root'}`,
          )
          .join('\n'),
      ),
  };
});

const createInputEditorRef = () => createRef<InputEditorHandle>();

const createOutputPanes = (): OutputPaneViewModel[] => [
  {
    paneId: 'output-root-pane',
    documentId: 'doc-1',
    viewStateKey: 'output-root-pane:doc-1',
    value: '{"a":1}',
    paneDocumentLanguage: 'json',
    viewRange: null,
    testId: 'output-editor',
  },
];

const createProps = (
  overrides: Partial<ComponentProps<typeof EditorShell>> = {},
): ComponentProps<typeof EditorShell> => ({
  paneMode: 'input',
  themeMode: 'light',
  indentSize: 2,
  inputText: '',
  outputPanes: createOutputPanes(),
  activeOutputPaneId: 'output-root-pane',
  outputLeftVisiblePaneIndex: 0,
  outputPaneFocusRequest: null,
  outputContextMenuState: null,
  ingestNotice: null,
  fallbackWaitState: null,
  inputEditorRef: createInputEditorRef(),
  onEditInputChange: vi.fn(),
  onIngestInput: vi.fn(),
  onDismissIngestNotice: vi.fn(),
  onOpenFile: vi.fn().mockResolvedValue(undefined),
  onCancelFallbackWait: vi.fn(),
  onOutputPaneHandleChange: vi.fn(),
  onOutputPaneFocus: vi.fn(),
  onOutputPaneContextMenu: vi.fn(),
  onDismissOutputContextMenu: vi.fn(),
  onTriggerOutputContextPrettify: vi.fn(),
  onNavigateOutputPaneViewport: vi.fn(),
  ...overrides,
});

describe('EditorShell', () => {
  it('renders empty state when input is empty', () => {
    const onOpenFile = vi.fn().mockResolvedValue(undefined);

    render(<EditorShell {...createProps({ onOpenFile })} />);

    const cta = screen.getByTestId('empty-state-cta');
    expect(cta).toHaveTextContent(/^Paste, Drop or Click$/);
    expect(screen.getByTestId('editor-shell')).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Click' }));
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });

  it('renders editable input editor and uses edit callback only', () => {
    const onEditInputChange = vi.fn();
    const onIngestInput = vi.fn();

    render(
      <EditorShell
        {...createProps({
          inputText: 'alpha',
          onEditInputChange,
          onIngestInput,
        })}
      />,
    );

    fireEvent.change(screen.getByTestId('input-editor'), { target: { value: 'beta' } });

    expect(onEditInputChange).toHaveBeenCalledWith('beta');
    expect(onIngestInput).not.toHaveBeenCalled();
  });

  it('routes dropped file content through ingest callback', async () => {
    const onIngestInput = vi.fn();
    const droppedFile = {
      text: vi.fn().mockResolvedValue('{"a":1}'),
    } as unknown as File;

    render(<EditorShell {...createProps({ onIngestInput })} />);

    fireEvent.drop(screen.getByTestId('editor-shell'), {
      dataTransfer: { files: [droppedFile] },
    });

    await waitFor(() => {
      expect(onIngestInput).toHaveBeenCalledWith('{"a":1}', 'drop');
    });
  });

  it('routes empty dropped file content through ingest callback', async () => {
    const onIngestInput = vi.fn();
    const droppedFile = {
      text: vi.fn().mockResolvedValue(''),
    } as unknown as File;

    render(<EditorShell {...createProps({ onIngestInput })} />);

    fireEvent.drop(screen.getByTestId('editor-shell'), {
      dataTransfer: { files: [droppedFile] },
    });

    await waitFor(() => {
      expect(onIngestInput).toHaveBeenCalledWith('', 'drop');
    });
  });

  it('routes pasted text through ingest callback', () => {
    const onIngestInput = vi.fn();

    render(<EditorShell {...createProps({ onIngestInput })} />);

    fireEvent.paste(screen.getByTestId('editor-shell'), {
      clipboardData: {
        getData: () => '{"a":1}',
      },
    });

    expect(onIngestInput).toHaveBeenCalledWith('{"a":1}', 'paste');
  });

  it('routes empty pasted text through ingest callback', () => {
    const onIngestInput = vi.fn();

    render(<EditorShell {...createProps({ onIngestInput })} />);

    fireEvent.paste(screen.getByTestId('editor-shell'), {
      clipboardData: {
        getData: () => '',
      },
    });

    expect(onIngestInput).toHaveBeenCalledWith('', 'paste');
  });

  it('ignores paste events from Monaco find widget inputs', () => {
    const onIngestInput = vi.fn();

    render(
      <EditorShell
        {...createProps({
          paneMode: 'output',
          inputText: 'alpha',
          onIngestInput,
        })}
      />,
    );

    const findWidget = document.createElement('input');
    const findWidgetWrapper = document.createElement('div');
    findWidgetWrapper.className = 'find-widget';
    findWidgetWrapper.append(findWidget);
    screen.getByTestId('editor-shell').append(findWidgetWrapper);

    fireEvent.paste(findWidget, {
      clipboardData: {
        getData: () => '{"ignored":true}',
      },
    });

    expect(onIngestInput).not.toHaveBeenCalled();
    findWidgetWrapper.remove();
  });

  it('renders output pane strip in output mode', () => {
    render(
      <EditorShell
        {...createProps({
          paneMode: 'output',
          inputText: 'alpha',
          outputPanes: [
            ...createOutputPanes(),
            {
              paneId: 'output-pane-1',
              documentId: 'doc-1',
              viewStateKey: 'output-pane-1:selection-1',
              value: '{"a":1}',
              paneDocumentLanguage: 'json',
              viewRange: {
                startLineNumber: 4,
                startColumn: 1,
                endLineNumber: 6,
                endColumn: 2,
              },
              testId: 'output-editor-pane-1',
            },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('output-pane-strip')).toHaveTextContent('output-editor:root:root');
    expect(screen.getByTestId('output-pane-strip')).toHaveTextContent('output-editor-pane-1:4:6');
  });

  it('renders fallback wait screen and cancel action when fallback is active', () => {
    const onCancelFallbackWait = vi.fn();

    render(
      <EditorShell
        {...createProps({
          inputText: 'alpha',
          fallbackWaitState: {
            requestId: 1,
            formatLabel: 'JSON',
            agentName: 'Codex',
            progressLines: ['line 1', 'line 2'],
          },
          onCancelFallbackWait,
        })}
      />,
    );

    expect(screen.getByTestId('fallback-wait-screen')).toBeVisible();
    expect(screen.getByTestId('fallback-wait-line')).toHaveTextContent(/line 1\s+line 2/u);

    fireEvent.click(screen.getByTestId('fallback-wait-cancel'));
    expect(onCancelFallbackWait).toHaveBeenCalledTimes(1);
  });

  it('treats escape on the fallback wait screen as cancel', async () => {
    const user = userEvent.setup();
    const onCancelFallbackWait = vi.fn();

    render(
      <EditorShell
        {...createProps({
          inputText: 'alpha',
          fallbackWaitState: {
            requestId: 1,
            formatLabel: 'JSON',
            agentName: 'Codex',
            progressLines: [],
          },
          onCancelFallbackWait,
        })}
      />,
    );

    await user.keyboard('{Escape}');

    expect(onCancelFallbackWait).toHaveBeenCalledTimes(1);
  });

  it('renders and dismisses ingest notices', () => {
    const onDismissIngestNotice = vi.fn();

    render(
      <EditorShell
        {...createProps({
          inputText: 'alpha',
          ingestNotice: 'Notice text',
          onDismissIngestNotice,
        })}
      />,
    );

    expect(screen.getByTestId('ingest-notice')).toHaveTextContent('Notice text');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    expect(onDismissIngestNotice).toHaveBeenCalledTimes(1);
  });
});
