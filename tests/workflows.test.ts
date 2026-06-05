import { describe, expect, it } from 'vitest';
import { exportAssets, exportBots } from '../src/workflows/export.js';
import { importBots } from '../src/workflows/import.js';
import { migrateBotsBetweenControlRooms } from '../src/workflows/migration.js';

describe('workflow modules', () => {
  it('exports workflow entrypoints', () => {
    expect(typeof exportBots).toBe('function');
    expect(typeof exportAssets).toBe('function');
    expect(typeof importBots).toBe('function');
    expect(typeof migrateBotsBetweenControlRooms).toBe('function');
  });
});
