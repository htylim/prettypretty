type LogLevel = 'info' | 'warn' | 'error';

type LogMetaValue = string | number | boolean | null;

type LogMeta = Record<string, LogMetaValue>;

export type Logger = {
  isVerboseEnabled: () => boolean;
  info: (event: string, meta?: LogMeta) => void;
  warn: (event: string, meta?: LogMeta) => void;
  error: (event: string, meta?: LogMeta) => void;
};

const SENSITIVE_KEYS = new Set([
  'input',
  'output',
  'prompt',
  'content',
  'text',
  'rawInput',
  'rawOutput',
  'stderr',
  'stdout',
]);

const sanitizeMeta = (meta: LogMeta | undefined): LogMeta => {
  if (!meta) {
    return {};
  }

  const sanitized: LogMeta = {};

  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(key)) {
      if (typeof value === 'string') {
        sanitized[key] = `[redacted:${value.length}]`;
        continue;
      }

      sanitized[key] = '[redacted]';
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
};

const writeLogLine = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

export const createLogger = (verbose: boolean): Logger => {
  const log = (level: LogLevel, event: string, meta?: LogMeta): void => {
    if (!verbose) {
      return;
    }

    writeLogLine(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        event,
        meta: sanitizeMeta(meta),
      }),
    );
  };

  return {
    isVerboseEnabled: () => verbose,
    info: (event, meta) => {
      log('info', event, meta);
    },
    warn: (event, meta) => {
      log('warn', event, meta);
    },
    error: (event, meta) => {
      log('error', event, meta);
    },
  };
};
