import { describe, expect, it } from 'vitest';
import type { Preferences } from '../../../../src/shared/preferences';
import {
  createIngestRejectionPrompt,
  EMPTY_FILE_NOTICE,
  MAX_FALLBACK_PROGRESS_LINES,
  MONACO_LARGE_FILE_CHAR_COUNT_LIMIT,
  MONACO_LARGE_FILE_LINE_COUNT_LIMIT,
  MONACO_MAX_TOKENIZATION_LINE_LENGTH,
  UNKNOWN_FALLBACK_AGENT_NAME,
  appendFallbackProgressLine,
  getMonacoIngestRejection,
  getMonacoIngestRejectionMessage,
  getMonacoReadablePrefix,
  getMonacoTextMetrics,
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
    expect(MONACO_MAX_TOKENIZATION_LINE_LENGTH).toBe(20_000);
    expect(MONACO_LARGE_FILE_CHAR_COUNT_LIMIT).toBe(20 * 1024 * 1024);
    expect(MONACO_LARGE_FILE_LINE_COUNT_LIMIT).toBe(300 * 1000);
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

  it('computes Monaco text metrics in a single pass', () => {
    expect(getMonacoTextMetrics('')).toEqual({
      charCount: 0,
      lineCount: 0,
      maxLineLength: 0,
    });

    expect(getMonacoTextMetrics('alpha\r\nbeta\ngamma')).toEqual({
      charCount: 17,
      lineCount: 3,
      maxLineLength: 5,
    });
  });

  it('rejects input that exceeds Monaco line, char, or line-count limits', () => {
    expect(getMonacoIngestRejection('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH))).toEqual({
      reason: 'max-line-length',
      actual: MONACO_MAX_TOKENIZATION_LINE_LENGTH,
      limit: MONACO_MAX_TOKENIZATION_LINE_LENGTH,
      metrics: {
        charCount: MONACO_MAX_TOKENIZATION_LINE_LENGTH,
        lineCount: 1,
        maxLineLength: MONACO_MAX_TOKENIZATION_LINE_LENGTH,
      },
    });

    expect(getMonacoIngestRejection(`a\n${'b'.repeat(10)}`)).toBeNull();

    const charCountOverflowInput = `${'x'.repeat(19_999)}\n`.repeat(1_049) + 'x'.repeat(2_972);
    expect(getMonacoIngestRejection(charCountOverflowInput)).toEqual({
      reason: 'char-count',
      actual: charCountOverflowInput.length,
      limit: MONACO_LARGE_FILE_CHAR_COUNT_LIMIT,
      metrics: {
        charCount: charCountOverflowInput.length,
        lineCount: 1_050,
        maxLineLength: 19_999,
      },
    });

    const lineCountOverflowInput = `${'x\n'.repeat(MONACO_LARGE_FILE_LINE_COUNT_LIMIT)}x`;
    expect(getMonacoIngestRejection(lineCountOverflowInput)).toEqual({
      reason: 'line-count',
      actual: MONACO_LARGE_FILE_LINE_COUNT_LIMIT + 1,
      limit: MONACO_LARGE_FILE_LINE_COUNT_LIMIT,
      metrics: {
        charCount: lineCountOverflowInput.length,
        lineCount: MONACO_LARGE_FILE_LINE_COUNT_LIMIT + 1,
        maxLineLength: 1,
      },
    });
  });

  it('formats Monaco ingest rejection messages for the blocking dialog', () => {
    expect(
      getMonacoIngestRejectionMessage({
        reason: 'max-line-length',
        actual: 29_143_985,
        limit: MONACO_MAX_TOKENIZATION_LINE_LENGTH,
        metrics: {
          charCount: 29_143_985,
          lineCount: 1,
          maxLineLength: 29_143_985,
        },
      }),
    ).toContain("won't open");

    expect(
      getMonacoIngestRejectionMessage({
        reason: 'line-count',
        actual: 605_681,
        limit: MONACO_LARGE_FILE_LINE_COUNT_LIMIT,
        metrics: {
          charCount: 28_532_415,
          lineCount: 605_681,
          maxLineLength: 64,
        },
      }),
    ).toContain('605,681 lines');
  });

  it('derives the largest readable Monaco prefix without crossing ingest limits', () => {
    expect(getMonacoReadablePrefix('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH + 5))).toEqual({
      text: 'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH - 1),
      metrics: {
        charCount: MONACO_MAX_TOKENIZATION_LINE_LENGTH - 1,
        lineCount: 1,
        maxLineLength: MONACO_MAX_TOKENIZATION_LINE_LENGTH - 1,
      },
    });

    const lineCountOverflowInput = `${'x\n'.repeat(MONACO_LARGE_FILE_LINE_COUNT_LIMIT)}x`;
    const readableLinePrefix = getMonacoReadablePrefix(lineCountOverflowInput);
    expect(readableLinePrefix.metrics.lineCount).toBe(MONACO_LARGE_FILE_LINE_COUNT_LIMIT);
    expect(readableLinePrefix.text).toBe(
      'x\n'.repeat(MONACO_LARGE_FILE_LINE_COUNT_LIMIT - 1) + 'x',
    );

    const charCountOverflowInput = `${'x'.repeat(19_999)}\n`.repeat(1_049) + 'x'.repeat(2_972);
    expect(getMonacoReadablePrefix(charCountOverflowInput).metrics).toEqual({
      charCount: MONACO_LARGE_FILE_CHAR_COUNT_LIMIT,
      lineCount: 1_049,
      maxLineLength: 19_999,
    });

    const crlfBlock = `${'x'.repeat(19_999)}\r\n`;
    const fullBlockCount = Math.floor((MONACO_LARGE_FILE_CHAR_COUNT_LIMIT - 1) / crlfBlock.length);
    const remainingChars =
      MONACO_LARGE_FILE_CHAR_COUNT_LIMIT - 1 - fullBlockCount * crlfBlock.length;
    const crlfBoundaryInput = `${crlfBlock.repeat(fullBlockCount)}${'x'.repeat(remainingChars)}\r\ntail`;
    const crlfBoundaryPrefix = getMonacoReadablePrefix(crlfBoundaryInput);
    expect(crlfBoundaryPrefix.metrics.charCount).toBe(MONACO_LARGE_FILE_CHAR_COUNT_LIMIT - 1);
    expect(crlfBoundaryPrefix.text.endsWith('\r')).toBe(false);
  });

  it('builds a recovery prompt for oversized ingest input', () => {
    expect(
      createIngestRejectionPrompt('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH + 5), 'paste'),
    ).toMatchObject({
      source: 'paste',
      recoveryText: 'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH - 1),
      rejectionReason: 'max-line-length',
      rejectionActual: MONACO_MAX_TOKENIZATION_LINE_LENGTH + 5,
      rejectionLimit: MONACO_MAX_TOKENIZATION_LINE_LENGTH,
      originalCharCount: MONACO_MAX_TOKENIZATION_LINE_LENGTH + 5,
    });

    expect(
      createIngestRejectionPrompt(
        `${'x\n'.repeat(MONACO_LARGE_FILE_LINE_COUNT_LIMIT)}x`,
        'open-file',
      )?.message,
    ).toContain('open only the first 300,000 lines');

    const charCountOverflowInput = `${'x'.repeat(19_999)}\n`.repeat(1_049) + 'x'.repeat(2_972);
    expect(createIngestRejectionPrompt(charCountOverflowInput, 'drop')?.message).toContain(
      'open only the first 20,971,520 characters',
    );
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
