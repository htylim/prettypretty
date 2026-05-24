import { useEffect, useState } from 'react';
import type { RefreshableOpenTextFile } from '../shared/ipc-contracts';
import { App } from './App';
import { LogWindowApp } from './LogWindowApp';

type RendererBootstrapProps = {
  activeWindow: string | null;
};

export const RendererBootstrap = ({ activeWindow }: RendererBootstrapProps) => {
  const [initialOpenFile, setInitialOpenFile] = useState<RefreshableOpenTextFile | null>(null);

  useEffect(() => {
    if (activeWindow === 'log') {
      return;
    }

    const consumeInitialOpenFile = window.prettypretty?.app.consumeInitialOpenFile;
    if (!consumeInitialOpenFile) {
      return;
    }

    let isCancelled = false;
    void consumeInitialOpenFile()
      .then((file) => {
        if (isCancelled || !file) {
          return;
        }

        setInitialOpenFile(file);
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [activeWindow]);

  if (activeWindow === 'log') {
    return <LogWindowApp />;
  }

  return <App initialOpenFile={initialOpenFile} />;
};
