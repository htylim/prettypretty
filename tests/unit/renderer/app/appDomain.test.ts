import { describe, expect, it } from 'vitest';
import type { Preferences } from '../../../../src/shared/preferences';
import {
  EMPTY_FILE_NOTICE,
  MAX_FALLBACK_PROGRESS_LINES,
  UNKNOWN_FALLBACK_AGENT_NAME,
  appendFallbackProgressLine,
  getConfiguredFallbackAgent,
  getConfiguredFallbackAgentFromSelection,
  getIngestEventName,
  getIngestTrigger,
  getOutputDocumentId,
  isFileIngestSource,
  toFallbackAgentOptions,
} from '../../../../src/renderer/app/appDomain';

const createPreferences = (overrides: Partial<Preferences> = {}): Preferences => ({
  version: 2,
  themeMode: 'light',
  indentSize: 2,
  fallbackWarningLineThreshold: 300,
  agents: [
    {
      id: 'codex',
      name: 'Codex',
      executable: 'codex',
      argsTemplate: ['exec', '--skip-git-repo-check', '-'],
      promptTemplate: '{input}',
      promptDelivery: 'stdin',
      enabled: true,
      timeoutMs: 30_000,
      maxOutputBytes: 1_000_000,
    },
  ],
  fallbackAgentId: 'codex',
  ...overrides,
});

const baseAgent = createPreferences().agents[0]!;

describe('appDomain', () => {
  it('exports shared constants', () => {
    expect(EMPTY_FILE_NOTICE).toBe('File has no content.');
    expect(UNKNOWN_FALLBACK_AGENT_NAME).toBe('fallback agent');
    expect(MAX_FALLBACK_PROGRESS_LINES).toBe(5);
  });

  it('keeps only the last configured fallback progress lines', () => {
    const progressLines = ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'].reduce(
      (currentLines, line) => appendFallbackProgressLine(currentLines, line),
      [] as string[],
    );

    expect(appendFallbackProgressLine(progressLines, 'line 6')).toEqual([
      'line 2',
      'line 3',
      'line 4',
      'line 5',
      'line 6',
    ]);
  });

  it('builds deterministic output document ids', () => {
    const first = getOutputDocumentId('{"a":1}');
    const second = getOutputDocumentId('{"a":1}');
    const different = getOutputDocumentId('{"a":2}');

    expect(first).toBe(second);
    expect(first).toMatch(/^output-[0-9a-f]+-7$/u);
    expect(different).not.toBe(first);
  });

  it('maps ingest source to file-source predicate and trigger/event names', () => {
    expect(isFileIngestSource('open-file')).toBe(true);
    expect(isFileIngestSource('drop')).toBe(true);
    expect(isFileIngestSource('paste')).toBe(false);

    expect(getIngestTrigger('open-file')).toBe('ingest-open-file');
    expect(getIngestTrigger('drop')).toBe('ingest-drop');
    expect(getIngestTrigger('paste')).toBe('ingest-paste');

    expect(getIngestEventName('open-file')).toBe('renderer.ingest.open-file');
    expect(getIngestEventName('drop')).toBe('renderer.ingest.drop');
    expect(getIngestEventName('paste')).toBe('renderer.ingest.paste');
  });

  it('resolves configured fallback agent status and name', () => {
    expect(getConfiguredFallbackAgent(createPreferences())).toEqual({
      shouldWaitForFallback: true,
      agentName: 'Codex',
    });

    expect(
      getConfiguredFallbackAgent(
        createPreferences({
          fallbackAgentId: null,
        }),
      ),
    ).toEqual({
      shouldWaitForFallback: false,
      agentName: UNKNOWN_FALLBACK_AGENT_NAME,
    });

    expect(
      getConfiguredFallbackAgent(
        createPreferences({
          fallbackAgentId: 'codex',
          agents: [
            {
              ...baseAgent,
              enabled: false,
            },
          ],
        }),
      ),
    ).toEqual({
      shouldWaitForFallback: false,
      agentName: UNKNOWN_FALLBACK_AGENT_NAME,
    });
  });

  it('maps preferences agents into fallback dropdown options', () => {
    const preferences = createPreferences({
      agents: [
        {
          ...baseAgent,
          id: 'amp',
          name: 'Amp',
          enabled: true,
        },
        {
          ...baseAgent,
          id: 'codex',
          name: 'Codex',
          enabled: false,
        },
      ],
    });

    expect(toFallbackAgentOptions(preferences)).toEqual([
      { id: 'amp', name: 'Amp', enabled: true },
      { id: 'codex', name: 'Codex', enabled: false },
    ]);
  });

  it('resolves fallback agent from current selection and options', () => {
    expect(
      getConfiguredFallbackAgentFromSelection('codex', [
        { id: 'codex', name: 'Codex', enabled: true },
      ]),
    ).toEqual({
      shouldWaitForFallback: true,
      agentName: 'Codex',
    });

    expect(
      getConfiguredFallbackAgentFromSelection('codex', [
        { id: 'codex', name: 'Codex', enabled: false },
      ]),
    ).toEqual({
      shouldWaitForFallback: false,
      agentName: UNKNOWN_FALLBACK_AGENT_NAME,
    });
  });
});
