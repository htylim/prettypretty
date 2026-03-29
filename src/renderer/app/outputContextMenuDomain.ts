import type { ContextPrettifyTarget } from '../output/contextPrettifyTarget';

export type OutputContextMenuState = {
  paneId: string;
  anchorX: number;
  anchorY: number;
  target: ContextPrettifyTarget | null;
};

export const getOutputContextMenuLabel = (target: ContextPrettifyTarget | null): string => {
  return target?.label ? `Prettify ${target.label}...` : 'Prettify ...';
};

export const isOutputContextMenuEnabled = (target: ContextPrettifyTarget | null): boolean => {
  return target !== null;
};
