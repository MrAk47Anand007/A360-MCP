import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { groundPromptToPlan } from '../src/workflows/planner-grounding.js';
import { clearMigrationGroundingCache } from '../src/workflows/migration-grounding.js';

const tempRoots: string[] = [];

afterEach(() => {
  delete process.env.A360_MIGRATION_PROJECT_ROOT;
  clearMigrationGroundingCache();
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function createMigrationFixtureRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'a360-planner-grounding-'));
  tempRoots.push(root);
  mkdirSync(path.join(root, 'output'), { recursive: true });

  writeFileSync(
    path.join(root, 'output', 'mapping_data.json'),
    JSON.stringify({
      packageMap: {
        workflows: {
          name: 'Workflows',
          label: 'Workflow Tools',
          commands: [
            {
              name: 'runTaskBot',
              label: 'Run task bot',
              description: 'Run another automation from repository',
            },
          ],
        },
      },
      commandMap: {
        'workflows#runtaskbot': {
          name: 'runTaskBot',
          label: 'Run task bot',
          description: 'Run another automation from repository',
        },
      },
    }),
    'utf8',
  );

  writeFileSync(path.join(root, 'output', 'iteratorPackagesList.json'), '[]', 'utf8');
  writeFileSync(path.join(root, 'output', 'conditionalMapList.json'), '[]', 'utf8');
  process.env.A360_MIGRATION_PROJECT_ROOT = root;
  clearMigrationGroundingCache();
  return root;
}

