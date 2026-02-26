// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { parseRuntimeFlags } from '../../../../src/main/logging/runtimeFlags';

describe('parseRuntimeFlags', () => {
  it('enables verbose mode for -v', () => {
    expect(parseRuntimeFlags(['electron', 'app', '-v']).verbose).toBe(true);
  });

  it('enables verbose mode for --verbose', () => {
    expect(parseRuntimeFlags(['electron', 'app', '--verbose']).verbose).toBe(true);
  });

  it('keeps verbose mode disabled when no verbose flag is present', () => {
    expect(parseRuntimeFlags(['electron', 'app', '--dev']).verbose).toBe(false);
  });
});
