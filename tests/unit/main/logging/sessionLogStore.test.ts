// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { SessionLogStore } from '../../../../src/main/logging/sessionLogStore';

describe('SessionLogStore', () => {
  it('returns a copy from getSnapshot', () => {
    const store = new SessionLogStore(3);

    store.append('line-1');
    const snapshot = store.getSnapshot();
    snapshot.push('line-2');

    expect(store.getSnapshot()).toEqual(['line-1']);
  });

  it('keeps only the latest lines up to max capacity', () => {
    const store = new SessionLogStore(3);

    store.append('line-1');
    store.append('line-2');
    store.append('line-3');
    store.append('line-4');

    expect(store.getSnapshot()).toEqual(['line-2', 'line-3', 'line-4']);
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const store = new SessionLogStore(5);
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    store.append('line-1');
    unsubscribe();
    store.append('line-2');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('line-1');
  });

  it('throws for invalid maxLines', () => {
    expect(() => new SessionLogStore(0)).toThrow('maxLines must be a positive integer');
    expect(() => new SessionLogStore(2.5)).toThrow('maxLines must be a positive integer');
  });
});
