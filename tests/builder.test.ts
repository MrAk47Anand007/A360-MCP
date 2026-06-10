import { describe, expect, it } from 'vitest';
import { buildBotFromPlan } from '../src/workflows/builder.js';
import type { NormalizedPackageMetadata } from '../src/workflows/package-intelligence.js';
import type { PlannedBot } from '../src/workflows/plan-model.js';

const metadata: NormalizedPackageMetadata[] = [
  {
    packageName: 'Comment',
    packageLabel: 'Comment',
    packageVersion: '2.17.0',
    settingsAttributes: [],
    commandCount: 1,
    iteratorCount: 0,
    conditionalCount: 0,
    triggerCount: 0,
    exceptionCount: 0,
    commands: [
      {
        packageName: 'Comment',
        packageVersion: '2.17.0',
        name: 'Comment',
        label: 'Comment',
        nestable: false,
        branchable: false,
        returnType: 'UNDEFINED',
        returnSubtype: 'UNDEFINED',
        returnRequired: false,
        attributes: [
          {
            name: 'comment',
            label: 'Comment',
            type: 'STRING',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
        ],
        requiredFields: ['comment'],
        returns: [],
      },
    ],
    iterators: [],
    conditionals: [],
    triggers: [],
    exceptions: [],
  },
  {
    packageName: 'LogToFile',
    packageLabel: 'Log To File',
    packageVersion: '3.11.1',
    settingsAttributes: [],
    commandCount: 1,
    iteratorCount: 0,
    conditionalCount: 0,
    triggerCount: 0,
    exceptionCount: 0,
    commands: [
      {
        packageName: 'LogToFile',
        packageVersion: '3.11.1',
        name: 'logToFile',
        label: 'Log to file',
        nestable: false,
        branchable: false,
        returnType: 'UNDEFINED',
        returnSubtype: 'UNDEFINED',
        returnRequired: false,
        attributes: [
          {
            name: 'filePath',
            label: 'File path',
            type: 'FILE',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
          {
            name: 'logContent',
            label: 'Content',
            type: 'STRING',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
        ],
        requiredFields: ['filePath', 'logContent'],
        returns: [],
      },
    ],
    iterators: [],
    conditionals: [],
    triggers: [],
    exceptions: [],
  },
  {
    packageName: 'ErrorHandler',
    packageLabel: 'ErrorHandler',
    packageVersion: '2.12.1',
    settingsAttributes: [],
    commandCount: 1,
    iteratorCount: 0,
    conditionalCount: 0,
    triggerCount: 0,
    exceptionCount: 0,
    commands: [
      {
        packageName: 'ErrorHandler',
        packageVersion: '2.12.1',
        name: 'try',
        label: 'Try',
        nestable: true,
        branchable: true,
        returnType: 'UNDEFINED',
        returnSubtype: 'UNDEFINED',
        returnRequired: false,
        attributes: [],
        requiredFields: [],
        returns: [],
      },
    ],
    iterators: [],
    conditionals: [],
    triggers: [],
    exceptions: [],
  },
  {
    packageName: 'FlowControl',
    packageLabel: 'Flow Control',
    packageVersion: '1.0.0',
    settingsAttributes: [],
    commandCount: 1,
    iteratorCount: 0,
    conditionalCount: 0,
    triggerCount: 0,
    exceptionCount: 0,
    commands: [
      {
        packageName: 'FlowControl',
        packageVersion: '1.0.0',
        name: 'useReferences',
        label: 'Use references',
        nestable: false,
        branchable: false,
        returnType: 'UNDEFINED',
        returnSubtype: 'UNDEFINED',
        returnRequired: false,
        attributes: [
          {
            name: 'iteratorRef',
            label: 'Iterator ref',
            type: 'ITERATOR',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
          {
            name: 'conditionalRef',
            label: 'Conditional ref',
            type: 'CONDITIONAL',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
          {
            name: 'automationRef',
            label: 'Automation ref',
            type: 'AUTOMATION',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
        ],
        requiredFields: ['iteratorRef', 'conditionalRef', 'automationRef'],
        returns: [],
      },
    ],
    iterators: [],
    conditionals: [],
    triggers: [],
    exceptions: [],
  },
  {
    packageName: 'Recorder',
    packageLabel: 'Recorder',
    packageVersion: '5.0.6',
    settingsAttributes: [],
    commandCount: 1,
    iteratorCount: 0,
    conditionalCount: 0,
    triggerCount: 0,
    exceptionCount: 0,
    commands: [
      {
        packageName: 'Recorder',
        packageVersion: '5.0.6',
        name: 'click',
        label: 'Click',
        nestable: false,
        branchable: false,
        returnType: 'UNDEFINED',
        returnSubtype: 'UNDEFINED',
        returnRequired: false,
        attributes: [
          {
            name: 'target',
            label: 'Target',
            type: 'UIOBJECT',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
          {
            name: 'anchorData',
            label: 'Anchor',
            type: 'ANCHOR',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
          {
            name: 'snapshot',
            label: 'Snapshot',
            type: 'IMAGE',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
        ],
        requiredFields: ['target', 'anchorData', 'snapshot'],
        returns: [],
      },
    ],
    iterators: [],
    conditionals: [],
    triggers: [],
    exceptions: [],
  },
];

describe('builder', () => {
  it('builds a valid A360 bot payload from a planned bot', () => {
    const plan: PlannedBot = {
      botName: 'LoggingBot',
      goal: 'Write logs',
      variables: [
        {
          name: 'logFile',
          type: 'STRING',
          input: true,
          defaultValue: { type: 'STRING', string: '' },
        },
      ],
      packages: [{ name: 'Comment' }, { name: 'LogToFile' }, { name: 'ErrorHandler' }],
      steps: [
        {
          packageName: 'ErrorHandler',
          commandName: 'try',
          children: [
            {
              packageName: 'Comment',
              commandName: 'Comment',
              attributes: [
                {
                  name: 'comment',
                  value: { type: 'STRING', string: 'Start bot' },
                },
              ],
            },
            {
              packageName: 'LogToFile',
              commandName: 'logToFile',
              attributes: [
                {
                  name: 'filePath',
                  value: { type: 'FILE', expression: 'file://$logFile$' },
                },
                {
                  name: 'logContent',
                  value: { type: 'STRING', string: 'Hello from MCP builder' },
                },
              ],
            },
          ],
        },
      ],
    };

    const built = buildBotFromPlan(plan, metadata);

    expect(built.nodes).toHaveLength(1);
    expect(built.nodes[0]?.packageName).toBe('ErrorHandler');
    expect(built.nodes[0]?.children).toHaveLength(2);
    expect(built.packages.map((pkg) => pkg.name)).toEqual([
      'Comment',
      'ErrorHandler',
      'LogToFile',
    ]);
    expect(built.variables[0]?.defaultValue).toEqual({ type: 'STRING', string: '' });
    expect(built.properties.botCodeVersion).toBe('5');
  });

  it('throws when a required attribute is missing', () => {
    const badPlan: PlannedBot = {
      botName: 'BrokenBot',
      goal: 'Trigger validation',
      variables: [],
      packages: [{ name: 'LogToFile' }],
      steps: [
        {
          packageName: 'LogToFile',
          commandName: 'logToFile',
          attributes: [
            {
              name: 'filePath',
              value: { type: 'FILE', expression: 'file://$path$' },
            },
          ],
        },
      ],
    };

    expect(() => buildBotFromPlan(badPlan, metadata)).toThrow(
      'Missing required attributes for LogToFile.logToFile: logContent',
    );
  });

  it('preserves provided returnTo and typed values', () => {
    const plan: PlannedBot = {
      botName: 'ReturnBot',
      goal: 'Exercise returnTo',
      variables: [{ name: 'message', type: 'STRING' }],
      packages: [{ name: 'Comment' }],
      steps: [
        {
          packageName: 'Comment',
          commandName: 'Comment',
          returnTo: { type: 'VARIABLE', variableName: 'message' },
          attributes: [
            {
              name: 'comment',
              value: { type: 'STRING', expression: '$message$' },
            },
          ],
        },
      ],
    };

    const built = buildBotFromPlan(plan, metadata);
    const firstNode = built.nodes[0] as
      | {
          returnTo?: unknown;
          attributes?: Array<{ value?: unknown }>;
        }
      | undefined;

    expect(firstNode?.returnTo).toEqual({
      type: 'VARIABLE',
      variableName: 'message',
    });
    expect(firstNode?.attributes?.[0]?.value).toEqual({
      type: 'STRING',
      expression: '$message$',
    });
  });

  it('builds richer typed reference values directly from the plan model', () => {
    const plan: PlannedBot = {
      botName: 'ReferenceBot',
      goal: 'Exercise typed references',
      variables: [{ name: 'inputMessage', type: 'STRING' }],
      packages: [{ name: 'FlowControl' }],
      steps: [
        {
          packageName: 'FlowControl',
          commandName: 'useReferences',
          attributes: [
            {
              name: 'iteratorRef',
              value: {
                type: 'ITERATOR',
                iteratorName: 'EachRow',
                packageName: 'Loop',
              },
            },
            {
              name: 'conditionalRef',
              value: {
                type: 'CONDITIONAL',
                conditionalName: 'Equals',
                packageName: 'If',
              },
            },
            {
              name: 'automationRef',
              value: {
                type: 'AUTOMATION',
                automation: {
                  filePath: { type: 'FILE', string: 'repository://private/bots/sample' },
                  inputVariables: [
                    {
                      name: 'message',
                      value: { type: 'VARIABLE', variableName: 'inputMessage' },
                    },
                  ],
                  inputOptions: [
                    {
                      name: 'dryRun',
                      value: { type: 'BOOLEAN', boolean: true },
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };

    const built = buildBotFromPlan(plan, metadata);
    const attrs = (built.nodes[0] as { attributes?: Array<{ value?: unknown }> }).attributes ?? [];

    expect(attrs[0]?.value).toEqual({
      type: 'ITERATOR',
      iteratorName: 'EachRow',
      packageName: 'Loop',
    });
    expect(attrs[1]?.value).toEqual({
      type: 'CONDITIONAL',
      conditionalName: 'Equals',
      packageName: 'If',
    });
    expect(attrs[2]?.value).toEqual({
      type: 'AUTOMATION',
      automation: {
        filePath: { type: 'FILE', string: 'repository://private/bots/sample' },
        inputVariables: [
          {
            name: 'message',
            value: { type: 'VARIABLE', variableName: 'inputMessage' },
          },
        ],
        inputOptions: [
          {
            name: 'dryRun',
            value: { type: 'BOOLEAN', boolean: true },
          },
        ],
      },
    });
  });

  it('builds uiobject, anchor dictionary, and image values directly from the plan model', () => {
    const plan: PlannedBot = {
      botName: 'UiRecorderBot',
      goal: 'Exercise recorder payloads',
      variables: [{ name: 'uiTargetTitle', type: 'STRING', input: true }],
      packages: [{ name: 'Recorder' }],
      steps: [
        {
          packageName: 'Recorder',
          commandName: 'click',
          attributes: [
            {
              name: 'target',
              value: {
                type: 'UIOBJECT',
                uiObject: {
                  capture: { securelyRecorded: true },
                  criteria: {
                    title: {
                      enabled: true,
                      value: { type: 'STRING', expression: '$uiTargetTitle$' },
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
                dictionary: [{ key: 'name', value: { type: 'STRING', string: 'UiTarget' } }],
              },
            },
            {
              name: 'snapshot',
              value: {
                type: 'IMAGE',
                unsavedSecurelyRecorded: true,
              },
            },
          ],
        },
      ],
    };

    const built = buildBotFromPlan(plan, metadata);
    const attrs = (built.nodes[0] as { attributes?: Array<{ value?: unknown }> }).attributes ?? [];

    expect(attrs[0]?.value).toEqual({
      type: 'UIOBJECT',
      uiObject: {
        capture: { securelyRecorded: true },
        criteria: {
          title: {
            enabled: true,
            value: { type: 'STRING', expression: '$uiTargetTitle$' },
          },
          role: {
            enabled: false,
            securelyRecordedRemoveDisabled: true,
            value: { type: 'STRING', string: '' },
          },
        },
      },
    });
    expect(attrs[1]?.value).toEqual({
      type: 'DICTIONARY',
      dictionary: [{ key: 'name', value: { type: 'STRING', string: 'UiTarget' } }],
    });
    expect(attrs[2]?.value).toEqual({
      type: 'IMAGE',
      unsavedSecurelyRecorded: true,
    });
  });
});
