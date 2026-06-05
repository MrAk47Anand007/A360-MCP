import { describe, expect, it, vi } from 'vitest';
import { groundPromptToPlan } from '../src/workflows/planner-grounding.js';

describe('planner grounding', () => {
  it('builds migration-style command context and package ranking from live metadata', async () => {
    const request = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/v3/packages/package/list') {
        return {
          list: [
            { name: 'Comment', label: 'Comment', packageVersion: '2.17.0' },
            { name: 'LogToFile', label: 'Log To File', packageVersion: '3.11.1' },
            { name: 'ErrorHandler', label: 'Error Handler', packageVersion: '2.12.1' },
          ],
        };
      }

      if (path === '/v3/packages/versions/details') {
        return {
          list: [
            {
              package: {
                name: 'Comment',
                label: 'Comment',
                packageVersion: '2.17.0',
                commands: [
                  {
                    name: 'Comment',
                    label: 'Comment',
                    attributes: [
                      {
                        name: 'comment',
                        label: 'Comment',
                        type: 'STRING',
                        rules: [{ name: 'NOT_EMPTY' }],
                      },
                    ],
                  },
                ],
                iterators: [],
                conditionals: [],
                triggers: [],
                exceptions: [],
              },
            },
            {
              package: {
                name: 'LogToFile',
                label: 'Log To File',
                packageVersion: '3.11.1',
                commands: [
                  {
                    name: 'logToFile',
                    label: 'Log to file',
                    attributes: [
                      {
                        name: 'filePath',
                        label: 'File path',
                        type: 'FILE',
                        rules: [{ name: 'NOT_EMPTY' }],
                      },
                      {
                        name: 'logContent',
                        label: 'Log content',
                        type: 'STRING',
                        rules: [{ name: 'NOT_EMPTY' }],
                      },
                    ],
                  },
                ],
                iterators: [],
                conditionals: [],
                triggers: [],
                exceptions: [],
              },
            },
            {
              package: {
                name: 'ErrorHandler',
                label: 'Error Handler',
                packageVersion: '2.12.1',
                commands: [{ name: 'try', label: 'Try', attributes: [] }],
                iterators: [],
                conditionals: [],
                triggers: [],
                exceptions: [],
              },
            },
          ],
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await groundPromptToPlan(request, {
      prompt: 'Log process status to file and add a comment',
    });

    expect(result.candidatePackages.some((item) => item.name === 'LogToFile')).toBe(true);
    expect(result.commandContext.some((item) => item.commandName === 'logToFile')).toBe(true);
    expect(result.variables.some((item) => item.name === 'logFilePath')).toBe(true);
    expect(result.reasoning[0]).toContain('Ranked');
  });
});
