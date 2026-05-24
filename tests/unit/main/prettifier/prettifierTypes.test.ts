// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { isPrettifyRunRequest } from '../../../../src/main/prettifier/prettifierTypes';

describe('prettifierTypes', () => {
  it('accepts the context-pane-prettify trigger in prettifier requests', () => {
    expect(
      isPrettifyRunRequest({
        requestId: 1,
        inputText: '{\n  "query": "value"\n}',
        indentSize: 2,
        trigger: 'context-pane-prettify',
      }),
    ).toBe(true);
  });

  it('accepts the refresh-file trigger in prettifier requests', () => {
    expect(
      isPrettifyRunRequest({
        requestId: 1,
        inputText: '{"fresh":true}',
        indentSize: 2,
        trigger: 'refresh-file',
      }),
    ).toBe(true);
  });
});
