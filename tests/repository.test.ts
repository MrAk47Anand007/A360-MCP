import { describe, expect, it } from 'vitest';
import * as repository from '../src/a360/repository.js';

describe('repository api signatures', () => {
  it('exports the first repository operations', async () => {
    expect(typeof repository.createBot).toBe('function');
    expect(typeof repository.listFolderItems).toBe('function');
    expect(typeof repository.listFolderChildren).toBe('function');
    expect(typeof repository.getFileContent).toBe('function');
    expect(typeof repository.updateFileContent).toBe('function');
    expect(typeof repository.getFileDependencies).toBe('function');
    expect(typeof repository.updateFileDependencies).toBe('function');
    expect(typeof repository.deleteFile).toBe('function');
  });
});
