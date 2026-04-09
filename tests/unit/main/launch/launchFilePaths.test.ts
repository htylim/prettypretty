import { describe, expect, it } from 'vitest';
import { resolveLaunchFilePaths } from '../../../../src/main/launch/launchFilePaths';

describe('resolveLaunchFilePaths', () => {
  it('resolves packaged app argv paths against the invocation working directory', () => {
    const result = resolveLaunchFilePaths({
      argv: ['/Applications/prettypretty.app/Contents/MacOS/prettypretty', 'fixtures/input.json'],
      currentWorkingDirectory: '/Users/test/project',
      defaultApp: false,
    });

    expect(result).toEqual(['/Users/test/project/fixtures/input.json']);
  });

  it('skips the Electron app entrypoint when running as the default app', () => {
    const result = resolveLaunchFilePaths({
      argv: ['electron', '/Users/test/project/out/main/index.js', './sample.json'],
      currentWorkingDirectory: '/Users/test/project',
      defaultApp: true,
    });

    expect(result).toEqual(['/Users/test/project/sample.json']);
  });

  it('ignores Chromium and Finder-injected flags by default', () => {
    const result = resolveLaunchFilePaths({
      argv: [
        '/Applications/prettypretty.app/Contents/MacOS/prettypretty',
        '--original-process-start-time=123',
        '-psn_0_12345',
      ],
      currentWorkingDirectory: '/Users/test/project',
      defaultApp: false,
    });

    expect(result).toEqual([]);
  });

  it('treats arguments after -- as literal paths', () => {
    const result = resolveLaunchFilePaths({
      argv: ['/Applications/prettypretty.app/Contents/MacOS/prettypretty', '--', '-odd-name.json'],
      currentWorkingDirectory: '/Users/test/project',
      defaultApp: false,
    });

    expect(result).toEqual(['/Users/test/project/-odd-name.json']);
  });
});
