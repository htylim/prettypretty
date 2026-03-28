import { describe, expect, it, vi } from 'vitest';
import {
  createOutputContextMenuActions,
  OUTPUT_PRETTIFY_IN_PANE_ACTION_ID,
  OUTPUT_PRETTIFY_REPLACE_ACTION_ID,
} from '../../../../src/renderer/output/outputContextMenuActions';

const candidate = {
  payload: '{"id":1}',
  sourceRange: {
    startLineNumber: 2,
    startColumn: 3,
    endLineNumber: 2,
    endColumn: 11,
  },
};

describe('outputContextMenuActions', () => {
  it('disables actions without a candidate and dispatches them when a candidate exists', async () => {
    const onPrettifyInPane = vi.fn(async () => undefined);
    const onPrettifyReplace = vi.fn(async () => undefined);

    const disabledActions = createOutputContextMenuActions({
      candidate: null,
      onPrettifyInPane,
      onPrettifyReplace,
    });

    expect(disabledActions).toEqual([
      expect.objectContaining({
        id: OUTPUT_PRETTIFY_IN_PANE_ACTION_ID,
        disabled: true,
      }),
      expect.objectContaining({
        id: OUTPUT_PRETTIFY_REPLACE_ACTION_ID,
        disabled: true,
      }),
    ]);

    await disabledActions[0]!.run();
    await disabledActions[1]!.run();
    expect(onPrettifyInPane).not.toHaveBeenCalled();
    expect(onPrettifyReplace).not.toHaveBeenCalled();

    const enabledActions = createOutputContextMenuActions({
      candidate,
      onPrettifyInPane,
      onPrettifyReplace,
    });

    expect(enabledActions).toEqual([
      expect.objectContaining({
        id: OUTPUT_PRETTIFY_IN_PANE_ACTION_ID,
        label: 'Prettify in Pane',
        disabled: false,
      }),
      expect.objectContaining({
        id: OUTPUT_PRETTIFY_REPLACE_ACTION_ID,
        label: 'Prettify & Replace',
        disabled: false,
      }),
    ]);

    await enabledActions[0]!.run();
    await enabledActions[1]!.run();
    expect(onPrettifyInPane).toHaveBeenCalledWith(candidate);
    expect(onPrettifyReplace).toHaveBeenCalledWith(candidate);
  });
});
