import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { OpenTextFile } from '../../shared/ipc-contracts';
import type { Logger } from '../logging/logger';

export const readOpenTextFile = async (
  path: string,
  logger: Pick<Logger, 'info'>,
): Promise<OpenTextFile> => {
  const content = await readFile(path, 'utf8');
  logger.info('ingest.open-file', {
    fileExtension: extname(path),
    contentLength: content.length,
    isEmpty: content.length === 0,
  });
  return { path, content };
};
