import type { WindowApi } from '../../shared/window-api';

declare global {
  interface Window {
    prettypretty: WindowApi;
  }
}

export {};
