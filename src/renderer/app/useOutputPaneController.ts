import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PaneMode } from '../../shared/types';
import type { OutputEditorHandle } from '../components/OutputEditor';
import type { OutputPaneViewModel } from '../components/OutputPaneStrip';
import { detectOutputLanguage, type OutputLanguageId } from '../output/detectOutputLanguage';
import { getOutputDocumentId } from './appDomain';
import {
  canNavigateOutputPaneViewportLeft,
  canNavigateOutputPaneViewportRight,
  closeRightmostOutputPane,
  createOutputPaneChainState,
  focusOutputPane,
  getDirectChildExtractedSourceRange,
  getOutputPaneLineNumberStart,
  getOutputPaneViewRange,
  getOutputPaneViewportPosition,
  getRightmostVisibleOutputPaneId,
  getRootOutputPaneViewStateKey,
  hasDerivedOutputPane,
  invalidateOutputPaneDescendants,
  openOrReplaceDerivedOutputPane,
  ROOT_OUTPUT_PANE_ID,
  shiftOutputPaneViewport,
  toggleExtractedSourceOutputPane,
  type OutputPaneContentInput,
  type OutputPaneChainState,
} from './outputPaneDomain';
import { selectOutputPaneChainState } from './session/documentSessionSelectors';
import { useDocumentSession } from './session/useDocumentSession';

type OutputPaneFocusRequest = {
  paneId: string;
  sequence: number;
};

type UseOutputPaneControllerOptions = {
  paneMode: PaneMode;
  outputText: string;
  rootOutputLanguageOverride: OutputLanguageId | null;
};

export type UseOutputPaneControllerResult = {
  outputDocumentId: string;
  outputPanes: OutputPaneViewModel[];
  activeOutputPaneId: string;
  leftVisiblePaneIndex: number;
  visibleOutputPanePosition: {
    current: number;
    total: number;
  };
  hasDerivedOutputPane: boolean;
  canNavigateOutputPaneLeft: boolean;
  canNavigateOutputPaneRight: boolean;
  outputPaneFocusRequest: OutputPaneFocusRequest | null;
  getActiveOutputPaneHandle: () => OutputEditorHandle | null;
  onOutputPaneHandleChange: (paneId: string, handle: OutputEditorHandle | null) => void;
  onOutputPaneFocus: (paneId: string) => void;
  onOpenOutputPane: (parentPaneId: string, content: OutputPaneContentInput) => void;
  onToggleExtractedSourcePane: (
    parentPaneId: string,
    content: Extract<OutputPaneContentInput, { kind: 'extracted-source' }>,
  ) => void;
  onInvalidateOutputPaneDescendants: (paneId: string) => void;
  onNavigateOutputPaneViewport: (stepDelta: number) => void;
  onCloseOutputPane: () => void;
  resetOutputPanes: () => void;
};

/**
 * The pane controller owns transient renderer-only concerns: mounted handles
 * and focus requests that should happen after the strip finishes animating into
 * place.
 */
