import type { OutputEmbeddedCandidate } from './outputEmbeddedSelection';

export const OUTPUT_PRETTIFY_IN_PANE_ACTION_ID = 'prettify-in-pane';
export const OUTPUT_PRETTIFY_REPLACE_ACTION_ID = 'prettify-replace';

export type OutputContextMenuAction = {
  id: typeof OUTPUT_PRETTIFY_IN_PANE_ACTION_ID | typeof OUTPUT_PRETTIFY_REPLACE_ACTION_ID;
  label: 'Prettify in Pane' | 'Prettify & Replace';
  disabled: boolean;
  run: () => void | Promise<void>;
};

type CreateOutputContextMenuActionsOptions = {
  candidate: OutputEmbeddedCandidate | null;
  onPrettifyInPane?: ((candidate: OutputEmbeddedCandidate) => void | Promise<void>) | undefined;
  onPrettifyReplace?: ((candidate: OutputEmbeddedCandidate) => void | Promise<void>) | undefined;
};

/**
 * Keeps the output-editor context menu contract declarative. The editor owns
 * when the menu opens; this helper owns which actions are shown and whether the
 * current embedded candidate can execute them.
 */
export const createOutputContextMenuActions = ({
  candidate,
  onPrettifyInPane,
  onPrettifyReplace,
}: CreateOutputContextMenuActionsOptions): OutputContextMenuAction[] => {
  return [
    {
      id: OUTPUT_PRETTIFY_IN_PANE_ACTION_ID,
      label: 'Prettify in Pane',
      disabled: candidate === null || !onPrettifyInPane,
      run: () => {
        if (!candidate || !onPrettifyInPane) {
          return;
        }

        return onPrettifyInPane(candidate);
      },
    },
    {
      id: OUTPUT_PRETTIFY_REPLACE_ACTION_ID,
      label: 'Prettify & Replace',
      disabled: candidate === null || !onPrettifyReplace,
      run: () => {
        if (!candidate || !onPrettifyReplace) {
          return;
        }

        return onPrettifyReplace(candidate);
      },
    },
  ];
};