describe('planner grounding', () => {
  it('builds migration-style command context and package ranking from live metadata', async () => {
    const request = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/v3/packages/package/list') {
        return {
          list: [
            { name: 'Comment', label: 'Comment', packageVersion: '2.17.0' },
            { name: 'LogToFile', label: 'Log To File', packageVersion: '3.11.1' },
            { name: 'ErrorHandler', label: 'Error Handler', packageVersion: '2.12.1' },
            { name: 'Number', label: 'Number', packageVersion: '3.10.0' },
            { name: 'FlowControl', label: 'Flow Control', packageVersion: '1.0.0' },
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
            {
              package: {
                name: 'Number',
                label: 'Number',
                packageVersion: '3.10.0',
                commands: [
                  {
                    name: 'assignToNumber',
                    label: 'Assign',
                    attributes: [
                      {
                        name: 'input',
                        label: 'Input',
                        type: 'NUMBER',
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
                name: 'FlowControl',
                label: 'Flow Control',
                packageVersion: '1.0.0',
                commands: [
                  {
                    name: 'runAutomation',
                    label: 'Run automation',
                    attributes: [
                      {
                        name: 'automationRef',
                        label: 'Automation reference',
                        type: 'AUTOMATION',
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

  it('builds a real calculator plan from a calculator prompt', async () => {
    const request = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/v3/packages/package/list') {
        return {
          list: [
            { name: 'Comment', label: 'Comment', packageVersion: '2.17.0' },
            { name: 'LogToFile', label: 'Log To File', packageVersion: '3.11.1' },
            { name: 'ErrorHandler', label: 'Error Handler', packageVersion: '2.12.1' },
            { name: 'Number', label: 'Number', packageVersion: '3.10.0' },
            { name: 'FlowControl', label: 'Flow Control', packageVersion: '1.0.0' },
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
                    attributes: [{ name: 'comment', label: 'Comment', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] }],
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
            {
              package: {
                name: 'Number',
                label: 'Number',
                packageVersion: '3.10.0',
                commands: [
                  {
                    name: 'assignToNumber',
                    label: 'Assign',
                    attributes: [{ name: 'input', label: 'Input', type: 'NUMBER', rules: [{ name: 'NOT_EMPTY' }] }],
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
                name: 'FlowControl',
                label: 'Flow Control',
                packageVersion: '1.0.0',
                commands: [
                  {
                    name: 'runAutomation',
                    label: 'Run automation',
                    attributes: [
                      { name: 'automationRef', label: 'Automation reference', type: 'AUTOMATION', rules: [{ name: 'NOT_EMPTY' }] },
                    ],
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

    const result = await groundPromptToPlan(request, {
      prompt: 'Build a simple calculator bot',
    });

    expect(result.steps.some((step) => step.packageName === 'Number' && step.commandName === 'assignToNumber')).toBe(true);
    expect(result.variables.map((item) => item.name)).toEqual(
      expect.arrayContaining(['numberInputA', 'numberInputB', 'numberResult']),
    );
    expect(result.reasoning.some((item) => item.includes('calculator planner'))).toBe(true);
  });

  it('builds a child automation plan from a prompt about running another bot', async () => {
    const request = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/v3/packages/package/list') {
        return {
          list: [
            { name: 'Comment', label: 'Comment', packageVersion: '2.17.0' },
            { name: 'ErrorHandler', label: 'Error Handler', packageVersion: '2.12.1' },
            { name: 'FlowControl', label: 'Flow Control', packageVersion: '1.0.0' },
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
                    attributes: [{ name: 'comment', label: 'Comment', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] }],
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
            {
              package: {
                name: 'FlowControl',
                label: 'Flow Control',
                packageVersion: '1.0.0',
                commands: [
                  {
                    name: 'runAutomation',
                    label: 'Run automation',
                    attributes: [
                      { name: 'automationRef', label: 'Automation reference', type: 'AUTOMATION', rules: [{ name: 'NOT_EMPTY' }] },
                    ],
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

    const result = await groundPromptToPlan(request, {
      prompt: 'Run another bot from repository and pass a message input',
    });

    expect(result.steps.some((step) => step.packageName === 'FlowControl' && step.commandName === 'runAutomation')).toBe(true);
    expect(result.variables.map((item) => item.name)).toEqual(
      expect.arrayContaining(['childAutomationPath', 'automationInputMessage']),
    );
    expect(
      result.steps
        .flatMap((step) => step.attributes ?? [])
        .some(
          (attribute) =>
            attribute.name === 'automationRef' &&
            attribute.value.type === 'AUTOMATION' &&
            'automation' in attribute.value,
        ),
    ).toBe(true);
    expect(result.reasoning.some((item) => item.includes('child automation planner'))).toBe(true);
  });

  it('uses local migration grounding to surface a weakly-named package for automation prompts', async () => {
    createMigrationFixtureRoot();

    const request = vi.fn().mockImplementation(async (pathName: string) => {
      if (pathName === '/v3/packages/package/list') {
        return {
          list: [
            { name: 'Comment', label: 'Comment', packageVersion: '2.17.0' },
            { name: 'ErrorHandler', label: 'Error Handler', packageVersion: '2.12.1' },
            { name: 'Workflows', label: 'Workflow Tools', packageVersion: '1.0.0' },
          ],
        };
      }

      if (pathName === '/v3/packages/versions/details') {
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
                    attributes: [{ name: 'comment', label: 'Comment', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] }],
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
            {
              package: {
                name: 'Workflows',
                label: 'Workflow Tools',
                packageVersion: '1.0.0',
                commands: [
                  {
                    name: 'runTaskBot',
                    label: 'Run task bot',
                    attributes: [
                      { name: 'automationRef', label: 'Automation reference', type: 'AUTOMATION', rules: [{ name: 'NOT_EMPTY' }] },
                    ],
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

      throw new Error(`Unexpected path: ${pathName}`);
    });

    const result = await groundPromptToPlan(request, {
      prompt: 'Run another automation from repository',
    });

    expect(result.steps.some((step) => step.packageName === 'Workflows' && step.commandName === 'runTaskBot')).toBe(true);
    expect(result.reasoning.some((item) => item.includes('Applied nearby migration grounding'))).toBe(true);
  });

  it('fills email command attributes with variable expressions and inferred inputs', async () => {
    const request = vi.fn().mockImplementation(async (pathName: string) => {
      if (pathName === '/v3/packages/package/list') {
        return {
          list: [
            { name: 'Comment', label: 'Comment', packageVersion: '2.17.0' },
            { name: 'ErrorHandler', label: 'Error Handler', packageVersion: '2.12.1' },
            { name: 'Email', label: 'Email', packageVersion: '3.30.0' },
          ],
        };
      }

      if (pathName === '/v3/packages/versions/details') {
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
                    attributes: [{ name: 'comment', label: 'Comment', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] }],
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
            {
              package: {
                name: 'Email',
                label: 'Email',
                packageVersion: '3.30.0',
                commands: [
                  {
                    name: 'sendEmail',
                    label: 'Send email',
                    attributes: [
                      { name: 'recipient', label: 'Recipient', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] },
                      { name: 'subject', label: 'Subject', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] },
                      { name: 'body', label: 'Body', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] },
                    ],
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

      throw new Error(`Unexpected path: ${pathName}`);
    });

    const result = await groundPromptToPlan(request, {
      prompt: 'Send an email message',
    });

    const emailStep = result.steps.find((step) => step.packageName === 'Email' && step.commandName === 'sendEmail');
    expect(emailStep).toBeDefined();
    expect(emailStep?.attributes).toEqual(
      expect.arrayContaining([
        { name: 'recipient', value: { type: 'STRING', expression: '$emailRecipient$' } },
        { name: 'subject', value: { type: 'STRING', expression: '$emailSubject$' } },
        { name: 'body', value: { type: 'STRING', expression: '$emailBody$' } },
      ]),
    );
    expect(result.variables.map((item) => item.name)).toEqual(
      expect.arrayContaining(['emailRecipient', 'emailSubject', 'emailBody']),
    );
  });

  it('fills excel file and worksheet attributes with reusable variable expressions', async () => {
    const request = vi.fn().mockImplementation(async (pathName: string) => {
      if (pathName === '/v3/packages/package/list') {
        return {
          list: [
            { name: 'Comment', label: 'Comment', packageVersion: '2.17.0' },
            { name: 'ErrorHandler', label: 'Error Handler', packageVersion: '2.12.1' },
            { name: 'Excel_MS', label: 'Excel Microsoft', packageVersion: '6.23.2' },
          ],
        };
      }

      if (pathName === '/v3/packages/versions/details') {
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
                    attributes: [{ name: 'comment', label: 'Comment', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] }],
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
            {
              package: {
                name: 'Excel_MS',
                label: 'Excel Microsoft',
                packageVersion: '6.23.2',
                commands: [
                  {
                    name: 'openWorkbook',
                    label: 'Open workbook',
                    attributes: [
                      { name: 'filePath', label: 'File path', type: 'FILE', rules: [{ name: 'NOT_EMPTY' }] },
                      { name: 'worksheetName', label: 'Worksheet name', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] },
                    ],
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

      throw new Error(`Unexpected path: ${pathName}`);
    });

    const result = await groundPromptToPlan(request, {
      prompt: 'Open an excel workbook sheet',
    });

    const excelStep = result.steps.find((step) => step.packageName === 'Excel_MS' && step.commandName === 'openWorkbook');
    expect(excelStep?.attributes).toEqual(
      expect.arrayContaining([
        { name: 'filePath', value: { type: 'FILE', expression: 'file://$excelFilePath$' } },
        { name: 'worksheetName', value: { type: 'STRING', expression: '$worksheetName$' } },
      ]),
    );
    expect(result.variables.map((item) => item.name)).toEqual(
      expect.arrayContaining(['excelFilePath', 'worksheetName']),
    );
  });

  it('fills recorder uiobject and anchor-style attributes for click prompts', async () => {
    const request = vi.fn().mockImplementation(async (pathName: string) => {
      if (pathName === '/v3/packages/package/list') {
        return {
          list: [
            { name: 'Comment', label: 'Comment', packageVersion: '2.17.0' },
            { name: 'ErrorHandler', label: 'Error Handler', packageVersion: '2.12.1' },
            { name: 'Recorder', label: 'Recorder', packageVersion: '5.0.6' },
          ],
        };
      }

      if (pathName === '/v3/packages/versions/details') {
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
                    attributes: [{ name: 'comment', label: 'Comment', type: 'STRING', rules: [{ name: 'NOT_EMPTY' }] }],
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
            {
              package: {
                name: 'Recorder',
                label: 'Recorder',
                packageVersion: '5.0.6',
                commands: [
                  {
                    name: 'click',
                    label: 'Click',
                    attributes: [
                      { name: 'target', label: 'Target', type: 'UIOBJECT', rules: [{ name: 'NOT_EMPTY' }] },
                      { name: 'anchorData', label: 'Anchor', type: 'ANCHOR', rules: [{ name: 'NOT_EMPTY' }] },
                      { name: 'snapshot', label: 'Snapshot', type: 'IMAGE', rules: [{ name: 'NOT_EMPTY' }] },
                    ],
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

      throw new Error(`Unexpected path: ${pathName}`);
    });

    const result = await groundPromptToPlan(request, {
      prompt: 'Click "Calculator" in the application',
    });

    const recorderStep = result.steps.find((step) => step.packageName === 'Recorder' && step.commandName === 'click');
    expect(recorderStep).toBeDefined();
    expect(recorderStep?.attributes).toEqual(
      expect.arrayContaining([
        {
          name: 'target',
          value: {
            type: 'UIOBJECT',
            uiObject: {
              capture: { securelyRecorded: true },
              criteria: {
                title: {
                  enabled: true,
                  value: { type: 'STRING', string: 'Calculator' },
                },
                role: {
                  enabled: false,
                  securelyRecordedRemoveDisabled: true,
                  value: { type: 'STRING', string: '' },
                },
              },
            },
          },
        },
        {
          name: 'anchorData',
          value: {
            type: 'DICTIONARY',
            dictionary: [{ key: 'name', value: { type: 'STRING', string: 'Calculator' } }],
          },
        },
        {
          name: 'snapshot',
          value: { type: 'IMAGE', unsavedSecurelyRecorded: true },
        },
      ]),
    );
  });
});
