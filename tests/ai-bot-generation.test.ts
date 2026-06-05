import { describe, expect, it, vi } from 'vitest';
import {
  buildBotJsonFromPrompt,
  createBotFromPrompt,
  planBotFromPrompt,
} from '../src/workflows/ai-bot-generation.js';

function makeRequestStub() {
  return vi.fn().mockImplementation(async (path: string) => {
    if (path === '/v3/packages/package/list') {
      return {
        list: [
          { name: 'Comment', label: 'Comment', packageVersion: '2.17.0' },
          { name: 'LogToFile', label: 'Log To File', packageVersion: '3.11.1' },
          { name: 'ErrorHandler', label: 'Error Handler', packageVersion: '2.12.1' },
          { name: 'Number', label: 'Number', packageVersion: '3.9.2' },
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
                    { name: 'logContent', label: 'Log content', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] },
                    { name: 'appendTimestamp', label: 'Append timestamp', type: 'BOOLEAN', rules: [{ name: 'NOT_EMPTY' }] },
                    { name: 'logOption', label: 'Log option', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] },
                    { name: 'encodingValue', label: 'Encoding', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] },
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
              name: 'ErrorHandler',
              label: 'Error Handler',
              packageVersion: '2.12.1',
              commands: [{ name: 'try', label: 'Try', attributes: [], returns: [] }],
              iterators: [],
              conditionals: [],
              triggers: [],
              exceptions: [],
            },
          },
          {
            package: {
              name: 'Number',
              label: 'Number',
              packageVersion: '3.9.2',
              commands: [
                {
                  name: 'assignToNumber',
                  label: 'Assign to number',
                  attributes: [
                    { name: 'number', label: 'Number', type: 'NUMBER', rules: [{ name: 'NOT_EMPTY' }] },
                  ],
                  returns: [],
                },
                {
                  name: 'increment',
                  label: 'Increment',
                  attributes: [],
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

    throw new Error(`Unexpected path: ${path}`);
  });
}

describe('ai bot generation', () => {
  it('creates a grounded structured plan from a prompt', async () => {
    const request = makeRequestStub();
    const result = await planBotFromPrompt(request, {
      prompt: 'Log invoice processing status to file. Add a comment for the run.',
      botName: 'InvoiceLogger',
    });

    expect(result.plan.botName).toBe('InvoiceLogger');
    expect(result.requiredPackages).toContain('LogToFile');
    expect(result.plan.steps).toHaveLength(1);
    expect(result.confidence.score).toBeGreaterThan(0.5);
    expect(result.grounding.candidatePackages.length).toBeGreaterThan(1);
    expect(result.grounding.commandContext.some((item) => item.commandName === 'logToFile')).toBe(true);
  });

  it('builds grounded bot json from a prompt', async () => {
    const request = makeRequestStub();
    const result = await buildBotJsonFromPrompt(request, {
      prompt: 'Log invoice processing status to file.',
      botName: 'InvoiceLogger',
    });

    expect(result.buildable).toBe(true);
    expect(result.botJsonSummary?.packageCount).toBe(3);
    expect(result.botJsonSummary?.nodeCount).toBe(1);
    expect(result.grounding.commandContext.length).toBeGreaterThan(2);
  });

  it('returns preview data on dry run creation', async () => {
    const request = makeRequestStub();
    const repositoryApi = {
      createBot: vi.fn(),
      updateFileContent: vi.fn(),
      updateFileDependencies: vi.fn(),
    };

    const result = await createBotFromPrompt(
      request,
      repositoryApi,
      {
        prompt: 'Add a comment for run start.',
        botName: 'PreviewBot',
        dryRun: true,
      },
      { defaultFolderId: '123' },
    );

    expect(result.dryRun).toBe(true);
    expect(repositoryApi.createBot).not.toHaveBeenCalled();
    expect(result.preview?.plan.botName).toBe('PreviewBot');
  });
});
