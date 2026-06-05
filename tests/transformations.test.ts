import { describe, expect, it } from 'vitest';
import {
  applyLogToFileFix,
  calculateTotalLines,
  scanLogToFileIssues,
  updateLogMessages,
} from '../src/workflows/transformations.js';

describe('transformation workflow', () => {
  it('updates log message placeholders', () => {
    const bot = {
      nodes: [
        {
          commandName: 'logToFile',
          attributes: [
            {
              name: 'logContent',
              value: {
                string: 'line [linenumber]',
              },
            },
          ],
        },
      ],
    };

    const updated = updateLogMessages(bot, '[linenumber]');
    const content = (updated.nodes?.[0] as { attributes?: Array<{ value?: { string?: string } }> })
      .attributes?.[0]?.value?.string;
    expect(content).toContain('1');
    expect(calculateTotalLines(bot)).toBe(1);
  });

  it('exports transformation workflow entrypoints', () => {
    expect(typeof scanLogToFileIssues).toBe('function');
    expect(typeof applyLogToFileFix).toBe('function');
  });
});
