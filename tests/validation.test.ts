import { describe, expect, it, vi } from 'vitest';
import { fixBotJson, previewBotJson, validateBotJson } from '../src/workflows/validation.js';

function createValidationRequestMock() {
  return vi.fn().mockImplementation(async (path: string) => {
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
                  returns: [],
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
                    { name: 'filePath', label: 'File path', type: 'FILE', rules: [{ name: 'NOT_EMPTY' }] },
                    { name: 'logContent', label: 'Content', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] },
                  ],
                  returns: [],
                },
              ],
              iterators: [],
              conditionals: [],
              triggers: [],
              exceptions: [],
            },
          },
        ],
      };
    }

    if (path === '/v3/packages/package/list') {
      return {
        list: [
          { name: 'Comment', label: 'Comment', packageVersion: '2.17.0' },
          { name: 'LogToFile', label: 'Log To File', packageVersion: '3.11.1' },
        ],
      };
    }

    throw new Error(`Unexpected path: ${path}`);
  });
}

describe('validation workflow', () => {
  it('validates a structurally correct bot json', async () => {
    const request = createValidationRequestMock();
    const result = await validateBotJson(request, {
      nodes: [
        {
          uid: '1',
          commandName: 'Comment',
          packageName: 'Comment',
          disabled: false,
          attributes: [
            {
              name: 'comment',
              value: { type: 'STRING', string: 'Hello' },
            },
          ],
        },
      ],
      variables: [],
      packages: [{ name: 'Comment', version: '2.17.0', settingsAttributes: [] }],
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.summary.nodeCount).toBe(1);
  });

  it('reports missing required fields and unknown commands', async () => {
    const request = createValidationRequestMock();
    const result = await validateBotJson(request, {
      nodes: [
        {
          uid: '1',
          commandName: 'MissingCommand',
          packageName: 'Comment',
          attributes: [],
        },
      ],
      packages: [{ name: 'Comment', version: '2.17.0', settingsAttributes: [] }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes('Unknown command'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('Missing disabled flag'))).toBe(true);
  });

  it('previews bot json with summary and validation', async () => {
    const request = createValidationRequestMock();
    const result = await previewBotJson(request, {
      nodes: [
        {
          uid: '1',
          commandName: 'Comment',
          packageName: 'Comment',
          disabled: false,
          attributes: [
            {
              name: 'comment',
              value: { type: 'STRING', string: 'Preview me' },
            },
          ],
        },
      ],
      variables: [{ name: 'foo' }],
      packages: [{ name: 'Comment', version: '2.17.0', settingsAttributes: [] }],
    });

    expect(result.packageNames).toEqual(['Comment']);
    expect(result.topLevelCommands).toEqual(['Comment']);
    expect(result.variables).toEqual(['foo']);
  });

  it('fixes small structural issues and revalidates', async () => {
    const request = createValidationRequestMock();
    const result = await fixBotJson(request, {
      nodes: [
        {
          commandName: 'Comment',
          packageName: 'Comment',
        },
      ],
    });

    expect(result.changed).toBe(true);
    expect(result.changes.some((change) => change.includes('Added uid'))).toBe(true);
    expect(result.changes.some((change) => change.includes('Added package entry'))).toBe(true);
    expect(result.botJson.packages).toBeTruthy();
    expect(Array.isArray(result.botJson.packages)).toBe(true);
  });
});