export const useOutputPaneController = ({
  paneMode,
  outputText,
  rootOutputLanguageOverride,
}: UseOutputPaneControllerOptions): UseOutputPaneControllerResult => {
  const outputPaneHandlesRef = useRef(new Map<string, OutputEditorHandle>());
  const nextFocusRequestSequenceRef = useRef(1);
  const outputPaneChainState = useDocumentSession(selectOutputPaneChainState);
  const setOutputPaneChainState = useDocumentSession((state) => state.setOutputPaneChainState);

  const outputDocumentId = useMemo(() => getOutputDocumentId(outputText), [outputText]);
  const outputPaneResetScopeKey = `${paneMode}:${outputDocumentId}`;
  const [outputPaneFocusRequestState, setOutputPaneFocusRequestState] = useState<{
    scopeKey: string;
    request: OutputPaneFocusRequest | null;
  }>({
    scopeKey: outputPaneResetScopeKey,
    request: null,
  });
  const previousOutputPaneResetScopeKeyRef = useRef(outputPaneResetScopeKey);
  const outputPaneFocusRequest =
    outputPaneFocusRequestState.scopeKey === outputPaneResetScopeKey
      ? outputPaneFocusRequestState.request
      : null;

  useEffect(() => {
    if (previousOutputPaneResetScopeKeyRef.current === outputPaneResetScopeKey) {
      return;
    }

    previousOutputPaneResetScopeKeyRef.current = outputPaneResetScopeKey;
    outputPaneHandlesRef.current.clear();
    nextFocusRequestSequenceRef.current = 1;
    setOutputPaneChainState(createOutputPaneChainState());
  }, [outputPaneResetScopeKey, setOutputPaneChainState]);

  const updateOutputPaneControllerState = useCallback(
    (
      nextChainState: OutputPaneChainState,
      nextFocusRequest: OutputPaneFocusRequest | null,
    ): void => {
      const currentState = useDocumentSession.getState().outputPaneChainState;
      if (currentState !== nextChainState) {
        setOutputPaneChainState(nextChainState);
      }

      setOutputPaneFocusRequestState({
        scopeKey: outputPaneResetScopeKey,
        request: nextFocusRequest,
      });
    },
    [outputPaneResetScopeKey, setOutputPaneChainState],
  );

  const outputPanes = useMemo<OutputPaneViewModel[]>(() => {
    const languageByPaneId = new Map<string, OutputLanguageId>();
    const rootLanguage = rootOutputLanguageOverride ?? detectOutputLanguage(outputText);
    languageByPaneId.set(ROOT_OUTPUT_PANE_ID, rootLanguage);

    const rootPane: OutputPaneViewModel = {
      paneId: ROOT_OUTPUT_PANE_ID,
      documentId: outputDocumentId,
      viewStateKey: getRootOutputPaneViewStateKey(outputDocumentId),
      value: outputText,
      paneDocumentLanguage: rootLanguage,
      languageOverride: rootOutputLanguageOverride,
      activeExtractedSourceRange: getDirectChildExtractedSourceRange(
        outputPaneChainState,
        ROOT_OUTPUT_PANE_ID,
      ),
      lineNumberStart: null,
      viewRange: null,
      testId: 'output-editor',
    };

    return [
      rootPane,
      ...outputPaneChainState.derivedPanes.map((pane, index) => {
        const parentLanguage = languageByPaneId.get(pane.parentPaneId) ?? rootLanguage;
        const paneLanguage =
          pane.content.kind === 'extracted-source'
            ? parentLanguage
            : pane.content.kind === 'independent-text'
              ? (pane.content.languageOverride ?? detectOutputLanguage(pane.content.value))
              : detectOutputLanguage(pane.content.value);
        languageByPaneId.set(pane.paneId, paneLanguage);

        return {
          paneId: pane.paneId,
          documentId: pane.content.documentId,
          viewStateKey: pane.viewStateKey,
          value: pane.content.value,
          paneDocumentLanguage: paneLanguage,
          languageOverride:
            pane.content.kind === 'extracted-source'
              ? paneLanguage
              : pane.content.kind === 'independent-text'
                ? (pane.content.languageOverride ?? null)
                : null,
          activeExtractedSourceRange: getDirectChildExtractedSourceRange(
            outputPaneChainState,
            pane.paneId,
          ),
          lineNumberStart: getOutputPaneLineNumberStart(pane.content),
          viewRange: getOutputPaneViewRange(pane.content),
          testId: `output-editor-pane-${index + 1}`,
        };
      }),
    ];
  }, [outputDocumentId, outputPaneChainState, outputText, rootOutputLanguageOverride]);

  const registerOutputPaneHandle = useCallback(
    (paneId: string, handle: OutputEditorHandle | null): void => {
      if (handle) {
        outputPaneHandlesRef.current.set(paneId, handle);
        return;
      }

      outputPaneHandlesRef.current.delete(paneId);
    },
    [],
  );

  const applyOutputPaneChainState = useCallback(
    (
      nextChainState: OutputPaneChainState,
      focusRequest: OutputPaneFocusRequest | null = outputPaneFocusRequest,
    ): void => {
      const currentChainState = useDocumentSession.getState().outputPaneChainState;
      if (nextChainState === currentChainState && focusRequest === outputPaneFocusRequest) {
        return;
      }

      updateOutputPaneControllerState(nextChainState, focusRequest);
    },
    [outputPaneFocusRequest, updateOutputPaneControllerState],
  );

  const focusVisibleOutputPane = useCallback(
    (paneId: string): void => {
      const currentChainState = useDocumentSession.getState().outputPaneChainState;
      applyOutputPaneChainState(focusOutputPane(currentChainState, paneId));
    },
    [applyOutputPaneChainState],
  );

  const openOutputPane = useCallback(
    (parentPaneId: string, content: OutputPaneContentInput): void => {
      const currentChainState = useDocumentSession.getState().outputPaneChainState;
      const nextChainState = openOrReplaceDerivedOutputPane(
        currentChainState,
        parentPaneId,
        content,
      );
      if (nextChainState === currentChainState) {
        return;
      }

      applyOutputPaneChainState(nextChainState, {
        paneId: nextChainState.activePaneId,
        sequence: nextFocusRequestSequenceRef.current++,
      });
    },
    [applyOutputPaneChainState],
  );

  const toggleExtractedSourcePane = useCallback(
    (
      parentPaneId: string,
      content: Extract<OutputPaneContentInput, { kind: 'extracted-source' }>,
    ): void => {
      const currentChainState = useDocumentSession.getState().outputPaneChainState;
      const nextChainState = toggleExtractedSourceOutputPane(
        currentChainState,
        parentPaneId,
        content,
      );
      if (nextChainState === currentChainState) {
        return;
      }

      applyOutputPaneChainState(nextChainState, {
        paneId: nextChainState.activePaneId,
        sequence: nextFocusRequestSequenceRef.current++,
      });
    },
    [applyOutputPaneChainState],
  );

  const invalidateDescendantOutputPanes = useCallback(
    (paneId: string): void => {
      const currentChainState = useDocumentSession.getState().outputPaneChainState;
      const nextChainState = invalidateOutputPaneDescendants(currentChainState, paneId);
      if (nextChainState === currentChainState) {
        return;
      }

      applyOutputPaneChainState(nextChainState, {
        paneId: nextChainState.activePaneId,
        sequence: nextFocusRequestSequenceRef.current++,
      });
    },
    [applyOutputPaneChainState],
  );

  const closeDerivedOutputPane = useCallback((): void => {
    const currentChainState = useDocumentSession.getState().outputPaneChainState;
    const nextChainState = closeRightmostOutputPane(currentChainState);
    if (nextChainState === currentChainState) {
      return;
    }

    applyOutputPaneChainState(nextChainState, {
      paneId: nextChainState.activePaneId,
      sequence: nextFocusRequestSequenceRef.current++,
    });
  }, [applyOutputPaneChainState]);

  const navigateOutputPaneViewport = useCallback(
    (stepDelta: number): void => {
      const currentChainState = useDocumentSession.getState().outputPaneChainState;
      const nextChainState = shiftOutputPaneViewport(currentChainState, stepDelta);
      if (nextChainState === currentChainState) {
        return;
      }

      applyOutputPaneChainState(nextChainState, {
        paneId: nextChainState.activePaneId,
        sequence: nextFocusRequestSequenceRef.current++,
      });
    },
    [applyOutputPaneChainState],
  );

  const getActiveOutputPaneHandle = useCallback((): OutputEditorHandle | null => {
    const activeHandle =
      outputPaneHandlesRef.current.get(outputPaneChainState.activePaneId) ?? null;
    if (activeHandle) {
      return activeHandle;
    }

    const fallbackPaneId = getRightmostVisibleOutputPaneId(outputPaneChainState);
    return outputPaneHandlesRef.current.get(fallbackPaneId) ?? null;
  }, [outputPaneChainState]);

  const resetOutputPanes = useCallback((): void => {
    outputPaneHandlesRef.current.clear();
    nextFocusRequestSequenceRef.current = 1;
    setOutputPaneFocusRequestState({
      scopeKey: outputPaneResetScopeKey,
      request: null,
    });
    setOutputPaneChainState(createOutputPaneChainState());
  }, [outputPaneResetScopeKey, setOutputPaneChainState]);

  return {
    outputDocumentId,
    outputPanes,
    activeOutputPaneId: outputPaneChainState.activePaneId,
    leftVisiblePaneIndex: outputPaneChainState.leftVisiblePaneIndex,
    visibleOutputPanePosition: getOutputPaneViewportPosition(outputPaneChainState),
    hasDerivedOutputPane: hasDerivedOutputPane(outputPaneChainState),
    canNavigateOutputPaneLeft: canNavigateOutputPaneViewportLeft(outputPaneChainState),
    canNavigateOutputPaneRight: canNavigateOutputPaneViewportRight(outputPaneChainState),
    outputPaneFocusRequest,
    getActiveOutputPaneHandle,
    onOutputPaneHandleChange: registerOutputPaneHandle,
    onOutputPaneFocus: focusVisibleOutputPane,
    onOpenOutputPane: openOutputPane,
    onToggleExtractedSourcePane: toggleExtractedSourcePane,
    onInvalidateOutputPaneDescendants: invalidateDescendantOutputPanes,
    onNavigateOutputPaneViewport: navigateOutputPaneViewport,
    onCloseOutputPane: closeDerivedOutputPane,
    resetOutputPanes,
  };
};
