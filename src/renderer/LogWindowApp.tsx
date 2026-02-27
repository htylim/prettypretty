import { useEffect, useMemo, useRef, useState } from 'react';

const mergeHistoryWithBufferedLines = (history: string[], bufferedLines: string[]): string[] => {
  if (bufferedLines.length === 0) {
    return history;
  }

  const maxOverlap = Math.min(history.length, bufferedLines.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const historySlice = history.slice(history.length - overlap);
    const bufferedSlice = bufferedLines.slice(0, overlap);
    const matches = historySlice.every((line, index) => line === bufferedSlice[index]);

    if (matches) {
      return [...history, ...bufferedLines.slice(overlap)];
    }
  }

  return [...history, ...bufferedLines];
};

export const LogWindowApp = () => {
  const [lines, setLines] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    let isDisposed = false;
    let isInitializing = true;
    const bufferedLines: string[] = [];

    const unsubscribe = window.prettypretty.logs.onLine((line) => {
      if (isDisposed) {
        return;
      }

      if (isInitializing) {
        bufferedLines.push(line);
        return;
      }

      setLines((previousLines) => [...previousLines, line]);
    });

    void (async () => {
      const history = await window.prettypretty.logs.getHistory();
      if (!isDisposed) {
        setLines(mergeHistoryWithBufferedLines(history, bufferedLines));
        isInitializing = false;
      }
    })();

    return () => {
      isDisposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const logContainer = logContainerRef.current;
    if (!logContainer) {
      return;
    }

    logContainer.scrollTop = logContainer.scrollHeight;
  }, [lines]);

  const logText = useMemo(() => lines.join('\n'), [lines]);

  return (
    <main
      style={{
        backgroundColor: '#1a1a1a',
        color: '#e5e7eb',
        height: '100vh',
        padding: '12px',
      }}
    >
      <pre
        data-testid="log-window-content"
        ref={logContainerRef}
        style={{
          border: '1px solid #374151',
          borderRadius: '8px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '12px',
          lineHeight: 1.5,
          height: 'calc(100vh - 24px)',
          margin: 0,
          overflow: 'auto',
          padding: '12px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {logText}
      </pre>
    </main>
  );
};
