import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type PersistedConfig } from '../config.js';

export async function readPersistedConfig(path: string): Promise<PersistedConfig> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as PersistedConfig;
  } catch {
    return {};
  }
}

export async function writePersistedConfig(
  path: string,
  values: PersistedConfig,
) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(values, null, 2), 'utf8');
}
